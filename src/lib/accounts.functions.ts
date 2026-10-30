import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function purgeAccount(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: target, error: targetError } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (targetError || !target.user) throw new Error("Compte introuvable.");
  // Auth refuses deletion when the user still owns Storage objects.
  // Only avatar files in the target user's dedicated folder are removed.
  const bucket = supabaseAdmin.storage.from("avatars");
  for (;;) {
    const { data: files, error } = await bucket.list(userId, { limit: 100 });
    if (error) throw new Error("Impossible de supprimer les avatars du compte.");
    if (!files?.length) break;
    const { error: removeError } = await bucket.remove(
      files.map((file) => `${userId}/${file.name}`),
    );
    if (removeError) throw new Error("Impossible de supprimer les avatars du compte.");
  }
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) throw new Error("Suppression impossible. Le compte n’a pas été supprimé.");
  // Existing FKs cascade profile/roll/membership removal and SET NULL character owners.
  return { deletedUserId: userId };
}

/** Removes a team, its data (FK cascades) and its scene images. */
async function purgeTeam(teamId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: scenes } = await supabaseAdmin
    .from("scenes")
    .select("image_path")
    .eq("team_id", teamId);
  const paths = (scenes ?? []).map((s) => s.image_path);
  if (paths.length) await supabaseAdmin.storage.from("scenes").remove(paths);
  const { error } = await supabaseAdmin.from("teams").delete().eq("id", teamId);
  if (error) throw new Error("Suppression de l’équipe impossible.");
}

export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ userId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("is_platform_admin");
    if (roleError || isAdmin !== true) throw new Error("Suppression réservée à l’admin.");
    if (data.userId === context.userId)
      throw new Error("Tu ne peux pas supprimer ton propre compte.");
    return purgeAccount(data.userId);
  });

/** Droit de chaque joueur : son compte part, et les équipes où il était seul avec lui. */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_platform_admin");
    if (isAdmin === true) throw new Error("Un compte admin ne se supprime pas ici.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: mine } = await supabaseAdmin
      .from("team_members")
      .select("team_id")
      .eq("user_id", context.userId);
    for (const { team_id } of mine ?? []) {
      const { count } = await supabaseAdmin
        .from("team_members")
        .select("user_id", { count: "exact", head: true })
        .eq("team_id", team_id);
      if (count === 1) await purgeTeam(team_id);
    }
    return purgeAccount(context.userId);
  });

export const deleteTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ teamId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const [{ data: isAdmin }, { data: me }] = await Promise.all([
      context.supabase.rpc("is_platform_admin"),
      context.supabase
        .from("team_members")
        .select("role")
        .eq("team_id", data.teamId)
        .eq("user_id", context.userId)
        .maybeSingle(),
    ]);
    if (isAdmin !== true && me?.role !== "gm") throw new Error("Suppression réservée au MJ.");
    await purgeTeam(data.teamId);
    return { deletedTeamId: data.teamId };
  });

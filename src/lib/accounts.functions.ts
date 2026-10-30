import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ userId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { data: isGm, error: roleError } = await context.supabase.rpc("is_gm");
    if (roleError || isGm !== true) throw new Error("Suppression réservée au MJ.");
    if (data.userId === context.userId)
      throw new Error("Tu ne peux pas supprimer ton propre compte.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: target, error: targetError } = await supabaseAdmin.auth.admin.getUserById(
      data.userId,
    );
    if (targetError || !target.user) throw new Error("Compte introuvable.");
    // Auth refuses deletion when the user still owns Storage objects.
    // Only avatar files in the target user's dedicated folder are removed.
    const bucket = supabaseAdmin.storage.from("avatars");
    for (;;) {
      const { data: files, error } = await bucket.list(data.userId, { limit: 100 });
      if (error) throw new Error("Impossible de supprimer les avatars du compte.");
      if (!files?.length) break;
      const { error: removeError } = await bucket.remove(
        files.map((file) => `${data.userId}/${file.name}`),
      );
      if (removeError) throw new Error("Impossible de supprimer les avatars du compte.");
    }
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error("Suppression impossible. Le compte n’a pas été supprimé.");
    // Existing FKs cascade profile/roll removal and SET NULL character owners.
    return { deletedUserId: data.userId };
  });

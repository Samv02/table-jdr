import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

async function requireAdmin(supabase: SupabaseClient<Database>) {
  const { requireAdminAccess } = await import("./admin-guard.server");
  return requireAdminAccess(supabase);
}

const id = z.string().uuid();

export const adminUpdateSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      maintenance: z.boolean(),
      maintenance_message: z.string().trim().max(300, "Message trop long."),
      signups_open: z.boolean(),
      team_creation_open: z.boolean(),
      joins_open: z.boolean(),
      max_teams_per_user: z.coerce.number().int().min(1, "Limite trop basse.").max(100),
    }),
  )
  .handler(async ({ data, context }) => {
    const { admin, logAdmin } = await requireAdmin(context.supabase);
    const { error } = await admin
      .from("platform_settings")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) throw new Error("Enregistrement impossible.");
    await logAdmin(
      context.userId,
      "Réglages modifiés",
      data.maintenance ? "maintenance activée" : "site ouvert",
    );
    return { ok: true };
  });

export const adminCreateAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      body: z.string().trim().min(1, "Écris un message.").max(500, "Message trop long."),
      level: z.enum(["info", "warning"]),
      teamId: id.nullable(),
      days: z.number().int().min(0).max(365),
    }),
  )
  .handler(async ({ data, context }) => {
    const { admin, logAdmin } = await requireAdmin(context.supabase);
    const { error } = await admin.from("announcements").insert({
      body: data.body,
      level: data.level,
      team_id: data.teamId,
      expires_at: data.days ? new Date(Date.now() + data.days * 86400000).toISOString() : null,
    });
    if (error) throw new Error("Publication impossible.");
    await logAdmin(context.userId, "Annonce publiée", data.body.slice(0, 80));
    return { ok: true };
  });

export const adminSetAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ id, active: z.boolean().nullable() }))
  .handler(async ({ data, context }) => {
    const { admin, logAdmin } = await requireAdmin(context.supabase);
    const { error } =
      data.active === null
        ? await admin.from("announcements").delete().eq("id", data.id)
        : await admin.from("announcements").update({ active: data.active }).eq("id", data.id);
    if (error) throw new Error("Changement impossible.");
    const action =
      data.active === null
        ? "Annonce supprimée"
        : data.active
          ? "Annonce réactivée"
          : "Annonce retirée";
    await logAdmin(context.userId, action, "");
    return { ok: true };
  });

export const adminDeleteMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ id }))
  .handler(async ({ data, context }) => {
    const { admin, logAdmin } = await requireAdmin(context.supabase);
    const { data: row, error } = await admin
      .from("messages")
      .delete()
      .eq("id", data.id)
      .select("sender_name")
      .single();
    if (error) throw new Error("Suppression impossible.");
    await logAdmin(context.userId, "Message supprimé", row.sender_name);
    return { ok: true };
  });

/** Vide l'historique d'une équipe : les fiches, scènes et membres ne bougent pas. */
export const adminClearTeamData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ teamId: id, kind: z.enum(["rolls", "messages"]) }))
  .handler(async ({ data, context }) => {
    const { admin, logAdmin } = await requireAdmin(context.supabase);
    const { error } = await admin.from(data.kind).delete().eq("team_id", data.teamId);
    if (error) throw new Error("Suppression impossible.");
    const { data: team } = await admin
      .from("teams")
      .select("name")
      .eq("id", data.teamId)
      .maybeSingle();
    await logAdmin(
      context.userId,
      data.kind === "rolls" ? "Jets vidés" : "Messages vidés",
      team?.name ?? "",
    );
    return { ok: true };
  });

export const adminSetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      userId: id,
      password: z.string().min(8, "Le mot de passe doit faire au moins 8 caractères."),
    }),
  )
  .handler(async ({ data, context }) => {
    const { admin, logAdmin } = await requireAdmin(context.supabase);
    const { error } = await admin.auth.admin.updateUserById(data.userId, {
      password: data.password,
    });
    if (error) throw new Error("Mot de passe refusé.");
    const { data: row } = await admin
      .from("profiles")
      .select("username")
      .eq("id", data.userId)
      .maybeSingle();
    await logAdmin(context.userId, "Mot de passe provisoire défini", row?.username ?? "");
    return { ok: true };
  });

export const adminSetNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ userId: id, body: z.string().max(2000, "Note trop longue.") }))
  .handler(async ({ data, context }) => {
    const { admin } = await requireAdmin(context.supabase);
    const { error } = await admin.from("account_notes").upsert({
      user_id: data.userId,
      body: data.body,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error("Enregistrement impossible.");
    return { ok: true };
  });

/** Tout ce que la base garde sur un compte : à remettre à la personne qui le demande (RGPD). */
export const adminExportAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ userId: id }))
  .handler(async ({ data, context }) => {
    const { admin, logAdmin } = await requireAdmin(context.supabase);
    const [{ data: user }, profile, memberships, characters, rolls, messages, tickets] =
      await Promise.all([
        admin.auth.admin.getUserById(data.userId),
        admin.from("profiles").select("username,color,created_at").eq("id", data.userId).single(),
        admin.from("team_members").select("role,joined_at,teams(name)").eq("user_id", data.userId),
        admin
          .from("characters")
          .select("name,handle,sheet,created_at,character_state(*),character_notes(body)")
          .eq("owner_id", data.userId),
        admin
          .from("rolls")
          .select("label,dice_count,dice_sides,modifier,total,created_at")
          .eq("user_id", data.userId),
        admin.from("messages").select("body,created_at").eq("sender_user", data.userId),
        admin
          .from("support_tickets")
          .select("subject,status,created_at,support_messages(body,created_at,from_admin,internal)")
          .eq("user_id", data.userId),
      ]);
    await logAdmin(context.userId, "Données exportées", user.user?.email ?? data.userId);
    return JSON.stringify(
      {
        email: user.user?.email ?? null,
        inscrit_le: user.user?.created_at ?? null,
        profil: profile.data,
        equipes: memberships.data,
        personnages: characters.data,
        jets: rolls.data,
        messages: messages.data,
        // Les notes internes de l'admin ne font pas partie de ce qui est remis à l'utilisateur
        support: (tickets.data ?? []).map((t) => ({
          ...t,
          support_messages: t.support_messages.filter((m) => !m.internal),
        })),
      },
      null,
      2,
    );
  });

export const adminAddModerationWord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      word: z.string().trim().toLowerCase().min(2, "Mot trop court.").max(60, "Mot trop long."),
      category: z.enum(["haine", "menace", "danger", "sexuel", "insulte", "arnaque"]),
    }),
  )
  .handler(async ({ data, context }) => {
    const { admin, logAdmin } = await requireAdmin(context.supabase);
    const { error } = await admin.from("moderation_words").insert(data);
    if (error)
      throw new Error(error.code === "23505" ? "Ce mot est déjà dans la liste." : error.message);
    await logAdmin(context.userId, "Mot de modération ajouté", data.word);
    return { ok: true };
  });

export const adminDeleteModerationWord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ id }))
  .handler(async ({ data, context }) => {
    const { admin, logAdmin } = await requireAdmin(context.supabase);
    const { data: row, error } = await admin
      .from("moderation_words")
      .delete()
      .eq("id", data.id)
      .select("word")
      .single();
    if (error) throw new Error("Suppression impossible.");
    await logAdmin(context.userId, "Mot de modération retiré", row.word);
    return { ok: true };
  });

/** Message signalé déjà traité : il reste surligné mais sort de la liste « À traiter ». */
export const adminReviewMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ id }))
  .handler(async ({ data, context }) => {
    const { admin } = await requireAdmin(context.supabase);
    const { error } = await admin.from("moderation_reviews").upsert({ message_id: data.id });
    if (error) throw new Error("Enregistrement impossible.");
    return { ok: true };
  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { validateUsername } from "./profile";
import { findFlags, type ModerationWord } from "./moderation";

const WEEK_MS = 7 * 24 * 3600 * 1000;
const ACTIVITY_LIMIT = 200;
const CHART_DAYS = 14;
/** Durée de bannissement côté Auth : l'équivalent de « jusqu'à réactivation ». */
const BAN_FOREVER = "876000h";

export type AdminAccount = {
  id: string;
  email: string | null;
  username: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  suspended: boolean;
  admin: boolean;
  note: string;
  teams: { id: string; name: string; role: string }[];
};
export type AdminCharacter = { id: string; name: string; owner_id: string | null };
export type AdminTeam = {
  id: string;
  name: string;
  join_code: string;
  created_at: string;
  owner: string | null;
  members: { user_id: string; username: string | null; role: string }[];
  characters: AdminCharacter[];
  last_activity: string | null;
  rolls7d: number;
  messages7d: number;
};
export type AdminEvent = {
  id: string;
  rawId: string;
  kind: "roll" | "message" | "admin";
  at: string;
  teamId: string | null;
  team: string;
  who: string;
  /** Jet : raison ; message : texte ; journal : action. */
  text: string;
  /** Jet : dés et résultat ; message : canal ; journal : cible. */
  detail: string;
  secret: boolean;
  senderId: string | null;
  /** Message signalé déjà vu par l'admin. */
  reviewed: boolean;
};
export type AdminDay = { day: string; signups: number; rolls: number; messages: number };
export type AdminSettings = {
  maintenance: boolean;
  maintenance_message: string;
  signups_open: boolean;
  team_creation_open: boolean;
  joins_open: boolean;
  max_teams_per_user: number;
};
export type AdminAnnouncement = {
  id: string;
  body: string;
  level: string;
  team_id: string | null;
  active: boolean;
  expires_at: string | null;
  created_at: string;
};
export type AdminStats = {
  accounts: number;
  active7d: number;
  active30d: number;
  newAccounts7d: number;
  newAccountsPrev7d: number;
  neverSignedIn: number;
  suspended: number;
  noTeam: number;
  teams: number;
  activeTeams7d: number;
  emptyTeams: number;
  noGmTeams: number;
  characters: number;
  orphanCharacters: number;
  rolls7d: number;
  rollsPrev7d: number;
  messages7d: number;
  messagesPrev7d: number;
  flaggedMessages: number;
  ticketsOpen: number;
  ticketsInProgress: number;
  ticketsResolved7d: number;
  firstReplyHours: number | null;
};
export type AdminOverview = {
  stats: AdminStats;
  days: AdminDay[];
  accounts: AdminAccount[];
  teams: AdminTeam[];
  activity: AdminEvent[];
  settings: AdminSettings;
  announcements: AdminAnnouncement[];
  moderationWords: ModerationWord[];
};

async function requireAdmin(supabase: SupabaseClient<Database>) {
  const { requireAdminAccess } = await import("./admin-guard.server");
  return requireAdminAccess(supabase);
}

const channelLabel = (channel: string) =>
  channel === "all" ? "Annonce" : channel.startsWith("gm:") ? "Canal MJ" : "Entre joueurs";

const teamId = z.string().uuid();
const userId = z.string().uuid();

export const adminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminOverview> => {
    const { admin } = await requireAdmin(context.supabase);
    const since = new Date(Date.now() - WEEK_MS).toISOString();
    const [
      users,
      profiles,
      admins,
      teams,
      members,
      characters,
      rolls,
      messages,
      log,
      daily,
      activity7d,
      notes,
      settings,
      announcements,
      tickets,
      moderationWords,
      reviews,
    ] = await Promise.all([
      admin.auth.admin.listUsers({ perPage: 1000 }),
      admin.from("profiles").select("id,username,suspended_at"),
      admin.from("platform_admins").select("user_id"),
      admin.from("teams").select("id,name,join_code,owner_id,created_at").order("created_at"),
      admin.from("team_members").select("team_id,user_id,role"),
      admin.from("characters").select("id,name,team_id,owner_id").order("name"),
      admin
        .from("rolls")
        .select("id,team_id,display_name,label,dice_count,dice_sides,total,is_secret,created_at")
        .order("created_at", { ascending: false })
        .limit(ACTIVITY_LIMIT),
      admin
        .from("messages")
        .select("id,team_id,sender_user,sender_name,channel,body,created_at")
        .order("created_at", { ascending: false })
        .limit(ACTIVITY_LIMIT),
      admin
        .from("admin_log")
        .select("id,admin_id,action,target,created_at")
        .order("created_at", { ascending: false })
        .limit(ACTIVITY_LIMIT),
      admin.rpc("admin_daily_stats", { _days: CHART_DAYS }),
      admin.rpc("admin_team_activity", { _since: since }),
      admin.from("account_notes").select("user_id,body"),
      admin.from("platform_settings").select("*").eq("id", 1).single(),
      admin.from("announcements").select("*").order("created_at", { ascending: false }),
      admin.from("support_tickets").select("status,created_at,first_reply_at,resolved_at"),
      admin.from("moderation_words").select("id,word,category").order("word"),
      admin.from("moderation_reviews").select("message_id"),
    ]);

    const profileOf = new Map((profiles.data ?? []).map((p) => [p.id, p]));
    const teamList = teams.data ?? [];
    const teamName = new Map(teamList.map((t) => [t.id, t.name]));
    const adminIds = new Set((admins.data ?? []).map((a) => a.user_id));
    const memberRows = members.data ?? [];
    const characterRows = characters.data ?? [];
    const reviewed = new Set((reviews.data ?? []).map((r) => r.message_id));
    const wordList = moderationWords.data ?? [];
    const noteOf = new Map((notes.data ?? []).map((n) => [n.user_id, n.body]));
    const teamActivity = new Map((activity7d.data ?? []).map((t) => [t.team_id, t]));
    const days = (daily.data ?? []) as AdminDay[];
    const sum = (key: "signups" | "rolls" | "messages", from: number, to: number) =>
      days.slice(from, to).reduce((n, d) => n + d[key], 0);
    const lastActivity = new Map<string, string>();
    for (const e of [...(rolls.data ?? []), ...(messages.data ?? [])]) {
      if (e.created_at > (lastActivity.get(e.team_id) ?? "")) {
        lastActivity.set(e.team_id, e.created_at);
      }
    }

    const accounts: AdminAccount[] = (users.data?.users ?? []).map((u) => ({
      id: u.id,
      email: u.email ?? null,
      username: profileOf.get(u.id)?.username ?? null,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      suspended: !!profileOf.get(u.id)?.suspended_at,
      admin: adminIds.has(u.id),
      note: noteOf.get(u.id) ?? "",
      teams: memberRows
        .filter((m) => m.user_id === u.id)
        .map((m) => ({ id: m.team_id, name: teamName.get(m.team_id) ?? "?", role: m.role })),
    }));
    const teamRows: AdminTeam[] = teamList.map((t) => ({
      id: t.id,
      name: t.name,
      join_code: t.join_code,
      created_at: t.created_at,
      owner: t.owner_id ? (profileOf.get(t.owner_id)?.username ?? null) : null,
      members: memberRows
        .filter((m) => m.team_id === t.id)
        .map((m) => ({
          user_id: m.user_id,
          username: profileOf.get(m.user_id)?.username ?? null,
          role: m.role,
        })),
      characters: characterRows
        .filter((c) => c.team_id === t.id)
        .map((c) => ({ id: c.id, name: c.name, owner_id: c.owner_id })),
      last_activity: lastActivity.get(t.id) ?? null,
      rolls7d: teamActivity.get(t.id)?.rolls ?? 0,
      messages7d: teamActivity.get(t.id)?.messages ?? 0,
    }));
    const activity: AdminEvent[] = [
      ...(rolls.data ?? []).map((r) => ({
        id: `r${r.id}`,
        rawId: r.id,
        kind: "roll" as const,
        at: r.created_at,
        teamId: r.team_id,
        team: teamName.get(r.team_id) ?? "?",
        who: r.display_name ?? "?",
        text: r.label ?? "",
        detail: `${r.dice_count}d${r.dice_sides} → ${r.total}`,
        secret: r.is_secret,
        senderId: null,
        reviewed: false,
      })),
      ...(messages.data ?? []).map((m) => ({
        id: `m${m.id}`,
        rawId: m.id,
        kind: "message" as const,
        at: m.created_at,
        teamId: m.team_id,
        team: teamName.get(m.team_id) ?? "?",
        who: m.sender_name,
        text: m.body,
        detail: channelLabel(m.channel),
        secret: m.channel !== "all",
        senderId: m.sender_user,
        reviewed: reviewed.has(m.id),
      })),
      ...(log.data ?? []).map((l) => ({
        id: `a${l.id}`,
        rawId: l.id,
        kind: "admin" as const,
        at: l.created_at,
        teamId: null,
        team: "",
        who: (l.admin_id && profileOf.get(l.admin_id)?.username) || "Admin",
        text: l.action,
        detail: l.target,
        secret: false,
        senderId: null,
        reviewed: false,
      })),
    ].sort((a, b) => b.at.localeCompare(a.at));
    const ticketRows = tickets.data ?? [];
    const replyHours = ticketRows
      .filter((t) => t.first_reply_at)
      .map((t) => (Date.parse(t.first_reply_at ?? "") - Date.parse(t.created_at)) / 3600000);
    const since30 = new Date(Date.now() - 30 * 86400000).toISOString();

    return {
      stats: {
        accounts: accounts.length,
        active7d: accounts.filter((a) => (a.last_sign_in_at ?? "") >= since).length,
        active30d: accounts.filter((a) => (a.last_sign_in_at ?? "") >= since30).length,
        newAccounts7d: sum("signups", CHART_DAYS - 7, CHART_DAYS),
        newAccountsPrev7d: sum("signups", 0, CHART_DAYS - 7),
        neverSignedIn: accounts.filter((a) => !a.last_sign_in_at).length,
        suspended: accounts.filter((a) => a.suspended).length,
        noTeam: accounts.filter((a) => !a.admin && a.teams.length === 0).length,
        teams: teamRows.length,
        activeTeams7d: teamRows.filter((t) => t.rolls7d + t.messages7d > 0).length,
        emptyTeams: teamRows.filter((t) => t.members.length === 0).length,
        noGmTeams: teamRows.filter(
          (t) => t.members.length > 0 && !t.members.some((m) => m.role === "gm"),
        ).length,
        characters: characterRows.length,
        orphanCharacters: characterRows.filter((c) => !c.owner_id).length,
        rolls7d: sum("rolls", CHART_DAYS - 7, CHART_DAYS),
        rollsPrev7d: sum("rolls", 0, CHART_DAYS - 7),
        messages7d: sum("messages", CHART_DAYS - 7, CHART_DAYS),
        messagesPrev7d: sum("messages", 0, CHART_DAYS - 7),
        flaggedMessages: (messages.data ?? []).filter(
          (m) => !reviewed.has(m.id) && findFlags(m.body, wordList).length > 0,
        ).length,
        ticketsOpen: ticketRows.filter((t) => t.status === "open").length,
        ticketsInProgress: ticketRows.filter((t) => t.status === "in_progress").length,
        ticketsResolved7d: ticketRows.filter(
          (t) => t.status === "resolved" && (t.resolved_at ?? "") >= since,
        ).length,
        firstReplyHours: replyHours.length
          ? replyHours.reduce((a, b) => a + b, 0) / replyHours.length
          : null,
      },
      days,
      accounts,
      teams: teamRows,
      activity,
      settings: settings.data as AdminSettings,
      announcements: announcements.data ?? [],
      moderationWords: wordList,
    };
  });

// ---------- Comptes ----------

export const adminCreateAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      email: z.string().trim().email("E-mail invalide."),
      password: z.string().min(8, "Le mot de passe doit faire au moins 8 caractères."),
      username: z.string().trim(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { admin, logAdmin } = await requireAdmin(context.supabase);
    if (data.username) {
      const invalid = validateUsername(data.username);
      if (invalid) throw new Error(invalid);
    }
    // Laisse passer ce seul e-mail quand les inscriptions sont fermées
    await admin.from("platform_settings").update({ signup_allowed_email: data.email }).eq("id", 1);
    const { data: created, error } = await admin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    });
    await admin.from("platform_settings").update({ signup_allowed_email: null }).eq("id", 1);
    if (error || !created.user) throw new Error("Création impossible : e-mail déjà utilisé ?");
    if (data.username) {
      const { error: nameError } = await admin
        .from("profiles")
        .update({ username: data.username })
        .eq("id", created.user.id);
      if (nameError) throw new Error("Compte créé, mais ce pseudo est déjà pris.");
    }
    await logAdmin(context.userId, "Compte créé", data.email);
    return { id: created.user.id };
  });

export const adminUpdateAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      userId,
      username: z.string().trim(),
      email: z.string().trim().email("E-mail invalide."),
    }),
  )
  .handler(async ({ data, context }) => {
    const { admin, logAdmin } = await requireAdmin(context.supabase);
    const invalid = validateUsername(data.username);
    if (invalid) throw new Error(invalid);
    const { error } = await admin
      .from("profiles")
      .update({ username: data.username })
      .eq("id", data.userId);
    if (error) throw new Error(error.code === "23505" ? "Ce pseudo est déjà pris." : error.message);
    const { error: mailError } = await admin.auth.admin.updateUserById(data.userId, {
      email: data.email,
      email_confirm: true,
    });
    if (mailError) throw new Error("Pseudo enregistré, mais cet e-mail est refusé.");
    await logAdmin(context.userId, "Compte modifié", data.username);
    return { ok: true };
  });

export const adminSetSuspended = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ userId, suspended: z.boolean() }))
  .handler(async ({ data, context }) => {
    const { admin, logAdmin } = await requireAdmin(context.supabase);
    if (data.userId === context.userId) throw new Error("Tu ne peux pas te suspendre toi-même.");
    // La base coupe l'accès tout de suite ; Auth empêche ensuite de se reconnecter.
    const { data: row, error } = await admin
      .from("profiles")
      .update({ suspended_at: data.suspended ? new Date().toISOString() : null })
      .eq("id", data.userId)
      .select("username")
      .single();
    if (error) throw new Error("Changement impossible.");
    const { error: banError } = await admin.auth.admin.updateUserById(data.userId, {
      ban_duration: data.suspended ? BAN_FOREVER : "none",
    });
    if (banError) throw new Error("Accès coupé, mais la connexion n’a pas pu être bloquée.");
    await logAdmin(
      context.userId,
      data.suspended ? "Compte suspendu" : "Compte réactivé",
      row.username ?? "",
    );
    return { ok: true };
  });

export const adminSetPlatformAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ userId, admin: z.boolean() }))
  .handler(async ({ data, context }) => {
    const { admin, logAdmin } = await requireAdmin(context.supabase);
    if (data.userId === context.userId)
      throw new Error("Tu ne peux pas retirer ton propre accès admin.");
    const { error } = data.admin
      ? await admin.from("platform_admins").upsert({ user_id: data.userId })
      : await admin.from("platform_admins").delete().eq("user_id", data.userId);
    if (error) throw new Error("Changement impossible.");
    const { data: row } = await admin
      .from("profiles")
      .select("username")
      .eq("id", data.userId)
      .maybeSingle();
    await logAdmin(
      context.userId,
      data.admin ? "Accès admin donné" : "Accès admin retiré",
      row?.username ?? "",
    );
    return { ok: true };
  });

export const adminSendPasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ userId, redirectTo: z.string().url() }))
  .handler(async ({ data, context }) => {
    const { admin, logAdmin } = await requireAdmin(context.supabase);
    const { data: target } = await admin.auth.admin.getUserById(data.userId);
    if (!target.user?.email) throw new Error("Compte introuvable.");
    const { error } = await admin.auth.resetPasswordForEmail(target.user.email, {
      redirectTo: data.redirectTo,
    });
    if (error) throw new Error("Envoi impossible. Réessaie dans quelques minutes.");
    await logAdmin(context.userId, "Lien de mot de passe envoyé", target.user.email);
    return { ok: true };
  });

// ---------- Équipes ----------

export const adminCreateTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      name: z.string().trim().min(2, "Nom trop court.").max(40, "Nom trop long."),
      gmId: userId.nullable(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { admin, logAdmin } = await requireAdmin(context.supabase);
    const { data: code, error: codeError } = await admin.rpc("new_join_code");
    if (codeError || !code) throw new Error("Création impossible.");
    const { data: team, error } = await admin
      .from("teams")
      .insert({ name: data.name, join_code: code, owner_id: data.gmId })
      .select("id")
      .single();
    if (error) throw new Error("Création impossible.");
    if (data.gmId) {
      await admin.from("team_members").insert({ team_id: team.id, user_id: data.gmId, role: "gm" });
    }
    await logAdmin(context.userId, "Équipe créée", data.name);
    return { id: team.id };
  });

export const adminRenameTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      teamId,
      name: z.string().trim().min(2, "Nom trop court.").max(40, "Nom trop long."),
    }),
  )
  .handler(async ({ data, context }) => {
    const { admin, logAdmin } = await requireAdmin(context.supabase);
    const { error } = await admin.from("teams").update({ name: data.name }).eq("id", data.teamId);
    if (error) throw new Error("Renommage impossible.");
    await logAdmin(context.userId, "Équipe renommée", data.name);
    return { ok: true };
  });

export const adminRegenerateCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ teamId }))
  .handler(async ({ data, context }) => {
    const { admin, logAdmin } = await requireAdmin(context.supabase);
    const { data: code, error: codeError } = await admin.rpc("new_join_code");
    if (codeError || !code) throw new Error("Changement impossible.");
    const { data: team, error } = await admin
      .from("teams")
      .update({ join_code: code })
      .eq("id", data.teamId)
      .select("name")
      .single();
    if (error) throw new Error("Changement impossible.");
    await logAdmin(context.userId, "Code d’invitation changé", team.name);
    return { ok: true };
  });

/** Ajoute un membre, change son rôle, ou le retire (role null). */
export const adminSetMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ teamId, userId, role: z.enum(["player", "gm"]).nullable() }))
  .handler(async ({ data, context }) => {
    const { admin, logAdmin } = await requireAdmin(context.supabase);
    const [{ data: team }, { data: profile }] = await Promise.all([
      admin.from("teams").select("name").eq("id", data.teamId).single(),
      admin.from("profiles").select("username").eq("id", data.userId).single(),
    ]);
    const target = `${profile?.username ?? "?"} / ${team?.name ?? "?"}`;
    if (data.role === null) {
      const { error } = await admin
        .from("team_members")
        .delete()
        .eq("team_id", data.teamId)
        .eq("user_id", data.userId);
      if (error) throw new Error("Retrait impossible.");
      await logAdmin(context.userId, "Membre retiré", target);
      return { ok: true };
    }
    const [{ count: otherGms }, { data: current }] = await Promise.all([
      admin
        .from("team_members")
        .select("user_id", { count: "exact", head: true })
        .eq("team_id", data.teamId)
        .eq("role", "gm")
        .neq("user_id", data.userId),
      admin
        .from("team_members")
        .select("role")
        .eq("team_id", data.teamId)
        .eq("user_id", data.userId)
        .maybeSingle(),
    ]);
    if (otherGms === 0 && current?.role === "gm" && data.role === "player")
      throw new Error("L’équipe doit garder au moins un MJ.");
    // Une équipe sans MJ reçoit le sien avec son premier membre ajouté
    const role = otherGms === 0 && !current ? "gm" : data.role;
    const { error } = await admin
      .from("team_members")
      .upsert({ team_id: data.teamId, user_id: data.userId, role });
    if (error) throw new Error("Changement impossible.");
    await logAdmin(context.userId, role === "gm" ? "Rôle MJ donné" : "Rôle joueur donné", target);
    return { ok: true };
  });

// ---------- Fiches ----------

export const adminSetCharacterOwner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ characterId: z.string().uuid(), ownerId: userId.nullable() }))
  .handler(async ({ data, context }) => {
    const { admin, logAdmin } = await requireAdmin(context.supabase);
    // Le trigger characters_guard refuse un joueur qui n'est pas membre de l'équipe de la fiche
    const { data: row, error } = await admin
      .from("characters")
      .update({ owner_id: data.ownerId })
      .eq("id", data.characterId)
      .select("name")
      .single();
    if (error) throw new Error("Attribution impossible.");
    await logAdmin(context.userId, "Fiche réattribuée", row.name);
    return { ok: true };
  });

export const adminDeleteCharacter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ characterId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { admin, logAdmin } = await requireAdmin(context.supabase);
    const { data: row, error } = await admin
      .from("characters")
      .delete()
      .eq("id", data.characterId)
      .select("name")
      .single();
    if (error) throw new Error("Suppression impossible.");
    await logAdmin(context.userId, "Fiche supprimée", row.name);
    return { ok: true };
  });

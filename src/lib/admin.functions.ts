import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const WEEK_MS = 7 * 24 * 3600 * 1000;
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
  teams: { id: string; name: string; role: string }[];
};
export type AdminTeam = {
  id: string;
  name: string;
  join_code: string;
  created_at: string;
  owner: string | null;
  members: { username: string | null; role: string }[];
  characters: number;
  last_activity: string | null;
};
export type AdminEvent = {
  id: string;
  kind: "roll" | "message";
  at: string;
  team: string;
  who: string;
  text: string;
  secret: boolean;
};
export type AdminOverview = {
  stats: {
    accounts: number;
    suspended: number;
    teams: number;
    characters: number;
    rolls7d: number;
    messages7d: number;
  };
  accounts: AdminAccount[];
  teams: AdminTeam[];
  activity: AdminEvent[];
};

async function requireAdmin(supabase: SupabaseClient<Database>) {
  const { data, error } = await supabase.rpc("is_platform_admin");
  if (error || data !== true) throw new Error("Accès réservé à l’admin.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const adminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminOverview> => {
    const admin = await requireAdmin(context.supabase);
    const since = new Date(Date.now() - WEEK_MS).toISOString();
    const [users, profiles, admins, teams, members, characters, rolls, messages] =
      await Promise.all([
        admin.auth.admin.listUsers({ perPage: 1000 }),
        admin.from("profiles").select("id,username,suspended_at"),
        admin.from("platform_admins").select("user_id"),
        admin.from("teams").select("id,name,join_code,owner_id,created_at").order("created_at"),
        admin.from("team_members").select("team_id,user_id,role"),
        admin.from("characters").select("id,team_id"),
        admin
          .from("rolls")
          .select("id,team_id,display_name,label,dice_count,dice_sides,total,is_secret,created_at")
          .order("created_at", { ascending: false })
          .limit(40),
        admin
          .from("messages")
          .select("id,team_id,sender_name,channel,body,created_at")
          .order("created_at", { ascending: false })
          .limit(40),
      ]);
    const [rolls7d, messages7d] = await Promise.all([
      admin.from("rolls").select("id", { count: "exact", head: true }).gte("created_at", since),
      admin.from("messages").select("id", { count: "exact", head: true }).gte("created_at", since),
    ]);

    const profileOf = new Map((profiles.data ?? []).map((p) => [p.id, p]));
    const teamList = teams.data ?? [];
    const teamName = new Map(teamList.map((t) => [t.id, t.name]));
    const adminIds = new Set((admins.data ?? []).map((a) => a.user_id));
    const memberRows = members.data ?? [];
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
        .map((m) => ({ username: profileOf.get(m.user_id)?.username ?? null, role: m.role })),
      characters: (characters.data ?? []).filter((c) => c.team_id === t.id).length,
      last_activity: lastActivity.get(t.id) ?? null,
    }));
    const activity: AdminEvent[] = [
      ...(rolls.data ?? []).map((r) => ({
        id: `r${r.id}`,
        kind: "roll" as const,
        at: r.created_at,
        team: teamName.get(r.team_id) ?? "?",
        who: r.display_name ?? "?",
        text: `${r.label ? `${r.label} : ` : ""}${r.dice_count}d${r.dice_sides} → ${r.total}`,
        secret: r.is_secret,
      })),
      ...(messages.data ?? []).map((m) => ({
        id: `m${m.id}`,
        kind: "message" as const,
        at: m.created_at,
        team: teamName.get(m.team_id) ?? "?",
        who: m.sender_name,
        text: m.body,
        secret: m.channel !== "all",
      })),
    ]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 50);

    return {
      stats: {
        accounts: accounts.length,
        suspended: accounts.filter((a) => a.suspended).length,
        teams: teamRows.length,
        characters: characters.data?.length ?? 0,
        rolls7d: rolls7d.count ?? 0,
        messages7d: messages7d.count ?? 0,
      },
      accounts,
      teams: teamRows,
      activity,
    };
  });

export const adminSetSuspended = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ userId: z.string().uuid(), suspended: z.boolean() }))
  .handler(async ({ data, context }) => {
    const admin = await requireAdmin(context.supabase);
    if (data.userId === context.userId) throw new Error("Tu ne peux pas te suspendre toi-même.");
    // La base coupe l'accès tout de suite ; Auth empêche ensuite de se reconnecter.
    const { error } = await admin
      .from("profiles")
      .update({ suspended_at: data.suspended ? new Date().toISOString() : null })
      .eq("id", data.userId);
    if (error) throw new Error("Changement impossible.");
    const { error: banError } = await admin.auth.admin.updateUserById(data.userId, {
      ban_duration: data.suspended ? BAN_FOREVER : "none",
    });
    if (banError) throw new Error("Accès coupé, mais la connexion n’a pas pu être bloquée.");
    return { ok: true };
  });

export const adminSendPasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ userId: z.string().uuid(), redirectTo: z.string().url() }))
  .handler(async ({ data, context }) => {
    const admin = await requireAdmin(context.supabase);
    const { data: target } = await admin.auth.admin.getUserById(data.userId);
    if (!target.user?.email) throw new Error("Compte introuvable.");
    const { error } = await admin.auth.resetPasswordForEmail(target.user.email, {
      redirectTo: data.redirectTo,
    });
    if (error) throw new Error("Envoi impossible. Réessaie dans quelques minutes.");
    return { ok: true };
  });

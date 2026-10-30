import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

async function requireAdmin(supabase: SupabaseClient<Database>) {
  const { requireAdminAccess } = await import("./admin-guard.server");
  return requireAdminAccess(supabase);
}

export type AdminTicket = {
  id: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
  user_id: string | null;
  username: string | null;
  email: string | null;
  team: string | null;
  /** Le dernier message visible vient de l'utilisateur : il attend une réponse. */
  awaiting: boolean;
};
export type AdminTicketMessage = {
  id: string;
  from_admin: boolean;
  internal: boolean;
  body: string;
  created_at: string;
};

export const adminTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminTicket[]> => {
    const { admin } = await requireAdmin(context.supabase);
    const [tickets, messages, profiles, teams, users] = await Promise.all([
      admin.from("support_tickets").select("*").order("updated_at", { ascending: false }),
      admin
        .from("support_messages")
        .select("ticket_id,from_admin,internal,created_at")
        .eq("internal", false)
        .order("created_at", { ascending: false }),
      admin.from("profiles").select("id,username"),
      admin.from("teams").select("id,name"),
      admin.auth.admin.listUsers({ perPage: 1000 }),
    ]);
    const lastFrom = new Map<string, boolean>();
    for (const m of messages.data ?? []) {
      if (!lastFrom.has(m.ticket_id)) lastFrom.set(m.ticket_id, m.from_admin);
    }
    const nameOf = new Map((profiles.data ?? []).map((p) => [p.id, p.username]));
    const teamOf = new Map((teams.data ?? []).map((t) => [t.id, t.name]));
    const mailOf = new Map((users.data?.users ?? []).map((u) => [u.id, u.email ?? null]));
    return (tickets.data ?? []).map((t) => ({
      id: t.id,
      subject: t.subject,
      category: t.category,
      status: t.status,
      priority: t.priority,
      created_at: t.created_at,
      updated_at: t.updated_at,
      user_id: t.user_id,
      username: t.user_id ? (nameOf.get(t.user_id) ?? null) : null,
      email: t.user_id ? (mailOf.get(t.user_id) ?? null) : null,
      team: t.team_id ? (teamOf.get(t.team_id) ?? null) : null,
      awaiting: t.status !== "resolved" && lastFrom.get(t.id) === false,
    }));
  });

export const adminTicketThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }): Promise<AdminTicketMessage[]> => {
    const { admin } = await requireAdmin(context.supabase);
    const { data: rows, error } = await admin
      .from("support_messages")
      .select("id,from_admin,internal,body,created_at")
      .eq("ticket_id", data.id)
      .order("created_at");
    if (error) throw new Error("Lecture impossible.");
    return rows;
  });

export const adminReplyTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      id: z.string().uuid(),
      body: z.string().trim().min(1, "Écris une réponse.").max(4000, "Réponse trop longue."),
      internal: z.boolean(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { admin, logAdmin } = await requireAdmin(context.supabase);
    const { error } = await admin.from("support_messages").insert({
      ticket_id: data.id,
      sender_id: context.userId,
      from_admin: true,
      internal: data.internal,
      body: data.body,
    });
    if (error) throw new Error("Envoi impossible.");
    const now = new Date().toISOString();
    if (!data.internal) {
      const { data: ticket } = await admin
        .from("support_tickets")
        .select("status,first_reply_at,subject")
        .eq("id", data.id)
        .single();
      await admin
        .from("support_tickets")
        .update({
          updated_at: now,
          user_unread: true,
          first_reply_at: ticket?.first_reply_at ?? now,
        })
        .eq("id", data.id);
      // Filtré en base : un ticket que l'utilisateur vient de clore ne repasse pas en cours
      await admin
        .from("support_tickets")
        .update({ status: "in_progress" })
        .eq("id", data.id)
        .eq("status", "open");
      await logAdmin(context.userId, "Réponse au support", ticket?.subject ?? "");
    }
    return { ok: true };
  });

export const adminUpdateTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      id: z.string().uuid(),
      status: z.enum(["open", "in_progress", "resolved"]).optional(),
      priority: z.enum(["low", "normal", "high"]).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { admin, logAdmin } = await requireAdmin(context.supabase);
    const { id, status, priority } = data;
    const { data: ticket, error } = await admin
      .from("support_tickets")
      .update({
        updated_at: new Date().toISOString(),
        ...(priority ? { priority } : {}),
        ...(status
          ? { status, resolved_at: status === "resolved" ? new Date().toISOString() : null }
          : {}),
      })
      .eq("id", id)
      .select("subject")
      .single();
    if (error) throw new Error("Changement impossible.");
    if (status) await logAdmin(context.userId, `Ticket : ${status}`, ticket.subject);
    return { ok: true };
  });

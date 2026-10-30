import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Trace d'une action d'admin : un échec d'écriture du journal ne bloque pas l'action déjà faite. */
export async function logAdmin(adminId: string, action: string, target: string) {
  await supabaseAdmin.from("admin_log").insert({ admin_id: adminId, action, target });
}

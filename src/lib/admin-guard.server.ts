import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logAdmin } from "./admin-log.server";

/** Vérifie le droit d'admin avec le jeton de l'appelant, puis donne accès à la clé de service. */
export async function requireAdminAccess(supabase: SupabaseClient<Database>) {
  const { data, error } = await supabase.rpc("is_platform_admin");
  if (error || data !== true) throw new Error("Accès réservé à l’admin.");
  return { admin: supabaseAdmin, logAdmin };
}

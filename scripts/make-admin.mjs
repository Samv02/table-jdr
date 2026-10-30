// Donne l'accès au back office à un compte existant.
// Usage : npm run admin -- email@exemple.fr
// Le droit d'admin ne s'accorde jamais depuis l'appli : uniquement avec la clé secrète de .env.
import { createClient } from "@supabase/supabase-js";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("Indique l'e-mail du compte : npm run admin -- email@exemple.fr");
  process.exit(1);
}
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
if (error) throw error;
const user = data.users.find((u) => u.email?.toLowerCase() === email);
if (!user) {
  console.error(`Aucun compte avec cet e-mail : crée-le d'abord sur la page de connexion.`);
  process.exit(1);
}
const { error: insertError } = await supabase
  .from("platform_admins")
  .upsert({ user_id: user.id }, { onConflict: "user_id" });
if (insertError) throw insertError;
console.log(`${email} est maintenant admin.`);

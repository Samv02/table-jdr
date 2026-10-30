import { supabase } from "@/integrations/supabase/client";

/**
 * Change l'équipe active puis recharge la page : scènes, musique, univers et abonnements
 * temps réel repartent ainsi tous de la nouvelle équipe.
 */
export async function openTeam(teamId: string | null, to: string): Promise<string | null> {
  const { error } = await supabase.rpc("enter_team", { _team: teamId as string });
  if (error) return error.message;
  window.location.assign(to);
  return null;
}

/** Pages de jeu : elles n'ont de sens qu'à l'intérieur d'une équipe. */
export const needsTeam = (pathname: string) => pathname === "/fiche" || pathname.startsWith("/mj");

/** Messages d'authentification en français (Supabase répond en anglais). */
export function authMessage(error: { code?: string | undefined; message: string }) {
  switch (error.code) {
    case "invalid_credentials":
      return "E-mail ou mot de passe incorrect.";
    case "email_not_confirmed":
      return "Confirme d’abord ton e-mail avec le lien reçu.";
    case "user_banned":
      return "Ce compte est suspendu.";
    case "weak_password":
      return "Mot de passe trop faible.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Trop d’essais. Réessaie dans quelques minutes.";
    default:
      return error.message;
  }
}

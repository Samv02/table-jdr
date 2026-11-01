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
export const needsTeam = (pathname: string) =>
  pathname === "/fiche" || pathname === "/carte" || pathname.startsWith("/mj");

/** Pages publiques : tout le reste demande d'être connecté. */
const PUBLIC_PAGES = ["/", "/confidentialite", "/mot-de-passe", "/rejoindre"];

/**
 * Où envoyer un compte qui n'a rien à faire sur cette page ; null s'il peut y rester.
 * Aucune page ne doit finir sur une impasse sans menu : toute la règle tient ici.
 */
export function routeGuard(
  pathname: string,
  id: {
    ready: boolean;
    userId: string | null;
    teamId: string | null;
    isGm: boolean;
    isAdmin: boolean;
  },
): "/" | "/tables" | "/fiche" | "/admin" | null {
  if (!id.ready) return null;
  if (!id.userId) return PUBLIC_PAGES.includes(pathname) ? null : "/";
  if (pathname.startsWith("/admin")) return id.isAdmin ? null : id.teamId ? "/fiche" : "/tables";
  // L'admin ne joue pas : hors équipe, son espace est le back office
  if (id.isAdmin && !id.teamId)
    return needsTeam(pathname) || pathname === "/tables" || pathname === "/profil"
      ? "/admin"
      : null;
  if (needsTeam(pathname) && !id.teamId) return "/tables";
  if (pathname.startsWith("/mj") && !id.isGm) return "/fiche";
  return null;
}

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
      // Refus venu de la base quand l'admin a fermé les inscriptions
      return error.message.includes("Database error")
        ? "Les inscriptions sont fermées."
        : error.message;
  }
}

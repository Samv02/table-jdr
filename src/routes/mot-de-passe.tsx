import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { authMessage } from "@/lib/team";

export const Route = createFileRoute("/mot-de-passe")({
  ssr: false,
  head: () => ({ meta: [{ title: "Nouveau mot de passe" }] }),
  component: NewPassword,
});

/** Arrivée depuis le lien reçu par e-mail, ou depuis le profil : la session est déjà ouverte. */
function NewPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setMsg(authMessage(error));
    await navigate({ to: "/", replace: true });
  }

  return (
    <main className="auth-page">
      <div className="auth-content">
        <header className="auth-heading">
          <h1>NOUVEAU MOT DE PASSE</h1>
        </header>
        <form onSubmit={submit} className="auth-form">
          <div className="auth-field">
            <label htmlFor="new-password">Mot de passe</label>
            <input
              id="new-password"
              className="field"
              type="password"
              placeholder="8 caractères minimum"
              autoComplete="new-password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={busy} className="auth-submit cut">
            {busy ? "ENREGISTREMENT…" : "ENREGISTRER"}
          </Button>
          {msg && (
            <p className="auth-error" role="alert">
              {msg}
            </p>
          )}
          <Link to="/" className="auth-link">
            Retour
          </Link>
        </form>
      </div>
    </main>
  );
}

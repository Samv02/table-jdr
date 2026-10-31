import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LogIn } from "lucide-react";
import { useWords } from "@/lib/universe-context";
import { authMessage } from "@/lib/team";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Table de jeu de rôle" },
      { name: "description", content: "Connecte-toi pour rejoindre la partie." },
      { property: "og:title", content: "Table de jeu de rôle" },
      { property: "og:description", content: "Connecte-toi pour rejoindre la partie." },
    ],
  }),
  component: Index,
});

function Index() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();
  const W = useWords();
  useEffect(() => {
    if (!ready || !session) return;
    let disposed = false;
    void supabase
      .rpc("get_team_context")
      .maybeSingle()
      .then(({ data, error }) => {
        if (disposed || error) return;
        // Le hub est la porte d'entrée de tout le monde ; l'admin hors table a son back office
        const to = data?.is_admin && !data.id ? ("/admin" as const) : ("/tables" as const);
        void navigate({ to, replace: true });
      });
    return () => {
      disposed = true;
    };
  }, [ready, session, navigate]);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <main className="auth-page">
      <div className="auth-content">
        <header className="auth-heading">
          <h1>{W.tableName.toUpperCase()}</h1>
          <p>{W.tagline}</p>
        </header>
        {!ready || session ? null : <AuthForm />}
      </div>
    </main>
  );
}

type Mode = "login" | "signup" | "reset";
const SUBMIT: Record<Mode, { idle: string; busy: string }> = {
  login: { idle: "CONNEXION", busy: "CONNEXION…" },
  signup: { idle: "CRÉER MON COMPTE", busy: "CRÉATION…" },
  reset: { idle: "RECEVOIR UN LIEN", busy: "ENVOI…" },
};

function AuthForm() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signupsOpen, setSignupsOpen] = useState(true);
  useEffect(() => {
    void supabase
      .rpc("get_platform_status")
      .maybeSingle()
      .then(({ data }) => setSignupsOpen(data?.signups_open !== false));
  }, []);

  function switchMode(next: Mode) {
    setMode(next);
    setMsg(null);
    setNotice(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setNotice(null);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setMsg(authMessage(error));
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) setMsg(authMessage(error));
        else if (!data.session)
          setNotice("Compte créé. Clique sur le lien reçu par e-mail pour l’activer.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/mot-de-passe`,
        });
        if (error) setMsg(authMessage(error));
        else setNotice("Si ce compte existe, un lien vient de lui être envoyé.");
      }
    } catch {
      setMsg("Connexion impossible. Réessaie dans un instant.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="auth-form">
      <div className="auth-field">
        <label htmlFor="login-email">Email</label>
        <input
          id="login-email"
          className="field"
          type="email"
          placeholder="Email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      {mode !== "reset" && (
        <div className="auth-field">
          <label htmlFor="login-password">Mot de passe</label>
          <input
            id="login-password"
            className="field"
            type="password"
            placeholder={mode === "signup" ? "8 caractères minimum" : "Mot de passe"}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            minLength={mode === "signup" ? 8 : 6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
      )}
      {mode === "signup" && (
        <p className="auth-link">
          En créant un compte, tu acceptes notre{" "}
          <Link to="/confidentialite">politique de confidentialité</Link>.
        </p>
      )}
      <Button type="submit" disabled={busy} className="auth-submit cut">
        <LogIn aria-hidden="true" />
        {busy ? SUBMIT[mode].busy : SUBMIT[mode].idle}
      </Button>
      {msg && (
        <p className="auth-error" role="alert">
          {msg}
        </p>
      )}
      {notice && (
        <p className="auth-link" role="status">
          {notice}
        </p>
      )}
      <div className="auth-switch">
        {mode === "login" ? (
          <>
            {signupsOpen && <Button onClick={() => switchMode("signup")}>Créer un compte</Button>}
            <Button onClick={() => switchMode("reset")}>Mot de passe oublié</Button>
          </>
        ) : (
          <Button onClick={() => switchMode("login")}>J’ai déjà un compte</Button>
        )}
      </div>
    </form>
  );
}

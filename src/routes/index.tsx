import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { loginDestination } from "@/lib/dashboard";
import { LogIn } from "lucide-react";
import { useWords } from "@/lib/universe-context";

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
      .from("profiles")
      .select("role")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!disposed && !error)
          void navigate({ to: loginDestination(data?.role === "gm"), replace: true });
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

function AuthForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMsg(error.message);
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
      <div className="auth-field">
        <label htmlFor="login-password">Mot de passe</label>
        <input
          id="login-password"
          className="field"
          type="password"
          placeholder="Mot de passe"
          autoComplete="current-password"
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      <Button variant="prototype" type="submit" disabled={busy} className="auth-submit cut">
        <LogIn aria-hidden="true" />
        {busy ? "CONNEXION…" : "CONNEXION"}
      </Button>
      {msg && (
        <p className="auth-error" role="alert">
          {msg}
        </p>
      )}
    </form>
  );
}

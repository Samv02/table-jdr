import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, RefreshCw, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "./ui/button";
import { InlineError } from "@/components/InlineError";
import { confirmAction } from "@/components/ConfirmDialog";
import { useIdentity } from "@/lib/active-character";
import { deleteTeam } from "@/lib/accounts.functions";

/** Réglages de l'équipe active : nom, code d'invitation, suppression. */
export function TeamSettings() {
  const id = useIdentity();
  const removeTeam = useServerFn(deleteTeam);
  const [code, setCode] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void supabase.rpc("get_join_code").then(({ data }) => setCode(data ?? null));
  }, []);
  const shownName = name ?? id.teamName ?? "";

  async function rename() {
    const { error } = await supabase.rpc("rename_team", { _name: shownName });
    if (error) return void setErr(error.message);
    window.dispatchEvent(new Event("profile:changed"));
  }
  async function regenerate() {
    const ok = await confirmAction({
      title: "Changer le code d’invitation ?",
      message: "L’ancien code ne marchera plus. Les membres actuels restent dans l’équipe.",
      confirmLabel: "Changer le code",
    });
    if (!ok) return;
    const { data, error } = await supabase.rpc("regenerate_join_code");
    if (error) return void setErr(error.message);
    setCode(data);
  }
  async function copy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setErr("Copie impossible : recopie le code à la main.");
    }
  }
  async function remove() {
    if (!id.teamId) return;
    const ok = await confirmAction({
      title: `Supprimer l’équipe « ${id.teamName} » ?`,
      message:
        "Fiches, scènes, musique, jets et messages seront supprimés pour tout le monde. Les comptes sont conservés. Action irréversible.",
      confirmLabel: "Supprimer l’équipe",
    });
    if (!ok) return;
    try {
      await removeTeam({ data: { teamId: id.teamId } });
      window.location.assign(id.isVisitor ? "/admin" : "/equipes");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Suppression impossible.");
    }
  }

  return (
    <section className="panel cut team-settings">
      <div className="ph">
        <h2>Équipe</h2>
      </div>
      <InlineError message={err} onClear={() => setErr(null)} />
      <p className="note">Code d’invitation à donner à tes joueurs</p>
      <div className="team-code-row">
        <code className="team-code">{code ?? "…"}</code>
        <Button
          variant="prototype"
          className="icon-btn cut-s"
          title="Copier le code"
          aria-label="Copier le code"
          onClick={() => void copy()}
        >
          {copied ? <Check /> : <Copy />}
        </Button>
        <Button
          variant="prototype"
          className="icon-btn cut-s"
          title="Changer le code"
          aria-label="Changer le code"
          onClick={() => void regenerate()}
        >
          <RefreshCw />
        </Button>
      </div>
      <form
        className="add"
        onSubmit={(e) => {
          e.preventDefault();
          void rename();
        }}
      >
        <input
          className="field"
          aria-label="Nom de l’équipe"
          maxLength={40}
          value={shownName}
          onChange={(e) => setName(e.target.value)}
        />
        <Button variant="prototype" className="btn y" disabled={shownName.trim().length < 2}>
          Renommer
        </Button>
      </form>
      <Button variant="prototype" className="btn red team-delete" onClick={() => void remove()}>
        <Trash2 size={16} /> Supprimer l’équipe
      </Button>
    </section>
  );
}

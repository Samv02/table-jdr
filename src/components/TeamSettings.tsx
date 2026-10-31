import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, Link2, RefreshCw, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "./ui/button";
import { InlineError } from "@/components/InlineError";
import { confirmAction } from "@/components/ConfirmDialog";
import { useIdentity } from "@/lib/active-character";
import { deleteTeam } from "@/lib/accounts.functions";
import { inviteLink, toLocalInput, type HubRow } from "@/lib/hub";

/** Réglages de la table active : invitation, prochaine séance, nom, suppression. */
export function TeamSettings() {
  const id = useIdentity();
  const removeTeam = useServerFn(deleteTeam);
  const [code, setCode] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [session, setSession] = useState("");
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void supabase.rpc("get_join_code").then(({ data }) => setCode(data ?? null));
    void supabase.rpc("my_hub").then(({ data }) => {
      const mine = (data as HubRow[] | null)?.find((t) => t.id === id.teamId);
      setSession(toLocalInput(mine?.next_session ?? null));
    });
  }, [id.teamId]);
  const shownName = name ?? id.teamName ?? "";

  async function rename() {
    const { error } = await supabase.rpc("rename_team", { _name: shownName });
    if (error) return void setErr(error.message);
    window.dispatchEvent(new Event("profile:changed"));
  }
  async function regenerate() {
    const ok = await confirmAction({
      title: "Changer le code d’invitation ?",
      message:
        "L’ancien code et l’ancien lien ne marcheront plus. Les membres actuels restent à la table.",
      confirmLabel: "Changer le code",
    });
    if (!ok) return;
    const { data, error } = await supabase.rpc("regenerate_join_code");
    if (error) return void setErr(error.message);
    setCode(data);
  }
  async function copy(what: "code" | "link") {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(
        what === "code" ? code : inviteLink(code, window.location.origin),
      );
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setErr("Copie impossible : recopie le code à la main.");
    }
  }
  async function saveSession(value: string) {
    setSession(value);
    const { error } = await supabase.rpc("set_next_session", {
      _at: (value ? new Date(value).toISOString() : null) as string,
    });
    if (error) return void setErr(error.message);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }
  async function remove() {
    if (!id.teamId) return;
    const ok = await confirmAction({
      title: `Supprimer la table « ${id.teamName} » ?`,
      message:
        "Fiches, scènes, musique, jets et messages seront supprimés pour tout le monde. Les comptes sont conservés. Action irréversible.",
      confirmLabel: "Supprimer la table",
    });
    if (!ok) return;
    try {
      await removeTeam({ data: { teamId: id.teamId } });
      window.location.assign(id.isVisitor ? "/admin" : "/tables");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Suppression impossible.");
    }
  }

  return (
    <div className="team-settings">
      <InlineError message={err} onClear={() => setErr(null)} />
      <section className="panel cut">
        <div className="ph">
          <h2>Inviter</h2>
        </div>
        <p className="note">Envoie le lien, ou donne le code à tes joueurs.</p>
        <div className="team-code-row">
          <code className="team-code">{code ?? "…"}</code>
          <Button
            className="icon-btn cut-s"
            title="Copier le code"
            aria-label="Copier le code"
            onClick={() => void copy("code")}
          >
            {copied === "code" ? <Check /> : <Copy />}
          </Button>
          <Button
            className="icon-btn cut-s"
            title="Changer le code"
            aria-label="Changer le code"
            onClick={() => void regenerate()}
          >
            <RefreshCw />
          </Button>
        </div>
        <Button className="btn y" disabled={!code} onClick={() => void copy("link")}>
          {copied === "link" ? <Check size={16} /> : <Link2 size={16} />}
          {copied === "link" ? "Lien copié" : "Copier le lien d’invitation"}
        </Button>
      </section>

      <section className="panel cut">
        <div className="ph">
          <h2>Prochaine séance</h2>
          {saved && <span className="tag">ENREGISTRÉE</span>}
        </div>
        <p className="note">Elle s’affiche sur la carte de la table, pour tout le monde.</p>
        <div className="session-row">
          <input
            className="field"
            type="datetime-local"
            aria-label="Date de la prochaine séance"
            value={session}
            onChange={(e) => void saveSession(e.target.value)}
          />
          {session && (
            <Button className="btn" onClick={() => void saveSession("")}>
              Retirer
            </Button>
          )}
        </div>
      </section>

      <section className="panel cut">
        <div className="ph">
          <h2>La table</h2>
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
            aria-label="Nom de la table"
            maxLength={40}
            value={shownName}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" className="btn y" disabled={shownName.trim().length < 2}>
            Renommer
          </Button>
        </form>
        <Button className="btn red team-delete" onClick={() => void remove()}>
          <Trash2 size={16} /> Supprimer la table
        </Button>
      </section>
    </div>
  );
}

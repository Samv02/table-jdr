import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Download, Megaphone, Plus, Trash2, Undo2, X } from "lucide-react";
import { confirmAction } from "@/components/ConfirmDialog";
import {
  adminAddModerationWord,
  adminCreateAnnouncement,
  adminDeleteModerationWord,
  adminSetAnnouncement,
  adminUpdateSettings,
} from "@/lib/admin-platform.functions";
import type { AdminOverview } from "@/lib/admin.functions";
import { downloadFile, formatDay, formatMoment, toCsv } from "@/lib/admin";
import { MODERATION_CATEGORIES } from "@/lib/moderation";
import type { AdminRun } from "@/routes/admin";
import { Button } from "@/components/ui/button";

/** Réglages de toute la plateforme, annonces et exports. */
export function AdminControl({
  data,
  busy,
  run,
}: {
  data: AdminOverview;
  busy: boolean;
  run: AdminRun;
}) {
  const saveSettings = useServerFn(adminUpdateSettings);
  const publish = useServerFn(adminCreateAnnouncement);
  const setAnnouncement = useServerFn(adminSetAnnouncement);
  const addWord = useServerFn(adminAddModerationWord);
  const removeWord = useServerFn(adminDeleteModerationWord);
  const [word, setWord] = useState("");
  const [wordCategory, setWordCategory] =
    useState<(typeof MODERATION_CATEGORIES)[number]["key"]>("insulte");
  const [settings, setSettings] = useState(data.settings);
  const [body, setBody] = useState("");
  const [level, setLevel] = useState<"info" | "warning">("info");
  const [teamId, setTeamId] = useState("");
  const [days, setDays] = useState(0);
  const teamName = (id: string | null) =>
    id ? (data.teams.find((t) => t.id === id)?.name ?? "?") : "Tout le monde";

  async function save() {
    if (settings.maintenance && !data.settings.maintenance) {
      const ok = await confirmAction({
        title: "Activer la maintenance ?",
        message:
          "Tous les joueurs et MJ perdent l’accès immédiatement, y compris en pleine partie. Seul le back office reste ouvert.",
        confirmLabel: "Activer la maintenance",
      });
      if (!ok) return;
    }
    await run(() => saveSettings({ data: settings }), "Réglages enregistrés.");
  }

  function exportAccounts() {
    downloadFile(
      "comptes.csv",
      toCsv([
        ["Pseudo", "E-mail", "Inscription", "Dernière connexion", "État", "Équipes"],
        ...data.accounts.map((a) => [
          a.username,
          a.email,
          formatDay(a.created_at),
          a.last_sign_in_at ? formatMoment(a.last_sign_in_at) : "",
          a.suspended ? "Suspendu" : "Actif",
          a.teams.map((t) => t.name).join(", "),
        ]),
      ]),
      "text/csv;charset=utf-8",
    );
  }
  function exportTeams() {
    downloadFile(
      "equipes.csv",
      toCsv([
        ["Équipe", "Code", "Créée le", "Membres", "Fiches", "Jets 7 j", "Messages 7 j"],
        ...data.teams.map((t) => [
          t.name,
          t.join_code,
          formatDay(t.created_at),
          t.members.length,
          t.characters.length,
          t.rolls7d,
          t.messages7d,
        ]),
      ]),
      "text/csv;charset=utf-8",
    );
  }

  return (
    <div className="bo-dash">
      <section>
        <h2 className="bo-section">Accès à l’application</h2>
        <div className="bo-card bo-switches">
          <Switch
            label="Mode maintenance"
            hint="Coupe l’accès aux équipes pour tout le monde, sauf toi."
            checked={settings.maintenance}
            onChange={(maintenance) => setSettings({ ...settings, maintenance })}
          />
          {settings.maintenance && (
            <input
              className="bo-input"
              placeholder="Message affiché (facultatif)"
              aria-label="Message de maintenance"
              maxLength={300}
              value={settings.maintenance_message}
              onChange={(e) => setSettings({ ...settings, maintenance_message: e.target.value })}
            />
          )}
          <Switch
            label="Inscriptions ouvertes"
            hint="Fermées : seul le back office peut créer des comptes."
            checked={settings.signups_open}
            onChange={(signups_open) => setSettings({ ...settings, signups_open })}
          />
          <Switch
            label="Création d’équipes ouverte"
            checked={settings.team_creation_open}
            onChange={(team_creation_open) => setSettings({ ...settings, team_creation_open })}
          />
          <Switch
            label="Rejoindre une équipe ouvert"
            hint="Fermé : les codes d’invitation ne marchent plus."
            checked={settings.joins_open}
            onChange={(joins_open) => setSettings({ ...settings, joins_open })}
          />
          <label className="bo-field">
            Équipes maximum par compte
            <input
              className="bo-input"
              type="number"
              min={1}
              max={100}
              value={settings.max_teams_per_user}
              onChange={(e) =>
                setSettings({ ...settings, max_teams_per_user: Number(e.target.value) })
              }
            />
          </label>
          <Button className="bo-btn primary" disabled={busy} onClick={() => void save()}>
            Enregistrer les réglages
          </Button>
        </div>
      </section>

      <section>
        <h2 className="bo-section">Annonces</h2>
        <form
          className="bo-card bo-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await publish({ data: { body, level, teamId: teamId || null, days } });
              setBody("");
            }, "Annonce publiée.");
          }}
        >
          <textarea
            className="bo-input bo-area"
            rows={2}
            maxLength={500}
            required
            placeholder="Message affiché en bandeau en haut de l’application"
            aria-label="Texte de l’annonce"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="bo-row">
            <select
              className="bo-input"
              aria-label="Destinataires"
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
            >
              <option value="">Tout le monde</option>
              {data.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <select
              className="bo-input"
              aria-label="Importance"
              value={level}
              onChange={(e) => setLevel(e.target.value as "info" | "warning")}
            >
              <option value="info">Information</option>
              <option value="warning">Important</option>
            </select>
            <select
              className="bo-input"
              aria-label="Durée"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              <option value={0}>Sans fin</option>
              <option value={1}>1 jour</option>
              <option value={7}>7 jours</option>
              <option value={30}>30 jours</option>
            </select>
          </div>
          <Button type="submit" className="bo-btn primary" disabled={busy}>
            <Megaphone size={16} aria-hidden="true" /> Publier
          </Button>
        </form>
        <ul className="bo-list">
          {data.announcements.map((a) => (
            <li key={a.id} className={`bo-card bo-announce ${a.active ? "" : "off"}`}>
              <span className="bo-grow">
                <span className="bo-text">{a.body}</span>
                <small className="bo-muted">
                  {teamName(a.team_id)} · {a.level === "warning" ? "Important" : "Information"}
                  {a.expires_at ? ` · jusqu’au ${formatMoment(a.expires_at)}` : ""}
                  {a.active ? "" : " · retirée"}
                </small>
              </span>
              <Button
                className="bo-btn"
                disabled={busy}
                onClick={() =>
                  void run(() => setAnnouncement({ data: { id: a.id, active: !a.active } }))
                }
              >
                {a.active ? "Retirer" : <Undo2 size={16} aria-label="Remettre" />}
              </Button>
              <Button
                className="bo-btn danger"
                aria-label="Supprimer l’annonce"
                title="Supprimer l’annonce"
                disabled={busy}
                onClick={() =>
                  void run(() => setAnnouncement({ data: { id: a.id, active: null } }))
                }
              >
                <Trash2 size={16} aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="bo-section">Modération des messages</h2>
        <p className="bo-muted">
          Rien n’est bloqué : ces mots surlignent seulement le message en rouge dans Activité.
          Ajoute « * » à la fin pour accepter toutes les terminaisons, comme « connard* ».
        </p>
        <form
          className="bo-row bo-word-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await addWord({ data: { word, category: wordCategory } });
              setWord("");
            });
          }}
        >
          <input
            className="bo-input"
            placeholder="Mot ou expression"
            aria-label="Mot à signaler"
            maxLength={60}
            required
            value={word}
            onChange={(e) => setWord(e.target.value)}
          />
          <select
            className="bo-input bo-narrow"
            aria-label="Famille du mot"
            value={wordCategory}
            onChange={(e) =>
              setWordCategory(e.target.value as (typeof MODERATION_CATEGORIES)[number]["key"])
            }
          >
            {MODERATION_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          <Button type="submit" className="bo-btn" disabled={busy}>
            <Plus size={16} aria-hidden="true" /> Ajouter
          </Button>
        </form>
        {MODERATION_CATEGORIES.map((c) => (
          <div key={c.key} className="bo-words">
            <h3>{c.label}</h3>
            <ul>
              {data.moderationWords
                .filter((w) => w.category === c.key)
                .map((w) => (
                  <li key={w.id}>
                    {w.word}
                    <Button
                      aria-label={`Retirer ${w.word}`}
                      title="Retirer"
                      disabled={busy}
                      onClick={() => void run(() => removeWord({ data: { id: w.id } }))}
                    >
                      <X size={12} aria-hidden="true" />
                    </Button>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </section>

      <section>
        <h2 className="bo-section">Exports</h2>
        <div className="bo-actions">
          <Button className="bo-btn" onClick={exportAccounts}>
            <Download size={16} aria-hidden="true" /> Comptes (CSV)
          </Button>
          <Button className="bo-btn" onClick={exportTeams}>
            <Download size={16} aria-hidden="true" /> Équipes (CSV)
          </Button>
        </div>
      </section>
    </div>
  );
}

function Switch({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="bo-switch">
      <span className="bo-grow">
        {label}
        {hint && <small className="bo-muted">{hint}</small>}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

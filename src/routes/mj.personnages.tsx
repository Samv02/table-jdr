import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { rowsToSheet, sheetToRows, type InventoryItem } from "@/lib/character-import";
import type { Json } from "@/integrations/supabase/types";
import { InlineError } from "@/components/InlineError";
import { SceneManager } from "@/components/SceneManager";
import { GmTable } from "@/components/GmTable";
import { MusicManager } from "@/components/TableMusic";
import { Button } from "@/components/ui/button";
import { neonVar, useProfiles } from "@/lib/profile";
import { useTable } from "@/lib/table-context";
import { useIdentity } from "@/lib/active-character";
import { useServerFn } from "@tanstack/react-start";
import { acquireItem } from "@/lib/catalog.functions";
import { Download, Trash2, UserMinus } from "lucide-react";
import { confirmAction } from "@/components/ConfirmDialog";
import { UniverseEditor } from "@/components/UniverseEditor";
import { TeamSettings } from "@/components/TeamSettings";
import { useUniverse } from "@/lib/universe-context";
import { hpMaxFor } from "@/lib/universe";

export const Route = createFileRoute("/mj/personnages")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) =>
    typeof search["tab"] === "string" ? { tab: search["tab"] } : {},
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "MJ – Personnages" },
      { name: "description", content: "Gestion des personnages par le MJ." },
      { property: "og:title", content: "MJ – Personnages" },
      { property: "og:description", content: "Gestion des personnages par le MJ." },
    ],
  }),
  component: GmCharacters,
});

type Row = {
  id: string;
  name: string;
  handle: string | null;
  owner_id: string | null;
  sheet: Json;
  character_state: { hp_current: number; eddies: number; inventory: Json } | null;
};
type Profile = { id: string; username: string | null; role: string };

function GmCharacters() {
  const [status, setStatus] = useState<"loading" | "denied" | "ok">("loading");
  const [rows, setRows] = useState<Row[]>([]);
  const [players, setPlayers] = useState<Profile[]>([]);
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [tab, setTab] = useState(search.tab ?? "table");
  const [newOwner, setNewOwner] = useState("");
  const [newInfo, setNewInfo] = useState<Record<string, string>>({});
  const [showImport, setShowImport] = useState(false);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [playersErr, setPlayersErr] = useState<string | null>(null);
  const [charsErr, setCharsErr] = useState<string | null>(null);
  const profiles = useProfiles();
  const table = useTable();
  const identity = useIdentity();
  const [deleting, setDeleting] = useState<string | null>(null);
  const { universe: u } = useUniverse();
  const acquire = useServerFn(acquireItem);
  const [newName, setNewName] = useState("");

  const load = useCallback(async () => {
    const [{ data: c }, { data: p }] = await Promise.all([
      supabase
        .from("characters")
        .select("id,name,handle,owner_id,sheet,character_state(hp_current,eddies,inventory)")
        .order("created_at"),
      supabase.rpc("get_team_members"),
    ]);
    setRows((c as Row[]) ?? []);
    setPlayers((p ?? []).map((m) => ({ id: m.user_id, username: m.username, role: m.role })));
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("is_gm");
      if (data !== true) return setStatus("denied");
      setStatus("ok");
      load();
    })();
  }, [load]);

  async function doImport() {
    setMsg(null);
    let sheet: Record<string, unknown>;
    try {
      sheet = JSON.parse(text);
      if (!sheet || typeof sheet !== "object" || Array.isArray(sheet)) throw new Error();
    } catch {
      return setMsg("JSON invalide.");
    }
    const { character, state } = sheetToRows(sheet);
    const { data, error } = await supabase
      .from("characters")
      .insert({ ...character, sheet: sheet as Json })
      .select("id")
      .single();
    if (error) return setMsg(error.message);
    const { error: e2 } = await supabase.from("character_state").insert({
      character_id: data.id,
      ...state,
      ammo: state.ammo as Json,
      inventory: state.inventory as Json,
    });
    if (e2) return setMsg(e2.message);
    setText("");
    setShowImport(false);
    setMsg(`${character.name} importé.`);
    load();
  }

  /** Fiche vierge aux couleurs de l'univers : toutes ses caractéristiques à la même valeur de départ */
  async function createCharacter(open: boolean) {
    const name = newName.trim();
    if (!name) return;
    setMsg(null);
    const start = u.rules.rollMode === "under" ? 30 : u.rules.skillDice.sides >= 20 ? 10 : 5;
    const tpl = u.template;
    const stats = Object.fromEntries(
      u.rules.stats.map((st) => [st.key, tpl.stats[st.key] ?? start]),
    );
    const sheet: Record<string, unknown> = {
      name,
      handle: name,
      ...newInfo,
      stats,
      skills: tpl.skills,
      weapons: [],
    };
    const { data, error } = await supabase
      .from("characters")
      .insert({ name, handle: name, owner_id: newOwner || null, sheet: sheet as Json })
      .select("id")
      .single();
    if (error) return setMsg(error.message);
    const hp = hpMaxFor(u, stats, sheet);
    const { error: e2 } = await supabase.from("character_state").insert({
      character_id: data.id,
      hp_current: hp,
      eddies: tpl.money,
      program_slots: tpl.slots,
      ammo: {} as Json,
      inventory: [] as Json,
    });
    if (e2) return setMsg(e2.message);
    try {
      for (const itemId of tpl.items) {
        await acquire({ data: { characterId: data.id, itemId, free: true } });
      }
    } catch (e) {
      return setMsg(e instanceof Error ? e.message : "Objets de départ non ajoutés.");
    }
    setNewName("");
    setNewOwner("");
    setNewInfo({});
    setMsg(`${name} créé.`);
    window.dispatchEvent(new Event("table:refresh"));
    if (open) return openSheet(data.id);
    load();
  }

  function openSheet(id: string) {
    identity.setActive(id);
    void navigate({ to: "/fiche" });
  }

  async function removeCharacter(r: Row) {
    const ok = await confirmAction({
      title: `Supprimer « ${r.handle || r.name} » ?`,
      message: "La fiche et son état seront supprimés. Action irréversible.",
    });
    if (!ok) return;
    const state = await supabase.from("character_state").delete().eq("character_id", r.id);
    if (state.error) return setCharsErr(state.error.message);
    const { error } = await supabase.from("characters").delete().eq("id", r.id);
    if (error) return setCharsErr(error.message);
    window.dispatchEvent(new Event("table:refresh"));
    await load();
  }

  async function setOwner(id: string, owner: string) {
    const { error } = await supabase
      .from("characters")
      .update({ owner_id: owner || null })
      .eq("id", id);
    if (error) return void setCharsErr(error.message);
    window.dispatchEvent(new Event("table:refresh"));
    load();
  }

  async function setRole(id: string, role: string) {
    const { error } = await supabase.rpc("set_user_role", { _user: id, _role: role });
    if (error) return void setPlayersErr(error.message);
    window.dispatchEvent(new Event("profile:changed"));
    load();
  }

  async function deletePlayer(p: Profile) {
    if (deleting || p.id === identity.userId) return;
    const name = p.username ?? p.id.slice(0, 8);
    if (
      !(await confirmAction({
        title: `Retirer « ${name} » de l’équipe ?`,
        message:
          "Son compte est conservé. Ses personnages restent dans l’équipe, sans joueur. Pour revenir, il lui faudra le code d’invitation.",
        confirmLabel: "Retirer de l’équipe",
      }))
    )
      return;
    setDeleting(p.id);
    const { error } = await supabase.rpc("remove_team_member", { _user: p.id });
    setDeleting(null);
    if (error) return void setPlayersErr(error.message);
    window.dispatchEvent(new Event("profile:changed"));
    window.dispatchEvent(new Event("table:refresh"));
    await load();
  }

  function exportJson(r: Row) {
    const s = r.character_state;
    const out = rowsToSheet(
      r.sheet as Record<string, unknown>,
      s && { ...s, inventory: (s.inventory as InventoryItem[]) ?? [] },
    );
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(out, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(r.handle || r.name).replace(/\W+/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // « denied » : routeGuard renvoie déjà vers la bonne page
  if (status !== "ok") return <main className="min-h-screen bg-background" />;

  const btn = "btn y";
  const tplSummary = [
    Object.keys(u.template.stats).length
      ? "caractéristiques réglées"
      : "caractéristiques automatiques",
    u.template.skills.length ? `${u.template.skills.length} compétences` : "",
    u.template.items.length ? `${u.template.items.length} objets` : "",
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <main className="">
      <div className="wrap">
        <div className="gm-tabs">
          {["table", "personnages", "scenes", "musique", "univers"].map((t) => (
            <Button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
              {t === "personnages"
                ? "Personnages"
                : t === "scenes"
                  ? "Scènes"
                  : t === "musique"
                    ? "Musique"
                    : t === "univers"
                      ? "Univers"
                      : "Table"}
            </Button>
          ))}
        </div>
        {tab === "univers" ? (
          <UniverseEditor />
        ) : tab === "scenes" ? (
          <SceneManager />
        ) : tab === "musique" ? (
          <MusicManager />
        ) : tab === "table" ? (
          <>
            <div className="gm-grid">
              <GmTable />
              <TeamSettings />
              <section className="panel cut">
                <div className="ph">
                  <h2>Raccourcis</h2>
                </div>
                <p className="note">Scène en cours</p>
                {table.activeScene && (
                  <Button className="scard live" onClick={() => setTab("scenes")}>
                    <div className="thumb">
                      {table.activeScene.url && <img src={table.activeScene.url} alt="" />}
                    </div>
                    <div className="cap">
                      <b>{table.activeScene.name}</b>
                      <small>{table.activeScene.subtitle}</small>
                    </div>
                  </Button>
                )}
                <p className="note">Musique</p>
                <Button className="qi on" onClick={() => setTab("musique")}>
                  <div className={`eq ${table.music.is_playing ? "" : "paused"}`}>
                    <b />
                    <b />
                    <b />
                    <b />
                  </div>
                  {table.music.queue?.[table.music.index ?? 0]?.title ?? "SILENCE RADIO"}
                  <small>{table.music.is_playing ? "LECTURE" : "PAUSE"}</small>
                </Button>
              </section>
            </div>
          </>
        ) : (
          <>
            <div className="ph">
              <div>
                <h1 className="">PERSONNAGES</h1>
              </div>
              <Button className="btn" onClick={() => setShowImport((v) => !v)}>
                Importer un fichier
              </Button>
            </div>
            {showImport && (
              <div className="panel cut">
                <input
                  type="file"
                  accept=".json,application/json"
                  className="note"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) setText(await f.text());
                  }}
                />
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="…ou colle le JSON ici"
                  rows={10}
                  className="field"
                />
                <Button className={btn} onClick={doImport} disabled={!text.trim()}>
                  Importer
                </Button>
              </div>
            )}
            <div className="chars-layout">
              <form
                className="panel cut char-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void createCharacter(true);
                }}
              >
                <div className="ph">
                  <h2>Nouveau personnage</h2>
                </div>
                <label>
                  Nom
                  <input
                    className="field"
                    placeholder="Nom du personnage"
                    aria-label="Nom du nouveau personnage"
                    maxLength={60}
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </label>
                <label>
                  Joueur
                  <select
                    className="field"
                    aria-label="Joueur du nouveau personnage"
                    value={newOwner}
                    onChange={(e) => setNewOwner(e.target.value)}
                  >
                    <option value="">Personne pour l’instant</option>
                    {players.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.username ?? p.id.slice(0, 8)}
                        {p.role === "gm" ? " (MJ)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                {u.rules.infoFields.map((field) => (
                  <label key={field.key}>
                    {field.label}
                    <input
                      className="field"
                      aria-label={`${field.label} du nouveau personnage`}
                      maxLength={60}
                      value={newInfo[field.key] ?? ""}
                      onChange={(e) => setNewInfo({ ...newInfo, [field.key]: e.target.value })}
                    />
                  </label>
                ))}
                <p className="note">
                  Départ : {tplSummary}. Tout se règle dans Univers → Fiche de départ.
                </p>
                <div className="char-actions">
                  <Button type="submit" className="btn y" disabled={!newName.trim()}>
                    Créer et ouvrir la fiche
                  </Button>
                  <Button
                    className="btn"
                    disabled={!newName.trim()}
                    onClick={() => void createCharacter(false)}
                  >
                    Créer
                  </Button>
                </div>
                {msg && <p className="note">{msg}</p>}
              </form>

              <section className="panel cut">
                <div className="ph">
                  <h2>Fiches de l’équipe</h2>
                  <span className="tag">{rows.length}</span>
                </div>
                <InlineError message={charsErr} onClear={() => setCharsErr(null)} />
                <ul className="char-list">
                  {rows.length === 0 && (
                    <li className="note">Aucun personnage : crée le premier à côté.</li>
                  )}
                  {rows.map((r) => (
                    <li key={r.id} className={r.owner_id ? "" : "unassigned"}>
                      <span className="char-name">
                        <b>{r.handle || r.name}</b>
                        <small>
                          {u.words.hp} {r.character_state?.hp_current ?? "?"}
                          {u.modules.money
                            ? ` · ${r.character_state?.eddies ?? "?"} ${u.words.moneySymbol}`
                            : ""}
                          {r.owner_id ? "" : " · à attribuer"}
                        </small>
                      </span>
                      <select
                        value={r.owner_id ?? ""}
                        aria-label={`Joueur de ${r.handle || r.name}`}
                        onChange={(e) => setOwner(r.id, e.target.value)}
                        className="field"
                      >
                        <option value="">Aucun joueur</option>
                        {players.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.username ?? p.id.slice(0, 8)}
                            {p.role === "gm" ? " (MJ)" : ""}
                          </option>
                        ))}
                      </select>
                      <span className="char-actions">
                        <Button
                          className="btn y"
                          aria-label={`Ouvrir la fiche de ${r.handle || r.name}`}
                          onClick={() => openSheet(r.id)}
                        >
                          Ouvrir
                        </Button>
                        <Button
                          className="icon-btn cut-s"
                          aria-label={`Exporter ${r.handle || r.name}`}
                          title="Exporter en fichier"
                          onClick={() => exportJson(r)}
                        >
                          <Download />
                        </Button>
                        <Button
                          className="icon-btn cut-s"
                          aria-label={`Supprimer ${r.handle || r.name}`}
                          title="Supprimer"
                          onClick={() => void removeCharacter(r)}
                        >
                          <Trash2 />
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            <h2 className="ph">JOUEURS</h2>
            <InlineError message={playersErr} onClear={() => setPlayersErr(null)} />
            <ul className="pcards">
              {players.map((p) => (
                <li key={p.id} className="pcard cut-s gm-record">
                  {profiles[p.id]?.avatar ? (
                    <img src={profiles[p.id]?.avatar} alt="" className="av" />
                  ) : (
                    <div className="av" />
                  )}
                  <div className="record-name">
                    <p className="" style={{ color: neonVar(profiles[p.id]?.color) }}>
                      {p.username ?? p.id.slice(0, 8)}
                    </p>
                    <p className="note">
                      {rows
                        .filter((r) => r.owner_id === p.id)
                        .map((r) => r.name)
                        .join(", ") || "Aucun personnage"}
                    </p>
                  </div>
                  <select
                    value={p.role}
                    disabled={deleting !== null}
                    onChange={(e) => setRole(p.id, e.target.value)}
                    className="field"
                  >
                    <option value="player">Joueur</option>
                    <option value="gm">MJ</option>
                  </select>
                  <Button
                    className="btn red"
                    aria-label={`Retirer ${p.username ?? p.id.slice(0, 8)} de l’équipe`}
                    title={
                      p.id === identity.userId
                        ? "Pour partir, utilise « Quitter » dans Équipes"
                        : "Retirer de l’équipe"
                    }
                    disabled={deleting !== null || p.id === identity.userId}
                    onClick={() => deletePlayer(p)}
                  >
                    <UserMinus size={16} />
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </main>
  );
}

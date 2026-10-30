import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/InlineError";
import { DieIcon } from "@/components/DieIcon";
import { orderedSkills, shortSkillName, topSkillIndexes } from "@/lib/skill-presentation";
import { useTable } from "@/lib/table-context";
import { HealthTrace } from "@/components/HealthTrace";
import { PlayerNotes } from "@/components/PlayerNotes";
import { ArsenalWeapon } from "@/components/ArsenalWeapon";
import { SlotPanel } from "@/components/SlotPanel";
import { readDeckSlots, readPrograms, type Program } from "@/lib/programs";
import { sheetCanRoll } from "@/lib/table";
import { createSaveQueue } from "@/lib/save-queue";
import { weaponAttack, weaponDamage } from "@/lib/weapon-rules";
import {
  Download,
  Pencil,
  Trash2,
  X,
  User,
  Crosshair,
  Backpack,
  Dices,
  Lock,
  LockOpen,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { charLabel, useIdentity } from "@/lib/active-character";
import { rowsToSheet, type AmmoEntry, type InventoryItem } from "@/lib/character-import";
import { rollDice } from "@/lib/dice.functions";
import {
  newSkillName,
  ammoNote,
  hpMax,
  hpStatus,
  num,
  readSkills,
  readStats,
  readWeapons,
  seedAmmo,
  skillBase,
  statKey,
  statLabel,
  str,
  writeSkills,
  writeStat,
  type Sheet,
  type SheetSkill,
  type SheetWeapon,
} from "@/lib/sheet";
import { useUniverse } from "@/lib/universe-context";
import {
  deathSaveFor,
  gaugeMax,
  skillDiceLabel,
  skillRoll,
  woundedFor,
  type GaugeDef,
  type Universe,
} from "@/lib/universe";
import { confirmAction } from "@/components/ConfirmDialog";

export const Route = createFileRoute("/fiche")({
  ssr: false,
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Ma fiche" },
      { name: "description", content: "La fiche de ton personnage actif." },
      { property: "og:title", content: "Ma fiche" },
      { property: "og:description", content: "La fiche de ton personnage actif." },
    ],
  }),
  component: FichePage,
});

type State = {
  hp_current: number;
  eddies: number;
  ammo: Record<string, AmmoEntry>;
  inventory: InventoryItem[];
  programs: Program[];
  program_slots: number;
};
type CharRow = {
  id: string;
  name: string;
  handle: string | null;
  owner_id: string | null;
  players_can_edit: boolean;
  sheet: Sheet;
};

function FichePage() {
  const id = useIdentity();
  if (!id.ready) return <main className="empty-state" />;
  if (!id.userId) return <Centered>Connecte-toi pour voir ta fiche.</Centered>;
  if (!id.active)
    return (
      <Centered>
        {id.isGm
          ? "Choisis un personnage dans le sélecteur en haut."
          : "Aucun personnage assigné, demande au MJ."}
      </Centered>
    );
  return <Sheet key={id.active.id} charId={id.active.id} isGm={id.isGm} userId={id.userId} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="empty-state">{children}</main>;
}

function Sheet({ charId, isGm, userId }: { charId: string; isGm: boolean; userId: string }) {
  const [ch, setCh] = useState<CharRow | null>(null);
  const [st, setSt] = useState<State | null>(null);
  const stateRef = useRef<State | null>(null);
  const saveQueue = useRef(createSaveQueue());
  const stateRevision = useRef(0);
  const characterRef = useRef<CharRow | null>(null);
  const sheetQueue = useRef(createSaveQueue());
  const sheetRevision = useRef(0);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);
  // Texte brut tapé dans les titres de compétence : la sauvegarde retire les
  // espaces de début/fin, ce qui effacerait un espace tapé entre deux mots.
  const [titleDraft, setTitleDraft] = useState<Record<string, string>>({});
  const [tab, setTab] = useState("perso");
  const [newItem, setNewItem] = useState("");
  const [damage, setDamage] = useState(0);
  const [amount, setAmount] = useState(0);
  const roll = useServerFn(rollDice);
  const table = useTable();
  const { universe: u } = useUniverse();
  const w$ = u.words;

  const load = useCallback(async () => {
    // Realtime can arrive before our write queue settles. Read afterwards so
    // the event is not discarded and optimistic counters cannot be overwritten.
    await Promise.all([saveQueue.current.flush(), sheetQueue.current.flush()]);
    const revision = stateRevision.current;
    const fixedRevision = sheetRevision.current;
    const [{ data: c, error: e1 }, { data: s, error: e2 }] = await Promise.all([
      supabase
        .from("characters")
        .select("id,name,handle,owner_id,players_can_edit,sheet")
        .eq("id", charId)
        .maybeSingle(),
      supabase
        .from("character_state")
        // « * » : la fiche s'affiche même si cyberdeck.sql n'a pas encore été lancé
        .select("*")
        .eq("character_id", charId)
        .maybeSingle(),
    ]);
    if (e1 || e2) return void setErr(`Chargement impossible : ${(e1 ?? e2)?.message}`);
    if (c && !sheetQueue.current.pending && fixedRevision === sheetRevision.current) {
      const next = {
        id: c.id,
        name: c.name,
        handle: c.handle,
        owner_id: c.owner_id,
        players_can_edit: c.players_can_edit ?? false,
        sheet: (c.sheet as Sheet) ?? {},
      };
      characterRef.current = next;
      setCh(next);
    }
    if (s && !saveQueue.current.pending && revision === stateRevision.current) {
      const next = {
        hp_current: s.hp_current,
        eddies: s.eddies,
        ammo: (s.ammo as Record<string, AmmoEntry>) ?? {},
        inventory: (s.inventory as InventoryItem[]) ?? [],
        programs: readPrograms((s as Record<string, unknown>)["programs"]),
        program_slots: readDeckSlots((s as Record<string, unknown>)["program_slots"]),
      };
      stateRef.current = next;
      setSt(next);
    }
  }, [charId]);

  useEffect(() => {
    load();
    const chn = supabase
      .channel(`fiche-${charId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "character_state",
          filter: `character_id=eq.${charId}`,
        },
        () => void load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "characters", filter: `id=eq.${charId}` },
        () => void load(),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void load();
      });
    return () => void supabase.removeChannel(chn);
  }, [charId, load]);

  // Titre de l'onglet : le nom du personnage affiché (ex. « LYRA · Les Royaumes »)
  useEffect(() => {
    const name = ch ? charLabel(ch) : null;
    if (name) document.title = `${name} · ${w$.tableName}`;
    return () => {
      document.title = w$.tableName;
    };
  }, [ch, w$.tableName]);
  const sheet = useMemo(() => ch?.sheet ?? {}, [ch]);
  const stats = useMemo(() => readStats(sheet, u), [sheet, u]);
  const skills = useMemo(() => readSkills(sheet), [sheet]);
  const weapons = useMemo(() => readWeapons(sheet), [sheet]);
  const max = hpMax(stats, sheet, u);
  const wounded = woundedFor(u, max, stats, sheet);
  const deathSave = deathSaveFor(u, stats, sheet);

  // Crée automatiquement les entrées de munitions manquantes (clé = position de l'arme).
  // (seulement si l'utilisateur a le droit d'écrire : sinon la base refuserait).
  const mayWrite = isGm || (!!ch && ch.owner_id === userId && ch.players_can_edit);
  // PV au-dessus du maximum (ex. le MJ a baissé CORPS ou VOL) : ramenés au maximum
  useEffect(() => {
    if (!st || !ch || max <= 0 || st.hp_current <= max || !mayWrite) return;
    void saveState({ hp_current: max });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st?.hp_current, max, mayWrite]);
  useEffect(() => {
    if (!st || !weapons.length || !mayWrite || !u.modules.ammo) return;
    const r = seedAmmo(weapons, st.ammo);
    if (r.changed) saveState({ ammo: r.ammo });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st === null, weapons, mayWrite, u.modules.ammo]);

  // MJ : autoriser / bloquer les modifications du joueur sur cette fiche.
  async function setPlayersCanEdit(value: boolean) {
    const previous = characterRef.current;
    if (!previous || !isGm) return;
    const next = { ...previous, players_can_edit: value };
    characterRef.current = next;
    setCh(next);
    const { error, data } = await supabase
      .from("characters")
      .update({ players_can_edit: value })
      .eq("id", charId)
      .select("id");
    if (error || !data?.length) {
      characterRef.current = previous;
      setCh(previous);
      setErr(`Changement impossible : ${error?.message ?? "accès refusé"}`);
    }
  }

  async function saveState(patch: Partial<State>) {
    const prev = stateRef.current;
    if (!prev) return;
    const next = { ...prev, ...patch };
    const revision = ++stateRevision.current;
    stateRef.current = next;
    setSt(next);
    try {
      await saveQueue.current.enqueue(async () => {
        const { error, data } = await supabase
          .from("character_state")
          .update(
            patch as unknown as {
              ammo?: Json;
              inventory?: Json;
              hp_current?: number;
              eddies?: number;
              programs?: Json;
              program_slots?: number;
            },
          )
          .eq("character_id", charId)
          .select("character_id");
        if (error || !data?.length) throw new Error(error?.message ?? "accès refusé");
      });
    } catch (error) {
      if (revision === stateRevision.current) {
        stateRef.current = prev;
        setSt(prev);
      }
      setErr(`Sauvegarde échouée : ${error instanceof Error ? error.message : "erreur réseau"}`);
    }
  }

  async function saveSheet(patch: Partial<Sheet>) {
    const previous = characterRef.current;
    if (!previous || !isGm) return false;
    const next = { ...previous, sheet: { ...previous.sheet, ...patch } };
    const revision = ++sheetRevision.current;
    characterRef.current = next;
    setCh(next);
    setSaveStatus("Enregistrement…");
    try {
      await sheetQueue.current.enqueue(async () => {
        const { error, data } = await supabase
          .from("characters")
          .update({ sheet: next.sheet as Json })
          .eq("id", charId)
          .select("id");
        if (error || !data?.length) throw new Error(error?.message ?? "accès refusé");
      });
      if (revision === sheetRevision.current) setSaveStatus("Modifications enregistrées");
      return true;
    } catch (error) {
      if (revision === sheetRevision.current) {
        characterRef.current = previous;
        setCh(previous);
      }
      setSaveStatus("Échec de l’enregistrement");
      setErr(`Sauvegarde échouée : ${error instanceof Error ? error.message : "erreur réseau"}`);
      return false;
    }
  }

  async function finishEditing() {
    setSaving(true);
    try {
      const saved = await saveSheet({});
      await saveQueue.current.flush();
      if (saved) {
        setEdit(false);
        setTitleDraft({});
      }
    } finally {
      setSaving(false);
    }
  }

  async function quickRoll(
    count: number,
    sides: number,
    mod: number,
    label: string,
    target: number | null = null,
  ) {
    window.dispatchEvent(
      new CustomEvent("roll:start", {
        detail: {
          dice_count: count,
          dice_sides: sides,
          modifier: mod,
          label,
          display_name: charLabel(ch),
          is_secret: false,
          target,
        },
      }),
    );
    try {
      const row = await roll({
        data: {
          dice_count: count,
          dice_sides: sides,
          modifier: mod,
          label,
          is_secret: false,
          character_id: charId,
          target,
        },
      });
      window.dispatchEvent(new CustomEvent("roll:new", { detail: row }));
    } catch (e) {
      window.dispatchEvent(new Event("roll:failed"));
      setErr(`Jet impossible : ${e instanceof Error ? e.message : "erreur"}`);
    }
  }

  function exportJson() {
    if (!ch || !st) return;
    const out = rowsToSheet(ch.sheet, st);
    const raw = Array.isArray(ch.sheet["weapons"])
      ? (ch.sheet["weapons"] as Record<string, unknown>[])
      : [];
    out["weapons"] = raw.map((w, i) => {
      const a = st.ammo[String(i)];
      return a ? { ...w, note: ammoNote(a, weapons[i]?.capacity ?? 0) } : w;
    });
    if (st.program_slots > 0 || st.programs.length)
      out["slots"] = { capacity: st.program_slots, items: st.programs };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(out, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(ch.handle || ch.name).replace(/\W+/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!ch || !st)
    return (
      <Centered>
        {err ? (
          <span className="note error" role="alert">
            {err}
          </span>
        ) : (
          "Chargement…"
        )}
      </Centered>
    );

  // Le joueur ne modifie sa fiche que si le MJ l'a autorisé (vérifié aussi par la base, RLS).
  const canEdit = mayWrite;
  const lockedForPlayer = !isGm && ch.owner_id === userId && !ch.players_can_edit;
  // Jets depuis la fiche : uniquement si le personnage appartient à l'utilisateur connecté.
  const canRoll = sheetCanRoll(ch.owner_id, userId, isGm);
  const status = hpStatus(st.hp_current, wounded);
  const updateAmmo = (index: number, update: (current: AmmoEntry) => AmmoEntry) => {
    const current = stateRef.current?.ammo ?? st.ammo;
    const weapon = weapons[index];
    if (!weapon) return;
    const entry = current[String(index)] ?? { mag: weapon.capacity, spare: 2, loose: 0 };
    void saveState({ ammo: { ...current, [String(index)]: update(entry) } });
  };
  const setInv = (inv: InventoryItem[]) => saveState({ inventory: inv });

  const sorted = orderedSkills(skills, u.rules.skillOrder);
  const top = topSkillIndexes(skills, stats, u);
  const topStats = topStatKeys(stats);
  const firstStat = u.rules.stats[0]?.key ?? "";
  const member = table.party.find((p) => p.character_id === charId);
  // Particularités (cyberware, dons, talents…) : une ligne = une puce. Clé JSON « cyberware » conservée.
  const features = u.modules.features && (
    <section className="panel cut">
      <div className="ph">
        <h2>{w$.features}</h2>
      </div>
      {edit ? (
        <textarea
          aria-label={w$.features}
          placeholder="Une ligne par élément"
          value={str(sheet, "cyberware")}
          onChange={(e) => saveSheet({ cyberware: e.target.value })}
          rows={5}
        />
      ) : (
        <div className="chips">
          {str(sheet, "cyberware")
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean)
            .map((l, i) => (
              <span className="chip cut-s" key={i}>
                {l}
              </span>
            ))}
        </div>
      )}
    </section>
  );
  return (
    <main className={`${isGm ? "gm-consultation" : ""} ${lockedForPlayer ? "sheet-locked" : ""}`}>
      <div className="wrap">
        {isGm && (
          <div className="banner cut-s">
            Consultation MJ — dés désactivés
            <Button
              variant="prototype"
              className={`btn lock-toggle ${ch.players_can_edit ? "open" : ""}`}
              aria-pressed={ch.players_can_edit}
              onClick={() => void setPlayersCanEdit(!ch.players_can_edit)}
            >
              {ch.players_can_edit ? (
                <>
                  <LockOpen size={16} />
                  Joueur : modifications autorisées
                </>
              ) : (
                <>
                  <Lock size={16} />
                  Joueur : fiche verrouillée
                </>
              )}
            </Button>
          </div>
        )}
        {lockedForPlayer && (
          <div className="banner cut-s lock-banner">
            <Lock size={16} />
            Fiche verrouillée par le MJ — tu peux toujours lancer les dés.
          </div>
        )}
        <div className="row-btns edit-controls">
          {isGm && (
            <Button
              variant="prototype"
              className="btn y"
              disabled={saving}
              onClick={() => {
                if (edit) void finishEditing();
                else {
                  setTitleDraft({});
                  setEdit(true);
                }
              }}
            >
              {saving ? "Enregistrement…" : edit ? "Enregistrer" : "Mode édition"}
            </Button>
          )}
          <Button
            variant="prototype"
            className="btn"
            onClick={exportJson}
            title="Exporter JSON"
            aria-label="Exporter JSON"
          >
            <Download size={18} />
          </Button>
          {saveStatus && (
            <span className="note" role="status">
              {saveStatus}
            </span>
          )}
        </div>
        <InlineError message={err} onClear={() => setErr(null)} />
        <div className="player-grid">
          <div className={`tabview ${tab === "perso" ? "on" : ""}`} data-tab="perso">
            <section className="panel cut">
              <div className="ident">
                <div className={`av neon-${member?.color ?? "cyan"}`}>
                  {member?.avatar ? (
                    <img src={member.avatar} alt="" />
                  ) : (
                    (charLabel(ch) ?? "").slice(0, 2)
                  )}
                  <i />
                </div>
                <div>
                  <h1>{charLabel(ch)}</h1>
                  <div className="meta">
                    {u.rules.infoFields.map((f) => (
                      <BannerField
                        key={f.key}
                        label={f.label.toUpperCase()}
                        value={str(sheet, f.key) || "—"}
                        edit={edit}
                        onSave={(v) => saveSheet({ [f.key]: v })}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </section>
            <section className={`panel cut hp-${status}`} id="hpPanel">
              <div className="ph">
                <h2>{w$.vitals}</h2>
              </div>
              <div className="hp-top">
                <div className="hp-num">
                  {Math.min(st.hp_current, max)}
                  <small> / {max}</small>
                </div>
                <span
                  className={`status ${status === "ok" ? "ok" : status === "blesse" ? "warn" : "bad"}`}
                >
                  {status === "ok" ? w$.hpOk : status === "blesse" ? w$.hpHurt : w$.hpDying}
                </span>
              </div>
              {u.modules.ecg && <HealthTrace hp={Math.min(st.hp_current, max)} max={max} />}
              <div className="segs">
                {Array.from({ length: 15 }, (_, i) => (
                  <i
                    key={i}
                    className={i < Math.ceil((Math.max(0, st.hp_current) / max) * 15) ? "" : "off"}
                  />
                ))}
              </div>
              {(wounded !== null || deathSave !== null) && (
                <div className="hp-sub">
                  {[
                    wounded !== null ? `${w$.wounded} ≤ ${wounded}` : null,
                    deathSave !== null && u.rules.deathSave
                      ? `${u.rules.deathSave.label} : ${deathSave}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              )}
              {edit && !u.rules.hpMax.trim() && (
                <label className="hp-max-edit">
                  {w$.hp} max
                  <input
                    className="field"
                    type="number"
                    min={0}
                    value={num(sheet, "hpMax")}
                    onChange={(e) => saveSheet({ hpMax: Math.max(0, Number(e.target.value) || 0) })}
                  />
                </label>
              )}
              <div className="row-btns">
                {[-5, -1, 1, 5].map((delta) => (
                  <Button
                    variant="prototype"
                    className={`btn ${delta < 0 ? "red" : ""}`}
                    key={delta}
                    disabled={!canEdit}
                    onClick={() =>
                      saveState({
                        hp_current: Math.min(
                          max,
                          Math.max(0, Math.min(st.hp_current, max) + delta),
                        ),
                      })
                    }
                  >
                    {delta > 0 ? `+${delta}` : delta}
                  </Button>
                ))}
                <input
                  className="field"
                  aria-label={w$.damage}
                  disabled={!canEdit}
                  type="number"
                  min={0}
                  placeholder={w$.damage}
                  value={damage || ""}
                  onChange={(e) => setDamage(Math.max(0, Number(e.target.value)))}
                />
                <Button
                  variant="prototype"
                  className="btn red"
                  disabled={!canEdit}
                  onClick={() =>
                    saveState({ hp_current: Math.max(0, Math.min(st.hp_current, max) - damage) })
                  }
                >
                  Encaisser
                </Button>
                <Button
                  variant="prototype"
                  className="btn"
                  disabled={!canEdit}
                  onClick={() => saveState({ hp_current: max })}
                >
                  Max
                </Button>
              </div>
              {u.rules.defenses.length + u.rules.gauges.length > 0 && (
                <div className="minis">
                  {u.rules.defenses.map((d) => (
                    <Vital
                      key={d.key}
                      label={d.label}
                      value={str(sheet, d.key) || "—"}
                      edit={edit}
                      onSave={(v) => saveSheet({ [d.key]: v })}
                    />
                  ))}
                  {u.rules.gauges.map((g) => (
                    <Gauge
                      key={g.key}
                      gauge={g}
                      current={num(sheet, g.key)}
                      max={gaugeMax(u, g, stats, sheet)}
                      edit={edit}
                      onSave={(patch) => saveSheet(patch)}
                    />
                  ))}
                </div>
              )}
            </section>
            <section className="panel cut">
              <div className="ph">
                <h2>{w$.stats}</h2>
              </div>
              <div
                className="stats"
                // 6 caracs → 3 colonnes, 8 → 4, 10 → 5 : jamais de case orpheline
                style={{ gridTemplateColumns: `repeat(${statColumns(u.rules.stats.length)}, 1fr)` }}
              >
                {u.rules.stats.map((s) => (
                  <StatTile
                    key={s.key}
                    label={s.label}
                    value={stats[s.key] ?? 0}
                    hi={topStats.has(s.key)}
                    edit={edit}
                    onSave={(v) =>
                      saveSheet({
                        stats: writeStat(characterRef.current?.sheet ?? sheet, s.key, v, u),
                      })
                    }
                  />
                ))}
              </div>
            </section>
            {features}
            {(isGm || ch.owner_id === userId) && (
              <PlayerNotes charId={charId} canWrite={!isGm && ch.owner_id === userId} />
            )}
          </div>
          <div
            className={`tabview ${tab === "jets" ? "on" : ""} ${canRoll ? "" : "locked"}`}
            data-tab="skills"
          >
            <section className="panel cut">
              <div className="ph">
                <h2>{w$.skills}</h2>
                <span className="tag">{canRoll ? "TOUCHER = LANCER" : "LECTURE SEULE"}</span>
              </div>
              {canRoll && (
                <div className="hint">
                  <DieIcon className="d10" sides={u.rules.skillDice.sides} />
                  Touche une compétence : <b>{skillDiceLabel(u)}</b>
                </div>
              )}
              <div className="skills">
                {sorted.map(({ skill: sk, index: i }) => {
                  const base = skillBase(sk, stats, u);
                  const key = statKey(sk.stat, u);
                  const title = sk.title || shortSkillName(sk.name);
                  const r = skillRoll(u, base);
                  return (
                    <div key={i}>
                      <Button
                        variant="prototype"
                        className={`skill ${top.has(i) ? "top" : ""}`}
                        aria-disabled={!canRoll}
                        tabIndex={canRoll ? 0 : -1}
                        onClick={
                          canRoll
                            ? () => quickRoll(r.count, r.sides, r.mod, title, r.target)
                            : undefined
                        }
                      >
                        <span className="nm">
                          <b>{title}</b>
                          <small>
                            {key ? statLabel(key, u) : sk.stat || "—"} {key ? (stats[key] ?? 0) : 0}{" "}
                            · niv. {sk.level}
                          </small>
                        </span>
                        <span className="rollchip cut-s">
                          {canRoll && <DieIcon sides={u.rules.skillDice.sides} />}
                          <span>
                            {u.rules.skillDice.count}d{u.rules.skillDice.sides}
                            {u.rules.rollMode === "under" ? " ≤ " : base < 0 ? "" : "+"}
                          </span>
                          <b>{base}</b>
                        </span>
                      </Button>
                      {edit && (
                        <div className="skill-editor">
                          <input
                            className="field skill-title"
                            aria-label={`Titre de ${sk.name}`}
                            placeholder={shortSkillName(sk.name)}
                            maxLength={80}
                            value={titleDraft[sk.name] ?? sk.title ?? ""}
                            onChange={(e) => {
                              const raw = e.target.value;
                              setTitleDraft((d) => ({ ...d, [sk.name]: raw }));
                              saveSheet({
                                skills: writeSkills(
                                  sheet,
                                  skills.map((x, j) => (j === i ? { ...x, title: raw } : x)),
                                ),
                              });
                            }}
                            onBlur={() =>
                              setTitleDraft((d) => {
                                if (!(sk.name in d)) return d;
                                const next = { ...d };
                                delete next[sk.name];
                                return next;
                              })
                            }
                          />
                          <select
                            className="field skill-stat"
                            aria-label={`Caractéristique de ${sk.name}`}
                            title="Caractéristique utilisée par cette compétence"
                            value={key ?? ""}
                            onChange={(e) =>
                              saveSheet({
                                skills: writeSkills(
                                  sheet,
                                  skills.map((x, j) =>
                                    j === i ? { ...x, stat: e.target.value } : x,
                                  ),
                                ),
                              })
                            }
                          >
                            {!key && <option value="">— choisir —</option>}
                            {u.rules.stats.map((s) => (
                              <option key={s.key} value={s.key}>
                                {s.label} ({stats[s.key] ?? 0})
                              </option>
                            ))}
                          </select>
                          <input
                            className="field"
                            aria-label={`Niveau de ${sk.name}`}
                            type="number"
                            value={sk.level}
                            onChange={(e) =>
                              saveSheet({
                                skills: writeSkills(
                                  sheet,
                                  skills.map((x, j) =>
                                    j === i ? { ...x, level: Number(e.target.value) || 0 } : x,
                                  ),
                                ),
                              })
                            }
                          />
                          <Button
                            variant="prototype"
                            className="btn red"
                            aria-label={`Supprimer ${sk.name}`}
                            onClick={async () => {
                              if (
                                !(await confirmAction({
                                  title: `Supprimer la compétence « ${sk.name} » ?`,
                                }))
                              )
                                return;
                              const fresh = characterRef.current?.sheet ?? sheet;
                              const list = readSkills(fresh);
                              const k =
                                list[i]?.name === sk.name
                                  ? i
                                  : list.findIndex((x) => x.name === sk.name);
                              if (k < 0) return;
                              void saveSheet({
                                skills: writeSkills(
                                  fresh,
                                  list.filter((_, j) => j !== k),
                                ),
                              });
                            }}
                          >
                            <Trash2 size={16} />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {edit && (
                <Button
                  variant="prototype"
                  className="btn y"
                  onClick={() =>
                    saveSheet({
                      skills: writeSkills(sheet, [
                        ...skills,
                        { name: newSkillName(skills), stat: firstStat, level: 1 },
                      ]),
                    })
                  }
                >
                  + Ajouter
                </Button>
              )}
            </section>
          </div>
          <div className={`tabview ${tab === "combat" ? "on" : ""}`} data-tab="combat">
            <section className="panel cut">
              <div className="ph">
                <h2>{w$.weapons}</h2>
              </div>
              {!weapons.length && !edit && <p className="note">Aucune arme.</p>}
              {weapons.map((w, i) => (
                <ArsenalWeapon
                  key={i}
                  weapon={w}
                  ammo={st.ammo[String(i)] ?? { mag: w.capacity, spare: 2, loose: 0 }}
                  attack={weaponAttack(w, skills, stats, u)}
                  autoAttack={weaponAttack(w, skills, stats, u, true)}
                  damage={weaponDamage(w, stats, u)}
                  canEdit={canEdit}
                  canRoll={canRoll}
                  onAmmo={(update) => updateAmmo(i, update)}
                  onRoll={quickRoll}
                >
                  {edit && (
                    <div className="weapon-edit">
                      {weaponFields(u).map(([key, label]) => (
                        <label key={key}>
                          {label}
                          <input
                            className="field"
                            value={String(w[key as keyof SheetWeapon])}
                            onChange={(e) =>
                              saveSheet({
                                weapons: weapons.map((weapon, j) =>
                                  weaponToJson(
                                    j === i
                                      ? {
                                          ...weapon,
                                          [key]:
                                            key === "capacity" || key === "rof"
                                              ? Number(e.target.value)
                                              : e.target.value,
                                          ...(key === "capacity"
                                            ? { ammoRaw: e.target.value }
                                            : {}),
                                        }
                                      : weapon,
                                  ),
                                ),
                              })
                            }
                          />
                        </label>
                      ))}
                      <Button
                        variant="prototype"
                        className="btn red"
                        onClick={async () => {
                          if (
                            !(await confirmAction({
                              title: `Supprimer l'arme « ${w.name} » ?`,
                              message: "Ses munitions suivies seront aussi perdues.",
                            }))
                          )
                            return;
                          const list = readWeapons(characterRef.current?.sheet ?? sheet);
                          const k =
                            list[i]?.name === w.name ? i : list.findIndex((x) => x.name === w.name);
                          if (k < 0) return;
                          void saveSheet({
                            weapons: list.filter((_, j) => j !== k).map(weaponToJson),
                          });
                        }}
                      >
                        Supprimer
                      </Button>
                    </div>
                  )}
                </ArsenalWeapon>
              ))}
              {edit && (
                <Button
                  variant="prototype"
                  className="btn y"
                  onClick={() =>
                    saveSheet({
                      weapons: [
                        ...weapons.map(weaponToJson),
                        { name: "Nouvelle arme", dmg: "1d6", ammo: "", rof: 1, skill: "" },
                      ],
                    })
                  }
                >
                  + Ajouter
                </Button>
              )}
            </section>
            {u.modules.slots && (
              <SlotPanel
                programs={st.programs}
                capacity={st.program_slots}
                isGm={isGm}
                configure={isGm && edit}
                // MJ : modifiable seulement en Mode édition (comme l'Arsenal)
                canEdit={isGm ? edit : canEdit}
                canRoll={canRoll}
                onPrograms={(programs) => void saveState({ programs })}
                onCapacity={(program_slots, programs) =>
                  void saveState({ program_slots, programs })
                }
                onRoll={quickRoll}
              />
            )}
          </div>
          <div className={`tabview ${tab === "sac" ? "on" : ""}`} data-tab="sac">
            {u.modules.money && (
              <section className="panel cut">
                <div className="ph">
                  <h2>{w$.money}</h2>
                </div>
                <div className="eddies">
                  <b>{st.eddies}</b>
                  <small>{w$.moneySymbol}</small>
                </div>
                <div className="row-btns">
                  {[-100, -10, 10, 100].map((delta) => (
                    <Button
                      variant="prototype"
                      className="btn"
                      key={delta}
                      disabled={!canEdit}
                      onClick={() => saveState({ eddies: Math.max(0, st.eddies + delta) })}
                    >
                      {delta > 0 ? `+${delta}` : delta}
                    </Button>
                  ))}
                </div>
                <div className="row-btns">
                  <input
                    className="field"
                    aria-label="Montant"
                    disabled={!canEdit}
                    type="number"
                    min={0}
                    placeholder="Montant"
                    value={amount || ""}
                    onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
                  />
                  <Button
                    variant="prototype"
                    className="btn y"
                    disabled={!canEdit}
                    onClick={() => saveState({ eddies: st.eddies + amount })}
                  >
                    Gagner
                  </Button>
                  <Button
                    variant="prototype"
                    className="btn red"
                    disabled={!canEdit}
                    onClick={() => saveState({ eddies: Math.max(0, st.eddies - amount) })}
                  >
                    Dépenser
                  </Button>
                </div>
              </section>
            )}
            <section className="panel cut">
              <div className="ph">
                <h2>{w$.inventory}</h2>
              </div>
              <div className="inv">
                {st.inventory.map((it, i) => (
                  <div className="item cut-s" key={i}>
                    <span className="n">{it.name}</span>
                    <Button
                      variant="prototype"
                      disabled={!canEdit}
                      onClick={() =>
                        setInv(
                          st.inventory.map((x, j) =>
                            j === i ? { ...x, qty: Math.max(1, x.qty - 1) } : x,
                          ),
                        )
                      }
                    >
                      −
                    </Button>
                    <span className="q">{it.qty}</span>
                    <Button
                      variant="prototype"
                      disabled={!canEdit}
                      onClick={() =>
                        setInv(st.inventory.map((x, j) => (j === i ? { ...x, qty: x.qty + 1 } : x)))
                      }
                    >
                      +
                    </Button>
                    <Button
                      variant="prototype"
                      className="x"
                      aria-label={`Supprimer ${it.name}`}
                      disabled={!canEdit}
                      onClick={async () => {
                        if (
                          !(await confirmAction({
                            title: `Retirer « ${it.name} » de l'inventaire ?`,
                          }))
                        )
                          return;
                        const list = stateRef.current?.inventory ?? [];
                        const k =
                          list[i]?.name === it.name ? i : list.findIndex((x) => x.name === it.name);
                        if (k >= 0) void setInv(list.filter((_, j) => j !== k));
                      }}
                    >
                      ✕
                    </Button>
                  </div>
                ))}
              </div>
              {canEdit && (
                <form
                  className="add"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const name = newItem.trim();
                    if (!name) return;
                    setInv([...st.inventory, { name, qty: 1 }]);
                    setNewItem("");
                  }}
                >
                  <input
                    className="field"
                    value={newItem}
                    onChange={(e) => setNewItem(e.target.value)}
                    placeholder="Nouvel objet"
                  />
                  <Button variant="prototype" className="btn y">
                    Ajouter
                  </Button>
                </form>
              )}
            </section>
          </div>
        </div>
      </div>
      {!isGm && (
        <nav className="dock">
          {[
            { id: "perso", label: "Perso", icon: User },
            { id: "jets", label: "Jets", icon: Dices },
            { id: "dice", label: "", icon: Dices },
            { id: "combat", label: "Combat", icon: Crosshair },
            { id: "sac", label: "Sac", icon: Backpack },
          ].map((t) =>
            t.id === "dice" ? (
              <div className="fab-slot" key={t.id}>
                <Button
                  variant="prototype"
                  className="fab"
                  aria-label="Ouvrir les dés"
                  onClick={() => window.dispatchEvent(new Event("dice:open"))}
                >
                  <DieIcon sides={20} />
                </Button>
              </div>
            ) : (
              <Button
                variant="prototype"
                key={t.id}
                className={tab === t.id ? "on" : ""}
                onClick={() => setTab(t.id)}
              >
                {t.id === "jets" ? <DieIcon /> : <t.icon />}
                {t.label}
              </Button>
            ),
          )}
        </nav>
      )}
    </main>
  );
}

function weaponToJson(w: SheetWeapon) {
  return { name: w.name, dmg: w.dmg, ammo: w.ammoRaw, rof: w.rof, skill: w.skill, note: w.note };
}

/** Champs modifiables d'une arme (le nombre de munitions seulement si le module est actif) */
function weaponFields(u: Universe): [keyof SheetWeapon, string][] {
  return [
    ["name", "Nom"],
    ["dmg", u.words.damage],
    ["skill", "Compétence"],
    ...(u.modules.ammo ? ([["capacity", "Munitions"]] as [keyof SheetWeapon, string][]) : []),
    ["rof", u.words.rof],
  ];
}

function statColumns(n: number) {
  if (n <= 4) return Math.max(1, n);
  for (const c of [5, 4, 3]) if (n % c === 0) return c;
  return n <= 6 ? 3 : n <= 8 ? 4 : 5;
}

/** Les trois meilleures caractéristiques, mises en valeur (quelle que soit l'échelle du jeu) */
function topStatKeys(stats: Record<string, number>) {
  const values = Object.values(stats).filter((v) => v > 0);
  if (values.length < 4) return new Set<string>();
  const cut = [...values].sort((a, b) => b - a)[2]!;
  return new Set(
    Object.entries(stats)
      .filter(([, v]) => v > 0 && v >= cut)
      .map(([k]) => k),
  );
}

function BannerField({
  label,
  value,
  edit,
  onSave,
}: {
  label: string;
  value: string;
  edit: boolean;
  onSave: (v: string) => void;
}) {
  return (
    <span className="pill">
      {label}{" "}
      {edit ? (
        <input
          className="field"
          value={value === "—" ? "" : value}
          onChange={(e) => onSave(e.target.value)}
        />
      ) : (
        <b>{value}</b>
      )}
    </span>
  );
}
function Vital({
  label,
  value,
  edit,
  onSave,
  editValue,
}: {
  label: string;
  value: string;
  edit: boolean;
  onSave: (v: string) => void;
  editValue?: string;
}) {
  const [current, max] = value.split(" / ");
  return (
    <div className="mini">
      <small>{label}</small>
      {edit ? (
        <input
          className="field"
          value={editValue ?? value}
          onChange={(e) => onSave(e.target.value)}
        />
      ) : (
        <b>
          {current}
          {max && <em> / {max}</em>}
        </b>
      )}
      {max && (
        <div className="bar">
          <progress value={Number(current) || 0} max={Number(max) || 1} />
        </div>
      )}
    </div>
  );
}
function Gauge({
  gauge: g,
  current,
  max,
  edit,
  onSave,
}: {
  gauge: GaugeDef;
  current: number;
  max: number;
  edit: boolean;
  onSave: (patch: Record<string, number>) => void;
}) {
  const manual = !g.max.trim();
  return (
    <div className={`mini gauge g-${g.color}`}>
      <small>{g.label}</small>
      {edit ? (
        <span className="gauge-edit">
          <input
            className="field"
            type="number"
            aria-label={`${g.label} actuel`}
            value={current}
            onChange={(e) => onSave({ [g.key]: Number(e.target.value) || 0 })}
          />
          {manual && (
            <>
              /
              <input
                className="field"
                type="number"
                min={0}
                aria-label={`${g.label} maximum`}
                value={max}
                onChange={(e) =>
                  onSave({ [`${g.key}Max`]: Math.max(0, Number(e.target.value) || 0) })
                }
              />
            </>
          )}
        </span>
      ) : (
        <b>
          {current}
          <em> / {max}</em>
        </b>
      )}
      <div className="bar">
        <progress value={Math.max(0, current)} max={Math.max(1, max)} />
      </div>
    </div>
  );
}
function StatTile({
  label,
  value,
  hi,
  edit,
  onSave,
}: {
  label: string;
  value: number;
  hi: boolean;
  edit: boolean;
  onSave: (v: number) => void;
}) {
  return (
    <div className={`stat ${hi ? "hi" : ""}`}>
      <small>{label}</small>
      {edit ? (
        <input
          className="field"
          type="number"
          value={value}
          onChange={(e) => onSave(Number(e.target.value) || 0)}
        />
      ) : (
        <b>{value}</b>
      )}
    </div>
  );
}

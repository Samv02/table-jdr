import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  CircleAlert,
  Plus,
  Trash2,
  ArrowRight,
  Lock,
  LockOpen,
  RotateCw,
  PackagePlus,
  Crosshair,
  Swords,
  SlidersHorizontal,
  GripVertical,
  LayoutGrid,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { InlineError } from "@/components/InlineError";
import type { Json } from "@/integrations/supabase/types";
import { useIdentity } from "@/lib/active-character";
import { useTable } from "@/lib/table-context";
import { createSaveQueue } from "@/lib/save-queue";
import { dashboardAlerts, type DashboardRow, type DashboardState } from "@/lib/dashboard";
import {
  hpMax,
  hpStatus,
  num,
  readSkills,
  readStats,
  readWeapons,
  skillBase,
  str,
  reload,
  shoot,
  packMagazine,
} from "@/lib/sheet";
import { orderedSkills, shortSkillName, topSkillIndexes } from "@/lib/skill-presentation";
import { weaponAttack, weaponDamage } from "@/lib/weapon-rules";
import type { AmmoEntry } from "@/lib/character-import";
import { Button } from "./ui/button";
import { confirmAction } from "@/components/ConfirmDialog";
import { useUniverse } from "@/lib/universe-context";
import { gaugeMax, woundedFor } from "@/lib/universe";
import { DashboardSettings } from "@/components/DashboardSettings";
import { useDragSort } from "@/lib/use-drag-sort";
import type { CSSProperties, PointerEvent } from "react";
import { HpVisual } from "@/components/HpVisual";
import {
  DASHBOARD_COLUMNS,
  DASHBOARD_SPANS,
  DEFAULT_PREFS,
  arrangeRows,
  dropCharacter,
  dropSection,
  manualOrder,
  toggleIn,
  readPrefs,
  type DashboardPrefs,
} from "@/lib/dashboard";

export function GmDashboard() {
  const identity = useIdentity();
  const { universe: u } = useUniverse();
  const table = useTable();
  const navigate = useNavigate();
  const [rows, setRows] = useState<DashboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<DashboardPrefs>(DEFAULT_PREFS);
  const [organizing, setOrganizing] = useState(false);
  const [layoutMode, setLayoutMode] = useState(false);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const rowsRef = useRef<string[]>([]);
  const grabCharacter = useDragSort("character", (from, to) => {
    const p = prefsRef.current;
    changePrefs({
      ...p,
      sort: "manual",
      order: dropCharacter(p.order, rowsRef.current, from, to),
    });
  });
  const grabSection = useDragSort("section", (from, to) => {
    const p = prefsRef.current;
    changePrefs({ ...p, sections: dropSection(p.sections, from, to) });
  });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const rail = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<string, DashboardRow>());
  const queues = useRef(new Map<string, ReturnType<typeof createSaveQueue>>());
  const revision = useRef(0);
  const [hurt, setHurt] = useState<Set<string>>(new Set());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const load = useCallback(async () => {
    await Promise.all([...queues.current.values()].map((q) => q.flush()));
    const version = revision.current;
    const { data, error } = await supabase
      .from("characters")
      .select(
        "id,name,handle,sheet,players_can_edit,character_state(hp_current,eddies,ammo,inventory)",
      )
      .order("name");
    if (error) {
      setErr(`Chargement impossible : ${error.message}`);
      setLoading(false);
      return;
    }
    if (version !== revision.current) return;
    const next = (data ?? []) as unknown as DashboardRow[];
    const lost = next
      .filter(
        (r) =>
          r.character_state &&
          rowRefs.current.get(r.id)?.character_state &&
          r.character_state.hp_current <
            (rowRefs.current.get(r.id)?.character_state?.hp_current ?? 0),
      )
      .map((r) => r.id);
    if (lost.length) {
      setHurt((old) => new Set([...old, ...lost]));
      timers.current.push(
        setTimeout(
          () => setHurt((old) => new Set([...old].filter((id) => !lost.includes(id)))),
          900,
        ),
      );
    }
    rowRefs.current = new Map(next.map((r) => [r.id, r]));
    setRows(next);
    setLoading(false);
  }, []);
  useEffect(() => {
    if (!identity.isGm) return;
    let disposed = false;
    const refresh = () => {
      if (!disposed) void load();
    };
    refresh();
    const channel = supabase
      .channel(`gm-dashboard-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "characters" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "character_state" }, refresh)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") refresh();
      });
    return () => {
      disposed = true;
      void supabase.removeChannel(channel);
      timers.current.forEach(clearTimeout);
    };
  }, [identity.isGm, load]);
  function update(id: string, change: (s: DashboardState) => Partial<DashboardState>) {
    const before = rowRefs.current.get(id);
    if (!before?.character_state || !identity.isGm) return;
    const patch = change(before.character_state);
    const next = { ...before, character_state: { ...before.character_state, ...patch } };
    rowRefs.current.set(id, next);
    ++revision.current;
    setRows((old) => old.map((r) => (r.id === id ? next : r)));
    if (next.character_state.hp_current < before.character_state.hp_current) {
      setHurt((old) => new Set([...old, id]));
      timers.current.push(
        setTimeout(() => setHurt((old) => new Set([...old].filter((x) => x !== id))), 900),
      );
    }
    let queue = queues.current.get(id);
    if (!queue) {
      queue = createSaveQueue();
      queues.current.set(id, queue);
    }
    void queue
      .enqueue(async () => {
        const { data, error } = await supabase
          .from("character_state")
          .update(
            patch as unknown as {
              hp_current?: number;
              eddies?: number;
              ammo?: Json;
              inventory?: Json;
            },
          )
          .eq("character_id", id)
          .select("character_id");
        if (error || !data?.length) throw new Error(error?.message ?? "Accès refusé");
      })
      .catch((error) => {
        setErr(`Sauvegarde échouée : ${error.message}`);
        void load();
      });
  }
  // Autoriser / bloquer les modifications des joueurs (une fiche ou toutes)
  async function setLock(ids: string[], value: boolean) {
    if (!identity.isGm || !ids.length) return;
    ++revision.current;
    for (const id of ids) {
      const r = rowRefs.current.get(id);
      if (r) rowRefs.current.set(id, { ...r, players_can_edit: value });
    }
    setRows((old) => old.map((r) => (ids.includes(r.id) ? { ...r, players_can_edit: value } : r)));
    const { data, error } = await supabase
      .from("characters")
      .update({ players_can_edit: value })
      .in("id", ids)
      .select("id");
    if (error || (data?.length ?? 0) !== ids.length) {
      setErr(`Changement impossible : ${error?.message ?? "accès refusé"}`);
      void load();
    }
  }
  const filtered = arrangeRows(rows, prefs, { isOnline: (id) => table.online.has(id), u });
  const ordered = manualOrder(rows, prefs.order);
  rowsRef.current = rows.map((r) => r.id);
  const visible = new Set<string>(prefs.sections.filter((s) => s.visible).map((s) => s.key));
  useEffect(() => {
    void supabase.rpc("get_dashboard_prefs").then(({ data }) => setPrefs(readPrefs(data)));
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);
  // Chaque changement est gardé en base, pour le retrouver sur tous les appareils
  function changePrefs(next: DashboardPrefs) {
    setPrefs(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void supabase
        .rpc("save_dashboard_prefs", { _prefs: next as unknown as Json })
        .then(({ error }) => {
          if (error) setErr(error.message);
        });
    }, 400);
  }
  useEffect(() => {
    if (!filtered.some((r) => r.id === selected)) setSelected(filtered[0]?.id ?? null);
  }, [filtered, selected]);
  // Clic sur un personnage du bandeau : amène sa colonne à l'écran et la fait briller un instant
  const select = (id: string) => {
    setSelected(id);
    const node = rail.current?.querySelector<HTMLElement>(`[data-character="${id}"]`);
    if (!node || !rail.current) return;
    rail.current.scrollTo({ left: node.offsetLeft - rail.current.offsetLeft, behavior: "smooth" });
    const top = node.getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight * 0.6)
      node.scrollIntoView({ behavior: "smooth", block: "start" });
    node.classList.remove("spot");
    void node.offsetWidth;
    node.classList.add("spot");
    window.setTimeout(() => node.classList.remove("spot"), 1600);
  };
  if (!identity.ready) return <main className="empty-state">Chargement…</main>;
  if (!identity.isGm) return <main className="empty-state">ACCÈS RÉSERVÉ AU MJ</main>;
  return (
    <main className="dashboard-page">
      <div className="dashboard-heading">
        <div>
          <small>{u.words.tableName.toUpperCase()} · TABLE MJ</small>
          <h1>Tableau de bord</h1>
        </div>
        <span className="tag">
          {rows.filter((r) => table.online.has(r.id)).length}/{rows.length} EN LIGNE
        </span>
      </div>
      <InlineError message={err} onClear={() => setErr(null)} />
      <div className="dashboard-summary" aria-label="Personnages du groupe">
        {filtered.map((r) => {
          const state = r.character_state;
          const max = hpMax(readStats(r.sheet, u), r.sheet, u);
          const member = table.party.find((p) => p.character_id === r.id);
          const alerts = dashboardAlerts(r, u);
          return (
            <Button
              variant="prototype"
              key={r.id}
              className={`dashboard-member ${selected === r.id ? "on" : ""}`}
              aria-label={`Afficher ${r.handle || r.name}`}
              title={`Aller à la fiche de ${r.handle || r.name} (double-clic : ouvrir la fiche complète)`}
              aria-pressed={selected === r.id}
              onClick={() => select(r.id)}
              onDoubleClick={() => {
                identity.setActive(r.id);
                void navigate({ to: "/fiche" });
              }}
            >
              <div
                className={`av neon-${member?.color ?? "cyan"} ${table.online.has(r.id) ? "" : "off"}`}
              >
                {member?.avatar ? (
                  <img src={member.avatar} alt="" />
                ) : (
                  <b>{(r.handle || r.name).slice(0, 2)}</b>
                )}
                <i />
              </div>
              <div className="dashboard-member-name">
                <b>{r.handle || r.name}</b>
                <progress max={max} value={state?.hp_current ?? 0} />
                <small>
                  {state ? Math.min(state.hp_current, max) : "—"}/{max} {u.words.hp}
                </small>
                {u.modules.ammo &&
                  (() => {
                    const guns = readWeapons(r.sheet)
                      .map((w, i) => ({ w, a: state?.ammo[String(i)] }))
                      .filter((x) => x.w.capacity > 0);
                    return guns.length ? (
                      <div className="dm-ammo">
                        {guns.slice(0, 2).map(({ w, a }, i) => {
                          const mag = a?.mag ?? w.capacity;
                          const low = mag <= w.capacity / 3;
                          return (
                            <span
                              key={i}
                              className={low ? "low" : ""}
                              title={`${w.name} : ${mag}/${w.capacity} · ${u.words.spare} ${a?.spare ?? 0} · ${u.words.loose} ${a?.loose ?? 0}`}
                            >
                              <i
                                style={{
                                  width: `${Math.round((Math.max(0, mag) / w.capacity) * 42)}px`,
                                }}
                              />
                              <b>
                                {mag}/{w.capacity}
                              </b>
                              <em>×{a?.spare ?? 0}</em>
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="dm-ammo none">Pas d'arme à {u.words.rounds}</div>
                    );
                  })()}
              </div>
              <span className="dashboard-alerts">
                {alerts.health && (
                  <CircleAlert className="health-alert" size={16} aria-label="Personnage blessé" />
                )}
                {alerts.ammo && (
                  <AlertTriangle
                    className="ammo-alert"
                    size={16}
                    aria-label={`${u.words.rounds} : niveau bas`}
                  />
                )}
              </span>
            </Button>
          );
        })}
      </div>
      <div className="dashboard-toolbar">
        <div className="dashboard-sections">
          {prefs.sections.map((s) => (
            <Button
              variant="prototype"
              className={`btn ${s.visible ? "on" : ""}`}
              key={s.key}
              aria-pressed={s.visible}
              onClick={() =>
                changePrefs({
                  ...prefs,
                  sections: prefs.sections.map((x) =>
                    x.key === s.key ? { ...x, visible: !x.visible } : x,
                  ),
                })
              }
            >
              {s.key}
            </Button>
          ))}
          <Button
            variant="prototype"
            className={`btn ${organizing ? "on" : ""}`}
            aria-expanded={organizing}
            onClick={() => setOrganizing((v) => !v)}
          >
            <SlidersHorizontal size={15} /> Organiser
          </Button>
          <Button
            variant="prototype"
            className={`btn ${layoutMode ? "on" : ""}`}
            aria-pressed={layoutMode}
            onClick={() => setLayoutMode((v) => !v)}
          >
            <LayoutGrid size={15} /> Disposition
          </Button>
        </div>
        <div className="dashboard-locks">
          <Button
            variant="prototype"
            className="btn"
            disabled={!rows.some((r) => !r.players_can_edit)}
            onClick={() =>
              void setLock(
                rows.map((r) => r.id),
                true,
              )
            }
          >
            <LockOpen size={15} />
            Tout autoriser
          </Button>
          <Button
            variant="prototype"
            className="btn red"
            disabled={!rows.some((r) => r.players_can_edit)}
            onClick={() =>
              void setLock(
                rows.map((r) => r.id),
                false,
              )
            }
          >
            <Lock size={15} />
            Tout verrouiller
          </Button>
        </div>
        <label className="dashboard-filter">
          <input
            type="checkbox"
            checked={prefs.onlineOnly}
            onChange={(e) => changePrefs({ ...prefs, onlineOnly: e.target.checked })}
          />
          En ligne seulement
        </label>
        <label className="dashboard-filter">
          <input
            type="checkbox"
            checked={prefs.hurtOnly}
            onChange={(e) => changePrefs({ ...prefs, hurtOnly: e.target.checked })}
          />
          Blessés seulement
        </label>
      </div>
      {layoutMode && (
        <div className="dashboard-layout-bar">
          <span>Colonnes</span>
          <div className="dashboard-cols" role="radiogroup" aria-label="Nombre de colonnes">
            {DASHBOARD_COLUMNS.map((c) => (
              <button
                type="button"
                key={c}
                role="radio"
                aria-checked={prefs.columns === c}
                className={prefs.columns === c ? "on" : ""}
                onClick={() => changePrefs({ ...prefs, columns: c })}
              >
                {c === 0 ? "Auto" : c}
              </button>
            ))}
          </div>
          <small>Attrape une fiche ou une section par sa poignée pour la déplacer.</small>
        </div>
      )}
      {organizing && <DashboardSettings rows={ordered} prefs={prefs} onChange={changePrefs} />}
      {loading ? (
        <p className="empty-state">Chargement…</p>
      ) : !filtered.length ? (
        <p className="empty-state">
          {rows.length ? "Aucune fiche avec ces filtres." : "Aucun personnage."}
        </p>
      ) : (
        <div
          className={`dashboard-rail ${prefs.columns ? "tiled" : ""} ${layoutMode ? "editing" : ""}`}
          style={prefs.columns ? ({ "--cols": prefs.columns } as CSSProperties) : undefined}
          ref={rail}
          onScroll={() => {
            if (window.innerWidth >= 1100 || !rail.current) return;
            const container = rail.current;
            const nearest = [...container.querySelectorAll<HTMLElement>("[data-character]")].sort(
              (a, b) =>
                Math.abs(a.offsetLeft - container.scrollLeft) -
                Math.abs(b.offsetLeft - container.scrollLeft),
            )[0];
            if (nearest) setSelected(nearest.dataset["character"] ?? null);
          }}
        >
          {filtered.map((r) => (
            <DashboardColumn
              key={r.id}
              row={r}
              visible={visible}
              prefs={prefs}
              tools={
                layoutMode
                  ? {
                      grabSection,
                      hideSection: (key) =>
                        changePrefs({
                          ...prefs,
                          sections: prefs.sections.map((s) =>
                            s.key === key ? { ...s, visible: false } : s,
                          ),
                        }),
                    }
                  : null
              }
              window={
                layoutMode
                  ? {
                      grab: grabCharacter,
                      setSpan: (span) =>
                        changePrefs({ ...prefs, spans: { ...prefs.spans, [r.id]: span } }),
                      hide: () =>
                        changePrefs({
                          ...prefs,
                          hiddenCharacters: toggleIn(prefs.hiddenCharacters, r.id),
                        }),
                    }
                  : null
              }
              hurt={hurt.has(r.id)}
              update={(change) => update(r.id, change)}
              onLock={(value) => void setLock([r.id], value)}
            />
          ))}
        </div>
      )}
    </main>
  );
}

type ColumnProps = {
  row: DashboardRow;
  visible: Set<string>;
  prefs: DashboardPrefs;
  /** Présents seulement en mode Disposition */
  tools: SectionTools | null;
  window: {
    grab: (e: PointerEvent<HTMLElement>, id: string) => void;
    setSpan: (span: number) => void;
    hide: () => void;
  } | null;
  hurt: boolean;
  update: (change: (s: DashboardState) => Partial<DashboardState>) => void;
  onLock: (value: boolean) => void;
};
/** L'ordre des sections passe par CSS : les colonnes alignées (subgrid) gardent leurs lignes. */
const sectionOrder = (prefs: DashboardPrefs, key: string) => ({
  order: prefs.sections.findIndex((s) => s.key === key) + 1,
});

type SectionTools = {
  grabSection: (e: PointerEvent<HTMLElement>, key: string) => void;
  hideSection: (key: string) => void;
};

function SectionTitle({ name, tools }: { name: string; tools: SectionTools | null }) {
  return (
    <h3 className={tools ? "with-grip" : ""}>
      {tools && (
        <button
          type="button"
          className="grip"
          aria-label={`Déplacer la section ${name}`}
          onPointerDown={(e) => tools.grabSection(e, name)}
        >
          <GripVertical size={14} aria-hidden="true" />
        </button>
      )}
      {name}
      {tools && (
        <button
          type="button"
          className="grip-close"
          aria-label={`Masquer la section ${name}`}
          onClick={() => tools.hideSection(name)}
        >
          <X size={13} aria-hidden="true" />
        </button>
      )}
    </h3>
  );
}

function DashboardColumn({
  row: r,
  visible,
  prefs,
  tools,
  window: frame,
  hurt,
  update,
  onLock,
}: ColumnProps) {
  const table = useTable();
  const identity = useIdentity();
  const navigate = useNavigate();
  const [damage, setDamage] = useState("");
  const [amount, setAmount] = useState("");
  const [item, setItem] = useState("");
  const { universe: u } = useUniverse();
  const W = u.words;
  const shownDefenses = u.rules.defenses.filter((d) => !prefs.hiddenFields.includes(d.key));
  const shownGauges = u.rules.gauges.filter((g) => !prefs.hiddenFields.includes(g.key));
  const shownFields = shownDefenses.length + shownGauges.length;
  const stats = readStats(r.sheet, u);
  const max = hpMax(stats, r.sheet, u);
  const skills = readSkills(r.sheet);
  const top = topSkillIndexes(skills, stats, u);
  const weapons = readWeapons(r.sheet);
  const s = r.character_state;
  const member = table.party.find((p) => p.character_id === r.id);
  const online = table.online.has(r.id);
  const ammo = (i: number, w: { capacity: number }) =>
    s?.ammo[String(i)] ?? { mag: w.capacity, spare: 2, loose: 0 };
  const updateAmmo = (i: number, w: { capacity: number }, fn: (a: AmmoEntry) => AmmoEntry) =>
    update((current) => ({
      ammo: {
        ...current.ammo,
        [String(i)]: fn(current.ammo[String(i)] ?? { mag: w.capacity, spare: 2, loose: 0 }),
      },
    }));
  const status = hpStatus(s?.hp_current ?? 0, woundedFor(u, max, stats, r.sheet));
  const firstInfo = u.rules.infoFields[0];
  return (
    <article
      className="dashboard-column"
      style={{ "--span": prefs.spans[r.id] ?? 1 } as CSSProperties}
      data-character={r.id}
      aria-label={`Fiche ${r.handle || r.name}`}
    >
      {frame && (
        <div className="window-bar">
          <button
            type="button"
            className="grip"
            aria-label={`Déplacer ${r.handle || r.name}`}
            onPointerDown={(e) => frame.grab(e, r.id)}
          >
            <GripVertical size={16} aria-hidden="true" />
            <span>{r.handle || r.name}</span>
          </button>
          <span className="window-spans" role="radiogroup" aria-label="Largeur de la fiche">
            {DASHBOARD_SPANS.map((n) => (
              <button
                type="button"
                key={n}
                role="radio"
                aria-checked={(prefs.spans[r.id] ?? 1) === n}
                aria-label={`Largeur ${n} pour ${r.handle || r.name}`}
                className={(prefs.spans[r.id] ?? 1) === n ? "on" : ""}
                onClick={() => frame.setSpan(n)}
              >
                {n}
              </button>
            ))}
          </span>
          <button
            type="button"
            className="grip-close"
            aria-label={`Masquer ${r.handle || r.name}`}
            onClick={frame.hide}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}
      <header className="dashboard-column-head">
        <div className={`av neon-${member?.color ?? "cyan"} ${online ? "" : "off"}`}>
          {member?.avatar ? (
            <img src={member.avatar} alt="" />
          ) : (
            <b>{(r.handle || r.name).slice(0, 2)}</b>
          )}
          <i />
        </div>
        <div>
          <h2>{r.handle || r.name}</h2>
          <small>
            {(firstInfo && str(r.sheet, firstInfo.key)) || "—"} ·{" "}
            {online ? "EN LIGNE" : "HORS LIGNE"}
          </small>
        </div>
        <Button
          variant="prototype"
          className="btn"
          aria-label={`Ouvrir ${r.handle || r.name}`}
          onClick={() => {
            identity.setActive(r.id);
            void navigate({ to: "/fiche" });
          }}
        >
          Ouvrir
          <ArrowRight size={14} />
        </Button>
        <Button
          variant="prototype"
          className={`btn lock-toggle ${r.players_can_edit ? "open" : ""}`}
          aria-pressed={r.players_can_edit}
          aria-label={`${r.players_can_edit ? "Verrouiller" : "Autoriser"} les modifications de ${r.handle || r.name}`}
          onClick={() => onLock(!r.players_can_edit)}
        >
          {r.players_can_edit ? (
            <>
              <LockOpen size={15} />
              Modifications autorisées
            </>
          ) : (
            <>
              <Lock size={15} />
              Fiche verrouillée
            </>
          )}
        </Button>
      </header>
      <section
        className={`dashboard-section dashboard-vitals hp-${status} ${hurt ? "hp-loss" : ""}`}
        hidden={!visible.has("Vitaux")}
        data-section="Vitaux"
        style={sectionOrder(prefs, "Vitaux")}
      >
        <SectionTitle name="Vitaux" tools={tools} />
        <div className="dashboard-hp">
          <b>
            {s ? Math.min(s.hp_current, max) : "—"}
            <small> / {max}</small>
          </b>
          <span
            className={`status ${status === "ok" ? "ok" : status === "blesse" ? "warn" : "bad"}`}
          >
            {status === "ok" ? W.hpOk : status === "blesse" ? W.hpHurt : W.hpDying}
          </span>
        </div>
        {s && <HpVisual style={u.theme.hpVisual} hp={Math.min(s.hp_current, max)} max={max} />}
        <div className="segs">
          {Array.from({ length: 15 }, (_, i) => (
            <i
              key={i}
              className={i < Math.ceil((Math.max(0, s?.hp_current ?? 0) / max) * 15) ? "" : "off"}
            />
          ))}
        </div>
        <div className="dashboard-actions">
          {[-5, -1, 1, 5].map((d) => (
            <Button
              variant="prototype"
              className={`btn ${d < 0 ? "red" : ""}`}
              key={d}
              disabled={!s}
              onClick={() =>
                update((current) => ({
                  hp_current: Math.min(max, Math.max(0, Math.min(current.hp_current, max) + d)),
                }))
              }
            >
              {d > 0 ? `+${d}` : d}
            </Button>
          ))}
        </div>
        <form
          className="dashboard-input-row"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(damage);
            if (Number.isSafeInteger(n) && n > 0) {
              update((current) => ({
                hp_current: Math.max(0, Math.min(current.hp_current, max) - n),
              }));
              setDamage("");
            }
          }}
        >
          <input
            type="number"
            className="field"
            min={0}
            aria-label={`${W.damage} ${r.handle || r.name}`}
            placeholder={W.damage}
            value={damage}
            onChange={(e) => setDamage(e.target.value)}
          />
          <Button variant="prototype" className="btn red" disabled={!s}>
            Encaisser
          </Button>
        </form>
        {shownFields > 0 && (
          <dl className="dashboard-vital-grid">
            {shownDefenses.map((d) => (
              <div key={d.key}>
                <dt>{d.label}</dt>
                <dd>{str(r.sheet, d.key) || "—"}</dd>
              </div>
            ))}
            {shownGauges.map((g) => (
              <div key={g.key}>
                <dt>{g.label}</dt>
                <dd>
                  {num(r.sheet, g.key)}/{gaugeMax(u, g, stats, r.sheet)}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>
      <section
        className="dashboard-section"
        hidden={!visible.has("Stats")}
        data-section="Stats"
        style={sectionOrder(prefs, "Stats")}
      >
        <SectionTitle name="Stats" tools={tools} />
        <div className="dashboard-stats">
          {u.rules.stats
            .filter((st) => !prefs.hiddenStats.includes(st.key))
            .map((st) => (
              <div key={st.key}>
                <small>{st.label}</small>
                <b>{stats[st.key] ?? 0}</b>
              </div>
            ))}
        </div>
      </section>
      <section
        className="dashboard-section"
        hidden={!visible.has("Compétences")}
        data-section="Compétences"
        style={sectionOrder(prefs, "Compétences")}
      >
        <SectionTitle name="Compétences" tools={tools} />
        <div className="dashboard-skills">
          {orderedSkills(skills, u.rules.skillOrder).map(({ skill, index }) => (
            <div key={index} className={top.has(index) ? "top" : ""}>
              <span>{skill.title || shortSkillName(skill.name)}</span>
              <b>{skillBase(skill, stats, u)}</b>
            </div>
          ))}
        </div>
      </section>
      <section
        className="dashboard-section"
        hidden={!visible.has("Combat")}
        data-section="Combat"
        style={sectionOrder(prefs, "Combat")}
      >
        <SectionTitle name="Combat" tools={tools} />
        <div className="dw-list">
          {weapons.map((w, i) => {
            const a = ammo(i, w);
            const gun = u.modules.ammo && w.capacity > 0;
            const low = gun && a.mag <= w.capacity / 3;
            const empty = gun && a.mag <= 0;
            const many = w.capacity > 12;
            return (
              <div
                className={`dw ${gun ? "gun" : "melee"} ${low ? "low" : ""} ${empty ? "empty" : ""}`}
                key={i}
              >
                <div className="dw-head">
                  {gun ? (
                    <Crosshair size={14} className="dw-ico" aria-hidden />
                  ) : (
                    <Swords size={14} className="dw-ico" aria-hidden />
                  )}
                  <b className="dw-name">{w.name}</b>
                  <span className="dw-chips">
                    <span className="dw-chip dmg" title="Dégâts">
                      {weaponDamage(w, stats, u)}
                    </span>
                    <span className="dw-chip base" title="Base d'attaque">
                      {u.rules.rollMode === "under" ? "≤" : "+"}
                      {weaponAttack(w, skills, stats, u).base}
                    </span>
                  </span>
                </div>
                {gun && (
                  <>
                    <div className="dw-mag">
                      <div
                        className="dw-count"
                        aria-label={`${a.mag} ${W.rounds} sur ${w.capacity}`}
                      >
                        <b>{String(a.mag).padStart(2, "0")}</b>
                        <small>/{w.capacity}</small>
                      </div>
                      <div className={`dw-rounds ${many ? "many" : ""}`} aria-hidden="true">
                        {Array.from({ length: w.capacity }, (_, j) => (
                          <i key={j} className={j < a.mag ? "" : "spent"} />
                        ))}
                      </div>
                    </div>
                    <div className="dw-foot">
                      <span
                        className="dw-reserve"
                        title={`${W.spare} : ${a.spare} · ${W.loose} : ${a.loose}`}
                      >
                        <span className="dw-spares" aria-hidden="true">
                          {Array.from({ length: Math.min(a.spare, 4) }, (_, j) => (
                            <i key={j} />
                          ))}
                          {a.spare > 4 && <em>+{a.spare - 4}</em>}
                        </span>
                        <small>
                          ×{a.spare}
                          {a.loose > 0 ? ` · ${a.loose} ${W.loose.toLowerCase()}` : ""}
                        </small>
                      </span>
                      <span className="dw-actions">
                        <Button
                          variant="prototype"
                          className="dw-btn fire"
                          title={`${W.fire} : −1`}
                          aria-label={`Tirer avec ${w.name}`}
                          disabled={!s || a.mag <= 0}
                          onClick={() => updateAmmo(i, w, (current) => shoot(current, 1))}
                        >
                          −1
                        </Button>
                        <Button
                          variant="prototype"
                          className="dw-btn"
                          title={W.reload}
                          aria-label={`${W.reload} ${w.name}`}
                          disabled={!s || a.mag >= w.capacity || (a.spare === 0 && a.loose === 0)}
                          onClick={() => updateAmmo(i, w, (current) => reload(current, w.capacity))}
                        >
                          <RotateCw size={14} />
                        </Button>
                        <Button
                          variant="prototype"
                          className="dw-btn"
                          title={`+1 (${W.spare})`}
                          aria-label={`+1 ${W.spare} ${w.name}`}
                          disabled={!s}
                          onClick={() =>
                            updateAmmo(i, w, (current) => ({
                              ...current,
                              spare: current.spare + 1,
                            }))
                          }
                        >
                          <PackagePlus size={14} />
                        </Button>
                        {a.loose >= w.capacity && (
                          <Button
                            variant="prototype"
                            className="dw-btn"
                            title={`${W.loose} → ${W.spare}`}
                            aria-label={`${W.loose} vers ${W.spare} ${w.name}`}
                            disabled={!s}
                            onClick={() =>
                              updateAmmo(i, w, (current) => packMagazine(current, w.capacity))
                            }
                          >
                            {W.loose.toLowerCase()}→+1
                          </Button>
                        )}
                      </span>
                    </div>
                  </>
                )}
              </div>
            );
          })}
          {!weapons.length && <p className="note">Aucune arme.</p>}
        </div>
      </section>
      <section
        className="dashboard-section"
        hidden={!visible.has("Sac")}
        data-section="Sac"
        style={sectionOrder(prefs, "Sac")}
      >
        <SectionTitle name="Sac" tools={tools} />
        {u.modules.money && (
          <div className="dashboard-money">
            <b>
              {s?.eddies ?? "—"} {W.moneySymbol}
            </b>
            <Button
              variant="prototype"
              className="btn"
              disabled={!s}
              onClick={() => update((current) => ({ eddies: Math.max(0, current.eddies - 10) }))}
            >
              −10
            </Button>
            <Button
              variant="prototype"
              className="btn"
              disabled={!s}
              onClick={() => update((current) => ({ eddies: current.eddies + 10 }))}
            >
              +10
            </Button>
          </div>
        )}
        {u.modules.money && (
          <div className="dashboard-input-row">
            <input
              type="number"
              className="field"
              min={0}
              aria-label={`Montant ${r.handle || r.name}`}
              placeholder="Montant"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            {([-1, 1] as const).map((sign) => (
              <Button
                variant="prototype"
                className={`btn ${sign < 0 ? "red" : "y"}`}
                key={sign}
                disabled={!s || Number(amount) <= 0}
                aria-label={`${sign < 0 ? "Dépenser" : "Gagner"} ${r.handle || r.name}`}
                onClick={() => {
                  const n = Number(amount);
                  if (Number.isSafeInteger(n) && n > 0)
                    update((current) => ({ eddies: Math.max(0, current.eddies + sign * n) }));
                }}
              >
                {sign < 0 ? "−" : "+"}
              </Button>
            ))}
          </div>
        )}
        <div className="dashboard-inventory">
          {s?.inventory.map((it, i) => (
            <div key={i}>
              <span>{it.name}</span>
              <Button
                variant="prototype"
                className="icon-btn"
                aria-label={`Diminuer ${it.name}`}
                onClick={() =>
                  update((current) => ({
                    inventory: current.inventory.map((x, j) =>
                      j === i ? { ...x, qty: Math.max(1, x.qty - 1) } : x,
                    ),
                  }))
                }
              >
                −
              </Button>
              <b>{it.qty}</b>
              <Button
                variant="prototype"
                className="icon-btn"
                aria-label={`Augmenter ${it.name}`}
                onClick={() =>
                  update((current) => ({
                    inventory: current.inventory.map((x, j) =>
                      j === i ? { ...x, qty: x.qty + 1 } : x,
                    ),
                  }))
                }
              >
                +
              </Button>
              <Button
                variant="prototype"
                className="icon-btn"
                aria-label={`Supprimer ${it.name}`}
                onClick={async () => {
                  if (!(await confirmAction({ title: `Retirer « ${it.name} » de l'inventaire ?` })))
                    return;
                  update((current) => ({
                    inventory: current.inventory.filter((x, j) => !(j === i && x.name === it.name)),
                  }));
                }}
              >
                <Trash2 size={13} />
              </Button>
            </div>
          ))}
        </div>
        <form
          className="dashboard-input-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (item.trim()) {
              const name = item.trim();
              update((current) => ({ inventory: [...current.inventory, { name, qty: 1 }] }));
              setItem("");
            }
          }}
        >
          <input
            className="field"
            aria-label={`Nouvel objet ${r.handle || r.name}`}
            placeholder="Nouvel objet"
            value={item}
            onChange={(e) => setItem(e.target.value)}
          />
          <Button
            variant="prototype"
            className="btn y"
            aria-label={`Ajouter un objet ${r.handle || r.name}`}
            disabled={!s}
          >
            <Plus size={16} />
          </Button>
        </form>
        {!s && <p className="note error">État du personnage indisponible.</p>}
      </section>
    </article>
  );
}

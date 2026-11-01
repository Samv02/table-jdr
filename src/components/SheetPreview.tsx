import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Backpack, Crosshair, Dices, Lock, User, X } from "lucide-react";
import { ArsenalWeapon } from "@/components/ArsenalWeapon";
import { DieIcon } from "@/components/DieIcon";
import { HpVisual } from "@/components/HpVisual";
import { SlotPanel } from "@/components/SlotPanel";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { charLabel } from "@/lib/active-character";
import {
  ammoOf,
  hpFill,
  hpLimit,
  hpMax,
  hpShown,
  hpStatus,
  num,
  readSkills,
  readStats,
  readWeapons,
  skillBase,
  statKey,
  statLabel,
  str,
} from "@/lib/sheet";
import { orderedSkills, shortSkillName, topSkillIndexes } from "@/lib/skill-presentation";
import { deathSaveFor, gaugeMax, skillDiceLabel, woundedFor, type Universe } from "@/lib/universe";
import {
  previewFromRows,
  sampleCharacter,
  statColumns,
  topStatKeys,
  type PreviewCharacter,
} from "@/lib/universe-preview";
import { weaponAttack, weaponDamage } from "@/lib/weapon-rules";

const noop = () => undefined;

/**
 * Fiche en affichage seul, pour la page Univers : mêmes styles et mêmes règles que
 * routes/fiche.tsx, mais aucun bouton n'écrit. Un bloc ajouté à la vraie fiche se reporte ici.
 */
function Identity({ c, u }: { c: PreviewCharacter; u: Universe }) {
  return (
    <section className="panel cut">
      <div className="ident">
        <div className="av neon-cyan">
          {(charLabel(c) ?? "").slice(0, 2)}
          <i />
        </div>
        <div>
          <h1>{charLabel(c)}</h1>
          <div className="meta">
            {u.rules.infoFields.map((f) => (
              <span className="pill" key={f.key}>
                {f.label.toUpperCase()} <b>{str(c.sheet, f.key) || "—"}</b>
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Vitals({ c, u }: { c: PreviewCharacter; u: Universe }) {
  const stats = readStats(c.sheet, u);
  const max = hpMax(stats, c.sheet, u);
  const hp = hpShown(c.hp_current, max);
  const wounded = woundedFor(u, max, stats, c.sheet);
  const deathSave = deathSaveFor(u, stats, c.sheet);
  const status = hpStatus(hp, wounded);
  const w = u.words;
  return (
    <section className={`panel cut hp-${status}`}>
      <div className="ph">
        <h2>{w.vitals}</h2>
      </div>
      <div className="hp-top">
        <div className="hp-num">
          {hp}
          <small> / {hpLimit(max)}</small>
        </div>
        <span className={`status ${status === "ok" ? "ok" : status === "blesse" ? "warn" : "bad"}`}>
          {status === "ok" ? w.hpOk : status === "blesse" ? w.hpHurt : w.hpDying}
        </span>
      </div>
      <HpVisual style={u.theme.hpVisual} hp={hp} max={max} />
      <div className="segs">
        {Array.from({ length: 15 }, (_, i) => (
          <i key={i} className={i < Math.ceil(hpFill(c.hp_current, max) * 15) ? "" : "off"} />
        ))}
      </div>
      {(wounded !== null || deathSave !== null) && (
        <div className="hp-sub">
          {[
            wounded !== null ? `${w.wounded} ≤ ${wounded}` : null,
            deathSave !== null && u.rules.deathSave
              ? `${u.rules.deathSave.label} : ${deathSave}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
      )}
      {u.rules.defenses.length + u.rules.gauges.length > 0 && (
        <div className="minis">
          {u.rules.defenses.map((d) => (
            <div className="mini" key={d.key}>
              <small>{d.label}</small>
              <b>{str(c.sheet, d.key) || "—"}</b>
            </div>
          ))}
          {u.rules.gauges.map((g) => {
            const gMax = gaugeMax(u, g, stats, c.sheet);
            const current = hpShown(num(c.sheet, g.key), gMax);
            return (
              <div className={`mini gauge g-${g.color}`} key={g.key}>
                <small>{g.label}</small>
                <b>
                  {current}
                  <em> / {gMax}</em>
                </b>
                <div className="bar">
                  <progress value={Math.max(0, current)} max={Math.max(1, gMax)} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function StatsPanel({ c, u, columns }: { c: PreviewCharacter; u: Universe; columns?: number }) {
  const stats = readStats(c.sheet, u);
  const top = topStatKeys(stats);
  return (
    <section className="panel cut">
      <div className="ph">
        <h2>{u.words.stats}</h2>
      </div>
      <div
        className="stats"
        style={{
          gridTemplateColumns: `repeat(${columns ?? statColumns(u.rules.stats.length)}, 1fr)`,
        }}
      >
        {u.rules.stats.map((s) => (
          <div className={`stat ${top.has(s.key) ? "hi" : ""}`} key={s.key}>
            <small>{s.label}</small>
            <b>{stats[s.key] ?? 0}</b>
          </div>
        ))}
      </div>
    </section>
  );
}

function SkillsPanel({ c, u, limit }: { c: PreviewCharacter; u: Universe; limit?: number }) {
  const stats = readStats(c.sheet, u);
  const skills = readSkills(c.sheet);
  const top = topSkillIndexes(skills, stats, u);
  const sorted = orderedSkills(skills, u.rules.skillOrder).slice(0, limit ?? skills.length);
  const dice = u.rules.skillDice;
  return (
    <section className="panel cut">
      <div className="ph">
        <h2>{u.words.skills}</h2>
        <span className="tag">TOUCHER = LANCER</span>
      </div>
      <div className="hint">
        <DieIcon className="d10" sides={dice.sides} />
        Touche une compétence : <b>{skillDiceLabel(u)}</b>
      </div>
      <div className="skills">
        {sorted.map(({ skill: sk, index: i }) => {
          const base = skillBase(sk, stats, u);
          const key = statKey(sk.stat, u);
          return (
            <div key={i}>
              <Button className={`skill ${top.has(i) ? "top" : ""}`} tabIndex={-1}>
                <span className="nm">
                  <b>{sk.title || shortSkillName(sk.name)}</b>
                  <small>
                    {key ? statLabel(key, u) : sk.stat || "—"} {key ? (stats[key] ?? 0) : 0} · niv.{" "}
                    {sk.level}
                  </small>
                </span>
                <span className="rollchip cut-s">
                  <DieIcon sides={dice.sides} />
                  <span>
                    {dice.count}d{dice.sides}
                    {u.rules.rollMode === "under" ? " ≤ " : base < 0 ? "" : "+"}
                  </span>
                  <b>{base}</b>
                </span>
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CombatPanels({ c, u }: { c: PreviewCharacter; u: Universe }) {
  const stats = readStats(c.sheet, u);
  const skills = readSkills(c.sheet);
  const weapons = readWeapons(c.sheet);
  return (
    <>
      <section className="panel cut">
        <div className="ph">
          <h2>{u.words.weapons}</h2>
        </div>
        {!weapons.length && <p className="note">Aucune arme.</p>}
        {weapons.map((w, i) => (
          <ArsenalWeapon
            key={i}
            weapon={w}
            ammo={ammoOf(c.ammo, i, w.capacity)}
            attack={weaponAttack(w, skills, stats, u)}
            autoAttack={weaponAttack(w, skills, stats, u, true)}
            damage={weaponDamage(w, stats, u)}
            canEdit={false}
            canRoll={false}
            onAmmo={noop}
            onRoll={noop}
          />
        ))}
      </section>
      {u.modules.slots && (
        <SlotPanel
          programs={c.programs}
          capacity={c.program_slots}
          isGm={false}
          configure={false}
          canEdit={false}
          canRoll={false}
          onPrograms={noop}
          onCapacity={noop}
          onRoll={noop}
        />
      )}
    </>
  );
}

function BagPanels({ c, u }: { c: PreviewCharacter; u: Universe }) {
  return (
    <>
      {u.modules.money && (
        <section className="panel cut">
          <div className="ph">
            <h2>{u.words.money}</h2>
          </div>
          <div className="eddies">
            <b>{c.eddies}</b>
            <small>{u.words.moneySymbol}</small>
          </div>
        </section>
      )}
      <section className="panel cut">
        <div className="ph">
          <h2>{u.words.inventory}</h2>
        </div>
        <div className="inv">
          {c.inventory.map((it, i) => (
            <div className="item cut-s" key={i}>
              <span className="n">
                {it.name}
                {it.desc && <small className="item-desc">{it.desc}</small>}
              </span>
              <span className="q">{it.qty}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function Features({ c, u }: { c: PreviewCharacter; u: Universe }) {
  if (!u.modules.features) return null;
  return (
    <section className="panel cut">
      <div className="ph">
        <h2>{u.words.features}</h2>
      </div>
      <div className="chips">
        {str(c.sheet, "cyberware")
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
          .map((l, i) => (
            <span className="chip cut-s" key={i}>
              {l}
            </span>
          ))}
      </div>
    </section>
  );
}

/** Panneau à côté des réglages : l'essentiel d'une fiche fictive, mis à jour en direct. */
export function SheetPreviewPanel({ u, open, onClose }: PanelProps) {
  const c = useMemo(() => sampleCharacter(u), [u]);
  return (
    <aside className={`uni-preview ${open ? "open" : ""}`} aria-label="Aperçu de la fiche">
      <header>
        <b>Aperçu</b>
        <small>Personnage fictif · rien n’est enregistré</small>
        <Button className="uni-preview-close" aria-label="Fermer l’aperçu" onClick={onClose}>
          <X size={16} />
        </Button>
      </header>
      <Identity c={c} u={u} />
      <Vitals c={c} u={u} />
      <StatsPanel c={c} u={u} columns={Math.min(3, statColumns(u.rules.stats.length))} />
      <SkillsPanel c={c} u={u} limit={3} />
    </aside>
  );
}
type PanelProps = { u: Universe; open: boolean; onClose: () => void };

const TABS = [
  { id: "perso", label: "Perso", icon: User },
  { id: "jets", label: "Jets", icon: Dices },
  { id: "dice", label: "", icon: Dices },
  { id: "combat", label: "Combat", icon: Crosshair },
  { id: "sac", label: "Sac", icon: Backpack },
];

/** Plein écran : la fiche telle qu'un joueur la verra avec le brouillon, sur l'exemple ou un vrai personnage. */
export function PlayerView({ u, onClose }: { u: Universe; onClose: () => void }) {
  const [tab, setTab] = useState("perso");
  const [real, setReal] = useState<PreviewCharacter[]>([]);
  const [pick, setPick] = useState("exemple");
  const [failed, setFailed] = useState(false);
  const sample = useMemo(() => sampleCharacter(u), [u]);
  const c = real.find((x) => x.id === pick) ?? sample;

  // Lecture seule : les règles de la base limitent déjà la liste aux fiches de cette table
  useEffect(() => {
    let alive = true;
    void (async () => {
      const [chars, states] = await Promise.all([
        supabase.from("characters").select("id,name,handle,sheet").order("name"),
        supabase.from("character_state").select("*"),
      ]);
      if (!alive) return;
      if (chars.error || states.error) return setFailed(true);
      const byId = new Map(states.data.map((s) => [s.character_id, s]));
      setReal(
        chars.data.map((row) =>
          previewFromRows(row, byId.get(row.id) as Record<string, unknown> | undefined),
        ),
      );
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="sheet-preview" role="dialog" aria-modal="true" aria-label="Vue joueur">
      <div className="sheet-preview-bar">
        <span className="sheet-preview-state">
          <Lock size={14} /> Vue joueur · rien n’est enregistré
        </span>
        <label>
          <span className="sr-only">Personnage affiché</span>
          <select className="field" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="exemple">Personnage fictif</option>
            {real.map((x) => (
              <option key={x.id} value={x.id}>
                {x.handle || x.name}
              </option>
            ))}
          </select>
        </label>
        <Button className="btn" onClick={onClose}>
          <X size={15} /> Fermer
        </Button>
      </div>
      {failed && <p className="note error">Fiches de la table indisponibles : exemple affiché.</p>}
      <main>
        <div className="wrap">
          <div className="player-grid">
            <div className={`tabview ${tab === "perso" ? "on" : ""}`} data-tab="perso">
              <Identity c={c} u={u} />
              <Vitals c={c} u={u} />
              <StatsPanel c={c} u={u} />
              <Features c={c} u={u} />
            </div>
            <div className={`tabview ${tab === "jets" ? "on" : ""}`} data-tab="skills">
              <SkillsPanel c={c} u={u} />
            </div>
            <div className={`tabview ${tab === "combat" ? "on" : ""}`} data-tab="combat">
              <CombatPanels c={c} u={u} />
            </div>
            <div className={`tabview ${tab === "sac" ? "on" : ""}`} data-tab="sac">
              <BagPanels c={c} u={u} />
            </div>
          </div>
        </div>
      </main>
      <nav className="dock">
        {TABS.map((t) =>
          t.id === "dice" ? (
            <div className="fab-slot" key={t.id}>
              <Button className="fab" aria-label="Dés (inactifs dans l’aperçu)" disabled>
                <DieIcon sides={20} />
              </Button>
            </div>
          ) : (
            <Button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
              {t.id === "jets" ? <DieIcon /> : <t.icon />}
              {t.label}
            </Button>
          ),
        )}
      </nav>
    </div>,
    document.body,
  );
}

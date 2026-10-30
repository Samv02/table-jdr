import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DieIcon } from "@/components/DieIcon";
import {
  DECK_SLOTS_MAX,
  PROGRAM_EFFECT_MAX,
  PROGRAM_NAME_MAX,
  PROGRAM_SLOTS_MAX,
  PROGRAMS_MAX,
  canActivate,
  fitToCapacity,
  newProgram,
  parseProgramDice,
  toggleProgram,
  usedSlots,
  type Program,
} from "@/lib/programs";
import { confirmAction } from "@/components/ConfirmDialog";
import { useWords } from "@/lib/universe-context";

/** Couleurs des programmes dans la barre de slots (dans l'ordre de la liste) */
const HUES = [
  "var(--cyan)",
  "var(--pink)",
  "var(--yellow)",
  "var(--green)",
  "var(--violet)",
  "var(--orange)",
];

type Props = {
  programs: Program[];
  capacity: number;
  isGm: boolean;
  /** MJ en « Mode édition » : réglage des slots, dés et effets */
  configure: boolean;
  /** Le joueur (fiche déverrouillée) ou le MJ peuvent modifier */
  canEdit: boolean;
  canRoll: boolean;
  onPrograms: (next: Program[]) => void;
  onCapacity: (capacity: number, programs: Program[]) => void;
  onRoll: (count: number, sides: number, mod: number, label: string) => void;
};

/**
 * Emplacements limités (cyberdeck, grimoire, pouvoirs…) : le vocabulaire vient de l'univers.
 * Le MJ fixe la capacité et, pour chaque élément, ses emplacements, son dé et son effet.
 */
export function SlotPanel({
  programs,
  capacity,
  isGm,
  configure,
  canEdit,
  canRoll,
  onPrograms,
  onCapacity,
  onRoll,
}: Props) {
  const [blocked, setBlocked] = useState<{ id: string; text: string } | null>(null);
  const [newName, setNewName] = useState("");
  const W = useWords();
  const item = W.slotItem.toLowerCase();
  const units = (n: number) => `${n} ${W.slotUnit}${n > 1 && !/[sx]$/.test(W.slotUnit) ? "s" : ""}`;
  // Liste à jour au moment où la confirmation est validée
  const latest = useRef(programs);
  latest.current = programs;
  const used = usedSlots(programs);
  const free = capacity - used;
  const hue = (id: string) => HUES[programs.findIndex((p) => p.id === id) % HUES.length]!;

  useEffect(() => {
    if (!blocked) return;
    const t = setTimeout(() => setBlocked(null), 4000);
    return () => clearTimeout(t);
  }, [blocked]);

  // Pas de deck : la section n'apparaît qu'en Mode édition du MJ
  if (!configure && capacity <= 0 && programs.length === 0) return null;

  const update = (id: string, patch: Partial<Program>) =>
    onPrograms(programs.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  function toggle(p: Program) {
    const next = toggleProgram(programs, capacity, p.id);
    if (next) {
      setBlocked(null);
      return onPrograms(next);
    }
    const c = canActivate(programs, capacity, p.id);
    setBlocked({
      id: p.id,
      text:
        c.ok || c.reason === "pending"
          ? `Le MJ doit d'abord fixer le coût de cet élément (${item}).`
          : `Il manque ${units(c.missing)} : désactive autre chose d'abord.`,
    });
  }

  function setCapacity(n: number) {
    const cap = Math.max(0, Math.min(DECK_SLOTS_MAX, n));
    onCapacity(cap, fitToCapacity(programs, cap));
  }

  function setSlots(p: Program, n: number) {
    const slots = Math.max(1, Math.min(PROGRAM_SLOTS_MAX, n));
    const next = programs.map((x) => (x.id === p.id ? { ...x, slots } : x));
    onPrograms(fitToCapacity(next, capacity, p.id));
  }

  // Barre de slots : un segment par programme actif, puis les slots libres
  const segments = programs.filter((p) => p.active && p.slots);

  return (
    <section className="panel cut deck" aria-label={W.slots}>
      <div className="ph">
        <h2>{W.slots}</h2>
        <span
          className={`deck-count ${free < 0 ? "over" : free === 0 && capacity > 0 ? "full" : ""}`}
        >
          {used} / {units(capacity)}
        </span>
      </div>

      {configure && (
        <div className="deck-cap">
          <span>Capacité ({W.slotUnit}s)</span>
          <div className="stepper">
            <Button
              variant="prototype"
              aria-label="Un emplacement de moins"
              disabled={capacity <= 0}
              onClick={() => setCapacity(capacity - 1)}
            >
              −
            </Button>
            <b>{capacity}</b>
            <Button
              variant="prototype"
              aria-label="Un emplacement de plus"
              disabled={capacity >= DECK_SLOTS_MAX}
              onClick={() => setCapacity(capacity + 1)}
            >
              +
            </Button>
          </div>
          <small>Réservé au MJ</small>
        </div>
      )}

      {capacity > 0 ? (
        <div
          className="deck-bar"
          style={{ gridTemplateColumns: `repeat(${capacity}, 1fr)` }}
          role="img"
          aria-label={`${used} occupés sur ${capacity}`}
        >
          {segments.map((p) => (
            <span
              key={p.id}
              className="seg"
              style={{
                gridColumn: `span ${Math.min(p.slots!, capacity)}`,
                ["--h" as string]: hue(p.id),
              }}
            >
              {p.name || "Sans nom"}
            </span>
          ))}
          {Array.from({ length: Math.max(0, free) }, (_, i) => (
            <span key={`f${i}`} className="seg free">
              libre
            </span>
          ))}
        </div>
      ) : (
        <p className="deck-empty">
          {configure
            ? "Capacité à 0 : ajoute des emplacements avec +."
            : "Aucun emplacement disponible."}
        </p>
      )}

      <div className="deck-list">
        {programs.length === 0 && <p className="deck-empty">Aucun programme pour l'instant.</p>}
        {programs.map((p) => {
          const dice = parseProgramDice(p.dice);
          const pending = p.slots === null;
          return (
            <div
              key={p.id}
              className={`prog cut-s ${p.active ? "on" : ""} ${pending ? "pending" : ""} ${blocked?.id === p.id ? "shake" : ""}`}
              style={{ ["--h" as string]: hue(p.id) }}
            >
              <div className="prog-top">
                <button
                  type="button"
                  className="prog-switch"
                  role="switch"
                  aria-checked={p.active}
                  aria-label={`${p.active ? "Désactiver" : "Activer"} ${p.name || item}`}
                  disabled={!canEdit}
                  onClick={() => toggle(p)}
                >
                  <i />
                  <span>{p.active ? "ACTIF" : "OFF"}</span>
                </button>

                {canEdit ? (
                  <DraftInput
                    className="field prog-name"
                    label={`Nom (${item})`}
                    value={p.name}
                    max={PROGRAM_NAME_MAX}
                    onCommit={(v) => update(p.id, { name: v })}
                  />
                ) : (
                  <b className="prog-name">{p.name || "Sans nom"}</b>
                )}

                {configure ? (
                  <div className="stepper sm" aria-label="Slots du programme">
                    <Button
                      variant="prototype"
                      aria-label="Un emplacement de moins"
                      disabled={pending || (p.slots ?? 1) <= 1}
                      onClick={() => setSlots(p, (p.slots ?? 1) - 1)}
                    >
                      −
                    </Button>
                    <b>{pending ? "?" : p.slots}</b>
                    <Button
                      variant="prototype"
                      aria-label="Un emplacement de plus"
                      onClick={() => setSlots(p, pending ? 1 : p.slots! + 1)}
                    >
                      +
                    </Button>
                  </div>
                ) : (
                  <span className={`prog-slots ${pending ? "wait" : ""}`}>
                    {pending ? "En attente MJ" : units(p.slots!)}
                  </span>
                )}

                {canEdit && (
                  <Button
                    variant="prototype"
                    className="x"
                    aria-label={`Retirer ${p.name || item}`}
                    onClick={async () => {
                      if (
                        !(await confirmAction({
                          title: `Supprimer « ${p.name || "Sans nom"} » (${item}) ?`,
                        }))
                      )
                        return;
                      onPrograms(latest.current.filter((x) => x.id !== p.id));
                    }}
                  >
                    ✕
                  </Button>
                )}
              </div>

              {configure ? (
                <div className="prog-gm">
                  <label>
                    Dé
                    <DraftInput
                      className={`field ${p.dice && !dice ? "bad" : ""}`}
                      label="Dé"
                      placeholder="2d6+1"
                      value={p.dice}
                      max={12}
                      onCommit={(v) => update(p.id, { dice: v })}
                    />
                  </label>
                  <label className="grow">
                    Effet
                    <DraftInput
                      multiline
                      className="field"
                      label="Effet"
                      placeholder="Ce que ça fait…"
                      value={p.effect}
                      max={PROGRAM_EFFECT_MAX}
                      onCommit={(v) => update(p.id, { effect: v })}
                    />
                  </label>
                </div>
              ) : (
                (p.effect || pending) && (
                  <p className="prog-effect">
                    {p.effect || "Le MJ n'a pas encore défini ce programme."}
                  </p>
                )
              )}

              {dice && (
                <Button
                  variant="prototype"
                  className="btn prog-roll"
                  disabled={!canRoll || !p.active}
                  title={!p.active ? "Active-le pour l'utiliser" : undefined}
                  onClick={() => onRoll(dice.count, dice.sides, dice.mod, p.name || W.slotItem)}
                >
                  <DieIcon sides={dice.sides} /> {p.dice.replace(/\s+/g, "")}
                </Button>
              )}

              {blocked?.id === p.id && (
                <p className="prog-warn" role="alert">
                  {blocked.text}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {canEdit && programs.length < PROGRAMS_MAX && (
        <form
          className="add"
          onSubmit={(e) => {
            e.preventDefault();
            const name = newName.trim();
            if (!name) return;
            onPrograms([...programs, newProgram(name, configure)]);
            setNewName("");
          }}
        >
          <input
            className="field"
            value={newName}
            maxLength={PROGRAM_NAME_MAX}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={`${W.slotItem} à ajouter`}
            aria-label={`${W.slotItem} à ajouter`}
          />
          <Button variant="prototype" className="btn y">
            Ajouter
          </Button>
        </form>
      )}
      {canEdit && !isGm && (
        <p className="deck-hint">Le MJ fixe le coût, le dé et l'effet de chaque élément.</p>
      )}
      {isGm && !configure && (
        <p className="deck-hint">
          Passe en Mode édition pour régler la capacité, les coûts, dés et effets.
        </p>
      )}
    </section>
  );
}

/** Champ texte qui n'enregistre qu'en quittant le champ (ou Entrée), pas à chaque lettre */
function DraftInput(props: {
  value: string;
  onCommit: (v: string) => void;
  label: string;
  className?: string;
  placeholder?: string;
  max: number;
  multiline?: boolean;
}) {
  const [v, setV] = useState(props.value);
  useEffect(() => setV(props.value), [props.value]);
  const commit = () => {
    const t = v.trim().slice(0, props.max);
    if (t !== props.value) props.onCommit(t);
  };
  const common = {
    className: props.className,
    value: v,
    maxLength: props.max,
    placeholder: props.placeholder,
    "aria-label": props.label,
    onBlur: commit,
  };
  return props.multiline ? (
    <textarea {...common} rows={2} onChange={(e) => setV(e.target.value)} />
  ) : (
    <input
      {...common}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

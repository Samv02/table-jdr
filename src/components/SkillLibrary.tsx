import { useState } from "react";
import { Library, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { missingSkills, type SheetSkill, type Stats } from "@/lib/sheet";
import { skillBaseFor, statFor, type TemplateSkill, type Universe } from "@/lib/universe";

/** Sur la fiche : les compétences prêtes de la table, ajoutées d'un clic, base déjà calculée. */
export function SkillPicker({
  u,
  skills,
  stats,
  onAdd,
}: {
  u: Universe;
  skills: SheetSkill[];
  stats: Stats;
  onAdd: (items: TemplateSkill[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const library = u.rules.skillLibrary;
  const missing = missingSkills(library, skills);
  const q = search.trim().toLowerCase();
  const shown = missing.filter((s) => !q || s.name.toLowerCase().includes(q));
  if (!library.length) return null;

  return (
    <div className="skill-picker">
      <Button className="btn y" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Library size={15} /> Bibliothèque ({missing.length})
      </Button>
      {open && (
        <div className="skill-picker-body">
          {missing.length === 0 ? (
            <p className="note">Toutes les compétences de la table sont déjà sur cette fiche.</p>
          ) : (
            <>
              <div className="skill-picker-tools">
                <input
                  className="field"
                  placeholder="Chercher une compétence"
                  aria-label="Chercher dans la bibliothèque"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <Button className="btn" disabled={!shown.length} onClick={() => onAdd(shown)}>
                  Tout ajouter ({shown.length})
                </Button>
              </div>
              <ul className="skill-picker-list">
                {shown.map((s) => {
                  const stat = u.rules.stats.find((x) => x.key === s.stat);
                  const base = skillBaseFor(u, stats[s.stat] ?? 0, s.level, stats);
                  return (
                    <li key={s.name}>
                      <Button aria-label={`Ajouter ${s.name}`} onClick={() => onAdd([s])}>
                        <span>
                          <b>{s.name}</b>
                          <small>{statFor(stat)}</small>
                        </span>
                        <em>{base}</em>
                        <Plus size={15} aria-hidden="true" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Dans l'Univers : coller une liste, une compétence par ligne, toutes sur la même carac. */
export function SkillBulkAdd({
  u,
  onAdd,
}: {
  u: Universe;
  onAdd: (items: TemplateSkill[]) => void;
}) {
  const [text, setText] = useState("");
  const [stat, setStat] = useState(u.rules.stats[0]?.key ?? "");
  const names = text
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);

  return (
    <div className="skill-bulk">
      <textarea
        className="field"
        rows={3}
        placeholder={"Colle plusieurs compétences, une par ligne"}
        aria-label="Compétences à ajouter, une par ligne"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="skill-bulk-tools">
        <select
          className="field"
          aria-label="Caractéristique de ces compétences"
          value={stat}
          onChange={(e) => setStat(e.target.value)}
        >
          {u.rules.stats.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <Button
          className="btn y"
          disabled={!names.length}
          onClick={() => {
            onAdd(names.map((name) => ({ name, stat, level: 0 })));
            setText("");
          }}
        >
          Ajouter {names.length || ""}
        </Button>
      </div>
    </div>
  );
}

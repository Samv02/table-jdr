import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCatalog } from "@/components/CatalogManager";
import type { Template, Universe } from "@/lib/universe";

/** Fiche de départ : s'applique aux prochaines fiches créées, jamais aux fiches existantes. */
export function TemplateEditor({
  draft,
  onChange,
}: {
  draft: Universe;
  onChange: (template: Template) => void;
}) {
  const { items } = useCatalog();
  const t = draft.template;
  const patch = (next: Partial<Template>) => onChange({ ...t, ...next });
  const number = (v: string) => Math.max(0, Number(v) || 0);

  return (
    <div className="catalog">
      <p className="note">
        Appliquée à chaque nouvelle fiche, après « Enregistrer pour la table ». Les fiches déjà
        créées ne changent pas.
      </p>
      <div className="catalog-form">
        <div className="catalog-grid">
          {draft.rules.stats.map((s) => (
            <label key={s.key}>
              {s.label}
              <input
                className="field"
                type="number"
                aria-label={`${s.label} de départ`}
                placeholder="Auto"
                value={t.stats[s.key] ?? ""}
                onChange={(e) => {
                  const stats = { ...t.stats };
                  if (e.target.value === "") delete stats[s.key];
                  else stats[s.key] = Number(e.target.value);
                  patch({ stats });
                }}
              />
            </label>
          ))}
        </div>
        <div className="catalog-grid">
          {draft.modules.money && (
            <label>
              {draft.words.money} de départ
              <input
                className="field"
                type="number"
                min={0}
                aria-label="Argent de départ"
                value={t.money}
                onChange={(e) => patch({ money: number(e.target.value) })}
              />
            </label>
          )}
          {draft.modules.slots && (
            <label>
              {draft.words.slots} de départ
              <input
                className="field"
                type="number"
                min={0}
                max={20}
                aria-label="Emplacements de départ"
                value={t.slots}
                onChange={(e) => patch({ slots: Math.min(20, number(e.target.value)) })}
              />
            </label>
          )}
        </div>
      </div>

      <h3>{draft.words.skills} de départ</h3>
      {t.skills.map((skill, i) => (
        <div className="template-skill" key={i}>
          <input
            className="field"
            aria-label={`Nom de la compétence ${i + 1}`}
            maxLength={60}
            value={skill.name}
            onChange={(e) =>
              patch({
                skills: t.skills.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
              })
            }
          />
          <select
            className="field"
            aria-label={`Caractéristique de la compétence ${i + 1}`}
            value={skill.stat}
            onChange={(e) =>
              patch({
                skills: t.skills.map((x, j) => (j === i ? { ...x, stat: e.target.value } : x)),
              })
            }
          >
            {draft.rules.stats.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <input
            className="field"
            type="number"
            min={0}
            aria-label={`Niveau de la compétence ${i + 1}`}
            value={skill.level}
            onChange={(e) =>
              patch({
                skills: t.skills.map((x, j) =>
                  j === i ? { ...x, level: number(e.target.value) } : x,
                ),
              })
            }
          />
          <Button
            variant="prototype"
            className="icon-btn cut-s"
            aria-label={`Retirer la compétence ${i + 1}`}
            onClick={() => patch({ skills: t.skills.filter((_, j) => j !== i) })}
          >
            <X />
          </Button>
        </div>
      ))}
      <div className="catalog-tools">
        <Button
          variant="prototype"
          className="btn"
          disabled={!draft.rules.stats.length}
          onClick={() =>
            patch({
              skills: [
                ...t.skills,
                { name: "Nouvelle compétence", stat: draft.rules.stats[0]?.key ?? "", level: 1 },
              ],
            })
          }
        >
          Ajouter une compétence
        </Button>
      </div>

      <h3>Objets de départ</h3>
      {items.length === 0 ? (
        <p className="note">Remplis d’abord le catalogue au-dessus.</p>
      ) : (
        <div className="template-items">
          {items.map((item) => (
            <label key={item.id}>
              <input
                type="checkbox"
                checked={t.items.includes(item.id)}
                onChange={(e) =>
                  patch({
                    items: e.target.checked
                      ? [...t.items, item.id]
                      : t.items.filter((id) => id !== item.id),
                  })
                }
              />
              {item.name}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

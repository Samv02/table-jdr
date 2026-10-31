import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Download,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmAction } from "@/components/ConfirmDialog";
import { useUniverse } from "@/lib/universe-context";
import { HpVisual } from "@/components/HpVisual";
import { FormulaField } from "@/components/FormulaField";
import { SkillBulkAdd } from "@/components/SkillLibrary";
import { missingSkills } from "@/lib/sheet";
import type { FormulaVar } from "@/lib/formula-builder";
import { varKey } from "@/lib/formula";
import { hpVisualsFor } from "@/lib/hp-visual";
import { Ban, CloudFog, CloudRain, Flame, Sparkles, Wind } from "lucide-react";
import { CatalogManager } from "@/components/CatalogManager";
import { TemplateEditor } from "@/components/TemplateEditor";
import {
  FONTS,
  PRESETS,
  normalizeUniverse,
  skillBaseFor,
  skillRollLabel,
  universeErrors,
  type Atmosphere,
  type CritRule,
  type FieldDef,
  type GaugeDef,
  type Hue,
  type StatDef,
  type TemplateSkill,
  type Universe,
  type Words,
} from "@/lib/universe";

/**
 * MJ → Univers : tout ce qui change d'un jeu à l'autre.
 * Les changements s'affichent tout de suite sur l'écran du MJ (aperçu) ;
 * « Enregistrer » les envoie à toute la table, en direct.
 */
const CORNERS = [
  { key: "cut", label: "Coupés" },
  { key: "round", label: "Arrondis" },
  { key: "square", label: "Droits" },
  { key: "scroll", label: "Parchemin" },
] as const;
const ATMOSPHERES = [
  { key: "none", label: "Aucune", icon: Ban },
  { key: "rain", label: "Pluie", icon: CloudRain },
  { key: "embers", label: "Braises", icon: Flame },
  { key: "ash", label: "Cendres", icon: Wind },
  { key: "stars", label: "Étoiles", icon: Sparkles },
  { key: "fog", label: "Brume", icon: CloudFog },
] as const;

export function UniverseEditor() {
  const { saved, save, preview } = useUniverse();
  const [draft, setDraft] = useState<Universe>(saved);
  const [busy, setBusy] = useState(false);
  const [previewHp, setPreviewHp] = useState(60);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const errors = useMemo(() => universeErrors(draft), [draft]);
  const formulaVars: FormulaVar[] = [
    ...draft.rules.stats.map((st) => ({ code: st.key, label: st.label })),
    ...draft.rules.infoFields.map((i) => ({ code: varKey(i.key), label: i.label })),
  ];
  const skillVars: FormulaVar[] = [
    { code: "STAT", label: "Carac de la compétence" },
    { code: "NIV", label: "Niveau de la compétence" },
    ...formulaVars,
  ];
  const woundVars: FormulaVar[] = [
    { code: "MAX", label: `${draft.words.hp} maximum` },
    ...formulaVars,
  ];
  const hasErrors = Object.keys(errors).length > 0;

  // Si un autre MJ enregistre pendant qu'on ne modifie rien, on suit
  useEffect(() => {
    if (!dirty) setDraft(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);
  // Aperçu en direct sur l'écran du MJ ; on revient à l'univers enregistré en quittant la page
  useEffect(() => {
    preview(dirty ? draft : null);
  }, [draft, dirty, preview]);
  useEffect(() => () => preview(null), [preview]);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 5000);
    return () => clearTimeout(t);
  }, [msg]);

  const set = (fn: (u: Universe) => Universe) => setDraft((d) => fn(structuredClone(d)));
  const theme = <K extends keyof Universe["theme"]>(k: K, v: Universe["theme"][K]) =>
    set((u) => ({ ...u, theme: { ...u.theme, [k]: v } }));
  const word = (k: keyof Words, v: string) => set((u) => ({ ...u, words: { ...u.words, [k]: v } }));
  const rule = <K extends keyof Universe["rules"]>(k: K, v: Universe["rules"][K]) =>
    set((u) => ({ ...u, rules: { ...u.rules, [k]: v } }));
  const mod = (k: keyof Universe["modules"], v: boolean) =>
    set((u) => ({ ...u, modules: { ...u.modules, [k]: v } }));

  async function applyPreset(id: string) {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    if (
      !(await confirmAction({
        title: `Partir du modèle « ${p.label} » ?`,
        message:
          "Couleurs, polices, vocabulaire et règles seront remplacés dans ce brouillon. Rien n'est envoyé à la table tant que tu n'as pas enregistré.",
        confirmLabel: "Utiliser ce modèle",
      }))
    )
      return;
    setDraft(structuredClone(p.universe));
  }

  async function submit() {
    setBusy(true);
    const err = await save(draft);
    setBusy(false);
    setMsg(
      err
        ? { ok: false, text: `Enregistrement impossible : ${err}` }
        : { ok: true, text: "Univers enregistré pour toute la table." },
    );
  }

  function exportFile() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `univers_${draft.words.tableName.replace(/\W+/g, "_") || "table"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  async function importFile(f: File) {
    try {
      setDraft(normalizeUniverse(JSON.parse(await f.text())));
      setMsg({ ok: true, text: "Univers importé dans le brouillon : vérifie puis enregistre." });
    } catch {
      setMsg({
        ok: false,
        text: "Fichier illisible : il faut un fichier univers exporté depuis cette page.",
      });
    }
  }

  const statKeys = draft.rules.stats.map((s) => s.key);
  const sample = draft.rules.stats[0];
  const sampleBase = skillBaseFor(
    draft,
    draft.rules.rollMode === "under" ? 40 : draft.rules.skillDice.sides >= 20 ? 14 : 5,
    3,
    {},
  );

  return (
    <div className="uni">
      <section className="panel cut uni-presets">
        <div className="ph">
          <h2>Modèles d'univers</h2>
          <span className="tag">POINT DE DÉPART</span>
        </div>
        <p className="note">
          Choisis un modèle proche de ton jeu, puis ajuste tout ce que tu veux en dessous. Rien
          n'est envoyé aux joueurs avant « Enregistrer ».
        </p>
        <div className="uni-preset-list">
          {PRESETS.map((p) => (
            <Button
              key={p.id}
              className={`uni-preset ${draft.preset === p.id ? "on" : ""}`}
              onClick={() => void applyPreset(p.id)}
              style={{
                ["--p-bg" as string]: p.universe.theme.bg,
                ["--p-panel" as string]: p.universe.theme.panel,
                ["--p-a" as string]: p.universe.theme.cyan,
                ["--p-b" as string]: p.universe.theme.pink,
                ["--p-c" as string]: p.universe.theme.yellow,
                ["--p-text" as string]: p.universe.theme.text,
              }}
            >
              <span className="uni-swatch" aria-hidden>
                <i />
                <i />
                <i />
              </span>
              <b>{p.label}</b>
              <small>{p.description}</small>
            </Button>
          ))}
        </div>
      </section>

      <Section title="Nom et ambiance de la table" tag="IDENTITÉ" open>
        <div className="uni-grid two">
          <Text
            label="Nom de la table"
            value={draft.words.tableName}
            onChange={(v) => word("tableName", v)}
          />
          <Text
            label="Sous-titre"
            value={draft.words.tagline}
            onChange={(v) => word("tagline", v)}
          />
        </div>
      </Section>

      <Section title="Apparence" tag="THÈME">
        <h3 className="uni-sub">Couleurs</h3>
        <div className="uni-colors">
          <Color label="Fond" value={draft.theme.bg} onChange={(v) => theme("bg", v)} />
          <Color label="Panneaux" value={draft.theme.panel} onChange={(v) => theme("panel", v)} />
          <Color label="Texte" value={draft.theme.text} onChange={(v) => theme("text", v)} />
          <Color
            label="Texte discret"
            value={draft.theme.mute}
            onChange={(v) => theme("mute", v)}
          />
          <Color
            label="Principale"
            hint="titres, liens, cadres"
            value={draft.theme.cyan}
            onChange={(v) => theme("cyan", v)}
          />
          <Color
            label="Secondaire"
            hint="dégâts, accents"
            value={draft.theme.pink}
            onChange={(v) => theme("pink", v)}
          />
          <Color
            label="Mise en avant"
            hint="boutons, chiffres"
            value={draft.theme.yellow}
            onChange={(v) => theme("yellow", v)}
          />
          <Color
            label="Danger"
            hint="blessures, suppression"
            value={draft.theme.red}
            onChange={(v) => theme("red", v)}
          />
          <Color
            label="Réussite"
            hint="santé, critiques"
            value={draft.theme.green}
            onChange={(v) => theme("green", v)}
          />
          <Color
            label="Mystique"
            hint="jauges, musique"
            value={draft.theme.violet}
            onChange={(v) => theme("violet", v)}
          />
        </div>
        <h3 className="uni-sub">Polices</h3>
        <div className="uni-grid three">
          <FontSelect
            label="Titres"
            value={draft.theme.fontDisplay}
            onChange={(v) => theme("fontDisplay", v)}
          />
          <FontSelect
            label="Texte"
            value={draft.theme.fontBody}
            onChange={(v) => theme("fontBody", v)}
          />
          <FontSelect
            label="Chiffres et étiquettes"
            value={draft.theme.fontMono}
            onChange={(v) => theme("fontMono", v)}
          />
        </div>
        <h3 className="uni-sub">Visuel de la santé</h3>
        <p className="note">
          Comment les joueurs voient leurs {draft.words.hp}. Les visuels conseillés pour ton thème
          passent en premier.
        </p>
        <label className="uni-field hp-preview-range">
          <span>Aperçu à {previewHp} %</span>
          <input
            type="range"
            min={0}
            max={100}
            aria-label="Santé de l’aperçu"
            value={previewHp}
            onChange={(e) => setPreviewHp(Number(e.target.value))}
          />
        </label>
        <div className="visual-choices" role="radiogroup" aria-label="Visuel de la santé">
          {hpVisualsFor(draft.preset).map((v) => (
            <Button
              key={v.key}
              role="radio"
              aria-checked={draft.theme.hpVisual === v.key}
              className={`visual-choice ${draft.theme.hpVisual === v.key ? "on" : ""}`}
              onClick={() => theme("hpVisual", v.key)}
            >
              <span className="visual-sample">
                <HpVisual style={v.key} hp={previewHp} max={100} />
              </span>
              <b>{v.label}</b>
              {v.recommended && <small>Conseillé</small>}
            </Button>
          ))}
        </div>
        <h3 className="uni-sub">Coins des cadres</h3>
        <div className="visual-choices small" role="radiogroup" aria-label="Coins des cadres">
          {CORNERS.map((c) => (
            <Button
              key={c.key}
              role="radio"
              aria-checked={draft.theme.corners === c.key}
              className={`visual-choice ${draft.theme.corners === c.key ? "on" : ""}`}
              onClick={() => theme("corners", c.key)}
            >
              <span className={`corner-sample corner-${c.key}`} />
              <b>{c.label}</b>
            </Button>
          ))}
        </div>
        <h3 className="uni-sub">Ambiance animée du fond</h3>
        <div
          className="visual-choices small"
          role="radiogroup"
          aria-label="Ambiance animée du fond"
        >
          {ATMOSPHERES.map(({ key, label, icon: Icon }) => (
            <Button
              key={key}
              role="radio"
              aria-checked={draft.theme.atmosphere === key}
              className={`visual-choice ${draft.theme.atmosphere === key ? "on" : ""}`}
              onClick={() => theme("atmosphere", key)}
            >
              <span className="visual-sample">
                <Icon size={26} aria-hidden="true" />
              </span>
              <b>{label}</b>
            </Button>
          ))}
        </div>
        <h3 className="uni-sub">Style</h3>
        <div className="uni-grid two">
          <Toggle
            label="Effets néon (lueurs)"
            value={draft.theme.glow}
            onChange={(v) => theme("glow", v)}
          />
          <Toggle
            label="Lignes d'écran (scanlines)"
            value={draft.theme.scanlines}
            onChange={(v) => theme("scanlines", v)}
          />
        </div>
      </Section>

      <Section title="Vocabulaire" tag="MOTS AFFICHÉS">
        <p className="note">Les noms que voient les joueurs partout dans l'appli.</p>
        {WORD_GROUPS.map(([group, keys]) => (
          <div key={group}>
            <h3 className="uni-sub">{group}</h3>
            <div className="uni-grid three">
              {keys.map(([k, label]) => (
                <Text key={k} label={label} value={draft.words[k]} onChange={(v) => word(k, v)} />
              ))}
            </div>
          </div>
        ))}
      </Section>

      <Section
        title="Caractéristiques"
        tag={`${draft.rules.stats.length} CARACS`}
        error={errors["stats"]}
      >
        <p className="note">
          Le <b>code</b> sert dans les formules et dans les fiches (ex. <code>FOR</code>). Change-le
          avant de remplir des fiches : les valeurs déjà saisies restent rangées sous l'ancien code.
        </p>
        <ListEditor<StatDef>
          items={draft.rules.stats}
          max={16}
          columns={["Code", "Nom affiché"]}
          onChange={(stats) => rule("stats", stats)}
          make={(list) => ({ key: freeKey("STAT", list), label: `Carac ${list.length + 1}` })}
          render={(s, patch) => (
            <>
              <input
                className="field mono"
                aria-label="Code"
                value={s.key}
                maxLength={12}
                onChange={(e) => patch({ key: varKey(e.target.value) })}
              />
              <input
                className="field"
                aria-label="Nom affiché"
                value={s.label}
                maxLength={24}
                onChange={(e) => patch({ label: e.target.value })}
              />
            </>
          )}
        />
      </Section>

      <Section
        title="Jets de compétence"
        tag={skillRollLabel(draft, sampleBase)}
        error={errors["skillBase"]}
      >
        <div className="uni-grid three">
          <label className="uni-field">
            <span>Dé lancé</span>
            <span className="uni-dice">
              <input
                className="field"
                type="number"
                min={1}
                max={10}
                aria-label="Nombre de dés"
                value={draft.rules.skillDice.count}
                onChange={(e) =>
                  rule("skillDice", {
                    ...draft.rules.skillDice,
                    count: clamp(Number(e.target.value), 1, 10),
                  })
                }
              />
              <b>d</b>
              <select
                className="field"
                aria-label="Faces"
                value={draft.rules.skillDice.sides}
                onChange={(e) =>
                  rule("skillDice", { ...draft.rules.skillDice, sides: Number(e.target.value) })
                }
              >
                {[4, 6, 8, 10, 12, 20, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </span>
          </label>
          <Seg
            label="Réussite"
            value={draft.rules.rollMode}
            options={[
              ["over", "Dé + base, le MJ fixe la difficulté"],
              ["under", "Faire moins que la base (%)"],
            ]}
            onChange={(v) => rule("rollMode", v)}
          />
          <FormulaField
            label="Base d'une compétence"
            vars={skillVars}
            value={draft.rules.skillBase}
            error={errors["skillBase"]}
            onChange={(v) => rule("skillBase", v)}
          />
          <CritSelect
            label="Réussite critique"
            value={draft.rules.crit}
            onChange={(v) => rule("crit", v)}
          />
          <CritSelect
            label="Échec critique"
            value={draft.rules.fumble}
            onChange={(v) => rule("fumble", v)}
          />
        </div>
        <p className="uni-example">
          Exemple :{" "}
          {sample
            ? `${sample.label} ${draft.rules.rollMode === "under" ? 40 : draft.rules.skillDice.sides >= 20 ? 14 : 5}`
            : "carac"}
          , niveau 3 → <b>{skillRollLabel(draft, sampleBase)}</b>
        </p>
      </Section>

      <Section
        title="Santé et ressources"
        tag="PV · JAUGES · DÉFENSES"
        error={
          errors["hpMax"] ??
          errors["woundedAt"] ??
          errors["deathSave"] ??
          Object.entries(errors).find(([k]) => k.startsWith("gauge"))?.[1]
        }
      >
        <div className="uni-grid three">
          <FormulaField
            label={`${draft.words.hp} maximum`}
            vars={formulaVars}
            emptyLabel="Saisi à la main sur chaque fiche"
            value={draft.rules.hpMax}
            error={errors["hpMax"]}
            onChange={(v) => rule("hpMax", v)}
          />
          <FormulaField
            label={`Seuil « ${draft.words.wounded} »`}
            vars={woundVars}
            emptyLabel="Pas de seuil"
            value={draft.rules.woundedAt}
            error={errors["woundedAt"]}
            onChange={(v) => rule("woundedAt", v)}
          />
          <div className="uni-field">
            <Toggle
              label="Jet de sauvegarde contre la mort"
              value={draft.rules.deathSave !== null}
              onChange={(v) =>
                rule("deathSave", v ? { label: "Jet de mort", formula: statKeys[0] ?? "10" } : null)
              }
            />
            {draft.rules.deathSave && (
              <span className="uni-inline">
                <input
                  className="field"
                  aria-label="Nom du jet"
                  value={draft.rules.deathSave.label}
                  maxLength={40}
                  onChange={(e) =>
                    rule("deathSave", { ...draft.rules.deathSave!, label: e.target.value })
                  }
                />
              </span>
            )}
            {draft.rules.deathSave && (
              <FormulaField
                label="Calcul du jet"
                vars={formulaVars}
                value={draft.rules.deathSave.formula}
                error={errors["deathSave"]}
                onChange={(formula) => rule("deathSave", { ...draft.rules.deathSave!, formula })}
              />
            )}
          </div>
        </div>
        <h3 className="uni-sub">Jauges (humanité, mana, santé mentale…)</h3>
        <ListEditor<GaugeDef>
          items={draft.rules.gauges}
          max={8}
          columns={["Nom", "Couleur"]}
          onChange={(gauges) => rule("gauges", gauges)}
          make={(list) => ({
            key: `${freeKey("gauge", list)}Current`,
            label: `Jauge ${list.length + 1}`,
            max: "10",
            color: "violet",
          })}
          render={(g, patch, i) => (
            <>
              <input
                className="field"
                aria-label="Nom de la jauge"
                value={g.label}
                maxLength={24}
                onChange={(e) => patch({ label: e.target.value })}
              />
              <select
                className="field"
                aria-label="Couleur"
                value={g.color}
                onChange={(e) => patch({ color: e.target.value as Hue })}
              >
                {HUE_LABELS.map(([h, l]) => (
                  <option key={h} value={h}>
                    {l}
                  </option>
                ))}
              </select>
              <div className="ff-row">
                <FormulaField
                  label={`Maximum de ${g.label}`}
                  vars={formulaVars}
                  emptyLabel="Saisi à la main sur chaque fiche"
                  value={g.max}
                  error={errors[`gauge${i}`]}
                  onChange={(max) => patch({ max })}
                />
              </div>
            </>
          )}
        />
        <div className="uni-grid two">
          <div>
            <h3 className="uni-sub">Défenses (armures, protections)</h3>
            <ListEditor<FieldDef>
              items={draft.rules.defenses}
              max={8}
              columns={["Nom"]}
              onChange={(d) => rule("defenses", d)}
              make={(list) => ({
                key: freeKey("defense", list),
                label: `Défense ${list.length + 1}`,
              })}
              render={(f, patch) => (
                <input
                  className="field"
                  aria-label="Nom de la défense"
                  value={f.label}
                  maxLength={24}
                  onChange={(e) => patch({ label: e.target.value })}
                />
              )}
            />
          </div>
          <div>
            <h3 className="uni-sub">Champs sous le nom (classe, niveau…)</h3>
            <ListEditor<FieldDef>
              items={draft.rules.infoFields}
              max={6}
              columns={["Nom"]}
              onChange={(d) => rule("infoFields", d)}
              make={(list) => ({ key: freeKey("info", list), label: `Champ ${list.length + 1}` })}
              render={(f, patch) => (
                <input
                  className="field"
                  aria-label="Nom du champ"
                  value={f.label}
                  maxLength={24}
                  onChange={(e) => patch({ label: e.target.value })}
                />
              )}
            />
            <p className="note">
              Ces champs sont proposés automatiquement dans les calculs : s’ils contiennent un
              nombre, ils s’utilisent comme une caractéristique.
            </p>
          </div>
        </div>
      </Section>

      <Section title="Combat" tag="ARMES" error={errors["unarmed"]}>
        <div className="uni-grid three">
          <StatSelect
            label="Carac des armes à distance (sans compétence)"
            stats={draft.rules.stats}
            value={draft.rules.rangedStat}
            onChange={(v) => rule("rangedStat", v)}
          />
          <StatSelect
            label="Carac des armes de mêlée (sans compétence)"
            stats={draft.rules.stats}
            value={draft.rules.meleeStat}
            onChange={(v) => rule("meleeStat", v)}
          />
          <Toggle
            label="Tir automatique (×10)"
            value={draft.rules.autofire}
            onChange={(v) => rule("autofire", v)}
          />
          <div className="uni-field">
            <Toggle
              label="Dégâts à mains nues calculés"
              value={draft.rules.unarmed !== null}
              onChange={(v) => rule("unarmed", v ? { count: "1", sides: 6 } : null)}
            />
            {draft.rules.unarmed && (
              <FormulaField
                label="Nombre de dés"
                vars={formulaVars}
                value={draft.rules.unarmed.count}
                error={errors["unarmed"]}
                onChange={(count) => rule("unarmed", { ...draft.rules.unarmed!, count })}
              />
            )}
            {draft.rules.unarmed && (
              <span className="uni-inline">
                <b>Dé à</b>
                <select
                  className="field"
                  aria-label="Faces du dé"
                  value={draft.rules.unarmed.sides}
                  onChange={(e) =>
                    rule("unarmed", { ...draft.rules.unarmed!, sides: Number(e.target.value) })
                  }
                >
                  {[3, 4, 6, 8, 10, 12].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </span>
            )}
          </div>
        </div>
        <label className="uni-field">
          <span>Compétences affichées en premier (une par ligne, début du nom)</span>
          <textarea
            className="field"
            rows={4}
            value={draft.rules.skillOrder.join("\n")}
            placeholder={"Vide = ordre alphabétique"}
            onChange={(e) =>
              rule(
                "skillOrder",
                e.target.value
                  .split("\n")
                  .map((l) => l.trimStart())
                  .slice(0, 60),
              )
            }
          />
        </label>
      </Section>

      <Section
        title="Compétences de la table"
        tag={`${draft.rules.skillLibrary.length} PRÊTES`}
        error={errors["skillLibrary"]}
      >
        <p className="note">
          Prépare-les une fois : sur chaque fiche, elles s’ajoutent d’un clic et leur dé se calcule
          avec la caractéristique choisie ici.
        </p>
        <ListEditor<TemplateSkill>
          items={draft.rules.skillLibrary}
          max={120}
          columns={["Nom", "Caractéristique", "Niveau de départ"]}
          onChange={(skillLibrary) => rule("skillLibrary", skillLibrary)}
          make={(list) => ({
            name: `Compétence ${list.length + 1}`,
            stat: draft.rules.stats[0]?.key ?? "",
            level: 0,
          })}
          render={(s, patch) => (
            <>
              <input
                className="field"
                aria-label="Nom de la compétence"
                maxLength={60}
                value={s.name}
                onChange={(e) => patch({ name: e.target.value })}
              />
              <select
                className="field"
                aria-label={`Caractéristique de ${s.name}`}
                value={s.stat}
                onChange={(e) => patch({ stat: e.target.value })}
              >
                {draft.rules.stats.map((st) => (
                  <option key={st.key} value={st.key}>
                    {st.label}
                  </option>
                ))}
              </select>
              <input
                className="field"
                type="number"
                min={0}
                aria-label={`Niveau de départ de ${s.name}`}
                value={s.level}
                onChange={(e) => patch({ level: Math.max(0, Number(e.target.value) || 0) })}
              />
            </>
          )}
        />
        <SkillBulkAdd
          u={draft}
          onAdd={(items) =>
            rule("skillLibrary", [
              ...draft.rules.skillLibrary,
              ...missingSkills(items, draft.rules.skillLibrary),
            ])
          }
        />
      </Section>

      <Section title="Catalogue" tag="ARMES · OBJETS · POUVOIRS">
        <CatalogManager />
      </Section>

      <Section title="Fiche de départ" tag="NOUVEAUX PERSONNAGES">
        <TemplateEditor draft={draft} onChange={(template) => set((d) => ({ ...d, template }))} />
      </Section>

      <Section title="Blocs de la fiche" tag="MODULES">
        <div className="uni-grid three">
          <Toggle
            label={`Munitions (${draft.words.rounds})`}
            value={draft.modules.ammo}
            onChange={(v) => mod("ammo", v)}
          />
          <Toggle
            label={`Argent (${draft.words.money})`}
            value={draft.modules.money}
            onChange={(v) => mod("money", v)}
          />
          <Toggle
            label={`Emplacements (${draft.words.slots})`}
            value={draft.modules.slots}
            onChange={(v) => mod("slots", v)}
          />
          <Toggle
            label={draft.words.features}
            value={draft.modules.features}
            onChange={(v) => mod("features", v)}
          />
          <Toggle
            label={draft.words.shop}
            value={draft.modules.shop}
            onChange={(v) => mod("shop", v)}
          />
        </div>
      </Section>

      <div className={`uni-bar ${dirty ? "dirty" : ""}`}>
        <span className="uni-state">
          {hasErrors ? (
            <>
              <X size={14} /> {Object.keys(errors).length} formule(s) à corriger
            </>
          ) : dirty ? (
            "Aperçu sur ton écran seulement · pas encore envoyé"
          ) : (
            <>
              <Check size={14} /> Univers à jour pour toute la table
            </>
          )}
        </span>
        <span className="uni-actions">
          <Button
            className="btn"
            title="Exporter l'univers (fichier)"
            aria-label="Exporter"
            onClick={exportFile}
          >
            <Download size={16} />
          </Button>
          <Button
            className="btn"
            title="Importer un univers (fichier)"
            aria-label="Importer"
            onClick={() => file.current?.click()}
          >
            <Upload size={16} />
          </Button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importFile(f);
              e.target.value = "";
            }}
          />
          <Button className="btn" disabled={!dirty || busy} onClick={() => setDraft(saved)}>
            <RotateCcw size={15} /> Annuler
          </Button>
          <Button
            className="btn y"
            disabled={!dirty || busy || hasErrors}
            onClick={() => void submit()}
          >
            {busy ? "Enregistrement…" : "Enregistrer pour la table"}
          </Button>
        </span>
        {msg && (
          <p className={`uni-msg ${msg.ok ? "ok" : "ko"}`} role="status">
            {msg.text}
          </p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
const WORD_GROUPS: [string, [keyof Words, string][]][] = [
  [
    "Santé",
    [
      ["vitals", "Titre du bloc"],
      ["hp", "Points de vie (abrégé)"],
      ["hpOk", "État : en forme"],
      ["hpHurt", "État : blessé"],
      ["hpDying", "État : à terre"],
      ["wounded", "Seuil de blessure"],
    ],
  ],
  [
    "Sections de la fiche",
    [
      ["stats", "Caractéristiques"],
      ["skills", "Compétences"],
      ["weapons", "Armes"],
      ["features", "Particularités"],
      ["inventory", "Inventaire"],
      ["shop", "Boutique"],
      ["notes", "Bloc-notes"],
    ],
  ],
  [
    "Argent",
    [
      ["money", "Nom"],
      ["moneySymbol", "Symbole"],
    ],
  ],
  [
    "Messagerie",
    [
      ["messaging", "Nom de la messagerie"],
      ["announcements", "Messages du MJ à tous"],
      ["privateCall", "Échange entre joueurs"],
      ["privateCalls", "… au pluriel"],
    ],
  ],
  [
    "Emplacements (cyberdeck, grimoire…)",
    [
      ["slots", "Titre du bloc"],
      ["slotItem", "Un élément"],
      ["slotUnit", "Unité de place"],
    ],
  ],
  [
    "Combat et munitions",
    [
      ["attack", "Attaque"],
      ["damage", "Dégâts"],
      ["rof", "Cadence"],
      ["magazine", "Chargé dans l'arme"],
      ["spare", "Recharges"],
      ["loose", "Vrac"],
      ["rounds", "Munitions (pluriel)"],
      ["fire", "Bouton tirer"],
      ["reload", "Bouton recharger"],
    ],
  ],
  ["Divers", [["playerDefault", "Joueur (nom générique)"]]],
];
const HUE_LABELS: [Hue, string][] = [
  ["cyan", "Principale"],
  ["pink", "Secondaire"],
  ["yellow", "Mise en avant"],
  ["red", "Danger"],
  ["green", "Réussite"],
  ["violet", "Mystique"],
];
/** Clé libre : préfixe + premier numéro pas encore utilisé dans la liste */
function freeKey(prefix: string, list: { key: string }[]) {
  let n = list.length + 1;
  while (list.some((x) => x.key === `${prefix}${n}` || x.key === `${prefix}${n}Current`)) n++;
  return `${prefix}${n}`;
}
const clamp = (n: number, a: number, b: number) =>
  Number.isFinite(n) ? Math.min(b, Math.max(a, Math.round(n))) : a;

function Section({
  title,
  tag,
  error,
  open,
  children,
}: {
  title: string;
  tag?: string;
  error?: string | undefined;
  open?: boolean;
  children: ReactNode;
}) {
  return (
    <details className={`panel cut uni-section ${error ? "has-error" : ""}`} open={open}>
      <summary className="ph">
        <h2>{title}</h2>
        {error ? (
          <span className="tag bad">À CORRIGER</span>
        ) : tag ? (
          <span className="tag">{tag}</span>
        ) : null}
      </summary>
      <div className="uni-body">{children}</div>
    </details>
  );
}
function Text({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="uni-field">
      <span>{label}</span>
      <input
        className="field"
        value={value}
        maxLength={60}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
function Color({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="uni-color">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
      />
      <span>
        <b>{label}</b>
        {hint && <small>{hint}</small>}
      </span>
    </label>
  );
}
function FontSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="uni-field">
      <span>{label}</span>
      <select className="field" value={value} onChange={(e) => onChange(e.target.value)}>
        {FONTS.map((f) => (
          <option key={f.id} value={f.id}>
            {f.label}
          </option>
        ))}
      </select>
    </label>
  );
}
function Seg<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div className="uni-field">
      <span>{label}</span>
      <div className="uni-seg" role="radiogroup" aria-label={label}>
        {options.map(([v, l]) => (
          <Button
            key={v}
            role="radio"
            aria-checked={value === v}
            className={value === v ? "on" : ""}
            onClick={() => onChange(v)}
          >
            {l}
          </Button>
        ))}
      </div>
    </div>
  );
}
function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Button
      role="switch"
      aria-checked={value}
      className={`uni-toggle ${value ? "on" : ""}`}
      onClick={() => onChange(!value)}
    >
      <i aria-hidden />
      <span>{label}</span>
    </Button>
  );
}
function CritSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: CritRule;
  onChange: (v: CritRule) => void;
}) {
  return (
    <label className="uni-field">
      <span>{label}</span>
      <select
        className="field"
        value={value}
        onChange={(e) => onChange(e.target.value as CritRule)}
      >
        <option value="max">Dé au maximum (ex. 10 sur d10)</option>
        <option value="min">Dé à 1 (ex. 01 sur d100)</option>
        <option value="doubles">Doubles sur d100 (11, 22…)</option>
        <option value="none">Jamais</option>
      </select>
    </label>
  );
}
function StatSelect({
  label,
  stats,
  value,
  onChange,
}: {
  label: string;
  stats: StatDef[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="uni-field">
      <span>{label}</span>
      <select className="field" value={value} onChange={(e) => onChange(e.target.value)}>
        {!stats.some((s) => s.key === value) && <option value={value}>{value || "—"}</option>}
        {stats.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label} ({s.key})
          </option>
        ))}
      </select>
    </label>
  );
}

/** Liste modifiable : ajouter, retirer, monter, descendre */
function ListEditor<T>({
  items,
  max,
  columns,
  onChange,
  make,
  render,
}: {
  items: T[];
  max: number;
  columns: string[];
  onChange: (items: T[]) => void;
  make: (items: T[]) => T;
  render: (item: T, patch: (p: Partial<T>) => void, index: number) => ReactNode;
}) {
  const move = (i: number, d: number) => {
    const next = [...items];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x as T);
    onChange(next);
  };
  return (
    <div className="uni-list" style={{ ["--cols" as string]: columns.length }}>
      {items.length > 0 && (
        <div className="uni-row head" aria-hidden>
          {columns.map((c) => (
            <span key={c}>{c}</span>
          ))}
          <span />
        </div>
      )}
      {items.map((item, i) => (
        <div className="uni-row" key={i}>
          {render(item, (p) => onChange(items.map((x, j) => (j === i ? { ...x, ...p } : x))), i)}
          <span className="uni-row-acts">
            <Button aria-label="Monter" disabled={i === 0} onClick={() => move(i, -1)}>
              <ArrowUp size={14} />
            </Button>
            <Button
              aria-label="Descendre"
              disabled={i === items.length - 1}
              onClick={() => move(i, 1)}
            >
              <ArrowDown size={14} />
            </Button>
            <Button
              aria-label="Retirer"
              className="del"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
            >
              <Trash2 size={14} />
            </Button>
          </span>
        </div>
      ))}
      {items.length < max && (
        <Button className="uni-add" onClick={() => onChange([...items, make(items)])}>
          <Plus size={14} /> Ajouter
        </Button>
      )}
    </div>
  );
}

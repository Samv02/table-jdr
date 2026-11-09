import { useState, type CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BringToFront,
  Copy,
  ImagePlus,
  Library,
  RotateCcw,
  Sun,
  RotateCw,
  SendToBack,
  Trash2,
} from "lucide-react";
import { SYMBOL_ICONS } from "@/components/map-symbols";
import { Actions, ConeControls, Section, Slider, Stepper, Tiles } from "@/components/MapInspector";
import { DEFAULT_CONE } from "@/lib/map-cones";
import { Button } from "@/components/ui/button";
import { LIGHT_SIZES } from "@/lib/map-light";
import {
  LIGHT_BOX,
  SYMBOL_GROUPS,
  SYMBOL_LABELS,
  TEXT_MAX,
  boxOf,
  symbolColor,
  type MapObject,
  type ObjectPatch,
} from "@/lib/map-objects";
import { OBJECT_LOOKS, type ObjectLook } from "@/lib/map-style";

/** Ce que pose l'outil Objet ou le tampon. */
export type ObjectSource = { k: "symbol"; sym: string } | { k: "image"; src: string };

/** Un symbole dans l'un des styles d'objets, centré sur l'origine. */
export function SymbolArt({
  Icon,
  pw,
  ph,
  look,
  color,
}: {
  Icon: LucideIcon;
  pw: number;
  ph: number;
  look: ObjectLook;
  color: string;
}) {
  const m = Math.min(pw, ph);
  const glyph = (k: number) => (
    <Icon className="glyph" x={(-pw * k) / 2} y={(-ph * k) / 2} width={pw * k} height={ph * k} />
  );
  const style = { "--grp": color } as CSSProperties;
  if (look === "flat")
    return (
      <g className="sym look-flat" style={style}>
        <rect
          className="sym-badge"
          x={-pw / 2 + m * 0.04}
          y={-ph / 2 + m * 0.04}
          width={pw - m * 0.08}
          height={ph - m * 0.08}
          rx={m * 0.26}
        />
        {glyph(0.6)}
      </g>
    );
  if (look === "token")
    return (
      <g className="sym look-token" style={style}>
        <circle className="sym-disc" r={m * 0.47} />
        <circle className="sym-ring" r={m * 0.39} />
        {glyph(0.54)}
      </g>
    );
  if (look === "plan")
    return (
      <g className="sym look-plan">
        <rect className="sym-frame" x={-pw / 2} y={-ph / 2} width={pw} height={ph} />
        {glyph(0.78)}
      </g>
    );
  if (look === "ink")
    return (
      <g className="sym look-ink">
        <ellipse className="sym-wash" rx={pw * 0.46} ry={ph * 0.4} />
        <g filter="url(#map-obj-ink)">
          <g className="sym-echo" transform={`translate(${m * 0.03} ${-m * 0.025})`}>
            {glyph(1)}
          </g>
          {glyph(1)}
        </g>
      </g>
    );
  return <g className={`sym look-${look}`}>{glyph(1)}</g>;
}

/** Petit aperçu d'un symbole dans un style, pour les boutons. */
export function SymbolTile({
  sym,
  look,
  size = 34,
}: {
  sym: string;
  look: ObjectLook;
  size?: number;
}) {
  const Icon = SYMBOL_ICONS[sym];
  if (!Icon) return null;
  return (
    <svg
      className="map-sym-tile"
      viewBox="-22 -22 44 44"
      width={size}
      height={size}
      aria-hidden="true"
    >
      <SymbolArt Icon={Icon} pw={36} ph={36} look={look} color={symbolColor(sym)} />
    </svg>
  );
}

/** Un objet dessiné dans son repère : centré, tourné, à l'échelle d'une case de `cell` pixels. */
export function ObjectView({
  o,
  cell,
  url,
  selected,
  ghost = false,
  handle,
  look = "line",
}: {
  /** Dessin des symboles de la carte, si l'objet n'en choisit pas un */
  look?: ObjectLook;
  o: MapObject;
  cell: number;
  url?: string | undefined;
  selected: boolean;
  /** Objet d'un calque caché aux joueurs, vu par le MJ seulement */
  ghost?: boolean;
  /** Rayon des poignées, en pixels de la carte */
  handle: number;
}) {
  const { w, h } = boxOf(o);
  const pw = w * cell;
  const ph = h * cell;
  const Icon = o.sym ? SYMBOL_ICONS[o.sym] : undefined;
  const steps = o.k === "stairs" ? Math.max(1, Math.round(o.h * (o.steps ?? 3))) : 0;
  return (
    <g
      className={`map-object k-${o.k} ${selected ? "on" : ""} ${ghost ? "is-ghost" : ""}`}
      transform={`translate(${o.x * cell} ${o.y * cell}) rotate(${o.r})`}
      opacity={o.op}
      style={o.color ? ({ "--obj": o.color } as CSSProperties) : undefined}
    >
      {Icon && (
        <SymbolArt Icon={Icon} pw={pw} ph={ph} look={o.look ?? look} color={symbolColor(o.sym)} />
      )}
      {o.k === "image" &&
        (url ? (
          <image
            href={url}
            x={-pw / 2}
            y={-ph / 2}
            width={pw}
            height={ph}
            preserveAspectRatio="xMidYMid meet"
          />
        ) : (
          <rect className="map-object-wait" x={-pw / 2} y={-ph / 2} width={pw} height={ph} />
        ))}
      {o.k === "stairs" && (
        <>
          <rect className="frame" x={-pw / 2} y={-ph / 2} width={pw} height={ph} />
          {Array.from({ length: steps - 1 }, (_, i) => {
            const y = -ph / 2 + ((i + 1) * ph) / steps;
            return <line key={i} x1={-pw / 2} x2={pw / 2} y1={y} y2={y} />;
          })}
          {/* La flèche montre le sens de la montée */}
          <path
            className="arrow"
            d={`M0 ${ph / 2 - 6} L0 ${-ph / 2 + 8} M-5 ${-ph / 2 + 14} L0 ${-ph / 2 + 8} L5 ${-ph / 2 + 14}`}
          />
        </>
      )}
      {o.k === "light" && (
        <>
          {selected && (
            <circle
              className="map-light-range"
              r={(o.rad ?? 4) * cell}
              transform={`rotate(${-o.r})`}
            />
          )}
          <Sun
            className="map-light-icon"
            x={(-LIGHT_BOX * cell) / 2}
            y={(-LIGHT_BOX * cell) / 2}
            width={LIGHT_BOX * cell}
            height={LIGHT_BOX * cell}
          />
        </>
      )}
      {o.k === "camera" && (
        <g className="map-camera-icon">
          <circle r={Math.min(pw, ph) * 0.42} className="base" />
          <path
            className="body"
            d={`M${-pw * 0.17} ${ph * 0.22} L${pw * 0.17} ${ph * 0.22} L${pw * 0.11} ${-ph * 0.36} L${-pw * 0.11} ${-ph * 0.36} Z`}
          />
          <circle className="lens" cy={-ph * 0.27} r={Math.min(pw, ph) * 0.07} />
        </g>
      )}
      {o.k === "text" && (
        <text y={ph * 0.36} fontSize={ph}>
          {o.text}
        </text>
      )}
      {selected && (
        <g className="map-object-handles">
          <rect x={-pw / 2} y={-ph / 2} width={pw} height={ph} />
          <line x1={0} y1={-ph / 2} x2={0} y2={-ph / 2 - cell * 0.6} />
          <circle cx={0} cy={-ph / 2 - cell * 0.6} r={handle} />
          <circle cx={pw / 2} cy={ph / 2} r={handle} />
        </g>
      )}
    </g>
  );
}

/** Bibliothèque : symboles par famille, puis les images importées par le MJ. */
export function ObjectLibrary({
  images,
  urls,
  chosen,
  onPick,
  onUpload,
  onRemoveImage,
  look,
  mapLook,
  onLook,
}: {
  images: string[];
  urls: Record<string, string>;
  chosen: ObjectSource | null;
  onPick: (s: ObjectSource) => void;
  onUpload: (f: File) => void;
  onRemoveImage: (src: string) => void;
  /** Style des prochains symboles posés ; « auto » : celui de la carte */
  look: ObjectLook | "auto";
  mapLook: ObjectLook;
  onLook: (look: ObjectLook | "auto") => void;
}) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string | null>(null);
  const q = query.trim().toLowerCase();
  const shown = look === "auto" ? mapLook : look;
  return (
    <div className="map-library">
      <section className="map-insp-sec">
        <h4>Style des symboles</h4>
        <div className="map-looks" role="radiogroup" aria-label="Style des symboles">
          {[
            { id: "auto" as const, label: "Comme la carte" },
            ...OBJECT_LOOKS.map((l) => ({ id: l.id, label: l.label })),
          ].map((l) => (
            <Button
              key={l.id}
              role="radio"
              aria-checked={look === l.id}
              title={
                l.id === "auto"
                  ? "Le style d’objets du thème de la carte"
                  : OBJECT_LOOKS.find((x) => x.id === l.id)?.hint
              }
              onClick={() => onLook(l.id)}
            >
              <SymbolTile sym="Barrel" look={l.id === "auto" ? mapLook : l.id} size={30} />
              <span>{l.label}</span>
            </Button>
          ))}
        </div>
      </section>
      <input
        className="field"
        type="search"
        placeholder="Chercher : coffre, arbre, table…"
        aria-label="Chercher un symbole"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="map-groups" role="radiogroup" aria-label="Famille">
        <Button role="radio" aria-checked={group === null} onClick={() => setGroup(null)}>
          Tout
        </Button>
        {SYMBOL_GROUPS.map((g) => (
          <Button
            key={g.label}
            role="radio"
            aria-checked={group === g.label}
            onClick={() => setGroup(group === g.label ? null : g.label)}
          >
            {g.label}
          </Button>
        ))}
      </div>
      <h3>Mes images</h3>
      <p className="note plain">
        Tes propres images (PNG transparent de préférence), visibles par ta table seulement.
      </p>
      <div className="map-row">
        <input
          id="map-object-image"
          type="file"
          accept="image/*"
          className="profile-file"
          aria-label="Importer une image"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
            e.target.value = "";
          }}
        />
        <label className="btn" htmlFor="map-object-image">
          <ImagePlus size={15} aria-hidden="true" /> Importer
        </label>
      </div>
      {images.length > 0 && (
        <div className="map-library-grid images">
          {images.map((src) => (
            <span key={src} className="map-library-image">
              <Button
                aria-label="Choisir cette image"
                aria-pressed={chosen?.k === "image" && chosen.src === src}
                onClick={() => onPick({ k: "image", src })}
              >
                {urls[src] ? <img src={urls[src]} alt="" /> : <span aria-hidden="true">…</span>}
              </Button>
              <Button
                className="x"
                aria-label="Supprimer cette image de la bibliothèque"
                onClick={() => onRemoveImage(src)}
              >
                <Trash2 size={12} />
              </Button>
            </span>
          ))}
        </div>
      )}
      {SYMBOL_GROUPS.filter((g) => !group || g.label === group).map((g) => {
        const ids = g.ids.filter((id) => !q || (SYMBOL_LABELS[id] ?? id).toLowerCase().includes(q));
        if (!ids.length) return null;
        return (
          <section key={g.label}>
            <h3>{g.label}</h3>
            <div className="map-library-grid symbols">
              {ids.map((id) => (
                <Button
                  key={id}
                  aria-label={SYMBOL_LABELS[id] ?? id}
                  title={`${SYMBOL_LABELS[id] ?? id} : touche pour choisir, ou glisse sur la carte`}
                  aria-pressed={chosen?.k === "symbol" && chosen.sym === id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("application/x-map-symbol", id);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => onPick({ k: "symbol", sym: id })}
                >
                  <SymbolTile sym={id} look={shown} />
                  <span>{SYMBOL_LABELS[id] ?? id}</span>
                </Button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** Aperçu d'une source (symbole ou image) dans un bouton. */
export function SourcePreview({
  source,
  urls,
}: {
  source: ObjectSource | null;
  urls: Record<string, string>;
}) {
  if (!source) return <Library size={16} aria-hidden="true" />;
  if (source.k === "image")
    return urls[source.src] ? (
      <img className="map-source-img" src={urls[source.src]} alt="" />
    ) : (
      <Library size={16} aria-hidden="true" />
    );
  const Icon = SYMBOL_ICONS[source.sym] ?? Library;
  return <Icon size={16} aria-hidden="true" />;
}

/** Réglages de l'objet choisi. */
export function ObjectEditor({
  o,
  onChange,
  onFront,
  onBack,
  onDuplicate,
  onRemove,
  maps,
  onGo,
  onBring,
  cellValue,
  cellUnit,
  mapLook,
}: {
  o: MapObject;
  onChange: (patch: ObjectPatch) => void;
  onFront: () => void;
  onBack: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  /** Autres cartes de la table, vers lesquelles l'objet peut mener */
  maps: { id: string; name: string }[];
  onGo: (map: string) => void;
  onBring: (map: string) => void;
  /** Échelle de la carte : la portée d'une lumière s'affiche dans son unité */
  cellValue: number;
  cellUnit: string;
  /** Style d'objets de la carte */
  mapLook: ObjectLook;
}) {
  const isLight = o.k === "light";
  const rad = o.rad ?? 4;
  const reach = (cells: number) =>
    `${(cells * cellValue).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} ${cellUnit}`;
  const target = maps.find((m) => m.id === o.link);
  const scale = (k: number) =>
    onChange(
      o.k === "text"
        ? { h: Math.min(10, Math.max(0.2, Math.round(o.h * k * 100) / 100)) }
        : {
            w: Math.min(100, Math.max(0.2, Math.round(o.w * k * 100) / 100)),
            h: Math.min(100, Math.max(0.2, Math.round(o.h * k * 100) / 100)),
          },
    );
  const turn = (d: number) => onChange({ r: (((o.r + d) % 360) + 360) % 360 });
  const names: Record<MapObject["k"], string> = {
    symbol: "Symbole choisi",
    image: "Image choisie",
    stairs: "Escalier choisi",
    text: "Texte choisi",
    light: "Lumière choisie",
    camera: "Caméra choisie",
  };
  return (
    <div className="map-object-edit" aria-label="Objet choisi">
      <h3>{names[o.k]}</h3>
      {o.k === "symbol" && o.sym && (
        <Tiles
          label="Style"
          cols={4}
          value={o.look ?? "auto"}
          options={[
            {
              value: "auto" as const,
              label: "Carte",
              icon: <SymbolTile sym={o.sym} look={mapLook} size={26} />,
              hint: "Suit le style d'objets du thème de la carte.",
            },
            ...OBJECT_LOOKS.map((l) => ({
              value: l.id,
              label: l.label,
              icon: <SymbolTile sym={o.sym!} look={l.id} size={26} />,
              hint: l.hint,
            })),
          ]}
          onChange={(look) => onChange({ look })}
        />
      )}
      {o.k === "camera" && (
        <>
          <Section label="Nom" hint="Montré quand la caméra repère quelqu'un.">
            <input
              key={o.id}
              className="field"
              aria-label="Nom de la caméra"
              placeholder="Caméra"
              defaultValue={o.text ?? ""}
              maxLength={40}
              onBlur={(e) => {
                const text = e.target.value.trim();
                if (text !== (o.text ?? "")) onChange(text ? { text } : { text: "" });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
            />
          </Section>
          <ConeControls
            cone={o.cone ?? DEFAULT_CONE}
            dir={o.r}
            onCone={(patch) => onChange({ cone: { ...(o.cone ?? DEFAULT_CONE), ...patch } })}
            onDir={(r) => onChange({ r })}
            cellValue={cellValue}
            cellUnit={cellUnit}
          />
        </>
      )}
      {o.k === "text" && (
        <Section label="Texte">
          <input
            key={o.id}
            className="field"
            aria-label="Texte"
            defaultValue={o.text}
            maxLength={TEXT_MAX}
            onBlur={(e) => {
              const text = e.target.value.trim();
              if (text && text !== o.text) onChange({ text });
              else e.target.value = o.text ?? "";
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
          />
        </Section>
      )}
      {isLight && (
        <>
          <Stepper
            label="Portée"
            value={reach(rad)}
            minusLabel="Moins loin"
            plusLabel="Plus loin"
            onMinus={() => onChange({ rad: Math.max(0.5, Math.round((rad - 1) * 2) / 2) })}
            onPlus={() => onChange({ rad: Math.min(60, Math.round((rad + 1) * 2) / 2) })}
          />
          <Tiles
            label="Portée rapide"
            cols={3}
            value={LIGHT_SIZES.find((z) => z.rad === rad)?.rad ?? -1}
            options={LIGHT_SIZES.map((z) => ({ value: z.rad, label: z.label, hint: reach(z.rad) }))}
            onChange={(r) => onChange({ rad: r })}
          />
          <Tiles
            label="Flamme"
            cols={2}
            compact
            value={o.flicker === true}
            options={[
              { value: false, label: "Fixe", hint: "Une lumière stable : lampe, néon." },
              {
                value: true,
                label: "Vacille",
                hint: "Elle tremble comme une torche ou une bougie.",
              },
            ]}
            onChange={(flicker) => onChange({ flicker })}
          />
          <Slider
            label="Pleine lumière"
            value={o.bright ?? 0.5}
            min={0}
            max={1}
            step={0.05}
            format={(v) => `${Math.round(v * 100)} % de la portée`}
            onChange={(bright) => onChange({ bright })}
          />
        </>
      )}
      {!isLight && (
        <div className="map-insp-pair">
          <Stepper
            label="Taille"
            value={
              o.k === "text"
                ? o.h.toLocaleString("fr-FR")
                : `${o.w.toLocaleString("fr-FR")} × ${o.h.toLocaleString("fr-FR")}`
            }
            minusLabel="Plus petit"
            plusLabel="Plus grand"
            onMinus={() => scale(1 / 1.25)}
            onPlus={() => scale(1.25)}
          />
          <section className="map-insp-sec">
            <h4>Tourner</h4>
            <div className="map-stepper" role="group" aria-label="Rotation">
              <Button
                aria-label="Tourner à gauche"
                title="Tourner à gauche"
                onClick={() => turn(-90)}
              >
                <RotateCcw size={15} />
              </Button>
              <output>{Math.round(o.r)}°</output>
              <Button
                aria-label="Tourner à droite"
                title="Tourner à droite"
                onClick={() => turn(90)}
              >
                <RotateCw size={15} />
              </Button>
            </div>
          </section>
        </div>
      )}
      {o.k === "stairs" && (
        <Stepper
          label="Marches par case"
          value={o.steps ?? 3}
          minusLabel="Moins de marches"
          plusLabel="Plus de marches"
          onMinus={() => onChange({ steps: Math.max(1, (o.steps ?? 3) - 1) })}
          onPlus={() => onChange({ steps: Math.min(8, (o.steps ?? 3) + 1) })}
        />
      )}
      {o.k !== "image" && (
        <Section label={isLight ? "Teinte" : "Couleur"}>
          <label className="map-color map-insp-color">
            <input
              type="color"
              aria-label="Couleur"
              value={o.color ?? "#808080"}
              onChange={(e) => onChange({ color: e.target.value })}
            />
            <span>{o.color ?? "Couleur du thème"}</span>
          </label>
        </Section>
      )}
      <Slider
        label={isLight ? "Intensité" : "Opacité"}
        value={o.op ?? 1}
        min={0.1}
        max={1}
        step={0.05}
        format={(v) => `${Math.round(v * 100)} %`}
        onChange={(op) => onChange({ op })}
      />
      {o.k !== "text" && o.k !== "camera" && !isLight && maps.length > 0 && (
        <Section
          label="Mène à une autre carte"
          hint={
            target
              ? "« Emmener le groupe » déplace les pions du groupe sur cette carte."
              : "Pour un escalier, une échelle, un portail."
          }
        >
          <select
            className="field"
            aria-label="Carte où mène cet objet"
            value={target ? target.id : ""}
            onChange={(e) => onChange({ link: e.target.value })}
          >
            <option value="">Nulle part</option>
            {maps.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          {target && (
            <Actions>
              <Button title={`Ouvrir « ${target.name} »`} onClick={() => onGo(target.id)}>
                Y aller
              </Button>
              <Button onClick={() => onBring(target.id)}>Emmener le groupe</Button>
            </Actions>
          )}
        </Section>
      )}
      <Actions>
        <Button title="Mettre devant" onClick={onFront}>
          <BringToFront size={15} aria-hidden="true" /> Devant
        </Button>
        <Button title="Mettre derrière" onClick={onBack}>
          <SendToBack size={15} aria-hidden="true" /> Derrière
        </Button>
        <Button title="Dupliquer (Ctrl+D)" onClick={onDuplicate}>
          <Copy size={15} aria-hidden="true" /> Dupliquer
        </Button>
        <Button className="danger" title="Supprimer (Suppr)" onClick={onRemove}>
          <Trash2 size={15} aria-hidden="true" /> Supprimer
        </Button>
      </Actions>
    </div>
  );
}

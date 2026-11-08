import type { CSSProperties } from "react";
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
import { Button } from "@/components/ui/button";
import { LIGHT_SIZES } from "@/lib/map-light";
import {
  LIGHT_BOX,
  SYMBOL_GROUPS,
  SYMBOL_LABELS,
  TEXT_MAX,
  boxOf,
  type MapObject,
} from "@/lib/map-objects";

/** Ce que pose l'outil Objet ou le tampon. */
export type ObjectSource = { k: "symbol"; sym: string } | { k: "image"; src: string };

/** Un objet dessiné dans son repère : centré, tourné, à l'échelle d'une case de `cell` pixels. */
export function ObjectView({
  o,
  cell,
  url,
  selected,
  ghost = false,
  handle,
}: {
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
      {Icon && <Icon x={-pw / 2} y={-ph / 2} width={pw} height={ph} />}
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
}: {
  images: string[];
  urls: Record<string, string>;
  chosen: ObjectSource | null;
  onPick: (s: ObjectSource) => void;
  onUpload: (f: File) => void;
  onRemoveImage: (src: string) => void;
}) {
  return (
    <div className="map-library">
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
      {SYMBOL_GROUPS.map((g) => (
        <section key={g.label}>
          <h3>{g.label}</h3>
          <div className="map-library-grid">
            {g.ids.map((id) => {
              const Icon = SYMBOL_ICONS[id];
              if (!Icon) return null;
              return (
                <Button
                  key={id}
                  aria-label={SYMBOL_LABELS[id] ?? id}
                  title={SYMBOL_LABELS[id] ?? id}
                  aria-pressed={chosen?.k === "symbol" && chosen.sym === id}
                  onClick={() => onPick({ k: "symbol", sym: id })}
                >
                  <Icon size={22} aria-hidden="true" />
                </Button>
              );
            })}
          </div>
        </section>
      ))}
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
}: {
  o: MapObject;
  onChange: (patch: Partial<MapObject>) => void;
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
  return (
    <div className="map-door-types map-shape-opts map-object-bar" aria-label="Objet choisi">
      {o.k === "text" && (
        <input
          key={o.id}
          className="field map-object-text"
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
      )}
      {isLight && (
        <>
          <div className="map-opt" role="group" aria-label="Portée">
            <small aria-hidden="true">Portée</small>
            <Button
              aria-label="Moins loin"
              onClick={() => onChange({ rad: Math.max(0.5, Math.round((rad - 1) * 2) / 2) })}
            >
              −
            </Button>
            <span className="map-opt-value">{reach(rad)}</span>
            <Button
              aria-label="Plus loin"
              onClick={() => onChange({ rad: Math.min(60, Math.round((rad + 1) * 2) / 2) })}
            >
              +
            </Button>
            {LIGHT_SIZES.map((z) => (
              <Button
                key={z.label}
                aria-pressed={rad === z.rad}
                title={`${z.label} : ${reach(z.rad)}`}
                onClick={() => onChange({ rad: z.rad })}
              >
                {z.label}
              </Button>
            ))}
          </div>
          <label className="map-opt" title="Part de la portée en pleine lumière">
            <small aria-hidden="true">Pleine lumière</small>
            <input
              type="range"
              aria-label="Pleine lumière"
              min={0}
              max={1}
              step={0.05}
              value={o.bright ?? 0.5}
              onChange={(e) => onChange({ bright: Number(e.target.value) })}
            />
          </label>
        </>
      )}
      {!isLight && (
        <div className="map-opt" role="group" aria-label="Taille">
          <small aria-hidden="true">Taille</small>
          <Button aria-label="Plus petit" onClick={() => scale(1 / 1.25)}>
            −
          </Button>
          <Button aria-label="Plus grand" onClick={() => scale(1.25)}>
            +
          </Button>
        </div>
      )}
      {!isLight && (
        <div className="map-opt" role="group" aria-label="Rotation">
          <small aria-hidden="true">Tourner</small>
          <Button aria-label="Tourner à gauche" title="Tourner à gauche" onClick={() => turn(-90)}>
            <RotateCcw size={15} />
          </Button>
          <Button aria-label="Tourner à droite" title="Tourner à droite" onClick={() => turn(90)}>
            <RotateCw size={15} />
          </Button>
        </div>
      )}
      {o.k === "stairs" && (
        <div className="map-opt" role="group" aria-label="Marches par case">
          <small aria-hidden="true">Marches</small>
          <Button
            aria-label="Moins de marches"
            onClick={() => onChange({ steps: Math.max(1, (o.steps ?? 3) - 1) })}
          >
            −
          </Button>
          <span className="map-opt-value">{o.steps ?? 3}</span>
          <Button
            aria-label="Plus de marches"
            onClick={() => onChange({ steps: Math.min(8, (o.steps ?? 3) + 1) })}
          >
            +
          </Button>
        </div>
      )}
      {o.k !== "image" && (
        <label className="map-opt map-color" title="Couleur">
          <small aria-hidden="true">Couleur</small>
          <input
            type="color"
            aria-label="Couleur"
            value={o.color ?? "#808080"}
            onChange={(e) => onChange({ color: e.target.value })}
          />
        </label>
      )}
      <label className="map-opt" title="Opacité">
        <small aria-hidden="true">{isLight ? "Intensité" : "Opacité"}</small>
        <input
          type="range"
          aria-label="Opacité"
          min={0.1}
          max={1}
          step={0.05}
          value={o.op ?? 1}
          onChange={(e) => onChange({ op: Number(e.target.value) })}
        />
      </label>
      {o.k !== "text" && !isLight && maps.length > 0 && (
        <div className="map-opt" role="group" aria-label="Mène à">
          <small aria-hidden="true">Mène à</small>
          <select
            className="field map-object-link"
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
            <>
              <Button title={`Ouvrir « ${target.name} »`} onClick={() => onGo(target.id)}>
                Y aller
              </Button>
              <Button
                title="Les pions du groupe passent sur l'autre carte, près de l'objet qui ramène ici"
                onClick={() => onBring(target.id)}
              >
                Emmener le groupe
              </Button>
            </>
          )}
        </div>
      )}
      <div className="map-opt" role="group" aria-label="Ordre et actions">
        <Button aria-label="Mettre devant" title="Mettre devant" onClick={onFront}>
          <BringToFront size={15} />
        </Button>
        <Button aria-label="Mettre derrière" title="Mettre derrière" onClick={onBack}>
          <SendToBack size={15} />
        </Button>
        <Button aria-label="Dupliquer" title="Dupliquer (Ctrl+D)" onClick={onDuplicate}>
          <Copy size={15} />
        </Button>
        <Button aria-label="Supprimer l’objet" title="Supprimer (Suppr)" onClick={onRemove}>
          <Trash2 size={15} />
        </Button>
      </div>
    </div>
  );
}

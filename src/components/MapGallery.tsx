/**
 * Galerie des cartes du MJ : toutes ses cartes en vignettes, pour ouvrir, montrer aux joueurs,
 * renommer, dupliquer ou supprimer d'un geste ; et l'assistant qui crée une carte à partir
 * d'un modèle, sans rien savoir des outils.
 */
import { useMemo, useState, type CSSProperties } from "react";
import {
  ArrowLeft,
  Copy,
  FileUp,
  Pencil,
  Plus,
  Radio,
  Search,
  Shuffle,
  Trash2,
  X,
} from "lucide-react";
import { ThemeArt } from "@/components/MapThemeArt";
import { Button } from "@/components/ui/button";
import { readEdges } from "@/lib/map";
import { floorOf, floorPath, readShapes } from "@/lib/map-shapes";
import { MAP_STYLES, applyPreset, readMapStyle, styleVars, type StyleId } from "@/lib/map-style";
import { levelLabel } from "@/lib/map-layers";
import {
  MAP_TEMPLATES,
  TEMPLATE_SIZES,
  buildTemplate,
  type MapDraft,
  type TemplateId,
  type TemplateSize,
} from "@/lib/map-templates";

export type GalleryMap = {
  id: string;
  name: string;
  width: number;
  height: number;
  shapes: unknown;
  walls: unknown;
  style: unknown;
  place: string | null;
  level: number;
};

/** Vignette d'une carte : son sol, ses murs et ses portes, dans ses propres couleurs. */
export function MapThumb({
  width,
  height,
  shapes,
  walls,
  style,
}: {
  width: number;
  height: number;
  shapes: unknown;
  walls: unknown;
  style: unknown;
}) {
  const floor = useMemo(() => {
    const list = readShapes(shapes).filter((s) => !s.layer);
    return list.length ? floorPath(floorOf(list, width, height), 1) : null;
  }, [shapes, width, height]);
  const edges = useMemo(() => readEdges(walls), [walls]);
  const vars = useMemo(() => styleVars(readMapStyle(style)) as CSSProperties, [style]);
  const line = (e: (typeof edges)[number]) =>
    e.dir === "h"
      ? { x1: e.x, y1: e.y, x2: e.x + 1, y2: e.y }
      : { x1: e.x, y1: e.y, x2: e.x, y2: e.y + 1 };
  return (
    <svg
      className="map-thumb"
      viewBox={`-0.5 -0.5 ${width + 1} ${height + 1}`}
      preserveAspectRatio="xMidYMid meet"
      style={vars}
      aria-hidden="true"
    >
      <rect className="rock" x={0} y={0} width={width} height={height} />
      {floor === null ? (
        <rect className="ground" x={0} y={0} width={width} height={height} />
      ) : (
        <path className="ground walled" d={floor} fillRule="evenodd" />
      )}
      {edges
        .filter((e) => e.dir === "c")
        .map((e) => (
          <rect key={`c${e.x}:${e.y}`} className="ground" x={e.x} y={e.y} width={1} height={1} />
        ))}
      {edges
        .filter((e) => e.dir !== "c")
        .map((e) => (
          <line
            key={`${e.dir}${e.x}:${e.y}`}
            className={e.kind === "door" ? "door" : "wall"}
            {...line(e)}
          />
        ))}
    </svg>
  );
}

/** Assistant de création : un modèle, une taille, une apparence, un nom. */
function MapCreator({
  count,
  onCreate,
  onBack,
}: {
  count: number;
  onCreate: (draft: MapDraft, name: string, style: StyleId) => void;
  onBack: (() => void) | null;
}) {
  const [template, setTemplate] = useState<TemplateId>("room");
  const [size, setSize] = useState<TemplateSize>("m");
  const [style, setStyle] = useState<StyleId>("theme");
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 2 ** 31));
  const [name, setName] = useState("");
  const drafts = useMemo(
    () => new Map(MAP_TEMPLATES.map((t) => [t.id, buildTemplate(t.id, size, seed)])),
    [size, seed],
  );
  const chosen = MAP_TEMPLATES.find((t) => t.id === template)!;
  const styleJson = useMemo(() => applyPreset(style), [style]);
  const fallback = `${chosen.id === "empty" ? "Carte" : chosen.label} ${count + 1}`;

  return (
    <div className="map-create">
      <header className="map-gallery-head">
        {onBack && (
          <Button aria-label="Retour à mes cartes" onClick={onBack}>
            <ArrowLeft size={18} />
          </Button>
        )}
        <h2>Nouvelle carte</h2>
      </header>

      <section aria-labelledby="mc-step1">
        <h3 id="mc-step1">
          <b>1</b> Choisis un point de départ
        </h3>
        <div className="map-templates" role="radiogroup" aria-label="Modèle">
          {MAP_TEMPLATES.map((t) => {
            const d = drafts.get(t.id)!;
            return (
              <Button
                key={t.id}
                role="radio"
                aria-checked={template === t.id}
                className="map-template"
                onClick={() => {
                  setTemplate(t.id);
                  setStyle(t.style);
                }}
              >
                <MapThumb
                  width={d.width}
                  height={d.height}
                  shapes={d.shapes}
                  walls={d.edges}
                  style={template === t.id ? styleJson : applyPreset(t.style)}
                />
                <b>{t.label}</b>
                <small>{t.hint}</small>
              </Button>
            );
          })}
        </div>
        {chosen.random && (
          <Button className="btn" onClick={() => setSeed(Math.floor(Math.random() * 2 ** 31))}>
            <Shuffle size={15} aria-hidden="true" /> Un autre tirage
          </Button>
        )}
      </section>

      <section aria-labelledby="mc-step2">
        <h3 id="mc-step2">
          <b>2</b> Sa taille
        </h3>
        <div className="map-chips" role="radiogroup" aria-label="Taille">
          {TEMPLATE_SIZES.map((z) => (
            <Button
              key={z.id}
              role="radio"
              aria-checked={size === z.id}
              onClick={() => setSize(z.id)}
            >
              {z.label}
              <small>
                {z.w} × {z.h} cases
              </small>
            </Button>
          ))}
        </div>
      </section>

      <section aria-labelledby="mc-step3">
        <h3 id="mc-step3">
          <b>3</b> Son apparence
        </h3>
        <div className="map-chips map-chips-themes" role="radiogroup" aria-label="Apparence">
          {MAP_STYLES.map((p) => (
            <Button
              key={p.id}
              role="radio"
              aria-checked={style === p.id}
              title={p.hint}
              onClick={() => setStyle(p.id)}
            >
              <ThemeArt theme={p.id} />
              {p.label}
            </Button>
          ))}
        </div>
        <p className="note plain">Tu pourras tout changer ensuite, dans Réglages → Apparence.</p>
      </section>

      <section aria-labelledby="mc-step4">
        <h3 id="mc-step4">
          <b>4</b> Son nom
        </h3>
        <input
          className="field"
          value={name}
          maxLength={60}
          placeholder={fallback}
          aria-label="Nom de la carte"
          onChange={(e) => setName(e.target.value)}
        />
      </section>

      <Button
        className="btn y map-create-go"
        onClick={() =>
          onCreate(drafts.get(template)!, (name.trim() || fallback).slice(0, 60), style)
        }
      >
        <Plus size={16} aria-hidden="true" /> Créer la carte
      </Button>
    </div>
  );
}

/** La galerie, ou l'assistant de création quand il n'y a encore aucune carte. */
export function MapGallery({
  maps,
  liveId,
  currentId,
  onOpen,
  onLive,
  onRename,
  onDuplicate,
  onDelete,
  onCreate,
  onImport,
  onClose,
}: {
  maps: GalleryMap[];
  liveId: string | null;
  currentId: string | null;
  onOpen: (id: string) => void;
  onLive: (id: string | null) => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onCreate: (draft: MapDraft, name: string, style: StyleId) => void;
  onImport: (f: File) => void;
  onClose: (() => void) | null;
}) {
  const [creating, setCreating] = useState(maps.length === 0);
  const [query, setQuery] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? maps.filter((m) => `${m.name} ${m.place ?? ""}`.toLowerCase().includes(q))
      : maps;
    // La carte affichée d'abord, puis la carte ouverte, puis les autres dans l'ordre de création
    return [...list].sort(
      (a, b) =>
        Number(b.id === liveId) - Number(a.id === liveId) ||
        Number(b.id === currentId) - Number(a.id === currentId),
    );
  }, [maps, query, liveId, currentId]);

  return (
    <div className="map-gallery" role="dialog" aria-label="Mes cartes">
      <div className="map-gallery-box">
        {onClose && (
          <Button
            className="map-gallery-close"
            aria-label="Fermer"
            title="Fermer (Échap)"
            onClick={onClose}
          >
            <X size={18} />
          </Button>
        )}
        {creating ? (
          <MapCreator
            count={maps.length}
            onCreate={(d, name, style) => {
              setCreating(false);
              onCreate(d, name, style);
            }}
            onBack={maps.length ? () => setCreating(false) : null}
          />
        ) : (
          <>
            <header className="map-gallery-head">
              <h2>Mes cartes</h2>
              <span className="map-gallery-count">{maps.length}</span>
            </header>
            <div className="map-gallery-bar">
              <label className="map-search">
                <Search size={16} aria-hidden="true" />
                <input
                  className="field"
                  type="search"
                  placeholder="Chercher une carte"
                  aria-label="Chercher une carte"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <input
                id="map-gallery-file"
                type="file"
                accept=".json,application/json"
                className="profile-file"
                aria-label="Importer un fichier de carte"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onImport(f);
                  e.target.value = "";
                }}
              />
              <label
                className="btn"
                htmlFor="map-gallery-file"
                title="Ouvrir un fichier .carte.json"
              >
                <FileUp size={15} aria-hidden="true" /> Importer
              </label>
            </div>
            <ul className="map-cards">
              <li>
                <Button className="map-card map-card-new" onClick={() => setCreating(true)}>
                  <span className="map-card-plus" aria-hidden="true">
                    <Plus size={28} />
                  </span>
                  <b>Nouvelle carte</b>
                  <small>À partir d’un modèle, en quatre choix</small>
                </Button>
              </li>
              {shown.map((m) => {
                const live = m.id === liveId;
                return (
                  <li
                    key={m.id}
                    className={`map-card ${live ? "live" : ""} ${m.id === currentId ? "current" : ""}`}
                  >
                    <Button
                      className="map-card-open"
                      aria-label={`Ouvrir ${m.name}`}
                      onClick={() => onOpen(m.id)}
                    >
                      <MapThumb
                        width={m.width}
                        height={m.height}
                        shapes={m.shapes}
                        walls={m.walls}
                        style={m.style}
                      />
                      {live && (
                        <span className="map-card-badge">
                          <Radio size={12} aria-hidden="true" /> Vue par les joueurs
                        </span>
                      )}
                    </Button>
                    <div className="map-card-info">
                      {renaming === m.id ? (
                        <input
                          className="field"
                          defaultValue={m.name}
                          maxLength={60}
                          aria-label="Nouveau nom"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                            if (e.key === "Escape") {
                              e.currentTarget.value = m.name;
                              e.currentTarget.blur();
                            }
                          }}
                          onBlur={(e) => {
                            const name = e.target.value.trim();
                            if (name && name !== m.name) onRename(m.id, name);
                            setRenaming(null);
                          }}
                        />
                      ) : (
                        <b title={m.name}>{m.name}</b>
                      )}
                      <small>
                        {m.place?.trim() ? `${m.place} · ${levelLabel(m.level)} · ` : ""}
                        {m.width} × {m.height}
                      </small>
                    </div>
                    <div className="map-card-actions">
                      <Button
                        className={`map-card-live ${live ? "on" : ""}`}
                        aria-pressed={live}
                        onClick={() => onLive(live ? null : m.id)}
                      >
                        <Radio size={14} aria-hidden="true" />
                        {live ? "Ne plus montrer" : "Montrer aux joueurs"}
                      </Button>
                      <Button
                        aria-label={`Renommer ${m.name}`}
                        title="Renommer"
                        onClick={() => setRenaming(m.id)}
                      >
                        <Pencil size={15} />
                      </Button>
                      <Button
                        aria-label={`Dupliquer ${m.name}`}
                        title="Dupliquer"
                        onClick={() => onDuplicate(m.id)}
                      >
                        <Copy size={15} />
                      </Button>
                      <Button
                        className="danger"
                        aria-label={`Supprimer ${m.name}`}
                        title="Supprimer"
                        onClick={() => onDelete(m.id)}
                      >
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
            {!shown.length && query && <p className="note plain">Aucune carte ne porte ce nom.</p>}
          </>
        )}
      </div>
    </div>
  );
}

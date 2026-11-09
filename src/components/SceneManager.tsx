/**
 * Scènes du MJ : les images de fond de la table.
 * Un clic ouvre la scène en aperçu (rien ne change chez les joueurs) ; « Montrer aux joueurs »
 * la diffuse, avec sa transition, son ambiance et sa musique liée.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  ArrowLeft,
  ArrowRight,
  FolderOpen,
  ImagePlus,
  Music2,
  Play,
  Radio,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useTable, type Scene } from "@/lib/table-context";
import { parseYoutube, validateScene } from "@/lib/table";
import {
  SCENE_AMBIANCES,
  TRANSITIONS,
  foldersOf,
  musicForScene,
  nameFromFile,
  readAmbiance,
  readSceneMusic,
  readTransition,
  reorder,
  sortChanges,
  type SceneMusic,
} from "@/lib/scenes";
import { Section, Tiles } from "@/components/MapInspector";
import { confirmAction } from "@/components/ConfirmDialog";
import { InlineError } from "@/components/InlineError";
import { Button } from "./ui/button";

const ALL = "\u0000tout";

export function SceneManager() {
  const table = useTable();
  const scenes = table.scenes;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [folder, setFolder] = useState<string>(ALL);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [replay, setReplay] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);

  const folders = useMemo(() => foldersOf(scenes), [scenes]);
  const shown = folder === ALL ? scenes : scenes.filter((s) => s.folder.trim() === folder);
  const selected = scenes.find((s) => s.id === selectedId) ?? null;
  const liveId = table.activeScene?.id ?? null;
  // Sur téléphone, l’aperçu passe en haut : on y emmène l’écran quand on choisit une scène
  useEffect(() => {
    if (!selectedId || window.innerWidth >= 1000) return;
    document
      .querySelector(".scene-preview")
      ?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [selectedId]);

  async function upload(files: File[]) {
    if (!files.length || !table.teamId) return;
    const problems: string[] = [];
    let order = scenes.length;
    let first: string | null = null;
    for (const [i, file] of files.entries()) {
      const bad = validateScene(file);
      if (bad) {
        problems.push(`${file.name} : ${bad}`);
        continue;
      }
      setBusy(`Import ${i + 1} sur ${files.length}…`);
      const path = `${table.teamId}/${crypto.randomUUID()}.${file.name.split(".").pop()}`;
      const up = await supabase.storage
        .from("scenes")
        .upload(path, file, { contentType: file.type });
      if (up.error) {
        problems.push(`${file.name} : ${up.error.message}`);
        continue;
      }
      const { data, error } = await supabase
        .from("scenes")
        .insert({
          name: nameFromFile(file.name),
          image_path: path,
          sort_order: order++,
          folder: folder === ALL ? "" : folder,
        })
        .select("id")
        .single();
      if (error) {
        await supabase.storage.from("scenes").remove([path]);
        problems.push(`${file.name} : ${error.message}`);
      } else first ??= data.id;
    }
    setBusy(null);
    setErr(problems.length ? problems.join(" · ") : null);
    await table.refresh();
    if (first) setSelectedId(first);
  }

  async function patch(
    s: Scene,
    next: Partial<{
      name: string;
      subtitle: string;
      folder: string;
      transition: string;
      ambiance: string;
      music: Json | null;
      image_path: string;
    }>,
  ) {
    const { error } = await supabase.from("scenes").update(next).eq("id", s.id);
    if (error) setErr(error.message);
    await table.refresh();
  }

  async function show(s: Scene | null) {
    if (!table.teamId) return;
    const { error } = await supabase
      .from("session_state")
      .update({ active_scene_id: s?.id ?? null })
      .eq("team_id", table.teamId);
    if (error) return setErr(error.message);
    const linked = s ? readSceneMusic(s.music) : null;
    if (linked) {
      const music = musicForScene(table.music, linked);
      const { error: e2 } = await supabase.rpc("set_table_music", {
        payload: music as unknown as Json,
      });
      if (e2) setErr(`Scène montrée, mais la musique n’a pas démarré : ${e2.message}`);
    }
    await table.refresh();
  }

  async function remove(s: Scene) {
    const ok = await confirmAction({
      title: `Supprimer la scène « ${s.name} » ?`,
      message: "L’image sera supprimée définitivement.",
    });
    if (!ok) return;
    const { error } = await supabase.from("scenes").delete().eq("id", s.id);
    if (error) return setErr(error.message);
    await supabase.storage.from("scenes").remove([s.image_path]);
    setSelectedId(null);
    await table.refresh();
  }

  async function replaceImage(s: Scene, file: File) {
    const bad = validateScene(file);
    if (bad) return setErr(bad);
    const path = `${table.teamId}/${crypto.randomUUID()}.${file.name.split(".").pop()}`;
    const up = await supabase.storage.from("scenes").upload(path, file, { contentType: file.type });
    if (up.error) return setErr(up.error.message);
    const { error } = await supabase.from("scenes").update({ image_path: path }).eq("id", s.id);
    if (error) {
      await supabase.storage.from("scenes").remove([path]);
      return setErr(error.message);
    }
    await supabase.storage.from("scenes").remove([s.image_path]);
    await table.refresh();
  }

  /** Nouvel ordre : seules les scènes qui changent de place sont réécrites. */
  async function saveOrder(next: Scene[]) {
    const changes = sortChanges(next);
    const results = await Promise.all(
      changes.map((c) =>
        supabase.from("scenes").update({ sort_order: c.sort_order }).eq("id", c.id),
      ),
    );
    if (results.some((r) => r.error)) setErr("Réorganisation impossible.");
    await table.refresh();
  }
  function shift(s: Scene, delta: number) {
    const i = scenes.findIndex((x) => x.id === s.id);
    const other = scenes[i + delta];
    if (other) void saveOrder(reorder(scenes, s.id, other.id));
  }

  return (
    <section className="scene-studio">
      <header className="scene-head">
        <div>
          <h1>Scènes</h1>
          <p className="note plain">
            Touche une scène pour la préparer : rien ne change chez les joueurs tant que tu
            n’appuies pas sur « Montrer aux joueurs ».
          </p>
        </div>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="profile-file"
          aria-label="Importer des images"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            void upload(files);
          }}
        />
        <Button
          className="btn y scene-import"
          disabled={!!busy}
          onClick={() => fileInput.current?.click()}
        >
          <ImagePlus size={16} aria-hidden="true" /> {busy ?? "Importer des images"}
        </Button>
      </header>
      <InlineError message={err} onClear={() => setErr(null)} />

      {(folders.length > 0 || folder !== ALL) && (
        <div className="scene-folders" role="radiogroup" aria-label="Dossier">
          <Button role="radio" aria-checked={folder === ALL} onClick={() => setFolder(ALL)}>
            Toutes <small>{scenes.length}</small>
          </Button>
          {folders.map((f) => (
            <Button key={f} role="radio" aria-checked={folder === f} onClick={() => setFolder(f)}>
              <FolderOpen size={14} aria-hidden="true" /> {f}{" "}
              <small>{scenes.filter((s) => s.folder.trim() === f).length}</small>
            </Button>
          ))}
        </div>
      )}

      <div className={`scene-layout ${selected ? "with-preview" : ""}`}>
        <div className="scene-grid">
          {shown.map((s) => (
            <Button
              key={s.id}
              className={[
                "scene-card",
                s.id === liveId ? "live" : "",
                s.id === selectedId ? "on" : "",
                s.id === over && drag && drag !== s.id ? "drop" : "",
              ].join(" ")}
              draggable
              title="Touche pour préparer · glisse pour changer l’ordre"
              onClick={() => setSelectedId(s.id === selectedId ? null : s.id)}
              onDragStart={(e) => {
                setDrag(s.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (!drag) return;
                e.preventDefault();
                setOver(s.id);
              }}
              onDragLeave={() => setOver((o) => (o === s.id ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                if (drag && drag !== s.id) void saveOrder(reorder(scenes, drag, s.id));
                setDrag(null);
                setOver(null);
              }}
              onDragEnd={() => {
                setDrag(null);
                setOver(null);
              }}
            >
              <span className="scene-thumb">
                {s.url && <img src={s.url} alt="" draggable={false} />}
                {s.id === liveId && (
                  <em>
                    <Radio size={12} aria-hidden="true" /> Vue par les joueurs
                  </em>
                )}
                <span className="scene-badges" aria-hidden="true">
                  {readSceneMusic(s.music) && <Music2 size={13} />}
                  {readAmbiance(s.ambiance) !== "none" && (
                    <i className={`map-weather-art w-${readAmbiance(s.ambiance)}`} />
                  )}
                </span>
              </span>
              <span className="scene-cap">
                <b>{s.name}</b>
                {s.subtitle && <small>{s.subtitle}</small>}
              </span>
            </Button>
          ))}
          <Button className="scene-card add" onClick={() => fileInput.current?.click()}>
            <ImagePlus size={26} aria-hidden="true" />
            <b>Importer des images</b>
            <small>Plusieurs à la fois, 5 Mo chacune au plus</small>
          </Button>
        </div>

        {selected && (
          <aside className="scene-preview" aria-label={`Préparer « ${selected.name} »`}>
            <div className="scene-preview-top">
              <b>Préparer la scène</b>
              <Button aria-label="Fermer l’aperçu" onClick={() => setSelectedId(null)}>
                <X size={16} />
              </Button>
            </div>
            <div className="scene-stage">
              {selected.url && (
                <img
                  key={`${selected.id}-${replay}-${selected.transition}`}
                  className={`scene-image incoming t-${readTransition(selected.transition)}`}
                  src={selected.url}
                  alt=""
                />
              )}
              {readAmbiance(selected.ambiance) !== "none" && (
                <div
                  className={`map-weather w-${readAmbiance(selected.ambiance)}`}
                  style={{ ["--wp" as string]: 0.7 } as CSSProperties}
                  aria-hidden="true"
                >
                  <i />
                  <i />
                </div>
              )}
              <span className="scene-stage-title" key={`t-${replay}-${selected.id}`}>
                {selected.subtitle && <small>{selected.subtitle}</small>}
                <b>{selected.name}</b>
              </span>
            </div>

            {selected.id === liveId ? (
              <div className="scene-live-row">
                <span className="scene-live-tag">
                  <Radio size={14} aria-hidden="true" /> Les joueurs la voient
                </span>
                <Button className="btn" onClick={() => void show(null)}>
                  Ne plus montrer
                </Button>
              </div>
            ) : (
              <Button className="btn y scene-go" onClick={() => void show(selected)}>
                <Radio size={16} aria-hidden="true" /> Montrer aux joueurs
                {readSceneMusic(selected.music) ? " (avec sa musique)" : ""}
              </Button>
            )}

            <div className="scene-fields" key={selected.id}>
              <label className="uni-field">
                <span>Nom</span>
                <input
                  className="field"
                  defaultValue={selected.name}
                  maxLength={120}
                  onBlur={(e) => {
                    const name = e.target.value.trim();
                    if (name && name !== selected.name) void patch(selected, { name });
                    else e.target.value = selected.name;
                  }}
                />
              </label>
              <label className="uni-field">
                <span>Sous-titre (facultatif)</span>
                <input
                  className="field"
                  defaultValue={selected.subtitle}
                  maxLength={180}
                  placeholder="Ex. : Le soir tombe sur la ville"
                  onBlur={(e) => {
                    const subtitle = e.target.value.trim();
                    if (subtitle !== selected.subtitle) void patch(selected, { subtitle });
                  }}
                />
              </label>
              <label className="uni-field">
                <span>Dossier (facultatif)</span>
                <input
                  className="field"
                  defaultValue={selected.folder}
                  maxLength={40}
                  list="scene-folders"
                  placeholder="Ex. : Acte 1, Le port, Rêves"
                  onBlur={(e) => {
                    const f = e.target.value.trim();
                    if (f !== selected.folder) void patch(selected, { folder: f });
                  }}
                />
                <datalist id="scene-folders">
                  {folders.map((f) => (
                    <option key={f} value={f} />
                  ))}
                </datalist>
              </label>
            </div>

            <Tiles
              label="Transition"
              cols={3}
              value={readTransition(selected.transition)}
              options={TRANSITIONS.map((t) => ({ value: t.id, label: t.label, hint: t.hint }))}
              onChange={(transition) => {
                setReplay((n) => n + 1);
                void patch(selected, { transition });
              }}
            />
            <Button className="btn scene-replay" onClick={() => setReplay((n) => n + 1)}>
              <Play size={14} aria-hidden="true" /> Revoir la transition
            </Button>

            <Tiles
              label="Ambiance"
              cols={4}
              value={readAmbiance(selected.ambiance)}
              options={SCENE_AMBIANCES.map((w) => ({
                value: w.id,
                label: w.label,
                hint: w.hint,
                icon: <i className={`map-weather-art w-${w.id}`} />,
              }))}
              onChange={(ambiance) => void patch(selected, { ambiance })}
            />

            <SceneMusicPicker
              key={`m-${selected.id}`}
              value={readSceneMusic(selected.music)}
              queue={table.music.queue ?? []}
              onChange={(music) => void patch(selected, { music: music as Json | null })}
            />

            <Section label="Place et image">
              <div className="scene-tools-row">
                <Button
                  className="btn"
                  disabled={scenes[0]?.id === selected.id}
                  onClick={() => shift(selected, -1)}
                >
                  <ArrowLeft size={14} aria-hidden="true" /> Plus tôt
                </Button>
                <Button
                  className="btn"
                  disabled={scenes.at(-1)?.id === selected.id}
                  onClick={() => shift(selected, 1)}
                >
                  Plus tard <ArrowRight size={14} aria-hidden="true" />
                </Button>
                <input
                  ref={replaceInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="profile-file"
                  aria-label="Changer l’image"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void replaceImage(selected, f);
                  }}
                />
                <Button className="btn" onClick={() => replaceInput.current?.click()}>
                  <RotateCcw size={14} aria-hidden="true" /> Changer l’image
                </Button>
                <Button className="btn red" onClick={() => void remove(selected)}>
                  <Trash2 size={14} aria-hidden="true" /> Supprimer
                </Button>
              </div>
            </Section>
          </aside>
        )}
      </div>
    </section>
  );
}

/** Musique liée : une piste de la musique de la table, ou un lien YouTube collé. */
function SceneMusicPicker({
  value,
  queue,
  onChange,
}: {
  value: SceneMusic | null;
  queue: { video_id: string; title: string }[];
  onChange: (m: SceneMusic | null) => void;
}) {
  const [link, setLink] = useState("");
  const [bad, setBad] = useState(false);
  const inQueue = !!value && queue.some((t) => t.video_id === value.video_id);
  return (
    <Section
      label="Musique liée"
      hint={
        value
          ? "Elle démarre depuis le début quand tu montres la scène."
          : "Facultatif : la musique en cours continue."
      }
    >
      <select
        className="field"
        aria-label="Musique de la scène"
        value={value ? value.video_id : ""}
        onChange={(e) => {
          const t = queue.find((x) => x.video_id === e.target.value);
          onChange(t ? { video_id: t.video_id, title: t.title } : null);
        }}
      >
        <option value="">Aucune (garder la musique en cours)</option>
        {value && !inQueue && (
          <option value={value.video_id}>{value.title || "Lien YouTube"}</option>
        )}
        {queue.map((t) => (
          <option key={t.video_id} value={t.video_id}>
            {t.title || t.video_id}
          </option>
        ))}
      </select>
      <input
        className="field"
        placeholder="…ou colle un lien YouTube"
        aria-label="Lien YouTube de la musique"
        aria-invalid={bad}
        value={link}
        onChange={(e) => {
          setLink(e.target.value);
          setBad(false);
        }}
        onBlur={() => {
          if (!link.trim()) return;
          const p = parseYoutube(link.trim());
          if (p?.source_type !== "video") return setBad(true);
          onChange({ video_id: p.source_id, title: "Lien YouTube" });
          setLink("");
        }}
      />
      {bad && <p className="map-insp-hint error">Ce lien n’est pas une vidéo YouTube.</p>}
    </Section>
  );
}

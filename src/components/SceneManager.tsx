import { useState } from "react";
import { ArrowLeft, ArrowRight, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTable, type Scene } from "@/lib/table-context";
import { Button } from "./ui/button";
import { validateScene } from "@/lib/table";
import { confirmAction } from "@/components/ConfirmDialog";
import { InlineError } from "@/components/InlineError";
export function SceneManager() {
  const table = useTable();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [editing, setEditing] = useState<Scene | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [formErr, setFormErr] = useState<string | null>(null);
  async function save() {
    if (!name.trim()) return;
    if (!editing && !file) return void setFormErr("Choisis une image.");
    if (file) {
      const error = validateScene(file);
      if (error) return void setFormErr(error);
    }
    setBusy(true);
    let path = editing?.image_path ?? "";
    try {
      if (file) {
        path = `${table.teamId}/${crypto.randomUUID()}.${file.name.split(".").pop()}`;
        const upload = await supabase.storage
          .from("scenes")
          .upload(path, file, { contentType: file.type });
        if (upload.error) throw upload.error;
      }
      const payload = { name: name.trim(), subtitle: subtitle.trim(), image_path: path };
      const result = editing
        ? await supabase.from("scenes").update(payload).eq("id", editing.id)
        : await supabase.from("scenes").insert({ ...payload, sort_order: table.scenes.length });
      if (result.error) {
        if (file) await supabase.storage.from("scenes").remove([path]);
        throw result.error;
      }
      if (editing && file) await supabase.storage.from("scenes").remove([editing.image_path]);
      setAdding(false);
      setEditing(null);
      setName("");
      setSubtitle("");
      setFile(null);
      await table.refresh();
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }
  async function activate(s: Scene) {
    if (!table.teamId) return;
    const { error } = await supabase
      .from("session_state")
      .update({ active_scene_id: s.id })
      .eq("team_id", table.teamId);
    if (error) setErr(error.message);
    else await table.refresh();
  }
  async function remove(s: Scene) {
    if (
      !(await confirmAction({
        title: `Supprimer la scène « ${s.name} » ?`,
        message: "L'image sera supprimée définitivement.",
      }))
    )
      return;
    const { error } = await supabase.from("scenes").delete().eq("id", s.id);
    if (error) return void setErr(error.message);
    await supabase.storage.from("scenes").remove([s.image_path]);
    await table.refresh();
  }
  async function move(index: number, delta: number) {
    const other = table.scenes[index + delta];
    const current = table.scenes[index];
    if (!other || !current) return;
    const results = await Promise.all([
      supabase
        .from("scenes")
        .update({ sort_order: index + delta })
        .eq("id", current.id),
      supabase.from("scenes").update({ sort_order: index }).eq("id", other.id),
    ]);
    if (results.some((x) => x.error)) setErr("Réorganisation impossible.");
    await table.refresh();
  }
  return (
    <section className="panel cut">
      <div className="ph">
        <h2>Scènes</h2>
        <span className="tag">UN CLIC = CHANGE POUR TOUS</span>
      </div>
      <InlineError message={err} onClear={() => setErr(null)} />
      <div className="scenes">
        {table.scenes.map((s, i) => (
          <article key={s.id} className="scene-entry">
            <Button
              variant="prototype"
              className={`scard ${table.activeScene?.id === s.id ? "live" : ""}`}
              onClick={() => activate(s)}
              aria-label={`Activer ${s.name}`}
            >
              <div className="thumb">{s.url && <img src={s.url} alt="" />}</div>
              <span className="cap">
                <b>{s.name}</b>
                <small>{s.subtitle}</small>
              </span>
            </Button>
            <div className="scene-tools">
              <Button
                variant="prototype"
                className="icon-btn cut-s"
                aria-label="Déplacer à gauche"
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                <ArrowLeft />
              </Button>
              <Button
                variant="prototype"
                className="icon-btn cut-s"
                aria-label="Déplacer à droite"
                disabled={i === table.scenes.length - 1}
                onClick={() => move(i, 1)}
              >
                <ArrowRight />
              </Button>
              <Button
                variant="prototype"
                className="icon-btn cut-s"
                aria-label={`Renommer ${s.name}`}
                onClick={() => {
                  setEditing(s);
                  setName(s.name);
                  setSubtitle(s.subtitle);
                  setFile(null);
                  setAdding(true);
                }}
              >
                <Pencil />
              </Button>
              <Button
                variant="prototype"
                className="icon-btn cut-s"
                aria-label={`Supprimer ${s.name}`}
                onClick={() => remove(s)}
              >
                <Trash2 />
              </Button>
            </div>
          </article>
        ))}
        <Button
          variant="prototype"
          className="scard upload cut-s"
          onClick={() => {
            setEditing(null);
            setName("");
            setSubtitle("");
            setFile(null);
            setAdding(true);
          }}
        >
          <Plus />
          Importer une image
        </Button>
      </div>
      {adding && (
        <div className="scene-form panel cut">
          <input
            className="field"
            placeholder="Nom de la scène"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
          />
          <input
            className="field"
            placeholder="Sous-titre"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            maxLength={180}
          />
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <div className="row-btns">
            <Button
              variant="prototype"
              className="btn y"
              onClick={save}
              disabled={busy || !name.trim()}
            >
              Enregistrer
            </Button>
            <Button variant="prototype" className="btn" onClick={() => setAdding(false)}>
              Annuler
            </Button>
          </div>
          <InlineError message={formErr} onClear={() => setFormErr(null)} />
        </div>
      )}
    </section>
  );
}

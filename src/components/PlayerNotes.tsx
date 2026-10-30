import { useEffect, useRef, useState } from "react";
import { Lock, NotebookPen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWords } from "@/lib/universe-context";

export const NOTES_MAX = 10000;

/**
 * Bloc-notes privé du personnage.
 * - Le joueur propriétaire écrit (sauvegarde automatique), même si sa fiche est verrouillée par le MJ.
 * - Le MJ lit en direct, sans pouvoir modifier.
 * - Les autres joueurs n'y ont pas accès (règles RLS côté base).
 */
export function PlayerNotes({ charId, canWrite }: { charId: string; canWrite: boolean }) {
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<"" | "saving" | "saved" | "error">("");
  const [loaded, setLoaded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);
  const latest = useRef("");
  const W = useWords();

  async function load() {
    const { data } = await supabase
      .from("character_notes")
      .select("body")
      .eq("character_id", charId)
      .maybeSingle();
    // Ne pas écraser ce que le joueur est en train de taper
    if (!dirty.current) {
      setBody(data?.body ?? "");
      latest.current = data?.body ?? "";
    }
    setLoaded(true);
  }
  useEffect(() => {
    dirty.current = false;
    setLoaded(false);
    void load();
    const ch = supabase
      .channel(`notes-${charId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "character_notes",
          filter: `character_id=eq.${charId}`,
        },
        () => void load(),
      )
      .subscribe();
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
        void save(latest.current);
      }
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charId]);

  async function save(text: string) {
    setStatus("saving");
    const { error } = await supabase
      .from("character_notes")
      .upsert({ character_id: charId, body: text }, { onConflict: "character_id" });
    if (error) {
      setStatus("error");
      return;
    }
    if (latest.current === text) {
      dirty.current = false;
      setStatus("saved");
    }
  }
  function onChange(text: string) {
    const t = text.slice(0, NOTES_MAX);
    setBody(t);
    latest.current = t;
    dirty.current = true;
    setStatus("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void save(t);
    }, 700);
  }

  return (
    <section className="panel cut notes-panel">
      <div className="ph">
        <h2>{W.notes}</h2>
        <span className="tag">
          <Lock size={11} />{" "}
          {canWrite ? "VISIBLE PAR TOI ET LE MJ" : "NOTES DU JOUEUR · LECTURE MJ"}
        </span>
      </div>
      {canWrite ? (
        <textarea
          className="field notes-area"
          value={body}
          disabled={!loaded}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => {
            if (timer.current) {
              clearTimeout(timer.current);
              timer.current = null;
              void save(latest.current);
            }
          }}
          placeholder="Contacts, indices, dettes, plans foireux… Seul le MJ peut lire ces notes."
          maxLength={NOTES_MAX}
          rows={8}
        />
      ) : (
        <div className="notes-read">
          {body ? (
            body
          ) : (
            <span className="note">
              <NotebookPen size={14} /> Aucune note pour l'instant.
            </span>
          )}
        </div>
      )}
      {canWrite && (
        <div className="notes-foot">
          <span className={`notes-status ${status}`}>
            {status === "saving"
              ? "Enregistrement…"
              : status === "saved"
                ? "✓ Enregistré"
                : status === "error"
                  ? "⚠ Échec de l'enregistrement"
                  : ""}
          </span>
          <span>
            {body.length}/{NOTES_MAX}
          </span>
        </div>
      )}
    </section>
  );
}

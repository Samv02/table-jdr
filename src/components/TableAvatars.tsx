import { useCallback, useEffect, useState } from "react";
import { Camera, Trash2, UserRound } from "lucide-react";
import { confirmAction } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { validateAvatar } from "@/lib/profile";

type Row = { id: string; name: string; my_avatar: string | null; url: string | null };

/** Mon compte : une photo facultative par table ; sans elle, la photo du compte s'affiche. */
export function TableAvatars({
  userId,
  fallback,
  onError,
}: {
  userId: string;
  fallback: string | null;
  onError: (message: string) => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("my_hub");
    if (error) return onError(error.message);
    const paths = data.flatMap((t) => (t.my_avatar ? [t.my_avatar] : []));
    const signed = paths.length
      ? await supabase.storage.from("avatars").createSignedUrls(paths, 3600)
      : null;
    const urls = new Map(signed?.data?.map((x) => [x.path, x.signedUrl]));
    setRows(
      data.map((t) => ({
        id: t.id,
        name: t.name,
        my_avatar: t.my_avatar,
        url: (t.my_avatar && urls.get(t.my_avatar)) || null,
      })),
    );
  }, [onError]);
  useEffect(() => void load(), [load]);

  async function choose(t: Row, path: string | null) {
    const { error } = await supabase.rpc("set_table_avatar", {
      _team: t.id,
      _path: path as string,
    });
    if (error) return onError(error.message);
    if (t.my_avatar) void supabase.storage.from("avatars").remove([t.my_avatar]);
    window.dispatchEvent(new Event("profile:changed"));
    void load();
  }

  async function upload(t: Row, f: File) {
    const err = validateAvatar(f);
    if (err) return onError(err);
    const path = `${userId}/table-${t.id}-${Date.now()}.${f.name.split(".").pop() || "png"}`;
    const { error } = await supabase.storage
      .from("avatars")
      .upload(path, f, { contentType: f.type });
    if (error) return onError(error.message);
    await choose(t, path);
  }

  async function remove(t: Row) {
    const ok = await confirmAction({
      title: `Retirer ta photo de « ${t.name} » ?`,
      message: "La photo de ton compte s’affichera à cette table.",
      confirmLabel: "Retirer la photo",
    });
    if (ok) await choose(t, null);
  }

  if (!rows.length) return null;
  return (
    <section className="acct-tables" aria-labelledby="acct-tables-title">
      <h2 id="acct-tables-title">Ta photo à chaque table</h2>
      <p className="note plain">Sans photo choisie, celle de ton compte s’affiche.</p>
      <ul>
        {rows.map((t) => {
          const shown = t.url ?? fallback;
          return (
            <li key={t.id}>
              <span className="acct-table-photo">
                {shown ? <img src={shown} alt="" /> : <UserRound size={24} aria-hidden="true" />}
              </span>
              <span className="acct-table-name">
                <b>{t.name}</b>
                <small>{t.my_avatar ? "Photo propre à cette table" : "Photo de ton compte"}</small>
              </span>
              <span className="acct-table-actions">
                <input
                  id={`table-photo-${t.id}`}
                  type="file"
                  accept="image/*"
                  className="profile-file"
                  aria-label={`Choisir ta photo pour ${t.name}`}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void upload(t, f);
                    e.target.value = "";
                  }}
                />
                <label className="btn" htmlFor={`table-photo-${t.id}`}>
                  <Camera size={15} aria-hidden="true" /> Choisir
                </label>
                {t.my_avatar && (
                  <Button
                    className="btn red"
                    aria-label={`Retirer ta photo de ${t.name}`}
                    onClick={() => void remove(t)}
                  >
                    <Trash2 size={15} />
                  </Button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AVATAR_MAX_MB, NEON_COLORS, validateAvatar, validateUsername } from "@/lib/profile";
import { useIdentity } from "@/lib/active-character";
import { deleteMyAccount } from "@/lib/accounts.functions";

import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/InlineError";
import { TableAvatars } from "@/components/TableAvatars";
import { confirmAction } from "@/components/ConfirmDialog";
import {
  Camera,
  Check,
  ChevronRight,
  KeyRound,
  LogOut,
  Save,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";

export const Route = createFileRoute("/profil")({
  ssr: false,
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Mon compte" },
      { name: "description", content: "Pseudo, avatar, couleur et sécurité de ton compte." },
      { property: "og:title", content: "Mon compte" },
      {
        property: "og:description",
        content: "Pseudo, avatar, couleur et sécurité de ton compte.",
      },
    ],
  }),
  component: ProfilePage,
});

type Me = {
  id: string;
  username: string | null;
  color: string;
  avatar_url: string | null;
};

function ProfilePage() {
  const identity = useIdentity();
  const removeMe = useServerFn(deleteMyAccount);
  const [me, setMe] = useState<Me | null | "none">(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const typing = useRef(false);

  const load = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return setMe("none");
    const { data: p } = await supabase
      .from("profiles")
      .select("id,username,color,avatar_url")
      .eq("id", u.user.id)
      .single();
    if (!p) return setMe("none");
    setMe(p);
    // Ne pas écraser ce que le joueur est en train de taper
    if (!typing.current) setUsername(p.username ?? "");
    if (p.avatar_url) {
      const { data: s } = await supabase.storage
        .from("avatars")
        .createSignedUrl(p.avatar_url, 3600);
      setAvatar(s?.signedUrl ?? null);
    } else setAvatar(null);
  }, []);
  useEffect(() => void load(), [load]);

  if (me === null) return <main className="min-h-screen bg-background" />;
  if (me === "none")
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Link to="/" className="text-accent underline">
          Connecte-toi d'abord
        </Link>
      </main>
    );

  const changed = () => window.dispatchEvent(new Event("profile:changed"));

  async function saveUsername() {
    if (me === null || me === "none") return;
    const err = validateUsername(username);
    if (err) return void setSaveError(err);
    const { error } = await supabase
      .from("profiles")
      .update({ username: username.trim() })
      .eq("id", me.id);
    if (error)
      return void setSaveError(error.code === "23505" ? "Ce pseudo est déjà pris." : error.message);
    typing.current = false;
    setSaved(true);
    changed();
    load();
  }

  async function uploadAvatar(f: File) {
    if (me === null || me === "none") return;
    const err = validateAvatar(f);
    if (err) return void setSaveError(err);
    const path = `${me.id}/avatar-${Date.now()}.${f.name.split(".").pop() || "png"}`;
    const { error } = await supabase.storage
      .from("avatars")
      .upload(path, f, { contentType: f.type });
    if (error) return void setSaveError(error.message);
    const { error: e2 } = await supabase
      .from("profiles")
      .update({ avatar_url: path })
      .eq("id", me.id);
    if (e2) return void setSaveError(e2.message);
    if (me.avatar_url) supabase.storage.from("avatars").remove([me.avatar_url]);
    changed();
    load();
  }

  async function setColor(c: string) {
    if (me === null || me === "none") return;
    const { error } = await supabase.from("profiles").update({ color: c }).eq("id", me.id);
    if (error) return void setSaveError(error.message);
    changed();
    load();
  }

  async function deleteMe() {
    const ok = await confirmAction({
      title: "Supprimer mon compte ?",
      message:
        "Ton profil, tes avatars et tes jets seront supprimés, ainsi que les tables où tu es seul. Tes fiches restent dans leur table, sans joueur. Action irréversible.",
      confirmLabel: "Supprimer mon compte",
    });
    if (!ok) return;
    try {
      await removeMe();
      await supabase.auth.signOut();
      window.location.assign("/");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Suppression impossible.");
    }
  }

  const shown = username.trim() || me.username;
  const edited = username.trim() !== (me.username ?? "");
  return (
    <main className="profile-page">
      <div className={`wrap hub acct neon-${me.color}`}>
        <header className="hub-head">
          <p className="hub-hello">Ton identité, à toutes tes tables</p>
          <h1>Mon compte</h1>
        </header>
        <InlineError message={saveError} onClear={() => setSaveError(null)} />

        <section className="id-card" aria-label="Identité">
          <div className="id-main">
            <label className="id-avatar" htmlFor="profile-avatar" title="Changer l’avatar">
              {avatar ? <img src={avatar} alt="" /> : <UserRound size={38} aria-hidden="true" />}
              <span>
                <Camera size={15} aria-hidden="true" />
              </span>
            </label>
            <input
              id="profile-avatar"
              type="file"
              accept="image/*"
              aria-label="Changer l’avatar"
              className="profile-file"
              onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0])}
            />
            <div className="id-name">
              <strong>{shown}</strong>
              <small>Image de {AVATAR_MAX_MB} Mo maximum, touche ton avatar pour la changer.</small>
            </div>
          </div>
          <div className="id-fields">
            <form
              className="id-field"
              onSubmit={(e) => {
                e.preventDefault();
                void saveUsername();
              }}
            >
              <label htmlFor="profile-username">Pseudo</label>
              <div className="hub-form-row">
                <input
                  id="profile-username"
                  className="field"
                  value={username}
                  maxLength={20}
                  onChange={(e) => {
                    typing.current = true;
                    setUsername(e.target.value);
                    setSaved(false);
                  }}
                />
                <Button type="submit" className="btn y" disabled={!edited}>
                  {saved && !edited ? <Check size={16} /> : <Save size={16} />}
                  {saved && !edited ? "Enregistré" : "Enregistrer"}
                </Button>
              </div>
              <small>3 à 20 caractères, unique sur le site.</small>
            </form>
            <div className="id-field">
              <span id="profile-color">Ta couleur</span>
              <div className="profile-swatches" role="group" aria-labelledby="profile-color">
                {NEON_COLORS.map((c) => (
                  <Button
                    key={c.id}
                    onClick={() => setColor(c.id)}
                    className={`profile-swatch neon-${c.id}`}
                    aria-label={c.label}
                    title={c.label}
                    aria-pressed={me.color === c.id}
                  >
                    {me.color === c.id && <Check size={18} />}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <TableAvatars userId={me.id} fallback={avatar} onError={setSaveError} />

        <ul className="acct-rows">
          <li>
            <Link to="/mot-de-passe">
              <KeyRound size={18} aria-hidden="true" />
              <span>
                <b>Mot de passe</b>
                <small>Le changer</small>
              </span>
              <ChevronRight size={18} aria-hidden="true" />
            </Link>
          </li>
          <li>
            <Link to="/confidentialite">
              <ShieldCheck size={18} aria-hidden="true" />
              <span>
                <b>Confidentialité</b>
                <small>Ce que nous gardons, et pourquoi</small>
              </span>
              <ChevronRight size={18} aria-hidden="true" />
            </Link>
          </li>
          <li>
            <Button
              onClick={async () => {
                await supabase.auth.signOut();
                window.location.assign("/");
              }}
            >
              <LogOut size={18} aria-hidden="true" />
              <span>
                <b>Déconnexion</b>
                <small>Quitter ce compte sur cet appareil</small>
              </span>
              <ChevronRight size={18} aria-hidden="true" />
            </Button>
          </li>
        </ul>

        {!identity.isAdmin && (
          <section className="acct-danger">
            <div>
              <h2>Supprimer mon compte</h2>
              <p>Définitif. Tes fiches restent dans leur table, sans joueur.</p>
            </div>
            <Button className="btn red" onClick={deleteMe}>
              <Trash2 size={16} /> Supprimer
            </Button>
          </section>
        )}
      </div>
    </main>
  );
}

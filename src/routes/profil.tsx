import { useWords } from "@/lib/universe-context";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AVATAR_MAX_MB, NEON_COLORS, validateAvatar, validateUsername } from "@/lib/profile";
import { useIdentity } from "@/lib/active-character";
import { deleteMyAccount } from "@/lib/accounts.functions";

import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/InlineError";
import { confirmAction } from "@/components/ConfirmDialog";
import {
  ArrowUpRight,
  Check,
  LifeBuoy,
  Save,
  Trash2,
  Upload,
  UserRound,
  Users,
} from "lucide-react";

export const Route = createFileRoute("/profil")({
  ssr: false,
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Mon profil" },
      { name: "description", content: "Pseudo, avatar, couleur et personnages de ton compte." },
      { property: "og:title", content: "Mon profil" },
      {
        property: "og:description",
        content: "Pseudo, avatar, couleur et personnages de ton compte.",
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
  const W = useWords();
  const identity = useIdentity();
  const removeMe = useServerFn(deleteMyAccount);
  const [me, setMe] = useState<Me | null | "none">(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [chars, setChars] = useState<{ id: string; name: string; handle: string | null }[]>([]);
  const [username, setUsername] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [supportUnread, setSupportUnread] = useState(0);

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
    setUsername(p.username ?? "");
    if (p.avatar_url) {
      const { data: s } = await supabase.storage
        .from("avatars")
        .createSignedUrl(p.avatar_url, 3600);
      setAvatar(s?.signedUrl ?? null);
    } else setAvatar(null);
    const { data: c } = await supabase
      .from("characters")
      .select("id,name,handle")
      .eq("owner_id", u.user.id)
      .order("name");
    setChars(c ?? []);
    const { count } = await supabase
      .from("support_tickets")
      .select("id", { count: "exact", head: true })
      .eq("user_unread", true);
    setSupportUnread(count ?? 0);
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
        "Ton profil, tes avatars et tes jets seront supprimés, ainsi que les équipes où tu es seul. Tes fiches restent dans leur équipe, sans joueur. Action irréversible.",
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

  return (
    <main className="profile-page">
      <div className="profile-content">
        <header className="profile-heading">
          <div>
            <p className="profile-eyebrow">{W.tableName.toUpperCase()} / COMPTE</p>
            <h1>MON PROFIL</h1>
          </div>
          <span className="profile-role">
            {identity.isVisitor ? "ADMIN" : identity.isGm ? "MJ" : "JOUEUR"}
          </span>
        </header>

        <div className="profile-layout">
          <div className="profile-identity">
            <section className="profile-section">
              <div className="ph">
                <h2>IDENTITÉ</h2>
              </div>
              <div className="profile-avatar-row">
                <div className={`profile-avatar neon-${me.color}`}>
                  {avatar ? <img src={avatar} alt="Avatar" /> : <UserRound size={32} />}
                </div>
                <div className="profile-upload">
                  <Button asChild className="btn profile-action">
                    <label htmlFor="profile-avatar">
                      <Upload size={16} />
                      Changer l’avatar
                    </label>
                  </Button>
                  <input
                    id="profile-avatar"
                    type="file"
                    accept="image/*"
                    className="profile-file"
                    onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0])}
                  />
                  <p className="note">Image · {AVATAR_MAX_MB} Mo maximum</p>
                </div>
              </div>
              <label className="profile-label" htmlFor="profile-username">
                PSEUDO
              </label>
              <div className="profile-input-row">
                <input
                  id="profile-username"
                  className="field"
                  value={username}
                  maxLength={20}
                  onChange={(e) => setUsername(e.target.value)}
                />
                <Button
                  className="btn y profile-save"
                  onClick={saveUsername}
                  aria-label="Enregistrer le pseudo"
                  title="Enregistrer le pseudo"
                >
                  <Save size={18} />
                </Button>
              </div>
              <p className="note">3 à 20 caractères · unique</p>
              <InlineError message={saveError} onClear={() => setSaveError(null)} />
            </section>

            <section className="profile-section">
              <div className="ph">
                <h2>COULEUR</h2>
              </div>
              <div className="profile-swatches">
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
              <p className={`profile-preview neon-${me.color}`}>
                <span className="profile-status-dot" />
                {me.username}
              </p>
            </section>
          </div>
          <div className="profile-details">
            <section className="profile-section">
              <div className="ph">
                <h2>MES PERSONNAGES</h2>
                <span className="tag">{chars.length}</span>
              </div>
              {chars.length === 0 ? (
                <div className="profile-empty">
                  <Users size={24} />
                  <p>Aucun personnage pour l’instant.</p>
                </div>
              ) : (
                <ul className="profile-characters">
                  {chars.map((c) => (
                    <li key={c.id}>
                      <Link
                        to="/fiche"
                        onClick={() => {
                          localStorage.setItem("activeCharacterId", c.id);
                          window.dispatchEvent(new Event("active-character:changed"));
                        }}
                      >
                        <span>
                          <b>{c.handle || c.name}</b>
                          {c.handle && <small>{c.name}</small>}
                        </span>
                        <ArrowUpRight size={18} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="profile-section">
              <div className="ph">
                <h2>SUPPORT</h2>
                {supportUnread > 0 && (
                  <span className="tag">
                    {supportUnread} {supportUnread > 1 ? "réponses" : "réponse"}
                  </span>
                )}
              </div>
              <p className="note">Un problème, une question ? Écris-nous, la réponse arrive ici.</p>
              <div className="profile-account">
                <Button asChild className="btn profile-action">
                  <Link to="/support">
                    <LifeBuoy size={16} /> Mes demandes d’aide
                  </Link>
                </Button>
              </div>
            </section>
            <section className="profile-section">
              <div className="ph">
                <h2>COMPTE</h2>
              </div>
              <div className="profile-account">
                <Button asChild className="btn profile-action">
                  <Link to="/mot-de-passe">Changer le mot de passe</Link>
                </Button>
                {!identity.isAdmin && (
                  <Button className="btn red" onClick={deleteMe}>
                    <Trash2 size={16} /> Supprimer mon compte
                  </Button>
                )}
              </div>
              <p className="note">
                <Link to="/confidentialite">Confidentialité</Link>
              </p>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

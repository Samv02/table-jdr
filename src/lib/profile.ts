import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const NEON_COLORS = [
  { id: "yellow", label: "Jaune" },
  { id: "red", label: "Rouge" },
  { id: "cyan", label: "Cyan" },
  { id: "green", label: "Vert" },
  { id: "violet", label: "Violet" },
  { id: "orange", label: "Orange" },
] as const;
export type NeonColor = (typeof NEON_COLORS)[number]["id"];
export const neonVar = (c: string | null | undefined) => `var(--neon-${c || "cyan"})`;

export const AVATAR_MAX_MB = 10;
export const AVATAR_MAX_BYTES = AVATAR_MAX_MB * 1024 * 1024;

export function validateUsername(raw: string): string | null {
  const u = raw.trim();
  if (u.length < 3 || u.length > 20) return "Le pseudo doit faire entre 3 et 20 caractères.";
  return null;
}

export function validateAvatar(file: { size: number; type: string }): string | null {
  if (!file.type.startsWith("image/")) return "Le fichier doit être une image.";
  if (file.size > AVATAR_MAX_BYTES) return `L'image dépasse ${AVATAR_MAX_MB} Mo.`;
  return null;
}

export type PublicProfile = {
  id: string;
  username: string | null;
  color: string;
  avatar_url: string | null;
  avatar?: string | undefined;
};

/** Profiles of the active team with signed avatar URLs; refreshes when any profile changes. */
export function useProfiles() {
  const [profiles, setProfiles] = useState<Record<string, PublicProfile>>({});
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [{ data }, { data: members }] = await Promise.all([
        supabase.from("profiles").select("id,username,color,avatar_url"),
        supabase.rpc("get_team_members"),
      ]);
      // À une table, la photo propre à cette table remplace celle du compte
      const atTable = new Map((members ?? []).map((m) => [m.user_id, m.avatar_url]));
      const list = ((data ?? []) as PublicProfile[]).map((p) => ({
        ...p,
        avatar_url: atTable.get(p.id) ?? p.avatar_url,
      }));
      const paths = list.map((p) => p.avatar_url).filter((x): x is string => !!x);
      const urls: Record<string, string> = {};
      if (paths.length) {
        const { data: s } = await supabase.storage.from("avatars").createSignedUrls(paths, 3600);
        s?.forEach((x) => x.path && x.signedUrl && (urls[x.path] = x.signedUrl));
      }
      if (alive)
        setProfiles(
          Object.fromEntries(
            list.map((p) => [
              p.id,
              { ...p, avatar: p.avatar_url ? urls[p.avatar_url] : undefined },
            ]),
          ),
        );
    };
    load();
    window.addEventListener("profile:changed", load);
    return () => {
      alive = false;
      window.removeEventListener("profile:changed", load);
    };
  }, []);
  return profiles;
}

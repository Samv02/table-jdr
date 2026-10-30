import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type MiniChar = { id: string; name: string; handle: string | null };
export type Identity = {
  ready: boolean;
  userId: string | null;
  isGm: boolean;
  username: string | null;
  characters: MiniChar[];
  active: MiniChar | null;
  setActive: (id: string | null) => void;
};

const KEY = "activeCharacterId";
const EVT = "active-character:changed";

export const charLabel = (c: MiniChar | null) => (c ? (c.handle || c.name).toUpperCase() : null);

/** Pick the active character: the stored one if still allowed, else the only one (players). */
export function pickActive(
  chars: MiniChar[],
  stored: string | null,
  isGm: boolean,
): MiniChar | null {
  const found = chars.find((c) => c.id === stored);
  if (found) return found;
  if (!isGm && chars.length === 1) return chars[0] ?? null;
  if (!isGm && chars.length > 1) return chars[0] ?? null;
  return null;
}

/** Display name used in the roll feed, mirrors the server rule. */
export function displayName(opts: {
  character: MiniChar | null;
  isGm: boolean;
  username: string | null;
}) {
  if (opts.character) return opts.character.handle || opts.character.name;
  if (opts.isGm) return "MJ";
  return opts.username ?? "?";
}

export function useIdentity(): Identity {
  const [s, setS] = useState<Omit<Identity, "setActive">>({
    ready: false,
    userId: null,
    isGm: false,
    username: null,
    characters: [],
    active: null,
  });

  const load = useCallback(async () => {
    const { data: u } = await supabase.auth.getSession();
    const uid = u.session?.user.id ?? null;
    if (!uid)
      return setS({
        ready: true,
        userId: null,
        isGm: false,
        username: null,
        characters: [],
        active: null,
      });
    const { data: p } = await supabase
      .from("profiles")
      .select("username,role")
      .eq("id", uid)
      .maybeSingle();
    const isGm = p?.role === "gm";
    let q = supabase.from("characters").select("id,name,handle").order("name");
    if (!isGm) q = q.eq("owner_id", uid);
    const { data: c } = await q;
    const chars = c ?? [];
    setS({
      ready: true,
      userId: uid,
      isGm,
      username: p?.username ?? null,
      characters: chars,
      active: pickActive(chars, localStorage.getItem(KEY), isGm),
    });
  }, []);

  useEffect(() => {
    load();
    const { data } = supabase.auth.onAuthStateChange((e) => {
      if (e === "SIGNED_IN" || e === "SIGNED_OUT" || e === "USER_UPDATED") load();
    });
    window.addEventListener(EVT, load);
    window.addEventListener("profile:changed", load);
    return () => {
      data.subscription.unsubscribe();
      window.removeEventListener(EVT, load);
      window.removeEventListener("profile:changed", load);
    };
  }, [load]);

  const setActive = useCallback((id: string | null) => {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
    window.dispatchEvent(new Event(EVT));
  }, []);

  return { ...s, setActive };
}

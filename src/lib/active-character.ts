import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type MiniChar = { id: string; name: string; handle: string | null };
export type Identity = {
  ready: boolean;
  userId: string | null;
  /** MJ de l'équipe active (l'admin de la plateforme l'est aussi dans l'équipe où il est entré). */
  isGm: boolean;
  isAdmin: boolean;
  /** Admin entré dans une équipe dont il n'est pas membre. */
  isVisitor: boolean;
  teamId: string | null;
  teamName: string | null;
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

const NOBODY = {
  userId: null,
  isGm: false,
  isAdmin: false,
  isVisitor: false,
  teamId: null,
  teamName: null,
  username: null,
  characters: [],
  active: null,
};

export function useIdentity(): Identity {
  const [s, setS] = useState<Omit<Identity, "setActive">>({ ready: false, ...NOBODY });

  const load = useCallback(async () => {
    const { data: u } = await supabase.auth.getSession();
    const uid = u.session?.user.id ?? null;
    if (!uid) return setS({ ready: true, ...NOBODY });
    const [{ data: p }, { data: team }] = await Promise.all([
      supabase.from("profiles").select("username").eq("id", uid).maybeSingle(),
      supabase.rpc("get_team_context").maybeSingle(),
    ]);
    const teamId = team?.id ?? null;
    const isAdmin = team?.is_admin === true;
    const isGm = !!teamId && (team?.role === "gm" || isAdmin);
    let q = supabase.from("characters").select("id,name,handle").order("name");
    if (!isGm) q = q.eq("owner_id", uid);
    const { data: c } = await q;
    const chars = c ?? [];
    setS({
      ready: true,
      userId: uid,
      isGm,
      isAdmin,
      isVisitor: !!teamId && isAdmin && !team?.role,
      teamId,
      teamName: team?.name ?? null,
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

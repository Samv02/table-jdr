import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { DEFAULT_UNIVERSE, normalizeUniverse, type Universe } from "@/lib/universe";
import { UniverseContext } from "@/lib/universe-context";
import { applyTheme } from "@/lib/theme";

const CACHE_KEY = "table:universe";

/**
 * Charge l'univers de l'équipe active (univers neutre hors équipe et avant connexion),
 * le garde à jour en direct et applique son thème.
 */
export function UniverseProvider({ children }: { children: ReactNode }) {
  const [saved, setSaved] = useState<Universe>(DEFAULT_UNIVERSE);
  const [draft, setDraft] = useState<Universe | null>(null);
  const alive = useRef(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_universe");
    if (error || !alive.current) return;
    const u = normalizeUniverse(data);
    setSaved(u);
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(u));
    } catch {
      /* rien : simple confort */
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) setSaved(normalizeUniverse(JSON.parse(cached)));
    } catch {
      /* cache illisible : on attend la base */
    }
    void load();
    const { data: sub } = supabase.auth.onAuthStateChange((e) => {
      if (e === "SIGNED_IN" || e === "SIGNED_OUT") void load();
    });
    const channel = supabase
      .channel(`universe-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "session_state" },
        () => void load(),
      )
      .subscribe();
    return () => {
      alive.current = false;
      sub.subscription.unsubscribe();
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const universe = draft ?? saved;
  useEffect(() => applyTheme(universe, draft === null), [universe, draft]);
  useEffect(() => {
    document.title = universe.words.tableName;
  }, [universe.words.tableName]);

  const save = useCallback(async (next: Universe) => {
    const clean = normalizeUniverse(next);
    const { data: team } = await supabase.rpc("current_team");
    if (!team) return "Accès refusé (réservé au MJ).";
    const { data, error } = await supabase
      .from("session_state")
      .update({ universe: clean as unknown as Json })
      .eq("team_id", team)
      .select("team_id");
    if (error) return error.message;
    if (!data?.length) return "Accès refusé (réservé au MJ).";
    setSaved(clean);
    setDraft(null);
    return null;
  }, []);

  return (
    <UniverseContext.Provider value={{ universe, save, preview: setDraft }}>
      {children}
    </UniverseContext.Provider>
  );
}

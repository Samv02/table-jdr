import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Titres des vidéos YouTube via oEmbed (côté serveur : pas de problème CORS, pas de clé d'API).
 * Réservé aux utilisateurs connectés pour ne pas servir de proxy ouvert.
 */
export const youtubeTitles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((ids: string[]) => {
    if (!Array.isArray(ids)) throw new Error("Liste invalide");
    return [...new Set(ids.map(String).filter((id) => /^[\w-]{11}$/.test(id)))].slice(0, 50);
  })
  .handler(async ({ data }) => {
    const out: Record<string, string> = {};
    await Promise.all(
      data.map(async (id) => {
        try {
          const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`;
          const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
          if (!res.ok) return;
          const json = (await res.json()) as { title?: unknown };
          if (typeof json.title === "string" && json.title.trim())
            out[id] = json.title.trim().slice(0, 200);
        } catch {
          /* vidéo privée, supprimée ou réseau : on garde l'identifiant */
        }
      }),
    );
    return out;
  });

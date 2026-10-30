import { useEffect, useState, type ReactNode } from "react";
import { Info, LogOut, TriangleAlert, Wrench, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useIdentity } from "@/lib/active-character";

const DISMISSED_KEY = "table:announcements-closed";
type Announcement = { id: string; body: string; level: string };

function loadDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

/** Écran de maintenance pour tout le monde sauf l'admin ; la connexion reste accessible. */
export function MaintenanceGate({ children }: { children: ReactNode }) {
  const id = useIdentity();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void supabase
      .rpc("get_platform_status")
      .maybeSingle()
      .then(({ data }) => setMessage(data?.maintenance ? data.maintenance_message : null));
  }, [id.userId]);

  if (message === null || !id.ready || !id.userId || id.isAdmin) return children;
  return (
    <main className="maintenance">
      <Wrench size={32} aria-hidden="true" />
      <h1>Maintenance en cours</h1>
      <p>{message || "L’application revient très vite. Merci de ta patience."}</p>
      <button
        type="button"
        className="bo-btn"
        onClick={async () => {
          await supabase.auth.signOut();
          window.location.assign("/");
        }}
      >
        <LogOut size={16} aria-hidden="true" /> Déconnexion
      </button>
    </main>
  );
}

/** Bandeau des annonces de l'admin, qu'on peut fermer pour soi. */
export function AnnouncementBanner() {
  const id = useIdentity();
  const [items, setItems] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);

  useEffect(() => {
    if (!id.userId || id.isAdmin) return;
    setDismissed(loadDismissed());
    const load = async () => {
      const { data } = await supabase
        .from("announcements")
        .select("id,body,level")
        .order("created_at", { ascending: false });
      setItems(data ?? []);
    };
    void load();
    const channel = supabase
      .channel(`announcements-${id.userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "announcements" },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id.userId, id.isAdmin, id.teamId]);

  const shown = items.filter((a) => !dismissed.includes(a.id));
  if (!shown.length) return null;
  return (
    <div className="announcements">
      {shown.map((a) => (
        <p key={a.id} className={a.level === "warning" ? "warning" : ""} role="status">
          {a.level === "warning" ? (
            <TriangleAlert size={16} aria-hidden="true" />
          ) : (
            <Info size={16} aria-hidden="true" />
          )}
          <span>{a.body}</span>
          <button
            type="button"
            aria-label="Fermer l’annonce"
            onClick={() => {
              const next = [...dismissed, a.id];
              setDismissed(next);
              try {
                localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
              } catch {
                /* simple confort */
              }
            }}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </p>
      ))}
    </div>
  );
}

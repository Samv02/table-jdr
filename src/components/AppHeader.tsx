import { Link, useNavigate } from "@tanstack/react-router";
import { Eye, List, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { charLabel, useIdentity } from "@/lib/active-character";
import { useTable } from "@/lib/table-context";
import { Button } from "@/components/ui/button";
import { hudParty } from "@/lib/dashboard";
import { usePinnedFeed } from "@/lib/pinned-feed";
import { useWords } from "@/lib/universe-context";
import { openTeam } from "@/lib/team";
export function AppHeader() {
  const id = useIdentity();
  const table = useTable();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [pulse, setPulse] = useState<string | null>(null);
  const { pinned } = usePinnedFeed(id.userId);
  const W = useWords();
  const [supportUnread, setSupportUnread] = useState(false);
  useEffect(() => {
    if (!id.userId) return;
    const check = async () => {
      const { count } = await supabase
        .from("support_tickets")
        .select("id", { count: "exact", head: true })
        .eq("user_unread", true);
      setSupportUnread((count ?? 0) > 0);
    };
    void check();
    const channel = supabase
      .channel(`support-unread-${id.userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_tickets" },
        () => void check(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id.userId]);
  useEffect(() => {
    if (pinned) setUnread(0);
  }, [pinned]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const rolled = (e: Event) => {
      const r = (e as CustomEvent).detail;
      setPulse(r.character_id ?? "mj");
      timer = setTimeout(() => setPulse(null), 1000);
      if (r.user_id !== id.userId && !pinned) setUnread((n) => n + 1);
    };
    window.addEventListener("roll:received", rolled);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("roll:received", rolled);
    };
  }, [id.userId, pinned]);
  // L'admin hors équipe n'est pas à une table : aucun élément de jeu pour lui
  if (!id.ready || !id.userId || (id.isAdmin && !id.teamId)) return null;
  return (
    <>
      <header className="hud">
        <Link to={id.teamId ? "/fiche" : id.isAdmin ? "/admin" : "/equipes"} className="brand">
          <b>{(id.teamName ?? W.tableName).toUpperCase()}</b>
          <small>{table.activeScene?.name ?? W.tagline.toUpperCase()}</small>
        </Link>
        <div className="party">
          {hudParty(id.teamId ? table.party : []).map((p) => (
            <div
              className={`member ${!id.isGm && p.character_id === id.active?.id ? "me" : ""}`}
              key={p.character_id}
            >
              <div
                className={`av neon-${p.color} ${table.online.has(p.character_id) ? "" : "off"} ${pulse === p.character_id ? "rolling" : ""}`}
              >
                {p.avatar ? (
                  <img src={p.avatar} alt="" />
                ) : (
                  <b>{p.character_id === "mj" ? "MJ" : p.handle.slice(0, 2).toUpperCase()}</b>
                )}
                <i />
              </div>
              <span>
                {!id.isGm && p.character_id === id.active?.id ? "▲ " : ""}
                {p.handle}
              </span>
            </div>
          ))}
        </div>
        <div className="hud-actions">
          {id.teamId && (
            <Button
              variant="prototype"
              className="icon-btn cut-s"
              title="Fil des jets"
              aria-label="Fil des jets"
              onClick={() => {
                setUnread(0);
                window.dispatchEvent(new Event("dice:feed"));
              }}
            >
              <List />
              {!pinned && unread > 0 && <span className="badge">{unread}</span>}
            </Button>
          )}
          <Button
            variant="prototype"
            className="icon-btn cut-s"
            title="Masquer l’interface"
            aria-label="Masquer l’interface"
            onClick={table.toggleClean}
          >
            <Eye />
          </Button>
        </div>
      </header>
      <div className="table-navigation">
        <span className="active-identity">
          {id.isVisitor
            ? "ADMIN EN VISITE"
            : !id.teamId
              ? id.isAdmin
                ? "ADMIN"
                : "Aucune équipe ouverte"
              : id.isGm
                ? "MJ"
                : (charLabel(id.active) ?? "Aucun personnage assigné, demande au MJ")}
        </span>
        {id.characters.length > (id.isGm ? 0 : 1) && (
          <select
            aria-label="Personnage actif"
            value={id.active?.id ?? ""}
            onChange={(e) => id.setActive(e.target.value || null)}
          >
            {id.isGm && <option value="">{id.isVisitor ? "Admin" : "MJ"}</option>}
            {id.characters.map((c) => (
              <option key={c.id} value={c.id}>
                {charLabel(c)}
              </option>
            ))}
          </select>
        )}
        <nav>
          {id.isGm && (
            <Link to="/mj/tableau" activeProps={{ className: "active" }}>
              Tableau de bord
            </Link>
          )}
          {id.teamId && (
            <Link to="/fiche" activeProps={{ className: "active" }}>
              {id.isGm ? "Fiche" : "Ma fiche"}
            </Link>
          )}
          <Link to="/equipes" activeProps={{ className: "active" }}>
            Équipes
          </Link>
          <Link to="/profil" activeProps={{ className: "active" }}>
            Profil
          </Link>
          <Link to="/support" activeProps={{ className: "active" }}>
            Support
            {supportUnread && <span className="nav-dot" aria-label="Nouvelle réponse" />}
          </Link>
          {id.isGm && (
            <Link to="/mj/personnages" activeProps={{ className: "active" }}>
              MJ
            </Link>
          )}
        </nav>
        <div className="nav-actions">
          {id.isVisitor && (
            <Button
              variant="prototype"
              className="btn y visit-exit"
              onClick={() => void openTeam(null, "/admin")}
            >
              Retour au back office
            </Button>
          )}
          <Button
            variant="prototype"
            className="icon-btn cut-s"
            title="Déconnexion"
            aria-label="Déconnexion"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/", replace: true });
            }}
          >
            <LogOut />
          </Button>
        </div>
      </div>
    </>
  );
}

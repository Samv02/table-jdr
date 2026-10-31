import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Clapperboard,
  Eye,
  Gauge,
  Globe2,
  IdCard,
  LayoutGrid,
  List,
  LogOut,
  Music2,
  ScrollText,
  UserRound,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { charLabel, useIdentity } from "@/lib/active-character";
import { useTable } from "@/lib/table-context";
import { Button } from "@/components/ui/button";
import { hudParty } from "@/lib/dashboard";
import { usePinnedFeed } from "@/lib/pinned-feed";
import { useWords } from "@/lib/universe-context";
import { openTeam } from "@/lib/team";
import { activeTab, GM_TABS, OUTSIDE_TABS, type TableTabIcon } from "@/lib/navigation";

const TAB_ICONS: Record<TableTabIcon, typeof Gauge> = {
  partie: Gauge,
  scenes: Clapperboard,
  musique: Music2,
  personnages: IdCard,
  joueurs: Users,
  univers: Globe2,
};

/** Hors de toute table : pas de groupe ni de dés, seulement le compte. */
function AccountBar() {
  const navigate = useNavigate();
  return (
    <header className="account-bar">
      <Link to="/tables" className="account-brand">
        <LayoutGrid size={17} aria-hidden="true" /> Table JDR
      </Link>
      <nav aria-label="Navigation du compte">
        {OUTSIDE_TABS.map((tab) => (
          <Link key={tab.to} to={tab.to} activeProps={{ className: "active" }}>
            {tab.label}
          </Link>
        ))}
      </nav>
      <Button
        className="icon-btn cut-s"
        title="Déconnexion"
        aria-label="Déconnexion"
        onClick={async () => {
          await supabase.auth.signOut();
          await navigate({ to: "/", replace: true });
        }}
      >
        <LogOut />
      </Button>
    </header>
  );
}
export function AppHeader() {
  const id = useIdentity();
  const table = useTable();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
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
  // L'admin hors table a son back office
  if (!id.ready || !id.userId || (id.isAdmin && !id.teamId)) return null;
  if (!id.teamId) return <AccountBar />;
  const current = activeTab(pathname, id.isGm);
  // Le joueur change de personnage ; le MJ change de fiche seulement quand il en lit une
  const showPicker = id.isGm
    ? pathname === "/fiche" && id.characters.length > 0
    : id.characters.length > 1;
  return (
    <>
      <header className="hud">
        <Link to={id.isGm ? "/mj/tableau" : "/fiche"} className="brand">
          <b>{(id.teamName ?? W.tableName).toUpperCase()}</b>
          <small>{table.activeScene?.name ?? W.tagline.toUpperCase()}</small>
        </Link>
        <div className="party">
          {hudParty(table.party).map((p) => (
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
          <Button
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
          <Button
            className="icon-btn cut-s"
            title="Masquer l’interface"
            aria-label="Masquer l’interface"
            onClick={table.toggleClean}
          >
            <Eye />
          </Button>
        </div>
      </header>
      <div className={`table-navigation ${id.isGm ? "" : "solo"}`}>
        <Button
          className="nav-exit"
          title="Quitter cette table et revenir à toutes tes parties"
          onClick={() => void openTeam(null, id.isVisitor ? "/admin" : "/tables")}
        >
          <LayoutGrid size={15} aria-hidden="true" />
          <span>{id.isVisitor ? "Back office" : "Mes tables"}</span>
        </Button>
        <nav aria-label="Navigation de la table">
          {id.isGm ? (
            GM_TABS.map((group) => (
              <div className="nav-group" key={group[0]?.to}>
                {group.map((tab) => {
                  const Icon = TAB_ICONS[tab.icon];
                  return (
                    <Link
                      key={tab.to}
                      to={tab.to}
                      className={current === tab.to ? "active" : ""}
                      aria-current={current === tab.to ? "page" : undefined}
                    >
                      <Icon size={15} aria-hidden="true" />
                      <span>{tab.label}</span>
                    </Link>
                  );
                })}
              </div>
            ))
          ) : (
            <div className="nav-group">
              <Link to="/fiche" activeProps={{ className: "active" }}>
                <ScrollText size={15} aria-hidden="true" />
                <span>Ma fiche</span>
              </Link>
            </div>
          )}
        </nav>
        <div className="nav-actions">
          {showPicker && (
            <select
              aria-label={id.isGm ? "Fiche affichée" : "Personnage actif"}
              value={id.active?.id ?? ""}
              onChange={(e) => id.setActive(e.target.value || null)}
            >
              {id.isGm && <option value="">Choisir une fiche</option>}
              {id.characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {charLabel(c)}
                </option>
              ))}
            </select>
          )}
          <Link
            to="/profil"
            className="nav-account"
            title="Mon compte"
            aria-label="Mon compte"
            activeProps={{ className: "active" }}
          >
            <UserRound size={16} aria-hidden="true" />
            {supportUnread && <span className="nav-dot" aria-label="Nouvelle réponse du support" />}
          </Link>
        </div>
      </div>
    </>
  );
}

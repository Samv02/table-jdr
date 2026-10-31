import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { UserMinus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/InlineError";
import { confirmAction } from "@/components/ConfirmDialog";
import { TeamSettings } from "@/components/TeamSettings";
import { useIdentity } from "@/lib/active-character";
import { neonVar, useProfiles } from "@/lib/profile";

export const Route = createFileRoute("/mj/joueurs")({
  ssr: false,
  head: () => ({ meta: [{ title: "Joueurs" }] }),
  component: Players,
});

type Member = { id: string; username: string | null; role: string };
type Sheet = { name: string; owner_id: string | null };

function Players() {
  const identity = useIdentity();
  const profiles = useProfiles();
  const [members, setMembers] = useState<Member[]>([]);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data: p }, { data: c }] = await Promise.all([
      supabase.rpc("get_team_members"),
      supabase.from("characters").select("name,owner_id").order("name"),
    ]);
    setMembers((p ?? []).map((m) => ({ id: m.user_id, username: m.username, role: m.role })));
    setSheets(c ?? []);
  }, []);
  useEffect(() => void load(), [load]);

  async function setRole(id: string, role: string) {
    const { error } = await supabase.rpc("set_user_role", { _user: id, _role: role });
    if (error) return void setErr(error.message);
    window.dispatchEvent(new Event("profile:changed"));
    void load();
  }
  async function remove(m: Member) {
    if (busy || m.id === identity.userId) return;
    const name = m.username ?? m.id.slice(0, 8);
    const ok = await confirmAction({
      title: `Retirer « ${name} » de la table ?`,
      message:
        "Son compte est conservé. Ses personnages restent à la table, sans joueur. Pour revenir, il lui faudra une invitation.",
      confirmLabel: "Retirer de la table",
    });
    if (!ok) return;
    setBusy(true);
    const { error } = await supabase.rpc("remove_team_member", { _user: m.id });
    setBusy(false);
    if (error) return void setErr(error.message);
    window.dispatchEvent(new Event("profile:changed"));
    window.dispatchEvent(new Event("table:refresh"));
    await load();
  }

  return (
    <main>
      <div className="wrap players-page">
        <header className="page-head">
          <h1>Joueurs</h1>
          <p>Qui est à ta table, comment les inviter, et quand vous jouez.</p>
        </header>
        <div className="players-layout">
          <section className="panel cut">
            <div className="ph">
              <h2>À la table</h2>
              <span className="tag">{members.length}</span>
            </div>
            <InlineError message={err} onClear={() => setErr(null)} />
            <ul className="member-list">
              {members.map((m) => {
                const profile = profiles[m.id];
                const name = m.username ?? m.id.slice(0, 8);
                const mine = sheets.filter((s) => s.owner_id === m.id).map((s) => s.name);
                return (
                  <li key={m.id}>
                    {profile?.avatar ? (
                      <img src={profile.avatar} alt="" className="av" />
                    ) : (
                      <div className="av" />
                    )}
                    <div className="record-name">
                      <p style={{ color: neonVar(profile?.color) }}>{name}</p>
                      <p className="note">
                        {mine.join(", ") ||
                          (m.role === "gm" ? "Mène la partie" : "Aucun personnage")}
                      </p>
                    </div>
                    <select
                      aria-label={`Rôle de ${name}`}
                      value={m.role}
                      disabled={busy}
                      onChange={(e) => void setRole(m.id, e.target.value)}
                      className="field"
                    >
                      <option value="player">Joueur</option>
                      <option value="gm">MJ</option>
                    </select>
                    <Button
                      className="icon-btn cut-s"
                      aria-label={`Retirer ${name} de la table`}
                      title={
                        m.id === identity.userId
                          ? "Pour partir, utilise Mes tables"
                          : "Retirer de la table"
                      }
                      disabled={busy || m.id === identity.userId}
                      onClick={() => void remove(m)}
                    >
                      <UserMinus />
                    </Button>
                  </li>
                );
              })}
            </ul>
          </section>
          <TeamSettings />
        </div>
      </div>
    </main>
  );
}

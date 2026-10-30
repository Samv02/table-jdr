import { useEffect, useState } from "react";
import { useTable } from "@/lib/table-context";
import { supabase } from "@/integrations/supabase/client";
import { useIdentity } from "@/lib/active-character";
import { hpMax, readStats, readWeapons, type Sheet } from "@/lib/sheet";
import { useUniverse } from "@/lib/universe-context";
import { Button } from "./ui/button";
import { useNavigate } from "@tanstack/react-router";
import { confirmAction } from "@/components/ConfirmDialog";
import { InlineError } from "@/components/InlineError";
type Row = {
  id: string;
  name: string;
  handle: string | null;
  sheet: Sheet;
  character_state: { hp_current: number; eddies: number; ammo: unknown } | null;
};
export function GmTable() {
  const table = useTable();
  const id = useIdentity();
  const navigate = useNavigate();
  const { universe: u } = useUniverse();
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!id.isGm) return;
    const load = async () => {
      const { data, error } = await supabase
        .from("characters")
        .select("id,name,handle,sheet,character_state(hp_current,eddies,ammo)")
        .order("name");
      if (error) setErr(error.message);
      else setRows((data ?? []) as Row[]);
    };
    void load();
    const channel = supabase
      .channel(`gm-table-${Math.random()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "character_state" },
        () => void load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "characters" },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id.isGm]);
  const remove = async (r: Row) => {
    if (
      !(await confirmAction({
        title: `Supprimer la fiche « ${r.handle ?? r.name} » ?`,
        message:
          "Toutes ses infos (santé, argent, armes, inventaire, notes…) seront supprimées. Action irréversible.",
        confirmLabel: "Supprimer la fiche",
      }))
    )
      return;
    const st = await supabase.from("character_state").delete().eq("character_id", r.id);
    if (st.error) {
      setErr(st.error.message);
      return;
    }
    const { error } = await supabase.from("characters").delete().eq("id", r.id);
    if (error) {
      setErr(error.message);
      return;
    }
    setRows((x) => x.filter((y) => y.id !== r.id));
  };
  return (
    <section className="panel cut">
      <div className="ph">
        <h2>Le groupe</h2>
        <span className="tag">
          {rows.filter((r) => table.online.has(r.id)).length}/{rows.length} EN LIGNE
        </span>
      </div>
      <InlineError message={err} onClear={() => setErr(null)} />
      <div className="pcards">
        {rows.map((r) => {
          const max = hpMax(readStats(r.sheet, u), r.sheet, u);
          const defense = u.rules.defenses[0];
          // Index d'origine conservé : les munitions sont rangées par position de l'arme dans la fiche
          const guns = u.modules.ammo
            ? readWeapons(r.sheet)
                .map((w, i) => ({ w, i }))
                .filter((x) => x.w.capacity > 0)
            : [];
          const member = table.party.find((p) => p.character_id === r.id);
          const state = r.character_state;
          return (
            <article key={r.id} className="pcard cut-s">
              <div className="pcard-top">
                <div
                  className={`av neon-${member?.color ?? "cyan"} ${table.online.has(r.id) ? "" : "off"}`}
                >
                  {member?.avatar ? (
                    <img src={member.avatar} alt="" />
                  ) : (
                    (r.handle ?? r.name).slice(0, 2)
                  )}
                  <i />
                </div>
                <div>
                  <b>{r.handle ?? r.name}</b>
                  <small>{table.online.has(r.id) ? "EN LIGNE" : "HORS LIGNE"}</small>
                </div>
              </div>
              <div className="bar">
                <progress max={max} value={state?.hp_current ?? 0} />
              </div>
              <dl>
                <div>
                  <dt>{u.words.hp}</dt>
                  <dd>
                    {state?.hp_current ?? "—"}/{max}
                  </dd>
                </div>
                {defense && (
                  <div>
                    <dt title={defense.label}>{defense.label.slice(0, 4).toUpperCase()}.</dt>
                    <dd>{String(r.sheet[defense.key] ?? "—")}</dd>
                  </div>
                )}
                {u.modules.money && (
                  <div>
                    <dt>{u.words.moneySymbol}</dt>
                    <dd>{state?.eddies ?? "—"}</dd>
                  </div>
                )}
              </dl>
              {guns.length > 0 && (
                <p className="note">
                  {u.words.rounds.toUpperCase()}
                  <br />
                  {guns
                    .map(
                      ({ w, i }) =>
                        `${w.name} : ${(state?.ammo as Record<string, { mag: number }> | undefined)?.[String(i)]?.mag ?? "—"}/${w.capacity}`,
                    )
                    .join(" · ")}
                </p>
              )}
              <Button
                variant="prototype"
                className="btn"
                onClick={() => {
                  id.setActive(r.id);
                  navigate({ to: "/fiche" });
                }}
              >
                Ouvrir la fiche
              </Button>
              <Button variant="prototype" className="btn red" onClick={() => void remove(r)}>
                Supprimer la fiche
              </Button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

import { Link } from "@tanstack/react-router";
import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useIdentity } from "@/lib/active-character";
import { setupSteps } from "@/lib/hub";
import { useTable } from "@/lib/table-context";
import { DEFAULT_UNIVERSE } from "@/lib/universe";
import { useUniverse } from "@/lib/universe-context";

/** Premiers pas du MJ : disparaît seul quand la table est prête, ou s'il le ferme. */
export function SetupGuide({ sheets, assigned }: { sheets: number; assigned: number }) {
  const id = useIdentity();
  const table = useTable();
  const { saved } = useUniverse();
  const [players, setPlayers] = useState<number | null>(null);
  const key = `table:setup-closed:${id.teamId}`;
  const [closed, setClosed] = useState(true);

  useEffect(() => {
    try {
      setClosed(localStorage.getItem(key) === "1");
    } catch {
      setClosed(false);
    }
    void supabase.rpc("get_team_members").then(({ data }) => {
      setPlayers((data ?? []).filter((m) => m.role !== "gm").length);
    });
  }, [key]);

  if (closed || players === null) return null;
  const steps = setupSteps({
    preset: saved.preset,
    tableNamed: saved.words.tableName !== DEFAULT_UNIVERSE.words.tableName,
    sheets,
    players,
    assigned,
    scene: !!table.activeScene,
  });
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  return (
    <section className="setup-guide" aria-label="Premiers pas">
      <div className="setup-head">
        <h2>Prépare ta table</h2>
        <span className="tag">
          {done}/{steps.length}
        </span>
        <Button
          className="icon-btn cut-s"
          title="Masquer ce guide"
          aria-label="Masquer ce guide"
          onClick={() => {
            setClosed(true);
            try {
              localStorage.setItem(key, "1");
            } catch {
              /* rien : simple confort */
            }
          }}
        >
          <X />
        </Button>
      </div>
      <ol>
        {steps.map((s) => (
          <li key={s.key} className={s.done ? "done" : ""}>
            <Link to={s.to}>
              <i aria-hidden="true">{s.done && <Check size={13} />}</i>
              {s.label}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

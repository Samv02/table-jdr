import { useState } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, CheckCircle2 } from "lucide-react";
import type { AdminDay, AdminOverview } from "@/lib/admin.functions";
import { buildTodo, percent, plural, trend, type TodoItem } from "@/lib/admin";
import { Button } from "@/components/ui/button";

type Kpi = { label: string; value: string | number; hint?: string; change?: number | null };

/** Vue d'ensemble : ce qui demande une action, les indicateurs, puis les tendances. */
export function AdminDashboard({
  data,
  go,
}: {
  data: AdminOverview;
  go: (target: TodoItem["go"]) => void;
}) {
  const s = data.stats;
  const todo = buildTodo(data);
  const groups: { title: string; items: Kpi[] }[] = [
    {
      title: "Utilisateurs",
      items: [
        { label: "Comptes", value: s.accounts },
        {
          label: "Actifs sur 7 jours",
          value: s.active7d,
          hint: `${percent(s.active7d, s.accounts)} % des comptes · ${s.active30d} sur 30 jours`,
        },
        {
          label: "Nouveaux sur 7 jours",
          value: s.newAccounts7d,
          change: trend(s.newAccounts7d, s.newAccountsPrev7d),
        },
        {
          label: "Dans une table",
          value: `${percent(s.accounts - s.noTeam, s.accounts)} %`,
          hint: `${s.noTeam} sans table`,
        },
      ],
    },
    {
      title: "Tables et jeu",
      items: [
        {
          label: "Tables actives",
          value: s.activeTeams7d,
          hint: `sur ${plural(s.teams, "table")}, 7 derniers jours`,
        },
        { label: "Fiches", value: s.characters, hint: `${s.orphanCharacters} sans joueur` },
        { label: "Jets sur 7 jours", value: s.rolls7d, change: trend(s.rolls7d, s.rollsPrev7d) },
        {
          label: "Messages sur 7 jours",
          value: s.messages7d,
          change: trend(s.messages7d, s.messagesPrev7d),
        },
      ],
    },
    {
      title: "Support",
      items: [
        { label: "Ouverts", value: s.ticketsOpen },
        { label: "En cours", value: s.ticketsInProgress },
        { label: "Traités sur 7 jours", value: s.ticketsResolved7d },
        {
          label: "Première réponse",
          value: s.firstReplyHours === null ? "—" : `${s.firstReplyHours.toFixed(1)} h`,
          hint: "délai moyen",
        },
      ],
    },
  ];
  const ranked = [...data.teams]
    .filter((t) => t.rolls7d + t.messages7d > 0)
    .sort((a, b) => b.rolls7d + b.messages7d - (a.rolls7d + a.messages7d))
    .slice(0, 5);
  const peak = Math.max(1, ...ranked.map((t) => t.rolls7d + t.messages7d));

  return (
    <div className="bo-dash">
      <section>
        <h2 className="bo-section">À traiter</h2>
        {todo.length === 0 ? (
          <p className="bo-ok">
            <CheckCircle2 size={18} aria-hidden="true" /> Rien à traiter pour l’instant.
          </p>
        ) : (
          <ul className="bo-todo">
            {todo.map((t) => (
              <li key={t.key}>
                <Button onClick={() => go(t.go)}>
                  <b>{t.count}</b>
                  <span>{t.label}</span>
                  <ArrowRight size={16} aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {groups.map((g) => (
        <section key={g.title}>
          <h2 className="bo-section">{g.title}</h2>
          <div className="bo-kpis">
            {g.items.map((k) => (
              <KpiTile key={k.label} {...k} />
            ))}
          </div>
        </section>
      ))}
      <section>
        <h2 className="bo-section">14 derniers jours</h2>
        <div className="bo-charts">
          <DayChart title="Inscriptions" days={data.days} field="signups" />
          <DayChart title="Jets de dés" days={data.days} field="rolls" />
          <DayChart title="Messages" days={data.days} field="messages" />
        </div>
      </section>
      <section>
        <h2 className="bo-section">Tables les plus actives (7 jours)</h2>
        {ranked.length === 0 ? (
          <p className="bo-muted">Aucune activité sur 7 jours.</p>
        ) : (
          <ul className="bo-ranking">
            {ranked.map((t) => {
              const total = t.rolls7d + t.messages7d;
              return (
                <li key={t.id}>
                  <span className="bo-rank-name">{t.name}</span>
                  <span className="bo-rank-track" aria-hidden="true">
                    <i style={{ width: `${(total / peak) * 100}%` }} />
                  </span>
                  <span className="bo-rank-value">
                    {plural(t.rolls7d, "jet")} · {plural(t.messages7d, "message")}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function KpiTile({ label, value, hint, change }: Kpi) {
  return (
    <div className="bo-kpi">
      <small>{label}</small>
      <b>{value}</b>
      {typeof change === "number" ? (
        <span className="bo-change">
          {change >= 0 ? (
            <ArrowUpRight size={14} aria-hidden="true" />
          ) : (
            <ArrowDownRight size={14} aria-hidden="true" />
          )}
          {change > 0 ? "+" : ""}
          {change} % sur 7 jours
        </span>
      ) : (
        hint && <span className="bo-muted">{hint}</span>
      )}
    </div>
  );
}

const shortDay = (day: string) => {
  const [, month, date] = day.split("-");
  return `${date}/${month}`;
};

function DayChart({
  title,
  days,
  field,
}: {
  title: string;
  days: AdminDay[];
  field: "signups" | "rolls" | "messages";
}) {
  const [hover, setHover] = useState<number | null>(null);
  const peak = Math.max(1, ...days.map((d) => d[field]));
  const total = days.reduce((n, d) => n + d[field], 0);
  const focused = hover === null ? null : days[hover];
  return (
    <figure className="bo-chart">
      <figcaption>
        <span>{title}</span>
        <b>{focused ? `${focused[field]} le ${shortDay(focused.day)}` : `${total} au total`}</b>
      </figcaption>
      <div className="bo-bars" onPointerLeave={() => setHover(null)}>
        {days.map((d, i) => (
          <Button
            key={d.day}
            aria-label={`${shortDay(d.day)} : ${d[field]}`}
            onPointerEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
          >
            <i
              className={d[field] === 0 ? "zero" : ""}
              style={{ height: `${(d[field] / peak) * 100}%` }}
            />
          </Button>
        ))}
      </div>
      <div className="bo-axis" aria-hidden="true">
        <span>{days[0] ? shortDay(days[0].day) : ""}</span>
        <span>{days.at(-1) ? shortDay(days.at(-1)?.day ?? "") : ""}</span>
      </div>
    </figure>
  );
}

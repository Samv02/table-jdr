import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { Pin, PinOff, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { rollDice } from "@/lib/dice.functions";
import { DICE_SIDES, MAX_DICE_SIDES, formula, validateRoll } from "@/lib/dice";
import { useProfiles } from "@/lib/profile";
import { DieIcon } from "./DieIcon";
import { RollAnimation, type PendingRoll } from "./RollAnimation";
import { charLabel, useIdentity } from "@/lib/active-character";
import { usePinnedFeed } from "@/lib/pinned-feed";
import { useUniverse } from "@/lib/universe-context";
import { dieClass, rollVerdict } from "@/lib/universe";

type Roll = {
  id: string;
  user_id: string;
  label: string | null;
  dice_count: number;
  dice_sides: number;
  modifier: number;
  results: number[];
  total: number;
  is_secret: boolean;
  created_at: string;
  author_name: string | null;
  character_name: string | null;
  display_name: string | null;
  target?: number | null;
};

export function DicePanel({ fiche = false }: { fiche?: boolean }) {
  const identity = useIdentity();
  const [open, setOpen] = useState(false);
  const [feed, setFeed] = useState(false);
  const { pinned, setPinned } = usePinnedFeed(identity.userId);
  const [desktop, setDesktop] = useState(false);
  const pinnedDesktop = pinned && desktop;
  const visibleFeed = feed || pinnedDesktop;
  const pinnedRef = useRef(pinnedDesktop);
  pinnedRef.current = pinnedDesktop;
  const { rolls, fresh, profiles } = useRollFeed(identity.userId);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1100px)");
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    const measure = () => {
      document.documentElement.style.setProperty(
        "--table-hud-height",
        `${document.querySelector(".table-navigation")?.getBoundingClientRect().bottom ?? document.querySelector(".hud")?.getBoundingClientRect().bottom ?? 0}px`,
      );
      document.documentElement.style.setProperty(
        "--table-dock-height",
        `${document.querySelector(".dock")?.getBoundingClientRect().height ?? 0}px`,
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    const contentObserver = new MutationObserver(measure);
    contentObserver.observe(document.getElementById("ui") ?? document.body, {
      childList: true,
      subtree: true,
    });
    for (const element of document.querySelectorAll(".hud,.table-navigation,.dock,#ui"))
      observer.observe(element);
    measure();
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      contentObserver.disconnect();
      media.removeEventListener("change", update);
      window.removeEventListener("resize", measure);
    };
  }, [identity.userId, fiche]);
  useEffect(() => {
    document.body.classList.toggle("feed-pinned", pinned && !!identity.userId);
    return () => document.body.classList.remove("feed-pinned");
  }, [pinned, identity.userId]);
  const [pending, setPending] = useState<PendingRoll | null>(null);
  const [result, setResult] = useState<Roll | null>(null);
  const [animationId, setAnimationId] = useState(0);
  const started = useRef(0);
  const fxActive = useRef(false);
  useEffect(() => {
    const launch = () => setOpen(true);
    const show = () => setFeed(true);
    const start = (e: Event) => {
      const r = (e as CustomEvent<PendingRoll>).detail;
      started.current = Date.now();
      fxActive.current = true;
      setPending(r);
      setResult(null);
      setAnimationId((id) => id + 1);
      setOpen(false);
      setFeed(false);
    };
    const rolled = (e: Event) => {
      const r = (e as CustomEvent<Roll>).detail;
      if (!fxActive.current) return;
      setResult(r);
    };
    const failed = () => {
      fxActive.current = false;
      setPending(null);
      setResult(null);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        if (!pinnedRef.current) setFeed(false);
        failed();
      }
    };
    window.addEventListener("dice:open", launch);
    window.addEventListener("dice:feed", show);
    window.addEventListener("roll:start", start);
    window.addEventListener("roll:new", rolled);
    window.addEventListener("roll:failed", failed);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("dice:open", launch);
      window.removeEventListener("dice:feed", show);
      window.removeEventListener("roll:start", start);
      window.removeEventListener("roll:new", rolled);
      window.removeEventListener("roll:failed", failed);
      window.removeEventListener("keydown", escape);
    };
  }, []);
  if (!identity.userId) return null;
  const closeFx = () => {
    fxActive.current = false;
    setPending(null);
    setResult(null);
  };
  const closeFeed = () => {
    setPinned(false);
    setFeed(false);
  };
  const togglePin = () => {
    setPinned(!pinned);
    setFeed(false);
  };
  return (
    <>
      <Button
        aria-label="Ouvrir les dés"
        title={identity.isGm ? "Lancer · MJ" : `Lancer · ${charLabel(identity.active) ?? ""}`}
        className={`fab-desk ${fiche && !identity.isGm ? "player-fab" : ""}`}
        onClick={() => setOpen(true)}
      >
        <DieIcon sides={20} />
      </Button>
      <div
        className={`scrim ${open || (feed && !pinnedDesktop) ? "on" : ""}`}
        onClick={() => {
          setOpen(false);
          if (!pinnedDesktop) setFeed(false);
        }}
      />
      <section className={`sheet ${open ? "open" : ""}`} inert={!open} aria-label="Lanceur de dés">
        <div className="grab" />
        <div className="sheet-heading">
          <h3>LANCEUR DE DÉS</h3>
          <Button
            className="icon-btn cut-s"
            aria-label="Fermer le lanceur"
            onClick={() => setOpen(false)}
          >
            <X />
          </Button>
        </div>
        <Launcher />
      </section>
      <aside
        className={`drawer ${visibleFeed ? "open" : ""} ${pinnedDesktop ? "pinned" : ""}`}
        inert={!visibleFeed}
        aria-label="Fil des jets"
      >
        <div className="drawer-head">
          <h2>FIL DES JETS</h2>
          <span className="live">EN DIRECT</span>
          <div className="drawer-actions">
            <Button
              className="icon-btn cut-s"
              aria-label={pinned ? "Désépingler" : "Épingler"}
              title={pinned ? "Désépingler" : "Épingler"}
              aria-pressed={pinned}
              onClick={togglePin}
            >
              {pinned ? <PinOff /> : <Pin />}
            </Button>
            <Button className="icon-btn cut-s" aria-label="Fermer le fil" onClick={closeFeed}>
              <X />
            </Button>
          </div>
        </div>
        <Feed rolls={rolls} fresh={fresh} profiles={profiles} />
      </aside>
      {pinned && !desktop && (
        <Button
          className="mini-roll-feed"
          aria-label="Ouvrir le fil complet"
          onClick={() => setFeed(true)}
        >
          {rolls.slice(0, 3).map((r) => (
            <span className={`mini-roll neon-${profiles[r.user_id]?.color ?? "cyan"}`} key={r.id}>
              <span className={`av neon-${profiles[r.user_id]?.color ?? "cyan"}`}>
                {profiles[r.user_id]?.avatar ? (
                  <img src={profiles[r.user_id]?.avatar} alt="" />
                ) : (
                  (r.display_name ?? "?").slice(0, 2)
                )}
              </span>
              <span className="mini-roll-name">
                {r.display_name ?? "?"}
                {r.is_secret && <span className="lock">SECRET</span>}
              </span>
              <b>{r.total}</b>
            </span>
          ))}
          {!rolls.length && <span className="note">Aucun jet pour l’instant.</span>}
        </Button>
      )}
      {pending && (
        <RollAnimation
          key={animationId}
          pending={pending}
          result={result}
          startedAt={started.current}
          onClose={closeFx}
        />
      )}
    </>
  );
}

function Launcher() {
  const roll = useServerFn(rollDice);
  const id = useIdentity();
  // Règle absolue : le MJ lance toujours en tant que "MJ" (l'admin en visite sous "Admin") ; un joueur lance avec SON personnage.
  const asName = id.isVisitor ? "Admin" : id.isGm ? "MJ" : (charLabel(id.active) ?? null);
  const canRoll = id.isGm || !!id.active;
  const [count, setCount] = useState(1);
  const { universe: u } = useUniverse();
  const [standardSides, setSides] = useState<number>(u.rules.skillDice.sides);
  const [custom, setCustom] = useState(false);
  const [customSides, setCustomSides] = useState("7");
  const sides = custom ? Number(customSides) : standardSides;
  const validSides = Number.isInteger(sides) && sides >= 2 && sides <= MAX_DICE_SIDES;
  const [mod, setMod] = useState(0);
  const [label, setLabel] = useState("");
  const [secret, setSecret] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function go() {
    const validation = validateRoll({
      dice_count: count,
      dice_sides: sides,
      modifier: mod,
      label: label.trim() || null,
      is_secret: secret,
      character_id: id.isGm ? null : (id.active?.id ?? null),
    });
    if (!canRoll || busy) return;
    if (validation) {
      setErr(validation);
      return;
    }
    setBusy(true);
    setErr(null);
    window.dispatchEvent(
      new CustomEvent("roll:start", {
        detail: {
          dice_count: count,
          dice_sides: sides,
          modifier: mod,
          label: label.trim() || null,
          display_name: asName,
          is_secret: secret,
        },
      }),
    );
    try {
      const row = await roll({
        data: {
          dice_count: count,
          dice_sides: sides,
          modifier: mod,
          label: label.trim() || null,
          is_secret: secret,
          character_id: id.isGm ? null : (id.active?.id ?? null),
        },
      });
      window.dispatchEvent(new CustomEvent("roll:new", { detail: row }));
    } catch (e) {
      window.dispatchEvent(new Event("roll:failed"));
      setErr(e instanceof Error ? e.message : "Erreur");
    }
    setBusy(false);
  }

  return (
    <>
      <div className="dgrid">
        {DICE_SIDES.map((s) => (
          <Button
            key={s}
            className={`die cut-s ${!custom && sides === s ? "on" : ""}`}
            onClick={() => {
              setSides(s);
              setCustom(false);
              setErr(null);
            }}
          >
            <DieIcon sides={s} />
            <span>d{s}</span>
          </Button>
        ))}
      </div>
      <div className="srow">
        <label className="toggle">
          <input
            type="checkbox"
            checked={custom}
            onChange={(e) => {
              setCustom(e.target.checked);
              setErr(null);
            }}
          />
          <i />
          Dé personnalisé
        </label>
        {custom && (
          <div className="stepper">
            <label htmlFor="custom-dice-sides">FACES</label>
            <input
              id="custom-dice-sides"
              className="reason"
              type="number"
              min={2}
              max={MAX_DICE_SIDES}
              step={1}
              aria-label="Nombre de faces"
              aria-invalid={!validSides}
              value={customSides}
              onChange={(e) => {
                setCustomSides(e.target.value);
                setErr(null);
              }}
            />
          </div>
        )}
      </div>
      {custom && !validSides && (
        <p className="note error" role="alert">
          Choisis un nombre entier de 2 à 10 000 faces.
        </p>
      )}
      <div className="srow">
        <div className="stepper">
          <label>NB</label>
          <Button aria-label="Moins de dés" onClick={() => setCount((c) => Math.max(1, c - 1))}>
            −
          </Button>
          <b>{count}</b>
          <Button aria-label="Plus de dés" onClick={() => setCount((c) => Math.min(10, c + 1))}>
            +
          </Button>
        </div>
        <div className="stepper">
          <label>MOD</label>
          <Button aria-label="Diminuer le modificateur" onClick={() => setMod((m) => m - 1)}>
            −
          </Button>
          <input
            type="number"
            aria-label="Modificateur"
            value={mod}
            onChange={(e) => setMod(parseInt(e.target.value) || 0)}
          />
          <Button aria-label="Augmenter le modificateur" onClick={() => setMod((m) => m + 1)}>
            +
          </Button>
        </div>
      </div>
      <div className="srow">
        <input
          className="reason"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Raison (ex : Esquive)"
          maxLength={80}
        />
        <label className="toggle">
          <input type="checkbox" checked={secret} onChange={(e) => setSecret(e.target.checked)} />
          <i />
          Jet secret
        </label>
        <span className="note">{validSides ? formula(count, sides, mod) : "—"}</span>
      </div>
      <Button
        className="go cut"
        disabled={busy || !canRoll || !validSides}
        aria-label="Lancer"
        title={asName ? `Lancer en tant que ${asName}` : "Lancer"}
        onClick={go}
      >
        <DieIcon sides={validSides ? sides : 10} />
      </Button>
      {!canRoll && <p className="note">Aucun personnage assigné, demande au MJ.</p>}
      {err && <p className="note error">{err}</p>}
    </>
  );
}

function useRollFeed(userId: string | null) {
  const seen = useRef(new Set<string>());
  const [rolls, setRolls] = useState<Roll[]>([]);
  const [fresh, setFresh] = useState<string | null>(null);
  const profiles = useProfiles();

  useEffect(() => {
    if (!userId) {
      setRolls([]);
      return;
    }
    seen.current.clear();
    let disposed = false;
    supabase
      .from("rolls")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (!disposed)
          setRolls((prev) =>
            [...prev, ...((data as Roll[]) ?? []).filter((r) => !prev.some((p) => p.id === r.id))]
              .sort((a, b) => b.created_at.localeCompare(a.created_at))
              .slice(0, 50),
          );
      });
    const add = (r: Roll) => {
      if (seen.current.has(r.id)) return;
      seen.current.add(r.id);
      setRolls((prev) => [r, ...prev.filter((x) => x.id !== r.id)].slice(0, 50));
      setFresh(r.id);
      window.dispatchEvent(new CustomEvent("roll:received", { detail: r }));
    };
    const onLocal = (e: Event) => add((e as CustomEvent<Roll>).detail);
    window.addEventListener("roll:new", onLocal);
    const ch = supabase
      .channel(`rolls-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "rolls" }, (p) => {
        add(p.new as Roll);
      })
      .subscribe();
    return () => {
      disposed = true;
      window.removeEventListener("roll:new", onLocal);
      supabase.removeChannel(ch);
    };
  }, [userId]);

  return { rolls, fresh, profiles };
}

function Feed({
  rolls,
  fresh,
  profiles,
}: {
  rolls: Roll[];
  fresh: string | null;
  profiles: ReturnType<typeof useProfiles>;
}) {
  const { universe: u } = useUniverse();
  return (
    <div className="feed">
      {rolls.map((r) => (
        <div
          key={r.id}
          className={`roll cut-s neon-${profiles[r.user_id]?.color ?? "cyan"} ${r.is_secret ? "secret" : ""} ${fresh === r.id ? "new" : ""}`}
        >
          <div className={`av neon-${profiles[r.user_id]?.color ?? "cyan"}`}>
            {profiles[r.user_id]?.avatar ? (
              <img src={profiles[r.user_id]?.avatar} alt="" />
            ) : (
              (r.display_name ?? "?").slice(0, 2)
            )}
          </div>
          <div>
            <div className="who">
              {r.display_name ?? "?"}
              {r.label && <span className="why"> — {r.label}</span>}
              {r.is_secret && <span className="lock">SECRET</span>}
            </div>
            <div className="dice">
              {r.dice_count}d{r.dice_sides}
              {r.results.map((v, i) => (
                <i key={i} className={dieClass(u, r, v)}>
                  {v}
                </i>
              ))}
              {r.modifier ? `${r.modifier > 0 ? "+" : "−"} ${Math.abs(r.modifier)}` : ""}
              {r.target != null && <span className="target"> ≤ {r.target}</span>} ·{" "}
              {new Date(r.created_at).toLocaleTimeString("fr-FR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </div>
          <div className="tot">
            {r.total}
            {(() => {
              const v = rollVerdict(r);
              return v ? (
                <small className={`verdict ${v.ok ? "ok" : "ko"}`}>
                  {v.ok ? "RÉUSSI" : "RATÉ"}
                </small>
              ) : null;
            })()}
          </div>
        </div>
      ))}
      {!rolls.length && <p className="note">Aucun jet pour l’instant.</p>}
    </div>
  );
}

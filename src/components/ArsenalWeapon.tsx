import { useEffect, useRef, useState } from "react";
import { DieIcon } from "./DieIcon";
import { Button } from "@/components/ui/button";
import type { AmmoEntry } from "@/lib/character-import";
import { ammoTotal, packMagazine, parseDamage, reload, shoot, type SheetWeapon } from "@/lib/sheet";
import { canAutofire, canDouble, type weaponAttack } from "@/lib/weapon-rules";
import { useUniverse } from "@/lib/universe-context";
import { skillRoll, skillRollLabel } from "@/lib/universe";

type Attack = ReturnType<typeof weaponAttack>;
type Props = {
  weapon: SheetWeapon;
  ammo: AmmoEntry;
  attack: Attack;
  autoAttack: Attack;
  damage: string;
  canEdit: boolean;
  canRoll: boolean;
  onAmmo: (update: (current: AmmoEntry) => AmmoEntry) => void;
  onRoll: (
    count: number,
    sides: number,
    mod: number,
    label: string,
    target?: number | null,
  ) => void;
  children?: React.ReactNode;
};

export function ArsenalWeapon({
  weapon: w,
  ammo: a,
  attack,
  autoAttack,
  damage,
  canEdit,
  canRoll,
  onAmmo,
  onRoll,
  children,
}: Props) {
  const [pending, setPending] = useState<number[]>([]);
  const [ejecting, setEjecting] = useState<number[]>([]);
  const [loading, setLoading] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [muzzle, setMuzzle] = useState(false);
  const { universe: u } = useUniverse();
  const W = u.words;
  const ammoOn = u.modules.ammo && w.capacity > 0;
  const lock = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  function later(fn: () => void, delay: number) {
    const timer = setTimeout(() => {
      timers.current = timers.current.filter((item) => item !== timer);
      fn();
    }, delay);
    timers.current.push(timer);
  }
  function unlock() {
    lock.current = false;
    setBusy(false);
  }
  function fire(count: number) {
    if (!canEdit || lock.current || a.mag < count) return;
    lock.current = true;
    setBusy(true);
    const rounds = Array.from({ length: count }, (_, i) => a.mag - 1 - i);
    setPending(rounds);
    onAmmo((current) => shoot(current, count));
    rounds.forEach((round, i) => {
      const pulse = () => {
        setPending((prev) => prev.filter((value) => value !== round));
        setEjecting((prev) => [...prev, round]);
        setMuzzle(true);
        navigator.vibrate?.(18);
        later(() => setMuzzle(false), 35);
        later(() => setEjecting((prev) => prev.filter((value) => value !== round)), 550);
      };
      if (i === 0) pulse();
      else later(pulse, i * 70);
    });
    later(unlock, (count - 1) * 70 + 550);
  }
  function refill() {
    if (!canEdit || lock.current || a.mag >= w.capacity || (a.spare === 0 && a.loose === 0)) return;
    const next = reload(a, w.capacity);
    const rounds = Array.from({ length: Math.max(0, next.mag - a.mag) }, (_, i) => a.mag + i);
    lock.current = true;
    setBusy(true);
    setReloading(true);
    setPending(rounds);
    onAmmo((current) => reload(current, w.capacity));
    later(() => setReloading(false), 700);
    rounds.forEach((round, i) =>
      later(
        () => {
          setPending((prev) => prev.filter((value) => value !== round));
          setLoading((prev) => [...prev, round]);
          later(() => setLoading((prev) => prev.filter((value) => value !== round)), 300);
        },
        700 + i * 12,
      ),
    );
    later(unlock, 1000 + rounds.length * 12);
  }
  const dmg = parseDamage(damage);
  const total = ammoTotal(a, w.capacity);
  const auto = canAutofire(w, u);
  const atk = skillRoll(u, attack.base);
  return (
    <article className={`weapon cut ${muzzle ? "muzzle" : ""}`} aria-label={w.name}>
      <div className="w-head">
        <div>
          <h3>{w.name}</h3>
          <small>
            {attack.name} · base {attack.base} · {W.rof} {w.rof}
            {attack.unlearned && <span> (non apprise)</span>}
          </small>
        </div>
      </div>
      <div className="w-acts">
        {canRoll ? (
          <>
            <Button
              className="act cut-s"
              onClick={() =>
                onRoll(atk.count, atk.sides, atk.mod, `${W.attack} ${w.name}`, atk.target)
              }
            >
              <DieIcon sides={atk.sides} />
              {W.attack} {skillRollLabel(u, attack.base)}
            </Button>
            {dmg && (
              <Button
                className="act dmg cut-s"
                onClick={() => onRoll(dmg.count, dmg.sides, dmg.mod, `${W.damage} ${w.name}`)}
              >
                <DieIcon sides={dmg.sides} />
                {W.damage} {damage}
              </Button>
            )}
          </>
        ) : (
          <span className="weapon-damage">
            {W.damage} {damage || "—"}
          </span>
        )}
      </div>
      {ammoOn && (
        <div className="mag">
          <div className="mag-top">
            <div>
              <small className="loaded-mag-label">{W.magazine.toUpperCase()}</small>
              <div
                className={`counter ${a.mag <= w.capacity / 3 ? "low" : ""}`}
                aria-label={`${W.magazine} ${a.mag} sur ${w.capacity}`}
              >
                {String(a.mag).padStart(2, "0")} <small>/ {w.capacity}</small>
              </div>
            </div>
            <div className="spares">
              <span className="spare-icons" aria-hidden="true">
                {Array.from({ length: Math.min(a.spare, 5) }, (_, i) => (
                  <i key={i} className="spare-mag" />
                ))}
              </span>
              <small>
                {W.spare} : {a.spare}
              </small>
            </div>
          </div>
          <div className="rounds" aria-hidden="true">
            {Array.from({ length: w.capacity }, (_, i) => {
              const isEjecting = ejecting.includes(i);
              const isPending = pending.includes(i);
              const spent =
                reloading || (busy && loading.length > 0)
                  ? i >= a.mag || isPending
                  : i >= a.mag && !isPending && !isEjecting;
              return (
                <i
                  key={i}
                  className={`rd ${spent ? "spent" : ""} ${isEjecting ? "eject" : ""} ${loading.includes(i) ? "load" : ""}`}
                />
              );
            })}
          </div>
          <div className="mag-acts">
            <Button
              className="fire cut-s"
              disabled={!canEdit || busy || a.mag < 1}
              onClick={() => fire(1)}
            >
              {W.fire}
            </Button>
            {auto && (
              <Button
                className="fire cut-s"
                disabled={!canEdit || busy || a.mag < 10}
                onClick={() => fire(10)}
              >
                AUTO ×10
              </Button>
            )}
            {canDouble(w) && (
              <Button
                className="fire cut-s"
                disabled={!canEdit || busy || a.mag < 2}
                onClick={() => fire(2)}
              >
                {W.fire} ×2
              </Button>
            )}
            <Button
              className={`btn y reload cut-s ${reloading ? "busy" : ""}`}
              disabled={!canEdit || busy || a.mag >= w.capacity || (a.spare === 0 && a.loose === 0)}
              onClick={refill}
            >
              {W.reload}
              <span className="prog" />
            </Button>
          </div>
          <div className="ammo-foot">
            {(
              [
                ["spare", W.spare],
                ["loose", W.loose],
              ] as const
            ).map(([key, label]) => (
              <span key={key}>
                {label}{" "}
                <span className="step">
                  <Button
                    aria-label={`Diminuer ${label}`}
                    disabled={!canEdit || a[key] === 0}
                    onClick={() =>
                      onAmmo((current) => ({ ...current, [key]: Math.max(0, current[key] - 1) }))
                    }
                  >
                    −
                  </Button>
                  {key === "loose" ? (
                    <input
                      type="number"
                      min={0}
                      step={1}
                      aria-label={`${W.loose} (${W.rounds})`}
                      disabled={!canEdit}
                      value={a.loose}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        if (Number.isSafeInteger(value) && value >= 0)
                          onAmmo((current) => ({ ...current, loose: value }));
                      }}
                    />
                  ) : (
                    <b>{a[key]}</b>
                  )}
                  <Button
                    aria-label={`Augmenter ${label}`}
                    disabled={!canEdit}
                    onClick={() => onAmmo((current) => ({ ...current, [key]: current[key] + 1 }))}
                  >
                    +
                  </Button>
                </span>
              </span>
            ))}
            <Button
              className="btn"
              disabled={!canEdit || a.loose < w.capacity}
              title={`${w.capacity} ${W.rounds} en ${W.loose.toLowerCase()} → 1 ${W.spare.toLowerCase()} pleine`}
              onClick={() => onAmmo((current) => packMagazine(current, w.capacity))}
            >
              {W.loose} → {W.spare.toLowerCase()}
            </Button>
            <span
              className={`ammo-total ${total <= w.capacity ? "low" : ""}`}
              title={`${a.mag} + ${a.spare * w.capacity} (${W.spare.toLowerCase()}) + ${a.loose} (${W.loose.toLowerCase()})`}
            >
              Total {total} {W.rounds}
            </span>
          </div>
        </div>
      )}
      {children}
    </article>
  );
}

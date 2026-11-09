/**
 * Aperçu d'un thème de carte : une petite pièce avec son couloir, une porte, de l'eau,
 * dessinée avec les couleurs et les effets du thème (texture, trait, lueur, vignettage).
 */
import { useId, type CSSProperties } from "react";
import { applyPreset, styleVars, type MapStyle, type StyleId } from "@/lib/map-style";

const OUTLINE = "M14 12 H66 V27 H106 V43 H66 V60 H14 Z";

export function ThemeArt({ theme }: { theme: StyleId | MapStyle }) {
  const st = typeof theme === "string" ? applyPreset(theme) : theme;
  const uid = useId().replace(/:/g, "");
  const id = (name: string) => `${name}-${uid}`;
  const noise =
    st.texture === "paper"
      ? { type: "fractalNoise" as const, freq: 0.05, op: 0.55 }
      : st.texture === "grain"
        ? { type: "fractalNoise" as const, freq: 0.9, op: 0.35 }
        : st.texture === "stone"
          ? { type: "turbulence" as const, freq: 0.12, op: 0.45 }
          : null;
  return (
    <svg
      viewBox="0 0 120 72"
      className={`map-theme-art ${st.glow > 0 ? "glow" : ""}`}
      style={styleVars(st) as CSSProperties}
      aria-hidden="true"
    >
      <defs>
        {noise && (
          <filter id={id("n")} x="0" y="0" width="100%" height="100%">
            <feTurbulence type={noise.type} baseFrequency={noise.freq} numOctaves={3} seed={4} />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0.2  0 0 0 0 0.13  0 0 0 0 0.05  1.2 0 0 0 -0.45"
            />
          </filter>
        )}
        {st.texture === "scan" && (
          <pattern id={id("t")} patternUnits="userSpaceOnUse" width={4} height={3}>
            <rect className="ink" width={4} height={0.8} />
          </pattern>
        )}
        {st.texture === "dots" && (
          <pattern id={id("t")} patternUnits="userSpaceOnUse" width={5} height={5}>
            <circle className="ink" cx={2.5} cy={2.5} r={0.6} />
          </pattern>
        )}
        {st.wallLine === "sketch" && (
          <filter id={id("s")} x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="7" />
            <feDisplacementMap
              in="SourceGraphic"
              scale="2.2"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        )}
        {st.vignette && (
          <radialGradient id={id("v")} r="75%">
            <stop offset="0.5" stopColor="black" stopOpacity="0" />
            <stop offset="1" stopColor="black" stopOpacity="0.6" />
          </radialGradient>
        )}
        <clipPath id={id("c")}>
          <path d={OUTLINE} />
        </clipPath>
      </defs>
      <rect className="rock" width={120} height={72} />
      {st.hatch && <path className="hatch" d={OUTLINE} />}
      {st.shadow && <path className="shade" d={OUTLINE} transform="translate(2 2.5)" />}
      <path className="ground" d={OUTLINE} />
      <rect className="water" x={22} y={36} width={20} height={14} rx={5} />
      <g
        className={`grid grid-${st.gridLine}`}
        clipPath={st.gridOutside ? undefined : `url(#${id("c")})`}
      >
        {[10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110].map((x) => (
          <line key={`x${x}`} x1={x} x2={x} y1={0} y2={72} />
        ))}
        {[10, 20, 30, 40, 50, 60].map((y) => (
          <line key={`y${y}`} y1={y} y2={y} x1={0} x2={120} />
        ))}
      </g>
      {noise && <rect width={120} height={72} filter={`url(#${id("n")})`} opacity={noise.op} />}
      {(st.texture === "scan" || st.texture === "dots") && (
        <rect className="tex" width={120} height={72} fill={`url(#${id("t")})`} />
      )}
      <g filter={st.wallLine === "sketch" ? `url(#${id("s")})` : undefined}>
        <path className="wall" d={OUTLINE} />
        {st.wallLine === "double" && <path className="wall-inner" d={OUTLINE} />}
      </g>
      <line className="door" x1={66} y1={30} x2={66} y2={40} />
      <text className="label" x={36} y={34}>
        1
      </text>
      {st.vignette && <rect width={120} height={72} fill={`url(#${id("v")})`} />}
    </svg>
  );
}

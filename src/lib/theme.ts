/**
 * Applique le thème d'un univers à la page : variables CSS, classes du <body>, polices.
 * Un script inline (THEME_BOOT) réapplique le dernier thème connu avant l'affichage,
 * pour éviter un flash de l'ancien style au chargement.
 */
import { fontFamily, fontsHref, type Theme, type Universe } from "./universe";

export const THEME_CACHE_KEY = "table:theme";

export function themeVars(t: Theme): Record<string, string> {
  const mix = (c: string, p: number, w = "transparent") => `color-mix(in srgb, ${c} ${p}%, ${w})`;
  return {
    "--bg": t.bg,
    "--panel": t.panel,
    "--ink": mix(t.bg, 70, "#000"),
    "--glass": mix(t.panel, 84),
    "--glass2": mix(t.panel, 90, "#fff 4%"),
    "--line": mix(t.cyan, 16),
    "--line2": mix(t.text, 9),
    "--cyan": t.cyan,
    "--pink": t.pink,
    "--yellow": t.yellow,
    "--red": t.red,
    "--green": t.green,
    "--violet": t.violet,
    "--orange": mix(t.yellow, 50, t.red),
    "--text": t.text,
    "--mute": t.mute,
    "--dim": mix(t.mute, 55, t.bg),
    "--head": fontFamily(t.fontBody),
    "--display": fontFamily(t.fontDisplay),
    "--mono": fontFamily(t.fontMono),
  };
}

export function themeClasses(t: Theme): string[] {
  return [
    `corners-${t.corners}`,
    t.glow ? "fx-glow" : "fx-noglow",
    t.scanlines ? "fx-scan" : "fx-noscan",
    `atmo-${t.atmosphere}`,
  ];
}
const ALL_CLASSES = [
  "corners-cut",
  "corners-round",
  "corners-square",
  "corners-scroll",
  "fx-glow",
  "fx-noglow",
  "fx-scan",
  "fx-noscan",
  ...["none", "rain", "embers", "ash", "stars", "fog"].map((a) => `atmo-${a}`),
];

/** `cache` : mémoriser pour le prochain chargement (faux pendant un aperçu non enregistré) */
export function applyTheme(u: Universe, cache = true) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const vars = themeVars(u.theme);
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  const classes = themeClasses(u.theme);
  document.body.classList.remove(...ALL_CLASSES);
  document.body.classList.add(...classes);
  const href = fontsHref(u.theme);
  let link = document.getElementById("universe-fonts") as HTMLLinkElement | null;
  if (href) {
    if (!link) {
      link = document.createElement("link");
      link.id = "universe-fonts";
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    if (link.href !== href) link.href = href;
  }
  root.style.colorScheme = "dark";
  if (!cache) return;
  try {
    localStorage.setItem(THEME_CACHE_KEY, JSON.stringify({ vars, classes, href }));
  } catch {
    /* stockage indisponible : le thème sera appliqué après le chargement */
  }
}

/** Script exécuté dans <head> avant le rendu : réapplique le dernier thème connu */
export const THEME_BOOT = `try{var t=JSON.parse(localStorage.getItem(${JSON.stringify(THEME_CACHE_KEY)})||"null");if(t){var r=document.documentElement;for(var k in t.vars)r.style.setProperty(k,t.vars[k]);document.addEventListener("DOMContentLoaded",function(){document.body.classList.add.apply(document.body.classList,t.classes)});if(t.href){var l=document.createElement("link");l.id="universe-fonts";l.rel="stylesheet";l.href=t.href;document.head.appendChild(l)}}}catch(e){}`;

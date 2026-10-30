import { skillBase, type SheetSkill, type Stats } from "./sheet";
import type { Universe } from "./universe";

const normalized = (name: string) =>
  name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
export const shortSkillName = (name: string) => name.replace(/\s*\([^)]*\)/g, "").trim();

/** Ordre d'affichage : d'abord les compétences listées par l'univers (début du nom), puis l'ordre alphabétique */
export function orderedSkills(skills: SheetSkill[], order: string[] = []) {
  const prefixes = order.map(normalized).filter(Boolean);
  const rank = (name: string) => {
    const n = normalized(name);
    const i = prefixes.findIndex((p) => n.startsWith(p));
    return i < 0 ? prefixes.length : i;
  };
  return skills
    .map((skill, index) => ({ skill, index }))
    .sort(
      (a, b) =>
        rank(a.skill.name) - rank(b.skill.name) || a.skill.name.localeCompare(b.skill.name, "fr"),
    );
}

/** Les cinq meilleures bases (mises en valeur) */
export function topSkillIndexes(skills: SheetSkill[], stats: Stats, u: Universe) {
  return new Set(
    skills
      .map((skill, index) => ({ index, base: skillBase(skill, stats, u) }))
      .sort((a, b) => b.base - a.base || a.index - b.index)
      .slice(0, 5)
      .map((item) => item.index),
  );
}

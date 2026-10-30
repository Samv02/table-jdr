// Conversion between the character JSON file format and the DB rows.
// Assumed fields: name, handle, hpCurrent, eddies, inventory (text, one item per line),
// weapons: [{ name, ammo }]. Unknown fields are preserved untouched in `sheet`.

export type InventoryItem = { name: string; qty: number };
export type AmmoEntry = { mag: number; spare: number; loose: number };

export function parseInventory(text: unknown): InventoryItem[] {
  if (typeof text !== "string") return [];
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(\d+)\s+(.+)$/);
      return m ? { qty: Number(m[1]), name: (m[2] ?? "").trim() } : { qty: 1, name: line };
    });
}

export function inventoryToText(items: InventoryItem[]): string {
  return items.map((i) => (i.qty === 1 ? i.name : `${i.qty} ${i.name}`)).join("\n");
}

export function findWeapons(sheet: Record<string, unknown>): { name?: string; ammo?: unknown }[] {
  const w = sheet["weapons"];
  return Array.isArray(w) ? (w as { name?: string; ammo?: unknown }[]) : [];
}

// Clé = position de l'arme dans sheet.weapons ("0" = première arme).
export function buildAmmo(sheet: Record<string, unknown>): Record<string, AmmoEntry> {
  const out: Record<string, AmmoEntry> = {};
  findWeapons(sheet).forEach((w, i) => {
    const cap = typeof w.ammo === "number" ? w.ammo : parseInt(String(w.ammo ?? "").trim(), 10);
    if (Number.isFinite(cap) && cap > 0) out[String(i)] = { mag: cap, spare: 2, loose: 0 };
  });
  return out;
}

export function sheetToRows(sheet: Record<string, unknown>) {
  const name =
    typeof sheet["name"] === "string" && sheet["name"].trim() ? sheet["name"].trim() : "Sans nom";
  return {
    character: {
      name,
      handle: typeof sheet["handle"] === "string" ? sheet["handle"] : null,
      sheet,
    },
    state: {
      hp_current: Number(sheet["hpCurrent"]) || 0,
      eddies: Number(sheet["eddies"]) || 0,
      ammo: buildAmmo(sheet),
      inventory: parseInventory(sheet["inventory"]),
    },
  };
}

export function rowsToSheet(
  sheet: Record<string, unknown>,
  state: { hp_current: number; eddies: number; inventory: InventoryItem[] } | null,
) {
  if (!state) return sheet;
  return {
    ...sheet,
    hpCurrent: state.hp_current,
    eddies: state.eddies,
    inventory: inventoryToText(state.inventory),
  };
}

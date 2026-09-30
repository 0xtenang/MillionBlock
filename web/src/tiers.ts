import { GRID } from "./config";
import type { Rect } from "./utils";

/**
 * Mirror of MillionBlock.tierOf(). The contract is the source of truth; these
 * rules are fixed by position and cannot be changed by anyone after deploy.
 */
export enum Tier {
  Standard = 0,
  Genesis = 1,
  Center = 2,
  Corner = 3,
}

export const GENESIS_FIRST = 1;
export const GENESIS_LAST = 100;
export const CENTER_MIN = 450;
export const CENTER_MAX = 549;
export const CORNER_IDS = [0, GRID - 1, (GRID - 1) * GRID, GRID * GRID - 1];

export function tierOf(id: number): Tier {
  const x = id % GRID, y = Math.floor(id / GRID);
  if ((x === 0 || x === GRID - 1) && (y === 0 || y === GRID - 1)) return Tier.Corner;
  if (id >= GENESIS_FIRST && id <= GENESIS_LAST) return Tier.Genesis;
  if (x >= CENTER_MIN && x <= CENTER_MAX && y >= CENTER_MIN && y <= CENTER_MAX) return Tier.Center;
  return Tier.Standard;
}

export const TIERS: Record<Exclude<Tier, Tier.Standard>, { name: string; emoji: string; color: string; rgb: [number, number, number]; total: number; rule: string; area: Rect }> = {
  [Tier.Genesis]: {
    name: "Genesis",
    emoji: "👑",
    color: "#ffd24a",
    rgb: [255, 210, 74],
    total: GENESIS_LAST - GENESIS_FIRST + 1,
    rule: "Token #1 – #100: the top row, next to the top-left corner.",
    area: { x: GENESIS_FIRST, y: 0, w: GENESIS_LAST - GENESIS_FIRST + 1, h: 1 },
  },
  [Tier.Center]: {
    name: "Center",
    emoji: "🔥",
    color: "#ff7a1a",
    rgb: [255, 122, 26],
    total: (CENTER_MAX - CENTER_MIN + 1) ** 2,
    rule: "The middle 100×100 square: x and y from 450 to 549.",
    area: { x: CENTER_MIN, y: CENTER_MIN, w: CENTER_MAX - CENTER_MIN + 1, h: CENTER_MAX - CENTER_MIN + 1 },
  },
  [Tier.Corner]: {
    name: "Corner",
    emoji: "⭐",
    color: "#b18cff",
    rgb: [177, 140, 255],
    total: 4,
    rule: "The four corners: #0, #999, #999000 and #999999.",
    area: { x: 0, y: 0, w: 1, h: 1 },
  },
};

export const SPECIAL_TIERS = [Tier.Genesis, Tier.Center, Tier.Corner] as const;

/** Special label for a single block, e.g. "👑 Genesis #1 · The First Block". */
export function tierLabel(id: number): string | null {
  const t = tierOf(id);
  if (t === Tier.Standard) return null;
  const info = TIERS[t];
  return `${info.emoji} ${info.name}${id === 1 ? " · The First Block" : ""}`;
}

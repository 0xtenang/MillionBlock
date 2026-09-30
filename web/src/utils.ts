import { formatEther } from "viem";
import { GRID } from "./config";

export type Rect = { x: number; y: number; w: number; h: number };

export const idOf = (x: number, y: number) => y * GRID + x;
export const xyOf = (id: number) => [id % GRID, Math.floor(id / GRID)] as const;

export function rectIds(r: Rect): number[] {
  const out: number[] = [];
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) out.push(idOf(x, y));
  return out;
}

export function eth(wei: bigint | undefined, digits = 4) {
  if (wei === undefined) return "—";
  const n = Number(formatEther(wei));
  if (n === 0) return "0";
  if (n < 10 ** -digits) return `<${10 ** -digits}`;
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

/** Resolve user supplied image refs into something an <img> can load. */
export function resolveMedia(uri: string): string | null {
  if (!uri) return null;
  if (uri.startsWith("ipfs://")) return `https://ipfs.io/ipfs/${uri.slice(7).replace(/^ipfs\//, "")}`;
  if (uri.startsWith("ar://")) return `https://arweave.net/${uri.slice(5)}`;
  if (/^https?:\/\//i.test(uri) || uri.startsWith("data:image/")) return uri;
  return null;
}

/** Only allow http(s) links to be opened from user content. */
export function safeLink(url: string): string | null {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

/** Stable pleasant color per owner index. */
export function ownerColor(i: number): [number, number, number] {
  const h = ((i * 137.508) % 360) / 360;
  return hsl(h, 0.55, 0.42);
}

export function hsl(h: number, s: number, l: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

/** Market heat color: log scale of value relative to primary price. */
export function heatColor(ratio: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, Math.log10(Math.max(ratio, 1)) / 2)); // 1x .. 100x
  // lime -> amber -> hot pink
  const stops: [number, number, number][] = [
    [60, 110, 40],
    [195, 245, 60],
    [255, 176, 32],
    [255, 60, 140],
  ];
  const p = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(p));
  const f = p - i;
  return [0, 1, 2].map((k) => Math.round(stops[i][k] + (stops[i + 1][k] - stops[i][k]) * f)) as [number, number, number];
}

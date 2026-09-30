import { useSyncExternalStore } from "react";

/**
 * Live market data for tokens attached to blocks.
 * - Prices / 24h change / market cap / pair age: DexScreener (free, no key, CORS-enabled)
 * - All-time high: GeckoTerminal daily candles (rate limited, cached, fetched lazily)
 * Everything here is display-only and never affects on-chain state.
 */

const env = import.meta.env;
const DEX_CHAIN = env.VITE_DEXSCREENER_CHAIN || "robinhood";
const GT_NETWORK = env.VITE_GECKO_NETWORK || "robinhood";
const DEMO = env.VITE_MARKET_DEMO === "1";
const REFRESH_MS = 60_000;
const NEW_MS = 72 * 3600_000; // "just launched" window
const MOVE_PCT = 10; // 🟢 / 🔴 threshold
const ATH_TOLERANCE = 0.98; // within 2% of ATH counts as "at ATH"

export type Status = "ath" | "new" | "up" | "down" | "flat";

export type TokenMarket = {
  symbol: string;
  name: string;
  priceUsd: number;
  change24h: number; // percent
  mcap?: number;
  liquidity?: number;
  volume24h?: number;
  pairAddress: string;
  pairCreatedAt?: number;
  imageUrl?: string;
  dexUrl: string;
  ath?: number;
};

export const STATUS: Record<Status, { emoji: string; label: string; color: string }> = {
  ath: { emoji: "🚀", label: "All-time high", color: "#ff5bd6" },
  new: { emoji: "🆕", label: "Just launched", color: "#3cc8ff" },
  up: { emoji: "🟢", label: "Pumping", color: "#35e07a" },
  down: { emoji: "🔴", label: "Dumping", color: "#ff4d5e" },
  flat: { emoji: "", label: "", color: "#8a9a8c" },
};

export function statusOf(m: TokenMarket): Status {
  if (m.ath && m.priceUsd >= m.ath * ATH_TOLERANCE && m.change24h > 0) return "ath";
  if (m.pairCreatedAt && Date.now() - m.pairCreatedAt < NEW_MS) return "new";
  if (m.change24h >= MOVE_PCT) return "up";
  if (m.change24h <= -MOVE_PCT) return "down";
  return "flat";
}

class MarketStore {
  data = new Map<string, TokenMarket>();
  version = 0;
  updatedAt = 0;
  error: string | null = null;
  private tokens = new Set<string>();
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private athQueue: string[] = [];
  private athBusy = false;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = () => this.version;
  private emit() {
    this.version++;
    this.listeners.forEach((l) => l());
  }

  get(token?: string) {
    return token ? this.data.get(token.toLowerCase()) : undefined;
  }

  /** Register the set of token addresses shown on the board; fetches new ones immediately. */
  track(addresses: string[]) {
    let added = false;
    for (const a of addresses) {
      const k = a.toLowerCase();
      if (!this.tokens.has(k)) {
        this.tokens.add(k);
        added = true;
      }
    }
    if (added) this.refreshSoon();
  }

  private refreshSoon() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.refresh(), 300);
  }

  private async refresh() {
    clearTimeout(this.timer);
    try {
      const list = [...this.tokens];
      for (let i = 0; i < list.length; i += 30) {
        const chunk = list.slice(i, i + 30);
        const results = DEMO ? demoData(chunk) : await fetchDexScreener(chunk);
        for (const [k, m] of results) {
          const prev = this.data.get(k);
          this.data.set(k, { ...m, ath: Math.max(prev?.ath ?? 0, m.ath ?? 0, m.priceUsd) || undefined });
          if (!DEMO && prev?.ath === undefined) this.queueAth(k);
        }
      }
      this.error = null;
      this.updatedAt = Date.now();
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    }
    this.emit();
    this.timer = setTimeout(() => this.refresh(), REFRESH_MS);
  }

  // ---- ATH via GeckoTerminal (30 req/min public limit -> one request every 2.5s) ----
  private queueAth(token: string) {
    this.athQueue.push(token);
    if (!this.athBusy) this.drainAth();
  }

  private async drainAth() {
    this.athBusy = true;
    while (this.athQueue.length) {
      const token = this.athQueue.shift()!;
      const m = this.data.get(token);
      if (!m) continue;
      const cacheKey = `mb-ath:${m.pairAddress}`;
      let ath: number | undefined;
      try {
        const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
        if (cached && Date.now() - cached.t < 6 * 3600_000) ath = cached.v;
      } catch {
        /* storage unavailable */
      }
      if (ath === undefined) {
        ath = await fetchAth(m.pairAddress).catch(() => undefined);
        if (ath !== undefined) {
          try {
            localStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), v: ath }));
          } catch {
            /* ignore */
          }
        }
        await new Promise((r) => setTimeout(r, 2500));
      }
      if (ath !== undefined) {
        m.ath = Math.max(ath, m.priceUsd);
        this.emit();
      }
    }
    this.athBusy = false;
  }
}

async function fetchDexScreener(tokens: string[]): Promise<Map<string, TokenMarket>> {
  const res = await fetch(`https://api.dexscreener.com/tokens/v1/${DEX_CHAIN}/${tokens.join(",")}`);
  if (!res.ok) throw new Error(`DexScreener ${res.status}`);
  const pairs: any[] = await res.json();
  const out = new Map<string, TokenMarket>();
  for (const p of pairs) {
    const k = String(p?.baseToken?.address ?? "").toLowerCase();
    if (!tokens.includes(k)) continue; // only pairs where the block's token is the base asset
    const cur = out.get(k);
    const liq = Number(p.liquidity?.usd ?? 0);
    if (cur && (cur.liquidity ?? 0) >= liq) continue; // keep the deepest pool
    out.set(k, {
      symbol: String(p.baseToken.symbol ?? "").slice(0, 16),
      name: String(p.baseToken.name ?? "").slice(0, 64),
      priceUsd: Number(p.priceUsd ?? 0),
      change24h: Number(p.priceChange?.h24 ?? 0),
      mcap: num(p.marketCap ?? p.fdv),
      liquidity: liq || undefined,
      volume24h: num(p.volume?.h24),
      pairAddress: String(p.pairAddress),
      pairCreatedAt: num(p.pairCreatedAt),
      imageUrl: typeof p.info?.imageUrl === "string" ? p.info.imageUrl : undefined,
      dexUrl: String(p.url ?? `https://dexscreener.com/${DEX_CHAIN}/${p.pairAddress}`),
    });
  }
  return out;
}

async function fetchAth(pool: string): Promise<number | undefined> {
  const res = await fetch(
    `https://api.geckoterminal.com/api/v2/networks/${GT_NETWORK}/pools/${pool}/ohlcv/day?limit=1000&currency=usd&token=base`,
    { headers: { accept: "application/json" } }
  );
  if (!res.ok) return undefined;
  const j = await res.json();
  const list: number[][] = j?.data?.attributes?.ohlcv_list ?? [];
  return list.length ? Math.max(...list.map((c) => Number(c[2]))) : undefined;
}

const num = (v: unknown) => (v === undefined || v === null || Number.isNaN(Number(v)) ? undefined : Number(v));

/** Deterministic fake market data for local demos (VITE_MARKET_DEMO=1). */
function demoData(tokens: string[]): Map<string, TokenMarket> {
  const out = new Map<string, TokenMarket>();
  const tick = Math.floor(Date.now() / REFRESH_MS);
  for (const k of tokens) {
    const seed = parseInt(k.slice(2, 10), 16);
    const rnd = (n: number) => ((Math.sin(seed * 9301 + n * 49297) + 1) / 2) % 1;
    const base = 0.001 + rnd(1) * 40;
    const change = (rnd(2) - 0.45) * 60 + Math.sin(tick + seed) * 3;
    const price = base * (1 + change / 100);
    const kind = seed % 4;
    out.set(k, {
      symbol: ["IMD", "HOOD", "FROG", "USDV", "AIXBT", "PONS"][seed % 6],
      name: "Demo token",
      priceUsd: price,
      change24h: change,
      mcap: price * (1e6 + rnd(3) * 2e8),
      liquidity: 5e4 + rnd(4) * 2e6,
      volume24h: 1e4 + rnd(5) * 5e6,
      pairAddress: k,
      pairCreatedAt: kind === 1 ? Date.now() - 3600_000 * 5 : Date.now() - 86400_000 * 60,
      dexUrl: `https://dexscreener.com/${DEX_CHAIN}/${k}`,
      ath: kind === 0 ? price : price * (1.2 + rnd(6)),
    });
  }
  return out;
}

export const market = new MarketStore();

export function useMarketVersion() {
  return useSyncExternalStore(market.subscribe, market.getVersion);
}

// ---- formatting ----------------------------------------------------------------

export function fmtUsd(v?: number) {
  if (v === undefined || !Number.isFinite(v)) return "—";
  if (v === 0) return "$0";
  if (v < 0.01) return `$${v.toPrecision(3)}`;
  if (v < 1000) return `$${v.toLocaleString(undefined, { maximumFractionDigits: v < 1 ? 4 : 2 })}`;
  return `$${Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 2 }).format(v)}`;
}

export const fmtPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

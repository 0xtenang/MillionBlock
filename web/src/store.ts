import { useSyncExternalStore } from "react";
import { getAddress, parseAbiItem, type Address, type PublicClient } from "viem";
import { CONTRACT, DEPLOY_BLOCK, GRID, LOG_CHUNK, PRIMARY_PRICE } from "./config";

/**
 * Client-side indexer: replays the contract's events into typed arrays so the
 * whole 1,000,000-block grid can be rendered and queried instantly.
 * For large deployments, swap this for a hosted indexer (Ponder, Goldsky, ...)
 * that serves the same shape.
 */

export type Content = {
  id: number;
  creator: Address;
  x: number;
  y: number;
  w: number;
  h: number;
  image: string;
  url: string;
  title: string;
  token: Address;
  hidden: boolean;
  block: bigint;
};

export type Listing = { price: bigint; seller: Address };
export type SaleRec = { tokenId: number; seller: Address; buyer: Address; price: bigint; block: bigint; tx: string };
export type MintRec = { buyer: Address; x: number; y: number; w: number; h: number; paid: bigint; block: bigint; tx: string };

const EVENTS = [
  parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"),
  parseAbiItem("event BlocksMinted(address indexed buyer, uint16 x, uint16 y, uint16 w, uint16 h, uint256 paid)"),
  parseAbiItem(
    "event ContentSet(uint256 indexed contentId, address indexed owner, uint16 x, uint16 y, uint16 w, uint16 h, string image, string url, string title, address token)"
  ),
  parseAbiItem("event Listed(uint256 indexed tokenId, address indexed seller, uint256 price)"),
  parseAbiItem("event Delisted(uint256 indexed tokenId)"),
  parseAbiItem("event Sale(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price, uint256 fee)"),
  parseAbiItem("event ContentModerated(uint256 indexed contentId, bool hidden)"),
] as const;

const ZERO = "0x0000000000000000000000000000000000000000";

export class GridStore {
  ownerIdx = new Uint32Array(GRID * GRID); // 0 = unminted
  owners: Address[] = [ZERO as Address];
  private ownerLookup = new Map<string, number>();
  contentOf = new Uint32Array(GRID * GRID);
  contents = new Map<number, Content>();
  listings = new Map<number, Listing>();
  lastPrice = new Map<number, bigint>(); // secondary sales only; minted blocks default to PRIMARY_PRICE
  sales: SaleRec[] = [];
  mints: MintRec[] = [];
  minted = 0;
  volume = 0n;
  fees = 0n;

  syncedTo = DEPLOY_BLOCK - 1n;
  loading = true;
  error: string | null = null;
  version = 0;

  private listeners = new Set<() => void>();
  private chunk = LOG_CHUNK;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private started = false;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = () => this.version;
  private emit() {
    this.version++;
    this.listeners.forEach((l) => l());
  }

  start(client: PublicClient) {
    if (this.started || !CONTRACT) {
      if (!CONTRACT) {
        this.loading = false;
        this.emit();
      }
      return;
    }
    this.started = true;
    const tick = async () => {
      try {
        await this.sync(client);
        this.error = null;
      } catch (e) {
        this.error = e instanceof Error ? e.message.split("\n")[0] : String(e);
      }
      this.loading = false;
      this.emit();
      this.timer = setTimeout(tick, 4000);
    };
    tick();
  }

  stop() {
    clearTimeout(this.timer);
    this.started = false;
  }

  private async sync(client: PublicClient) {
    const head = await client.getBlockNumber();
    while (this.syncedTo < head) {
      const from = this.syncedTo + 1n;
      const to = from + this.chunk - 1n < head ? from + this.chunk - 1n : head;
      let logs;
      try {
        logs = await client.getLogs({ address: CONTRACT, events: EVENTS, fromBlock: from, toBlock: to, strict: true });
      } catch (e) {
        if (this.chunk > 500n) {
          this.chunk /= 2n; // RPC rejected the range; retry smaller
          continue;
        }
        throw e;
      }
      for (const log of logs) this.apply(log as any);
      this.syncedTo = to;
      if (logs.length) this.emit();
    }
  }

  private apply(log: { eventName: string; args: any; blockNumber: bigint; transactionHash: string }) {
    const a = log.args;
    switch (log.eventName) {
      case "Transfer": {
        const id = Number(a.tokenId);
        if (a.from === ZERO) this.minted++;
        this.ownerIdx[id] = this.idxOf(a.to);
        break;
      }
      case "BlocksMinted":
        this.mints.push({ buyer: a.buyer, x: a.x, y: a.y, w: a.w, h: a.h, paid: a.paid, block: log.blockNumber, tx: log.transactionHash });
        break;
      case "ContentSet": {
        const id = Number(a.contentId);
        this.contents.set(id, {
          id,
          creator: a.owner,
          x: a.x,
          y: a.y,
          w: a.w,
          h: a.h,
          image: a.image,
          url: a.url,
          title: a.title,
          token: a.token,
          hidden: false,
          block: log.blockNumber,
        });
        for (let row = a.y; row < a.y + a.h; row++) this.contentOf.fill(id, row * GRID + a.x, row * GRID + a.x + a.w);
        break;
      }
      case "Listed":
        this.listings.set(Number(a.tokenId), { price: a.price, seller: a.seller });
        break;
      case "Delisted":
        this.listings.delete(Number(a.tokenId));
        break;
      case "Sale": {
        const id = Number(a.tokenId);
        this.lastPrice.set(id, a.price);
        this.volume += a.price;
        this.fees += a.fee;
        this.sales.push({ tokenId: id, seller: a.seller, buyer: a.buyer, price: a.price, block: log.blockNumber, tx: log.transactionHash });
        break;
      }
      case "ContentModerated": {
        const c = this.contents.get(Number(a.contentId));
        if (c) c.hidden = a.hidden;
        break;
      }
    }
  }

  private idxOf(addr: string) {
    const key = addr.toLowerCase();
    let i = this.ownerLookup.get(key);
    if (i === undefined) {
      i = this.owners.length;
      this.owners.push(getAddress(addr));
      this.ownerLookup.set(key, i);
    }
    return i;
  }

  // ---- queries -----------------------------------------------------------

  ownerOf(id: number): Address | undefined {
    const i = this.ownerIdx[id];
    return i ? this.owners[i] : undefined;
  }

  ownerIndexOf(addr?: string) {
    return addr ? this.ownerLookup.get(addr.toLowerCase()) ?? -1 : -1;
  }

  valueOf(id: number): bigint {
    if (!this.ownerIdx[id]) return 0n;
    return this.lastPrice.get(id) ?? PRIMARY_PRICE;
  }

  contentAt(id: number): Content | undefined {
    const c = this.contentOf[id];
    return c ? this.contents.get(c) : undefined;
  }

  /** Blocks currently showing a given content, with their combined market value. */
  contentStats(contentId: number) {
    const c = this.contents.get(contentId);
    if (!c) return { blocks: 0, value: 0n, listed: 0 };
    let blocks = 0;
    let value = 0n;
    let listed = 0;
    for (let row = c.y; row < c.y + c.h; row++)
      for (let col = c.x; col < c.x + c.w; col++) {
        const id = row * GRID + col;
        if (this.contentOf[id] !== contentId) continue;
        blocks++;
        value += this.valueOf(id);
        if (this.listings.has(id)) listed++;
      }
    return { blocks, value, listed };
  }

  holders() {
    const seen = new Set<number>();
    for (let i = 0; i < this.ownerIdx.length; i++) if (this.ownerIdx[i]) seen.add(this.ownerIdx[i]);
    return seen.size;
  }

  floor(): bigint | undefined {
    let min: bigint | undefined;
    for (const l of this.listings.values()) if (min === undefined || l.price < min) min = l.price;
    return min;
  }
}

export const store = new GridStore();

/** Re-render whenever the indexer applies new events. */
export function useStoreVersion() {
  return useSyncExternalStore(store.subscribe, store.getVersion);
}

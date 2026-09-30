import { useMemo, useState } from "react";
import { isAddress, parseEther, zeroAddress, type Address } from "viem";
import { useAccount } from "wagmi";
import { millionBlockAbi } from "../abi";
import { CONTRACT, FEE_BPS, MAX_BLOCKS_PER_TX, MAX_TRADE_BATCH, PRIMARY_PRICE, explorer } from "../config";
import { store, useStoreVersion, type Content } from "../store";
import { TxStatus, useTx } from "../tx";
import { eth, rectIds, resolveMedia, safeLink, short, xyOf, type Rect } from "../utils";
import { Sparkline } from "./Sparkline";
import { SPECIAL_TIERS, TIERS, Tier, tierLabel, tierOf } from "../tiers";

type Props = { selection: Rect; onClose: () => void };

export function SidePanel({ selection, onClose }: Props) {
  const version = useStoreVersion();
  const { address } = useAccount();
  const me = address?.toLowerCase();

  const info = useMemo(() => {
    const ids = rectIds(selection);
    const s = {
      ids,
      unminted: [] as number[],
      mine: [] as number[],
      mineListed: [] as number[],
      buyable: [] as number[],
      others: 0,
      buyTotal: 0n,
      value: 0n,
      contents: new Map<number, number>(),
      tiers: new Map<Tier, number>(),
    };
    for (const id of ids) {
      const t = tierOf(id);
      if (t !== Tier.Standard) s.tiers.set(t, (s.tiers.get(t) ?? 0) + 1);
      const owner = store.ownerOf(id)?.toLowerCase();
      if (!owner) { s.unminted.push(id); continue; }
      s.value += store.valueOf(id);
      const cid = store.contentOf[id];
      if (cid) s.contents.set(cid, (s.contents.get(cid) ?? 0) + 1);
      const l = store.listings.get(id);
      if (owner === me) {
        s.mine.push(id);
        if (l) s.mineListed.push(id);
      } else if (l) {
        s.buyable.push(id);
        s.buyTotal += l.price;
      } else s.others++;
    }
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, version, me]);

  const n = info.ids.length;
  const single = n === 1 ? info.ids[0] : null;
  const allUnminted = info.unminted.length === n;
  const allMine = info.mine.length === n;
  const mainContent =
    info.contents.size === 1 ? store.contents.get([...info.contents.keys()][0]) : single !== null ? store.contentAt(single) : undefined;

  return (
    <aside className="panel">
      <header className="panel-head">
        <div>
          <div className="eyebrow">{single !== null ? "Block" : "Selection"}</div>
          <h2>
            {single !== null
              ? `(${xyOf(single)[0]}, ${xyOf(single)[1]})`
              : `${selection.w}×${selection.h} at (${selection.x}, ${selection.y})`}
          </h2>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
      </header>

      {info.tiers.size > 0 && (
        <div className="tier-badges">
          {single !== null ? (
            <TierBadge tier={tierOf(single)} label={tierLabel(single)!} />
          ) : (
            SPECIAL_TIERS.filter((t) => info.tiers.has(t)).map((t) => (
              <TierBadge key={t} tier={t} label={`${info.tiers.get(t)} ${TIERS[t].emoji} ${TIERS[t].name}`} />
            ))
          )}
        </div>
      )}

      <div className="stats-row">
        <Stat label="Blocks" value={n.toLocaleString()} />
        <Stat label="Available" value={info.unminted.length.toLocaleString()} />
        <Stat label="For sale" value={(info.buyable.length + info.mineListed.length).toLocaleString()} />
        <Stat label="Market value" value={`${eth(info.value)} Ξ`} />
      </div>

      {mainContent && !mainContent.hidden && <ContentCard c={mainContent} />}
      {mainContent?.hidden && <div className="note">This content was hidden by moderation.</div>}

      {single !== null && store.ownerOf(single) && <BlockMarket id={single} />}

      {!CONTRACT && <div className="note warn">No contract configured for this network. Deploy it and set the address (see README).</div>}

      {allUnminted && <MintBox rect={selection} count={n} />}
      {!allUnminted && info.unminted.length > 0 && (
        <div className="note">
          {info.unminted.length} unminted block{info.unminted.length > 1 ? "s" : ""} in this selection. Select a fully empty area to mint.
        </div>
      )}

      {info.buyable.length > 0 && <BuyBox ids={info.buyable} total={info.buyTotal} />}

      {allMine && <ContentBox rect={selection} existing={mainContent} />}
      {info.mine.length > 0 && <ListBox ids={info.mine} listed={info.mineListed} />}

      {info.others > 0 && info.buyable.length === 0 && !allMine && (
        <div className="note">Owned by others and not listed. Check back later, or ping the owner.</div>
      )}
    </aside>
  );
}

function TierBadge({ tier, label }: { tier: Tier; label: string }) {
  if (tier === Tier.Standard) return null;
  return (
    <span className="tier-badge" style={{ borderColor: TIERS[tier].color, color: TIERS[tier].color }} title={TIERS[tier].rule}>
      {label}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

function ContentCard({ c }: { c: Content }) {
  const img = resolveMedia(c.image);
  const link = safeLink(c.url);
  const stats = store.contentStats(c.id);
  return (
    <div className="content-card">
      {img && <img src={img} alt={c.title} referrerPolicy="no-referrer" />}
      <div className="content-meta">
        <div className="content-title">{c.title || "Untitled"}</div>
        {link && (
          <a href={link} target="_blank" rel="noopener noreferrer nofollow">
            {link.replace(/^https?:\/\//, "").slice(0, 48)} ↗
          </a>
        )}
        {c.token !== zeroAddress && (
          <div className="mono small">
            Token:{" "}
            {explorer ? (
              <a href={`${explorer}/token/${c.token}`} target="_blank" rel="noreferrer">{short(c.token)} ↗</a>
            ) : short(c.token)}
          </div>
        )}
        <div className="muted small">
          {stats.blocks} blocks · worth {eth(stats.value)} Ξ{stats.listed ? ` · ${stats.listed} for sale` : ""}
        </div>
      </div>
    </div>
  );
}

function BlockMarket({ id }: { id: number }) {
  const owner = store.ownerOf(id)!;
  const listing = store.listings.get(id);
  const history = store.sales.filter((s) => s.tokenId === id);
  const points = [PRIMARY_PRICE, ...history.map((s) => s.price)];
  return (
    <div className="box">
      <div className="kv"><span>Owner</span><AddressLink a={owner} /></div>
      <div className="kv"><span>Last price</span><b>{eth(store.valueOf(id))} Ξ</b></div>
      <div className="kv"><span>Listed</span><b>{listing ? `${eth(listing.price)} Ξ` : "—"}</b></div>
      {points.length > 1 && (
        <>
          <div className="eyebrow" style={{ marginTop: 10 }}>Price history</div>
          <Sparkline values={points.map((p) => Number(p) / 1e18)} height={48} />
        </>
      )}
      <div className="muted small">{history.length} secondary sale{history.length === 1 ? "" : "s"} · token #{id}</div>
    </div>
  );
}

export function AddressLink({ a }: { a: Address }) {
  return explorer ? (
    <a className="mono" href={`${explorer}/address/${a}`} target="_blank" rel="noreferrer">{short(a)}</a>
  ) : (
    <span className="mono">{short(a)}</span>
  );
}

// ---- actions -----------------------------------------------------------------

function ContentFields({ v, set }: { v: ContentInput; set: (v: ContentInput) => void }) {
  const preview = resolveMedia(v.image);
  return (
    <div className="fields">
      <label>
        Image URL <span className="muted">(https://, ipfs://, ar://)</span>
        <input value={v.image} onChange={(e) => set({ ...v, image: e.target.value })} placeholder="ipfs://… or https://…/logo.png" />
      </label>
      {preview && <img className="preview" src={preview} alt="" referrerPolicy="no-referrer" />}
      <label>
        Website
        <input value={v.url} onChange={(e) => set({ ...v, url: e.target.value })} placeholder="https://yourproject.xyz" />
      </label>
      <label>
        Title
        <input value={v.title} maxLength={256} onChange={(e) => set({ ...v, title: e.target.value })} placeholder="Project name · tagline" />
      </label>
      <label>
        Token / project contract <span className="muted">(optional)</span>
        <input value={v.token} onChange={(e) => set({ ...v, token: e.target.value })} placeholder="0x…" />
      </label>
    </div>
  );
}

type ContentInput = { image: string; url: string; title: string; token: string };
const emptyContent: ContentInput = { image: "", url: "", title: "", token: "" };

function tokenArg(t: string): Address | null {
  if (!t.trim()) return zeroAddress;
  return isAddress(t.trim()) ? (t.trim() as Address) : null;
}

function MintBox({ rect, count }: { rect: Rect; count: number }) {
  const [withContent, setWithContent] = useState(true);
  const [v, setV] = useState<ContentInput>(emptyContent);
  const tx = useTx();
  const cost = PRIMARY_PRICE * BigInt(count);
  const tooBig = count > MAX_BLOCKS_PER_TX;
  const token = tokenArg(v.token);

  function submit() {
    if (!CONTRACT || !token) return;
    const base = [rect.x, rect.y, rect.w, rect.h] as const;
    const hasContent = !!(v.image.trim() || v.url.trim() || v.title.trim() || v.token.trim());
    if (withContent && hasContent)
      tx.send({ address: CONTRACT, abi: millionBlockAbi, functionName: "mintAndSetContent", args: [...base, v.image, v.url, v.title, token], value: cost });
    else tx.send({ address: CONTRACT, abi: millionBlockAbi, functionName: "mint", args: base, value: cost });
  }

  return (
    <div className="box action">
      <h3>Mint {count.toLocaleString()} block{count > 1 ? "s" : ""}</h3>
      <div className="price-line">
        <span>0.0004 Ξ × {count.toLocaleString()}</span>
        <b>{eth(cost, 6)} Ξ</b>
      </div>
      {tooBig && <div className="note warn">Max {MAX_BLOCKS_PER_TX} blocks (e.g. 20×20) per transaction. Shrink the selection.</div>}
      <label className="check">
        <input type="checkbox" checked={withContent} onChange={(e) => setWithContent(e.target.checked)} /> Publish content in the same tx
      </label>
      {withContent && <ContentFields v={v} set={setV} />}
      {!token && <div className="note warn">Token address is invalid.</div>}
      <button className="primary" disabled={!tx.isConnected || tooBig || tx.busy || !CONTRACT || !token} onClick={submit}>
        {tx.isConnected ? `Mint for ${eth(cost, 6)} Ξ` : "Connect wallet to mint"}
      </button>
      <TxStatus tx={tx} />
    </div>
  );
}

function ContentBox({ rect, existing }: { rect: Rect; existing?: Content }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<ContentInput>(
    existing ? { image: existing.image, url: existing.url, title: existing.title, token: existing.token === zeroAddress ? "" : existing.token } : emptyContent
  );
  const tx = useTx();
  const token = tokenArg(v.token);
  const tooBig = rect.w * rect.h > MAX_BLOCKS_PER_TX;
  return (
    <div className="box action">
      <div className="row-between">
        <h3>Your blocks: content</h3>
        <button className="ghost" onClick={() => setOpen(!open)}>{open ? "Hide" : existing ? "Edit" : "Add"}</button>
      </div>
      {open && (
        <>
          <ContentFields v={v} set={setV} />
          {tooBig && <div className="note warn">Max {MAX_BLOCKS_PER_TX} blocks per update.</div>}
          <button
            className="primary"
            disabled={tx.busy || !token || tooBig || !CONTRACT}
            onClick={() =>
              CONTRACT && token &&
              tx.send({ address: CONTRACT, abi: millionBlockAbi, functionName: "setContent", args: [rect.x, rect.y, rect.w, rect.h, v.image, v.url, v.title, token] })
            }
          >
            Publish on {rect.w}×{rect.h}
          </button>
          <TxStatus tx={tx} />
        </>
      )}
    </div>
  );
}

function ListBox({ ids, listed }: { ids: number[]; listed: number[] }) {
  const [price, setPrice] = useState("");
  const tx = useTx();
  const delistTx = useTx();
  let wei: bigint | null = null;
  try { wei = price ? parseEther(price) : null; } catch { wei = null; }
  const batch = ids.slice(0, MAX_TRADE_BATCH);
  const fee = wei ? (wei * FEE_BPS) / 10_000n : 0n;
  return (
    <div className="box action">
      <h3>Sell {ids.length > 1 ? `${ids.length} blocks` : "this block"}</h3>
      <label>
        Price per block (ETH)
        <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.001" />
      </label>
      {wei !== null && wei > 0n && (
        <div className="muted small">
          You receive {eth(wei - fee, 6)} Ξ per block after the 2% protocol fee
          {ids.length > 1 ? ` · ${eth((wei - fee) * BigInt(batch.length), 6)} Ξ total` : ""}.
        </div>
      )}
      {ids.length > MAX_TRADE_BATCH && <div className="note">Lists the first {MAX_TRADE_BATCH} blocks per transaction.</div>}
      <button
        className="primary"
        disabled={!wei || wei === 0n || tx.busy || !CONTRACT}
        onClick={() =>
          CONTRACT && wei &&
          tx.send({ address: CONTRACT, abi: millionBlockAbi, functionName: "list", args: [batch.map(BigInt), batch.map(() => wei!)] })
        }
      >
        List for sale
      </button>
      <TxStatus tx={tx} />
      {listed.length > 0 && (
        <>
          <button
            className="ghost"
            disabled={delistTx.busy || !CONTRACT}
            onClick={() =>
              CONTRACT &&
              delistTx.send({ address: CONTRACT, abi: millionBlockAbi, functionName: "delist", args: [listed.slice(0, MAX_TRADE_BATCH).map(BigInt)] })
            }
          >
            Cancel {listed.length} listing{listed.length > 1 ? "s" : ""}
          </button>
          <TxStatus tx={delistTx} />
        </>
      )}
    </div>
  );
}

function BuyBox({ ids, total }: { ids: number[]; total: bigint }) {
  const tx = useTx();
  const batch = ids.slice(0, MAX_TRADE_BATCH);
  const batchTotal = batch.length === ids.length ? total : batch.reduce((s, id) => s + (store.listings.get(id)?.price ?? 0n), 0n);
  return (
    <div className="box action">
      <h3>Buy {batch.length} listed block{batch.length > 1 ? "s" : ""}</h3>
      <div className="price-line">
        <span>{batch.length > 1 ? `avg ${eth(batchTotal / BigInt(batch.length), 6)} Ξ` : "price"}</span>
        <b>{eth(batchTotal, 6)} Ξ</b>
      </div>
      {single(batch) && <div className="muted small">Seller: <AddressLink a={store.listings.get(batch[0])!.seller} /></div>}
      <button
        className="primary"
        disabled={!tx.isConnected || tx.busy || !CONTRACT}
        onClick={() => CONTRACT && tx.send({ address: CONTRACT, abi: millionBlockAbi, functionName: "buy", args: [batch.map(BigInt)], value: batchTotal })}
      >
        {tx.isConnected ? `Buy for ${eth(batchTotal, 6)} Ξ` : "Connect wallet to buy"}
      </button>
      <TxStatus tx={tx} />
    </div>
  );
}

const single = (a: unknown[]) => a.length === 1;

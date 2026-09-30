import { useMemo, useState } from "react";
import { GRID, PRIMARY_PRICE, explorer } from "../config";
import { store, useStoreVersion } from "../store";
import { eth, resolveMedia, safeLink, short, xyOf, type Rect } from "../utils";
import { AddressLink } from "./SidePanel";
import { Sparkline } from "./Sparkline";

type Props = { onFocus: (r: Rect) => void };
type Tab = "projects" | "listings" | "sales";

export function MarketView({ onFocus }: Props) {
  const version = useStoreVersion();
  const [tab, setTab] = useState<Tab>("projects");

  const data = useMemo(() => {
    const projects = [...store.contents.values()]
      .filter((c) => !c.hidden)
      .map((c) => ({ c, ...store.contentStats(c.id) }))
      .filter((p) => p.blocks > 0)
      .sort((a, b) => (b.value > a.value ? 1 : b.value < a.value ? -1 : 0));
    const listings = [...store.listings.entries()].sort((a, b) => (a[1].price > b[1].price ? 1 : -1)).slice(0, 300);
    const sales = store.sales.slice(-200).reverse();
    // Rolling average sale price (window 10) as the index chart.
    const series: number[] = [];
    let win: number[] = [];
    for (const s of store.sales) {
      win.push(Number(s.price) / 1e18);
      if (win.length > 10) win = win.slice(1);
      series.push(win.reduce((a, b) => a + b, 0) / win.length);
    }
    const marketCap = (() => {
      let v = BigInt(store.minted) * PRIMARY_PRICE;
      for (const [id, p] of store.lastPrice) if (store.ownerIdx[id]) v += p - PRIMARY_PRICE;
      return v;
    })();
    return { projects, listings, sales, series, marketCap, holders: store.holders(), floor: store.floor() };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const pct = ((store.minted / (GRID * GRID)) * 100).toFixed(store.minted < 10000 ? 3 : 2);

  return (
    <div className="market">
      <section className="kpis">
        <Kpi label="Blocks minted" value={store.minted.toLocaleString()} sub={`${pct}% of 1,000,000`} />
        <Kpi label="Map value" value={`${eth(data.marketCap, 3)} Ξ`} sub="sum of last prices" />
        <Kpi label="Floor" value={data.floor ? `${eth(data.floor, 5)} Ξ` : "—"} sub={`${store.listings.size} listed`} />
        <Kpi label="Volume" value={`${eth(store.volume, 3)} Ξ`} sub={`${store.sales.length} sales`} />
        <Kpi label="Holders" value={data.holders.toLocaleString()} sub={`${store.contents.size} publications`} />
        <Kpi label="Protocol fees" value={`${eth(store.fees, 4)} Ξ`} sub="2% of secondary" />
      </section>

      {data.series.length > 1 && (
        <section className="chart-card">
          <div className="eyebrow">Block price index · rolling avg of last 10 sales</div>
          <Sparkline values={data.series} height={90} />
        </section>
      )}

      <nav className="tabs">
        {(["projects", "listings", "sales"] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
            {t === "projects" ? `Ecosystem (${data.projects.length})` : t === "listings" ? `For sale (${store.listings.size})` : `Sales (${store.sales.length})`}
          </button>
        ))}
      </nav>

      {tab === "projects" && (
        <div className="project-grid">
          {data.projects.length === 0 && <Empty text="No projects yet. Be the first to claim a spot on the map." />}
          {data.projects.map(({ c, blocks, value, listed }) => {
            const img = resolveMedia(c.image);
            const link = safeLink(c.url);
            return (
              <article key={c.id} className="project" onClick={() => onFocus({ x: c.x, y: c.y, w: c.w, h: c.h })}>
                <div className="project-img">{img ? <img src={img} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span>#{c.id}</span>}</div>
                <div className="project-body">
                  <div className="content-title">{c.title || "Untitled"}</div>
                  {link && (
                    <a href={link} target="_blank" rel="noopener noreferrer nofollow" onClick={(e) => e.stopPropagation()}>
                      {link.replace(/^https?:\/\//, "").slice(0, 32)} ↗
                    </a>
                  )}
                  <div className="muted small">
                    {blocks} blocks · {eth(value)} Ξ{listed ? ` · ${listed} for sale` : ""}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {tab === "listings" && (
        <table className="table">
          <thead>
            <tr><th>Block</th><th>Project</th><th>Seller</th><th className="r">Price</th></tr>
          </thead>
          <tbody>
            {data.listings.length === 0 && <tr><td colSpan={4}><Empty text="Nothing listed right now." /></td></tr>}
            {data.listings.map(([id, l]) => {
              const [x, y] = xyOf(id);
              return (
                <tr key={id} onClick={() => onFocus({ x, y, w: 1, h: 1 })}>
                  <td className="mono">({x}, {y})</td>
                  <td>{store.contentAt(id)?.title || "—"}</td>
                  <td><AddressLink a={l.seller} /></td>
                  <td className="r"><b>{eth(l.price, 5)} Ξ</b></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {tab === "sales" && (
        <table className="table">
          <thead>
            <tr><th>Block</th><th>From → To</th><th className="r">Price</th><th></th></tr>
          </thead>
          <tbody>
            {data.sales.length === 0 && <tr><td colSpan={4}><Empty text="No secondary sales yet." /></td></tr>}
            {data.sales.map((s, i) => {
              const [x, y] = xyOf(s.tokenId);
              return (
                <tr key={`${s.tx}-${i}`} onClick={() => onFocus({ x, y, w: 1, h: 1 })}>
                  <td className="mono">({x}, {y})</td>
                  <td className="mono small">{short(s.seller)} → {short(s.buyer)}</td>
                  <td className="r"><b>{eth(s.price, 5)} Ξ</b></td>
                  <td className="r">
                    {explorer && <a href={`${explorer}/tx/${s.tx}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>tx ↗</a>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="kpi">
      <div className="stat-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <div className="muted small">{sub}</div>
    </div>
  );
}

const Empty = ({ text }: { text: string }) => <div className="empty">{text}</div>;

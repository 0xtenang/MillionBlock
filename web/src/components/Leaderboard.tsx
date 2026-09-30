import { useMemo } from "react";
import { useAccount } from "wagmi";
import { zeroAddress, type Address } from "viem";
import { GRID } from "../config";
import { STATUS, fmtPct, fmtUsd, market, statusOf, useMarketVersion, type TokenMarket } from "../market";
import { store, useStoreVersion, type Content } from "../store";
import { TIERS, Tier, tierOf } from "../tiers";
import { blockNo, eth, resolveMedia, xyOf, type Rect } from "../utils";
import { AddressLink } from "./SidePanel";

type Props = { onFocus: (r: Rect) => void };

type Project = {
  key: string;
  name: string;
  token?: Address;
  m?: TokenMarket;
  blocks: number;
  value: bigint;
  image: string | null;
  main: Content; // largest publication, used to fly to it
};

const MEDALS = ["🥇", "🥈", "🥉"];

export function Leaderboard({ onFocus }: Props) {
  const version = useStoreVersion();
  const mv = useMarketVersion();
  const { address } = useAccount();

  const projects = useMemo(() => {
    const map = new Map<string, Project>();
    for (const c of store.contents.values()) {
      if (c.hidden || !(c.image || c.url || c.title || c.token !== zeroAddress)) continue;
      const st = store.contentStats(c.id);
      if (!st.blocks) continue;
      const hasToken = c.token !== zeroAddress;
      const key = hasToken ? c.token.toLowerCase() : `c${c.id}`;
      const m = hasToken ? market.get(c.token) : undefined;
      const p = map.get(key);
      if (p) {
        p.blocks += st.blocks;
        p.value += st.value;
        if (c.w * c.h > p.main.w * p.main.h) p.main = c;
      } else {
        map.set(key, {
          key,
          name: m ? `$${m.symbol}` : c.title || "Untitled",
          token: hasToken ? c.token : undefined,
          m,
          blocks: st.blocks,
          value: st.value,
          image: resolveMedia(c.image) ?? (m?.imageUrl ? resolveMedia(m.imageUrl) : null),
          main: c,
        });
      }
    }
    return [...map.values()].sort((a, b) => b.blocks - a.blocks || (b.value > a.value ? 1 : -1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, mv]);

  const valuable = useMemo(
    () => [...store.lastPrice.entries()].filter(([id]) => store.ownerIdx[id]).sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0)).slice(0, 25),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version]
  );

  const holders = useMemo(() => {
    const counts = new Map<number, { blocks: number; value: bigint }>();
    for (let id = 0; id < GRID * GRID; id++) {
      const o = store.ownerIdx[id];
      if (!o) continue;
      const h = counts.get(o) ?? { blocks: 0, value: 0n };
      h.blocks++;
      h.value += store.valueOf(id);
      counts.set(o, h);
    }
    return [...counts.entries()].sort((a, b) => b[1].blocks - a[1].blocks).slice(0, 25);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const movers = projects.filter((p) => p.m).sort((a, b) => b.m!.change24h - a.m!.change24h);
  const gainers = movers.filter((p) => p.m!.change24h > 0).slice(0, 5);
  const losers = movers.filter((p) => p.m!.change24h < 0).reverse().slice(0, 5);
  const me = address?.toLowerCase();

  return (
    <div className="market leaderboard">
      <section className="lb-hero">
        <h1>🏆 Leaderboard</h1>
        <p className="muted">
          Live ranking of the Robinhood Chain ecosystem by who owns the board.
          {market.updatedAt ? ` Prices updated ${new Date(market.updatedAt).toLocaleTimeString()}.` : ""}
          {market.error ? ` Market data unavailable: ${market.error}` : ""}
        </p>
      </section>

      {gainers.length + losers.length > 0 && (
        <section className="movers">
          <MoverList title="📈 Top gainers (24h)" list={gainers} onFocus={onFocus} />
          <MoverList title="📉 Top losers (24h)" list={losers} onFocus={onFocus} />
        </section>
      )}

      <h2 className="lb-title">🏆 Board: projects by blocks held</h2>
      <table className="table">
        <thead>
          <tr>
            <th>Rank</th><th>Project</th><th className="r">Blocks</th><th className="r hide-sm">Board</th>
            <th className="r">Price</th><th className="r">24h</th><th className="r hide-sm">MCAP</th>
          </tr>
        </thead>
        <tbody>
          {projects.length === 0 && <tr><td colSpan={7}><div className="empty">No projects yet. Claim the #1 spot.</div></td></tr>}
          {projects.map((p, i) => {
            const st = p.m ? statusOf(p.m) : "flat";
            return (
              <tr key={p.key} onClick={() => onFocus(p.main)}>
                <td className="rank">{MEDALS[i] ?? i + 1}</td>
                <td>
                  <div className="lb-project">
                    <span className="lb-logo">{p.image ? <img src={p.image} alt="" referrerPolicy="no-referrer" loading="lazy" /> : null}</span>
                    <b>{p.name}</b>
                    {st !== "flat" && <span title={STATUS[st].label}>{STATUS[st].emoji}</span>}
                  </div>
                </td>
                <td className="r"><b>{p.blocks.toLocaleString()}</b></td>
                <td className="r hide-sm muted">{((p.blocks / (GRID * GRID)) * 100).toFixed(p.blocks < 1000 ? 3 : 2)}%</td>
                <td className="r">{p.m ? fmtUsd(p.m.priceUsd) : "—"}</td>
                <td className="r" style={{ color: p.m ? (p.m.change24h >= 0 ? STATUS.up.color : STATUS.down.color) : undefined }}>
                  {p.m ? fmtPct(p.m.change24h) : "—"}
                </td>
                <td className="r hide-sm">{p.m?.mcap ? fmtUsd(p.m.mcap) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="lb-columns">
        <div>
          <h2 className="lb-title">💰 Most valuable blocks</h2>
          <table className="table">
            <thead><tr><th>Block</th><th>Project</th><th className="r">Last sale</th></tr></thead>
            <tbody>
              {valuable.length === 0 && <tr><td colSpan={3}><div className="empty">No resales yet. The first flip sets the record.</div></td></tr>}
              {valuable.map(([id, price], i) => {
                const [x, y] = xyOf(id);
                const t = tierOf(id);
                return (
                  <tr key={id} onClick={() => onFocus({ x, y, w: 1, h: 1 })}>
                    <td className="mono">
                      {MEDALS[i] ?? ""} {blockNo(id)} {t !== Tier.Standard && <span title={TIERS[t].name}>{TIERS[t].emoji}</span>}
                    </td>
                    <td>{store.contentAt(id)?.title || "—"}</td>
                    <td className="r"><b>{eth(price, 4)} Ξ</b></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div>
          <h2 className="lb-title">👥 Top holders</h2>
          <table className="table">
            <thead><tr><th>Rank</th><th>Wallet</th><th className="r">Blocks</th><th className="r">Value</th></tr></thead>
            <tbody>
              {holders.length === 0 && <tr><td colSpan={4}><div className="empty">Nobody yet.</div></td></tr>}
              {holders.map(([idx, h], i) => {
                const a = store.owners[idx];
                return (
                  <tr key={idx} className={a.toLowerCase() === me ? "me" : ""}>
                    <td className="rank">{MEDALS[i] ?? i + 1}</td>
                    <td><AddressLink a={a} />{a.toLowerCase() === me && <span className="pill" style={{ marginLeft: 6 }}>you</span>}</td>
                    <td className="r"><b>{h.blocks.toLocaleString()}</b></td>
                    <td className="r">{eth(h.value, 3)} Ξ</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="muted small">
        Projects are grouped by the token address their owners attached. Anyone can attach any token to blocks they own, so a listing here is not an endorsement by that project.
      </p>
    </div>
  );
}

function MoverList({ title, list, onFocus }: { title: string; list: Project[]; onFocus: (r: Rect) => void }) {
  return (
    <div className="mover-card">
      <div className="eyebrow">{title}</div>
      {list.length === 0 && <div className="muted small">—</div>}
      {list.map((p) => (
        <button key={p.key} className="mover" onClick={() => onFocus(p.main)}>
          <span>{p.name} {p.m && statusOf(p.m) !== "flat" ? STATUS[statusOf(p.m)].emoji : ""}</span>
          <span className="muted small">{p.m ? fmtUsd(p.m.priceUsd) : ""}</span>
          <b style={{ color: p.m!.change24h >= 0 ? STATUS.up.color : STATUS.down.color }}>{fmtPct(p.m!.change24h)}</b>
        </button>
      ))}
    </div>
  );
}


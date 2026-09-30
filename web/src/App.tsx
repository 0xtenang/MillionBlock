import { useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { GridCanvas, type Tool, type ViewMode } from "./components/GridCanvas";
import { MarketView } from "./components/MarketView";
import { SidePanel } from "./components/SidePanel";
import { CHAIN, CONTRACT, GRID } from "./config";
import { store, useStoreVersion } from "./store";
import { eth, short, xyOf, type Rect } from "./utils";

type Page = "map" | "market" | "about";

export function App() {
  useStoreVersion();
  const { address } = useAccount();
  const [page, setPage] = useState<Page>("map");
  const [mode, setMode] = useState<ViewMode>("map");
  const [tool, setTool] = useState<Tool>("select");
  const [selection, setSelection] = useState<Rect | null>(null);
  const [focus, setFocus] = useState<{ rect: Rect; nonce: number } | null>(null);
  const [hover, setHover] = useState<{ id: number; x: number; y: number } | null>(null);
  const myIdx = store.ownerIndexOf(address);

  const focusOn = (r: Rect) => {
    setPage("map");
    setSelection(r);
    setFocus({ rect: r, nonce: Date.now() });
  };

  const pct = ((store.minted / (GRID * GRID)) * 100).toFixed(2);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand" onClick={() => setPage("map")}>
          <Logo />
          <span>Million<b>Block</b></span>
        </div>
        <nav className="pages">
          {(["map", "market", "about"] as Page[]).map((p) => (
            <button key={p} className={page === p ? "active" : ""} onClick={() => setPage(p)}>
              {p === "map" ? "Map" : p === "market" ? "Market" : "About"}
            </button>
          ))}
        </nav>
        <div className="progress" title={`${store.minted.toLocaleString()} of 1,000,000 blocks minted`}>
          <div className="progress-bar"><div style={{ width: `${Math.max(0.5, Number(pct))}%` }} /></div>
          <span className="mono small">{store.minted.toLocaleString()} / 1,000,000</span>
        </div>
        <Wallet />
      </header>

      {store.error && <div className="banner err">Indexer: {store.error}</div>}
      {!CONTRACT && <div className="banner">No MillionBlock contract configured for {CHAIN.name}. Deploy it and set VITE_CONTRACT_ADDRESS (see README).</div>}

      {page === "map" && (
        <main className="map-page">
          <div className="map-toolbar">
            <div className="seg">
              {(["map", "market", "owners"] as ViewMode[]).map((m) => (
                <button key={m} className={mode === m ? "active" : ""} onClick={() => setMode(m)}>
                  {m === "map" ? "Map" : m === "market" ? "Heatmap" : "Owners"}
                </button>
              ))}
            </div>
            <div className="seg">
              <button className={tool === "select" ? "active" : ""} onClick={() => setTool("select")} title="Drag to select blocks">▦ Select</button>
              <button className={tool === "pan" ? "active" : ""} onClick={() => setTool("pan")} title="Drag to move around (or hold Space / right-drag)">✥ Pan</button>
            </div>
            <span className="hint">Drag to select · scroll to zoom · 0.0004 Ξ per block</span>
          </div>
          {mode === "market" && (
            <div className="legend">
              <span><i style={{ background: "#3c6e28" }} /> mint price</span>
              <span><i style={{ background: "#c3f53c" }} /> ~5×</span>
              <span><i style={{ background: "#ffb020" }} /> ~20×</span>
              <span><i style={{ background: "#ff3c8c" }} /> 100×+</span>
              <span><i style={{ background: "#3cc8ff" }} /> for sale</span>
            </div>
          )}
          <div className="map-body">
            <GridCanvas
              mode={mode}
              tool={tool}
              selection={selection}
              onSelect={setSelection}
              onHover={(id, x, y) => setHover(id === null ? null : { id, x, y })}
              myIdx={myIdx}
              focus={focus}
            />
            {selection && <SidePanel selection={selection} onClose={() => setSelection(null)} />}
          </div>
          {hover && <HoverCard {...hover} />}
          {store.loading && <div className="loading">Syncing the map from Robinhood Chain…</div>}
        </main>
      )}

      {page === "market" && <MarketView onFocus={focusOn} />}
      {page === "about" && <About />}
    </div>
  );
}

function HoverCard({ id, x, y }: { id: number; x: number; y: number }) {
  const [bx, by] = xyOf(id);
  const owner = store.ownerOf(id);
  const c = store.contentAt(id);
  const l = store.listings.get(id);
  return (
    <div className="hover-card" style={{ left: x + 14, top: y + 14 }}>
      <div className="mono small">({bx}, {by})</div>
      {c && !c.hidden && c.title && <div className="content-title">{c.title}</div>}
      {owner ? (
        <>
          <div className="small">Owner {short(owner)}</div>
          <div className="small">Value {eth(store.valueOf(id))} Ξ{l ? ` · for sale ${eth(l.price)} Ξ` : ""}</div>
        </>
      ) : (
        <div className="small accent">Available · 0.0004 Ξ</div>
      )}
    </div>
  );
}

function Wallet() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  if (!isConnected)
    return (
      <button className="primary" disabled={isPending} onClick={() => connect({ connector: connectors[0] })}>
        {isPending ? "Connecting…" : "Connect wallet"}
      </button>
    );
  if (chainId !== CHAIN.id)
    return (
      <button className="primary warn" onClick={() => switchChain({ chainId: CHAIN.id })}>
        Switch to {CHAIN.name}
      </button>
    );
  const mine = store.ownerIndexOf(address);
  let count = 0;
  if (mine > 0) for (let i = 0; i < store.ownerIdx.length; i++) if (store.ownerIdx[i] === mine) count++;
  return (
    <button className="wallet" onClick={() => disconnect()} title="Disconnect">
      <span className="dot" /> {short(address)} {count > 0 && <span className="pill">{count} blocks</span>}
    </button>
  );
}

function Logo() {
  return (
    <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
      <rect x="4" y="4" width="11" height="11" fill="var(--accent)" />
      <rect x="17" y="4" width="11" height="11" fill="var(--accent)" opacity=".5" />
      <rect x="4" y="17" width="11" height="11" fill="var(--accent)" opacity=".5" />
      <rect x="17" y="17" width="11" height="11" fill="var(--accent)" />
    </svg>
  );
}

function About() {
  return (
    <div className="about">
      <h1>1,000,000 blocks. One living map of Robinhood Chain.</h1>
      <p>
        MillionBlock is the Million Dollar Homepage rebuilt crypto-native. The board is a 1000 × 1000 grid and every block
        is an on-chain asset (ERC-721) on {CHAIN.name}. Claim blocks, put your project on them, and trade them. The map
        shows what the ecosystem is building, and what that space is worth.
      </p>
      <div className="about-grid">
        <div><h3>Mint</h3><p>Any unclaimed block costs <b>0.0004 ETH</b>. Select a rectangle (up to 20×20 per transaction) and mint it straight from the protocol.</p></div>
        <div><h3>Publish</h3><p>Attach an image, a website, a title and your token or project contract. Content is stored on-chain and shows across your whole rectangle.</p></div>
        <div><h3>Trade</h3><p>List any block you own at your own price. Buyers pay the seller directly; the protocol keeps a <b>2% fee</b> on every secondary sale. No approvals needed.</p></div>
        <div><h3>Watch value</h3><p>Every sale updates the block's last price. Switch the map to Heatmap to see where the ecosystem's hottest real estate is.</p></div>
      </div>
      <p className="muted small">
        Contract: {CONTRACT ? <span className="mono">{CONTRACT}</span> : "not deployed on this network"} · Royalties (ERC-2981) are also set to 2% for external marketplaces.
      </p>
    </div>
  );
}

import { useEffect, useRef } from "react";
import { GRID } from "../config";
import { store, useStoreVersion } from "../store";
import { CORNER_IDS, TIERS, Tier, tierOf } from "../tiers";
import { heatColor, ownerColor, resolveMedia, type Rect } from "../utils";

export type ViewMode = "map" | "market" | "owners";
export type Tool = "select" | "pan";

type Props = {
  mode: ViewMode;
  tool: Tool;
  selection: Rect | null;
  onSelect: (r: Rect | null) => void;
  onHover: (id: number | null, clientX: number, clientY: number) => void;
  myIdx: number;
  focus: { rect: Rect; nonce: number } | null;
};

type View = { scale: number; ox: number; oy: number };

const imageCache = new Map<string, HTMLImageElement | "loading" | "error">();

export function GridCanvas({ mode, tool, selection, onSelect, onHover, myIdx, focus }: Props) {
  const version = useStoreVersion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const view = useRef<View>({ scale: 1, ox: 0, oy: 0 });
  const size = useRef({ w: 0, h: 0, dpr: 1 });
  const fitted = useRef(false);
  const frame = useRef(0);
  const hover = useRef<number | null>(null);
  const drag = useRef<{ kind: "pan" | "select"; sx: number; sy: number; ox: number; oy: number; ax: number; ay: number; moved: boolean } | null>(null);
  const preview = useRef<Rect | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; scale: number; cx: number; cy: number; ox: number; oy: number } | null>(null);
  const space = useRef(false);
  const focusRef = useRef(focus);
  focusRef.current = focus;
  const props = useRef({ mode, selection, myIdx });
  props.current = { mode, selection, myIdx };

  const requestDraw = () => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(draw);
  };

  // ---- base layer: 1px per block ------------------------------------------
  useEffect(() => {
    if (!baseRef.current) {
      baseRef.current = document.createElement("canvas");
      baseRef.current.width = GRID;
      baseRef.current.height = GRID;
    }
    const ctx = baseRef.current.getContext("2d")!;
    const img = ctx.createImageData(GRID, GRID);
    const d = img.data;
    const primary = Number(400_000_000_000_000n);
    for (let id = 0; id < GRID * GRID; id++) {
      const o = id * 4;
      const oi = store.ownerIdx[id];
      let r: number, g: number, b: number;
      if (!oi) {
        const x = id % GRID, y = (id / GRID) | 0;
        const alt = ((x >> 3) + (y >> 3)) & 1;
        const t = tierOf(id);
        if (t === Tier.Standard) { r = 14 + alt * 3; g = 19 + alt * 3; b = 16 + alt * 3; }
        else {
          // unclaimed special blocks glow faintly in their tier colour
          const [tr, tg, tb] = TIERS[t].rgb;
          const k = t === Tier.Center ? 0.1 + alt * 0.02 : 0.35;
          r = 14 + (tr - 14) * k; g = 19 + (tg - 19) * k; b = 16 + (tb - 16) * k;
        }
      } else if (mode === "market") {
        const listed = store.listings.get(id);
        if (listed) [r, g, b] = [60, 200, 255];
        else [r, g, b] = heatColor(Number(store.valueOf(id)) / primary);
      } else if (mode === "owners") {
        if (oi === myIdx) [r, g, b] = [195, 245, 60];
        else [r, g, b] = ownerColor(oi);
      } else {
        [r, g, b] = ownerColor(oi);
        if (oi === myIdx) [r, g, b] = [150, 200, 40];
      }
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    requestDraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, mode, myIdx]);

  useEffect(requestDraw, [selection]);

  // ---- sizing -----------------------------------------------------------------
  useEffect(() => {
    const wrap = wrapRef.current!;
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      const w = wrap.clientWidth, h = wrap.clientHeight;
      // keep the same world point centered when the viewport resizes (e.g. side panel opens)
      if (fitted.current) {
        view.current.ox += (w - size.current.w) / 2;
        view.current.oy += (h - size.current.h) / 2;
      }
      size.current = { w, h, dpr };
      const c = canvasRef.current!;
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
      if (!fitted.current && w > 0) {
        fitted.current = true;
        if (focusRef.current) fitRect(focusRef.current.rect, 0.5);
        else fitRect({ x: 0, y: 0, w: GRID, h: GRID }, 0.96);
      }
      requestDraw();
    });
    ro.observe(wrap);
    const kd = (e: KeyboardEvent) => { if (e.code === "Space" && e.target === document.body) { space.current = true; e.preventDefault(); } };
    const ku = (e: KeyboardEvent) => { if (e.code === "Space") space.current = false; };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => { ro.disconnect(); window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (focus) {
      fitRect(focus.rect, 0.5);
      requestDraw();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce]);

  function fitRect(r: Rect, fill: number) {
    const { w, h } = size.current;
    if (!w) return;
    // show some neighbourhood around small targets
    const pad = 40;
    if (r.w < pad || r.h < pad) {
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      r = { x: cx - Math.max(r.w, pad) / 2, y: cy - Math.max(r.h, pad) / 2, w: Math.max(r.w, pad), h: Math.max(r.h, pad) };
      fill = Math.max(fill, 0.9);
    }
    const scale = Math.min(48, Math.min(w / r.w, h / r.h) * fill);
    view.current = { scale, ox: w / 2 - (r.x + r.w / 2) * scale, oy: h / 2 - (r.y + r.h / 2) * scale };
  }

  function toBlock(clientX: number, clientY: number) {
    const rect = canvasRef.current!.getBoundingClientRect();
    const { scale, ox, oy } = view.current;
    return { bx: (clientX - rect.left - ox) / scale, by: (clientY - rect.top - oy) / scale, lx: clientX - rect.left, ly: clientY - rect.top };
  }

  // ---- draw ---------------------------------------------------------------
  function draw() {
    const c = canvasRef.current;
    const base = baseRef.current;
    if (!c || !base) return;
    const ctx = c.getContext("2d")!;
    const { w, h, dpr } = size.current;
    const { scale, ox, oy } = view.current;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = getComputedStyle(c).getPropertyValue("--canvas-bg") || "#070907";
    ctx.fillRect(0, 0, c.width, c.height);

    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(base, 0, 0);

    // visible world rect
    const vx0 = -ox / scale, vy0 = -oy / scale, vx1 = (w - ox) / scale, vy1 = (h - oy) / scale;

    if (props.current.mode === "map") {
      ctx.imageSmoothingEnabled = true;
      for (const content of store.contents.values()) {
        if (content.hidden) continue;
        if (content.x > vx1 || content.y > vy1 || content.x + content.w < vx0 || content.y + content.h < vy0) continue;
        const src = resolveMedia(content.image);
        if (!src) continue;
        const img = imageCache.get(src);
        if (img === undefined) {
          imageCache.set(src, "loading");
          const el = new Image();
          el.decoding = "async";
          el.referrerPolicy = "no-referrer";
          el.onload = () => { imageCache.set(src, el); requestDraw(); };
          el.onerror = () => imageCache.set(src, "error");
          el.src = src;
        } else if (img !== "loading" && img !== "error") {
          ctx.drawImage(img, content.x, content.y, content.w, content.h);
        }
      }
      // Blocks that changed hands or were overwritten show their own content on top,
      // painter's order (ascending content id) already guarantees the latest wins.
    }

    // grid lines when zoomed in
    const px = 1 / scale;
    if (scale * dpr >= 7) {
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = px;
      ctx.beginPath();
      const x0 = Math.max(0, Math.floor(vx0)), x1 = Math.min(GRID, Math.ceil(vx1));
      const y0 = Math.max(0, Math.floor(vy0)), y1 = Math.min(GRID, Math.ceil(vy1));
      for (let x = x0; x <= x1; x++) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
      for (let y = y0; y <= y1; y++) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
      ctx.stroke();
    }

    drawTiers(ctx, scale, dpr, vx0, vy0, vx1, vy1);

    // board edge
    ctx.strokeStyle = "rgba(195,245,60,0.35)";
    ctx.lineWidth = 2 * px;
    ctx.strokeRect(0, 0, GRID, GRID);

    const sel = preview.current ?? props.current.selection;
    if (sel) {
      ctx.fillStyle = "rgba(195,245,60,0.18)";
      ctx.fillRect(sel.x, sel.y, sel.w, sel.h);
      ctx.strokeStyle = "#c3f53c";
      ctx.lineWidth = 2 * px;
      ctx.strokeRect(sel.x, sel.y, sel.w, sel.h);
    }
    if (hover.current !== null) {
      const hx = hover.current % GRID, hy = Math.floor(hover.current / GRID);
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 1.5 * px;
      ctx.strokeRect(hx, hy, 1, 1);
    }
  }

  // ---- special blocks: fixed-by-contract scarcity tiers ----------------------
  function drawTiers(ctx: CanvasRenderingContext2D, scale: number, dpr: number, vx0: number, vy0: number, vx1: number, vy1: number) {
    const px = 1 / scale;
    const zoomed = scale * dpr >= 7;

    // 🔥 Center: glowing frame around the middle 100x100
    const c = TIERS[Tier.Center];
    ctx.save();
    ctx.strokeStyle = c.color;
    ctx.shadowColor = c.color;
    ctx.shadowBlur = 12 * dpr;
    ctx.lineWidth = Math.max(2 * px, 0.25);
    ctx.strokeRect(c.area.x, c.area.y, c.area.w, c.area.h);
    ctx.restore();

    // 👑 Genesis: gold strip, gold border per block when zoomed, crown on #1
    const g = TIERS[Tier.Genesis];
    ctx.strokeStyle = g.color;
    ctx.lineWidth = Math.max(2 * px, zoomed ? 0.12 : 0);
    ctx.strokeRect(g.area.x, g.area.y, g.area.w, g.area.h);
    if (zoomed && vy0 < 1 && vx0 < 101) {
      ctx.lineWidth = 0.1;
      for (let x = Math.max(1, Math.floor(vx0)); x <= Math.min(100, Math.ceil(vx1)); x++) ctx.strokeRect(x + 0.05, 0.05, 0.9, 0.9);
      if (vx0 < 2) {
        ctx.font = "0.7px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("👑", 1.5, 0.55);
      }
    }

    // ⭐ Corners: violet frames that stay visible when zoomed out
    const k = TIERS[Tier.Corner];
    const size = Math.max(1, 6 * px);
    ctx.strokeStyle = k.color;
    ctx.lineWidth = Math.max(1.5 * px, zoomed ? 0.1 : 0);
    for (const id of CORNER_IDS) {
      const x = id % GRID, y = Math.floor(id / GRID);
      if (x + size < vx0 || x - size > vx1 || y + size < vy0 || y - size > vy1) continue;
      const ox = x === 0 ? 0 : x + 1 - size, oy = y === 0 ? 0 : y + 1 - size;
      ctx.strokeRect(ox, oy, size, size);
      if (zoomed) {
        ctx.font = "0.7px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("⭐", x + 0.5, y + 0.55);
      }
    }
  }

  // ---- input ----------------------------------------------------------------
  const clampI = (v: number) => Math.max(0, Math.min(GRID - 1, Math.floor(v)));

  function onPointerDown(e: React.PointerEvent) {
    const c = canvasRef.current!;
    c.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const r = c.getBoundingClientRect();
      pinch.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        scale: view.current.scale,
        cx: (a.x + b.x) / 2 - r.left,
        cy: (a.y + b.y) / 2 - r.top,
        ox: view.current.ox,
        oy: view.current.oy,
      };
      drag.current = null;
      preview.current = null;
      return;
    }
    const { bx, by } = toBlock(e.clientX, e.clientY);
    const pan = tool === "pan" || e.button !== 0 || space.current || e.pointerType === "touch" && tool !== "select";
    drag.current = { kind: pan ? "pan" : "select", sx: e.clientX, sy: e.clientY, ox: view.current.ox, oy: view.current.oy, ax: clampI(bx), ay: clampI(by), moved: false };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const p = pinch.current;
      const scale = Math.max(0.2, Math.min(64, (p.scale * Math.hypot(a.x - b.x, a.y - b.y)) / p.dist));
      const wx = (p.cx - p.ox) / p.scale, wy = (p.cy - p.oy) / p.scale;
      view.current = { scale, ox: p.cx - wx * scale, oy: p.cy - wy * scale };
      requestDraw();
      return;
    }
    const { bx, by } = toBlock(e.clientX, e.clientY);
    const d = drag.current;
    if (d) {
      if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 4) d.moved = true;
      if (d.kind === "pan") {
        view.current.ox = d.ox + e.clientX - d.sx;
        view.current.oy = d.oy + e.clientY - d.sy;
      } else {
        const x = clampI(bx), y = clampI(by);
        preview.current = { x: Math.min(x, d.ax), y: Math.min(y, d.ay), w: Math.abs(x - d.ax) + 1, h: Math.abs(y - d.ay) + 1 };
      }
    }
    const inside = bx >= 0 && by >= 0 && bx < GRID && by < GRID;
    const id = inside ? Math.floor(by) * GRID + Math.floor(bx) : null;
    if (id !== hover.current) {
      hover.current = id;
      onHover(id, e.clientX, e.clientY);
    } else if (id !== null) onHover(id, e.clientX, e.clientY);
    requestDraw();
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.kind === "select" && preview.current) {
      onSelect(preview.current);
      preview.current = null;
    } else if (!d.moved) {
      onSelect({ x: d.ax, y: d.ay, w: 1, h: 1 });
    }
    requestDraw();
  }

  function onWheel(e: React.WheelEvent) {
    const { lx, ly } = toBlock(e.clientX, e.clientY);
    const v = view.current;
    const scale = Math.max(0.2, Math.min(64, v.scale * Math.exp(-e.deltaY * 0.0015)));
    const wx = (lx - v.ox) / v.scale, wy = (ly - v.oy) / v.scale;
    view.current = { scale, ox: lx - wx * scale, oy: ly - wy * scale };
    requestDraw();
  }

  function zoomBy(f: number) {
    const { w, h } = size.current;
    const v = view.current;
    const scale = Math.max(0.2, Math.min(64, v.scale * f));
    const wx = (w / 2 - v.ox) / v.scale, wy = (h / 2 - v.oy) / v.scale;
    view.current = { scale, ox: w / 2 - wx * scale, oy: h / 2 - wy * scale };
    requestDraw();
  }

  return (
    <div className={`grid-wrap tool-${tool}`} ref={wrapRef}>
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => { hover.current = null; onHover(null, 0, 0); requestDraw(); }}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
        aria-label="MillionBlock grid"
      />
      <div className="zoom-controls">
        <button onClick={() => zoomBy(1.5)} aria-label="Zoom in">+</button>
        <button onClick={() => zoomBy(1 / 1.5)} aria-label="Zoom out">−</button>
        <button onClick={() => { fitRect({ x: 0, y: 0, w: GRID, h: GRID }, 0.96); requestDraw(); }} aria-label="Fit">⤢</button>
      </div>
    </div>
  );
}

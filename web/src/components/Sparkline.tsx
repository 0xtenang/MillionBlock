/** Tiny dependency-free line chart for price history. */
export function Sparkline({ values, height = 40 }: { values: number[]; height?: number }) {
  if (values.length < 2) return null;
  const w = 280;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, height - 4 - ((v - min) / span) * (height - 8)] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const up = values[values.length - 1] >= values[0];
  return (
    <svg className={`spark ${up ? "up" : "down"}`} viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" role="img" aria-label="price history">
      <path d={`${d} L${w},${height} L0,${height} Z`} className="spark-fill" />
      <path d={d} className="spark-line" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

type Mark = { min: number; max: number };
type Carrier = { id: string; label: string; mhz: number; category: string };

const CAT: Record<string, string> = {
  audio: "#e3a008",
  iem: "#7eb6ff",
  video: "#3cba78",
  lighting: "#c084fc",
  comms: "#e15b4c",
};

export function SpectrumChart({
  carriers,
  marks,
  min,
  max,
  intermods = [],
  trace = [],
}: {
  carriers: Carrier[];
  marks: Mark[];
  min: number;
  max: number;
  intermods?: { mhz: number; order: number }[];
  trace?: { mhz: number; level: number }[];
}) {
  const span = Math.max(max - min, 1);
  const x = (mhz: number) => ((mhz - min) / span) * 1000;
  const ticks = 6;
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium">Spectrum</p>
        <p className="font-mono text-xs text-muted">{min.toFixed(3)} – {max.toFixed(3)} MHz</p>
      </div>
      <svg viewBox="0 0 1000 180" className="mt-2 h-44 w-full" role="img" aria-label="Assigned spectrum">
        <rect x="0" y="24" width="1000" height="110" fill="#1c2530" rx="8" />
        {marks.map((m, i) => (
          <rect
            key={i}
            x={Math.max(0, x(m.min))}
            y={24}
            width={Math.max(1, x(m.max) - x(m.min))}
            height={110}
            fill="#e15b4c"
            opacity="0.28"
          />
        ))}
        {trace.length > 1 && (
          <polyline
            fill="none"
            stroke="#7dcea0"
            strokeWidth="1.5"
            points={trace.map((p) => `${x(p.mhz)},${134 - Math.max(0, Math.min(100, (p.level + 100)))}`).join(" ")}
          />
        )}
        {carriers.map((c) => {
          const cx = x(c.mhz);
          const color = CAT[c.category] ?? "#e3a008";
          return (
            <g key={c.id}>
              <line x1={cx} x2={cx} y1={24} y2={134} stroke={color} strokeWidth="2" />
              <circle cx={cx} cy={40} r="3.5" fill={color} />
              <text x={cx + 4} y={38} fill="#e7edf2" fontSize="11" fontFamily="IBM Plex Sans, sans-serif">
                {c.label.slice(0, 18)}
              </text>
              <text x={cx + 4} y={52} fill={color} fontSize="10" fontFamily="IBM Plex Mono, monospace">
                {c.mhz.toFixed(3)}
              </text>
            </g>
          );
        })}
        {Array.from({ length: ticks + 1 }, (_, i) => {
          const mhz = min + (span * i) / ticks;
          const tx = x(mhz);
          return (
            <g key={i}>
              <line x1={tx} x2={tx} y1={134} y2={142} stroke="#8b97a3" />
              <text x={tx} y="158" fill="#8b97a3" fontSize="11" textAnchor="middle" fontFamily="IBM Plex Mono, monospace">
                {mhz.toFixed(0)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted">
        {Object.entries(CAT).map(([k, color]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: color }} />
            {k}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-bad/70" />
          scan hit
        </span>
      </div>
    </div>
  );
}

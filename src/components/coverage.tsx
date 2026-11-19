export type Antenna = {
  id: string;
  name: string;
  powerMw: number;
  gainDbi: number;
  freqMhz: number;
  heightM: number;
  thresholdDbm: number;
  marginDb: number;
};

export function rangeMetres(a: Antenna): number {
  const eirp = 10 * Math.log10(Math.max(a.powerMw, 0.1)) + a.gainDbi;
  const budget = eirp - a.thresholdDbm - a.marginDb - 32.44 - 20 * Math.log10(Math.max(a.freqMhz, 1));
  const km = 10 ** (budget / 20);
  const heightBoost = 1 + Math.min(a.heightM, 12) / 20;
  return Math.max(1, km * 1000 * heightBoost);
}

export function CoverageMap({ antennas }: { antennas: Antenna[] }) {
  if (antennas.length === 0) return null;
  const ranges = antennas.map(rangeMetres);
  const max = Math.max(...ranges, 10);
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium">Coverage estimate</p>
        <p className="text-xs text-muted">Free-space path loss plus margin. Planning aid, not a survey.</p>
      </div>
      <svg viewBox="0 0 640 280" className="h-64 w-full" role="img" aria-label="Antenna coverage">
        <rect x="0" y="0" width="640" height="280" fill="#1c2530" rx="12" />
        <rect x="220" y="90" width="200" height="100" fill="none" stroke="#2a3542" strokeDasharray="4 4" />
        <text x="320" y="145" fill="#8b97a3" fontSize="12" textAnchor="middle" fontFamily="IBM Plex Sans, sans-serif">stage</text>
        {antennas.map((a, i) => {
          const r = (rangeMetres(a) / max) * 110;
          const cx = 160 + (i % 3) * 160;
          const cy = 90 + Math.floor(i / 3) * 90;
          return (
            <g key={a.id}>
              <circle cx={cx} cy={cy} r={r} fill="#e3a008" opacity="0.12" />
              <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e3a008" strokeWidth="1.5" />
              <circle cx={cx} cy={cy} r="4" fill="#e3a008" />
              <text x={cx} y={cy - 10} fill="#e7edf2" fontSize="11" textAnchor="middle" fontFamily="IBM Plex Sans, sans-serif">
                {a.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

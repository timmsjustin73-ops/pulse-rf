import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell, btnClass, fieldClass } from "@/components/shell";
import { addScan, listEvents } from "@/lib/pulse.functions";

export const Route = createFileRoute("/scan")({ component: ScanRoute });

function ScanRoute() {
  return <AppShell><ScanPage /></AppShell>;
}

function ScanPage() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listEvents>>>([]);
  const [eventId, setEventId] = useState("");
  const [spot, setSpot] = useState("");
  const [port, setPort] = useState("");
  const [preview, setPreview] = useState("");
  useEffect(() => { void listEvents().then(setRows); }, []);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Scanner</h1>
      <p className="text-sm text-muted">Pick the show, name the spot, and read a USB scanner in Chrome.</p>
      <label className="block text-sm">Event
        <select className={fieldClass + " mt-1"} value={eventId} onChange={(e) => setEventId(e.target.value)}>
          <option value="">Choose</option>
          {rows.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </label>
      <label className="block text-sm">Location
        <input className={fieldClass + " mt-1"} value={spot} onChange={(e) => setSpot(e.target.value)} placeholder="Stage, FOH, Dock" />
      </label>
      <button type="button" className={btnClass} disabled={!eventId || !spot} onClick={() => {
        const serial = (navigator as unknown as { serial?: { requestPort: () => Promise<{ open: (o: object) => Promise<void> }> } }).serial;
        if (!serial) { setPort("Chrome only"); return; }
        void serial.requestPort().then((p) => p.open({ baudRate: 500000 })).then(() => setPort(`${spot} connected`));
      }}>Connect scanner</button>
      {port && <p className="text-sm text-muted">{port}</p>}
      <LiveTrace body={preview} />
      <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); const body = new FormData(e.currentTarget).get("body"); if (typeof body === "string" && eventId) void addScan({ data: { eventId, label: spot || "Scanner", body, threshold: -70 } }).then(() => setPort("Trace posted")); }}>
        <textarea name="body" className={fieldClass + " h-32"} placeholder="520.000,-62" onChange={(e) => setPreview(e.target.value)} />
        <button className={btnClass} type="submit">Post trace</button>
      </form>
    </div>
  );
}

function LiveTrace({ body }: { body: string }) {
  const points = body.split(/\n/).map((line) => {
    const [f, l] = line.split(/[,\s]+/);
    const mhz = Number(f);
    const level = Number(l);
    return Number.isFinite(mhz) && Number.isFinite(level) ? { mhz, level } : null;
  }).filter((p): p is { mhz: number; level: number } => p !== null);
  if (points.length < 2) return null;
  const min = Math.min(...points.map((p) => p.mhz));
  const max = Math.max(...points.map((p) => p.mhz));
  const span = Math.max(max - min, 1);
  const d = points.map((p) => `${((p.mhz - min) / span) * 1000},${134 - Math.max(0, Math.min(100, p.level + 100))}`).join(" ");
  return (
    <svg viewBox="0 0 1000 150" className="h-36 w-full rounded-md border border-border bg-surface">
      <polyline fill="none" stroke="#7dcea0" strokeWidth="1.5" points={d} />
    </svg>
  );
}

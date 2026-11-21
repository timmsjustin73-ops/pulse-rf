import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell, btnClass, fieldClass } from "@/components/shell";
import { listEvents } from "@/lib/pulse.functions";

export const Route = createFileRoute("/scan")({ component: ScanRoute });

function ScanRoute() {
  return <AppShell><ScanPage /></AppShell>;
}

function ScanPage() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listEvents>>>([]);
  const [eventId, setEventId] = useState("");
  const [spot, setSpot] = useState("");
  const [port, setPort] = useState("");
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
    </div>
  );
}

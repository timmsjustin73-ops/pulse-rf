import { createFileRoute } from "@tanstack/react-router";
import { Sheet, useEventWork } from "./events.$eventId";
import { useEventWork as useWork } from "@/lib/event-context";

export const Route = createFileRoute("/events/$eventId/reports")({
  component: ReportsPage,
});

function ReportsPage() {
  const { visible, manager } = useWork();
  if (!manager) return <p className="text-sm text-muted">Reports are for RF managers.</p>;
  return (
    <div className="space-y-4">
      <h2 className="font-semibold">Reports</h2>
      <p className="text-sm text-muted">Tune sheet and exports for this show.</p>
      <div className="flex gap-2">
        <button type="button" className="rounded-lg border border-border px-3 py-2 text-sm" onClick={() => window.print()}>Print sheet</button>
        <button type="button" className="rounded-lg border border-border px-3 py-2 text-sm" onClick={() => {
          const rows = visible.requests.map((r) => [r.label, r.assigned_mhz ?? "", r.device_name].join(",")).join("\n");
          const blob = new Blob(["channel,frequency,device\n" + rows], { type: "text/csv" });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = "stickers.csv";
          a.click();
        }}>Sticker CSV</button>
        <button type="button" className="rounded-lg border border-border px-3 py-2 text-sm" onClick={() => {
          const rows = visible.requests.filter((r) => r.assigned_mhz).map((r) => [r.assigned_mhz, r.label, r.device_name, r.manufacturer].join(",")).join("\n");
          const blob = new Blob(["Frequency,Name,Device,Manufacturer\n" + rows], { type: "text/csv" });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = "wwb.csv";
          a.click();
        }}>WWB export</button>
        <button type="button" className="rounded-lg border border-border px-3 py-2 text-sm" onClick={() => {
          const by = new Map<string, string[]>();
          for (const r of visible.requests) {
            const key = r.manufacturer || "No company";
            by.set(key, [...(by.get(key) ?? []), `${r.label} ${r.assigned_mhz ?? "waiting"}`]);
          }
          const body = [...by.entries()].map(([k, v]) => `${k}\n${v.join("\n")}`).join("\n\n");
          const blob = new Blob([body], { type: "text/plain" });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = "pack-sheet.txt";
          a.click();
        }}>Pack sheet</button>
      </div>
      <div className="rounded-xl border border-border p-4 text-sm">
        <p className="font-medium">Day sheet</p>
        <ul className="mt-2 space-y-1 text-muted">
          {visible.zones.map((z) => (
            <li key={z.id}>{z.name}: {visible.requests.filter((r) => r.zone_id === z.id).map((r) => r.label).join(", ") || "nothing"}</li>
          ))}
        </ul>
      </div>
      <Sheet data={visible} />
    </div>
  );
}

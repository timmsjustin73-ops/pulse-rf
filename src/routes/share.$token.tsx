import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Radio } from "lucide-react";
import { SpectrumChart } from "@/components/spectrum";
import { formatMhz } from "@/lib/catalog";
import { getPublicPlot } from "@/lib/pulse.functions";

export const Route = createFileRoute("/share/$token")({ component: SharePage });

type Plot = Awaited<ReturnType<typeof getPublicPlot>>;

function SharePage() {
  const { token } = Route.useParams();
  const [data, setData] = useState<Plot | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancel = false;
    getPublicPlot({ data: { token } })
      .then((plot) => {
        if (!cancel) setData(plot);
      })
      .catch((err: unknown) => {
        if (!cancel) setError(err instanceof Error ? err.message : "Could not open this plot.");
      });
    return () => {
      cancel = true;
    };
  }, [token]);

  if (error) {
    return (
      <main className="grid min-h-screen place-items-center bg-bg px-5 text-center text-fg">
        <div>
          <p className="text-lg font-semibold">{error}</p>
          <Link to="/" className="mt-3 inline-block text-sm text-primary">Back to Pulse RF</Link>
        </div>
      </main>
    );
  }
  if (!data) {
    return <main className="grid min-h-screen place-items-center bg-bg text-muted">Loading plot…</main>;
  }

  const carriers = data.requests
    .filter((r) => r.assigned_mhz != null)
    .map((r) => ({ id: r.id, label: r.label, mhz: r.assigned_mhz as number, category: r.category }));
  const lo = Math.min(470, ...carriers.map((c) => c.mhz));
  const hi = Math.max(694, ...carriers.map((c) => c.mhz));

  return (
    <main className="min-h-screen bg-bg text-fg">
      <header className="mx-auto flex h-14 max-w-4xl items-center gap-2 px-5">
        <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-fg">
          <Radio className="size-4" />
        </span>
        <span className="font-semibold">Pulse RF</span>
        <span className="text-sm text-muted">Public plot</span>
      </header>
      <div className="mx-auto max-w-4xl space-y-5 px-5 pb-16">
        <div>
          <h1 className="text-2xl font-semibold">{data.name}</h1>
          <p className="text-sm text-muted">
            {[data.venue, data.city].filter(Boolean).join(" · ") || "No venue"} · {data.spacing} spacing
          </p>
        </div>
        {carriers.length > 0 && (
          <SpectrumChart carriers={carriers} marks={data.marks} min={Math.floor(lo)} max={Math.ceil(hi)} />
        )}
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase text-muted">
              <th className="py-2">Channel</th>
              <th>Device</th>
              <th>Zone</th>
              <th>MHz</th>
            </tr>
          </thead>
          <tbody>
            {data.requests.map((r) => (
              <tr key={r.id} className="border-b border-border">
                <td className="py-2">{r.label}</td>
                <td className="text-muted">{r.device_name}</td>
                <td>{data.zones.find((z) => z.id === r.zone_id)?.name}</td>
                <td className="font-mono tabular-nums text-primary">{formatMhz(r.assigned_mhz)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-muted">Planning aid only. Confirm against a scan and the local licence before transmitting.</p>
      </div>
    </main>
  );
}

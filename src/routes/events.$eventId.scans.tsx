import { createFileRoute } from "@tanstack/react-router";
import { useEventWork } from "@/lib/event-context";
import { Scans } from "./events.$eventId";

export const Route = createFileRoute("/events/$eventId/scans")({
  component: ScansPage,
});

function ScansPage() {
  const { data, manager, canRequest, busy, run } = useEventWork();
  if (!manager) return <p className="text-sm text-muted">Scans are for RF managers.</p>;
  return <Scans data={data} canRequest={canRequest} manager={manager} busy={busy} run={run} />;
}

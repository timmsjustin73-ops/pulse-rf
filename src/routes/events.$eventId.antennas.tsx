import { createFileRoute } from "@tanstack/react-router";
import { useEventWork } from "@/lib/event-context";
import { Antennas } from "./events.$eventId";

export const Route = createFileRoute("/events/$eventId/antennas")({
  component: AntennasPage,
});

function AntennasPage() {
  const { data, manager, busy, run } = useEventWork();
  if (!manager) return <p className="text-sm text-muted">Antennas are for RF managers.</p>;
  return <Antennas data={data} manager={manager} busy={busy} run={run} />;
}

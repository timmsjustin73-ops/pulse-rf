import { createFileRoute } from "@tanstack/react-router";
import { useEventWork, Zones } from "./events.$eventId";

export const Route = createFileRoute("/events/$eventId/areas")({
  component: AreasPage,
});

function AreasPage() {
  const { data, manager, busy, run } = useEventWork();
  return <Zones data={data} manager={manager} busy={busy} run={run} />;
}

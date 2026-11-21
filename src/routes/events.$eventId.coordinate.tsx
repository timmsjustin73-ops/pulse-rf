import { createFileRoute } from "@tanstack/react-router";
import { Coordinate, useEventWork } from "./events.$eventId";

export const Route = createFileRoute("/events/$eventId/coordinate")({
  component: CoordinatePage,
});

function CoordinatePage() {
  const { visible, manager, busy, run, eventId } = useEventWork();
  if (!manager) return <p className="text-sm text-muted">Coordinate is for RF managers.</p>;
  return <Coordinate data={visible} manager={manager} busy={busy} run={run} eventId={eventId} />;
}

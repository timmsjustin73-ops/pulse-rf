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
      <Sheet data={visible} />
    </div>
  );
}

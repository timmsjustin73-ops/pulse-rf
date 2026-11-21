import { createFileRoute } from "@tanstack/react-router";
import { MyRequests, useEventWork } from "./events.$eventId";

export const Route = createFileRoute("/events/$eventId/requests")({
  component: RequestsPage,
});

function RequestsPage() {
  const { visible, custom, canRequest, busy, run, onEdit } = useEventWork();
  return <MyRequests data={visible} custom={custom} canRequest={canRequest} busy={busy} run={run} onEdit={onEdit} />;
}

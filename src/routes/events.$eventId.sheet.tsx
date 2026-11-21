import { createFileRoute } from "@tanstack/react-router";
import { Sheet, useEventWork } from "./events.$eventId";

export const Route = createFileRoute("/events/$eventId/sheet")({
  component: SheetPage,
});

function SheetPage() {
  const { visible } = useEventWork();
  return <Sheet data={visible} />;
}

import { createFileRoute } from "@tanstack/react-router";
import { useEventWork } from "@/lib/event-context";
import { Sheet } from "./events.$eventId";

export const Route = createFileRoute("/events/$eventId/sheet")({
  component: SheetPage,
});

function SheetPage() {
  const { visible } = useEventWork();
  return <Sheet data={visible} />;
}

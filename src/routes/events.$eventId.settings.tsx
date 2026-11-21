import { createFileRoute } from "@tanstack/react-router";
import { useEventWork } from "@/lib/event-context";
import { Settings } from "./events.$eventId";

export const Route = createFileRoute("/events/$eventId/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { data, manager, busy, run } = useEventWork();
  if (!manager) return <p className="text-sm text-muted">Settings are for RF managers.</p>;
  return <Settings data={data} manager={manager} busy={busy} run={run} />;
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/shell";
import { listEvents } from "@/lib/pulse.functions";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/requests")({ component: RequestsRoute });

function RequestsRoute() {
  return (
    <AppShell>
      <RequestsPage />
    </AppShell>
  );
}

function RequestsPage() {
  const { user } = useCurrentUserState();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listEvents>>>([]);
  useEffect(() => {
    if (!user?.id) return;
    void listEvents().then(setRows);
  }, [user?.id]);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Requests</h1>
        <p className="text-sm text-muted">Your requests, grouped by event. Open one to add or edit.</p>
      </div>
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">{row.name}</p>
                <p className="text-sm text-muted">{row.assigned}/{row.total} assigned</p>
              </div>
              <Link to="/events/$eventId/requests" params={{ eventId: row.id }} className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-fg">
                Open requests
              </Link>
            </div>
          </li>
        ))}
        {rows.length === 0 && <p className="text-sm text-muted">No events yet.</p>}
      </ul>
    </div>
  );
}

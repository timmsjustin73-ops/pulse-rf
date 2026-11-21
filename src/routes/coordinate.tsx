import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/shell";
import { listEvents } from "@/lib/pulse.functions";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/coordinate")({ component: CoordinateRoute });

function CoordinateRoute() {
  return (
    <AppShell>
      <CoordinatePage />
    </AppShell>
  );
}

function CoordinatePage() {
  const { user } = useCurrentUserState();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listEvents>>>([]);
  useEffect(() => {
    if (!user?.id) return;
    void listEvents().then((all) => setRows(all.filter((row) => row.role === "manager")));
  }, [user?.id]);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Coordinate</h1>
        <p className="text-sm text-muted">Shows you can coordinate. Techs do not see this page.</p>
      </div>
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">{row.name}</p>
                <p className="text-sm text-muted">{row.assigned}/{row.total} assigned · {row.venue || "No venue"}</p>
              </div>
              <Link to="/events/$eventId/coordinate" params={{ eventId: row.id }} className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-fg">
                Open plot
              </Link>
            </div>
          </li>
        ))}
        {rows.length === 0 && <p className="text-sm text-muted">No shows to coordinate.</p>}
      </ul>
    </div>
  );
}

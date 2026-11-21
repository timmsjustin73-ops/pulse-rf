import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/shell";
import { listEvents } from "@/lib/pulse.functions";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/admin")({ component: AdminRoute });

function AdminRoute() {
  return (
    <AppShell>
      <AdminPage />
    </AppShell>
  );
}

function AdminPage() {
  const { user } = useCurrentUserState();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listEvents>>>([]);
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    if (!user?.id) return;
    void listEvents().then((all) => {
      const mine = all.find((row) => row.role === "manager");
      if (!mine && user.primaryEmail !== "justin@jtlive.tech") setDenied(true);
      setRows(all);
    });
  }, [user?.id, user?.primaryEmail]);
  if (user?.primaryEmail !== "justin@jtlive.tech" || denied) {
    return <p className="text-sm text-muted">Admin only.</p>;
  }
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Admin</h1>
        <p className="text-sm text-muted">Every show on the platform.</p>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Event</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Dates</th>
              <th className="px-4 py-3">RF</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium">{row.name}</td>
                <td className="px-4 py-3 text-muted">{[row.venue, row.city].filter(Boolean).join(", ") || "—"}</td>
                <td className="px-4 py-3 text-muted">{row.startsOn || "—"}</td>
                <td className="px-4 py-3 font-mono">{row.assigned}/{row.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useEventWork } from "@/lib/event-context";

export const Route = createFileRoute("/events/$eventId/audit")({ component: AuditPage });

function AuditPage() {
  const { data, manager } = useEventWork();
  if (!manager) return <p className="text-sm text-muted">The audit is for RF managers.</p>;
  return (
    <div className="space-y-3">
      <h2 className="font-semibold">Audit</h2>
      <p className="text-sm text-muted">Who asked, what they got, and what moved.</p>
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase text-muted"><tr><th className="py-2">Channel</th><th>Asked by</th><th>Got</th><th>Moved</th></tr></thead>
        <tbody>
          {data.requests.map((r) => (
            <tr key={r.id} className="border-t border-border">
              <td className="py-2">{r.label}</td>
              <td>{r.created_by}</td>
              <td className="font-mono">{r.assigned_mhz ?? "waiting"}</td>
              <td>{r.flagged_mhz ? `from ${r.flagged_mhz}` : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

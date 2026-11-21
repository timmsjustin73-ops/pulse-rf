import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/shell";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/permissions")({ component: PermissionsRoute });

function PermissionsRoute() {
  return (
    <AppShell>
      <PermissionsPage />
    </AppShell>
  );
}

const ROLES = [
  { name: "Admin", detail: "Every show and every company." },
  { name: "Company owner", detail: "Their company. Sets manager or tech." },
  { name: "RF manager", detail: "Coordinates a show." },
  { name: "Tech", detail: "Requests and views their company." },
];

function PermissionsPage() {
  const { user } = useCurrentUserState();
  if (user?.primaryEmail !== "justin@jtlive.tech") {
    return <p className="text-sm text-muted">Admin only.</p>;
  }
  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-sm text-muted">Who can see what. Change a person from Admin, People.</p>
      <table className="mt-4 w-full text-left text-sm">
        <tbody>
          {ROLES.map((role) => (
            <tr key={role.name} className="border-b border-border">
              <td className="w-40 py-3 font-medium">{role.name}</td>
              <td className="py-3 text-muted">{role.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Link to="/admin" className="mt-6 inline-block text-sm text-primary">Open People</Link>
    </div>
  );
}

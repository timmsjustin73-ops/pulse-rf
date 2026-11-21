import { createFileRoute } from "@tanstack/react-router";
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

function PermissionsPage() {
  const { user } = useCurrentUserState();
  const admin = user?.primaryEmail === "justin@jtlive.tech";
  if (!admin) return <p className="text-sm text-muted">Admin and company owners only.</p>;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Permissions</h1>
      <p className="text-sm text-muted">Admin sees everyone. A company owner sees only their company.</p>
      <div className="rounded-xl border border-border bg-surface p-4 text-sm">
        <p className="font-medium">Roles</p>
        <ul className="mt-2 space-y-1 text-muted">
          <li>Admin — every show, every company.</li>
          <li>Company owner — their company only. Can set manager or tech.</li>
          <li>RF manager — coordinates a show.</li>
          <li>Tech — requests and views their company.</li>
        </ul>
      </div>
    </div>
  );
}

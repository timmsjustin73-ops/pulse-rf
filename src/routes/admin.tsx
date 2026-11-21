import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell, btnClass, fieldClass } from "@/components/shell";
import { addToCompany, createCompany, listEvents, listPeople } from "@/lib/pulse.functions";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/admin")({ component: AdminRoute });

function AdminRoute() {
  return <AppShell><AdminPage /></AppShell>;
}

function AdminPage() {
  const { user } = useCurrentUserState();
  const [tab, setTab] = useState<"shows" | "people" | "companies">("shows");
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listEvents>>>([]);
  const [people, setPeople] = useState<Awaited<ReturnType<typeof listPeople>> | null>(null);
  const [companyName, setCompanyName] = useState("");
  if (user?.primaryEmail !== "justin@jtlive.tech") return <p className="text-sm text-muted">Admin only.</p>;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Admin</h1>
      <div className="flex gap-2">
        <button type="button" className={tab === "shows" ? btnClass : fieldClass} onClick={() => setTab("shows")}>Shows</button>
        <button type="button" className={tab === "people" ? btnClass : fieldClass} onClick={() => { setTab("people"); void listPeople().then(setPeople); }}>People</button>
        <button type="button" className={tab === "companies" ? btnClass : fieldClass} onClick={() => { setTab("companies"); void listPeople().then(setPeople); }}>Companies</button>
        <Link to="/permissions" className={fieldClass + " grid place-items-center px-3"}>Permissions</Link>
      </div>
      {tab === "shows" && <Shows onLoad={setRows} rows={rows} />}
      {tab === "people" && people && (
        <ul className="space-y-1 text-sm">
          {people.users.map((u) => <li key={u.id} className="rounded-lg border border-border px-3 py-2">{u.name || "No name"} · {u.email}</li>)}
        </ul>
      )}
      {tab === "companies" && people && (
        <div className="space-y-3">
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void createCompany({ data: { name: companyName } }).then(() => listPeople().then(setPeople)); setCompanyName(""); }}>
            <input className={fieldClass} value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Company name" required />
            <button className={btnClass} type="submit">Add company</button>
          </form>
          {people.companies.map((c) => (
            <div key={c.id} className="rounded-xl border border-border p-3 text-sm">
              <p className="font-medium">{c.name}</p>
              <p className="text-muted">{people.members.filter((m) => m.company_id === c.id).length} people</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Shows({ rows, onLoad }: { rows: Awaited<ReturnType<typeof listEvents>>; onLoad: (rows: Awaited<ReturnType<typeof listEvents>>) => void }) {
  useEffect(() => { void listEvents().then(onLoad); }, [onLoad]);
  return (
    <ul className="space-y-1 text-sm">
      {rows.map((row) => <li key={row.id} className="rounded-lg border border-border px-3 py-2">{row.name} · {row.assigned}/{row.total}</li>)}
    </ul>
  );
}

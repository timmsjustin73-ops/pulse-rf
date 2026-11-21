import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell, btnClass, fieldClass } from "@/components/shell";
import { addToCompany, createCompany, inviteToCompany, listEvents, listPeople, setUserAccess } from "@/lib/pulse.functions";
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
      {tab === "people" && people && <People people={people} onChange={() => void listPeople().then(setPeople)} />}
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
              <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); const email = new FormData(e.currentTarget).get("email"); if (typeof email === "string") void inviteToCompany({ data: { companyId: c.id, email } }).then((r) => window.alert(r.joined ? "Added" : `Code ${r.code}`)); }}>
                <input name="email" className={fieldClass} placeholder="Email" />
                <button className={btnClass} type="submit">Add</button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function People({ people, onChange }: { people: Awaited<ReturnType<typeof listPeople>>; onChange: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const user = people.users.find((u) => u.id === open);
  const member = people.members.find((m) => m.user_id === open);
  const [companyId, setCompanyId] = useState(member?.company_id ?? "");
  const [owner, setOwner] = useState(Boolean(member?.owner));
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <ul className="space-y-1 text-sm">
        {people.users.map((u) => (
          <li key={u.id}>
            <button type="button" className="w-full rounded-lg border border-border px-3 py-2 text-left hover:bg-surface-2" onClick={() => { setOpen(u.id); const m = people.members.find((row) => row.user_id === u.id); setCompanyId(m?.company_id ?? ""); setOwner(Boolean(m?.owner)); }}>{u.name || "No name"} · {u.email}</button>
          </li>
        ))}
      </ul>
      {user && (
        <form className="space-y-3 rounded-xl border border-border p-4 text-sm" onSubmit={(e) => { e.preventDefault(); const admin = new FormData(e.currentTarget).get("admin") === "on"; void setUserAccess({ data: { userId: user.id, admin, companyId, owner } }).then(onChange); }}>
          <p className="font-medium">{user.name || user.email}</p>
          <label className="flex items-center gap-2"><input type="checkbox" name="admin" /> Admin</label>
          <label className="block">Company
            <select className={fieldClass + " mt-1"} value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">None</option>
              {people.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={owner} onChange={(e) => setOwner(e.target.checked)} /> Company owner</label>
          <button className={btnClass} type="submit">Save</button>
        </form>
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

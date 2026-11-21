import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell, btnClass, fieldClass } from "@/components/shell";
import { inviteToCompany } from "@/lib/pulse.functions";

export const Route = createFileRoute("/company")({ component: CompanyRoute });

function CompanyRoute() {
  return <AppShell><CompanyPage /></AppShell>;
}

function CompanyPage() {
  const [companyId, setCompanyId] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [msg, setMsg] = useState("");
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Company</h1>
      <p className="text-sm text-muted">An owner adds people here. Paste your company id from Admin.</p>
      <label className="block text-sm">Company id<input className={fieldClass + " mt-1"} value={companyId} onChange={(e) => setCompanyId(e.target.value)} /></label>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void inviteToCompany({ data: { companyId, email, phone } }).then((r) => setMsg(r.joined ? "Added" : `Code ${r.code}`)); }}>
        <input className={fieldClass} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required /><input className={fieldClass} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" required />
        <button className={btnClass} type="submit">Add person</button>
      </form>
      {msg && <p className="text-sm text-muted">{msg}</p>}
    </div>
  );
}

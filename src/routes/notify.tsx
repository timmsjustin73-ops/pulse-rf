import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell, btnClass, fieldClass } from "@/components/shell";
import { myNotify, saveNotify } from "@/lib/pulse.functions";

export const Route = createFileRoute("/notify")({ component: NotifyRoute });

function NotifyRoute() {
  return <AppShell><NotifyPage /></AppShell>;
}

function NotifyPage() {
  const [email, setEmail] = useState(true);
  const [whatsapp, setWhatsapp] = useState(false);
  const [phone, setPhone] = useState("");
  const [quietFrom, setQuietFrom] = useState("22:00");
  const [quietTo, setQuietTo] = useState("07:00");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    void myNotify().then((row) => {
      setEmail(row.notify_email);
      setWhatsapp(row.notify_whatsapp);
      setPhone(row.phone);
      setQuietFrom(row.quiet_from);
      setQuietTo(row.quiet_to);
    });
  }, []);
  return (
    <form className="mx-auto max-w-md space-y-3" onSubmit={(e) => { e.preventDefault(); void saveNotify({ data: { email, whatsapp, phone, quietFrom, quietTo } }).then(() => setMsg("Saved")); }}>
      <h1 className="text-xl font-semibold">Updates</h1>
      <p className="text-sm text-muted">One message when a request is finalised, and one in the morning. Nothing during quiet hours.</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} /> Email</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={whatsapp} onChange={(e) => setWhatsapp(e.target.checked)} /> WhatsApp</label>
      <label className="block text-sm">WhatsApp number<input className={fieldClass + " mt-1"} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="61400000000" /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">Quiet from<input className={fieldClass + " mt-1"} type="time" value={quietFrom} onChange={(e) => setQuietFrom(e.target.value)} /></label>
        <label className="block text-sm">Quiet to<input className={fieldClass + " mt-1"} type="time" value={quietTo} onChange={(e) => setQuietTo(e.target.value)} /></label>
      </div>
      <button className={btnClass} type="submit">Save</button>
      {msg && <p className="text-sm text-muted">{msg}</p>}
      {whatsapp && phone && <a className="block text-sm text-primary" href={`https://wa.me/${phone}`}>Open WhatsApp</a>}
    </form>
  );
}

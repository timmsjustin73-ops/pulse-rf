import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell, btnClass, fieldClass, messageOf } from "@/components/shell";
import { authClient } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { setMyPhone } from "@/lib/pulse.functions";

export const Route = createFileRoute("/account")({ component: AccountRoute });

function AccountRoute() {
  return <AppShell><AccountPage /></AppShell>;
}

function AccountPage() {
  const { user } = useCurrentUserState();
  const [name, setName] = useState(user?.displayName ?? "");
  const [email, setEmail] = useState(user?.primaryEmail ?? "");
  const [phone, setPhone] = useState("");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState("");
  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-xl font-semibold">Account</h1>
      <form className="space-y-3" onSubmit={(e) => {
        e.preventDefault();
        setMsg("Saving…");
        void authClient.updateUser({ name }).then(() => setMyPhone({ data: { phone: phone || "00000000" } })).then(() => setMsg("Saved")).catch((err: unknown) => setMsg(messageOf(err)));
      }}>
        <label className="block text-sm">Name<input className={fieldClass + " mt-1"} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="block text-sm">Email<input className={fieldClass + " mt-1"} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="block text-sm">Phone<input className={fieldClass + " mt-1"} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Your number" /></label>
        <button className={btnClass} type="submit">Save</button>
      </form>
      <form className="space-y-3" onSubmit={(e) => {
        e.preventDefault();
        setMsg("Updating password…");
        void authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true }).then(() => { setMsg("Password updated"); setCurrent(""); setNext(""); }).catch((err: unknown) => setMsg(messageOf(err)));
      }}>
        <label className="block text-sm">Current password<input className={fieldClass + " mt-1"} type="password" value={current} onChange={(e) => setCurrent(e.target.value)} /></label>
        <label className="block text-sm">New password<input className={fieldClass + " mt-1"} type="password" value={next} onChange={(e) => setNext(e.target.value)} /></label>
        <button className={btnClass} type="submit">Change password</button>
      </form>
      {msg && <p className="text-sm text-muted">{msg}</p>}
    </div>
  );
}

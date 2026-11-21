import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Radio } from "lucide-react";
import { RedirectToSignIn, UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { listNotifications, markNotificationsRead } from "@/lib/pulse.functions";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  const path = useRouterState({ select: (s) => s.location.pathname });
  if (isPending) {
    return (
      <div className="grid min-h-screen place-items-center bg-bg text-muted">
        <p className="text-sm">Checking your session…</p>
      </div>
    );
  }
  if (!user) return <RedirectToSignIn />;
  return (
    <div className="min-h-screen bg-bg text-fg lg:grid lg:grid-cols-[200px_1fr]">
      <aside className="no-print border-b border-border bg-surface lg:min-h-screen lg:border-b-0 lg:border-r">
        <div className="flex h-14 items-center gap-2 px-4 font-semibold">
          <span className="grid size-7 place-items-center rounded-md bg-primary text-primary-fg text-xs font-bold">
            <Radio className="size-4" aria-hidden="true" />
          </span>
          Pulse RF
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-3 lg:flex-col lg:px-3">
          <Side to="/" label="Home" active={path === "/"} />
          <Side to="/" label="Events" active={path === "/"} />
          <Side to="/requests" label="My Requests" active={path.startsWith("/requests")} />
          <Side to="/coordinate" label="Coordinate" active={path.startsWith("/coordinate")} />
          <Side to="/library" label="My Devices" active={path.startsWith("/library")} />
          <Side to="/scan" label="Scanner" active={path.startsWith("/scan")} />
          <Side to="/company" label="Company" active={path.startsWith("/company")} />
          {user?.primaryEmail === "justin@jtlive.tech" && <Side to="/admin" label="Admin" active={path.startsWith("/admin")} />}
                  </nav>
        <div className="hidden items-center gap-2 px-4 py-4 lg:flex">
          <NoticeBell />
          <UserButton />
        </div>
      </aside>
      <div>
        <header className="no-print flex h-12 items-center justify-between border-b border-border bg-surface/60 px-4 lg:px-6">
          <p className="text-sm font-medium">{titleFor(path)}</p>
          <div className="flex items-center gap-2 lg:hidden">
            <NoticeBell />
            <UserButton />
          </div>
        </header>
        <main className="px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

function Side({ to, label, active }: { to: "/" | "/library" | "/requests" | "/coordinate" | "/admin" | "/permissions" | "/scan" | "/company"; label: string; active: boolean }) {
  return (
    <Link to={to} className={"rounded-lg px-3 py-2 text-sm " + (active ? "bg-bg font-medium text-fg" : "text-muted hover:bg-bg hover:text-fg")}>
      {label}
    </Link>
  );
}

function TopLink({ to, label, active }: { to: "/" | "/library" | "/requests" | "/coordinate"; label: string; active: boolean }) {
  return (
    <Link
      to={to}
      className={
        "rounded-lg px-3 py-2 " +
        (active ? "bg-surface text-fg" : "text-muted hover:text-fg")
      }
    >
      {label}
    </Link>
  );
}

export function Banner({ tone, children }: { tone: "bad" | "ok"; children: ReactNode }) {
  return (
    <p
      className={
        "rounded-lg border px-3 py-2 text-sm " +
        (tone === "bad" ? "border-bad/40 bg-bad/10 text-fg" : "border-ok/40 bg-ok/10 text-fg")
      }
    >
      {children}
    </p>
  );
}

export const fieldClass =
  "h-9 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-fg outline-none focus:border-primary";

export const btnClass =
  "inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-fg disabled:opacity-50";

export const ghostClass =
  "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-medium text-fg disabled:opacity-50";

export function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  return "Something went wrong.";
}

function NoticeBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Awaited<ReturnType<typeof listNotifications>>>([]);
  useEffect(() => {
    void listNotifications().then(setItems).catch(() => setItems([]));
  }, [open]);
  const unread = items.filter((n) => !n.read_at).length;
  return (
    <div className="relative">
      <button type="button" className="relative rounded-lg border border-border px-2 py-1 text-xs" onClick={() => setOpen((v) => !v)}>
        Notices{unread > 0 ? ` ${unread}` : ""}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-72 rounded-xl border border-border bg-surface p-2 text-sm shadow-lg">
          {items.length === 0 && <p className="px-2 py-3 text-muted">No notices.</p>}
          {items.map((n) => (
            <p key={n.id} className="border-b border-border px-2 py-2 last:border-0">{n.message}</p>
          ))}
          {unread > 0 && (
            <button type="button" className="mt-1 px-2 text-xs text-primary" onClick={() => void markNotificationsRead().then(() => setItems((cur) => cur.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() }))))}>
              Mark read
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function titleFor(path: string): string {
  if (path.startsWith("/admin")) return "Admin";
  if (path.startsWith("/permissions")) return "Permissions";
  if (path.startsWith("/company")) return "Company";
  if (path.startsWith("/scan")) return "Scanner";
  if (path.startsWith("/library")) return "Device library";
  if (path.startsWith("/events")) return "Show";
  return "Events";
}

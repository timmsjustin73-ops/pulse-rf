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
    <div className="min-h-screen bg-bg text-fg">
      <header className="no-print sticky top-0 z-20 border-b border-border bg-bg/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-fg">
              <Radio className="size-4" aria-hidden="true" />
            </span>
            Pulse RF
          </Link>
          <nav className="ml-2 flex items-center gap-1 text-sm">
            <TopLink to="/" label="Events" active={path === "/"} />
            <TopLink to="/requests" label="Requests" active={path.startsWith("/requests")} />
            <TopLink to="/coordinate" label="Coordinate" active={path.startsWith("/coordinate")} />
            <TopLink to="/library" label="Devices" active={path.startsWith("/library")} />
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <NoticeBell />
            <UserButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
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
  "min-h-11 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-fg outline-none focus:border-primary";

export const btnClass =
  "inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg disabled:opacity-50";

export const ghostClass =
  "inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-medium text-fg disabled:opacity-50";

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

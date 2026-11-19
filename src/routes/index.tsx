import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell, Banner, btnClass, fieldClass, ghostClass, messageOf } from "@/components/shell";
import { Landing } from "@/components/landing";
import { REGIONS, SPACINGS } from "@/lib/catalog";
import { createEvent, createSample, joinEvent, listEvents } from "@/lib/pulse.functions";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/")({ component: Home });

type Row = Awaited<ReturnType<typeof listEvents>>[number];

function Home() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return (
      <div className="grid min-h-screen place-items-center bg-bg text-muted">
        <p className="text-sm">Checking your session…</p>
      </div>
    );
  }
  if (!user) return <Landing />;
  return (
    <AppShell>
      <Dashboard />
    </AppShell>
  );
}

function Dashboard() {
  const { user } = useCurrentUserState();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [name, setName] = useState("");
  const [venue, setVenue] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("AU");
  const [spacing, setSpacing] = useState<"resilience" | "balanced" | "density">("balanced");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [code, setCode] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromQr = params.get("code");
    if (fromQr) setCode(fromQr.toUpperCase());
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    let cancel = false;
    listEvents()
      .then((data) => {
        if (!cancel) setRows(data);
      })
      .catch((err: unknown) => {
        if (!cancel) setError(messageOf(err));
      });
    return () => {
      cancel = true;
    };
  }, [user?.id]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy("create");
    setError("");
    try {
      const { id } = await createEvent({
        data: { name, venue, city, region, spacing, startsOn, endsOn, notes: "" },
      });
      await navigate({ to: "/events/$eventId", params: { eventId: id } });
    } catch (err) {
      setError(messageOf(err));
      setBusy("");
    }
  }

  async function onJoin(e: React.FormEvent) {
    e.preventDefault();
    setBusy("join");
    setError("");
    try {
      const { id } = await joinEvent({ data: { code } });
      await navigate({ to: "/events/$eventId", params: { eventId: id } });
    } catch (err) {
      setError(messageOf(err));
      setBusy("");
    }
  }

  async function onSample() {
    setBusy("sample");
    setError("");
    try {
      const { id } = await createSample();
      await navigate({ to: "/events/$eventId", params: { eventId: id } });
    } catch (err) {
      setError(messageOf(err));
      setBusy("");
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Events</h1>
          <p className="text-sm text-muted">Open a show, or start from a coordinated sample plot.</p>
        </div>
        <button type="button" className={ghostClass} onClick={onSample} disabled={busy !== ""}>
          {busy === "sample" ? "Building sample…" : "Load sample festival"}
        </button>
      </div>
      {error && <Banner tone="bad">{error}</Banner>}
      <div className="grid gap-4 lg:grid-cols-5">
        <form onSubmit={onCreate} className="space-y-3 rounded-xl border border-border bg-surface p-4 lg:col-span-3">
          <h2 className="font-semibold">New coordination</h2>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Event name</span>
            <input className={fieldClass} required value={name} onChange={(e) => setName(e.target.value)} placeholder="Harbour Lights" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Venue</span>
              <input className={fieldClass} value={venue} onChange={(e) => setVenue(e.target.value)} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted">City</span>
              <input className={fieldClass} value={city} onChange={(e) => setCity(e.target.value)} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Region examples</span>
              <select className={fieldClass} value={region} onChange={(e) => setRegion(e.target.value)}>
                {REGIONS.map((r) => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Spacing</span>
              <select className={fieldClass} value={spacing} onChange={(e) => setSpacing(e.target.value as typeof spacing)}>
                {SPACINGS.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Starts</span>
              <input className={fieldClass} type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Ends</span>
              <input className={fieldClass} type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
            </label>
          </div>
          <button className={btnClass} type="submit" disabled={busy !== ""}>
            {busy === "create" ? "Creating…" : "Create event"}
          </button>
        </form>
        <form onSubmit={onJoin} className="space-y-3 rounded-xl border border-border bg-surface p-4 lg:col-span-2">
          <h2 className="font-semibold">Join with a code</h2>
          <p className="text-sm text-muted">Managers share a six-character code. You can request channels; they assign them.</p>
          <input
            className={fieldClass + " font-mono uppercase"}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABC123"
            minLength={4}
            required
          />
          <button className={ghostClass + " w-full"} type="submit" disabled={busy !== ""}>
            {busy === "join" ? "Joining…" : "Join event"}
          </button>
        </form>
      </div>
      <section className="space-y-3">
        <h2 className="font-semibold">Your shows</h2>
        {rows === null ? (
          <p className="text-sm text-muted">Loading events…</p>
        ) : rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-8 text-sm text-muted">
            Nothing here yet. Create an event or load the sample festival.
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-surface-2"
                  onClick={() => navigate({ to: "/events/$eventId", params: { eventId: row.id } })}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{row.name}</span>
                    <span className="block text-sm text-muted">
                      {[row.venue, row.city].filter(Boolean).join(" · ") || "No venue yet"}
                    </span>
                  </span>
                  <span className="font-mono text-sm tabular-nums text-primary">
                    {row.assigned}/{row.total}
                  </span>
                  <span className="text-xs uppercase tracking-wide text-muted">{row.role}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

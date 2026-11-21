import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { EventContext, useEventWork, type Bundle, type EventWork } from "@/lib/event-context";
import { AppShell, Banner, btnClass, fieldClass, ghostClass, messageOf } from "@/components/shell";
import { SpectrumChart } from "@/components/spectrum";
import { intermodHits } from "@/lib/coord";
import { CoverageMap, rangeMetres } from "@/components/coverage";
import {
  CATALOG,
  CATEGORIES,
  PRIORITIES,
  REGIONS,
  SPACINGS,
  categoryLabel,
  formatMhz,
  defaultPower,
  powerOptions,
  type Category,
  type Priority,
  type Spacing,
} from "@/lib/catalog";
import {
  addRequests,
  addScan,
  addZone,
  deleteEvent,
  deleteRequest,
  deleteScan,
  deleteZone,
  getEvent,
  listCustomDevices,
  recalculate,
  setMemberRole,
  enableShare,
  addAntenna,
  deleteAntenna,
  undoCoordinate,
  updateEvent,
  updateRequest,
  submitBatch,
  markTuned,
  setMemberCompany,
  flagLine,
  clearFlag,
  sendBack,
  copyBatch,
  addHold,
  deleteHold,
  addWalkup,
  saveGroup,
  deleteGroup,
  setPlotLock,
  beat,
  updateBatch,
  reviewLine,
  leaveEvent,
  removeMember,
  copyShow,
  makeGuestCode,
  listActivity,
} from "@/lib/pulse.functions";
import QRCode from "qrcode";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/events/$eventId")({ component: EventRoute });
export { useEventWork };
export type { Bundle };



function EventRoute() {
  return (
    <AppShell>
      <EventScreen />
    </AppShell>
  );
}

function EventScreen() {
  const { eventId } = Route.useParams();
  const { user } = useCurrentUserState();
  const navigate = useNavigate();
  const [data, setData] = useState<Bundle | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
    const [custom, setCustom] = useState<Awaited<ReturnType<typeof listCustomDevices>>>([]);
  const [people, setPeople] = useState<{ user_id: string; name: string; editing?: string }[]>([]);
  const [editingId, setEditingId] = useState("");
  const [qr, setQr] = useState("");

  async function reload() {
    const next = await getEvent({ data: { eventId } });
    setData(next);
  }

  useEffect(() => {
    if (!user?.id || !eventId) return;
    const ping = () => void beat({ data: { eventId, editing: editingId } }).then(setPeople).catch(() => undefined);
    ping();
    const timer = window.setInterval(ping, 8000);
    return () => window.clearInterval(timer);
  }, [user?.id, eventId, editingId]);

  useEffect(() => {
    if (!user?.id) return;
    let cancel = false;
    getEvent({ data: { eventId } })
      .then((next) => {
        if (!cancel) setData(next);
      })
      .catch((err: unknown) => {
        if (!cancel) setError(messageOf(err));
      });
    listCustomDevices()
      .then((rows) => {
        if (!cancel) setCustom(rows);
      })
      .catch(() => undefined);
    const poll = window.setInterval(() => {
      void getEvent({ data: { eventId } }).then((next) => { if (!cancel) setData(next); }).catch(() => undefined);
    }, 2000);
    return () => {
      cancel = true;
      window.clearInterval(poll);
    };
  }, [user?.id, eventId]);

  async function run(label: string, action: () => Promise<Bundle | { ok: boolean } | { id: string }>) {
    setBusy(label);
    setError("");
    try {
      const result = await action();
      if (result && "event" in result) setData(result);
      else if (label === "delete") await navigate({ to: "/" });
      else await reload();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy("");
    }
  }

  if (!data && !error) return <p className="text-sm text-muted">Loading the plot…</p>;
  if (!data) return <Banner tone="bad">{error}</Banner>;

  const manager = data.role === "manager";
  const canRequest = data.role !== "viewer";
  const allowed = new Set(data.companyUserIds ?? []);
  if (user?.id) allowed.add(user.id);
  const visible = manager
    ? data
    : { ...data, requests: data.requests.filter((r) => allowed.has(r.created_by)), intermods: [] as Bundle["intermods"] };
  const pages = [
    { to: "/events/$eventId/requests" as const, label: "Requests", show: true },
    { to: "/events/$eventId/coordinate" as const, label: "Coordinate", show: manager },
    { to: "/events/$eventId/areas" as const, label: "Areas", show: true },
    { to: "/events/$eventId/scans" as const, label: "Scans", show: manager },
    { to: "/events/$eventId/antennas" as const, label: "Antennas", show: false },
    { to: "/events/$eventId/sheet" as const, label: "Sheet", show: true },
    { to: "/events/$eventId/reports" as const, label: "Reports", show: manager },
    { to: "/events/$eventId/settings" as const, label: "Settings", show: manager },
  ].filter((page) => page.show);
  
  const open = data.requests.filter((r) => r.assigned_mhz == null).length;
  const bad = data.issues.filter((i) => i.severity === "bad").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">{data.role}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{data.event.name}</h1>
          <p className="text-sm text-muted">
            {[data.event.venue, data.event.city].filter(Boolean).join(" · ") || "Venue not set"}
            {data.event.starts_on ? ` · ${data.event.starts_on}` : ""}
          </p>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2">
          <code className="rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm text-primary">
            {data.event.join_code}
          </code>
          <button
            type="button"
            className={ghostClass}
            onClick={() => navigator.clipboard?.writeText(data.event.join_code)}
          >
            Copy code
          </button>
          <button
            type="button"
            className={ghostClass}
            onClick={() => {
              const url = `${window.location.origin}/?code=${data.event.join_code}`;
              void QRCode.toDataURL(url).then(setQr);
            }}
          >
            QR
          </button>
          {manager && (
            <>
              <button
                type="button"
                className={ghostClass}
                disabled={busy !== ""}
                onClick={() => run("undo", () => undoCoordinate({ data: { eventId } }))}
              >
                {busy === "undo" ? "Restoring…" : "Undo"}
              </button>
              <button
                type="button"
                className={btnClass}
                disabled={busy !== ""}
                onClick={() => run("calc", () => recalculate({ data: { eventId } }))}
              >
                {busy === "calc" ? "Coordinating…" : "Coordinate"}
              </button>
            </>
          )}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Channels" value={`${data.requests.length - open}/${data.requests.length}`} />
        <Stat label="Conflicts" value={String(bad)} warn={bad > 0} />
        <Stat label="Spacing" value={data.event.spacing} />
      </div>
      {people.length > 0 && (
        <p className="text-xs text-muted">
          {people.map((p) => p.name + (p.editing ? " is editing" : "")).join(", ")}
        </p>
      )}
      {qr && <img src={qr} alt="Join QR" className="h-36 w-36 rounded-lg bg-white p-2" />}
      {error && <Banner tone="bad">{error}</Banner>}
      <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
        <nav className="no-print flex gap-1 overflow-x-auto lg:flex-col">
          {pages.map((page) => (
            <Link
              key={page.to}
              to={page.to}
              params={{ eventId }}
              className="rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface hover:text-fg"
              activeProps={{ className: "rounded-lg bg-primary px-3 py-2 text-sm text-primary-fg" }}
            >
              {page.label}
            </Link>
          ))}
        </nav>
        <EventContext.Provider value={{ data, visible, custom, manager, canRequest, busy, run, eventId, onEdit: setEditingId }}>
          <Outlet />
        </EventContext.Provider>
      </div>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className={"font-mono text-lg tabular-nums " + (warn ? "text-bad" : "text-fg")}>{value}</p>
    </div>
  );
}

export function Coordinate({
  data,
  manager,
  busy,
  run,
  eventId,
}: {
  data: Bundle;
  manager: boolean;
  busy: string;
  run: (label: string, action: () => Promise<Bundle | { ok: boolean } | { id: string }>) => Promise<void>;
  eventId: string;
}) {
  const [layout, setLayout] = useState<"tabs" | "page">(() => (typeof window === "undefined" ? "tabs" : (localStorage.getItem("pulse-layout") as "tabs" | "page") || "tabs"));
  const [section, setSection] = useState<"plot" | "conflicts" | "antenna" | "scans" | "sheet">("plot");
  const [seen, setSeen] = useState(data.requests.length + data.requests.filter((r) => r.flag_reason).length);
  useEffect(() => {
    const next = data.requests.length + data.requests.filter((r) => r.flag_reason).length;
    if (manager && next > seen) {
      try { void new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=").play(); } catch { /* ignore */ }
    }
    setSeen(next);
  }, [data.requests, manager, seen]);
  function choose(next: "tabs" | "page") {
    setLayout(next);
    localStorage.setItem("pulse-layout", next);
  }
  const plot = <Plot data={data} manager={manager} busy={busy} run={run} />;
  const conflicts = (
    <div className="space-y-3">
      {data.intermods.length === 0 && <p className="text-sm text-muted">No intermod hits on assigned carriers.</p>}
      {data.intermods.map((hit) => (
        <p key={`${hit.order}-${hit.formula}`} className="text-sm">
          <span className="font-mono text-primary">{hit.order}</span> {hit.formula} → {formatMhz(hit.product)} hits {hit.hits}
          <span className="ml-2 text-xs uppercase">{hit.severity} · {hit.powerMw} mW</span>
        </p>
      ))}
      {data.issues.map((issue, i) => <p key={i} className="text-sm text-bad">{issue.message}</p>)}
    </div>
  );
  if (!manager) return plot;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={ghostClass} onClick={() => choose(layout === "tabs" ? "page" : "tabs")}>
          {layout === "tabs" ? "One page" : "Tabs"}
        </button>
        <button type="button" className={ghostClass} onClick={() => run("lock", () => setPlotLock({ data: { eventId, locked: !data.event.plot_locked } }))}>
          {data.event.plot_locked ? "Unlock plot" : "Lock plot"}
        </button>
      </div>
      {layout === "tabs" && (
        <div className="flex gap-1 overflow-x-auto">
          {(["plot", "conflicts", "antenna", "scans", "sheet"] as const).map((id) => (
            <button key={id} type="button" onClick={() => setSection(id)} className={"h-9 rounded-full px-3 text-sm " + (section === id ? "bg-primary text-primary-fg" : "border border-border text-muted")}>{id}</button>
          ))}
        </div>
      )}
      {(layout === "page" || section === "plot") && plot}
      {(layout === "page" || section === "conflicts") && conflicts}
      {(layout === "page" || section === "antenna") && <Antennas data={data} manager={manager} busy={busy} run={run} />}
      {(layout === "page" || section === "scans") && <Scans data={data} canRequest={manager} manager={manager} busy={busy} run={run} />}
      {(layout === "page" || section === "sheet") && <Sheet data={data} />}
      <Holds data={data} busy={busy} run={run} />
    </div>
  );
}

function Holds({ data, busy, run }: { data: Bundle; busy: string; run: (label: string, action: () => Promise<Bundle | { ok: boolean } | { id: string }>) => Promise<void> }) {
  const [mhz, setMhz] = useState("");
  const [label, setLabel] = useState("Hold");
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h3 className="font-medium">Holds and walk-ups</h3>
      <ul className="mt-2 space-y-1 text-sm">
        {data.holds.map((h) => (
          <li key={h.id} className="flex justify-between">
            <span>{h.label} · {formatMhz(h.mhz)}</span>
            <button type="button" className="text-xs text-bad" onClick={() => run("hold", () => deleteHold({ data: { eventId: data.event.id, holdId: h.id } }))}>Release</button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <input className={fieldClass + " max-w-28"} value={mhz} onChange={(e) => setMhz(e.target.value)} placeholder="MHz" />
        <input className={fieldClass + " max-w-32"} value={label} onChange={(e) => setLabel(e.target.value)} />
        <button type="button" className={ghostClass} disabled={busy !== ""} onClick={() => run("hold", () => addHold({ data: { eventId: data.event.id, zoneId: data.zones[0]?.id ?? "", mhz: Number(mhz), label } }))}>Hold</button>
        <button type="button" className={ghostClass} disabled={busy !== ""} onClick={() => run("walk", () => addWalkup({ data: { eventId: data.event.id, zoneId: data.zones[0]?.id ?? "", label: label || "Walk-up", mhz: Number(mhz) } }))}>Walk-up</button>
      </div>
    </div>
  );
}

export function RequestTree({ data }: { data: Bundle }) {
  return (
    <div className="max-h-[420px] overflow-auto rounded-xl border border-border bg-surface text-sm">
      {data.zones.map((zone) => {
        const inZone = data.requests.filter((r) => r.zone_id === zone.id);
        if (inZone.length === 0) return null;
        const companies = [...new Set(inZone.map((r) => data.members.find((m) => m.user_id === r.created_by)?.company || "No company"))];
        return (
          <div key={zone.id} className="border-b border-border">
            <p className="bg-bg px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted">{zone.name}</p>
            {companies.map((company) => {
              const lines = inZone.filter((r) => (data.members.find((m) => m.user_id === r.created_by)?.company || "No company") === company);
              const batches = [...new Set(lines.map((r) => r.batch_id).filter(Boolean))] as string[];
              return (
                <div key={company} className="px-3 py-2">
                  <p className="font-medium">{company}</p>
                  {batches.map((id) => {
                    const batch = data.batches.find((b) => b.id === id);
                    const group = lines.filter((r) => r.batch_id === id);
                    return (
                      <div key={id} className="mt-1 pl-3">
                        <p className="text-xs text-muted">Request · {batch?.title ?? "Untitled"}</p>
                        {group.map((r) => (
                          <p key={r.id} className="flex justify-between gap-3 py-0.5">
                            <span><span className={"mr-2 inline-block size-2 rounded-full " + (r.tuned_at ? "bg-ok" : r.assigned_mhz ? "bg-primary" : "bg-muted")} />{r.label}</span>
                            <span className={r.assigned_mhz ? "text-ok" : "text-muted"}>{r.assigned_mhz ? `${formatMhz(r.assigned_mhz)} allowed` : "waiting"}</span>
                          </p>
                        ))}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function Plot({
  data,
  manager,
  busy,
  run,
}: {
  data: Bundle;
  manager: boolean;
  busy: string;
  run: (label: string, action: () => Promise<Bundle>) => Promise<void>;
}) {
  const [showIm, setShowIm] = useState(false);
  const strips = useMemo(() => bands(data), [data]);
  const carriers = data.requests
    .filter((r) => r.assigned_mhz != null)
    .map((r) => ({ id: r.id, label: r.label, mhz: r.assigned_mhz as number, category: r.category }));
  const marks = data.scans.flatMap((s) => s.marks);
  const lo = Math.min(
    470,
    ...carriers.map((c) => c.mhz),
    ...data.requests.map((r) => r.band_min),
  );
  const hi = Math.max(
    694,
    ...carriers.map((c) => c.mhz),
    ...data.requests.map((r) => r.band_max),
  );
  return (
    <div className="space-y-4">
      <RequestTree data={data} />
      {carriers.length > 0 && (
        <div>
          <div className="mb-2 flex justify-end">
            <button type="button" className={ghostClass} onClick={() => setShowIm((v) => !v)}>{showIm ? "Hide intermod" : "Show intermod"}</button>
          </div>
          <SpectrumChart carriers={carriers} marks={marks} min={Math.floor(lo)} max={Math.ceil(hi)} intermods={showIm ? intermodHits(carriers.map((c) => ({ id: c.id, label: c.label, mhz: c.mhz, powerMw: 10 }))).map((h) => ({ mhz: h.product, order: h.order })) : []} />
        </div>
      )}
      <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
        <p className="text-sm text-muted">
          Radio mics only land on 0.005 MHz steps. 470.387 is not tuneable — it has to be 470.385 or 470.390.
          {data.event.region === "AU"
            ? " Australia keeps wireless audio above 520 MHz and below 694 MHz, even when the radio can tune lower."
            : ""}
        </p>
        {strips.length === 0 ? (
          <p className="text-sm text-muted">Assigned carriers show up here as marks on the band.</p>
        ) : (
          strips.map((strip) => (
            <div key={strip.title}>
              <div className="mb-1 flex justify-between text-xs text-muted">
                <span>{strip.title}</span>
                <span className="font-mono tabular-nums">
                  {formatMhz(strip.min)} – {formatMhz(strip.max)}
                </span>
              </div>
              <div className="relative h-12 rounded-md bg-surface-2">
                {strip.marks.map((mark) => (
                  <span
                    key={mark.id}
                    title={`${mark.label} ${formatMhz(mark.mhz)}`}
                    className="absolute top-1 bottom-1 w-0.5 bg-primary"
                    style={{ left: `${mark.left}%` }}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
      {data.issues.length > 0 && (
        <div className="rounded-xl border border-bad/40 bg-bad/5 p-4">
          <h2 className="font-semibold">Why this plot is not clean</h2>
          <ul className="mt-2 space-y-2">
            {data.issues.map((issue, i) => (
              <li key={i} className={"text-sm " + (issue.severity === "bad" ? "text-bad" : "text-muted")}>
                <span className="font-medium">{labelFor(data, issue.ids)}</span> — {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-surface text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Channel</th>
              <th className="px-3 py-2 font-medium">Device</th>
              <th className="px-3 py-2 font-medium">Zone</th>
              <th className="px-3 py-2 font-medium">When</th>
              <th className="px-3 py-2 font-medium">MHz</th>
              <th className="px-3 py-2 font-medium">Tuned</th>
              {manager && <th className="px-3 py-2 font-medium">Lock</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-bg">
            {data.requests.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-muted">
                  No requests yet. Add mics, cameras, lighting, or comms.
                </td>
              </tr>
            )}
            {data.requests.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2">
                  <span className="block font-medium">{r.label}</span>
                  <span className="text-xs uppercase text-muted">{categoryLabel(r.category)} · {r.priority}</span>
                </td>
                <td className="px-3 py-2 text-muted">{r.device_name}</td>
                <td className="px-3 py-2">{data.zones.find((z) => z.id === r.zone_id)?.name ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-xs tabular-nums text-muted">
                  {r.time_start && r.time_end ? `${r.time_start}–${r.time_end}` : "All day"}
                </td>
                <td className="px-3 py-2 font-mono tabular-nums text-primary">
                  {formatMhz(r.assigned_mhz)}
                  {r.spare ? <span className="ml-2 text-xs text-muted">spare</span> : null}
                </td>
                <td className="px-3 py-2">
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={Boolean(r.tuned_at)}
                      disabled={busy !== "" || r.assigned_mhz == null}
                      onChange={(e) =>
                        void run("tune", () =>
                          markTuned({ data: { eventId: data.event.id, requestId: r.id, tuned: e.target.checked } }),
                        )
                      }
                    />
                    {r.tuned_at ? "Tuned" : "Not tuned"}
                  </label>
                </td>
                                <td className="px-3 py-2 text-xs">
                  {r.flag_reason ? (
                    <span>
                      <s>{r.flagged_mhz ? formatMhz(r.flagged_mhz) : ""}</s> {r.flag_reason}
                      {manager && <button type="button" className="ml-2 underline" onClick={() => run("flag", () => clearFlag({ data: { eventId: data.event.id, requestId: r.id } }))}>Clear</button>}
                    </span>
                  ) : (
                    <select
                      className={fieldClass}
                      defaultValue=""
                      onChange={(e) => {
                        if (!e.target.value) return;
                        void run("flag", () => flagLine({ data: { eventId: data.event.id, requestId: r.id, reason: e.target.value as "interference" | "pack failed" | "spare now live" } }));
                      }}
                    >
                      <option value="">Flag</option>
                      <option value="interference">Interference</option>
                      <option value="pack failed">Pack failed</option>
                      <option value="spare now live">Spare now live</option>
                    </select>
                  )}
                </td>
                {manager && (
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="text-xs text-muted underline-offset-2 hover:underline"
                        disabled={busy !== ""}
                        onClick={() => {
                          const raw = window.prompt(
                            "Frequency in MHz (0.005 steps), or blank to unlock",
                            r.assigned_mhz?.toString() ?? "",
                          );
                          if (raw == null) return;
                          const trimmed = raw.trim();
                          const assigned = trimmed === "" ? null : Number(trimmed);
                          if (assigned != null && !Number.isFinite(assigned)) return;
                          void run("lock", () =>
                            updateRequest({
                              data: {
                                eventId: data.event.id,
                                requestId: r.id,
                                locked: assigned != null,
                                assigned,
                                priority: r.priority as Priority,
                                zoneId: r.zone_id ?? data.zones[0]?.id ?? "",
                              },
                            }),
                          );
                        }}
                      >
                        {r.locked ? "Edit lock" : "Set"}
                      </button>
                      <button
                        type="button"
                        className="text-xs text-bad underline-offset-2 hover:underline"
                        onClick={() =>
                          run("del", () => deleteRequest({ data: { eventId: data.event.id, requestId: r.id } }))
                        }
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {manager && data.intermods.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <h3 className="font-medium">Intermod 2 / 3 / 5</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {data.intermods.map((hit) => (
              <li key={`${hit.order}-${hit.formula}`}>
                <span className="font-mono text-primary">{hit.order}</span> {hit.formula} → {formatMhz(hit.product)} hits {hit.hits}
                <span className="ml-2 text-xs uppercase">{hit.severity} · {hit.powerMw} mW · ±{hit.guardMhz} MHz</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.activity.length > 0 && (
        <ul className="space-y-1 text-sm text-muted">
          {data.activity.map((a) => (
            <li key={a.id}>
              <span className="text-fg">{a.name ?? "Someone"}</span> {a.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MyRequests({
  data,
  custom,
  canRequest,
  busy,
  run,
  onEdit,
}: {
  data: Bundle;
  custom: Awaited<ReturnType<typeof listCustomDevices>>;
  canRequest: boolean;
  busy: string;
  run: (label: string, action: () => Promise<Bundle | { ok: boolean } | { id: string }>) => Promise<void>;
  onEdit?: (batchId: string) => void;
}) {
  const devices = useMemo(
    () => CATALOG.map((d) => ({ ...d, bandMin: d.bandMin, bandMax: d.bandMax, mode: d.mode })),
    [],
  );
  void custom;
  const makers = useMemo(() => [...new Set(devices.map((d) => d.manufacturer))].sort(), [devices]);
  const [zoneId, setZoneId] = useState(data.zones[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [maker, setMaker] = useState(makers[0] ?? "");
  const series = useMemo(() => [...new Set(devices.filter((d) => d.manufacturer === maker).map((d) => d.series))], [devices, maker]);
  const [make, setMake] = useState(series[0] ?? "");
  const bands = useMemo(() => devices.filter((d) => d.manufacturer === maker && d.series === make), [devices, maker, make]);
  const [band, setBand] = useState(bands[0]?.key ?? "");
  const [label, setLabel] = useState("");
  const [spare, setSpare] = useState(false);
  const [qty, setQty] = useState(1);
  const [power, setPower] = useState(10);
  const [showIm, setShowIm] = useState(false);
  const [preferred, setPreferred] = useState("");
  const [lines, setLines] = useState<{ id?: string; label: string; spare: boolean; deviceKey: string; deviceName: string; manufacturer: string; bandMin: number; bandMax: number; bandwidth: number; mode: "carrier" | "band"; category: string; powerMw?: number; preferred?: number }[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const device = bands.find((d) => d.key === band) ?? bands[0];

  function addLine() {
    if (!device || !label.trim()) return;
    const count = Math.max(1, Math.min(8, qty));
    const made = Array.from({ length: count }, (_, i) => ({
      label: count === 1 ? label.trim() : `${label.trim()} ${i + 1}`,
      spare,
      deviceKey: device.key,
      deviceName: device.name,
      manufacturer: device.manufacturer,
      bandMin: device.bandMin,
      bandMax: device.bandMax,
      bandwidth: device.bandwidth,
      mode: device.mode === "band" ? "band" as const : "carrier" as const,
      category: device.category,
      powerMw: power,
      preferred: preferred ? Number(preferred) : undefined,
    }));
    setLines((cur) => [...cur, ...made]);
    setLabel("");
    setSpare(false);
    setQty(1);
  }

  if (!canRequest) return <p className="text-sm text-muted">Viewers can read the plot but not submit requests.</p>;
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface p-4">
        <h2 className="font-semibold">My requests</h2>
        <p className="mt-1 text-sm text-muted">One submission, many devices, one zone. Only your company sees these until a manager coordinates.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Title
            <input className={fieldClass + " mt-1"} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Main stage vocals" />
          </label>
          <label className="text-sm">Zone
            <select className={fieldClass + " mt-1"} value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
              {data.zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
          </label>
          <label className="text-sm">Manufacturer
            <select className={fieldClass + " mt-1"} value={maker} onChange={(e) => { setMaker(e.target.value); setMake(""); setBand(""); }}>
              {makers.map((m) => <option key={m}>{m}</option>)}
            </select>
          </label>
          <label className="text-sm">Make
            <select className={fieldClass + " mt-1"} value={make} onChange={(e) => { setMake(e.target.value); setBand(""); }}>
              {series.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label className="text-sm">Band
            <select className={fieldClass + " mt-1"} value={band} onChange={(e) => { setBand(e.target.value); const next = devices.find((d) => d.key === e.target.value); if (next) setPower(defaultPower(next.power)); }}>
              {bands.map((d) => <option key={d.key} value={d.key}>{d.band || d.name}</option>)}
            </select>
          </label>
          <label className="text-sm">Channel
            <input className={fieldClass + " mt-1"} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Lead vocal" />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={spare} onChange={(e) => setSpare(e.target.checked)} /> Spare
          </label>
          <label>Qty
            <input className={fieldClass + " ml-2 w-16"} type="number" min={1} max={8} value={qty} onChange={(e) => setQty(Number(e.target.value) || 1)} />
          </label>
          <div>Power options
            <div className="mt-1 flex flex-wrap gap-1">
              {(device ? powerOptions(device.power) : [10]).map((mw) => (
                <button key={mw} type="button" onClick={() => setPower(mw)} className={"rounded-full px-3 py-1 text-xs " + (power === mw ? "bg-primary text-primary-fg" : "border border-border")}>{mw} mW</button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button type="button" className={ghostClass} onClick={addLine}>Add line</button>
          <button
            type="button"
            className={btnClass}
            disabled={busy !== "" || lines.length === 0 || !title.trim()}
            onClick={() =>
              void run("batch", async () => {
                const next = await submitBatch({ data: { eventId: data.event.id, zoneId, title: title.trim(), lines } });
                setLines([]);
                setTitle("");
                return next;
              })
            }
          >
            {busy === "batch" ? "Submitting…" : `Submit ${lines.length || ""}`.trim()}
          </button>
        </div>
        {lines.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">
            {lines.map((line, i) => (
              <li key={`${line.label}-${i}`} className="flex justify-between gap-3">
                <span>{line.label} · {line.deviceName}{line.spare ? " · spare" : ""}</span>
                <button type="button" className="text-xs text-bad" onClick={() => setLines((cur) => cur.filter((_, n) => n !== i))}>Remove</button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="space-y-3">
        {data.zones.map((zone) => {
          const batches = data.batches.filter((b) => b.zone_id === zone.id && data.requests.some((r) => r.batch_id === b.id));
          if (batches.length === 0) return null;
          return (
            <section key={zone.id} className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{zone.name}</h3>
              {batches.map((b) => (
          <div key={b.id} className="rounded-xl border border-border bg-surface p-3 text-sm">
            <div className="flex justify-between gap-3">
              <span className="font-medium">Request · {b.title}</span>
              <span className="text-muted">{b.status}{b.return_note ? ` · ${b.return_note}` : ""}</span>
            </div>
            <ul className="mt-2 space-y-1 text-muted">
              {data.requests.filter((r) => r.batch_id === b.id).map((r) => (
                <li key={r.id}>{r.label} · {r.assigned_mhz ? formatMhz(r.assigned_mhz) : "waiting"}{r.spare ? " · spare" : ""}{r.tuned_at ? " · tuned" : ""}</li>
              ))}
            </ul>
            <div className="mt-2 flex gap-2">
              <button type="button" className="text-xs underline" onClick={() => { setEditing(b.id); onEdit?.(b.id); }}>Edit</button>
              <button type="button" className="text-xs underline" onClick={() => { const zone = window.prompt("Area id", data.zones[0]?.id ?? ""); if (zone) void run("copy", () => copyBatch({ data: { eventId: data.event.id, batchId: b.id, zoneId: zone } })); }}>Copy</button>
            </div>
            {editing === b.id && (
              <BatchEditor
                data={data}
                batchId={b.id}
                busy={busy}
                onClose={() => { setEditing(null); onEdit?.(""); }}
                run={run}
              />
            )}
          </div>
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function BatchEditor({
  data,
  batchId,
  busy,
  onClose,
  run,
}: {
  data: Bundle;
  batchId: string;
  busy: string;
  onClose: () => void;
  run: (label: string, action: () => Promise<Bundle | { ok: boolean } | { id: string }>) => Promise<void>;
}) {
  const batch = data.batches.find((b) => b.id === batchId);
  const existing = data.requests.filter((r) => r.batch_id === batchId);
  const [title, setTitle] = useState(batch?.title ?? "");
  const [notes, setNotes] = useState(batch?.notes ?? "");
  const [lines, setLines] = useState(existing.map((r) => ({
    id: r.id,
    label: r.label,
    deviceKey: r.device_key,
    deviceName: r.device_name,
    manufacturer: r.manufacturer,
    bandMin: r.band_min,
    bandMax: r.band_max,
    bandwidth: r.bandwidth,
    mode: r.mode === "band" ? "band" as const : "carrier" as const,
    category: r.category,
    spare: r.spare,
    notes: r.notes,
    powerMw: r.power_mw ?? 10,
  })));
  if (!batch) return null;
  return (
    <div className="mt-3 space-y-2 rounded-lg border border-border p-3">
      <input className={fieldClass} value={title} onChange={(e) => setTitle(e.target.value)} />
      <input className={fieldClass} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" />
      {lines.map((line, i) => (
        <div key={line.id ?? i} className="flex gap-2">
          <input className={fieldClass} value={line.label} onChange={(e) => setLines((cur) => cur.map((l, n) => n === i ? { ...l, label: e.target.value } : l))} />
          <button type="button" className="text-xs text-bad" onClick={() => setLines((cur) => cur.filter((_, n) => n !== i))}>Remove</button>
        </div>
      ))}
      <div className="flex gap-2">
        <button
          type="button"
          className={btnClass}
          disabled={busy !== ""}
          onClick={() => void run("edit", () => updateBatch({ data: { eventId: data.event.id, batchId, title, notes, lines } })).then(onClose)}
        >
          Save. Changed lines lose their frequency.
        </button>
        <button type="button" className={ghostClass} onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

function RequestForm({
  data,
  custom,
  canRequest,
  busy,
  run,
}: {
  data: Bundle;
  custom: Awaited<ReturnType<typeof listCustomDevices>>;
  canRequest: boolean;
  busy: string;
  run: (label: string, action: () => Promise<Bundle>) => Promise<void>;
}) {
  const [category, setCategory] = useState<Category>("audio");
  const catalog = CATALOG.filter((d) => d.category === category);
  const manufacturers = [...new Set(catalog.map((d) => d.manufacturer))].sort();
  const [manufacturer, setManufacturer] = useState(manufacturers[0] ?? "");
  const seriesList = [...new Set(catalog.filter((d) => d.manufacturer === manufacturer).map((d) => d.series))].sort();
  const [series, setSeries] = useState(seriesList[0] ?? "");
  const bandDevices = catalog.filter((d) => d.manufacturer === manufacturer && d.series === series);
  const customDevices = custom.filter((d) => d.category === category);
  const [deviceKey, setDeviceKey] = useState(bandDevices[0]?.key ?? "");
  const [label, setLabel] = useState("");
  const [zoneId, setZoneId] = useState(data.zones[0]?.id ?? "");
  const [priority, setPriority] = useState<Priority>("normal");
  const [qty, setQty] = useState(1);
  const [timeStart, setTimeStart] = useState("");
  const [timeEnd, setTimeEnd] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const mfrs = [...new Set(CATALOG.filter((d) => d.category === category).map((d) => d.manufacturer))].sort();
    setManufacturer(mfrs[0] ?? "");
  }, [category]);

  useEffect(() => {
    const seriesOpts = [...new Set(CATALOG.filter((d) => d.category === category && d.manufacturer === manufacturer).map((d) => d.series))].sort();
    setSeries(seriesOpts[0] ?? "");
  }, [category, manufacturer]);

  useEffect(() => {
    const bands = CATALOG.filter((d) => d.category === category && d.manufacturer === manufacturer && d.series === series);
    setDeviceKey(bands[0]?.key ?? "");
  }, [category, manufacturer, series]);

  if (!canRequest) return <p className="text-sm text-muted">Viewers can read the plot but not request channels.</p>;

  return (
    <form
      className="grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        void run("add", () =>
          addRequests({
            data: {
              eventId: data.event.id,
              category,
              deviceKey,
              label,
              zoneId,
              priority,
              qty,
              timeStart,
              timeEnd,
              notes,
            },
          }),
        );
      }}
    >
      <h2 className="font-semibold sm:col-span-2">Request channels</h2>
      <label className="text-sm">
        <span className="mb-1 block text-muted">Department</span>
        <select
          className={fieldClass}
          value={category}
          onChange={(e) => setCategory(e.target.value as Category)}
        >
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-muted">Manufacturer</span>
        <select className={fieldClass} value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} required>
          {manufacturers.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-muted">Make</span>
        <select className={fieldClass} value={series} onChange={(e) => setSeries(e.target.value)} required>
          {seriesList.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </label>
      <label className="text-sm sm:col-span-2">
        <span className="mb-1 block text-muted">Band</span>
        <select className={fieldClass} value={deviceKey} onChange={(e) => setDeviceKey(e.target.value)} required>
          {bandDevices.map((d) => (
            <option key={d.key} value={d.key}>{d.band} · {d.bandMin}–{d.bandMax} MHz</option>
          ))}
          {customDevices.map((d) => (
            <option key={`custom:${d.id}`} value={`custom:${d.id}`}>{d.name} (custom)</option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-muted">Label</span>
        <input className={fieldClass} required value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Lead vocal" />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-muted">Zone</span>
        <select className={fieldClass} value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
          {data.zones.map((z) => (
            <option key={z.id} value={z.id}>{z.name}{z.isolated ? " · isolated" : " · shared"}</option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-muted">Priority</span>
        <select className={fieldClass} value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
          {PRIORITIES.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-muted">Quantity</span>
        <input className={fieldClass} type="number" min={1} max={8} value={qty} onChange={(e) => setQty(Number(e.target.value))} />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-muted">From</span>
        <input className={fieldClass} type="time" value={timeStart} onChange={(e) => setTimeStart(e.target.value)} />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-muted">Until</span>
        <input className={fieldClass} type="time" value={timeEnd} onChange={(e) => setTimeEnd(e.target.value)} />
      </label>
      <label className="text-sm sm:col-span-2">
        <span className="mb-1 block text-muted">Notes</span>
        <input className={fieldClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <button className={btnClass} disabled={busy !== ""} type="submit">
        {busy === "add" ? "Adding…" : "Add to plot"}
      </button>
    </form>
  );
}

export function Zones({
  data,
  manager,
  busy,
  run,
}: {
  data: Bundle;
  manager: boolean;
  busy: string;
  run: (label: string, action: () => Promise<Bundle | { ok: boolean } | { id: string }>) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [isolated, setIsolated] = useState(true);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Isolated rooms can reuse a frequency. Shared zones, including site-wide comms, stay clear of everyone who is on at the same time.
      </p>
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
        {data.zones.map((z) => (
          <li key={z.id} className="flex items-center gap-3 px-4 py-3">
            <span className="flex-1 font-medium">{z.name}</span>
            <span className="text-sm text-muted">{z.isolated ? "Isolated" : "Shared"}</span>
            {manager && (
              <button
                type="button"
                className="text-sm text-bad"
                disabled={busy !== ""}
                onClick={() => run("zone", () => deleteZone({ data: { eventId: data.event.id, zoneId: z.id } }))}
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      {manager && (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run("zone", () => addZone({ data: { eventId: data.event.id, name, isolated } })).then(() => setName(""));
          }}
        >
          <label className="text-sm">
            <span className="mb-1 block text-muted">New zone</span>
            <input className={fieldClass} required value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="flex h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={isolated} onChange={(e) => setIsolated(e.target.checked)} />
            Isolated room
          </label>
          <button className={btnClass} type="submit" disabled={busy !== ""}>Add zone</button>
        </form>
      )}
      {manager && <Groups data={data} busy={busy} run={run} />}
    </div>
  );
}

function Groups({ data, busy, run }: { data: Bundle; busy: string; run: (label: string, action: () => Promise<Bundle | { ok: boolean } | { id: string }>) => Promise<void> }) {
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h3 className="font-medium">Groups</h3>
      <p className="mt-1 text-sm text-muted">Areas in the same group are coordinated together. Ungrouped areas can reuse a frequency.</p>
      <ul className="mt-2 space-y-1 text-sm">
        {data.groups.map((g) => (
          <li key={g.id} className="flex justify-between gap-3">
            <span>{g.name}: {g.zoneIds.map((id) => data.zones.find((z) => z.id === id)?.name ?? id).join(", ")}</span>
            <button type="button" className="text-xs text-bad" onClick={() => run("group", () => deleteGroup({ data: { eventId: data.event.id, groupId: g.id } }))}>Remove</button>
          </li>
        ))}
      </ul>
      <div className="mt-3 space-y-2">
        <input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Stage cluster" />
        <div className="flex flex-wrap gap-2 text-sm">
          {data.zones.map((z) => (
            <label key={z.id} className="flex items-center gap-1">
              <input type="checkbox" checked={picked.includes(z.id)} onChange={(e) => setPicked((cur) => e.target.checked ? [...cur, z.id] : cur.filter((id) => id !== z.id))} />
              {z.name}
            </label>
          ))}
        </div>
        <button type="button" className={btnClass} disabled={busy !== "" || !name.trim() || picked.length === 0} onClick={() => run("group", () => saveGroup({ data: { eventId: data.event.id, name: name.trim(), zoneIds: picked } }))}>Save group</button>
      </div>
    </div>
  );
}

export function Scans({
  data,
  canRequest,
  manager,
  busy,
  run,
}: {
  data: Bundle;
  canRequest: boolean;
  manager: boolean;
  busy: string;
  run: (label: string, action: () => Promise<Bundle>) => Promise<void>;
}) {
  const [label, setLabel] = useState("Walk-in scan");
  const [body, setBody] = useState("520.000,-48\n548.250,-55");
  const [threshold, setThreshold] = useState("-70");
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Paste a scan, or upload a CSV, Wireless Workbench, or WSM text export. Hits at or above the threshold become keep-outs.
      </p>
      <input
        type="file"
        accept=".csv,.txt,.wsm,.sdb,.xml"
        className="text-sm"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          void file.text().then((body) => { setBody(body); setLabel(file.name); });
        }}
      />
      <ul className="space-y-2">
        {data.scans.map((s) => (
          <li key={s.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3">
            <span className="flex-1">
              <span className="font-medium">{s.label}</span>
              <span className="ml-2 text-sm text-muted">{s.hits} hits · {s.threshold} dB</span>
            </span>
            {manager && (
              <button
                type="button"
                className="text-sm text-bad"
                onClick={() => run("scan", () => deleteScan({ data: { eventId: data.event.id, scanId: s.id } }))}
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      {canRequest && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run("scan", () =>
              addScan({
                data: {
                  eventId: data.event.id,
                  label,
                  body,
                  threshold: Number(threshold),
                },
              }),
            );
          }}
        >
          <input className={fieldClass} value={label} onChange={(e) => setLabel(e.target.value)} required />
          <input
            type="file"
            accept=".csv,.txt,.tsv"
            className="text-sm text-muted"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              void file.text().then((t) => setBody(t));
            }}
          />
          <textarea
            className={fieldClass + " h-36 py-2 font-mono"}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={"520.000,-62\n548.250,-55\n\nAlso accepts Shure WWB and Sennheiser WSM exports."}
            required
          />
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Threshold (dB, higher is busier)</span>
            <input className={fieldClass} value={threshold} onChange={(e) => setThreshold(e.target.value)} />
          </label>
          <button className={btnClass} type="submit" disabled={busy !== ""}>Import scan</button>
        </form>
      )}
    </div>
  );
}

export function Settings({
  data,
  manager,
  busy,
  run,
}: {
  data: Bundle;
  manager: boolean;
  busy: string;
  run: (label: string, action: () => Promise<Bundle | { ok: boolean }>) => Promise<void>;
}) {
  const [name, setName] = useState(data.event.name);
  const [venue, setVenue] = useState(data.event.venue);
  const [city, setCity] = useState(data.event.city);
  const [region, setRegion] = useState(data.event.region);
  const [spacing, setSpacing] = useState<Spacing>(
    data.event.spacing === "resilience" || data.event.spacing === "density" ? data.event.spacing : "balanced",
  );
  const [startsOn, setStartsOn] = useState(data.event.starts_on);
  const [endsOn, setEndsOn] = useState(data.event.ends_on);
  const [notes, setNotes] = useState(data.event.notes);
  const [joinRole, setJoinRole] = useState<"contributor" | "viewer">(
    data.event.join_role === "viewer" ? "viewer" : "contributor",
  );
  const [blockers, setBlockers] = useState(data.event.blockers);
  const [bMin, setBMin] = useState("");
  const [bMax, setBMax] = useState("");
  const [bLabel, setBLabel] = useState("");

  if (!manager) {
    return (
      <div className="space-y-2 text-sm">
        <p>{data.event.notes || "No notes."}</p>
        <p className="text-muted">{data.members.length} people on this event.</p>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void run("save", () =>
          updateEvent({
            data: {
              eventId: data.event.id,
              name,
              venue,
              city,
              region,
              spacing,
              startsOn,
              endsOn,
              notes,
              joinRole,
              blockers,
            },
          }),
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-muted">Name</span>
          <input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted">Venue</span>
          <input className={fieldClass} value={venue} onChange={(e) => setVenue(e.target.value)} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted">City</span>
          <input className={fieldClass} value={city} onChange={(e) => setCity(e.target.value)} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted">Spacing</span>
          <select className={fieldClass} value={spacing} onChange={(e) => setSpacing(e.target.value as Spacing)}>
            {SPACINGS.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted">Starts</span>
          <input className={fieldClass} type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted">Ends</span>
          <input className={fieldClass} type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
        </label>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block text-muted">People with the code join as</span>
        <select className={fieldClass} value={joinRole} onChange={(e) => setJoinRole(e.target.value as "contributor" | "viewer")}>
          <option value="contributor">Contributor — can request</option>
          <option value="viewer">Viewer — read only</option>
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-muted">Notes</span>
        <textarea className={fieldClass + " h-24 py-2"} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted">Region</span>
          <select className={fieldClass} value={region} onChange={(e) => setRegion(e.target.value)}>
            {REGIONS.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>
        </label>
        <p className="text-sm text-muted">Example TV channels, not a live licence database. Edit them for the market you are in.</p>
        <ul className="space-y-2">
          {blockers.map((b, i) => (
            <li key={`${b.min}-${i}`} className="flex items-center gap-2 text-sm">
              <span className="font-mono tabular-nums">{formatMhz(b.min)}–{formatMhz(b.max)}</span>
              <span className="flex-1 text-muted">{b.label}</span>
              <button type="button" className="text-bad" onClick={() => setBlockers(blockers.filter((_, j) => j !== i))}>
                Remove
              </button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <input className={fieldClass + " max-w-28 font-mono"} placeholder="min" value={bMin} onChange={(e) => setBMin(e.target.value)} />
          <input className={fieldClass + " max-w-28 font-mono"} placeholder="max" value={bMax} onChange={(e) => setBMax(e.target.value)} />
          <input className={fieldClass + " max-w-48"} placeholder="Label" value={bLabel} onChange={(e) => setBLabel(e.target.value)} />
          <button
            type="button"
            className={ghostClass}
            onClick={() => {
              const min = Number(bMin);
              const max = Number(bMax);
              if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return;
              setBlockers([...blockers, { min, max, label: bLabel || "Keep-out" }]);
              setBMin("");
              setBMax("");
              setBLabel("");
            }}
          >
            Add range
          </button>
        </div>
      <div className="flex flex-wrap gap-2">
        <button className={btnClass} type="submit" disabled={busy !== ""}>Save settings</button>
        {data.isOwner && (
          <button
            type="button"
            className={ghostClass + " text-bad"}
            onClick={() => {
              if (window.confirm("Delete this event?")) {
                void run("delete", () => deleteEvent({ data: { eventId: data.event.id } }));
              }
            }}
          >
            Delete event
          </button>
        )}
        <button type="button" className={ghostClass} onClick={() => {
          const name = window.prompt("Name for the copy", data.event.name + " copy");
          if (name) void copyShow({ data: { eventId: data.event.id, name } }).then((r) => { window.location.href = `/events/${r.id}/requests`; });
        }}>Copy show</button>
        <button type="button" className={ghostClass} onClick={() => void leaveEvent({ data: { eventId: data.event.id } }).then(() => { window.location.href = "/"; })}>Leave event</button>
        <button type="button" className={ghostClass} onClick={() => void makeGuestCode({ data: { eventId: data.event.id } }).then((r) => window.alert(`Guest code ${r.code}, expires ${r.expires || "end of show"}`))}>Guest code</button>
      </div>
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Members</h3>
        {data.members.map((m) => (
          <div key={m.user_id} className="flex items-center gap-3 text-sm">
            <span className="min-w-0 flex-1">{m.name ?? m.email ?? "Member"}</span>
            {manager ? (
              <select
                className={fieldClass + " max-w-40"}
                value={m.role}
                onChange={(e) =>
                  void run("role", () =>
                    setMemberRole({
                      data: {
                        eventId: data.event.id,
                        userId: m.user_id,
                        role: (e.target.value === "contributor" ? "tech" : e.target.value) as "manager" | "tech" | "contributor" | "viewer",
                      },
                    }),
                  )
                }
              >
                <option value="manager">RF manager</option>
                <option value="tech">tech</option>
                <option value="contributor">tech</option>
                <option value="viewer">viewer</option>
              </select>
            ) : (
              <span className="text-muted">{m.role}</span>
            )}
            {manager ? (
              <input
                className={fieldClass + " max-w-40"}
                defaultValue={m.company ?? ""}
                placeholder="Company"
                onBlur={(e) => {
                  if ((e.target.value || "") === (m.company ?? "")) return;
                  void run("company", () =>
                    setMemberCompany({ data: { eventId: data.event.id, userId: m.user_id, company: e.target.value } }),
                  );
                }}
              />
            ) : (
              <span className="text-muted">{m.company ?? "No company"}</span>
            )}
          </div>
        ))}
      </div>
      {manager && <ShareLink eventId={data.event.id} />}
    </form>
  );
}

export function Sheet({ data }: { data: Bundle }) {
  const [area, setArea] = useState("all");
  const [company, setCompany] = useState("all");
  const companies = [...new Set(data.members.map((m) => m.company).filter(Boolean))] as string[];
  const rows = data.requests.filter((r) => {
    if (area !== "all" && r.zone_id !== area) return false;
    if (company !== "all") {
      const member = data.members.find((m) => m.user_id === r.created_by);
      if ((member?.company ?? "") !== company) return false;
    }
    return true;
  });
  function downloadExcel() {
    const table = [
      ["Channel", "Device", "Category", "Zone", "MHz", "Locked"],
      ...rows.map((r) => [
        r.label,
        r.device_name,
        r.category,
        data.zones.find((z) => z.id === r.zone_id)?.name ?? "",
        r.assigned_mhz ?? "",
        r.locked ? "yes" : "no",
      ]),
    ];
    const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Plot"><Table>${table
      .map((row) => `<Row>${row.map((c) => `<Cell><Data ss:Type="String">${String(c).replaceAll("&", "&").replaceAll("<", "<")}</Data></Cell>`).join("")}</Row>`)
      .join("")}</Table></Worksheet></Workbook>`;
    const blob = new Blob([xml], { type: "application/vnd.ms-excel" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.event.name.replaceAll(/\s+/g, "-").toLowerCase()}-plot.xls`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function download() {
    const header = ["Category", "Label", "Device", "Zone", "Priority", "From", "Until", "MHz", "Locked"];
    const lines = rows.map((r) =>
      [
        r.category,
        r.label,
        r.device_name,
        data.zones.find((z) => z.id === r.zone_id)?.name ?? "",
        r.priority,
        r.time_start ?? "",
        r.time_end ?? "",
        r.assigned_mhz ?? "",
        r.locked ? "yes" : "no",
      ]
        .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.event.name.replaceAll(/\s+/g, "-").toLowerCase()}-plot.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap gap-2">
        <select className={fieldClass + " max-w-40"} value={area} onChange={(e) => setArea(e.target.value)}>
          <option value="all">All areas</option>
          {data.zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
        </select>
        <select className={fieldClass + " max-w-40"} value={company} onChange={(e) => setCompany(e.target.value)}>
          <option value="all">All companies</option>
          {companies.map((c) => <option key={c}>{c}</option>)}
        </select>
        <button type="button" className={btnClass} onClick={download}>Download CSV</button>
        <button type="button" className={ghostClass} onClick={downloadExcel}>Download Excel</button>
        <button type="button" className={ghostClass} onClick={() => window.print()}>Print / PDF</button>
      </div>
      <div>
        <h2 className="text-xl font-semibold">{data.event.name}</h2>
        <p className="text-sm text-muted">
          {data.event.venue} {data.event.city} · {data.event.spacing} spacing
        </p>
      </div>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase text-muted">
            <th className="py-2">Channel</th>
            <th>Zone</th>
            <th>MHz</th>
          </tr>
        </thead>
        <tbody>
          {data.requests.map((r) => (
            <tr key={r.id} className="border-b border-border">
              <td className="py-2">
                {r.label}
                <span className="block text-xs text-muted">{r.device_name}</span>
              </td>
              <td>{data.zones.find((z) => z.id === r.zone_id)?.name}</td>
              <td className="font-mono tabular-nums">{formatMhz(r.assigned_mhz)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-muted">Planning aid only. Confirm the plot against a scan and the local licence before the show.</p>
    </div>
  );
}

export function Antennas({
  data,
  manager,
  busy,
  run,
}: {
  data: Bundle;
  manager: boolean;
  busy: string;
  run: (label: string, action: () => Promise<Bundle>) => Promise<void>;
}) {
  const [name, setName] = useState("Main RX");
  const [power, setPower] = useState("50");
  const [gain, setGain] = useState("2");
  const [freq, setFreq] = useState("550");
  const [height, setHeight] = useState("4");
  const [threshold, setThreshold] = useState("-90");
  const [margin, setMargin] = useState("10");
  return (
    <div className="space-y-4">
      <CoverageMap antennas={data.antennas} />
      <ul className="space-y-2">
        {data.antennas.map((a) => (
          <li key={a.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3">
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{a.name}</span>
              <span className="text-sm text-muted">
                {a.powerMw} mW · {a.gainDbi} dBi · {a.freqMhz} MHz · {a.heightM} m
              </span>
            </span>
            <span className="font-mono text-sm text-primary">{Math.round(rangeMetres(a))} m</span>
            {manager && (
              <button
                type="button"
                className="text-sm text-bad"
                onClick={() => run("ant", () => deleteAntenna({ data: { eventId: data.event.id, antennaId: a.id } }))}
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      {manager && (
        <form
          className="grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run("ant", () =>
              addAntenna({
                data: {
                  eventId: data.event.id,
                  name,
                  powerMw: Number(power),
                  gainDbi: Number(gain),
                  freqMhz: Number(freq),
                  heightM: Number(height),
                  thresholdDbm: Number(threshold),
                  marginDb: Number(margin),
                },
              }),
            );
          }}
        >
          <label className="text-sm">Name<input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} required /></label>
          <label className="text-sm">Power mW<input className={fieldClass} value={power} onChange={(e) => setPower(e.target.value)} required /></label>
          <label className="text-sm">Gain dBi<input className={fieldClass} value={gain} onChange={(e) => setGain(e.target.value)} required /></label>
          <label className="text-sm">Frequency MHz<input className={fieldClass} value={freq} onChange={(e) => setFreq(e.target.value)} required /></label>
          <label className="text-sm">Height m<input className={fieldClass} value={height} onChange={(e) => setHeight(e.target.value)} required /></label>
          <label className="text-sm">RX threshold dBm<input className={fieldClass} value={threshold} onChange={(e) => setThreshold(e.target.value)} required /></label>
          <label className="text-sm">Margin dB<input className={fieldClass} value={margin} onChange={(e) => setMargin(e.target.value)} required /></label>
          <button className={btnClass} type="submit" disabled={busy !== ""}>Add antenna</button>
        </form>
      )}
    </div>
  );
}

function ShareLink({ eventId }: { eventId: string }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3">
      <p className="text-sm font-medium">Public plot link</p>
      <p className="text-xs text-muted">A venue or client can open the locked plot without an account.</p>
      <button
        type="button"
        className={ghostClass + " mt-2"}
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void enableShare({ data: { eventId } })
            .then((res) => setUrl(`${window.location.origin}/share/${res.token}`))
            .finally(() => setBusy(false));
        }}
      >
        {busy ? "Creating…" : "Create link"}
      </button>
      {url && (
        <p className="mt-2 break-all font-mono text-xs text-primary">{url}</p>
      )}
    </div>
  );
}

function labelFor(data: Bundle, ids: string[]): string {
  const names = ids.map((id) => data.requests.find((r) => r.id === id)?.label ?? "Channel");
  return names.join(" + ");
}

function bands(data: Bundle) {
  const marks = data.requests.flatMap((r) =>
    r.assigned_mhz == null ? [] : [{ id: r.id, mhz: r.assigned_mhz, label: r.label }],
  );
  const windows = [
    { title: "UHF", min: 400, max: 700 },
    { title: "1.9 GHz", min: 1800, max: 2000 },
    { title: "2 GHz video & 2.4 lighting", min: 2000, max: 2500 },
    { title: "5 GHz", min: 5100, max: 5900 },
  ];
  return windows.flatMap((w) => {
    const inside = marks.filter((m) => m.mhz >= w.min && m.mhz <= w.max);
    if (inside.length === 0) return [];
    return [
      {
        ...w,
        marks: inside.map((m) => ({ ...m, left: ((m.mhz - w.min) / (w.max - w.min)) * 100 })),
      },
    ];
  });
}

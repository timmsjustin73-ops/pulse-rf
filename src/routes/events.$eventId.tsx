import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell, Banner, btnClass, fieldClass, ghostClass, messageOf } from "@/components/shell";
import {
  CATALOG,
  CATEGORIES,
  PRIORITIES,
  REGIONS,
  SPACINGS,
  categoryLabel,
  formatMhz,
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
  updateEvent,
  updateRequest,
} from "@/lib/pulse.functions";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/events/$eventId")({ component: EventRoute });

type Bundle = Awaited<ReturnType<typeof getEvent>>;
type Tab = "plot" | "request" | "zones" | "scans" | "settings" | "sheet";

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
  const [tab, setTab] = useState<Tab>("plot");
  const [custom, setCustom] = useState<Awaited<ReturnType<typeof listCustomDevices>>>([]);

  async function reload() {
    const next = await getEvent({ data: { eventId } });
    setData(next);
  }

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
    return () => {
      cancel = true;
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
          {manager && (
            <button
              type="button"
              className={btnClass}
              disabled={busy !== ""}
              onClick={() => run("calc", () => recalculate({ data: { eventId } }))}
            >
              {busy === "calc" ? "Coordinating…" : "Coordinate"}
            </button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Channels" value={`${data.requests.length - open}/${data.requests.length}`} />
        <Stat label="Conflicts" value={String(bad)} warn={bad > 0} />
        <Stat label="Spacing" value={data.event.spacing} />
      </div>
      {error && <Banner tone="bad">{error}</Banner>}
      <div className="no-print flex gap-1 overflow-x-auto">
        {(
          [
            ["plot", "Plot"],
            ["request", "Request"],
            ["zones", "Zones"],
            ["scans", "Scans"],
            ["settings", "Settings"],
            ["sheet", "Sheet"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={
              "h-10 shrink-0 rounded-full px-4 text-sm " +
              (tab === id ? "bg-primary text-primary-fg" : "border border-border text-muted")
            }
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "plot" && <Plot data={data} manager={manager} busy={busy} run={run} />}
      {tab === "request" && (
        <RequestForm data={data} custom={custom} canRequest={canRequest} busy={busy} run={run} />
      )}
      {tab === "zones" && <Zones data={data} manager={manager} busy={busy} run={run} />}
      {tab === "scans" && <Scans data={data} canRequest={canRequest} manager={manager} busy={busy} run={run} />}
      {tab === "settings" && <Settings data={data} manager={manager} busy={busy} run={run} />}
      {tab === "sheet" && <Sheet data={data} />}
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
  const strips = useMemo(() => bands(data), [data]);
  return (
    <div className="space-y-4">
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
        <ul className="space-y-2">
          {data.issues.slice(0, 8).map((issue, i) => (
            <li key={i} className={"text-sm " + (issue.severity === "bad" ? "text-bad" : "text-muted")}>
              {labelFor(data, issue.ids)} — {issue.message}
            </li>
          ))}
        </ul>
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
                <td className="px-3 py-2 font-mono tabular-nums text-primary">{formatMhz(r.assigned_mhz)}</td>
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
  const devices = [
    ...CATALOG.filter((d) => d.category === category).map((d) => ({ key: d.key, name: `${d.manufacturer} ${d.name}` })),
    ...custom.filter((d) => d.category === category).map((d) => ({ key: `custom:${d.id}`, name: d.name })),
  ];
  const [deviceKey, setDeviceKey] = useState(devices[0]?.key ?? "");
  const [label, setLabel] = useState("");
  const [zoneId, setZoneId] = useState(data.zones[0]?.id ?? "");
  const [priority, setPriority] = useState<Priority>("normal");
  const [qty, setQty] = useState(1);
  const [timeStart, setTimeStart] = useState("");
  const [timeEnd, setTimeEnd] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    setDeviceKey(devices[0]?.key ?? "");
    // devices derived from category
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, custom.length]);

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
        <span className="mb-1 block text-muted">Device</span>
        <select className={fieldClass} value={deviceKey} onChange={(e) => setDeviceKey(e.target.value)} required>
          {devices.map((d) => (
            <option key={d.key} value={d.key}>{d.name}</option>
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

function Zones({
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
    </div>
  );
}

function Scans({
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
        Paste a scan as frequency, level. Hits at or above the threshold become keep-outs. Recalculate after importing.
      </p>
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
          <textarea
            className={fieldClass + " h-36 py-2 font-mono"}
            value={body}
            onChange={(e) => setBody(e.target.value)}
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

function Settings({
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
      </div>
      <ul className="text-sm text-muted">
        {data.members.map((m) => (
          <li key={m.user_id}>
            {m.name ?? m.email ?? "Member"} · {m.role}
          </li>
        ))}
      </ul>
    </form>
  );
}

function Sheet({ data }: { data: Bundle }) {
  function download() {
    const header = ["Category", "Label", "Device", "Zone", "Priority", "From", "Until", "MHz", "Locked"];
    const lines = data.requests.map((r) =>
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
        <button type="button" className={btnClass} onClick={download}>Download CSV</button>
        <button type="button" className={ghostClass} onClick={() => window.print()}>Print sheet</button>
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

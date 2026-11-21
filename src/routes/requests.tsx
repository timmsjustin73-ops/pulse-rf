import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell, btnClass, fieldClass, ghostClass } from "@/components/shell";
import { CATALOG, formatMhz, powerOptions } from "@/lib/catalog";
import { listRequestsAcrossEvents, editRequestLine, deleteEvent } from "@/lib/pulse.functions";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/requests")({ component: RequestsRoute });

type Row = Awaited<ReturnType<typeof listRequestsAcrossEvents>>[number];

function RequestsRoute() {
  return (
    <AppShell>
      <RequestsPage />
    </AppShell>
  );
}

function RequestsPage() {
  const { user } = useCurrentUserState();
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Row | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    void listRequestsAcrossEvents().then(setRows);
  }, [user?.id]);

  const groups = useMemo(() => {
    const byUser = new Map<string, { name: string; events: Map<string, { name: string; devices: Row[] }> }>();
    for (const row of rows) {
      const userKey = row.created_by;
      const userGroup = byUser.get(userKey) ?? { name: row.creator_name || "Someone", events: new Map() };
      const eventGroup = userGroup.events.get(row.event_id) ?? { name: row.event_name, devices: [] };
      eventGroup.devices.push(row);
      userGroup.events.set(row.event_id, eventGroup);
      byUser.set(userKey, userGroup);
    }
    return [...byUser.entries()];
  }, [rows]);

  if (rows.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Requests</h1>
        <p className="mt-4 text-sm text-muted">No events.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Requests</h1>
        {groups.map(([userId, group]) => (
          <div key={userId}>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{group.name}</p>
            {[...group.events.entries()].map(([eventId, event]) => {
              const key = `${userId}-${eventId}`;
              const expanded = open[key];
              const byType = event.devices.reduce<Record<string, Row[]>>((acc, d) => {
                const type = typeLabel(d.category);
                (acc[type] ??= []).push(d);
                return acc;
              }, {});
              return (
                <div key={key} className="mt-1">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-surface"
                    onClick={() => setOpen((cur) => ({ ...cur, [key]: !cur[key] }))}
                  >
                    <span>{event.name}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-bad" onClick={(e) => { e.stopPropagation(); if (window.confirm("Remove this event?")) void deleteEvent({ data: { eventId } }).then(() => window.location.reload()); }}>Remove</span>
                      <span className="text-muted">{expanded ? "−" : "+"}</span>
                    </span>
                  </button>
                  {expanded && (
                    <div className="ml-3 space-y-2 border-l border-border pl-3">
                      {Object.entries(byType).map(([type, devices]) => (
                        <div key={type}>
                          <p className="text-xs text-muted">{type}</p>
                          {devices.map((d) => (
                            <button
                              key={d.id}
                              type="button"
                              className={"block w-full rounded px-2 py-1 text-left text-sm " + (selected?.id === d.id ? "bg-primary text-primary-fg" : "hover:bg-surface")}
                              onClick={() => { setSelected(d); setEditing(false); }}
                            >
                              {d.label}
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div>
        {!selected && <p className="text-sm text-muted">Select a device to see its details.</p>}
        {selected && (
          <DeviceDetails
            row={selected}
            editing={editing}
            onEdit={() => setEditing(true)}
            onCancel={() => setEditing(false)}
            onSaved={(next) => {
              setRows((cur) => cur.map((r) => (r.id === next.id ? next : r)));
              setSelected(next);
              setEditing(false);
            }}
          />
        )}
      </div>
    </div>
  );
}

function typeLabel(category: string): string {
  if (category === "audio") return "Wireless mics";
  if (category === "iem") return "IEM";
  if (category === "comms") return "Comms";
  if (category === "video") return "Video";
  if (category === "lighting") return "Lighting";
  return category;
}

function DeviceDetails({
  row,
  editing,
  onEdit,
  onCancel,
  onSaved,
}: {
  row: Row;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSaved: (row: Row) => void;
}) {
  const device = CATALOG.find((d) => d.key === row.device_key || d.name === row.device_name);
  const [label, setLabel] = useState(row.label);
  const [notes, setNotes] = useState(row.notes);
  const [power, setPower] = useState(row.power_mw ?? 10);
  const [band, setBand] = useState(device?.key ?? "");

  if (!editing) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{row.label}</h2>
            <p className="text-sm text-muted">{row.event_name} · {row.device_name}</p>
          </div>
          <button type="button" className={ghostClass} onClick={onEdit}>Edit</button>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-muted">Band</dt><dd>{formatMhz(row.band_min)} – {formatMhz(row.band_max)}</dd></div>
          <div><dt className="text-muted">Assigned</dt><dd>{row.assigned_mhz ? formatMhz(row.assigned_mhz) : "Waiting"}</dd></div>
          <div><dt className="text-muted">Power</dt><dd>{row.power_mw ?? 10} mW</dd></div>
          <div><dt className="text-muted">Spare</dt><dd>{row.spare ? "Yes" : "No"}</dd></div>
        </dl>
        {row.notes && <p className="mt-3 text-sm text-muted">{row.notes}</p>}
      </div>
    );
  }

  const options = device ? powerOptions(device.power) : [10];
  return (
    <form
      className="space-y-3 rounded-xl border border-border bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const nextDevice = CATALOG.find((d) => d.key === band) ?? device;
        void editRequestLine({
          data: {
            eventId: row.event_id,
            requestId: row.id,
            label,
            notes,
            powerMw: power,
            deviceKey: nextDevice?.key ?? row.device_key,
            deviceName: nextDevice?.name ?? row.device_name,
            manufacturer: nextDevice?.manufacturer ?? row.manufacturer,
            bandMin: nextDevice?.bandMin ?? row.band_min,
            bandMax: nextDevice?.bandMax ?? row.band_max,
            bandwidth: nextDevice?.bandwidth ?? 0.2,
            mode: nextDevice?.mode ?? "carrier",
          },
        }).then(() => {
          onSaved({
            ...row,
            label,
            notes,
            power_mw: power,
            device_name: nextDevice?.name ?? row.device_name,
            band_min: nextDevice?.bandMin ?? row.band_min,
            band_max: nextDevice?.bandMax ?? row.band_max,
          });
        });
      }}
    >
      <h2 className="font-semibold">Edit {row.label}</h2>
      <label className="block text-sm">Channel name
        <input className={fieldClass + " mt-1"} value={label} onChange={(e) => setLabel(e.target.value)} />
      </label>
      <label className="block text-sm">Band
        <select className={fieldClass + " mt-1"} value={band} onChange={(e) => setBand(e.target.value)}>
          {CATALOG.filter((d) => d.category === row.category).map((d) => (
            <option key={d.key} value={d.key}>{d.manufacturer} · {d.series} · {d.band}</option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap gap-1">
        {options.map((mw) => (
          <button key={mw} type="button" onClick={() => setPower(mw)} className={"rounded-full px-3 py-1 text-xs " + (power === mw ? "bg-primary text-primary-fg" : "border border-border")}>{mw} mW</button>
        ))}
      </div>
      <label className="block text-sm">Note
        <input className={fieldClass + " mt-1"} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <div className="flex gap-2">
        <button type="submit" className={btnClass}>Save</button>
        <button type="button" className={ghostClass} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Banner, btnClass, fieldClass, ghostClass, messageOf } from "@/components/shell";
import { CATALOG, CATEGORIES, type Category, type DeviceMode, formatMhz } from "@/lib/catalog";
import { addCustomDevice, deleteCustomDevice, listCustomDevices } from "@/lib/pulse.functions";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/library")({ component: LibraryPage });

type Custom = Awaited<ReturnType<typeof listCustomDevices>>[number];

function LibraryPage() {
  return (
    <AppShell>
      <Library />
    </AppShell>
  );
}

function Library() {
  const { user } = useCurrentUserState();
  const [custom, setCustom] = useState<Custom[]>([]);
  const [filter, setFilter] = useState<Category | "all">("all");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [category, setCategory] = useState<Category>("audio");
  const [bandMin, setBandMin] = useState("520");
  const [bandMax, setBandMax] = useState("606");
  const [bandwidth, setBandwidth] = useState("0.2");
  const [mode, setMode] = useState<DeviceMode>("carrier");
  const [power, setPower] = useState("");

  async function reload() {
    setCustom(await listCustomDevices());
  }

  useEffect(() => {
    if (!user?.id) return;
    let cancel = false;
    listCustomDevices()
      .then((rows) => {
        if (!cancel) setCustom(rows);
      })
      .catch((err: unknown) => {
        if (!cancel) setError(messageOf(err));
      });
    return () => {
      cancel = true;
    };
  }, [user?.id]);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await addCustomDevice({
        data: {
          name,
          manufacturer,
          category,
          bandMin: Number(bandMin),
          bandMax: Number(bandMax),
          bandwidth: Number(bandwidth),
          mode,
          power,
        },
      });
      setName("");
      await reload();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  const presets = CATALOG.filter((d) => filter === "all" || d.category === filter);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Device library</h1>
        <p className="text-sm text-muted">
          Catalog is grouped by manufacturer, make and band. UHF radio mics tune in 0.005 MHz steps. Australia shows
          generally stay above 520 MHz and below 694 MHz.
        </p>
      </div>
      {error && <Banner tone="bad">{error}</Banner>}
      <div className="flex flex-wrap gap-2">
        <Filter id="all" label="All" current={filter} onClick={setFilter} />
        {CATEGORIES.map((c) => (
          <Filter key={c.id} id={c.id} label={c.label} current={filter} onClick={setFilter} />
        ))}
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {presets.map((d) => (
          <li key={d.key} className="rounded-xl border border-border bg-surface p-4">
            <p className="text-xs uppercase tracking-wide text-muted">{d.manufacturer} · {d.series} · {d.band}</p>
            <p className="font-medium">{d.name}</p>
            <p className="mt-1 font-mono text-sm tabular-nums text-primary">
              {formatMhz(d.bandMin)} – {formatMhz(d.bandMax)} MHz
            </p>
            <div className="relative mt-2 h-2 rounded-full bg-surface-2">
              <span
                className="absolute inset-y-0 rounded-full bg-primary"
                style={{
                  left: `${Math.max(0, ((d.bandMin - 470) / 500) * 100)}%`,
                  width: `${Math.min(100, ((d.bandMax - d.bandMin) / 500) * 100)}%`,
                }}
              />
            </div>
            <p className="text-sm text-muted">
              {d.mode === "band" ? "Reserves the whole band" : `${d.bandwidth} MHz carrier`} · {d.power}
              {d.tuneStep ? ` · ${d.tuneStep} MHz steps` : ""}
            </p>
            {d.note && <p className="mt-2 text-sm text-muted">{d.note}</p>}
          </li>
        ))}
      </ul>
      <section className="grid gap-4 lg:grid-cols-2">
        <form onSubmit={onAdd} className="space-y-3 rounded-xl border border-border bg-surface p-4">
          <h2 className="font-semibold">Your device</h2>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Name</span>
            <input className={fieldClass} required value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Manufacturer</span>
            <input className={fieldClass} value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Department</span>
              <select className={fieldClass} value={category} onChange={(e) => setCategory(e.target.value as Category)}>
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Mode</span>
              <select className={fieldClass} value={mode} onChange={(e) => setMode(e.target.value as DeviceMode)}>
                <option value="carrier">Single carrier</option>
                <option value="band">Whole band</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted">From MHz</span>
              <input className={fieldClass + " font-mono"} value={bandMin} onChange={(e) => setBandMin(e.target.value)} required />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted">To MHz</span>
              <input className={fieldClass + " font-mono"} value={bandMax} onChange={(e) => setBandMax(e.target.value)} required />
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Occupied bandwidth MHz</span>
            <input className={fieldClass + " font-mono"} value={bandwidth} onChange={(e) => setBandwidth(e.target.value)} required />
          </label>
          <button className={btnClass} disabled={busy} type="submit">{busy ? "Saving…" : "Save device"}</button>
        </form>
        <div className="space-y-3">
          <h2 className="font-semibold">Saved by you</h2>
          {custom.length === 0 ? (
            <p className="text-sm text-muted">Custom profiles show up in the request form on your events.</p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
              {custom.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{d.name}</span>
                    <span className="font-mono text-sm text-muted tabular-nums">
                      {formatMhz(d.band_min)} – {formatMhz(d.band_max)}
                    </span>
                  </span>
                  <button
                    type="button"
                    className={ghostClass + " h-9"}
                    onClick={async () => {
                      await deleteCustomDevice({ data: { id: d.id } });
                      await reload();
                    }}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function Filter({
  id,
  label,
  current,
  onClick,
}: {
  id: Category | "all";
  label: string;
  current: Category | "all";
  onClick: (id: Category | "all") => void;
}) {
  const on = current === id;
  return (
    <button
      type="button"
      onClick={() => onClick(id)}
      className={"h-10 rounded-full px-4 text-sm " + (on ? "bg-primary text-primary-fg" : "border border-border text-muted")}
    >
      {label}
    </button>
  );
}

import { Link } from "@tanstack/react-router";
import {
  Radio,
  Waves,
  ShieldCheck,
  MapPin,
  ScanSearch,
  Layers,
  ArrowRight,
  Check,
} from "lucide-react";

const features = [
  {
    icon: ScanSearch,
    title: "Clean scans, clean plots",
    body: "Import a venue scan, mark blockers, and assign only frequencies that survive the real spectrum.",
  },
  {
    icon: Layers,
    title: "Intermod-free assignment",
    body: "Resilience, Balanced, or Density. The engine keeps carriers apart and respects every band gap.",
  },
  {
    icon: Radio,
    title: "Every band, every brand",
    body: "Shure, Sennheiser, Lectrosonics, Sony, Audio-Technica, Wisycom, IEMs and more — listed as real channel groups.",
  },
  {
    icon: MapPin,
    title: "Zones and shared RF",
    body: "Model the site. Isolate rooms or share a pool. Priority and time windows keep the show intact.",
  },
  {
    icon: ShieldCheck,
    title: "Roles that match the call sheet",
    body: "Managers assign. Contributors request. Viewers watch the plot. One code joins the event.",
  },
  {
    icon: Waves,
    title: "Built for the truck",
    body: "Australia LIPD rules, 5 kHz grids, regional examples, and exports the crew can actually use.",
  },
];

const steps = [
  { n: "01", title: "Create the event", body: "Name the show, set the venue, and pick the spacing that matches the risk." },
  { n: "02", title: "Request the channels", body: "Department, manufacturer, make, band. The catalog knows the range." },
  { n: "03", title: "Assign and lock", body: "Pulse fills the cleanest carriers. Print, export, and walk into the show." },
];

const brands = ["Shure", "Sennheiser", "Lectrosonics", "Sony", "Audio-Technica", "Wisycom", "AKG", "Rode"];

export function Landing() {
  return (
    <div className="min-h-screen bg-bg text-fg">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute right-0 top-1/3 h-72 w-72 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute inset-0 opacity-[0.35]" style={{
          backgroundImage:
            "linear-gradient(to right, rgba(42,53,66,0.35) 1px, transparent 1px), linear-gradient(to bottom, rgba(42,53,66,0.35) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
        }} />
      </div>

      <header className="relative z-10 mx-auto flex h-16 max-w-6xl items-center px-5">
        <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-fg shadow-[0_0_24px_rgba(227,160,8,0.35)]">
            <Radio className="size-4" aria-hidden="true" />
          </span>
          Pulse RF
        </Link>
        <nav className="ml-auto flex items-center gap-2 text-sm">
          <Link to="/login" search={{ mode: "in" }} className="rounded-lg px-3 py-2 text-muted hover:text-fg">Sign in</Link>
          <Link to="/login" search={{ mode: "up" }} className="inline-flex h-10 items-center rounded-lg bg-primary px-4 font-semibold text-primary-fg">
            Create account
          </Link>
        </nav>
      </header>

      <main className="relative z-10">
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-10 lg:grid-cols-[1.1fr_0.9fr] lg:pt-16">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-primary">
              AVLC frequency coordination
            </p>
            <h1 className="max-w-xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
              The spectrum is full.{" "}
              <span className="text-primary">Your show does not have to be.</span>
            </h1>
            <p className="mt-5 max-w-lg text-lg text-muted">
              Pulse RF turns a messy venue into a locked plot. Scan it, model it, assign intermod-free carriers, and hand the crew a frequency that holds.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/login" search={{ mode: "up" }} className="inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-5 font-semibold text-primary-fg shadow-[0_0_32px_rgba(227,160,8,0.28)]">
                Start coordinating <ArrowRight className="size-4" />
              </Link>
              <Link to="/login" search={{ mode: "in" }} className="inline-flex h-12 items-center rounded-xl border border-border bg-surface/80 px-5 font-medium">
                Sign in
              </Link>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
              {["Intermod-free", "5 kHz grids", "AU LIPD aware", "Roles and codes"].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <Check className="size-4 text-ok" /> {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative">
            <div className="absolute -inset-6 rounded-[2rem] bg-primary/10 blur-2xl" />
            <div className="relative overflow-hidden rounded-3xl border border-border bg-surface/90 p-5 shadow-2xl backdrop-blur">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted">Harbour Lights · main stage</p>
                  <p className="font-semibold">Assigned plot</p>
                </div>
                <span className="rounded-full bg-ok/15 px-2.5 py-1 text-xs font-medium text-ok">Clean</span>
              </div>
              <div className="space-y-2.5">
                {[
                  ["Lead vocal", "ULX-D H51", "542.250"],
                  ["Guitar", "EW-DX R1-9", "548.100"],
                  ["IEM · drums", "PSM 1000 J8E", "570.625"],
                  ["Comms", "FreeSpeak II", "1890.000"],
                ].map(([label, device, freq]) => (
                  <div key={label} className="flex items-center gap-3 rounded-xl border border-border bg-bg/70 px-3 py-2.5">
                    <span className="size-2 rounded-full bg-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{label}</span>
                      <span className="block text-xs text-muted">{device}</span>
                    </span>
                    <span className="font-mono text-sm tabular-nums text-primary">{freq}</span>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex h-16 items-end gap-1">
                {Array.from({ length: 48 }, (_, i) => {
                  const h = 20 + ((i * 17) % 70);
                  const hot = i % 11 === 4 || i % 13 === 2;
                  return (
                    <span
                      key={i}
                      className={"flex-1 rounded-sm " + (hot ? "bg-bad/70" : "bg-primary/50")}
                      style={{ height: `${hot ? 28 : h}%` }}
                    />
                  );
                })}
              </div>
              <p className="mt-2 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-muted">520 — 606 MHz · scan</p>
            </div>
          </div>
        </section>

        <section className="border-y border-border bg-surface/40">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-5 py-5 text-sm text-muted">
            <span className="uppercase tracking-[0.18em] text-xs">Catalog</span>
            {brands.map((b) => (
              <span key={b} className="font-medium text-fg/80">{b}</span>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-20">
          <div className="max-w-2xl">
            <p className="text-xs uppercase tracking-[0.18em] text-primary">Why crews switch</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Coordination that respects the room.</h2>
            <p className="mt-3 text-muted">Not a spreadsheet with a radio-mic column. A site model, a scan, a catalog of real bands, and an assignment that will not fold when the doors open.</p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <article key={f.title} className="rounded-2xl border border-border bg-surface p-5">
                <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                  <f.icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="mt-4 font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm text-muted">{f.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-20">
          <div className="grid gap-4 lg:grid-cols-3">
            {steps.map((s) => (
              <article key={s.n} className="rounded-2xl border border-border bg-surface-2/60 p-6">
                <p className="font-mono text-sm text-primary">{s.n}</p>
                <h3 className="mt-2 text-xl font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted">{s.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-24">
          <div className="relative overflow-hidden rounded-3xl border border-primary/30 bg-surface px-6 py-12 text-center sm:px-12">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(227,160,8,0.16),transparent_60%)]" />
            <h2 className="relative text-3xl font-semibold tracking-tight sm:text-4xl">Bring the next show in clean.</h2>
            <p className="relative mx-auto mt-3 max-w-md text-muted">Create an account, open an event, and have a locked plot before the trucks roll in.</p>
            <div className="relative mt-7 flex flex-wrap justify-center gap-3">
              <Link to="/login" search={{ mode: "up" }} className="inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-5 font-semibold text-primary-fg">
                Create free account <ArrowRight className="size-4" />
              </Link>
              <Link to="/login" search={{ mode: "in" }} className="inline-flex h-12 items-center rounded-xl border border-border px-5 font-medium">
                Sign in
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-border py-6 text-center text-xs text-muted">
        Pulse RF · Audio, video, lighting, and comms coordination
      <p className="mt-4 text-xs text-muted"><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></p></footer>
    </div>
  );
}

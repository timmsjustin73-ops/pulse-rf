import type { Spacing } from "./catalog";

export type BandBlock = { min: number; max: number; label?: string };

export type CoordItem = {
  id: string;
  bandMin: number;
  bandMax: number;
  bandwidth: number;
  mode: "carrier" | "band";
  zoneId: string;
  isolated: boolean;
  t0: number | null;
  t1: number | null;
  priority: number;
  locked: boolean;
  assigned: number | null;
  powerMw?: number;
  /** MHz. Narrowband UHF radio mics use 0.005. */
  tuneStep?: number | null;
  gaps?: { min: number; max: number }[];
};

/** Inclusive hardware hole the radio cannot tune through, e.g. 608–614. */
export type SpectrumRule = {
  min: number;
  max: number;
  exclusive: boolean;
  label: string;
};

export type Issue = {
  severity: "bad" | "warn";
  ids: string[];
  message: string;
};

type Foot = {
  id: string;
  min: number;
  max: number;
  center: number;
  mode: "carrier" | "band";
  zoneId: string;
  isolated: boolean;
  t0: number | null;
  t1: number | null;
  powerMw?: number;
};

const GUARD: Record<Spacing, number> = {
  resilience: 0.35,
  balanced: 0.15,
  density: 0.04,
};

const IMD: Record<Spacing, number> = {
  resilience: 0.12,
  balanced: 0.06,
  density: 0.025,
};

const SCALE = 1e6;

/** Australia general LIPD window for wireless audio transmitters. The edges themselves are excluded. */
export function spectrumRuleFor(region: string): SpectrumRule | null {
  if (region === "AU") {
    return {
      min: 520,
      max: 694,
      exclusive: true,
      label: "ACMA LIPD wireless audio is above 520 MHz and below 694 MHz",
    };
  }
  return null;
}

export function tuneStepOf(item: {
  mode: "carrier" | "band";
  bandMax: number;
  bandwidth: number;
  tuneStep?: number | null;
}): number | null {
  if (item.tuneStep != null) return item.tuneStep > 0 ? item.tuneStep : null;
  if (item.mode !== "carrier") return null;
  if (item.bandMax > 1000 || item.bandwidth > 1) return null;
  if (Math.abs(item.bandwidth - 0.0125) < 1e-6) return 0.0125;
  return 0.005;
}

export function snapCarrier(mhz: number, step: number): number {
  const stepU = Math.round(step * SCALE);
  const mhzU = Math.round(mhz * SCALE);
  return (Math.round(mhzU / stepU) * stepU) / SCALE;
}

export function onTuneGrid(mhz: number, step: number): boolean {
  const stepU = Math.round(step * SCALE);
  const mhzU = Math.round(mhz * SCALE);
  return mhzU % stepU === 0;
}

function ceilCarrier(mhz: number, step: number): number {
  const stepU = Math.round(step * SCALE);
  const mhzU = Math.round(mhz * SCALE);
  return (Math.ceil(mhzU / stepU - 1e-9) * stepU) / SCALE;
}

function floorCarrier(mhz: number, step: number): number {
  const stepU = Math.round(step * SCALE);
  const mhzU = Math.round(mhz * SCALE);
  return (Math.floor(mhzU / stepU + 1e-9) * stepU) / SCALE;
}

function addStep(mhz: number, step: number): number {
  const stepU = Math.round(step * SCALE);
  const mhzU = Math.round(mhz * SCALE);
  return (mhzU + stepU) / SCALE;
}

function ruleApplies(item: CoordItem, rule: SpectrumRule | null): rule is SpectrumRule {
  if (!rule) return false;
  if (item.mode !== "carrier" || item.bandwidth > 1) return false;
  if (item.bandMin < 450 || item.bandMax > 960) return false;
  return item.bandMax > 500 && item.bandMin < 860;
}

function together(a: Foot, b: Foot): boolean {
  const time =
    a.t0 == null || a.t1 == null || b.t0 == null || b.t1 == null
      ? true
      : a.t0 < b.t1 && b.t0 < a.t1;
  if (!time) return false;
  if (!a.isolated || !b.isolated) return true;
  return a.zoneId === b.zoneId;
}

function rangesOverlap(aMin: number, aMax: number, bMin: number, bMax: number, guard: number): boolean {
  return aMin - guard < bMax && bMin - guard < aMax;
}

function footprint(item: CoordItem, center: number): Foot {
  if (item.mode === "band") {
    return {
      id: item.id,
      min: item.bandMin,
      max: item.bandMax,
      center: (item.bandMin + item.bandMax) / 2,
      mode: "band",
      zoneId: item.zoneId,
      isolated: item.isolated,
      t0: item.t0,
      t1: item.t1,
      powerMw: item.powerMw ?? 10,
    };
  }
  const half = Math.max(item.bandwidth, 0.0125) / 2;
  return {
    id: item.id,
    min: center - half,
    max: center + half,
    center,
    mode: "carrier",
    zoneId: item.zoneId,
    isolated: item.isolated,
    t0: item.t0,
    t1: item.t1,
    powerMw: item.powerMw ?? 10,
  };
}

function hitsBlocker(foot: Foot, blockers: BandBlock[]): BandBlock | null {
  for (const b of blockers) {
    if (rangesOverlap(foot.min, foot.max, b.min, b.max, 0)) return b;
  }
  return null;
}

function hitsGap(item: CoordItem, foot: Foot): { min: number; max: number } | null {
  for (const g of item.gaps ?? []) {
    if (rangesOverlap(foot.min, foot.max, g.min, g.max, 0)) return g;
  }
  return null;
}

function hitsPlaced(foot: Foot, placed: Foot[], guard: number): boolean {
  for (const other of placed) {
    if (!together(foot, other)) continue;
    if (rangesOverlap(foot.min, foot.max, other.min, other.max, guard)) return true;
  }
  return false;
}

function outsideRule(item: CoordItem, foot: Foot, rule: SpectrumRule | null): boolean {
  if (!ruleApplies(item, rule)) return false;
  if (rule.exclusive) return foot.min <= rule.min + 1e-6 || foot.max >= rule.max - 1e-6;
  return foot.min < rule.min - 1e-6 || foot.max > rule.max + 1e-6;
}

function imdHit(center: number, carriers: number[], window: number): boolean {
  if (carriers.length === 0) return false;
  const near = (f: number) => {
    if (Math.abs(f - center) <= window) return true;
    for (const c of carriers) if (Math.abs(f - c) <= window) return true;
    return false;
  };
  const trivial = (p: number, tones: number[]) => tones.some((t) => Math.abs(p - t) < 1e-3);

  for (const a of carriers) {
    for (const p of [2 * center - a, 2 * a - center]) {
      if (trivial(p, [center, a])) continue;
      if (near(p)) return true;
    }
  }
  for (let i = 0; i < carriers.length; i++) {
    for (let j = 0; j < carriers.length; j++) {
      if (i === j) continue;
      const a = carriers[i]!;
      const b = carriers[j]!;
      for (const p of [center + a - b, a + b - center]) {
        if (trivial(p, [center, a, b])) continue;
        if (near(p)) return true;
      }
    }
  }
  return false;
}

function legal(
  item: CoordItem,
  center: number,
  placed: Foot[],
  blockers: BandBlock[],
  spacing: Spacing,
  rule: SpectrumRule | null,
): boolean {
  const foot = footprint(item, center);
  if (foot.min < item.bandMin - 1e-6 || foot.max > item.bandMax + 1e-6) return false;
  if (outsideRule(item, foot, rule)) return false;
  if (hitsGap(item, foot)) return false;
  if (hitsBlocker(foot, blockers)) return false;
  if (hitsPlaced(foot, placed, GUARD[spacing])) return false;
  if (item.mode === "carrier") {
    const carriers = placed
      .filter((p) => p.mode === "carrier" && together(foot, p))
      .map((p) => p.center);
    const loud = Math.max(item.powerMw ?? 10, ...placed.filter((p) => p.mode === "carrier").map((p) => p.powerMw ?? 10));
    const guard = IMD[spacing] * (1 + Math.max(0, (10 * Math.log10(Math.max(1, loud) / 10)) * 3) / 30);
    if (imdHit(center, carriers, guard)) return false;
  }
  return true;
}

function overlapJump(
  item: CoordItem,
  center: number,
  placed: Foot[],
  blockers: BandBlock[],
  spacing: Spacing,
  rule: SpectrumRule | null,
): number | null {
  if (item.mode !== "carrier") return null;
  const foot = footprint(item, center);
  const half = center - foot.min;
  let jump: number | null = null;
  const push = (blockMax: number, guard: number) => {
    const need = blockMax + guard + half + 1e-4;
    if (need > center + 1e-6) jump = jump == null ? need : Math.min(jump, need);
  };
  if (outsideRule(item, foot, rule) && rule && foot.min <= rule.min) push(rule.min, 0);
  const gap = hitsGap(item, foot);
  if (gap) push(gap.max, 0);
  const block = hitsBlocker(foot, blockers);
  if (block) push(block.max, 0);
  const guard = GUARD[spacing];
  for (const other of placed) {
    if (!together(foot, other)) continue;
    if (rangesOverlap(foot.min, foot.max, other.min, other.max, guard)) push(other.max, guard);
  }
  return jump;
}

function windowBounds(item: CoordItem, rule: SpectrumRule | null): { start: number; end: number } | null {
  const half = Math.max(item.bandwidth, 0.0125) / 2;
  let start = item.bandMin + half;
  let end = item.bandMax - half;
  if (ruleApplies(item, rule)) {
    const edge = rule.exclusive ? 1e-4 : 0;
    start = Math.max(start, rule.min + edge + half);
    end = Math.min(end, rule.max - edge - half);
  }
  if (end < start - 1e-9) return null;
  return { start, end };
}

function search(
  item: CoordItem,
  placed: Foot[],
  blockers: BandBlock[],
  spacing: Spacing,
  rule: SpectrumRule | null,
): number | null {
  if (item.mode === "band") {
    const mid = (item.bandMin + item.bandMax) / 2;
    return legal(item, mid, placed, blockers, spacing, rule) ? mid : null;
  }
  const bounds = windowBounds(item, rule);
  if (!bounds) return null;
  const tune = tuneStepOf(item);
  if (tune) {
    let f = ceilCarrier(bounds.start, tune);
    const last = floorCarrier(bounds.end, tune);
    let steps = 0;
    while (f <= last + 1e-9 && steps < 20000) {
      if (legal(item, f, placed, blockers, spacing, rule)) return f;
      const jump = overlapJump(item, f, placed, blockers, spacing, rule);
      const stepped = addStep(f, tune);
      const jumped = jump == null ? stepped : ceilCarrier(jump, tune);
      f = jumped > f + 1e-9 ? jumped : stepped;
      steps++;
    }
    return null;
  }
  const span = bounds.end - bounds.start;
  const step = Math.max(item.bandwidth, span / 480, 0.025);
  for (let f = bounds.start; f <= bounds.end + 1e-6; f += step) {
    const freq = Math.min(f, bounds.end);
    if (legal(item, freq, placed, blockers, spacing, rule)) return Math.round(freq * 1000) / 1000;
  }
  return null;
}

function blankReason(item: CoordItem, rule: SpectrumRule | null): string {
  if (item.mode === "carrier" && ruleApplies(item, rule) && !windowBounds(item, rule)) {
    return "No frequency in this tuning range sits inside the ACMA LIPD window (above 520 MHz and below 694 MHz).";
  }
  return "No legal frequency in this band with the current spacing, zones, and keep-outs.";
}

export function coordinate(
  items: CoordItem[],
  blockers: BandBlock[],
  spacing: Spacing,
  rule: SpectrumRule | null = null,
): Record<string, number | null> {
  const placed: Foot[] = [];
  const out: Record<string, number | null> = {};

  const locked = items.filter((i) => i.locked && i.assigned != null);
  const open = items
    .filter((i) => !(i.locked && i.assigned != null))
    .sort((a, b) => b.priority - a.priority || a.bandMin - b.bandMin || a.id.localeCompare(b.id));

  for (const item of locked) {
    const center = item.assigned as number;
    placed.push(footprint(item, center));
    out[item.id] = center;
  }

  for (const item of open) {
    const found = search(item, placed, blockers, spacing, rule);
    out[item.id] = found;
    if (found != null) placed.push(footprint(item, found));
  }
  return out;
}

export function audit(
  items: CoordItem[],
  assigned: Record<string, number | null>,
  blockers: BandBlock[],
  spacing: Spacing,
  rule: SpectrumRule | null = null,
): Issue[] {
  const issues: Issue[] = [];
  const feet: { item: CoordItem; foot: Foot }[] = [];
  for (const item of items) {
    const mhz = assigned[item.id];
    if (mhz == null) {
      issues.push({
        severity: "warn",
        ids: [item.id],
        message: blankReason(item, rule),
      });
      continue;
    }
    feet.push({ item, foot: footprint(item, mhz) });
    const step = tuneStepOf(item);
    if (step && item.mode === "carrier" && !onTuneGrid(mhz, step)) {
      const down = snapCarrier(mhz, step);
      const up = down < mhz ? addStep(down, step) : down;
      issues.push({
        severity: "bad",
        ids: [item.id],
        message: `Not a tuneable step. Radio mics move in ${step} MHz increments, so ${mhz} has to be ${down} or ${up}.`,
      });
    }
  }

  for (const { item, foot } of feet) {
    if (outsideRule(item, foot, rule)) {
      issues.push({
        severity: "bad",
        ids: [foot.id],
        message: "Outside the ACMA LIPD window. Wireless audio stays above 520 MHz and below 694 MHz.",
      });
    }
    const gap = hitsGap(item, foot);
    if (gap) {
      issues.push({
        severity: "bad",
        ids: [foot.id],
        message: `Sits in a hardware gap (${gap.min}–${gap.max} MHz).`,
      });
    }
    const block = hitsBlocker(foot, blockers);
    if (block) {
      issues.push({
        severity: "bad",
        ids: [foot.id],
        message: `Sits on a keep-out${block.label ? ` (${block.label})` : ""}.`,
      });
    }
  }

  for (let i = 0; i < feet.length; i++) {
    for (let j = i + 1; j < feet.length; j++) {
      const a = feet[i]!.foot;
      const b = feet[j]!.foot;
      if (!together(a, b)) continue;
      if (rangesOverlap(a.min, a.max, b.min, b.max, GUARD[spacing])) {
        issues.push({
          severity: "bad",
          ids: [a.id, b.id],
          message: "Too close for the selected spacing profile.",
        });
      }
    }
  }

  const carriers = feet.filter((f) => f.foot.mode === "carrier");
  for (let i = 0; i < carriers.length; i++) {
    const host = carriers[i]!.foot;
    const others = carriers.filter((c) => c.foot.id !== host.id && together(host, c.foot)).map((c) => c.foot.center);
    if (imdHit(host.center, others, IMD[spacing])) {
      issues.push({
        severity: "bad",
        ids: [host.id],
        message: "Intermod product lands on this carrier.",
      });
    }
  }

  return issues.slice(0, 60);
}

function toMhz(raw: number): number {
  if (!Number.isFinite(raw)) return NaN;
  // WWB/WSM sometimes export Hz. A radio-mic scan above 20,000 is almost certainly Hz.
  if (raw > 20000) return raw / 1_000_000;
  if (raw > 2000) return raw / 1000;
  return raw;
}

export function parseScan(body: string, threshold: number): BandBlock[] {
  const blocks: BandBlock[] = [];
  for (const line of body.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || t.startsWith("//")) continue;
    if (/^(freq|frequency|mhz|channel|index)/i.test(t)) continue;
    const parts = t.split(/[,;\t]+/).map((p) => p.trim()).filter(Boolean);
    const flat = parts.length > 1 ? parts : t.split(/\s+/).filter(Boolean);
    const nums = flat.map((p) => Number(p.replace(/[^0-9.+-]/g, ""))).filter((n) => Number.isFinite(n));
    if (nums.length === 0) continue;
    const mhz = toMhz(nums[0]!);
    if (!Number.isFinite(mhz) || mhz < 20 || mhz > 8000) continue;
    const level = nums.length > 1 ? nums[1]! : null;
    if (level != null && level < threshold) continue;
    const width = nums.length > 2 && nums[2]! > 0 && nums[2]! < 20 ? nums[2]! : 0.2;
    blocks.push({ min: mhz - width / 2, max: mhz + width / 2, label: "Scan" });
  }
  return blocks;
}

export type IntermodHit = {
  order: 2 | 3 | 5;
  product: number;
  formula: string;
  hits: string;
  severity: "fail" | "warn" | "note";
  guardMhz: number;
  powerMw: number;
};

function guardFor(mw: number, order: 2 | 3 | 5): number {
  const power = Math.max(1, mw);
  const db = 10 * Math.log10(power / 10);
  const scale = order === 2 ? 2 : order === 5 ? 5 : 3;
  const extra = Math.max(0, (db * scale) / 30);
  return Math.round(0.25 * (1 + extra) * 1000) / 1000;
}

function severityFor(order: 2 | 3 | 5, mw: number): "fail" | "warn" | "note" {
  if (order === 3 && mw >= 50) return "fail";
  if (order === 3 && mw >= 20) return "warn";
  if (order === 2 && mw >= 20) return "warn";
  if (order === 5 && mw >= 50) return "warn";
  return "note";
}

/** 2nd, 3rd and 5th order products that land on an assigned carrier. Guard widens with power. */
export function intermodHits(
  carriers: { id: string; label: string; mhz: number; powerMw?: number }[],
): IntermodHit[] {
  const hits: IntermodHit[] = [];
  const seen = new Set<string>();
  const near = (product: number, window: number) =>
    carriers.filter((c) => Math.abs(c.mhz - product) <= window);
  const push = (
    order: 2 | 3 | 5,
    product: number,
    formula: string,
    landed: { label: string }[],
    powerMw: number,
  ) => {
    if (landed.length === 0 || !Number.isFinite(product) || product < 30 || product > 8000) return;
    const key = `${order}:${formula}:${landed.map((l) => l.label).join(",")}`;
    if (seen.has(key)) return;
    seen.add(key);
    hits.push({
      order,
      product: Math.round(product * 1000) / 1000,
      formula,
      hits: landed.map((l) => l.label).join(", "),
      severity: severityFor(order, powerMw),
      guardMhz: guardFor(powerMw, order),
      powerMw,
    });
  };
  const n = carriers.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const a = carriers[i]!;
      const b = carriers[j]!;
      const loud = Math.max(a.powerMw ?? 10, b.powerMw ?? 10);
      push(2, a.mhz + b.mhz, `${a.label}+${b.label}`, near(a.mhz + b.mhz, guardFor(loud, 2)), loud);
      push(2, Math.abs(a.mhz - b.mhz), `|${a.label}-${b.label}|`, near(Math.abs(a.mhz - b.mhz), guardFor(loud, 2)), loud);
      const third = 2 * a.mhz - b.mhz;
      push(3, third, `2${a.label}-${b.label}`, near(third, guardFor(loud, 3)).filter((c) => c.id !== a.id && c.id !== b.id), loud);
      const fifth = 3 * a.mhz - 2 * b.mhz;
      push(5, fifth, `3${a.label}-2${b.label}`, near(fifth, guardFor(loud, 5)).filter((c) => c.id !== a.id && c.id !== b.id), loud);
    }
  }
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      for (let k = 0; k < n; k++) {
        if (k === i || k === j) continue;
        const a = carriers[i]!;
        const b = carriers[j]!;
        const c = carriers[k]!;
        const p = a.mhz + b.mhz - c.mhz;
        const loud = Math.max(a.powerMw ?? 10, b.powerMw ?? 10, c.powerMw ?? 10);
        push(3, p, `${a.label}+${b.label}-${c.label}`, near(p, guardFor(loud, 3)).filter((x) => x.id !== a.id && x.id !== b.id && x.id !== c.id), loud);
      }
    }
  }
  return hits.sort((x, y) => x.order - y.order || x.product - y.product).slice(0, 40);
}

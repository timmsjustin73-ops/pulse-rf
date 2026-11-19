export type Category = "audio" | "video" | "lighting" | "comms";
export type DeviceMode = "carrier" | "band";
export type Spacing = "resilience" | "balanced" | "density";
export type Priority = "critical" | "high" | "normal" | "low";
export type Role = "manager" | "contributor" | "viewer";

export type CatalogDevice = {
  key: string;
  category: Category;
  manufacturer: string;
  name: string;
  bandMin: number;
  bandMax: number;
  bandwidth: number;
  mode: DeviceMode;
  power: string;
  /** Carrier tune increment in MHz. UHF radio mics are 0.005. */
  tuneStep?: number;
  note?: string;
  /** Hardware holes inside the tuning range, such as 608–614 MHz. */
  gaps?: { min: number; max: number }[];
};

export type Blocker = { min: number; max: number; label: string };

export const CATEGORIES: { id: Category; label: string; hint: string }[] = [
  { id: "audio", label: "Audio", hint: "Mics, IEMs, IFB" },
  { id: "video", label: "Video", hint: "Cameras and links" },
  { id: "lighting", label: "Lighting", hint: "Wireless DMX" },
  { id: "comms", label: "Comms", hint: "Intercom and radios" },
];

export const SPACINGS: { id: Spacing; label: string; hint: string }[] = [
  { id: "resilience", label: "Resilience", hint: "Widest guard. Hero shows and noisy sites." },
  { id: "balanced", label: "Balanced", hint: "Default. Clean with room for a full plot." },
  { id: "density", label: "Density", hint: "Tighter packing when the band is full." },
];

export const PRIORITIES: { id: Priority; label: string; rank: number }[] = [
  { id: "critical", label: "Critical", rank: 4 },
  { id: "high", label: "High", rank: 3 },
  { id: "normal", label: "Normal", rank: 2 },
  { id: "low", label: "Low", rank: 1 },
];

export const REGIONS: { id: string; label: string }[] = [
  { id: "AU", label: "Australia" },
  { id: "US", label: "United States" },
  { id: "UK", label: "United Kingdom" },
  { id: "EU", label: "Europe" },
  { id: "NONE", label: "No broadcast examples" },
];

/** Planning ranges for common professional wireless. Not a licence or type-approval database. */
const LIPD = "Above 520 MHz and below 694 MHz is the general ACMA LIPD window. Frequencies below 520 MHz are not in those bands.";
const STEP = "Tunes in 0.005 MHz steps.";
const GAP = "Hardware gap 608–614 MHz.";

export const CATALOG: CatalogDevice[] = [
  {
    key: "slxd-h57",
    category: "audio",
    manufacturer: "Shure",
    name: "SLX-D H57 (520–564)",
    bandMin: 520,
    bandMax: 564,
    bandwidth: 0.2,
    mode: "carrier",
    power: "1/10 mW",
    tuneStep: 0.005,
    note: `SLX-D. Fully inside the LIPD window. ${STEP}`,
  },
  {
    key: "slxd-h58",
    category: "audio",
    manufacturer: "Shure",
    name: "SLX-D+ H58 (520–606)",
    bandMin: 520,
    bandMax: 606,
    bandwidth: 0.2,
    mode: "carrier",
    power: "1/10/30 mW",
    tuneStep: 0.005,
    note: `SLX-D+ Australia. 86 MHz tuning range. ${STEP}`,
  },
  {
    key: "blx-k14",
    category: "audio",
    manufacturer: "Shure",
    name: "BLX K14 (614–638)",
    bandMin: 614,
    bandMax: 638,
    bandwidth: 0.2,
    mode: "carrier",
    power: "10 mW",
    tuneStep: 0.005,
    note: `BLX Australia. Inside 520–694 MHz. ${STEP}`,
  },
  {
    key: "blx-m17",
    category: "audio",
    manufacturer: "Shure",
    name: "BLX M17 (662–686)",
    bandMin: 662,
    bandMax: 686,
    bandwidth: 0.2,
    mode: "carrier",
    power: "10 mW",
    tuneStep: 0.005,
    note: `BLX Australia. Inside the permitted 520–694 MHz window. ${STEP}`,
  },
  {
    key: "ad-g57",
    category: "audio",
    manufacturer: "Shure",
    name: "Axient Digital G57 (470–616)",
    bandMin: 470,
    bandMax: 616,
    bandwidth: 0.2,
    mode: "carrier",
    power: "2–35 mW",
    tuneStep: 0.005,
    gaps: [{ min: 608, max: 614 }],
    note: `Axient Digital, listed for Australia. ${LIPD} ${GAP} ${STEP}`,
  },
  {
    key: "ad-h54",
    category: "audio",
    manufacturer: "Shure",
    name: "Axient Digital H54 (520–636)",
    bandMin: 520,
    bandMax: 636,
    bandwidth: 0.2,
    mode: "carrier",
    power: "2–35 mW",
    tuneStep: 0.005,
    note: `Axient Digital, listed for Australia. Starts on the 520 MHz LIPD edge and stays under 694. ${STEP}`,
  },
  {
    key: "ad-g55",
    category: "audio",
    manufacturer: "Shure",
    name: "Axient Digital G55 (470–636)",
    bandMin: 470,
    bandMax: 636,
    bandwidth: 0.2,
    mode: "carrier",
    power: "2–35 mW",
    tuneStep: 0.005,
    gaps: [{ min: 608, max: 614 }],
    note: `Axient Digital, listed for Australia. ${LIPD} ${GAP} ${STEP}`,
  },
  {
    key: "ulxd-h51",
    category: "audio",
    manufacturer: "Shure",
    name: "ULX-D H51 (534–598)",
    bandMin: 534,
    bandMax: 598,
    bandwidth: 0.2,
    mode: "carrier",
    power: "1–20 mW",
    tuneStep: 0.005,
    note: `ULX-D Australia on Shure Asia. Inside the LIPD window. ${STEP}`,
  },
  {
    key: "psm",
    category: "audio",
    manufacturer: "Shure",
    name: "PSM 1000 J8E (554–626)",
    bandMin: 554,
    bandMax: 626,
    bandwidth: 0.2,
    mode: "carrier",
    power: "10–50 mW",
    tuneStep: 0.005,
    note: `One Australia PSM 1000 range. Other local splits exist. ${STEP}`,
  },
  {
    key: "glxd-24",
    category: "audio",
    manufacturer: "Shure",
    name: "GLX-D+ 2.4 GHz",
    bandMin: 2400,
    bandMax: 2483.5,
    bandwidth: 83.5,
    mode: "band",
    power: "Dual-band FHSS",
    note: "GLX-D+ uses 2.4 GHz and 5.8 GHz together. Add the 5.8 GHz slice as well.",
  },
  {
    key: "glxd-58",
    category: "audio",
    manufacturer: "Shure",
    name: "GLX-D+ 5.8 GHz",
    bandMin: 5725,
    bandMax: 5850,
    bandwidth: 125,
    mode: "band",
    power: "Dual-band FHSS",
    note: "GLX-D+ uses 2.4 GHz and 5.8 GHz together. Add the 2.4 GHz slice as well.",
  },
  {
    key: "ewdx",
    category: "audio",
    manufacturer: "Sennheiser",
    name: "EW-DX handheld",
    bandMin: 470,
    bandMax: 608,
    bandwidth: 0.2,
    mode: "carrier",
    power: "10 mW",
    tuneStep: 0.005,
    note: `Wide planning range. On an Australia show only the slice inside 520–694 MHz is used. ${STEP}`,
  },
  {
    key: "smwb",
    category: "audio",
    manufacturer: "Lectrosonics",
    name: "SMWB transmitter",
    bandMin: 470,
    bandMax: 614,
    bandwidth: 0.2,
    mode: "carrier",
    power: "50 mW",
    tuneStep: 0.005,
    note: `Wide planning range. Australia shows stay above 520 MHz and below 694 MHz. ${STEP}`,
  },
  {
    key: "mth",
    category: "audio",
    manufacturer: "Wisycom",
    name: "MTH410 handheld",
    bandMin: 470,
    bandMax: 663,
    bandwidth: 0.2,
    mode: "carrier",
    power: "10–50 mW",
    tuneStep: 0.005,
    note: `Wide planning range. Australia shows stay above 520 MHz and below 694 MHz. ${STEP}`,
  },
  {
    key: "ewiem",
    category: "audio",
    manufacturer: "Sennheiser",
    name: "EW IEM",
    bandMin: 470,
    bandMax: 558,
    bandwidth: 0.2,
    mode: "carrier",
    power: "30 mW",
    tuneStep: 0.005,
    note: `Wide planning range. Australia shows stay above 520 MHz. ${STEP}`,
  },
  {
    key: "ifb",
    category: "audio",
    manufacturer: "Lectrosonics",
    name: "IFB transmitter",
    bandMin: 470,
    bandMax: 614,
    bandwidth: 0.175,
    mode: "carrier",
    power: "50 mW",
    tuneStep: 0.005,
    note: `Wide planning range. Australia shows stay above 520 MHz and below 694 MHz. ${STEP}`,
  },
  { key: "bolt", category: "video", manufacturer: "Teradek", name: "Bolt 4K", bandMin: 5180, bandMax: 5825, bandwidth: 20, mode: "carrier", power: "5 GHz" },
  { key: "hcam", category: "video", manufacturer: "Vislink", name: "HCam 2 GHz", bandMin: 2025, bandMax: 2110, bandwidth: 8, mode: "carrier", power: "Licensed 2 GHz" },
  { key: "dji", category: "video", manufacturer: "DJI", name: "Transmission", bandMin: 5150, bandMax: 5850, bandwidth: 20, mode: "carrier", power: "5 GHz" },
  { key: "crmx", category: "lighting", manufacturer: "LumenRadio", name: "CRMX", bandMin: 2402, bandMax: 2480, bandwidth: 78, mode: "band", power: "FHSS 2.4 GHz" },
  { key: "multiverse", category: "lighting", manufacturer: "City Theatrical", name: "Multiverse", bandMin: 2402, bandMax: 2480, bandwidth: 78, mode: "band", power: "FHSS 2.4 GHz" },
  {
    key: "btr",
    category: "comms",
    manufacturer: "RTS",
    name: "BTR-800 base",
    bandMin: 470,
    bandMax: 608,
    bandwidth: 0.2,
    mode: "carrier",
    power: "50 mW",
    tuneStep: 0.005,
    note: `UHF intercom. Australia shows keep this above 520 MHz. ${STEP}`,
  },
  { key: "fsii", category: "comms", manufacturer: "Clear-Com", name: "FreeSpeak II 1.9", bandMin: 1880, bandMax: 1900, bandwidth: 20, mode: "band", power: "DECT" },
  { key: "solidcom", category: "comms", manufacturer: "Hollyland", name: "Solidcom", bandMin: 1880, bandMax: 1900, bandwidth: 20, mode: "band", power: "1.9 GHz" },
  {
    key: "moto",
    category: "comms",
    manufacturer: "Motorola",
    name: "DP4801 UHF",
    bandMin: 403,
    bandMax: 470,
    bandwidth: 0.0125,
    mode: "carrier",
    power: "1–4 W",
    tuneStep: 0.0125,
    note: "Licensed land-mobile. 12.5 kHz channels, not a 5 kHz radio mic.",
  },
];

export function priorityRank(id: string): number {
  return PRIORITIES.find((p) => p.id === id)?.rank ?? 2;
}

export function categoryLabel(id: string): string {
  return CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

/** Example occupied TV channels to keep clear. Edit per show — not a live licence feed. */
export function defaultBlockers(region: string): Blocker[] {
  switch (region) {
    case "AU":
      return [
        { min: 184, max: 191, label: "Example VHF TV channel" },
        { min: 219, max: 226, label: "Example VHF TV channel" },
        { min: 536, max: 543, label: "Example UHF TV channel" },
        { min: 564, max: 571, label: "Example UHF TV channel" },
      ];
    case "US":
      return [
        { min: 512, max: 518, label: "Example UHF TV channel" },
        { min: 560, max: 566, label: "Example UHF TV channel" },
        { min: 608, max: 614, label: "600 MHz edge" },
      ];
    case "UK":
      return [
        { min: 474, max: 482, label: "Example DVB-T channel" },
        { min: 550, max: 558, label: "Example DVB-T channel" },
      ];
    case "EU":
      return [
        { min: 482, max: 490, label: "Example DVB-T channel" },
        { min: 546, max: 554, label: "Example DVB-T channel" },
      ];
    default:
      return [];
  }
}

export function formatMhz(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  if (n >= 1000) return n.toFixed(1);
  if (n >= 100) return n.toFixed(3);
  return n.toFixed(4);
}

export function parseClock(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function clockLabel(mins: number | null): string {
  if (mins == null) return "All day";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

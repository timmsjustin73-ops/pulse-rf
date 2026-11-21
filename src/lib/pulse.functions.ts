import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import {
  CATALOG,
  defaultBlockers,
  priorityRank,
  parseClock,
  type Role,
  type Blocker,
} from "@/lib/catalog";
import { audit, coordinate, intermodHits, parseScan, snapCarrier, spectrumRuleFor, tuneStepOf, type BandBlock, type CoordItem } from "@/lib/coord";

const RANK: Record<Role, number> = { viewer: 0, contributor: 1, tech: 1, manager: 2 };

function isRole(v: string): v is Role {
  return v === "manager" || v === "tech" || v === "contributor" || v === "viewer";
}

function asRole(v: string): Role {
  if (v === "contributor") return "tech";
  return isRole(v) ? v : "viewer";
}

async function isPlatformAdmin(sql: Sql, userId: string): Promise<boolean> {
  const rows = await sql<{ user_id: string }>`select user_id from platform_admins where user_id = ${userId}`;
  if (rows.length > 0) return true;
  const wanted = (process.env.PULSE_ADMIN_EMAIL ?? "").trim().toLowerCase();
  if (!wanted) return false;
  const users = await sql<{ email: string }>`select email from "user" where id = ${userId}`;
  if (users[0]?.email?.toLowerCase() === wanted) {
    await sql`insert into platform_admins (user_id) values (${userId}) on conflict do nothing`;
    return true;
  }
  return false;
}

async function companyOf(sql: Sql, userId: string): Promise<{ id: string; name: string } | null> {
  const rows = await sql<{ id: string; name: string }>`
    select c.id, c.name
    from company_members m
    join companies c on c.id = m.company_id
    where m.user_id = ${userId}
    limit 1
  `;
  return rows[0] ?? null;
}

function uid(): string {
  return crypto.randomUUID();
}

function makeCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]!).join("");
}

type EventRow = {
  id: string;
  owner_id: string;
  name: string;
  venue: string;
  city: string;
  region: string;
  starts_on: string;
  ends_on: string;
  spacing: string;
  notes: string;
  join_code: string;
  join_role: string;
  blockers: string;
  created_at: string;
  share_token: string | null;
  plot_locked: boolean;
};

type ZoneRow = { id: string; event_id: string; name: string; isolated: boolean };
type RequestRow = {
  id: string;
  event_id: string;
  zone_id: string | null;
  created_by: string;
  category: string;
  label: string;
  device_key: string;
  device_name: string;
  manufacturer: string;
  band_min: number;
  band_max: number;
  bandwidth: number;
  mode: string;
  priority: string;
  time_start: string | null;
  time_end: string | null;
  notes: string;
  locked: boolean;
  assigned_mhz: number | null;
  created_at: string;
  batch_id: string | null;
  tuned_at: string | null;
  tuned_by: string | null;
  spare: boolean;
  power_mw: number;
  flag_reason: string | null;
  flagged_mhz: number | null;
  walkup: boolean;
};
type ScanRow = {
  id: string;
  event_id: string;
  label: string;
  body: string;
  threshold: number;
  created_at: string;
};

function flag(v: unknown): boolean {
  return v === true || v === "t" || v === "true" || v === 1;
}

function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v);
}

function parseBlockers(raw: string): Blocker[] {
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as { min?: unknown; max?: unknown; label?: unknown };
      const min = Number(row.min);
      const max = Number(row.max);
      if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [];
      return [{ min, max, label: typeof row.label === "string" ? row.label : "Keep-out" }];
    });
  } catch {
    return [];
  }
}

async function requireAccess(sql: Sql, eventId: string, userId: string, min: Role) {
  if (await isPlatformAdmin(sql, userId)) {
    const owners = await sql<{ owner_id: string }>`select owner_id from events where id = ${eventId}`;
    if (owners.length === 0) throw new Error("Event not found.");
    return { role: "manager", owner_id: owners[0]!.owner_id };
  }
  const rows = await sql<{ role: string; owner_id: string }>`
    select m.role, e.owner_id
    from events e
    join event_members m on m.event_id = e.id and m.user_id = ${userId}
    where e.id = ${eventId}
  `;
  const row = rows[0];
  if (!row || !isRole(row.role)) throw new Error("You don't have access to this event.");
  if (RANK[asRole(row.role)] < RANK[asRole(min)]) throw new Error("Your role can't do that.");
  return { role: asRole(row.role), owner_id: row.owner_id };
}

async function logActivity(sql: Sql, eventId: string, userId: string, message: string) {
  await sql`
    insert into activity (id, event_id, user_id, message)
    values (${uid()}, ${eventId}, ${userId}, ${message.slice(0, 240)})
  `;
}

function toItems(requests: RequestRow[], zones: ZoneRow[], groups: { zone_id: string; group_id: string }[] = []): CoordItem[] {
  const byZone = new Map<string, string[]>();
  for (const g of groups) {
    const cur = byZone.get(g.zone_id) ?? [];
    cur.push(g.group_id);
    byZone.set(g.zone_id, cur);
  }
  const zoneMap = new Map(zones.map((z) => [z.id, z]));
  return requests.map((r) => {
    const zone = r.zone_id ? zoneMap.get(r.zone_id) : undefined;
    const preset = CATALOG.find((d) => d.key === r.device_key);
    return {
      id: r.id,
      bandMin: r.band_min,
      bandMax: r.band_max,
      bandwidth: r.bandwidth,
      mode: r.mode === "band" ? "band" : "carrier",
      zoneId: zone?.id ?? "site",
      isolated: zone ? zone.isolated : false,
      groupIds: zone ? byZone.get(zone.id) ?? [] : [],
      t0: parseClock(r.time_start),
      t1: parseClock(r.time_end),
      priority: priorityRank(r.priority),
      locked: r.locked,
      assigned: r.assigned_mhz,
      tuneStep: preset?.tuneStep,
      gaps: preset?.gaps,
      powerMw: r.power_mw == null ? 10 : num(r.power_mw),
    };
  });
}

function allBlockers(event: EventRow, scans: ScanRow[]): BandBlock[] {
  const blocks: BandBlock[] = parseBlockers(event.blockers).map((b) => ({
    min: b.min,
    max: b.max,
    label: b.label,
  }));
  for (const scan of scans) blocks.push(...parseScan(scan.body, num(scan.threshold)));
  return blocks;
}

async function loadBundle(sql: Sql, eventId: string, userId: string) {
  await requireAccess(sql, eventId, userId, "viewer");
  const events = await sql<EventRow>`select * from events where id = ${eventId}`;
  const event = events[0];
  if (!event) throw new Error("Event not found.");
  const zones = await sql<ZoneRow>`select * from zones where event_id = ${eventId} order by name`;
  const groupRows = await sql<{ id: string; name: string; zone_id: string | null }>`
    select g.id, g.name, gz.zone_id
    from area_groups g
    left join area_group_zones gz on gz.group_id = g.id
    where g.event_id = ${eventId}
    order by g.name
  `;
  const groupLinks = groupRows.filter((g) => g.zone_id).map((g) => ({ zone_id: g.zone_id as string, group_id: g.id }));
  const requests = await sql<RequestRow>`
    select * from requests where event_id = ${eventId} order by category, label
  `;
  const scans = await sql<ScanRow>`select * from scans where event_id = ${eventId} order by created_at desc`;
  const antennas = await sql<{
    id: string; name: string; power_mw: number; gain_dbi: number; freq_mhz: number;
    height_m: number; threshold_dbm: number; margin_db: number;
  }>`select id, name, power_mw, gain_dbi, freq_mhz, height_m, threshold_dbm, margin_db from antennas where event_id = ${eventId} order by name`;
  const members = await sql<{ user_id: string; role: string; name: string | null; email: string | null; company: string | null }>`
    select m.user_id, m.role, u.name, u.email, c.name as company
    from event_members m
    left join "user" u on u.id = m.user_id
    left join company_members cm on cm.user_id = m.user_id
    left join companies c on c.id = cm.company_id
    where m.event_id = ${eventId}
    order by m.role, u.name
  `;
  const activity = await sql<{ id: string; message: string; created_at: string; name: string | null }>`
    select a.id, a.message, a.created_at, u.name
    from activity a
    left join "user" u on u.id = a.user_id
    where a.event_id = ${eventId}
    order by a.created_at desc
    limit 12
  `;
  const mine = members.find((m) => m.user_id === userId);
  const admin = await isPlatformAdmin(sql, userId);
  const company = await companyOf(sql, userId);
  const batches = await sql<{
    id: string; zone_id: string | null; created_by: string; title: string; status: string; notes: string; created_at: string; return_note: string;
  }>`select id, zone_id, created_by, title, status, notes, created_at, return_note from request_batches where event_id = ${eventId} order by created_at desc`;
  const companyIds = company
    ? (await sql<{ user_id: string }>`select user_id from company_members where company_id = ${company.id}`).map((r) => r.user_id)
    : [];
  const zonesClean = zones.map((z) => ({ ...z, isolated: flag(z.isolated) }));
  const requestsClean = requests.map((r) => ({
    ...r,
    band_min: num(r.band_min),
    band_max: num(r.band_max),
    bandwidth: num(r.bandwidth),
    locked: flag(r.locked),
    assigned_mhz: r.assigned_mhz == null ? null : num(r.assigned_mhz),
  }));
  const holds = await sql<{ id: string; zone_id: string | null; mhz: number; label: string }>`
    select id, zone_id, mhz, label from holds where event_id = ${eventId} order by mhz
  `;
  const blockers = allBlockers(event, scans);
  for (const hold of holds) blockers.push({ min: num(hold.mhz) - 0.1, max: num(hold.mhz) + 0.1, label: hold.label });
  for (const r of requestsClean) {
    if (r.flag_reason && r.flagged_mhz != null) {
      blockers.push({ min: num(r.flagged_mhz) - 0.25, max: num(r.flagged_mhz) + 0.25, label: `Interference: ${r.flag_reason}` });
    }
  }
  const items = toItems(requestsClean, zonesClean, groupLinks);
  const assigned: Record<string, number | null> = {};
  for (const r of requestsClean) assigned[r.id] = r.assigned_mhz;
  const issues = audit(
    items,
    assigned,
    blockers,
    event.spacing === "resilience" || event.spacing === "density" ? event.spacing : "balanced",
    spectrumRuleFor(event.region),
  );
  return {
    event: {
      ...event,
      blockers: parseBlockers(event.blockers),
    },
    role: admin ? "manager" : mine ? asRole(mine.role) : "viewer",
    isAdmin: admin,
    company,
    companyUserIds: companyIds,
    isOwner: event.owner_id === userId,
    zones: zonesClean,
    requests: requestsClean,
    scans: scans.map((s) => {
      const marks = parseScan(s.body, num(s.threshold));
      return {
        id: s.id,
        label: s.label,
        threshold: num(s.threshold),
        hits: marks.length,
        marks: marks.map((m) => ({ min: m.min, max: m.max })),
        created_at: s.created_at,
      };
    }),
    members,
    activity,
    issues,
    groups: [...new Map(groupRows.map((g) => [g.id, { id: g.id, name: g.name, zoneIds: groupRows.filter((r) => r.id === g.id && r.zone_id).map((r) => r.zone_id as string) }])).values()],
    holds: holds.map((h) => ({ ...h, mhz: num(h.mhz) })),
    batches,
    intermods: intermodHits(
      requestsClean
        .filter((r) => r.assigned_mhz != null)
        .map((r) => ({ id: r.id, label: r.label, mhz: r.assigned_mhz as number, powerMw: r.power_mw == null ? 10 : num(r.power_mw) })),
    ),
    antennas: antennas.map((a) => ({
      id: a.id,
      name: a.name,
      powerMw: num(a.power_mw),
      gainDbi: num(a.gain_dbi),
      freqMhz: num(a.freq_mhz),
      heightM: num(a.height_m),
      thresholdDbm: num(a.threshold_dbm),
      marginDb: num(a.margin_db),
    })),
  };
}

async function insertEvent(
  sql: Sql,
  userId: string,
  input: {
    name: string;
    venue: string;
    city: string;
    region: string;
    startsOn: string;
    endsOn: string;
    spacing: string;
    notes: string;
  },
) {
  const id = uid();
  let join = makeCode();
  for (let i = 0; i < 4; i++) {
    const taken = await sql<{ id: string }>`select id from events where join_code = ${join}`;
    if (taken.length === 0) break;
    join = makeCode();
  }
  const blockers = JSON.stringify(defaultBlockers(input.region));
  await sql`
    insert into events (id, owner_id, name, venue, city, region, starts_on, ends_on, spacing, notes, join_code, blockers)
    values (
      ${id}, ${userId}, ${input.name}, ${input.venue}, ${input.city}, ${input.region},
      ${input.startsOn}, ${input.endsOn}, ${input.spacing}, ${input.notes}, ${join}, ${blockers}
    )
  `;
  await sql`
    insert into event_members (event_id, user_id, role) values (${id}, ${userId}, ${"manager"})
  `;
  await sql`
    insert into zones (id, event_id, name, isolated) values (${uid()}, ${id}, ${"Site-wide"}, ${false})
  `;
  await logActivity(sql, id, userId, "Opened the event.");
  return id;
}

const eventInput = z.object({
  name: z.string().trim().min(1).max(120),
  venue: z.string().trim().max(120).optional().default(""),
  city: z.string().trim().max(80).optional().default(""),
  region: z.string().trim().max(8).optional().default("AU"),
  startsOn: z.string().trim().max(10).optional().default(""),
  endsOn: z.string().trim().max(10).optional().default(""),
  spacing: z.enum(["resilience", "balanced", "density"]).optional().default("balanced"),
  notes: z.string().trim().max(2000).optional().default(""),
});

export const listEvents = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const admin = await isPlatformAdmin(sql, context.userId);
    const events = admin
      ? await sql<EventRow & { role: string }>`
          select e.*, 'manager' as role from events e order by e.created_at desc
        `
      : await sql<EventRow & { role: string }>`
          select e.*, m.role
          from events e
          join event_members m on m.event_id = e.id
          where m.user_id = ${context.userId}
          order by e.created_at desc
        `;
    const stats = await sql<{ event_id: string; total: number; assigned: number }>`
      select r.event_id,
             count(*)::int as total,
             count(r.assigned_mhz)::int as assigned
      from requests r
      join event_members m on m.event_id = r.event_id
      where m.user_id = ${context.userId}
      group by r.event_id
    `;
    const byId = new Map(stats.map((s) => [s.event_id, s]));
    return events.map((e) => ({
      id: e.id,
      name: e.name,
      venue: e.venue,
      city: e.city,
      region: e.region,
      startsOn: e.starts_on,
      endsOn: e.ends_on,
      spacing: e.spacing,
      joinCode: e.join_code,
      role: e.role,
      total: byId.get(e.id)?.total ?? 0,
      assigned: byId.get(e.id)?.assigned ?? 0,
    }));
  });

export const createEvent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(eventInput)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const id = await insertEvent(sql, context.userId, data);
    return { id };
  });

export const joinEvent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ code: z.string().trim().min(4).max(12) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const code = data.code.toUpperCase();
    const rows = await sql<{ id: string; join_role: string }>`
      select id, join_role from events where join_code = ${code}
    `;
    const event = rows[0];
    if (!event) throw new Error("No event uses that code.");
    const role: Role = event.join_role === "viewer" ? "viewer" : "tech";
    await sql`
      insert into event_members (event_id, user_id, role)
      values (${event.id}, ${context.userId}, ${role})
      on conflict (event_id, user_id) do nothing
    `;
    await logActivity(sql, event.id, context.userId, "Joined the event.");
    return { id: event.id };
  });

export const getEvent = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ eventId: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    return loadBundle(sql, data.eventId, context.userId);
  });

export const updateEvent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    eventInput.extend({
      eventId: z.string().min(1),
      joinRole: z.enum(["contributor", "viewer"]),
      blockers: z.array(
        z.object({
          min: z.number(),
          max: z.number(),
          label: z.string().max(80),
        }),
      ),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireAccess(sql, data.eventId, context.userId, "manager");
    const blockers = JSON.stringify(
      data.blockers.filter((b) => Number.isFinite(b.min) && Number.isFinite(b.max) && b.max > b.min).slice(0, 40),
    );
    await sql`
      update events set
        name = ${data.name},
        venue = ${data.venue},
        city = ${data.city},
        region = ${data.region},
        starts_on = ${data.startsOn},
        ends_on = ${data.endsOn},
        spacing = ${data.spacing},
        notes = ${data.notes},
        join_role = ${data.joinRole},
        blockers = ${blockers}
      where id = ${data.eventId}
    `;
    return loadBundle(sql, data.eventId, context.userId);
  });

export const deleteEvent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ eventId: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const access = await requireAccess(sql, data.eventId, context.userId, "manager");
    if (access.owner_id !== context.userId) throw new Error("Only the owner can delete the event.");
    await sql`delete from events where id = ${data.eventId}`;
    return { ok: true };
  });

export const addZone = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      eventId: z.string().min(1),
      name: z.string().trim().min(1).max(80),
      isolated: z.boolean(),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireAccess(sql, data.eventId, context.userId, "manager");
    await sql`
      insert into zones (id, event_id, name, isolated)
      values (${uid()}, ${data.eventId}, ${data.name}, ${data.isolated})
    `;
    await logActivity(sql, data.eventId, context.userId, `Added zone ${data.name}.`);
    return loadBundle(sql, data.eventId, context.userId);
  });

export const deleteZone = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ eventId: z.string().min(1), zoneId: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireAccess(sql, data.eventId, context.userId, "manager");
    const count = await sql<{ n: number }>`select count(*)::int as n from zones where event_id = ${data.eventId}`;
    if ((count[0]?.n ?? 0) <= 1) throw new Error("Keep at least one zone.");
    await sql`delete from zones where id = ${data.zoneId} and event_id = ${data.eventId}`;
    return loadBundle(sql, data.eventId, context.userId);
  });

const requestInput = z.object({
  eventId: z.string().min(1),
  category: z.enum(["audio", "video", "lighting", "comms"]),
  deviceKey: z.string().min(1).max(80),
  label: z.string().trim().min(1).max(80),
  zoneId: z.string().min(1),
  priority: z.enum(["critical", "high", "normal", "low"]),
  qty: z.number().int().min(1).max(8),
  timeStart: z.string().trim().max(5).optional().default(""),
  timeEnd: z.string().trim().max(5).optional().default(""),
  notes: z.string().trim().max(400).optional().default(""),
});

export const addRequests = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(requestInput)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireAccess(sql, data.eventId, context.userId, "contributor");
    const zones = await sql<ZoneRow>`select * from zones where event_id = ${data.eventId} and id = ${data.zoneId}`;
    if (!zones[0]) throw new Error("Pick a zone on this event.");
    let device = CATALOG.find((d) => d.key === data.deviceKey && d.category === data.category);
    if (!device && data.deviceKey.startsWith("custom:")) {
      const id = data.deviceKey.slice("custom:".length);
      const rows = await sql<{
        category: string;
        manufacturer: string;
        name: string;
        band_min: number;
        band_max: number;
        bandwidth: number;
        mode: string;
        power: string;
      }>`
        select category, manufacturer, name, band_min, band_max, bandwidth, mode, power
        from custom_devices where id = ${id} and user_id = ${context.userId}
      `;
      const row = rows[0];
      if (row && row.category === data.category) {
        device = {
          key: data.deviceKey,
          category: data.category,
          manufacturer: row.manufacturer,
          series: "Custom",
          band: "Custom",
          name: row.name,
          bandMin: row.band_min,
          bandMax: row.band_max,
          bandwidth: row.bandwidth,
          mode: row.mode === "band" ? "band" : "carrier",
          power: row.power,
        };
      }
    }
    if (!device) throw new Error("Unknown device.");
    if (device.bandMax <= device.bandMin || device.bandwidth <= 0) throw new Error("That device range is invalid.");
    const t0 = data.timeStart ? parseClock(data.timeStart) : null;
    const t1 = data.timeEnd ? parseClock(data.timeEnd) : null;
    if ((data.timeStart && t0 == null) || (data.timeEnd && t1 == null)) throw new Error("Times must look like 09:30.");
    if (t0 != null && t1 != null && t1 <= t0) throw new Error("End time has to be after the start.");
    for (let i = 0; i < data.qty; i++) {
      const label = data.qty > 1 ? `${data.label} ${i + 1}` : data.label;
      await sql`
        insert into requests (
          id, event_id, zone_id, created_by, category, label, device_key, device_name, manufacturer,
          band_min, band_max, bandwidth, mode, priority, time_start, time_end, notes
        ) values (
          ${uid()}, ${data.eventId}, ${data.zoneId}, ${context.userId}, ${data.category}, ${label},
          ${device.key}, ${device.name}, ${device.manufacturer}, ${device.bandMin}, ${device.bandMax},
          ${device.bandwidth}, ${device.mode}, ${data.priority},
          ${data.timeStart || null}, ${data.timeEnd || null}, ${data.notes}
        )
      `;
    }
    await logActivity(sql, data.eventId, context.userId, `Requested ${data.qty} × ${data.label}.`);
    return loadBundle(sql, data.eventId, context.userId);
  });

export const updateRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      eventId: z.string().min(1),
      requestId: z.string().min(1),
      locked: z.boolean(),
      assigned: z.number().nullable(),
      priority: z.enum(["critical", "high", "normal", "low"]),
      zoneId: z.string().min(1),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const access = await requireAccess(sql, data.eventId, context.userId, "contributor");
    const rows = await sql<RequestRow>`
      select * from requests where id = ${data.requestId} and event_id = ${data.eventId}
    `;
    const row = rows[0];
    if (!row) throw new Error("Request not found.");
    const manager = isRole(access.role) && RANK[access.role] >= RANK.manager;
    if (!manager && row.created_by !== context.userId) throw new Error("You can only edit your own requests.");
    if (!manager && (data.locked || data.assigned != null)) throw new Error("Only a manager can lock a frequency.");
    if (data.assigned != null && (data.assigned < 1 || data.assigned > 10000)) throw new Error("Frequency looks wrong.");
    let assigned = data.assigned;
    if (assigned != null && row.mode !== "band") {
      const preset = CATALOG.find((d) => d.key === row.device_key);
      const step = tuneStepOf({
        mode: "carrier",
        bandMax: num(row.band_max),
        bandwidth: num(row.bandwidth),
        tuneStep: preset?.tuneStep,
      });
      if (step) {
        const snapped = snapCarrier(assigned, step);
        if (snapped < num(row.band_min) || snapped > num(row.band_max)) {
          throw new Error(`Nearest ${step} MHz step is outside this tuning range.`);
        }
        if (Math.abs(snapped - assigned) > 1e-6) {
          const down = snapped;
          await logActivity(
            sql,
            data.eventId,
            context.userId,
            `Snapped ${row.label} to ${down} MHz. Radio mics tune in ${step} MHz steps.`,
          );
        }
        assigned = snapped;
      }
    }
    await sql`
      update requests set
        locked = ${data.locked || assigned != null},
        assigned_mhz = ${assigned},
        priority = ${data.priority},
        zone_id = ${data.zoneId}
      where id = ${data.requestId} and event_id = ${data.eventId}
    `;
    return loadBundle(sql, data.eventId, context.userId);
  });

export const deleteRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ eventId: z.string().min(1), requestId: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const access = await requireAccess(sql, data.eventId, context.userId, "contributor");
    const rows = await sql<{ created_by: string }>`
      select created_by from requests where id = ${data.requestId} and event_id = ${data.eventId}
    `;
    const row = rows[0];
    if (!row) throw new Error("Request not found.");
    const manager = isRole(access.role) && RANK[access.role] >= RANK.manager;
    if (!manager && row.created_by !== context.userId) throw new Error("You can only remove your own requests.");
    await sql`delete from requests where id = ${data.requestId}`;
    return loadBundle(sql, data.eventId, context.userId);
  });

async function snapshotAssignments(sql: Sql, eventId: string) {
  const rows = await sql<{ id: string; assigned_mhz: number | null; locked: boolean }>`
    select id, assigned_mhz, locked from requests where event_id = ${eventId}
  `;
  await sql`
    insert into assignment_snapshots (id, event_id, payload)
    values (${uid()}, ${eventId}, ${JSON.stringify(rows)})
  `;
  await sql`
    delete from assignment_snapshots
    where event_id = ${eventId}
      and id not in (
        select id from assignment_snapshots where event_id = ${eventId} order by created_at desc limit 8
      )
  `;
}

async function runCalc(sql: Sql, eventId: string, userId: string) {
  await requireAccess(sql, eventId, userId, "manager");
  await snapshotAssignments(sql, eventId);
  const events = await sql<EventRow>`select * from events where id = ${eventId}`;
  const event = events[0];
  if (!event) throw new Error("Event not found.");
  const zones = await sql<ZoneRow>`select * from zones where event_id = ${eventId}`;
  const requests = await sql<RequestRow>`select * from requests where event_id = ${eventId}`;
  const scans = await sql<ScanRow>`select * from scans where event_id = ${eventId}`;
  const spacing = event.spacing === "resilience" || event.spacing === "density" ? event.spacing : "balanced";
  const groupLinks = await sql<{ zone_id: string; group_id: string }>`
    select gz.zone_id, gz.group_id
    from area_group_zones gz
    join area_groups g on g.id = gz.group_id
    where g.event_id = ${eventId}
  `;
  const result = coordinate(toItems(requests, zones, groupLinks), allBlockers(event, scans), spacing, spectrumRuleFor(event.region));
  for (const r of requests) {
    if (r.locked && r.assigned_mhz != null) continue;
    const mhz = result[r.id] ?? null;
    await sql`
      update requests set assigned_mhz = ${mhz}, locked = ${false}
      where id = ${r.id}
    `;
  }
  const open = requests.filter((r) => !(r.locked && r.assigned_mhz != null)).length;
  const placed = requests.filter((r) => !(r.locked && r.assigned_mhz != null) && result[r.id] != null).length;
  await logActivity(sql, eventId, userId, `Coordinated ${placed} of ${open} open channels.`);
  const owners = [...new Set(requests.map((r) => r.created_by))];
  for (const owner of owners) {
    if (owner === userId) continue;
    await sql`
      insert into notifications (id, user_id, event_id, message)
      values (${uid()}, ${owner}, ${eventId}, ${"Your request was coordinated. Check assigned frequencies."})
    `;
  }
}

export const recalculate = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ eventId: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await runCalc(sql, data.eventId, context.userId);
    return loadBundle(sql, data.eventId, context.userId);
  });

export const addScan = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      eventId: z.string().min(1),
      label: z.string().trim().min(1).max(80),
      body: z.string().min(1).max(100000),
      threshold: z.number().min(-140).max(20),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireAccess(sql, data.eventId, context.userId, "contributor");
    const hits = parseScan(data.body, data.threshold).length;
    if (hits === 0) throw new Error("No frequencies found. Use lines like 520.000,-62");
    await sql`
      insert into scans (id, event_id, label, body, threshold)
      values (${uid()}, ${data.eventId}, ${data.label}, ${data.body}, ${data.threshold})
    `;
    await logActivity(sql, data.eventId, context.userId, `Imported scan “${data.label}” (${hits} hits).`);
    return loadBundle(sql, data.eventId, context.userId);
  });

export const deleteScan = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ eventId: z.string().min(1), scanId: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireAccess(sql, data.eventId, context.userId, "manager");
    await sql`delete from scans where id = ${data.scanId} and event_id = ${data.eventId}`;
    return loadBundle(sql, data.eventId, context.userId);
  });

export const listCustomDevices = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    return sql<{
      id: string;
      category: string;
      manufacturer: string;
      name: string;
      band_min: number;
      band_max: number;
      bandwidth: number;
      mode: string;
      power: string;
    }>`
      select id, category, manufacturer, name, band_min, band_max, bandwidth, mode, power
      from custom_devices where user_id = ${context.userId}
      order by category, name
    `;
  });

export const addCustomDevice = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      category: z.enum(["audio", "video", "lighting", "comms"]),
      manufacturer: z.string().trim().max(80).optional().default(""),
      name: z.string().trim().min(1).max(80),
      bandMin: z.number().positive(),
      bandMax: z.number().positive(),
      bandwidth: z.number().positive(),
      mode: z.enum(["carrier", "band"]),
      power: z.string().trim().max(40).optional().default(""),
    }),
  )
  .handler(async ({ context, data }) => {
    if (data.bandMax <= data.bandMin) throw new Error("Band end has to be above the start.");
    if (data.bandwidth > data.bandMax - data.bandMin) throw new Error("Bandwidth is wider than the band.");
    const sql = await getSql();
    await sql`
      insert into custom_devices (
        id, user_id, category, manufacturer, name, band_min, band_max, bandwidth, mode, power
      ) values (
        ${uid()}, ${context.userId}, ${data.category}, ${data.manufacturer}, ${data.name},
        ${data.bandMin}, ${data.bandMax}, ${data.bandwidth}, ${data.mode}, ${data.power}
      )
    `;
    return { ok: true };
  });

export const deleteCustomDevice = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`delete from custom_devices where id = ${data.id} and user_id = ${context.userId}`;
    return { ok: true };
  });

export const createSample = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const id = await insertEvent(sql, context.userId, {
      name: "Harbour Lights Festival",
      venue: "Docklands stage",
      city: "Melbourne",
      region: "AU",
      startsOn: "2026-12-05",
      endsOn: "2026-12-06",
      spacing: "balanced",
      notes: "Sample plot. Two isolated stages share the site only with comms, lighting, and the video link.",
    });
    const stageA = uid();
    const stageB = uid();
    await sql`insert into zones (id, event_id, name, isolated) values (${stageA}, ${id}, ${"Stage A"}, ${true})`;
    await sql`insert into zones (id, event_id, name, isolated) values (${stageB}, ${id}, ${"Stage B"}, ${true})`;
    const site = await sql<{ id: string }>`select id from zones where event_id = ${id} and name = ${"Site-wide"}`;
    const siteId = site[0]?.id ?? stageA;

    const plan: { key: string; label: string; zone: string; priority: string; n: number; start: string; end: string }[] = [
      { key: "btr", label: "Show comms base", zone: siteId, priority: "critical", n: 2, start: "", end: "" },
      { key: "fsii", label: "FreeSpeak beltpack net", zone: siteId, priority: "critical", n: 1, start: "", end: "" },
      { key: "crmx", label: "House wireless DMX", zone: siteId, priority: "high", n: 1, start: "", end: "" },
      { key: "slxd-h58", label: "Stage A vocal", zone: stageA, priority: "high", n: 4, start: "16:00", end: "23:00" },
      { key: "psm", label: "Stage A IEM", zone: stageA, priority: "high", n: 4, start: "16:00", end: "23:00" },
      { key: "ewdx", label: "Stage B vocal", zone: stageB, priority: "normal", n: 4, start: "12:00", end: "18:00" },
      { key: "ewiem", label: "Stage B IEM", zone: stageB, priority: "normal", n: 2, start: "12:00", end: "18:00" },
      { key: "bolt", label: "Camera hop", zone: siteId, priority: "high", n: 1, start: "", end: "" },
      { key: "hcam", label: "ENG 2 GHz", zone: siteId, priority: "normal", n: 1, start: "", end: "" },
      { key: "moto", label: "Site radio", zone: siteId, priority: "normal", n: 2, start: "", end: "" },
    ];
    for (const item of plan) {
      const device = CATALOG.find((d) => d.key === item.key);
      if (!device) continue;
      for (let i = 0; i < item.n; i++) {
        const label = item.n > 1 ? `${item.label} ${i + 1}` : item.label;
        await sql`
          insert into requests (
            id, event_id, zone_id, created_by, category, label, device_key, device_name, manufacturer,
            band_min, band_max, bandwidth, mode, priority, time_start, time_end, notes
          ) values (
            ${uid()}, ${id}, ${item.zone}, ${context.userId}, ${device.category}, ${label},
            ${device.key}, ${device.name}, ${device.manufacturer}, ${device.bandMin}, ${device.bandMax},
            ${device.bandwidth}, ${device.mode}, ${item.priority},
            ${item.start || null}, ${item.end || null}, ${""}
          )
        `;
      }
    }
    await sql`
      insert into scans (id, event_id, label, body, threshold)
      values (
        ${uid()}, ${id}, ${"Walk-in scan"},
        ${"520.000,-48\n520.400,-51\n548.250,-55"},
        ${-70}
      )
    `;
    await runCalc(sql, id, context.userId);
    return { id };
  });

export const undoCoordinate = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ eventId: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireAccess(sql, data.eventId, context.userId, "manager");
    const snaps = await sql<{ id: string; payload: string }>`
      select id, payload from assignment_snapshots
      where event_id = ${data.eventId}
      order by created_at desc
      limit 1
    `;
    const snap = snaps[0];
    if (!snap) throw new Error("Nothing to undo yet. Coordinate once first.");
    const rows = JSON.parse(snap.payload) as { id: string; assigned_mhz: number | null; locked: boolean }[];
    for (const row of rows) {
      await sql`
        update requests set assigned_mhz = ${row.assigned_mhz}, locked = ${row.locked}
        where id = ${row.id} and event_id = ${data.eventId}
      `;
    }
    await sql`delete from assignment_snapshots where id = ${snap.id}`;
    await logActivity(sql, data.eventId, context.userId, "Restored the previous plot.");
    return loadBundle(sql, data.eventId, context.userId);
  });

export const setMemberRole = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    eventId: z.string().min(1),
    userId: z.string().min(1),
    role: z.enum(["manager", "tech", "contributor", "viewer"]),
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireAccess(sql, data.eventId, context.userId, "manager");
    const events = await sql<{ owner_id: string }>`select owner_id from events where id = ${data.eventId}`;
    if (events[0]?.owner_id === data.userId && data.role !== "manager") {
      throw new Error("The owner stays a manager.");
    }
    await sql`
      update event_members set role = ${data.role}
      where event_id = ${data.eventId} and user_id = ${data.userId}
    `;
    await logActivity(sql, data.eventId, context.userId, `Set a member to ${data.role}.`);
    return loadBundle(sql, data.eventId, context.userId);
  });

export const enableShare = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ eventId: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireAccess(sql, data.eventId, context.userId, "manager");
    const existing = await sql<{ share_token: string | null }>`select share_token from events where id = ${data.eventId}`;
    let token = existing[0]?.share_token;
    if (!token) {
      token = crypto.randomUUID().replaceAll("-", "");
      await sql`update events set share_token = ${token} where id = ${data.eventId}`;
      await logActivity(sql, data.eventId, context.userId, "Opened a public plot link.");
    }
    return { token };
  });

export const getPublicPlot = createServerFn({ method: "GET" })
  .validator(z.object({ token: z.string().min(8) }))
  .handler(async ({ data }) => {
    const sql = await getSql();
    const events = await sql<EventRow>`select * from events where share_token = ${data.token}`;
    const event = events[0];
    if (!event) throw new Error("This plot link is not active.");
    const zones = await sql<ZoneRow>`select * from zones where event_id = ${event.id} order by name`;
    const requests = await sql<RequestRow>`select * from requests where event_id = ${event.id} order by category, label`;
    const scans = await sql<ScanRow>`select * from scans where event_id = ${event.id}`;
    return {
      name: event.name,
      venue: event.venue,
      city: event.city,
      spacing: event.spacing,
      zones: zones.map((z) => ({ id: z.id, name: z.name })),
      requests: requests.map((r) => ({
        id: r.id,
        label: r.label,
        device_name: r.device_name,
        category: r.category,
        zone_id: r.zone_id,
        assigned_mhz: r.assigned_mhz == null ? null : num(r.assigned_mhz),
        locked: flag(r.locked),
      })),
      marks: scans.flatMap((s) => parseScan(s.body, num(s.threshold)).map((m) => ({ min: m.min, max: m.max }))),
    };
  });

export const addAntenna = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    eventId: z.string().min(1),
    name: z.string().trim().min(1).max(80),
    powerMw: z.number().min(1).max(1000),
    gainDbi: z.number().min(-10).max(20),
    freqMhz: z.number().min(30).max(8000),
    heightM: z.number().min(0.5).max(50),
    thresholdDbm: z.number().min(-120).max(-40),
    marginDb: z.number().min(0).max(40),
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireAccess(sql, data.eventId, context.userId, "manager");
    await sql`
      insert into antennas (id, event_id, name, power_mw, gain_dbi, freq_mhz, height_m, threshold_dbm, margin_db)
      values (
        ${uid()}, ${data.eventId}, ${data.name}, ${data.powerMw}, ${data.gainDbi},
        ${data.freqMhz}, ${data.heightM}, ${data.thresholdDbm}, ${data.marginDb}
      )
    `;
    await logActivity(sql, data.eventId, context.userId, `Added antenna “${data.name}”.`);
    return loadBundle(sql, data.eventId, context.userId);
  });

export const deleteAntenna = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ eventId: z.string().min(1), antennaId: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireAccess(sql, data.eventId, context.userId, "manager");
    await sql`delete from antennas where id = ${data.antennaId} and event_id = ${data.eventId}`;
    return loadBundle(sql, data.eventId, context.userId);
  });

const batchLine = z.object({
  label: z.string().trim().min(1).max(80),
  deviceKey: z.string().min(1),
  deviceName: z.string().min(1),
  manufacturer: z.string().optional().default(""),
  bandMin: z.number(),
  bandMax: z.number(),
  bandwidth: z.number().positive(),
  mode: z.enum(["carrier", "band"]),
  category: z.string().min(1),
  spare: z.boolean().optional().default(false),
  notes: z.string().trim().max(500).optional().default(""),
  powerMw: z.number().positive().max(250).optional().default(10),
});

export const submitBatch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      eventId: z.string().min(1),
      zoneId: z.string().min(1),
      title: z.string().trim().min(1).max(80),
      notes: z.string().trim().max(1000).optional().default(""),
      lines: z.array(batchLine).min(1).max(40),
    }),
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireAccess(sql, data.eventId, context.userId, "tech");
    const batchId = uid();
    await sql`
      insert into request_batches (id, event_id, zone_id, created_by, title, status, notes)
      values (${batchId}, ${data.eventId}, ${data.zoneId}, ${context.userId}, ${data.title}, ${"submitted"}, ${data.notes ?? ""})
    `;
    for (const line of data.lines) {
      await sql`
        insert into requests (
          id, event_id, zone_id, created_by, category, label, device_key, device_name,
          manufacturer, band_min, band_max, bandwidth, mode, notes, batch_id, spare, power_mw
        ) values (
          ${uid()}, ${data.eventId}, ${data.zoneId}, ${context.userId}, ${line.category}, ${line.label},
          ${line.deviceKey}, ${line.deviceName}, ${line.manufacturer ?? ""}, ${line.bandMin}, ${line.bandMax},
          ${line.bandwidth}, ${line.mode}, ${line.notes ?? ""}, ${batchId}, ${line.spare ?? false}, ${line.powerMw ?? 10}
        )
      `;
    }
    await logActivity(sql, data.eventId, context.userId, `Submitted ${data.lines.length} devices in “${data.title}”.`);
    const managers = await sql<{ user_id: string }>`
      select user_id from event_members where event_id = ${data.eventId} and role = ${"manager"}
    `;
    for (const m of managers) {
      if (m.user_id === context.userId) continue;
      await sql`
        insert into notifications (id, user_id, event_id, message)
        values (${uid()}, ${m.user_id}, ${data.eventId}, ${`${data.title}: ${data.lines.length} devices submitted`})
      `;
    }
    return loadBundle(sql, data.eventId, context.userId);
  });

export const markTuned = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ eventId: z.string().min(1), requestId: z.string().min(1), tuned: z.boolean() }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireAccess(sql, data.eventId, context.userId, "tech");
    const rows = await sql<{ created_by: string; label: string; assigned_mhz: number | null }>`
      select created_by, label, assigned_mhz from requests where id = ${data.requestId} and event_id = ${data.eventId}
    `;
    const row = rows[0];
    if (!row) throw new Error("Request not found.");
    const admin = await isPlatformAdmin(sql, context.userId);
    const access = await requireAccess(sql, data.eventId, context.userId, "viewer");
    const manager = access.role === "manager" || admin;
    if (!manager) {
      const company = await companyOf(sql, context.userId);
      const mates = company
        ? (await sql<{ user_id: string }>`select user_id from company_members where company_id = ${company.id}`).map((r) => r.user_id)
        : [context.userId];
      if (!mates.includes(row.created_by) && row.created_by !== context.userId) {
        throw new Error("That request is another company's.");
      }
    }
    await sql`
      update requests
      set tuned_at = ${data.tuned ? new Date().toISOString() : null},
          tuned_by = ${data.tuned ? context.userId : null}
      where id = ${data.requestId}
    `;
    await history(sql, data.eventId, data.requestId, context.userId, data.tuned ? "tuned" : "untuned", data.tuned ? "Tuned" : "Cleared tuned");
    return loadBundle(sql, data.eventId, context.userId);
  });

export const setMemberCompany = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ eventId: z.string().min(1), userId: z.string().min(1), company: z.string().trim().max(80) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireAccess(sql, data.eventId, context.userId, "manager");
    const name = data.company.trim();
    await sql`delete from company_members where user_id = ${data.userId}`;
    if (name) {
      const existing = await sql<{ id: string }>`select id from companies where lower(name) = ${name.toLowerCase()}`;
      const id = existing[0]?.id ?? uid();
      if (!existing[0]) await sql`insert into companies (id, name) values (${id}, ${name})`;
      await sql`insert into company_members (company_id, user_id) values (${id}, ${data.userId}) on conflict do nothing`;
    }
    await logActivity(sql, data.eventId, context.userId, name ? `Set company to ${name}.` : "Cleared a company.");
    return loadBundle(sql, data.eventId, context.userId);
  });

export const listNotifications = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    return sql<{ id: string; message: string; event_id: string | null; read_at: string | null; created_at: string }>`
      select id, message, event_id, read_at, created_at
      from notifications
      where user_id = ${context.userId}
      order by created_at desc
      limit 20
    `;
  });

export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await sql`update notifications set read_at = now() where user_id = ${context.userId} and read_at is null`;
    return { ok: true };
  });

async function history(sql: Sql, eventId: string, requestId: string, userId: string, action: string, detail: string) {
  await sql`
    insert into line_history (id, request_id, event_id, user_id, action, detail)
    values (${uid()}, ${requestId}, ${eventId}, ${userId}, ${action}, ${detail.slice(0, 240)})
  `;
}

export const flagLine = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    eventId: z.string().min(1),
    requestId: z.string().min(1),
    reason: z.enum(["interference", "pack failed", "spare now live"]),
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireAccess(sql, data.eventId, context.userId, "tech");
    const rows = await sql<{ assigned_mhz: number | null; label: string }>`
      select assigned_mhz, label from requests where id = ${data.requestId} and event_id = ${data.eventId}
    `;
    const row = rows[0];
    if (!row) throw new Error("Request not found.");
    await sql`
      update requests
      set flag_reason = ${data.reason},
          flagged_mhz = ${row.assigned_mhz},
          assigned_mhz = ${null},
          locked = ${false},
          tuned_at = ${null},
          tuned_by = ${null}
      where id = ${data.requestId}
    `;
    await history(sql, data.eventId, data.requestId, context.userId, "flagged", `${data.reason} at ${row.assigned_mhz ?? "unassigned"}`);
    await logActivity(sql, data.eventId, context.userId, `Flagged ${row.label}: ${data.reason}.`);
    const managers = await sql<{ user_id: string }>`select user_id from event_members where event_id = ${data.eventId} and role = ${"manager"}`;
    for (const m of managers) {
      await sql`insert into notifications (id, user_id, event_id, message) values (${uid()}, ${m.user_id}, ${data.eventId}, ${`${row.label} flagged: ${data.reason}`})`;
    }
    return loadBundle(sql, data.eventId, context.userId);
  });

export const clearFlag = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ eventId: z.string().min(1), requestId: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireAccess(sql, data.eventId, context.userId, "manager");
    await sql`update requests set flag_reason = ${null}, flagged_mhz = ${null} where id = ${data.requestId}`;
    await history(sql, data.eventId, data.requestId, context.userId, "cleared", "Interference cleared");
    return loadBundle(sql, data.eventId, context.userId);
  });

export const sendBack = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ eventId: z.string().min(1), batchId: z.string().min(1), note: z.string().trim().min(1).max(400) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireAccess(sql, data.eventId, context.userId, "manager");
    await sql`update request_batches set status = ${"submitted"}, return_note = ${data.note} where id = ${data.batchId}`;
    await logActivity(sql, data.eventId, context.userId, `Sent a request back: ${data.note}`);
    return loadBundle(sql, data.eventId, context.userId);
  });

export const copyBatch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ eventId: z.string().min(1), batchId: z.string().min(1), zoneId: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireAccess(sql, data.eventId, context.userId, "tech");
    const batches = await sql<{ title: string; notes: string; priority: string }>`select title, notes, priority from request_batches where id = ${data.batchId}`;
    const batch = batches[0];
    if (!batch) throw new Error("Request not found.");
    const id = uid();
    await sql`
      insert into request_batches (id, event_id, zone_id, created_by, title, status, notes, priority)
      values (${id}, ${data.eventId}, ${data.zoneId}, ${context.userId}, ${batch.title + " copy"}, ${"submitted"}, ${batch.notes}, ${batch.priority})
    `;
    const lines = await sql<RequestRow>`select * from requests where batch_id = ${data.batchId}`;
    for (const line of lines) {
      await sql`
        insert into requests (
          id, event_id, zone_id, created_by, category, label, device_key, device_name, manufacturer,
          band_min, band_max, bandwidth, mode, notes, batch_id, spare, power_mw, priority
        ) values (
          ${uid()}, ${data.eventId}, ${data.zoneId}, ${context.userId}, ${line.category}, ${line.label},
          ${line.device_key}, ${line.device_name}, ${line.manufacturer}, ${line.band_min}, ${line.band_max},
          ${line.bandwidth}, ${line.mode}, ${line.notes}, ${id}, ${line.spare}, ${line.power_mw ?? 10}, ${line.priority}
        )
      `;
    }
    return loadBundle(sql, data.eventId, context.userId);
  });

export const addHold = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ eventId: z.string().min(1), zoneId: z.string().min(1), mhz: z.number(), label: z.string().trim().max(40).optional().default("Hold") }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireAccess(sql, data.eventId, context.userId, "manager");
    await sql`insert into holds (id, event_id, zone_id, mhz, label, created_by) values (${uid()}, ${data.eventId}, ${data.zoneId}, ${data.mhz}, ${data.label ?? "Hold"}, ${context.userId})`;
    return loadBundle(sql, data.eventId, context.userId);
  });

export const deleteHold = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ eventId: z.string().min(1), holdId: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireAccess(sql, data.eventId, context.userId, "manager");
    await sql`delete from holds where id = ${data.holdId} and event_id = ${data.eventId}`;
    return loadBundle(sql, data.eventId, context.userId);
  });

export const addWalkup = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    eventId: z.string().min(1),
    zoneId: z.string().min(1),
    label: z.string().trim().min(1).max(80),
    mhz: z.number(),
    deviceName: z.string().optional().default("Walk-up"),
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireAccess(sql, data.eventId, context.userId, "manager");
    const id = uid();
    await sql`
      insert into requests (
        id, event_id, zone_id, created_by, category, label, device_key, device_name,
        band_min, band_max, bandwidth, mode, assigned_mhz, locked, walkup, power_mw
      ) values (
        ${id}, ${data.eventId}, ${data.zoneId}, ${context.userId}, ${"audio"}, ${data.label},
        ${"walkup"}, ${data.deviceName ?? "Walk-up"}, ${data.mhz - 1}, ${data.mhz + 1}, ${0.2}, ${"carrier"},
        ${data.mhz}, ${true}, ${true}, ${10}
      )
    `;
    await history(sql, data.eventId, id, context.userId, "assigned", `Walk-up at ${data.mhz}`);
    return loadBundle(sql, data.eventId, context.userId);
  });

export const saveGroup = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ eventId: z.string().min(1), name: z.string().trim().min(1).max(60), zoneIds: z.array(z.string()).min(1) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireAccess(sql, data.eventId, context.userId, "manager");
    const id = uid();
    await sql`insert into area_groups (id, event_id, name) values (${id}, ${data.eventId}, ${data.name})`;
    for (const zoneId of data.zoneIds) {
      await sql`insert into area_group_zones (group_id, zone_id) values (${id}, ${zoneId}) on conflict do nothing`;
    }
    return loadBundle(sql, data.eventId, context.userId);
  });

export const deleteGroup = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ eventId: z.string().min(1), groupId: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireAccess(sql, data.eventId, context.userId, "manager");
    await sql`delete from area_groups where id = ${data.groupId} and event_id = ${data.eventId}`;
    return loadBundle(sql, data.eventId, context.userId);
  });

export const setPlotLock = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ eventId: z.string().min(1), locked: z.boolean() }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireAccess(sql, data.eventId, context.userId, "manager");
    await sql`update events set plot_locked = ${data.locked} where id = ${data.eventId}`;
    if (data.locked) {
      await sql`update requests set locked = ${true} where event_id = ${data.eventId} and assigned_mhz is not null`;
    }
    return loadBundle(sql, data.eventId, context.userId);
  });

export const beat = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ eventId: z.string().min(1), editing: z.string().optional().default("") }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireAccess(sql, data.eventId, context.userId, "viewer");
    const users = await sql<{ name: string }>`select name from "user" where id = ${context.userId}`;
    const editing = data.editing ?? "";
    await sql`
      insert into presence (event_id, user_id, name, last_seen, editing)
      values (${data.eventId}, ${context.userId}, ${users[0]?.name ?? "Someone"}, now(), ${editing})
      on conflict (event_id, user_id) do update set last_seen = now(), name = ${users[0]?.name ?? "Someone"}, editing = ${editing}
    `;
    return sql<{ user_id: string; name: string; editing: string }>`
      select user_id, name, editing from presence
      where event_id = ${data.eventId} and last_seen > now() - interval '20 seconds'
    `;
  });

export const updateBatch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    eventId: z.string().min(1),
    batchId: z.string().min(1),
    title: z.string().trim().min(1).max(80),
    notes: z.string().trim().max(1000).optional().default(""),
    priority: z.enum(["critical", "high", "normal", "low"]).optional().default("normal"),
    timeStart: z.string().optional().default(""),
    timeEnd: z.string().optional().default(""),
    dayLabel: z.string().optional().default(""),
    lines: z.array(z.object({
      id: z.string().optional(),
      label: z.string().trim().min(1).max(80),
      deviceKey: z.string().min(1),
      deviceName: z.string().min(1),
      manufacturer: z.string().optional().default(""),
      bandMin: z.number(),
      bandMax: z.number(),
      bandwidth: z.number().positive(),
      mode: z.enum(["carrier", "band"]),
      category: z.string().min(1),
      spare: z.boolean().optional().default(false),
      notes: z.string().optional().default(""),
      powerMw: z.number().positive().max(250).optional().default(10),
    })).min(1).max(40),
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireAccess(sql, data.eventId, context.userId, "tech");
    const existing = await sql<RequestRow>`select * from requests where batch_id = ${data.batchId} and event_id = ${data.eventId}`;
    const keep = new Set(data.lines.map((l) => l.id).filter(Boolean));
    for (const row of existing) {
      if (!keep.has(row.id)) {
        await sql`delete from requests where id = ${row.id}`;
        await history(sql, data.eventId, row.id, context.userId, "removed", row.label);
      }
    }
    const zone = existing[0]?.zone_id ?? null;
    for (const line of data.lines) {
      const prior = line.id ? existing.find((r) => r.id === line.id) : undefined;
      const changed = !prior || prior.label !== line.label || prior.device_key !== line.deviceKey || Number(prior.power_mw) !== line.powerMw || prior.spare !== line.spare;
      if (prior) {
        await sql`
          update requests set
            label = ${line.label},
            device_key = ${line.deviceKey},
            device_name = ${line.deviceName},
            manufacturer = ${line.manufacturer ?? ""},
            band_min = ${line.bandMin},
            band_max = ${line.bandMax},
            bandwidth = ${line.bandwidth},
            mode = ${line.mode},
            notes = ${line.notes ?? ""},
            spare = ${line.spare ?? false},
            power_mw = ${line.powerMw ?? 10},
            assigned_mhz = ${changed ? null : prior.assigned_mhz},
            locked = ${changed ? false : prior.locked}
          where id = ${prior.id}
        `;
        if (changed) await history(sql, data.eventId, prior.id, context.userId, "edited", "Changed. Frequency cleared.");
      } else {
        const id = uid();
        await sql`
          insert into requests (
            id, event_id, zone_id, created_by, category, label, device_key, device_name, manufacturer,
            band_min, band_max, bandwidth, mode, notes, batch_id, spare, power_mw
          ) values (
            ${id}, ${data.eventId}, ${zone}, ${context.userId}, ${line.category}, ${line.label},
            ${line.deviceKey}, ${line.deviceName}, ${line.manufacturer ?? ""}, ${line.bandMin}, ${line.bandMax},
            ${line.bandwidth}, ${line.mode}, ${line.notes ?? ""}, ${data.batchId}, ${line.spare ?? false}, ${line.powerMw ?? 10}
          )
        `;
        await history(sql, data.eventId, id, context.userId, "added", line.label);
      }
    }
    await sql`
      update request_batches
      set title = ${data.title}, notes = ${data.notes ?? ""}, status = ${"submitted"},
          priority = ${data.priority}, time_start = ${data.timeStart || null}, time_end = ${data.timeEnd || null},
          day_label = ${data.dayLabel || null}, return_note = ${""}
      where id = ${data.batchId}
    `;
    const managers = await sql<{ user_id: string }>`select user_id from event_members where event_id = ${data.eventId} and role = ${"manager"}`;
    for (const m of managers) {
      await sql`insert into notifications (id, user_id, event_id, message) values (${uid()}, ${m.user_id}, ${data.eventId}, ${`${data.title} was edited and is back to submitted`})`;
    }
    await logActivity(sql, data.eventId, context.userId, `Edited “${data.title}”. Changed lines were cleared.`);
    return loadBundle(sql, data.eventId, context.userId);
  });

export const lineHistory = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ eventId: z.string().min(1), requestId: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireAccess(sql, data.eventId, context.userId, "viewer");
    return sql<{ action: string; detail: string; created_at: string; name: string | null }>`
      select h.action, h.detail, h.created_at, u.name
      from line_history h
      left join "user" u on u.id = h.user_id
      where h.request_id = ${data.requestId}
      order by h.created_at desc
      limit 12
    `;
  });

export const listRequestsAcrossEvents = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const admin = await isPlatformAdmin(sql, context.userId);
    const company = await companyOf(sql, context.userId);
    const rows = admin
      ? await sql<{
          id: string; event_id: string; event_name: string; created_by: string; creator_name: string | null;
          category: string; label: string; device_key: string; device_name: string; manufacturer: string; band_min: number; band_max: number;
          assigned_mhz: number | null; spare: boolean; notes: string; power_mw: number | null; batch_title: string | null;
        }>`
          select r.id, r.event_id, e.name as event_name, r.created_by, u.name as creator_name,
                 r.category, r.label, r.device_key, r.device_name, r.manufacturer, r.band_min, r.band_max,
                 r.assigned_mhz, r.spare, r.notes, r.power_mw, b.title as batch_title
          from requests r
          join events e on e.id = r.event_id
          left join "user" u on u.id = r.created_by
          left join request_batches b on b.id = r.batch_id
          order by u.name, e.name, r.category, r.label
        `
      : await sql<{
          id: string; event_id: string; event_name: string; created_by: string; creator_name: string | null;
          category: string; label: string; device_key: string; device_name: string; manufacturer: string; band_min: number; band_max: number;
          assigned_mhz: number | null; spare: boolean; notes: string; power_mw: number | null; batch_title: string | null;
        }>`
          select r.id, r.event_id, e.name as event_name, r.created_by, u.name as creator_name,
                 r.category, r.label, r.device_key, r.device_name, r.manufacturer, r.band_min, r.band_max,
                 r.assigned_mhz, r.spare, r.notes, r.power_mw, b.title as batch_title
          from requests r
          join events e on e.id = r.event_id
          join event_members m on m.event_id = r.event_id and m.user_id = ${context.userId}
          left join "user" u on u.id = r.created_by
          left join request_batches b on b.id = r.batch_id
          where r.created_by = ${context.userId}
             or (m.role = ${"manager"})
             or (${company?.id ?? null} is not null and r.created_by in (select user_id from company_members where company_id = ${company?.id ?? "none"}))
          order by u.name, e.name, r.category, r.label
        `;
    return rows;
  });

export const editRequestLine = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    eventId: z.string().min(1),
    requestId: z.string().min(1),
    label: z.string().trim().min(1).max(80),
    notes: z.string().optional().default(""),
    powerMw: z.number().positive().max(250).optional().default(10),
    deviceKey: z.string().min(1),
    deviceName: z.string().min(1),
    manufacturer: z.string().optional().default(""),
    bandMin: z.number(),
    bandMax: z.number(),
    bandwidth: z.number().positive(),
    mode: z.enum(["carrier", "band"]),
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireAccess(sql, data.eventId, context.userId, "tech");
    const rows = await sql<RequestRow>`select * from requests where id = ${data.requestId} and event_id = ${data.eventId}`;
    const row = rows[0];
    if (!row) throw new Error("Request not found.");
    const changed = row.device_key !== data.deviceKey || row.label !== data.label || Number(row.power_mw) !== data.powerMw;
    await sql`
      update requests set
        label = ${data.label},
        notes = ${data.notes ?? ""},
        power_mw = ${data.powerMw ?? 10},
        device_key = ${data.deviceKey},
        device_name = ${data.deviceName},
        manufacturer = ${data.manufacturer ?? ""},
        band_min = ${data.bandMin},
        band_max = ${data.bandMax},
        bandwidth = ${data.bandwidth},
        mode = ${data.mode},
        assigned_mhz = ${changed ? null : row.assigned_mhz},
        locked = ${changed ? false : row.locked}
      where id = ${data.requestId}
    `;
    if (changed) await history(sql, data.eventId, data.requestId, context.userId, "edited", "Changed from Requests page");
    return { ok: true as const };
  });

export const reviewLine = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    eventId: z.string().min(1),
    requestId: z.string().min(1),
    status: z.enum(["allowed", "changed", "denied"]),
    note: z.string().optional().default(""),
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireAccess(sql, data.eventId, context.userId, "manager");
    await sql`update requests set review_status = ${data.status}, review_note = ${data.note ?? ""} where id = ${data.requestId}`;
    await history(sql, data.eventId, data.requestId, context.userId, data.status, data.note ?? "");
    return loadBundle(sql, data.eventId, context.userId);
  });

export const leaveEvent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ eventId: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`delete from event_members where event_id = ${data.eventId} and user_id = ${context.userId}`;
    return { ok: true as const };
  });

export const removeMember = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ eventId: z.string().min(1), userId: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireAccess(sql, data.eventId, context.userId, "manager");
    await sql`delete from event_members where event_id = ${data.eventId} and user_id = ${data.userId}`;
    return loadBundle(sql, data.eventId, context.userId);
  });

export const copyShow = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ eventId: z.string().min(1), name: z.string().trim().min(1).max(80) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireAccess(sql, data.eventId, context.userId, "manager");
    const events = await sql<EventRow>`select * from events where id = ${data.eventId}`;
    const event = events[0];
    if (!event) throw new Error("Event not found.");
    if (event.owner_id !== context.userId && !(await isPlatformAdmin(sql, context.userId))) throw new Error("Only the owner or an admin can copy a show.");
    const id = uid();
    await sql`
      insert into events (id, owner_id, name, venue, city, region, starts_on, ends_on, spacing, notes, join_code, join_role)
      values (${id}, ${context.userId}, ${data.name}, ${event.venue}, ${event.city}, ${event.region}, ${event.starts_on}, ${event.ends_on}, ${event.spacing}, ${event.notes}, ${uid().slice(0, 6).toUpperCase()}, ${event.join_role})
    `;
    await sql`insert into event_members (event_id, user_id, role) values (${id}, ${context.userId}, ${"manager"})`;
    const zones = await sql<{ id: string; name: string; isolated: boolean }>`select id, name, isolated from zones where event_id = ${data.eventId}`;
    const zoneMap = new Map<string, string>();
    for (const z of zones) {
      const nid = uid();
      zoneMap.set(z.id, nid);
      await sql`insert into zones (id, event_id, name, isolated) values (${nid}, ${id}, ${z.name}, ${z.isolated})`;
    }
    const batches = await sql<{ id: string; zone_id: string | null; title: string; notes: string }>`select id, zone_id, title, notes from request_batches where event_id = ${data.eventId}`;
    for (const b of batches) {
      const nid = uid();
      await sql`insert into request_batches (id, event_id, zone_id, created_by, title, status, notes) values (${nid}, ${id}, ${b.zone_id ? zoneMap.get(b.zone_id) ?? null : null}, ${context.userId}, ${b.title}, ${"submitted"}, ${b.notes})`;
      const lines = await sql<RequestRow>`select * from requests where batch_id = ${b.id}`;
      for (const line of lines) {
        await sql`
          insert into requests (id, event_id, zone_id, created_by, category, label, device_key, device_name, manufacturer, band_min, band_max, bandwidth, mode, notes, batch_id, spare, power_mw)
          values (${uid()}, ${id}, ${line.zone_id ? zoneMap.get(line.zone_id) ?? null : null}, ${context.userId}, ${line.category}, ${line.label}, ${line.device_key}, ${line.device_name}, ${line.manufacturer}, ${line.band_min}, ${line.band_max}, ${line.bandwidth}, ${line.mode}, ${line.notes}, ${nid}, ${line.spare}, ${line.power_mw ?? 10})
        `;
      }
    }
    return { id };
  });

export const addWatch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ eventId: z.string().min(1), mhz: z.number(), label: z.string().optional().default("Watch") }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireAccess(sql, data.eventId, context.userId, "manager");
    await sql`insert into watched (id, event_id, mhz, label) values (${uid()}, ${data.eventId}, ${data.mhz}, ${data.label ?? "Watch"})`;
    return loadBundle(sql, data.eventId, context.userId);
  });

export const makeGuestCode = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ eventId: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireAccess(sql, data.eventId, context.userId, "manager");
    const events = await sql<{ ends_on: string }>`select ends_on from events where id = ${data.eventId}`;
    const code = uid().slice(0, 6).toUpperCase();
    await sql`insert into guest_codes (id, event_id, code, expires_on) values (${uid()}, ${data.eventId}, ${code}, ${events[0]?.ends_on ?? ""})`;
    return { code, expires: events[0]?.ends_on ?? "" };
  });

export const listActivity = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ eventId: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await requireAccess(sql, data.eventId, context.userId, "manager");
    return sql<{ message: string; created_at: string; name: string | null }>`
      select a.message, a.created_at, u.name
      from activity a
      left join "user" u on u.id = a.user_id
      where a.event_id = ${data.eventId}
      order by a.created_at desc
      limit 40
    `;
  });

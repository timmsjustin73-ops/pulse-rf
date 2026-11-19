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
import { audit, coordinate, parseScan, snapCarrier, spectrumRuleFor, tuneStepOf, type BandBlock, type CoordItem } from "@/lib/coord";

const RANK: Record<Role, number> = { viewer: 0, contributor: 1, manager: 2 };

function isRole(v: string): v is Role {
  return v === "manager" || v === "contributor" || v === "viewer";
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
  const rows = await sql<{ role: string; owner_id: string }>`
    select m.role, e.owner_id
    from events e
    join event_members m on m.event_id = e.id and m.user_id = ${userId}
    where e.id = ${eventId}
  `;
  const row = rows[0];
  if (!row || !isRole(row.role)) throw new Error("You don't have access to this event.");
  if (RANK[row.role] < RANK[min]) throw new Error("Your role can't do that.");
  return row;
}

async function logActivity(sql: Sql, eventId: string, userId: string, message: string) {
  await sql`
    insert into activity (id, event_id, user_id, message)
    values (${uid()}, ${eventId}, ${userId}, ${message.slice(0, 240)})
  `;
}

function toItems(requests: RequestRow[], zones: ZoneRow[]): CoordItem[] {
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
      t0: parseClock(r.time_start),
      t1: parseClock(r.time_end),
      priority: priorityRank(r.priority),
      locked: r.locked,
      assigned: r.assigned_mhz,
      tuneStep: preset?.tuneStep,
      gaps: preset?.gaps,
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
  const requests = await sql<RequestRow>`
    select * from requests where event_id = ${eventId} order by category, label
  `;
  const scans = await sql<ScanRow>`select * from scans where event_id = ${eventId} order by created_at desc`;
  const members = await sql<{ user_id: string; role: string; name: string | null; email: string | null }>`
    select m.user_id, m.role, u.name, u.email
    from event_members m
    left join "user" u on u.id = m.user_id
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
  const zonesClean = zones.map((z) => ({ ...z, isolated: flag(z.isolated) }));
  const requestsClean = requests.map((r) => ({
    ...r,
    band_min: num(r.band_min),
    band_max: num(r.band_max),
    bandwidth: num(r.bandwidth),
    locked: flag(r.locked),
    assigned_mhz: r.assigned_mhz == null ? null : num(r.assigned_mhz),
  }));
  const blockers = allBlockers(event, scans);
  const items = toItems(requestsClean, zonesClean);
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
    role: (mine && isRole(mine.role) ? mine.role : "viewer") as Role,
    isOwner: event.owner_id === userId,
    zones: zonesClean,
    requests: requestsClean,
    scans: scans.map((s) => ({
      id: s.id,
      label: s.label,
      threshold: num(s.threshold),
      hits: parseScan(s.body, num(s.threshold)).length,
      created_at: s.created_at,
    })),
    members,
    activity,
    issues,
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
    const events = await sql<EventRow & { role: string }>`
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
    const role: Role = event.join_role === "viewer" ? "viewer" : "contributor";
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

async function runCalc(sql: Sql, eventId: string, userId: string) {
  await requireAccess(sql, eventId, userId, "manager");
  const events = await sql<EventRow>`select * from events where id = ${eventId}`;
  const event = events[0];
  if (!event) throw new Error("Event not found.");
  const zones = await sql<ZoneRow>`select * from zones where event_id = ${eventId}`;
  const requests = await sql<RequestRow>`select * from requests where event_id = ${eventId}`;
  const scans = await sql<ScanRow>`select * from scans where event_id = ${eventId}`;
  const spacing = event.spacing === "resilience" || event.spacing === "density" ? event.spacing : "balanced";
  const result = coordinate(toItems(requests, zones), allBlockers(event, scans), spacing, spectrumRuleFor(event.region));
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

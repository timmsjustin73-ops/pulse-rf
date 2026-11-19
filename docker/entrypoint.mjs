import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const databaseUrl = process.env.DATABASE_URL?.trim();

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited ${code}`));
    });
  });
}

async function waitForDatabase() {
  if (!databaseUrl) {
    console.log("[pulse] DATABASE_URL is not set. The built-in database lasts only until the container stops.");
    return;
  }
  const pg = await import("pg");
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    const pool = new pg.default.Pool({
      connectionString: databaseUrl,
      max: 1,
      connectionTimeoutMillis: 2000,
    });
    try {
      await pool.query("select 1");
      await pool.end();
      console.log("[pulse] database is ready");
      return;
    } catch (err) {
      await pool.end().catch(() => {});
      console.log(`[pulse] waiting for database (${attempt}/60): ${err instanceof Error ? err.message : err}`);
      await delay(1000);
    }
  }
  throw new Error("database did not become ready");
}

await waitForDatabase();
if (databaseUrl) await run("node", ["scripts/migrate.mjs"]);

const server = spawn("node", [".output/server/index.mjs"], { stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}
server.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});

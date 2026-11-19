# Pulse RF

Browser frequency coordination for wireless audio, video, lighting and comms.

Sign in, open an event, and build a plot: device ranges, a 5 kHz radio-mic grid, zone isolation, time windows, scan keep-outs and an intermod check. It is a planning aid, not a licence and not a live TV database.

## Install with Docker

This runs the whole planner: sign-in, events, the device library, and a Postgres database that keeps your plots.

```bash
git clone https://github.com/timmsjustin73-ops/pulse-rf.git
cd pulse-rf
docker compose up -d --build
```

GitHub also publishes `ghcr.io/timmsjustin73-ops/pulse-rf:latest`. That package starts private. Open [the package settings](https://github.com/timmsjustin73-ops/pulse-rf/pkgs/container/pulse-rf/settings), set visibility to Public, then `docker compose up -d` can pull it instead of building.

Open http://localhost:8080 and create an account with email and password.

Sign in with email and password.

Plots are stored in a Docker volume. They stay when you restart the container.

```bash
docker compose down       # stop
docker compose down -v    # stop and delete the database
```

Change `BETTER_AUTH_SECRET` before you put this on a machine other people can reach. Open the site as http://localhost:8080 so the sign-in cookie is accepted.

## Run it without Docker

```bash
npm install
npm run dev
```

Then open http://localhost:8080.

Email and password sign-in works locally. If `DATABASE_URL` is set (Postgres), the app uses that database. Without it, a local database is used for the running process only.

`npm run build` and `npm run typecheck` check the production build.

## What you can do

- Events, zones and a join code (manager, contributor, viewer). Managers can change roles.
- Public plot link for a venue or client
- Device library across Shure, Sennheiser, Lectrosonics, Sony, Audio-Technica, Wisycom and more, including IEM bands, plus lighting and video hops
- Spectrum chart of the assigned plot, with scan hits marked
- Auto assignment: Resilience, Balanced or Density, with undo of the last coordinate
- Manual lock. Narrowband radio mics snap to 0.005 MHz steps, so 470.387 becomes 470.385 or 470.390
- For Australia, those radio mics are kept inside 520–694 MHz
- Scan import from paste or a CSV/TXT file (plain, Shure WWB, Sennheiser WSM style)
- Conflict panel that says why a carrier failed
- CSV, Excel, and print/PDF export
- Antenna coverage estimate from power, gain, frequency, height and margin

Frequencies below 520 MHz appear on some hardware ranges but sit outside the general Australian LIPD wireless-audio window. Check the venue and the current rules before transmitting.

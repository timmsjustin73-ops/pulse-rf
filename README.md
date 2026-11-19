# Pulse RF

Browser frequency coordination for wireless audio, video, lighting and comms.

Sign in, open an event, and build a plot: device ranges, a 5 kHz radio-mic grid, zone isolation, time windows, scan keep-outs and an intermod check. It is a planning aid, not a licence and not a live TV database.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:8080.

Email and password sign-in works locally. If `DATABASE_URL` is set (Postgres), the app uses that database. Without it, a local database is used for the running process only.

`npm run build` and `npm run typecheck` check the production build.

## What you can do

- Events, zones and a join code (manager, contributor, viewer)
- Device library, including Australian Shure ranges (SLX-D H57, SLX-D+ H58, BLX K14 and M17, Axient Digital G57 / H54 / G55) plus 2.4 GHz and 5.8 GHz
- Auto assignment: Resilience, Balanced or Density
- Manual lock. Narrowband radio mics snap to 0.005 MHz steps, so 470.387 becomes 470.385 or 470.390
- For Australia, those radio mics are kept inside 520–694 MHz
- Scan CSV import, example TV keep-outs, conflict list
- CSV export and print

Frequencies below 520 MHz appear on some hardware ranges but sit outside the general Australian LIPD wireless-audio window. Check the venue and the current rules before transmitting.

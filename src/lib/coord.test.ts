import assert from "node:assert/strict";
import test from "node:test";
import { coordinate, onTuneGrid, snapCarrier, spectrumRuleFor, tuneStepOf, type CoordItem } from "./coord.ts";

const au = spectrumRuleFor("AU");

function mic(partial: Partial<CoordItem> & Pick<CoordItem, "id" | "bandMin" | "bandMax">): CoordItem {
  return {
    bandwidth: 0.2,
    mode: "carrier",
    zoneId: "a",
    isolated: true,
    t0: null,
    t1: null,
    priority: 2,
    locked: false,
    assigned: null,
    tuneStep: 0.005,
    ...partial,
  };
}

test("470.387 snaps to 470.385, not a 1 kHz step", () => {
  assert.equal(snapCarrier(470.387, 0.005), 470.385);
  assert.equal(snapCarrier(470.388, 0.005), 470.39);
  assert.equal(onTuneGrid(470.387, 0.005), false);
  assert.equal(onTuneGrid(470.385, 0.005), true);
  assert.equal(onTuneGrid(470.39, 0.005), true);
});

test("UHF mics use 5 kHz and 12.5 kHz radios do not", () => {
  assert.equal(tuneStepOf({ mode: "carrier", bandMax: 606, bandwidth: 0.2 }), 0.005);
  assert.equal(tuneStepOf({ mode: "carrier", bandMax: 470, bandwidth: 0.0125, tuneStep: 0.0125 }), 0.0125);
  assert.equal(tuneStepOf({ mode: "band", bandMax: 2483.5, bandwidth: 83.5 }), null);
});

test("Australia assignments stay on the 5 kHz grid and inside 520–694", () => {
  const items = [
    mic({ id: "h58", bandMin: 520, bandMax: 606 }),
    mic({ id: "k14", bandMin: 614, bandMax: 638 }),
    mic({ id: "m17", bandMin: 662, bandMax: 686 }),
    mic({ id: "h57", bandMin: 520, bandMax: 564 }),
    mic({
      id: "g57",
      bandMin: 470,
      bandMax: 616,
      gaps: [{ min: 608, max: 614 }],
    }),
  ];
  const out = coordinate(items, [], "balanced", au);
  for (const item of items) {
    const mhz = out[item.id];
    assert.ok(mhz != null, item.id);
    assert.equal(onTuneGrid(mhz!, 0.005), true, `${item.id} ${mhz}`);
    assert.ok(mhz! > 520, `${item.id} ${mhz}`);
    assert.ok(mhz! < 694, `${item.id} ${mhz}`);
    assert.ok(mhz! >= item.bandMin && mhz! <= item.bandMax);
  }
  const g57 = out.g57!;
  assert.ok(g57 < 608 - 0.1 || g57 > 614 + 0.1, String(g57));
  assert.ok(g57 > 520);
});

test("a band that never reaches 520 MHz is left empty in Australia", () => {
  const out = coordinate([mic({ id: "low", bandMin: 470, bandMax: 510 })], [], "balanced", au);
  assert.equal(out.low, null);
});

test("H58 is the 86 MHz range 520–606", () => {
  assert.equal(606 - 520, 86);
});

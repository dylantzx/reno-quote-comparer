import { test } from "node:test";
import assert from "node:assert/strict";
import { estimate, defaultPlan, COST_LINES } from "../public/costs.js";

test("a typical 4-room plan has a sensible range and the trades it needs", () => {
  const e = estimate(defaultPlan("4"));
  assert.ok(e.total.low > 5000 && e.total.low < e.total.high);
  assert.deepEqual(e.trades.sort(), ["CR06", "ME05", "ME12"]);
});

test("quantities scale the cost; zero leaves a line out", () => {
  const plan = defaultPlan("4");
  for (const k of Object.keys(plan.lines)) plan.lines[k] = 0;
  plan.lines.lighting = 10;
  const e = estimate(plan);
  assert.deepEqual(e.total, { low: 450, high: 900 });
  assert.deepEqual(Object.keys(e.byCategory), ["Electrical"]);
  assert.deepEqual(e.trades, ["ME05"]);
});

test("painting is priced by flat type", () => {
  const only = (flat) => {
    const p = defaultPlan(flat);
    for (const k of Object.keys(p.lines)) p.lines[k] = k === "painting" ? 1 : 0;
    return estimate(p).total;
  };
  assert.deepEqual(only("3"), { low: 500, high: 3200 });
  assert.deepEqual(only("5"), { low: 1300, high: 5200 });
});

test("designer markup raises both ends; bathroom redo needs waterproofing", () => {
  const p = defaultPlan("4");
  const base = estimate(p).total;
  p.designer = true;
  p.lines.toilet_redo = 1;
  const e = estimate(p);
  assert.ok(e.total.low > base.low * 1.2 && e.total.high > base.high * 1.4);
  assert.ok(e.trades.includes("CR09"));
});

test("every line has a source note", () => {
  for (const l of COST_LINES) assert.ok(l.note, l.key);
});

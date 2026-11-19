import { test } from "node:test";
import assert from "node:assert/strict";
import { compareQuotes } from "../public/compare.js";

const quote = (items) => ({ items: items.map(([category, amount]) => ({ category, amount })) });

test("flags a category one firm left out as missing", () => {
  const { rows, gaps } = compareQuotes([
    quote([["Carpentry", 10000], ["Electrical", 2000]]),
    quote([["Carpentry", 11000]]),
  ]);
  const electrical = rows.find((r) => r.category === "Electrical");
  assert.equal(electrical.cells[1].flag, "missing");
  assert.equal(gaps, 1);
});

test("flags prices well above or below the median", () => {
  const { rows } = compareQuotes([
    quote([["Painting", 2000]]),
    quote([["Painting", 2100]]),
    quote([["Painting", 4000]]),
    quote([["Painting", 1000]]),
  ]);
  const flags = rows[0].cells.map((c) => c.flag);
  assert.deepEqual(flags, [null, null, "high", "low"]);
});

test("sums items per category and totals per quote", () => {
  const { rows, grandTotals } = compareQuotes([
    quote([["Carpentry", 3000], ["Carpentry", 2000], ["Unknown thing", 500]]),
  ]);
  assert.equal(rows.find((r) => r.category === "Carpentry").cells[0].amount, 5000);
  assert.equal(rows.find((r) => r.category === "Others").cells[0].amount, 500);
  assert.deepEqual(grandTotals, [5500]);
});

test("a single quote has no flags", () => {
  const { rows, gaps } = compareQuotes([quote([["Flooring", 4000]])]);
  assert.equal(rows[0].cells[0].flag, null);
  assert.equal(gaps, 0);
});

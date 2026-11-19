import { test } from "node:test";
import assert from "node:assert/strict";
import { filterVendors, findVendor } from "../public/find.js";
import { mergeSpaces, FORMAT } from "../public/storage.js";

const v = (name, codes, casetrust = false, extra = {}) => ({
  uen: name.toUpperCase().replace(/\W/g, ""),
  name,
  address: "1 Ubi Road",
  postal: "408000",
  trades: codes.map((code) => ({ code })),
  casetrust: casetrust ? { scheme: "CaseTrust" } : null,
  ...extra,
});

const vendors = [
  v("Alpha Interior", ["CR06"]),
  v("Bravo Reno", ["CR06", "ME05"], true),
  v("Charlie Works", []),
  v("Delta Design", ["CR06", "ME05", "ME12"]),
];

test("requires every selected trade", () => {
  const names = filterVendors(vendors, { trades: ["CR06", "ME05"] }).map((x) => x.name);
  assert.deepEqual(names, ["Bravo Reno", "Delta Design"]);
});

test("accredited firms first, then more trades", () => {
  const names = filterVendors(vendors).map((x) => x.name);
  assert.deepEqual(names, ["Bravo Reno", "Delta Design", "Alpha Interior", "Charlie Works"]);
});

test("CaseTrust-only and name search", () => {
  assert.deepEqual(filterVendors(vendors, { casetrustOnly: true }).map((x) => x.name), ["Bravo Reno"]);
  assert.deepEqual(filterVendors(vendors, { query: "delta" }).map((x) => x.name), ["Delta Design"]);
});

test("findVendor matches UEN or exact name", () => {
  assert.equal(findVendor(vendors, { uen: "alphainterior" })?.name, "Alpha Interior");
  assert.equal(findVendor(vendors, { name: "Delta Design Pte Ltd" })?.name, "Delta Design");
  assert.equal(findVendor(vendors, { name: "Nope" }), null);
});

test("merging keeps the latest shortlist edit per firm and the newer plan", () => {
  const base = { format: FORMAT, version: 1, name: "x", quotes: [], deleted: [] };
  const mine = { ...base, shortlist: [{ uen: "A", status: "contacted", updatedAt: "2026-12-02" }], plan: { flatType: "4", updatedAt: "2026-12-01" } };
  const theirs = {
    ...base,
    shortlist: [
      { uen: "A", status: "quote", updatedAt: "2026-12-03" },
      { uen: "B", status: "to contact", updatedAt: "2026-12-01" },
    ],
    plan: { flatType: "5", updatedAt: "2026-12-04" },
  };
  const m = mergeSpaces(mine, theirs);
  assert.deepEqual(m.shortlist.map((s) => `${s.uen}:${s.status}`).sort(), ["A:quote", "B:to contact"]);
  assert.equal(m.plan.flatType, "5");
});

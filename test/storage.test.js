import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeSpaces, parseSpaceFile, FORMAT } from "../public/storage.js";
import { matchContractor } from "../public/hdb.js";

const space = (quotes, deleted = []) => ({ format: FORMAT, version: 1, name: "Ours", quotes, deleted });
const q = (id, updatedAt, extra = {}) => ({
  id,
  firm: `Firm ${id}`,
  items: [],
  votes: {},
  createdAt: "2026-12-01T00:00:00Z",
  updatedAt,
  ...extra,
});

test("merging adds quotes only the other device has", () => {
  const merged = mergeSpaces(space([q("a", "1")]), space([q("b", "1")]));
  assert.deepEqual(merged.quotes.map((x) => x.id).sort(), ["a", "b"]);
});

test("the most recently edited version of a quote wins", () => {
  const merged = mergeSpaces(
    space([q("a", "2026-12-02", { firm: "Old name" })]),
    space([q("a", "2026-12-05", { firm: "New name" })]),
  );
  assert.equal(merged.quotes[0].firm, "New name");
});

test("votes from both partners are kept, latest vote per person wins", () => {
  const mine = q("a", "1", { votes: { Alex: { vote: "prefer", at: "2026-12-01" } } });
  const theirs = q("a", "1", {
    votes: { Sam: { vote: "no", at: "2026-12-02" }, Alex: { vote: "unsure", at: "2026-11-30" } },
  });
  const merged = mergeSpaces(space([mine]), space([theirs]));
  assert.deepEqual(merged.quotes[0].votes, {
    Alex: { vote: "prefer", at: "2026-12-01" },
    Sam: { vote: "no", at: "2026-12-02" },
  });
});

test("a quote deleted on one device stays deleted", () => {
  const merged = mergeSpaces(space([q("a", "1")]), space([], ["a"]));
  assert.equal(merged.quotes.length, 0);
});

test("rejects files that aren't exports", () => {
  assert.throws(() => parseSpaceFile("{}"));
  assert.throws(() => parseSpaceFile("not json"));
});

test("HDB matching: UEN, exact name, generic words don't match", () => {
  const list = [
    { uen: "123A", name: "CHIAT CHEE RENOVATION CONSTRUCTION & CLEANING SERVICE", ref: "HB-1" },
    { uen: "456B", name: "SINGAPORE INTERIOR PTE. LTD.", ref: "HB-2" },
  ];
  assert.equal(matchContractor(list, { name: "x", uen: "123a" }).status, "registered");
  assert.equal(matchContractor(list, { name: "Singapore Interior Pte Ltd" }).status, "registered");
  assert.equal(matchContractor(list, { name: "Chiat Chee Reno" }).status, "possible");
  assert.equal(matchContractor(list, { name: "Renovation Construction" }).status, "not_found");
});

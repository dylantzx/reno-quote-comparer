// Pure filtering/sorting for the "Find firms" screen.
import { norm } from "./hdb.js";

let cache = null;

export async function loadVendors() {
  if (cache) return cache;
  const res = await fetch("./data/vendors.json");
  if (!res.ok) throw new Error("Couldn't load the firm directory.");
  return (cache = await res.json());
}

/**
 * trades: workhead codes the firm must hold (all of them).
 * casetrustOnly: only CaseTrust-accredited firms.
 * query: matches name, address or postal code.
 * Accredited firms first, then firms holding more trades, then by name.
 */
export function filterVendors(vendors, { trades = [], casetrustOnly = false, query = "" } = {}) {
  const q = query.trim().toLowerCase();
  const nq = norm(query);
  return vendors
    .filter((v) => trades.every((t) => v.trades.some((x) => x.code === t)))
    .filter((v) => !casetrustOnly || v.casetrust)
    .filter(
      (v) =>
        !q ||
        (nq && norm(v.name).includes(nq)) ||
        v.address.toLowerCase().includes(q) ||
        v.postal.startsWith(q),
    )
    .sort(
      (a, b) =>
        Number(Boolean(b.casetrust)) - Number(Boolean(a.casetrust)) ||
        b.trades.length - a.trades.length ||
        a.name.localeCompare(b.name),
    );
}

/** Find a firm in the directory by UEN, or by exact (normalised) name. */
export function findVendor(vendors, { uen = "", name = "" }) {
  const u = uen.trim().toUpperCase();
  return (u && vendors.find((v) => v.uen === u)) || vendors.find((v) => name && norm(v.name) === norm(name)) || null;
}

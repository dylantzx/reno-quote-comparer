// HDB Directory of Renovation Contractors (data.gov.sg, free, no key, allows
// browser requests). The directory is ~2,700 rows, so we download it once,
// keep it for a week in this browser, and match locally.
const RESOURCE = "d_9973d2c119ed4dd1560aebf8f0829b86";
const URL = `https://data.gov.sg/api/action/datastore_search?resource_id=${RESOURCE}&limit=5000`;
const CACHE_KEY = "hdb-directory-v1";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

let contractors = null;

async function loadDirectory() {
  if (contractors) return contractors;
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY));
    if (cached && Date.now() - cached.at < MAX_AGE_MS) return (contractors = cached.list);
  } catch {}
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`data.gov.sg returned ${res.status}`);
  const body = await res.json();
  contractors = body.result.records.map((r) => ({
    uen: r.uen.trim().toUpperCase(),
    name: r.company_name.trim(),
    ref: r.directory_ref_no.trim(),
  }));
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), list: contractors }));
  } catch {}
  return contractors;
}

export const norm = (s) =>
  s
    .toUpperCase()
    .replace(/\b(PTE|LTD|PRIVATE|LIMITED|LLP|CO|COMPANY|SERVICES?|SINGAPORE|SG)\b/g, "")
    .replace(/[^A-Z0-9]/g, "");

const GENERIC =
  /\b(RENOVATIONS?|RENOS?|CONSTRUCTIONS?|INTERIORS?|DESIGNS?|DECOR(ATION)?S?|CONTRACTORS?|BUILDERS?|BUILDING|ENGINEERING|TRADING|ENTERPRISES?|WORKS?|HOMES?|HOUSE|STUDIO|GROUP|CLEANING|AND)\b/g;
export const core = (s) => norm(s.toUpperCase().replace(/&/g, " ").replace(GENERIC, ""));

/** Pure matcher, separated from the download so it can be tested. */
export function matchContractor(list, { name = "", uen = "" }) {
  const u = uen.trim().toUpperCase();
  if (u) {
    const hit = list.find((c) => c.uen === u);
    if (hit) return { status: "registered", match: hit };
  }
  const n = norm(name);
  if (!n) return { status: "not_found" };
  const exact = list.find((c) => norm(c.name) === n);
  if (exact) return { status: "registered", match: exact };
  // Fuzzy match on the distinctive part of the name only, so generic trade
  // words ("Renovation", "Interior") don't match hundreds of firms.
  const k = core(name);
  const similar =
    k.length < 4
      ? []
      : list
          .filter((c) => {
            const ck = core(c.name);
            return ck.length >= 4 && (ck.includes(k) || k.includes(ck));
          })
          .slice(0, 5);
  if (similar.length) return { status: "possible", candidates: similar };
  return { status: "not_found" };
}

/**
 * status: "registered" (UEN or exact name), "possible" (similar name),
 * "not_found", or "unavailable" (could not reach data.gov.sg).
 */
export async function checkContractor(firm) {
  try {
    return matchContractor(await loadDirectory(), firm);
  } catch (err) {
    return { status: "unavailable", message: err.message };
  }
}

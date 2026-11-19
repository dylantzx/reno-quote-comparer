// Everything lives in this browser. Sharing with your partner happens by
// exporting a file and importing it on the other device (mergeSpaces).
const KEY = "reno-space-v1";
export const FORMAT = "reno-quote-comparer";

export const newId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export function newSpace(name) {
  return { format: FORMAT, version: 1, name, quotes: [], deleted: [], shortlist: [], plan: null };
}

/** Fill in fields added after version 1 so older saves and exports still load. */
export function upgrade(space) {
  if (!space) return space;
  return { deleted: [], shortlist: [], plan: null, ...space };
}

export function loadSpace() {
  try {
    return upgrade(JSON.parse(localStorage.getItem(KEY)));
  } catch {
    return null;
  }
}

/** Returns false if the browser refused to save (private mode, storage off). */
export function saveSpace(space) {
  try {
    localStorage.setItem(KEY, JSON.stringify(space));
    return true;
  } catch {
    return false;
  }
}

export function parseSpaceFile(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file isn't a Reno Quote Comparer export.");
  }
  if (data?.format !== FORMAT || !Array.isArray(data.quotes)) {
    throw new Error("That file isn't a Reno Quote Comparer export.");
  }
  return upgrade(data);
}

const newer = (a, b) => ((a?.updatedAt ?? "") >= (b?.updatedAt ?? "") ? a : b);

/**
 * Combine two copies of the space. For each quote the most recently edited
 * version wins; votes are merged per person (latest vote wins); a quote
 * deleted on either side stays deleted.
 */
export function mergeSpaces(local, incoming) {
  const deleted = [...new Set([...(local.deleted ?? []), ...(incoming.deleted ?? [])])];
  const byId = new Map();
  for (const q of [...local.quotes, ...incoming.quotes]) {
    if (deleted.includes(q.id)) continue;
    const existing = byId.get(q.id);
    if (!existing) {
      byId.set(q.id, structuredClone(q));
      continue;
    }
    const base = structuredClone(newer(existing, q));
    const votes = { ...existing.votes };
    for (const [who, v] of Object.entries(q.votes ?? {})) {
      if (!votes[who] || v.at > votes[who].at) votes[who] = v;
    }
    base.votes = votes;
    byId.set(q.id, base);
  }
  const quotes = [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // Shortlist entries are never deleted, only marked removed, so the latest
  // edit per firm wins on both devices.
  const shortlist = new Map();
  for (const s of [...(local.shortlist ?? []), ...(incoming.shortlist ?? [])]) {
    shortlist.set(s.uen, newer(shortlist.get(s.uen), s) ?? s);
  }
  const plan = local.plan && incoming.plan ? newer(local.plan, incoming.plan) : local.plan ?? incoming.plan ?? null;

  return { ...upgrade(local), quotes, deleted, shortlist: [...shortlist.values()], plan: structuredClone(plan) };
}

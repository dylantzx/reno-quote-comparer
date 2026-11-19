// Typical Singapore renovation prices for a rough budget. Figures come from
// published guides (researched Nov 2026); recent per-unit rates are scarce and
// mostly single-source, so each line says where it came from. Not quotes.
import { CATEGORY_WORKHEADS } from "./trades.js";

const SC = "SmartCalculator.sg 2026";
const RCS = "Renovation Contractor SG 2026";
const SE = "Seedly 2024";
const Q15 = "Qanvast 2015 (old rate)";

export const COST_SOURCES = [
  { name: "SmartCalculator.sg", url: "https://www.smartcalculator.sg/articles/renovation-quotation-guide-singapore-2026", date: "Jul 2026" },
  { name: "renovationcontractorsingapore.com", url: "https://renovationcontractorsingapore.com/blogs/news/singapore-hdb-renovation-guide-costs-contractors-2025", date: "Oct 2026" },
  { name: "Seedly", url: "https://blog.seedly.sg/hdb-bto-flat-renovation-cost-guide", date: "Jun 2024" },
  { name: "Qanvast cost guide", url: "https://qanvast.com/sg/articles/what-are-the-expected-renovation-costs-for-hdb-flats-in-2026-3568", date: "Feb 2026" },
  { name: "Qanvast via 99.co", url: "https://www.99.co/singapore/insider/your-must-have-renovation-cost-breakdown/", date: "2015, old" },
];

export const FLAT_TYPES = {
  3: { label: "3-room BTO", sqm: "60–68 sqm" },
  4: { label: "4-room BTO", sqm: "85–97 sqm" },
  5: { label: "5-room BTO", sqm: "107–113 sqm" },
};

// Median total project cost on Qanvast for 2025 (mostly with an interior
// designer, and including items this estimate doesn't list).
export const BENCHMARKS = {
  3: { low: 40800, high: 52500 },
  4: { low: 50000, high: 60000 },
  5: { low: 60600, high: 76500 },
};

// Interior designers typically cost 20–40% more than going direct (Seedly
// says 30–50%, SmartCalculator 20–40%).
export const DESIGNER_MARKUP = { low: 0.2, high: 0.4 };

// qty: typical quantity for a 3/4/5-room BTO. rate: per unit, or per flat type.
export const COST_LINES = [
  { key: "hack_kitchen", category: "Hacking & demolition", label: "Hack kitchen wall (open concept)", unit: "ft run", low: 40, high: 80, qty: [10, 12, 12], note: `${Q15}; likely higher now` },
  { key: "floor_tiles", category: "Masonry & tiling", label: "New floor tiles (e.g. kitchen, yard)", unit: "sqft", low: 6, high: 12, qty: [0, 0, 0], note: `${SC}; BTO kitchens come tiled` },
  { key: "toilet_redo", category: "Masonry & tiling", label: "Redo a bathroom (hack & retile)", unit: "bathroom", low: 3100, high: 4700, qty: [0, 0, 0], note: SC, extraTrades: ["CR09"] },
  { key: "kitchen_cabinets", category: "Carpentry", label: "Kitchen cabinets, top & bottom", unit: "ft run", low: 200, high: 360, qty: [8, 10, 12], note: SC },
  { key: "countertop", category: "Carpentry", label: "Quartz countertop", unit: "sqft", low: 45, high: 85, qty: [16, 20, 24], note: RCS },
  { key: "wardrobes", category: "Carpentry", label: "Wardrobes (swing or sliding)", unit: "ft run", low: 200, high: 400, qty: [14, 20, 24], note: SC },
  { key: "shoe_cabinet", category: "Carpentry", label: "Shoe cabinet", unit: "ft run", low: 150, high: 300, qty: [4, 4, 5], note: SC },
  { key: "tv_console", category: "Carpentry", label: "TV console / feature wall", unit: "ft run", low: 170, high: 320, qty: [6, 8, 8], note: SC },
  { key: "study_table", category: "Carpentry", label: "Study table & shelves", unit: "ft run", low: 130, high: 260, qty: [0, 5, 6], note: SC },
  { key: "lighting", category: "Electrical", label: "Lighting points", unit: "points", low: 45, high: 90, qty: [10, 14, 16], note: SC },
  { key: "power", category: "Electrical", label: "Power points (13A sockets)", unit: "points", low: 45, high: 90, qty: [6, 8, 10], note: SC },
  { key: "plumbing", category: "Plumbing", label: "Plumbing points (sink, tap, water heater)", unit: "points", low: 120, high: 300, qty: [3, 3, 3], note: SC },
  { key: "painting", category: "Painting", label: "Paint whole flat", unit: "flat", low: { 3: 500, 4: 900, 5: 1300 }, high: { 3: 3200, 4: 4500, 5: 5200 }, qty: [1, 1, 1], note: `${SE} & ${SC} disagree; wide range` },
  { key: "vinyl", category: "Flooring", label: "Vinyl flooring (overlay)", unit: "sqft", low: 3, high: 8, qty: [500, 700, 850], note: RCS },
  { key: "ceiling", category: "Ceiling & partitions", label: "False ceiling / L-box", unit: "sqft", low: 6, high: 12, qty: [60, 80, 100], note: SC },
  { key: "doors", category: "Doors & windows", label: "Replace bedroom doors", unit: "doors", low: 230, high: 600, qty: [0, 0, 0], note: "Rough: marketplace listings, supply only" },
  { key: "haulage", category: "Cleaning & haulage", label: "Haulage, disposal & final clean", unit: "lot", low: 300, high: 1200, qty: [1, 1, 1], note: `Rough: ${SE} and ${SC} differ a lot` },
];

const idx = (flatType) => ({ 3: 0, 4: 1, 5: 2 })[flatType] ?? 1;

export function defaultPlan(flatType = "4") {
  return {
    flatType: String(flatType),
    designer: false,
    lines: Object.fromEntries(COST_LINES.map((l) => [l.key, l.qty[idx(flatType)]])),
  };
}

const rate = (r, flatType) => (typeof r === "object" ? r[flatType] : r);

/**
 * Cost ranges for a plan: per line, per category, total, plus the BCA
 * workheads a firm would need to do the selected work in-house.
 */
export function estimate(plan) {
  const m = plan.designer ? DESIGNER_MARKUP : { low: 0, high: 0 };
  const lines = COST_LINES.map((l) => {
    const qty = Number(plan.lines?.[l.key] ?? l.qty[idx(plan.flatType)]) || 0;
    return {
      ...l,
      qty,
      low: qty * rate(l.low, plan.flatType) * (1 + m.low),
      high: qty * rate(l.high, plan.flatType) * (1 + m.high),
    };
  });
  const byCategory = {};
  const total = { low: 0, high: 0 };
  const trades = new Set();
  for (const l of lines) {
    if (!l.qty) continue;
    byCategory[l.category] ??= { low: 0, high: 0 };
    byCategory[l.category].low += l.low;
    byCategory[l.category].high += l.high;
    total.low += l.low;
    total.high += l.high;
    for (const t of [...(CATEGORY_WORKHEADS[l.category] ?? []).slice(0, 1), ...(l.extraTrades ?? [])]) trades.add(t);
  }
  return { lines, byCategory, total, trades: [...trades] };
}

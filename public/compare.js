import { CATEGORIES } from "./categories.js";

// A category price is flagged when it is this far from the median of the
// firms that quoted it.
const HIGH = 1.3;
const LOW = 0.7;

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Build the side-by-side comparison for a list of quotes.
 * Returns one row per category that at least one firm quoted, with a cell
 * per quote holding its subtotal and a flag: "missing", "high", "low" or null.
 */
export function compareQuotes(quotes) {
  const totals = quotes.map((q) => {
    const byCat = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
    for (const item of q.items) {
      const cat = CATEGORIES.includes(item.category) ? item.category : "Others";
      byCat[cat] += Number(item.amount) || 0;
    }
    return byCat;
  });

  const rows = [];
  let gaps = 0;
  for (const category of CATEGORIES) {
    const amounts = totals.map((t) => t[category]);
    const quoted = amounts.filter((a) => a > 0);
    if (quoted.length === 0) continue;
    const med = median(quoted);
    const cells = amounts.map((amount) => {
      let flag = null;
      if (amount === 0 && quotes.length > 1) {
        flag = "missing";
        gaps++;
      } else if (quoted.length > 1 && amount > HIGH * med) flag = "high";
      else if (quoted.length > 1 && amount < LOW * med) flag = "low";
      return { amount, flag };
    });
    rows.push({ category, median: med, cells });
  }

  const grandTotals = totals.map((t) =>
    Object.values(t).reduce((sum, a) => sum + a, 0),
  );
  return { rows, grandTotals, gaps };
}

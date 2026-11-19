// BCA workheads relevant to an HDB renovation, and which quote categories
// each one covers. A BCA registration is about eligibility and financial
// grade (L1–L6), not about quality of work.
export const WORKHEADS = {
  CR06: { label: "Interior decoration & finishing", short: "Interior works" },
  RW01: { label: "Repair & redecoration", short: "Repair & redecoration" },
  ME05: { label: "Electrical engineering", short: "Electrical" },
  ME12: { label: "Plumbing & sanitary works", short: "Plumbing" },
  CR09: { label: "Waterproofing installation", short: "Waterproofing" },
  ME01: { label: "Air-conditioning, refrigeration & ventilation", short: "Aircon" },
};

// Quote category -> workheads a firm would normally hold to do it in-house.
export const CATEGORY_WORKHEADS = {
  "Hacking & demolition": ["CR06", "RW01"],
  "Masonry & tiling": ["CR06", "RW01"],
  Carpentry: ["CR06", "RW01"],
  Electrical: ["ME05"],
  Plumbing: ["ME12"],
  Painting: ["CR06", "RW01"],
  "Ceiling & partitions": ["CR06", "RW01"],
  Flooring: ["CR06", "RW01"],
  "Doors & windows": ["CR06", "RW01"],
};

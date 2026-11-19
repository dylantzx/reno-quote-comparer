// Builds public/data/vendors.json from Singapore open data:
//   1. HDB Directory of Renovation Contractors (data.gov.sg) – the base list:
//      only HDB-registered firms may renovate HDB flats.
//   2. BCA Listing of Registered Contractors (data.gov.sg) – which trades
//      ("workheads") each firm is registered for, joined by UEN.
//   3. CaseTrust accredited renovation businesses (case.org.sg) – consumer
//      protection accreditation, joined by name or postal code.
// Runs weekly in GitHub Actions; run locally with: npm run build-data
import fs from "node:fs";
import path from "node:path";
import { WORKHEADS } from "../public/trades.js";
import { norm, core } from "../public/hdb.js";

const API = "https://data.gov.sg/api/action/datastore_search";
const HDB = "d_9973d2c119ed4dd1560aebf8f0829b86";
const BCA = "d_dcda79be4aded5f9e769b8e23ff69b47";
const CASETRUST = "https://casetrust.case.org.sg/Home/casetrustlist";
const OUT = path.resolve("public/data/vendors.json");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url);
    if (res.ok) return res.json();
    if (res.status === 429 && attempt < 6) {
      await sleep(attempt * 5000); // data.gov.sg rate limit
      continue;
    }
    throw new Error(`${url} -> ${res.status}`);
  }
}

async function fetchAll(resource, filters) {
  const rows = [];
  for (let offset = 0; ; offset += 5000) {
    const q = new URLSearchParams({ resource_id: resource, limit: "5000", offset: String(offset) });
    if (filters) q.set("filters", JSON.stringify(filters));
    const body = await getJson(`${API}?${q}`);
    rows.push(...body.result.records);
    if (rows.length >= body.result.total || body.result.records.length === 0) return rows;
    await sleep(1500);
  }
}

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const decode = (s) =>
  s.replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");

async function fetchCaseTrust() {
  const html = await (await fetch(CASETRUST)).text();
  const rows = html.split("<tr>").slice(1);
  const out = [];
  for (const row of rows) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
    if (cells.length < 5 || !/Renovation/i.test(cells[2])) continue;
    const link = cells[1].match(/href="([^"]*)"/)?.[1] ?? "";
    const name = decode(clean(cells[1].replace(/<[^>]+>/g, "")));
    const address = clean(cells[3]);
    out.push({
      name,
      scheme: /RCMA/i.test(cells[2]) ? "CaseTrust-RCMA" : "CaseTrust",
      postal: address.match(/\b\d{6}\b/)?.[0] ?? "",
      expiry: clean(cells[4]),
      website: link && !/^javascript:/i.test(link) ? (link.startsWith("http") ? link : `https://${link}`) : "",
    });
  }
  if (out.length < 50) throw new Error(`CaseTrust page parsed only ${out.length} renovation rows; layout may have changed`);
  return out;
}

async function main() {
  console.log("Fetching HDB directory…");
  const hdb = await fetchAll(HDB);
  const bcaByUen = new Map();
  for (const code of Object.keys(WORKHEADS)) {
    console.log(`Fetching BCA workhead ${code}…`);
    await sleep(1500);
    for (const r of await fetchAll(BCA, { workhead: code })) {
      const uen = clean(r.uen_no).toUpperCase();
      if (!bcaByUen.has(uen)) bcaByUen.set(uen, []);
      bcaByUen.get(uen).push({ code, grade: clean(r.grade), expiry: clean(r.expiry_date) });
    }
  }
  console.log("Fetching CaseTrust list…");
  const casetrust = await fetchCaseTrust();
  const ctByName = new Map(casetrust.map((c) => [norm(c.name), c]));

  const vendors = hdb.map((r) => {
    const name = clean(r.company_name);
    const postal = clean(r.postal_code);
    const ct =
      ctByName.get(norm(name)) ??
      casetrust.find((c) => c.postal && c.postal === postal && core(c.name).length >= 4 && core(name).includes(core(c.name)));
    return {
      uen: clean(r.uen).toUpperCase(),
      name,
      ref: clean(r.directory_ref_no),
      address: clean(r.address),
      postal,
      phone: clean(r.contact_no),
      email: clean(r.email_address).toLowerCase(),
      trades: bcaByUen.get(clean(r.uen).toUpperCase()) ?? [],
      casetrust: ct ? { scheme: ct.scheme, expiry: ct.expiry, website: ct.website } : null,
    };
  });

  const out = {
    generatedAt: new Date().toISOString(),
    sources: {
      hdb: `https://data.gov.sg/datasets/${HDB}/view`,
      bca: `https://data.gov.sg/datasets/${BCA}/view`,
      casetrust: CASETRUST,
    },
    vendors,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out));
  const withTrades = vendors.filter((v) => v.trades.length).length;
  const withCt = vendors.filter((v) => v.casetrust).length;
  console.log(`Wrote ${vendors.length} firms (${withTrades} with BCA trades, ${withCt} CaseTrust) to ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

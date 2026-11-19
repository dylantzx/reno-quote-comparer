import { CATEGORIES } from "./categories.js";
import { compareQuotes } from "./compare.js";
import { checkContractor } from "./hdb.js";
import { WORKHEADS } from "./trades.js";
import { COST_SOURCES, FLAT_TYPES, BENCHMARKS, DESIGNER_MARKUP, defaultPlan, estimate } from "./costs.js";
import { loadVendors, filterVendors, findVendor } from "./find.js";
import { loadSpace, saveSpace, newSpace, newId, mergeSpaces, parseSpaceFile } from "./storage.js";

const app = document.getElementById("app");
const DEADLINE = new Date("2027-02-28T23:59:59+08:00");
const TARGET_FIRMS = 5;
const TARGET_QUOTES = 3;
const PAGE = 25;
const STATUSES = ["to contact", "contacted", "site visit booked", "quote received", "not proceeding"];

const state = {
  space: loadSpace(),
  view: readPref("view") || "plan", // plan | find | compare
  draft: null, // quote being entered or edited
  busy: false,
  error: "",
  notice: "",
  vendors: null, // { generatedAt, vendors: [...] }
  vendorError: "",
  filter: { trades: ["CR06"], casetrustOnly: false, query: "" },
  shown: PAGE,
};

// ---------- helpers ----------
function readPref(k) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function writePref(k, v) {
  try {
    localStorage.setItem(k, v);
  } catch {}
}
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const money = (n) => "$" + Math.round(n).toLocaleString("en-SG");
const range = (r) => (Math.round(r.low) === Math.round(r.high) ? money(r.low) : `${money(r.low)}–${money(r.high)}`);
const now = () => new Date().toISOString();
const me = () => readPref("voter") || "";
const shortlist = () => (state.space.shortlist ?? []).filter((s) => !s.removed);

function persist() {
  if (!saveSpace(state.space)) {
    state.notice = "This browser isn't saving data (private mode?). Export a file before closing the tab.";
  }
}

function cleanItems(items) {
  return items
    .filter((i) => String(i.description).trim() || Number(i.amount))
    .map((i) => ({
      id: i.id || newId(),
      category: CATEGORIES.includes(i.category) ? i.category : "Others",
      description: String(i.description ?? "").trim(),
      amount: Math.max(0, Math.round((Number(i.amount) || 0) * 100) / 100),
    }));
}

async function ensureVendors() {
  if (state.vendors || state.vendorError) return;
  try {
    state.vendors = await loadVendors();
  } catch (err) {
    state.vendorError = err.message;
  }
  render();
}

// ---------- shared pieces ----------
function setupView() {
  return `
  <div class="card narrow">
    <h1>Plan, find and compare your renovation</h1>
    <p class="muted">Estimate what your renovation should cost, shortlist HDB-registered firms for the trades you need, then compare their quotes side by side.</p>
    <form id="create">
      <label for="name">Name this project</label>
      <input id="name" placeholder="e.g. Our BTO renovation" required />
      <label for="voter">Your first name</label>
      <input id="voter" value="${esc(me())}" required />
      <div class="row"><button>Start</button></div>
    </form>
    <p class="muted small">Your partner already started? Ask them to tap <b>Export for partner</b> and send you the file, then
      <button class="ghost" id="import-first">import it here</button>.</p>
    <p class="muted small">Everything stays in this browser. Nothing is uploaded anywhere.</p>
    ${state.error ? `<p class="error">${esc(state.error)}</p>` : ""}
  </div>`;
}

function navView() {
  const tab = (id, label) => `<button data-view="${id}" class="${state.view === id ? "on" : ""}">${label}</button>`;
  return `<nav class="tabs steps">${tab("plan", "1. Plan & budget")}${tab("find", "2. Find firms")}${tab("compare", "3. Compare quotes")}</nav>`;
}

function statsView(comparison) {
  const s = state.space;
  const quotes = s.quotes.filter((q) => q.items.length).length;
  const days = Math.ceil((DEADLINE - Date.now()) / 86400000);
  const est = s.plan ? estimate(s.plan).total : null;
  const stat = (value, label, done) =>
    `<div class="stat ${done ? "done" : ""}"><b>${value}</b><span class="muted small">${label}</span></div>`;
  return `<div class="stats">
    ${stat(est ? range(est) : "Not yet", "itemised estimate", Boolean(est))}
    ${stat(`${shortlist().length} / ${TARGET_FIRMS}`, "firms shortlisted", shortlist().length >= TARGET_FIRMS)}
    ${stat(`${quotes} / ${TARGET_QUOTES}`, "quotes compared", quotes >= TARGET_QUOTES)}
    ${stat(comparison.gaps, "gaps found to ask about", false)}
    ${stat(days > 0 ? `${days} days` : "Past", "to sign by 28 Feb 2027", false)}
  </div>`;
}

// ---------- 1. plan ----------
function planView() {
  const plan = state.space.plan;
  if (!plan) {
    return `<div class="card">
      <h2>What are you planning?</h2>
      <p class="muted">Pick your flat type. We'll fill in typical quantities for a BTO renovation, then you can adjust each line.</p>
      <div class="row">${Object.entries(FLAT_TYPES)
        .map(([k, f]) => `<button data-flat="${k}">${esc(f.label)}</button>`)
        .join("")}</div>
    </div>`;
  }
  const e = estimate(plan);
  const lineRows = (category) =>
    e.lines
      .filter((l) => l.category === category)
      .map(
        (l) => `<tr class="${l.qty ? "" : "off"}">
          <td>${esc(l.label)}${l.note ? `<span class="muted small block">${esc(l.note)}</span>` : ""}</td>
          <td class="qty"><input type="number" min="0" step="1" data-line="${l.key}" value="${l.qty}" aria-label="${esc(l.label)} quantity" /> <span class="muted small">${esc(l.unit)}</span></td>
          <td class="num">${l.qty ? range(l) : "—"}</td>
        </tr>`,
      )
      .join("");
  const groups = CATEGORIES.filter((c) => e.lines.some((l) => l.category === c))
    .map(
      (c) => `<tr class="group"><td colspan="2">${esc(c)}</td><td class="num">${e.byCategory[c] ? range(e.byCategory[c]) : "—"}</td></tr>${lineRows(c)}`,
    )
    .join("");
  const trades = e.trades.map((t) => `<span class="badge">${esc(WORKHEADS[t].short)}</span>`).join(" ");
  return `<div class="card summary">
      <h2>Itemised estimate: ${range(e.total)}</h2>
      <p class="muted small">${esc(FLAT_TYPES[plan.flatType].label)} · ${plan.designer ? `with an interior designer (+${DESIGNER_MARKUP.low * 100}–${DESIGNER_MARKUP.high * 100}%)` : "direct with a contractor"} · before GST</p>
      <p class="notice small">Reality check: whole ${esc(FLAT_TYPES[plan.flatType].label)} projects on Qanvast had a median of <b>${range(BENCHMARKS[plan.flatType])}</b> in 2025, mostly with interior designers.
        The gap from the estimate above is usually things not listed here: design fees, more carpentry, aircon, light fittings, appliances, curtains and GST. Budget towards the higher figure.</p>
      <label class="check"><input type="checkbox" id="designer" ${plan.designer ? "checked" : ""}/> We'll use an interior designer (design, project management and a markup)</label>
      <p class="small">Trades you'll need: ${trades || "none yet"}</p>
      <div class="row"><button data-goto-find>Find firms for these trades →</button>
        <button class="ghost" data-flat="${plan.flatType}">Reset to typical ${esc(FLAT_TYPES[plan.flatType].label)} quantities</button>
        <select id="flat-type" aria-label="Flat type" style="width:auto">${Object.entries(FLAT_TYPES)
          .map(([k, f]) => `<option value="${k}" ${k === plan.flatType ? "selected" : ""}>${esc(f.label)}</option>`)
          .join("")}</select></div>
    </div>
    <div class="card">
      <h2>What you want done</h2>
      <p class="muted small">Set a quantity to 0 to leave it out. Ranges are typical Singapore prices from published guides, not quotes.</p>
      <div class="table-wrap"><table class="plan"><thead><tr><th>Item</th><th>Quantity</th><th class="num">Typical cost</th></tr></thead>
        <tbody>${groups}<tr class="total"><td colspan="2">Total</td><td class="num">${range(e.total)}</td></tr></tbody></table></div>
      <p class="muted small">Sources: ${COST_SOURCES.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a> (${esc(s.date)})`).join(", ")}. Prices move; treat this as a sense-check, not a quote.</p>
    </div>`;
}

// ---------- 2. find ----------
function badgesView(v) {
  const trades = v.trades.map((t) => `<span class="badge" title="${esc(WORKHEADS[t.code].label)}, BCA grade ${esc(t.grade)}">${esc(WORKHEADS[t.code].short)}</span>`).join(" ");
  const ct = v.casetrust ? `<span class="badge ok" title="Accredited until ${esc(v.casetrust.expiry)}">${esc(v.casetrust.scheme)}</span>` : "";
  return `<span class="badge plain">HDB ${esc(v.ref)}</span> ${ct} ${trades}`;
}

function vendorCard(v) {
  const listed = shortlist().some((s) => s.uen === v.uen);
  const reviews = `https://www.google.com/search?q=${encodeURIComponent(`"${v.name}" renovation reviews`)}`;
  const contact = [
    v.phone && `<a href="tel:${esc(v.phone)}">${esc(v.phone)}</a>`,
    v.email && `<a href="mailto:${esc(v.email)}">${esc(v.email)}</a>`,
    v.casetrust?.website && `<a href="${esc(v.casetrust.website)}" target="_blank" rel="noopener">Website</a>`,
    `<a href="${reviews}" target="_blank" rel="noopener">Search reviews ↗</a>`,
  ]
    .filter(Boolean)
    .join(" · ");
  return `<div class="vendor">
    <div class="vendor-main">
      <b>${esc(v.name)}</b>
      <div class="badges">${badgesView(v)}</div>
      <div class="muted small">${esc(v.address)}${v.postal ? `, S${esc(v.postal)}` : ""}</div>
      <div class="small">${contact}</div>
    </div>
    <button class="${listed ? "ghost" : ""}" data-shortlist="${esc(v.uen)}">${listed ? "✓ Shortlisted" : "Shortlist"}</button>
  </div>`;
}

function shortlistView() {
  const list = shortlist();
  if (!list.length) return "";
  const rows = list
    .map((s) => {
      const hasQuote = state.space.quotes.some((q) => (q.uen && q.uen === s.uen) || q.firm === s.name);
      return `<tr>
        <td><b>${esc(s.name)}</b><div class="small">${[s.phone && `<a href="tel:${esc(s.phone)}">${esc(s.phone)}</a>`, s.email && `<a href="mailto:${esc(s.email)}">${esc(s.email)}</a>`].filter(Boolean).join(" · ")}</div></td>
        <td><select data-status="${esc(s.uen)}" aria-label="Status">${STATUSES.map((st) => `<option ${st === s.status ? "selected" : ""}>${st}</option>`).join("")}</select></td>
        <td>${hasQuote ? `<span class="muted small">Quote added</span>` : `<button class="ghost" data-quote-for="${esc(s.uen)}">Add their quote</button>`}</td>
        <td><button class="ghost" data-unlist="${esc(s.uen)}" aria-label="Remove from shortlist">✕</button></td>
      </tr>`;
    })
    .join("");
  return `<div class="card"><h2>Your shortlist (${list.length}/${TARGET_FIRMS})</h2>
    <div class="table-wrap"><table><tbody>${rows}</tbody></table></div>
    <p class="muted small">Ask each for a site visit and an itemised quote. Tip: ask the same questions of every firm so the quotes line up.</p></div>`;
}

function findView() {
  if (state.vendorError) return `<div class="card"><p class="error">${esc(state.vendorError)}</p></div>`;
  if (!state.vendors) return `<div class="card"><p class="muted">Loading the firm directory…</p></div>`;
  const f = state.filter;
  const chips = Object.entries(WORKHEADS)
    .map(([code, w]) => `<label class="chip"><input type="checkbox" data-trade="${code}" ${f.trades.includes(code) ? "checked" : ""}/> ${esc(w.short)}</label>`)
    .join("");
  const updated = new Date(state.vendors.generatedAt).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" });
  return `${shortlistView()}
    <div class="card">
      <h2>Find HDB-registered firms</h2>
      <p class="small">Must be BCA-registered for:</p>
      <div class="chips">${chips}</div>
      <div class="row">
        <input id="search" placeholder="Search by name, street or postal code" value="${esc(f.query)}" style="flex:1;min-width:200px" />
        <label class="chip"><input type="checkbox" id="casetrust-only" ${f.casetrustOnly ? "checked" : ""}/> CaseTrust-accredited only</label>
      </div>
      <p class="notice small">These firms are <b>eligible</b> (HDB-registered, BCA trade registration) and some are <b>accredited</b> (CaseTrust: deposit protection, standard contract). They are <b>not rated</b>: check reviews and past work before you commit.</p>
      <div id="results">${resultsView()}</div>
      <p class="muted small">Data: <a href="${esc(state.vendors.sources.hdb)}" target="_blank" rel="noopener">HDB directory</a>, <a href="${esc(state.vendors.sources.bca)}" target="_blank" rel="noopener">BCA registered contractors</a>, <a href="${esc(state.vendors.sources.casetrust)}" target="_blank" rel="noopener">CaseTrust</a>. Refreshed ${updated}. BCA grade (L1–L6) reflects financial capacity, not quality.</p>
    </div>`;
}

function resultsView() {
  const list = filterVendors(state.vendors.vendors, state.filter);
  const shown = list.slice(0, state.shown);
  return `<p class="muted small">${list.length} firm${list.length === 1 ? "" : "s"} match.</p>
    ${shown.map(vendorCard).join("")}
    ${list.length > shown.length ? `<div class="row"><button class="ghost" id="more">Show more (${list.length - shown.length} left)</button></div>` : ""}`;
}

// ---------- 3. compare ----------
function hdbLabel(q) {
  const h = q.hdb;
  const v = state.vendors && findVendor(state.vendors.vendors, { uen: q.uen, name: q.firm });
  const extra = v ? `<div class="badges right">${badgesView(v)}</div>` : "";
  if (!h) return `<span class="hdb muted">Not checked</span>`;
  switch (h.status) {
    case "registered":
      return `<span class="hdb registered">✓ HDB-registered</span>${extra}`;
    case "possible":
      return `<span class="hdb possible">? Similar name in directory:<br>${h.candidates.map((c) => esc(c.name)).join("<br>")}<br>Add the UEN to confirm</span>`;
    case "not_found":
      return `<span class="hdb not_found">✗ Not in HDB directory</span>`;
    default:
      return `<span class="hdb unavailable">Directory unavailable, re-check later</span>`;
  }
}

function votesView(q) {
  const mine = q.votes[me()]?.vote;
  const buttons = ["prefer", "unsure", "no"]
    .map((v) => `<button data-vote="${v}" data-q="${q.id}" class="${mine === v ? "on" : ""}">${v}</button>`)
    .join("");
  const all = Object.entries(q.votes)
    .map(([who, v]) => `${esc(who)}: ${esc(v.vote)}`)
    .join(" · ");
  return `<div class="votes">${buttons}</div><div class="vote-list">${all || "No votes yet"}</div>`;
}

function comparisonView(comparison) {
  const s = state.space;
  if (!s.quotes.length) {
    return `<div class="card"><h2>Comparison</h2><p class="muted">Add your first quote below${shortlist().length ? " (or tap <b>Add their quote</b> on your shortlist)" : ""}. The comparison appears here once you have one.</p></div>`;
  }
  const est = s.plan ? estimate(s.plan).byCategory : null;
  const { rows, grandTotals } = comparison;
  const head = s.quotes.map((q) => `<th class="num">${esc(q.firm)}</th>`).join("");
  const body = rows
    .map((r) => {
      const e = est?.[r.category];
      const cells = r.cells
        .map((c) => {
          let flag = c.flag;
          if (!flag && e && c.amount > e.high * 1.15) flag = "over";
          const label = { missing: "Not quoted: ask", high: "Above others", low: "Below others: check scope", over: "Above your estimate" }[flag];
          return `<td class="num ${flag === "over" ? "high" : flag || ""}">${c.amount ? money(c.amount) : "—"}${label ? `<span class="flag">${label}</span>` : ""}</td>`;
        })
        .join("");
      return `<tr><td>${esc(r.category)}</td>${est ? `<td class="num muted">${e ? range(e) : "—"}</td>` : ""}${cells}</tr>`;
    })
    .join("");
  const estCell = (v) => (est ? `<td class="num muted">${v}</td>` : "");
  const totals = grandTotals.map((t) => `<td class="num">${money(t)}</td>`).join("");
  const hdb = s.quotes.map((q) => `<td class="num">${hdbLabel(q)}</td>`).join("");
  const votes = s.quotes.map((q) => `<td>${votesView(q)}</td>`).join("");
  return `<div class="card">
    <h2>Comparison</h2>
    <div class="table-wrap"><table>
      <thead><tr><th>Category</th>${est ? `<th class="num">Your estimate</th>` : ""}${head}</tr></thead>
      <tbody>${body}
        <tr class="total"><td>Total</td>${est ? estCell(range(estimate(s.plan).total)) : ""}${totals}</tr>
        <tr><td>Registration</td>${estCell("")}${hdb}</tr>
        <tr><td>Your view${me() ? ` (${esc(me())})` : ""}</td>${estCell("")}${votes}</tr>
      </tbody>
    </table></div>
    <div class="legend">
      <span class="l-missing">Missing: another firm quoted this, this one didn't</span>
      <span class="l-high">30%+ above the middle price, or above your estimate</span>
      <span class="l-low">30%+ below: check what's left out</span>
    </div>
  </div>`;
}

function quoteDetails(q) {
  const items = q.items
    .map((i) => `<tr><td>${esc(i.category)}</td><td>${esc(i.description)}</td><td class="num">${money(i.amount)}</td></tr>`)
    .join("");
  return `<details class="card">
    <summary>${esc(q.firm)} · ${q.items.length} items${q.uen ? ` · UEN ${esc(q.uen)}` : ""}</summary>
    <div class="table-wrap"><table><tbody>${items}</tbody></table></div>
    <div class="row">
      <button class="ghost" data-edit="${q.id}">Edit</button>
      <button class="ghost" data-recheck="${q.id}">Re-check HDB directory</button>
      <button class="danger" data-delete="${q.id}">Delete</button>
    </div>
  </details>`;
}

function editorView() {
  const d = state.draft;
  const options = (sel) => CATEGORIES.map((c) => `<option ${c === sel ? "selected" : ""}>${esc(c)}</option>`).join("");
  const rows = d.items
    .map(
      (i, idx) => `<tr>
        <td class="cat"><select data-field="category" data-idx="${idx}" aria-label="Category">${options(i.category)}</select></td>
        <td><input data-field="description" data-idx="${idx}" value="${esc(i.description)}" placeholder="What the firm wrote" aria-label="Description" /></td>
        <td class="amt"><input data-field="amount" data-idx="${idx}" type="number" min="0" step="0.01" value="${esc(i.amount)}" aria-label="Amount" /></td>
        <td><button class="ghost" data-remove="${idx}" title="Remove line" aria-label="Remove line">✕</button></td>
      </tr>`,
    )
    .join("");
  return `<div class="card">
    <h2>${d.id ? "Edit quote" : "Add a quote"}</h2>
    <p class="muted small">Type each line from the quote and pick its category. Packages that bundle several trades: put them under the main trade and mention the rest in the description.</p>
    <div class="row" style="margin-top:0">
      <div style="flex:2;min-width:200px"><label for="d-firm">Firm name</label><input id="d-firm" value="${esc(d.firm)}" /></div>
      <div style="flex:1;min-width:140px"><label for="d-uen">UEN (optional, on the quote)</label><input id="d-uen" value="${esc(d.uen)}" /></div>
    </div>
    <div class="table-wrap"><table class="editor">
      <thead><tr><th>Category</th><th>Description</th><th class="num">Amount (SGD)</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <div class="row">
      <button class="ghost" id="add-row">+ Add line</button>
      <span class="muted small" style="margin-left:auto">Total ${money(d.items.reduce((s, i) => s + (Number(i.amount) || 0), 0))}</span>
    </div>
    <div class="row">
      <button id="save-draft" ${state.busy ? "disabled" : ""}>${state.busy ? "Checking HDB directory…" : d.id ? "Save changes" : "Save quote"}</button>
      <button class="ghost" id="cancel-draft">Cancel</button>
    </div>
    ${state.error ? `<p class="error">${esc(state.error)}</p>` : ""}
  </div>`;
}

function compareView(comparison) {
  const add = state.draft
    ? editorView()
    : `<div class="card"><div class="row" style="margin-top:0"><button id="start-quote">+ Add a quote</button>
        <span class="muted small">Tip: after adding or voting, tap <b>Export for partner</b> and send them the file.</span></div></div>`;
  return `${comparisonView(comparison)}${add}
    ${state.space.quotes.length ? `<h2>Quote details</h2>${state.space.quotes.map(quoteDetails).join("")}` : ""}`;
}

// ---------- render ----------
function render() {
  if (state.draft) syncDraftFromDom(); // keep typed values across re-renders
  document.getElementById("space-name").textContent = state.space?.name ?? "";
  document.getElementById("top-actions").hidden = !state.space;
  if (!state.space) {
    app.innerHTML = setupView();
    return;
  }
  const comparison = compareQuotes(state.space.quotes);
  const body = { plan: planView, find: findView, compare: () => compareView(comparison) }[state.view]();
  app.innerHTML = `${state.notice ? `<div class="notice">${esc(state.notice)}</div>` : ""}${statsView(comparison)}${navView()}${body}`;
  if (state.view === "find" || state.view === "compare") ensureVendors();
}

function syncDraftFromDom() {
  const firm = document.getElementById("d-firm");
  if (!firm) return;
  state.draft.firm = firm.value;
  state.draft.uen = document.getElementById("d-uen").value;
  document.querySelectorAll(".editor [data-field]").forEach((el) => {
    state.draft.items[el.dataset.idx][el.dataset.field] = el.value;
  });
}

const blankItem = () => ({ category: "Carpentry", description: "", amount: "" });

// ---------- actions ----------
function go(view) {
  state.view = view;
  state.notice = "";
  writePref("view", view);
  render();
  window.scrollTo({ top: 0 });
}

function updatePlan(fn) {
  fn(state.space.plan);
  state.space.plan.updatedAt = now();
  persist();
}

function toggleShortlist(uen) {
  const list = (state.space.shortlist ??= []);
  const entry = list.find((s) => s.uen === uen);
  if (entry && !entry.removed) {
    entry.removed = true;
  } else if (entry) {
    entry.removed = false;
  } else {
    const v = state.vendors.vendors.find((x) => x.uen === uen);
    list.push({ uen, name: v.name, phone: v.phone, email: v.email, status: "to contact", addedAt: now() });
  }
  (entry ?? list.at(-1)).updatedAt = now();
  persist();
}

async function saveDraft() {
  syncDraftFromDom();
  const d = state.draft;
  if (!d.firm.trim()) {
    state.error = "Add the firm's name.";
    return render();
  }
  state.busy = true;
  state.error = "";
  render();
  const existing = state.space.quotes.find((q) => q.id === d.id);
  const nameChanged = !existing || existing.firm !== d.firm.trim() || existing.uen !== d.uen.trim();
  const hdb = nameChanged ? await checkContractor({ name: d.firm, uen: d.uen }) : existing.hdb;
  const fields = { firm: d.firm.trim(), uen: d.uen.trim(), items: cleanItems(d.items), hdb, updatedAt: now() };
  if (existing) Object.assign(existing, fields);
  else state.space.quotes.push({ id: newId(), createdAt: now(), votes: {}, ...fields });
  const s = shortlist().find((x) => x.uen && x.uen === fields.uen);
  if (s && s.status !== "quote received") Object.assign(s, { status: "quote received", updatedAt: now() });
  persist();
  state.busy = false;
  state.draft = null;
  render();
}

function exportFile() {
  const blob = new Blob([JSON.stringify(state.space, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `reno-plan-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  state.notice = "Exported. Send the file to your partner (WhatsApp, Telegram, email). They tap Import partner's file.";
  render();
}

async function importFile(file) {
  try {
    const incoming = parseSpaceFile(await file.text());
    const before = state.space?.quotes.length ?? 0;
    state.space = state.space ? mergeSpaces(state.space, incoming) : incoming;
    persist();
    const added = state.space.quotes.length - before;
    state.notice = `Imported "${incoming.name}". ${added > 0 ? `${added} new quote(s) added; ` : ""}plan, shortlist, edits and votes merged.`;
    state.error = "";
  } catch (err) {
    state.error = err.message;
    state.notice = "";
  }
  render();
}

// ---------- events ----------
app.addEventListener("submit", (e) => {
  e.preventDefault();
  if (e.target.id !== "create") return;
  const name = document.getElementById("name").value.trim();
  writePref("voter", document.getElementById("voter").value.trim());
  state.space = newSpace(name);
  state.view = "plan";
  persist();
  render();
});

app.addEventListener("input", (e) => {
  const t = e.target;
  if (t.id === "search") {
    state.filter.query = t.value;
    state.shown = PAGE;
    document.getElementById("results").innerHTML = resultsView();
  } else if (t.dataset.line) {
    updatePlan((p) => (p.lines[t.dataset.line] = Math.max(0, Number(t.value) || 0)));
  }
});

app.addEventListener("change", (e) => {
  const t = e.target;
  if (t.dataset.line) {
    render(); // refresh totals once the user leaves the field
  } else if (t.id === "designer") {
    updatePlan((p) => (p.designer = t.checked));
    render();
  } else if (t.id === "flat-type") {
    updatePlan((p) => (p.flatType = t.value));
    render();
  } else if (t.dataset.trade) {
    const set = new Set(state.filter.trades);
    t.checked ? set.add(t.dataset.trade) : set.delete(t.dataset.trade);
    state.filter.trades = [...set];
    state.shown = PAGE;
    render();
  } else if (t.id === "casetrust-only") {
    state.filter.casetrustOnly = t.checked;
    state.shown = PAGE;
    render();
  } else if (t.dataset.status) {
    const s = state.space.shortlist.find((x) => x.uen === t.dataset.status);
    Object.assign(s, { status: t.value, updatedAt: now() });
    persist();
  }
});

app.addEventListener("click", async (e) => {
  const t = e.target.closest("button");
  if (!t || t.closest("form")) return; // form buttons are handled on submit
  const quotes = state.space?.quotes ?? [];
  if (t.id === "import-first") {
    document.getElementById("import-file").click();
  } else if (t.dataset.view) {
    go(t.dataset.view);
  } else if (t.dataset.flat) {
    const keepDesigner = state.space.plan?.designer ?? false;
    state.space.plan = { ...defaultPlan(t.dataset.flat), designer: keepDesigner, updatedAt: now() };
    persist();
    render();
  } else if (t.hasAttribute("data-goto-find")) {
    const needed = estimate(state.space.plan).trades;
    state.filter.trades = needed.includes("CR06") ? ["CR06"] : needed.slice(0, 1);
    state.notice = `Showing firms registered for interior works. Firms that also hold ${needed
      .filter((x) => x !== "CR06")
      .map((x) => WORKHEADS[x].short.toLowerCase())
      .join(" and ")} can do those in-house; tick them to narrow the list.`;
    state.view = "find";
    writePref("view", "find");
    render();
  } else if (t.dataset.shortlist) {
    toggleShortlist(t.dataset.shortlist);
    render();
  } else if (t.dataset.unlist) {
    toggleShortlist(t.dataset.unlist);
    render();
  } else if (t.dataset.quoteFor) {
    const s = shortlist().find((x) => x.uen === t.dataset.quoteFor);
    state.draft = { firm: s.name, uen: s.uen, items: [blankItem(), blankItem(), blankItem()] };
    go("compare");
  } else if (t.id === "more") {
    state.shown += PAGE;
    document.getElementById("results").innerHTML = resultsView();
  } else if (t.id === "start-quote") {
    state.draft = { firm: "", uen: "", items: [blankItem(), blankItem(), blankItem()] };
    state.notice = "";
    render();
    document.getElementById("d-firm")?.focus();
  } else if (t.id === "add-row") {
    syncDraftFromDom();
    state.draft.items.push(blankItem());
    render();
  } else if (t.dataset.remove !== undefined) {
    syncDraftFromDom();
    state.draft.items.splice(Number(t.dataset.remove), 1);
    render();
  } else if (t.id === "cancel-draft") {
    state.draft = null;
    state.error = "";
    render();
  } else if (t.id === "save-draft") {
    await saveDraft();
  } else if (t.dataset.edit) {
    const q = quotes.find((x) => x.id === t.dataset.edit);
    state.draft = structuredClone({ id: q.id, firm: q.firm, uen: q.uen, items: q.items });
    render();
    document.getElementById("d-firm")?.scrollIntoView({ behavior: "smooth", block: "center" });
  } else if (t.dataset.delete) {
    const q = quotes.find((x) => x.id === t.dataset.delete);
    if (!confirm(`Delete the quote from ${q.firm}? This can't be undone.`)) return;
    state.space.quotes = quotes.filter((x) => x.id !== q.id);
    state.space.deleted = [...(state.space.deleted ?? []), q.id];
    persist();
    render();
  } else if (t.dataset.recheck) {
    const q = quotes.find((x) => x.id === t.dataset.recheck);
    t.disabled = true;
    t.textContent = "Checking…";
    q.hdb = await checkContractor({ name: q.firm, uen: q.uen });
    q.updatedAt = now();
    persist();
    render();
  } else if (t.dataset.vote) {
    let voter = me();
    if (!voter) {
      voter = prompt("Your first name (so your partner can see your vote)")?.trim();
      if (!voter) return;
      writePref("voter", voter);
    }
    const q = quotes.find((x) => x.id === t.dataset.q);
    q.votes[voter] = { vote: t.dataset.vote, at: now() };
    persist();
    render();
  }
});

document.getElementById("export").addEventListener("click", exportFile);
document.getElementById("import").addEventListener("click", () => document.getElementById("import-file").click());
document.getElementById("import-file").addEventListener("change", (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (file) importFile(file);
});

render();

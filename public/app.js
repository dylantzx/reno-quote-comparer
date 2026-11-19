import { CATEGORIES } from "./categories.js";
import { compareQuotes } from "./compare.js";
import { checkContractor } from "./hdb.js";
import { loadSpace, saveSpace, newSpace, newId, mergeSpaces, parseSpaceFile } from "./storage.js";

const app = document.getElementById("app");
const DEADLINE = new Date("2027-02-28T23:59:59+08:00");
const TARGET_FIRMS = 5;
const TARGET_QUOTES = 3;

const state = {
  space: loadSpace(),
  draft: null, // quote being entered or edited
  busy: false,
  error: "",
  notice: "",
};

// ---------- helpers ----------
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const money = (n) => "$" + Math.round(n).toLocaleString("en-SG");
const now = () => new Date().toISOString();
const me = () => {
  try {
    return localStorage.getItem("voter") || "";
  } catch {
    return "";
  }
};
const setMe = (name) => {
  try {
    localStorage.setItem("voter", name);
  } catch {}
};

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

// ---------- views ----------
function setupView() {
  return `
  <div class="card narrow">
    <h1>Compare renovation quotes</h1>
    <p class="muted">Put every interior designer and contractor quote into the same categories, spot what's missing or overpriced, and decide together.</p>
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

function statsView(s, comparison) {
  const checked = s.quotes.filter((q) => q.hdb?.status === "registered").length;
  const quotes = s.quotes.filter((q) => q.items.length).length;
  const days = Math.ceil((DEADLINE - Date.now()) / 86400000);
  const stat = (value, label, done) =>
    `<div class="stat ${done ? "done" : ""}"><b>${value}</b><span class="muted small">${label}</span></div>`;
  return `<div class="stats">
    ${stat(`${checked} / ${TARGET_FIRMS}`, "firms confirmed HDB-registered", checked >= TARGET_FIRMS)}
    ${stat(`${quotes} / ${TARGET_QUOTES}`, "quotes compared", quotes >= TARGET_QUOTES)}
    ${stat(comparison.gaps, "gaps found to ask about", false)}
    ${stat(days > 0 ? `${days} days` : "Past", "to sign by 28 Feb 2027", false)}
  </div>`;
}

function hdbLabel(h) {
  if (!h) return `<span class="hdb muted">Not checked</span>`;
  switch (h.status) {
    case "registered":
      return `<span class="hdb registered">✓ HDB-registered<br><span class="muted">${esc(h.match.ref)}</span></span>`;
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

function comparisonView(s, comparison) {
  if (!s.quotes.length) {
    return `<div class="card"><h2>Comparison</h2><p class="muted">Add your first quote below. The comparison appears here once you have one.</p></div>`;
  }
  const { rows, grandTotals } = comparison;
  const head = s.quotes.map((q) => `<th class="num">${esc(q.firm)}</th>`).join("");
  const body = rows
    .map((r) => {
      const cells = r.cells
        .map((c) => {
          const label = { missing: "Not quoted: ask", high: "Above others", low: "Below others: check scope" }[c.flag];
          return `<td class="num ${c.flag || ""}">${c.amount ? money(c.amount) : "—"}${label ? `<span class="flag">${label}</span>` : ""}</td>`;
        })
        .join("");
      return `<tr><td>${esc(r.category)}</td>${cells}</tr>`;
    })
    .join("");
  const totals = grandTotals.map((t) => `<td class="num">${money(t)}</td>`).join("");
  const hdb = s.quotes.map((q) => `<td class="num">${hdbLabel(q.hdb)}</td>`).join("");
  const votes = s.quotes.map((q) => `<td>${votesView(q)}</td>`).join("");
  return `<div class="card">
    <h2>Comparison</h2>
    <div class="table-wrap"><table>
      <thead><tr><th>Category</th>${head}</tr></thead>
      <tbody>${body}
        <tr class="total"><td>Total</td>${totals}</tr>
        <tr><td>HDB directory</td>${hdb}</tr>
        <tr><td>Your view${me() ? ` (${esc(me())})` : ""}</td>${votes}</tr>
      </tbody>
    </table></div>
    <div class="legend">
      <span class="l-missing">Missing: another firm quoted this, this one didn't</span>
      <span class="l-high">30%+ above the middle price</span>
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

function mainView() {
  const s = state.space;
  const comparison = compareQuotes(s.quotes);
  const add = state.draft
    ? editorView()
    : `<div class="card"><div class="row" style="margin-top:0"><button id="start-quote">+ Add a quote</button>
        <span class="muted small">Tip: after adding or voting, tap <b>Export for partner</b> and send them the file.</span></div></div>`;
  return `${state.notice ? `<div class="notice">${esc(state.notice)}</div>` : ""}
    ${statsView(s, comparison)}${comparisonView(s, comparison)}${add}
    ${s.quotes.length ? `<h2>Quote details</h2>${s.quotes.map(quoteDetails).join("")}` : ""}`;
}

// ---------- render ----------
function render() {
  if (state.draft) syncDraftFromDom(); // keep typed values across re-renders
  document.getElementById("space-name").textContent = state.space?.name ?? "";
  document.getElementById("top-actions").hidden = !state.space;
  app.innerHTML = state.space ? mainView() : setupView();
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
  persist();
  state.busy = false;
  state.draft = null;
  render();
}

function exportFile() {
  const blob = new Blob([JSON.stringify(state.space, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `reno-quotes-${new Date().toISOString().slice(0, 10)}.json`;
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
    state.notice = `Imported "${incoming.name}". ${added > 0 ? `${added} new quote(s) added; ` : ""}votes and edits merged.`;
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
  setMe(document.getElementById("voter").value.trim());
  state.space = newSpace(name);
  persist();
  render();
});

app.addEventListener("click", async (e) => {
  const t = e.target.closest("button");
  if (!t || t.closest("form")) return; // form buttons are handled on submit
  const quotes = state.space?.quotes ?? [];
  if (t.id === "import-first") {
    document.getElementById("import-file").click();
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
      setMe(voter);
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

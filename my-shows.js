// My Shows: every show in the library on one full page, one tab per status
// (Watching, Completed, On Hold, Stopped, Plan to Watch), as posters or as
// a list - and a page of its own for each show (opened from it): the
// show's facts, scores, your progress, its episodes and cast.
//
// Costs next to nothing: the list is the library itself (already loaded);
// the posters are stats.js's 30-day TMDB facts (statsShowInfo), fetched
// only for the shows on screen; Watching, Plan to Watch and On Hold use
// the episode lists the home page already loaded. A show's page uses
// TMDB's details and cast (the same cached calls as the home page and the
// cast) and MDBList's scores (kept a day). A show's page is also where its
// status is changed and its episodes marked (the search window's episodes
// manager, saved the same way), and a show's title on the home page opens
// it (openShowPage). Uses app.js's globals and stats.js's statsShowInfo /
// statsPool.

const MS_TABS = [
  { id: "watching", label: "Watching", color: "var(--accent)" },
  { id: "completed", label: "Completed", color: "#4ade80" },
  { id: "hold", label: "On Hold", color: "#c084fc" },
  { id: "dropped", label: "Stopped", color: "var(--danger)" },
  { id: "plantowatch", label: "Plan to Watch", color: "var(--gold)" },
];
const MS_STATE_KEY = "my_shows_view";
const MS_DAY_MS = 24 * 60 * 60 * 1000;
const MS_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MS_WEEKDAYS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

const msState = { tab: "watching", view: "grid", sort: "recent", q: "" };
let msRows = [];               // one per library show (msGatherRows)
const msInfo = new Map();      // docId -> statsShowInfo result, this session
const msEnriched = new Set();  // statuses whose episode counts are in
let msDetailToken = 0;
let msStandalone = false;      // opened from the home page: Back closes it all
let msChanged = false;         // a status changed here: the home page redraws on close
let msGuard = null;            // the episodes manager's "leave with unsaved changes?"

// ---------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------
function msDate(t, withYear = true) {
  if (!t) return "";
  const d = new Date(t);
  if (isNaN(d)) return "";
  return `${MS_MONTHS[d.getMonth()]} ${d.getDate()}${withYear ? `, ${d.getFullYear()}` : ""}`;
}
function msMonthYear(t) {
  const d = new Date(t);
  return isNaN(d) ? "" : `${MS_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
function msAgo(t) {
  if (!t) return "";
  const days = Math.floor((Date.now() - t) / MS_DAY_MS);
  if (days < 1) return "today";
  if (days < 2) return "yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 365) { const m = Math.round(days / 30.4); return `${m} month${m === 1 ? "" : "s"} ago`; }
  const y = Math.round(days / 365); return `${y} year${y === 1 ? "" : "s"} ago`;
}
function msSpan(ms) {
  const days = Math.round(ms / MS_DAY_MS);
  if (days < 1) return "1 day";
  if (days < 14) return `${days} days`;
  if (days < 60) return `${Math.round(days / 7)} weeks`;
  if (days < 730) return `${Math.round(days / 30.4)} months`;
  return `${(days / 365).toFixed(1).replace(/\.0$/, "")} years`;
}
function msHours(min) {
  if (!min) return "0m";
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  if (h >= 48) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
}
const msCode = (s, e) => `S${s} E${e}`;
function msParseCode(code) {
  const m = /^S(\d+)E(\d+)$/i.exec(code || "");
  return m ? { s: Number(m[1]), e: Number(m[2]) } : null;
}
const msTab = id => MS_TABS.find(t => t.id === id) || MS_TABS[0];
function msImgUrl(path, size) {
  if (!path) return null;
  return /^https?:/.test(path) ? path : `https://image.tmdb.org/t/p/${size}${path}`;
}

// ---------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------
// One row per library show, from the library alone (no network).
function msGatherRows() {
  const rows = [];
  for (const [docId, s] of library.store.view()) {
    const recs = Object.values(s.watched || {});
    let lastAt = 0, firstAt = 0, lastEp = null;
    for (const r of recs) {
      const t = r.at ? Date.parse(r.at) : NaN;
      if (!isNaN(t)) {
        if (t > lastAt) lastAt = t;
        if (!firstAt || t < firstAt) firstAt = t;
      }
      if (r.s > 0 && r.e != null && (!lastEp || r.s > lastEp.s || (r.s === lastEp.s && r.e > lastEp.e))) lastEp = { s: r.s, e: r.e };
    }
    const info = msInfo.get(docId) || null;
    rows.push({
      docId, title: s.title || "Unknown", status: s.status,
      tmdb: s.ids && s.ids.tmdb != null ? s.ids.tmdb : null,
      year: (info && info.y) || s.year || null,
      eps: Math.max(recs.length, s.watchedCountHint || 0),
      lastAt, firstAt, lastEp,
      addedAt: Date.parse(s.addedAt) || 0, changedAt: Date.parse(s.statusChangedAt) || 0,
      total: null, notAired: null, next: null,
      poster: msPosterFor(s, info),
    });
  }
  return rows;
}

// The poster the home page shows for this show if one was picked there,
// else TMDB's own.
// (w342: the grid's posters are 165-330px wide - w185 was blurry. TMDB's
// image server, not its API: no quota.)
function msPosterFor(show, info) {
  const tmdb = show.ids && show.ids.tmdb;
  if (tmdb != null) {
    const picked = getImageOverrides()[tmdb];
    const path = picked && (picked.panelPosterPath || picked.posterPath);
    if (path) return msImgUrl(path, "w342");
  }
  return info && info.p ? msImgUrl(info.p, "w342") : null;
}

// Watching / Plan to Watch / On Hold: episode counts and the next episode,
// from the episode lists (already loaded for the home page's panels).
async function msEnrich(status) {
  if (msEnriched.has(status) || !["watching", "plantowatch", "hold"].includes(status)) return;
  msEnriched.add(status);
  const items = await library.adapter.items(status).catch(() => []);
  const byDoc = new Map(items.map(it => [String(it.show.ids.library), it]));
  for (const row of msRows) {
    const it = byDoc.get(row.docId);
    if (!it || !it.total_episodes_count) continue;
    row.total = it.total_episodes_count;
    row.notAired = it.not_aired_episodes_count || 0;
    row.next = it.next_to_watch || null;
  }
}

// Posters (and years) for the shows on screen, a few at a time; each card
// gets its picture as it comes.
async function msLoadPosters(rows) {
  const missing = rows.filter(r => r.tmdb != null && !msInfo.has(r.docId));
  if (!missing.length) return;
  await statsPool(missing, 8, async row => {
    const info = await statsShowInfo(row.tmdb);
    msInfo.set(row.docId, info || {});
    const show = library.store.view().get(row.docId);
    if (!row.poster && show) row.poster = msPosterFor(show, info);
    if (info && info.y) row.year = info.y;
    msPaintPoster(row);
  });
}
function msPaintPoster(row) {
  if (!row.poster) return;
  document.querySelectorAll(`#myShowsPage [data-doc="${CSS.escape(row.docId)}"] .ms-pic`).forEach(el => {
    if (el.tagName === "IMG") return;
    const img = document.createElement("img");
    img.className = el.className;
    img.alt = "";
    img.loading = "lazy";
    img.src = row.poster;
    el.replaceWith(img);
  });
  document.querySelectorAll(`#myShowsPage [data-doc="${CSS.escape(row.docId)}"] .ms-year`).forEach(el => { el.textContent = row.year || ""; });
}

// ---------------------------------------------------------------------
// The list page
// ---------------------------------------------------------------------
function msSaveState() {
  try { localStorage.setItem(MS_STATE_KEY, JSON.stringify({ tab: msState.tab, view: msState.view, sort: msState.sort })); } catch (e) { /* not remembered */ }
}
function msLoadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(MS_STATE_KEY) || "{}");
    if (MS_TABS.some(t => t.id === saved.tab)) msState.tab = saved.tab;
    if (saved.view === "grid" || saved.view === "list") msState.view = saved.view;
    if (["recent", "title", "year", "added", "progress"].includes(saved.sort)) msState.sort = saved.sort;
  } catch (e) { /* defaults */ }
}

function msOpenPage(opts = {}) {
  if (!library || !library.store || !library.adapter || document.getElementById("myShowsPage")) return;
  msStandalone = !!opts.docId;
  msChanged = false;
  msGuard = null;
  msLoadState();
  msState.q = "";
  const overlay = document.createElement("div");
  overlay.className = "sx-overlay ms-overlay";
  overlay.id = "myShowsPage";
  overlay.innerHTML = `
    <div class="sx-modal" role="dialog" aria-modal="true" aria-labelledby="msTitle">
      <div class="sx-head">
        <div class="sx-title"><h2 id="msTitle">My Shows</h2><span class="sx-subtitle" id="msSubtitle"></span></div>
        <div class="sx-tabs ms-tabs" role="tablist" aria-label="Shows by status" id="msTabs"></div>
        <button type="button" class="sx-close" id="myShowsCloseBtn" aria-label="Close">&times;</button>
      </div>
      <div class="sx-body ms-body" id="msBody">
        <div class="ms-tools">
          <label class="ms-search"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            <input type="search" id="msSearch" placeholder="Search in this list" aria-label="Search in this list" autocomplete="off"></label>
          <select class="ms-select" id="msSort" aria-label="Sort">
            <option value="recent">Last watched</option>
            <option value="added">Recently added</option>
            <option value="title">Title A-Z</option>
            <option value="year">Year</option>
            <option value="progress">Progress</option>
          </select>
          <div class="ms-views" role="group" aria-label="View">
            <button type="button" data-view="grid" aria-label="Posters" title="Posters"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9" rx="1"></rect><rect x="14" y="3" width="7" height="9" rx="1"></rect><rect x="3" y="15" width="7" height="6" rx="1"></rect><rect x="14" y="15" width="7" height="6" rx="1"></rect></svg></button>
            <button type="button" data-view="list" aria-label="List" title="List"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><circle cx="4" cy="6" r="1"></circle><circle cx="4" cy="12" r="1"></circle><circle cx="4" cy="18" r="1"></circle></svg></button>
          </div>
        </div>
        <div id="msList"></div>
      </div>
      <div class="ms-detail" id="msDetail" hidden></div>
    </div>`;
  document.body.appendChild(overlay);
  document.body.classList.add("stats-open");
  pushModalHistoryState(msClosePage);
  overlay.querySelector("#myShowsCloseBtn").onclick = msClosePage;
  document.addEventListener("keydown", msKeyHandler);

  msRows = msGatherRows();
  msEnriched.clear();
  const sort = overlay.querySelector("#msSort");
  sort.value = msState.sort;
  sort.onchange = () => { msState.sort = sort.value; msSaveState(); msRenderList(); };
  overlay.querySelector("#msSearch").oninput = e => { msState.q = e.target.value; msRenderList(); };
  overlay.querySelectorAll(".ms-views button").forEach(b => {
    b.onclick = () => { msState.view = b.dataset.view; msSaveState(); msRenderList(); };
  });
  const tabs = overlay.querySelector("#msTabs");
  tabs.addEventListener("click", e => { const b = e.target.closest(".sx-tab"); if (b) msSelectTab(b.dataset.tab); });
  tabs.addEventListener("keydown", e => {
    const i = MS_TABS.findIndex(t => t.id === msState.tab);
    const n = MS_TABS.length;
    const next = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (next >= 0) { e.preventDefault(); msSelectTab(MS_TABS[next].id, true); }
  });
  overlay.querySelector("#msList").addEventListener("click", e => {
    const card = e.target.closest("[data-doc]");
    if (card) msOpenDetail(card.dataset.doc);
  });
  overlay.querySelector("#msList").addEventListener("keydown", e => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const card = e.target.closest("[data-doc]");
    if (card) { e.preventDefault(); msOpenDetail(card.dataset.doc); }
  });

  msRenderSubtitle();
  msSelectTab(msState.tab, !msStandalone);
  if (msStandalone) msOpenDetail(String(opts.docId));
}

// A show's page straight from the home page (its title): over everything,
// and Back closes it. Any other window open (the all-shows window) is
// closed first, its history entry gone, before this one takes its own.
async function openShowPage(ids) {
  if (!library || !library.adapter) return;
  const found = library.adapter.find(ids);
  if (!found) { showToast("This show isn't in your list.", true); return; }
  if (document.getElementById("myShowsPage")) { msOpenDetail(found.docId); return; }
  if (activeModalClose) {
    await new Promise(resolve => {
      window.addEventListener("popstate", () => setTimeout(resolve, 0), { once: true });
      history.back();
    });
    if (activeModalClose) return; // that window refused to close
  }
  msOpenPage({ docId: found.docId });
}

function msRenderSubtitle() {
  const el = document.getElementById("msSubtitle");
  if (!el) return;
  const eps = msRows.reduce((a, r) => a + r.eps, 0);
  el.textContent = `${msRows.length} shows · ${eps.toLocaleString("en-US")} episodes watched`;
}

function msRenderTabs(focus) {
  const tabs = document.getElementById("msTabs");
  if (!tabs) return;
  tabs.innerHTML = MS_TABS.map(t => {
    const n = msRows.filter(r => r.status === t.id).length;
    const on = t.id === msState.tab;
    return `<button type="button" role="tab" class="sx-tab ms-tab" data-tab="${t.id}" style="--ms-c:${t.color}" aria-selected="${on}" aria-controls="msList" tabindex="${on ? 0 : -1}">
      <span class="ms-dot"></span>${t.label}<span class="ms-count">${n}</span></button>`;
  }).join("");
  if (focus) { const b = tabs.querySelector(".sx-tab[aria-selected=\"true\"]"); if (b) b.focus(); }
}

async function msSelectTab(tab, focus) {
  msState.tab = tab;
  msSaveState();
  msRenderTabs(focus);
  const body = document.getElementById("msBody");
  if (body) body.scrollTop = 0;
  msRenderList();
  if (!msEnriched.has(tab) && ["watching", "plantowatch", "hold"].includes(tab)) {
    await msEnrich(tab);
    if (document.getElementById("myShowsPage") && msState.tab === tab) msRenderList();
  }
}

function msSorted(rows) {
  const by = {
    recent: (a, b) => (b.lastAt || b.changedAt) - (a.lastAt || a.changedAt),
    added: (a, b) => b.addedAt - a.addedAt,
    title: (a, b) => a.title.localeCompare(b.title),
    year: (a, b) => (b.year || 0) - (a.year || 0) || a.title.localeCompare(b.title),
    progress: (a, b) => msProgress(b) - msProgress(a) || a.title.localeCompare(b.title),
  };
  return rows.slice().sort(by[msState.sort] || by.recent);
}
// 0..1, or -1 when the number of episodes isn't known here.
function msProgress(row) {
  if (row.status === "completed") return 1;
  const aired = row.total != null ? row.total - (row.notAired || 0) : null;
  if (!aired) return row.status === "plantowatch" ? 0 : -1;
  return Math.min(1, row.eps / aired);
}

// The status's own line under a show: what's next, where it stopped, when.
function msStatusLine(row) {
  switch (row.status) {
    case "watching": {
      const nx = msParseCode(row.next);
      if (nx) return `Next: ${msCode(nx.s, nx.e)}`;
      if (row.total != null) return row.notAired ? "Up to date · more coming" : "Up to date";
      return row.lastEp ? `Last: ${msCode(row.lastEp.s, row.lastEp.e)}` : "";
    }
    case "completed": return row.lastAt ? `Finished ${msMonthYear(row.lastAt)}` : "Finished";
    case "hold": return row.lastEp ? `Paused at ${msCode(row.lastEp.s, row.lastEp.e)}` : `On hold since ${msMonthYear(row.changedAt)}`;
    case "dropped": return row.lastEp ? `Stopped at ${msCode(row.lastEp.s, row.lastEp.e)}` : `Stopped ${msMonthYear(row.changedAt)}`;
    case "plantowatch": return row.addedAt ? `Added ${msMonthYear(row.addedAt)}` : "";
    default: return "";
  }
}
function msCountLine(row) {
  const aired = row.total != null ? row.total - (row.notAired || 0) : null;
  const word = n => `episode${n === 1 ? "" : "s"}`;
  if (row.status === "plantowatch") return aired ? `<b>${aired}</b> ${word(aired)}` : "";
  if (aired && row.status !== "completed") return `<b>${row.eps}</b> / ${aired} ${word(aired)}`;
  return `<b>${row.eps}</b> episode${row.eps === 1 ? "" : "s"}`;
}

function msRenderList() {
  const list = document.getElementById("msList");
  if (!list) return;
  document.querySelectorAll("#myShowsPage .ms-views button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.view === msState.view)));
  const tab = msTab(msState.tab);
  const q = msState.q.trim().toLowerCase();
  const inTab = msRows.filter(r => r.status === tab.id);
  const rows = msSorted(inTab.filter(r => !q || r.title.toLowerCase().includes(q)));
  if (!rows.length) {
    list.innerHTML = `<p class="ms-empty">${inTab.length ? `No show in ${esc(tab.label)} matches "${esc(msState.q.trim())}".` : `Nothing in ${esc(tab.label)} yet.`}</p>`;
    return;
  }
  const pic = (row, cls) => row.poster
    ? `<img class="ms-pic ${cls}" src="${esc(row.poster)}" alt="" loading="lazy">`
    : `<div class="ms-pic ${cls} ms-pic-empty">${esc((row.title[0] || "?").toUpperCase())}</div>`;
  const bar = row => {
    const p = msProgress(row);
    return p >= 0 && row.status !== "plantowatch" ? `<div class="ms-bar"><i style="width:${Math.round(p * 100)}%"></i></div>` : "";
  };
  list.style.setProperty("--ms-c", tab.color);
  if (msState.view === "grid") {
    list.innerHTML = `<div class="ms-grid">${rows.map(row => `
      <div class="ms-card" data-doc="${esc(row.docId)}" role="button" tabindex="0" aria-label="${esc(row.title)}">
        <div class="ms-poster">${pic(row, "")}${bar(row)}</div>
        <div class="ms-meta">
          <div class="ms-name" title="${esc(row.title)}">${esc(row.title)} <span class="ms-year">${row.year || ""}</span></div>
          <div class="ms-count-line">${msCountLine(row)}</div>
          <div class="ms-line">${esc(msStatusLine(row))}</div>
        </div>
      </div>`).join("")}</div>`;
  } else {
    list.innerHTML = `<div class="ms-rows">${rows.map(row => {
      const p = msProgress(row);
      return `
      <div class="ms-row" data-doc="${esc(row.docId)}" role="button" tabindex="0" aria-label="${esc(row.title)}">
        ${pic(row, "ms-mini")}
        <div class="ms-row-main"><div class="ms-name">${esc(row.title)} <span class="ms-year">${row.year || ""}</span></div><div class="ms-line">${esc(msStatusLine(row))}</div></div>
        <div class="ms-row-prog"><span>${msCountLine(row)}${p >= 0 && row.status !== "plantowatch" ? ` · ${Math.round(p * 100)}%` : ""}</span>${p >= 0 && row.status !== "plantowatch" ? `<div class="ms-track"><i style="width:${Math.round(p * 100)}%"></i></div>` : ""}</div>
        <div class="ms-row-when">${row.lastAt ? `Last watched<br>${esc(msAgo(row.lastAt))}` : ""}</div>
      </div>`;
    }).join("")}</div>`;
  }
  msLoadPosters(rows);
}

function msKeyHandler(e) {
  if (e.key !== "Escape") return;
  if (!document.getElementById("msDetail").hidden) history.back();
  else msClosePage();
}
function msClosePage() {
  const page = document.getElementById("myShowsPage");
  if (!page) return;
  if (msGuard && !msGuard()) return;
  msGuard = null;
  msDetailToken++;
  page.remove();
  if (!document.getElementById("statsPage")) document.body.classList.remove("stats-open");
  document.removeEventListener("keydown", msKeyHandler);
  consumeModalHistoryState();
  if (!msStandalone) { const btn = document.getElementById("myShowsBtn"); if (btn) btn.focus(); }
  // Changed here: the home page behind is stale.
  if (msChanged || watchedMarksChanged) {
    msChanged = false;
    watchedMarksChanged = false;
    main();
  }
}

// An episode marked while the page is open (Emby): the rows again, in place.
function myShowsRefreshIfOpen() {
  if (!document.getElementById("myShowsPage")) return;
  msRows = msGatherRows();
  msEnriched.clear();
  msRenderSubtitle();
  msRenderTabs(false);
  const body = document.getElementById("msBody");
  const y = body ? body.scrollTop : 0;
  msRenderList();
  if (body) body.scrollTop = y;
  msEnrich(msState.tab).then(() => { if (document.getElementById("myShowsPage")) msRenderList(); });
}

// ---------------------------------------------------------------------
// A show's page
// ---------------------------------------------------------------------
// Opened over the list (which keeps its place). Back - the page's button,
// Escape, the browser's or the phone's - comes back to the list: it has a
// history entry of its own, and while it's open the modal history's close
// function is "back to the list". Opened from the home page it shares the
// page's entry instead, so Back closes it all.
function msOpenDetail(docId) {
  const pane = document.getElementById("msDetail");
  const show = library.store.view().get(String(docId));
  if (!pane || !show) return;
  pane.hidden = false;
  pane.scrollTop = 0;
  pane.innerHTML = `<div class="ms-d-loading"><div class="spinner"></div></div>`;
  if (!msStandalone) {
    activeModalClose = msCloseDetail;
    history.pushState({ modal: true }, "");
  }
  const token = ++msDetailToken;
  msBuildDetail(String(docId), show, token).catch(err => {
    if (token === msDetailToken) pane.innerHTML = `<div class="ms-d-top"><button type="button" class="ms-back" data-ep-back>&larr; ${msStandalone ? "Back" : "My Shows"}</button></div><p class="ms-empty">Couldn't load this show: ${esc(err.message || err)}</p>`;
  });
}
// Called by the history handler (popstate) - the entry is already gone.
function msCloseDetail() {
  if (msGuard && !msGuard()) return;
  msGuard = null;
  const pane = document.getElementById("msDetail");
  msDetailToken++;
  if (pane) { pane.hidden = true; pane.innerHTML = ""; }
  // The list is open again: its own close function back, once the history
  // handler is done (set now, it would read as a refused close).
  queueMicrotask(() => { if (document.getElementById("myShowsPage")) activeModalClose = msClosePage; });
  if (msChanged || watchedMarksChanged) myShowsRefreshIfOpen();
  const card = document.querySelector(`#msList [data-doc="${CSS.escape(String(msLastDetailDoc || ""))}"]`);
  if (card) card.focus({ preventScroll: true });
}

// The show's page drawn again after a change made on it, where it was.
async function msRedrawDetail(docId) {
  const pane = document.getElementById("msDetail");
  const show = library.store.view().get(String(docId));
  if (!pane || !show) return;
  msGuard = null;
  msRows = msGatherRows();
  const y = pane.scrollTop;
  const token = ++msDetailToken;
  await msBuildDetail(String(docId), show, token).catch(() => {});
  if (token === msDetailToken) pane.scrollTop = y;
}

async function msChangeStatus(docId, status, title, year) {
  const show = library.store.view().get(String(docId));
  if (!show || show.status === status) return;
  try {
    // Sent to Plan to Watch by hand: kept there (as the card menu does).
    await saveShowStatus({ library: docId }, status,
      status === "plantowatch" ? { title, year, autoStarted: "manual" } : { title, year });
    msChanged = true;
    showToast(`Moved "${title}" to ${msTab(status).label}`);
  } catch (err) {
    reportWriteError(err);
  }
  await msRedrawDetail(docId);
}

// Edit episodes: the episodes manager (search.js) in the Episodes box -
// marks staged until Save, a guard against leaving with unsaved ones, and
// its Back draws the page again with what was saved.
async function msEditEpisodes(docId, title) {
  const box = document.getElementById("msEpsBox");
  const pane = document.getElementById("msDetail");
  if (!box || !pane) return;
  const match = await library.adapter.findStatus({ library: docId }).catch(() => null);
  if (!match) { showToast("This show isn't in your list.", true); return; }
  const section = box.closest(".ms-sec");
  section.classList.add("ms-editing");
  // The phone's Back steps out of the manager first (appBackPressed takes
  // the first [data-ep-back] on screen).
  const pageBack = pane.querySelector(".ms-back");
  if (pageBack) pageBack.removeAttribute("data-ep-back");
  openEpisodesManager({ title }, match, {
    body: box,
    overlay: pane,
    setGuard: fn => { msGuard = fn; },
    onBack: () => { msGuard = null; msRedrawDetail(docId); },
  });
}
let msLastDetailDoc = null;

async function msBuildDetail(docId, show, token) {
  msLastDetailDoc = docId;
  const cache = sharedCache || (sharedCache = new TmdbCache());
  const tmdb = show.ids && show.ids.tmdb != null ? show.ids.tmdb : null;
  const [detail, credits, item, episodes] = await Promise.all([
    tmdb != null ? cache.getShow(tmdb).catch(() => null) : null,
    tmdb != null ? cache.getCredits(tmdb).catch(() => null) : null,
    library.adapter.findStatus({ library: docId }).then(r => r && r.item).catch(() => null),
    library.adapter.showEpisodes(docId).catch(() => null),
  ]);
  if (token !== msDetailToken) return;
  const imdb = show.ids.imdb || (detail && detail.external_ids && detail.external_ids.imdb_id) || null;
  const ratings = await loadRatings(detail && detail.vote_average, imdb, isRecentShow(detail && detail.first_air_date)).catch(() => ({}));
  if (token !== msDetailToken) return;

  const pane = document.getElementById("msDetail");
  const eps = (episodes || []).filter(e => e.season > 0 && e.episode != null).sort((a, b) => a.season - b.season || a.episode - b.episode);
  const watched = new Map(); // "s-e" -> watched_at
  for (const s of (item && item.seasons) || []) for (const e of s.episodes) watched.set(`${s.number}-${e.number}`, e.watched_at);
  const now = Date.now();
  const avgRuntime = LibraryCore.averageRuntime(eps) || (detail && averageEpisodeRuntime(detail)) || null;
  const aired = ep => LibraryCore.isAired(ep, now, avgRuntime) || watched.has(`${ep.season}-${ep.episode}`);
  const airedCount = eps.filter(aired).length;
  const watchedCount = item ? item.watched_episodes_count : Object.keys(show.watched || {}).length;
  const row = msRows.find(r => r.docId === docId) || {};

  const images = detail ? computeImages(detail, tmdb, "top") : {};
  const poster = images.posterUrl || row.poster || null;
  const savedBackdrop = detail && poster ? msSavedBackdrop(tmdb, poster) : null;
  const backdrop = (savedBackdrop && savedBackdrop.path ? msImgUrl(savedBackdrop.path, "w1280") : msBackdropFor(detail)) || images.bannerUrl || null;
  const title = (detail && detail.name) || show.title;

  // Facts line
  const facts = [];
  const firstYear = detail && detail.first_air_date ? detail.first_air_date.slice(0, 4) : show.year;
  const running = detail && (detail.status === "Returning Series" || detail.in_production);
  const lastYear = detail && detail.last_air_date ? detail.last_air_date.slice(0, 4) : null;
  if (firstYear) facts.push(`<b>${esc(firstYear)}${running ? " – now" : lastYear && lastYear !== String(firstYear) ? ` – ${esc(lastYear)}` : ""}</b>`);
  const net = detail && latestNetwork(detail);
  if (net) {
    const logo = resolveNetworkLogoUrl(net.name, net.logo_path);
    facts.push(logo ? `<span class="ms-net" title="${esc(net.name)}"><img src="${esc(logo)}" alt="${esc(net.name)}"></span>` : `<span>${esc(net.name)}</span>`);
  }
  const slot = running ? msTimeSlot(eps) : null;
  if (slot) facts.push(`<span>${esc(slot)}</span>`);
  const seasons = [...new Set(eps.map(e => e.season))];
  const seasonCount = (detail && detail.number_of_seasons) || seasons.length;
  if (seasonCount) facts.push(`<span>${seasonCount} season${seasonCount === 1 ? "" : "s"} · ${eps.length || (detail && detail.number_of_episodes) || 0} episodes</span>`);
  if (avgRuntime) facts.push(`<span>~${Math.round(avgRuntime)} min</span>`);
  const age = detail && extractContentRating(detail);
  if (age) facts.push(`<span class="ms-age">${esc(age)}</span>`);
  if (detail && detail.status === "Ended") facts.push(`<span class="ms-ended">Ended</span>`);
  if (detail && detail.status === "Canceled") facts.push(`<span class="ms-ended">Canceled</span>`);

  // Scores
  const score = (cls, label, value, suffix, sub) => value == null ? "" : `
    <div class="ms-score"><span class="ms-score-logo ${cls}">${label}</span><div><b>${value}<small>${suffix}</small></b>${sub ? `<span>${sub}</span>` : ""}</div></div>`;
  const votes = n => n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k votes` : `${n} votes`;
  const scoresHtml = [
    score("imdb", "IMDb", ratings.imdb != null ? ratings.imdb.toFixed(1) : null, "/10", ""),
    score("tmdb", "TMDB", ratings.tmdb != null ? ratings.tmdb.toFixed(1) : null, "/10", detail && detail.vote_count ? votes(detail.vote_count) : ""),
    score("rt", "RT", ratings.rtCritics != null ? Math.round(ratings.rtCritics) : null, "%", "critics"),
    score("rt-aud", "RT", ratings.rtAudience != null ? Math.round(ratings.rtAudience) : null, "%", "audience"),
  ].join("");

  const genres = ((detail && detail.genres) || []).map(g => `<span class="ms-genre">${esc(g.name)}</span>`).join("");
  const links = [
    imdb ? `<a class="ms-link" href="https://www.imdb.com/title/${esc(imdb)}/" target="_blank" rel="noopener">IMDb &#8599;</a>` : "",
    tmdb != null ? `<a class="ms-link" href="https://www.themoviedb.org/tv/${esc(tmdb)}" target="_blank" rel="noopener">TMDB &#8599;</a>` : "",
  ].join("");

  // My progress
  const tab = msTab(show.status);
  const pct = airedCount ? Math.min(100, Math.round(watchedCount / airedCount * 100)) : (show.status === "completed" ? 100 : 0);
  const upcoming = eps.find(e => !aired(e) && e.date);
  const nextCode = item && msParseCode(item.next_to_watch);
  let statusSub = "";
  if (show.status === "watching") {
    statusSub = nextCode ? `Next: ${msCode(nextCode.s, nextCode.e)}` : upcoming ? `Up to date<br>next episode ${esc(msDate(Date.parse(upcoming.date), false))}` : "Up to date";
  } else if (show.status === "completed") statusSub = row.lastAt ? `Finished ${esc(msDate(row.lastAt))}` : "";
  else if (show.status === "hold") statusSub = `Since ${esc(msDate(row.changedAt))}`;
  else if (show.status === "dropped") statusSub = row.lastEp ? `At ${msCode(row.lastEp.s, row.lastEp.e)}` : "";
  const runtimeOf = new Map(eps.map(e => [`${e.season}-${e.episode}`, e.runtime]));
  let spent = 0;
  for (const k of watched.keys()) spent += runtimeOf.get(k) || avgRuntime || 45;
  if (!watched.size) spent = watchedCount * (avgRuntime || 45);
  const statRows = [
    ["Added", msDate(row.addedAt)],
    ["First watched", msDate(row.firstAt)],
    ["Last watched", row.lastAt ? `${msDate(row.lastAt)}` : ""],
    ["Took you", row.firstAt && row.lastAt && row.lastAt > row.firstAt ? msSpan(row.lastAt - row.firstAt) : ""],
    ["Time spent", watchedCount ? msHours(spent) : ""],
  ].filter(([, v]) => v);
  const C = 2 * Math.PI * 42;
  const left = Math.max(0, airedCount - watchedCount);

  // Episodes: the season of the next episode, else the last one watched in.
  const startSeason = nextCode ? nextCode.s : row.lastEp ? row.lastEp.s : seasons[0];
  const lastAired = eps.filter(aired).pop() || null;
  const nextEp = nextCode ? eps.find(e => e.season === nextCode.s && e.episode === nextCode.e) : null;

  pane.style.setProperty("--ms-c", tab.color);
  pane.innerHTML = `
    <section class="ms-hero">
      ${backdrop ? `<div class="ms-backdrop" style="background-image:url('${esc(backdrop)}')"></div>` : `<div class="ms-backdrop"></div>`}
      <div class="ms-hero-in">
        <div class="ms-d-top"><button type="button" class="ms-back" data-ep-back>&larr; ${msStandalone ? "Back" : "My Shows"}</button></div>
        ${poster ? `<img class="ms-d-poster" src="${esc(poster)}" alt="">` : `<div class="ms-d-poster ms-pic-empty">${esc((title[0] || "?").toUpperCase())}</div>`}
        <div class="ms-d-info">
          <h1 class="ms-d-title">${esc(title)}</h1>
          <div class="ms-facts">${facts.join("")}</div>
          ${scoresHtml ? `<div class="ms-scores">${scoresHtml}</div>` : ""}
          ${genres ? `<div class="ms-genres">${genres}</div>` : ""}
          ${detail && detail.overview ? `<p class="ms-overview">${esc(detail.overview)}</p>` : ""}
          ${links ? `<div class="ms-links">${links}</div>` : ""}
        </div>
        <aside class="ms-mine">
          <div class="ms-mine-status"><span class="ms-pill"><i></i>${esc(tab.label)}</span><span class="ms-mine-sub">${statusSub}</span></div>
          <div class="ms-status-pick" role="group" aria-label="Move to">${MS_TABS.map(t =>
            `<button type="button" class="ms-status-btn" data-status="${t.id}" style="--ms-c:${t.color}" aria-pressed="${t.id === show.status}">${t.label}</button>`).join("")}</div>
          <div class="ms-ringrow">
            <svg class="ms-ring" viewBox="0 0 100 100" role="img" aria-label="${pct}% watched">
              <circle cx="50" cy="50" r="42" fill="none" stroke="var(--border)" stroke-width="10"></circle>
              <circle cx="50" cy="50" r="42" fill="none" stroke="var(--ms-c)" stroke-width="10" stroke-linecap="round" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - pct / 100)).toFixed(1)}" transform="rotate(-90 50 50)"></circle>
              <text x="50" y="58" text-anchor="middle" font-size="24" fill="var(--text)">${pct}%</text>
            </svg>
            <div><div class="ms-ring-big">${airedCount ? `${watchedCount} of ${airedCount} episodes` : `${watchedCount} episodes`}</div>
              <div class="ms-ring-small">${airedCount ? (left ? `${left} left to watch` : "All aired episodes watched") : ""}</div></div>
          </div>
          ${statRows.length ? `<dl class="ms-stats">${statRows.map(([k, v]) => `<div><dt>${k}</dt><span class="ms-fill"></span><dd>${esc(v)}</dd></div>`).join("")}</dl>` : ""}
        </aside>
      </div>
    </section>
    <div class="ms-d-body">
      <div class="ms-d-two">
        <section class="ms-sec">
          <div class="ms-sec-h"><h3 class="ms-h">Episodes</h3>
            <div class="ms-sec-tools">
              ${seasons.length > 1 ? `<div class="ms-seasons" role="group" aria-label="Season">${seasons.map(s => `<button type="button" class="ms-season" data-season="${s}" aria-pressed="${s === startSeason}">${s}</button>`).join("")}</div>` : ""}
              ${eps.length ? `<button type="button" class="ms-edit-eps" id="msEditEps">Edit episodes</button>` : ""}
            </div></div>
          <div class="ms-eps-box" id="msEpsBox">
            <div class="ms-eps" id="msEps"></div>
            <div class="ms-legend"><span><i class="w"></i>Watched</span><span><i class="u"></i>Not watched</span><span><i class="f"></i>Not aired yet</span></div>
          </div>
        </section>
        <section class="ms-sec">
          <div class="ms-sec-h"><h3 class="ms-h">${nextEp ? "Up next" : "Latest episode"}</h3></div>
          ${msEpisodeCard(nextEp || lastAired, nextEp ? "next" : "last", watched)}
          ${msWhatsNext(detail, upcoming, running)}
        </section>
      </div>
      <section class="ms-sec" id="msCastSec" hidden>
        <div class="ms-sec-h"><h3 class="ms-h">Cast</h3></div>
        <div class="ms-cast-wrap">
          <button type="button" class="carousel-arrow left ms-cast-arrow is-hidden" data-dir="-1" title="Scroll left" aria-label="Scroll left">${CAROUSEL_ARROW_LEFT_ICON_SVG}</button>
          <div class="ms-cast" id="msCast"></div>
          <button type="button" class="carousel-arrow ms-cast-arrow is-hidden" data-dir="1" title="Scroll right" aria-label="Scroll right">${CAROUSEL_ARROW_ICON_SVG}</button>
        </div>
      </section>
    </div>`;

  const paintSeason = season => {
    const list = eps.filter(e => e.season === season);
    document.getElementById("msEps").innerHTML = list.length ? list.map(e => {
      const w = watched.has(`${e.season}-${e.episode}`);
      const cls = w ? "w" : aired(e) ? "u" : "f";
      const isNext = nextCode && nextCode.s === e.season && nextCode.e === e.episode;
      const date = e.date ? msDate(Date.parse(e.date)) : "No date yet";
      const tip = [`S${e.season} E${e.episode}`, e.title, date, w && watched.get(`${e.season}-${e.episode}`) ? `Watched ${msDate(Date.parse(watched.get(`${e.season}-${e.episode}`)))}` : ""].filter(Boolean).join(" · ");
      return `<div class="ms-ep ${cls}${isNext ? " next" : ""}" title="${esc(tip)}">
        <span class="ms-chk">${w ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"></path></svg>` : ""}</span>
        <span class="ms-ep-num">E${e.episode}</span>
        <span class="ms-ep-title">${esc(e.title && !/^Episode\s+\d+$/i.test(e.title) ? e.title : "")}</span>
        <span class="ms-ep-date">${isNext ? `<em>Up next</em>` : esc(date)}</span>
      </div>`;
    }).join("") : `<p class="ms-empty">No episode list for this show.</p>`;
  };
  if (seasons.length) paintSeason(seasons.includes(startSeason) ? startSeason : seasons[0]);
  else document.getElementById("msEps").innerHTML = `<p class="ms-empty">No episode list for this show.</p>`;
  pane.querySelectorAll(".ms-season").forEach(b => {
    b.onclick = () => {
      pane.querySelectorAll(".ms-season").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
      paintSeason(Number(b.dataset.season));
    };
  });
  pane.querySelector(".ms-back").onclick = () => history.back();
  msFitHero();
  if (detail && poster && !savedBackdrop) msUpgradeBackdrop(pane, token, detail, tmdb, poster, backdrop);
  const posterImg = pane.querySelector("img.ms-d-poster");
  if (posterImg && !posterImg.complete) posterImg.addEventListener("load", msFitHero, { once: true });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(msFitHero);
  pane.querySelectorAll(".ms-status-btn").forEach(b => {
    b.onclick = () => msChangeStatus(docId, b.dataset.status, title, show.year);
  });
  const editBtn = pane.querySelector("#msEditEps");
  if (editBtn) editBtn.onclick = () => msEditEpisodes(docId, title);

  // Cast: the same picks as the cast window, each name an IMDb link once
  // that person's id is in (lazily, as there).
  const cast = selectMainCast((credits && credits.cast) || []).slice(0, 16);
  if (cast.length) {
    document.getElementById("msCastSec").hidden = false;
    const castEl = document.getElementById("msCast");
    castEl.innerHTML = cast.map((p, i) => {
      const role = (p.roles && p.roles[0] && p.roles[0].character) || "";
      const face = p.profile_path
        ? `<img class="ms-face" src="${TMDB_PROFILE_BASE}${esc(p.profile_path)}" alt="" loading="lazy" draggable="false">`
        : `<span class="ms-face ms-pic-empty">${esc((p.name || "?")[0])}</span>`;
      return `<div class="ms-person" data-i="${i}">${face}<b class="ms-person-name">${esc(p.name)}</b><span>${esc(role)}</span></div>`;
    }).join("");
    cast.forEach((p, i) => {
      cache.getPersonExternalIds(p.id).then(ids => {
        if (token !== msDetailToken || !ids || !ids.imdb_id) return;
        const el = castEl.querySelector(`.ms-person[data-i="${i}"]`);
        if (!el || el.tagName === "A") return;
        const a = document.createElement("a");
        a.className = el.className;
        a.href = `https://www.imdb.com/name/${ids.imdb_id}/`;
        a.target = "_blank";
        a.rel = "noopener";
        a.title = `${p.name} on IMDb`;
        a.draggable = false;
        a.innerHTML = el.innerHTML;
        el.replaceWith(a);
      }).catch(() => {});
    });
    msWireCastRow(castEl);
  }
}

// The cast row: no scrollbar; dragged sideways with the mouse, or moved by
// the arrows at its ends (the home page's carousel arrows), each shown only
// while there's more that way. A touch scrolls it natively. A drag never
// counts as a click on the person under it (their IMDb link).
function msWireCastRow(row) {
  const wrap = row.parentElement;
  const [prev, next] = [wrap.querySelector(".ms-cast-arrow[data-dir='-1']"), wrap.querySelector(".ms-cast-arrow[data-dir='1']")];
  const paintArrows = () => {
    const max = row.scrollWidth - row.clientWidth;
    prev.classList.toggle("is-hidden", max <= 1 || row.scrollLeft <= 1);
    next.classList.toggle("is-hidden", max <= 1 || row.scrollLeft >= max - 1);
  };
  [prev, next].forEach(btn => {
    btn.onclick = () => row.scrollBy({ left: Number(btn.dataset.dir) * Math.max(200, row.clientWidth * 0.8), behavior: "smooth" });
  });
  row.addEventListener("scroll", paintArrows, { passive: true });
  let drag = null, moved = false;
  row.addEventListener("pointerdown", e => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    drag = { x: e.clientX, left: row.scrollLeft, id: e.pointerId };
    moved = false;
  });
  row.addEventListener("pointermove", e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    if (!moved && Math.abs(dx) < 5) return;
    if (!moved) { moved = true; row.setPointerCapture(drag.id); row.classList.add("dragging"); }
    row.scrollLeft = drag.left - dx;
  });
  const end = e => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    row.classList.remove("dragging");
  };
  row.addEventListener("pointerup", end);
  row.addEventListener("pointercancel", end);
  row.addEventListener("click", e => { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
  // Pictures arriving or the window resized change how far it goes.
  if (window.ResizeObserver) new ResizeObserver(paintArrows).observe(row);
  row.querySelectorAll("img").forEach(img => img.addEventListener("load", paintArrows, { once: true }));
  paintArrows();
}

// The top of a show's page in one block: the poster, the text and the box
// on the right start and end on the same lines. Their height is the taller
// of the text and the box (as each lays out on its own); the poster takes
// it, as wide as a poster that tall (at most 340px - cropped a little past
// that), the box and the text stretch to it (the box's dates and the
// links go to its foot). The poster's width changes the text's, so it's
// measured again until it settles. Not on a phone (its own layout), and
// below 1100px the box sits under the other two: just those two then.
const MS_POSTER_MAX_W = 340;
function msFitHero() {
  const pane = document.getElementById("msDetail");
  if (!pane || pane.hidden) return;
  const hero = pane.querySelector(".ms-hero-in");
  const poster = pane.querySelector(".ms-d-poster");
  const info = pane.querySelector(".ms-d-info");
  const mine = pane.querySelector(".ms-mine");
  if (!hero || !poster || !info || !mine) return;
  const clear = () => {
    [poster, info, mine].forEach(el => el.style.removeProperty("height"));
    hero.style.removeProperty("--ms-poster-w");
  };
  clear();
  if (window.innerWidth <= 720) return;
  let h = 0;
  for (let i = 0; i < 4; i++) {
    [info, mine].forEach(el => el.style.removeProperty("height"));
    const sameRow = Math.abs(mine.offsetTop - info.offsetTop) < 2;
    const next = Math.ceil(Math.max(info.offsetHeight, sameRow ? mine.offsetHeight : 0));
    if (Math.abs(next - h) < 2) break;
    h = next;
    hero.style.setProperty("--ms-poster-w", `${Math.min(MS_POSTER_MAX_W, Math.round(h * 2 / 3))}px`);
  }
  const sameRow = Math.abs(mine.offsetTop - info.offsetTop) < 2;
  poster.style.height = `${h}px`;
  info.style.height = `${h}px`;
  if (sameRow) mine.style.height = `${h}px`;
}
window.addEventListener("resize", () => { if (document.getElementById("msDetail")) msFitHero(); });

// The page's backdrop: a picture from the show, not its poster again.
// TMDB's main backdrop is mostly the poster's key art laid wide, so a
// picture with no text on it (no language - a scene from the show) comes
// first, the best voted one other than the main backdrop; then any other
// backdrop; the main one only when there's nothing else. All of them come
// with the show's details (no extra request).
function msBackdropFor(detail) {
  const path = msBackdropCandidates(detail)[0] || (detail && detail.backdrop_path) || null;
  return path ? msImgUrl(path, "w1280") : null;
}
// The backdrops in the order above (paths), the main one left out.
function msBackdropCandidates(detail) {
  if (!detail) return [];
  const main = detail.backdrop_path || null;
  const all = ((detail.images && detail.images.backdrops) || []).filter(b => b && b.file_path && b.file_path !== main);
  const byVotes = list => list.slice().sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0) || (b.vote_count || 0) - (a.vote_count || 0));
  return [...byVotes(all.filter(b => b.iso_639_1 == null)), ...byVotes(all.filter(b => b.iso_639_1 != null))].map(b => b.file_path);
}

// ...but a textless backdrop is often just the poster's key art again, laid
// wide - and that's the one people vote for (Phony: half its 30 backdrops
// are the poster's mother and son on grey, the scenes have no votes). The
// main backdrop is that key art, so each candidate's colours (a coarse
// histogram - the same art at another size or crop keeps its palette) are
// compared with the main backdrop's, and its layout with the poster's; one
// that looks like either is passed over. The first that doesn't wins; none
// - the order above stands. The answer is kept per show and poster
// (LS_MS_BACKDROPS), so this runs once. (Measured on Phony: the key art's
// versions 0.11-0.36 from the main backdrop, its scenes 0.51-0.86.)
const LS_MS_BACKDROPS = "ms_backdrops";
const MS_BACKDROP_CHECK = 10;      // candidates looked at, at most
const MS_MAIN_LIKE = 0.45;         // palette distance below which it's the main backdrop again
const MS_POSTER_LIKE = 0.08;       // layout distance below which it's the poster laid wide
function msLoadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image didn't load"));
    img.src = url;
  });
}
function msPixels(img, w, h, sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  return g.getImageData(0, 0, w, h).data;
}
// Colours: 4 levels a channel, 64 bins, shares of the picture.
function msHistogram(img) {
  const d = msPixels(img, 32, 32), h = new Float32Array(64);
  for (let i = 0; i < d.length; i += 4) h[(d[i] >> 6) * 16 + (d[i + 1] >> 6) * 4 + (d[i + 2] >> 6)] += 1 / 1024;
  return h;
}
function msHistogramDistance(a, b) {
  let shared = 0;
  for (let i = 0; i < 64; i++) shared += Math.min(a[i], b[i]);
  return 1 - shared;
}
// Layout: the backdrop's middle cut to the poster's shape, on an 8x12 grid.
function msLayoutDistance(posterGrid, img) {
  const W = img.naturalWidth, H = img.naturalHeight, w = H * 2 / 3;
  const g = msPixels(img, 8, 12, (W - w) / 2, 0, w, H);
  let sum = 0;
  for (let i = 0; i < g.length; i += 4) sum += Math.abs(g[i] - posterGrid[i]) + Math.abs(g[i + 1] - posterGrid[i + 1]) + Math.abs(g[i + 2] - posterGrid[i + 2]);
  return sum / (g.length * 0.75) / 255;
}
async function msPickBackdrop(detail, posterUrl) {
  const candidates = msBackdropCandidates(detail).slice(0, MS_BACKDROP_CHECK);
  if (!candidates.length) return null;
  const mainImg = detail.backdrop_path ? await msLoadImage(msImgUrl(detail.backdrop_path, "w300")).catch(() => null) : null;
  const mainHist = mainImg ? msHistogram(mainImg) : null;
  const posterImg = posterUrl ? await msLoadImage(posterUrl.replace(/\/t\/p\/w\d+\//, "/t/p/w92/")).catch(() => null) : null;
  const posterGrid = posterImg ? msPixels(posterImg, 8, 12) : null;
  if (!mainHist && !posterGrid) return null;
  for (const path of candidates) {
    let img;
    try { img = await msLoadImage(msImgUrl(path, "w300")); } catch (e) { continue; }
    if (mainHist && msHistogramDistance(mainHist, msHistogram(img)) < MS_MAIN_LIKE) continue;
    if (posterGrid && msLayoutDistance(posterGrid, img) < MS_POSTER_LIKE) continue;
    return path;
  }
  return null;
}
function msSavedBackdrop(tmdbId, posterUrl) {
  try {
    const all = JSON.parse(localStorage.getItem(LS_MS_BACKDROPS) || "{}");
    const hit = all[tmdbId];
    return hit && hit.poster === posterUrl ? hit : null;
  } catch (e) { return null; }
}
function msSaveBackdrop(tmdbId, posterUrl, path) {
  try {
    const all = JSON.parse(localStorage.getItem(LS_MS_BACKDROPS) || "{}");
    delete all[tmdbId];
    all[tmdbId] = { poster: posterUrl, path };
    const keys = Object.keys(all);
    for (const k of keys.slice(0, Math.max(0, keys.length - 400))) delete all[k];
    localStorage.setItem(LS_MS_BACKDROPS, JSON.stringify(all));
  } catch (e) { /* not kept - checked again next time */ }
}
// After the page is drawn: the checked pick, faded in if it differs.
async function msUpgradeBackdrop(pane, token, detail, tmdbId, posterUrl, shownUrl) {
  let path;
  try { path = await msPickBackdrop(detail, posterUrl); } catch (e) { return; }
  msSaveBackdrop(tmdbId, posterUrl, path);
  const url = path ? msImgUrl(path, "w1280") : null;
  if (!url || url === shownUrl || token !== msDetailToken) return;
  try { await msLoadImage(url); } catch (e) { return; }
  const el = pane.querySelector(".ms-backdrop");
  if (!el || token !== msDetailToken) return;
  el.style.opacity = "0";
  setTimeout(() => { el.style.backgroundImage = `url('${url}')`; el.style.opacity = ""; }, 350);
}

// "Mondays 05:00" - the weekday and local time of the show's latest
// episodes, when the episode list carries times and they agree.
function msTimeSlot(eps) {
  const timed = eps.filter(e => e.date && e.date.length > 10).slice(-3).map(e => new Date(e.date)).filter(d => !isNaN(d));
  if (!timed.length) return null;
  const key = d => `${d.getDay()}-${d.getHours()}-${d.getMinutes()}`;
  const last = timed[timed.length - 1];
  if (timed.length > 1 && timed.filter(d => key(d) === key(last)).length < 2) return null;
  return `${MS_WEEKDAYS[last.getDay()]} ${String(last.getHours()).padStart(2, "0")}:${String(last.getMinutes()).padStart(2, "0")}`;
}

function msEpisodeCard(ep, kind, watched) {
  if (!ep) return `<p class="ms-empty">No episodes yet.</p>`;
  const w = watched.get(`${ep.season}-${ep.episode}`);
  const date = ep.date ? msDate(Date.parse(ep.date)) : "";
  const title = ep.title && !/^Episode\s+\d+$/i.test(ep.title) ? ep.title : `Episode ${ep.episode}`;
  const sub = [date ? `Aired ${date}` : "", w ? `you watched it ${msDate(Date.parse(w))}` : kind === "last" ? "not watched yet" : ""].filter(Boolean).join(" · ");
  return `<div class="ms-epcard"><div class="ms-epcard-k">S${ep.season} E${ep.episode}${ep.runtime ? ` · ${ep.runtime} min` : ""}</div><div class="ms-epcard-t">${esc(title)}</div><div class="ms-epcard-d">${esc(sub)}</div></div>`;
}

function msWhatsNext(detail, upcoming, running) {
  const clock = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>`;
  let text;
  if (upcoming) text = `Next episode, S${upcoming.season} E${upcoming.episode}: <b>${esc(msDate(Date.parse(upcoming.date)))}</b>`;
  else if (detail && (detail.status === "Ended" || detail.status === "Canceled")) text = `The show has <b>${detail.status === "Ended" ? "ended" : "been canceled"}</b>.`;
  else if (running) text = `Next season: <b>no air date yet</b>.`;
  else return "";
  return `<div class="ms-wait">${clock}<span>${text}</span></div>`;
}

document.getElementById("myShowsBtn").onclick = msOpenPage;

"use strict";

// The three bottom panels' markup, the air countdowns, and the greeting
// with its today list and account menu.
//
// One of the page script's files (app/), loaded in order by index.html as
// plain scripts sharing one global scope - so code that runs while a file
// loads may use only what earlier files define.

// A bottom-panel thumbnail's wrapper attributes (Just Watched / Plan to
// Watch / Airing Next): a click opens the show's page, like its title - the
// image picker is the row's own button (rowActionsHtml). data-cycle-key
// finds the thumbnail again (patchImagesForTmdbId, the now-watching overlay).
function thumbWrapAttrs(source, idx) {
  return ` data-cycle-key="${source}-${idx}" title="Open the show's page"${onClick("showPage", source, idx)}`;
}

// A bottom-panel thumbnail's own content besides the picture: its picture
// button (pickerButtonHtml) in the top-left corner.
function thumbPickHtml(source, idx, row) {
  return pickerButtonHtml(source, idx, row, " thumb-pick");
}

// Plan to Watch's ⋮ status menu (openPlanCardMenu) - a small white chip in
// the row's top-right corner, like the picture button, so it shows on any
// picture.
function rowActionsHtml(source, idx) {
  return source === "plan"
    ? `<div class="row-actions"><button class="card-menu-btn row-btn" title="Manage"${onClickStop("planMenu", idx)}>&#8942;</button></div>`
    : "";
}

// Network sub-line: shows the TMDB network logo image when available,
// falling back to the plain text name (both if the show has no logo_path,
// and live if the logo image itself fails to load).
function networkSubHtml(name, logoPath) {
  if (logoPath) {
    return `<div class="list-row-sub network-sub">
        <img class="network-logo" loading="lazy" src="${esc(logoPath)}" alt="${esc(name || "")}"${onError("networkLogoFailed")}>
        <span class="network-name-fallback" style="display:none">${esc(name || "")}</span>
      </div>`;
  }
  return name ? `<div class="list-row-sub">${esc(name)}</div>` : "";
}

// Right-aligned show count for a bottom panel's header row - same
// margin-left:auto trick as .series-panel-updated in the top carousel's
// own header, just reused here instead of duplicated. Doubles as the
// entry point into that panel's "all shows" modal (openPanelShowsModal).
function listPanelCountHtml(count, source) {
  const word = `Show${count === 1 ? "" : "s"}`;
  return `<button type="button" class="list-panel-count" title="${count} ${word.toLowerCase()}"${onClick("panelShows", source)}><span class="list-panel-count-num">${count}</span><span class="list-panel-count-word"> ${word}</span></button>`;
}

// Exact inner content of a row's .list-row-title-wrap, factored out of the
// three render*Html functions below so the "all shows" modal's flip-card
// back face (openPanelShowsModal) can show precisely the same info as the
// show's own row instead of a second, drift-prone copy of this markup.
// Either way the title opens the show's page (my-shows.js) - mode "row"
// is the row's own text, mode "flip" the flip-card back face's.
function rowInfoWrapHtml(row, idx, source, mode) {
  const titleHtml = `<div class="list-row-title" title="Open the show's page"${onClickStop("showPage", source, idx)}>${esc(row.title)}</div>`;
  // In the one-page layout the badges and IMDb rating sit on the thumbnail
  // (thumbBarHtml), so the row's text leaves them out; the flip-card back
  // face and the older scrolling layout keep them as text.
  const rich = mode === "flip" || isScrollLayout();

  if (source === "watched") {
    const episodeCode = `S${String(row.season).padStart(2, "0")}E${String(row.episode).padStart(2, "0")}`;
    const episodeTitleHtml = row.episodeTitle ? `<div class="episode-title">${esc(row.episodeTitle)}</div>` : "";
    const badgeModifier = row.badge === "SEASON FINALE" ? " finale" : row.badge === "DROPPED" ? " dropped" : "";
    const badgeHtml = (rich && row.badge) ? `<div class="premiere-badge${badgeModifier}">${badgeText(row)}</div>` : "";
    return `
      ${titleHtml}
      ${networkSubHtml(row.network, row.networkLogoPath)}
      <div class="next-up-row">
        <div class="list-row-sub episode-code-sub">${episodeCode}</div>
        ${badgeHtml}
      </div>
      ${episodeTitleHtml}`;
  }

  if (source === "plan") {
    const badgeHtml = row.airedLabel
      ? `<div class="premiere-badge${row.ended ? " finale" : ""}${row.airedTone ? " tag-" + row.airedTone : ""}">${row.airedLabel}</div>`
      : "";
    const yearBadgeHtml = row.yearRangeLabel
      ? `<div class="premiere-badge year-badge">${row.yearRangeLabel}</div>`
      : "";
    const contentMetaHtml = (row.contentRating || row.genreLabel)
      ? `<div class="content-meta-row">
          ${row.contentRating ? `<span class="content-rating-badge">${row.contentRating}</span>` : ""}
          ${row.genreLabel ? `<span class="genre-label">${esc(row.genreLabel)}</span>` : ""}
        </div>`
      : "";
    const imdbHtml = rich ? `<div class="list-imdb">${imdbPillHtml(row.imdbRating, row.imdbId, row.ratings)}</div>` : "";
    // The older scrolling layout keeps the year badge beside the title.
    const titleBlockHtml = isScrollLayout()
      ? `<div class="title-with-year">${titleHtml}${yearBadgeHtml}</div>`
      : `${titleHtml}${yearBadgeHtml}`;
    return `
      ${titleBlockHtml}
      ${networkSubHtml(row.network, row.networkLogoPath)}
      ${badgeHtml}
      ${imdbHtml}
      ${rich ? contentMetaHtml : ""}`;
  }

  if (source === "main" && currentView !== "airing") {
    // The top panel's own "My Watch List" row shape (renderRows) - a
    // progress/remaining-episode count instead of an "aired" badge, no
    // genre/content-rating (that's Plan to Watch only).
    const episodeTitleHtml = row.episodeTitle ? `<div class="episode-title">${esc(row.episodeTitle)}</div>` : "";
    const badgeHtml = row.badge
      ? `<div class="premiere-badge${row.badge === "SEASON FINALE" ? " finale" : ""}">${badgeText(row)}</div>`
      : "";
    const remainingText = row.remaining === 1 ? "1 episode left" : `${row.remaining} episodes left`;
    return `
      ${titleHtml}
      ${networkSubHtml(row.network, row.networkLogoPath)}
      <div class="next-up-row">
        <span class="next-up">Next: ${row.nextLabel}</span>
        ${badgeHtml}
      </div>
      ${episodeTitleHtml}
      <div class="list-row-sub">${remainingText}</div>
      <div class="list-imdb">${imdbPillHtml(row.imdbRating, row.imdbId, row.ratings)}</div>`;
  }

  // source === "airing", or source === "main" while showing the Airing
  // Next view (renderAiringRows) - both share the exact same row shape.
  const episodeTitle = row.nextEpisodeTitle ? `<div class="episode-title">${esc(row.nextEpisodeTitle)}</div>` : "";
  const badgeHtml = (rich && row.badge)
    ? `<div class="premiere-badge${row.badge === "SEASON FINALE" ? " finale" : ""}">${badgeText(row)}</div>`
    : "";
  const imdbRowHtml = rich ? `<div class="list-imdb">${imdbPillHtml(row.imdbRating, row.imdbId, row.ratings)}</div>` : "";
  return `
    ${titleHtml}
    <div class="network-imdb-row">
      ${networkSubHtml(row.network, row.networkLogoPath)}
      ${imdbRowHtml}
    </div>
    <div class="next-up-row">
      <span class="next-up">Next: ${row.nextLabel}</span>
      ${badgeHtml}
    </div>
    ${episodeTitle}
    ${row.airDateLabel ? `<div class="list-row-airdate">&#128197; ${airDateText(row)}</div>` : ""}`;
}

function pagedRangeLabel(start, end, total) {
  return start + 1 === end ? `${end} of ${total}` : `${start + 1}-${end} of ${total}`;
}

function pagerControlsHtml(firstLabel, hasMore) {
  return `
    <div class="list-pager">
      <button type="button" class="list-pager-arrow prev off" title="Previous"${onClick("pager", -1)}>${CAROUSEL_ARROW_LEFT_ICON_SVG}</button>
      <span class="list-pager-mid"><span class="list-pager-range">${firstLabel}</span><span class="list-pager-bar"><i></i></span></span>
      <button type="button" class="list-pager-arrow next${hasMore ? "" : " off"}" title="Next"${onClick("pager", 1)}>${CAROUSEL_ARROW_ICON_SVG}</button>
    </div>`;
}

// A page's rows no longer sit back to back - the leftover height that
// equalizes this panel with its tallest sibling (.bottom-panels-row) all
// lands in the one gap between them (.list-page's justify-content:
// space-between), so a dedicated divider rides in the middle of that gap
// instead of a border glued to the first row's own bottom edge.
function stackedRowsHtml(items, start, rowHtmlFn) {
  return items.map((item, i) =>
    (i > 0 ? `<div class="list-row-divider"></div>` : "") + rowHtmlFn(item, start + i)
  ).join("\n");
}

// Builds the paged, swipeable replacement for a bottom panel's row list:
// `pageSize` stacked rows per page, the last page holding whatever is left
// (no show repeated across pages). Row markup itself comes from
// `rowHtmlFn(item, idx)`, idx being the item's index in the FULL list (not
// the page), since row handlers like showPage/openPlanCardMenu index
// into that full list.
function pagedPanelHtml(list, pageSize, rowHtmlFn) {
  const n = list.length;
  const windows = [];
  for (let s = 0; s < n; s += pageSize) windows.push({ start: s, items: list.slice(s, s + pageSize) });
  const pagesHtml = windows.map(({ start, items }) =>
    `<div class="list-page" data-range="${pagedRangeLabel(start, start + items.length, n)}">${stackedRowsHtml(items, start, rowHtmlFn)}</div>`
  ).join("\n");
  const firstLabel = windows.length ? pagedRangeLabel(windows[0].start, windows[0].start + windows[0].items.length, n) : "";
  return { pagerHtml: pagerControlsHtml(firstLabel, windows.length > 1), rowsWrapHtml: `<div class="list-rows-paged">${pagesHtml}</div>` };
}

// Airing Next's wider panel: 2-show columns, each half the panel wide, so a
// drag or an arrow click can stop after any single column (2 shows) instead
// of only every 4. Each column's range label covers the 4 shows visible
// when that column sits on the left.
function pagedColumnsHtml(list, rowHtmlFn) {
  const n = list.length;
  const starts = [];
  for (let s = 0; s < n; s += 2) starts.push(s);
  const colsHtml = starts.map(s =>
    `<div class="list-page list-page--half" data-range="${pagedRangeLabel(s, Math.min(s + 4, n), n)}">${stackedRowsHtml(list.slice(s, s + 2), s, rowHtmlFn)}</div>`
  ).join("\n");
  return {
    pagerHtml: pagerControlsHtml(n ? pagedRangeLabel(0, Math.min(4, n), n) : "", starts.length > 2),
    rowsWrapHtml: `<div class="list-rows-paged list-rows-paged--cols">${colsHtml}</div>`,
  };
}

// Panels to Posters: one page per pair of shows, an L-shaped tile each (see
// .panel-pair, the top panel's .poster-pair rules), an odd last show on its
// own. A pair is as wide as it needs - wider than a narrow panel, where the
// second poster is cut at the edge and comes in with a drag. byShow: the
// arrows step one show (poster + its details) at a time, not a pair
// (trackStops) - for the narrow panels.
function pairedPanelHtml(list, rowHtmlFn, { byShow = false } = {}) {
  const n = list.length;
  const pages = [];
  for (let s = 0; s < n; s += 2) {
    const items = list.slice(s, s + 2);
    pages.push(`<div class="list-page list-page--pair" data-range="${pagedRangeLabel(s, s + items.length, n)}">` +
      `<div class="panel-pair${items.length === 1 ? " single" : ""}">${items.map((item, i) => rowHtmlFn(item, s + i)).join("")}</div></div>`);
  }
  return {
    pagerHtml: pagerControlsHtml(n ? pagedRangeLabel(0, byShow ? 1 : Math.min(2, n), n) : "", byShow ? n > 1 : pages.length > 1),
    rowsWrapHtml: `<div class="list-rows-paged list-rows-paged--pairs${byShow ? " by-show" : ""}">${pages.join("\n")}</div>`,
  };
}

// A row's details: in a pair they sit in the tile's half-height box
// (.list-row-body), its text measured inside it (fitPanelRowLines), over
// the poster's glow (posterGlowHtml) - `src`, the poster shown beside it.
function rowDetailsHtml(inner, src) {
  const wrap = `<div class="list-row-title-wrap">${inner}</div>`;
  return panelPosters() ? `<div class="list-row-body"${posterGlowStyle(src)}>${posterGlowHtml(src)}${wrap}</div>` : wrap;
}

// Bottom-panel row frames alternate between the top panel's two pair colors
// (blue / brown) - Airing Next's two visible columns as a checkerboard.
function rowToneClass(idx, checker) {
  const n = checker ? idx + Math.floor(idx / 2) : idx;
  return n % 2 ? "tone-b" : "tone-a";
}

// The older scrolling layout: every row in one vertically scrolling list,
// no pager.
function scrollPanelHtml(list, rowHtmlFn) {
  return { pagerHtml: "", rowsWrapHtml: `<div class="list-rows-scroll">${list.map(rowHtmlFn).join("\n")}</div>` };
}

function renderRecentlyWatchedHtml(list) {
  if (!list || !list.length) return "";
  const scroll = isScrollLayout();
  const rowHtmlFn = (ep, idx) => {
    const bannerSrc = panelThumbSrc(ep);
    const mode = panelImageMode(ep);
    const thumbHtml = bannerSrc
      ? `<img class="list-thumb" loading="lazy" src="${esc(bannerSrc)}"${srcsetAttr(bannerSrc)} alt="${esc(ep.title)}"${onError("thumbError", "watched", idx, mode)}>`
      : `<div class="list-thumb placeholder">${esc((ep.title[0] || "?").toUpperCase())}</div>`;
    return `
      <div class="list-row ${rowToneClass(idx)}">
        <div class="list-thumb-wrap"${thumbWrapAttrs("watched", idx)}>${thumbHtml}${scroll ? "" : thumbBarHtml("", ep)}${thumbPickHtml("watched", idx, ep)}</div>
        ${rowDetailsHtml(rowInfoWrapHtml(ep, idx, "watched", "row"), bannerSrc)}
        ${scroll ? `<span class="list-check">${CHECK_ICON_SVG}</span>` : ""}
      </div>`;
  };
  const { pagerHtml, rowsWrapHtml } = scroll ? scrollPanelHtml(list, rowHtmlFn) : panelPosters() ? pairedPanelHtml(list, rowHtmlFn, { byShow: true }) : pagedPanelHtml(list, 2, rowHtmlFn);

  return `
    <div class="list-panel list-panel--watched">
      <div class="list-panel-header-row">
        <div class="list-panel-header">${titleIcons(CLOCK_ICON_SOLID_SVG, "watched")}<span>Just Watched</span></div>
        ${pagerHtml}
        ${listPanelCountHtml(list.length, "watched")}
      </div>
      ${rowsWrapHtml}
    </div>`;
}

function renderPlanToWatchHtml(list) {
  if (!list || !list.length) return "";
  const scroll = isScrollLayout();
  const rowHtmlFn = (row, idx) => {
    const bannerSrc = panelThumbSrc(row);
    const mode = panelImageMode(row);
    const thumbHtml = bannerSrc
      ? `<img class="list-thumb" loading="lazy" src="${esc(bannerSrc)}"${srcsetAttr(bannerSrc)} alt="${esc(row.title)}"${onError("thumbError", "plan", idx, mode)}>`
      : `<div class="list-thumb placeholder">${esc((row.title[0] || "?").toUpperCase())}</div>`;
    return `
      <div class="list-row ${rowToneClass(idx)}">
        <div class="list-thumb-wrap"${thumbWrapAttrs("plan", idx)}>${thumbHtml}${scroll ? "" : thumbBarHtml(imdbButtonHtml(row.imdbId, row.imdbRating, row.ratings))}${thumbPickHtml("plan", idx, row)}</div>
        ${rowDetailsHtml(rowInfoWrapHtml(row, idx, "plan", "row"), bannerSrc)}
        ${scroll ? `<span class="list-check">${STAR_ICON_SVG}</span>` : ""}
        ${rowActionsHtml("plan", idx)}
      </div>`;
  };
  const { pagerHtml, rowsWrapHtml } = scroll ? scrollPanelHtml(list, rowHtmlFn) : panelPosters() ? pairedPanelHtml(list, rowHtmlFn, { byShow: true }) : pagedPanelHtml(list, 2, rowHtmlFn);

  return `
    <div class="list-panel list-panel--plan">
      <div class="list-panel-header-row">
        <div class="list-panel-header">${titleIcons(BOOKMARK_ICON_SVG, "plan")}<span>Plan to Watch</span></div>
        ${pagerHtml}
        ${listPanelCountHtml(list.length, "plan")}
      </div>
      ${rowsWrapHtml}
    </div>`;
}

// The corner chip on an Airing Next thumbnail: empty here, filled in (and
// kept current) by tickAirCountdowns from the time or date it carries.
// The tag under an Airing Next chip: where its date/time came from.
const AIR_SOURCE_LABELS = { tvmaze: "TVMAZE", tmdb: "TMDB", simkl: "SIMKL", yes: "YES", tvdb: "TVDB" };
function airCountHtml(row) {
  if (row.airStart == null && !row.airDay) return "";
  const attrs = row.airStart != null
    ? `data-air-start="${row.airStart}"${row.airEnd != null ? ` data-air-end="${row.airEnd}"` : ""}`
    : `data-air-day="${row.airDay}"`;
  const from = AIR_SOURCE_LABELS[row.airFrom] ? row.airFrom : null;
  return `<div class="air-count${from ? ` from-${from}` : ""}" ${attrs}${from ? ` data-from="${AIR_SOURCE_LABELS[from]}"` : ""} hidden></div>`;
}

function paintAirCount(el, now) {
  const start = el.dataset.airStart ? Number(el.dataset.airStart) : null;
  const end = el.dataset.airEnd ? Number(el.dataset.airEnd) : null;
  const c = airCountdown(start, end, now, el.dataset.airDay || null);
  el.hidden = !c;
  el.classList.toggle("live", !!(c && c.live));
  el.classList.toggle("day", !!(c && c.dateOnly));
  if (!c) return;
  const clock = ms => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  // An episode with an exact time shows it small under the count (the
  // panels' date line has no room for it with long titles).
  const at = !c.live && !c.dateOnly && start != null ? `<span class="air-count-t">${clock(start)}</span>` : "";
  el.innerHTML = c.live
    ? `<span class="air-count-n"><span class="air-dot"></span>NOW</span><span class="air-count-u">ends ${clock(end)}</span>`
    : `<span class="air-count-n">${c.n}</span>${c.unit ? `<span class="air-count-u">${c.unit}</span>` : ""}${at}`;
}

function tickAirCountdowns() {
  const now = Date.now();
  document.querySelectorAll(".air-count").forEach(el => paintAirCount(el, now));
  updateGreetingStatus(now); // the day may have turned
  paintBridgeAlert(); // the bridge may have gone quiet
  // A report going stale ends the watch: its show goes back to its place.
  if (embyNow) syncWatchingOrder() || applyNowWatching();
}

// ---------------------------------------------------------------------
// The greeting at the foot of the box on the left: beside the picture the
// month so far - its name, then how many episodes were watched in it and
// for how long. The profile picture is a button: it opens a small menu - who is
// signed in, change the picture (kept in the account, so every device
// shows it), sign out.
// ---------------------------------------------------------------------
const LS_PROFILE_PHOTO = "profile_photo";
const PROFILE_PHOTO_PX = 160;

// The month is a calendar month in Israel's time, from the 1st at 00:00.
// Each episode counts its show's length from TMDB - the same as My Stats
// (statsShowInfo, kept 30 days) - or 45 minutes when TMDB has none.
const MONTH_TZ = "Asia/Jerusalem";
const MONTH_DEFAULT_RUNTIME = 45;
const monthKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: MONTH_TZ, year: "numeric", month: "2-digit" });
const monthNameFmt = new Intl.DateTimeFormat("en-US", { timeZone: MONTH_TZ, month: "long" });
const monthRuntimes = new Map(); // TMDB id -> minutes (null while asked)
let monthStartFor = { key: null, at: 0 };

// When this month began: the 1st at 00:00 in Israel (UTC+2 or +3).
function monthStart(now) {
  const key = monthKeyFmt.format(now);
  if (monthStartFor.key !== key) {
    const [y, m] = key.split("-").map(Number);
    const at = [2, 3].map(h => Date.UTC(y, m - 1, 1) - h * 3600000)
      .find(t => monthKeyFmt.format(t) === key && monthKeyFmt.format(t - 1) !== key);
    monthStartFor = { key, at: at ?? Date.UTC(y, m - 1, 1) };
  }
  return monthStartFor.at;
}

function monthRuntime(tmdbId) {
  if (tmdbId == null) return MONTH_DEFAULT_RUNTIME;
  if (monthRuntimes.has(tmdbId)) return monthRuntimes.get(tmdbId) || MONTH_DEFAULT_RUNTIME;
  monthRuntimes.set(tmdbId, null);
  if (typeof statsShowInfo === "function") {
    statsShowInfo(tmdbId).then(info => {
      if (info && info.r > 0) { monthRuntimes.set(tmdbId, info.r); updateGreetingStatus(); }
      else if (!info) monthRuntimes.delete(tmdbId); // not answered: asked again next time
    }, () => monthRuntimes.delete(tmdbId));
  }
  return MONTH_DEFAULT_RUNTIME;
}

function monthSummary(now) {
  const from = monthStart(now);
  let eps = 0, min = 0;
  for (const [, s] of library.store.view()) {
    let n = 0;
    for (const rec of Object.values(s.watched || {})) {
      const t = rec.at ? Date.parse(rec.at) : NaN;
      if (t >= from && t <= now) n++;
    }
    if (!n) continue;
    eps += n;
    min += n * monthRuntime(s.ids && s.ids.tmdb != null ? s.ids.tmdb : null);
  }
  return { name: monthNameFmt.format(now), eps, min };
}

function updateGreetingStatus(now = Date.now()) {
  const el = document.getElementById("greetingStatus");
  if (!el) return;
  if (!lastRows || !library || !library.store) { el.hidden = true; return; }
  let m;
  try { m = monthSummary(now); } catch (e) { el.hidden = true; return; }
  const h = Math.floor(m.min / 60), mins = m.min % 60;
  const time = h ? `${h}h ${mins}m` : `${mins}m`;
  el.innerHTML = `<span class="gs-sum gs-month">${m.name}</span>`
    + `<span class="gs-sum"><b>${m.eps}</b> ${m.eps === 1 ? "ep" : "eps"} · <b>${time}</b></span>`;
  el.hidden = false;
}

function applyProfilePhoto(src) {
  const img = document.querySelector("#profileMenuBtn .profile-pic-small");
  if (src && img && img.src !== src) img.src = src;
}
function safeRemoveProfilePhoto() {
  try { localStorage.removeItem(LS_PROFILE_PHOTO); } catch (e) { /* storage blocked */ }
}
try { applyProfilePhoto(localStorage.getItem(LS_PROFILE_PHOTO)); } catch (e) { /* storage blocked */ }

// The account's picture, once signed in (this device keeps a copy, so the
// next load shows it at once).
async function loadProfilePhotoFromAccount() {
  try {
    const doc = await library.backend.getMeta("profile");
    if (doc && typeof doc.photo === "string" && doc.photo.startsWith("data:image/")) {
      applyProfilePhoto(doc.photo);
      safeSetItem(LS_PROFILE_PHOTO, doc.photo);
    }
  } catch (e) {
    console.warn("Couldn't read the profile picture:", e.message);
  }
}

// A picked image cropped to a centred square and shrunk, as a JPEG data URL.
function squarePhotoDataUrl(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = PROFILE_PHOTO_PX;
      canvas.getContext("2d").drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side,
        0, 0, PROFILE_PHOTO_PX, PROFILE_PHOTO_PX);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("that file isn't an image")); };
    img.src = url;
  });
}

(function wireProfileMenu() {
  const btn = document.getElementById("profileMenuBtn");
  const menu = document.getElementById("profileMenu");
  if (!btn || !menu) return;
  const currentUser = () => (library && library.backend ? library.backend.currentUser() : null);
  const close = () => { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); };
  const open = () => {
    const user = currentUser();
    document.getElementById("profileMenuWho").textContent = user ? `Signed in as ${user.email}` : "Not signed in";
    document.getElementById("profilePhotoBtn").hidden = !user;
    document.getElementById("profileSignOutBtn").hidden = !user;
    menu.hidden = false;
    btn.setAttribute("aria-expanded", "true");
  };
  btn.onclick = e => { e.stopPropagation(); if (menu.hidden) open(); else close(); };
  menu.onclick = e => e.stopPropagation();
  document.addEventListener("click", () => { if (!menu.hidden) close(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !menu.hidden) { close(); btn.focus(); } });

  const input = document.getElementById("profilePhotoInput");
  document.getElementById("profilePhotoBtn").onclick = () => input.click();
  input.onchange = async () => {
    const file = input.files && input.files[0];
    input.value = "";
    close();
    if (!file || !currentUser()) return;
    try {
      const photo = await squarePhotoDataUrl(file);
      applyProfilePhoto(photo);
      safeSetItem(LS_PROFILE_PHOTO, photo);
      await library.backend.setMeta("profile", { photo, savedAt: Date.now() });
      showToast("Profile picture saved");
    } catch (err) {
      showToast(`Couldn't save the picture: ${err.message}`, true);
    }
  };
  document.getElementById("profileSignOutBtn").onclick = () => { close(); signOutLibrary(); };
})();

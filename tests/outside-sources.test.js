const test = require("node:test");
const assert = require("node:assert/strict");
const { createTmdbClient, createMdblist, createImageSources, createEpisodeRatings, metahubImages } = require("../outside-sources.js");

// A kept-copy store like the page's (readPersistedCache / writePersistedCache).
function persisted(initial = {}) {
  const m = new Map(Object.entries(initial));
  return { m, read: async key => (m.has(key) ? m.get(key) : undefined), write: (key, v) => { m.set(key, v); } };
}
const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

// ---- TMDB ---------------------------------------------------------------------
test("TMDB: one request per show even when asked twice at once; the answer is kept", async () => {
  const calls = [];
  const store = persisted();
  const tmdb = createTmdbClient({ get: async (p, params) => { calls.push([p, params]); return { id: 1, name: "A" }; }, persisted: store });
  const [a, b] = await Promise.all([tmdb.getShow(1), tmdb.getShow(1)]);
  assert.equal(a, b);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].append_to_response, "images,external_ids,content_ratings");
  assert.deepEqual(store.m.get("tmdbshow2:1"), { id: 1, name: "A" });
});

test("TMDB: a show with no network takes fillNetwork's; one with a network isn't asked about", async () => {
  const asked = [];
  const shows = { 1: { id: 1, networks: [] }, 2: { id: 2, networks: [{ name: "HBO", logo_path: "/h.png" }] } };
  const tmdb = createTmdbClient({ get: async p => shows[p.split("/")[2]], persisted: persisted(), fillNetwork: async d => { asked.push(d.id); return "HOT3"; } });
  assert.equal((await tmdb.getShow(1)).networks[0].name, "HOT3");
  assert.equal((await tmdb.getShow(2)).networks[0].name, "HBO");
  assert.deepEqual(asked, [1]);
  const none = createTmdbClient({ get: async () => ({ id: 3, networks: [] }), persisted: persisted(), fillNetwork: async () => { throw new Error("down"); } });
  assert.deepEqual((await none.getShow(3)).networks, []);
});

test("TMDB: a kept copy answers without a request; a failure is null and isn't kept", async () => {
  let calls = 0;
  const store = persisted({ "tmdbseason:5:2": { episodes: [] } });
  const tmdb = createTmdbClient({ get: async () => { calls++; throw new Error("down"); }, persisted: store });
  assert.deepEqual(await tmdb.getSeason(5, 2), { episodes: [] });
  assert.equal(calls, 0);
  assert.equal(await tmdb.getCredits(9), null);
  assert.equal(store.m.has("tmdbcredits:9"), false);
});

// ---- MDBList --------------------------------------------------------------------
test("MDBList: the four ratings, by source; unknown to MDBList is kept as nothing", async () => {
  const store = persisted();
  const md = createMdblist({
    fetch: async url => (url.includes("tt404") ? json({}, 404)
      : json({ ratings: [{ source: "imdb", value: 8.1 }, { source: "tomatoes", value: 91 }, { source: "trakt", value: null }] })),
    key: () => "k", persisted: store,
  });
  assert.deepEqual(await md.get("tt1"), { imdb: 8.1, tomatoes: 91, popcorn: null, trakt: null });
  assert.deepEqual(await md.get("tt404"), { imdb: null, tomatoes: null, popcorn: null, trakt: null });
  assert.ok(store.m.has("mdblist:tt404"));
});

test("MDBList: a refused key is said once and stops every request until a new key", async () => {
  let calls = 0, said = 0;
  const md = createMdblist({ fetch: async () => { calls++; return json({}, 401); }, key: () => "bad", persisted: persisted(), onRejected: () => said++ });
  await Promise.all([md.get("tt1"), md.get("tt2")]);
  await md.get("tt3");
  assert.equal(said, 1);
  assert.equal(md.disabled, true);
  assert.ok(calls <= 2, "nothing asked once refused");
  md.disabled = false;
  await md.get("tt4");
  assert.ok(calls >= 3, "asked again with a new key");
});

test("MDBList: at most five requests at a time; no key, no request", async () => {
  let active = 0, most = 0;
  const md = createMdblist({
    fetch: async () => { active++; most = Math.max(most, active); await new Promise(r => setTimeout(r, 5)); active--; return json({ ratings: [] }); },
    key: () => "k", persisted: persisted(),
  });
  await Promise.all(Array.from({ length: 12 }, (_, i) => md.get(`tt${i}`)));
  assert.equal(most, 5);
  const none = createMdblist({ fetch: async () => { throw new Error("asked"); }, key: () => "", persisted: persisted() });
  assert.equal(await none.get("tt1"), null);
});

// ---- The picker's extra pictures ------------------------------------------------
function imageSources({ fetch, tvmaze, store = persisted(), tokens = { v: null }, keys = { fanart: "f", tvdb: "t" }, rejected = [] }) {
  return createImageSources({
    fetchWithTimeout: fetch || (async () => json({}, 500)),
    tvmazeGet: tvmaze || (async () => json({}, 500)),
    persisted: store,
    fanartKey: () => keys.fanart,
    tvdbKey: () => keys.tvdb,
    tokenStore: { read: () => tokens.v, write: v => { tokens.v = v; } },
    onRejected: name => rejected.push(name),
    now: () => 1000,
  });
}

test("TVMaze and Metahub: posters and backgrounds resized, TheTVDB id noted, kept a week", async () => {
  const store = persisted();
  const src = imageSources({
    store,
    tvmaze: async url => (url.includes("lookup") ? json({ id: 7, externals: { thetvdb: 555 } })
      : json([
        { type: "poster", resolutions: { original: { url: "https://tvm/p.jpg" } } },
        { type: "background", resolutions: { original: { url: "https://tvm/b.jpg" } } },
        { type: "banner", resolutions: { original: { url: "https://tvm/x.jpg" } } },
      ])),
  });
  const out = await src.keyless("tt123");
  assert.equal(out.tvdbId, 555);
  assert.deepEqual(out.poster.map(p => p.src), ["TVMaze", "Metahub"]);
  assert.deepEqual(out.banner.map(p => p.src), ["TVMaze", "Metahub"]);
  assert.match(out.poster[0].url, /^https:\/\/wsrv\.nl\/.*w=342.*tvm%2Fp\.jpg/);
  assert.ok(store.m.has("extraimages2:tt123"));
});

test("TVMaze without an IMDb id: by TheTVDB's id, else the name when the premiere year agrees; no Metahub", async () => {
  const pics = json([{ type: "poster", resolutions: { original: { url: "https://tvm/p.jpg" } } }]);
  const asked = [];
  const byTvdb = imageSources({ store: persisted(), tvmaze: async url => { asked.push(url); return url.includes("thetvdb=485134") ? json({ id: 9, externals: { thetvdb: 485134 } }) : pics; } });
  const a = await byTvdb.keyless({ imdb: null, tvdb: 485134, name: "ברקוני", year: "2026" });
  assert.deepEqual(a.poster.map(p => p.src), ["TVMaze"]);
  assert.ok(asked[0].includes("lookup/shows?thetvdb=485134"));
  const search = (premiered) => imageSources({ store: persisted(), tvmaze: async url => (url.includes("lookup") ? json({}, 404)
    : url.includes("singlesearch") ? json({ id: 9, premiered, externals: {} }) : pics) });
  assert.equal((await search("2026-11-15").keyless({ tvdb: 1, name: "ברקוני", year: "2026" })).poster.length, 1);
  assert.equal((await search("2019-01-01").keyless({ tvdb: 1, name: "ברקוני", year: "2026" })).poster.length, 0);
});

test("TVMaze's picture list not there: shown but not kept; the lookup failing: nothing", async () => {
  const store = persisted();
  const partial = imageSources({ store, tvmaze: async url => (url.includes("lookup") ? json({ id: 7, externals: {} }) : json({}, 500)) });
  const out = await partial.keyless("tt1");
  assert.deepEqual(out.poster.map(p => p.src), ["Metahub"]);
  assert.equal(store.m.has("extraimages2:tt1"), false);
  const down = imageSources({ store, tvmaze: async () => json({}, 503) });
  assert.deepEqual((await down.keyless("tt2")).poster, []);
});

test("Fanart.tv: English posters by likes, backgrounds and thumbs as banners, the small preview as the tile", async () => {
  const src = imageSources({
    fetch: async () => json({
      tvposter: [{ url: "https://assets.fanart.tv/fanart/a.jpg", lang: "en", likes: "2" }, { url: "https://assets.fanart.tv/fanart/b.jpg", lang: "en", likes: "9" },
        { url: "https://assets.fanart.tv/fanart/c.jpg", lang: "de", likes: "50" }],
      showbackground: [{ url: "https://assets.fanart.tv/fanart/bg.jpg", likes: "1" }],
      tvthumb: [{ url: "https://assets.fanart.tv/fanart/th.jpg", likes: "3" }],
    }),
  });
  const out = await src.fanart(42);
  assert.deepEqual(out.poster.map(p => p.thumb), ["https://assets.fanart.tv/preview/b.jpg", "https://assets.fanart.tv/preview/a.jpg"]);
  assert.deepEqual(out.banner.map(p => p.thumb), ["https://assets.fanart.tv/preview/th.jpg", "https://assets.fanart.tv/preview/bg.jpg"]);
});

test("a refused Fanart.tv key: said once, no more requests until reset", async () => {
  let calls = 0;
  const rejected = [];
  const src = imageSources({ rejected, fetch: async () => { calls++; return json({}, 401); } });
  await src.fanart(1);
  await src.fanart(2);
  assert.deepEqual(rejected, ["Fanart.tv"]);
  assert.equal(calls, 1);
  assert.equal(src.rejected("fanart"), true);
  src.resetRejected();
  await src.fanart(3);
  assert.equal(calls, 2);
});

test("TheTVDB: the kept token is used; on a 401 one fresh login and a retry; English pictures by score, then Hebrew", async () => {
  const seen = [];
  const tokens = { v: { key: "t", token: "old", at: 900 } };
  const src = imageSources({
    tokens,
    fetch: async (url, opts = {}) => {
      seen.push(`${url.replace("https://api4.thetvdb.com/v4", "")} ${(opts.headers || {}).Authorization || ""}`.trim());
      if (url.endsWith("/login")) return json({ data: { token: "new" } });
      if (opts.headers.Authorization === "Bearer old") return json({}, 401);
      const type = new URL(url).searchParams.get("type");
      return json({ data: { artworks: type === "2"
        ? [{ image: "https://tvdb/p1.jpg", language: "eng", score: 1 }, { image: "https://tvdb/p2.jpg", language: null, score: 5 }, { image: "https://tvdb/p3.jpg", language: "heb", score: 99 }]
        : [{ image: "https://tvdb/b1.jpg", thumbnail: "https://tvdb/b1_t.jpg", score: 0 }] } });
    },
  });
  const out = await src.tvdb(77);
  assert.equal(seen.filter(s => s === "/login").length, 1, "one login for both lists");
  assert.equal(tokens.v.token, "new");
  assert.deepEqual(out.poster.map(p => /p\d/.exec(decodeURIComponent(p.url))[0]), ["p2", "p1", "p3"], "Hebrew ones after the rest");
  assert.equal(out.banner[0].thumb, "https://tvdb/b1_t.jpg");
});

test("Metahub: only for a real IMDb id", () => {
  assert.equal(metahubImages("tt42").poster.length, 1);
  assert.deepEqual(metahubImages("nonsense"), { poster: [], banner: [] });
});

test("findArt: the first banner and poster from Fanart.tv, then TheTVDB, then TVMaze; Metahub left out", async () => {
  const fetch = async url => {
    if (url.includes("fanart.tv")) return json({}, 404);
    if (url.includes("/login")) return json({ data: { token: "tok" } });
    if (url.includes("artworks?type=2")) return json({ data: { artworks: [] } });
    if (url.includes("artworks?type=3")) return json({ data: { artworks: [{ image: "https://tvdb/heb.jpg", language: "heb", score: 9 }] } });
    return json({}, 500);
  };
  const tvmaze = async url => (url.includes("lookup") ? json({ id: 9, externals: { thetvdb: 485136 } })
    : json([{ type: "poster", resolutions: { original: { url: "https://tvm/p.jpg" } } }]));
  const src = imageSources({ fetch, tvmaze, store: persisted() });
  const art = await src.findArt({ external_ids: { imdb_id: "tt9", tvdb_id: 485136 }, original_name: "לא קרה כלום", first_air_date: "2026-11-12" });
  assert.match(art.banner, /tvdb%2Fheb\.jpg/, "a Hebrew TheTVDB background when there's nothing else");
  assert.match(art.poster, /tvm%2Fp\.jpg/, "TVMaze's poster, not Metahub's link");
  const none = imageSources({ store: persisted(), keys: { fanart: "", tvdb: "" }, tvmaze: async () => json({}, 404) });
  assert.deepEqual(await none.findArt({ external_ids: {}, name: "X", first_air_date: "2026-01-01" }), { banner: null, poster: null });
});

// ---- Episode ratings (OMDb + Trakt) -------------------------------------------
function ratingsFetch(log, { omdbStatus = 200 } = {}) {
  return async (url, opts) => {
    log.push(url);
    if (url.includes("omdbapi.com")) {
      if (omdbStatus !== 200) return json({ Response: "False", Error: "Invalid API key!" }, omdbStatus);
      if (url.includes("Season=2")) return json({ Response: "True", Episodes: [
        { Episode: "1", imdbID: "tt1", imdbRating: "9.0", Released: "2020-01-01" },
        { Episode: "2", imdbID: "tt2", imdbRating: "N/A", Released: "2020-01-08" },
      ] });
      if (url.includes("i=tt1&")) return json({ Response: "True", imdbRating: "9.0", imdbVotes: "10,827" });
    }
    if (url.includes("api.trakt.tv")) {
      assert.equal(opts.headers["trakt-api-key"], "T");
      if (url.includes("/search/tmdb/77")) return json([{ show: { ids: { trakt: 555 } } }]);
      if (url.includes("/shows/555/seasons/2")) return json([{ number: 1, rating: 8.29, votes: 1144 }, { number: 2, rating: 8.31, votes: 965 }, { number: 3, rating: 0, votes: 0 }]);
    }
    return json(null, 404);
  };
}

test("episode ratings: IMDb with its vote count (unrated episodes not asked), Trakt by TMDB id; kept", async () => {
  const log = [];
  const store = persisted();
  const r = createEpisodeRatings({ fetch: ratingsFetch(log), omdbKey: () => "O", traktKey: () => "T", persisted: store, now: () => Date.parse("2026-11-21") });
  const got = await r.getSeason({ imdb: "tt9", tmdb: 77 }, 2, false);
  assert.deepEqual(got, { 1: { imdb: { r: 9, v: 10827 }, trakt: { r: 8.29, v: 1144 } }, 2: { trakt: { r: 8.31, v: 965 } } });
  assert.equal(log.filter(u => u.includes("i=tt2&")).length, 0);
  assert.deepEqual(store.m.get("traktid:77"), { id: 555 });
  const again = createEpisodeRatings({ fetch: ratingsFetch(log), omdbKey: () => "O", traktKey: () => "T", persisted: store });
  const before = log.length;
  assert.deepEqual(await again.getSeason({ imdb: "tt9", tmdb: 77 }, 2, false), got);
  assert.equal(log.length, before);
});

test("episode ratings: no key, no request; a refused OMDb key is said once and Trakt still answers", async () => {
  const log = [];
  const none = createEpisodeRatings({ fetch: ratingsFetch(log), omdbKey: () => "", traktKey: () => "", persisted: persisted() });
  assert.deepEqual(await none.getSeason({ imdb: "tt9", tmdb: 77 }, 2, false), {});
  assert.equal(log.length, 0);
  const said = [];
  const r = createEpisodeRatings({ fetch: ratingsFetch(log, { omdbStatus: 401 }), omdbKey: () => "O", traktKey: () => "T", persisted: persisted(), onRejected: n => said.push(n) });
  const got = await r.getSeason({ imdb: "tt9", tmdb: 77 }, 2, true);
  assert.deepEqual(Object.keys(got), ["1", "2"]);
  assert.equal(got[1].imdb, undefined);
  await r.getSeason({ imdb: "tt9", tmdb: 77 }, 3, true);
  assert.deepEqual(said, ["omdb"]);
  assert.ok(r.rejected("omdb"));
  r.resetRejected();
  assert.ok(!r.rejected("omdb"));
});

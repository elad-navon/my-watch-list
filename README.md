# My Watch List

[עברית](README.he.md)

A personal site and Android app for the TV shows you watch: **what's ready to
watch and how long it will take to catch up**, what airs next and when, what
you watched lately and what waits in Plan to Watch. It also has search to add
shows, a page per show, every show by status, and a statistics page.

It's three parts that share one library:

- **The site**: static files on GitHub Pages, with no server of its own and no
  build step. Everything runs in the browser.
- **The computer bridge** (`tools/emby-bridge/`): a small Node program on the
  computer that runs Emby. It marks what you watch there, and does the work
  the phone shouldn't: the widget's list, SIMKL's air times, and a health
  report.
- **The Android app** (`android-app/`): a shell around the live site, with
  Google sign-in through the phone, a home-screen widget and alerts for
  premieres and finales. See [The Android app](#the-android-app) below.

**Your library** (which shows, their status, which episodes you watched and
when) lives in your own Firebase database (Firestore, free plan), behind a
Google sign-in. Only your account can read or write it.

**Everything about the shows themselves** comes from public sources:

- [TVMaze](https://www.tvmaze.com): episode lists and air times, with
  [TMDB](https://www.themoviedb.org) as the fallback.
- TMDB: artwork, runtimes, cast and details.
- [MDBList](https://mdblist.com) and TMDB: ratings.
- Each episode's ratings in the episode lists: IMDb (through
  [OMDb](https://www.omdbapi.com)), [Trakt](https://trakt.tv) and TMDB, each
  shown only with enough votes behind it.
- Exact hours from yes's TV guide (Israeli shows) and SIMKL (streaming
  episodes listed by date only).
- TheTVDB: a second opinion on air dates, and more artwork along with
  Fanart.tv.

## Setup

1. Open the site and sign in with your Google account.
2. The first run shows **Setup**. Paste a **TMDB API key** (free at
   [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api)).
   Optional keys:
   - **MDBList API key**: IMDb, Rotten Tomatoes and Trakt ratings.
   - **Fanart.tv API key**: more posters and banners, in the image picker and
     for shows TMDB has no pictures for.
   - **TheTVDB API key**: the same, plus the second opinion on air dates.
   - **OMDb API key**: each episode's IMDb rating in the episode lists
     (free, 1,000 requests a day).
   - **Trakt Client ID** (create an app at trakt.tv; only the Client ID is
     needed): each episode's Trakt rating in the episode lists.
   - **SIMKL Client ID** (an app of type "TV, devices & command line"): the
     bridge signs in to SIMKL with it for exact air times. See below.

   The keys are kept in the browser and in your account
   (`users/{uid}/meta/keys`), so another browser or the Android app gets them
   once signed in. A device that lacks a key never erases the account's copy;
   it takes that copy instead. The keys are never in the site's files, so the
   repo is safe to keep public.

The Firebase project (`tv-library-c29bd`) and its security rules are set up.
Its config in `firebase-backend.js` is meant to be public: it grants nothing
by itself.

## What it shows

**The home page**

- **The top bar**:
  - the name and icon (a click reloads the page);
  - the live clock and date;
  - **My Shows**, **My Stats**, **Search Show** and **Settings**;
  - the profile picture, with the month so far beside it: episodes watched
    this calendar month and their time.
- **Ready to Watch** (top): the Watching shows with an episode out. The most
  recent event comes first: an episode becoming available, or you watching
  it. Each card shows:
  - the poster or banner;
  - the season's progress and episodes left;
  - time left (*next episode / all remaining*; click it to see every
    remaining episode);
  - the next episode and its title;
  - premiere and finale ribbons;
  - what's playing on Emby right now (a dimmed poster and the minutes left).
- **Airing Next**, **Just Watched** and **Plan to Watch** below it, a page at
  a time (arrows, a counter and a page bar; swipe on a phone). Airing Next's
  chip:
  - counts down in minutes, hours or days, and says NOW while the episode
    airs;
  - shows the episode's time of day;
  - names where the time came from: TVMaze, TMDB, SIMKL, YES or TVDB.
- **Panels to Posters**: the bottom panels show poster pairs instead of
  banners. The panels keep their height.
- **Every card**:
  - Its title or picture opens the show's page.
  - A small picture button in its corner opens the **image picker**. The
    choices come from TMDB, TVMaze and Metahub, plus Fanart.tv and TheTVDB
    with a key. The pick is kept on this device.
  - Its **⋮** menu marks the next episode watched, changes the status
    (Watching / Plan to Watch / On Hold / Completed / Dropped) or removes
    the show.
- **A toast** when the bridge marks an episode watched on Emby. It shows the
  show's poster and the season's bar.
- **Network logos** come from TMDB. When TMDB lists no network, the network
  comes from TVMaze. A small local set covers Israeli networks with no logo.

**A show's page** (from a title, a picture, My Shows or search): the backdrop
(a scene from the show, not the poster's key art again), poster, facts, scores,
your progress, the cast (drag it, or use the arrows), and the episodes. The
status and the watched episodes are changed here too, through the episodes
manager (mark single episodes or whole seasons). On a phone, one big picture
stands in for the backdrop and poster (a poster with no text when there is
one), and Images changes it.

**My Shows**: every show in the library, in an All tab and one tab per
status, as posters or as a list.

**My Stats**: a summary, your watching over time, top shows, taste (genres,
networks, countries) and what's left in your queue.

**Search Show**: searches TMDB in English and Hebrew at once. A result shows
its status in your library and its ratings, and opens its page.

**Settings**:
- the keys;
- dark mode;
- **Clean Look**: a second look, plain dark boxes in a show page's style,
  beside the cinematic one;
- the one-page layout;
- the site's version, and whether a newer one is live;
- the bridge's status;
- **Clean up Watching**, **Download backup**, **Restore from backup** and
  **Sign out**.

**A dot on the Settings icon** shows the bridge's health:
- green while all is well;
- amber while it reports a problem (for example, SIMKL signed out);
- red once the server says it hasn't been heard from for 35 minutes.

Its tooltip says what's wrong.

**Pictures for every show**: when TMDB has no poster or banner for a show (new
Israeli shows, mostly), the site finds one on Fanart.tv, TheTVDB or TVMaze. It
does this once, in the background, and keeps the result for a week. Sharp
screens get larger image sizes.

## The rules

**Episodes and "aired"**
- An episode with an exact air time has aired once it's over (its runtime
  after the start).
- A date-only episode counts as out **from 10:00 that day**.
- An episode with no date hasn't aired, unless you watched it.
- Specials (season 0) are kept but never counted.
- **The episode list** for each show is one of these:
  - TVMaze, by default (it has air times);
  - TMDB, when its numbering fits the show's history better;
  - a fixed snapshot of SIMKL's list (from the move in October 2026), for
    shows the outside sources don't cover. Every episode listed after the
    snapshot's end follows it, and an undated episode there takes TVMaze's
    date for the same number.
- Upcoming episodes the main source doesn't list yet come from the other
  one.
- Placeholder titles ("TBA", "Episode 3") count as no title.
- **Finding a show on TVMaze**: by its IMDb id, then TheTVDB's id. A show TMDB
  gives neither id for is found by TMDB's name (original, then English) when
  the premiere year agrees and TVMaze's own ids don't contradict ours. Found
  shows are kept 30 days. "Not on TVMaze" is kept one day, so a show TVMaze
  adds later is found the next day.

**Counts and the next episode**
- *Available* = aired episodes (plus any you watched). *Remaining* =
  available − watched.
- *Next to watch* = the first aired, unwatched episode after the latest one
  you watched. Gaps before it still count as remaining.

**Air times** (`air-time-chain.js`: the same order on the site and in the
bridge)
1. **yes's TV guide** for Israeli shows (`yes-times.js`): the schedules of
   Kan 11, Keshet 12 and Reshet 13 are read, and the show's first-run
   broadcast that day is used. Reruns never count. Its hour wins.
2. **SIMKL**, for episodes that are still date-only (`air-times.js`). Its time
   is used only when it's a real time and within a day of the known date.
   The bridge reads these times and keeps them in the account
   (`meta/airTimes`), so every device has them.
3. **TheTVDB's check** on dates within the next two weeks:
   - an episode TheTVDB puts days later waits for that day, unless TMDB
     agrees with the main source;
   - an episode it puts days earlier comes forward, if TMDB agrees.

   A streaming show is never held back: its TVMaze day is the day it comes
   out.

A step that fails leaves the episodes as they were, and the next step still
runs.

**Status**
- A Plan to Watch show whose first episode aired in the last 30 days, with
  nothing watched, moves to Watching once. It's marked `autoStarted`, so a
  show you move back by hand stays there.

**Saving**
- A change counts as saved only once the database has confirmed it. Until
  then, it shows as pending.
- Each change carries an id, so a retry or a second device never applies it
  twice.
- Changes that don't collide merge. A real conflict (for example, a status
  changed on two devices) waits for you to choose.
- Offline, changes wait on the device and survive a reload.

**Loading** (`library-sync.js`)
- Every save is stamped with the server's time (`_syncAt`), and every removal
  is noted in `meta/removed`.
- A load reads only the shows saved since the last load, on top of the copy
  it already has (the database's offline copy in the browser, memory in the
  bridge). That's typically 2 reads instead of one per show.
- Everything is read once a day, and whenever there's no copy.

## How it's built

A show's document id is its TMDB id (`imdb:<id>` or `tvdb:<id>` for a show
TMDB doesn't know). A show stores only what you know: its status, when it was
added, the episodes you watched and when, and a few marks. Everything else is
fetched.

| File | What it does |
|---|---|
| `library-core.js` | The library model and every rule computed from it (no network; runs in Node too). |
| `library-store.js` | All changes: the outbox, retries, conflict checks, backups. |
| `library-sync.js` | Loads only what changed (site and bridge). |
| `firebase-backend.js` | Google sign-in (in a browser, or through the phone in the app) and Firestore (`users/{uid}/shows/{id}`, `users/{uid}/meta/{name}`). |
| `library-adapter.js` | Answers the page's questions from the library, in the item shape the drawing code was written against. |
| `episode-source.js` | Episode lists from TVMaze and TMDB: cached, rate-limited, linked across sources. |
| `air-time-chain.js`, `yes-times.js`, `air-times.js` | Air times: the order of the steps, yes's guide, SIMKL's times. |
| `outside-sources.js` | TMDB's details, MDBList's ratings, each episode's IMDb (OMDb) and Trakt ratings, extra pictures from Fanart.tv, TheTVDB, TVMaze and Metahub. |
| `bridge-status.js` | The bridge's health report: written by the bridge, shown by the site. |
| `show-taker.js` | Takes newly watched episodes into the library (used by the Emby bridge). |
| `app/*.js` | The page, as ten plain scripts loaded in order from `index.html`: `core` (settings, plumbing, element actions), `library`, `show-data`, `airing`, `search`, `modals`, `images`, `panels`, `render`, `main`. |
| `my-shows.js` | My Shows and a show's page. |
| `stats.js` | My Stats. |
| `style.css`, `theme/` | The cinematic look (`cinematic.css`) and the clean look (`clean.css`). |
| `service-worker.js` | The offline copy and the fast start (see below). |
| `version.js` | The site's version: shown in Settings, and the name of the offline cache. |
| `firestore.rules` | The database's security rules, as they are live. |
| `native/` | Code that runs only inside the Android app: episode alerts and the phone sign-in plugin. |

The `app/` files share one global scope: code that runs while a file loads
may only use what earlier files define. Elements don't carry code in their
HTML. They name an action (`data-onclick` / `data-onerror` with
`data-args`), and the actions are listed in one table in `app/main.js`.
Text from outside (titles, names, URLs) goes into the page through `esc()`.

## The computer bridge (`tools/emby-bridge/`)

A Node program next to Emby. A shortcut to `start-hidden.vbs` in the Windows
Startup folder starts it at sign-in, and it logs to `emby-bridge.log`. It
does the following:

- **Marks what you watch on Emby**: an episode is marked at the moment 90% of
  it has played (`threshold` in its config). Episodes Emby itself marked
  played are taken too, with their real time. When it marks an episode:
  - Plan to Watch and On Hold move to Watching;
  - a series not in the library is added as Watching;
  - nothing is recorded twice;
  - the episode's record says so (`by: "emby"`).
- **Matches Emby's series to the library** by their ids. A series Emby knows
  only by TheTVDB's id (an Israeli show under a transliterated name) is
  matched by TVMaze's name and premiere year for that id, so it isn't added
  a second time.
- **Reports what's playing now** (`meta/emby`) and **what was just marked**
  (`meta/embyMarked`, with the library's name and ids), for a site open on a
  screen.
- **Writes the widget's Airing Next list** (`meta/airingNext`) every half
  hour. Each show has its next episodes and a picture: TMDB's backdrop,
  otherwise a banner from Fanart.tv or TheTVDB, otherwise a poster.
- **Fetches SIMKL's air times** (`meta/airTimes`), with its own SIMKL sign-in.
- **Writes its health report** (`meta/bridgeStatus`) every 10 minutes, and at
  once when a problem appears or goes away. It covers:
  - its last passes;
  - SIMKL's sign-in;
  - TheTVDB's key;
  - whether the live **security rules** still match `firestore.rules`
    (checked at start and once a day).

Setup:

1. Run `npm install` in `tools/emby-bridge`.
2. Copy `config.example.json` to `config.json`.
3. Put two keys next to it: an Emby API key (Emby dashboard > Advanced > API
   Keys) and a Firebase service-account key file. Both stay on that computer
   (`.gitignore`).

Then:

    node run.js --check              # Emby, the library, the read point, the security rules
    node run.js --simkl-login        # once: a code to enter at simkl.com/pin
    node run.js --airing --dry       # the widget's list, without writing it
    node run.js --airing --dry --art # ...with each picture's address

After changing the bridge's code, restart it: end its `node run.js` process
and run `start-hidden.vbs`.

## The Android app

A Capacitor shell around the live site (`android-app/`), so every change to
the site reaches the app without a new install. It adds:

- **Google sign-in through the phone** (Google doesn't sign in from a page
  inside an app). The keys come with the account, so nothing is typed on the
  phone.
- **The Airing Next widget**:
  - In one row, it shows text cards: the show, the episode and when it airs.
  - Stretched to two rows, it shows two wide cards per page, each with the
    show's picture. Every picture is the same size and reaches the card's
    edges.
  - The arrows page through the list without opening the app. A card opens
    the app.
  - Labels such as "Today 21:00" or "On air now" are worked out from the
    saved dates whenever the widget is drawn.
  - The list is the bridge's `meta/airingNext`. The phone fetches it in the
    background about once an hour, and whenever the app opens. A failed fetch
    keeps the last good list.
- **Episode alerts**: at 9:00 on the morning of a series premiere, a season
  premiere or a season finale. They're scheduled on the phone, so they go off
  even if the app isn't opened.
- **Phone layouts** for every screen. Back closes menus and windows instead
  of leaving the app. Text stays at 100% whatever the phone's font size.

How to build it, and the keys that stay on this computer:
[android-app/README.md](android-app/README.md).

## Offline and updates (`service-worker.js`)

The page's files (`index.html` and every script and stylesheet it lists) are
kept for each site version, and the page opens from them at once.

A deploy bumps the version in `version.js`. The browser then fetches the new
files whole: past GitHub's CDN, all or nothing. The page reloads itself when
it's out of sight, or after 5 idle minutes. Error answers are never kept. On
localhost the worker stays out of the way.

**Every push to `main` bumps `version.js`** (number and date). The version
names the cache, so without the bump devices keep the old files.

## Backups

**Settings → Download backup** saves the whole library as JSON. **Restore
from backup** replaces the library with a saved one; a backup of what was
there is downloaded first.

## Tools (local, not linked from the site)

- `tools/store-check.html`: checks the database, sign-in and security rules,
  with a temporary test show.
- `tools/source-compare.html`: shows the episode sources side by side for a
  show.
- `tools/emby-bridge/tvdb-check.js`: TheTVDB's dates compared to the
  library's.
- `tools/migrate.html`, `tools/import.html`: the one-time move from SIMKL
  (October 2026). They read a SIMKL sign-in from the browser, which the site
  no longer creates, so they're kept only for the record.

## Tests

    node --test "tests/*.test.js"   # rules, sources, store, sync, bridge, widget list, alerts, service worker...
    node tests/run-browser.mjs      # every browser scenario, in a headless Chrome (~5 min)

`run-browser.mjs` serves the project itself and runs
`tests/compare-modes.harness.html`. That page runs the real site against a
fake world (`compare-modes.fake.js`) with its clock fixed. It runs once for
each scenario:

- the panels, checked against `tests/golden/panels.json` (`?golden=library`
  prints what the page shows, to refresh it);
- `writes`, `ui`, `airtimes`, `posters`, `nowwatching`, `order` and `stats`;
- `onair`, which waits for real moments (about two minutes).

Page errors also fail a run.

## Publishing

GitHub Pages serves `main` at
[elad-navon.github.io/my-watch-list](https://elad-navon.github.io/my-watch-list/).
Work happens on a branch and is checked on a local server first. `main` is
the live site.

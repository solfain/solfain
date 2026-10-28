# Solfain

Solfain is an anime discovery and streaming web application built with **React 19**, **TypeScript**, and **Vite**, powered by real metadata from the **AniList GraphQL API** and direct playback integration with **Yenime**.

## Quick Start

### Prerequisites

- Node.js `>= 20` and `npm`

### Install Dependencies

```bash
npm install
```

### Start Development Server

```bash
npm run dev
```

Runs Vite bound to `0.0.0.0:5173`.

### Run Automated Tests, Security Audit & Typecheck

```bash
npm audit
npm run typecheck
npm test
```

### Build & Run Production Server (with Watch Party WebSocket Hub)

```bash
npm run build
npm start
```

`npm start` launches `server/prodServer.mjs` on `0.0.0.0:${PORT || 4173}`, serving the compiled `dist/` bundle together with the real-time `/api/party/*` REST endpoints and `/ws/party` WebSocket hub. (`npm run dev` and `npm run preview` also mount the exact same Watch Party hub automatically via Vite.)

---

## Architecture Overview

```
src/
├── components/
│   ├── monetization/SponsorSlot.tsx # Adsterra AdSlot loader & responsive layout container
│   ├── anime/                       # AnimeCard (2:3), RecentEpisodeCard (16:9), FeaturedHero, CatalogueRow, EpisodeList, Skeletons
│   ├── layout/                      # Header (responsive nav + debounced search), Footer, ErrorBoundary (route-aware reset)
│   ├── storage/                     # LibraryBackupControls (JSON export & strictly validated import)
│   └── ui/StateFeedback.tsx         # Empty & error state panels with retry controls
├── pages/
│   ├── HomePage.tsx                 # Featured spotlight, Continue Watching, Trending, Recently Released, Seasonal, Popular, Top Rated, Seeded Recommendations
│   ├── SearchPage.tsx               # Debounced search + Genre, Format, Season, Year, Sort filters + Surprise Me + pagination
│   ├── SeasonsPage.tsx              # Seasonal Archive Explorer (Winter / Spring / Summer / Fall by year, format & sort)
│   ├── SchedulePage.tsx             # 7-day Simulcast Schedule grouped by local broadcast day with live countdowns
│   ├── WatchPartyLobbyPage.tsx      # Create private/passcode-locked Watch Party rooms or join via 6-char invite code
│   ├── WatchPartyRoomPage.tsx       # Real-time WebSocket synced playback (Yenime & direct HTTPS streams), live chat & host moderation
│   ├── TimeCapsulePage.tsx          # Anime Time Capsule snapshots, 6m/1y revisit diff engine, .ics/browser reminders & shareable Before/After cards
│   ├── StudioPage.tsx               # Animation Studio filmography spotlight (/studio/:id)
│   ├── AnimeDetailsPage.tsx         # Artwork, titles, live airing countdown, synopsis, JP/EN voice cast, official trailer modal, episodes, relations, recommendations
│   ├── WatchPage.tsx                # 16:9 player + Theater Mode, Cinema Lights-Off dimmer, persistent SUB/DUB prefs, watched checkmarks, shortcuts (T / L / N / P / ?)
│   ├── FavoritesPage.tsx            # Tabbed Favorites & Watchlist tracker (Watching, Plan to Watch, Completed, On Hold, Dropped + 1-10 scores + ep stepper)
│   ├── HistoryPage.tsx              # Local-storage episode visit & verified playback progress log + JSON backup/restore
│   └── NotFoundPage.tsx             # 404 fallback route
├── services/
│   ├── monetization/                # Adsterra unit definitions, sequential top-level script loader, and slot registry
│   ├── anilist/                     # GraphQL client (15s timeout, bounded LRU + session cache, deduplication, 429 handling), queries, and typed service
│   ├── providers/                   # VideoProviderAdapter interface + YenimeProvider implementation
│   └── storage/                     # Sanitized localStorage stores with cross-tab sync and library backup/import
├── styles/                          # Design tokens (#0B0B0D / #141418 / #1B1B21 / #8B5CF6), reset, and responsive layouts
├── types/                           # Shared TypeScript interfaces
└── utils/                           # Formatting, entity decoding, strict URL/color/JSON security validators, debounce hook
```

---

## Security Hardening

- **Zero Dependency Vulnerabilities**: Verified clean via `npm audit` (`0 vulnerabilities`).
- **Strict Input & URL Sanitization (`src/utils/security.ts`)**:
  - External artwork, reference links, Adsterra invoke URLs, and imported backup records are validated via `sanitizeHttpUrl` (`https:` only, rejecting `javascript:`, `data:`, `vbscript:`, `file:`, credentials, and oversize URLs).
  - Hex color metadata is validated via `sanitizeHexColor` before use.
  - Official trailers only mount via `https://www.youtube-nocookie.com/embed/{id}` after strict regex validation of AniList's YouTube ID.
  - `localStorage`, `sessionStorage`, and JSON backup imports parse through `safeJsonParse` (1 MB payload ceiling + `__proto__` / `constructor` / `prototype` key stripping against prototype pollution).
- **Verified Player Telemetry**: `yenimeProvider.parsePlayerMessage` checks both `event.origin === 'https://player.yenime.net'` and `event.source === iframe.contentWindow`, clamping telemetry timestamps to safe bounds.
- **HTTP & Document Security Policies**: Configured across `index.html`, `vite.config.ts`, `vercel.json`, and `public/_headers` (`Content-Security-Policy: object-src 'none'; base-uri 'self'; form-action 'self';`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: origin-when-cross-origin`, `Permissions-Policy`, and SPA fallback rewrites).

---

## Yenime Video Provider Integration

Solfain streams directly through **Yenime** (`https://player.yenime.net`) via a modular `VideoProviderAdapter` (`src/services/providers/`):

1. **Documented Player Endpoints**:
   - `GET https://player.yenime.net/anime/ani/{anilistId}/{episode}` (supports `?dub=1` for dubbed playback)
   - `GET https://player.yenime.net/anime/mal/{malId}/{episode}` (supports `?dub=1`, selectable via the Watch Page identifier switch when a MyAnimeList ID is mapped)
2. **Episode Lists**: Episode counts, airing schedules (`nextAiringEpisode`), and available episode titles/thumbnails (`streamingEpisodes`) are populated from **AniList**.
3. **Player Events, Throttled Progress & Auto-Next**: `player.yenime.net` posts `PLAYER_EVENT` messages (`play`, `pause`, `seeked`, `ended`, `timeupdate`) with `currentTime` and `duration`. Solfain throttles frequent `timeupdate` persistence to 5-second intervals (flushing immediately on `pause`, `seeked`, and `ended`) and advances automatically when `Auto-Next` is enabled.

## Monetization (Adsterra)

`AdSlot` (`src/components/monetization/SponsorSlot.tsx`) and `ADSTERRA_SLOTS` (`src/services/monetization/adsterraConfig.ts`) mount **Adsterra** `atOptions` units directly in the top-level DOM (`window === window.top`) via a sequential mount queue while keeping the **top of the Homepage clean**:

- **`300×250` Medium Rectangle (`8031ff5e7be9985553dcdea4bbb45d96`)**:
  - `sidebar-rectangle` — Anime Details (`/anime/:id`) right-hand dossier sidebar
  - `watch-sidebar-rectangle` — Watch Page (`/watch/:id`) right-hand rail below the episode selector
  - `search-bottom-rectangle` — Browse & Search (`/search`) bottom slot
  - `schedule-bottom-rectangle` — Simulcast Schedule (`/schedule`) bottom slot
  - `home-footer-rectangle` — Homepage (`/`) footer slot below Highest Rated
- **`320×50` Compact Banner (`6339f8aa4607b6c12e213fc4cf317df1`)**:
  - `home-mid-banner` — Homepage (`/`) mid-catalogue slot below Seasonal lineup
  - `search-top-banner` — Browse & Search (`/search`) filter bar banner
  - `details-inline` — Anime Details (`/anime/:id`) inline strip
  - `watch-below-player` — Watch Page (`/watch/:id`) strip separated below player & info
  - `collection-footer-banner` — Favorites (`/favorites`) & Watch History (`/history`) footer strip

# Solfain

Solfain is an anime discovery and streaming web application built with **React 19**, **TypeScript**, and **Vite**, powered by real metadata from the **AniList GraphQL API** and a modular video-provider boundary targeting **Yenime**.

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

### Run Automated Tests & Typecheck

```bash
npm run typecheck
npm test
```

### Build for Production

```bash
npm run build
npm run preview
```

---

## Architecture Overview

```
src/
├── components/
│   ├── ads/AdSlot.tsx               # Configurable, responsive advertisement slot placeholder
│   ├── anime/                       # AnimeCard (2:3), RecentEpisodeCard (16:9), FeaturedHero, CatalogueRow, EpisodeList, Skeletons
│   ├── layout/                      # Header (responsive nav + debounced search), Footer, ErrorBoundary
│   └── ui/StateFeedback.tsx         # Empty & error state panels with retry controls
├── pages/
│   ├── HomePage.tsx                 # Featured spotlight, Continue Watching, Trending, Recently Released, Seasonal, Popular, Top Rated, Seeded Recommendations
│   ├── SearchPage.tsx               # Debounced search + Genre, Format, Season, Year, and Sort filters + pagination
│   ├── AnimeDetailsPage.tsx         # Banner & cover artwork, English/Romaji/Native titles, synopsis, episode list, franchise relations, recommendations
│   ├── WatchPage.tsx                # 16:9 theater player, SUB/DUB switching, Prev/Next/Jump controls, episode sidebar, verified progress listener
│   ├── FavoritesPage.tsx            # Local-storage watchlist without requiring an account
│   ├── HistoryPage.tsx              # Local-storage episode visit & verified playback progress log
│   └── NotFoundPage.tsx             # 404 fallback route
├── services/
│   ├── ads/adRegistry.ts            # Clean adapter interface for future verified ad networks
│   ├── anilist/                     # GraphQL client (TTL cache, in-flight deduplication, 429 Retry-After handling), queries, and typed service
│   ├── providers/                   # VideoProviderAdapter interface + YenimeProvider implementation
│   └── storage/                     # Schema-validated localStorage stores with cross-tab sync
├── styles/                          # Design tokens (#0B0B0D / #141418 / #1B1B21 / #8B5CF6), reset, and responsive layouts
├── types/                           # Shared TypeScript interfaces
└── utils/                           # Formatting, HTML sanitization, season calculation, debounce hook
```

---

## Yenime Video Provider Integration

Solfain streams directly through **Yenime** (`https://player.yenime.net`) via a modular `VideoProviderAdapter` (`src/services/providers/`):

1. **Documented Player Endpoints**:
   - `GET https://player.yenime.net/anime/ani/{anilistId}/{episode}` (supports `?dub=1` for dubbed playback)
   - `GET https://player.yenime.net/anime/mal/{malId}/{episode}` (supports `?dub=1`, selectable via the Watch Page identifier switch when a MyAnimeList ID is mapped)
2. **Episode Lists**: Because `api.yenime.net` documents an iframe player endpoint rather than a JSON episode-list API, episode counts, airing schedules (`nextAiringEpisode`), and available episode titles/thumbnails (`streamingEpisodes`) are populated from **AniList**.
3. **Player Events & Auto-Next**: `player.yenime.net` posts `PLAYER_EVENT` messages (`play`, `pause`, `seeked`, `ended`, `timeupdate`) with `currentTime` and `duration`. Solfain validates `event.origin === 'https://player.yenime.net'` to persist playback progress in Watch History and automatically advance to the next episode when `Auto-Next` is enabled.

## Monetization (Perch Ads)

`AdSlot` (`src/components/monetization/SponsorSlot.tsx`) and `PERCH_ADS_SLOTS` (`src/services/monetization/perchConfig.ts`) integrate **Perch Ads** (`https://www.perchads.com/embed.js`):

- **Live `300×250` Medium Rectangle (`data-space="f83vmd3w8e"`)**:
  - `home-top-rectangle` — Homepage (`/`) right below the Featured Hero
  - `sidebar-rectangle` — Anime Details (`/anime/:id`) right-hand dossier sidebar
  - `watch-sidebar-rectangle` — Watch Page (`/watch/:id`) right-hand rail below the episode selector
  - `search-bottom-rectangle` — Browse & Search (`/search`) bottom slot
- **Reserved `728×90` / `320×50` Leaderboard Placeholders** (ready for additional `data-space` IDs in `src/services/monetization/perchConfig.ts`):
  - `home-leaderboard`, `home-footer-banner`, `search-top-banner`, `details-inline`, `details-bottom-banner`, `watch-below-player`, `collection-footer-banner`

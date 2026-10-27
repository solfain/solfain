import { useCallback, useEffect, useState } from 'react';
import { AdSlot } from '../components/monetization/SponsorSlot';
import { AnimeCard } from '../components/anime/AnimeCard';
import { CatalogueRow } from '../components/anime/CatalogueRow';
import { FeaturedHero } from '../components/anime/FeaturedHero';
import { RecentEpisodeCard } from '../components/anime/RecentEpisodeCard';
import { AnimeGridSkeleton } from '../components/anime/Skeletons';
import { ErrorState } from '../components/ui/StateFeedback';
import { getHomeCatalogue, getSeededRecommendations } from '../services/anilist/anilistService';
import { useFavorites } from '../services/storage/favoritesStore';
import { useWatchHistory } from '../services/storage/historyStore';
import type { AnimeSummary, HomeCatalogueData } from '../types/anime';
import { formatSeasonName } from '../utils/format';

function HomeHeroSkeleton() {
  return (
    <div
      style={{
        minHeight: '420px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'flex-end',
        paddingBottom: '32px',
      }}
    >
      <div className="container" style={{ width: '100%' }}>
        <div style={{ maxWidth: '520px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="skeleton-block" style={{ height: '14px', width: '180px' }} />
          <div className="skeleton-block" style={{ height: '38px', width: '88%' }} />
          <div className="skeleton-block" style={{ height: '56px', width: '100%' }} />
          <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
            <div className="skeleton-block" style={{ height: '40px', width: '132px' }} />
            <div className="skeleton-block" style={{ height: '40px', width: '104px' }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function HomeRowsSkeleton({ count = 2 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, idx) => (
        <div key={idx} className="catalogue-section">
          <div className="skeleton-block" style={{ height: '22px', width: '190px' }} />
          <AnimeGridSkeleton count={6} />
        </div>
      ))}
    </>
  );
}

export function HomePage() {
  const [data, setData] = useState<HomeCatalogueData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recommended, setRecommended] = useState<AnimeSummary[]>([]);
  const { history } = useWatchHistory();
  const { favorites } = useFavorites();

  const seedAnimeId = history[0]?.animeId ?? favorites[0]?.id ?? null;
  const seedTitle = history[0]?.title ?? favorites[0]?.title ?? null;

  useEffect(() => {
    document.title = 'Solfain — Anime Discovery & Streaming';
  }, []);

  const loadCatalogue = useCallback(async (bypassCache = false) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const response = await getHomeCatalogue({ bypassCache });
      setData(response);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Failed to load anime catalogue from AniList.';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalogue(false);
  }, [loadCatalogue]);

  useEffect(() => {
    if (!seedAnimeId) {
      setRecommended([]);
      return;
    }
    const controller = new AbortController();
    getSeededRecommendations(seedAnimeId, { signal: controller.signal })
      .then((items) => {
        if (!controller.signal.aborted) {
          setRecommended(items);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setRecommended([]);
        }
      });
    return () => controller.abort();
  }, [seedAnimeId]);

  if (errorMessage && !data && !loading) {
    return (
      <div className="container" style={{ paddingTop: '40px' }}>
        <ErrorState
          title="Unable to load anime catalogue"
          message={errorMessage}
          onRetry={() => void loadCatalogue(true)}
        />
      </div>
    );
  }

  const isInitialLoading = loading && !data;

  const seasonLabel = data
    ? `${formatSeasonName(data.seasonInfo.season) ?? ''} ${data.seasonInfo.year}`.trim()
    : '';

  return (
    <div aria-busy={isInitialLoading || undefined}>
      {isInitialLoading || !data ? (
        <HomeHeroSkeleton />
      ) : (
        <FeaturedHero items={data.trending} />
      )}

      <div className="container catalogue-stack">
        {isInitialLoading || !data ? (
          <HomeRowsSkeleton count={2} />
        ) : (
          <>
            {history.length > 0 && (
              <CatalogueRow
                title="Continue Watching"
                subtitle="Pick up where you left off"
                viewAllHref="/history"
                viewAllLabel="History"
                wideCards
              >
                {history.slice(0, 8).map((entry) => (
                  <RecentEpisodeCard key={entry.animeId} mode="history" item={entry} />
                ))}
              </CatalogueRow>
            )}

            {data.trending.length > 0 && (
              <CatalogueRow
                title="Trending Now"
                subtitle="Most active across AniList"
                viewAllHref="/search?sort=TRENDING_DESC"
              >
                {data.trending.map((anime, index) => (
                  <AnimeCard key={anime.id} anime={anime} eager={index < 6} />
                ))}
              </CatalogueRow>
            )}

            {data.recentlyReleased.length > 0 && (
              <CatalogueRow
                title="Recently Released"
                subtitle="Latest aired episodes"
                wideCards
              >
                {data.recentlyReleased.map((item) => (
                  <RecentEpisodeCard
                    key={`${item.media.id}-${item.episode}`}
                    mode="airing"
                    item={item}
                  />
                ))}
              </CatalogueRow>
            )}

            {data.seasonal.length > 0 && (
              <CatalogueRow
                title={`${seasonLabel} Season`}
                subtitle="Current seasonal lineup"
                viewAllHref={`/seasons?season=${data.seasonInfo.season}&year=${data.seasonInfo.year}`}
                viewAllLabel="Explore Season"
              >
                {data.seasonal.map((anime) => (
                  <AnimeCard key={anime.id} anime={anime} />
                ))}
              </CatalogueRow>
            )}
          </>
        )}

        <AdSlot key="home-mid-banner" placement="home-mid-banner" />

        {isInitialLoading || !data ? (
          <HomeRowsSkeleton count={2} />
        ) : (
          <>
            {recommended.length > 0 && seedTitle && (
              <CatalogueRow
                title="Recommended For You"
                subtitle={`Based on ${seedTitle}`}
              >
                {recommended.map((anime) => (
                  <AnimeCard key={anime.id} anime={anime} />
                ))}
              </CatalogueRow>
            )}

            {data.popular.length > 0 && (
              <CatalogueRow
                title="All-Time Popular"
                subtitle="Essential series & films"
                viewAllHref="/search?sort=POPULARITY_DESC"
              >
                {data.popular.map((anime, index) => (
                  <AnimeCard key={anime.id} anime={anime} rank={index + 1} />
                ))}
              </CatalogueRow>
            )}

            {data.topRated.length > 0 && (
              <CatalogueRow
                title="Highest Rated"
                subtitle="Critically acclaimed on AniList"
                viewAllHref="/search?sort=SCORE_DESC"
              >
                {data.topRated.map((anime) => (
                  <AnimeCard key={anime.id} anime={anime} />
                ))}
              </CatalogueRow>
            )}
          </>
        )}

        <AdSlot key="home-footer-rectangle" placement="home-footer-rectangle" />
      </div>
    </div>
  );
}

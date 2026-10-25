import { useCallback, useEffect, useState } from 'react';
import { AdSlot } from '../components/monetization/SponsorSlot';
import { AnimeCard } from '../components/anime/AnimeCard';
import { CatalogueRow } from '../components/anime/CatalogueRow';
import { FeaturedHero } from '../components/anime/FeaturedHero';
import { RecentEpisodeCard } from '../components/anime/RecentEpisodeCard';
import { HomeSkeleton } from '../components/anime/Skeletons';
import { ErrorState } from '../components/ui/StateFeedback';
import { getHomeCatalogue, getSeededRecommendations } from '../services/anilist/anilistService';
import { useFavorites } from '../services/storage/favoritesStore';
import { useWatchHistory } from '../services/storage/historyStore';
import type { AnimeSummary, HomeCatalogueData } from '../types/anime';
import { formatSeasonName } from '../utils/format';

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

  if (loading && !data) {
    return <HomeSkeleton />;
  }

  if (errorMessage && !data) {
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

  if (!data) {
    return null;
  }

  const seasonLabel = `${formatSeasonName(data.seasonInfo.season) ?? ''} ${
    data.seasonInfo.year
  }`.trim();

  return (
    <div>
      <FeaturedHero items={data.trending} />

      <div className="container catalogue-stack">
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
              <RecentEpisodeCard key={`${item.media.id}-${item.episode}`} mode="airing" item={item} />
            ))}
          </CatalogueRow>
        )}

        {data.seasonal.length > 0 && (
          <CatalogueRow
            title={`${seasonLabel} Season`}
            subtitle="Current seasonal lineup"
            viewAllHref={`/search?season=${data.seasonInfo.season}&year=${data.seasonInfo.year}`}
          >
            {data.seasonal.map((anime) => (
              <AnimeCard key={anime.id} anime={anime} />
            ))}
          </CatalogueRow>
        )}

        <AdSlot placement="home-mid-banner" />

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

        <AdSlot placement="home-footer-rectangle" />
      </div>
    </div>
  );
}

export const MEDIA_CARD_FRAGMENT = `
  fragment MediaCardFields on Media {
    id
    idMal
    type
    title {
      romaji
      english
      native
      userPreferred
    }
    coverImage {
      extraLarge
      large
      medium
      color
    }
    bannerImage
    format
    status(version: 2)
    episodes
    duration
    season
    seasonYear
    startDate {
      year
      month
      day
    }
    averageScore
    meanScore
    popularity
    genres
    isAdult
    nextAiringEpisode {
      id
      airingAt
      timeUntilAiring
      episode
    }
    studios(isMain: true) {
      edges {
        isMain
        node {
          id
          name
          isAnimationStudio
        }
      }
    }
  }
`;

export const HOME_CATALOGUE_QUERY = `
  ${MEDIA_CARD_FRAGMENT}
  query HomeCatalogue($season: MediaSeason!, $seasonYear: Int!) {
    trending: Page(page: 1, perPage: 16) {
      media(type: ANIME, sort: [TRENDING_DESC, POPULARITY_DESC], isAdult: false) {
        ...MediaCardFields
        description(asHtml: false)
      }
    }
    seasonal: Page(page: 1, perPage: 16) {
      media(
        type: ANIME
        season: $season
        seasonYear: $seasonYear
        sort: [POPULARITY_DESC]
        isAdult: false
      ) {
        ...MediaCardFields
      }
    }
    popular: Page(page: 1, perPage: 16) {
      media(type: ANIME, sort: [POPULARITY_DESC], isAdult: false) {
        ...MediaCardFields
      }
    }
    topRated: Page(page: 1, perPage: 16) {
      media(type: ANIME, sort: [SCORE_DESC], isAdult: false) {
        ...MediaCardFields
      }
    }
    recentlyAired: Page(page: 1, perPage: 24) {
      airingSchedules(notYetAired: false, sort: [TIME_DESC]) {
        id
        episode
        airingAt
        media {
          ...MediaCardFields
        }
      }
    }
  }
`;

export const SEARCH_ANIME_QUERY = `
  ${MEDIA_CARD_FRAGMENT}
  query SearchAnime(
    $page: Int = 1
    $perPage: Int = 24
    $search: String
    $genre: String
    $format: MediaFormat
    $season: MediaSeason
    $seasonYear: Int
    $startDateLike: String
    $status: MediaStatus
    $sort: [MediaSort]
  ) {
    Page(page: $page, perPage: $perPage) {
      pageInfo {
        currentPage
        hasNextPage
        perPage
      }
      media(
        type: ANIME
        isAdult: false
        search: $search
        genre: $genre
        format: $format
        season: $season
        seasonYear: $seasonYear
        startDate_like: $startDateLike
        status: $status
        sort: $sort
      ) {
        ...MediaCardFields
      }
    }
  }
`;

export const SEEDED_RECOMMENDATIONS_QUERY = `
  ${MEDIA_CARD_FRAGMENT}
  query SeededRecommendations($id: Int!) {
    Media(id: $id, type: ANIME) {
      id
      recommendations(page: 1, perPage: 12, sort: [RATING_DESC, ID]) {
        nodes {
          id
          rating
          mediaRecommendation {
            ...MediaCardFields
          }
        }
      }
    }
  }
`;

export const ANIME_DETAILS_QUERY = `
  ${MEDIA_CARD_FRAGMENT}
  query AnimeDetails($id: Int!) {
    Media(id: $id, type: ANIME) {
      ...MediaCardFields
      description(asHtml: false)
      endDate {
        year
        month
        day
      }
      source(version: 3)
      synonyms
      favourites
      siteUrl
      trailer {
        id
        site
        thumbnail
      }
      streamingEpisodes {
        title
        thumbnail
        url
        site
      }
      externalLinks {
        id
        url
        site
        type
        language
        color
        icon
        isDisabled
      }
      relations {
        edges {
          id
          relationType(version: 2)
          node {
            ...MediaCardFields
          }
        }
      }
      recommendations(page: 1, perPage: 12, sort: [RATING_DESC, ID]) {
        nodes {
          id
          rating
          mediaRecommendation {
            ...MediaCardFields
          }
        }
      }
    }
  }
`;

export const GENRE_COLLECTION_QUERY = `
  query GenreList {
    GenreCollection
  }
`;

export const WEEKLY_SCHEDULE_QUERY = `
  ${MEDIA_CARD_FRAGMENT}
  query WeeklySchedule($startAt: Int!, $endAt: Int!, $page: Int = 1, $perPage: Int = 50) {
    Page(page: $page, perPage: $perPage) {
      pageInfo {
        currentPage
        hasNextPage
        perPage
      }
      airingSchedules(airingAt_greater: $startAt, airingAt_lesser: $endAt, sort: [TIME]) {
        id
        episode
        airingAt
        timeUntilAiring
        media {
          ...MediaCardFields
        }
      }
    }
  }
`;

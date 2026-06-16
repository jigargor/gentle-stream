/** Feed bootstrap timing constants shared by NewsFeed pagination and singleton modules. */
export const SINGLETON_AFTER_ARTICLE_COUNT_WEATHER = 2;
export const SINGLETON_AFTER_ARTICLE_COUNT_SPOTIFY = 5;
export const SINGLETON_AFTER_ARTICLE_COUNT_NASA = 8;

export function gameRatioLocalStorageKey(userId: string): string {
  return `gentle_stream_game_ratio_v2:${userId}`;
}

export const GUEST_USER_ID = "anonymous";

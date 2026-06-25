export const DAILY_REVIEW_LIMIT = 40;

export const limitDailyReviewItems = <T>(
  items: T[],
  limit = DAILY_REVIEW_LIMIT
) => {
  if (!Number.isFinite(limit) || limit <= 0) {
    return [];
  }

  return items.slice(0, Math.floor(limit));
};

export const formatDailyReviewCount = (dueCount: number) => {
  const safeDueCount = Number.isFinite(dueCount)
    ? Math.max(0, Math.floor(dueCount))
    : 0;
  const reviewCount = Math.min(safeDueCount, DAILY_REVIEW_LIMIT);

  return safeDueCount > DAILY_REVIEW_LIMIT
    ? `${reviewCount} of ${safeDueCount}`
    : `${safeDueCount}`;
};

export const PAGE_SWIPE_THRESHOLD = 36;

export function clampPageIndex(
  requestedIndex: number,
  pageCount: number,
): number {
  if (pageCount <= 0) {
    return 0;
  }

  return Math.min(Math.max(Math.trunc(requestedIndex), 0), pageCount - 1);
}

export function shouldHandleHorizontalPageSwipe(
  deltaX: number,
  deltaY: number,
  threshold = PAGE_SWIPE_THRESHOLD,
): boolean {
  return (
    Math.abs(deltaX) >= threshold &&
    Math.abs(deltaX) > Math.abs(deltaY) * 1.35
  );
}

export function pageAfterHorizontalSwipe(
  currentIndex: number,
  pageCount: number,
  deltaX: number,
): number {
  if (deltaX === 0) {
    return clampPageIndex(currentIndex, pageCount);
  }

  return clampPageIndex(
    currentIndex + (deltaX < 0 ? 1 : -1),
    pageCount,
  );
}

import {
  clampPageIndex,
  pageAfterHorizontalSwipe,
  shouldHandleHorizontalPageSwipe,
} from '../src/app/ReaderNavigation';

describe('reader page navigation', () => {
  test('never leaves the valid page range', () => {
    expect(clampPageIndex(-10, 3)).toBe(0);
    expect(clampPageIndex(0, 3)).toBe(0);
    expect(clampPageIndex(2, 3)).toBe(2);
    expect(clampPageIndex(99, 3)).toBe(2);
    expect(clampPageIndex(4, 0)).toBe(0);
  });

  test('maps horizontal swipe direction to previous and next page', () => {
    expect(pageAfterHorizontalSwipe(1, 3, -80)).toBe(2);
    expect(pageAfterHorizontalSwipe(1, 3, 80)).toBe(0);
    expect(pageAfterHorizontalSwipe(0, 3, 80)).toBe(0);
    expect(pageAfterHorizontalSwipe(2, 3, -80)).toBe(2);
  });

  test('ignores short and mostly vertical gestures', () => {
    expect(shouldHandleHorizontalPageSwipe(20, 0)).toBe(false);
    expect(shouldHandleHorizontalPageSwipe(50, 45)).toBe(false);
    expect(shouldHandleHorizontalPageSwipe(70, 10)).toBe(true);
    expect(shouldHandleHorizontalPageSwipe(-70, 10)).toBe(true);
  });
});

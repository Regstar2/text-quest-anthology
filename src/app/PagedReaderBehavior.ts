import {
  updatePagedReaderGeometry,
  type PagedReaderState,
  type ReaderPageGeometry,
  type ReaderPhysicalPage,
} from './PagedReaderPagination';

export type PagedReaderBehaviorInput = Readonly<{
  state: PagedReaderState;
  passageCount: number;
  paginationPending: boolean;
  interactionRequested: boolean;
  interactionTargetPassageCount: number | null;
  hasInteraction: boolean;
  bannerReadyHeight: number;
  bannerEligible: boolean;
}>;

export type PagedReaderBehavior = Readonly<{
  currentPage: ReaderPhysicalPage | null;
  pageTransitionReady: boolean;
  canOpenInteraction: boolean;
  interactionTransitionPending: boolean;
  interactionVisible: boolean;
  displayedPageNumber: number | null;
  pageBannerActive: boolean;
  canGoPrevious: boolean;
  canGoNext: boolean;
}>;

export type PagedReaderForwardAction =
  | Readonly<{type: 'page'; pageIndex: number}>
  | Readonly<{type: 'interaction'}>
  | Readonly<{type: 'none'}>;

export function derivePagedReaderBehavior(
  input: PagedReaderBehaviorInput,
): PagedReaderBehavior {
  const currentPage =
    input.state.pages[input.state.currentPageIndex] ?? null;
  const readerContentCommitted =
    input.state.processedPassageCount === input.passageCount;
  const pageTransitionReady =
    currentPage !== null &&
    currentPage.geometryRevision === input.state.geometryRevision &&
    !input.paginationPending &&
    readerContentCommitted;
  const canOpenInteraction =
    pageTransitionReady &&
    input.state.currentPageIndex === input.state.pages.length - 1 &&
    input.hasInteraction;
  const interactionTransitionPending =
    input.interactionTargetPassageCount !== null;
  const interactionVisible =
    input.interactionRequested &&
    (interactionTransitionPending || canOpenInteraction);
  const displayedPageNumber =
    !interactionVisible && pageTransitionReady
      ? input.state.currentPageIndex + 1
      : null;
  const pageBannerActive =
    input.bannerEligible &&
    !interactionVisible &&
    currentPage !== null &&
    currentPage.bannerReserve > 0 &&
    currentPage.bannerReserve === input.bannerReadyHeight;
  const canGoPrevious =
    pageTransitionReady && input.state.currentPageIndex > 0;
  const canGoNext =
    pageTransitionReady &&
    (input.state.currentPageIndex < input.state.pages.length - 1 ||
      canOpenInteraction);

  return Object.freeze({
    currentPage,
    pageTransitionReady,
    canOpenInteraction,
    interactionTransitionPending,
    interactionVisible,
    displayedPageNumber,
    pageBannerActive,
    canGoPrevious,
    canGoNext,
  });
}

export function resolvePagedReaderForwardAction(
  behavior: PagedReaderBehavior,
  state: PagedReaderState,
  busy: boolean,
): PagedReaderForwardAction {
  if (busy || !behavior.pageTransitionReady) {
    return {type: 'none'};
  }

  if (state.currentPageIndex < state.pages.length - 1) {
    return {type: 'page', pageIndex: state.currentPageIndex + 1};
  }

  return behavior.canOpenInteraction
    ? {type: 'interaction'}
    : {type: 'none'};
}

export function committedPageBodyHeight(
  measuredHeight: number,
  behavior: PagedReaderBehavior,
): number {
  if (!behavior.pageBannerActive || !behavior.currentPage) {
    return measuredHeight;
  }

  return measuredHeight + behavior.currentPage.bannerReserve;
}

export function applyPagedReaderLayout(
  state: PagedReaderState,
  expectedGeometryRevision: number,
  geometry: ReaderPageGeometry,
): PagedReaderState {
  if (state.geometryRevision !== expectedGeometryRevision) {
    return state;
  }

  return updatePagedReaderGeometry(state, geometry);
}

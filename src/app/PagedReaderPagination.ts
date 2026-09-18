import {
  compareReaderSemanticAnchors,
  type ReaderSemanticAnchor,
} from '../narrative/ReaderPosition';

export const STORY_LINE_HEIGHT = 28;
export const PAGE_GAP = 12;
export const PAGE_VERTICAL_PADDING = 12;
export const CHOICE_GAP = 8;
export const ENDING_ACTIONS_RESERVE = 116;
export const PARAGRAPH_INDENT = '\u2003\u2003';
export const FORCED_PAGE_BREAK_MARKER = '\uE001';

const CHOICE_ROW_RESERVE = 78;
const PARAGRAPH_BREAK_MARKER = '\uE000';

export type ReaderPageGeometry = Readonly<{
  width: number;
  height: number;
  fontScale: number;
}>;

export type ReaderPhysicalPage = Readonly<{
  key: string;
  geometryRevision: number;
  pageIndex: number;
  paragraphs: readonly string[];
  anchor: ReaderSemanticAnchor;
}>;

export type PagedReaderState = Readonly<{
  pages: readonly ReaderPhysicalPage[];
  currentPageIndex: number;
  geometry: ReaderPageGeometry | null;
  geometryRevision: number;
  processedPassageCount: number;
  restoreAnchor: ReaderSemanticAnchor | null;
  fallbackPageIndex: number;
}>;

export type PaginationMeasurementRequest = Readonly<{
  key: string;
  kind: 'full' | 'append';
  geometryRevision: number;
  geometry: ReaderPageGeometry;
  startPassageIndex: number;
  sourcePassageCount: number;
  sources: readonly ReaderSourcePassage[];
  text: string;
  interactionReserve: number;
  bannerReserve: number;
  pagesPerBanner: number;
  restoreAnchor: ReaderSemanticAnchor | null;
  fallbackPageIndex: number;
}>;

type ReaderSourcePassage = Readonly<{
  passageIndex: number;
  text: string;
}>;

type AnchoredMeasuredLine = Readonly<{
  text: string;
  anchor: ReaderSemanticAnchor;
}>;

const EMPTY_PAGES: readonly ReaderPhysicalPage[] = Object.freeze([]);

export function createPagedReaderState(): PagedReaderState {
  return {
    pages: EMPTY_PAGES,
    currentPageIndex: 0,
    geometry: null,
    geometryRevision: 0,
    processedPassageCount: 0,
    restoreAnchor: null,
    fallbackPageIndex: 0,
  };
}

export function resetPagedReaderState(
  state: PagedReaderState,
  restoreAnchor: ReaderSemanticAnchor | null,
  fallbackPageIndex: number,
): PagedReaderState {
  return {
    pages: EMPTY_PAGES,
    currentPageIndex: 0,
    geometry: state.geometry,
    geometryRevision: state.geometryRevision,
    processedPassageCount: 0,
    restoreAnchor,
    fallbackPageIndex: Math.max(0, fallbackPageIndex),
  };
}

export function updatePagedReaderGeometry(
  state: PagedReaderState,
  geometry: ReaderPageGeometry,
): PagedReaderState {
  const normalized = normalizeGeometry(geometry);
  if (state.geometry && sameGeometry(state.geometry, normalized)) {
    return state;
  }

  const currentPage = state.pages[state.currentPageIndex];
  return {
    ...state,
    geometry: normalized,
    geometryRevision: state.geometryRevision + 1,
    restoreAnchor: currentPage?.anchor ?? state.restoreAnchor,
    fallbackPageIndex: currentPage
      ? state.currentPageIndex
      : state.fallbackPageIndex,
  };
}

export function movePagedReaderToPage(
  state: PagedReaderState,
  requestedPageIndex: number,
): PagedReaderState {
  if (state.pages.length === 0) {
    return state;
  }

  const currentPageIndex = clampPageIndex(requestedPageIndex, state.pages.length);
  return currentPageIndex === state.currentPageIndex
    ? state
    : {...state, currentPageIndex};
}

export function planPaginationMeasurement(
  state: PagedReaderState,
  passages: readonly string[],
  interactionReserve: number,
  bannerReserve = 0,
  pagesPerBanner = 0,
): PaginationMeasurementRequest | null {
  if (!state.geometry || passages.length === 0) {
    return null;
  }

  const needsFullPagination =
    state.pages.length === 0 ||
    state.pages.some(page => page.geometryRevision !== state.geometryRevision);
  const startPassageIndex = needsFullPagination
    ? 0
    : state.processedPassageCount;

  if (!needsFullPagination && startPassageIndex >= passages.length) {
    return null;
  }

  const sources = passages
    .map((passage, passageIndex) => ({passageIndex, text: passage.trim()}))
    .filter(
      source =>
        source.passageIndex >= startPassageIndex && source.text.length > 0,
    );

  if (sources.length === 0) {
    return null;
  }

  const measurementSources = sources.filter(
    source => !source.text.startsWith(FORCED_PAGE_BREAK_MARKER),
  );
  if (measurementSources.length === 0) {
    return null;
  }

  const kind = needsFullPagination ? 'full' : 'append';
  const text = measurementSources
    .map(source => measurementPassage(source.text))
    .join('\n');
  const normalizedBannerReserve = Math.max(0, bannerReserve);
  const normalizedPagesPerBanner = Math.max(0, Math.floor(pagesPerBanner));
  const signature = hashText(
    `${kind}\u0000${state.geometryRevision}\u0000${startPassageIndex}\u0000${passages.length}\u0000${normalizedBannerReserve}\u0000${normalizedPagesPerBanner}\u0000${text}`,
  );

  return Object.freeze({
    key: `${kind}:${state.geometryRevision}:${startPassageIndex}:${passages.length}:${signature}`,
    kind,
    geometryRevision: state.geometryRevision,
    geometry: state.geometry,
    startPassageIndex,
    sourcePassageCount: passages.length,
    sources: Object.freeze(sources),
    text,
    interactionReserve: Math.max(0, interactionReserve),
    bannerReserve: normalizedBannerReserve,
    pagesPerBanner: normalizedPagesPerBanner,
    restoreAnchor: state.restoreAnchor,
    fallbackPageIndex: state.fallbackPageIndex,
  });
}

export function commitPaginationMeasurement(
  state: PagedReaderState,
  request: PaginationMeasurementRequest,
  rawLines: readonly string[],
): PagedReaderState {
  if (
    rawLines.length === 0 ||
    request.geometryRevision !== state.geometryRevision ||
    !state.geometry ||
    !sameGeometry(request.geometry, state.geometry)
  ) {
    return state;
  }

  if (
    request.kind === 'append' &&
    request.startPassageIndex !== state.processedPassageCount
  ) {
    return state;
  }

  const measuredLines = attachSemanticAnchors(request.sources, rawLines);
  const pageIndexOffset = request.kind === 'append' ? state.pages.length : 0;
  const measuredPages = paginateMeasuredLines(
    measuredLines,
    request.geometry.height,
    request.interactionReserve,
    request.bannerReserve,
    request.pagesPerBanner,
    request.geometryRevision,
    pageIndexOffset,
  );

  if (measuredPages.length === 0) {
    return state;
  }

  if (request.kind === 'append') {
    const pages = Object.freeze([...state.pages, ...measuredPages]);
    const currentPageIndex = state.pages.length;

    return {
      ...state,
      pages,
      currentPageIndex,
      processedPassageCount: request.sourcePassageCount,
      restoreAnchor: null,
      fallbackPageIndex: currentPageIndex,
    };
  }

  const pages = Object.freeze(measuredPages);
  const currentPageIndex = restorePageIndex(
    pages,
    request.restoreAnchor,
    request.fallbackPageIndex,
  );

  return {
    ...state,
    pages,
    currentPageIndex,
    processedPassageCount: request.sourcePassageCount,
    restoreAnchor: null,
    fallbackPageIndex: currentPageIndex,
  };
}

export function getChoiceReserve(choiceCount: number): number {
  if (choiceCount <= 0) {
    return 0;
  }

  return (
    choiceCount * CHOICE_ROW_RESERVE +
    Math.max(0, choiceCount - 1) * CHOICE_GAP
  );
}

export function indentReaderParagraph(paragraph: string): string {
  return `${PARAGRAPH_INDENT}${paragraph.trim()}`;
}

function normalizeGeometry(geometry: ReaderPageGeometry): ReaderPageGeometry {
  return Object.freeze({
    width: roundGeometryValue(geometry.width),
    height: roundGeometryValue(geometry.height),
    fontScale: roundGeometryValue(geometry.fontScale),
  });
}

function roundGeometryValue(value: number): number {
  return Math.round(Math.max(0, value) * 100) / 100;
}

function sameGeometry(
  left: ReaderPageGeometry,
  right: ReaderPageGeometry,
): boolean {
  return (
    left.width === right.width &&
    left.height === right.height &&
    left.fontScale === right.fontScale
  );
}

function measurementPassage(passage: string): string {
  return indentReaderParagraph(passage);
}

function attachSemanticAnchors(
  sources: readonly ReaderSourcePassage[],
  rawLines: readonly string[],
): readonly AnchoredMeasuredLine[] {
  const lines: AnchoredMeasuredLine[] = [];
  let sourceCursor = 0;
  let currentSource: ReaderSourcePassage | null = null;
  let characterOffset = 0;

  const takeNextNarrativeSource = (): ReaderSourcePassage | null => {
    while (sourceCursor < sources.length) {
      const source = sources[sourceCursor];
      sourceCursor += 1;
      if (!source.text.startsWith(FORCED_PAGE_BREAK_MARKER)) {
        return source;
      }
    }
    return null;
  };

  for (const rawLine of rawLines) {
    const normalized = normalizeMeasuredLine(rawLine);
    const visibleLine = normalized.split(PARAGRAPH_BREAK_MARKER).join('');
    const startsParagraph = visibleLine.startsWith(PARAGRAPH_INDENT);
    if (startsParagraph || currentSource === null) {
      currentSource = takeNextNarrativeSource();
      characterOffset = 0;
    }

    if (!currentSource) {
      continue;
    }

    const anchor = Object.freeze({
      passageIndex: currentSource.passageIndex,
      characterOffset,
    });
    lines.push(Object.freeze({text: normalized, anchor}));

    const lineWithoutIndent = startsParagraph
      ? visibleLine.slice(PARAGRAPH_INDENT.length)
      : visibleLine;
    characterOffset += lineWithoutIndent.trim().length + 1;

    if (normalized.endsWith(PARAGRAPH_BREAK_MARKER)) {
      currentSource = null;
      characterOffset = 0;
    }
  }

  return insertSyntheticPageBreaks(sources, lines);
}

function insertSyntheticPageBreaks(
  sources: readonly ReaderSourcePassage[],
  measuredLines: readonly AnchoredMeasuredLine[],
): readonly AnchoredMeasuredLine[] {
  const breakSources = sources.filter(source =>
    source.text.startsWith(FORCED_PAGE_BREAK_MARKER),
  );
  if (breakSources.length === 0) {
    return Object.freeze([...measuredLines]);
  }

  const merged: AnchoredMeasuredLine[] = [];
  let lineCursor = 0;

  for (const breakSource of breakSources) {
    while (
      lineCursor < measuredLines.length &&
      measuredLines[lineCursor].anchor.passageIndex < breakSource.passageIndex
    ) {
      merged.push(measuredLines[lineCursor]);
      lineCursor += 1;
    }

    merged.push(
      Object.freeze({
        text: breakSource.text,
        anchor: Object.freeze({
          passageIndex: breakSource.passageIndex,
          characterOffset: 0,
        }),
      }),
    );
  }

  while (lineCursor < measuredLines.length) {
    merged.push(measuredLines[lineCursor]);
    lineCursor += 1;
  }

  return Object.freeze(merged);
}

function normalizeMeasuredLine(line: string): string {
  const hasParagraphBreak = /[\r\n]/.test(line);
  const normalized = line.replace(/[\r\n]/g, '');
  return hasParagraphBreak
    ? `${normalized}${PARAGRAPH_BREAK_MARKER}`
    : normalized;
}

function paginateMeasuredLines(
  measuredLines: readonly AnchoredMeasuredLine[],
  pageHeight: number,
  interactionReserve: number,
  bannerReserve: number,
  pagesPerBanner: number,
  geometryRevision: number,
  pageIndexOffset: number,
): readonly ReaderPhysicalPage[] {
  if (measuredLines.length === 0) {
    return EMPTY_PAGES;
  }

  const contentHeight = Math.max(
    STORY_LINE_HEIGHT,
    pageHeight - PAGE_VERTICAL_PADDING,
  );
  const chunks: AnchoredMeasuredLine[][] = [];
  let segmentStart = 0;
  let nextPageIndex = pageIndexOffset;

  for (let index = 0; index < measuredLines.length; index += 1) {
    if (!measuredLines[index].text.includes(FORCED_PAGE_BREAK_MARKER)) {
      continue;
    }

    const segment = measuredLines.slice(segmentStart, index);
    if (segment.length > 0) {
      const segmentPages = paginateTail(
        segment,
        contentHeight,
        getPageBreakReserve(measuredLines[index].text),
        bannerReserve,
        pagesPerBanner,
        nextPageIndex,
      );
      chunks.push(...segmentPages);
      nextPageIndex += segmentPages.length;
    }
    segmentStart = index + 1;
  }

  const tail = measuredLines.slice(segmentStart);
  if (tail.length > 0) {
    const tailPages = paginateTail(
      tail,
      contentHeight,
      interactionReserve,
      bannerReserve,
      pagesPerBanner,
      nextPageIndex,
    );
    chunks.push(...tailPages);
  }

  return Object.freeze(
    chunks.map((chunk, index) =>
      createPhysicalPage(
        chunk,
        pageIndexOffset + index,
        geometryRevision,
      ),
    ),
  );
}

function paginateTail(
  measuredLines: readonly AnchoredMeasuredLine[],
  contentHeight: number,
  interactionReserve: number,
  bannerReserve: number,
  pagesPerBanner: number,
  pageIndexOffset: number,
): AnchoredMeasuredLine[][] {
  if (measuredLines.length === 0) {
    return [];
  }

  const pages: AnchoredMeasuredLine[][] = [];
  let cursor = 0;
  let pageIndex = pageIndexOffset;

  while (cursor < measuredLines.length) {
    const capacity = getPageLineCapacity(
      contentHeight,
      pageIndex,
      bannerReserve,
      pagesPerBanner,
      0,
    );
    const take = chooseNarrativePageTake(measuredLines, cursor, capacity);
    pages.push(measuredLines.slice(cursor, cursor + take));
    cursor += take;
    pageIndex += 1;
  }

  if (interactionReserve <= 0) {
    return pages;
  }

  const lastPageIndex = pageIndexOffset + pages.length - 1;
  const lastPage = pages[pages.length - 1];
  const interactionCapacity = getPageLineCapacity(
    contentHeight,
    lastPageIndex,
    bannerReserve,
    pagesPerBanner,
    interactionReserve,
  );

  if (lastPage.length <= interactionCapacity) {
    return pages;
  }

  const finalLine = measuredLines[measuredLines.length - 1];
  pages.push([
    Object.freeze({
      text: '',
      anchor: Object.freeze({...finalLine.anchor}),
    }),
  ]);
  return pages;
}

function chooseNarrativePageTake(
  lines: readonly AnchoredMeasuredLine[],
  cursor: number,
  capacity: number,
): number {
  const remaining = lines.length - cursor;
  if (remaining <= capacity) {
    return remaining;
  }

  const minimumPreferredTake = Math.max(2, Math.floor(capacity * 0.55));

  for (let take = capacity; take >= minimumPreferredTake; take -= 1) {
    if (isParagraphBoundary(lines, cursor + take)) {
      return take;
    }
  }

  for (let take = capacity; take >= minimumPreferredTake; take -= 1) {
    if (isSentenceBoundary(lines[cursor + take - 1].text)) {
      return take;
    }
  }

  return capacity;
}

function isParagraphBoundary(
  lines: readonly AnchoredMeasuredLine[],
  nextLineIndex: number,
): boolean {
  if (nextLineIndex <= 0 || nextLineIndex >= lines.length) {
    return true;
  }

  return (
    lines[nextLineIndex - 1].anchor.passageIndex !==
    lines[nextLineIndex].anchor.passageIndex
  );
}

function isSentenceBoundary(line: string): boolean {
  const visible = line.split(PARAGRAPH_BREAK_MARKER).join('').trim();
  return /[.!?…](?:["»”')]+)?$/.test(visible);
}

function getPageLineCapacity(
  contentHeight: number,
  pageIndex: number,
  bannerReserve: number,
  pagesPerBanner: number,
  interactionReserve: number,
): number {
  const reservedForBanner = getPageBannerReserve(
    pageIndex,
    bannerReserve,
    pagesPerBanner,
  );
  const reservedForInteraction =
    interactionReserve > 0 ? interactionReserve + PAGE_GAP : 0;
  return Math.max(
    1,
    Math.floor(
      (contentHeight - reservedForBanner - reservedForInteraction) /
        STORY_LINE_HEIGHT,
    ),
  );
}

function getPageBannerReserve(
  pageIndex: number,
  bannerReserve: number,
  pagesPerBanner: number,
): number {
  if (bannerReserve <= 0 || pagesPerBanner <= 0) {
    return 0;
  }

  return (pageIndex + 1) % pagesPerBanner === 0 ? bannerReserve : 0;
}

function createPhysicalPage(
  lines: readonly AnchoredMeasuredLine[],
  pageIndex: number,
  geometryRevision: number,
): ReaderPhysicalPage {
  const anchor = lines[0]?.anchor ?? {passageIndex: 0, characterOffset: 0};
  const paragraphs = Object.freeze(pageLinesToParagraphs(lines.map(line => line.text)));
  const key = `${geometryRevision}:${pageIndex}:${anchor.passageIndex}:${anchor.characterOffset}:${hashText(
    paragraphs.join('\n'),
  )}`;

  return Object.freeze({
    key,
    geometryRevision,
    pageIndex,
    paragraphs,
    anchor: Object.freeze({...anchor}),
  });
}

function pageLinesToParagraphs(lines: readonly string[]): string[] {
  const paragraphs: string[] = [];
  let current = '';

  for (const rawLine of lines) {
    if (rawLine.includes(FORCED_PAGE_BREAK_MARKER)) {
      if (current.length > 0) {
        paragraphs.push(current);
        current = '';
      }
      continue;
    }

    const hasExplicitBreak = rawLine.endsWith(PARAGRAPH_BREAK_MARKER);
    const line = rawLine.split(PARAGRAPH_BREAK_MARKER).join('').trimEnd();

    if (line.length === 0) {
      if (current.length > 0) {
        paragraphs.push(current);
        current = '';
      }
      continue;
    }

    const startsParagraph = line.startsWith(PARAGRAPH_INDENT);
    if (startsParagraph && current.length > 0) {
      paragraphs.push(current);
      current = line;
    } else {
      current = current.length > 0 ? `${current} ${line}` : line;
    }

    if (hasExplicitBreak && current.length > 0) {
      paragraphs.push(current);
      current = '';
    }
  }

  if (current.length > 0) {
    paragraphs.push(current);
  }

  return paragraphs;
}

function getPageBreakReserve(line: string): number {
  const markerIndex = line.indexOf(FORCED_PAGE_BREAK_MARKER);
  if (markerIndex < 0) {
    return 0;
  }

  const suffix = line.slice(markerIndex + FORCED_PAGE_BREAK_MARKER.length);
  const match = /^:(\d+)/.exec(suffix);
  return match ? getChoiceReserve(Number(match[1])) : 0;
}

function restorePageIndex(
  pages: readonly ReaderPhysicalPage[],
  anchor: ReaderSemanticAnchor | null,
  fallbackPageIndex: number,
): number {
  if (pages.length === 0) {
    return 0;
  }

  if (!anchor) {
    return clampPageIndex(fallbackPageIndex, pages.length);
  }

  let candidate = 0;
  for (let index = 0; index < pages.length; index += 1) {
    if (compareReaderSemanticAnchors(pages[index].anchor, anchor) > 0) {
      break;
    }
    candidate = index;
  }
  return candidate;
}

function clampPageIndex(pageIndex: number, pageCount: number): number {
  if (pageCount <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(pageCount - 1, pageIndex));
}

function hashText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

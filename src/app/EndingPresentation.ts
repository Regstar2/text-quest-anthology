import {UI_STRINGS} from '../config/uiStrings';

type EndingOrderEntry = Readonly<{
  id: string;
  sourceIndex: number;
  internalNumber: number | null;
}>;

export function listStoryEndingIds(compiledStory: unknown): readonly string[] {
  let serialized: string;

  try {
    serialized = JSON.stringify(compiledStory) ?? '';
  } catch {
    return [];
  }

  const seen = new Set<string>();
  const endings: EndingOrderEntry[] = [];

  for (const match of serialized.matchAll(/ending:([A-Za-z0-9._-]+)/g)) {
    const id = match[1]?.trim();
    if (!id || seen.has(id)) {
      continue;
    }

    seen.add(id);
    endings.push({
      id,
      sourceIndex: endings.length,
      internalNumber: parseInternalEndingNumber(id),
    });
  }

  endings.sort((left, right) => {
    if (left.internalNumber !== null && right.internalNumber !== null) {
      const numericOrder = left.internalNumber - right.internalNumber;
      if (numericOrder !== 0) {
        return numericOrder;
      }
    } else if (left.internalNumber !== null) {
      return -1;
    } else if (right.internalNumber !== null) {
      return 1;
    }

    return left.sourceIndex - right.sourceIndex;
  });

  return endings.map(ending => ending.id);
}

export function formatEndingDisplay(
  endingId: string | null,
  endingIds: readonly string[],
): string {
  if (!endingId) {
    return UI_STRINGS.endingLabel;
  }

  const normalizedId = endingId.trim();
  const ordinalIndex = endingIds.indexOf(normalizedId);
  const name = formatEndingName(normalizedId);

  if (ordinalIndex >= 0) {
    return `${UI_STRINGS.endingLabel} №${ordinalIndex + 1}${name ? ` · ${name}` : ''}`;
  }

  return name
    ? `${UI_STRINGS.endingLabel} · ${name}`
    : `${UI_STRINGS.endingLabel} · ${normalizedId}`;
}

function parseInternalEndingNumber(endingId: string): number | null {
  const match = /^e(\d+)(?:[_-]|$)/i.exec(endingId);
  if (!match) {
    return null;
  }

  const number = Number(match[1]);
  return Number.isSafeInteger(number) ? number : null;
}

function formatEndingName(endingId: string): string {
  const match = /^e\d+(?:[_-](.+))?$/i.exec(endingId);
  const rawName = match?.[1] ?? '';
  const words = rawName
    .split(/[_-]+/g)
    .map(word => word.trim())
    .filter(Boolean);
  const joinedName = words.join(' ');

  return joinedName
    ? `${joinedName.charAt(0).toUpperCase()}${joinedName.slice(1)}`
    : '';
}

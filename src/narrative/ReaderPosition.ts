export type ReaderSemanticAnchor = Readonly<{
  passageIndex: number;
  characterOffset: number;
}>;

export function isReaderSemanticAnchor(
  value: unknown,
): value is ReaderSemanticAnchor {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.passageIndex === 'number' &&
    Number.isInteger(candidate.passageIndex) &&
    candidate.passageIndex >= 0 &&
    typeof candidate.characterOffset === 'number' &&
    Number.isInteger(candidate.characterOffset) &&
    candidate.characterOffset >= 0
  );
}

export function compareReaderSemanticAnchors(
  left: ReaderSemanticAnchor,
  right: ReaderSemanticAnchor,
): number {
  if (left.passageIndex !== right.passageIndex) {
    return left.passageIndex - right.passageIndex;
  }

  return left.characterOffset - right.characterOffset;
}

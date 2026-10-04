const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

/** Use the exact source saved by current clients; older clients retain the legacy renderer. */
export function readSavedSourceMessage(
  memoryContextJson: string | undefined,
  sourceType: 'entry' | 'checkin',
  sourceCreatedAt?: number,
): string | undefined {
  if (!memoryContextJson) return undefined;
  try {
    const root = asRecord(JSON.parse(memoryContextJson));
    const saved = asRecord(root?.entryResponseContext);
    const message = asRecord(saved?.sourceMessage);
    if (
      root?.protocol !== 'memory_capsules_v2' ||
      saved?.version !== 1 ||
      (saved.sourceType ?? 'entry') !== sourceType ||
      (sourceCreatedAt !== undefined &&
        saved.sourceCreatedAt !== sourceCreatedAt) ||
      message?.role !== 'user' ||
      typeof message.content !== 'string' ||
      !message.content.trim()
    )
      return undefined;
    return message.content;
  } catch {
    return undefined;
  }
}

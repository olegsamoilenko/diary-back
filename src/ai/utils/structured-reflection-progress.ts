export function findPartialJsonStringProperty(
  source: string,
  property: string,
): string | null {
  const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`"${escapedProperty}"\\s*:\\s*"`).exec(source);
  if (!match) return null;

  let result = '';
  for (
    let index = match.index + match[0].length;
    index < source.length;
    index++
  ) {
    const char = source[index];
    if (char === '"') return result;
    if (char !== '\\') {
      result += char;
      continue;
    }

    const escaped = source[index + 1];
    if (!escaped) return result;
    if (escaped === 'u') {
      const hex = source.slice(index + 2, index + 6);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) return result;
      result += String.fromCharCode(Number.parseInt(hex, 16));
      index += 5;
      continue;
    }

    const decoded: Record<string, string> = {
      '"': '"',
      '\\': '\\',
      '/': '/',
      b: '\b',
      f: '\f',
      n: '\n',
      r: '\r',
      t: '\t',
    };
    result += decoded[escaped] ?? escaped;
    index += 1;
  }

  return result;
}

export function createStructuredReflectionProgress(
  onShortTextDelta: (delta: string) => void,
  property = 'shortText',
) {
  let rawJson = '';
  let emittedShortText = '';

  const emitAvailableText = (shortText: string | null) => {
    if (shortText == null || !shortText.startsWith(emittedShortText)) return;
    const delta = shortText.slice(emittedShortText.length);
    if (!delta) return;
    emittedShortText = shortText;
    onShortTextDelta(delta);
  };

  return {
    push(rawChunk: string) {
      rawJson += rawChunk;
      emitAvailableText(findPartialJsonStringProperty(rawJson, property));
    },
    finish(finalJson: string) {
      rawJson = finalJson;
      try {
        const parsed = JSON.parse(finalJson) as Record<string, unknown>;
        emitAvailableText(
          typeof parsed[property] === 'string' ? parsed[property] : null,
        );
      } catch {
        emitAvailableText(findPartialJsonStringProperty(rawJson, property));
      }
    },
  };
}

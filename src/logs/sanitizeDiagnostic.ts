/**
 * Diagnostic projection only; keep both build targets in sync.
 */
export const OMITTED_LOG_VALUE = '[omitted]';

const nativeStackDescriptor = Object.getOwnPropertyDescriptor(
  new Error(),
  'stack',
);

// Free-form diagnostic messages are never classified by their wording.
function diaryField(key: string, parent: string): boolean {
  if (
    /^(?:contenttext|contenthtml|contentdoc|previewhtml|entrytext|entrytitle|diarytext|journaltext|contenttextprompt|usertext)$/.test(
      key,
    )
  )
    return true;
  return (
    /^(?:entry|entries|entrycontent|diary|journal|checkin|checkinpayload|entrydialogs|entrydoc)$/.test(
      parent,
    ) &&
    /^(?:title|body|description|value|message|text|html|content|transcript|plaintext|insert)$/.test(
      key,
    )
  );
}

const credentialField =
  /^(?:.*password|passphrase|passwd|authorization|proxyauthorization|cookie|setcookie|(?:x)?apikey|clientsecret|privatekey|token|accesstoken|refreshtoken|authtoken|idtoken|purchasetoken)$/;

// Credentials are also excluded from third-party telemetry.
function externalMessage(value: string): string {
  return value.replace(
    /(\b(?:bearer|basic)\s+)[A-Za-z0-9._~+/%=-]+/gi,
    '$1[omitted]',
  );
}

/** Preserve custom SDK/driver fields without serializing a live transport or its buffers. */
export function diagnosticErrorExtras(error: unknown): Record<string, unknown> {
  const fields: Record<string, unknown> = Object.create(null) as Record<
    string,
    unknown
  >;
  if (!error || typeof error !== 'object') return fields;
  for (const key of Object.getOwnPropertyNames(error)) {
    if (
      [
        'request',
        'response',
        'config',
        'target',
        'currentTarget',
        'socket',
        'client',
        'agent',
        'message',
        'stack',
        'name',
        'cause',
        'code',
        'constructor',
        '__proto__',
      ].includes(key)
    )
      continue;
    const descriptor = Object.getOwnPropertyDescriptor(error, key);
    if (
      descriptor &&
      'value' in descriptor &&
      typeof descriptor.value !== 'function'
    )
      fields[key] = descriptor.value;
  }
  return fields;
}

/** Stable path used for grouping HTTP incidents. */
export function diagnosticRoute(value: unknown): string {
  if (typeof value !== 'string') return OMITTED_LOG_VALUE;
  const route = value.split(/[?#]/, 1)[0];
  if (/[\\\s%]/.test(route)) return OMITTED_LOG_VALUE;
  if (/^https?:\/\//i.test(route)) {
    const match = route.match(/^https?:\/\/[^/@]+(\/[^?#]*)?$/i);
    return match?.[1] ?? (match ? '/' : OMITTED_LOG_VALUE);
  }
  return /^\/[a-z0-9_./:-]*$/i.test(route) ? route : OMITTED_LOG_VALUE;
}

export function sanitizeDiagnostic(
  value: unknown,
  entryContext?: unknown,
): unknown {
  return projectDiagnostic(value, entryContext, 'log');
}

export function sanitizeExternalDiagnostic(value: unknown): unknown {
  return projectDiagnostic(value, undefined, 'external');
}

export function sanitizeContextAudit(value: unknown): unknown {
  return projectDiagnostic(value, undefined, 'audit');
}

function projectDiagnostic(
  value: unknown,
  privateContext: unknown,
  target: 'log' | 'external' | 'audit',
): unknown {
  const privateValues = new Set<string>();
  const ancestors = new WeakSet<object>();
  let nodes = 0;
  let echoes: string[] = [];

  // Discover private values before projecting the event. An exception can echo
  // a request field in its message, cause or stack, in any property order.
  function walk(
    input: unknown,
    collect: boolean,
    key = '',
    parent = '',
    hidden = false,
    depth = 0,
  ): unknown {
    if (++nodes > 4000 || depth > 24) return '[diagnostic depth or size limit]';
    hidden =
      hidden ||
      diaryField(key, parent) ||
      (typeof input === 'string' &&
        /^(?:entrycontent|diaryentry|journalentry)$/.test(key)) ||
      (target !== 'log' && (credentialField.test(key) || key === 'prompt')) ||
      (target === 'audit' &&
        /^(?:promptjson|messages|data|capsule|memories|embedding)$/.test(key));
    if (!collect && hidden) return OMITTED_LOG_VALUE;
    if (typeof input === 'string') {
      if (collect && hidden && input && input !== OMITTED_LOG_VALUE) {
        privateValues.add(input);
        return;
      }
      // Axios serializes request data; legacy clients can serialize the whole event.
      if (
        [
          '',
          'entry',
          'data',
          'body',
          'payload',
          'requestbody',
          'responsebody',
        ].includes(key) &&
        /^\s*[[{]/.test(input)
      ) {
        if (input.length > 131072) return OMITTED_LOG_VALUE;
        let parsed: unknown;
        try {
          parsed = JSON.parse(input);
        } catch {
          /* SDK labels can start with '['. */
        }
        if (parsed !== undefined)
          return walk(parsed, collect, key, parent, hidden, depth + 1);
      }
      if (collect) return;
      if (input === OMITTED_LOG_VALUE) return input;
      let known = input;
      for (const entryText of echoes) {
        if (known.includes(entryText))
          known = known.split(entryText).join(OMITTED_LOG_VALUE);
      }
      const projected = known.replace(
        /(\b(?:entryText|diaryText|journalText|content[_-]?(?:html|text))["']?\s*[=:]\s*)(\[omitted\]|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\r\n]*)(?=$|[,}\s])/gi,
        '$1[omitted]',
      );
      const clean = target !== 'log' ? externalMessage(projected) : projected;
      return clean.length > 65536 ? clean.slice(0, 65536) + '…' : clean;
    }
    if (input == null || typeof input === 'boolean') return input;
    if (typeof input === 'number') return Number.isFinite(input) ? input : null;
    if (typeof input !== 'object') return OMITTED_LOG_VALUE;
    if (ArrayBuffer.isView(input) || input instanceof ArrayBuffer)
      return { byteLength: input.byteLength };
    if (ancestors.has(input)) return '[circular]';
    ancestors.add(input);
    try {
      const array = Array.isArray(input);
      const result: Record<string, unknown> = {};
      if (input instanceof Error)
        result.name =
          input instanceof TypeError
            ? 'TypeError'
            : input instanceof RangeError
              ? 'RangeError'
              : 'Error';
      const names = Object.getOwnPropertyNames(input);
      const sourceType = Object.getOwnPropertyDescriptor(input, 'sourceType');
      const entryFields =
        names.some((name) =>
          /^(?:content_?(?:text|html|doc)|entry_?kind)$/i.test(name),
        ) ||
        sourceType?.value === 'entry' ||
        sourceType?.value === 'checkin';
      const httpConfig =
        key === 'config' &&
        (names.includes('url') || names.includes('baseURL'));
      for (const name of names) {
        if (nodes >= 4000) {
          result.diagnosticLimit = 'property limit reached';
          break;
        }
        if (httpConfig && (name === 'auth' || name === 'data')) {
          // Outbound bodies are not error details. Inspect an entry body for echoes only.
          if (collect && name === 'data') {
            const body = Object.getOwnPropertyDescriptor(input, name);
            if (body && 'value' in body)
              walk(body.value, true, 'entry', '', false, depth + 1);
          }
          continue;
        }
        // Raw HTTP auth/header values are not part of an exception.
        if (
          (key === 'headers' || key === 'auth') &&
          credentialField.test(name.replace(/[^a-z0-9]/gi, '').toLowerCase())
        )
          continue;

        if (
          ['__proto__', 'prototype', 'constructor', 'toJSON'].includes(name) ||
          (array && !/^\d+$/.test(name))
        )
          continue;
        const descriptor = Object.getOwnPropertyDescriptor(input, name);
        const field = array
          ? key
          : name.replace(/[^a-z0-9]/gi, '').toLowerCase();
        let fieldValue: unknown = OMITTED_LOG_VALUE;
        if (descriptor && 'value' in descriptor) fieldValue = descriptor.value;
        else if (
          !collect &&
          input instanceof Error &&
          name === 'stack' &&
          nativeStackDescriptor?.get &&
          descriptor?.get === nativeStackDescriptor.get
        ) {
          fieldValue = nativeStackDescriptor.get.call(input);
        }
        const child = walk(
          fieldValue,
          collect,
          field,
          array
            ? parent
            : entryFields && (field === 'title' || field === 'text')
              ? 'entry'
              : key,
          hidden,
          depth + 1,
        );
        if (!collect) result[name] = child;
      }
      return array ? Object.values(result) : result;
    } finally {
      ancestors.delete(input);
    }
  }
  try {
    if (privateContext !== undefined) walk(privateContext, true);
    walk(value, true);
    echoes = [...privateValues].sort((a, b) => b.length - a.length);
    nodes = 0;
    return walk(value, false);
  } catch {
    return OMITTED_LOG_VALUE;
  }
}

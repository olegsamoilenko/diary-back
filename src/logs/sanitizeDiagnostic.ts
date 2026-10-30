/**
 * Diagnostic projection only. Never apply this to business requests/responses.
 * Keep identical in diary-front/logging and diary-back/src/logs (separate builds).
 */
export const OMITTED_LOG_VALUE = '[omitted]';

const privateKey =
  /^(?:.*password.*|.*secret.*|.*token|authorization|cookie|setcookie|hash|uuidhash|email|phone|pin|otp|verificationcode|headers|query|params|body|requestbody|responsebody|data|payload|user|profile|account|payment|purchase|prompt.*|.*text|content|html|messages|activescheduledreminders|memories|capsule|embedding|base64|receipt|signature|privatekey)$/i;
const technicalStrings = new Set([
  'name',
  'errorname',
  'code',
  'errorcode',
  'status',
  'method',
  'requestid',
  'component',
  'event',
  'stage',
  'phase',
  'reason',
  'domain',
  'placement',
  'source',
  'kind',
  'type',
  'operation',
  'op',
  'platform',
  'os',
  'osversion',
  'appversion',
  'appbuild',
  'model',
  'aimodel',
  'provider',
  'locale',
  'state',
  'from',
  'to',
  'flow',
  'mode',
  'result',
  'screen',
  'route',
  'action',
  'userid',
  'useruuid',
  'sessionid',
  'id',
  'entryid',
  'checkinid',
  'dialogid',
  'productid',
  'orderid',
  'entitytype',
  'entityid',
  'role',
  'level',
]);
const routeKeys = new Set([
  'url',
  'urlpath',
  'baseurl',
  'path',
  'endpoint',
  'referer',
]);

/** Keep a route, never URL credentials, query, fragment, or arbitrary file paths. */
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

/** Position-only stack: no error message, URL, local filename, or source text. */
function stackPositions(value: unknown): string {
  if (typeof value !== 'string') return OMITTED_LOG_VALUE;
  return (
    value
      .split('\n')
      .filter((line, index) => index > 0 || /^at \d+:\d+$/.test(line))
      .flatMap((line) => {
        const position = line.match(/(?:^at |:)(\d+):(\d+)\)?\s*$/);
        return position ? ['at ' + position[1] + ':' + position[2]] : [];
      })
      .join('\n') || OMITTED_LOG_VALUE
  );
}

export function sanitizeDiagnostic(value: unknown): unknown {
  const ancestors = new WeakSet<object>();
  let nodes = 0;
  const visit = (input: unknown, key = '', depth = 0): unknown => {
    const field = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (privateKey.test(field)) return OMITTED_LOG_VALUE;
    // These bounds protect logging itself, never the operation being diagnosed.
    if (++nodes > 2000 || depth > 20) return OMITTED_LOG_VALUE;
    if (input == null || typeof input === 'boolean') return input;
    if (typeof input === 'number') return Number.isFinite(input) ? input : null;
    if (field === 'stack') return stackPositions(input);
    if (typeof input === 'string') {
      if (input === OMITTED_LOG_VALUE) return input;
      if (routeKeys.has(field)) return diagnosticRoute(input);
      // Stringified Axios data/errors must pass the same projection as objects.
      if (input.length <= 65536 && /^\s*[[{]/.test(input)) {
        try {
          return visit(JSON.parse(input), key, depth + 1);
        } catch {
          return OMITTED_LOG_VALUE;
        }
      }
      return technicalStrings.has(field) &&
        /^[a-z0-9_./:@+-]{1,160}$/i.test(input)
        ? input
        : OMITTED_LOG_VALUE;
    }
    if (typeof input !== 'object') return OMITTED_LOG_VALUE;
    if (ancestors.has(input)) return '[circular]';
    ancestors.add(input);
    try {
      if (Array.isArray(input))
        return input.slice(0, 2000).map((item) => visit(item, key, depth + 1));
      const result: Record<string, unknown> =
        input instanceof Error
          ? {
              name:
                input instanceof TypeError
                  ? 'TypeError'
                  : input instanceof RangeError
                    ? 'RangeError'
                    : 'Error',
            }
          : {};
      // Includes native Error's non-enumerable message/cause/stack. Never invoke
      // toJSON or accessors on an exception: logging must not execute user code.
      for (const name of Object.getOwnPropertyNames(input).slice(0, 2000)) {
        if (['__proto__', 'prototype', 'constructor', 'toJSON'].includes(name))
          continue;
        const descriptor = Object.getOwnPropertyDescriptor(input, name);
        result[name] =
          descriptor && 'value' in descriptor
            ? visit(descriptor.value, name, depth + 1)
            : OMITTED_LOG_VALUE;
      }
      return result;
    } finally {
      ancestors.delete(input);
    }
  };
  try {
    return visit(value);
  } catch {
    return OMITTED_LOG_VALUE;
  }
}

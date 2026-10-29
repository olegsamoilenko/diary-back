import sanitizeHtml from 'sanitize-html';

// Same notification contract as diary-landing/lib/notificationHtml.ts.
// The separately deployed apps share this policy; a compatibility test checks parity.
const options: sanitizeHtml.IOptions = {
  allowedTags: [
    'p',
    'br',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'del',
    'a',
    'ul',
    'ol',
    'li',
    'h1',
    'h2',
    'h3',
    'blockquote',
    'span',
    'img',
    'hr',
    'code',
    'pre',
    'div',
    'label',
    'input',
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    img: ['src', 'alt'],
    span: ['style'],
    p: ['style'],
    h1: ['style'],
    h2: ['style'],
    h3: ['style'],
    blockquote: ['style'],
    ol: ['start'],
    ul: ['data-type'],
    li: ['data-type', 'data-checked'],
    input: ['type', 'checked', 'disabled'],
  },
  allowedStyles: {
    '*': {
      'text-align': [/^(left|right|center|justify)$/],
      color: [
        /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i,
        /^rgb\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*\)$/i,
        /^rgba\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*\)$/i,
      ],
    },
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { img: ['http', 'https'] },
  allowProtocolRelative: false,
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', {
      target: '_blank',
      rel: 'noopener noreferrer',
    }),
    // Tiptap task-list display only: never accept active form controls.
    input: (_tag, attrs) => ({
      tagName: 'input',
      attribs: {
        type: 'checkbox',
        disabled: '',
        ...(Object.prototype.hasOwnProperty.call(attrs, 'checked')
          ? { checked: '' }
          : {}),
      },
    }),
  },
};

export function sanitizeNotificationHtml(html: string): string {
  return sanitizeHtml(html, options);
}

export function sanitizeNotification<
  T extends { translations?: { html: string }[] },
>(note: T): T {
  return {
    ...note,
    ...(note.translations
      ? {
          translations: note.translations.map((translation) => ({
            ...translation,
            html: sanitizeNotificationHtml(translation.html),
          })),
        }
      : {}),
  };
}

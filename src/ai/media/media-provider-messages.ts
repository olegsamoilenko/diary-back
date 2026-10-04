import type { OpenAiMessage } from '../types';
import type { OpenAiExplicitCacheMessage } from '../utils/openai-prompt-cache';

/** Provider conversion comes after resolving IDs and marking text cache boundaries. */
export function openAiMediaMessages(
  messages: OpenAiMessage[],
  marked: OpenAiExplicitCacheMessage[],
) {
  return marked.map((message, index) => {
    const { role, content } = message;
    const images = messages[index].images;
    if (!images?.length) return { role, content };
    const blocks =
      typeof content === 'string'
        ? [{ type: 'text' as const, text: content }]
        : content;
    // A marked text block is the last text BEFORE the images. Move its marker
    // to a trailing text block so the complete attachment is cached as well.
    const last = blocks[blocks.length - 1];
    const breakpoint = last?.prompt_cache_breakpoint;
    return {
      role,
      content: [
        ...blocks.map((block, i) =>
          i === blocks.length - 1 && breakpoint
            ? { type: block.type, text: block.text }
            : block,
        ),
        ...images.flatMap((image) => [
          { type: 'text' as const, text: image.label },
          {
            type: 'image_url' as const,
            image_url: {
              url: `data:image/jpeg;base64,${image.base64}`,
              detail: 'high' as const,
            },
          },
        ]),
        ...(breakpoint
          ? [
              {
                type: 'text' as const,
                text: '[End of attachments]',
                prompt_cache_breakpoint: breakpoint,
              },
            ]
          : []),
      ],
    };
  });
}

/**
 * Markdown → Feishu Rich Text (Post) Builder
 * 
 * Converts markdown to Feishu post format with inline images.
 * Post format: { title, content: [[element, element], [element]] }
 * Each inner array is a paragraph/line.
 */

export interface FeishuPostElement {
  tag: 'text' | 'a' | 'at' | 'img';
  text?: string;
  href?: string;
  user_id?: string;
  image_key?: string;
  width?: number;
  height?: number;
}

export interface FeishuPost {
  zh_cn: {
    title: string;
    content: FeishuPostElement[][];
  };
}

interface ImagePlaceholder {
  placeholder: string;
  originalPath: string;
}

/**
 * Extract image references from markdown
 * Returns list of { placeholder, originalPath } for later replacement
 */
export function extractImageRefs(markdown: string): {
  cleanedMarkdown: string;
  images: ImagePlaceholder[];
} {
  const images: ImagePlaceholder[] = [];
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  let index = 0;

  let cleanedMarkdown = markdown;
  while ((match = imageRegex.exec(markdown)) !== null) {
    const placeholder = `__IMAGE_${index}__`;
    images.push({
      placeholder,
      originalPath: match[2],
    });
    cleanedMarkdown = cleanedMarkdown.replace(match[0], placeholder);
    index++;
  }

  return { cleanedMarkdown, images };
}

/**
 * Convert markdown text to Feishu post elements
 * Handles: **bold**, [links](url), inline code, and image placeholders
 */
function parseInlineElements(
  text: string,
  imageKeyMap: Map<string, string>
): FeishuPostElement[] {
  const elements: FeishuPostElement[] = [];
  
  // Pattern to match: links, image placeholders, or plain text
  const tokenRegex = /(\[([^\]]+)\]\(([^)]+)\))|(__IMAGE_\d+__)|([^[\]_]+)/g;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(text)) !== null) {
    const [full, linkMatch, linkText, linkHref, imagePlaceholder, plainText] = match;

    if (linkMatch) {
      // Link: [text](url)
      elements.push({
        tag: 'a',
        text: linkText,
        href: linkHref,
      });
    } else if (imagePlaceholder) {
      // Image placeholder → resolve to image_key
      const imageKey = imageKeyMap.get(imagePlaceholder);
      if (imageKey) {
        elements.push({
          tag: 'img',
          image_key: imageKey,
        });
      } else {
        // Fallback: show as text if image upload failed
        elements.push({
          tag: 'text',
          text: '[image]',
        });
      }
    } else if (plainText) {
      elements.push({
        tag: 'text',
        text: plainText,
      });
    }
  }

  // If no elements parsed, return the whole text as-is
  if (elements.length === 0 && text.trim()) {
    elements.push({ tag: 'text', text });
  }

  return elements;
}

/**
 * Convert markdown to Feishu post format
 * 
 * @param markdown - Markdown content (images already extracted)
 * @param title - Post title
 * @param imageKeyMap - Map of placeholder → image_key
 */
export function markdownToFeishuPost(
  markdown: string,
  title: string,
  imageKeyMap: Map<string, string> = new Map()
): FeishuPost {
  const lines = markdown.split('\n');
  const content: FeishuPostElement[][] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip empty lines (but preserve as empty paragraph for spacing)
    if (!trimmed) {
      content.push([]);
      continue;
    }

    // Handle headers (convert to bold text)
    if (trimmed.startsWith('#')) {
      const headerMatch = trimmed.match(/^#+\s*(.+)$/);
      if (headerMatch) {
        content.push([{ tag: 'text', text: `【${headerMatch[1]}】` }]);
        continue;
      }
    }

    // Handle list items
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || /^\d+\.\s/.test(trimmed)) {
      const listText = trimmed.replace(/^[-*]\s+/, '• ').replace(/^\d+\.\s+/, (m) => m);
      content.push(parseInlineElements(listText, imageKeyMap));
      continue;
    }

    // Regular paragraph
    content.push(parseInlineElements(trimmed, imageKeyMap));
  }

  return {
    zh_cn: {
      title,
      content,
    },
  };
}

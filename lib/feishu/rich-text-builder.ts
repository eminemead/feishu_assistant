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
 * Handles: **bold**, [links](url), <at user_id="...">@Name</at>, inline code, and image placeholders
 */
function parseInlineElements(
  text: string,
  imageKeyMap: Map<string, string>
): FeishuPostElement[] {
  const elements: FeishuPostElement[] = [];
  
  // Tokenize: at mentions, links, bold, image placeholders, plain text
  // Order matters: more specific patterns first
  const tokenRegex = /(<at\s+user_id="([^"]+)"[^>]*>([^<]*)<\/at>)|(\[([^\]]+)\]\(([^)]+)\))|(\*\*([^*]+)\*\*)|(__IMAGE_\d+__)/g;
  
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(text)) !== null) {
    // Add plain text before this match
    if (match.index > lastIndex) {
      const plain = text.slice(lastIndex, match.index);
      if (plain) {
        elements.push({ tag: 'text', text: plain });
      }
    }
    
    const [full, atMatch, atUserId, atName, linkMatch, linkText, linkHref, boldMatch, boldText, imagePlaceholder] = match;

    if (atMatch) {
      // At mention: <at user_id="ou_xxx">@Name</at>
      elements.push({
        tag: 'at',
        user_id: atUserId,
      });
    } else if (linkMatch) {
      // Link: [text](url)
      elements.push({
        tag: 'a',
        text: linkText,
        href: linkHref,
      });
    } else if (boldMatch) {
      // Bold: **text** → Feishu doesn't have bold in post, use【】to emphasize
      elements.push({
        tag: 'text',
        text: boldText,
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
        elements.push({
          tag: 'text',
          text: '[image]',
        });
      }
    }
    
    lastIndex = match.index + full.length;
  }

  // Add remaining plain text after last match
  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex);
    if (remaining) {
      elements.push({ tag: 'text', text: remaining });
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
    
    // Empty lines → add a blank line with a single space for Feishu spacing
    if (!trimmed) {
      content.push([{ tag: 'text', text: ' ' }]);
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

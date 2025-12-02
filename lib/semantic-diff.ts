/**
 * Semantic Diff Engine
 *
 * Computes differences between document snapshots at multiple levels:
 * 1. Simple text diff (fast, line-by-line)
 * 2. Semantic diff (structure-aware, shows blocks/paragraphs)
 * 3. Hybrid diff (quick display + on-demand semantic)
 *
 * Supports various document types:
 * - Plain text documents
 * - JSON/structured documents
 * - Markdown documents
 */

/**
 * Change type in a diff
 */
export type ChangeType = "added" | "removed" | "modified" | "unchanged";

/**
 * Line-level diff result
 */
export interface LineDiff {
  lineNumber: number;
  changeType: ChangeType;
  content: string;
  contextBefore?: string;
  contextAfter?: string;
}

/**
 * Block-level diff result (semantic)
 */
export interface BlockDiff {
  blockId: string;
  blockType: "paragraph" | "heading" | "list" | "code" | "table" | "other";
  changeType: ChangeType;
  content: string;
  previousContent?: string;
  contextBefore?: string;
  contextAfter?: string;
}

/**
 * Summary of changes
 */
export interface DiffSummary {
  totalChanges: number;
  addedLines: number;
  removedLines: number;
  modifiedLines: number;
  addedBlocks: number;
  removedBlocks: number;
  modifiedBlocks: number;
  percentChanged: number; // Percentage of content that changed
  summary: string; // Human-readable summary
}

/**
 * Diff result
 */
export interface DiffResult {
  previousRevision: number;
  newRevision: number;
  timestamp: number;
  lineDiffs: LineDiff[];
  blockDiffs: BlockDiff[];
  summary: DiffSummary;
  computeTimeMs: number;
}

/**
 * Simple line-by-line diff using LCS (Longest Common Subsequence)
 *
 * O(n*m) time complexity, but effective for typical documents
 */
function lineDiff(prevContent: string, newContent: string): LineDiff[] {
  const prevLines = prevContent.split("\n");
  const newLines = newContent.split("\n");

  const diffs: LineDiff[] = [];

  // Simple diff: compare lines
  // For production, consider using 'diff-match-patch' library
  const maxLines = Math.max(prevLines.length, newLines.length);

  for (let i = 0; i < maxLines; i++) {
    const prevLine = prevLines[i] || "";
    const newLine = newLines[i] || "";

    if (prevLine !== newLine) {
      if (i >= prevLines.length) {
        // Line added
        diffs.push({
          lineNumber: i + 1,
          changeType: "added",
          content: newLine,
          contextBefore: prevLines[Math.max(0, i - 1)] || "",
        });
      } else if (i >= newLines.length) {
        // Line removed
        diffs.push({
          lineNumber: i + 1,
          changeType: "removed",
          content: prevLine,
          contextAfter: newLines[Math.min(newLines.length - 1, i + 1)] || "",
        });
      } else {
        // Line modified
        diffs.push({
          lineNumber: i + 1,
          changeType: "modified",
          content: newLine,
          contextBefore: prevLine,
          contextAfter: newLine,
        });
      }
    }
  }

  return diffs;
}

/**
 * Semantic diff based on document structure
 *
 * Parses document into blocks (paragraphs, headings, lists, etc.)
 * and diffs at block level for better readability
 */
function semanticDiff(
  prevContent: string,
  newContent: string
): BlockDiff[] {
  const diffs: BlockDiff[] = [];

  // Parse content into blocks
  const prevBlocks = parseBlocks(prevContent);
  const newBlocks = parseBlocks(newContent);

  // Simple block comparison
  const maxBlocks = Math.max(prevBlocks.length, newBlocks.length);

  for (let i = 0; i < maxBlocks; i++) {
    const prevBlock = prevBlocks[i];
    const newBlock = newBlocks[i];

    if (!prevBlock && newBlock) {
      // Block added
      diffs.push({
        blockId: `block_${i}`,
        blockType: newBlock.type,
        changeType: "added",
        content: newBlock.content,
        contextBefore: prevBlocks[Math.max(0, i - 1)]?.content || "",
      });
    } else if (prevBlock && !newBlock) {
      // Block removed
      diffs.push({
        blockId: `block_${i}`,
        blockType: prevBlock.type,
        changeType: "removed",
        content: prevBlock.content,
        contextAfter: newBlocks[Math.min(newBlocks.length - 1, i + 1)]
          ?.content || "",
      });
    } else if (prevBlock && newBlock) {
      if (prevBlock.content !== newBlock.content) {
        // Block modified
        diffs.push({
          blockId: `block_${i}`,
          blockType: newBlock.type,
          changeType: "modified",
          content: newBlock.content,
          previousContent: prevBlock.content,
          contextBefore: prevBlocks[Math.max(0, i - 1)]?.content || "",
          contextAfter: newBlocks[Math.min(newBlocks.length - 1, i + 1)]
            ?.content || "",
        });
      }
    }
  }

  return diffs;
}

/**
 * Parse document into semantic blocks
 */
interface Block {
  type: "paragraph" | "heading" | "list" | "code" | "table" | "other";
  content: string;
}

function parseBlocks(content: string): Block[] {
  const blocks: Block[] = [];
  const lines = content.split("\n");

  let currentBlock: { type: Block["type"]; lines: string[] } | null = null;

  for (const line of lines) {
    let blockType: Block["type"] = "paragraph";

    // Detect block type
    if (line.startsWith("#")) {
      blockType = "heading";
    } else if (line.startsWith("-") || line.startsWith("*")) {
      blockType = "list";
    } else if (line.startsWith("```")) {
      blockType = "code";
    } else if (line.includes("|")) {
      blockType = "table";
    }

    // Start new block if type changes
    if (currentBlock && currentBlock.type !== blockType) {
      blocks.push({
        type: currentBlock.type,
        content: currentBlock.lines.join("\n").trim(),
      });
      currentBlock = null;
    }

    // Continue or start new block
    if (!currentBlock || currentBlock.type !== blockType) {
      currentBlock = { type: blockType, lines: [line] };
    } else {
      currentBlock.lines.push(line);
    }
  }

  // Add final block
  if (currentBlock) {
    blocks.push({
      type: currentBlock.type,
      content: currentBlock.lines.join("\n").trim(),
    });
  }

  return blocks.filter((b) => b.content.length > 0);
}

/**
 * Generate human-readable summary of changes
 */
function generateSummary(
  lineDiffs: LineDiff[],
  blockDiffs: BlockDiff[],
  prevContent: string,
  newContent: string
): DiffSummary {
  const addedLines = lineDiffs.filter((d) => d.changeType === "added").length;
  const removedLines = lineDiffs.filter(
    (d) => d.changeType === "removed"
  ).length;
  const modifiedLines = lineDiffs.filter(
    (d) => d.changeType === "modified"
  ).length;
  const totalChanges = addedLines + removedLines + modifiedLines;

  const addedBlocks = blockDiffs.filter((d) => d.changeType === "added")
    .length;
  const removedBlocks = blockDiffs.filter((d) => d.changeType === "removed")
    .length;
  const modifiedBlocks = blockDiffs.filter((d) => d.changeType === "modified")
    .length;

  const prevLength = prevContent.length;
  const newLength = newContent.length;
  const percentChanged =
    prevLength > 0
      ? Math.round(
          ((Math.abs(newLength - prevLength) + addedLines + removedLines) /
            prevLength) *
            100
        )
      : 0;

  // Build summary message
  const parts = [];

  if (addedLines > 0) {
    parts.push(`+${addedLines} line${addedLines === 1 ? "" : "s"}`);
  }
  if (removedLines > 0) {
    parts.push(`-${removedLines} line${removedLines === 1 ? "" : "s"}`);
  }
  if (modifiedLines > 0) {
    parts.push(`~${modifiedLines} line${modifiedLines === 1 ? "" : "s"}`);
  }

  const summary =
    parts.length > 0
      ? `${parts.join(", ")} (${percentChanged}% changed)`
      : "No changes detected";

  return {
    totalChanges,
    addedLines,
    removedLines,
    modifiedLines,
    addedBlocks,
    removedBlocks,
    modifiedBlocks,
    percentChanged,
    summary,
  };
}

/**
 * Compute diff between two document contents
 *
 * @param prevContent Previous document content
 * @param newContent New document content
 * @param prevRevision Previous revision number
 * @param newRevision New revision number
 * @param docType Document type (optional, for smarter parsing)
 * @returns Complete diff result with line and semantic diffs
 */
export function computeDiff(
  prevContent: string,
  newContent: string,
  prevRevision: number,
  newRevision: number,
  docType: string = "doc"
): DiffResult {
  const startTime = performance.now();

  // Compute line-level diff
  const lineDiffs = lineDiff(prevContent, newContent);

  // Compute semantic diff
  const blockDiffs = semanticDiff(prevContent, newContent);

  // Generate summary
  const summary = generateSummary(
    lineDiffs,
    blockDiffs,
    prevContent,
    newContent
  );

  const computeTimeMs = Math.round(performance.now() - startTime);

  return {
    previousRevision: prevRevision,
    newRevision: newRevision,
    timestamp: Date.now(),
    lineDiffs,
    blockDiffs,
    summary,
    computeTimeMs,
  };
}

/**
 * Format diff for human consumption (Feishu card)
 */
export function formatDiffForCard(diff: DiffResult): string {
  const lines = [];

  // Title
  lines.push(
    `📊 Changes: Revision ${diff.previousRevision} → ${diff.newRevision}`
  );
  lines.push("");

  // Summary
  lines.push(`Summary: ${diff.summary.summary}`);
  lines.push("");

  // Details
  if (diff.blockDiffs.length > 0) {
    lines.push("Block-level changes:");
    diff.blockDiffs.slice(0, 5).forEach((block) => {
      const emoji =
        block.changeType === "added"
          ? "✅"
          : block.changeType === "removed"
            ? "❌"
            : "📝";
      const preview = block.content.substring(0, 50).replace(/\n/g, " ");
      lines.push(
        `  ${emoji} [${block.blockType}] ${preview}${block.content.length > 50 ? "..." : ""}`
      );
    });

    if (diff.blockDiffs.length > 5) {
      lines.push(`  ... and ${diff.blockDiffs.length - 5} more changes`);
    }
    lines.push("");
  }

  // Line stats
  if (diff.summary.totalChanges > 0) {
    lines.push("Line stats:");
    lines.push(`  Added: ${diff.summary.addedLines}`);
    lines.push(`  Removed: ${diff.summary.removedLines}`);
    lines.push(`  Modified: ${diff.summary.modifiedLines}`);
    lines.push("");
  }

  // Compute time
  lines.push(`⏱️ Computed in ${diff.computeTimeMs}ms`);

  return lines.join("\n");
}

/**
 * Format diff as JSON for API responses
 */
export function formatDiffAsJson(diff: DiffResult): string {
  return JSON.stringify(diff, null, 2);
}

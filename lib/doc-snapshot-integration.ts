/**
 * Document Snapshot Integration
 *
 * Integrates snapshot and diff functionality with existing polling and persistence layers.
 * Wires snapshot creation into change detection, provides history queries, and manages
 * the complete workflow of capturing and analyzing document changes.
 */

import { getSnapshotService, setSnapshotUserId } from "./doc-snapshots";
import { computeDiff, formatDiffForCard } from "./semantic-diff";
import { getPersistence, setPersistenceUserId } from "./doc-persistence";
import { getFeishuClient } from "./feishu-utils";

/**
 * Snapshot integration options
 */
export interface SnapshotIntegrationConfig {
  enableAutoSnapshot: boolean; // Auto-capture on detected changes
  enableSemanticDiff: boolean; // Compute semantic diffs
  maxSnapshots: number; // Max snapshots to keep per document
  diffComputeTimeout: number; // Timeout for diff computation (ms)
}

const DEFAULT_CONFIG: SnapshotIntegrationConfig = {
  enableAutoSnapshot: true,
  enableSemanticDiff: true,
  maxSnapshots: 50,
  diffComputeTimeout: 5000,
};

/**
 * Handle snapshot creation after change detection
 *
 * Called by doc-poller.ts when a document change is detected.
 * This will:
 * 1. Download current document content from Feishu
 * 2. Store snapshot with compression
 * 3. Schedule diff computation if previous snapshot exists
 */
export async function handleChangeDetectedSnapshot(
  docToken: string,
  docType: string,
  metadata: {
    lastModifiedUser: string;
    lastModifiedTime: number;
    title?: string;
  },
  config: Partial<SnapshotIntegrationConfig> = {}
): Promise<void> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  if (!fullConfig.enableAutoSnapshot) {
    return; // Snapshots disabled
  }

  try {
    // Download document content from Feishu
    const content = await downloadDocumentContent(docToken, docType);
    if (!content) {
      console.warn(
        `⚠️  [SnapshotIntegration] Could not download content for ${docToken}, skipping snapshot`
      );
      return;
    }

    // Create snapshot
    const snapshot = await getSnapshotService().createSnapshot(
      docToken,
      content,
      {
        revisionNumber: Math.floor(metadata.lastModifiedTime / 1000),
        modifiedBy: metadata.lastModifiedUser,
        modifiedAt: metadata.lastModifiedTime,
        docType,
      }
    );

    if (!snapshot) {
      console.log(
        `ℹ️  [SnapshotIntegration] Snapshot not eligible for ${docToken} (size/type/compression)`
      );
      return;
    }

    // Schedule diff computation if we have previous snapshot
    if (fullConfig.enableSemanticDiff) {
      // Get previous snapshot asynchronously (don't block)
      computeDiffWithPrevious(docToken, snapshot, content, fullConfig).catch(
        (error) => {
          console.error(
            `❌ [SnapshotIntegration] Failed to compute diff for ${docToken}:`,
            error
          );
        }
      );
    }
  } catch (error) {
    console.error(
      `❌ [SnapshotIntegration] Failed to handle snapshot for ${docToken}:`,
      error
    );
  }
}

/**
 * Compute diff with previous snapshot and store result
 */
async function computeDiffWithPrevious(
  docToken: string,
  currentSnapshot: any,
  currentContent: string,
  config: SnapshotIntegrationConfig
): Promise<void> {
  try {
    // Get previous snapshot (second most recent)
    const snapshots = await getSnapshotService().getSnapshotHistory(
      docToken,
      2
    );

    if (snapshots.length < 2) {
      // No previous snapshot, nothing to diff against
      return;
    }

    const prevSnapshot = snapshots[1]; // Second item is previous

    // Get previous content
    const prevContent = await getSnapshotService().getSnapshotContent(
      docToken,
      prevSnapshot.revisionNumber
    );

    if (!prevContent) {
      console.warn(
        `⚠️  [SnapshotIntegration] Could not retrieve previous content for ${docToken}`
      );
      return;
    }

    // Compute diff with timeout
    const diffPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Diff computation timeout"));
      }, config.diffComputeTimeout);

      try {
        const result = computeDiff(
          prevContent,
          currentContent,
          prevSnapshot.revisionNumber,
          currentSnapshot.revisionNumber
        );
        clearTimeout(timeout);
        resolve(result);
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });

    const diff = await diffPromise;

    console.log(
      `✅ [SnapshotIntegration] Computed diff for ${docToken}: ${(diff as any).summary.summary}`
    );

    // Store diff result in persistence metadata
    const persistence = getPersistence();
    const changes = await persistence.getChangeHistory(docToken, 1);

    if (changes.length > 0) {
      // Update most recent change with diff result
      // Note: This would require adding diff storage to document_changes table
      // For now, just log the summary
      console.log(
        `📊 [SnapshotIntegration] Diff summary for ${docToken}: ${(diff as any).summary.summary}`
      );
    }
  } catch (error) {
    console.error(
      `❌ [SnapshotIntegration] Error computing diff for ${docToken}:`,
      error
    );
  }
}

/**
 * Get change history with diffs
 *
 * Returns snapshots with computed diffs between consecutive versions
 */
export async function getChangeHistoryWithDiffs(
  docToken: string,
  limit: number = 10
): Promise<any[]> {
  try {
    const snapshots = await getSnapshotService().getSnapshotHistory(
      docToken,
      limit + 1 // Get one extra to compute diff for the oldest one
    );

    const result = [];

    // Process snapshots in reverse (oldest to newest)
    for (let i = snapshots.length - 1; i >= 1; i--) {
      const prevSnapshot = snapshots[i];
      const currentSnapshot = snapshots[i - 1];

      // Get content for diff
      const prevContent = await getSnapshotService().getSnapshotContent(
        docToken,
        prevSnapshot.revisionNumber
      );
      const currentContent = await getSnapshotService().getSnapshotContent(
        docToken,
        currentSnapshot.revisionNumber
      );

      if (prevContent && currentContent) {
        const diff = computeDiff(
          prevContent,
          currentContent,
          prevSnapshot.revisionNumber,
          currentSnapshot.revisionNumber
        );

        result.push({
          snapshot: currentSnapshot,
          diff,
          diffSummary: diff.summary.summary,
        });
      } else {
        result.push({
          snapshot: currentSnapshot,
          diff: null,
          diffSummary: "Unable to compute diff",
        });
      }
    }

    return result.slice(0, limit); // Return requested limit
  } catch (error) {
    console.error(
      `❌ [SnapshotIntegration] Failed to get change history with diffs for ${docToken}:`,
      error
    );
    throw error;
  }
}

/**
 * Download document content from Feishu
 *
 * Supports different document types with appropriate APIs
 */
async function downloadDocumentContent(
  docToken: string,
  docType: string
): Promise<string | null> {
  try {
    const client = getFeishuClient();

    switch (docType) {
      case "doc":
      case "docx":
        // Use docs API to get raw content
        return await downloadDocContent(client, docToken);

      case "sheet":
        // Use sheet API
        return await downloadSheetContent(client, docToken);

      case "bitable":
        // Use bitable API
        return await downloadBitableContent(client, docToken);

      default:
        console.warn(
          `⚠️  [SnapshotIntegration] Unknown document type: ${docType}`
        );
        return null;
    }
  } catch (error) {
    console.error(
      `❌ [SnapshotIntegration] Failed to download content for ${docToken}:`,
      error
    );
    return null;
  }
}

/**
 * Download document (doc/docx) content
 *
 * Uses Feishu doc.v2.rawContent() API to get plain text representation
 */
async function downloadDocContent(client: any, docToken: string): Promise<string | null> {
  try {
    // Try rawContent first (plain text, better for snapshots)
    let resp = await client.doc.v2.rawContent({
      params: {
        doc_token: docToken,
      },
    });

    const isSuccess =
      typeof resp.success === "function" ? resp.success() : resp.code === 0;

    if (isSuccess && resp.data?.content) {
      console.log(
        `📥 [SnapshotIntegration] Downloaded doc content for ${docToken} (${resp.data.content.length} bytes)`
      );
      return resp.data.content;
    }

    // Fallback: try rich content API
    console.log(
      `⚠️  [SnapshotIntegration] rawContent failed for ${docToken}, trying content API`
    );

    resp = await client.doc.v2.content({
      params: {
        doc_token: docToken,
      },
    });

    const richSuccess =
      typeof resp.success === "function" ? resp.success() : resp.code === 0;

    if (richSuccess && resp.data?.document) {
      const document = resp.data.document;
      // Convert rich content to JSON for storage
      const snapshot = {
        title: document.title,
        revision: document.revision,
        content: document.body?.content || [],
        documentId: document.document_id,
      };

      console.log(
        `📥 [SnapshotIntegration] Downloaded doc rich content for ${docToken} (${JSON.stringify(snapshot).length} bytes)`
      );
      return JSON.stringify(snapshot, null, 2);
    }

    console.error(
      `❌ [SnapshotIntegration] Failed to get doc content for ${docToken}: ${JSON.stringify(resp)}`
    );
    return null;
  } catch (error) {
    console.error(
      `❌ [SnapshotIntegration] Failed to download doc content for ${docToken}:`,
      error
    );
    return null;
  }
}

/**
 * Download sheet content
 *
 * Gets all sheets and their values, returns as JSON snapshot
 */
async function downloadSheetContent(client: any, docToken: string): Promise<string | null> {
  try {
    // Get spreadsheet metadata
    const metaResp = await client.sheet.spreadsheet.get({
      params: {
        spreadsheetToken: docToken,
      },
    });

    const metaSuccess =
      typeof metaResp.success === "function"
        ? metaResp.success()
        : metaResp.code === 0;

    if (!metaSuccess) {
      console.error(
        `❌ [SnapshotIntegration] Failed to get sheet metadata for ${docToken}`
      );
      return null;
    }

    const spreadsheet = metaResp.data?.spreadsheet;
    if (!spreadsheet) {
      return null;
    }

    // Get all sheet tokens
    const sheets = spreadsheet.sheets || [];
    const sheetData: Record<string, any> = {
      title: spreadsheet.title,
      spreadsheetToken: docToken,
      sheets: {},
    };

    // Fetch data for each sheet
    for (const sheet of sheets) {
      const sheetToken = sheet.sheet_id;
      const sheetName = sheet.title;

      try {
        // Get all values for this sheet
        const valuesResp = await client.sheet.spreadsheet.values({
          params: {
            spreadsheetToken: docToken,
            range: `${sheetToken}`, // Empty range = all data
          },
        });

        const valSuccess =
          typeof valuesResp.success === "function"
            ? valuesResp.success()
            : valuesResp.code === 0;

        if (valSuccess && valuesResp.data?.valueRange) {
          sheetData.sheets[sheetName] = {
            sheetId: sheetToken,
            values: valuesResp.data.valueRange.values || [],
            rowCount: sheet.grid_properties?.row_count || 0,
            columnCount: sheet.grid_properties?.column_count || 0,
          };
        }
      } catch (error) {
        console.warn(
          `⚠️  [SnapshotIntegration] Failed to get values for sheet ${sheetName}:`,
          error
        );
        // Continue with other sheets
      }
    }

    console.log(
      `📥 [SnapshotIntegration] Downloaded sheet content for ${docToken} (${JSON.stringify(sheetData).length} bytes)`
    );
    return JSON.stringify(sheetData, null, 2);
  } catch (error) {
    console.error(
      `❌ [SnapshotIntegration] Failed to download sheet content for ${docToken}:`,
      error
    );
    return null;
  }
}

/**
 * Download bitable (base/table) content
 *
 * Gets all tables and their records, returns as JSON snapshot
 */
async function downloadBitableContent(client: any, docToken: string): Promise<string | null> {
  try {
    // Get all tables (tables) in the bitable
    const tablesResp = await client.bitable.v1.app.table.list({
      params: {
        app_token: docToken,
        page_size: 100, // Max per page
      },
    });

    const tablesSuccess =
      typeof tablesResp.success === "function"
        ? tablesResp.success()
        : tablesResp.code === 0;

    if (!tablesSuccess) {
      console.error(
        `❌ [SnapshotIntegration] Failed to get bitable tables for ${docToken}`
      );
      return null;
    }

    const bitableData: Record<string, any> = {
      appToken: docToken,
      tables: {},
    };

    const items = tablesResp.data?.items || [];

    // Fetch data for each table
    for (const table of items) {
      const tableId = table.table_id;
      const tableName = table.name;

      try {
        // Get all records from this table
        const recordsResp = await client.bitable.v1.app.table.record.list({
          params: {
            app_token: docToken,
            table_id: tableId,
            page_size: 100,
          },
        });

        const recSuccess =
          typeof recordsResp.success === "function"
            ? recordsResp.success()
            : recordsResp.code === 0;

        if (recSuccess && recordsResp.data?.items) {
          bitableData.tables[tableName] = {
            tableId: tableId,
            recordCount: recordsResp.data.items.length,
            records: recordsResp.data.items.map((rec: any) => ({
              recordId: rec.record_id,
              fields: rec.fields,
            })),
          };
        }
      } catch (error) {
        console.warn(
          `⚠️  [SnapshotIntegration] Failed to get records for table ${tableName}:`,
          error
        );
        // Continue with other tables
      }
    }

    console.log(
      `📥 [SnapshotIntegration] Downloaded bitable content for ${docToken} (${JSON.stringify(bitableData).length} bytes)`
    );
    return JSON.stringify(bitableData, null, 2);
  } catch (error) {
    console.error(
      `❌ [SnapshotIntegration] Failed to download bitable content for ${docToken}:`,
      error
    );
    return null;
  }
}

/**
 * Initialize snapshot system with user ID
 */
export function initializeSnapshotSystem(userId: string): void {
  setSnapshotUserId(userId);
  setPersistenceUserId(userId);
  console.log(`✅ [SnapshotIntegration] Initialized with user ${userId}`);
}

/**
 * Get snapshot statistics for a document
 */
export async function getDocumentSnapshotStats(docToken: string): Promise<any> {
  try {
    const stats = await getSnapshotService().getSnapshotStats(docToken);
    return {
      docToken,
      ...stats,
      statusMessage: `${stats.totalSnapshots} snapshots, average compression ${stats.averageCompressionRatio.toFixed(2)}x`,
    };
  } catch (error) {
    console.error(
      `❌ [SnapshotIntegration] Failed to get stats for ${docToken}:`,
      error
    );
    throw error;
  }
}

/**
 * Clean up old snapshots beyond retention window
 */
export async function pruneExpiredSnapshots(
  docToken?: string
): Promise<number> {
  try {
    const pruned = await getSnapshotService().pruneOldSnapshots(docToken);
    console.log(
      `✅ [SnapshotIntegration] Pruned ${pruned} expired snapshot${pruned === 1 ? "" : "s"}`
    );
    return pruned;
  } catch (error) {
    console.error(
      `❌ [SnapshotIntegration] Failed to prune expired snapshots:`,
      error
    );
    throw error;
  }
}

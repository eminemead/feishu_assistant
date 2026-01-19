export const BROWSER_APPROVAL_WORKFLOW_ID = "browser-approval";
export const BROWSER_APPROVAL_CONFIRM_PREFIX = "__browser_approval_confirm__:";
export const BROWSER_APPROVAL_CANCEL_PREFIX = "__browser_approval_cancel__";

/**
 * Matches approval URLs:
 * - groot.nio.com/wf3/lark/approve/... — data table permission requests
 * - workflow.niohome.com/src/html/approve.html?... — PTO/sick leave requests
 */
export const BROWSER_APPROVAL_URL_REGEX =
  /https?:\/\/(?:groot\.nio\.com\/wf3\/lark\/approve\/[^\s]+|workflow\.niohome\.com\/src\/html\/approve\.html\?[^\s]+)/i;

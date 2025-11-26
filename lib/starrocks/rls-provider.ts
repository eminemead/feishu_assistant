import type { UserDataScope } from '../auth/types';
import { queryStarrocks, hasStarrocksConfig } from './client';
import { feishuIdToEmpAccount } from '../auth/feishu-account-mapping';

const DEFAULT_TABLE = 'evidence_rls_1d_a';
const DEFAULT_ACCOUNT_COLUMN = 'emp_ad_account';
const DEFAULT_ACCOUNTS_COLUMN = 'project_code';
const DEFAULT_DEPARTMENTS_COLUMN = '';
const DEFAULT_REGIONS_COLUMN = 'region_name';

const TABLE_NAME = sanitizeIdentifier(
  process.env.STARROCKS_RLS_TABLE || DEFAULT_TABLE,
  DEFAULT_TABLE,
);
const ACCOUNT_COLUMN = sanitizeIdentifier(
  process.env.STARROCKS_RLS_ACCOUNT_COLUMN || DEFAULT_ACCOUNT_COLUMN,
  DEFAULT_ACCOUNT_COLUMN,
);
const ACCOUNTS_COLUMN = sanitizeIdentifier(
  process.env.STARROCKS_RLS_ACCOUNTS_COLUMN || DEFAULT_ACCOUNTS_COLUMN,
  DEFAULT_ACCOUNTS_COLUMN,
);
const DEPARTMENTS_COLUMN = sanitizeIdentifier(
  process.env.STARROCKS_RLS_DEPARTMENTS_COLUMN || DEFAULT_DEPARTMENTS_COLUMN,
  DEFAULT_DEPARTMENTS_COLUMN,
);
const REGIONS_COLUMN = sanitizeIdentifier(
  process.env.STARROCKS_RLS_REGIONS_COLUMN || DEFAULT_REGIONS_COLUMN,
  DEFAULT_REGIONS_COLUMN,
);

function sanitizeIdentifier(value: string, fallback: string): string {
  if (!value) return '';
  return /^[A-Za-z0-9_]+$/.test(value) ? value : fallback;
}

function columnExpression(column: string, alias: string): string {
  if (!column) {
    return `NULL AS ${alias}`;
  }
  return `${column} AS ${alias}`;
}

type RlsRow = Record<string, any>;

function parseList(value: any): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  const text = String(value).trim();
  if (!text) return [];

  if ((text.startsWith('[') && text.endsWith(']')) || (text.startsWith('"') && text.endsWith('"'))) {
    try {
      const parsed = JSON.parse(text);
      return parseList(parsed);
    } catch {
      // fall through to comma split
    }
  }

  return text
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function getStarrocksUserScope(feishuUserId: string): Promise<UserDataScope | null> {
  if (!hasStarrocksConfig()) {
    return null;
  }

  const empAccount = feishuIdToEmpAccount(feishuUserId);
  if (!empAccount) {
    console.warn(`⚠️ [StarRocks] Unable to derive emp_ad_account from Feishu ID: ${feishuUserId}`);
    return null;
  }

  // Query all rows for this emp_ad_account (may have multiple project_code/region_name combinations)
  const sql = `
    SELECT 
      ${ACCOUNTS_COLUMN ? ACCOUNTS_COLUMN : 'NULL'} AS project_code,
      ${REGIONS_COLUMN ? REGIONS_COLUMN : 'NULL'} AS region_name
    FROM ${TABLE_NAME}
    WHERE ${ACCOUNT_COLUMN} = ?
  `;

  try {
    const rows = await queryStarrocks<RlsRow>(sql, [empAccount]);
    if (!rows.length) {
      console.log(`ℹ️ [StarRocks] No RLS rows for emp_ad_account=${empAccount}`);
      return null;
    }

    // Aggregate distinct values from all rows
    const accounts = new Set<string>();
    const regions = new Set<string>();

    for (const row of rows) {
      if (row.project_code) {
        const codes = parseList(row.project_code);
        codes.forEach(code => accounts.add(code));
      }
      if (row.region_name) {
        const regs = parseList(row.region_name);
        regs.forEach(reg => regions.add(reg));
      }
    }

    return {
      allowedAccounts: Array.from(accounts),
      allowedDepartments: [], // No departments column in evidence_rls_1d_a
      allowedRegions: Array.from(regions),
    };
  } catch (error) {
    console.error(`❌ [StarRocks] Failed to fetch RLS scope for ${empAccount}:`, error);
    return null;
  }
}


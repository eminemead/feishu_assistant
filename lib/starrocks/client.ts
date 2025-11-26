import mysql, { Pool } from 'mysql2/promise';

const STARROCKS_HOST = process.env.STARROCKS_HOST;
const STARROCKS_PORT = Number(process.env.STARROCKS_PORT || 9030);
const STARROCKS_DATABASE = process.env.STARROCKS_DATABASE;
const STARROCKS_USER = process.env.STARROCKS_USER;
const STARROCKS_PASSWORD = process.env.STARROCKS_PASSWORD;

let pool: Pool | null = null;

export function hasStarrocksConfig(): boolean {
  return Boolean(
    STARROCKS_HOST && STARROCKS_DATABASE && STARROCKS_USER && STARROCKS_PASSWORD,
  );
}

function ensurePool(): Pool {
  if (!hasStarrocksConfig()) {
    throw new Error('StarRocks configuration is missing');
  }

  if (!pool) {
    pool = mysql.createPool({
      host: STARROCKS_HOST,
      port: STARROCKS_PORT,
      database: STARROCKS_DATABASE,
      user: STARROCKS_USER,
      password: STARROCKS_PASSWORD,
      waitForConnections: true,
      connectionLimit: 5,
      enableKeepAlive: true,
    });
  }

  return pool;
}

export async function queryStarrocks<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const conn = ensurePool();
  const [rows] = await conn.query<T[]>(sql, params);
  return rows;
}

export async function closeStarrocksPool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}


/**
 * Structured logger with file output and rotation
 * 
 * Features:
 * - Writes to both stdout and logs/app.log
 * - Auto-rotates logs daily (keeps last 7 days)
 * - Timestamps all entries
 * - JSON format for structured logging
 */

import * as fs from "fs";
import * as path from "path";

const LOGS_DIR = path.join(process.cwd(), "logs");
const MAX_LOG_DAYS = 7;

// Ensure logs directory exists
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

function getLogFileName(): string {
  const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  return path.join(LOGS_DIR, `app-${date}.log`);
}

function cleanOldLogs(): void {
  try {
    const files = fs.readdirSync(LOGS_DIR);
    const now = Date.now();
    const maxAge = MAX_LOG_DAYS * 24 * 60 * 60 * 1000;

    for (const file of files) {
      if (!file.startsWith("app-") || !file.endsWith(".log")) continue;
      
      const filePath = path.join(LOGS_DIR, file);
      const stats = fs.statSync(filePath);
      
      if (now - stats.mtimeMs > maxAge) {
        fs.unlinkSync(filePath);
      }
    }
  } catch {
    // Ignore cleanup errors
  }
}

// Clean old logs on startup
cleanOldLogs();

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: unknown;
}

function formatMessage(entry: LogEntry): string {
  const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}]`;
  if (entry.data !== undefined) {
    return `${prefix} ${entry.message} ${JSON.stringify(entry.data)}`;
  }
  return `${prefix} ${entry.message}`;
}

function writeLog(level: LogLevel, message: string, data?: unknown): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    data,
  };

  const formatted = formatMessage(entry);

  // Write to stdout/stderr
  if (level === "error") {
    console.error(formatted);
  } else if (level === "warn") {
    console.warn(formatted);
  } else {
    console.log(formatted);
  }

  // Append to log file
  try {
    fs.appendFileSync(getLogFileName(), formatted + "\n");
  } catch {
    // Ignore file write errors to avoid breaking the app
  }
}

export const logger = {
  debug: (message: string, data?: unknown) => writeLog("debug", message, data),
  info: (message: string, data?: unknown) => writeLog("info", message, data),
  warn: (message: string, data?: unknown) => writeLog("warn", message, data),
  error: (message: string, data?: unknown) => writeLog("error", message, data),
  
  // Convenience: log with emoji prefix (matches existing style)
  success: (tag: string, message: string, data?: unknown) => 
    writeLog("info", `✅ [${tag}] ${message}`, data),
  fail: (tag: string, message: string, data?: unknown) => 
    writeLog("error", `❌ [${tag}] ${message}`, data),
  pending: (tag: string, message: string, data?: unknown) => 
    writeLog("info", `🔄 [${tag}] ${message}`, data),
  action: (tag: string, message: string, data?: unknown) => 
    writeLog("info", `🎯 [${tag}] ${message}`, data),
};

export default logger;

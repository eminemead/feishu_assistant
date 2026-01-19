import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";

const execFileAsync = promisify(execFile);

// Resolve agent-browser binary path (handles nvm installations)
function resolveAgentBrowserPath(): string {
  // Check common locations
  const candidates = [
    process.env.AGENT_BROWSER_PATH, // Explicit override
    "/Users/xiaofei.yin/.nvm/versions/node/v22.19.0/bin/agent-browser", // nvm install
    "/usr/local/bin/agent-browser",
    "/opt/homebrew/bin/agent-browser",
    "agent-browser", // fallback to PATH
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (candidate === "agent-browser" || existsSync(candidate)) {
      return candidate;
    }
  }
  return "agent-browser";
}

const AGENT_BROWSER_BIN = resolveAgentBrowserPath();

export interface AgentBrowserBaseOptions {
  session?: string;
  headed?: boolean;
  debug?: boolean;
  timeoutMs?: number;
}

export interface AgentBrowserOpenOptions extends AgentBrowserBaseOptions {
  /** @deprecated statePath not supported in agent-browser v0.6.0 - sessions don't persist */
  statePath?: string;
  /** User data directory for persistent browser profile */
  userDataDir?: string;
}

export interface AgentBrowserSnapshotOptions extends AgentBrowserBaseOptions {
  json?: boolean;
  interactiveOnly?: boolean;
  depth?: number;
  selector?: string;
  compact?: boolean;
}

export interface AgentBrowserCommandResult {
  stdout: string;
  stderr: string;
  command: string;
}

const DEFAULT_TIMEOUT_MS = 30000;
const MAX_BUFFER_BYTES = 10 * 1024 * 1024;

function buildBaseArgs(options?: AgentBrowserBaseOptions): string[] {
  const args: string[] = [];
  if (!options) return args;
  if (options.session) args.push("--session", options.session);
  if (options.headed) args.push("--headed");
  if (options.debug) args.push("--debug");
  return args;
}

async function runAgentBrowser(
  args: string[],
  options?: AgentBrowserBaseOptions
): Promise<AgentBrowserCommandResult> {
  const command = `${AGENT_BROWSER_BIN} ${args.join(" ")}`;
  console.log(`[AgentBrowser] Running: ${command}`);
  try {
    const { stdout, stderr } = await execFileAsync(AGENT_BROWSER_BIN, args, {
      timeout: options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER_BYTES,
      env: process.env,
    });
    return {
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      command,
    };
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      throw new Error(
        "agent-browser CLI not found. Install it via: npm i -g agent-browser"
      );
    }
    const stderr = error?.stderr ? String(error.stderr).trim() : "";
    const stdout = error?.stdout ? String(error.stdout).trim() : "";
    const message = error?.message ? String(error.message) : "agent-browser error";
    const details = [message, stderr, stdout].filter(Boolean).join("\n");
    throw new Error(details);
  }
}

function parseJsonOutput(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("agent-browser returned empty output");
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const sliced = trimmed.slice(start, end + 1);
      return JSON.parse(sliced);
    }
    const arrStart = trimmed.indexOf("[");
    const arrEnd = trimmed.lastIndexOf("]");
    if (arrStart >= 0 && arrEnd > arrStart) {
      const sliced = trimmed.slice(arrStart, arrEnd + 1);
      return JSON.parse(sliced);
    }
    throw new Error("Failed to parse JSON output from agent-browser");
  }
}

export async function agentBrowserOpen(
  url: string,
  options?: AgentBrowserOpenOptions
): Promise<AgentBrowserCommandResult> {
  const args = [...buildBaseArgs(options)];
  if (options?.statePath) {
    args.push("--state", options.statePath);
  }
  args.push("open", url);
  return await runAgentBrowser(args, options);
}

export async function agentBrowserSnapshot(
  options?: AgentBrowserSnapshotOptions
): Promise<{ raw: string; json?: unknown }> {
  const args = [...buildBaseArgs(options)];
  args.push("snapshot");
  if (options?.interactiveOnly) args.push("-i");
  if (options?.json) args.push("--json");
  if (options?.depth) args.push("-d", String(options.depth));
  if (options?.selector) args.push("-s", options.selector);
  if (options?.compact) args.push("-c");
  const result = await runAgentBrowser(args, options);
  let parsed: unknown | undefined;
  if (options?.json) {
    try {
      parsed = parseJsonOutput(result.stdout);
    } catch {
      parsed = undefined;
    }
  }
  return {
    raw: result.stdout,
    json: parsed,
  };
}

export async function agentBrowserClick(
  target: string,
  options?: AgentBrowserBaseOptions
): Promise<AgentBrowserCommandResult> {
  const args = [...buildBaseArgs(options), "click", target];
  return await runAgentBrowser(args, options);
}

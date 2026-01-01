/**
 * Mastra Studio Entry Point
 * 
 * This file exports the Mastra instance for use with `mastra dev` CLI.
 * It re-exports the configured instance from observability-config.ts
 */

export { mastra } from "../../lib/observability-config";

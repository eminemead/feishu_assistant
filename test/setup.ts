/**
 * Test Setup - runs before all tests
 * 
 * Sets up mock environment variables that are read at module load time.
 */

// Set mock environment variables for Supabase (read at module import time)
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost:54321";
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "mock-anon-key-for-testing";

// Set mock environment variables for other services
process.env.NVIDIA_API_TOKEN = process.env.NVIDIA_API_TOKEN || "mock-nvidia-token";
process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "mock-openrouter-key";

console.log("[Test Setup] Environment variables configured for testing");

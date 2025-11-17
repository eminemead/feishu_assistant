/**
 * Mock utilities for testing agents
 */

import { mock } from "bun:test";

// Mock DuckDB connection and database
export function createMockDuckDBConnection() {
  const mockTables: Record<string, any[]> = {};
  
  return {
    all: mock((query: string, params: any[], callback: (err: Error | null, result: any[]) => void) => {
      // Mock table listing query
      if (query.includes("information_schema.tables")) {
        const tableNames = Object.keys(mockTables).map(name => ({ table_name: name }));
        callback(null, tableNames);
        return;
      }
      
      // Mock data query
      if (query.includes("SELECT")) {
        // Extract table name from query (simplified)
        const tableMatch = query.match(/FROM\s+(\w+)/i);
        if (tableMatch && mockTables[tableMatch[1]]) {
          callback(null, mockTables[tableMatch[1]]);
          return;
        }
      }
      
      callback(null, []);
    }),
    close: mock(() => {}),
    mockTables,
  };
}

export function createMockDuckDBDatabase() {
  const connection = createMockDuckDBConnection();
  
  return {
    connect: mock(() => connection),
    close: mock(() => {}),
    connection,
  };
}

// Mock Exa search results
export const mockExaSearchResults = {
  results: [
    {
      title: "Test Result 1",
      url: "https://example.com/test1",
      text: "This is a test result snippet that contains relevant information about the search query.",
    },
    {
      title: "Test Result 2",
      url: "https://example.com/test2",
      text: "Another test result with different information.",
    },
  ],
};

// Mock CoreMessage for testing
export function createMockMessage(content: string, role: "user" | "assistant" = "user"): any {
  return {
    role,
    content,
  };
}

// Mock status update function
export function createMockStatusUpdate() {
  const updates: string[] = [];
  return {
    update: (status: string) => {
      updates.push(status);
      console.log(`[TEST] Status: ${status}`);
    },
    updates,
  };
}


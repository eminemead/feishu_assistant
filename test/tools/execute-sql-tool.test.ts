/**
 * Tests for execute_sql tool
 * Tests SQL validation, formatting, and security constraints
 */

import { describe, expect, it, mock, beforeEach } from "bun:test";
import {
  validateSql,
  formatAsCsv,
  formatAsMarkdown,
  addLimitIfMissing,
} from "../../lib/tools/execute-sql-tool";

describe("execute-sql-tool", () => {
  describe("validateSql", () => {
    it("should allow SELECT statements", () => {
      const result = validateSql("SELECT * FROM users");
      expect(result.valid).toBe(true);
    });

    it("should allow WITH (CTE) statements", () => {
      const result = validateSql("WITH cte AS (SELECT 1) SELECT * FROM cte");
      expect(result.valid).toBe(true);
    });

    it("should allow lowercase select", () => {
      const result = validateSql("select id, name from users");
      expect(result.valid).toBe(true);
    });

    it("should block DROP statements", () => {
      const result = validateSql("DROP TABLE users");
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("DROP");
    });

    it("should block DELETE statements", () => {
      const result = validateSql("DELETE FROM users WHERE id = 1");
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("DELETE");
    });

    it("should block INSERT statements", () => {
      const result = validateSql("INSERT INTO users VALUES (1, 'test')");
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("INSERT");
    });

    it("should block UPDATE statements", () => {
      const result = validateSql("UPDATE users SET name = 'test'");
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("UPDATE");
    });

    it("should block TRUNCATE statements", () => {
      const result = validateSql("TRUNCATE TABLE users");
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("TRUNCATE");
    });

    it("should block ALTER statements", () => {
      const result = validateSql("ALTER TABLE users ADD COLUMN age INT");
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("ALTER");
    });

    it("should block CREATE statements", () => {
      const result = validateSql("CREATE TABLE users (id INT)");
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("CREATE");
    });

    it("should block GRANT statements", () => {
      const result = validateSql("GRANT ALL ON users TO admin");
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("GRANT");
    });

    it("should block REVOKE statements", () => {
      const result = validateSql("REVOKE ALL ON users FROM admin");
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("REVOKE");
    });

    it("should reject non-SELECT statements", () => {
      const result = validateSql("EXPLAIN SELECT * FROM users");
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("Only SELECT");
    });
  });

  describe("addLimitIfMissing", () => {
    it("should add LIMIT if missing", () => {
      const result = addLimitIfMissing("SELECT * FROM users");
      expect(result).toContain("LIMIT 1000");
    });

    it("should not add LIMIT if already present", () => {
      const sql = "SELECT * FROM users LIMIT 10";
      const result = addLimitIfMissing(sql);
      expect(result).toBe(sql);
    });

    it("should handle lowercase limit", () => {
      const sql = "SELECT * FROM users limit 10";
      const result = addLimitIfMissing(sql);
      expect(result).toBe(sql);
    });

    it("should strip trailing semicolon before adding LIMIT", () => {
      const result = addLimitIfMissing("SELECT * FROM users;");
      expect(result).toBe("SELECT * FROM users LIMIT 1000");
    });
  });

  describe("formatAsCsv", () => {
    it("should format empty array as empty string", () => {
      const result = formatAsCsv([]);
      expect(result).toBe("");
    });

    it("should format rows as CSV", () => {
      const rows = [
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
      ];
      const result = formatAsCsv(rows);
      expect(result).toBe("id,name\n1,Alice\n2,Bob");
    });

    it("should escape commas in values", () => {
      const rows = [{ name: "Alice, Bob" }];
      const result = formatAsCsv(rows);
      expect(result).toBe('name\n"Alice, Bob"');
    });

    it("should escape quotes in values", () => {
      const rows = [{ name: 'Say "hello"' }];
      const result = formatAsCsv(rows);
      expect(result).toBe('name\n"Say ""hello"""');
    });

    it("should handle null values", () => {
      const rows = [{ id: 1, name: null }];
      const result = formatAsCsv(rows);
      expect(result).toBe("id,name\n1,");
    });
  });

  describe("formatAsMarkdown", () => {
    it("should format empty array as 'No results'", () => {
      const result = formatAsMarkdown([]);
      expect(result).toBe("No results");
    });

    it("should format rows as Markdown table", () => {
      const rows = [
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
      ];
      const result = formatAsMarkdown(rows);
      expect(result).toContain("| id | name |");
      expect(result).toContain("| --- | --- |");
      expect(result).toContain("| 1 | Alice |");
      expect(result).toContain("| 2 | Bob |");
    });

    it("should handle null values", () => {
      const rows = [{ id: 1, name: null }];
      const result = formatAsMarkdown(rows);
      expect(result).toContain("| 1 |  |");
    });
  });
});

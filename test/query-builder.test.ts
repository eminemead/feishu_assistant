/**
 * Tests for Query Builder
 */

import { describe, expect, it, beforeEach, mock } from "bun:test";
import {
  buildMetricQuery,
  buildExploreQuery,
  validateQueryParams,
  prepareMetricQuery,
  prepareExploreQuery,
  type MetricDefinition,
  type EntityDefinition,
} from "../lib/query-builder";

// Mock metric definition
const mockMetric: MetricDefinition = {
  name: "has_metric_percentage",
  description: "Percentage of OKRs with metrics",
  sql_expression:
    "ROUND(SUM(CASE WHEN has_metric = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2)",
  source_table: "okr_metrics",
  database: "starrocks",
  grain: "okr_id",
  aggregation: "percentage",
  dimensions: ["city_company", "manager_id", "quarter", "department"],
  filterable: [
    "city_company",
    "manager_id",
    "quarter",
    "department",
    "has_metric",
  ],
};

// Mock entity definition
const mockEntity: EntityDefinition = {
  name: "okr_metrics",
  description: "OKR metrics table",
  database: "starrocks",
  columns: [
    { name: "okr_id", type: "STRING", description: "OKR ID", primary_key: true },
    { name: "city_company", type: "STRING", description: "City code" },
    { name: "manager_id", type: "STRING", description: "Manager ID" },
    { name: "quarter", type: "STRING", description: "Quarter" },
    { name: "has_metric", type: "INT", description: "Has metric flag" },
  ],
};

describe("query-builder", () => {
  describe("validateQueryParams", () => {
    it("should pass valid dimensions", () => {
      const errors = validateQueryParams(mockMetric, {
        dimensions: ["city_company", "quarter"],
      });
      expect(errors).toHaveLength(0);
    });

    it("should reject invalid dimensions", () => {
      const errors = validateQueryParams(mockMetric, {
        dimensions: ["invalid_column"],
      });
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe("dimensions");
      expect(errors[0].message).toContain("invalid_column");
      expect(errors[0].allowed).toContain("city_company");
    });

    it("should pass valid filters", () => {
      const errors = validateQueryParams(mockMetric, {
        filters: { quarter: "2024-Q4", has_metric: 1 },
      });
      expect(errors).toHaveLength(0);
    });

    it("should reject invalid filter columns", () => {
      const errors = validateQueryParams(mockMetric, {
        filters: { invalid_filter: "value" },
      });
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe("filters");
      expect(errors[0].message).toContain("invalid_filter");
    });

    it("should validate orderBy", () => {
      const validErrors = validateQueryParams(mockMetric, {
        orderBy: "city_company",
      });
      expect(validErrors).toHaveLength(0);

      const invalidErrors = validateQueryParams(mockMetric, {
        orderBy: "invalid_order",
      });
      expect(invalidErrors).toHaveLength(1);
      expect(invalidErrors[0].field).toBe("orderBy");
    });
  });

  describe("buildMetricQuery", () => {
    it("should build basic metric query", () => {
      const result = buildMetricQuery(mockMetric, {
        dimensions: ["city_company"],
        limit: 100,
      });

      expect(result.sql).toContain("SELECT");
      expect(result.sql).toContain("city_company");
      expect(result.sql).toContain("has_metric_percentage");
      expect(result.sql).toContain("FROM okr_metrics");
      expect(result.sql).toContain("GROUP BY city_company");
      expect(result.sql).toContain("LIMIT 100");
    });

    it("should add WHERE clause for filters", () => {
      const result = buildMetricQuery(mockMetric, {
        dimensions: ["city_company"],
        filters: { quarter: "2024-Q4" },
        limit: 100,
      });

      expect(result.sql).toContain("WHERE quarter = '2024-Q4'");
    });

    it("should handle array filters as IN clause", () => {
      const result = buildMetricQuery(mockMetric, {
        dimensions: ["city_company"],
        filters: { city_company: ["SH", "BJ", "GZ"] },
        limit: 100,
      });

      expect(result.sql).toContain("city_company IN ('SH', 'BJ', 'GZ')");
    });

    it("should escape single quotes in values", () => {
      const result = buildMetricQuery(mockMetric, {
        dimensions: ["city_company"],
        filters: { quarter: "O'Brien" },
        limit: 100,
      });

      expect(result.sql).toContain("O''Brien");
    });

    it("should handle numeric filters", () => {
      const result = buildMetricQuery(mockMetric, {
        dimensions: ["city_company"],
        filters: { has_metric: 1 },
        limit: 100,
      });

      expect(result.sql).toContain("has_metric = 1");
    });

    it("should apply default ORDER BY", () => {
      const result = buildMetricQuery(mockMetric, {
        dimensions: ["city_company"],
        limit: 100,
      });

      expect(result.sql).toContain("ORDER BY has_metric_percentage DESC");
    });

    it("should use custom ORDER BY", () => {
      const result = buildMetricQuery(mockMetric, {
        dimensions: ["city_company"],
        orderBy: "city_company",
        orderDir: "ASC",
        limit: 100,
      });

      expect(result.sql).toContain("ORDER BY city_company ASC");
    });

    it("should cap limit at MAX_ROWS", () => {
      const result = buildMetricQuery(mockMetric, {
        dimensions: ["city_company"],
        limit: 5000,
      });

      expect(result.sql).toContain("LIMIT 1000");
    });
  });

  describe("buildExploreQuery", () => {
    it("should build basic explore query", () => {
      const result = buildExploreQuery(mockEntity, undefined, undefined, 10);

      expect(result.sql).toContain("SELECT *");
      expect(result.sql).toContain("FROM okr_metrics");
      expect(result.sql).toContain("LIMIT 10");
    });

    it("should select specific columns", () => {
      const result = buildExploreQuery(
        mockEntity,
        ["okr_id", "city_company"],
        undefined,
        10
      );

      expect(result.sql).toContain("SELECT okr_id, city_company");
    });

    it("should filter invalid columns", () => {
      const result = buildExploreQuery(
        mockEntity,
        ["okr_id", "invalid_col"],
        undefined,
        10
      );

      expect(result.sql).toContain("SELECT okr_id");
      expect(result.sql).not.toContain("invalid_col");
    });

    it("should add WHERE clause for filters", () => {
      const result = buildExploreQuery(
        mockEntity,
        undefined,
        { quarter: "2024-Q4" },
        10
      );

      expect(result.sql).toContain("WHERE quarter = '2024-Q4'");
    });

    it("should throw on invalid filter column", () => {
      expect(() =>
        buildExploreQuery(mockEntity, undefined, { invalid: "value" }, 10)
      ).toThrow("Invalid filter column");
    });

    it("should cap limit at 100", () => {
      const result = buildExploreQuery(mockEntity, undefined, undefined, 500);

      expect(result.sql).toContain("LIMIT 100");
    });
  });

  describe("SQL injection prevention", () => {
    it("should reject malicious column names", () => {
      expect(() =>
        buildMetricQuery(mockMetric, {
          dimensions: ["city_company; DROP TABLE users"],
          limit: 10,
        })
      ).toThrow("Invalid identifier");
    });

    it("should escape quotes in filter values", () => {
      const result = buildMetricQuery(mockMetric, {
        filters: { quarter: "'; DROP TABLE users; --" },
        limit: 10,
      });

      // Should be escaped - single quote becomes two single quotes
      // The SQL will contain the escaped string as a VALUE, not as executable SQL
      // quarter = '''; DROP TABLE users; --' is safe because it's inside quotes
      expect(result.sql).toContain("'''");
      // Verify it's properly escaped as a string literal
      expect(result.sql).toMatch(/quarter = '.*DROP TABLE.*'/);
    });
  });
});

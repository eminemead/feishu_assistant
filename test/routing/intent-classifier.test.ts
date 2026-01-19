/**
 * Intent Classifier Tests
 *
 * Tests for deterministic pattern-based routing.
 * Each test case verifies a specific routing decision.
 */

import { describe, it, expect } from "bun:test";
import {
  classifyIntent,
  getIntentRules,
  testClassification,
} from "../../lib/routing/intent-classifier";

describe("Intent Classifier", () => {
  describe("GitLab Operations", () => {
    it("routes issue creation to dpa-assistant workflow", () => {
      const queries = [
        "创建一个bug issue",
        "帮我开个工单",
        "create an issue for this bug",
        "新建一个问题",
        "提个bug",
        "记录这个问题",
      ];

      for (const query of queries) {
        const result = classifyIntent(query);
        expect(result.target.type).toBe("workflow");
        if (result.target.type === "workflow") {
          expect(result.target.workflowId).toBe("dpa-assistant");
        }
        expect(result.confidence).toBe("exact");
      }
    });

    it("routes issue listing to gitlab_cli tool", () => {
      const queries = [
        "列出我的issues",
        "show open issues",
        "查看工单状态",
        "有哪些issue",
      ];

      for (const query of queries) {
        const result = classifyIntent(query);
        expect(result.target.type).toBe("tool");
        if (result.target.type === "tool") {
          expect(result.target.toolId).toBe("gitlab_cli");
        }
      }
    });

    it("routes issue updates to dpa-assistant workflow", () => {
      const queries = [
        "更新issue #123",
        "关闭这个工单",
        "update issue",
        "close issue",
      ];

      for (const query of queries) {
        const result = classifyIntent(query);
        expect(result.target.type).toBe("workflow");
        if (result.target.type === "workflow") {
          expect(result.target.workflowId).toBe("dpa-assistant");
        }
      }
    });
  });

  describe("OKR Operations", () => {
    it("routes OKR analysis to okr-analysis workflow", () => {
      const queries = [
        "分析Q4的OKR覆盖率",
        "OKR分析报告",
        "各城市OKR对比",
        "analyze OKR metrics",
        "OKR趋势分析",
      ];

      for (const query of queries) {
        const result = classifyIntent(query);
        expect(result.target.type).toBe("workflow");
        if (result.target.type === "workflow") {
          expect(result.target.workflowId).toBe("okr-analysis");
        }
        expect(result.confidence).toBe("exact");
      }
    });

    it("routes OKR quick lookups to mgr_okr_review tool", () => {
      const queries = [
        "查一下OKR数据",
        "指标覆盖率是多少",
      ];

      for (const query of queries) {
        const result = classifyIntent(query);
        expect(result.target.type).toBe("tool");
        if (result.target.type === "tool") {
          expect(result.target.toolId).toBe("mgr_okr_review");
        }
      }
    });
  });

  describe("Feishu Task Operations", () => {
    it("routes task creation intents to feishu-task workflow", () => {
      const queries = [
        "待办: 跟进新客户需求",
        "todo: fix pipeline lag",
        "任务：整理周报数据",
        "task: update dashboard",
        "task fix flaky test",
      ];

      for (const query of queries) {
        const result = classifyIntent(query);
        expect(result.target.type).toBe("workflow");
        if (result.target.type === "workflow") {
          expect(result.target.workflowId).toBe("feishu-task");
        }
        expect(result.confidence).toBe("exact");
      }
    });
  });

  describe("Document Operations", () => {
    it("routes doc commands to doc-command handler", () => {
      const queries = [
        "watch https://feishu.cn/docs/xxx",
        "check doc",
        "unwatch doc",
      ];

      for (const query of queries) {
        const result = classifyIntent(query);
        expect(result.target.type).toBe("doc-command");
      }
    });

    it("routes document tracking setup to workflow", () => {
      const queries = [
        "监控这个文档的变化",
        "订阅文档更新通知",
        "track this document",
      ];

      for (const query of queries) {
        const result = classifyIntent(query);
        expect(result.target.type).toBe("workflow");
        if (result.target.type === "workflow") {
          expect(result.target.workflowId).toBe("document-tracking");
        }
      }
    });

    it("routes document reading to feishu_docs tool", () => {
      const queries = [
        "读一下这个文档",
        "查看文档内容",
        "read this doc",
      ];

      for (const query of queries) {
        const result = classifyIntent(query);
        expect(result.target.type).toBe("tool");
        if (result.target.type === "tool") {
          expect(result.target.toolId).toBe("feishu_docs");
        }
      }
    });
  });

  describe("Slash Commands", () => {
    it("routes known slash commands to slash-command handler", () => {
      const queries = [
        "/collect feedback",
        "/创建 bug issue",
        "/list issues",
        "/help",
      ];

      for (const query of queries) {
        const result = classifyIntent(query);
        expect(result.target.type).toBe("slash-command");
      }
    });
  });

  describe("Chat History", () => {
    it("routes chat history queries to feishu_chat_history tool", () => {
      const queries = [
        "最近群里聊了什么",
        "搜索之前的消息",
        "之前说了什么",
      ];

      for (const query of queries) {
        const result = classifyIntent(query);
        expect(result.target.type).toBe("tool");
        if (result.target.type === "tool") {
          expect(result.target.toolId).toBe("feishu_chat_history");
        }
      }
    });
  });

  describe("Release Notes", () => {
    it("routes release notes to release-notes workflow", () => {
      const queries = [
        "generate release notes",
        "发布日志",
        "changelog",
      ];

      for (const query of queries) {
        const result = classifyIntent(query);
        expect(result.target.type).toBe("workflow");
        if (result.target.type === "workflow") {
          expect(result.target.workflowId).toBe("release-notes");
        }
      }
    });
  });

  describe("Fallback to Agent", () => {
    it("routes unmatched queries to agent", () => {
      const queries = [
        "你好",
        "what's the weather today",
        "帮我写一段代码",
        "random question",
      ];

      for (const query of queries) {
        const result = classifyIntent(query);
        expect(result.target.type).toBe("agent");
        expect(result.confidence).toBe("fallback");
      }
    });
  });

  describe("Priority Ordering", () => {
    it("matches doc-command before workflow patterns", () => {
      // "watch" could match doc-command (priority 0) or doc-track workflow (priority 12)
      const result = classifyIntent("watch https://docs.feishu.cn/xxx");
      expect(result.target.type).toBe("doc-command");
    });

    it("matches slash commands before other patterns", () => {
      // "/创建" could match slash-command (priority 1) or gitlab_create (priority 10)
      const result = classifyIntent("/创建 bug issue");
      expect(result.target.type).toBe("slash-command");
    });
  });

  describe("testClassification helper", () => {
    it("returns classification results for multiple queries", () => {
      const queries = ["创建issue", "你好", "/help"];
      const results = testClassification(queries);

      expect(results).toHaveLength(3);
      expect(results[0].query).toBe("创建issue");
      expect(results[0].result.target.type).toBe("workflow");
      expect(results[1].query).toBe("你好");
      expect(results[1].result.target.type).toBe("agent");
      expect(results[2].query).toBe("/help");
      expect(results[2].result.target.type).toBe("slash-command");
    });
  });

  describe("getIntentRules", () => {
    it("returns all registered rules", () => {
      const rules = getIntentRules();
      expect(rules.length).toBeGreaterThan(0);

      // Check that rules have required fields
      for (const rule of rules) {
        expect(rule.id).toBeDefined();
        expect(rule.patterns).toBeDefined();
        expect(rule.patterns.length).toBeGreaterThan(0);
        expect(rule.target).toBeDefined();
        expect(rule.priority).toBeDefined();
      }
    });

    it("has rules sorted by priority conceptually", () => {
      const rules = getIntentRules();
      const docCommandRule = rules.find(r => r.id === "doc_command");
      const slashCommandRule = rules.find(r => r.id === "slash_command");
      const gitlabCreateRule = rules.find(r => r.id === "gitlab_create_issue");

      expect(docCommandRule?.priority).toBeLessThan(gitlabCreateRule?.priority || 0);
      expect(slashCommandRule?.priority).toBeLessThan(gitlabCreateRule?.priority || 0);
    });
  });
});

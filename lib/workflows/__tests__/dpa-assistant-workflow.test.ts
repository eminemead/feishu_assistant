/**
 * Test: DPA Assistant Workflow - Slash Command Parsing
 * 
 * Unit tests for the slash command routing feature.
 * Tests the parseSlashCommand helper function in isolation.
 */

import { describe, it, expect } from "bun:test";
import { parseSlashCommand, SLASH_COMMANDS, HELP_COMMANDS } from "../dpa-assistant-workflow";

describe("Slash Command Parsing", () => {
  describe("parseSlashCommand", () => {
    it("should return null for non-slash commands", () => {
      expect(parseSlashCommand("hello world")).toBeNull();
      expect(parseSlashCommand("create issue")).toBeNull();
      expect(parseSlashCommand("查看我的issue")).toBeNull();
    });

    it("should route /创建 to gitlab_create", () => {
      const result = parseSlashCommand("/创建 测试issue");
      expect(result).not.toBeNull();
      expect(result?.intent).toBe("gitlab_create");
      expect(result?.remainingQuery).toBe("测试issue");
    });

    it("should route /新 to gitlab_create", () => {
      const result = parseSlashCommand("/新 Bug: 数据管道失败");
      expect(result).not.toBeNull();
      expect(result?.intent).toBe("gitlab_create");
    });

    it("should route /create to gitlab_create", () => {
      const result = parseSlashCommand("/create new issue for testing");
      expect(result).not.toBeNull();
      expect(result?.intent).toBe("gitlab_create");
      expect(result?.remainingQuery).toBe("new issue for testing");
    });

    it("should route /查看 to gitlab_list", () => {
      const result = parseSlashCommand("/查看 我的issue");
      expect(result).not.toBeNull();
      expect(result?.intent).toBe("gitlab_list");
    });

    it("should route /列表 to gitlab_list", () => {
      const result = parseSlashCommand("/列表");
      expect(result).not.toBeNull();
      expect(result?.intent).toBe("gitlab_list");
      expect(result?.remainingQuery).toBe("");
    });

    it("should extract issue number from /总结 #123", () => {
      const result = parseSlashCommand("/总结 #123");
      expect(result).not.toBeNull();
      expect(result?.intent).toBe("gitlab_summarize");
      expect(result?.params?.issueIid).toBe("123");
    });

    it("should extract issue number from /summarize 456", () => {
      const result = parseSlashCommand("/summarize 456");
      expect(result).not.toBeNull();
      expect(result?.intent).toBe("gitlab_summarize");
      expect(result?.params?.issueIid).toBe("456");
    });

    it("should extract issue number from /关闭 #45", () => {
      const result = parseSlashCommand("/关闭 #45 http://superset.nevint.com/dashboard/123");
      expect(result).not.toBeNull();
      expect(result?.intent).toBe("gitlab_close");
      expect(result?.params?.issueIid).toBe("45");
    });

    it("should extract issue number from /关联 #789", () => {
      const result = parseSlashCommand("/关联 #789");
      expect(result).not.toBeNull();
      expect(result?.intent).toBe("gitlab_relink");
      expect(result?.params?.issueIid).toBe("789");
    });

    it("should route /搜索 to chat_search", () => {
      const result = parseSlashCommand("/搜索 部署讨论");
      expect(result).not.toBeNull();
      expect(result?.intent).toBe("chat_search");
      expect(result?.remainingQuery).toBe("部署讨论");
    });

    it("should route /文档 to doc_read", () => {
      const result = parseSlashCommand("/文档 https://feishu.cn/docs/xxx");
      expect(result).not.toBeNull();
      expect(result?.intent).toBe("doc_read");
    });

    it("should return help intent for /帮助", () => {
      const result = parseSlashCommand("/帮助");
      expect(result).not.toBeNull();
      expect(result?.intent).toBe("help");
    });

    it("should return help intent for /help", () => {
      const result = parseSlashCommand("/help");
      expect(result).not.toBeNull();
      expect(result?.intent).toBe("help");
    });

    it("should return help intent for /?", () => {
      const result = parseSlashCommand("/?");
      expect(result).not.toBeNull();
      expect(result?.intent).toBe("help");
    });

    it("should return null intent for unknown /command", () => {
      const result = parseSlashCommand("/未知命令");
      expect(result).not.toBeNull();
      expect(result?.intent).toBeNull();
    });

    it("should be case-insensitive for English commands", () => {
      const result1 = parseSlashCommand("/CREATE issue");
      const result2 = parseSlashCommand("/Create issue");
      const result3 = parseSlashCommand("/HELP");
      
      expect(result1?.intent).toBe("gitlab_create");
      expect(result2?.intent).toBe("gitlab_create");
      expect(result3?.intent).toBe("help");
    });
  });

  describe("SLASH_COMMANDS constant", () => {
    it("should have all GitLab commands", () => {
      expect(SLASH_COMMANDS["/创建"]).toBe("gitlab_create");
      expect(SLASH_COMMANDS["/新"]).toBe("gitlab_create");
      expect(SLASH_COMMANDS["/create"]).toBe("gitlab_create");
      expect(SLASH_COMMANDS["/查看"]).toBe("gitlab_list");
      expect(SLASH_COMMANDS["/列表"]).toBe("gitlab_list");
      expect(SLASH_COMMANDS["/list"]).toBe("gitlab_list");
      expect(SLASH_COMMANDS["/总结"]).toBe("gitlab_summarize");
      expect(SLASH_COMMANDS["/summarize"]).toBe("gitlab_summarize");
      expect(SLASH_COMMANDS["/关闭"]).toBe("gitlab_close");
      expect(SLASH_COMMANDS["/close"]).toBe("gitlab_close");
      expect(SLASH_COMMANDS["/关联"]).toBe("gitlab_relink");
      expect(SLASH_COMMANDS["/绑定"]).toBe("gitlab_relink");
      expect(SLASH_COMMANDS["/link"]).toBe("gitlab_relink");
    });

    it("should have all Feishu commands", () => {
      expect(SLASH_COMMANDS["/搜索"]).toBe("chat_search");
      expect(SLASH_COMMANDS["/search"]).toBe("chat_search");
      expect(SLASH_COMMANDS["/文档"]).toBe("doc_read");
      expect(SLASH_COMMANDS["/doc"]).toBe("doc_read");
    });
  });

  describe("HELP_COMMANDS constant", () => {
    it("should include all help variants", () => {
      expect(HELP_COMMANDS).toContain("/帮助");
      expect(HELP_COMMANDS).toContain("/help");
      expect(HELP_COMMANDS).toContain("/?");
    });
  });
});

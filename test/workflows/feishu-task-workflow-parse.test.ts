/**
 * Feishu Task Workflow Parse Helpers
 */

import { describe, it, expect } from "bun:test";
import { _testOnly } from "../../lib/workflows/feishu-task-workflow";

const {
  extractMentions,
  extractDueDateFromText,
  normalizeDueDate,
  stripTaskPrefix,
  formatThreadContext,
} = _testOnly;

const formatDate = (date: Date) => date.toISOString().split("T")[0];

const getThisFriday = (now: Date) => {
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const daysUntilFridayBase = (5 - dayOfWeek + 7) % 7;
  const thisFridayOffset = daysUntilFridayBase === 0 ? 7 : daysUntilFridayBase;
  const thisFriday = new Date(now);
  thisFriday.setDate(now.getDate() + thisFridayOffset);
  return formatDate(thisFriday);
};

const getNextFriday = (now: Date) => {
  const dayOfWeek = now.getDay();
  const daysUntilFridayBase = (5 - dayOfWeek + 7) % 7;
  const thisFridayOffset = daysUntilFridayBase === 0 ? 7 : daysUntilFridayBase;
  const thisFriday = new Date(now);
  thisFriday.setDate(now.getDate() + thisFridayOffset);
  const nextFriday = new Date(thisFriday);
  nextFriday.setDate(thisFriday.getDate() + 7);
  return formatDate(nextFriday);
};

describe("Feishu Task Workflow parse helpers", () => {
  it("strips task/todo prefixes from summary", () => {
    expect(stripTaskPrefix("待办: 跟进新客户需求")).toBe("跟进新客户需求");
    expect(stripTaskPrefix("任务：整理周报数据")).toBe("整理周报数据");
    expect(stripTaskPrefix("todo - fix pipeline lag")).toBe("fix pipeline lag");
    expect(stripTaskPrefix("task fix flaky test")).toBe("fix flaky test");
    expect(stripTaskPrefix("无需前缀")).toBe("无需前缀");
  });

  it("extracts mentions as assignee candidates", () => {
    expect(extractMentions("给 @xiaofei.yin @ou_abc")).toEqual([
      "xiaofei.yin",
      "ou_abc",
    ]);
  });

  it("normalizes explicit and relative due dates", () => {
    const today = new Date();
    const todayStr = formatDate(today);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const tomorrowStr = formatDate(tomorrow);

    expect(normalizeDueDate("2026-02-03")).toBe("2026-02-03");
    expect(normalizeDueDate("today")).toBe(todayStr);
    expect(normalizeDueDate("tomorrow")).toBe(tomorrowStr);
  });

  it("extracts due dates from natural language text", () => {
    const now = new Date();
    const expectedThisFriday = getThisFriday(now);
    const expectedNextFriday = getNextFriday(now);
    const year = now.getFullYear();
    const mdExpected = formatDate(new Date(year, 0, 9));

    expect(extractDueDateFromText("请在 2026-02-03 前完成")).toBe("2026-02-03");
    expect(extractDueDateFromText("DDL 1/9")).toBe(mdExpected);
    expect(extractDueDateFromText("截止周五完成")).toBe(expectedThisFriday);
    expect(extractDueDateFromText("by next friday")).toBe(expectedNextFriday);
  });

  it("returns undefined when no due date is present", () => {
    expect(extractDueDateFromText("安排本周任务")).toBeUndefined();
  });

  it("formats thread context from prior user messages", () => {
    const messages = [
      { role: "assistant", content: "Acknowledged." },
      { role: "user", content: "任务：整理Q1数据" },
      { role: "user", content: "再补充：需要输出表格" },
      { role: "user", content: "待办: 整理Q1数据" },
    ];

    const context = formatThreadContext(messages as any, "待办: 整理Q1数据");
    expect(context).toContain("🧵 **上下文消息**");
    expect(context).toContain("- 整理Q1数据");
    expect(context).toContain("- 再补充：需要输出表格");
    expect(context).not.toContain("待办: 整理Q1数据");
  });
});

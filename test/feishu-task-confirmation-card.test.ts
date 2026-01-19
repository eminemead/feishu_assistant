import { describe, it, expect } from "bun:test";
import {
  parseTaskFormAction,
  buildTaskConfirmationValue,
} from "../lib/feishu-task-confirmation-card";

describe("Feishu Task Confirmation Card", () => {
  it("builds confirmation value from form submission", () => {
    const action = {
      value: {
        action: "feishu_task_form_submit",
        confirmPrefix: "__feishu_task_confirm__",
        cancelPrefix: "__feishu_task_cancel__",
        payload: {
          summary: "Old summary",
          assigneeOpenIds: ["ou_123"],
        },
      },
      form_value: {
        summary: "Updated summary",
        assignees: "alice,bob",
        dueDate: "2026-02-03",
      },
    };

    const parsed = parseTaskFormAction(action);
    expect(parsed).toBeTruthy();

    const confirmationValue = buildTaskConfirmationValue(parsed!);
    expect(confirmationValue?.startsWith("__feishu_task_confirm__:")).toBe(true);

    const payloadJson = confirmationValue?.replace("__feishu_task_confirm__:", "");
    const payload = payloadJson ? JSON.parse(payloadJson).payload : null;

    expect(payload.summary).toBe("Updated summary");
    expect(payload.assignees).toEqual(["alice", "bob"]);
    expect(payload.assigneeOpenIds).toBeUndefined();
    expect(payload.dueDate).toBe("2026-02-03");
  });

  it("returns cancel prefix for cancel action", () => {
    const action = {
      value: {
        action: "feishu_task_form_cancel",
        cancelPrefix: "__feishu_task_cancel__",
      },
    };

    const parsed = parseTaskFormAction(action);
    expect(parsed).toBeTruthy();
    expect(buildTaskConfirmationValue(parsed!)).toBe("__feishu_task_cancel__");
  });
});

import { describe, it, expect } from "bun:test";
import {
  handleCardAction,
  parseCardActionCallback,
  createCardUpdateResponse,
  createToastResponse,
  CardActionCallback,
} from "../lib/handle-card-action";

describe("Card Action Handler", () => {
  describe("parseCardActionCallback", () => {
    it("should parse valid card action callback", async () => {
      const payload: CardActionCallback = {
        schema: "2.0",
        header: {
          event_id: "event-123",
          event_type: "card.action.trigger",
          create_time: "2025-01-01T12:00:00Z",
          token: "token-123",
          app_id: "app-123",
        },
        event: {
          action: {
            action_id: "btn_refresh",
            action_type: "button",
            value: {},
          },
          trigger: {
            trigger_type: "card.action.trigger",
          },
          operator: {
            operator_id: "user-123",
            operator_type: "user",
          },
          token: "token-123",
        },
      };

      // Mock the parse function to return the payload directly
      const result = await parseCardActionCallback(
        {},
        JSON.stringify(payload),
        null as any
      );

      expect(result).not.toBeNull();
      expect(result?.event.action.action_id).toBe("btn_refresh");
      expect(result?.event.operator.operator_id).toBe("user-123");
    });

    it("should return null for invalid JSON", async () => {
      const result = await parseCardActionCallback({}, "invalid json", null as any);
      expect(result).toBeNull();
    });
  });

  describe("handleCardAction", () => {
    it("should return success response for valid action", async () => {
      const callback: CardActionCallback = {
        schema: "2.0",
        header: {
          event_id: "event-123",
          event_type: "card.action.trigger",
          create_time: "2025-01-01T12:00:00Z",
          token: "token-123",
          app_id: "app-123",
        },
        event: {
          action: {
            action_id: "btn_submit",
            action_type: "button",
            value: { name: "John", age: 30 },
          },
          trigger: {
            trigger_type: "card.action.trigger",
          },
          operator: {
            operator_id: "user-456",
            operator_type: "user",
          },
          token: "token-123",
        },
      };

      const response = await handleCardAction(callback);

      expect(response.toast).toBeDefined();
      expect(response.toast?.type).toBe("success");
      expect(response.toast?.content).toContain("btn_submit");
    });

    it("should handle errors gracefully", async () => {
      // Pass invalid callback (missing required fields)
      const callback = {
        schema: "2.0",
        header: {},
        event: {},
      } as any;

      const response = await handleCardAction(callback);

      expect(response.toast?.type).toBe("fail");
      expect(response.toast?.content).toContain("Failed to process");
    });
  });

  describe("Helper functions", () => {
    it("should create card update response correctly", () => {
      const cardData = {
        schema: "2.0",
        header: { title: { content: "Updated Card" } },
        body: { elements: [] },
      };

      const response = createCardUpdateResponse("card-123", cardData);

      expect(response.card).toBeDefined();
      expect(response.card?.type).toBe("raw");
      expect(response.card?.data).toContain("Updated Card");
    });

    it("should create toast response correctly", () => {
      const successToast = createToastResponse(
        "success",
        "Action completed successfully"
      );
      expect(successToast.toast?.type).toBe("success");
      expect(successToast.toast?.content).toBe("Action completed successfully");

      const failToast = createToastResponse("fail", "Something went wrong");
      expect(failToast.toast?.type).toBe("fail");
      expect(failToast.toast?.content).toBe("Something went wrong");

      const warningToast = createToastResponse(
        "warning",
        "Please be careful"
      );
      expect(warningToast.toast?.type).toBe("warning");
      expect(warningToast.toast?.content).toBe("Please be careful");
    });
  });

  describe("Response format validation", () => {
    it("should validate toast response format", async () => {
      const callback: CardActionCallback = {
        schema: "2.0",
        header: {
          event_id: "event-123",
          event_type: "card.action.trigger",
          create_time: "2025-01-01T12:00:00Z",
          token: "token-123",
          app_id: "app-123",
        },
        event: {
          action: {
            action_id: "btn_test",
            action_type: "button",
          },
          trigger: {
            trigger_type: "card.action.trigger",
          },
          operator: {
            operator_id: "user-789",
            operator_type: "user",
          },
          token: "token-123",
        },
      };

      const response = await handleCardAction(callback);

      // Verify Feishu response format
      expect(response).toHaveProperty("toast");
      expect(response.toast).toHaveProperty("type");
      expect(response.toast).toHaveProperty("content");

      const validTypes = ["success", "fail", "warning"];
      expect(validTypes).toContain(response.toast?.type);
    });
  });
});

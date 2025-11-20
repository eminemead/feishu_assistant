import { describe, it, expect } from "bun:test";
import {
  addFollowupButtonsToCard,
  createSimpleButtonCard,
  extractButtonValue,
} from "../lib/card-button-utils";
import {
  createCardWithFollowups,
  enhanceResponseWithFollowups,
} from "../lib/tools/generate-response-with-followups";

describe("Card Button Utilities", () => {
  describe("addFollowupButtonsToCard", () => {
    it("should add buttons to existing card data", () => {
      const originalCard = {
        schema: "2.0",
        header: { title: { content: "Test Card" } },
        body: { elements: [{ tag: "markdown", content: "Test" }] },
      };

      const buttons = [
        { id: "btn1", text: "Option 1" },
        { id: "btn2", text: "Option 2" },
      ];

      const updatedCard = addFollowupButtonsToCard(originalCard, buttons);

      expect(updatedCard.body.elements.length).toBeGreaterThan(
        originalCard.body.elements.length
      );
      // Check that action element with buttons was added
      const hasActionElement = updatedCard.body.elements.some(
        (el: any) => el.tag === "action"
      );
      expect(hasActionElement).toBe(true);
    });

    it("should create body if it doesn't exist", () => {
      const cardWithoutBody = {
        schema: "2.0",
        header: { title: { content: "Test" } },
      };

      const buttons = [{ id: "btn1", text: "Click me" }];

      const updatedCard = addFollowupButtonsToCard(cardWithoutBody, buttons);

      expect(updatedCard.body).toBeDefined();
      expect(updatedCard.body.elements).toBeDefined();
    });

    it("should not mutate original card", () => {
      const originalCard = {
        schema: "2.0",
        body: { elements: [{ tag: "text", content: "Original" }] },
      };

      const originalLength = originalCard.body.elements.length;
      const buttons = [{ id: "btn1", text: "New button" }];

      addFollowupButtonsToCard(originalCard, buttons);

      expect(originalCard.body.elements.length).toBe(originalLength);
    });
  });

  describe("createSimpleButtonCard", () => {
    it("should create a complete card with buttons", () => {
      const buttons = [
        { id: "opt1", text: "Yes" },
        { id: "opt2", text: "No" },
      ];

      const card = createSimpleButtonCard("Question", "Do you agree?", buttons);

      expect(card.schema).toBe("2.0");
      expect(card.header.title.content).toBe("Question");
      expect(card.body.elements).toBeDefined();

      const actionElement = card.body.elements.find(
        (el: any) => el.tag === "action"
      );
      expect(actionElement).toBeDefined();
      expect(actionElement.actions.length).toBe(2);
    });
  });

  describe("extractButtonValue", () => {
    it("should extract string value directly", () => {
      const value = extractButtonValue("Tell me more");
      expect(value).toBe("Tell me more");
    });

    it("should extract value from object with value property", () => {
      const value = extractButtonValue({ value: "Option 1" });
      expect(value).toBe("Option 1");
    });

    it("should extract text from object if value not present", () => {
      const value = extractButtonValue({ text: "Button text" });
      expect(value).toBe("Button text");
    });

    it("should return null for invalid input", () => {
      const value = extractButtonValue(null);
      expect(value).toBeNull();
    });

    it("should return null for empty object", () => {
      const value = extractButtonValue({});
      expect(value).toBeNull();
    });
  });
});

describe("Response Enhancement with Follow-ups", () => {
  // Note: Full integration tests with LLM calls would require:
  // - Valid OpenRouter API key
  // - Mocked LLM responses
  // - Increased test timeouts
  // These tests verify structure and error handling without LLM

  describe("Buttons on Cards", () => {
    it("should add button container to card", () => {
      const cardData = {
        schema: "2.0",
        body: { elements: [{ tag: "markdown", content: "Original content" }] },
      };

      const buttons = [
        { id: "1", text: "Option 1" },
        { id: "2", text: "Option 2" },
      ];

      const updated = addFollowupButtonsToCard(cardData, buttons);

      // Verify action element was added
      const actionEl = updated.body.elements.find((el: any) => el.tag === "action");
      expect(actionEl).toBeDefined();
      expect(actionEl.actions.length).toBe(2);
    });

    it("should preserve original card content", () => {
      const cardData = {
        schema: "2.0",
        body: {
          elements: [
            { tag: "markdown", content: "Important content" },
            { tag: "text", content: "More content" },
          ],
        },
      };

      const originalContentLength = cardData.body.elements.length;
      const buttons = [{ id: "1", text: "Click me" }];

      const updated = addFollowupButtonsToCard(cardData, buttons);

      // Original elements should still be there
      const markdownEl = updated.body.elements.find(
        (el: any) => el.tag === "markdown" && el.content === "Important content"
      );
      expect(markdownEl).toBeDefined();
    });
  });
});

describe("Button Types and Sizes", () => {
  it("should support different button types", () => {
    const buttons = [
      { id: "1", text: "Normal" },
      { id: "2", text: "Primary", type: "primary" as const },
      { id: "3", text: "Danger", type: "danger" as const },
    ];

    const card = createSimpleButtonCard("Test", "Choose", buttons);
    const actionElement = card.body.elements.find(
      (el: any) => el.tag === "action"
    );

    expect(actionElement.actions[0].type).toBe("default");
    expect(actionElement.actions[1].type).toBe("primary");
    expect(actionElement.actions[2].type).toBe("danger");
  });

  it("should support different button sizes", () => {
    const buttons = [
      { id: "1", text: "Small", size: "small" as const },
      { id: "2", text: "Medium", size: "medium" as const },
      { id: "3", text: "Large", size: "large" as const },
    ];

    const card = createSimpleButtonCard("Test", "Choose", buttons);
    const actionElement = card.body.elements.find(
      (el: any) => el.tag === "action"
    );

    expect(actionElement.actions[0].size).toBe("small");
    expect(actionElement.actions[1].size).toBe("medium");
    expect(actionElement.actions[2].size).toBe("large");
  });
});

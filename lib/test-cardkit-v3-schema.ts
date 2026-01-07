/**
 * Test Implementation: Hypothesis 3 - CardKit v3 Schema
 * 
 * Theory: Feishu might have released CardKit v3 that allows action elements
 * in streaming cards. We're currently using v2 schema.
 * 
 * This test tries:
 * 1. Using schema: "3.0" instead of "2.0"
 * 2. Creating streaming card with buttons at the same time
 * 3. Checking if v3 allows this combination
 * 
 * Note: The Larksuite SDK might not officially support v3, but the API might
 * accept it. This is worth testing.
 */

import { client as feishuClient } from "./feishu-utils";

/**
 * Test creating streaming card with schema 3.0
 * 
 * If Feishu has released v3, it might support action elements in streaming cards.
 */
export async function testStreamingCardWithV3Schema(
  title: string = "Test Response",
  initialContent: string = "Testing v3 schema..."
): Promise<{
  success: boolean;
  cardId?: string;
  schema?: string;
  error?: any;
}> {
  try {
    console.log(`📊 [CardKitV3] Testing streaming card with schema 3.0...`);

    // Try v3 schema with streaming_mode and action elements
    const cardDataV3 = {
      schema: "3.0", // Key difference: v3 instead of v2
      header: {
        title: {
          content: title,
          tag: "plain_text",
        },
      },
      config: {
        streaming_mode: true,
        summary: {
          content: initialContent,
        },
        streaming_config: {
          print_frequency_ms: {
            default: 70,
            android: 70,
            ios: 70,
            pc: 70,
          },
          print_step: {
            default: 1,
            android: 1,
            ios: 1,
            pc: 1,
          },
          print_strategy: "fast",
        },
      },
      body: {
        elements: [
          {
            tag: "markdown",
            content: initialContent,
            element_id: "md_content_v3",
          },
          // Try adding action element in v3 schema at creation time
          {
            tag: "action",
            actions: [
              {
                tag: "button",
                text: {
                  content: "Option 1",
                  tag: "plain_text",
                },
                type: "primary",
                value: "option_1",
              },
              {
                tag: "button",
                text: {
                  content: "Option 2",
                  tag: "plain_text",
                },
                type: "default",
                value: "option_2",
              },
            ],
          },
        ],
      },
    };

    console.log(`📊 [CardKitV3] Creating card with schema 3.0...`);
    const resp = await feishuClient.cardkit.v1.card.create({
      data: {
        type: "card_json",
        data: JSON.stringify(cardDataV3),
      },
    });

    const isSuccess = resp.code === 0 ? resp.code === 0 || resp.code === undefined : (resp.code === 0 || resp.code === undefined);
    const responseData = resp.data || resp;

    if (!isSuccess || !responseData?.card_id) {
      console.error(`❌ [CardKitV3] Failed to create v3 card:`, JSON.stringify(resp, null, 2));
      return {
        success: false,
        schema: "3.0",
        error: `Failed: code=${resp.code}, msg=${resp.msg}`,
      };
    }

    console.log(`✅ [CardKitV3] SUCCESS: Created streaming card with v3 schema!`);
    console.log(`   Card ID: ${responseData.card_id}`);
    console.log(`   Schema: 3.0`);
    console.log(`   This means v3 supports action elements in streaming cards!`);

    return {
      success: true,
      cardId: responseData.card_id,
      schema: "3.0",
    };
  } catch (error) {
    console.error(`❌ [CardKitV3] Exception:`, error);
    return {
      success: false,
      schema: "3.0",
      error,
    };
  }
}

/**
 * Try a hybrid approach: v3 schema but more conservative
 * 
 * Maybe v3 needs a different config structure
 */
export async function testStreamingCardV3Hybrid(): Promise<{
  success: boolean;
  cardId?: string;
  variations?: string[];
  error?: any;
}> {
  try {
    console.log(`📊 [CardKitV3] Testing v3 with conservative config...`);

    // Try different v3 variations
    const variations = [
      {
        name: "v3-conservative",
        schema: "3.0",
        config: {
          streaming_mode: true, // Same as v2
        },
      },
      {
        name: "v3-extended",
        schema: "3.0",
        config: {
          streaming_mode: true,
          enable_actions_in_streaming: true, // Maybe v3 has this?
        },
      },
    ];

    const results: string[] = [];

    for (const variation of variations) {
      try {
        console.log(`📊 [CardKitV3] Testing variation: ${variation.name}...`);

        const cardData = {
          schema: variation.schema,
          header: {
            title: {
              content: `Testing ${variation.name}`,
              tag: "plain_text",
            },
          },
          config: variation.config,
          body: {
            elements: [
              {
                tag: "markdown",
                content: `Testing v3 variation: ${variation.name}`,
                element_id: `md_${variation.name}`,
              },
            ],
          },
        };

        const resp = await feishuClient.cardkit.v1.card.create({
          data: {
            type: "card_json",
            data: JSON.stringify(cardData),
          },
        });

        const isSuccess = resp.code === 0 ? resp.code === 0 || resp.code === undefined : (resp.code === 0 || resp.code === undefined);
        if (isSuccess && resp.data?.card_id) {
          console.log(`✅ [CardKitV3] Variation ${variation.name} works!`);
          results.push(`${variation.name}: ✅`);
        } else {
          console.log(`⚠️ [CardKitV3] Variation ${variation.name} failed:`, resp.msg);
          results.push(`${variation.name}: ❌ (${resp.msg})`);
        }
      } catch (error) {
        console.log(`❌ [CardKitV3] Variation ${variation.name} exception:`, error);
        results.push(`${variation.name}: ❌ (exception)`);
      }
    }

    return {
      success: results.some(r => r.includes("✅")),
      variations: results,
    };
  } catch (error) {
    console.error(`❌ [CardKitV3] Test failed:`, error);
    return {
      success: false,
      error,
    };
  }
}

export const _testOnly = {
  testStreamingCardWithV3Schema,
  testStreamingCardV3Hybrid,
};

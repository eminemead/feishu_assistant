import { Agent } from "@ai-sdk-tools/agents";
import { tool, zodSchema } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { CoreMessage } from "ai";
import { z } from "zod";
import { okrReviewerAgent } from "./okr-reviewer-agent";
import { alignmentAgent } from "./alignment-agent";
import { pnlAgent } from "./pnl-agent";
import { dpaPmAgent } from "./dpa-pm-agent";
import { exa } from "../utils";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// Create web search tool for fallback
const searchWebTool = tool({
  description: "Use this to search the web for information",
  parameters: zodSchema(
    z.object({
      query: z.string(),
      specificDomain: z
        .string()
        .nullable()
        .describe(
          "a domain to search if the user specifies e.g. bbc.com. Should be only the domain name without the protocol"
        ),
    })
  ),
  execute: async ({ query, specificDomain }: { query: string; specificDomain: string | null }) => {
    const { results } = await exa.searchAndContents(query, {
      livecrawl: "always",
      numResults: 3,
      includeDomains: specificDomain ? [specificDomain] : undefined,
    });

    return {
      results: results.map((result) => ({
        title: result.title,
        url: result.url,
        snippet: result.text.slice(0, 1000),
      })),
    };
  },
});

/**
 * Routing logic for manager agent:
 * 
 * The @ai-sdk-tools/agents library handles routing automatically using:
 * 1. Keyword matching: Each specialist agent defines `matchOn` patterns
 * 2. Semantic understanding: LLM analyzes query meaning and routes to best agent
 * 3. Fallback: If no match, manager uses its own tools (searchWeb) or provides guidance
 * 
 * Routing priority (checked in order):
 * 1. OKR Reviewer: okr, objective, key result, manager review, has_metric, 覆盖率,
 * 2. Alignment Agent: alignment, 对齐, 目标对齐
 * 3. P&L Agent: pnl, profit, loss, 损益, 利润, 亏损, EBIT
 * 4. DPA PM Agent: dpa, data team, AE, DA
 * 5. Fallback: web search or guidance
 */
export const managerAgentInstance = new Agent({
  name: "Manager",
  model: openrouter("kwaipilot/kat-coder-pro:free"),
  instructions: `You are a Feishu/Lark AI assistant that routes queries to specialist agents. Most user queries will be in Chinese (中文).

路由规则（按以下顺序应用）：
1. OKR Reviewer: 路由关于OKR、目标、关键结果、经理评审、指标覆盖率(has_metric percentage)、覆盖率(覆盖率)的查询
2. Alignment Agent: 路由关于对齐(alignment)、对齐、目标对齐的查询
3. P&L Agent: 路由关于损益(profit & loss)、P&L、损益、利润、亏损、EBIT的查询
4. DPA PM Agent: 路由关于DPA、数据团队(data team)、AE、DA的查询
5. Fallback: 如果没有匹配的专家，使用网络搜索(searchWeb工具)或提供有用的指导

ROUTING RULES (apply in this order):
1. OKR Reviewer: Route queries about OKR, objectives, key results, manager reviews, has_metric percentage, or 覆盖率
2. Alignment Agent: Route queries about alignment, 对齐, or 目标对齐
3. P&L Agent: Route queries about profit & loss, P&L, 损益, 利润, 亏损, or EBIT
4. DPA PM Agent: Route queries about DPA, data team, AE, or DA
5. Fallback: If no specialist matches, use web search (searchWeb tool) or provide helpful guidance

GENERAL GUIDELINES:
- Do not tag users. 不要@用户。
- Current date is: ${new Date().toISOString().split("T")[0]}
- Format your responses using Markdown syntax (Lark Markdown format), which will be rendered in Feishu cards.
- Always route to the most appropriate specialist agent when their domain is mentioned.
- Use web search for general queries that don't match any specialist.
- Most queries will be in Chinese - understand Chinese query semantics for better routing.

AVAILABLE SPECIALISTS:
- OKR Reviewer (okr_reviewer): For OKR metrics, manager reviews, has_metric percentage analysis / 用于OKR指标、经理评审、指标覆盖率分析
- Alignment Agent (alignment_agent): For alignment tracking (under development) / 用于对齐跟踪（开发中）
- P&L Agent (pnl_agent): For profit & loss analysis (under development) / 用于损益分析（开发中）
- DPA PM Agent (dpa_pm): For product management tasks (under development) / 用于产品管理任务（开发中）`,
  handoffs: [okrReviewerAgent, alignmentAgent, pnlAgent, dpaPmAgent],
  tools: {
    searchWeb: searchWebTool,
  },
});

/**
 * Helper function to extract query text from messages for logging
 */
function getQueryText(messages: CoreMessage[]): string {
  const lastMessage = messages[messages.length - 1];
  if (lastMessage && typeof lastMessage.content === "string") {
    return lastMessage.content;
  }
  return "[non-text message]";
}

/**
 * Manager agent function that handles user queries.
 * Uses the @ai-sdk-tools/agents Agent class for orchestration.
 * 
 * Routing happens automatically via:
 * - Keyword matching (matchOn patterns in specialist agents)
 * - LLM semantic analysis
 * - Fallback to manager's tools (searchWeb)
 */
export async function managerAgent(
  messages: CoreMessage[],
  updateStatus?: (status: string) => void
): Promise<string> {
  const query = getQueryText(messages);
  console.log(`[Manager] Received query: "${query}"`);
  
  try {
    // Track routing decisions
    let routedAgent: string | null = null;
    let accumulatedText = "";
    
    // Use Agent.stream() with proper execution context
    console.log(`[Manager] Starting stream for query: "${query}"`);
    
    // Create a minimal execution context object
    // The Agent library internally accesses executionContext._memoryAddition
    // So we need an object with this property (can be empty string)
    const executionContext: any = {
      _memoryAddition: "",
    };
    
    // Use Agent.stream() with execution context
    // Note: The type definition shows messages, but internally it needs executionContext
    const result = (managerAgentInstance.stream as any)({
      messages,
      executionContext,
    });

    console.log(`[Manager] Stream created, starting to read textStream...`);

    // Process both textStream and fullStream in parallel
    // fullStream contains events like agent-handoff
    const processStreams = async () => {
      // Process fullStream to catch handoff events
      const fullStreamPromise = (async () => {
        try {
          for await (const part of result.fullStream) {
            // Check for agent-handoff events in the stream
            if (part && typeof part === 'object') {
              const event = part as any;
              // Look for handoff indicators in the stream parts
              if (event.type === 'agent-handoff' || event.type === 'handoff' || 
                  (event.agent && event.agent !== 'Manager')) {
                routedAgent = event.to || event.agent || event.agentName;
                updateStatus?.(`Routing to ${routedAgent}...`);
                console.log(`[Manager] Routing decision detected: "${query}" → ${routedAgent}`);
              }
            }
          }
        } catch (e) {
          // Ignore errors in fullStream processing
          console.log(`[Manager] FullStream processing completed or error:`, e);
        }
      })();

      // Process textStream with batched updates for better performance
      const textStreamPromise = (async () => {
        let chunkCount = 0;
        let lastUpdateTime = Date.now();
        let lastUpdateLength = 0;
        let pendingUpdate: NodeJS.Timeout | null = null;
        
        // Batching configuration
        const BATCH_DELAY_MS = 100; // Wait 100ms between updates
        const MIN_CHARS_PER_UPDATE = 10; // Update at least every 10 chars
        const MAX_DELAY_MS = 500; // Force update every 500ms even if small
        
        const flushUpdate = async () => {
          if (pendingUpdate) {
            clearTimeout(pendingUpdate);
            pendingUpdate = null;
          }
          if (updateStatus && accumulatedText.length > 0) {
            await updateStatus(accumulatedText);
            lastUpdateTime = Date.now();
            lastUpdateLength = accumulatedText.length;
          }
        };
        
        for await (const textDelta of result.textStream) {
          chunkCount++;
          accumulatedText += textDelta;
          const timeSinceLastUpdate = Date.now() - lastUpdateTime;
          const charsSinceLastUpdate = accumulatedText.length - lastUpdateLength;
          
          // Update immediately if:
          // 1. This is the first chunk (show something immediately)
          // 2. We've accumulated enough characters (MIN_CHARS_PER_UPDATE)
          // 3. Too much time has passed (MAX_DELAY_MS)
          const shouldUpdateImmediately = 
            chunkCount === 1 || 
            charsSinceLastUpdate >= MIN_CHARS_PER_UPDATE ||
            timeSinceLastUpdate >= MAX_DELAY_MS;
          
          if (shouldUpdateImmediately) {
            await flushUpdate();
          } else {
            // Schedule a batched update
            if (pendingUpdate) {
              clearTimeout(pendingUpdate);
            }
            pendingUpdate = setTimeout(flushUpdate, BATCH_DELAY_MS);
          }
        }
        
        // Flush any pending update
        await flushUpdate();
        
        console.log(`[Manager] Finished reading textStream. Total chunks: ${chunkCount}, Final text length: ${accumulatedText.length}`);
      })();

      // Wait for both streams to complete
      await Promise.all([fullStreamPromise, textStreamPromise]);
    };

    await processStreams();

    // Wait for the final result
    const finalResult = await result;
    const finalText = accumulatedText || finalResult.text || "";
    
    if (!routedAgent) {
      console.log(`[Manager] Query handled directly (no handoff): "${query}"`);
    }
    
    console.log(`[Manager] Returning final text (length=${finalText.length})`);
    return finalText;
  } catch (error) {
    console.error(`[Manager] Error processing query: "${query}"`, error);
    return "eh...错了错了, 完犊子！";
  }
}

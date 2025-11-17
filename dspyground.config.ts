import { tool, zodSchema } from 'ai'
import { z } from 'zod'
import { exa } from './lib/utils'
import { analyzeHasMetricPercentage } from './lib/agents/okr-reviewer-agent'

// Import tools from your existing codebase
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

const mgrOkrReviewTool = tool({
  description:
    "Analyze manager OKR metrics by checking has_metric_percentage per city company. This tool queries DuckDB to analyze if management criteria are met by managers of different levels across different city companies.",
  parameters: zodSchema(
    z.object({
      period: z
        .string()
        .describe(
          "The period to analyze (e.g., '10 月', '11 月', '9 月'). Defaults to current month if not specified."
        ),
    })
  ),
  execute: async ({ period }: { period: string }) => {
    try {
      const analysis = await analyzeHasMetricPercentage(period);
      return analysis;
    } catch (error: any) {
      return {
        error: error.message || "Failed to analyze OKR metrics",
        period,
      };
    }
  },
});

export default {
  // Tools available to the manager agent
  tools: {
    searchWeb: searchWebTool,
    mgr_okr_review: mgrOkrReviewTool,
  },

  // System prompt for the manager agent (optimizes routing decisions)
  systemPrompt: `You are a Feishu/Lark AI assistant that routes queries to specialist agents. Most user queries will be in Chinese (中文).

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

  // Optional: Define a Zod schema for structured output (config only)
  // schema: z.object({
  //   response: z.string().describe('The response text'),
  //   sentiment: z.enum(['positive', 'negative', 'neutral']).describe('The sentiment of the response'),
  //   confidence: z.number().min(0).max(1).describe('Confidence score')
  // }),

  // Preferences (config only - not editable in UI)
  preferences: {
    // Model used for interactive chat/testing in DSPyground UI
    // Should match your production model for consistency
    selectedModel: 'openrouter/kwaipilot/kat-coder-pro:free',
    
    useStructuredOutput: false,
    
    // ⚠️ IMPORTANT: Model to optimize for (the one that generates responses during optimization)
    // This should match your production model in lib/agents/manager-agent.ts
    // The optimized prompt will be tuned specifically for this model
    optimizationModel: 'openrouter/kwaipilot/kat-coder-pro:free',
    
    // Model used for evaluation/judgment (LLM-as-judge)
    // Should be a more capable model than optimizationModel for better evaluation
    // Options: 'openai/gpt-4o', 'openai/gpt-4-turbo', 'anthropic/claude-3-opus', 'openrouter/google/gemini-2.5-flash-lite'
    reflectionModel: 'openrouter/google/gemini-2.5-flash-lite',
    
    // Optimization parameters
    batchSize: 3,        // Number of samples per optimization iteration
    numRollouts: 10,     // Number of optimization iterations (more = better but slower)
    
    // Metrics to optimize for (weighted in metricsPrompt.dimensions)
    selectedMetrics: ['accuracy', 'tool_accuracy', 'tone', 'efficiency'],
    
    optimizeStructuredOutput: false
  },

  // Metrics evaluation configuration (config only - not editable in UI)
  metricsPrompt: {
    evaluation_instructions: 'You are an expert AI evaluator. Evaluate the generated agent trajectory.',
    dimensions: {
      tone: {
        name: 'Tone',
        description: 'Does it match the desired communication style? Consider the user feedback about tone.',
        weight: 1.0
      },
      accuracy: {
        name: 'Accuracy',
        description: 'Is the information correct and helpful? Does the agent route to the correct specialist? Are responses accurate for the domain?',
        weight: 1.5 // Higher weight for routing and response accuracy
      },
      efficiency: {
        name: 'Efficiency',
        description: 'Count the number of assistant turns and tool calls. Lower score for unnecessary tool calls or extra turns (e.g., calling tool1 when not needed, then realizing tool2 is required = inefficient).',
        weight: 1.0
      },
      tool_accuracy: {
        name: 'Tool Accuracy',
        description: 'Were the right tools used appropriately? For OKR queries, mgr_okr_review should be used. For general queries, searchWeb should be used. Routing to correct specialist agent is critical.',
        weight: 1.5 // Higher weight for routing accuracy
      },
      guardrails: {
        name: 'Guardrails',
        description: 'Does it follow safety guidelines and constraints?',
        weight: 1.0
      }
    },
    positive_feedback_instruction: 'This is a POSITIVE example (user approved this response).\nYour task: Compare the generated trajectory to the gold trajectory.\nThe generated response should match or exceed the quality of the gold trajectory.',
    negative_feedback_instruction: 'This is a NEGATIVE example (user rejected this response).\nYour task: Evaluate the generated trajectory in isolation.\nThe generated response should AVOID the issues mentioned in the user feedback.',
    comparison_positive: 'Compare the generated trajectory to the gold trajectory. It should be at least as good.',
    comparison_negative: 'Check if the generated trajectory avoids the issues mentioned in the negative feedback.'
  },

  // Voice feedback configuration (optional - requires OPENAI_API_KEY)
  // Enable voice input in feedback dialog by pressing and holding space bar
  voiceFeedback: {
    enabled: true,
    transcriptionModel: 'whisper-1', // Only OpenAI Whisper is supported
    extractionModel: 'openai/gpt-4o-mini' // Model to extract rating and feedback from transcript
  }
}


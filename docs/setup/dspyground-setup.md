# DSPyground Setup Guide

DSPyground has been configured for your multi-agent TypeScript system. This guide will help you get started.

## ✅ What's Been Configured

1. **Tools Imported**:
   - `searchWeb`: Web search tool (Exa API)
   - `mgr_okr_review`: OKR metrics analysis tool

2. **System Prompt**: Your manager agent's routing instructions (optimized for routing decisions)

3. **Models**: Configured to use OpenRouter models matching your setup

4. **Metrics**: Optimized for routing accuracy, tool usage, tone, and efficiency

## 🚀 Quick Start

### 1. Set Up Environment Variables

DSPyground requires an AI Gateway API key. You have two options:

#### Option A: Use Vercel AI Gateway (Recommended)

1. Get your AI Gateway API key from: https://vercel.com/docs/ai-gateway/getting-started
2. Add to your `.env` file:
   ```bash
   AI_GATEWAY_API_KEY=your_ai_gateway_key_here
   ```

#### Option B: Use Direct API Keys

If you prefer not to use AI Gateway, you can modify the config to use your existing `OPENROUTER_API_KEY` directly (requires code changes).

### 2. Optional: Voice Feedback

If you want voice feedback in the evaluation dialog:
```bash
OPENAI_API_KEY=your_openai_api_key_here
```

### 3. Start DSPyground

```bash
npx dspyground dev
```

This will start the DSPyground UI at `http://localhost:3000` (or next available port).

## 📝 How to Use DSPyground

### Step 1: Collect Samples

1. **Open the chat interface** in DSPyground
2. **Test your agent** with various queries:
   - OKR queries: "查看这个月的OKR设定情况"
   - General queries: "Hello, how are you?"
   - Edge cases: Queries that might route incorrectly
3. **Save samples** by clicking the `+` button:
   - **Positive feedback**: Good responses (these become reference examples)
   - **Negative feedback**: Bad responses (these guide what to avoid)

### Step 2: Organize Samples

Create sample groups for different scenarios:
- **"OKR Routing"**: Test OKR queries routing to OKR Reviewer
- **"General Queries"**: Test fallback to web search
- **"Edge Cases"**: Test ambiguous queries
- **"Chinese Queries"**: Test Chinese language understanding

### Step 3: Optimize

1. Click **"Optimize"** button
2. Watch the GEPA optimization process:
   - Sample generation
   - Evaluation with reflection model
   - Prompt improvement iterations
3. Review results in the **History** tab
4. Copy the optimized prompt and update your `lib/agents/manager-agent.ts`

## 🎯 What to Optimize

### Primary Goals

1. **Routing Accuracy**: Ensure queries route to correct specialist agents
2. **Tool Usage**: Correct tools used at right times
3. **Response Quality**: Better responses in Chinese
4. **Efficiency**: Fewer unnecessary tool calls

### Sample Collection Strategy

**Good Samples to Collect**:

1. **OKR Queries**:
   - ✅ "查看这个月的OKR设定情况" → Should route to OKR Reviewer
   - ✅ "指标覆盖率是多少？" → Should route to OKR Reviewer
   - ❌ "OKR是什么？" → Should use web search (general question)

2. **General Queries**:
   - ✅ "今天天气怎么样？" → Should use web search
   - ✅ "最新的AI新闻" → Should use web search

3. **Edge Cases**:
   - ✅ Ambiguous queries that test routing logic
   - ✅ Queries in mixed Chinese/English

## 🔧 Configuration Details

### Current Configuration

- **Models**:
  - `selectedModel`: `openrouter/kwaipilot/kat-coder-pro:free` (for chat/testing)
  - `optimizationModel`: `openrouter/kwaipilot/kat-coder-pro:free` (model to optimize)
  - `reflectionModel`: `openai/gpt-4o` (evaluation judge)

- **Metrics** (weighted):
  - `accuracy`: 1.5 (routing and response accuracy)
  - `tool_accuracy`: 1.5 (correct tool usage)
  - `tone`: 1.0 (communication style)
  - `efficiency`: 1.0 (minimize unnecessary calls)

- **Optimization**:
  - `batchSize`: 3 (samples per iteration)
  - `numRollouts`: 10 (optimization iterations)

### Customizing Configuration

Edit `dspyground.config.ts` to:
- Add more tools
- Adjust metrics weights
- Change models
- Modify evaluation criteria

## 📊 Understanding Results

### Optimization History

After running optimization, check the History tab:
- **Score progression**: See how metrics improve over iterations
- **Prompt evolution**: Compare original vs optimized prompts
- **Sample performance**: See which samples improved most

### Metrics Explained

- **Accuracy**: Did the agent route correctly? Was the response accurate?
- **Tool Accuracy**: Were the right tools used? Was routing correct?
- **Tone**: Does the response match desired communication style?
- **Efficiency**: Were tool calls necessary? Any redundant steps?
- **Guardrails**: Did it follow safety guidelines?

## 🔄 Integration with Your Codebase

### After Optimization

1. **Copy optimized prompt** from History tab
2. **Update** `lib/agents/manager-agent.ts`:
   ```typescript
   export const managerAgentInstance = new Agent({
     // ... other config
     instructions: `[PASTE OPTIMIZED PROMPT HERE]`,
     // ...
   });
   ```
3. **Test** the updated agent in your Feishu app
4. **Iterate**: Collect more samples and optimize again

## 🐛 Troubleshooting

### Issue: Tools not working

- **Check**: Environment variables are set correctly
- **Check**: Tool imports in `dspyground.config.ts` are correct
- **Check**: Database connections (for `mgr_okr_review`)

### Issue: Optimization not improving

- **Collect more diverse samples**
- **Adjust metric weights** in config
- **Increase `numRollouts`** for more iterations
- **Check reflection model** is capable enough

### Issue: Models not responding

- **Check**: AI Gateway API key is valid
- **Check**: OpenRouter API key is set (if using directly)
- **Check**: Model names are correct format

## 📚 Next Steps

1. **Start collecting samples** with real queries
2. **Run first optimization** after collecting 10-20 samples
3. **Compare** optimized vs original prompts
4. **Deploy** optimized prompt to production
5. **Monitor** performance and collect more samples

## 🔗 Resources

- [DSPyground GitHub](https://github.com/Scale3-Labs/dspyground)
- [GEPA Algorithm](https://github.com/stanfordnlp/dspy)
- [Vercel AI Gateway](https://vercel.com/docs/ai-gateway/getting-started)

## 💡 Tips

1. **Start small**: Collect 5-10 samples first, optimize, then expand
2. **Focus on routing**: Most important for your multi-agent system
3. **Test edge cases**: Ambiguous queries reveal routing issues
4. **Iterate**: Optimization improves with more samples
5. **Monitor**: Track which optimizations actually improve production performance


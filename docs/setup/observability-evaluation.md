# Observability Tool Evaluation: DSPyground vs Evalite

## Your Use Case

- **Multi-agent TypeScript system** using `@ai-sdk-tools/agents`
- **Manager agent** orchestrates 4 specialist agents (OKR Reviewer, Alignment, P&L, DPA PM)
- **Vercel AI SDK** for tool calling and streaming
- **Bun runtime** with TypeScript
- **Needs**: Observability, monitoring, evaluation, and prompt optimization

---

## 1. DSPyground

**GitHub**: https://github.com/Scale3-Labs/dspyground  
**Focus**: Prompt optimization using DSPy GEPA optimizer

### ✅ Strengths for Your Use Case

1. **AI SDK Integration**
   - Built specifically for Vercel AI SDK (`ai` package)
   - Works with your existing tools and prompts
   - Supports tool-calling agents (perfect for your specialist agents)

2. **Prompt Optimization**
   - Uses GEPA (Genetic-Pareto Evolutionary Algorithm) to optimize prompts
   - Evaluates on full conversational trajectories (not just final responses)
   - Multi-metric optimization: tone, accuracy, efficiency, tool_accuracy, guardrails
   - Can optimize your manager agent's routing instructions

3. **Sample Collection & Evaluation**
   - Interactive chat interface to collect trajectory samples
   - Positive/negative feedback system
   - Sample groups for organizing test cases
   - LLM-as-judge evaluation with reflection-based scoring

4. **TypeScript Native**
   - Pure TypeScript implementation
   - Works with Bun
   - Local data storage (`.dspyground/data/`)

5. **Real-time Monitoring**
   - Streams optimization progress
   - Watch sample generation and evaluation as they happen
   - Run history with scores and metrics

### ❌ Limitations

1. **Not Full Observability**
   - Focuses on prompt optimization, not runtime monitoring
   - No distributed tracing or APM features
   - Limited to evaluation/optimization workflow

2. **Learning Curve**
   - Requires understanding GEPA algorithm
   - Need to collect samples manually
   - Configuration complexity (`dspyground.config.ts`)

3. **No Production Monitoring**
   - Designed for development/testing phase
   - Doesn't monitor live production traffic
   - No alerting or real-time dashboards

### Best For
- **Optimizing agent prompts** (especially manager routing instructions)
- **Evaluating agent performance** on collected samples
- **Improving agent responses** through iterative optimization
- **Development/testing phase** improvements

---

## 2. Evalite

**GitHub**: https://github.com/mattpocock/evalite  
**Focus**: Evaluation framework for LLM applications

### ✅ Strengths (Based on Typical Evaluation Frameworks)

1. **Structured Evaluation**
   - Likely provides test suites for agent evaluation
   - Structured approach to testing LLM applications
   - TypeScript-first (Matt Pocock is TypeScript expert)

2. **Lightweight**
   - Probably simpler than DSPyground
   - Focused on evaluation, not optimization
   - Easier to integrate

### ❌ Limitations (Inferred)

1. **Less Information Available**
   - Limited public documentation
   - May not have prompt optimization features
   - Unknown if it supports multi-agent systems

2. **Evaluation-Only**
   - Likely focused on testing, not optimization
   - May not have runtime monitoring
   - Probably requires manual test case creation

### Best For (Inferred)
- **Testing agent responses** against expected outputs
- **Regression testing** for agent changes
- **Simple evaluation** workflows

---

## Comparison Matrix

| Feature | DSPyground | Evalite |
|---------|-----------|---------|
| **Prompt Optimization** | ✅ Yes (GEPA) | ❓ Unknown |
| **AI SDK Integration** | ✅ Native | ❓ Unknown |
| **Multi-Agent Support** | ✅ Yes | ❓ Unknown |
| **Tool Calling Support** | ✅ Yes | ❓ Unknown |
| **Runtime Monitoring** | ❌ No | ❌ Likely No |
| **Sample Collection UI** | ✅ Yes | ❓ Unknown |
| **TypeScript Support** | ✅ Yes | ✅ Likely Yes |
| **Bun Compatible** | ✅ Yes | ✅ Likely Yes |
| **Learning Curve** | ⚠️ Medium-High | ⚠️ Likely Low |
| **Production Ready** | ⚠️ Dev/Test | ⚠️ Dev/Test |
| **Documentation** | ✅ Comprehensive | ⚠️ Limited |

---

## Recommendation

### For Your Multi-Agent System:

**Primary Recommendation: DSPyground** ✅

**Why:**
1. **Perfect Fit**: Built for AI SDK + multi-agent systems
2. **Optimization**: Can optimize your manager agent's routing instructions
3. **Tool Support**: Handles tool-calling agents (your specialist agents use tools)
4. **Multi-Metric**: Evaluates tone, accuracy, efficiency, tool accuracy (all relevant)
5. **Chinese Support**: Can optimize prompts for Chinese queries (your system uses Chinese)

**Use Cases:**
- Optimize manager agent routing instructions
- Improve specialist agent prompts
- Evaluate agent performance on collected samples
- Test different prompt variations

**Limitations to Address:**
- Add runtime monitoring separately (e.g., LangSmith, OpenTelemetry)
- Use for development/testing, not production monitoring

### Secondary: Evalite (If Available)

**Consider if:**
- You need simpler evaluation-only workflow
- DSPyground is too complex
- You just want to test agent responses

**Action**: Check Evalite's actual features first (limited public info)

---

## Implementation Strategy

### Phase 1: Evaluation & Optimization (DSPyground)

1. **Install DSPyground**
   ```bash
   npx dspyground@latest init
   ```

2. **Configure for Your Agents**
   - Import your manager agent's instructions
   - Import specialist agent tools
   - Set up evaluation metrics

3. **Collect Samples**
   - Test OKR queries → OKR Reviewer
   - Test P&L queries → P&L Agent
   - Test routing edge cases
   - Collect positive/negative examples

4. **Optimize Prompts**
   - Run GEPA optimization
   - Improve routing accuracy
   - Enhance agent responses

### Phase 2: Runtime Monitoring (Separate Tool)

Add one of these for production monitoring:

- **LangSmith** (best for AI agents)
- **OpenTelemetry** + Grafana/Datadog
- **Custom logging** with structured logs

---

## Next Steps

1. **Try DSPyground**:
   - Check if it works with your current setup
   - Test with one agent first (e.g., OKR Reviewer)
   - Collect initial samples

2. **Research Evalite**:
   - Check GitHub repo for actual features
   - See if it supports multi-agent systems
   - Compare with DSPyground

3. **Hybrid Approach**:
   - Use DSPyground for prompt optimization
   - Add LangSmith/OpenTelemetry for runtime monitoring
   - Use Evalite (if suitable) for regression testing

---

## Questions to Answer

Before deciding:

1. **Primary Goal?**
   - [ ] Optimize prompts → DSPyground
   - [ ] Test responses → Evalite (if available)
   - [ ] Monitor production → Neither (need LangSmith/OTel)

2. **Time Investment?**
   - [ ] Willing to learn GEPA → DSPyground
   - [ ] Want simple solution → Evalite (if available)

3. **Multi-Agent Support?**
   - [ ] Need to optimize routing → DSPyground
   - [ ] Just test individual agents → Either

---

## Conclusion

**DSPyground** appears to be the better fit for your multi-agent TypeScript system because:
- Native AI SDK support
- Multi-agent optimization
- Tool-calling support
- Comprehensive evaluation framework

However, you'll still need a separate solution for **runtime observability** (LangSmith, OpenTelemetry, etc.).

**Recommendation**: Start with DSPyground for prompt optimization, then add LangSmith or OpenTelemetry for production monitoring.


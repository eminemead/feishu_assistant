/**
 * Skill-Based Router
 * 
 * Uses Agent Routing skill to classify queries declaratively.
 * Makes routing logic testable, maintainable, and version-controlled.
 * 
 * Supports three execution types:
 * - workflow: Execute via Mastra workflow (deterministic, multi-step)
 * - subagent: Delegate to specialist agent (non-deterministic)
 * - skill: Inject instructions into manager (deprecated)
 * 
 * Performance: <1ms per routing decision (cached, pre-compiled patterns)
 */

import { getSkillRegistry } from "../skills/skill-registry";
import type { Skill, SkillExecutionType } from "../skills/types";
import { getWorkflowRegistry } from "../workflows";

export type RoutingDecision = {
  agentName: string;
  category: "okr" | "dpa_mom" | "pnl" | "alignment" | "general";
  confidence: number;
  matchedKeywords: string[];
  type: SkillExecutionType | "general";
  /** Workflow ID when type="workflow" */
  workflowId?: string;
};

/**
 * Routing rule from skill metadata
 */
interface RoutingRule {
  keywords: string[];
  priority: number;
  enabled: boolean;
  type: SkillExecutionType;
  workflowId?: string;
}

/**
 * Compiled routing rule with pre-compiled regex patterns
 */
interface CompiledRoutingRule {
  agentName: string;
  category: "okr" | "dpa_mom" | "pnl" | "alignment";
  patterns: RegExp[];
  keywords: string[]; // Store original keywords for match reporting
  priority: number;
  enabled: boolean;
  type: SkillExecutionType;
  workflowId?: string;
}

/**
 * Load routing skill and extract routing rules
 */
function getRoutingRules(skill: Skill): Record<string, RoutingRule> {
  // First try to get from metadata
  const metadata = skill.metadata as Record<string, unknown>;
  if (metadata.routing_rules) {
    return metadata.routing_rules as Record<string, RoutingRule>;
  }
  
  // For agent-routing skill, parse from instructions
  if (skill.id === "agent-routing" || skill.metadata.name === "Agent Routing") {
    const rules: Record<string, RoutingRule> = {};
    const lines = skill.instructions.split('\n');
    let currentAgent: string | null = null;
    let currentRule: Partial<RoutingRule> = {};
    
    for (const line of lines) {
      // Match agent headers like "### DPA Mom (Priority 1 - Highest)"
      const agentMatch = line.match(/^###\s*(.+?)\s*\(Priority\s*(\d+)/);
      if (agentMatch) {
        // Save previous rule
        if (currentAgent && currentRule.keywords) {
          rules[currentAgent] = {
            keywords: currentRule.keywords,
            priority: currentRule.priority || 999,
            enabled: currentRule.enabled !== false,
            type: currentRule.type || "skill",
            workflowId: currentRule.workflowId,
          };
        }
        
        // Start new rule
        currentAgent = agentMatch[1].toLowerCase().replace(/\s+/g, '_');
        currentRule = {
          priority: parseInt(agentMatch[2]),
          enabled: true,
          keywords: [],
        };
      }
      // Match keywords line
      else if (line.includes('**Keywords**:') && currentAgent) {
        const keywordsMatch = line.match(/\*\*Keywords\*\*:\s*(.+)$/);
        if (keywordsMatch) {
          currentRule.keywords = keywordsMatch[1].split(',').map(k => k.trim());
        }
      }
      // Match type line (now supports "workflow")
      else if (line.includes('**Type**:') && currentAgent) {
        const typeMatch = line.match(/\*\*Type\*\*:\s*(.+)$/);
        if (typeMatch) {
          const type = typeMatch[1].toLowerCase();
          if (type.includes('workflow')) {
            currentRule.type = 'workflow';
          } else if (type.includes('subagent')) {
            currentRule.type = 'subagent';
          } else {
            currentRule.type = 'skill';
          }
        }
      }
      // Match workflowId line
      else if (line.includes('**Workflow**:') && currentAgent) {
        const workflowMatch = line.match(/\*\*Workflow\*\*:\s*`?([^`\s]+)`?/);
        if (workflowMatch) {
          currentRule.workflowId = workflowMatch[1];
        }
      }
      // Match status line
      else if (line.includes('**Status**:') && currentAgent) {
        const statusMatch = line.match(/\*\*Status\*\*:\s*(.+)$/);
        if (statusMatch) {
          currentRule.enabled = statusMatch[1].toLowerCase().includes('active');
        }
      }
    }
    
    // Save last rule
    if (currentAgent && currentRule.keywords) {
      rules[currentAgent] = {
        keywords: currentRule.keywords,
        priority: currentRule.priority || 999,
        enabled: currentRule.enabled !== false,
        type: currentRule.type || "skill",
        workflowId: currentRule.workflowId,
      };
    }
    
    // Map display names to agent names
    const mappedRules: Record<string, RoutingRule> = {};
    for (const [key, rule] of Object.entries(rules)) {
      let agentName = key;
      if (key === 'dpa_mom') agentName = 'dpa_mom';
      else if (key === 'p&l_agent') agentName = 'pnl_agent';
      else if (key === 'alignment_agent') agentName = 'alignment_agent';
      else if (key === 'okr_reviewer') agentName = 'okr_reviewer';
      
      mappedRules[agentName] = rule;
    }
    
    return mappedRules;
  }
  
  return {};
}

/**
 * Compile routing rules into optimized patterns
 */
function compileRoutingRules(skill: Skill): CompiledRoutingRule[] {
  const routingRules = getRoutingRules(skill);
  const compiled: CompiledRoutingRule[] = [];
  
  // Map agent names to categories
  const categoryMap: Record<string, "okr" | "dpa_mom" | "pnl" | "alignment"> = {
    okr_reviewer: "okr",
    dpa_mom: "dpa_mom",
    pnl_agent: "pnl",
    alignment_agent: "alignment",
  };
  
  for (const [agentName, rules] of Object.entries(routingRules)) {
    if (!rules.enabled) continue;
    
    const category = categoryMap[agentName];
    if (!category) continue; // Skip unknown agents
    
    // Pre-compile regex patterns for each keyword
    const patterns = rules.keywords.map(keyword => {
      // Word boundary matching for better precision
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`\\b${escaped}\\b`, "i");
    });
    
    compiled.push({
      agentName,
      category,
      patterns,
      keywords: rules.keywords, // Store original keywords
      priority: rules.priority || 999,
      enabled: rules.enabled,
      type: rules.type || "skill",
      workflowId: rules.workflowId,
    });
  }
  
  // Sort by priority (lower number = higher priority)
  compiled.sort((a, b) => a.priority - b.priority);
  
  return compiled;
}

/**
 * Score a query against compiled routing rules
 */
function scoreQuery(
  query: string,
  rules: CompiledRoutingRule[]
): Array<{
  rule: CompiledRoutingRule;
  score: number;
  matches: string[];
}> {
  const queryLower = query.toLowerCase();
  const scores: Array<{
    rule: CompiledRoutingRule;
    score: number;
    matches: string[];
  }> = [];
  
  for (const rule of rules) {
    if (!rule.enabled) continue;
    
    const matches: string[] = [];
    
    // Test each pre-compiled pattern
    for (let i = 0; i < rule.patterns.length; i++) {
      const pattern = rule.patterns[i];
      if (pattern.test(queryLower)) {
        // Extract the matched keyword from original keywords array
        matches.push(rule.keywords[i]);
      }
    }
    
    if (matches.length > 0) {
      // Score = (matches / total_keywords) * priority_weight
      // Priority weight: higher priority (lower number) = higher weight
      const priorityWeight = 1 / rule.priority;
      const score = (matches.length / rule.patterns.length) * priorityWeight;
      
      scores.push({
        rule,
        score,
        matches,
      });
    }
  }
  
  // Sort by score (descending)
  scores.sort((a, b) => b.score - a.score);
  
  return scores;
}

// Cache compiled rules after first load
let cachedCompiledRules: CompiledRoutingRule[] | null = null;
let cachedRoutingSkill: Skill | null = null;

/**
 * Create routing decision from best match
 */
function createDecision(
  bestMatch: { rule: CompiledRoutingRule; score: number; matches: string[] }
): RoutingDecision {
  const confidence = bestMatch.score > 0.3 
    ? Math.min(bestMatch.score * 2, 1.0)
    : 0.5;
  
  return {
    agentName: bestMatch.rule.agentName,
    category: bestMatch.rule.category,
    confidence,
    matchedKeywords: bestMatch.matches,
    type: bestMatch.rule.type,
    workflowId: bestMatch.rule.workflowId,
  };
}

/**
 * Create fallback decision for general routing
 */
function createFallbackDecision(): RoutingDecision {
  return {
    agentName: "manager",
    category: "general",
    confidence: 0.5,
    matchedKeywords: [],
    type: "general",
  };
}

/**
 * Route query using Agent Routing skill
 */
export async function routeQuery(query: string): Promise<RoutingDecision> {
  const registry = getSkillRegistry();
  
  // Clear cache to ensure latest rules are loaded (for development)
  if (process.env.NODE_ENV === 'development') {
    clearRoutingCache();
  }
  
  // Fast path: use cached compiled rules
  if (cachedCompiledRules && cachedRoutingSkill) {
    const scores = scoreQuery(query, cachedCompiledRules);
    
    if (scores.length === 0) {
      return createFallbackDecision();
    }
    
    return createDecision(scores[0]);
  }
  
  // Slow path: load and compile rules (first time only)
  const routingSkill = registry
    .getAllSkills()
    .find(skill => skill.id === "agent-routing" || skill.metadata.name === "Agent Routing");
  
  if (!routingSkill) {
    console.warn("[Router] Routing skill not found, falling back to general");
    return createFallbackDecision();
  }
  
  // Compile and cache rules
  cachedRoutingSkill = routingSkill;
  cachedCompiledRules = compileRoutingRules(routingSkill);
  
  // Now use cached rules - call the internal scoring function directly
  const scores = scoreQuery(query, cachedCompiledRules);
  
  if (scores.length === 0) {
    return createFallbackDecision();
  }
  
  return createDecision(scores[0]);
}

/**
 * Check if a routing decision should use workflow execution
 */
export function shouldUseWorkflow(decision: RoutingDecision): boolean {
  if (decision.type !== "workflow") {
    return false;
  }
  
  if (!decision.workflowId) {
    console.warn(`[Router] Workflow routing requested but no workflowId specified for ${decision.agentName}`);
    return false;
  }
  
  // Verify workflow exists in registry
  const workflowRegistry = getWorkflowRegistry();
  if (!workflowRegistry.has(decision.workflowId)) {
    console.warn(`[Router] Workflow ${decision.workflowId} not found in registry`);
    return false;
  }
  
  return true;
}

/**
 * Get routing summary for logging/debugging
 */
export function getRoutingSummary(decision: RoutingDecision): string {
  const parts = [
    `category=${decision.category}`,
    `type=${decision.type}`,
    `confidence=${decision.confidence.toFixed(2)}`,
  ];
  
  if (decision.workflowId) {
    parts.push(`workflowId=${decision.workflowId}`);
  }
  
  if (decision.matchedKeywords.length > 0) {
    parts.push(`keywords=[${decision.matchedKeywords.join(",")}]`);
  }
  
  return parts.join(" ");
}

/**
 * Batch route multiple queries (for testing)
 */
export async function routeQueries(queries: string[]): Promise<RoutingDecision[]> {
  return Promise.all(queries.map(query => routeQuery(query)));
}

/**
 * Clear cache (useful for testing)
 */
export function clearRoutingCache(): void {
  cachedCompiledRules = null;
  cachedRoutingSkill = null;
}

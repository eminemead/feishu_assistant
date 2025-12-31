/**
 * Agent Skills Standard Types
 * 
 * Based on the Agent Skills Standard (agentskills.io)
 * Skills are modular, portable, and reusable instruction packages for AI agents.
 * 
 * Extended with workflow support for deterministic skill execution.
 */

/**
 * Skill execution type
 * - "workflow": Execute via Mastra workflow (deterministic, multi-step)
 * - "subagent": Delegate to specialist agent (non-deterministic)
 * - "skill": Inject instructions into manager (deprecated)
 */
export type SkillExecutionType = "workflow" | "subagent" | "skill";

/**
 * Routing rule configuration for a skill
 */
export interface SkillRoutingRule {
  /** Keywords that trigger this skill */
  keywords: string[];
  /** Priority (lower = higher priority) */
  priority: number;
  /** Whether the rule is enabled */
  enabled: boolean;
  /** Execution type */
  type: SkillExecutionType;
}

/**
 * Skill metadata from YAML frontmatter
 */
export interface SkillMetadata {
  name: string;
  description: string;
  version: string;
  tags?: string[];
  keywords?: string[];
  author?: string;
  dependencies?: string[];
  tools?: string[];
  
  /**
   * Workflow ID to execute (when type="workflow")
   * Must match a registered workflow in lib/workflows/
   */
  workflowId?: string;
  
  /**
   * Agent name for subagent routing (when type="subagent")
   */
  agentName?: string;
  
  /**
   * Routing rules for query classification
   */
  routing_rules?: Record<string, SkillRoutingRule>;
}

/**
 * Loaded skill with parsed content
 */
export interface Skill {
  /** Skill identifier (directory name) */
  id: string;
  
  /** Parsed metadata from YAML frontmatter */
  metadata: SkillMetadata;
  
  /** Instructions from markdown body */
  instructions: string;
  
  /** Path to skill directory */
  path: string;
  
  /** Path to SKILL.md file */
  skillFilePath: string;
  
  /** Available resource files */
  resources?: string[];
  
  /** Loaded timestamp */
  loadedAt: Date;
}

/**
 * Skill relevance score for selection
 */
export interface SkillRelevance {
  skill: Skill;
  score: number;
  matchedKeywords: string[];
  matchedTags: string[];
}

/**
 * Options for skill injection
 */
export interface SkillInjectionOptions {
  /** Maximum number of skills to inject */
  maxSkills?: number;
  
  /** Minimum relevance score threshold */
  minScore?: number;
  
  /** Whether to include skill metadata in prompt */
  includeMetadata?: boolean;
  
  /** Whether to include resource references */
  includeResources?: boolean;
}

/**
 * Result of skill injection
 */
export interface SkillInjectionResult {
  /** Composed instruction text */
  instructions: string;
  
  /** Skills that were injected */
  injectedSkills: Skill[];
  
  /** Total token estimate (approximate) */
  estimatedTokens: number;
}


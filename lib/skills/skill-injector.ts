/**
 * Skill Injector - Injects skills into agent prompts
 * 
 * Composes skill instructions and injects them into agent system prompts
 * or user messages, respecting context window limits.
 */

import type { Skill, SkillInjectionOptions, SkillInjectionResult } from "./types";
import { getSkillRegistry } from "./skill-registry";

/**
 * Rough token estimation (1 token ≈ 4 characters for English/Chinese)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Compose skill instructions into a single prompt
 */
function composeSkillInstructions(
  skills: Skill[],
  options: SkillInjectionOptions = {}
): string {
  const parts: string[] = [];
  
  for (const skill of skills) {
    let skillText = "";
    
    // Add metadata header if requested
    if (options.includeMetadata) {
      skillText += `## Skill: ${skill.metadata.name}\n`;
      skillText += `**Description**: ${skill.metadata.description}\n`;
      if (skill.metadata.version) {
        skillText += `**Version**: ${skill.metadata.version}\n`;
      }
      if (skill.metadata.tags && skill.metadata.tags.length > 0) {
        skillText += `**Tags**: ${skill.metadata.tags.join(", ")}\n`;
      }
      skillText += "\n";
    }
    
    // Add instructions
    skillText += skill.instructions;
    
    // Add resource references if requested
    if (options.includeResources && skill.resources && skill.resources.length > 0) {
      skillText += `\n\n**Available Resources**: ${skill.resources.join(", ")}`;
    }
    
    parts.push(skillText);
  }
  
  return parts.join("\n\n---\n\n");
}

/**
 * Inject relevant skills into agent instructions
 */
export async function injectSkillsIntoInstructions(
  baseInstructions: string,
  query: string,
  options: SkillInjectionOptions = {}
): Promise<SkillInjectionResult> {
  const registry = getSkillRegistry();
  
  // Find relevant skills
  const relevantSkills = registry.findRelevantSkills(query, {
    maxResults: options.maxSkills || 3,
    minScore: options.minScore || 0.5,
  });
  
  if (relevantSkills.length === 0) {
    return {
      instructions: baseInstructions,
      injectedSkills: [],
      estimatedTokens: estimateTokens(baseInstructions),
    };
  }
  
  // Extract skills from relevance results
  const skillsToInject = relevantSkills.map(r => r.skill);
  
  // Compose skill instructions
  const skillInstructions = composeSkillInstructions(skillsToInject, options);
  
  // Combine with base instructions
  const combinedInstructions = `${baseInstructions}

---

## Active Skills

The following skills are available for this task:

${skillInstructions}`;
  
  const estimatedTokens = estimateTokens(combinedInstructions);
  
  return {
    instructions: combinedInstructions,
    injectedSkills: skillsToInject,
    estimatedTokens,
  };
}

/**
 * Inject skills into a message array (for user messages)
 */
export async function injectSkillsIntoMessages(
  messages: Array<{ role: string; content: string }>,
  query: string,
  options: SkillInjectionOptions = {}
): Promise<{
  messages: Array<{ role: string; content: string }>;
  injectedSkills: Skill[];
}> {
  const registry = getSkillRegistry();
  
  // Find relevant skills
  const relevantSkills = registry.findRelevantSkills(query, {
    maxResults: options.maxSkills || 3,
    minScore: options.minScore || 0.5,
  });
  
  if (relevantSkills.length === 0) {
    return {
      messages,
      injectedSkills: [],
    };
  }
  
  const skillsToInject = relevantSkills.map(r => r.skill);
  const skillInstructions = composeSkillInstructions(skillsToInject, {
    includeMetadata: true,
    ...options,
  });
  
  // Prepend skill context to the first user message
  const enhancedMessages = [...messages];
  if (enhancedMessages.length > 0 && enhancedMessages[0].role === "user") {
    enhancedMessages[0].content = `**Available Skills**:\n\n${skillInstructions}\n\n---\n\n**User Query**:\n${enhancedMessages[0].content}`;
  }
  
  return {
    messages: enhancedMessages,
    injectedSkills: skillsToInject,
  };
}

/**
 * Get skills that should be loaded for a query (for tool registration)
 */
export async function getRequiredToolsForQuery(query: string): Promise<string[]> {
  const registry = getSkillRegistry();
  const relevantSkills = registry.findRelevantSkills(query, {
    maxResults: 5,
    minScore: 0.5,
  });
  
  const toolSet = new Set<string>();
  for (const relevance of relevantSkills) {
    if (relevance.skill.metadata.tools) {
      for (const tool of relevance.skill.metadata.tools) {
        toolSet.add(tool);
      }
    }
  }
  
  return Array.from(toolSet);
}


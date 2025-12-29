/**
 * Skill Registry - Tracks and indexes available skills
 * 
 * Provides:
 * - Skill discovery by keywords/tags
 * - Skill relevance scoring
 * - Skill dependency resolution
 */

import type { Skill, SkillRelevance } from "./types";
import { loadSkillsFromDirectory } from "./skill-loader";

/**
 * Skill registry that indexes skills for fast lookup
 */
export class SkillRegistry {
  private skills: Map<string, Skill> = new Map();
  private keywordIndex: Map<string, Set<string>> = new Map();
  private tagIndex: Map<string, Set<string>> = new Map();
  private initialized = false;

  /**
   * Initialize registry by loading skills from directory
   */
  async initialize(skillsDir: string): Promise<void> {
    if (this.initialized) {
      return;
    }

    const loadedSkills = await loadSkillsFromDirectory(skillsDir);
    
    for (const skill of loadedSkills) {
      this.registerSkill(skill);
    }
    
    this.initialized = true;
    console.log(`[SkillRegistry] Initialized with ${this.skills.size} skills`);
  }

  /**
   * Register a skill in the registry
   */
  registerSkill(skill: Skill): void {
    this.skills.set(skill.id, skill);
    
    // Index by keywords
    if (skill.metadata.keywords) {
      for (const keyword of skill.metadata.keywords) {
        const normalized = keyword.toLowerCase();
        if (!this.keywordIndex.has(normalized)) {
          this.keywordIndex.set(normalized, new Set());
        }
        this.keywordIndex.get(normalized)!.add(skill.id);
      }
    }
    
    // Index by tags
    if (skill.metadata.tags) {
      for (const tag of skill.metadata.tags) {
        const normalized = tag.toLowerCase();
        if (!this.tagIndex.has(normalized)) {
          this.tagIndex.set(normalized, new Set());
        }
        this.tagIndex.get(normalized)!.add(skill.id);
      }
    }
  }

  /**
   * Get a skill by ID
   */
  getSkill(id: string): Skill | undefined {
    return this.skills.get(id);
  }

  /**
   * Get all registered skills
   */
  getAllSkills(): Skill[] {
    return Array.from(this.skills.values());
  }

  /**
   * Find relevant skills for a query
   */
  findRelevantSkills(query: string, options?: {
    maxResults?: number;
    minScore?: number;
  }): SkillRelevance[] {
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/);
    
    const relevanceMap = new Map<string, SkillRelevance>();
    
    // Score each skill
    for (const skill of this.skills.values()) {
      let score = 0;
      const matchedKeywords: string[] = [];
      const matchedTags: string[] = [];
      
      // Check keyword matches
      if (skill.metadata.keywords) {
        for (const keyword of skill.metadata.keywords) {
          const keywordLower = keyword.toLowerCase();
          if (queryLower.includes(keywordLower) || queryWords.some(word => word.includes(keywordLower))) {
            score += 2; // Keywords are weighted higher
            matchedKeywords.push(keyword);
          }
        }
      }
      
      // Check tag matches
      if (skill.metadata.tags) {
        for (const tag of skill.metadata.tags) {
          const tagLower = tag.toLowerCase();
          if (queryLower.includes(tagLower) || queryWords.some(word => word.includes(tagLower))) {
            score += 1;
            matchedTags.push(tag);
          }
        }
      }
      
      // Check name/description matches (lower weight)
      const nameLower = skill.metadata.name.toLowerCase();
      const descLower = skill.metadata.description.toLowerCase();
      if (queryWords.some(word => nameLower.includes(word))) {
        score += 0.5;
      }
      if (queryWords.some(word => descLower.includes(word))) {
        score += 0.5;
      }
      
      if (score > 0) {
        relevanceMap.set(skill.id, {
          skill,
          score,
          matchedKeywords,
          matchedTags,
        });
      }
    }
    
    // Sort by score (descending)
    const results = Array.from(relevanceMap.values())
      .sort((a, b) => b.score - a.score);
    
    // Apply filters
    let filtered = results;
    if (options?.minScore !== undefined) {
      filtered = filtered.filter(r => r.score >= options.minScore!);
    }
    if (options?.maxResults !== undefined) {
      filtered = filtered.slice(0, options.maxResults);
    }
    
    return filtered;
  }

  /**
   * Get skills by tag
   */
  getSkillsByTag(tag: string): Skill[] {
    const normalized = tag.toLowerCase();
    const skillIds = this.tagIndex.get(normalized);
    if (!skillIds) {
      return [];
    }
    
    return Array.from(skillIds)
      .map(id => this.skills.get(id))
      .filter((skill): skill is Skill => skill !== undefined);
  }

  /**
   * Get skills that require specific tools
   */
  getSkillsByTool(toolName: string): Skill[] {
    return Array.from(this.skills.values())
      .filter(skill => skill.metadata.tools?.includes(toolName));
  }

  /**
   * Clear registry (useful for testing)
   */
  clear(): void {
    this.skills.clear();
    this.keywordIndex.clear();
    this.tagIndex.clear();
    this.initialized = false;
  }
}

// Singleton instance
let registryInstance: SkillRegistry | null = null;

/**
 * Get or create the global skill registry
 */
export function getSkillRegistry(): SkillRegistry {
  if (!registryInstance) {
    registryInstance = new SkillRegistry();
  }
  return registryInstance;
}


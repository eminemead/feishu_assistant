/**
 * Skill Loader - Parses and loads Agent Skills Standard files
 * 
 * Loads SKILL.md files with YAML frontmatter and extracts:
 * - Metadata (name, description, version, tags, keywords)
 * - Instructions (markdown body)
 * - Resources (optional files in skill directory)
 */

import * as fs from "fs/promises";
import * as path from "path";
import { parse } from "yaml";
import type { Skill, SkillMetadata } from "./types";

const SKILL_FILE_NAME = "SKILL.md";
const RESOURCES_DIR = "resources";

/**
 * Parse YAML frontmatter from markdown file
 */
function parseFrontmatter(content: string): {
  frontmatter: string;
  body: string;
} {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);
  
  if (!match) {
    throw new Error("SKILL.md must contain YAML frontmatter (--- ... ---)");
  }
  
  return {
    frontmatter: match[1],
    body: match[2],
  };
}

/**
 * Load a skill from a directory
 */
export async function loadSkill(skillPath: string): Promise<Skill> {
  const skillFilePath = path.join(skillPath, SKILL_FILE_NAME);
  
  // Check if SKILL.md exists
  try {
    await fs.access(skillFilePath);
  } catch (error) {
    throw new Error(`SKILL.md not found in ${skillPath}`);
  }
  
  // Read SKILL.md
  const content = await fs.readFile(skillFilePath, "utf-8");
  
  // Parse frontmatter and body
  const { frontmatter, body } = parseFrontmatter(content);
  
  // Parse YAML metadata
  let metadata: SkillMetadata;
  try {
    const parsed = parse(frontmatter);
    metadata = {
      name: parsed.name || "",
      description: parsed.description || "",
      version: parsed.version || "1.0.0",
      tags: parsed.tags || [],
      keywords: parsed.keywords || [],
      author: parsed.author,
      dependencies: parsed.dependencies,
      tools: parsed.tools,
      // Workflow support
      type: parsed.type,  // "workflow" | "skill" | undefined
      workflowId: parsed.workflowId,  // ID of workflow to execute
      // Routing rules (for agent-routing skill)
      routing_rules: parsed.routing_rules,
    };
    
    // Validate required fields
    if (!metadata.name) {
      throw new Error("Skill metadata must include 'name'");
    }
    if (!metadata.description) {
      throw new Error("Skill metadata must include 'description'");
    }
  } catch (error) {
    throw new Error(`Failed to parse skill metadata: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  // Load resources if they exist
  const resourcesDir = path.join(skillPath, RESOURCES_DIR);
  let resources: string[] | undefined;
  
  try {
    const resourceFiles = await fs.readdir(resourcesDir);
    resources = resourceFiles.filter((file) => {
      // Only include files, not directories
      return !file.startsWith(".");
    });
  } catch (error) {
    // Resources directory doesn't exist - that's okay
    resources = undefined;
  }
  
  // Extract skill ID from directory name
  const skillId = path.basename(skillPath);
  
  return {
    id: skillId,
    metadata,
    instructions: body.trim(),
    path: skillPath,
    skillFilePath,
    resources,
    loadedAt: new Date(),
  };
}

/**
 * Load all skills from a directory
 */
export async function loadSkillsFromDirectory(skillsDir: string): Promise<Skill[]> {
  const skills: Skill[] = [];
  
  try {
    const entries = await fs.readdir(skillsDir, { withFileTypes: true });
    
    for (const entry of entries) {
      // Skip hidden files and non-directories
      if (entry.name.startsWith(".") || !entry.isDirectory()) {
        continue;
      }
      
      const skillPath = path.join(skillsDir, entry.name);
      
      try {
        const skill = await loadSkill(skillPath);
        skills.push(skill);
      } catch (error) {
        console.warn(`Failed to load skill from ${skillPath}:`, error);
        // Continue loading other skills
      }
    }
  } catch (error) {
    throw new Error(`Failed to read skills directory ${skillsDir}: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  return skills;
}


/**
 * Test script for Release Notes workflow
 * 
 * Usage: 
 *   bun scripts/test-release-notes.ts preview 123 456 789          # Console preview
 *   bun scripts/test-release-notes.ts card --chat <id> 123 456     # Send preview card
 *   bun scripts/test-release-notes.ts post 123 456 789             # Direct post
 */

import { 
  generateReleaseNotesPreview, 
  postReleaseNotes,
  sendReleaseNotesPreviewCard,
  GITLAB_PROJECTS,
} from "../lib/workflows/release-notes-workflow";

function parseArgs(args: string[]): { 
  mode: string; 
  project?: string; 
  chatId?: string;
  version?: string;
  issueNumbers: number[];
} {
  let mode = "preview";
  let project: string | undefined;
  let chatId: string | undefined;
  let version: string | undefined;
  const issueNumbers: number[] = [];
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "preview" || arg === "post" || arg === "card") {
      mode = arg;
    } else if (arg === "--project" || arg === "-p") {
      project = args[++i];
    } else if (arg.startsWith("--project=")) {
      project = arg.split("=")[1];
    } else if (arg === "--chat" || arg === "-c") {
      chatId = args[++i];
    } else if (arg.startsWith("--chat=")) {
      chatId = arg.split("=")[1];
    } else if (arg === "--version" || arg === "-v") {
      version = args[++i];
    } else if (arg.startsWith("--version=")) {
      version = arg.split("=")[1];
    } else {
      const num = parseInt(arg, 10);
      if (!isNaN(num)) {
        issueNumbers.push(num);
      }
    }
  }
  
  return { mode, project, chatId, version, issueNumbers };
}

async function main() {
  const { mode, project, chatId, version, issueNumbers } = parseArgs(process.argv.slice(2));
  
  if (issueNumbers.length === 0) {
    console.log(`
📋 Release Notes Workflow Test

Default project: ${GITLAB_PROJECTS.DPA_MOM_TASK}

Usage:
  bun scripts/test-release-notes.ts preview [options] <issue#> [issue#...]
  bun scripts/test-release-notes.ts card --chat <chat_id> [options] <issue#> [issue#...]
  bun scripts/test-release-notes.ts post [options] <issue#> [issue#...]

Options:
  --project, -p <path>    GitLab project path (default: ${GITLAB_PROJECTS.DPA_MOM_TASK})
  --chat, -c <chat_id>    Target chat ID for 'card' mode
  --version, -v <ver>     Version string (default: auto-generated)

Examples:
  bun scripts/test-release-notes.ts preview 123 456 789
  bun scripts/test-release-notes.ts card --chat oc_xxx 123 456 --version v1.2.3
  bun scripts/test-release-notes.ts post 123 456
`);
    process.exit(1);
  }
  
  const releaseVersion = version || `v${new Date().toISOString().slice(0, 10).replace(/-/g, ".")}`;
  
  console.log(`🚀 Release Notes Workflow - Mode: ${mode}`);
  console.log(`📋 Issues: ${issueNumbers.join(", ")}`);
  console.log(`📁 Project: ${project || GITLAB_PROJECTS.DPA_MOM_TASK}`);
  console.log(`🏷️ Version: ${releaseVersion}`);
  if (chatId) console.log(`💬 Chat: ${chatId}`);
  console.log();
  
  if (mode === "preview") {
    // Generate preview only (console output)
    console.log("Generating preview...\n");
    
    const preview = await generateReleaseNotesPreview({
      issueNumbers,
      version: releaseVersion,
      projectName: "DPA Mom",
      gitlabProject: project,
      author: "Test User",
    });
    
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("📝 PREVIEW");
    console.log("═══════════════════════════════════════════════════════════════\n");
    console.log(`Title: ${preview.formattedTitle}\n`);
    console.log(preview.formattedContent);
    console.log("\n═══════════════════════════════════════════════════════════════");
    console.log(`Issues: ${preview.issueCount}`);
    if (preview.fetchErrors.length > 0) {
      console.log(`⚠️ Failed to fetch: ${preview.fetchErrors.join(", ")}`);
    }
    console.log("═══════════════════════════════════════════════════════════════\n");
    
    console.log("✅ Preview generated.");
    console.log("   To send as card: bun scripts/test-release-notes.ts card --chat <chat_id> " + issueNumbers.join(" "));
    console.log("   To post directly: bun scripts/test-release-notes.ts post " + issueNumbers.join(" "));
    
  } else if (mode === "card") {
    // Send preview card with buttons
    if (!chatId) {
      console.log("❌ Error: --chat <chat_id> is required for 'card' mode");
      process.exit(1);
    }
    
    console.log("Generating preview and sending card...\n");
    
    const preview = await generateReleaseNotesPreview({
      issueNumbers,
      version: releaseVersion,
      projectName: "DPA Mom",
      gitlabProject: project,
      author: "Test User",
    });
    
    console.log(`📝 Preview generated: ${preview.issueCount} issues\n`);
    
    const cardResult = await sendReleaseNotesPreviewCard(chatId, preview);
    
    if (cardResult.success) {
      console.log("✅ Preview card sent!");
      console.log(`   Message ID: ${cardResult.messageId}`);
      console.log("\n   Click [Post to Release Notes] button in Feishu to confirm.");
    } else {
      console.log("❌ Failed to send card:", cardResult.error);
    }
    
  } else if (mode === "post") {
    // Generate and post directly
    console.log("Generating and posting...\n");
    
    const result = await postReleaseNotes({
      issueNumbers,
      version: releaseVersion,
      projectName: "DPA Mom",
      gitlabProject: project,
      author: "Test User",
    });
    
    console.log("\n📋 Result:");
    console.log(JSON.stringify(result, null, 2));
    
    if (result.success) {
      console.log("\n✅ Success! Check the topic group for the new post.");
      console.log(`   Message ID: ${result.messageId}`);
      if (result.topicUrl) {
        console.log(`   Topic URL: ${result.topicUrl}`);
      }
    } else {
      console.log("\n❌ Failed:", result.error);
    }
    
  } else {
    console.log(`Unknown mode: ${mode}. Use 'preview', 'card', or 'post'.`);
    process.exit(1);
  }
}

main().catch(console.error);

import { createClient } from "@larksuiteoapi/lark-mcp";
import { spawn } from "child_process";

const documentId = "EgGLduNjgomJrUxOjXzcCTBYnsd";

async function fetchDocument() {
  try {
    // Create MCP client
    const client = createClient({
      appId: process.env.FEISHU_APP_ID!,
      appSecret: process.env.FEISHU_APP_SECRET!,
    });

    console.log(`📄 Fetching document: ${documentId}\n`);

    // Call the document content tool
    const result = await client.callTool("docx.v1.document.rawContent", {
      document_id: documentId,
    });

    if (result.content) {
      console.log("=" + "=".repeat(79));
      console.log("DOCUMENT CONTENT:");
      console.log("=" + "=".repeat(79));
      console.log(result.content);
      console.log("=" + "=".repeat(79));
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.error("Error fetching document:", error);
    process.exit(1);
  }
}

fetchDocument();

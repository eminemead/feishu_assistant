#!/usr/bin/env bun
import { Client } from "@larksuiteoapi/node-sdk";

const docId = "L7v9dyAvLoaJBixTvgPcecLqnIh";

const client = new Client({
  id: process.env.FEISHU_APP_ID!,
  secret: process.env.FEISHU_APP_SECRET!,
});

async function main() {
  try {
    console.log(`📄 Fetching Feishu document: ${docId}\n`);
    
    // Use relative path with client request (client handles base URL and auth)
    const response = await client.request({
      url: `/open-apis/docx/v1/document/${docId}/rawContent`,
      method: "get",
    });

    console.log("════════════════════════════════════════════════════");
    console.log("DOCUMENT CONTENT:");
    console.log("════════════════════════════════════════════════════\n");
    
    if (response && typeof response === 'object') {
      if ('content' in response) {
        console.log(response.content);
      } else if ('data' in response && response.data && 'content' in response.data) {
        console.log(response.data.content);
      } else {
        console.log(JSON.stringify(response, null, 2));
      }
    } else {
      console.log(response);
    }
  } catch (error) {
    console.error("Error fetching document:", error);
    process.exit(1);
  }
}

main();

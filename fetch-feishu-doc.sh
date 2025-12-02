#!/bin/bash

# Fetch document from Feishu using lark-mcp
DOC_ID="EgGLduNjgomJrUxOjXzcCTBYnsd"

echo "📄 Fetching document: $DOC_ID"
echo ""

# Use lark-mcp to read the document content
npx @larksuiteoapi/lark-mcp mcp \
  -a "$FEISHU_APP_ID" \
  -s "$FEISHU_APP_SECRET" \
  -t preset.doc.default \
  <<< '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "docx.v1.document.rawContent",
    "arguments": {
      "document_id": "'$DOC_ID'"
    }
  }
}' 2>/dev/null

#!/bin/bash

# Test and Monitor Feishu Mention Flow
# This script helps debug the threading feature by monitoring logs in real-time

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║         Feishu Mention Flow Debugging Monitor                 ║"
echo "╚════════════════════════════════════════════════════════════════╝"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}📋 Expected Flow:${NC}"
echo "1. Bot receives mention via WebSocket"
echo "2. Extracts user ID (should be string like ou_xxx)"
echo "3. Creates streaming card"
echo "4. Manager agent processes query"
echo "5. AI stream generates output (check for chunks > 0)"
echo ""

echo -e "${BLUE}📊 Monitoring logs...${NC}"
echo "Press Ctrl+C to stop monitoring"
echo ""

# Monitor logs with color coding
tail -f /tmp/feishu-server.log | while IFS= read -r line; do
  # WebSocket events
  if [[ $line == *"[WebSocket]"* ]]; then
    echo -e "${GREEN}${line}${NC}"
  # Manager agent
  elif [[ $line == *"[Manager]"* ]]; then
    echo -e "${BLUE}${line}${NC}"
  # Card operations
  elif [[ $line == *"[Card]"* ]]; then
    echo -e "${YELLOW}${line}${NC}"
  # Errors
  elif [[ $line == *"Error"* ]] || [[ $line == *"❌"* ]]; then
    echo -e "${RED}${line}${NC}"
  # Success
  elif [[ $line == *"✅"* ]]; then
    echo -e "${GREEN}${line}${NC}"
  # Auth (user extraction)
  elif [[ $line == *"[Auth]"* ]]; then
    echo -e "${YELLOW}${line}${NC}"
  else
    # Don't print other lines
    :
  fi
done

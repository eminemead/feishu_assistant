#!/bin/bash

# Test Feishu Bot Buttons in Real Time
# This script simulates button clicks to test the button interaction flow

set -e

# Colors
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║          Feishu Bot Button Click Testing                       ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Configuration
SERVER="http://localhost:3000"
WEBHOOK_PATH="/webhook/card"
WEBHOOK_URL="${SERVER}${WEBHOOK_PATH}"

echo -e "${YELLOW}📌 Server URL:${NC} $WEBHOOK_URL"
echo ""

# Test 1: Simple button click
test_button_click() {
  local button_id=$1
  local button_label=$2
  
  echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
  echo -e "${YELLOW}Test: Button Click - ${button_label}${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
  
  local payload=$(cat <<EOF
{
  "schema": "2.0",
  "header": {
    "event_id": "event-$(date +%s)",
    "event_type": "card.action.trigger",
    "create_time": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "token": "test-token",
    "app_id": "test-app"
  },
  "event": {
    "action": {
      "action_id": "${button_id}",
      "action_type": "button",
      "value": {}
    },
    "trigger": {
      "trigger_type": "card.action.trigger"
    },
    "operator": {
      "operator_id": "ou_$(date +%s | md5sum | cut -c1-10)",
      "operator_type": "user"
    },
    "token": "test-token"
  }
}
EOF
)
  
  echo -e "${YELLOW}📤 Sending payload:${NC}"
  echo "$payload" | jq '.'
  echo ""
  
  echo -e "${YELLOW}🔄 Response:${NC}"
  RESPONSE=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -d "$payload" \
    "$WEBHOOK_URL")
  
  echo "$RESPONSE" | jq '.'
  echo ""
  
  # Check response
  if echo "$RESPONSE" | jq -e '.toast' > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Button click processed successfully${NC}"
  else
    echo -e "${RED}❌ Unexpected response format${NC}"
  fi
  echo ""
}

# Test 2: Follow-up button click
test_followup_button() {
  local followup_id=$1
  local followup_label=$2
  
  echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
  echo -e "${YELLOW}Test: Follow-up Button - ${followup_label}${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
  
  local payload=$(cat <<EOF
{
  "schema": "2.0",
  "header": {
    "event_id": "event-$(date +%s)",
    "event_type": "card.action.trigger",
    "create_time": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "token": "test-token",
    "app_id": "test-app"
  },
  "event": {
    "action": {
      "action_id": "${followup_id}",
      "action_type": "button",
      "value": {
        "followup": true,
        "query": "Follow-up question"
      }
    },
    "trigger": {
      "trigger_type": "card.action.trigger"
    },
    "operator": {
      "operator_id": "ou_$(date +%s | md5sum | cut -c1-10)",
      "operator_type": "user"
    },
    "token": "test-token"
  }
}
EOF
)
  
  echo -e "${YELLOW}📤 Sending follow-up payload:${NC}"
  echo "$payload" | jq '.'
  echo ""
  
  echo -e "${YELLOW}🔄 Response:${NC}"
  RESPONSE=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -d "$payload" \
    "$WEBHOOK_URL")
  
  echo "$RESPONSE" | jq '.'
  echo ""
  
  if echo "$RESPONSE" | jq -e '.toast' > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Follow-up button processed successfully${NC}"
  else
    echo -e "${RED}❌ Unexpected response format${NC}"
  fi
  echo ""
}

# Check if server is running
echo -e "${YELLOW}🔍 Checking server connection...${NC}"
if ! curl -s "$SERVER/health" > /dev/null 2>&1; then
  echo -e "${RED}❌ Server is not running at $SERVER${NC}"
  echo -e "${YELLOW}💡 Start the server with: bun run dev${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Server is running${NC}"
echo ""

# Run tests
test_button_click "btn_refresh" "Refresh Data"
test_button_click "btn_submit" "Submit Form"
test_followup_button "btn_followup_1" "Follow-up Question 1"
test_followup_button "btn_followup_2" "Follow-up Question 2"

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ All button tests completed!${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"

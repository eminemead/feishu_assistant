#!/bin/bash
# Phase 5c: Real-time monitoring script
# Watches devtools events and logs in real-time during testing

set -e

echo "🔍 Phase 5c-2 Real-Time Monitor"
echo "================================"
echo ""
echo "This script monitors devtools events and memory storage"
echo "Keep this running while executing test messages in Feishu"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
DEVTOOLS_URL="http://localhost:3000/devtools/api"
LAST_EVENT_COUNT=0
LAST_CHECK=$(date +%s)

# Helper function: Pretty print token info
print_token_info() {
  local event=$1
  local agent=$(echo "$event" | jq -r '.metadata.agent // "Unknown"')
  local tokens_in=$(echo "$event" | jq -r '.metadata.tokens.input // 0')
  local tokens_out=$(echo "$event" | jq -r '.metadata.tokens.output // 0')
  local total=$((tokens_in + tokens_out))
  local duration=$(echo "$event" | jq -r '.duration // 0')
  
  printf "${BLUE}[%s]${NC} in:%d out:%d total:%d duration:%dms\n" \
    "$agent" "$tokens_in" "$tokens_out" "$total" "$duration"
}

# Main monitoring loop
echo "${YELLOW}Starting monitoring...${NC}"
echo "Press Ctrl+C to stop"
echo ""

last_count=0

while true; do
  # Get current stats
  stats=$(curl -s "$DEVTOOLS_URL/stats")
  current_count=$(echo "$stats" | jq '.totalEvents // 0')
  
  # Check if new events
  if [ "$current_count" -gt "$last_count" ]; then
    echo ""
    echo "${GREEN}=== New Event Detected ===${NC}"
    echo "Total events: $current_count"
    echo ""
    
    # Get latest event
    latest=$(curl -s "$DEVTOOLS_URL/events?limit=1" | jq '.[0]')
    
    if [ "$latest" != "null" ]; then
      print_token_info "$latest"
      
      # Show context preview
      context=$(echo "$latest" | jq -r '.context // {}')
      if [ "$context" != "{}" ]; then
        echo "${YELLOW}Context:${NC}"
        echo "$context" | jq '.' | head -5
      fi
    fi
    
    last_count=$current_count
  fi
  
  sleep 2
done

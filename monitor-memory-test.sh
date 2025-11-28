#!/bin/bash

# Monitor Memory Persistence Test in Real-Time
# Usage: ./monitor-memory-test.sh

set -e

echo "═══════════════════════════════════════════════════════════════"
echo "MEMORY PERSISTENCE TEST MONITOR"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Watching server logs for:"
echo "  • Memory initialization"
echo "  • Thread creation"
echo "  • Message loading/saving"
echo ""
echo "Test group: oc_cd4b98905e12ec0cb68adc529440e623"
echo ""
echo "Press Ctrl+C to stop monitoring"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Start monitoring
tail -f server-test.log | while read line; do
  # Highlight key operations
  if [[ $line =~ "Created memory thread" ]]; then
    echo -e "${GREEN}✓ THREAD CREATED${NC} - $line"
  elif [[ $line =~ "Saved.*messages to Mastra Memory" ]]; then
    echo -e "${GREEN}✓ MESSAGES SAVED${NC} - $line"
  elif [[ $line =~ "Loaded.*messages from Mastra Memory" ]]; then
    echo -e "${BLUE}✓ MESSAGES LOADED${NC} - $line"
  elif [[ $line =~ "Failed to.*memory" ]]; then
    echo -e "${RED}✗ MEMORY ERROR${NC} - $line"
  elif [[ $line =~ "Mastra Memory initialized" ]]; then
    echo -e "${GREEN}✓ MEMORY INITIALIZED${NC} - $line"
  elif [[ $line =~ "\[Manager\]" ]]; then
    echo -e "${YELLOW}→${NC} $line"
  elif [[ $line =~ "\[OKR\]" ]] || [[ $line =~ "\[Alignment\]" ]] || [[ $line =~ "\[P&L\]" ]] || [[ $line =~ "\[DPA PM\]" ]]; then
    echo -e "${YELLOW}→ SPECIALIST${NC} $line"
  fi
done

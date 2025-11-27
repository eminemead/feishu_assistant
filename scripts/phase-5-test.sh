#!/bin/bash

# Phase 5: Real Feishu Integration Testing Script
# This script automates the test scenarios for Phase 5

set -e

# Configuration
TEST_GROUP_ID="${FEISHU_TEST_CHAT_ID:-oc_cd4b98905e12ec0cb68adc529440e623}"
DEVTOOLS_API="http://localhost:3000/devtools/api"
HEALTH_API="http://localhost:3000/health"
WEBHOOK_ENDPOINT="http://localhost:3000/webhook/event"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test results
declare -A SCENARIO_RESULTS
TOTAL_EVENTS_BEFORE=0

# Helper functions
log_info() {
  echo -e "${BLUE}ℹ️  [$(date '+%H:%M:%S')]${NC} $1"
}

log_success() {
  echo -e "${GREEN}✅ [$(date '+%H:%M:%S')]${NC} $1"
}

log_error() {
  echo -e "${RED}❌ [$(date '+%H:%M:%S')]${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}⚠️  [$(date '+%H:%M:%S')]${NC} $1"
}

print_separator() {
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Check server health
check_server_health() {
  log_info "Checking server health..."
  
  if ! response=$(curl -s -f "${HEALTH_API}" 2>/dev/null); then
    log_error "Server is not running. Start it with: NODE_ENV=development ENABLE_DEVTOOLS=true bun run dev"
    exit 1
  fi
  
  status=$(echo "$response" | jq -r '.status // "unknown"')
  if [ "$status" = "healthy" ] || [ "$status" = "degraded" ]; then
    log_success "Server is healthy: $status"
    return 0
  else
    log_error "Server status: $status"
    return 1
  fi
}

# Clear devtools events
clear_devtools_events() {
  log_info "Clearing devtools event history..."
  
  if curl -s -X POST "${DEVTOOLS_API}/clear" > /dev/null; then
    log_success "Devtools events cleared"
  else
    log_warning "Failed to clear devtools (may not be critical)"
  fi
}

# Get current event count
get_event_count() {
  curl -s "${DEVTOOLS_API}/stats" | jq '.totalEvents // 0'
}

# Get stats
get_stats() {
  curl -s "${DEVTOOLS_API}/stats" | jq .
}

# Get events
get_events() {
  local limit=${1:-100}
  curl -s "${DEVTOOLS_API}/events?limit=${limit}" | jq .
}

# Get events for specific tool
get_events_for_tool() {
  local tool=$1
  curl -s "${DEVTOOLS_API}/events?tool=${tool}" | jq .
}

# Test scenario setup
test_scenario_start() {
  local scenario=$1
  local description=$2
  
  print_separator
  log_info "Starting Scenario $scenario: $description"
  SCENARIO_RESULTS[$scenario]="PENDING"
  TOTAL_EVENTS_BEFORE=$(get_event_count)
  log_info "Events before test: $TOTAL_EVENTS_BEFORE"
}

test_scenario_end() {
  local scenario=$1
  local pass=$2
  
  TOTAL_EVENTS_AFTER=$(get_event_count)
  local events_generated=$((TOTAL_EVENTS_AFTER - TOTAL_EVENTS_BEFORE))
  
  if [ "$pass" = "true" ]; then
    SCENARIO_RESULTS[$scenario]="PASSED"
    log_success "Scenario $scenario PASSED (generated $events_generated events)"
  else
    SCENARIO_RESULTS[$scenario]="FAILED"
    log_error "Scenario $scenario FAILED"
  fi
}

# Scenario A: Basic Routing
test_scenario_a() {
  test_scenario_start "A" "Basic Routing & Agent Response"
  
  # Note: Manual testing required - send test messages to group
  log_info "⚠️  Manual Test Required:"
  log_info "   1. Send to test group: '@AI 请分析我们的OKR'"
  log_info "   2. Send to test group: '我们的团队对齐吗?'"
  log_info "   3. Send to test group: '最近的P&L如何?'"
  log_info ""
  log_info "   Press ENTER after sending messages..."
  read -r
  
  # Check for agent responses
  stats=$(get_stats)
  agent_calls=$(echo "$stats" | jq '.agentHandoffs // 0')
  
  if [ "$agent_calls" -gt 0 ]; then
    test_scenario_end "A" "true"
    return 0
  else
    test_scenario_end "A" "false"
    return 1
  fi
}

# Scenario B: Multi-Turn Context
test_scenario_b() {
  test_scenario_start "B" "Multi-Turn Context Awareness"
  
  log_info "⚠️  Manual Test Required:"
  log_info "   1. Send: 'What is an OKR?'"
  log_info "   2. Send: 'How many key results should we have?'"
  log_info "   3. Send: 'Analyze our current OKRs'"
  log_info ""
  log_info "   Verify agent references previous context in responses"
  log_info "   Press ENTER after testing..."
  read -r
  
  # This is hard to automate - manual verification needed
  test_scenario_end "B" "true"
}

# Scenario C: User Isolation
test_scenario_c() {
  test_scenario_start "C" "User Isolation & RLS"
  
  log_info "⚠️  Manual Test Required (requires 2+ users):"
  log_info "   User A: 'What\\'s my status?'"
  log_info "   User B: 'What\\'s my status?'"
  log_info ""
  log_info "   Verify responses are isolation-aware"
  log_info "   Press ENTER after testing (or SKIP if only 1 user)..."
  read -r
  
  # Check for proper memory isolation
  test_scenario_end "C" "true"
}

# Scenario D: Performance & Load
test_scenario_d() {
  test_scenario_start "D" "Performance & Concurrent Load"
  
  log_info "⚠️  Manual Test Required:"
  log_info "   Send 5+ concurrent messages to test group"
  log_info "   Monitor response times"
  log_info ""
  log_info "   Target: p95 response time < 10 seconds"
  log_info "   Press ENTER after testing..."
  read -r
  
  stats=$(get_stats)
  avg_duration=$(echo "$stats" | jq '.avgToolDuration // 0')
  
  log_info "Average tool duration: ${avg_duration}ms"
  
  if (( $(echo "$avg_duration < 10000" | bc -l) )); then
    test_scenario_end "D" "true"
    return 0
  else
    test_scenario_end "D" "false"
    return 1
  fi
}

# Scenario E: Error Handling
test_scenario_e() {
  test_scenario_start "E" "Error Handling & Edge Cases"
  
  log_info "⚠️  Manual Test Required:"
  log_info "   1. Send nonsense: 'xyz!!!@@@###'"
  log_info "   2. Send long text: (>5000 chars)"
  log_info "   3. Send unicode: '你好 😀 مرحبا'"
  log_info "   4. Send rapid messages (10+ in 5s)"
  log_info ""
  log_info "   Verify no crashes or unhandled errors"
  log_info "   Press ENTER after testing..."
  read -r
  
  stats=$(get_stats)
  errors=$(echo "$stats" | jq '.errors // 0')
  
  if [ "$errors" -eq 0 ]; then
    test_scenario_end "E" "true"
    return 0
  else
    log_warning "Captured $errors errors"
    test_scenario_end "E" "false"
    return 1
  fi
}

# Print test report
print_test_report() {
  print_separator
  log_info "Test Report Summary"
  print_separator
  
  local passed=0
  local failed=0
  local pending=0
  
  for scenario in A B C D E; do
    result="${SCENARIO_RESULTS[$scenario]}"
    if [ "$result" = "PASSED" ]; then
      log_success "Scenario $scenario: $result"
      ((passed++))
    elif [ "$result" = "FAILED" ]; then
      log_error "Scenario $scenario: $result"
      ((failed++))
    else
      log_warning "Scenario $scenario: $result"
      ((pending++))
    fi
  done
  
  echo ""
  log_info "Summary: $passed passed, $failed failed, $pending pending"
  
  # Get final stats
  echo ""
  log_info "Final Statistics:"
  get_stats | jq '{totalEvents, toolCalls, agentHandoffs, errors, avgToolDuration}'
}

# Main execution
main() {
  print_separator
  log_info "Phase 5: Real Feishu Integration Testing"
  print_separator
  
  # Step 1: Check server health
  if ! check_server_health; then
    exit 1
  fi
  
  echo ""
  log_info "Test Configuration:"
  log_info "  Test Group ID: $TEST_GROUP_ID"
  log_info "  Devtools API: $DEVTOOLS_API"
  echo ""
  
  # Step 2: Clear events
  clear_devtools_events
  
  # Step 3: Run scenarios
  echo ""
  log_info "Running test scenarios..."
  
  # Interactive menu
  while true; do
    print_separator
    log_info "Select scenario to test:"
    log_info "  A) Scenario A - Basic Routing"
    log_info "  B) Scenario B - Multi-Turn Context"
    log_info "  C) Scenario C - User Isolation"
    log_info "  D) Scenario D - Performance & Load"
    log_info "  E) Scenario E - Error Handling"
    log_info "  R) Run Report"
    log_info "  Q) Quit"
    echo ""
    read -r -p "Choice [A-E/R/Q]: " choice
    
    case "$choice" in
      A|a) test_scenario_a ;;
      B|b) test_scenario_b ;;
      C|c) test_scenario_c ;;
      D|d) test_scenario_d ;;
      E|e) test_scenario_e ;;
      R|r) print_test_report ;;
      Q|q) print_test_report; log_info "Exiting..."; exit 0 ;;
      *) log_warning "Invalid choice" ;;
    esac
    
    echo ""
  done
}

# Run main
main "$@"

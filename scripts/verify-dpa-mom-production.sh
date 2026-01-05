#!/bin/bash
# DPA Mom Production Verification Script
# Verifies glab CLI, authentication, and workflow setup for production testing

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
GITLAB_HOST="git.nevint.com"
DPA_GROUP="dpa"
SERVER_URL="${SERVER_URL:-http://localhost:3000}"

echo -e "${BLUE}=== DPA Mom Production Verification ===${NC}\n"

# Track failures
FAILURES=0

# Function to check and report
check() {
    local name="$1"
    local command="$2"
    
    echo -n "Checking $name... "
    if eval "$command" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC}"
        return 0
    else
        echo -e "${RED}✗${NC}"
        FAILURES=$((FAILURES + 1))
        return 1
    fi
}

# 1. Check glab CLI installation
echo -e "${BLUE}1. glab CLI Installation${NC}"
check "glab CLI installed" "which glab"
if [ $? -eq 0 ]; then
    GLAB_VERSION=$(glab --version 2>/dev/null | head -n1 || echo "unknown")
    echo "   Version: $GLAB_VERSION"
fi
echo ""

# 2. Check glab authentication
echo -e "${BLUE}2. glab Authentication${NC}"
check "glab authenticated to $GITLAB_HOST" "glab auth status 2>&1 | grep -q '✓ Logged in to $GITLAB_HOST'"
if [ $? -eq 0 ]; then
    AUTH_USER=$(glab auth status 2>&1 | grep "$GITLAB_HOST" | sed -n 's/.*as \(.*\)/\1/p' || echo "unknown")
    echo "   Authenticated as: $AUTH_USER"
fi
echo ""

# 3. Test glab API access
echo -e "${BLUE}3. glab API Access${NC}"
check "glab API access" "glab api '/user' --host $GITLAB_HOST > /dev/null 2>&1"
if [ $? -eq 0 ]; then
    USERNAME=$(glab api "/user" --host "$GITLAB_HOST" 2>/dev/null | jq -r '.username // empty' || echo "")
    if [ -n "$USERNAME" ] && [ "$USERNAME" != "null" ]; then
        echo "   Username: $USERNAME"
    fi
fi
echo ""

# 4. Test DPA group access
echo -e "${BLUE}4. DPA Group Access${NC}"
check "DPA group accessible" "glab issue list --group $DPA_GROUP --per-page 1 > /dev/null 2>&1"
echo ""

# 5. Check workflow registration (if server is running)
echo -e "${BLUE}5. Workflow Registration${NC}"
if curl -s "$SERVER_URL/health" > /dev/null 2>&1; then
    check "dpa-assistant workflow registered" "curl -s '$SERVER_URL/devtools/workflows' 2>/dev/null | jq -e '.[] | select(.id == \"dpa-assistant\")' > /dev/null"
    if [ $? -eq 0 ]; then
        WORKFLOW_INFO=$(curl -s "$SERVER_URL/devtools/workflows" 2>/dev/null | jq '.[] | select(.id == "dpa-assistant")')
        echo "   Workflow found: $(echo "$WORKFLOW_INFO" | jq -r '.name // "dpa-assistant"')"
    fi
else
    echo -e "${YELLOW}⚠ Server not running at $SERVER_URL (skipping workflow check)${NC}"
fi
echo ""

# 6. Check environment variables
echo -e "${BLUE}6. Environment Variables${NC}"
check "OPENROUTER_API_KEY set" "[ -n \"\$OPENROUTER_API_KEY\" ]"
if [ -n "$OPENROUTER_API_KEY" ]; then
    echo "   OPENROUTER_API_KEY: ${OPENROUTER_API_KEY:0:10}..."
fi
check "NODE_ENV set" "[ -n \"\$NODE_ENV\" ]"
if [ -n "$NODE_ENV" ]; then
    echo "   NODE_ENV: $NODE_ENV"
fi
echo ""

# 7. Test glab command execution
echo -e "${BLUE}7. glab Command Execution${NC}"
check "glab issue list command" "glab issue list --group $DPA_GROUP --per-page 1 --state opened > /dev/null 2>&1"
echo ""

# Summary
echo -e "${BLUE}=== Summary ===${NC}"
if [ $FAILURES -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed! Ready for production testing.${NC}"
    exit 0
else
    echo -e "${RED}✗ $FAILURES check(s) failed. Please fix issues before testing.${NC}"
    echo ""
    echo -e "${YELLOW}Common fixes:${NC}"
    echo "  - Install glab: brew install glab (macOS) or see https://gitlab.com/gitlab-org/cli"
    echo "  - Authenticate: glab auth login --hostname $GITLAB_HOST"
    echo "  - Set OPENROUTER_API_KEY in environment"
    echo "  - Start server: bun run dev or pm2 start ecosystem.config.js"
    exit 1
fi







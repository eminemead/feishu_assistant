#!/bin/bash
# Enhanced GitLab Operations Helper with Authentication & Authorization
# Usage: source this script to get helper functions with safety checks

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Global variables
DPA_GROUP="dpa"
GITLAB_HOST="git.nevint.com"
CURRENT_USER=""
CURRENT_USER_ID=""

# Initialize authentication
init_auth() {
    echo -e "${BLUE}Initializing GitLab authentication...${NC}"
    
    # Check if authenticated to git.nevint.com (ignore exit code)
    local auth_output=$(glab auth status 2>&1 || true)
    if echo "$auth_output" | grep -q "✓ Logged in to git.nevint.com"; then
        echo -e "${GREEN}✓ Found git.nevint.com authentication${NC}"
    else
        echo -e "${RED}✗ Not authenticated to git.nevint.com${NC}"
        echo "Please run: glab auth login"
        return 1
    fi
    
    # Get current user info
    CURRENT_USER=$(curl -s -H "Authorization: Bearer $(glab config get token --host git.nevint.com)" "https://git.nevint.com/api/v4/user" | jq -r '.username // empty')
    CURRENT_USER_ID=$(curl -s -H "Authorization: Bearer $(glab config get token --host git.nevint.com)" "https://git.nevint.com/api/v4/user" | jq -r '.id // empty')
    
    if [ -z "$CURRENT_USER" ] || [ "$CURRENT_USER" = "null" ]; then
        echo -e "${RED}✗ Failed to get current user information${NC}"
        return 1
    fi
    
    echo -e "${GREEN}✓ Authenticated as: $CURRENT_USER${NC}"
    return 0
}

# Check user permission level for a project
check_permission() {
    local project="$1"
    local required_level="$2"
    
    if [ -z "$project" ] || [ -z "$required_level" ]; then
        echo -e "${RED}Usage: check_permission <project> <required_level>${NC}"
        return 1
    fi
    
    echo -e "${BLUE}Checking permissions for $CURRENT_USER on dpa/$project...${NC}"
    
    # Get user's access level for the project first
    local user_level=$(curl -s -H "Authorization: Bearer $(glab config get token --host git.nevint.com)" \
                      "https://git.nevint.com/api/v4/projects/dpa%2F$project/members/all" | \
                      jq -r ".[] | select(.username == \"$CURRENT_USER\") | .access_level" | head -1)
    
    # If no project-specific permission, check group-level permission
    if [ -z "$user_level" ]; then
        user_level=$(curl -s -H "Authorization: Bearer $(glab config get token --host git.nevint.com)" \
                          "https://git.nevint.com/api/v4/groups/dpa/members" | \
                          jq -r ".[] | select(.username == \"$CURRENT_USER\") | .access_level" | head -1)
    fi
    
    # Default to 0 if no permission found
    user_level="${user_level:-0}"
    
    # Map GitLab access levels
    local required_num
    case $required_level in
        "guest") required_num=10 ;;
        "report") required_num=20 ;;
        "developer") required_num=30 ;;
        "maintainer") required_num=40 ;;
        "owner") required_num=50 ;;
        *) 
            echo -e "${RED}Invalid permission level: $required_level${NC}"
            return 1
            ;;
    esac
    
    if [ "$user_level" -ge "$required_num" ]; then
        echo -e "${GREEN}✓ Permission granted (level: $user_level >= $required_num)${NC}"
        return 0
    else
        echo -e "${RED}✗ Permission denied (level: $user_level < $required_num)${NC}"
        return 1
    fi
}

# Safe issue creation with permission check
safe_create_issue() {
    local project="$1"
    local title="$2"
    local description="$3"
    local confidential="${4:-false}"
    
    if [ -z "$project" ] || [ -z "$title" ]; then
        echo -e "${RED}Usage: safe_create_issue <project> <title> [description] [confidential]${NC}"
        return 1
    fi
    
    # Check if user can create issues
    if ! check_permission "$project" "report"; then
        return 1
    fi
    
    # Additional check for confidential issues
    if [ "$confidential" = "true" ]; then
        if ! check_permission "$project" "maintainer"; then
            echo -e "${RED}✗ Only maintainers can create confidential issues${NC}"
            return 1
        fi
    fi
    
    echo -e "${BLUE}Creating issue in dpa/$project...${NC}"
    
    # Use API for more reliable issue creation
    local project_id=$(curl -s -H "Authorization: Bearer $(glab config get token --host git.nevint.com)" \
                        "https://git.nevint.com/api/v4/projects/dpa%2F$project" | jq -r '.id')
    
    if [ -z "$project_id" ] || [ "$project_id" = "null" ]; then
        echo -e "${RED}✗ Project dpa/$project not found${NC}"
        return 1
    fi
    
    local issue_data=$(cat <<EOF
{
  "title": "$title",
  "description": "${description:-'No description provided'}",
  "confidential": $confidential
}
EOF
)
    
    local result=$(curl -s -X POST \
        -H "Authorization: Bearer $(glab config get token --host git.nevint.com)" \
        -H "Content-Type: application/json" \
        -d "$issue_data" \
        "https://git.nevint.com/api/v4/projects/$project_id/issues")
    
    local issue_url=$(echo "$result" | jq -r '.web_url')
    local issue_iid=$(echo "$result" | jq -r '.iid')
    
    if [ -n "$issue_url" ] && [ "$issue_url" != "null" ]; then
        echo -e "${GREEN}✓ Issue created successfully: #$issue_iid${NC}"
        echo -e "${BLUE}URL: $issue_url${NC}"
        return 0
    else
        echo -e "${RED}✗ Failed to create issue${NC}"
        echo "$result" | jq -r '.message // "Unknown error"'
        return 1
    fi
}

# Safe issue editing with permission check
safe_edit_issue() {
    local project="$1"
    local issue_id="$2"
    local title="$3"
    local description="$4"
    local assignee="$5"
    
    if [ -z "$project" ] || [ -z "$issue_id" ]; then
        echo -e "${RED}Usage: safe_edit_issue <project> <issue_id> [title] [description] [assignee]${NC}"
        return 1
    fi
    
    # Check if user can edit issues
    if ! check_permission "$project" "developer"; then
        return 1
    fi
    
    echo -e "${BLUE}Editing issue #$issue_id in dpa/$project...${NC}"
    
    local cmd="glab issue edit $issue_id -R dpa/$project"
    [ -n "$title" ] && cmd="$cmd -t \"$title\""
    [ -n "$description" ] && cmd="$cmd -d \"$description\""
    [ -n "$assignee" ] && cmd="$cmd --assignee $assignee"
    
    echo -e "${YELLOW}Command: $cmd${NC}"
    eval "$cmd"
}

# Safe comment addition with permission check
safe_add_comment() {
    local project="$1"
    local issue_id="$2"
    local comment="$3"
    
    if [ -z "$project" ] || [ -z "$issue_id" ] || [ -z "$comment" ]; then
        echo -e "${RED}Usage: safe_add_comment <project> <issue_id> <comment>${NC}"
        return 1
    fi
    
    # Check if user can comment
    if ! check_permission "$project" "report"; then
        return 1
    fi
    
    echo -e "${BLUE}Adding comment to issue #$issue_id in dpa/$project...${NC}"
    
    glab issue note "$issue_id" -m "$comment" -R "dpa/$project"
}

# List issues with permission validation
safe_list_issues() {
    local project="$1"
    local limit="${2:-10}"
    
    echo -e "${BLUE}Listing issues in DPA group...${NC}"
    
    if [ -n "$project" ]; then
        # Project-specific issues
        if ! check_permission "$project" "guest"; then
            return 1
        fi
        glab issue list -R "dpa/$project" --per-page "$limit"
    else
        # Group-wide issues
        glab issue list --group "$DPA_GROUP" --per-page "$limit"
    fi
}

# Audit function to log all operations
log_operation() {
    local operation="$1"
    local project="$2"
    local details="$3"
    
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local log_entry="[$timestamp] $CURRENT_USER: $operation on dpa/$project - $details"
    
    echo "$log_entry" >> "/tmp/gitlab_operations_audit.log"
    echo -e "${BLUE}Operation logged: $operation${NC}"
}

# Wrapper functions with logging
create_dpa_issue() {
    safe_create_issue "$@" && log_operation "CREATE_ISSUE" "$1" "Title: $2"
}

edit_dpa_issue() {
    safe_edit_issue "$@" && log_operation "EDIT_ISSUE" "$1" "Issue: $2"
}

comment_dpa_issue() {
    safe_add_comment "$@" && log_operation "COMMENT_ISSUE" "$1" "Issue: $2"
}

# Initialize on script load
if ! init_auth; then
    echo -e "${YELLOW}Warning: Authentication failed. Some functions may not work.${NC}"
fi

echo -e "${GREEN}GitLab Operations Helper loaded with authentication checks.${NC}"
echo -e "${BLUE}Available functions:${NC}"
echo "- check_permission <project> <level>"
echo "- safe_create_issue <project> <title> [description] [confidential]"
echo "- safe_edit_issue <project> <issue_id> [title] [description] [assignee]"
echo "- safe_add_comment <project> <issue_id> <comment>"
echo "- safe_list_issues [project] [limit]"
echo "- log_operation <operation> <project> <details>"
echo ""
echo -e "${YELLOW}Permission levels: guest, report, developer, maintainer, owner${NC}"

#!/bin/bash
# GitLab Operations Helper Script for DPA Group
# Usage: source this script to get helper functions

# Check if glab is authenticated
check_glab_auth() {
    echo "Checking glab authentication..."
    if glab auth status | grep -q "✓ Logged in to git.nevint.com"; then
        echo "✓ Authenticated to git.nevint.com"
        return 0
    else
        echo "✗ Not authenticated to git.nevint.com"
        echo "Please run: glab auth login"
        return 1
    fi
}

# List all DPA projects
list_dpa_projects() {
    echo "DPA Group Projects:"
    curl -s -H "Authorization: Bearer $(glab config get token --host git.nevint.com)" \
         "https://git.nevint.com/api/v4/groups/dpa/projects" | \
         jq -r '.[] | "- \(.name) (\(.path)) - ID: \(.id)"'
}

# Create issue with validation
create_dpa_issue() {
    local project="$1"
    local title="$2"
    local description="$3"
    
    if [ -z "$project" ] || [ -z "$title" ]; then
        echo "Usage: create_dpa_issue <project> <title> [description]"
        return 1
    fi
    
    echo "Creating issue in dpa/$project..."
    glab issue create -R "dpa/$project" -t "$title" -d "${description:-'No description provided'}"
}

# List recent issues from DPA group
list_dpa_issues() {
    local limit="${1:-10}"
    echo "Recent issues in DPA group (last $limit):"
    glab issue list --group dpa --order created_at --sort desc --per-page "$limit"
}

# Quick issue creation templates
create_bug_report() {
    local project="$1"
    local title="$2"
    local description="$3"
    local assignee="${4:-}"
    
    local cmd="glab issue create -R dpa/$project -t '$title' -d '$description' -l bug"
    if [ -n "$assignee" ]; then
        cmd="$cmd -a $assignee"
    fi
    
    echo "Command: $cmd"
    eval "$cmd"
}

create_feature_request() {
    local project="$1"
    local title="$2"
    local description="$3"
    
    glab issue create -R "dpa/$project" \
        -t "$title" \
        -d "$description" \
        -l enhancement,feature-request
}

# Search issues in DPA group
search_dpa_issues() {
    local query="$1"
    echo "Searching DPA issues for: $query"
    glab issue list --group dpa --search "$query"
}

# Get issue details
get_issue_details() {
    local project="$1"
    local issue_id="$2"
    
    glab issue view "$issue_id" -R "dpa/$project"
}

# Add comment to issue
add_issue_comment() {
    local project="$1"
    local issue_id="$2"
    local comment="$3"
    
    glab issue note "$issue_id" -m "$comment" -R "dpa/$project"
}

# Export variables for easy use
export DPA_GROUP_URL="https://git.nevint.com/dpa/"
export DPA_API_BASE="https://git.nevint.com/api/v4/groups/dpa"

echo "GitLab Operations Helper loaded. Available functions:"
echo "- check_glab_auth"
echo "- list_dpa_projects"
echo "- create_dpa_issue"
echo "- list_dpa_issues"
echo "- create_bug_report"
echo "- create_feature_request"
echo "- search_dpa_issues"
echo "- get_issue_details"
echo "- add_issue_comment"

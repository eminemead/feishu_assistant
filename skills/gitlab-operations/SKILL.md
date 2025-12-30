---
name: "GitLab Operations"
description: "Skill for dpa_mom subagent to use glab CLI for GitLab issue management"
version: "1.0.0"
tags: ["gitlab", "glab", "issues", "dpa", "cli"]
keywords: ["gitlab", "glab", "issues", "create", "update", "read", "dpa", "git.nevint.com"]
tools: ["bash", "glab"]
---

# GitLab Operations Skill

This skill enables the dpa_mom subagent to interact with GitLab issues using the glab CLI tool, specifically for the DPA group at https://git.nevint.com/dpa/.

## Prerequisites

- glab CLI must be installed and configured
- Authentication to git.nevint.com must be set up
- Proper permissions for DPA group operations

## Authentication & Authorization

### Current User Verification
Before performing any operations, verify the current user:
```bash
# Check who is authenticated
glab api "/user" --host git.nevint.com | jq -r '.username, .name'

# Verify DPA group membership
glab api "/groups/dpa/members" --host git.nevint.com | jq -r '.[] | select(.username == "YOUR_USERNAME")'
```

### Permission Levels
The skill respects GitLab's built-in permission model:
- **Guest**: Can only read public issues
- **Reporter**: Can create issues and comment
- **Developer**: Can edit issues, manage labels, assign issues
- **Maintainer**: Full project management including milestones, protected branches
- **Owner**: Complete control including group settings

### Operation Restrictions
**Read Operations (All authenticated users):**
- List issues in DPA group
- View issue details
- Search issues

**Write Operations (Reporter+):**
- Create new issues
- Add comments to own issues
- Edit own issue descriptions

**Management Operations (Developer+):**
- Edit any issue
- Assign issues to others
- Add/remove labels
- Set milestones and weights

**Admin Operations (Maintainer+):**
- Create confidential issues
- Lock/unlock discussions
- Manage milestones
- Bulk operations

### Safety Checks
Before performing destructive operations:
```bash
# Verify user has required permissions
check_user_permission() {
    local project="$1"
    local required_level="$2"
    
    # Get current user's permission level
    local user_level=$(glab api "/projects/dpa/$project/members/all" --host git.nevint.com | \
                      jq -r ".[] | select(.username == \"$(glab api '/user' --host git.nevint.com | jq -r '.username')\") | .access_level")
    
    # Map GitLab access levels (30=Developer, 40=Maintainer, 50=Owner)
    case $required_level in
        "read") [[ $user_level -ge 10 ]] ;;
        "report") [[ $user_level -ge 20 ]] ;;
        "developer") [[ $user_level -ge 30 ]] ;;
        "maintainer") [[ $user_level -ge 40 ]] ;;
        "owner") [[ $user_level -ge 50 ]] ;;
        *) return 1 ;;
    esac
}
```

### Restricted Operations
Some operations require explicit confirmation:
- Creating confidential issues
- Bulk issue updates
- Issue deletion (not supported via glab)
- Modifying protected branches
- Group-level settings changes

## Core Operations

### 1. Creating Issues

**Basic Issue Creation:**
```bash
glab issue create -t "Issue title" -d "Issue description" -R dpa/project-name
```

**Advanced Issue Creation:**
```bash
# With assignee and labels
glab issue create -t "Bug fix" -d "Critical bug in production" -a username -l bug,critical -R dpa/project-name

# With milestone and weight
glab issue create -t "Feature request" -d "Add new feature" -m "v2.0.0" -w 3 -R dpa/project-name

# Confidential issue
glab issue create -t "Security issue" -d "Security vulnerability" -c -R dpa/project-name
```

### 2. Reading/Listing Issues

**List Issues in DPA Group:**
```bash
# All open issues, newest first
glab issue list --group dpa --state opened --order created_at --sort desc

# Issues for specific project
glab issue list -R dpa/project-name

# Filter by labels
glab issue list --group dpa --label bug,urgent

# Get specific issue details
glab issue view 1 -R dpa/project-name
```

**Search Issues:**
```bash
# Search by title/description
glab issue list --group dpa --search "critical bug"

# Filter by assignee
glab issue list --group dpa --assignee username

# Filter by author
glab issue list --group dpa --author username
```

### 3. Updating Issues

**Update Issue Details:**
```bash
# Update title and description
glab issue edit 1 -t "New title" -d "Updated description" -R dpa/project-name

# Add labels
glab issue edit 1 --add-label "urgent,bug" -R dpa/project-name

# Remove labels
glab issue edit 1 --remove-label "old-label" -R dpa/project-name

# Assign to user
glab issue edit 1 --assignee username -R dpa/project-name

# Set milestone
glab issue edit 1 --milestone "v2.0.0" -R dpa/project-name
```

**Add Comments/Notes:**
```bash
# Add comment
glab issue note 1 -m "This is a comment" -R dpa/project-name

# Add time tracking
glab issue time add 1 "1h 30m" -R dpa/project-name
```

### 4. Issue State Management

**Close/Reopen Issues:**
```bash
# Close issue
glab issue close 1 -R dpa/project-name

# Reopen issue
glab issue reopen 1 -R dpa/project-name

# Lock discussion
glab issue lock 1 -R dpa/project-name
```

## DPA Group Specific Operations

**List DPA Projects:**
```bash
# Get all projects in DPA group
curl -s -H "Authorization: Bearer $(glab config get token --host git.nevint.com)" "https://git.nevint.com/api/v4/groups/dpa/projects"
```

**Create Issue in DPA Project:**
```bash
# First, get available projects
glab api "/groups/dpa/projects" --host git.nevint.com

# Then create issue in specific project
glab issue create -R dpa/project-name -t "Title" -d "Description"
```

## Error Handling

**Common Issues and Solutions:**

1. **404 Not Found**: Check project name and permissions
2. **401 Unauthorized**: Run `glab auth login` to re-authenticate
3. **Unknown flag**: Use `glab issue create --help` to check available flags

**Validation Commands:**
```bash
# Check authentication
glab auth status

# Verify group access
glab api "/groups/dpa" --host git.nevint.com

# Test basic issue listing
glab issue list --group dpa --per-page 1
```

## Best Practices

1. **Always specify the repository** with `-R dpa/project-name` for project-specific operations
2. **Use descriptive titles** and detailed descriptions for issues
3. **Apply appropriate labels** for better organization
4. **Set assignees** to ensure accountability
5. **Use milestones** for release tracking
6. **Verify permissions** before attempting operations

## Examples

**Example 1**: Create a bug report
```bash
glab issue create -R dpa/dagster \
  -t "Data pipeline failure" \
  -d "Pipeline fails at step 3 with error XYZ" \
  -l bug,urgent \
  -a data-team-lead
```

**Example 2**: List all urgent issues
```bash
glab issue list --group dpa --label urgent --state opened
```

**Example 3**: Update issue with progress
```bash
glab issue edit 42 -d "Updated: Fixed the connection issue, testing in progress" -R dpa/dagster
glab issue note 42 -m "Deployed fix to staging, monitoring results" -R dpa/dagster
```

## Integration Notes

This skill is designed to work with:
- DPA group projects on git.nevint.com
- glab CLI version 1.70+
- Proper authentication setup

## Security & Authentication

### Enhanced Security Features
The skill includes comprehensive security controls:

**Authentication Verification:**
- Automatic user identity verification
- DPA group membership validation
- Project-specific permission checking

**Permission-Based Access Control:**
- Guest (10): Read-only operations
- Reporter (20): Create issues, comment
- Developer (30): Edit issues, assign users
- Maintainer (40): Confidential issues, lock discussions
- Owner (50): Full administrative access

**Safety Mechanisms:**
- Pre-operation permission checks
- Audit logging of all operations
- Rate limiting protection
- Error handling with clear messages

**Secure Helper Script:**
Use `resources/secure-helper.sh` for enhanced security:
```bash
source resources/secure-helper.sh
safe_create_issue dpa_dagster "Title" "Description"
check_permission dpa_dagster developer
```

**Audit Trail:**
All operations are logged to `/tmp/gitlab_operations_audit.log` with timestamps and user attribution.

### Security Policy
See `resources/security-policy.md` for complete security guidelines, including:
- Permission matrices
- Rate limiting rules
- Data protection measures
- Incident response procedures

The skill should be used when the user mentions:
- "create issue", "new issue", "report bug"
- "list issues", "show issues", "find issues"
- "update issue", "edit issue", "comment on issue"
- "GitLab", "glab", "DPA group"

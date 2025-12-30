# GitLab Operations Security Policy

## Authentication Requirements

### Mandatory Verification
All operations must verify:
1. **User Identity**: Current authenticated user via `glab api "/user"`
2. **Group Membership**: User must be member of DPA group
3. **Project Permissions**: Verify specific access levels per project

### Permission Levels
| Level | GitLab Access | Allowed Operations |
|-------|---------------|-------------------|
| Guest (10) | Read-only | List issues, view details |
| Reporter (20) | Basic | Create issues, comment on own issues |
| Developer (30) | Standard | Edit any issue, assign, manage labels |
| Maintainer (40) | Advanced | Confidential issues, lock discussions |
| Owner (50) | Full | All operations including group settings |

## Operation Restrictions

### Read Operations (Guest+)
- ✅ List issues in DPA group
- ✅ View issue details
- ✅ Search issues
- ✅ View project metadata

### Write Operations (Reporter+)
- ✅ Create new issues
- ✅ Edit own issue descriptions
- ✅ Add comments to issues
- ❌ Edit others' issues
- ❌ Assign issues to others

### Management Operations (Developer+)
- ✅ Edit any issue
- ✅ Assign issues to any user
- ✅ Add/remove labels
- ✅ Set milestones and weights
- ✅ Edit issue state (close/reopen)

### Admin Operations (Maintainer+)
- ✅ Create confidential issues
- ✅ Lock/unlock discussions
- ✅ Manage milestones
- ✅ Bulk operations
- ✅ Delete comments (if permitted)

### Forbidden Operations
- ❌ Delete issues (not supported via glab)
- ❌ Modify protected branches
- ❌ Change group settings
- ❌ Manage group members
- ❌ Access other groups outside DPA

## Safety Mechanisms

### Pre-Operation Checks
```bash
# 1. Verify authentication
check_auth_status() {
    glab auth status | grep -q "✓ Logged in to git.nevint.com"
}

# 2. Verify user identity
verify_user() {
    local user=$(glab api "/user" --host git.nevint.com | jq -r '.username')
    [ -n "$user" ] && [ "$user" != "null" ]
}

# 3. Verify DPA group membership
verify_dpa_membership() {
    glab api "/groups/dpa/members" --host git.nevint.com | \
        jq -r ".[] | select(.username == \"$CURRENT_USER\")" | grep -q .
}

# 4. Verify project permissions
verify_project_permission() {
    local project="$1"
    local required_level="$2"
    check_permission "$project" "$required_level"
}
```

### Audit Logging
All operations are logged to `/tmp/gitlab_operations_audit.log`:
```
[2025-12-30 18:45:00] xiaofei.yin: CREATE_ISSUE on dpa/dagster - Title: Bug fix
[2025-12-30 18:46:15] xiaofei.yin: EDIT_ISSUE on dpa/dagster - Issue: #42
```

### Confirmation Prompts
High-risk operations require explicit confirmation:
- Creating confidential issues
- Bulk operations (>5 issues)
- Modifying issue state
- Assigning issues to others

## Rate Limiting

### Operation Limits
- **Issue Creation**: Max 10 per hour per user
- **Issue Updates**: Max 50 per hour per user
- **API Calls**: Respect GitLab rate limits
- **Bulk Operations**: Max 5 issues per batch

### Implementation
```bash
check_rate_limit() {
    local operation="$1"
    local user="$2"
    local hour=$(date +%H)
    local count_file="/tmp/gitlab_rate_${user}_${hour}"
    
    if [ -f "$count_file" ]; then
        local count=$(cat "$count_file")
        case $operation in
            "CREATE") [ "$count" -lt 10 ] ;;
            "UPDATE") [ "$count" -lt 50 ] ;;
            *) return 0 ;;
        esac
    fi
    
    echo $((count + 1)) > "$count_file"
}
```

## Data Protection

### Sensitive Information
- ❌ Never log API tokens
- ❌ Never log passwords or secrets
- ❌ Sanitize PII from logs
- ✅ Use secure token storage

### Confidential Issues
- Only maintainers can create
- Restricted access to project members
- Enhanced logging for access
- Automatic expiration reminders

## Error Handling

### Permission Denied
```bash
handle_permission_error() {
    local operation="$1"
    local required_level="$2"
    
    echo "❌ Permission denied for $operation"
    echo "Required: $required_level"
    echo "Current: $(get_current_permission_level)"
    echo "Contact: DPA group maintainers"
}
```

### Authentication Failure
```bash
handle_auth_error() {
    echo "❌ Authentication failed"
    echo "Please run: glab auth login"
    echo "Ensure you're authenticated to git.nevint.com"
}
```

## Compliance

### Audit Requirements
- All operations logged with timestamp and user
- Logs retained for 90 days
- Regular audit trail review
- Incident response procedures

### Access Reviews
- Monthly permission reviews
- Group membership validation
- Project access cleanup
- Token rotation schedule

## Emergency Procedures

### Compromise Response
1. Immediately revoke compromised tokens
2. Review audit logs for suspicious activity
3. Reset user permissions if needed
4. Notify security team

### Service Outage
1. Switch to read-only mode
2. Cache recent operations
3. Queue non-critical operations
4. Restore service when available

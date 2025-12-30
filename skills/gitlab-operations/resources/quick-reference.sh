#!/bin/bash
# Quick reference for common glab commands in DPA context

# Set the DPA group context
DPA_GROUP="dpa"
GITLAB_HOST="git.nevint.com"

echo "=== GitLab CLI Quick Reference for DPA ==="
echo ""

echo "🔍 LISTING ISSUES"
echo "glab issue list --group $DPA_GROUP                    # All open issues"
echo "glab issue list --group $DPA_GROUP --state all        # All issues (including closed)"
echo "glab issue list --group $DPA_GROUP --label urgent     # Urgent issues only"
echo "glab issue list --group $DPA_GROUP --assignee @me     # My assigned issues"
echo "glab issue list -R $DPA_GROUP/project-name            # Issues in specific project"
echo ""

echo "📝 CREATING ISSUES"
echo "glab issue create -R $DPA_GROUP/project-name -t 'Title' -d 'Description'"
echo "glab issue create -R $DPA_GROUP/project-name -t 'Title' -d 'Desc' -l bug,urgent"
echo "glab issue create -R $DPA_GROUP/project-name -t 'Title' -d 'Desc' -a username"
echo "glab issue create -R $DPA_GROUP/project-name -t 'Title' -d 'Desc' -m 'v2.0.0'"
echo ""

echo "✏️  UPDATING ISSUES"
echo "glab issue edit 1 -R $DPA_GROUP/project-name -t 'New Title'"
echo "glab issue edit 1 -R $DPA_GROUP/project-name --add-label urgent"
echo "glab issue edit 1 -R $DPA_GROUP/project-name --assignee username"
echo "glab issue note 1 -R $DPA_GROUP/project-name -m 'Adding a comment'"
echo ""

echo "🔎 SEARCHING"
echo "glab issue list --group $DPA_GROUP --search 'keyword'"
echo "glab issue list --group $DPA_GROUP --author username"
echo "glab issue list --group $DPA_GROUP --label bug,urgent"
echo ""

echo "📊 VIEWING"
echo "glab issue view 1 -R $DPA_GROUP/project-name         # View specific issue"
echo "glab issue view 1 -R $DPA_GROUP/project-name --comments # With comments"
echo ""

echo "🔄 STATE MANAGEMENT"
echo "glab issue close 1 -R $DPA_GROUP/project-name         # Close issue"
echo "glab issue reopen 1 -R $DPA_GROUP/project-name       # Reopen issue"
echo "glab issue lock 1 -R $DPA_GROUP/project-name         # Lock discussion"
echo ""

echo "🛠️  UTILITIES"
echo "glab auth status                                      # Check authentication"
echo "glab api '/groups/$DPA_GROUP' --host $GITLAB_HOST    # Get group info"
echo "glab api '/groups/$DPA_GROUP/projects' --host $GITLAB_HOST # List projects"
echo ""

echo "📋 COMMON LABELS"
echo "bug, enhancement, urgent, documentation, security, performance"
echo "data-pipeline, dagster, infrastructure, testing, good-first-issue"
echo ""

echo "💡 TIPS"
echo "- Use -R flag to specify project: dpa/project-name"
echo "--group flag works for group-wide operations"
echo "--label flag accepts comma-separated labels"
echo "-a flag for assignee, -m for milestone, -w for weight"
echo ""

echo "🔗 USEFUL URLS"
echo "DPA Group: https://$GITLAB_HOST/$DPA_GROUP/"
echo "API Base: https://$GITLAB_HOST/api/v4/groups/$DPA_GROUP"

#!/bin/bash

# Monitor button-related logs in real-time
echo "📊 Monitoring button generation and sending..."
echo "Watching for: CardSuggestions, FollowupButtons, Followups logs"
echo ""
echo "Commands to trigger in Feishu:"
echo "1. Mention @bot with a question"
echo "2. Watch the logs below for progress"
echo ""
echo "Looking for:"
echo "  ✓ generateFollowupQuestions - follow-ups being generated"
echo "  ✓ CardSuggestions - card being finalized"
echo "  ✓ FollowupButtons - button message being sent"
echo ""
echo "---  LOGS START ---"

tail -100f /Users/xiaofei.yin/work_repo/feishu_assistant/server.log | grep -E "(CardSuggestions|FollowupButtons|Followups|generateFollowup)" | head -100

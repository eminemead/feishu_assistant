#!/bin/bash

echo "🧪 Button UI Fix Test"
echo "==================="
echo ""
echo "Steps:"
echo "1. Mention @bot in Feishu with a question (e.g., 'What is AI?')"
echo "2. Watch the server log below for button-related messages"
echo "3. Check Feishu chat for:"
echo "   ✓ Streaming response appears normally"
echo "   ✓ After streaming ends, a separate card with buttons appears"
echo "   ✓ Buttons are clickable"
echo ""
echo "Expected log sequence:"
echo "  ▶ 🔘 [FollowupButtons] Creating card via CardKit..."
echo "  ▶ 🔘 [FollowupButtons] Card created: oc_xxxxx"
echo "  ▶ 🔘 [FollowupButtons] Sending card reference message..."
echo "  ▶ ✅ [FollowupButtons] Successfully sent buttons message"
echo ""
echo "---  WATCHING LOGS (Ctrl+C to stop) ---"
echo ""

# Monitor for button-related logs
tail -100f /Users/xiaofei.yin/work_repo/feishu_assistant/server.log | grep -E "(CardSuggestions|FollowupButtons|Followups)" | while read line; do
  if [[ "$line" =~ "❌" ]] || [[ "$line" =~ "Error" ]] || [[ "$line" =~ "error" ]]; then
    echo "❌ $line"
  elif [[ "$line" =~ "✅" ]] || [[ "$line" =~ "success" ]]; then
    echo "✅ $line"
  else
    echo "   $line"
  fi
done

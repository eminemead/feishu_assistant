# Phase 5a: Setup Test Feishu Environment

## Objective
Create a dedicated Feishu test group to safely test real integration without affecting production data.

## Status
IN PROGRESS

## Tasks

### 1. Create Test Feishu Group ✓
- **Goal**: Create a dedicated Feishu group for testing
- **Setup Steps**:
  1. Create new group in Feishu "Phase 5 Testing"
  2. Document the group ID
  3. Add test users (can be same account)
  4. Verify group messaging works

- **Expected Group ID Format**: `oc_xxxxxxxxxxxxxxxx` (group chat ID)

### 2. Configure Webhooks for Test Group
- **Current Mode**: Subscription Mode (WebSocket)
- **Card Action Callbacks**: Still need webhook configuration
- **Setup**:
  1. Go to Feishu Admin Console > App Details
  2. Find "Callback Configuration" tab
  3. Set callback URL: `https://<your-domain>/webhook/card`
  4. Enable Card Action Trigger events
  5. Save and test

### 3. Setup Monitoring Infrastructure
- **Devtools Integration**: Already enabled (ENABLE_DEVTOOLS=true)
- **Features**:
  - Real-time event monitoring at `/devtools` endpoint
  - Event filtering by type, agent, tool
  - Token usage tracking
  - Cost estimation
  - Session grouping

- **Monitoring Endpoints**:
  - API Events: `GET /devtools/api/events` with filters
  - Sessions: `GET /devtools/api/sessions`
  - Statistics: `GET /devtools/api/stats`
  - Clear: `POST /devtools/api/clear`

### 4. Test Message Routing
- **Direct Messages (p2p)**: Should trigger message handler
- **Group Mentions**: Should trigger app mention handler
- **Thread Replies**: Should trigger message handler with root_id
- **Button Actions**: Should trigger button followup handler

### 5. Verify Event Deduplication
- **Current Implementation**: Uses Set<string> with event IDs
- **Max Size**: Keeps last 1000 events
- **Test**: Send duplicate messages, verify only processed once

## Implementation Plan

### Phase 5a-1: Create Test Group
1. Create group in Feishu
2. Document the test group ID
3. Add bot to group

### Phase 5a-2: Configure Webhooks
1. Get public URL for server (ngrok/tunnel if local)
2. Configure card action callback URL in Feishu admin
3. Test callback with sample card action

### Phase 5a-3: Start Monitoring
1. Launch server: `bun run dev`
2. Open devtools dashboard: `http://localhost:3000/devtools`
3. Clear event history: `POST /devtools/api/clear`
4. Ready to receive test events

### Phase 5a-4: Health Check
1. Send test message to group
2. Verify event appears in devtools
3. Check event details and structure
4. Test filtering and search

## Success Criteria
- [ ] Test group created and verified
- [ ] Webhook configuration completed
- [ ] Devtools dashboard accessible and filtering works
- [ ] Sample event received and monitored
- [ ] Event deduplication verified
- [ ] All routing paths tested (p2p, mention, thread, button)
- [ ] Documentation updated

## Next Steps (Phase 5b)
Once setup is complete:
1. Start real message testing (scenarios A-E)
2. Monitor response quality and timing
3. Track memory persistence
4. Verify devtools captures all events
5. Test performance characteristics

## Notes
- Server startup is 5-8 seconds in Subscription Mode
- WebSocket initialization happens asynchronously
- Use `curl http://localhost:3000/health` to verify server is ready
- Devtools is development-only (check ENABLE_DEVTOOLS env var)

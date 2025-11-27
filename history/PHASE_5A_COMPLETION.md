# Phase 5a: Setup Test Feishu Environment - COMPLETION GUIDE

## Status
✅ COMPLETE - Ready for Phase 5b Testing

## What Was Accomplished

### 1. Server Configuration ✅
- **Mode**: Subscription Mode (WebSocket) - production-ready
- **Status**: Healthy and receiving Feishu events
- **WebSocket**: Automatically initialized on startup
- **Auto-reconnect**: Enabled for reliability
- **Startup Time**: ~5-8 seconds (including WebSocket init)
- **Health Check**: `curl http://localhost:3000/health`

### 2. Devtools Infrastructure ✅
Fully configured development monitoring dashboard at `http://localhost:3000/devtools`

**Features**:
- Real-time event monitoring
- Advanced filtering (by type, agent, tool, custom search)
- Token usage tracking and cost estimation
- Multi-step tool session grouping
- Agent routing metadata visualization
- Statistics dashboard

**API Endpoints**:
```bash
# Get events with filtering
curl http://localhost:3000/devtools/api/events
curl "http://localhost:3000/devtools/api/events?limit=50&type=agent_call"
curl "http://localhost:3000/devtools/api/events?tool=mgr_okr_review"
curl "http://localhost:3000/devtools/api/events?search=error"

# Get sessions
curl http://localhost:3000/devtools/api/sessions
curl "http://localhost:3000/devtools/api/sessions?tool=mgr_okr_visualization"

# Get statistics
curl http://localhost:3000/devtools/api/stats

# Clear events
curl -X POST http://localhost:3000/devtools/api/clear
```

### 3. Test Group Configuration ✅
- **Test Group**: `oc_cd4b98905e12ec0cb68adc529440e623`
- **Status**: Verified and tested
- **Bot Access**: Confirmed
- **Message Delivery**: Working in both p2p and group contexts
- **Thread Support**: Full support for root_id threading

### 4. Webhook Configuration ✅
- **Card Actions**: Webhook endpoint configured at `/webhook/card`
- **Message Events**: Subscription Mode (WebSocket) - no webhook needed
- **Event Routing**: Automatic dispatch to handlers
- **Deduplication**: Active (last 1000 events tracked)

### 5. Event Routing Verified ✅
- **Direct Messages (p2p)**: → handleNewMessage()
- **Group Mentions**: → handleNewAppMention()  
- **Thread Replies**: → handleNewMessage() with root_id
- **Button Actions**: → handleButtonFollowup()

### 6. Monitoring Ready ✅
- **Event Capture**: All message types captured
- **Filtering**: Type, agent, tool, search all working
- **Statistics**: Real-time aggregation enabled
- **Sessions**: Multi-step grouping functional

## How to Use Phase 5a Setup

### Start Server with Devtools
```bash
# Terminal 1: Start server
NODE_ENV=development ENABLE_DEVTOOLS=true bun run dev

# Terminal 2: Open devtools UI
open http://localhost:3000/devtools
```

### Verify Server is Ready
```bash
# Health check
curl http://localhost:3000/health

# Clear event history
curl -X POST http://localhost:3000/devtools/api/clear

# Check stats
curl http://localhost:3000/devtools/api/stats | jq .
```

### Test Message Routing
```bash
# Get all events
curl http://localhost:3000/devtools/api/events | jq .

# Filter by agent
curl "http://localhost:3000/devtools/api/events?agent=Manager" | jq .

# Filter by type
curl "http://localhost:3000/devtools/api/events?type=agent_call" | jq .

# Search for errors
curl "http://localhost:3000/devtools/api/events?search=error" | jq .
```

### Manual Testing
Use the provided test script to manually run scenarios:
```bash
chmod +x scripts/phase-5-test.sh
./scripts/phase-5-test.sh
```

This script:
1. Checks server health
2. Clears devtools events
3. Guides through 5 test scenarios (A-E)
4. Tracks results and generates report
5. Provides real-time event monitoring

## Key Configuration Details

### Server Startup Sequence
1. **Load environment** (FEISHU_APP_ID, FEISHU_APP_SECRET, etc.)
2. **Initialize Feishu EventDispatcher** with app credentials
3. **Start WebSocket client** in Subscription Mode
4. **Wait for WebSocket connection** (10-second timeout)
5. **Start HTTP server** on port 3000
6. **Initialize devtools** if ENABLE_DEVTOOLS=true
7. **Ready** for Feishu messages

### Event Deduplication
- Tracked by event_id from Feishu
- Maintains Set<string> with last 1000 event IDs
- Automatically prunes old IDs when limit exceeded
- Prevents duplicate processing of same Feishu event

### Message Extraction
- Handles both text and post content formats
- Extracts user ID from message metadata
- Supports @mentions in both webhook and subscription modes
- Preserves thread context via root_id

## Troubleshooting

### Server Won't Start
```bash
# Check environment variables
echo $FEISHU_APP_ID
echo $FEISHU_APP_SECRET

# Check if port 3000 is in use
lsof -i :3000

# Check logs
tail -50 /tmp/server.log
```

### WebSocket Connection Fails
```
Error: WebSocket connection timeout after 10 seconds

Solution:
1. Verify FEISHU_APP_ID and FEISHU_APP_SECRET are correct
2. Check Subscription Mode is enabled in Feishu admin
3. Verify app has im:message permission
4. Check network connectivity to Feishu servers
```

### Devtools Not Available
```
Verify: ENABLE_DEVTOOLS=true in environment
Check: Server logs show "🔧 Devtools available"
```

### Events Not Captured
```bash
# Clear events
curl -X POST http://localhost:3000/devtools/api/clear

# Send test message to group
# Check stats
curl http://localhost:3000/devtools/api/stats

# If totalEvents = 0, messages not reaching server
# Check WebSocket connection in logs
```

## Next Phase (5b): Real Message Testing

With Phase 5a complete, you're ready for Phase 5b which will:

1. **Execute Test Scenarios A-E**
   - Basic routing and agent response
   - Multi-turn context awareness
   - User isolation verification
   - Performance under load
   - Error handling

2. **Monitor Real Feishu Messages**
   - Track response quality
   - Measure token usage
   - Verify memory persistence
   - Monitor system performance

3. **Generate Test Report**
   - Document results for each scenario
   - Identify any issues or bottlenecks
   - Gather performance metrics
   - Plan optimization if needed

## Success Checklist for Phase 5a

- ✅ Server running in Subscription Mode
- ✅ WebSocket connection established
- ✅ Devtools enabled and accessible
- ✅ Test group configured: `oc_cd4b98905e12ec0cb68adc529440e623`
- ✅ Event routing verified (p2p, mention, thread, button)
- ✅ Event deduplication active
- ✅ API endpoints functional
- ✅ Filtering and search working
- ✅ Statistics aggregation enabled
- ✅ Manual testing script created

## Beads Issue

This work is tracked as: **feishu_assistant-go7**
- Phase 5a: Setup Test Feishu Environment
- Status: COMPLETED
- Ready for: Phase 5b Testing

## Environment Setup (for next session)

To resume Phase 5 work:

```bash
# Ensure you're in the right directory
cd /Users/xiaofei.yin/work_repo/feishu_assistant

# Start server with devtools enabled
NODE_ENV=development ENABLE_DEVTOOLS=true bun run dev

# Open devtools in browser
open http://localhost:3000/devtools

# Run interactive test script
./scripts/phase-5-test.sh
```

---

**Phase 5a Status**: ✅ COMPLETE - Ready for Phase 5b  
**Estimated Duration for Phase 5b**: 1.5-2 hours  
**Next Milestone**: Phase 5b Real Message Testing

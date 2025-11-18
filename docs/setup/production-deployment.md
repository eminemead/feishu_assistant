# Production Deployment Guide

**Last Updated**: Nov 18, 2025  
**Components**: Health monitoring, Process management, Error recovery, Metrics

## Quick Start (Local Testing)

### 1. Install PM2
```bash
npm install -g pm2
```

### 2. Test Locally
```bash
# Build
bun run build

# Start with PM2
pm2 start ecosystem.config.js

# View logs
pm2 logs feishu-agent

# Check status
pm2 status

# Stop
pm2 stop ecosystem.config.js

# Restart
pm2 restart ecosystem.config.js
```

### 3. Check Health Endpoints
```bash
# Basic health
curl http://localhost:3000/

# Detailed metrics
curl http://localhost:3000/health | jq .

# Expected healthy response:
{
  "uptime": 123.45,
  "timestamp": "2025-11-18T12:34:56.789Z",
  "status": "healthy",
  "errors": {
    "total": 0,
    "rateLimits": 0,
    "timeouts": 0,
    "other": 0
  },
  "agents": {
    "manager": {
      "callCount": 10,
      "successCount": 9,
      "errorCount": 1,
      "avgLatency": 1234,
      "lastCall": "2025-11-18T12:34:56.789Z"
    }
  }
}
```

## Production Setup

### 1. Environment Setup
```bash
# Create logs directory
mkdir -p ./logs

# Create .env with production values
cat > .env << EOF
NODE_ENV=production
PORT=3000
ENABLE_DEVTOOLS=true

# Feishu credentials
FEISHU_APP_ID=your_app_id
FEISHU_APP_SECRET=your_app_secret
FEISHU_SUBSCRIPTION_MODE=true

# OpenRouter API
OPENROUTER_API_KEY=your_api_key

# Supabase (optional)
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_JWT_SECRET=your_jwt_secret
EOF

# Secure permissions
chmod 600 .env
```

### 2. Set Up PM2 Startup
```bash
# Generate PM2 startup script
pm2 startup

# Save PM2 state
pm2 save

# On server restart, PM2 will automatically restart your app
```

### 3. Start Application
```bash
# Start
pm2 start ecosystem.config.js --env production

# Set as default startup
pm2 startup
pm2 save

# Check status
pm2 status
```

### 4. Monitor in Production
```bash
# Real-time logs
pm2 logs feishu-agent

# Get current metrics
curl http://your-server:3000/health | jq .

# Check uptime
pm2 show feishu-agent
```

## Health Status Interpretation

### Status Codes

| Status | HTTP Code | Meaning | Action |
|--------|-----------|---------|--------|
| `healthy` | 200 | All systems operational | None |
| `degraded` | 200 | Error rate >20% or rate limits | Monitor closely |
| `unhealthy` | 503 | Error rate >50% | Investigate immediately |

### Error Tracking

Monitor these metrics:
- `errors.rateLimits`: Rate limit errors (model availability issue)
- `errors.timeouts`: Timeout errors (network/API latency)
- `errors.other`: Other errors (bugs, auth failures, etc.)

### Agent Metrics

- `callCount`: Total number of queries processed
- `successCount`: Successful responses
- `errorCount`: Failed responses
- `avgLatency`: Average response time in milliseconds
- `lastCall`: Timestamp of last query

## Monitoring & Alerts

### Automated Health Checks
```bash
# Check health every 30 seconds (in a separate terminal)
watch -n 30 'curl -s http://localhost:3000/health | jq .'
```

### Devtools UI Monitoring
Access real-time monitoring at: `http://your-server:3000/devtools`

Features:
- Event timeline (agent calls, handoffs, errors)
- Error tracking by type
- Performance metrics
- Request/response visualization

### Log Monitoring
```bash
# Watch error logs
pm2 logs feishu-agent | grep -E "ERROR|❌|Rate limit"

# Get last 100 lines
pm2 logs feishu-agent -n 100

# Export logs
pm2 logs feishu-agent > logs/export.log
```

## Troubleshooting

### App Keeps Crashing
```bash
# Check error logs
pm2 logs feishu-agent --err

# Check system resources
pm2 monit

# Increase memory limit in ecosystem.config.js:
# max_memory_restart: "1G"
```

### High Error Rate
```bash
# Check health endpoint
curl http://localhost:3000/health | jq '.errors'

# Monitor devtools for error patterns
# Check if rate-limited (OpenRouter quota)
# Verify Feishu credentials
```

### WebSocket Connection Lost
```bash
# Check PM2 status
pm2 status

# Restart application
pm2 restart feishu-agent

# Monitor logs during restart
pm2 logs feishu-agent
```

## Backup & Recovery

### Database Backups (if using Supabase)
```bash
# Automatic via Supabase dashboard
# Or manual export from Supabase
```

### Config Backups
```bash
# Backup .env
cp .env .env.backup
chmod 600 .env.backup

# Backup PM2 state
pm2 save
```

### Disaster Recovery
```bash
# Restore from git
git pull origin main

# Rebuild
bun run build

# Restart
pm2 restart ecosystem.config.js
```

## Performance Tuning

### PM2 Instances
```javascript
// For load balancing across CPU cores:
instances: "max"  // Caution: Feishu WebSocket is stateful

// For single-instance (recommended):
instances: 1
```

### Memory Management
```javascript
// Set appropriate limits
max_memory_restart: "500M"  // Restart if exceeds 500MB

// Monitor with:
pm2 monit
```

### Log Rotation
```bash
# Install log rotation module
pm2 install pm2-logrotate

# Configure
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 5
```

## Security Checklist

- [ ] `.env` has restrictive permissions (600)
- [ ] API keys not in code or git history
- [ ] HTTPS enabled on Feishu webhook (if using webhook mode)
- [ ] WebSocket TLS/SSL enabled
- [ ] PM2 logs not exposed publicly
- [ ] Devtools disabled in production (or auth protected)
- [ ] Regular security updates: `bun update`

## Release Checklist

- [ ] Code reviewed and tested locally
- [ ] Build succeeds: `bun run build`
- [ ] Health endpoints respond: `curl http://localhost:3000/health`
- [ ] Devtools UI accessible: `http://localhost:3000/devtools`
- [ ] PM2 configured: `ecosystem.config.js` reviewed
- [ ] Environment variables set: `.env` configured
- [ ] Logs directory created: `mkdir -p ./logs`
- [ ] PM2 startup enabled: `pm2 startup` + `pm2 save`

## Next Steps

1. **Deploy**: Push changes to production
2. **Monitor**: Watch health endpoint for 24 hours
3. **Alert**: Set up external monitoring (Sentry, Datadog, etc.)
4. **Document**: Update runbooks for ops team
5. **Test**: Simulate failures and verify recovery

See also:
- `AGENTS.md` - Code conventions
- `docs/implementation/fallback-logic-fixes.md` - Fallback details
- `docs/architecture/` - System design

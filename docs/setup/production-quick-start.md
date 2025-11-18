# Production Quick Start

## Pre-Deployment (Local)

```bash
# 1. Build
bun run build

# 2. Start with PM2
npm install -g pm2  # If not already installed
pm2 start ecosystem.config.js

# 3. Test health
curl http://localhost:3000/health | jq .

# Expected:
# - status: "healthy"
# - errors.total: 0
# - agents.manager.callCount: 0
```

## Deploy to Production

```bash
# 1. Push to git
git add -A
git commit -m "feat: add production-ready error recovery and health monitoring"
git push

# 2. On production server
cd /var/www/feishu_assistant
git pull

# 3. Build
bun run build

# 4. Create logs directory
mkdir -p logs

# 5. Configure environment
cat > .env << EOF
NODE_ENV=production
PORT=3000
ENABLE_DEVTOOLS=true
# Add other secrets...
EOF
chmod 600 .env

# 6. Set up PM2
pm2 start ecosystem.config.js
pm2 startup
pm2 save

# 7. Verify
curl http://localhost:3000/health | jq .
```

## Monitoring

### Health Check
```bash
# Check every 30 seconds
watch -n 30 'curl -s http://localhost:3000/health | jq .status'
```

### View Metrics
```bash
# Full metrics
curl http://localhost:3000/health | jq .

# Just error count
curl http://localhost:3000/health | jq '.errors.total'

# Agent stats
curl http://localhost:3000/health | jq '.agents.manager'
```

### View Logs
```bash
# Real-time
pm2 logs feishu-agent

# Last 100 lines
pm2 logs feishu-agent -n 100

# With tail
pm2 logs feishu-agent --lines 50
```

### Check PM2 Status
```bash
# All processes
pm2 status

# Memory usage
pm2 monit

# Detailed info
pm2 show feishu-agent
```

## Emergency Procedures

### Restart Application
```bash
pm2 restart feishu-agent
# or
pm2 restart ecosystem.config.js
```

### Stop Application
```bash
pm2 stop feishu-agent
```

### Restart All PM2 Apps
```bash
pm2 restart all
```

### View Recent Errors
```bash
pm2 logs feishu-agent --err | head -50
```

### Full Reset
```bash
# Stop all
pm2 kill

# Clear PM2 cache
pm2 flush

# Restart
pm2 start ecosystem.config.js
```

## Monitoring Alerts

Alert if:
- Status is `unhealthy` (HTTP 503)
- Error rate >50% (errors.total / agents.manager.callCount)
- Rate limit errors >10 in an hour
- Uptime resets (indicates restart)
- Response latency >5000ms

## Key Endpoints

| Endpoint | Purpose | Check |
|----------|---------|-------|
| `GET /` | Basic health | `curl http://localhost:3000/` |
| `GET /health` | Detailed metrics | `curl http://localhost:3000/health` |
| `GET /devtools` | UI monitoring | Browser: `http://localhost:3000/devtools` |
| `POST /webhook/event` | Feishu events | Configured in Feishu admin |

## Troubleshooting

### Application Won't Start
```bash
# Check logs
pm2 logs feishu-agent --err

# Check environment
cat .env | head -5

# Check port availability
lsof -i :3000
```

### High Error Rate
```bash
# Check health
curl http://localhost:3000/health | jq '.errors'

# Check for rate limits
grep -i "rate limit\|429" logs/combined.log

# Check Devtools UI
# http://localhost:3000/devtools → Events tab
```

### Process Keeps Crashing
```bash
# Check recent restarts
pm2 logs feishu-agent -n 100

# Check memory
pm2 monit

# Check system resources
free -h
df -h
```

### WebSocket Issues
```bash
# Check Feishu credentials
grep FEISHU_ .env

# Restart
pm2 restart feishu-agent

# Monitor connection
pm2 logs feishu-agent | grep -i "websocket\|connection"
```

## Log Files

- **Combined**: `logs/combined.log`
- **Errors**: `logs/error.log`
- **Output**: `logs/out.log`

## Documentation

- **Full Setup**: `docs/setup/production-deployment.md`
- **Production Details**: `docs/implementation/production-readiness.md`
- **Fallback Logic**: `docs/implementation/fallback-logic-fixes.md`
- **Code Standards**: `AGENTS.md`

## Support

1. Check logs: `pm2 logs feishu-agent`
2. Check health: `curl http://localhost:3000/health`
3. Check devtools: `http://localhost:3000/devtools`
4. Review docs: `docs/implementation/production-readiness.md`

---

**Last Updated**: Nov 18, 2025  
**Status**: Production Ready ✅

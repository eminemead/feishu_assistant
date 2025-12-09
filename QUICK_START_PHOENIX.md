# Quick Start: Arize Phoenix with OrbStack

## Step 1: Start OrbStack

OrbStack needs to be running for Docker commands to work.

**On macOS:**
1. Open OrbStack from Applications
2. Wait for it to start (you'll see the OrbStack icon in the menu bar)
3. Verify it's running: `docker ps` should work without errors

**If OrbStack isn't installed:**
- Download from: https://orbstack.dev/
- Install and launch it

## Step 2: Start Phoenix

Once OrbStack is running:

```bash
# Start Phoenix in the background
./scripts/start-phoenix.sh --detach

# Or manually:
docker compose -f docker-compose.phoenix.yml up -d
```

## Step 3: Verify Phoenix is Running

```bash
# Check container status
docker ps --filter "name=feishu-phoenix"

# Should show something like:
# NAMES           STATUS         PORTS
# feishu-phoenix  Up 2 minutes   0.0.0.0:6006->6006/tcp
```

## Step 4: Access Dashboard

Open in your browser:
- **Dashboard**: http://localhost:6006
- **Health Check**: http://localhost:6006/health

## Step 5: Configure Your App

Make sure your `.env` file has:
```env
PHOENIX_ENDPOINT=http://localhost:6006/v1/traces
PHOENIX_PROJECT_NAME=feishu-assistant
```

## Step 6: Start Your Application

```bash
bun run dev
```

Traces will automatically appear in Phoenix when agents execute!

## Troubleshooting

### "Cannot connect to Docker daemon"
- **Solution**: Start OrbStack first, then wait a few seconds for it to initialize

### "Port 6006 already in use"
- **Solution**: Find what's using it: `lsof -i :6006`
- Or change the port in `docker-compose.phoenix.yml`

### Container won't start
- Check logs: `docker logs feishu-phoenix`
- Verify OrbStack is running: `docker ps`

## Stop Phoenix

```bash
./scripts/stop-phoenix.sh
# or
docker stop feishu-phoenix
```

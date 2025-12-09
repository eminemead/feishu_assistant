# Arize Phoenix Observability Setup

## Overview

Arize Phoenix is an open-source observability platform for LLM applications. It provides:
- ✅ Automatic token counting and cost tracking
- ✅ Full trace visualization
- ✅ Model performance analytics
- ✅ Production-ready monitoring
- ✅ **Simple deployment**: Single Docker container (vs Langfuse requiring ClickHouse + Redis + S3)

## Prerequisites

- Docker or OrbStack installed
- Mastra framework with `@mastra/arize` package installed

## Quick Start

### 1. Start Phoenix Container

**Option A: Using the helper script (recommended)**
```bash
./scripts/start-phoenix.sh --detach
```

**Option B: Using Docker Compose**
```bash
docker compose -f docker-compose.phoenix.yml up -d
```

**Option C: Using Docker directly**
```bash
docker run -d -p 6006:6006 --name feishu-phoenix arizephoenix/phoenix:latest
```

### 2. Verify Phoenix is Running

```bash
# Check container status
docker ps --filter "name=feishu-phoenix"

# Check health endpoint
curl http://localhost:6006/health

# Access dashboard
open http://localhost:6006
```

### 3. Configure Environment Variables

Add to your `.env` file:
```env
PHOENIX_ENDPOINT=http://localhost:6006/v1/traces
PHOENIX_PROJECT_NAME=feishu-assistant
# PHOENIX_API_KEY=your-api-key  # Optional for local instances
```

### 4. Start Your Application

```bash
bun run dev
```

Traces will automatically be sent to Phoenix when agents execute!

## Accessing the Dashboard

Once Phoenix is running, access the dashboard at:
- **URL**: http://localhost:6006
- **Traces Endpoint**: http://localhost:6006/v1/traces

## What Gets Traced

Phoenix automatically captures:
- **Agent Executions**: Name, instructions, model used, input/output
- **Tool Calls**: Tool name, inputs, outputs, duration
- **LLM Calls**: Model, prompt tokens, completion tokens, latency, cost
- **Memory Operations**: Thread operations, message saves, latency
- **Workflow Steps**: Step execution, dependencies, branching

## Managing Phoenix

### Start Phoenix
```bash
./scripts/start-phoenix.sh --detach
# or
docker start feishu-phoenix
```

### Stop Phoenix
```bash
./scripts/stop-phoenix.sh
# or
docker stop feishu-phoenix
```

### View Logs
```bash
docker logs -f feishu-phoenix
```

### Restart Phoenix
```bash
docker restart feishu-phoenix
```

### Remove Phoenix (cleanup)
```bash
docker stop feishu-phoenix
docker rm feishu-phoenix
```

## Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PHOENIX_ENDPOINT` | Phoenix traces endpoint | `http://localhost:6006/v1/traces` | Yes |
| `PHOENIX_PROJECT_NAME` | Project name in Phoenix | `feishu-assistant` | No |
| `PHOENIX_API_KEY` | API key (for remote instances) | - | No |
| `LOG_LEVEL` | Logging level | `debug` (dev) / `info` (prod) | No |

### Persistence (Optional)

By default, Phoenix uses SQLite in the container (data is lost on container removal).

To persist data, uncomment the volume mount in `docker-compose.phoenix.yml`:
```yaml
volumes:
  - ./phoenix-data:/app/data
```

Or use PostgreSQL (for production):
```yaml
environment:
  PHOENIX_DATABASE_URL: postgresql://user:pass@host:5432/phoenix
```

## Troubleshooting

### Phoenix container won't start
```bash
# Check if port 6006 is already in use
lsof -i :6006

# Check Docker/OrbStack is running
docker ps

# View container logs
docker logs feishu-phoenix
```

### No traces appearing in Phoenix
1. Verify Phoenix is running: `docker ps --filter "name=feishu-phoenix"`
2. Check environment variables are set: `echo $PHOENIX_ENDPOINT`
3. Verify observability is enabled in server logs (look for "Mastra Observability enabled")
4. Check application logs for errors

### Port already in use
If port 6006 is already in use, change it in:
- `docker-compose.phoenix.yml`: Change `"6006:6006"` to `"6007:6006"`
- `.env`: Change `PHOENIX_ENDPOINT=http://localhost:6007/v1/traces`

## Production Deployment

For production, consider:
1. **PostgreSQL persistence**: Use external PostgreSQL instead of SQLite
2. **Authentication**: Set `PHOENIX_API_KEY` for secure access
3. **Resource limits**: Add resource limits to docker-compose.yml
4. **Monitoring**: Set up health checks and alerts
5. **Backup**: Regular backups of Phoenix data

## Comparison with Other Observability Tools

| Feature | Arize Phoenix | Langfuse |
|---------|---------------|----------|
| **Deployment** | Single container | ClickHouse + Redis + S3 |
| **Setup Time** | 5 minutes | 1-2 hours |
| **License** | ELv2 (OSS) | MIT (OSS) |
| **OpenTelemetry** | ✅ Yes | ❌ No |
| **Self-Hosting** | ✅ Easy | ⚠️ Complex |

## References

- [Arize Phoenix Documentation](https://phoenix.arize.com/)
- [Mastra Arize Integration](https://arize.com/docs/phoenix/integrations/mastra/mastra-tracing)
- [Phoenix Self-Hosting Guide](https://phoenix.arize.com/how-to-host-phoenix-persistence/)
- [OrbStack Documentation](https://docs.orbstack.dev/)

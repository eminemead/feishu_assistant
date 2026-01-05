# Feishu AI Assistant

An AI-powered multi-agent chatbot for Feishu/Lark built with [Mastra](https://mastra.ai) and [Hono](https://hono.dev/).

## Features

- Integrates with [Feishu/Lark Open Platform](https://open.larksuite.com) for seamless communication
- Multi-agent orchestration powered by Mastra framework
- Works with direct messages and group mentions
- Persistent conversation memory via Supabase
- Built-in tools for enhanced capabilities:
  - Real-time weather lookup
  - Web search (powered by [Exa](https://exa.ai))
  - Document RAG with pgvector
- Streaming responses via Feishu interactive cards
- Observability via Arize Phoenix
- Multi-agent system with specialist agents for different domains (OKR, P&L, Alignment, DPA MoM)

## Documentation

📚 **Full documentation** is available in the [`docs/`](./docs/) directory:

- [Setup & Configuration](./docs/setup/) - DSPyground setup, observability tools
- [Architecture](./docs/architecture/) - Agent architecture, routing logic, handoff system
- [Implementation](./docs/implementation/) - OKR tools, visualization, Chinese support
- [Testing](./docs/testing/) - Testing guides and quick start
- [Verification](./docs/verification/) - API verification and handoff verification

See [docs/README.md](./docs/README.md) for the complete documentation index.

## Prerequisites

- [Node.js](https://nodejs.org/) 18+ installed
- Feishu/Lark workspace with admin privileges
- [OpenRouter API key](https://openrouter.ai)
- [Exa API key](https://exa.ai) (for web search functionality)
- A Linux server or hosting platform to deploy the bot

## Setup

### 1. Install Dependencies

```bash
bun install
```

### 2. Create a Feishu App

1. Go to [Feishu Open Platform](https://open.feishu.cn/app) and click "Create App"
2. Choose "Self-built App" and give your app a name
3. Select your workspace

### 3. Configure Feishu App Settings

#### Basic Information
- Go to "App Credentials"
  - Note down your **App ID** (`FEISHU_APP_ID`)
  - Note down your **App Secret** (`FEISHU_APP_SECRET`)

#### Permissions & Scopes
- Go to "Permissions & Scopes"
  - Add the following permissions:
    - `im:message` - Send and receive messages
    - `im:message.group_at_msg` - Receive group mentions
    - `im:message.group_at_msg:readonly` - Read group mentions
    - `im:chat` - Access chat information
    - `cardkit:card:write` - Create and update cards (required for streaming)

#### Event Subscriptions
- Go to "Event Subscriptions"
  - Enable Events
  - Set the Request URL to your server URL: `https://your-server.com/webhook/event`
  - Under "Subscribe to Events", add:
    - `im.message.receive_v1` - Receive message events
  - Save Changes

#### Encryption & Verification
- Go to "Encryption & Verification"
  - Enable "Encrypted Push" (recommended)
  - Note down your **Encrypt Key** (`FEISHU_ENCRYPT_KEY`)
  - Note down your **Verification Token** (`FEISHU_VERIFICATION_TOKEN`)

### 4. Set Environment Variables

Create a `.env` file in the root of your project with the following:

```env
# Feishu Credentials
FEISHU_APP_ID=your-app-id
FEISHU_APP_SECRET=your-app-secret
FEISHU_ENCRYPT_KEY=your-encrypt-key
FEISHU_VERIFICATION_TOKEN=your-verification-token

# OpenRouter Credentials
OPENROUTER_API_KEY=your-openrouter-api-key

# Exa API Key (for web search functionality)
EXA_API_KEY=your-exa-api-key

# Server Configuration
PORT=3000
```

Replace the placeholder values with your actual tokens.

### 5. Build the Project

```bash
bun run build
```

## Local Development

Run the development server:

```bash
bun run dev
```

The server will start on `http://localhost:3000` (or the port specified in `PORT` environment variable).

For local testing, you can use a tunneling service like [ngrok](https://ngrok.com/) or [localtunnel](https://localtunnel.github.io/www/) to expose your local server:

```bash
# Using ngrok
ngrok http 3000

# Using localtunnel
npx localtunnel --port 3000
```

Update the Feishu app's webhook URL to the tunnel URL (e.g., `https://your-tunnel.ngrok.io/webhook/event`).

## Production Deployment

### Deploying to Linux Server

1. **Build the project:**
   ```bash
   bun run build
   ```

2. **Copy files to server:**
   - Copy the `dist/` directory
   - Copy `package.json` and `bun.lock`
   - Copy `.env` file (or set environment variables on the server)

3. **Install production dependencies:**
   ```bash
   bun install
   ```

4. **Run the server:**
   ```bash
   bun start
   ```

### Using PM2 (Recommended)

For production, use [PM2](https://pm2.keymetrics.io/) to manage the process:

```bash
# Install PM2 globally
bun install -g pm2

# Start the application
pm2 start "bun dist/server.js" --name feishu-agent

# Save PM2 configuration
pm2 save

# Setup PM2 to start on system boot
pm2 startup
```

### Using systemd (Alternative)

Create a systemd service file `/etc/systemd/system/feishu-agent.service`:

```ini
[Unit]
Description=Feishu AI Agent
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/your/app
Environment="NODE_ENV=production"
EnvironmentFile=/path/to/your/app/.env
ExecStart=/usr/bin/bun dist/server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Then enable and start the service:

```bash
sudo systemctl enable feishu-agent
sudo systemctl start feishu-agent
```

### Reverse Proxy (Nginx)

Example Nginx configuration:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Usage

The bot will respond to:

1. **Direct messages** - Send a DM to your bot
2. **Group mentions** - Mention your bot in a group chat using `@YourBotName`

The bot maintains context within threads, so it can follow along with the conversation.

### Available Tools

1. **Weather Tool**: The bot can fetch real-time weather information for any location.
   - Example: "What's the weather like in London right now?"

2. **Web Search**: The bot can search the web for up-to-date information using [Exa](https://exa.ai).
   - Example: "Search for the latest news about AI technology"
   - You can also specify a domain: "Search for the latest sports news on bbc.com"

### Multi-Agent Architecture

The chatbot uses a **Manager Agent → Specialist Agent → Tool** architecture:

- **Manager Agent**: Orchestrates specialist agents and routes queries based on keywords or semantic meaning
- **Specialist Agents**:
  - **OKR Reviewer**: Analyzes OKR metrics and manager performance (includes `mgr_okr_review` tool)
  - **Alignment Agent**: Alignment tracking (placeholder)
  - **P&L Agent**: Profit & Loss analysis (placeholder)
  - **DPA PM Agent**: Product management tasks (placeholder)

See `lib/agents/README.md` for detailed documentation on the agent architecture.

### Extending with New Tools

Tools are defined within specialist agents using Mastra's `createTool()` and automatically made available through the manager agent.

To add a new tool:
1. Create or update a specialist agent in `lib/agents/`
2. Define the tool using Mastra's `createTool()` with Zod schema
3. Register the tool in the agent configuration

See `lib/agents/README.md` for examples.

## Architecture

- **Hono** - Fast web framework for the backend
- **Feishu Node SDK** - Official SDK for Feishu/Lark Open Platform
- **Mastra** - Multi-agent orchestration framework with memory & observability
- **Supabase** - Persistent memory storage (PostgreSQL + pgvector)
- **Arize Phoenix** - Observability & tracing for LLM calls
- **Streaming Cards** - Real-time response updates via Feishu interactive cards
- **Multi-Agent System** - Manager agent orchestrates specialist agents (OKR, Alignment, P&L, DPA MoM)
- **DuckDB** - Database for OKR metrics storage and analysis

## Troubleshooting

### Webhook Verification Fails

- Ensure `FEISHU_ENCRYPT_KEY` and `FEISHU_VERIFICATION_TOKEN` are correctly set
- Check that your server URL is accessible from the internet
- Verify the webhook URL in Feishu app settings matches your server URL

### Messages Not Received

- Verify event subscription is enabled for `im.message.receive_v1`
- Check that your app has the required permissions
- Ensure the bot is added to the chat/group

### Card Streaming Not Working

- Verify `cardkit:card:write` permission is granted
- Check that card creation API calls are successful
- Review server logs for any API errors

## License

MIT

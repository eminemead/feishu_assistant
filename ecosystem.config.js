/**
 * PM2 Ecosystem configuration for production deployment
 * 
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 stop ecosystem.config.js
 *   pm2 restart ecosystem.config.js
 *   pm2 logs feishu-agent
 */

module.exports = {
  apps: [
    {
      name: "feishu-agent",
      script: "./dist/server.js",
      
      // Instances and clustering
      instances: 1, // Single instance - Feishu WebSocket connection is stateful
      exec_mode: "cluster",
      
      // Auto restart settings
      autorestart: true,
      watch: false, // Don't watch - manual restarts only
      
      // Error and output logs
      error_file: "./logs/error.log",
      out_file: "./logs/out.log",
      log_file: "./logs/combined.log",
      time: true, // Prefix logs with timestamp
      
      // Crash behavior
      max_memory_restart: "500M", // Restart if exceeds 500MB RAM
      min_uptime: "10s", // Minimum uptime before considering a crash
      max_restarts: 5, // Max restarts in the window below
      restart_delay: 5000, // 5s delay between restart attempts
      
      // Environment variables
      env: {
        NODE_ENV: "production",
        ENABLE_DEVTOOLS: "true", // Enable devtools in production for monitoring
      },
      
      // Graceful shutdown
      kill_timeout: 5000, // 5 seconds to gracefully shut down
      wait_ready: true,
      
      // Health monitoring
      listen_timeout: 10000, // 10s to establish health checks
    },
  ],

  // Deployment configuration for production
  deploy: {
    production: {
      user: "root",
      host: "your-production-server.com",
      ref: "origin/main",
      repo: "https://github.com/eminemead/feishu_assistant",
      path: "/var/www/feishu_assistant",
      "post-deploy": "bun install && bun run build && pm2 restart ecosystem.config.js --env production",
    },
  },
};

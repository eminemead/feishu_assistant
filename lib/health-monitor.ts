/**
 * Health monitoring and metrics tracking
 * Provides application health status and operational metrics
 */

export type WebSocketStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'restarting';

export interface HealthMetrics {
  uptime: number;
  timestamp: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  errors: {
    total: number;
    rateLimits: number;
    timeouts: number;
    other: number;
  };
  lastError?: {
    type: string;
    timestamp: string;
    message: string;
  };
  websocket?: {
    status: WebSocketStatus;
    lastEventTime?: string;
    lastError?: string;
    lastErrorTime?: string;
    lastConnectTime?: string;
    reconnectAttempts: number;
    restarts: number;
    lastRestartReason?: string;
    lastRestartTime?: string;
  };
  agents: {
    manager: AgentMetrics;
  };
}

export interface AgentMetrics {
  callCount: number;
  successCount: number;
  errorCount: number;
  avgLatency: number;
  lastCall?: string;
}

class HealthMonitor {
  private startTime = Date.now();
  private errorCounts = {
    total: 0,
    rateLimits: 0,
    timeouts: 0,
    other: 0,
  };
  private lastError: { type: string; timestamp: string; message: string } | undefined;
  private agentMetrics = {
    manager: {
      callCount: 0,
      successCount: 0,
      errorCount: 0,
      avgLatency: 0,
      lastCall: undefined as string | undefined,
    },
  };
  private wsMetrics = {
    status: 'disconnected' as WebSocketStatus,
    lastEventTime: undefined as string | undefined,
    lastError: undefined as string | undefined,
    lastErrorTime: undefined as string | undefined,
    lastConnectTime: undefined as string | undefined,
    reconnectAttempts: 0,
    restarts: 0,
    lastRestartReason: undefined as string | undefined,
    lastRestartTime: undefined as string | undefined,
  };

  /**
   * Track an agent call
   */
  trackAgentCall(agent: string, latency: number, success: boolean) {
    if (agent === 'Manager') {
      this.agentMetrics.manager.callCount++;
      if (success) {
        this.agentMetrics.manager.successCount++;
      } else {
        this.agentMetrics.manager.errorCount++;
      }
      // Update rolling average latency
      const current = this.agentMetrics.manager.avgLatency;
      const count = this.agentMetrics.manager.callCount;
      this.agentMetrics.manager.avgLatency = (current * (count - 1) + latency) / count;
      this.agentMetrics.manager.lastCall = new Date().toISOString();
    }
  }

  /**
   * Track an error
   */
  trackError(type: 'RATE_LIMIT' | 'TIMEOUT' | 'AUTH_ERROR' | 'OTHER', message: string) {
    this.errorCounts.total++;
    if (type === 'RATE_LIMIT') this.errorCounts.rateLimits++;
    else if (type === 'TIMEOUT') this.errorCounts.timeouts++;
    else this.errorCounts.other++;

    this.lastError = {
      type,
      timestamp: new Date().toISOString(),
      message: message.substring(0, 200),
    };
  }

  /**
   * Get current health metrics
   */
  getMetrics(): HealthMetrics {
    // Determine health status
    const errorRate = this.agentMetrics.manager.callCount > 0 
      ? this.agentMetrics.manager.errorCount / this.agentMetrics.manager.callCount 
      : 0;
    
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (errorRate > 0.5) status = 'unhealthy';
    else if (errorRate > 0.2 || this.errorCounts.rateLimits > 5) status = 'degraded';

    return {
      uptime: (Date.now() - this.startTime) / 1000, // in seconds
      timestamp: new Date().toISOString(),
      status,
      errors: this.errorCounts,
      lastError: this.lastError,
      websocket: this.wsMetrics,
      agents: this.agentMetrics,
    };
  }

  setWebSocketStatus(status: WebSocketStatus, reason?: string) {
    this.wsMetrics.status = status;
    if (status === 'connected') {
      this.wsMetrics.lastConnectTime = new Date().toISOString();
    }
    if (reason) {
      this.wsMetrics.lastRestartReason = reason;
    }
  }

  setWebSocketEventTimestamp(date: Date = new Date()) {
    this.wsMetrics.lastEventTime = date.toISOString();
  }

  setWebSocketError(message: string) {
    this.wsMetrics.status = 'error';
    this.wsMetrics.lastError = message.substring(0, 200);
    this.wsMetrics.lastErrorTime = new Date().toISOString();
  }

  incrementWebSocketReconnectAttempt() {
    this.wsMetrics.reconnectAttempts += 1;
  }

  markWebSocketRestart(reason: string) {
    this.wsMetrics.restarts += 1;
    this.wsMetrics.lastRestartReason = reason;
    this.wsMetrics.lastRestartTime = new Date().toISOString();
    this.wsMetrics.status = 'restarting';
  }

  /**
   * Reset metrics (useful for testing)
   */
  reset() {
    this.startTime = Date.now();
    this.errorCounts = { total: 0, rateLimits: 0, timeouts: 0, other: 0 };
    this.lastError = undefined;
    this.agentMetrics.manager = {
      callCount: 0,
      successCount: 0,
      errorCount: 0,
      avgLatency: 0,
      lastCall: undefined,
    };
    this.wsMetrics = {
      status: 'disconnected',
      lastEventTime: undefined,
      lastError: undefined,
      lastErrorTime: undefined,
      lastConnectTime: undefined,
      reconnectAttempts: 0,
      restarts: 0,
      lastRestartReason: undefined,
      lastRestartTime: undefined,
    };
  }
}

export const healthMonitor = new HealthMonitor();

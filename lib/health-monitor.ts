/**
 * Health monitoring and metrics tracking
 * Provides application health status and operational metrics
 */

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
      agents: this.agentMetrics,
    };
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
  }
}

export const healthMonitor = new HealthMonitor();

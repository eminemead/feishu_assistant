/**
 * AI SDK Devtools Integration
 * 
 * Tracks agent activity, tool calls, and performance metrics
 * for development debugging. Automatically enabled in development mode.
 * 
 * This integration works seamlessly with @ai-sdk-tools/agents to provide
 * real-time monitoring of:
 * - Agent routing decisions
 * - Tool calls and responses
 * - Performance metrics (response times, token usage)
 * - Error tracking
 */

export interface DevtoolsEvent {
  id: string;
  timestamp: number;
  type: 'agent_call' | 'tool_call' | 'agent_handoff' | 'error' | 'response';
  agent?: string;
  tool?: string;
  data?: any;
  duration?: number;
  error?: string;
}

class DevtoolsTracker {
  private events: DevtoolsEvent[] = [];
  private maxEvents = 1000; // Keep last 1000 events
  private isEnabled: boolean;

  constructor() {
    // Enable in development mode or if explicitly enabled
    this.isEnabled = 
      process.env.NODE_ENV === "development" || 
      process.env.ENABLE_DEVTOOLS === "true";
    
    if (this.isEnabled) {
      console.log("🔧 AI SDK Devtools: Enabled");
    }
  }

  /**
   * Track an agent call
   */
  trackAgentCall(agentName: string, query: string, data?: any) {
    if (!this.isEnabled) return;
    
    this.addEvent({
      id: this.generateId(),
      timestamp: Date.now(),
      type: 'agent_call',
      agent: agentName,
      data: { query, ...data },
    });
  }

  /**
   * Track a tool call
   */
  trackToolCall(toolName: string, params: any, startTime: number) {
    if (!this.isEnabled) return;
    
    const duration = Date.now() - startTime;
    
    this.addEvent({
      id: this.generateId(),
      timestamp: startTime,
      type: 'tool_call',
      tool: toolName,
      data: { params },
      duration,
    });
  }

  /**
   * Track an agent handoff
   */
  trackAgentHandoff(fromAgent: string, toAgent: string, reason?: string) {
    if (!this.isEnabled) return;
    
    this.addEvent({
      id: this.generateId(),
      timestamp: Date.now(),
      type: 'agent_handoff',
      agent: `${fromAgent} → ${toAgent}`,
      data: { fromAgent, toAgent, reason },
    });
  }

  /**
   * Track an error
   */
  trackError(agent: string, error: Error, context?: any) {
    if (!this.isEnabled) return;
    
    this.addEvent({
      id: this.generateId(),
      timestamp: Date.now(),
      type: 'error',
      agent,
      error: error.message,
      data: { 
        stack: error.stack,
        ...context 
      },
    });
  }

  /**
   * Track a response
   */
  trackResponse(agent: string, response: string, duration: number, metadata?: any) {
    if (!this.isEnabled) return;
    
    this.addEvent({
      id: this.generateId(),
      timestamp: Date.now(),
      type: 'response',
      agent,
      data: { 
        responseLength: response.length,
        ...metadata 
      },
      duration,
    });
  }

  /**
   * Get all events (for API endpoint)
   */
  getEvents(limit?: number): DevtoolsEvent[] {
    const events = [...this.events].reverse(); // Most recent first
    return limit ? events.slice(0, limit) : events;
  }

  /**
   * Get events filtered by type
   */
  getEventsByType(type: DevtoolsEvent['type']): DevtoolsEvent[] {
    return this.events.filter(e => e.type === type).reverse();
  }

  /**
   * Get events for a specific agent
   */
  getEventsByAgent(agentName: string): DevtoolsEvent[] {
    return this.events.filter(e => e.agent === agentName).reverse();
  }

  /**
   * Get statistics
   */
  getStats() {
    const events = this.events;
    const toolCalls = events.filter(e => e.type === 'tool_call');
    const agentHandoffs = events.filter(e => e.type === 'agent_handoff');
    const errors = events.filter(e => e.type === 'error');
    
    const avgToolDuration = toolCalls.length > 0
      ? toolCalls.reduce((sum, e) => sum + (e.duration || 0), 0) / toolCalls.length
      : 0;

    return {
      totalEvents: events.length,
      toolCalls: toolCalls.length,
      agentHandoffs: agentHandoffs.length,
      errors: errors.length,
      avgToolDuration: Math.round(avgToolDuration),
      lastEventTime: events.length > 0 ? events[events.length - 1].timestamp : null,
    };
  }

  /**
   * Clear all events
   */
  clear() {
    this.events = [];
  }

  private addEvent(event: DevtoolsEvent) {
    this.events.push(event);
    
    // Keep only last maxEvents
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }
    
    // Log to console in development
    if (process.env.NODE_ENV === "development") {
      console.log(`[Devtools] ${event.type}:`, {
        agent: event.agent,
        tool: event.tool,
        duration: event.duration,
        error: event.error,
      });
    }
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Singleton instance
export const devtoolsTracker = new DevtoolsTracker();

/**
 * Helper function to wrap agent calls with tracking
 */
export function withDevtoolsTracking<T extends (...args: any[]) => Promise<any>>(
  agentName: string,
  fn: T
): T {
  return (async (...args: any[]) => {
    const startTime = Date.now();
    const query = args[0]?.content || args[0] || '[unknown]';
    
    devtoolsTracker.trackAgentCall(agentName, query);
    
    try {
      const result = await fn(...args);
      const duration = Date.now() - startTime;
      
      if (typeof result === 'string') {
        devtoolsTracker.trackResponse(agentName, result, duration);
      }
      
      return result;
    } catch (error) {
      devtoolsTracker.trackError(
        agentName,
        error instanceof Error ? error : new Error(String(error)),
        { query }
      );
      throw error;
    }
  }) as T;
}

/**
 * Helper function to wrap tool calls with tracking
 */
export function trackToolCall<T extends (...args: any[]) => Promise<any>>(
  toolName: string,
  fn: T
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  return async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    const startTime = Date.now();
    devtoolsTracker.trackToolCall(toolName, args, startTime);
    
    try {
      const result = await fn(...args);
      return result as ReturnType<T>;
    } catch (error) {
      devtoolsTracker.trackError(
        toolName,
        error instanceof Error ? error : new Error(String(error)),
        { toolName, params: args }
      );
      throw error;
    }
  };
}


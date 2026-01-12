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
 * - Streaming performance metrics
 * - Multi-step tool session grouping
 */

import { LanguageModelUsage } from 'ai';

export interface DevtoolsEvent {
    id: string;
    timestamp: number;
    type: 'agent_call' | 'tool_call' | 'agent_handoff' | 'error' | 'response' | 'tool_session_start' | 'tool_session_complete' | 'stream_metrics' | 'custom';
    agent?: string;
    tool?: string;
    data?: any;
    duration?: number;
    error?: string;
    usage?: LanguageModelUsage;
    metadata?: {
        agent?: string;
        model?: string;
        routingStrategy?: 'programmatic' | 'llm';
        matchScore?: number;
        toolName?: string;
        sessionId?: string;
        costEstimate?: number;
        alternativesConsidered?: Array<{ agent: string; score: number }>;
    };
}

export interface ToolCallSession {
    id: string;
    toolName: string;
    startTime: number;
    endTime?: number;
    duration?: number;
    status: 'running' | 'completed' | 'error';
    events: DevtoolsEvent[];
    errorMessage?: string;
}

class DevtoolsTracker {
    private events: DevtoolsEvent[] = [];
    private sessions: Map<string, ToolCallSession> = new Map();
    private maxEvents = 1000; // Keep last 1000 events
    private isEnabled: boolean;
    private eventHandlers: Array<(event: DevtoolsEvent) => void> = [];

    constructor() {
        // Enable in development mode or if explicitly enabled
        this.isEnabled =
            process.env.NODE_ENV === "development" ||
            process.env.ENABLE_DEVTOOLS === "true";

        if (this.isEnabled) {
            console.log("🔧 AI SDK Devtools: Enabled with enhanced features");
            console.log("   - StreamInterceptor support");
            console.log("   - Token usage tracking");
            console.log("   - Session grouping");
        }
    }

    /**
     * Register a handler to be called when events are added
     */
    onEvent(handler: (event: DevtoolsEvent) => void) {
        this.eventHandlers.push(handler);
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
     * Track an agent handoff with optional metadata
     */
    trackAgentHandoff(
        fromAgent: string,
        toAgent: string,
        reason?: string,
        metadata?: {
            routingStrategy?: 'programmatic' | 'llm';
            matchScore?: number;
            alternativesConsidered?: Array<{ agent: string; score: number }>;
            instructionsMatched?: string;
        }
    ) {
        if (!this.isEnabled) return;

        this.addEvent({
            id: this.generateId(),
            timestamp: Date.now(),
            type: 'agent_handoff',
            agent: `${fromAgent} → ${toAgent}`,
            data: { fromAgent, toAgent, reason, instructionsMatched: metadata?.instructionsMatched },
            metadata: {
                routingStrategy: metadata?.routingStrategy || 'llm',
                matchScore: metadata?.matchScore,
                alternativesConsidered: metadata?.alternativesConsidered,
            },
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
     * Track a response with optional token usage
     */
    trackResponse(
        agent: string,
        response: string,
        duration: number,
        metadata?: any,
        usage?: LanguageModelUsage
    ) {
        if (!this.isEnabled) return;

        const costEstimate = usage ? this.calculateCost(usage, metadata?.model) : undefined;

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
            usage,
            metadata: {
                agent,
                model: metadata?.model,
                costEstimate,
            },
        });
    }

    /**
     * Start a new tool session
     */
    startToolSession(toolName: string): string {
        const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const session: ToolCallSession = {
            id: sessionId,
            toolName,
            startTime: Date.now(),
            status: 'running',
            events: [],
        };
        this.sessions.set(sessionId, session);

        this.addEvent({
            id: this.generateId(),
            timestamp: Date.now(),
            type: 'tool_session_start',
            tool: toolName,
            metadata: { sessionId, toolName },
            data: { sessionId },
        });

        return sessionId;
    }

    /**
     * Add event to a session
     */
    addToSession(sessionId: string, eventType: string, data: any) {
        const session = this.sessions.get(sessionId);
        if (!session) return;

        const event: DevtoolsEvent = {
            id: this.generateId(),
            timestamp: Date.now(),
            type: 'custom',
            tool: session.toolName,
            data: { eventType, ...data },
            metadata: { sessionId },
        };

        session.events.push(event);
        this.addEvent(event);
    }

    /**
     * Complete a tool session
     */
    completeToolSession(sessionId: string, resultData?: any) {
        const session = this.sessions.get(sessionId);
        if (!session) return;

        session.status = 'completed';
        session.endTime = Date.now();
        session.duration = session.endTime - session.startTime;

        this.addEvent({
            id: this.generateId(),
            timestamp: Date.now(),
            type: 'tool_session_complete',
            tool: session.toolName,
            duration: session.duration,
            data: resultData || { sessionId },
            metadata: { sessionId },
        });
    }

    /**
     * Fail a tool session
     */
    failToolSession(sessionId: string, error: Error) {
        const session = this.sessions.get(sessionId);
        if (!session) return;

        session.status = 'error';
        session.endTime = Date.now();
        session.duration = session.endTime - session.startTime;
        session.errorMessage = error.message;

        this.addEvent({
            id: this.generateId(),
            timestamp: Date.now(),
            type: 'tool_session_complete',
            tool: session.toolName,
            duration: session.duration,
            error: error.message,
            metadata: { sessionId },
            data: { sessionId, error: error.message },
        });
    }

    /**
     * Track streaming metrics
     */
    trackStreamMetrics(metrics: {
        tokensPerSecond: number;
        charsPerSecond: number;
        updateFrequency: number;
        averageChunkSize: number;
    }) {
        if (!this.isEnabled) return;

        this.addEvent({
            id: this.generateId(),
            timestamp: Date.now(),
            type: 'stream_metrics',
            data: metrics,
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
     * Advanced filtering with multiple criteria
     */
    filterEvents(options: {
        agents?: string[];
        tools?: string[];
        types?: DevtoolsEvent['type'][];
        timeRange?: { start: number; end: number };
        searchQuery?: string;
    }): DevtoolsEvent[] {
        return this.events.filter(e => {
            if (options.agents && !options.agents.includes(e.agent || '')) return false;
            if (options.tools && !options.tools.includes(e.tool || '')) return false;
            if (options.types && !options.types.includes(e.type)) return false;
            if (options.timeRange) {
                if (e.timestamp < options.timeRange.start || e.timestamp > options.timeRange.end) {
                    return false;
                }
            }
            if (options.searchQuery) {
                const query = options.searchQuery.toLowerCase();
                const searchableText = JSON.stringify({
                    agent: e.agent,
                    tool: e.tool,
                    data: e.data,
                    error: e.error,
                }).toLowerCase();
                return searchableText.includes(query);
            }
            return true;
        }).reverse();
    }

    /**
     * Get unique tool names
     */
    getUniqueToolNames(): string[] {
        return Array.from(new Set(this.events.map(e => e.tool).filter(Boolean) as string[]))
            .sort();
    }

    /**
     * Get unique agent names
     */
    getUniqueAgents(): string[] {
        return Array.from(new Set(this.events.map(e => e.agent).filter(Boolean) as string[]))
            .sort();
    }

    /**
     * Get event statistics
     */
    getEventStats() {
        const events = this.events;
        const byType: Record<string, number> = {};
        const byTool: Record<string, number> = {};
        const byAgent: Record<string, number> = {};

        events.forEach(e => {
            byType[e.type] = (byType[e.type] || 0) + 1;
            if (e.tool) byTool[e.tool] = (byTool[e.tool] || 0) + 1;
            if (e.agent) byAgent[e.agent] = (byAgent[e.agent] || 0) + 1;
        });

        const timeRange = events.length > 0 ? {
            start: events[0].timestamp,
            end: events[events.length - 1].timestamp,
        } : null;

        return {
            total: events.length,
            byType,
            byTool,
            byAgent,
            timeRange,
        };
    }

    /**
     * Get all sessions
     */
    getSessions(): ToolCallSession[] {
        return Array.from(this.sessions.values());
    }

    /**
     * Get sessions for a specific tool
     */
    getSessionsForTool(toolName: string): ToolCallSession[] {
        return Array.from(this.sessions.values())
            .filter(s => s.toolName === toolName)
            .sort((a, b) => b.startTime - a.startTime);
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

        // Call registered event handlers
        this.eventHandlers.forEach(handler => {
            try {
                handler(event);
            } catch (error) {
                console.error('[Devtools] Error in event handler:', error);
            }
        });

        // Log to console in development
        if (process.env.NODE_ENV === "development") {
            const logData: any = {
                agent: event.agent,
                tool: event.tool,
                duration: event.duration,
                error: event.error,
            };
            if (event.usage) {
                logData.tokens = {
                    input: event.usage.inputTokens,
                    output: event.usage.outputTokens,
                    total: event.usage.totalTokens,
                };
            }
            console.log(`[Devtools] ${event.type}:`, logData);
        }
    }

    /**
     * Calculate estimated cost based on token usage and model
     */
    private calculateCost(usage: LanguageModelUsage, model?: string): number {
        // Pricing estimates (update based on actual pricing)
        const pricing: Record<string, { input: number; output: number }> = {
            'kat-coder-pro': { input: 0, output: 0 },  // Free tier
            'gemini-2.5-flash': { input: 0.075, output: 0.3 },  // Per 1M tokens
            'default': { input: 0.1, output: 0.3 },
        };

        const modelPricing = pricing[model || 'default'] || pricing['default'];
        const inputCost = (usage.inputTokens || 0) * (modelPricing.input / 1_000_000);
        const outputCost = (usage.outputTokens || 0) * (modelPricing.output / 1_000_000);

        return Math.round((inputCost + outputCost) * 10000) / 10000; // Round to 4 decimals
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
 * Properly unwraps Promise types to avoid Promise<Promise<T>> issues
 */
export function trackToolCall<T extends (...args: any[]) => Promise<any>>(
    toolName: string,
    fn: T
): T {
    return (async (...args: Parameters<T>) => {
        const startTime = Date.now();

        try {
            const result = await fn(...args);
            // Track tool call AFTER completion so duration is accurate
            devtoolsTracker.trackToolCall(toolName, args, startTime);
            return result;
        } catch (error) {
            // Still record duration for failed tool calls
            devtoolsTracker.trackToolCall(toolName, args, startTime);
            devtoolsTracker.trackError(
                toolName,
                error instanceof Error ? error : new Error(String(error)),
                { toolName, params: args }
            );
            throw error;
        }
    }) as T;
}


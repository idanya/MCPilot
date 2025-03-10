/**
 * Defines interfaces for system monitoring, metrics collection, and health checks
 */

export interface IMetricsCollector {
    recordMetric(name: string, value: number, tags?: MetricTags): void;
    incrementCounter(name: string, tags?: MetricTags): void;
    recordLatency(name: string, duration: number, tags?: MetricTags): void;
    getMetrics(filter?: MetricFilter): Metric[];
}

export interface Metric {
    name: string;
    value: number;
    type: MetricType;
    timestamp: Date;
    tags?: MetricTags;
}

export type MetricTags = Record<string, string>;

export enum MetricType {
    COUNTER = 'counter',
    GAUGE = 'gauge',
    HISTOGRAM = 'histogram',
    SUMMARY = 'summary'
}

export interface MetricFilter {
    names?: string[];
    types?: MetricType[];
    tags?: MetricTags;
    timeRange?: {
        start: Date;
        end: Date;
    };
}

export interface IHealthMonitor {
    check(): Promise<HealthStatus>;
    registerCheck(check: HealthCheck): void;
    unregisterCheck(name: string): void;
    getChecks(): HealthCheck[];
}

export interface HealthCheck {
    name: string;
    check(): Promise<HealthCheckResult>;
    interval: number;
    timeout: number;
}

export interface HealthCheckResult {
    status: HealthCheckStatus;
    message?: string;
    details?: any;
    timestamp: Date;
}

export interface HealthStatus {
    status: SystemStatus;
    checks: HealthCheckResult[];
    timestamp: Date;
}

export enum HealthCheckStatus {
    HEALTHY = 'healthy',
    DEGRADED = 'degraded',
    UNHEALTHY = 'unhealthy'
}

export enum SystemStatus {
    OPERATIONAL = 'operational',
    DEGRADED = 'degraded',
    DOWN = 'down'
}

export interface IPerformanceMonitor {
    startSpan(name: string, tags?: MetricTags): Span;
    recordResourceUsage(): void;
    getResourceMetrics(): ResourceMetrics;
}

export interface Span {
    name: string;
    startTime: Date;
    tags?: MetricTags;
    end(): void;
    addTag(key: string, value: string): void;
    getDuration(): number;
}

export interface ResourceMetrics {
    cpu: CPUMetrics;
    memory: MemoryMetrics;
    network: NetworkMetrics;
    timestamp: Date;
}

export interface CPUMetrics {
    usage: number;
    load: number[];
    temperature?: number;
}

export interface MemoryMetrics {
    total: number;
    used: number;
    free: number;
    cached: number;
    buffers: number;
}

export interface NetworkMetrics {
    bytesIn: number;
    bytesOut: number;
    packetsIn: number;
    packetsOut: number;
    errors: number;
}

export interface IAlertManager {
    createAlert(alert: Alert): void;
    updateAlert(id: string, update: Partial<Alert>): void;
    deleteAlert(id: string): void;
    getAlerts(filter?: AlertFilter): Alert[];
}

export interface Alert {
    id: string;
    name: string;
    condition: AlertCondition;
    severity: AlertSeverity;
    status: AlertStatus;
    createdAt: Date;
    updatedAt: Date;
    triggeredAt?: Date;
    resolvedAt?: Date;
}

export interface AlertCondition {
    metric: string;
    operator: AlertOperator;
    threshold: number;
    duration?: number;
}

export enum AlertSeverity {
    INFO = 'info',
    WARNING = 'warning',
    ERROR = 'error',
    CRITICAL = 'critical'
}

export enum AlertStatus {
    ACTIVE = 'active',
    TRIGGERED = 'triggered',
    RESOLVED = 'resolved'
}

export enum AlertOperator {
    GREATER_THAN = '>',
    LESS_THAN = '<',
    EQUALS = '=',
    NOT_EQUALS = '!=',
    GREATER_THAN_EQUALS = '>=',
    LESS_THAN_EQUALS = '<='
}

export interface AlertFilter {
    severity?: AlertSeverity[];
    status?: AlertStatus[];
    timeRange?: {
        start: Date;
        end: Date;
    };
}
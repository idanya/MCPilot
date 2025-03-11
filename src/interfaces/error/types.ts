/**
 * Defines the error hierarchy and error handling interfaces for the system
 */

export class MCPilotError extends Error {
  constructor(
    message: string,
    public code: string,
    public severity: ErrorSeverity,
    public details?: any,
  ) {
    super(message);
    this.name = "MCPilotError";
  }
}

export class ToolExecutionError extends MCPilotError {
  constructor(
    message: string,
    code: string,
    severity: ErrorSeverity,
    public toolName: string,
    public params?: Record<string, any>,
    details?: any,
  ) {
    super(message, code, severity, details);
    this.name = "ToolExecutionError";
  }
}

export class ProviderError extends MCPilotError {
  constructor(
    message: string,
    code: string,
    severity: ErrorSeverity,
    public provider: string,
    public operation: string,
    details?: any,
  ) {
    super(message, code, severity, details);
    this.name = "ProviderError";
  }
}

export class ConfigurationError extends MCPilotError {
  constructor(
    message: string,
    code: string,
    severity: ErrorSeverity,
    public configPath: string,
    public validation?: ValidationResult,
    details?: any,
  ) {
    super(message, code, severity, details);
    this.name = "ConfigurationError";
  }
}

export class SessionError extends MCPilotError {
  constructor(
    message: string,
    code: string,
    severity: ErrorSeverity,
    public sessionId: string,
    public state?: string,
    details?: any,
  ) {
    super(message, code, severity, details);
    this.name = "SessionError";
  }
}

export enum ErrorSeverity {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  CRITICAL = "critical",
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  code: string;
  message: string;
  field?: string;
  details?: any;
}

export interface IErrorHandler {
  handle(error: MCPilotError): Promise<void>;
  addStrategy(strategy: ErrorStrategy): void;
  removeStrategy(name: string): void;
  getStrategies(): ErrorStrategy[];
}

export interface ErrorStrategy {
  name: string;
  canHandle(error: MCPilotError): boolean;
  handle(error: MCPilotError): Promise<void>;
  priority: number;
}

export interface ErrorRecoveryPlan {
  steps: RecoveryStep[];
  fallback?: RecoveryStep;
  timeout: number;
}

export interface RecoveryStep {
  name: string;
  action: () => Promise<void>;
  validation?: () => Promise<boolean>;
  retryCount?: number;
  timeout?: number;
}

export interface IErrorReporter {
  report(error: MCPilotError): Promise<void>;
  getReports(filter?: ErrorReportFilter): ErrorReport[];
  clearReports(): void;
}

export interface ErrorReport {
  id: string;
  error: MCPilotError;
  timestamp: Date;
  context: ErrorContext;
  recovery?: ErrorRecoveryPlan;
}

export interface ErrorContext {
  sessionId?: string;
  command?: string;
  state?: string;
  stackTrace?: string;
  systemInfo?: SystemInfo;
}

export interface SystemInfo {
  os: string;
  nodeVersion: string;
  memory: {
    total: number;
    used: number;
    free: number;
  };
  cpu: {
    model: string;
    cores: number;
    usage: number;
  };
}

export interface ErrorReportFilter {
  severity?: ErrorSeverity[];
  timeRange?: {
    start: Date;
    end: Date;
  };
  errorTypes?: string[];
  sessionId?: string;
}

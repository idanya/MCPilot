/**
 * Defines the interfaces for CLI command handling and processing
 */

export interface IArgumentParser {
    parse(args: string[]): ParsedArgs;
    validateArgs(args: ParsedArgs): boolean;
    getUsage(): string;
}

export interface ParsedArgs {
    command: string;
    flags: Record<string, any>;
    positional: string[];
    raw: string[];
}

export interface ICommandValidator {
    validate(command: Command): ValidationResult;
    registerValidationRule(rule: ValidationRule): void;
    getValidationErrors(): ValidationError[];
}

export interface Command {
    name: string;
    args: ParsedArgs;
    metadata: CommandMetadata;
}

export interface CommandMetadata {
    timestamp: Date;
    source: CommandSource;
    user?: string;
    workingDirectory?: string;
}

export enum CommandSource {
    TERMINAL = 'terminal',
    SCRIPT = 'script',
    API = 'api'
}

export interface ValidationRule {
    name: string;
    validate(command: Command): ValidationResult;
    priority: number;
}

export interface ValidationResult {
    isValid: boolean;
    errors: ValidationError[];
}

export interface ValidationError {
    code: string;
    message: string;
    field?: string;
    suggestion?: string;
}

export interface IOutputFormatter {
    format(response: any): string;
    setTheme(theme: FormatterTheme): void;
    supportedFormats(): string[];
}

export interface FormatterTheme {
    colors: ColorScheme;
    symbols: SymbolSet;
    layout: LayoutOptions;
}

export interface ColorScheme {
    primary: string;
    secondary: string;
    success: string;
    error: string;
    warning: string;
    info: string;
}

export interface SymbolSet {
    bullet: string;
    arrow: string;
    checkmark: string;
    cross: string;
    warning: string;
}

export interface LayoutOptions {
    indent: number;
    spacing: number;
    maxWidth: number;
}

export interface IHistoryManager {
    saveCommand(command: Command): void;
    getHistory(limit?: number): Command[];
    restore(sessionId: string): SessionHistory;
    clear(): void;
}

export interface SessionHistory {
    sessionId: string;
    commands: Command[];
    startTime: Date;
    endTime?: Date;
}

export interface ICommandRegistry {
    register(command: CommandDefinition): void;
    get(name: string): CommandDefinition | null;
    list(): CommandDefinition[];
    remove(name: string): boolean;
}

export interface CommandDefinition {
    name: string;
    description: string;
    usage: string;
    examples: CommandExample[];
    handler: CommandHandler;
    validation?: ValidationRule[];
}

export interface CommandExample {
    description: string;
    command: string;
}

export type CommandHandler = (args: ParsedArgs) => Promise<void>;
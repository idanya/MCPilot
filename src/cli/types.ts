export interface MCPilotCLIOptions {
  model?: string;
  logLevel?: "debug" | "info" | "warn" | "error";
  config?: string;
  role?: string;
  rolesConfig?: string;
}

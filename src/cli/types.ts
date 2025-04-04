export interface MCPilotCLIOptions {
  model?: string;
  logLevel?: "debug" | "info" | "warn" | "error";
  config?: string;
  role?: string;
  rolesConfig?: string;
  roleFile?: string;
  workingDirectory?: string;
  autoApproveTools?: boolean;
  instructionsFile?: string;
}

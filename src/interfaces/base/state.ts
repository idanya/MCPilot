/**
 * Basic session state enum
 */

export enum SessionState {
  INITIALIZING = "initializing",
  READY = "ready",
  PROCESSING = "processing",
  WAITING_FOR_TOOL = "waiting_for_tool",
  ERROR = "error",
  COMPLETED = "completed",
  TERMINATED = "terminated",
}

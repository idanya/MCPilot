import winston from "winston";
import { join } from "path";
import { mkdirSync, existsSync } from "fs";

const LOG_DIR = "./logs";

// Ensure logs directory exists
if (!existsSync(LOG_DIR)) {
  mkdirSync(LOG_DIR);
}

const logFileName = `mcpilot-${new Date().toISOString().split("T")[0]}.log`;

export const createLogger = (logLevel: string = "info") => {
  return winston.createLogger({
    level: logLevel,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
    ),
    transports: [
      // Console transport with standard format
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message }) => {
            return `${timestamp} [${level}]: ${message}`;
          }),
        ),
      }),
      // File transport with JSON format
      new winston.transports.File({
        filename: join(LOG_DIR, logFileName),
        format: winston.format.combine(winston.format.json()),
      }),
    ],
  });
};

// Create default logger instance
export const logger = createLogger();

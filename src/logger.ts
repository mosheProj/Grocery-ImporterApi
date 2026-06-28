import * as functionsLogger from "firebase-functions/logger";

export type LogContext = Record<string, unknown>;

const withContext = (message: string, context?: LogContext): [string, LogContext?] =>
  context ? [message, context] : [message];

export const logger = {
  debug: (message: string, context?: LogContext): void => {
    functionsLogger.debug(...withContext(message, context));
  },
  info: (message: string, context?: LogContext): void => {
    functionsLogger.info(...withContext(message, context));
  },
  warn: (message: string, context?: LogContext): void => {
    functionsLogger.warn(...withContext(message, context));
  },
  error: (message: string, context?: LogContext): void => {
    functionsLogger.error(...withContext(message, context));
  },
};

export const errorToLogContext = (error: unknown): LogContext => {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
    };
  }

  return {
    errorMessage: String(error),
  };
};

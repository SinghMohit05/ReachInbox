import { env } from './env.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  userId?: string;
  emailId?: string;
  jobId?: string;
  senderId?: string;
  [key: string]: any;
}

export class Logger {
  private static formatMessage(level: LogLevel, message: string, context?: LogContext) {
    const timestamp = new Date().toISOString();
    if (env.NODE_ENV === 'production') {
      return JSON.stringify({
        timestamp,
        level,
        message,
        ...context,
      });
    }

    const icons: Record<LogLevel, string> = {
      debug: '🔍',
      info: 'ℹ️',
      warn: '⚠️',
      error: '❌',
    };

    const ctxStr = context ? ` ${JSON.stringify(context)}` : '';
    return `[${timestamp}] ${icons[level]} [${level.toUpperCase()}] ${message}${ctxStr}`;
  }

  public static info(message: string, context?: LogContext) {
    console.log(this.formatMessage('info', message, context));
  }

  public static warn(message: string, context?: LogContext) {
    console.warn(this.formatMessage('warn', message, context));
  }

  public static error(message: string, context?: LogContext) {
    console.error(this.formatMessage('error', message, context));
  }

  public static debug(message: string, context?: LogContext) {
    if (env.NODE_ENV === 'development') {
      console.log(this.formatMessage('debug', message, context));
    }
  }
}

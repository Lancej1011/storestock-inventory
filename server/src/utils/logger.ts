type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, unknown>;
}

class Logger {
  private formatEntry(level: LogLevel, message: string, context?: Record<string, unknown>): string {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context,
    };
    return JSON.stringify(entry);
  }

  info(message: string, context?: Record<string, unknown>): void {
    console.log(this.formatEntry('info', message, context));
  }

  warn(message: string, context?: Record<string, unknown>): void {
    console.warn(this.formatEntry('warn', message, context));
  }

  error(message: string, context?: Record<string, unknown>): void {
    console.error(this.formatEntry('error', message, context));
  }

  debug(message: string, context?: Record<string, unknown>): void {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(this.formatEntry('debug', message, context));
    }
  }
}

export const logger = new Logger();

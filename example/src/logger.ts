export type LogLevel = 'info' | 'warn' | 'error';

export interface Logger {
  log(level: LogLevel, message: string): void;
}

export function createLogger(writer: (output: string) => void): Logger {
  return {
    log(level: LogLevel, message: string) {
      writer(`[${level.toUpperCase()}] ${message}`);
    },
  };
}

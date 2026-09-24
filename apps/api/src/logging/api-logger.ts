import type { Logger, LogContext } from '@voice-agent/logger';

export function createApiLogger(component = 'api'): Logger {
  const log = (level: 'info' | 'warn' | 'error' | 'debug', message: string, context?: LogContext) => {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      component,
      message,
      ...context,
    };
    if (level === 'error') {
      console.error(JSON.stringify(entry));
    } else if (level === 'warn') {
      console.warn(JSON.stringify(entry));
    } else {
      console.log(JSON.stringify(entry));
    }
  };

  return {
    info: (msg, ctx) => log('info', msg, ctx),
    warn: (msg, ctx) => log('warn', msg, ctx),
    error: (msg, ctx) => log('error', msg, ctx),
    debug: (msg, ctx) => log('debug', msg, ctx),
  };
}

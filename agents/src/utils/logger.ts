/**
 * Winston Logger Configuration
 */

import winston from 'winston';

const { combine, timestamp, printf, colorize, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp, stack, label }) => {
  const labelStr = label ? `[${label}]` : '';
  return `${timestamp} ${level} ${labelStr}: ${stack || message}`;
});

export function createLogger(label: string): winston.Logger {
  return winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: combine(
      errors({ stack: true }),
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.label({ label }),
      process.env.NODE_ENV === 'production' ? winston.format.json() : combine(colorize(), logFormat)
    ),
    transports: [
      new winston.transports.Console(),
      new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
      new winston.transports.File({ filename: 'logs/combined.log' }),
    ],
  });
}

export const mainLogger = createLogger('KalmanGuard');

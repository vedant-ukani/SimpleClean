import {
  Inject,
  Injectable,
  type LoggerService,
  type NestMiddleware,
} from "@nestjs/common";
import type { ServerConfig } from "@simply-clean/config";
import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import pino, { type Logger } from "pino";
import { pinoHttp, type HttpLogger } from "pino-http";

export const SERVER_CONFIG = Symbol("SERVER_CONFIG");

function logMessage(message: unknown): string {
  return typeof message === "string"
    ? message
    : "Non-string framework message omitted";
}

@Injectable()
export class StructuredLogger implements LoggerService {
  readonly logger: Logger;

  constructor(@Inject(SERVER_CONFIG) config: ServerConfig) {
    this.logger = pino({
      level: config.logLevel,
      base: { service: "api" },
      redact: {
        paths: [
          "authorization",
          "cookie",
          "password",
          "token",
          "databaseUrl",
          "authSecret",
          "*.authorization",
          "*.cookie",
          "*.password",
          "*.token",
          "*.databaseUrl",
          "*.authSecret",
          "x-file-grant",
          "*.x-file-grant",
          "headers.x-file-grant",
          "*.headers.x-file-grant",
          "idempotency-key",
          "*.idempotency-key",
          "headers.idempotency-key",
          "*.headers.idempotency-key",
        ],
        censor: "[REDACTED]",
      },
    });
  }

  log(message: unknown, context?: string): void {
    this.logger.info(context ? { context } : undefined, logMessage(message));
  }

  error(message: unknown, _trace?: string, context?: string): void {
    this.logger.error(context ? { context } : undefined, logMessage(message));
  }

  warn(message: unknown, context?: string): void {
    this.logger.warn(context ? { context } : undefined, logMessage(message));
  }

  debug(message: unknown, context?: string): void {
    this.logger.debug(context ? { context } : undefined, logMessage(message));
  }

  verbose(message: unknown, context?: string): void {
    this.logger.trace(context ? { context } : undefined, logMessage(message));
  }
}

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly handler: HttpLogger<Request, Response>;

  constructor(@Inject(StructuredLogger) structuredLogger: StructuredLogger) {
    this.handler = pinoHttp<Request, Response>({
      logger: structuredLogger.logger,
      genReqId(_request, response) {
        const correlationId = randomUUID();
        _request.headers["x-request-id"] = correlationId;
        response.setHeader("x-request-id", correlationId);
        return correlationId;
      },
      serializers: {
        req(request) {
          return {
            id: request.id,
            method: request.method,
            path: request.url?.split("?", 1)[0],
          };
        },
        res(response) {
          return { statusCode: response.statusCode };
        },
      },
    });
  }

  use(request: Request, response: Response, next: NextFunction): void {
    this.handler(request, response, next);
  }
}

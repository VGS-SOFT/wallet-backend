import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Catches ALL exceptions and returns a consistent error shape:
 * { success: false, statusCode, message, path, timestamp }
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? (exception.getResponse() as any)?.message || exception.message
        : 'Internal server error';

    this.logger.error(
      `${request.method} ${request.url} — ${status} — ${JSON.stringify(message)}`,
    );

    response.status(status).json({
      success: false,
      statusCode: status,
      message: Array.isArray(message) ? message : [message],
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}

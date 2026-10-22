import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import type { Response } from 'express';
@Catch()
export class ApiErrors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const databaseCode = (error as { code?: string }).code;
    const conflict = ['23505', 'SQLITE_CONSTRAINT'].includes(
      databaseCode || '',
    );
    const status =
      error instanceof HttpException ? error.getStatus() : conflict ? 409 : 500;
    const payload = error instanceof HttpException ? error.getResponse() : null;
    const message =
      typeof payload === 'object' && payload && 'message' in payload
        ? payload.message
        : typeof payload === 'string'
          ? payload
          : conflict
            ? 'Une référence existe déjà. Actualisez puis réessayez.'
            : 'Le service rencontre une difficulté. Réessayez dans un instant.';
    if (status >= 500)
      console.error(
        'API failure',
        error instanceof Error ? error.constructor.name : 'Unknown',
      );
    response
      .status(status)
      .json({
        code:
          status === 400
            ? 'VALIDATION_ERROR'
            : status === 401
              ? 'AUTH_REQUIRED'
              : status === 403
                ? 'ACCESS_DENIED'
                : status === 409
                  ? 'CONFLICT'
                  : status === 503
                    ? 'SERVICE_NOT_READY'
                    : 'REQUEST_ERROR',
        message,
      });
  }
}

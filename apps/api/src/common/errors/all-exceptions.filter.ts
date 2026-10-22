import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { ZodValidationException } from 'nestjs-zod';
import { ZodError } from 'zod';
import { AppError, isOverlapViolation } from './app-error';

interface Body {
  statusCode: number;
  error: string;
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
}

/** Converts every error into a consistent JSON body and never leaks stack traces or SQL. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string }>();
    const body = this.toBody(exception);
    body.requestId = req?.id ? String(req.id) : undefined;
    if (body.statusCode >= 500) {
      this.logger.error(
        { err: exception, requestId: body.requestId, path: req?.url },
        'Unhandled error',
      );
    }
    res.status(body.statusCode).json(body);
  }

  private toBody(e: unknown): Body {
    if (e instanceof AppError) {
      return {
        statusCode: e.status,
        error: HttpStatus[e.status] ?? 'Error',
        code: e.code,
        message: e.message,
        details: e.details,
      };
    }
    if (e instanceof ZodValidationException) {
      const zodError = e.getZodError() as ZodError;
      return {
        statusCode: 400,
        error: 'Bad Request',
        code: 'VALIDATION_FAILED',
        message: zodError.issues[0]?.message ?? 'Validation failed',
        details: zodError.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      };
    }
    if (e instanceof ZodError) {
      return {
        statusCode: 400,
        error: 'Bad Request',
        code: 'VALIDATION_FAILED',
        message: e.issues[0]?.message ?? 'Validation failed',
        details: e.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      };
    }
    if (e instanceof HttpException) {
      const status = e.getStatus();
      const r = e.getResponse();
      const message =
        typeof r === 'string' ? r : ((r as { message?: string | string[] }).message ?? e.message);
      return {
        statusCode: status,
        error: HttpStatus[status] ?? 'Error',
        code: status === 429 ? 'RATE_LIMITED' : (HttpStatus[status] ?? 'HTTP_ERROR'),
        message: Array.isArray(message) ? message.join('; ') : String(message),
      };
    }
    if (isOverlapViolation(e)) {
      return {
        statusCode: 409,
        error: 'Conflict',
        code: 'SLOT_UNAVAILABLE',
        message: 'That time was just booked by someone else. Please choose another slot.',
      };
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002')
        return {
          statusCode: 409,
          error: 'Conflict',
          code: 'DUPLICATE',
          message: 'A record with these details already exists',
        };
      if (e.code === 'P2025')
        return {
          statusCode: 404,
          error: 'Not Found',
          code: 'NOT_FOUND',
          message: 'Resource not found',
        };
    }
    return {
      statusCode: 500,
      error: 'Internal Server Error',
      code: 'INTERNAL',
      message: 'Something went wrong. Please try again.',
    };
  }
}

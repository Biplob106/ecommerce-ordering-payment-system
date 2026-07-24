/**
 * An error the application raises on purpose, carrying the HTTP status code the
 * client should receive.
 *
 * Throwing `new AppError(404, 'Order not found')` anywhere in a request lets the
 * central error handler turn it into a clean JSON response, instead of leaking a
 * stack trace or defaulting to a generic 500.
 *
 * `isOperational` marks errors we expected and handled (bad input, not found,
 * unauthorised) versus genuine bugs. Only unexpected errors deserve a full
 * stack-trace log.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }

  static badRequest(message = 'Bad request', details?: unknown): AppError {
    return new AppError(400, message, details);
  }

  static unauthorized(message = 'Unauthorized'): AppError {
    return new AppError(401, message);
  }

  static forbidden(message = 'Forbidden'): AppError {
    return new AppError(403, message);
  }

  static notFound(message = 'Not found'): AppError {
    return new AppError(404, message);
  }

  static conflict(message = 'Conflict'): AppError {
    return new AppError(409, message);
  }
}

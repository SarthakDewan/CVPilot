export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }

  static badRequest(message: string, details?: unknown) {
    return new AppError(400, "bad_request", message, details);
  }
  static unauthorized(message = "Authentication required") {
    return new AppError(401, "unauthorized", message);
  }
  static notFound(message = "Not found") {
    return new AppError(404, "not_found", message);
  }
  static conflict(message: string) {
    return new AppError(409, "conflict", message);
  }
}

/** Shape of every error response body: { error: { code, message, details? } } */
export interface ErrorBody {
  error: { code: string; message: string; details?: unknown; requestId?: string };
}

import type { ErrorRequestHandler, RequestHandler } from "express";
import { AppError, type ErrorBody } from "../errors.js";

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(AppError.notFound("Route not found"));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    const body: ErrorBody = { error: { code: err.code, message: err.message, details: err.details } };
    res.status(err.status).json(body);
    return;
  }
  // Malformed JSON bodies surface from express.json() as SyntaxError with status 400.
  if (err instanceof SyntaxError && "status" in err && err.status === 400) {
    const body: ErrorBody = { error: { code: "bad_request", message: "Malformed JSON body" } };
    res.status(400).json(body);
    return;
  }
  console.error("Unhandled error:", err);
  const body: ErrorBody = { error: { code: "internal_error", message: "Internal server error" } };
  res.status(500).json(body);
};

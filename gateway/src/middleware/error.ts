import type { ErrorRequestHandler, RequestHandler } from "express";
import { AppError, type ErrorBody } from "../errors.js";

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(AppError.notFound("Route not found"));
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    const body: ErrorBody = { error: { code: err.code, message: err.message, details: err.details, requestId: req.id } };
    res.status(err.status).json(body);
    return;
  }
  // Client errors raised by body-parser (malformed JSON -> 400, body too large -> 413, bad encoding -> 4xx).
  const status = (err as { status?: unknown })?.status;
  if (typeof status === "number" && status >= 400 && status < 500) {
    const tooLarge = status === 413;
    const body: ErrorBody = {
      error: {
        code: tooLarge ? "payload_too_large" : "bad_request",
        message: tooLarge ? "Request body is too large" : err instanceof SyntaxError ? "Malformed JSON body" : "Bad request",
        requestId: req.id,
      },
    };
    res.status(status).json(body);
    return;
  }
  // Structured log line; the response never contains the error text, only the request id to look it up.
  console.error(JSON.stringify({ level: "error", msg: "unhandled error", requestId: req.id, method: req.method, path: req.path, error: err instanceof Error ? err.stack ?? err.message : String(err) }));
  const body: ErrorBody = { error: { code: "internal_error", message: "Internal server error", requestId: req.id } };
  res.status(500).json(body);
};

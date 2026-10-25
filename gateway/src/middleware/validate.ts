import type { Request } from "express";
import type { ZodType } from "zod";
import { AppError } from "../errors.js";

/** Parse req.body with a zod schema or throw a structured 400. */
export function parseBody<T>(schema: ZodType<T>, req: Request): T {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    throw AppError.badRequest(
      "Validation failed",
      result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  return result.data;
}

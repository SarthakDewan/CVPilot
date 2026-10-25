import type { Config } from "../config.js";
import { AppError } from "../errors.js";

/** Calls the internal ML service. The shared secret never leaves the server side. */
export async function mlPost<T>(
  cfg: Pick<Config, "mlServiceUrl" | "mlSharedSecret">,
  path: string,
  body: unknown,
  timeoutMs = 20_000,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${cfg.mlServiceUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ml-secret": cfg.mlSharedSecret },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new AppError(502, "ml_unavailable", "The analysis service is unreachable");
  }
  if (res.status === 503) {
    const detail = (await res.json().catch(() => null)) as { detail?: string } | null;
    throw new AppError(503, "feature_unavailable", detail?.detail ?? "This feature is not configured");
  }
  if (!res.ok) throw new AppError(502, "ml_error", "The analysis service returned an error");
  return (await res.json()) as T;
}

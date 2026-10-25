export interface ApiErrorBody {
  error: { code: string; message: string; details?: { path: string; message: string }[] };
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

/** Calls the gateway (same-origin /api/v1). The session lives in an httpOnly cookie. */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    method: init.method ?? "GET",
    credentials: "same-origin",
    headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const e = (data as ApiErrorBody | null)?.error;
    throw new ApiError(res.status, e?.code ?? "unknown", e?.message ?? res.statusText, e?.details);
  }
  return data as T;
}

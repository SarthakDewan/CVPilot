import { Router } from "express";
import { z } from "zod";
import type { Config } from "../config.js";
import { requireAuth } from "../middleware/auth.js";

const schema = z.object({ classifier: z.boolean(), gemini: z.boolean(), adzuna: z.boolean(), embedding_model: z.string() });

/** Which optional integrations are active, so the UI can say so instead of failing mysteriously. */
export function statusRouter(cfg: Config): Router {
  const router = Router();
  router.get("/", requireAuth(cfg), async (_req, res) => {
    try {
      const r = await fetch(`${cfg.mlServiceUrl}/internal/status`, { headers: { "x-ml-secret": cfg.mlSharedSecret }, signal: AbortSignal.timeout(3000) });
      const parsed = schema.safeParse(r.ok ? await r.json() : null);
      if (parsed.success) {
        const d = parsed.data;
        res.json({ mlService: true, classifier: d.classifier, gemini: d.gemini, adzuna: d.adzuna, embeddingModel: d.embedding_model });
        return;
      }
    } catch {
      /* fall through */
    }
    res.json({ mlService: false, classifier: false, gemini: false, adzuna: false, embeddingModel: null });
  });
  return router;
}

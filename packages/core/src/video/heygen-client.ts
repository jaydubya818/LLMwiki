/**
 * HeyGen video API integration — **best-effort**.
 *
 * HeyGen’s REST shape and endpoints can change. This module centralizes
 * HTTP calls, validation, and logging so failures are visible and the
 * rest of the pipeline (script generation) stays useful without a render.
 *
 * Docs to cross-check when debugging: https://docs.heygen.com/ (verify paths and payloads).
 */

export interface HeyGenRenderResult {
  videoUrl?: string;
  error?: string;
  httpStatus?: number;
  /** Human-readable trace for logs / runs */
  trace: string[];
}

function logTrace(trace: string[], msg: string): void {
  const line = `[heygen] ${msg}`;
  trace.push(line);
  console.error(line);
}

/** Default HTTP timeouts so HeyGen requests cannot hang indefinitely */
const GENERATE_FETCH_TIMEOUT_MS = 120_000;
const STATUS_POLL_FETCH_TIMEOUT_MS = 10_000;

function isAbortError(e: unknown): boolean {
  return (
    (typeof DOMException !== "undefined" &&
      e instanceof DOMException &&
      e.name === "AbortError") ||
    (e instanceof Error && e.name === "AbortError")
  );
}

/**
 * Attempt to generate a video from plain text script using env base URL.
 * Returns URL on success; on failure, `error` and `trace` describe what happened.
 */
export async function renderScriptWithHeyGen(
  script: string,
  apiKey: string,
  trace: string[] = []
): Promise<HeyGenRenderResult> {
  const key = apiKey.trim();
  if (!key) {
    logTrace(trace, "skip: empty API key");
    return { error: "Missing HEYGEN_API_KEY", trace };
  }

  const base = (
    process.env.HEYGEN_API_BASE ?? "https://api.heygen.com/v2"
  ).replace(/\/$/, "");

  if (script.trim().length < 20) {
    logTrace(trace, "skip: script too short for reliable render");
    return { error: "Script too short", trace };
  }

  try {
    const genUrl = `${base}/video/generate`;
    logTrace(trace, `POST ${genUrl}`);

    const body = {
      video_inputs: [
        {
          character: { type: "avatar" },
          voice: { type: "text", text: script.slice(0, 5000) },
        },
      ],
    };

    const genController = new AbortController();
    const genTimer = setTimeout(() => genController.abort(), GENERATE_FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(genUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": key,
        },
        body: JSON.stringify(body),
        signal: genController.signal,
      });
    } catch (e) {
      if (isAbortError(e)) {
        logTrace(trace, "generate: request timed out");
        return { error: "HeyGen generate: request timed out", trace };
      }
      throw e;
    } finally {
      clearTimeout(genTimer);
    }

    const rawText = await res.text();
    if (!res.ok) {
      logTrace(
        trace,
        `generate failed: HTTP ${res.status} — ${rawText.slice(0, 500)}`
      );
      return {
        error: `HeyGen generate HTTP ${res.status}`,
        httpStatus: res.status,
        trace,
      };
    }

    let data: { data?: { video_id?: string }; error?: unknown };
    try {
      data = JSON.parse(rawText) as { data?: { video_id?: string }; error?: unknown };
    } catch {
      logTrace(trace, `generate: non-JSON body — ${rawText.slice(0, 200)}`);
      return { error: "HeyGen generate: invalid JSON", httpStatus: res.status, trace };
    }

    const id = data?.data?.video_id;
    if (!id) {
      logTrace(trace, `generate: no video_id in response — ${rawText.slice(0, 400)}`);
      return { error: "HeyGen: missing video_id (API shape may have changed)", trace };
    }

    logTrace(trace, `poll: video_id=${id}`);

    const statusUrl = `${base}/video_status.get?video_id=${encodeURIComponent(id)}`;

    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const stController = new AbortController();
      const stTimer = setTimeout(() => stController.abort(), STATUS_POLL_FETCH_TIMEOUT_MS);
      let st: Response;
      let stText: string;
      try {
        st = await fetch(statusUrl, {
          headers: { "X-Api-Key": key },
          signal: stController.signal,
        });
        stText = await st.text();
      } catch (e) {
        if (isAbortError(e)) {
          logTrace(trace, "status poll: request timed out");
        } else {
          const msg = e instanceof Error ? e.message : String(e);
          logTrace(trace, `status poll: fetch error — ${msg}`);
        }
        continue;
      } finally {
        clearTimeout(stTimer);
      }
      if (!st.ok) {
        logTrace(trace, `status HTTP ${st.status} — ${stText.slice(0, 300)}`);
        continue;
      }
      let js: { data?: { video_url?: string; status?: string; error?: string } };
      try {
        js = JSON.parse(stText) as {
          data?: { video_url?: string; status?: string; error?: string };
        };
      } catch {
        logTrace(trace, `status: non-JSON — ${stText.slice(0, 200)}`);
        continue;
      }
      if (js.data?.video_url) {
        logTrace(trace, `success: video_url received`);
        return { videoUrl: js.data.video_url, trace };
      }
      if (js.data?.status === "failed" || js.data?.error) {
        logTrace(
          trace,
          `render failed: ${js.data?.error ?? js.data?.status ?? "unknown"}`
        );
        return {
          error: `HeyGen render failed: ${js.data?.error ?? js.data?.status}`,
          trace,
        };
      }
    }

    logTrace(trace, "timeout: exceeded poll attempts");
    return { error: "HeyGen: timeout waiting for video URL", trace };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logTrace(trace, `exception: ${msg}`);
    return { error: `HeyGen: ${msg}`, trace };
  }
}

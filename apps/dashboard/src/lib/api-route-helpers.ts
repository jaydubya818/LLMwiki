import { NextResponse } from "next/server";

/**
 * Optional protection for local dashboard APIs. When SECOND_BRAIN_DASHBOARD_API_KEY is set,
 * callers must send Authorization: Bearer <key> or X-Dashboard-Key: <key>.
 * When unset (default), routes behave as a trusted local service.
 */
export function requireDashboardApiKey(req: Request): NextResponse | null {
  const expected = process.env.SECOND_BRAIN_DASHBOARD_API_KEY?.trim();
  if (!expected) return null;

  const auth = req.headers.get("authorization");
  let token: string | null = null;
  if (auth?.startsWith("Bearer ")) token = auth.slice(7).trim();
  if (!token) token = req.headers.get("x-dashboard-key")?.trim() ?? null;
  if (token === expected) return null;

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function parseJsonBody<T>(
  req: Request
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  try {
    const data = (await req.json()) as T;
    return { ok: true, data };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Malformed JSON body" }, { status: 400 }),
    };
  }
}

export function internalServerError(e: unknown): NextResponse {
  console.error(e);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

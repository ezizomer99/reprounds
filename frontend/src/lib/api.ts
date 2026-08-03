import { getSessionToken } from './auth';
import { API_BASE_URL } from './config';

async function buildHeaders(includeAuth: boolean): Promise<HeadersInit> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (includeAuth) {
    const token = await getSessionToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  return headers;
}

/**
 * Turn a non-OK response into an Error the UI can act on. The API returns a
 * JSON `{ error }` body for everything it handles; anything else (a Hono/CF
 * text 404, an HTML platform error page, a proxy failure) has no `error`
 * field, so we surface the HTTP status instead of a bare "Request failed" —
 * the status is what tells you app vs network vs server at a glance.
 */
async function toApiError(response: Response): Promise<Error & { status: number; body: unknown }> {
  let body: unknown;
  let message: string | undefined;
  const text = await response.text().catch(() => '');
  try {
    body = text ? JSON.parse(text) : undefined;
    message = (body as { error?: string } | undefined)?.error;
  } catch {
    body = text;
    // Non-JSON body — include a short snippet so the cause isn't lost.
    const snippet = text.trim().replace(/\s+/g, ' ').slice(0, 120);
    message = snippet ? `HTTP ${response.status}: ${snippet}` : undefined;
  }
  const err = new Error(message ?? `Request failed (HTTP ${response.status})`) as Error & {
    status: number;
    body: unknown;
  };
  err.status = response.status;
  err.body = body;
  return err;
}

/**
 * React Native's fetch has no default timeout, so a half-open socket (a
 * captive-portal wifi, a dropped mobile handover) leaves the promise pending
 * forever and the screen stuck on a spinner. Abort after this long instead.
 *
 * 15s is long enough for a cold Worker plus a Hyperdrive round-trip on a slow
 * connection, short enough to surface before the user gives up.
 */
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Timeouts carry status 0 so the shared retry predicate (which only refuses to
 * retry 4xx) treats them as retryable, and so the global 401 handler doesn't
 * mistake an abort for an expired session.
 */
function toTimeoutError(): Error & { status: number; body: unknown } {
  const err = new Error('The request timed out. Check your connection.') as Error & {
    status: number;
    body: unknown;
  };
  err.status = 0;
  err.body = undefined;
  return err;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: await buildHeaders(true),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted) throw toTimeoutError();
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw await toApiError(response);
  }

  // DELETE handlers return 204/an empty body; response.json() would throw.
  if (method === 'DELETE') return undefined as T;
  return (await response.json()) as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>('GET', path);
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return request<T>('POST', path, body);
}

export function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return request<T>('PATCH', path, body);
}

export function apiPut<T>(path: string, body: unknown): Promise<T> {
  return request<T>('PUT', path, body);
}

export function apiDelete(path: string): Promise<void> {
  return request<void>('DELETE', path);
}

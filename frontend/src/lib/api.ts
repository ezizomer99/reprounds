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

export async function apiGet<T>(path: string): Promise<T> {
  const headers = await buildHeaders(true);
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    throw await toApiError(response);
  }

  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const headers = await buildHeaders(true);
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw await toApiError(response);
  }

  return response.json() as Promise<T>;
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const headers = await buildHeaders(true);
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw await toApiError(response);
  }

  return response.json() as Promise<T>;
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const headers = await buildHeaders(true);
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw await toApiError(response);
  }

  return response.json() as Promise<T>;
}

export async function apiDelete(path: string): Promise<void> {
  const headers = await buildHeaders(true);
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'DELETE',
    headers,
  });

  if (!response.ok) {
    throw await toApiError(response);
  }
}

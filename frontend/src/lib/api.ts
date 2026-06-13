import { getSessionToken } from './auth';

const API_BASE_URL = 'https://glima-api.oemerdigital.workers.dev/v1';

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

export async function apiGet<T>(path: string): Promise<T> {
  const headers = await buildHeaders(true);
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    const err = new Error((error as { error?: string }).error ?? 'Request failed');
    (err as Error & { status: number }).status = response.status;
    throw err;
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
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    const err = new Error((error as { error?: string }).error ?? 'Request failed');
    (err as Error & { status: number }).status = response.status;
    throw err;
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
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    const err = new Error((error as { error?: string }).error ?? 'Request failed');
    (err as Error & { status: number }).status = response.status;
    throw err;
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
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    const err = new Error((error as { error?: string }).error ?? 'Request failed');
    (err as Error & { status: number }).status = response.status;
    throw err;
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
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    const err = new Error((error as { error?: string }).error ?? 'Request failed');
    (err as Error & { status: number }).status = response.status;
    throw err;
  }
}

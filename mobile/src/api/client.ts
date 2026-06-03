import { API_BASE_URL } from './config';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Token holder. AuthContext keeps this in sync with the persisted session so
// every request automatically includes the Authorization header.
let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

type RequestOptions = Omit<RequestInit, 'body'> & { body?: unknown; query?: Record<string, string | number | undefined> };

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(path.startsWith('http') ? path : `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`);
  if (query) {
    for (const [key, val] of Object.entries(query)) {
      if (val !== undefined) url.searchParams.set(key, String(val));
    }
  }
  return url.toString();
}

export async function request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, query, headers, ...rest } = options;
  const url = buildUrl(path, query);

  const res = await fetch(url, {
    // Never serve API responses from the platform HTTP cache. Without this,
    // iOS (NSURLSession) can return a stale GET body right after a PUT — e.g.
    // clearing a tournament pick saves fine, but the next fetch still shows the
    // old pick. 'no-store' forces every request to hit the network.
    cache: 'no-store',
    ...rest,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  const data = text ? safeParse(text) : undefined;

  if (!res.ok) {
    if (res.status === 401 && onUnauthorized) {
      onUnauthorized();
    }
    throw new ApiError(extractMessage(data) ?? `HTTP ${res.status}`, res.status, data);
  }

  return data as T;
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

function extractMessage(data: unknown): string | undefined {
  if (data && typeof data === 'object' && 'error' in data) {
    const err = (data as { error: unknown }).error;
    if (typeof err === 'string') return err;
    if (err != null) return String(err);
  }
  return undefined;
}

export const api = {
  get: <T = unknown>(path: string, query?: RequestOptions['query']) => request<T>(path, { method: 'GET', query }),
  post: <T = unknown>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  put: <T = unknown>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  delete: <T = unknown>(path: string, body?: unknown) => request<T>(path, { method: 'DELETE', body }),
  patch: <T = unknown>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
};

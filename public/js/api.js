const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? '';

export class ApiError extends Error {
  constructor(message, status, code, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function api(path, options = {}) {
  const { method = 'GET', body, formData, headers = {}, signal } = options;
  const requestHeaders = { Accept: 'application/json', ...headers };
  const request = { method, credentials: 'same-origin', headers: requestHeaders, signal };

  if (formData instanceof FormData) {
    request.body = formData;
  } else if (body !== undefined) {
    requestHeaders['Content-Type'] = 'application/json';
    request.body = JSON.stringify(body);
  }

  if (!['GET', 'HEAD'].includes(method)) {
    requestHeaders['X-CSRF-Token'] = csrfToken;
  }

  const response = await fetch(path, request);
  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : null;

  if (!response.ok) {
    const error = new ApiError(
      payload?.error?.message ?? `Permintaan gagal (${response.status})`,
      response.status,
      payload?.error?.code ?? 'request_failed',
      payload?.error?.details,
    );
    if (response.status === 401 && !path.startsWith('/api/auth/')) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.assign(`/login?next=${next}`);
    }
    throw error;
  }

  return payload;
}

export function get(path, options = {}) {
  return api(path, { ...options, method: 'GET' });
}

export function post(path, body, options = {}) {
  return api(path, { ...options, method: 'POST', body });
}

export function patch(path, body, options = {}) {
  return api(path, { ...options, method: 'PATCH', body });
}

export function del(path, body, options = {}) {
  return api(path, { ...options, method: 'DELETE', body });
}

export function errorMessage(error) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return 'Terjadi kesalahan. Silakan coba lagi.';
}

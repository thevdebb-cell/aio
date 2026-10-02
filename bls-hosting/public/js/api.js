let csrf = null;

export function setCsrf(token) {
  csrf = token;
}

export function getCsrf() {
  return csrf;
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function api(path, options = {}) {
  const method = options.method || 'GET';
  const headers = { ...(options.headers || {}) };
  let body = options.body;

  if (body !== undefined && !(body instanceof FormData)) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(body);
  }
  if (method !== 'GET' && method !== 'HEAD' && csrf) headers['x-bls-csrf'] = csrf;

  const res = await fetch(`/api${path}`, { method, headers, body, credentials: 'same-origin' });

  if (res.status === 401) {
    window.location.href = '/access';
    throw new ApiError('Session expired', 401);
  }
  if (options.raw) {
    if (!res.ok) throw new ApiError('Download refused', res.status);
    return res;
  }
  const text = await res.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new ApiError('Panel sent an answer that could not be read', res.status);
    }
  }
  if (!res.ok) throw new ApiError(data.error || `Request failed with ${res.status}`, res.status);
  return data;
}

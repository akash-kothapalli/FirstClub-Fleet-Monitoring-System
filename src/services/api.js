const API_BASE = '';

export async function apiFetch(endpoint, options = {}) {
  const defaultHeaders = {
    'Content-Type': 'application/json'
  };

  const config = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers
    }
  };

  // Add credentials mode so cookies pass cleanly
  config.credentials = 'same-origin';

  let res;
  try {
    res = await fetch(`${API_BASE}${endpoint}`, config);
  } catch (err) {
    // Fallback directly to http://localhost:3000 if relative request fails
    res = await fetch(`http://localhost:3000${endpoint}`, config);
  }

  if (!res.ok) {
    let errorMsg = `HTTP Error ${res.status}`;
    try {
      const data = await res.json();
      errorMsg = data.error || errorMsg;
    } catch (e) {}
    throw new Error(errorMsg);
  }

  try {
    return await res.json();
  } catch (e) {
    return {};
  }
}

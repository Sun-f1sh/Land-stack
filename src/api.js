// src/api.js

/**
 * API base URL
 *
 * LOCAL:
 *   http://localhost:5000/api
 *
 * PRODUCTION:
 *   Set VITE_API_BASE_URL in Vercel, for example:
 *   https://your-backend.onrender.com/api
 *
 * If VITE_API_BASE_URL is not provided in production,
 * it will use /api (same-domain API).
 */

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.PROD ? '/api' : 'http://localhost:5000/api');

// --------------------------------------------------
// Authentication helpers
// --------------------------------------------------

export const getAuthToken = () => {
  return localStorage.getItem('landstack_jwt');
};

export const setAuthToken = (token) => {
  localStorage.setItem('landstack_jwt', token);
};

export const removeAuthToken = () => {
  localStorage.removeItem('landstack_jwt');
};

// --------------------------------------------------
// Get current user role
// --------------------------------------------------

const getUserRole = () => {
  const userStr = localStorage.getItem('landstack_user');

  if (!userStr) {
    return 'CITIZEN';
  }

  try {
    const user = JSON.parse(userStr);
    return user?.role || 'CITIZEN';
  } catch (error) {
    console.warn('Could not parse landstack_user:', error);
    return 'CITIZEN';
  }
};

// --------------------------------------------------
// Main API function
// --------------------------------------------------

export const apiFetch = async (endpoint, options = {}) => {
  const token = getAuthToken();
  const role = getUserRole();

  // Normalize API base URL
  const base = API_BASE.endsWith('/')
    ? API_BASE.slice(0, -1)
    : API_BASE;

  // Normalize endpoint
  const path = endpoint.startsWith('/')
    ? endpoint
    : `/${endpoint}`;

  const url = `${base}${path}`;

  // Build headers
  const headers = {
    'Content-Type': 'application/json',

    ...(token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : {}),

    // Used by the current backend for role handling
    'x-mock-role': role,

    ...(options.headers || {}),
  };

  console.log('🌐 API Request:', {
    method: options.method || 'GET',
    url,
  });

  let response;

  try {
    response = await fetch(url, {
      ...options,
      headers,
    });
  } catch (error) {
    console.error('❌ Network error:', error);

    const networkError = new Error(
      `Unable to connect to the backend API.\n\n` +
      `API URL: ${url}\n\n` +
      `Please check that your backend is deployed and ` +
      `VITE_API_BASE_URL is configured correctly.`
    );

    networkError.status = 0;
    networkError.originalError = error;

    throw networkError;
  }

  // --------------------------------------------------
  // Parse response
  // --------------------------------------------------

  let data = null;
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch (error) {
      console.error('❌ Failed to parse JSON response:', error);
    }
  } else {
    // Backend may have returned HTML instead of JSON.
    // This commonly happens when /api routes are incorrectly
    // redirected to the frontend.
    const text = await response.text();

    console.error('❌ Backend returned non-JSON response:', {
      status: response.status,
      contentType,
      response: text.substring(0, 500),
    });

    data = null;
  }

  // --------------------------------------------------
  // Handle HTTP errors
  // --------------------------------------------------

  if (!response.ok) {
    const message =
      data?.message ||
      data?.error ||
      `API request failed with status ${response.status}`;

    const error = new Error(message);

    error.status = response.status;
    error.data = data;
    error.url = url;

    console.error('❌ API Error:', {
      status: response.status,
      url,
      data,
    });

    throw error;
  }

  // --------------------------------------------------
  // Empty response
  // --------------------------------------------------

  if (!data) {
    const error = new Error(
      'Backend returned an empty or invalid response.'
    );

    error.status = response.status;
    error.url = url;

    throw error;
  }

  // --------------------------------------------------
  // Successful response
  // --------------------------------------------------

  console.log('✅ API Response:', {
    status: response.status,
    url,
    data,
  });

  return data;
};
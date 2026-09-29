import axios from 'axios';

const TOKEN_STORAGE_KEY = 'image_validator_token';

let authToken = null;
try {
  authToken = localStorage.getItem(TOKEN_STORAGE_KEY);
} catch {
  // Private browsing / storage disabled — sessions just won't persist
  // across reloads, which is a degraded-but-safe fallback.
}

/** @param {string|null} token */
export function setAuthToken(token) {
  authToken = token;
  try {
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function getAuthToken() {
  return authToken;
}

const api = axios.create({
  baseURL: '/api',
  timeout: 120000, // 2 min for large uploads
});

api.interceptors.request.use((config) => {
  if (authToken) config.headers.Authorization = `Bearer ${authToken}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      setAuthToken(null);
      // AuthContext listens for this to reset to the logged-out state —
      // an event instead of a direct import to avoid a circular
      // api.js <-> AuthContext.jsx dependency.
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    }
    return Promise.reject(error);
  }
);

// ─── Auth ──────────────────────────────────────────────────────────────────

/**
 * @param {string} email
 * @param {string} password
 */
export async function register(email, password) {
  const response = await api.post('/auth/register', { email, password });
  return response.data;
}

/**
 * @param {string} email
 * @param {string} password
 */
export async function login(email, password) {
  const response = await api.post('/auth/login', { email, password });
  return response.data;
}

export async function fetchMe() {
  const response = await api.get('/auth/me');
  return response.data;
}

// ─── Images ────────────────────────────────────────────────────────────────

/**
 * Upload images with progress tracking.
 * @param {File[]} files
 * @param {(progress: number) => void} onProgress
 * @returns {Promise<import('./types').UploadResponse>}
 */
export async function uploadImages(files, onProgress) {
  const formData = new FormData();
  files.forEach((file) => formData.append('images', file));

  const response = await api.post('/images/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (event) => {
      if (event.total) {
        onProgress(Math.round((event.loaded * 100) / event.total));
      }
    },
  });

  return response.data;
}

/**
 * Fetch list of images.
 * @param {{ status?: string, page?: number, limit?: number }} params
 */
export async function fetchImages(params = {}) {
  const response = await api.get('/images', { params });
  return response.data;
}

/**
 * Poll processing status for a batch of images by id — used while the
 * server processes uploads asynchronously in the background.
 * @param {string[]} ids
 */
export async function fetchImagesBatch(ids) {
  if (ids.length === 0) return { success: true, images: [] };
  const response = await api.get('/images/batch', { params: { ids: ids.join(',') } });
  return response.data;
}

/**
 * Fetch single image.
 * @param {string} id
 */
export async function fetchImage(id) {
  const response = await api.get(`/images/${id}`);
  return response.data;
}

/**
 * Delete an image.
 * @param {string} id
 */
export async function deleteImage(id) {
  const response = await api.delete(`/images/${id}`);
  return response.data;
}

/**
 * Fetch stats.
 */
export async function fetchStats() {
  const response = await api.get('/images/stats');
  return response.data;
}

/**
 * Adopt any images left ownerless from before accounts existed.
 */
export async function claimOrphanedImages() {
  const response = await api.post('/images/claim');
  return response.data;
}

export default api;

import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 120000, // 2 min for large uploads
});

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

export default api;

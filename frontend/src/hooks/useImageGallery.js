import { useState, useEffect, useCallback } from 'react';
import { fetchImages, deleteImage as deleteImageApi } from '../services/api';
import toast from 'react-hot-toast';

/**
 * Hook for the gallery view — fetches persisted images from the API.
 * @param {{ status?: string }} initialParams
 */
export function useImageGallery(initialParams = {}) {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({});
  const [params, setParams] = useState({ page: 1, limit: 20, ...initialParams });

  const loadImages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchImages(params);
      setImages(data.images);
      setStats(data.stats || {});
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to load images.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    loadImages();
  }, [loadImages]);

  const filterByStatus = useCallback((status) => {
    setParams((prev) => ({ ...prev, status: status || undefined, page: 1 }));
  }, []);

  const removeImage = useCallback(async (id) => {
    try {
      await deleteImageApi(id);
      setImages((prev) => prev.filter((img) => img.id !== id));
      toast.success('Image deleted.');
    } catch {
      toast.error('Failed to delete image.');
    }
  }, []);

  return {
    images,
    loading,
    error,
    stats,
    params,
    filterByStatus,
    removeImage,
    refresh: loadImages,
  };
}

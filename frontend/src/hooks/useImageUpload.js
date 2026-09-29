import { useState, useCallback, useRef, useEffect } from 'react';
import { uploadImages, fetchImagesBatch } from '../services/api';
import { validateFile, createPreviewUrl } from '../utils/fileValidation';
import toast from 'react-hot-toast';

/**
 * @typedef {'idle'|'uploading'|'processing'|'done'|'error'} UploadState
 *
 * @typedef {{
 *   id: string,
 *   file: File,
 *   previewUrl: string|null,
 *   clientError?: string,
 *   status: 'pending'|'uploading'|'queued'|'accepted'|'rejected'|'client-error',
 *   progress: number,
 *   rejectionReasons?: string[],
 *   width?: number,
 *   height?: number,
 *   blurScore?: number,
 *   faceCount?: number|null,
 *   serverPreviewUrl?: string,
 * }} PendingFile
 */

const POLL_INTERVAL_MS = 1500;
const MAX_POLL_ATTEMPTS = 40; // ~60s ceiling before giving up on a stuck job

let localId = 0;

function nextId() {
  return `local-${++localId}`;
}

const TERMINAL_STATUSES = new Set(['accepted', 'rejected']);

/**
 * Central hook for managing the image upload lifecycle.
 *
 * Uploads are queued server-side and processed asynchronously (see
 * backend uploadQueue) — POST /upload returns immediately once files are
 * recorded, then this hook polls GET /images/batch until each file
 * reaches a terminal status.
 */
export function useImageUpload() {
  /** @type {[PendingFile[], Function]} */
  const [files, setFiles] = useState([]);
  /** @type {[UploadState, Function]} */
  const [uploadState, setUploadState] = useState('idle');
  /** @type {[number, Function]} */
  const [uploadProgress, setUploadProgress] = useState(0);

  const pollTimeoutRef = useRef(null);
  const pollGenerationRef = useRef(0); // bumped to invalidate stale poll loops

  const stopPolling = useCallback(() => {
    pollGenerationRef.current += 1;
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  /**
   * Add new files to the pending list (with client-side pre-validation).
   */
  const addFiles = useCallback((newFiles) => {
    const entries = newFiles.map((file) => {
      const validation = validateFile(file);
      return {
        id: nextId(),
        file,
        previewUrl: validation.valid ? createPreviewUrl(file) : null,
        clientError: validation.valid ? undefined : validation.error,
        status: validation.valid ? 'pending' : 'client-error',
        progress: 0,
      };
    });

    setFiles((prev) => {
      // Deduplicate by name+size
      const existing = new Set(prev.map((f) => `${f.file.name}-${f.file.size}`));
      const unique = entries.filter((e) => !existing.has(`${e.file.name}-${e.file.size}`));
      if (unique.length < entries.length) {
        toast('Some files were skipped — duplicates already added.', { icon: '⚠️' });
      }
      return [...prev, ...unique];
    });
  }, []);

  /**
   * Remove a file from the pending list.
   */
  const removeFile = useCallback((id) => {
    setFiles((prev) => {
      const file = prev.find((f) => f.id === id);
      if (file?.previewUrl) URL.revokeObjectURL(file.previewUrl);
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  /**
   * Clear all files.
   */
  const clearFiles = useCallback(() => {
    stopPolling();
    setFiles((prev) => {
      prev.forEach((f) => {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
      });
      return [];
    });
    setUploadState('idle');
    setUploadProgress(0);
  }, [stopPolling]);

  /**
   * Poll the server for results until every id in `ids` reaches a
   * terminal status, updating matching file entries as results land.
   */
  const pollForResults = useCallback((ids, generation, attempt = 0) => {
    if (ids.length === 0) {
      setUploadState('done');
      return;
    }

    fetchImagesBatch(ids)
      .then(({ images }) => {
        if (pollGenerationRef.current !== generation) return; // superseded (cleared/new upload)

        const byId = new Map(images.map((img) => [img.id, img]));

        setFiles((prev) =>
          prev.map((f) => {
            const result = byId.get(f.id);
            if (!result) return f;
            return {
              ...f,
              status: result.status,
              progress: 100,
              rejectionReasons: result.rejection_reasons || undefined,
              width: result.width,
              height: result.height,
              blurScore: result.blur_score,
              faceCount: result.face_count,
              serverPreviewUrl: result.s3_url !== 'pending' ? result.s3_url : f.serverPreviewUrl,
            };
          })
        );

        const stillPending = images
          .filter((img) => !TERMINAL_STATUSES.has(img.status))
          .map((img) => img.id);

        if (stillPending.length === 0) {
          const accepted = images.filter((img) => img.status === 'accepted').length;
          const rejected = images.filter((img) => img.status === 'rejected').length;

          if (accepted > 0 && rejected === 0) {
            toast.success(`All ${accepted} image(s) accepted!`);
          } else if (accepted > 0) {
            toast(`${accepted} accepted, ${rejected} rejected.`, { icon: '📊' });
          } else {
            toast.error(`All ${rejected} image(s) rejected.`);
          }

          setUploadState('done');
          return;
        }

        if (attempt + 1 >= MAX_POLL_ATTEMPTS) {
          toast.error('Some images are taking longer than expected to process.');
          setUploadState('done');
          return;
        }

        pollTimeoutRef.current = setTimeout(
          () => pollForResults(stillPending, generation, attempt + 1),
          POLL_INTERVAL_MS
        );
      })
      .catch(() => {
        if (pollGenerationRef.current !== generation) return;
        toast.error('Lost connection while checking upload status.');
        setUploadState('error');
      });
  }, []);

  /**
   * Upload all "pending" files to the server, then poll until processed.
   */
  const startUpload = useCallback(async () => {
    const toUpload = files.filter((f) => f.status === 'pending');
    if (toUpload.length === 0) {
      toast.error('No valid files to upload.');
      return;
    }

    stopPolling();
    const generation = pollGenerationRef.current;

    setUploadState('uploading');
    setFiles((prev) =>
      prev.map((f) => (f.status === 'pending' ? { ...f, status: 'uploading', progress: 0 } : f))
    );

    try {
      const response = await uploadImages(
        toUpload.map((f) => f.file),
        (progress) => {
          setUploadProgress(progress);
          setFiles((prev) =>
            prev.map((f) => (f.status === 'uploading' ? { ...f, progress } : f))
          );
        }
      );

      // Map server-assigned ids back to local file entries (same order sent).
      const ids = [];
      setFiles((prev) => {
        const updatedFiles = [...prev];

        response.queued.forEach((queuedItem, idx) => {
          const localFile = toUpload[idx];
          if (!localFile) return;

          const fileIdx = updatedFiles.findIndex((f) => f.id === localFile.id);
          if (fileIdx === -1) return;

          // A file can come back already in a terminal state (e.g. the
          // server failed to even record it) — only files still 'queued'
          // need polling.
          if (queuedItem.status === 'queued') ids.push(queuedItem.id);

          updatedFiles[fileIdx] = {
            ...updatedFiles[fileIdx],
            id: queuedItem.id, // replace local id with server id
            status: queuedItem.status,
            rejectionReasons: queuedItem.rejectionReasons,
            progress: 100,
          };
        });

        return updatedFiles;
      });

      setUploadState('processing');
      pollForResults(ids, generation);
    } catch (err) {
      const message = err.response?.data?.error || 'Upload failed. Please try again.';
      toast.error(message);
      setUploadState('error');
      setFiles((prev) =>
        prev.map((f) =>
          f.status === 'uploading'
            ? { ...f, status: 'rejected', rejectionReasons: [message] }
            : f
        )
      );
    }
  }, [files, pollForResults, stopPolling]);

  const accepted = files.filter((f) => f.status === 'accepted');
  const rejected = files.filter((f) => f.status === 'rejected' || f.status === 'client-error');
  const pending = files.filter(
    (f) => f.status === 'pending' || f.status === 'uploading' || f.status === 'queued'
  );

  return {
    files,
    accepted,
    rejected,
    pending,
    uploadState,
    uploadProgress,
    addFiles,
    removeFile,
    clearFiles,
    startUpload,
  };
}

import { useState, useCallback } from 'react';
import { uploadImages } from '../services/api';
import { validateFile, createPreviewUrl } from '../utils/fileValidation';
import toast from 'react-hot-toast';

/**
 * @typedef {'idle'|'uploading'|'done'|'error'} UploadState
 *
 * @typedef {{
 *   id: string,
 *   file: File,
 *   previewUrl: string|null,
 *   clientError?: string,
 *   status: 'pending'|'uploading'|'accepted'|'rejected'|'client-error',
 *   progress: number,
 *   rejectionReasons?: string[],
 *   width?: number,
 *   height?: number,
 *   blurScore?: number,
 *   faceCount?: number|null,
 *   serverPreviewUrl?: string,
 * }} PendingFile
 */

let localId = 0;

function nextId() {
  return `local-${++localId}`;
}

/**
 * Central hook for managing the image upload lifecycle.
 */
export function useImageUpload() {
  /** @type {[PendingFile[], Function]} */
  const [files, setFiles] = useState([]);
  /** @type {[UploadState, Function]} */
  const [uploadState, setUploadState] = useState('idle');
  /** @type {[number, Function]} */
  const [uploadProgress, setUploadProgress] = useState(0);

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
    setFiles((prev) => {
      prev.forEach((f) => {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
      });
      return [];
    });
    setUploadState('idle');
    setUploadProgress(0);
  }, []);

  /**
   * Upload all "pending" files to the server.
   */
  const startUpload = useCallback(async () => {
    const toUpload = files.filter((f) => f.status === 'pending');
    if (toUpload.length === 0) {
      toast.error('No valid files to upload.');
      return;
    }

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

      // Map server results back to local file entries
      setFiles((prev) => {
        const updatedFiles = [...prev];

        response.results.forEach((result, idx) => {
          const localFile = toUpload[idx];
          if (!localFile) return;

          const fileIdx = updatedFiles.findIndex((f) => f.id === localFile.id);
          if (fileIdx === -1) return;

          updatedFiles[fileIdx] = {
            ...updatedFiles[fileIdx],
            id: result.id, // replace local id with server id
            status: result.status,
            progress: 100,
            rejectionReasons: result.rejectionReasons,
            width: result.width,
            height: result.height,
            blurScore: result.blurScore,
            faceCount: result.faceCount,
            serverPreviewUrl: result.previewUrl,
          };
        });

        return updatedFiles;
      });

      const { summary } = response;
      if (summary.accepted > 0 && summary.rejected === 0) {
        toast.success(`All ${summary.accepted} image(s) accepted!`);
      } else if (summary.accepted > 0) {
        toast(`${summary.accepted} accepted, ${summary.rejected} rejected.`, { icon: '📊' });
      } else {
        toast.error(`All ${summary.rejected} image(s) rejected.`);
      }

      setUploadState('done');
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
  }, [files]);

  const accepted = files.filter((f) => f.status === 'accepted');
  const rejected = files.filter((f) => f.status === 'rejected' || f.status === 'client-error');
  const pending = files.filter((f) => f.status === 'pending' || f.status === 'uploading');

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

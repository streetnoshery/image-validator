import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';

const ACCEPTED_TYPES = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/heic': ['.heic'],
  'image/heif': ['.heif'],
};

/**
 * Drag-and-drop zone for selecting images.
 *
 * @param {{ onFilesSelected: (files: File[]) => void, disabled?: boolean }} props
 */
export function DropZone({ onFilesSelected, disabled = false }) {
  const onDrop = useCallback(
    (acceptedFiles) => {
      if (acceptedFiles.length > 0) onFilesSelected(acceptedFiles);
    },
    [onFilesSelected]
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    multiple: true,
    disabled,
    maxFiles: 10,
  });

  return (
    <div
      {...getRootProps()}
      style={{
        border: `2px dashed ${isDragReject ? 'var(--color-error)' : isDragActive ? 'var(--color-primary)' : 'var(--color-border)'}`,
        borderRadius: 'var(--radius)',
        padding: '48px 24px',
        textAlign: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        backgroundColor: isDragActive
          ? 'rgba(99,102,241,0.04)'
          : isDragReject
          ? 'rgba(239,68,68,0.04)'
          : 'var(--color-surface)',
        transition: 'all 0.2s ease',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <input {...getInputProps()} />
      <div style={{ fontSize: 48, marginBottom: 12 }}>
        {isDragReject ? '🚫' : isDragActive ? '📥' : '🖼️'}
      </div>
      <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text)', marginBottom: 6 }}>
        {isDragActive ? 'Drop images here' : 'Drag & drop images'}
      </p>
      <p style={{ fontSize: 14, color: 'var(--color-text-muted)', marginBottom: 16 }}>
        or click to browse your files
      </p>
      <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
        Supports JPG, JPEG, PNG, HEIC · Max 20 MB per file · Up to 10 files at once
      </p>
    </div>
  );
}

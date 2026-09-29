import React from 'react';
import { DropZone } from './DropZone';
import { FilePreviewCard } from './FilePreviewCard';

/**
 * Upload panel — contains the drop zone, file grid, and action buttons.
 *
 * @param {{
 *   files: import('../hooks/useImageUpload').PendingFile[],
 *   uploadState: string,
 *   uploadProgress: number,
 *   onFilesAdded: (files: File[]) => void,
 *   onRemoveFile: (id: string) => void,
 *   onStartUpload: () => void,
 *   onClear: () => void,
 * }} props
 */
export function UploadSection({
  files,
  uploadState,
  uploadProgress,
  onFilesAdded,
  onRemoveFile,
  onStartUpload,
  onClear,
}) {
  const isUploading = uploadState === 'uploading';
  const isProcessing = uploadState === 'processing';
  const isBusy = isUploading || isProcessing;
  const hasFiles = files.length > 0;
  const pendingCount = files.filter((f) => f.status === 'pending').length;

  return (
    <section>
      <DropZone onFilesSelected={onFilesAdded} disabled={isBusy} />

      {hasFiles && (
        <>
          {/* Action bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 24,
              marginBottom: 16,
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <p style={{ fontSize: 14, color: 'var(--color-text-muted)', fontWeight: 500 }}>
              {files.length} file{files.length !== 1 ? 's' : ''} selected
              {pendingCount > 0 && ` · ${pendingCount} ready to upload`}
            </p>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={onClear}
                disabled={isBusy}
                style={{
                  padding: '8px 18px',
                  borderRadius: 8,
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-surface)',
                  color: 'var(--color-text-muted)',
                  fontSize: 14,
                  fontWeight: 500,
                  opacity: isBusy ? 0.4 : 1,
                }}
              >
                Clear all
              </button>

              <button
                onClick={onStartUpload}
                disabled={isBusy || pendingCount === 0}
                style={{
                  padding: '8px 24px',
                  borderRadius: 8,
                  border: 'none',
                  backgroundColor: isBusy || pendingCount === 0 ? '#a5b4fc' : 'var(--color-primary)',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: isBusy || pendingCount === 0 ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  transition: 'background 0.2s',
                }}
              >
                {isUploading ? (
                  <>
                    <Spinner />
                    Uploading… {uploadProgress}%
                  </>
                ) : isProcessing ? (
                  <>
                    <Spinner />
                    Processing…
                  </>
                ) : (
                  `Upload ${pendingCount > 0 ? pendingCount : ''} image${pendingCount !== 1 ? 's' : ''}`
                )}
              </button>
            </div>
          </div>

          {/* File grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: 16,
            }}
          >
            {files.map((file) => (
              <FilePreviewCard key={file.id} file={file} onRemove={onRemoveFile} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function Spinner() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      style={{ animation: 'spin 0.75s linear infinite' }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

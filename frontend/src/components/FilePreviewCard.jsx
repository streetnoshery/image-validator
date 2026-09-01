import React from 'react';
import { formatFileSize } from '../utils/fileValidation';

const statusConfig = {
  pending: { color: 'var(--color-text-muted)', bg: '#f1f5f9', label: 'Ready to upload', icon: '⏳' },
  uploading: { color: '#2563eb', bg: '#eff6ff', label: 'Uploading…', icon: '⬆️' },
  accepted: { color: 'var(--color-success)', bg: 'var(--color-success-light)', label: 'Accepted', icon: '✅' },
  rejected: { color: 'var(--color-error)', bg: 'var(--color-error-light)', label: 'Rejected', icon: '❌' },
  'client-error': { color: 'var(--color-error)', bg: 'var(--color-error-light)', label: 'Invalid file', icon: '⛔' },
};

/**
 * Card displaying file info, preview, status, and rejection reasons.
 *
 * @param {{
 *   file: import('../hooks/useImageUpload').PendingFile,
 *   onRemove: (id: string) => void,
 * }} props
 */
export function FilePreviewCard({ file, onRemove }) {
  const cfg = statusConfig[file.status] || statusConfig.pending;
  const displayUrl = file.serverPreviewUrl || file.previewUrl;

  return (
    <div
      style={{
        border: `1px solid ${file.status === 'accepted' ? 'var(--color-success)' : file.status === 'rejected' || file.status === 'client-error' ? 'var(--color-error)' : 'var(--color-border)'}`,
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        backgroundColor: 'var(--color-surface)',
        boxShadow: 'var(--shadow)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        transition: 'box-shadow 0.2s',
      }}
    >
      {/* Remove button */}
      <button
        onClick={() => onRemove(file.id)}
        aria-label="Remove file"
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          width: 28,
          height: 28,
          border: 'none',
          borderRadius: '50%',
          backgroundColor: 'rgba(0,0,0,0.5)',
          color: '#fff',
          fontSize: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1,
          lineHeight: 1,
          padding: 0,
        }}
      >
        ×
      </button>

      {/* Preview area */}
      <div
        style={{
          width: '100%',
          aspectRatio: '1',
          backgroundColor: '#f1f5f9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {displayUrl ? (
          <img
            src={displayUrl}
            alt={file.file.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 12 }}>
            <div style={{ fontSize: 32, marginBottom: 4 }}>📷</div>
            <div style={{ fontSize: 11 }}>HEIC preview</div>
            <div style={{ fontSize: 11 }}>not available</div>
          </div>
        )}
      </div>

      {/* Progress bar */}
      {file.status === 'uploading' && (
        <div style={{ height: 3, backgroundColor: '#e2e8f0', width: '100%' }}>
          <div
            style={{
              height: '100%',
              backgroundColor: 'var(--color-primary)',
              width: `${file.progress}%`,
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      )}

      {/* Info */}
      <div style={{ padding: '10px 12px', flex: 1 }}>
        <p
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--color-text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            marginBottom: 4,
          }}
          title={file.file.name}
        >
          {file.file.name}
        </p>
        <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 8 }}>
          {formatFileSize(file.file.size)}
          {file.width && file.height ? ` · ${file.width}×${file.height}` : ''}
        </p>

        {/* Status badge */}
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 8px',
            borderRadius: 999,
            backgroundColor: cfg.bg,
            color: cfg.color,
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {cfg.icon} {cfg.label}
          {file.status === 'uploading' && file.progress > 0 && ` (${file.progress}%)`}
        </span>

        {/* Rejection reasons */}
        {(file.rejectionReasons?.length > 0 || file.clientError) && (
          <ul
            style={{
              marginTop: 8,
              paddingLeft: 0,
              listStyle: 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
            }}
          >
            {(file.rejectionReasons || [file.clientError]).map((reason, i) => (
              <li
                key={i}
                style={{
                  fontSize: 10,
                  color: 'var(--color-error)',
                  display: 'flex',
                  gap: 4,
                  alignItems: 'flex-start',
                }}
              >
                <span>•</span>
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Extra info for accepted images */}
        {file.status === 'accepted' && file.blurScore != null && (
          <p style={{ fontSize: 10, color: 'var(--color-success)', marginTop: 6 }}>
            Sharpness: {Math.round(file.blurScore)} · Faces: {file.faceCount ?? 'N/A'}
          </p>
        )}
      </div>
    </div>
  );
}

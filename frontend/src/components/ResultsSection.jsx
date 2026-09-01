import React from 'react';
import { FilePreviewCard } from './FilePreviewCard';

/**
 * Displays Accepted and Rejected image columns after upload.
 *
 * @param {{
 *   accepted: import('../hooks/useImageUpload').PendingFile[],
 *   rejected: import('../hooks/useImageUpload').PendingFile[],
 *   onRemove: (id: string) => void,
 * }} props
 */
export function ResultsSection({ accepted, rejected, onRemove }) {
  if (accepted.length === 0 && rejected.length === 0) return null;

  return (
    <section style={{ marginTop: 40 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20, color: 'var(--color-text)' }}>
        Results
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Accepted */}
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 14,
              paddingBottom: 10,
              borderBottom: '2px solid var(--color-success)',
            }}
          >
            <span style={{ fontSize: 20 }}>✅</span>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-success)' }}>
              Accepted ({accepted.length})
            </h3>
          </div>
          {accepted.length === 0 ? (
            <EmptyState message="No images were accepted." />
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                gap: 12,
              }}
            >
              {accepted.map((file) => (
                <FilePreviewCard key={file.id} file={file} onRemove={onRemove} />
              ))}
            </div>
          )}
        </div>

        {/* Rejected */}
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 14,
              paddingBottom: 10,
              borderBottom: '2px solid var(--color-error)',
            }}
          >
            <span style={{ fontSize: 20 }}>❌</span>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-error)' }}>
              Rejected ({rejected.length})
            </h3>
          </div>
          {rejected.length === 0 ? (
            <EmptyState message="No images were rejected." />
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                gap: 12,
              }}
            >
              {rejected.map((file) => (
                <FilePreviewCard key={file.id} file={file} onRemove={onRemove} />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function EmptyState({ message }) {
  return (
    <div
      style={{
        padding: '24px 16px',
        textAlign: 'center',
        color: 'var(--color-text-muted)',
        fontSize: 13,
        border: '1px dashed var(--color-border)',
        borderRadius: 'var(--radius)',
      }}
    >
      {message}
    </div>
  );
}

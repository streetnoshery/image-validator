import React, { useState } from 'react';
import { useImageGallery } from '../hooks/useImageGallery';
import { formatFileSize } from '../utils/fileValidation';

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'accepted', label: '✅ Accepted' },
  { value: 'rejected', label: '❌ Rejected' },
];

/**
 * Full gallery of persisted images fetched from the API.
 */
export function GallerySection() {
  const { images, loading, error, stats, filterByStatus, removeImage, refresh, params } =
    useImageGallery();
  const [selectedImage, setSelectedImage] = useState(null);

  const totalCount = Object.values(stats).reduce((a, b) => a + b, 0);

  return (
    <section>
      {/* Stats bar */}
      <div
        style={{
          display: 'flex',
          gap: 16,
          marginBottom: 24,
          flexWrap: 'wrap',
        }}
      >
        <StatCard label="Total" value={totalCount} color="var(--color-primary)" />
        <StatCard label="Accepted" value={stats.accepted || 0} color="var(--color-success)" />
        <StatCard label="Rejected" value={stats.rejected || 0} color="var(--color-error)" />
        <StatCard label="Processing" value={stats.processing || 0} color="var(--color-warning)" />
      </div>

      {/* Filters + refresh */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 20,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', gap: 8 }}>
          {STATUS_FILTERS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => filterByStatus(value)}
              style={{
                padding: '6px 14px',
                borderRadius: 999,
                border: '1px solid var(--color-border)',
                backgroundColor:
                  params.status === (value || undefined) || (!params.status && value === '')
                    ? 'var(--color-primary)'
                    : 'var(--color-surface)',
                color:
                  params.status === (value || undefined) || (!params.status && value === '')
                    ? '#fff'
                    : 'var(--color-text-muted)',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={refresh}
          style={{
            padding: '6px 14px',
            borderRadius: 8,
            border: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-surface)',
            color: 'var(--color-text-muted)',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          ↻ Refresh
        </button>
      </div>

      {/* Content */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--color-text-muted)' }}>
          Loading images…
        </div>
      )}
      {error && (
        <div
          style={{
            padding: 16,
            backgroundColor: 'var(--color-error-light)',
            borderRadius: 'var(--radius)',
            color: 'var(--color-error)',
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}

      {!loading && !error && images.length === 0 && (
        <div
          style={{
            textAlign: 'center',
            padding: '60px 0',
            color: 'var(--color-text-muted)',
            fontSize: 14,
          }}
        >
          No images found. Upload some images to see them here.
        </div>
      )}

      {!loading && images.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 16,
          }}
        >
          {images.map((img) => (
            <GalleryCard
              key={img.id}
              image={img}
              onDelete={removeImage}
              onClick={() => setSelectedImage(img)}
            />
          ))}
        </div>
      )}

      {/* Lightbox */}
      {selectedImage && (
        <Lightbox image={selectedImage} onClose={() => setSelectedImage(null)} />
      )}
    </section>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, color }) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 100,
        padding: '14px 18px',
        borderRadius: 'var(--radius)',
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        boxShadow: 'var(--shadow)',
      }}
    >
      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 26, fontWeight: 700, color }}>{value}</p>
    </div>
  );
}

function GalleryCard({ image, onDelete, onClick }) {
  const isAccepted = image.status === 'accepted';
  return (
    <div
      style={{
        border: `1px solid ${isAccepted ? 'var(--color-success)' : 'var(--color-error)'}`,
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        backgroundColor: 'var(--color-surface)',
        boxShadow: 'var(--shadow)',
        cursor: 'pointer',
      }}
      onClick={onClick}
    >
      {/* Thumbnail */}
      <div
        style={{
          aspectRatio: '1',
          backgroundColor: '#f1f5f9',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {image.s3_url && image.s3_url !== 'pending' ? (
          <img
            src={image.s3_url}
            alt={image.original_filename}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            loading="lazy"
          />
        ) : (
          <span style={{ fontSize: 32 }}>📷</span>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: '8px 10px' }}>
        <p
          style={{
            fontSize: 11,
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            marginBottom: 4,
          }}
          title={image.original_filename}
        >
          {image.original_filename}
        </p>
        <div
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: isAccepted ? 'var(--color-success)' : 'var(--color-error)',
            }}
          >
            {isAccepted ? '✅ Accepted' : '❌ Rejected'}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(image.id);
            }}
            style={{
              border: 'none',
              background: 'none',
              color: 'var(--color-error)',
              fontSize: 12,
              cursor: 'pointer',
              padding: '2px 4px',
            }}
            aria-label="Delete image"
            title="Delete"
          >
            🗑️
          </button>
        </div>
      </div>
    </div>
  );
}

function Lightbox({ image, onClose }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'var(--color-surface)',
          borderRadius: 16,
          overflow: 'hidden',
          maxWidth: 600,
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Image */}
        {image.s3_url && image.s3_url !== 'pending' && (
          <img
            src={image.s3_url}
            alt={image.original_filename}
            style={{ width: '100%', maxHeight: 350, objectFit: 'contain', background: '#f1f5f9' }}
          />
        )}

        {/* Details */}
        <div style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700 }}>{image.original_filename}</h3>
            <button
              onClick={onClose}
              style={{
                border: 'none',
                background: 'none',
                fontSize: 20,
                cursor: 'pointer',
                color: 'var(--color-text-muted)',
              }}
            >
              ×
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: 13 }}>
            <Detail label="Status" value={image.status} />
            <Detail label="Size" value={formatFileSize(image.file_size)} />
            {image.width && <Detail label="Dimensions" value={`${image.width}×${image.height}`} />}
            {image.blur_score != null && (
              <Detail label="Sharpness score" value={Math.round(image.blur_score)} />
            )}
            {image.face_count != null && <Detail label="Faces detected" value={image.face_count} />}
            <Detail
              label="Uploaded"
              value={new Date(image.created_at).toLocaleString()}
            />
          </div>

          {image.rejection_reasons?.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <p
                style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-error)', marginBottom: 6 }}
              >
                Rejection reasons:
              </p>
              <ul style={{ paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {image.rejection_reasons.map((reason, i) => (
                  <li key={i} style={{ fontSize: 12, color: 'var(--color-error)', display: 'flex', gap: 6 }}>
                    <span>•</span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 1 }}>{label}</p>
      <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)' }}>{value ?? '—'}</p>
    </div>
  );
}

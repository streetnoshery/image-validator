import React, { useState } from 'react';
import { Toaster } from 'react-hot-toast';
import { UploadSection } from './components/UploadSection';
import { ResultsSection } from './components/ResultsSection';
import { GallerySection } from './components/GallerySection';
import { useImageUpload } from './hooks/useImageUpload';

const TABS = [
  { id: 'upload', label: '⬆️ Upload' },
  { id: 'gallery', label: '🖼️ Gallery' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('upload');

  const {
    files,
    accepted,
    rejected,
    uploadState,
    uploadProgress,
    addFiles,
    removeFile,
    clearFiles,
    startUpload,
  } = useImageUpload();

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--color-bg)' }}>
      <Toaster position="top-right" />

      {/* Header */}
      <header
        style={{
          backgroundColor: 'var(--color-surface)',
          borderBottom: '1px solid var(--color-border)',
          padding: '0 24px',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          boxShadow: 'var(--shadow)',
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: 60,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 24 }}>🔍</span>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text)' }}>
                Image Validator
              </h1>
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                Smart upload · Face detection · Quality checks
              </p>
            </div>
          </div>

          {/* Tabs */}
          <nav style={{ display: 'flex', gap: 4 }}>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '6px 18px',
                  borderRadius: 8,
                  border: 'none',
                  backgroundColor: activeTab === tab.id ? 'var(--color-primary)' : 'transparent',
                  color: activeTab === tab.id ? '#fff' : 'var(--color-text-muted)',
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
        {activeTab === 'upload' && (
          <>
            <div style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Upload Images</h2>
              <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>
                Each image is checked for format, resolution, sharpness, similarity, and face
                detection.
              </p>
            </div>

            {/* Validation rules info */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: 10,
                marginBottom: 28,
              }}
            >
              {[
                { icon: '📏', text: 'Min resolution 200×200 px' },
                { icon: '📁', text: 'JPG, PNG, HEIC only' },
                { icon: '🔍', text: 'No blurry images' },
                { icon: '🙂', text: 'Exactly one face required' },
                { icon: '👥', text: 'No multiple faces' },
                { icon: '🔄', text: 'No duplicate images' },
              ].map(({ icon, text }) => (
                <div
                  key={text}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    borderRadius: 8,
                    backgroundColor: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    fontSize: 12,
                    color: 'var(--color-text-muted)',
                  }}
                >
                  <span>{icon}</span>
                  <span>{text}</span>
                </div>
              ))}
            </div>

            <UploadSection
              files={files}
              uploadState={uploadState}
              uploadProgress={uploadProgress}
              onFilesAdded={addFiles}
              onRemoveFile={removeFile}
              onStartUpload={startUpload}
              onClear={clearFiles}
            />

            {uploadState === 'done' && (
              <ResultsSection
                accepted={accepted}
                rejected={rejected}
                onRemove={removeFile}
              />
            )}
          </>
        )}

        {activeTab === 'gallery' && (
          <>
            <div style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Image Gallery</h2>
              <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>
                All previously uploaded images stored in MinIO.
              </p>
            </div>
            <GallerySection />
          </>
        )}
      </main>
    </div>
  );
}

/**
 * Client-side file validation — runs BEFORE upload to give instant feedback.
 * Server-side validation is the authoritative check; this is just UX sugar.
 */

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/heif'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.heic', '.heif'];
const MAX_SIZE_MB = 20;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

/**
 * Check a File object against client-side constraints.
 * @param {File} file
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateFile(file) {
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  const mime = file.type.toLowerCase();

  // Type check — accept by MIME or extension (HEIC may have empty/wrong MIME on some platforms)
  const mimeOk = ALLOWED_TYPES.includes(mime);
  const extOk = ALLOWED_EXTENSIONS.includes(ext);

  if (!mimeOk && !extOk) {
    return {
      valid: false,
      error: `Unsupported format "${ext}". Allowed: JPG, JPEG, PNG, HEIC.`,
    };
  }

  if (file.size > MAX_SIZE_BYTES) {
    return {
      valid: false,
      error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is ${MAX_SIZE_MB} MB.`,
    };
  }

  if (file.size === 0) {
    return { valid: false, error: 'File appears to be empty.' };
  }

  return { valid: true };
}

/**
 * Format file size for display.
 * @param {number} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Create an object URL preview for a File (handles HEIC with a placeholder).
 * @param {File} file
 * @returns {string|null} object URL or null if HEIC
 */
export function createPreviewUrl(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'heic' || ext === 'heif') return null; // browser can't render HEIC natively
  return URL.createObjectURL(file);
}

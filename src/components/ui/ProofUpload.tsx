import React, { useRef, useState } from 'react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { storageService, type UploadedProof } from '../../features/storage/storage.service';

interface ProofUploadProps {
  childId: string;
  childActivityId: string;
  onUploadComplete: (proof: UploadedProof) => void;
  onRemove: () => void;
  currentProof?: UploadedProof | null;
  disabled?: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Convert a base64 data-URI to a File object for upload. */
function dataUriToFile(dataUri: string, filename: string): File {
  const [header, data] = dataUri.split(',');
  const mime = header.match(/:(.*?);/)?.[1] ?? 'image/jpeg';
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], filename, { type: mime });
}

// ─── Component ──────────────────────────────────────────────────────────────

const ProofUpload: React.FC<ProofUploadProps> = ({
  childId,
  childActivityId,
  onUploadComplete,
  onRemove,
  currentProof,
  disabled = false,
}) => {
  // Web fallback: separate inputs for camera vs gallery
  const galleryRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isNative = Capacitor.isNativePlatform();

  // ── Core upload logic ──────────────────────────────────────────────────
  const handleFile = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const proof = await storageService.uploadActivityProof(file, childId, childActivityId);
      onUploadComplete(proof);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'upload");
    } finally {
      setUploading(false);
      if (galleryRef.current) galleryRef.current.value = '';
    }
  };

  // ── Native camera (iOS & Android via @capacitor/camera) ───────────────
  const handleNativeCamera = async () => {
    if (disabled || uploading) return;
    try {
      // Request permission explicitly before opening camera
      const permissions = await Camera.requestPermissions({ permissions: ['camera', 'photos'] });
      if (permissions.camera === 'denied' || permissions.camera === 'prompt-with-rationale') {
        setError('Autorisation caméra refusée. Activez-la dans les réglages de l\'application.');
        return;
      }

      const photo = await Camera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        saveToGallery: false,
      });

      if (photo.dataUrl) {
        const file = dataUriToFile(photo.dataUrl, `proof_${Date.now()}.jpg`);
        await handleFile(file);
      }
    } catch (err: unknown) {
      // User cancelled — not an error
      if (err instanceof Error && err.message?.includes('cancelled')) return;
      if (typeof err === 'string' && err.includes('cancelled')) return;
      setError('Impossible d\'ouvrir la caméra. Vérifiez les autorisations dans les réglages.');
    }
  };

  // ── Native gallery (iOS & Android via @capacitor/camera) ──────────────
  const handleNativeGallery = async () => {
    if (disabled || uploading) return;
    try {
      const permissions = await Camera.requestPermissions({ permissions: ['photos'] });
      if (permissions.photos === 'denied') {
        setError('Accès à la galerie refusé. Activez-le dans les réglages de l\'application.');
        return;
      }

      const photo = await Camera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Photos,
        saveToGallery: false,
      });

      if (photo.dataUrl) {
        const file = dataUriToFile(photo.dataUrl, `proof_${Date.now()}.jpg`);
        await handleFile(file);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message?.includes('cancelled')) return;
      if (typeof err === 'string' && err.includes('cancelled')) return;
      setError('Impossible d\'ouvrir la galerie. Vérifiez les autorisations dans les réglages.');
    }
  };

  // ── Web fallback: standard file input ─────────────────────────────────
  const handleWebChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await handleFile(file);
  };

  // ── Dispatchers (native vs web) ───────────────────────────────────────
  const onCameraClick = isNative
    ? handleNativeCamera
    : () => {
        // Web: create a temporary input with capture to open camera
        const tmp = document.createElement('input');
        tmp.type = 'file';
        tmp.accept = 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime';
        tmp.capture = 'environment';
        tmp.onchange = (ev) => {
          const f = (ev.target as HTMLInputElement).files?.[0];
          if (f) handleFile(f);
        };
        tmp.click();
      };

  const onGalleryClick = isNative ? handleNativeGallery : () => galleryRef.current?.click();

  // ── Styles ────────────────────────────────────────────────────────────
  const btn = (primary: boolean) => ({
    flex: 1,
    padding: '16px 12px',
    borderRadius: 14,
    border: `2px solid ${primary ? 'var(--dc-primary)' : 'var(--dc-border)'}`,
    background: primary ? 'rgba(108,92,231,0.07)' : 'white',
    cursor: disabled || uploading ? 'not-allowed' : 'pointer',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 8,
    transition: 'all 0.15s',
    opacity: disabled || uploading ? 0.6 : 1,
  });

  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 14, fontWeight: 700, marginBottom: 10, color: 'var(--dc-text)' }}>
        Preuve de réalisation <span style={{ color: 'var(--dc-text-muted)', fontWeight: 400 }}>(optionnel)</span>
      </label>

      {currentProof ? (
        /* ── Preview ── */
        <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', border: '2px solid var(--dc-success)' }}>
          {currentProof.type === 'image' ? (
            <img src={currentProof.url} alt="Preuve" style={{ width: '100%', maxHeight: 220, objectFit: 'cover', display: 'block' }} />
          ) : (
            <video src={currentProof.url} controls style={{ width: '100%', maxHeight: 220, display: 'block' }} />
          )}
          <div style={{
            position: 'absolute', top: 0, right: 0, left: 0,
            background: 'linear-gradient(rgba(0,0,0,0.55), transparent)',
            padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ color: 'white', fontSize: 13, fontWeight: 700 }}>Preuve ajoutée</span>
            {!disabled && (
              <button
                onClick={onRemove}
                style={{
                  background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white',
                  borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                }}
              >
                Supprimer
              </button>
            )}
          </div>
        </div>
      ) : uploading ? (
        /* ── Uploading state ── */
        <div style={{
          width: '100%', padding: '24px', borderRadius: 14,
          border: '2px dashed var(--dc-primary)', background: 'rgba(108,92,231,0.05)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            border: '3px solid var(--dc-primary)', borderTopColor: 'transparent',
            animation: 'dc-spin 0.8s linear infinite',
          }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--dc-primary)' }}>Envoi en cours...</span>
        </div>
      ) : (
        /* ── Two action buttons ── */
        <div style={{ display: 'flex', gap: 10 }}>
          {/* Camera button */}
          <button
            type="button"
            disabled={disabled || uploading}
            onClick={onCameraClick}
            style={btn(true)}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--dc-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--dc-primary)' }}>Prendre une photo</span>
          </button>

          {/* Gallery button */}
          <button
            type="button"
            disabled={disabled || uploading}
            onClick={onGalleryClick}
            style={btn(false)}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--dc-text-light)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--dc-text-light)' }}>Depuis la galerie</span>
          </button>
        </div>
      )}

      {error && (
        <p style={{ color: 'var(--dc-danger)', fontSize: 12, marginTop: 8, fontWeight: 600 }}>{error}</p>
      )}

      {/* Web-only fallback: gallery picker (camera handled via tmp input above) */}
      {!isNative && (
        <input
          ref={galleryRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime"
          style={{ display: 'none' }}
          onChange={handleWebChange}
        />
      )}
    </div>
  );
};

export default ProofUpload;

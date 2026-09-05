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
  /** Mention affichée sous « Ajouter une photo » (ex. « obligatoire pour cette activité »). */
  hint?: string;
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
  hint = 'facultatif',
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

  return (
    <div style={{ marginBottom: 14 }}>
      {currentProof ? (
        <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', border: '1.5px solid var(--rk-sage)' }}>
          {currentProof.type === 'image' ? (
            <img src={currentProof.url} alt="Preuve" style={{ width: '100%', maxHeight: 220, objectFit: 'cover', display: 'block' }} />
          ) : (
            <video src={currentProof.url} controls style={{ width: '100%', maxHeight: 220, display: 'block' }} />
          )}
          <div style={{
            position: 'absolute', top: 0, right: 0, left: 0,
            background: 'linear-gradient(rgba(22,24,43,.55), transparent)',
            padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>Preuve ajoutée</span>
            {!disabled && (
              <button onClick={onRemove} style={{
                height: 28, padding: '0 11px', borderRadius: 999,
                background: 'rgba(255,255,255,.2)', color: '#fff', fontSize: 12, fontWeight: 700,
              }}>
                Retirer
              </button>
            )}
          </div>
        </div>
      ) : uploading ? (
        <div style={{
          width: '100%', padding: 24, borderRadius: 16,
          border: '1.5px dashed var(--rk-border)', background: 'var(--rk-surface2)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            border: '3px solid var(--rk-accent)', borderTopColor: 'transparent',
            animation: 'dc-spin 0.8s linear infinite',
          }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--rk-text2)' }}>Envoi en cours…</span>
        </div>
      ) : (
        <>
          <button
            type="button"
            disabled={disabled || uploading}
            onClick={onCameraClick}
            style={{
              width: '100%', height: 150, borderRadius: 16, border: 'none',
              background: 'var(--rk-surface2)',
              backgroundImage: 'repeating-linear-gradient(115deg, var(--rk-line) 0 1px, transparent 1px 11px)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
              cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? .6 : 1,
            }}
          >
            <div style={{
              width: 42, height: 42, borderRadius: '50%', background: 'var(--rk-surface)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, fontWeight: 600, color: 'var(--rk-text)', lineHeight: 1,
            }}>+</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--rk-text)' }}>Ajouter une photo</div>
            <div style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 10, color: 'var(--rk-text3)' }}>{hint}</div>
          </button>

          <button
            type="button"
            disabled={disabled || uploading}
            onClick={onGalleryClick}
            style={{
              display: 'block', margin: '10px auto 0', fontSize: 12, fontWeight: 700,
              color: 'var(--rk-text3)', background: 'none', border: 'none', cursor: 'pointer',
            }}
          >
            Choisir dans la galerie
          </button>
        </>
      )}

      {error && (
        <p style={{ color: 'var(--rk-rasp)', fontSize: 12, marginTop: 8, fontWeight: 600 }}>{error}</p>
      )}

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

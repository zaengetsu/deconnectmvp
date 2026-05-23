import React, { useRef, useState } from 'react';
import { storageService, type UploadedProof } from '../../features/storage/storage.service';

interface ProofUploadProps {
  childId: string;
  childActivityId: string;
  onUploadComplete: (proof: UploadedProof) => void;
  onRemove: () => void;
  currentProof?: UploadedProof | null;
  disabled?: boolean;
}

const ProofUpload: React.FC<ProofUploadProps> = ({
  childId,
  childActivityId,
  onUploadComplete,
  onRemove,
  currentProof,
  disabled = false,
}) => {
  // Two separate inputs: one for camera, one for gallery
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      if (cameraRef.current) cameraRef.current.value = '';
      if (galleryRef.current) galleryRef.current.value = '';
    }
  };

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await handleFile(file);
  };

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
            disabled={disabled}
            onClick={() => cameraRef.current?.click()}
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
            disabled={disabled}
            onClick={() => galleryRef.current?.click()}
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

      {/* Hidden input — opens camera directly */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
        capture="environment"
        style={{ display: 'none' }}
        onChange={handleChange}
      />

      {/* Hidden input — opens file picker / gallery */}
      <input
        ref={galleryRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime"
        style={{ display: 'none' }}
        onChange={handleChange}
      />
    </div>
  );
};

export default ProofUpload;

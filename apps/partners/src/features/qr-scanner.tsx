'use client';
import { Modal } from '@rekonect/ui';
import { useEffect, useRef, useState } from 'react';

interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}

/** Lecture du QR code d'un bon avec la caméra (navigateurs compatibles BarcodeDetector). */
export function QrScanner({ open, onClose, onCode }: { open: boolean; onClose: () => void; onCode: (text: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let stop = false;
    const Ctor = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
    (async () => {
      try {
        if (!Ctor) throw new Error('Lecture par caméra non disponible sur ce navigateur');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const detector = new Ctor({ formats: ['qr_code'] });
        while (!stop) {
          const codes = await detector.detect(video.current).catch(() => []);
          if (codes[0]?.rawValue) return onCode(codes[0].rawValue);
          await new Promise((r) => setTimeout(r, 250));
        }
      } catch (e) {
        setError((e as Error).message || 'Caméra indisponible');
      }
    })();
    return () => {
      stop = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open, onCode]);
  return (
    <Modal open={open} title="Scanner le QR code" onClose={onClose}>
      {error ? <div style={{ fontSize: 14, color: '#AE3A50' }}>{error}</div> : <video ref={video} muted playsInline style={{ width: '100%', borderRadius: 14, background: '#000' }} />}
    </Modal>
  );
}

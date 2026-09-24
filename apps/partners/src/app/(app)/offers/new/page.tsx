'use client';
import { C } from '@rekonect/ui';
import { OfferEditor } from '@/features/offer-editor';
import { usePartner } from '@/lib/partner';

export default function NewOfferPage() {
  const { can, detail } = usePartner();
  if (!detail) return null;
  if (!can.edit) return <div style={{ fontSize: 14, color: C.muted }}>Votre rôle ne permet pas de créer des offres.</div>;
  return <OfferEditor />;
}

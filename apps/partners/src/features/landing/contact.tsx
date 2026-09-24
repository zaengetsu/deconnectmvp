'use client';
import { ApiError, type PartnerLeadKind } from '@rekonect/api-client';
import { PartnerLeadInput } from '@rekonect/contracts';
import { BRAND, Pattern, Rings } from '@rekonect/ui';
import { type FormEvent, useId, useState } from 'react';
import { LEAD_KINDS } from './content';
import s from './landing.module.css';
import { usePublicApi } from './pricing';
import { Container } from './ui';

type Field = 'fullName' | 'organization' | 'email';
type Errors = Partial<Record<Field | 'form', string>>;

const MESSAGES: Record<Field, string> = {
  fullName: 'Indiquez votre nom.',
  organization: 'Indiquez votre organisation.',
  email: 'Indiquez un email valide.',
};

/** Valide le formulaire avec le schéma partagé avec l'API. */
export function validateLead(input: { fullName: string; organization: string; email: string; kind: PartnerLeadKind; website?: string }): { ok: true; data: PartnerLeadInput } | { ok: false; errors: Errors } {
  const parsed = PartnerLeadInput.safeParse(input);
  if (parsed.success) return { ok: true, data: parsed.data };
  const errors: Errors = {};
  for (const issue of parsed.error.issues) {
    const k = issue.path[0] as Field;
    if (k in MESSAGES) errors[k] = MESSAGES[k];
  }
  return { ok: false, errors };
}

export function ContactSection({ kind, onKind }: { kind: PartnerLeadKind; onKind: (k: PartnerLeadKind) => void }) {
  return (
    <section id="contact" data-screen-label="Contact" aria-labelledby="contact-title" style={{ position: 'relative', overflow: 'hidden', background: BRAND.peach }}>
      <Pattern kind="hatch" line="rgba(255,255,255,.2)" />
      <div aria-hidden style={{ position: 'absolute', left: -120, top: -120, width: 420, height: 420, borderRadius: '50%', border: '40px solid rgba(255,255,255,.18)' }} />
      <div aria-hidden style={{ position: 'absolute', right: -100, bottom: -160, width: 420, height: 420, borderRadius: '50%', border: '40px solid rgba(60,65,168,.14)' }} />
      <Container style={{ position: 'relative', paddingTop: 100, paddingBottom: 100, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,400px),1fr))', gap: 48, alignItems: 'center' }}>
        <div>
          <h2 id="contact-title" style={{ fontSize: 'clamp(36px,4.4vw,58px)', fontWeight: 800, letterSpacing: '-.045em', lineHeight: 1.02, margin: 0, color: BRAND.ink, textWrap: 'balance' }}>
            Votre première offre en ligne cette semaine.
          </h2>
          <p style={{ fontSize: 17, color: '#3A1D0E', lineHeight: 1.6, margin: '18px 0 0', maxWidth: '44ch' }}>
            Laissez vos coordonnées. Un membre de l'équipe vous rappelle sous 48 h pour préparer l'offre avec vous.
          </p>
        </div>
        <div style={{ background: '#fff', borderRadius: 28, padding: 28, boxShadow: '0 40px 70px -30px rgba(90,40,10,.55)', color: BRAND.ink }}>
          <ContactForm kind={kind} onKind={onKind} />
        </div>
      </Container>
    </section>
  );
}

export function ContactForm({ kind, onKind }: { kind: PartnerLeadKind; onKind: (k: PartnerLeadKind) => void }) {
  const api = usePublicApi();
  const uid = useId();
  const [values, setValues] = useState({ fullName: '', organization: '', email: '', website: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const set = (k: keyof typeof values) => (e: { target: { value: string } }) => {
    setValues((v) => ({ ...v, [k]: e.target.value }));
    setErrors((er) => (er[k as Field] ? { ...er, [k]: undefined } : er));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const res = validateLead({ ...values, kind, website: values.website || undefined });
    if (!res.ok) return setErrors(res.errors);
    setErrors({});
    setBusy(true);
    try {
      await api.submitPartnerLead(res.data);
      setSent(true);
    } catch (err) {
      setErrors({ form: err instanceof ApiError && err.status < 500 ? err.message : 'Envoi impossible pour le moment. Réessayez dans un instant.' });
    } finally {
      setBusy(false);
    }
  };

  if (sent)
    return (
      <div role="status" style={{ textAlign: 'center', padding: '30px 10px' }}>
        <div style={{ position: 'relative', width: 74, height: 74, margin: '0 auto' }}>
          <Rings at="center" size={170} color={BRAND.sage} strength={1.2} />
          <div style={{ position: 'relative', width: 74, height: 74, borderRadius: '50%', background: BRAND.sage, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 30, fontWeight: 800 }}>✓</div>
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.025em', marginTop: 18 }}>Merci, c'est noté</div>
        <div style={{ fontSize: 14, color: '#4A4E66', marginTop: 6, lineHeight: 1.55 }}>Nous vous recontactons sous 48 h. Un email de confirmation vient de partir.</div>
      </div>
    );

  const input = (k: Field, label: string, props: { type?: string; autoComplete?: string; placeholder: string }) => (
    <div>
      <label htmlFor={`${uid}-${k}`} style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#4A4E66', marginBottom: 6 }}>{label}</label>
      <input
        id={`${uid}-${k}`}
        name={k}
        className={s.input}
        value={values[k]}
        onChange={set(k)}
        aria-invalid={errors[k] ? true : undefined}
        aria-describedby={errors[k] ? `${uid}-${k}-err` : undefined}
        {...props}
        style={{ width: '100%', height: 48, borderRadius: 13, border: `1.5px solid ${errors[k] ? '#D8556B' : 'rgba(22,24,43,.14)'}`, padding: '0 14px', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', background: '#fff', color: BRAND.ink }}
      />
      {errors[k] && <div id={`${uid}-${k}-err`} style={{ fontSize: 12, fontWeight: 600, color: '#AE3A50', marginTop: 5 }}>{errors[k]}</div>}
    </div>
  );

  return (
    <form onSubmit={submit} noValidate aria-label="Être rappelé" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>
        {input('fullName', 'Nom', { autoComplete: 'name', placeholder: 'Julie Bernard' })}
        {input('organization', 'Organisation', { autoComplete: 'organization', placeholder: 'Magasin, ville, CSE…' })}
      </div>
      {input('email', 'Email professionnel', { type: 'email', autoComplete: 'email', placeholder: 'vous@organisation.fr' })}
      <div className={s.honeypot} aria-hidden>
        <label htmlFor={`${uid}-website`}>Site web</label>
        <input id={`${uid}-website`} name="website" tabIndex={-1} autoComplete="off" value={values.website} onChange={set('website')} />
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontSize: 12, fontWeight: 700, color: '#4A4E66', marginBottom: 8, padding: 0 }}>Vous êtes</legend>
        <div role="radiogroup" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {LEAD_KINDS.map((k) => {
            const on = k.id === kind;
            return (
              <button key={k.id} type="button" role="radio" aria-checked={on} className={s.chip} onClick={() => onKind(k.id)} style={{ height: 36, padding: '0 14px', borderRadius: 999, fontSize: 13, fontWeight: 700, background: on ? BRAND.ink : '#fff', color: on ? '#fff' : '#4A4E66', border: `1px solid ${on ? BRAND.ink : 'rgba(22,24,43,.12)'}` }}>
                {k.label}
              </button>
            );
          })}
        </div>
      </fieldset>
      {errors.form && (
        <div role="alert" style={{ background: '#FBE9EC', color: '#AE3A50', borderRadius: 12, padding: '11px 14px', fontSize: 13, fontWeight: 600 }}>
          {errors.form}
        </div>
      )}
      <button type="submit" disabled={busy} className={s.cta} style={{ height: 54, borderRadius: 999, background: BRAND.ink, color: '#fff', fontSize: 15, fontWeight: 800, textAlign: 'center', marginTop: 6, opacity: busy ? 0.7 : 1 }}>
        {busy ? 'Envoi…' : 'Être rappelé'}
      </button>
      <p style={{ fontSize: 11, color: '#8A8FA6', margin: 0, lineHeight: 1.5 }}>Vos coordonnées servent uniquement à vous recontacter au sujet d'un partenariat Rekonect.</p>
    </form>
  );
}

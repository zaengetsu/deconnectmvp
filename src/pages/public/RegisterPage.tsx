import React, { useState, useEffect } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { supabase } from '../../lib/supabase';
import { Heart, User, BookOpen, Shield, MapPin, Mail } from 'lucide-react';

const PARENT_ROLES = [
  { value: 'maman',     label: 'Maman',         Icon: Heart,    color: '#FF6B9D' },
  { value: 'papa',      label: 'Papa',           Icon: User,     color: '#6C5CE7' },
  { value: 'educateur', label: 'Éducateur·rice', Icon: BookOpen, color: '#00B894' },
  { value: 'tuteur',    label: 'Tuteur·rice',    Icon: Shield,   color: '#FDCB6E' },
] as const;

type ParentRole = typeof PARENT_ROLES[number]['value'];

const RegisterPage: React.FC = () => {
  const history = useHistory();
  const { signUp, isLoading, error, clearError, user } = useAuthStore();

  const [step, setStep] = useState<'role' | 'form' | 'location'>('role');
  const [selectedRole, setSelectedRole] = useState<ParentRole | null>(null);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const [country, setCountry] = useState('FR');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [savingLocation, setSavingLocation] = useState(false);

  useEffect(() => {
    if (user && step === 'role') {
      history.replace('/parent');
    }
  }, [user, step]);

  const roleData = PARENT_ROLES.find(r => r.value === selectedRole);
  const steps: Array<typeof step> = ['role', 'form', 'location'];
  const stepIndex = steps.indexOf(step);

  // ── Email confirmation screen ──
  if (error === 'CONFIRM_EMAIL') {
    return (
      <IonPage><IonContent fullscreen>
        <div style={{
          height: '100%', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '40px 32px', background: 'var(--dc-bg)', textAlign: 'center',
        }}>
          <div style={{
            width: 72, height: 72, borderRadius: 22,
            background: 'rgba(108,92,231,0.1)',
            border: '1.5px solid rgba(108,92,231,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24,
          }}>
            <Mail size={32} color="var(--dc-primary)" strokeWidth={1.5} />
          </div>
          <h2 style={{ color: 'var(--dc-text)', fontSize: 24, fontWeight: 900, margin: '0 0 12px' }}>
            Vérifiez votre email
          </h2>
          <p style={{ color: 'var(--dc-text-light)', fontSize: 15, lineHeight: 1.6, maxWidth: 280 }}>
            Un lien de confirmation a été envoyé à <strong style={{ color: 'var(--dc-text)' }}>{email}</strong>
          </p>
          <button className="dc-btn dc-btn-primary dc-btn-full dc-btn-lg"
            style={{ marginTop: 36, maxWidth: 300 }}
            onClick={() => { clearError(); history.replace('/login'); }}>
            Retour à la connexion
          </button>
        </div>
      </IonContent></IonPage>
    );
  }

  const inputStyle = (hasError = false): React.CSSProperties => ({
    width: '100%', padding: '14px 16px', borderRadius: 14, fontSize: 15,
    border: `2px solid ${hasError ? 'var(--dc-danger)' : 'var(--dc-border)'}`,
    background: 'var(--dc-bg)', outline: 'none', boxSizing: 'border-box',
    fontFamily: 'inherit', color: 'var(--dc-text)',
    transition: 'border-color 0.15s',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!fullName.trim() || fullName.trim().length < 2) { setFormError('Prénom requis (min 2 caractères)'); return; }
    if (!email.includes('@')) { setFormError('Email invalide'); return; }
    if (password.length < 6) { setFormError('Mot de passe minimum 6 caractères'); return; }
    if (password !== confirmPassword) { setFormError('Les mots de passe ne correspondent pas'); return; }

    try {
      await signUp(email, password, fullName);
      if (useAuthStore.getState().error !== 'CONFIRM_EMAIL') {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user && selectedRole) {
          await supabase.from('profiles').update({ parent_role: selectedRole }).eq('id', session.user.id);
        }
        setStep('location');
      }
    } catch { /* shown above */ }
  };

  return (
    <IonPage>
      <IonContent fullscreen scrollY>
        <style>{`
          .rp-input:focus { border-color: var(--dc-primary) !important; background: white !important; }
        `}</style>

        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          background: 'var(--dc-bg)',
        }}>
          {/* ── Header ── */}
          <div style={{
            padding: 'calc(env(safe-area-inset-top) + 20px) 24px 28px',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            position: 'relative', overflow: 'hidden',
          }}>
            {/* Decorative orb */}
            <div style={{
              position: 'absolute', top: -40, left: '50%', transform: 'translateX(-50%)',
              width: 220, height: 220, borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(108,92,231,0.1) 0%, transparent 60%)',
              pointerEvents: 'none',
            }} />

            {/* Logo */}
            <div style={{
              width: 52, height: 52, borderRadius: 16,
              background: 'linear-gradient(135deg, #6C5CE7, #A29BFE)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 6px 24px rgba(108,92,231,0.25)',
              marginBottom: 14, zIndex: 1,
            }}>
              <span style={{ fontSize: 24, fontWeight: 900, color: 'white', letterSpacing: -1 }}>D</span>
            </div>
            <h1 style={{ color: 'var(--dc-text)', fontSize: 22, fontWeight: 900, margin: '0 0 16px', zIndex: 1 }}>
              {step === 'role' ? 'Créer un compte' : step === 'form' ? 'Vos informations' : 'Votre localisation'}
            </h1>

            {/* Step dots */}
            <div style={{ display: 'flex', gap: 5, zIndex: 1 }}>
              {steps.map((s, i) => (
                <div key={s} style={{
                  height: 4, borderRadius: 2, transition: 'all 0.3s ease',
                  width: i === stepIndex ? 28 : 8,
                  background: i <= stepIndex
                    ? 'linear-gradient(90deg, #6C5CE7, #A29BFE)'
                    : 'var(--dc-border)',
                }} />
              ))}
            </div>
          </div>

          {/* ── White card ── */}
          <div className="dc-animate-in" key={step} style={{
            flex: 1, background: 'white', borderRadius: '28px 28px 0 0',
            padding: '24px 24px 48px',
            boxShadow: '0 -4px 20px rgba(0,0,0,0.04)',
          }}>

            {/* ── STEP 1: Role ── */}
            {step === 'role' && (
              <>
                <p style={{ fontSize: 14, color: 'var(--dc-text-light)', marginBottom: 20 }}>Vous êtes...</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 28 }}>
                  {PARENT_ROLES.map(({ value, label, Icon, color }) => {
                    const active = selectedRole === value;
                    return (
                      <button key={value} onClick={() => setSelectedRole(value)} style={{
                        padding: '24px 12px', borderRadius: 20, cursor: 'pointer',
                        border: `2px solid ${active ? color : 'var(--dc-border)'}`,
                        background: active ? `${color}10` : 'white',
                        textAlign: 'center', transition: 'all 0.2s',
                        transform: active ? 'scale(1.02)' : 'scale(1)',
                        boxShadow: active ? `0 4px 16px ${color}20` : 'var(--dc-shadow)',
                      }}>
                        <div style={{
                          width: 48, height: 48, borderRadius: 14, margin: '0 auto 10px',
                          background: active ? `${color}15` : 'var(--dc-bg)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Icon size={22} color={active ? color : 'var(--dc-text-muted)'} strokeWidth={1.8} />
                        </div>
                        <div style={{ fontWeight: 800, fontSize: 14, color: active ? color : 'var(--dc-text)' }}>
                          {label}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <button className="dc-btn dc-btn-primary dc-btn-full dc-btn-lg"
                  disabled={!selectedRole}
                  style={{ opacity: selectedRole ? 1 : 0.4 }}
                  onClick={() => setStep('form')}>
                  Continuer
                </button>
                <p style={{ textAlign: 'center', marginTop: 20, fontSize: 14, color: 'var(--dc-text-light)' }}>
                  Déjà un compte ?{' '}
                  <button onClick={() => history.push('/login')}
                    style={{ background: 'none', border: 'none', color: 'var(--dc-primary)', fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                    Se connecter
                  </button>
                </p>
              </>
            )}

            {/* ── STEP 2: Form ── */}
            {step === 'form' && (
              <>
                {/* Role badge + back */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
                  <button onClick={() => setStep('role')} style={{
                    background: 'none', border: 'none', color: 'var(--dc-primary)',
                    fontSize: 14, fontWeight: 700, cursor: 'pointer', padding: 0,
                  }}>← Retour</button>
                  {roleData && (
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '5px 12px', borderRadius: 50,
                      background: `${roleData.color}12`, marginLeft: 'auto',
                    }}>
                      <roleData.Icon size={13} color={roleData.color} strokeWidth={2} />
                      <span style={{ fontWeight: 700, fontSize: 13, color: roleData.color }}>{roleData.label}</span>
                    </div>
                  )}
                </div>

                {(error || formError) && (
                  <div onClick={clearError} style={{
                    background: 'var(--dc-danger-light)', color: 'var(--dc-danger)',
                    padding: '12px 16px', borderRadius: 14, marginBottom: 16,
                    fontSize: 14, cursor: 'pointer', fontWeight: 600,
                    borderLeft: '3px solid var(--dc-danger)',
                  }}>
                    {formError || error}
                  </div>
                )}

                <form onSubmit={handleSubmit}>
                  {[
                    { label: 'Votre prénom', type: 'text', value: fullName, onChange: setFullName, placeholder: 'Marie Dupont' },
                    { label: 'Email', type: 'email', value: email, onChange: setEmail, placeholder: 'parent@email.com' },
                  ].map(f => (
                    <div key={f.label} style={{ marginBottom: 16 }}>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6, color: 'var(--dc-text)' }}>{f.label}</label>
                      <input className="rp-input" type={f.type} value={f.value}
                        onChange={e => f.onChange(e.target.value)} placeholder={f.placeholder} style={inputStyle()} />
                    </div>
                  ))}

                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6, color: 'var(--dc-text)' }}>Mot de passe</label>
                    <input className="rp-input" type="password" value={password}
                      onChange={e => setPassword(e.target.value)} placeholder="••••••••" style={inputStyle()} />
                  </div>

                  <div style={{ marginBottom: 28 }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6, color: 'var(--dc-text)' }}>Confirmer</label>
                    <input className="rp-input" type="password" value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)} placeholder="••••••••"
                      style={inputStyle(!!confirmPassword && confirmPassword !== password)} />
                    {confirmPassword && confirmPassword !== password && (
                      <p style={{ color: 'var(--dc-danger)', fontSize: 12, marginTop: 4, fontWeight: 600 }}>Les mots de passe ne correspondent pas</p>
                    )}
                  </div>

                  <button type="submit" className="dc-btn dc-btn-primary dc-btn-full dc-btn-lg" disabled={isLoading}>
                    {isLoading ? 'Création...' : 'Créer mon compte'}
                  </button>
                </form>
              </>
            )}

            {/* ── STEP 3: Location ── */}
            {step === 'location' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 14,
                    background: 'rgba(108,92,231,0.08)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <MapPin size={20} color="var(--dc-primary)" strokeWidth={1.8} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--dc-text)' }}>Votre localisation</div>
                    <div style={{ fontSize: 12, color: 'var(--dc-text-light)' }}>Pour des activités et partenaires près de chez vous</div>
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6, color: 'var(--dc-text)' }}>Pays</label>
                  <select value={country} onChange={e => setCountry(e.target.value)} style={{
                    ...inputStyle(), appearance: 'none', backgroundImage: 'none',
                  } as React.CSSProperties}>
                    <option value="FR">France</option>
                    <option value="BE">Belgique</option>
                    <option value="CH">Suisse</option>
                    <option value="CA">Canada</option>
                    <option value="LU">Luxembourg</option>
                    <option value="MA">Maroc</option>
                    <option value="SN">Sénégal</option>
                    <option value="CI">Côte d'Ivoire</option>
                    <option value="DZ">Algérie</option>
                    <option value="TN">Tunisie</option>
                    <option value="OTHER">Autre</option>
                  </select>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6, color: 'var(--dc-text)' }}>Ville</label>
                  <input className="rp-input" value={city} onChange={e => setCity(e.target.value)}
                    placeholder="Paris, Lyon, Bruxelles..." style={inputStyle()} />
                </div>

                <div style={{ marginBottom: 32 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6, color: 'var(--dc-text)' }}>
                    Code postal <span style={{ fontWeight: 400, color: 'var(--dc-text-muted)' }}>(optionnel)</span>
                  </label>
                  <input className="rp-input" value={postalCode} onChange={e => setPostalCode(e.target.value)}
                    placeholder="75001" inputMode="numeric" style={inputStyle()} />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button className="dc-btn dc-btn-primary dc-btn-full dc-btn-lg"
                    disabled={savingLocation}
                    onClick={async () => {
                      setSavingLocation(true);
                      try {
                        const { data: { session } } = await supabase.auth.getSession();
                        if (session?.user) {
                          await supabase.from('profiles').update({
                            country, city: city.trim() || null, postal_code: postalCode.trim() || null,
                          }).eq('id', session.user.id);
                        }
                      } catch { /* silent */ }
                      setSavingLocation(false);
                      history.replace('/parent');
                    }}>
                    {savingLocation ? 'Sauvegarde...' : 'Enregistrer'}
                  </button>
                  <button className="dc-btn dc-btn-outline dc-btn-full"
                    style={{ height: 52, borderRadius: 50 }}
                    onClick={() => history.replace('/parent')}>
                    Passer pour l'instant
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default RegisterPage;

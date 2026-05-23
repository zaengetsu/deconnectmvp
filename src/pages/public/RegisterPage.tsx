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

const sharedStyles = `
  @keyframes rp-in { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
  .rp-card { animation: rp-in 0.4s ease both; }
  .rp-input { width:100%; padding:14px 16px; border-radius:12px; font-size:15px;
    border:1.5px solid #e5e5e7; background:#fafafa; outline:none;
    box-sizing:border-box; font-family:inherit; color:#1d1d1f;
    transition:border-color 0.15s; }
  .rp-input:focus { border-color:#6C5CE7 !important; background:white !important; }
  .rp-btn-primary { width:100%; padding:15px; border-radius:12px; border:none;
    font-size:16px; font-weight:700; cursor:pointer; letter-spacing:-0.2px;
    background:linear-gradient(135deg,#6C5CE7,#A29BFE); color:white;
    transition:opacity 0.15s,transform 0.15s; }
  .rp-btn-primary:active { transform:scale(0.98); }
  .rp-btn-primary:disabled { opacity:0.55; cursor:not-allowed; }
  .rp-btn-ghost { width:100%; padding:13px; border-radius:12px;
    font-size:15px; font-weight:500; cursor:pointer;
    background:none; border:1.5px solid #e5e5e7; color:#6e6e73;
    transition:border-color 0.15s; }
  .rp-step-dot { width:8px; height:8px; border-radius:50%; transition:all 0.3s ease; }
`;

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

  // Redirect already-logged-in users away from register
  // Only on 'role' step — avoids fighting with the post-signup location step
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
        <style>{sharedStyles}</style>
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#0f0e17' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 32px', textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: 18, background: 'rgba(108,92,231,0.15)', border: '1px solid rgba(108,92,231,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
              <Mail size={28} color="#A29BFE" strokeWidth={1.5} />
            </div>
            <h2 style={{ color: 'white', fontSize: 22, fontWeight: 800, margin: '0 0 12px' }}>Vérifiez votre email</h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 15, lineHeight: 1.6, maxWidth: 280 }}>
              Un lien de confirmation a été envoyé à <strong style={{ color: 'rgba(255,255,255,0.8)' }}>{email}</strong>
            </p>
            <button className="rp-btn-primary" style={{ marginTop: 36, maxWidth: 280 }}
              onClick={() => { clearError(); history.replace('/login'); }}>
              Retour à la connexion
            </button>
          </div>
        </div>
      </IonContent></IonPage>
    );
  }

  const inp = (hasError = false): React.CSSProperties => ({
    width: '100%', padding: '14px 16px', borderRadius: 12, fontSize: 15,
    border: `1.5px solid ${hasError ? '#DC2626' : '#e5e5e7'}`,
    background: '#fafafa', outline: 'none', boxSizing: 'border-box',
    fontFamily: 'inherit', color: '#1d1d1f',
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
      <IonContent fullscreen scrollY={false}>
        <style>{sharedStyles}</style>
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>

          {/* Dark header — consistent across steps */}
          <div style={{
            background: '#0f0e17', padding: '52px 24px 36px',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', top: -40, left: '50%', transform: 'translateX(-50%)',
              width: 200, height: 200, borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(108,92,231,0.2) 0%, transparent 65%)',
              pointerEvents: 'none',
            }} />
            {/* Logo */}
            <div style={{
              width: 48, height: 48, borderRadius: 14,
              background: 'linear-gradient(135deg, #6C5CE7, #A29BFE)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 24px rgba(108,92,231,0.35)',
              marginBottom: 14, zIndex: 1,
            }}>
              <span style={{ fontSize: 22, fontWeight: 900, color: 'white', letterSpacing: -1 }}>D</span>
            </div>
            <h1 style={{ color: 'white', fontSize: 20, fontWeight: 800, margin: '0 0 16px', zIndex: 1 }}>
              {step === 'role' ? 'Créer un compte' : step === 'form' ? 'Vos informations' : 'Votre localisation'}
            </h1>
            {/* Step dots */}
            <div style={{ display: 'flex', gap: 6, zIndex: 1 }}>
              {steps.map((s, i) => (
                <div key={s} className="rp-step-dot" style={{
                  width: i === stepIndex ? 20 : 8,
                  background: i <= stepIndex ? 'white' : 'rgba(255,255,255,0.2)',
                }} />
              ))}
            </div>
          </div>

          {/* White card */}
          <div className="rp-card" key={step} style={{
            flex: 1, background: 'white', borderRadius: '24px 24px 0 0',
            padding: '28px 24px 48px', marginTop: -16, overflow: 'auto',
          }}>

            {/* ── STEP 1: Role ── */}
            {step === 'role' && (
              <>
                <p style={{ fontSize: 13, color: '#6e6e73', marginBottom: 20 }}>Vous êtes...</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 28 }}>
                  {PARENT_ROLES.map(({ value, label, Icon, color }) => {
                    const active = selectedRole === value;
                    return (
                      <button key={value} onClick={() => setSelectedRole(value)} style={{
                        padding: '24px 12px', borderRadius: 16, cursor: 'pointer',
                        border: `2px solid ${active ? color : '#e5e5e7'}`,
                        background: active ? `${color}10` : 'white',
                        textAlign: 'center', transition: 'all 0.2s',
                        transform: active ? 'scale(1.03)' : 'scale(1)',
                        boxShadow: active ? `0 4px 16px ${color}25` : '0 1px 4px rgba(0,0,0,0.05)',
                      }}>
                        <div style={{
                          width: 44, height: 44, borderRadius: 12, margin: '0 auto 10px',
                          background: active ? `${color}18` : '#f5f5f7',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Icon size={20} color={active ? color : '#94a3b8'} strokeWidth={1.8} />
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: active ? color : '#1d1d1f' }}>
                          {label}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <button className="rp-btn-primary" disabled={!selectedRole}
                  style={{ opacity: selectedRole ? 1 : 0.4 }}
                  onClick={() => setStep('form')}>
                  Continuer
                </button>
                <p style={{ textAlign: 'center', marginTop: 20, fontSize: 14, color: '#6e6e73' }}>
                  Déjà un compte ?{' '}
                  <button onClick={() => history.push('/login')}
                    style={{ background: 'none', border: 'none', color: '#6C5CE7', fontWeight: 700, cursor: 'pointer', padding: 0 }}>
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
                    background: 'none', border: 'none', color: '#6C5CE7',
                    fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: 0,
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
                    background: '#FEF2F2', color: '#DC2626', padding: '12px 16px',
                    borderRadius: 10, marginBottom: 16, fontSize: 14, cursor: 'pointer',
                    borderLeft: '3px solid #DC2626',
                  }}>
                    {formError || error}
                  </div>
                )}

                <form onSubmit={handleSubmit}>
                  {[
                    { label: 'Votre prénom', type: 'text', value: fullName, onChange: setFullName, placeholder: 'Marie Dupont', hasError: false },
                    { label: 'Email', type: 'email', value: email, onChange: setEmail, placeholder: 'parent@email.com', hasError: false },
                  ].map(f => (
                    <div key={f.label} style={{ marginBottom: 16 }}>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#3d3d3f' }}>{f.label}</label>
                      <input className="rp-input" type={f.type} value={f.value}
                        onChange={e => f.onChange(e.target.value)} placeholder={f.placeholder} style={inp()} />
                    </div>
                  ))}

                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#3d3d3f' }}>Mot de passe</label>
                    <input className="rp-input" type="password" value={password}
                      onChange={e => setPassword(e.target.value)} placeholder="••••••••" style={inp()} />
                  </div>

                  <div style={{ marginBottom: 28 }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#3d3d3f' }}>Confirmer</label>
                    <input className="rp-input" type="password" value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)} placeholder="••••••••"
                      style={inp(!!confirmPassword && confirmPassword !== password)} />
                    {confirmPassword && confirmPassword !== password && (
                      <p style={{ color: '#DC2626', fontSize: 12, marginTop: 4 }}>Les mots de passe ne correspondent pas</p>
                    )}
                  </div>

                  <button type="submit" className="rp-btn-primary" disabled={isLoading}>
                    {isLoading ? 'Création...' : 'Créer mon compte'}
                  </button>
                </form>
              </>
            )}

            {/* ── STEP 3: Location ── */}
            {step === 'location' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(108,92,231,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <MapPin size={18} color="#6C5CE7" strokeWidth={1.8} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>Votre localisation</div>
                    <div style={{ fontSize: 12, color: '#6e6e73' }}>Pour des activités et partenaires près de chez vous</div>
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#3d3d3f' }}>Pays</label>
                  <select value={country} onChange={e => setCountry(e.target.value)} style={{
                    ...inp(), appearance: 'none', backgroundImage: 'none',
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
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#3d3d3f' }}>Ville</label>
                  <input className="rp-input" value={city} onChange={e => setCity(e.target.value)}
                    placeholder="Paris, Lyon, Bruxelles..." style={inp()} />
                </div>

                <div style={{ marginBottom: 32 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#3d3d3f' }}>
                    Code postal <span style={{ fontWeight: 400, color: '#aeaeb2' }}>(optionnel)</span>
                  </label>
                  <input className="rp-input" value={postalCode} onChange={e => setPostalCode(e.target.value)}
                    placeholder="75001" inputMode="numeric" style={inp()} />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button className="rp-btn-primary" disabled={savingLocation}
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
                  <button className="rp-btn-ghost" onClick={() => history.replace('/parent')}>
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

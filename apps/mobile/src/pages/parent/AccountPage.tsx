import { useRkBack } from '../../hooks/useRkBack';
import React, { useState } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/auth.store';
import { emailService } from '../../features/notifications/email.service';

/**
 * Mon compte — nom affiché, adresse email, mot de passe.
 * Style des formulaires de la maquette Rekonect (champs 52px, rayon 14).
 */

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const strongEnough = (v: string) => v.length >= 8 && /[A-Z]/.test(v) && /\d/.test(v);

const AccountPage: React.FC = () => {
  const history = useHistory();
  const back = useRkBack('/parent/settings');
  const { user, profile, updateProfile } = useAuthStore();

  // Brouillons : tant que l'utilisateur n'a rien tapé, on affiche la valeur
  // du profil (qui peut arriver après le premier rendu).
  const [nameDraft, setName] = useState<string | null>(null);
  const [emailDraft, setEmail] = useState<string | null>(null);
  const name = nameDraft ?? profile?.full_name ?? '';
  const email = emailDraft ?? user?.email ?? profile?.email ?? '';
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [busy, setBusy] = useState<'name' | 'email' | 'password' | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const say = (kind: 'ok' | 'err', text: string) => {
    setNotice({ kind, text });
    window.setTimeout(() => setNotice(null), 5000);
  };

  const saveName = async () => {
    const v = name.trim();
    if (v.length < 2) return say('err', 'Le nom doit contenir au moins 2 caractères.');
    setBusy('name');
    try { await updateProfile({ full_name: v }); setName(null); say('ok', 'Nom mis à jour.'); }
    catch (e) { say('err', (e as Error).message || 'Impossible de mettre à jour le nom.'); }
    finally { setBusy(null); }
  };

  const saveEmail = async () => {
    const v = email.trim().toLowerCase();
    if (!isEmail(v)) return say('err', 'Adresse email invalide.');
    if (v === (user?.email ?? '').toLowerCase()) return say('err', 'C’est déjà votre adresse actuelle.');
    setBusy('email');
    try {
      const { error } = await supabase.auth.updateUser({ email: v });
      if (error) throw error;
      // L'adresse ne change qu'après confirmation : profiles.email est
      // resynchronisé à la prochaine connexion (auth.store).
      say('ok', `Un email de confirmation a été envoyé à ${v}. L’adresse changera une fois confirmée.`);
    } catch (e) {
      say('err', (e as Error).message || 'Impossible de changer l’adresse.');
    } finally { setBusy(null); }
  };

  const savePassword = async () => {
    if (!user?.email) return;
    if (!currentPwd) return say('err', 'Saisissez votre mot de passe actuel.');
    if (!strongEnough(newPwd)) return say('err', '8 caractères minimum, une majuscule et un chiffre.');
    setBusy('password');
    try {
      // On revérifie le mot de passe actuel avant de le remplacer.
      const { error: authErr } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPwd });
      if (authErr) throw new Error('Mot de passe actuel incorrect.');
      const { error } = await supabase.auth.updateUser({ password: newPwd });
      if (error) throw error;
      setCurrentPwd(''); setNewPwd('');
      say('ok', 'Mot de passe modifié.');
      emailService.sendPasswordChanged(user.email, profile?.full_name ?? '').catch(() => {});
    } catch (e) {
      say('err', (e as Error).message || 'Impossible de changer le mot de passe.');
    } finally { setBusy(null); }
  };

  const label: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--rk-text2)', marginBottom: 7 };
  const field = (filled: boolean): React.CSSProperties => ({
    width: '100%', height: 52, borderRadius: 14,
    border: `1.5px solid ${filled ? 'var(--rk-accent)' : 'var(--rk-border)'}`,
    background: 'var(--rk-surface)', padding: '0 15px',
    fontSize: 15, fontWeight: 600, fontFamily: 'inherit', color: 'var(--rk-text)',
  });
  const card: React.CSSProperties = {
    background: 'var(--rk-surface)', border: '1px solid var(--rk-border)',
    borderRadius: 20, padding: 16, marginBottom: 18,
  };
  const eyebrow: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, letterSpacing: '.12em', color: 'var(--rk-text3)', margin: '0 0 12px',
  };
  const cta = (active: boolean): React.CSSProperties => ({
    width: '100%', height: 48, borderRadius: 999, marginTop: 12,
    background: active ? 'var(--rk-indigo)' : 'var(--rk-surface2)',
    color: active ? 'var(--rk-indigofg)' : 'var(--rk-text3)',
    fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
  });

  const nameChanged = name.trim() !== (profile?.full_name ?? '') && name.trim().length >= 2;
  const emailChanged = isEmail(email.trim()) && email.trim().toLowerCase() !== (user?.email ?? '').toLowerCase();
  const pwdReady = !!currentPwd && strongEnough(newPwd);

  return (
    <IonPage><IonContent fullscreen>
      <div className="rk-app rk-screen" style={{ minHeight: '100%', background: 'var(--rk-bg)' }}>
        <div style={{
          padding: 'calc(env(safe-area-inset-top) + 16px) 22px 20px',
          background: 'var(--rk-surface)', borderBottom: '1px solid var(--rk-border)',
        }}>
          <button onClick={() => back()} style={{ fontSize: 13, fontWeight: 600, color: 'var(--rk-text3)', marginBottom: 12 }}>
            ← Réglages
          </button>
          <h1 style={{ fontSize: 27, fontWeight: 800, letterSpacing: '-.03em', margin: 0, color: 'var(--rk-text)' }}>Mon compte</h1>
          <p style={{ fontSize: 13, color: 'var(--rk-text3)', margin: '5px 0 0' }}>Nom, adresse email et mot de passe</p>
        </div>

        <div style={{ padding: '18px 22px 140px' }}>
          <div style={eyebrow}>PROFIL</div>
          <div style={card}>
            <div style={label}>Prénom et nom</div>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Marie Dupont"
              autoComplete="name" style={field(!!name)} />
            <button onClick={saveName} disabled={!nameChanged || busy === 'name'} style={cta(nameChanged)}>
              {busy === 'name' ? 'Enregistrement…' : 'Enregistrer le nom'}
            </button>
          </div>

          <div style={eyebrow}>ADRESSE EMAIL</div>
          <div style={card}>
            <div style={label}>Email</div>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="vous@email.com"
              autoComplete="email" autoCapitalize="none" style={field(!!email)} />
            <div style={{ fontSize: 11, color: 'var(--rk-text3)', marginTop: 7, lineHeight: 1.5 }}>
              Un lien de confirmation vous sera envoyé. Votre adresse actuelle reste active jusqu’à la confirmation.
            </div>
            <button onClick={saveEmail} disabled={!emailChanged || busy === 'email'} style={cta(emailChanged)}>
              {busy === 'email' ? 'Envoi…' : 'Changer l’adresse'}
            </button>
          </div>

          <div style={eyebrow}>MOT DE PASSE</div>
          <div style={card}>
            <div style={label}>Mot de passe actuel</div>
            <input type="password" value={currentPwd} onChange={e => setCurrentPwd(e.target.value)} placeholder="••••••••"
              autoComplete="current-password" style={{ ...field(!!currentPwd), marginBottom: 14 }} />
            <div style={label}>Nouveau mot de passe</div>
            <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="••••••••"
              autoComplete="new-password" style={field(!!newPwd)} />
            <div style={{ fontSize: 11, color: 'var(--rk-text3)', marginTop: 7 }}>8 caractères minimum, une majuscule, un chiffre</div>
            <button onClick={savePassword} disabled={!pwdReady || busy === 'password'} style={cta(pwdReady)}>
              {busy === 'password' ? 'Modification…' : 'Changer le mot de passe'}
            </button>
          </div>

          <button onClick={() => history.push('/forgot-password')} style={{
            width: '100%', textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'var(--rk-text3)', padding: 8,
          }}>
            Mot de passe oublié ? Recevoir un lien de réinitialisation
          </button>
        </div>

        {notice && (
          <div role="status" style={{
            position: 'fixed', left: 16, right: 16, bottom: 'calc(var(--rk-tabbar-h) + 12px)', zIndex: 50,
            background: notice.kind === 'ok' ? 'var(--rk-sage)' : 'var(--rk-text)',
            color: notice.kind === 'ok' ? '#fff' : 'var(--rk-bg)',
            borderRadius: 16, padding: '12px 16px', fontSize: 13, fontWeight: 600, lineHeight: 1.45,
            boxShadow: '0 10px 30px rgba(22,24,43,.25)',
          }}>
            {notice.text}
          </div>
        )}
      </div>
    </IonContent></IonPage>
  );
};

export default AccountPage;

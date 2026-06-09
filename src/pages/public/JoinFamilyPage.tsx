import React, { useEffect, useState } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { useHistory, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/auth.store';
import { CheckCircle, Users, AlertCircle, ArrowRight } from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  co_parent:   'Co-parent',
  educator:    'Éducateur·rice',
  grandparent: 'Grand-parent',
  babysitter:  'Baby-sitter',
};

const JoinFamilyPage: React.FC = () => {
  const history = useHistory();
  const location = useLocation();
  const { user, isInitialized } = useAuthStore();

  // Token from URL param or manual entry
  const urlParams = new URLSearchParams(location.search);
  const urlToken = urlParams.get('token') || '';

  const [code, setCode]           = useState(urlToken);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [success, setSuccess]     = useState<{ ownerName: string; role: string } | null>(null);

  // If URL has a token and user is logged in → auto-submit
  useEffect(() => {
    if (urlToken && isInitialized && user) {
      handleAccept(urlToken);
    }
  }, [urlToken, isInitialized, user]);

  const handleAccept = async (tokenToUse = code) => {
    const trimmed = tokenToUse.trim().toUpperCase();
    if (!trimmed) { setError('Veuillez entrer un code d\'invitation'); return; }

    if (!user) {
      // Save token in sessionStorage so we can pick it up after login
      sessionStorage.setItem('pendingInviteToken', trimmed);
      history.push(`/login?redirect=/join-family?token=${trimmed}`);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc('accept_family_invitation', {
        p_token: trimmed,
      });

      if (rpcErr) throw rpcErr;

      const result = typeof data === 'string' ? JSON.parse(data) : data;
      if (!result.success) throw new Error(result.error || 'Code invalide ou expiré');

      setSuccess({
        ownerName: result.owner_name || 'un parent',
        role: ROLE_LABELS[result.your_role] || result.your_role,
      });
    } catch (e: any) {
      setError(e?.message || 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  const inp: React.CSSProperties = {
    width: '100%', padding: '16px', borderRadius: 14,
    border: '2px solid #e5e5e7', fontSize: 22, fontWeight: 700,
    textAlign: 'center', letterSpacing: 6, textTransform: 'uppercase',
    background: 'white', outline: 'none', boxSizing: 'border-box',
    fontFamily: 'monospace', color: '#1d1d1f',
  };

  return (
    <IonPage>
      <IonContent fullscreen>
        <div style={{ minHeight: '100vh', background: 'var(--dc-bg)', display: 'flex', flexDirection: 'column' }}>

          {/* Header */}
          <div style={{
            background: 'linear-gradient(135deg, var(--dc-blue) 0%, var(--dc-blue-mid) 100%)',
            padding: '60px 24px 40px', color: 'white', textAlign: 'center',
          }}>
            <div style={{
              width: 72, height: 72, borderRadius: 24,
              background: 'rgba(255,255,255,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px',
            }}>
              <Users size={36} strokeWidth={1.8} color="white" />
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 900, margin: '0 0 8px' }}>Rejoindre une famille</h1>
            <p style={{ opacity: 0.85, fontSize: 14, margin: 0 }}>
              Entrez le code reçu par email pour accepter l'invitation
            </p>
          </div>

          <div style={{ flex: 1, padding: '32px 24px 60px' }}>
            {success ? (
              /* ── Success state ── */
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  width: 80, height: 80, borderRadius: 28,
                  background: 'var(--dc-green-light)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 20px',
                }}>
                  <CheckCircle size={40} color="var(--dc-green)" strokeWidth={1.8} />
                </div>
                <h2 style={{ fontSize: 22, fontWeight: 900, marginBottom: 12 }}>Bienvenue dans la famille !</h2>
                <p style={{ color: 'var(--dc-text-light)', fontSize: 15, lineHeight: 1.6, marginBottom: 32 }}>
                  Vous avez rejoint la famille de <strong>{success.ownerName}</strong> en tant que{' '}
                  <strong>{success.role}</strong>.
                </p>

                <div style={{
                  background: 'white', borderRadius: 16, padding: '20px',
                  marginBottom: 24, border: '2px solid var(--dc-border)',
                }}>
                  <p style={{ fontSize: 14, color: 'var(--dc-text-light)', margin: '0 0 8px' }}>
                    Vous avez maintenant accès aux profils des enfants de cette famille.
                  </p>
                </div>

                <button
                  onClick={() => history.replace('/parent/dashboard')}
                  style={{
                    width: '100%', padding: '16px', borderRadius: 16,
                    fontSize: 16, fontWeight: 800, border: 'none', cursor: 'pointer',
                    background: 'var(--dc-primary)', color: 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  Accéder au tableau de bord <ArrowRight size={18} strokeWidth={2.5} />
                </button>
              </div>
            ) : (
              /* ── Code entry ── */
              <>
                <div style={{
                  background: 'white', borderRadius: 20, padding: '28px 24px',
                  boxShadow: '0 4px 24px rgba(0,0,0,0.06)', marginBottom: 20,
                }}>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--dc-text)' }}>
                    Code d'invitation
                  </label>
                  <input
                    style={inp}
                    value={code}
                    onChange={e => setCode(e.target.value.toUpperCase())}
                    placeholder="XXXXXXXX"
                    maxLength={40}
                    autoFocus={!urlToken}
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    onKeyDown={e => e.key === 'Enter' && handleAccept()}
                  />
                  <p style={{ fontSize: 12, color: 'var(--dc-text-muted)', marginTop: 10, textAlign: 'center' }}>
                    Le code se trouve dans l'email d'invitation que vous avez reçu
                  </p>
                </div>

                {error && (
                  <div style={{
                    background: '#FEE2E2', color: '#DC2626', padding: '12px 16px',
                    borderRadius: 12, marginBottom: 20, fontSize: 14,
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <AlertCircle size={16} strokeWidth={2} style={{ flexShrink: 0 }} />
                    {error}
                  </div>
                )}

                <button
                  onClick={() => handleAccept()}
                  disabled={loading || !code.trim()}
                  style={{
                    width: '100%', padding: '16px', borderRadius: 16,
                    fontSize: 16, fontWeight: 800, border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                    background: loading || !code.trim() ? '#e5e5e7' : 'var(--dc-primary)',
                    color: loading || !code.trim() ? '#94a3b8' : 'white',
                    transition: 'all 0.15s',
                  }}
                >
                  {loading ? 'Vérification...' : 'Rejoindre la famille'}
                </button>

                {!user && (
                  <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--dc-text-muted)', marginTop: 16 }}>
                    Vous devrez vous connecter ou créer un compte pour accepter l'invitation.
                  </p>
                )}

                <button
                  onClick={() => history.goBack()}
                  style={{
                    width: '100%', padding: '14px', borderRadius: 16, marginTop: 12,
                    fontSize: 15, fontWeight: 600, border: '2px solid var(--dc-border)',
                    background: 'white', cursor: 'pointer', color: 'var(--dc-text)',
                  }}
                >
                  Retour
                </button>
              </>
            )}
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default JoinFamilyPage;

import React, { useEffect, useState } from 'react';
import { IonContent, IonPage } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/auth.store';
import { Users, Mail, QrCode, GraduationCap, HeartHandshake, Baby, ArrowLeft, CheckCircle, UserPlus } from 'lucide-react';

const MEMBER_ROLES = [
  { value: 'co_parent',   label: 'Co-parent',     Icon: Users },
  { value: 'educator',    label: 'Éducateur·rice', Icon: GraduationCap },
  { value: 'grandparent', label: 'Grand-parent',   Icon: HeartHandshake },
  { value: 'babysitter',  label: 'Baby-sitter',    Icon: Baby },
] as const;

type MemberRole = typeof MEMBER_ROLES[number]['value'];

interface FamilyMember {
  id: string;
  member_email: string;
  member_role: MemberRole;
  status: 'pending' | 'active' | 'revoked';
  joined_at: string | null;
}

const FamilyPage: React.FC = () => {
  const { user, profile } = useAuthStore();
  const history = useHistory();

  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(true);

  // Invite flow
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteMode, setInviteMode] = useState<'email' | 'qr'>('email');
  const [inviteRole, setInviteRole] = useState<MemberRole>('co_parent');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const loadMembers = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('family_members')
      .select('*')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false });
    setMembers((data || []) as FamilyMember[]);
    setLoading(false);
  };

  useEffect(() => { loadMembers(); }, [user]);

  const createInvite = async () => {
    setInviteLoading(true);
    setInviteError(null);
    try {
      if (inviteMode === 'email') {
        // Call Edge Function — it creates the token AND sends the email
        const { data: fnData, error: fnError } = await supabase.functions.invoke('send-family-invitation', {
          body: {
            invite_email: inviteEmail,
            member_role:  inviteRole,
            inviter_name: profile?.full_name || user?.email || 'Un parent',
          },
        });

        if (fnError) throw fnError;
        if (fnData?.error) throw new Error(fnData.error);

        setInviteToken(fnData.token);
        setInviteSuccess(true);
      } else {
        // QR mode — create token via RPC, no email sent
        const { data, error } = await supabase.rpc('create_family_invitation', {
          p_member_role:  inviteRole,
          p_invite_email: null,
        });

        if (error) throw error;
        const result = typeof data === 'string' ? JSON.parse(data) : data;
        setInviteToken(result.token);
      }
    } catch (e: any) {
      // Friendly error messages
      const msg = e?.message || 'Une erreur est survenue';
      if (msg.includes('Brevo')) {
        setInviteError('Erreur d\'envoi email. Vérifiez votre clé Brevo dans les secrets Supabase.');
      } else {
        setInviteError(msg);
      }
    } finally {
      setInviteLoading(false);
    }
  };

  const revokeAccess = async (memberId: string) => {
    await supabase.from('family_members').update({ status: 'revoked' }).eq('id', memberId);
    loadMembers();
  };

  const resetInvite = () => {
    setShowInviteModal(false);
    setInviteToken(null);
    setInviteSuccess(false);
    setInviteError(null);
    setInviteEmail('');
    setInviteRole('co_parent');
  };

  const deepLinkUrl = inviteToken
    ? `${window.location.origin}/join-family?token=${inviteToken}`
    : '';

  return (
    <IonPage>
      <IonContent fullscreen>
        <div style={{ minHeight: '100vh', background: 'var(--dc-bg)', paddingBottom: 100 }}>
        <div style={{ background: 'linear-gradient(135deg, var(--dc-blue) 0%, var(--dc-blue-mid) 100%)', padding: '56px 24px 28px', color: 'white', borderRadius: '0 0 28px 28px' }}>
            <button onClick={() => history.goBack()} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 10, padding: '8px 14px', color: 'white', fontSize: 14, cursor: 'pointer', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
              <ArrowLeft size={14} strokeWidth={2} /> Retour
            </button>
            <h1 style={{ fontSize: 24, fontWeight: 900, margin: '0 0 4px' }}>Ma famille</h1>
            <p style={{ opacity: 0.8, fontSize: 13, margin: 0 }}>Gérez les adultes qui ont accès aux profils de vos enfants</p>
          </div>

          <div style={{ padding: '20px' }}>
            {/* Invite button */}
            <button onClick={() => setShowInviteModal(true)} className="dc-btn dc-btn-primary dc-btn-full" style={{ marginBottom: 24, height: 52 }}>
              <UserPlus size={18} strokeWidth={2} /> Inviter un membre
            </button>

            {/* Members list */}
            {loading ? (
              <p style={{ textAlign: 'center', color: 'var(--dc-text-light)', padding: 40 }}>Chargement...</p>
            ) : members.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                <div style={{ width: 64, height: 64, borderRadius: 20, background: 'var(--dc-blue-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                  <Users size={30} color="var(--dc-blue)" strokeWidth={1.5} />
                </div>
                <h3 style={{ fontWeight: 800, marginBottom: 8 }}>Famille pour l'instant</h3>
                <p style={{ color: 'var(--dc-text-light)', fontSize: 14 }}>Invitez l'autre parent, un éducateur ou un grand-parent à rejoindre la famille.</p>
              </div>
            ) : (
              <>
                <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>Membres ({members.length})</h3>
                {members.map(m => {
                  const roleInfo = MEMBER_ROLES.find(r => r.value === m.member_role);
                  return (
                    <div key={m.id} style={{
                      background: 'white', borderRadius: 16, padding: '14px 16px',
                      marginBottom: 10, display: 'flex', alignItems: 'center', gap: 14,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                      opacity: m.status === 'revoked' ? 0.5 : 1,
                    }}>
                      <div style={{ width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--dc-blue-light)', flexShrink: 0 }}>
                        {roleInfo && (() => { const I = roleInfo.Icon; return <I size={20} color="var(--dc-blue)" strokeWidth={1.8} />; })()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {m.member_email}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--dc-text-light)', marginTop: 2, display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span>{roleInfo?.label}</span>
                          <span style={{ padding: '2px 8px', borderRadius: 50, fontSize: 11, fontWeight: 700,
                            background: m.status === 'active' ? 'var(--dc-green-light)' : m.status === 'pending' ? 'var(--dc-gold-light)' : 'var(--dc-danger-light)',
                            color: m.status === 'active' ? 'var(--dc-green-dark)' : m.status === 'pending' ? 'var(--dc-gold-dark)' : 'var(--dc-danger)',
                          }}>
                            {m.status === 'active' ? 'Actif' : m.status === 'pending' ? 'En attente' : 'Révoqué'}
                          </span>
                        </div>
                      </div>
                      {m.status !== 'revoked' && (
                        <button
                          onClick={() => revokeAccess(m.id)}
                          style={{
                            background: 'rgba(255,107,107,0.1)', border: 'none', borderRadius: 10,
                            padding: '8px 12px', color: '#FF6B6B', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                          }}
                        >
                          Révoquer
                        </button>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>

        {/* ─── INVITE MODAL ─── */}
        {showInviteModal && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'flex-end',
          }} onClick={resetInvite}>
            <div onClick={e => e.stopPropagation()} style={{
              background: 'white', borderRadius: '24px 24px 0 0', padding: '24px 24px 48px',
              width: '100%', maxWidth: 600, margin: '0 auto',
            }}>
              <div style={{ width: 40, height: 4, background: 'var(--dc-border)', borderRadius: 4, margin: '0 auto 20px' }} />

              {!inviteToken ? (
                <>
                  <h2 style={{ fontSize: 20, fontWeight: 900, marginBottom: 20 }}>Inviter un membre</h2>

                  {/* Mode toggle */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                    {(['email', 'qr'] as const).map(m => (
                      <button key={m} onClick={() => setInviteMode(m)} style={{ flex: 1, padding: '10px', borderRadius: 12, fontSize: 14, fontWeight: 700, border: `2px solid ${inviteMode === m ? 'var(--dc-primary)' : 'var(--dc-border)'}`, background: inviteMode === m ? 'rgba(108,92,231,0.08)' : 'white', color: inviteMode === m ? 'var(--dc-primary)' : 'var(--dc-text)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        {m === 'email' ? <><Mail size={15} strokeWidth={2} /> Par email</> : <><QrCode size={15} strokeWidth={2} /> QR code</>}
                      </button>
                    ))}
                  </div>

                  {/* Role picker */}
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Rôle</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
                    {MEMBER_ROLES.map(r => (
                     <button key={r.value} onClick={() => setInviteRole(r.value)} style={{ padding: '10px 12px', borderRadius: 12, fontSize: 13, fontWeight: 700, border: `2px solid ${inviteRole === r.value ? 'var(--dc-primary)' : 'var(--dc-border)'}`, background: inviteRole === r.value ? 'rgba(108,92,231,0.08)' : 'white', color: inviteRole === r.value ? 'var(--dc-primary)' : 'var(--dc-text)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <r.Icon size={15} strokeWidth={2} /> {r.label}
                      </button>
                    ))}
                  </div>

                  {/* Email input */}
                  {inviteMode === 'email' && (
                    <div style={{ marginBottom: 20 }}>
                      <label style={{ display: 'block', fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Email</label>
                      <input
                        type="email"
                        value={inviteEmail}
                        onChange={e => setInviteEmail(e.target.value)}
                        placeholder="autre.parent@email.com"
                        style={{
                          width: '100%', padding: '14px', borderRadius: 12, fontSize: 15,
                          border: '2px solid var(--dc-border)', background: 'white',
                          outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--dc-font)',
                        }}
                        autoFocus
                      />
                    </div>
                  )}

                  {inviteError && (
                    <div style={{ background: '#FEE2E2', color: '#DC2626', padding: '10px 14px', borderRadius: 10, marginBottom: 16, fontSize: 13 }}>
                      {inviteError}
                    </div>
                  )}

                  <button
                    onClick={createInvite}
                    disabled={inviteLoading || (inviteMode === 'email' && !inviteEmail)}
                    style={{
                      width: '100%', padding: '16px', borderRadius: 16, fontSize: 16, fontWeight: 800,
                      border: 'none', cursor: 'pointer', background: 'var(--dc-primary)', color: 'white',
                      opacity: inviteLoading ? 0.7 : 1,
                    }}
                  >
                    {inviteLoading ? 'Génération...' : inviteMode === 'email' ? 'Envoyer l\'invitation' : 'Générer le QR code'}
                  </button>
                </>
              ) : (
                /* Show QR or success */
                <div style={{ textAlign: 'center' }}>
                  {inviteMode === 'qr' ? (
                    <>
                      <h2 style={{ fontSize: 20, fontWeight: 900, marginBottom: 4 }}>QR code d'invitation</h2>
                      <p style={{ color: 'var(--dc-text-light)', fontSize: 14, marginBottom: 24 }}>
                        Faites scanner ce code par l'autre parent — valable 7 jours
                      </p>
                      <div style={{ display: 'inline-block', padding: 20, borderRadius: 20, border: '3px solid var(--dc-primary)', background: 'white' }}>
                        <QRCodeSVG
                          value={JSON.stringify({ type: 'deconnect_family', token: inviteToken, inviter: profile?.full_name })}
                          size={200}
                          level="M"
                          fgColor="#2D3436"
                        />
                      </div>
                      <p style={{ marginTop: 16, fontSize: 12, color: 'var(--dc-text-muted)' }}>
                        Ou partagez ce lien : <br />
                        <span style={{ color: 'var(--dc-primary)', wordBreak: 'break-all' }}>{deepLinkUrl}</span>
                      </p>
                    </>
                  ) : (
                    <>
                      <div style={{ width: 56, height: 56, borderRadius: 18, background: 'var(--dc-green-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                        <CheckCircle size={28} color="var(--dc-green)" strokeWidth={1.8} />
                      </div>
                      <h2 style={{ fontWeight: 900 }}>Invitation envoyée !</h2>
                      <p style={{ color: 'var(--dc-text-light)', fontSize: 14 }}>
                        Un email a été envoyé à <strong>{inviteEmail}</strong>.
                        Le lien est valable 7 jours.
                      </p>
                    </>
                  )}
                  <button
                    onClick={resetInvite}
                    style={{
                      marginTop: 24, width: '100%', padding: '14px', borderRadius: 16, fontSize: 15, fontWeight: 700,
                      border: '2px solid var(--dc-border)', background: 'white', cursor: 'pointer',
                    }}
                  >
                    Fermer
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </IonContent>
    </IonPage>
  );
};

export default FamilyPage;

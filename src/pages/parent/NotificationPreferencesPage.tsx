import { moonOutline } from 'ionicons/icons';
import RkTile from '../../components/rk/RkTile';
import { useRkBack } from '../../hooks/useRkBack';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { IonContent, IonPage, useIonViewWillEnter } from '@ionic/react';
import { useAuthStore } from '../../stores/auth.store';
import {
  preferencesService,
  type NotificationPreferences,
  type PreferenceKey,
} from '../../features/notifications/preferences.service';

/**
 * Préférences de notifications (5.15).
 *
 * Deux niveaux : les canaux (push / email / in-app) d'abord, puis le détail
 * par catégorie. Couper un canal coupe tout ce qui passait par lui — c'est
 * volontairement le réglage le plus visible.
 */

const SECTIONS: { title: string; items: { key: PreferenceKey; label: string; hint?: string }[] }[] = [
  {
    title: 'Activités',
    items: [
      { key: 'activity_completed',  label: 'Activité terminée' },
      { key: 'activity_validation', label: 'Validation nécessaire', hint: 'Votre enfant attend votre validation' },
      { key: 'activity_planned',    label: 'Activité prévue' },
    ],
  },
  {
    title: 'Récompenses',
    items: [
      { key: 'reward_unlocked', label: 'Récompense débloquée' },
      { key: 'reward_pending',  label: 'Récompense en attente', hint: 'Rappel si elle n’a pas été remise' },
    ],
  },
  {
    title: 'Famille',
    items: [
      { key: 'family_activities',  label: 'Activités familiales' },
      { key: 'family_invitations', label: 'Invitations' },
    ],
  },
  {
    title: 'Progression',
    items: [
      { key: 'goals',          label: 'Objectifs' },
      { key: 'daily_summary',  label: 'Résumé quotidien', hint: 'En fin de journée, seulement s’il y a du nouveau' },
      { key: 'weekly_summary', label: 'Résumé hebdomadaire' },
    ],
  },
  {
    title: "Temps d'écran",
    items: [
      { key: 'screen_time_goal',    label: 'Objectif atteint' },
      { key: 'screen_time_summary', label: 'Résumé' },
    ],
  },
  {
    title: 'Communication',
    items: [
      { key: 'tips',         label: 'Conseils Deconnect' },
      { key: 'product_news', label: 'Nouveautés produit' },
    ],
  },
];

const CHANNELS: { key: PreferenceKey; label: string; hint: string }[] = [
  { key: 'push_enabled',   label: 'Push',   hint: 'Sur votre téléphone' },
  { key: 'in_app_enabled', label: 'In-app', hint: "Dans le centre de notifications" },
  { key: 'email_enabled',  label: 'Email',  hint: 'Réservé aux événements importants' },
];

const Toggle: React.FC<{ on: boolean; onChange: () => void; disabled?: boolean }> = ({ on, onChange, disabled }) => (
  <button
    role="switch"
    aria-checked={on}
    disabled={disabled}
    onClick={onChange}
    style={{
      width: 48, height: 28, flexShrink: 0, padding: 3,
      borderRadius: '999px', border: 'none',
      background: on ? 'var(--rk-indigo)' : 'var(--rk-track)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? .4 : 1,
      display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start',
      transition: 'background .18s',
    }}
  >
    <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#fff' }} />
  </button>
);

const NotificationPreferencesPage: React.FC = () => {
  const { user } = useAuthStore();
  const back = useRkBack('/parent/settings');
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const errorTimer = useRef<number | null>(null);

  // La ligne existe mais sans les colonnes v2 → la migration 025 n'est pas
  // appliquée côté Supabase. On le dit plutôt que de laisser des switches morts.
  const schemaOutdated = !!prefs && prefs.activity_completed === undefined;

  const userId = user?.id ?? null;
  const load = useCallback(() => {
    if (!userId) return;
    void (async () => {
      const next = await preferencesService.getParentPreferences(userId);
      setPrefs(next);
      setLoading(false);
    })();
  }, [userId]);

  useIonViewWillEnter(() => { load(); });
  // useIonViewWillEnter peut se déclencher avant que la session soit restaurée
  useEffect(() => { load(); }, [load]);

  const showError = (message: string) => {
    setError(message);
    if (errorTimer.current) window.clearTimeout(errorTimer.current);
    errorTimer.current = window.setTimeout(() => setError(null), 4000);
  };

  const describe = (e: unknown): string => {
    const err = e as { code?: string; message?: string } | undefined;
    if (err?.code === '42703' || err?.code === 'PGRST204' || /column|schema cache/i.test(err?.message ?? '')) {
      return 'Le serveur n’a pas encore la migration 025 (préférences v2).';
    }
    if (err?.code === '42501' || /row-level security/i.test(err?.message ?? '')) {
      return 'Enregistrement refusé (droits).';
    }
    return 'Impossible d’enregistrer ce réglage. Réessayez.';
  };

  const toggle = (key: PreferenceKey) => {
    if (!prefs || schemaOutdated) return;
    const value = !prefs[key];
    // optimiste : le réglage répond instantanément, et on repart toujours du
    // dernier état (pas d'une fermeture périmée si l'on tape vite).
    setPrefs(p => (p ? { ...p, [key]: value } : p));
    void preferencesService.update(prefs.id, { [key]: value }).catch(e => {
      console.error('[NotificationPreferences] update failed:', e);
      setPrefs(p => (p ? { ...p, [key]: !value } : p));
      showError(describe(e));
    });
  };

  const setQuietHours = (start: string | null, end: string | null) => {
    if (!prefs) return;
    const before = { start: prefs.quiet_hours_start, end: prefs.quiet_hours_end };
    setPrefs(p => (p ? { ...p, quiet_hours_start: start, quiet_hours_end: end } : p));
    void preferencesService.setQuietHours(prefs.id, start, end).catch(e => {
      console.error('[NotificationPreferences] quiet hours failed:', e);
      setPrefs(p => (p ? { ...p, quiet_hours_start: before.start, quiet_hours_end: before.end } : p));
      showError(describe(e));
    });
  };

  const quietOn = !!prefs?.quiet_hours_start && !!prefs?.quiet_hours_end;

  const card: React.CSSProperties = {
    background: 'var(--rk-surface)', border: '1px solid var(--rk-border)',
    borderRadius: '20px', padding: '6px 16px', marginBottom: 18,
  };
  const row: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 13, padding: '15px 0',
    borderBottom: '1px solid var(--rk-line)',
  };
  const sectionTitle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, letterSpacing: '.12em',
    color: 'var(--rk-text3)', margin: '0 0 12px',
  };

  return (
    <IonPage>
      <IonContent fullscreen>
        <div className="rk-app rk-screen" style={{ minHeight: '100%', background: 'var(--rk-bg)' }}>

          <div style={{
            padding: 'calc(env(safe-area-inset-top) + 16px) 22px 20px',
            background: 'var(--rk-surface)', borderBottom: '1px solid var(--rk-border)',
          }}>
            <button onClick={() => back()} style={{
              fontSize: 13, fontWeight: 600, color: 'var(--rk-text3)', marginBottom: 12,
            }}>← Réglages</button>
            <h1 style={{ fontSize: 27, fontWeight: 800, letterSpacing: '-.03em', margin: 0, color: 'var(--rk-text)' }}>
              Notifications
            </h1>
            <p style={{ fontSize: 13, color: 'var(--rk-text3)', margin: '5px 0 0' }}>
              Choisissez ce que vous recevez, et par quel canal
            </p>
          </div>

          <div style={{ padding: '18px 22px 140px' }}>
            {loading && !prefs ? (
              <div style={{ textAlign: 'center', padding: 60, color: 'var(--rk-text3)' }}>Chargement…</div>
            ) : !prefs ? (
              <div style={{ textAlign: 'center', padding: 60, color: 'var(--rk-text3)', lineHeight: 1.6 }}>
                Impossible de charger vos préférences.
                <br />
                <button onClick={load} style={{ marginTop: 14, fontWeight: 700, color: 'var(--rk-indigo)' }}>Réessayer</button>
              </div>
            ) : (
              <>
                {schemaOutdated && (
                  <div style={{
                    background: 'var(--rk-ambersoft)', border: '1px solid var(--rk-border)', borderRadius: 16,
                    padding: '12px 14px', marginBottom: 18, fontSize: 13, lineHeight: 1.5, color: 'var(--rk-text)',
                  }}>
                    <strong>Réglages indisponibles pour l’instant.</strong><br />
                    Le serveur n’a pas encore la migration <code>025_notifications_v2</code> : lancez <code>supabase db push</code>.
                  </div>
                )}
                {/* Canaux */}
                <div style={sectionTitle}>CANAUX</div>
                <div style={card}>
                  {CHANNELS.map((c, i) => (
                    <div key={c.key} style={{ ...row, borderBottom: i === CHANNELS.length - 1 ? 'none' : row.borderBottom }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--rk-text)' }}>{c.label}</div>
                        <div style={{ fontSize: 12, color: 'var(--rk-text3)', marginTop: 2 }}>{c.hint}</div>
                      </div>
                      <Toggle on={!!prefs[c.key]} disabled={schemaOutdated} onChange={() => toggle(c.key)} />
                    </div>
                  ))}
                </div>

                {/* Quiet hours */}
                <div style={sectionTitle}>HORAIRES SILENCIEUX</div>
                <div style={card}>
                  <div style={{ ...row, borderBottom: quietOn ? row.borderBottom : 'none' }}>
                    <RkTile icon={moonOutline} tint="var(--rk-indigosoft)" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--rk-text)' }}>Ne pas déranger</div>
                      <div style={{ fontSize: 12, color: 'var(--rk-text3)', marginTop: 2, lineHeight: 1.45 }}>
                        Les notifications sont gardées et remises le matin. Les alertes de sécurité passent toujours.
                      </div>
                    </div>
                    <Toggle on={quietOn} onChange={() => setQuietHours(quietOn ? null : '22:00', quietOn ? null : '07:30')} />
                  </div>

                  {quietOn && (
                    <div style={{ ...row, borderBottom: 'none', gap: 10 }}>
                      <input
                        type="time"
                        value={prefs.quiet_hours_start?.slice(0, 5) ?? '22:00'}
                        onChange={e => setQuietHours(e.target.value, prefs.quiet_hours_end)}
                        style={{
                          flex: 1, height: 44, borderRadius: '14px',
                          border: '1px solid var(--rk-border)', padding: '0 12px',
                          fontSize: 15, fontWeight: 600, fontFamily: 'inherit', color: 'var(--rk-text)',
                        }}
                      />
                      <span style={{ color: 'var(--rk-text3)', fontSize: 13, fontWeight: 600 }}>→</span>
                      <input
                        type="time"
                        value={prefs.quiet_hours_end?.slice(0, 5) ?? '07:30'}
                        onChange={e => setQuietHours(prefs.quiet_hours_start, e.target.value)}
                        style={{
                          flex: 1, height: 44, borderRadius: '14px',
                          border: '1px solid var(--rk-border)', padding: '0 12px',
                          fontSize: 15, fontWeight: 600, fontFamily: 'inherit', color: 'var(--rk-text)',
                        }}
                      />
                    </div>
                  )}
                </div>

                {/* Catégories */}
                {SECTIONS.map(section => (
                  <React.Fragment key={section.title}>
                    <div style={sectionTitle}>{section.title.toUpperCase()}</div>
                    <div style={card}>
                      {section.items.map((item, i) => (
                        <div key={item.key} style={{ ...row, borderBottom: i === section.items.length - 1 ? 'none' : row.borderBottom }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--rk-text)' }}>{item.label}</div>
                            {item.hint && (
                              <div style={{ fontSize: 12, color: 'var(--rk-text3)', marginTop: 2 }}>{item.hint}</div>
                            )}
                          </div>
                          <Toggle on={!!prefs[item.key]} disabled={schemaOutdated} onChange={() => toggle(item.key)} />
                        </div>
                      ))}
                    </div>
                  </React.Fragment>
                ))}

                <p style={{ fontSize: 12, color: 'var(--rk-text3)', lineHeight: 1.6, textAlign: 'center', margin: '4px 12px 0' }}>
                  Les notifications de sécurité et de compte sont toujours envoyées.
                </p>
              </>
            )}
          </div>
        </div>
        {error && (
          <div role="alert" style={{
            position: 'fixed', left: 16, right: 16, bottom: 'calc(env(safe-area-inset-bottom) + 24px)',
            zIndex: 50, background: 'var(--rk-text)', color: 'var(--rk-bg)', borderRadius: 16,
            padding: '12px 16px', fontSize: 13, fontWeight: 600, boxShadow: '0 10px 30px rgba(22,24,43,.25)',
          }}>
            {error}
          </div>
        )}
      </IonContent>
    </IonPage>
  );
};

export default NotificationPreferencesPage;

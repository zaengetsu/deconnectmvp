import { supabase } from '../../lib/supabase';

const APP_URL = import.meta.env.VITE_APP_URL || 'http://localhost:5173';

// Only parent-targeted email event types
// Children receive in-app notifications, not emails
type EmailEventType =
  | 'welcome'
  | 'password_reset'
  | 'password_changed'
  | 'activity_submitted'   // parent notified when child submits
  | 'reward_requested'     // parent notified when child requests reward
  | 'notification'         // notification importante relayée (canal 'email' côté base)
  | 'weekly_report'        // récapitulatif hebdomadaire
  | 'new_login'            // sécurité : nouvelle connexion
  | 'child_profile_created';

interface SendEmailPayload {
  event_type: EmailEventType;
  recipient_email: string;
  recipient_name?: string;
  data: Record<string, unknown>;
}

async function sendEmail(payload: SendEmailPayload): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke('send-email', { body: payload });
    if (error) console.error('[EmailService] Failed:', error);
  } catch (e) {
    console.error('[EmailService] Invoke error:', e);
  }
}

export const emailService = {
  // ─── Sécurité & compte (5.14) ─────────────────────────────
  async sendNewLogin(email: string, name: string, device?: string): Promise<void> {
    await sendEmail({
      event_type: 'new_login',
      recipient_email: email,
      recipient_name: name,
      data: {
        name,
        device: device || '',
        when: new Date().toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' }),
      },
    });
  },

  async sendChildProfileCreated(email: string, name: string, childName: string): Promise<void> {
    await sendEmail({
      event_type: 'child_profile_created',
      recipient_email: email,
      recipient_name: name,
      data: { name, childName },
    });
  },

  // ─── Auth emails (parents) ────────────────────────────────
  async sendWelcome(email: string, name: string): Promise<void> {
    await sendEmail({ event_type: 'welcome', recipient_email: email, recipient_name: name, data: { name } });
  },

  async sendPasswordReset(email: string, name: string, resetUrl: string): Promise<void> {
    await sendEmail({ event_type: 'password_reset', recipient_email: email, recipient_name: name, data: { name, resetUrl } });
  },

  async sendPasswordChanged(email: string, name: string): Promise<void> {
    await sendEmail({ event_type: 'password_changed', recipient_email: email, recipient_name: name, data: { name } });
  },

  // ─── Activity emails (parent receives, child submitted) ───
  async sendActivitySubmitted(
    parentEmail: string,
    parentName: string,
    childName: string,
    activityTitle: string,
    childNote?: string
  ): Promise<void> {
    await sendEmail({
      event_type: 'activity_submitted',
      recipient_email: parentEmail,
      recipient_name: parentName,
      data: { parentName, childName, activityTitle, childNote: childNote || '', appUrl: `${APP_URL}/parent/validations` },
    });
  },

  // ─── Reward emails (parent receives, child requested) ─────
  async sendRewardRequested(
    parentEmail: string,
    parentName: string,
    childName: string,
    rewardTitle: string
  ): Promise<void> {
    await sendEmail({
      event_type: 'reward_requested',
      recipient_email: parentEmail,
      recipient_name: parentName,
      data: { parentName, childName, rewardTitle, appUrl: `${APP_URL}/parent/rewards` },
    });
  },
};

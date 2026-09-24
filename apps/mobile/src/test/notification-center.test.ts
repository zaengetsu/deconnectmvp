import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  filterNotifications,
  isActionRequired,
  notificationService,
  type AppNotification,
} from '../features/notifications/notification.service';
import { preferencesService } from '../features/notifications/preferences.service';
import { supabase } from '../lib/supabase';

const n = (over: Partial<AppNotification>): AppNotification => ({
  id: over.id ?? 'n1',
  recipient_type: 'parent',
  recipient_id: 'p1',
  title: 't', body: 'b', icon: '🔔', route: null, data: {},
  is_read: false,
  created_at: new Date().toISOString(),
  ...over,
});

describe('centre de notifications (5.13)', () => {
  const list = [
    n({ id: '1', type: 'activity_validation_required', priority: 'high' }),
    n({ id: '2', type: 'activity_completed', priority: 'normal', is_read: true }),
    n({ id: '3', type: 'reward_pending', priority: 'normal' }),
    n({ id: '4', type: 'tip', priority: 'low', is_read: true }),
  ];

  it('filtre les non lues', () => {
    expect(filterNotifications(list, 'unread').map(x => x.id)).toEqual(['1', '3']);
  });

  it('filtre ce qui attend une action du parent', () => {
    expect(filterNotifications(list, 'action').map(x => x.id)).toEqual(['1', '3']);
  });

  it('filtre par famille activité / récompense', () => {
    expect(filterNotifications(list, 'activity').map(x => x.id)).toEqual(['2']);
    expect(filterNotifications(list, 'reward').map(x => x.id)).toEqual(['3']);
  });

  it('« tout » ne retire rien', () => {
    expect(filterNotifications(list, 'all')).toHaveLength(4);
  });

  it('distingue visuellement les notifications à traiter', () => {
    expect(isActionRequired(n({ priority: 'high' }))).toBe(true);
    expect(isActionRequired(n({ type: 'reward_requested', priority: 'normal' }))).toBe(true);
    expect(isActionRequired(n({ type: 'activity_completed', priority: 'normal' }))).toBe(false);
    expect(isActionRequired(n({ type: 'tip', priority: 'low' }))).toBe(false);
  });

  it('supprime une notification', async () => {
    const chain = { delete: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) };
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    await notificationService.deleteNotification('n1');
    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith('id', 'n1');
  });

  it('n\'efface que les notifications déjà lues', async () => {
    const chain = { delete: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
    (chain.eq as unknown as { mock: unknown }) = vi.fn().mockImplementation(function (field: string) {
      if (field === 'is_read') return Promise.resolve({ error: null });
      return chain;
    });
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    await notificationService.deleteAllRead('parent', 'p1');
    expect(chain.eq).toHaveBeenCalledWith('is_read', true);
  });
});

describe('préférences (5.15)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('crée la ligne par défaut si le parent n\'en a pas encore', async () => {
    const selectChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'pref-1', parent_id: 'p1' }, error: null }),
    };
    vi.mocked(supabase.from).mockReturnValue(selectChain as never);

    const prefs = await preferencesService.getParentPreferences('p1');

    expect(selectChain.insert).toHaveBeenCalledWith({ parent_id: 'p1' });
    expect(prefs?.id).toBe('pref-1');
  });

  it('enregistre les horaires silencieux', async () => {
    const chain = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) };
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    await preferencesService.setQuietHours('pref-1', '22:00', '07:30');

    const patch = chain.update.mock.calls[0][0];
    expect(patch.quiet_hours_start).toBe('22:00');
    expect(patch.quiet_hours_end).toBe('07:30');
    expect(chain.eq).toHaveBeenCalledWith('id', 'pref-1');
  });

  it('désactiver les horaires silencieux remet les champs à null', async () => {
    const chain = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) };
    vi.mocked(supabase.from).mockReturnValue(chain as never);

    await preferencesService.setQuietHours('pref-1', null, null);

    const patch = chain.update.mock.calls[0][0];
    expect(patch.quiet_hours_start).toBeNull();
    expect(patch.quiet_hours_end).toBeNull();
  });
});

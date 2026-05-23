import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAuthStore } from '../stores/auth.store';

// Reset store before each test
beforeEach(() => {
  useAuthStore.setState({
    user: null, session: null, profile: null,
    isLoading: false, isInitialized: false, error: null,
  });
});

describe('authStore', () => {
  it('starts uninitialized', () => {
    const state = useAuthStore.getState();
    expect(state.isInitialized).toBe(false);
    expect(state.user).toBeNull();
    expect(state.profile).toBeNull();
  });

  it('clears error', () => {
    useAuthStore.setState({ error: 'Some error' });
    useAuthStore.getState().clearError();
    expect(useAuthStore.getState().error).toBeNull();
  });

  it('sets loading state during signIn', async () => {
    const { supabase } = await import('../lib/supabase');
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
      data: { user: { id: 'u1' } as any, session: {} as any },
      error: null,
    });

    // Should set loading then resolve
    const promise = useAuthStore.getState().signIn('test@test.com', '123456');
    expect(useAuthStore.getState().isLoading).toBe(true);
    await promise;
    expect(useAuthStore.getState().isLoading).toBe(false);
  });

  it('handles signIn error', async () => {
    const { supabase } = await import('../lib/supabase');
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid login', status: 400 } as any,
    });

    await expect(useAuthStore.getState().signIn('test@test.com', 'wrong')).rejects.toBeDefined();
    expect(useAuthStore.getState().error).toBeTruthy();
    expect(useAuthStore.getState().isLoading).toBe(false);
  });

  it('handles signOut', async () => {
    const { supabase } = await import('../lib/supabase');
    vi.mocked(supabase.auth.signOut).mockResolvedValue({ error: null });

    useAuthStore.setState({ user: { id: 'u1' } as any, profile: { id: 'u1' } as any });
    await useAuthStore.getState().signOut();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().profile).toBeNull();
  });

  it('sets loading during resetPassword', async () => {
    const { supabase } = await import('../lib/supabase');
    vi.mocked(supabase.auth.resetPasswordForEmail).mockResolvedValue({ data: {}, error: null });

    await useAuthStore.getState().resetPassword('test@test.com');
    expect(useAuthStore.getState().isLoading).toBe(false);
  });
});

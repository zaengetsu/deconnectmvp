import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../stores/app.store';
import type { Child } from '../types/database.types';

const mockChild: Child = {
  id: 'child-1', parent_id: 'parent-1', display_name: 'Lucas',
  age: 10, avatar_url: '🦊', total_points: 50, level: 2,
  is_active: true, created_at: '', updated_at: '',
};

describe('appStore', () => {
  beforeEach(() => {
    useAppStore.setState({ mode: null, selectedChild: null, showOnboarding: true });
  });

  it('starts with null mode', () => {
    expect(useAppStore.getState().mode).toBeNull();
  });

  it('sets mode', () => {
    useAppStore.getState().setMode('parent');
    expect(useAppStore.getState().mode).toBe('parent');
  });

  it('selects a child and switches to child mode', () => {
    useAppStore.getState().selectChild(mockChild);
    expect(useAppStore.getState().selectedChild).toEqual(mockChild);
    expect(useAppStore.getState().mode).toBe('child');
  });

  it('clears child and switches to parent mode', () => {
    useAppStore.getState().selectChild(mockChild);
    useAppStore.getState().clearChild();
    expect(useAppStore.getState().selectedChild).toBeNull();
    expect(useAppStore.getState().mode).toBe('parent');
  });

  it('switchToParent clears child', () => {
    useAppStore.getState().selectChild(mockChild);
    useAppStore.getState().switchToParent();
    expect(useAppStore.getState().selectedChild).toBeNull();
    expect(useAppStore.getState().mode).toBe('parent');
  });

  it('sets onboarding visibility', () => {
    useAppStore.getState().setShowOnboarding(false);
    expect(useAppStore.getState().showOnboarding).toBe(false);
  });
});

import { create } from 'zustand';
import type { Child } from '../types/database.types';

type AppMode = 'parent' | 'child' | null;

interface AppState {
  // Mode
  mode: AppMode;
  selectedChild: Child | null;
  showOnboarding: boolean;

  // Actions
  setMode: (mode: AppMode) => void;
  selectChild: (child: Child) => void;
  clearChild: () => void;
  switchToParent: () => void;
  setShowOnboarding: (show: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  mode: null,
  selectedChild: null,
  showOnboarding: true,

  setMode: (mode) => set({ mode }),

  selectChild: (child) => set({ selectedChild: child, mode: 'child' }),

  clearChild: () => set({ selectedChild: null, mode: 'parent' }),

  switchToParent: () => set({ selectedChild: null, mode: 'parent' }),

  setShowOnboarding: (show) => set({ showOnboarding: show }),
}));

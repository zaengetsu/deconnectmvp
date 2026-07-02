import { create } from 'zustand';
import type { Child } from '../types/database.types';
import { childrenService } from '../features/children/children.service';

type AppMode = 'parent' | 'child' | null;

interface AppState {
  // Mode
  mode: AppMode;
  selectedChild: Child | null;
  showOnboarding: boolean;

  // Actions
  setMode: (mode: AppMode) => void;
  selectChild: (child: Child) => void;
  setSelectedChild: (child: Child) => void;
  clearChild: () => void;
  switchToParent: () => void;
  refreshSelectedChild: () => Promise<void>;
  setShowOnboarding: (show: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  mode: null,
  selectedChild: null,
  showOnboarding: true,

  setMode: (mode) => { console.log('[AppStore] setMode →', mode); set({ mode }); },

  selectChild: (child) => {
    console.log('[AppStore] selectChild →', child.display_name, child.id);
    set({ selectedChild: child, mode: 'child' });
  },

  setSelectedChild: (child) => {
    console.log('[AppStore] setSelectedChild →', child.display_name);
    set({ selectedChild: child });
  },

  clearChild: () => { console.log('[AppStore] clearChild → parent mode'); set({ selectedChild: null, mode: 'parent' }); },

  switchToParent: () => { console.log('[AppStore] switchToParent'); set({ selectedChild: null, mode: 'parent' }); },

  refreshSelectedChild: async () => {
    const current = useAppStore.getState().selectedChild;
    if (!current) return;
    try {
      const fresh = await childrenService.getChild(current.id);
      console.log('[AppStore] refreshSelectedChild →', fresh.display_name, 'pts:', fresh.total_points);
      set({ selectedChild: fresh });
    } catch (e) {
      console.error('[AppStore] refreshSelectedChild error:', e);
    }
  },

  setShowOnboarding: (show) => set({ showOnboarding: show }),
}));

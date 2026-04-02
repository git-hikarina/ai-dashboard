import { create } from 'zustand';
import { DEFAULT_MODEL_ID } from '@/lib/ai/models';

interface ChatTab {
  sessionId: string;
  title: string;
  modelId: string;
  mode: 'auto' | 'fixed' | 'compare';
  presetId: string | null;
  projectIds: string[];
}

interface ChatStore {
  tabs: ChatTab[];
  activeTabId: string | null;
  openTab: (session: { id: string; title: string | null; fixed_model: string | null; mode: string }) => void;
  closeTab: (sessionId: string) => void;
  setActiveTab: (sessionId: string) => void;
  updateTabTitle: (sessionId: string, title: string) => void;
  updateTabModel: (sessionId: string, modelId: string) => void;
  updateTabPreset: (sessionId: string, presetId: string | null) => void;
  updateTabProjectIds: (sessionId: string, projectIds: string[]) => void;
}

const MAX_TABS = 10;

export const useChatStore = create<ChatStore>((set, get) => ({
  tabs: [],
  activeTabId: null,

  openTab: (session) => {
    const { tabs } = get();
    const existing = tabs.find(t => t.sessionId === session.id);
    if (existing) {
      set({ activeTabId: session.id });
      return;
    }
    if (tabs.length >= MAX_TABS) return; // Don't open more than MAX
    const newTab: ChatTab = {
      sessionId: session.id,
      title: session.title || '新しいチャット',
      modelId: session.fixed_model || DEFAULT_MODEL_ID,
      mode: (session.mode as ChatTab['mode']) || 'fixed',
      presetId: null,
      projectIds: [],
    };
    set({ tabs: [...tabs, newTab], activeTabId: session.id });
  },

  closeTab: (sessionId) => {
    const { tabs, activeTabId } = get();
    const idx = tabs.findIndex(t => t.sessionId === sessionId);
    if (idx === -1) return;
    const newTabs = tabs.filter(t => t.sessionId !== sessionId);
    let newActive = activeTabId;
    if (activeTabId === sessionId) {
      newActive = newTabs[Math.min(idx, newTabs.length - 1)]?.sessionId || null;
    }
    set({ tabs: newTabs, activeTabId: newActive });
  },

  setActiveTab: (sessionId) => set({ activeTabId: sessionId }),

  updateTabTitle: (sessionId, title) => set(state => ({
    tabs: state.tabs.map(t => t.sessionId === sessionId ? { ...t, title } : t),
  })),

  updateTabModel: (sessionId, modelId) => set(state => ({
    tabs: state.tabs.map(t => t.sessionId === sessionId ? { ...t, modelId } : t),
  })),

  updateTabPreset: (sessionId, presetId) => set(state => ({
    tabs: state.tabs.map(t => t.sessionId === sessionId ? { ...t, presetId } : t),
  })),

  updateTabProjectIds: (sessionId, projectIds) => set(state => ({
    tabs: state.tabs.map(t => t.sessionId === sessionId ? { ...t, projectIds } : t),
  })),
}));

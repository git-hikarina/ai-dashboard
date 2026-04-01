import { describe, it, expect, beforeEach } from 'vitest';
import { useChatStore } from '@/stores/chat-store';
import { DEFAULT_MODEL_ID } from '@/lib/ai/models';

// Helper to reset Zustand store state between tests
function resetStore() {
  useChatStore.setState({ tabs: [], activeTabId: null });
}

describe('useChatStore', () => {
  beforeEach(() => {
    resetStore();
  });

  // --- openTab ---

  describe('openTab', () => {
    it('adds a new tab and activates it', () => {
      useChatStore.getState().openTab({
        id: 'session-1',
        title: 'My Chat',
        fixed_model: 'claude-opus-4-6',
        mode: 'fixed',
      });

      const { tabs, activeTabId } = useChatStore.getState();
      expect(tabs).toHaveLength(1);
      expect(tabs[0].sessionId).toBe('session-1');
      expect(tabs[0].title).toBe('My Chat');
      expect(tabs[0].modelId).toBe('claude-opus-4-6');
      expect(tabs[0].mode).toBe('fixed');
      expect(activeTabId).toBe('session-1');
    });

    it('activates an existing tab without duplicating it', () => {
      const { openTab } = useChatStore.getState();

      openTab({ id: 'session-1', title: 'First', fixed_model: null, mode: 'fixed' });
      openTab({ id: 'session-2', title: 'Second', fixed_model: null, mode: 'fixed' });
      // Re-open session-1 — should not duplicate
      openTab({ id: 'session-1', title: 'First', fixed_model: null, mode: 'fixed' });

      const { tabs, activeTabId } = useChatStore.getState();
      expect(tabs).toHaveLength(2);
      expect(activeTabId).toBe('session-1');
    });

    it('respects MAX_TABS limit of 10', () => {
      const { openTab } = useChatStore.getState();

      for (let i = 1; i <= 11; i++) {
        openTab({ id: `session-${i}`, title: `Chat ${i}`, fixed_model: null, mode: 'fixed' });
      }

      const { tabs } = useChatStore.getState();
      expect(tabs).toHaveLength(10);
    });

    it('uses default title fallback when title is null', () => {
      useChatStore.getState().openTab({
        id: 'session-null-title',
        title: null,
        fixed_model: null,
        mode: 'fixed',
      });

      const { tabs } = useChatStore.getState();
      expect(tabs[0].title).toBe('新しいチャット');
    });

    it('uses DEFAULT_MODEL_ID as model fallback when fixed_model is null', () => {
      useChatStore.getState().openTab({
        id: 'session-null-model',
        title: 'Test',
        fixed_model: null,
        mode: 'fixed',
      });

      const { tabs } = useChatStore.getState();
      expect(tabs[0].modelId).toBe(DEFAULT_MODEL_ID);
    });
  });

  // --- closeTab ---

  describe('closeTab', () => {
    it('removes the tab', () => {
      const { openTab, closeTab } = useChatStore.getState();

      openTab({ id: 'session-1', title: 'A', fixed_model: null, mode: 'fixed' });
      openTab({ id: 'session-2', title: 'B', fixed_model: null, mode: 'fixed' });
      closeTab('session-1');

      const { tabs } = useChatStore.getState();
      expect(tabs).toHaveLength(1);
      expect(tabs[0].sessionId).toBe('session-2');
    });

    it('activates the neighbor tab when the active tab is closed', () => {
      const { openTab, closeTab } = useChatStore.getState();

      openTab({ id: 'session-1', title: 'A', fixed_model: null, mode: 'fixed' });
      openTab({ id: 'session-2', title: 'B', fixed_model: null, mode: 'fixed' });
      openTab({ id: 'session-3', title: 'C', fixed_model: null, mode: 'fixed' });

      // session-3 is active; close it — should fall back to session-2
      closeTab('session-3');

      const { activeTabId } = useChatStore.getState();
      expect(activeTabId).toBe('session-2');
    });

    it('activates the next tab when a non-last active tab is closed', () => {
      const { openTab, closeTab, setActiveTab } = useChatStore.getState();

      openTab({ id: 'session-1', title: 'A', fixed_model: null, mode: 'fixed' });
      openTab({ id: 'session-2', title: 'B', fixed_model: null, mode: 'fixed' });
      openTab({ id: 'session-3', title: 'C', fixed_model: null, mode: 'fixed' });

      // Make session-1 active, then close it — idx=0, neighbor should be new idx=0 (session-2)
      setActiveTab('session-1');
      closeTab('session-1');

      const { activeTabId } = useChatStore.getState();
      expect(activeTabId).toBe('session-2');
    });

    it('sets activeTabId to null when the last tab is closed', () => {
      const { openTab, closeTab } = useChatStore.getState();

      openTab({ id: 'session-1', title: 'Only', fixed_model: null, mode: 'fixed' });
      closeTab('session-1');

      const { tabs, activeTabId } = useChatStore.getState();
      expect(tabs).toHaveLength(0);
      expect(activeTabId).toBeNull();
    });

    it('does nothing when closing a non-existent sessionId', () => {
      const { openTab, closeTab } = useChatStore.getState();

      openTab({ id: 'session-1', title: 'A', fixed_model: null, mode: 'fixed' });
      closeTab('does-not-exist');

      const { tabs } = useChatStore.getState();
      expect(tabs).toHaveLength(1);
    });

    it('does not change activeTabId when closing a non-active tab', () => {
      const { openTab, closeTab } = useChatStore.getState();

      openTab({ id: 'session-1', title: 'A', fixed_model: null, mode: 'fixed' });
      openTab({ id: 'session-2', title: 'B', fixed_model: null, mode: 'fixed' });
      // session-2 is active; close session-1
      closeTab('session-1');

      const { activeTabId } = useChatStore.getState();
      expect(activeTabId).toBe('session-2');
    });
  });

  // --- setActiveTab ---

  describe('setActiveTab', () => {
    it('changes the active tab', () => {
      const { openTab, setActiveTab } = useChatStore.getState();

      openTab({ id: 'session-1', title: 'A', fixed_model: null, mode: 'fixed' });
      openTab({ id: 'session-2', title: 'B', fixed_model: null, mode: 'fixed' });

      setActiveTab('session-1');

      expect(useChatStore.getState().activeTabId).toBe('session-1');
    });
  });

  // --- updateTabTitle ---

  describe('updateTabTitle', () => {
    it('updates the title of the specified tab', () => {
      const { openTab, updateTabTitle } = useChatStore.getState();

      openTab({ id: 'session-1', title: 'Old Title', fixed_model: null, mode: 'fixed' });
      updateTabTitle('session-1', 'New Title');

      const { tabs } = useChatStore.getState();
      expect(tabs[0].title).toBe('New Title');
    });

    it('only updates the targeted tab', () => {
      const { openTab, updateTabTitle } = useChatStore.getState();

      openTab({ id: 'session-1', title: 'First', fixed_model: null, mode: 'fixed' });
      openTab({ id: 'session-2', title: 'Second', fixed_model: null, mode: 'fixed' });

      updateTabTitle('session-1', 'Updated First');

      const { tabs } = useChatStore.getState();
      expect(tabs[0].title).toBe('Updated First');
      expect(tabs[1].title).toBe('Second');
    });
  });

  // --- updateTabModel ---

  describe('updateTabModel', () => {
    it('updates the modelId of the specified tab', () => {
      const { openTab, updateTabModel } = useChatStore.getState();

      openTab({ id: 'session-1', title: 'Chat', fixed_model: 'claude-sonnet-4-6', mode: 'fixed' });
      updateTabModel('session-1', 'gpt-4o');

      const { tabs } = useChatStore.getState();
      expect(tabs[0].modelId).toBe('gpt-4o');
    });

    it('only updates the targeted tab', () => {
      const { openTab, updateTabModel } = useChatStore.getState();

      openTab({ id: 'session-1', title: 'A', fixed_model: 'model-a', mode: 'fixed' });
      openTab({ id: 'session-2', title: 'B', fixed_model: 'model-b', mode: 'fixed' });

      updateTabModel('session-2', 'model-x');

      const { tabs } = useChatStore.getState();
      expect(tabs[0].modelId).toBe('model-a');
      expect(tabs[1].modelId).toBe('model-x');
    });
  });

  // --- Default values ---

  describe('default state', () => {
    it('starts with no tabs', () => {
      expect(useChatStore.getState().tabs).toHaveLength(0);
    });

    it('starts with activeTabId as null', () => {
      expect(useChatStore.getState().activeTabId).toBeNull();
    });
  });
});

import { create } from 'zustand';
import { useNotesStore } from './notesStore';

interface LayoutState {
  tabs: string[]; // List of note IDs open in primary tab view
  activeTabId: string | null;
  
  splitTabs: string[]; // List of note IDs open in secondary tab view (Split Screen)
  activeSplitTabId: string | null;
  isSplitView: boolean;

  // View settings
  isZenMode: boolean; // Hides sidebar & titlebar bars for pure writing focus
  isCommandPaletteOpen: boolean;
  isSidebarOpen: boolean;
  stickyNoteId: string | null; // Note ID floating in a sticky window overlay

  // Navigation actions
  openTab: (noteId: string, inSplit?: boolean) => void;
  closeTab: (noteId: string, inSplit?: boolean) => void;
  setActiveTabId: (noteId: string | null, inSplit?: boolean) => void;
  toggleSplitView: () => void;
  toggleZenMode: () => void;
  setCommandPaletteOpen: (isOpen: boolean) => void;
  toggleSidebar: () => void;
  setStickyNoteId: (noteId: string | null) => void;
  closeAllTabs: () => void;
}

export const useLayoutStore = create<LayoutState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  splitTabs: [],
  activeSplitTabId: null,
  isSplitView: false,

  isZenMode: false,
  isCommandPaletteOpen: false,
  isSidebarOpen: true,
  stickyNoteId: null,

  openTab: (noteId, inSplit = false) => {
    useNotesStore.getState().setActiveNoteId(noteId);
    if (inSplit) {
      const splitTabs = get().splitTabs;
      if (!splitTabs.includes(noteId)) {
        set({
          splitTabs: [...splitTabs, noteId],
          activeSplitTabId: noteId,
          isSplitView: true
        });
      } else {
        set({ activeSplitTabId: noteId, isSplitView: true });
      }
    } else {
      const tabs = get().tabs;
      if (!tabs.includes(noteId)) {
        set({
          tabs: [...tabs, noteId],
          activeTabId: noteId
        });
      } else {
        set({ activeTabId: noteId });
      }
    }
  },

  closeTab: (noteId, inSplit = false) => {
    if (inSplit) {
      const splitTabs = get().splitTabs.filter(id => id !== noteId);
      let activeSplitTabId = get().activeSplitTabId;
      
      if (activeSplitTabId === noteId) {
        activeSplitTabId = splitTabs[splitTabs.length - 1] || null;
      }
      
      set({
        splitTabs,
        activeSplitTabId,
        isSplitView: splitTabs.length > 0
      });
      useNotesStore.getState().setActiveNoteId(activeSplitTabId);
    } else {
      const tabs = get().tabs.filter(id => id !== noteId);
      let activeTabId = get().activeTabId;

      if (activeTabId === noteId) {
        activeTabId = tabs[tabs.length - 1] || null;
      }

      set({
        tabs,
        activeTabId
      });
      useNotesStore.getState().setActiveNoteId(activeTabId);
    }
  },

  setActiveTabId: (noteId, inSplit = false) => {
    useNotesStore.getState().setActiveNoteId(noteId);
    if (inSplit) {
      set({ activeSplitTabId: noteId });
    } else {
      set({ activeTabId: noteId });
    }
  },

  toggleSplitView: () => {
    const isSplit = get().isSplitView;
    if (!isSplit) {
      // Open current active tab in split too if split is empty
      const activeTabId = get().activeTabId;
      const splitTabs = get().splitTabs;
      
      if (activeTabId && splitTabs.length === 0) {
        set({
          isSplitView: true,
          splitTabs: [activeTabId],
          activeSplitTabId: activeTabId
        });
      } else {
        set({ isSplitView: true });
      }
    } else {
      set({ isSplitView: false });
    }
  },

  toggleZenMode: () => set((state) => ({ isZenMode: !state.isZenMode })),
  setCommandPaletteOpen: (isOpen) => set({ isCommandPaletteOpen: isOpen }),
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  setStickyNoteId: (noteId) => set({ stickyNoteId: noteId }),

  closeAllTabs: () => {
    set({
      tabs: [],
      activeTabId: null,
      splitTabs: [],
      activeSplitTabId: null,
      isSplitView: false
    });
  }
}));

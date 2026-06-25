import React from 'react';
import { useWorkspaceStore } from './store/workspaceStore';
import { useNotesStore } from './store/notesStore';
import { useLayoutStore } from './store/layoutStore';
import { TitleBar } from './components/TitleBar';
import { Sidebar } from './components/Sidebar';
import { SplitView } from './components/SplitView';
import { SettingsModal } from './components/SettingsModal';
import { CommandPalette } from './components/CommandPalette';
import { ToastContainer } from './components/ToastContainer';
import { SecurityLock } from './components/SecurityLock';
import { showToast } from './services/tauriBridge';

const App: React.FC = () => {
  const { 
    initStore, 
    settings, 
    isLocked, 
    lockApp,
    triggerBackup
  } = useWorkspaceStore();

  const { loadWorkspaceData, createNote } = useNotesStore();
  const { openTab, toggleSplitView, isZenMode, toggleZenMode } = useLayoutStore();

  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [initDone, setInitDone] = React.useState(false);

  // Initialize workspace settings and notes tree on mount
  React.useEffect(() => {
    const start = async () => {
      await initStore();
      const currentWorkspaceId = localStorage.getItem('koda_active_workspace') || 'default-workspace';
      await loadWorkspaceData(currentWorkspaceId);
      
      // Auto-open the first available note as a tab so the user doesn't see "No Note Open" on fresh load
      const { activeNoteId } = useNotesStore.getState();
      if (activeNoteId) {
        useLayoutStore.getState().openTab(activeNoteId);
      }
      
      setInitDone(true);
    };
    start();
  }, [initStore, loadWorkspaceData]);

  // Automatic Backup Scheduler
  React.useEffect(() => {
    if (!initDone || settings.autoBackupInterval <= 0) return;

    // Convert minutes to ms
    const intervalMs = settings.autoBackupInterval * 60 * 1000;
    const timer = setInterval(() => {
      triggerBackup('auto');
    }, intervalMs);

    return () => clearInterval(timer);
  }, [initDone, settings.autoBackupInterval, triggerBackup]);

  // Global Keyboard Shortcuts (Native Experience)
  React.useEffect(() => {
    const handleGlobalShortcuts = async (e: KeyboardEvent) => {
      if (isLocked) return;

      // Escape: Exit Zen Mode if active
      if (e.key === 'Escape' && isZenMode) {
        e.preventDefault();
        toggleZenMode();
        showToast("Exited Full Screen Focus", "info");
      }

      // Ctrl + N: Create Note
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        const id = await createNote(null);
        openTab(id);
        showToast("Created new note", "success");
      }

      // Ctrl + ,: Open Settings
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setSettingsOpen(true);
      }

      // Ctrl + \: Toggle Split View
      if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
        e.preventDefault();
        toggleSplitView();
      }

      // Ctrl + L: Lock App
      if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
        e.preventDefault();
        lockApp();
      }

      // Ctrl + S: Mock Save Trigger
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        showToast("Work saved locally", "success");
      }
    };

    window.addEventListener('keydown', handleGlobalShortcuts);
    return () => window.removeEventListener('keydown', handleGlobalShortcuts);
  }, [isLocked, createNote, openTab, toggleSplitView, lockApp, isZenMode, toggleZenMode]);

  if (!initDone) {
    return (
      <div className="h-screen w-screen bg-[#121318] flex items-center justify-center font-sans text-neutral-400">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-violet-500/20 border-t-violet-500 animate-spin" />
          <span className="text-xs uppercase tracking-wider font-bold animate-pulse text-neutral-500">Loading Koda...</span>
        </div>
      </div>
    );
  }

  // Active theme font formatting class
  const getFontFamilyClass = () => {
    switch (settings.fontFamily) {
      case 'heading': return 'font-heading';
      case 'mono': return 'font-mono';
      default: return 'font-sans';
    }
  };

  const getFontSizeClass = () => {
    switch (settings.fontSize) {
      case '14': return 'text-sm';
      case '18': return 'text-lg';
      case '20': return 'text-xl';
      default: return 'text-base';
    }
  };

  return (
    <div 
      className={`h-screen w-screen flex flex-col overflow-hidden select-none page-fade-in ${getFontFamilyClass()} ${getFontSizeClass()}`}
      style={{ backgroundColor: 'var(--bg-app)' }}
    >
      {/* PIN security screen overlay */}
      <SecurityLock />

      {/* Main app layout if not locked */}
      {!isLocked && (
        <>
          {!isZenMode && <TitleBar />}
          
          <div className="flex-1 flex w-full h-full overflow-hidden relative">
            {!isZenMode && <Sidebar onOpenSettings={() => setSettingsOpen(true)} />}
            <SplitView />
          </div>

          <SettingsModal 
            isOpen={settingsOpen} 
            onClose={() => setSettingsOpen(false)} 
          />

          <CommandPalette />
          <ToastContainer />
        </>
      )}
    </div>
  );
};

export default App;

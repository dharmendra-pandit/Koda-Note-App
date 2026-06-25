import React from 'react';
import { useWorkspaceStore } from '../store/workspaceStore';
import { useNotesStore } from '../store/notesStore';
import { useLayoutStore } from '../store/layoutStore';
import { 
  Search, 
  Columns, 
  Menu, 
  Lock, 
  Unlock, 
  Minus, 
  Square, 
  X,
  FolderOpen,
  ChevronDown
} from 'lucide-react';

export const TitleBar: React.FC = () => {
  const { 
    workspaces, 
    activeWorkspaceId, 
    switchWorkspace, 
    isLocked, 
    hasSetupPasscode,
    lockApp 
  } = useWorkspaceStore();
  const { loadWorkspaceData } = useNotesStore();
  const { 
    toggleSidebar, 
    isSplitView, 
    toggleSplitView, 
    setCommandPaletteOpen 
  } = useLayoutStore();

  const [wsDropdownOpen, setWsDropdownOpen] = React.useState(false);

  const activeWorkspaceName = workspaces.find(w => w.id === activeWorkspaceId)?.name || 'My Notes';

  const handleWorkspaceChange = async (id: string) => {
    setWsDropdownOpen(false);
    await switchWorkspace(id);
    await loadWorkspaceData(id);
  };

  // Mock window control actions
  const mockMinimize = () => {
    alert("Application minimized to Tray (Simulated)");
  };

  const mockMaximize = () => {
    const root = document.documentElement;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      root.requestFullscreen().catch(err => {
        console.log("Fullscreen request failed:", err);
      });
    }
  };

  const mockClose = () => {
    if (confirm("Are you sure you want to close Koda Note? All data is autosaved locally.")) {
      window.close();
    }
  };

  return (
    <div 
      className="h-11 border-b select-none flex items-center justify-between px-3 text-sm z-30"
      style={{ 
        backgroundColor: 'var(--bg-sidebar)', 
        borderColor: 'var(--border-main)',
        color: 'var(--text-secondary)'
      }}
    >
      {/* Left side: Workspace Selector & Sidebar toggle */}
      <div className="flex items-center gap-2">
        <button 
          onClick={toggleSidebar}
          className="p-1 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded transition-colors text-neutral-400"
          title="Toggle Sidebar"
        >
          <Menu size={16} />
        </button>

        {/* Workspace Quick Switcher */}
        <div className="relative">
          <button 
            onClick={() => setWsDropdownOpen(!wsDropdownOpen)}
            className="flex items-center gap-1.5 px-2.5 py-1 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded text-neutral-200 font-medium transition-colors"
          >
            <FolderOpen size={14} className="text-violet-400" />
            <span>{activeWorkspaceName}</span>
            <ChevronDown size={12} className="opacity-60" />
          </button>

          {wsDropdownOpen && (
            <>
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setWsDropdownOpen(false)}
              />
              <div 
                className="absolute left-0 mt-1 w-52 rounded-md shadow-lg border border-neutral-700 bg-neutral-900 overflow-hidden z-50 animate-in fade-in slide-in-from-top-1 duration-150"
                style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-main)' }}
              >
                <div className="p-1.5 max-h-60 overflow-y-auto">
                  {workspaces.map((ws) => (
                    <button
                      key={ws.id}
                      onClick={() => handleWorkspaceChange(ws.id)}
                      className={`w-full text-left px-3 py-1.5 rounded text-xs transition-colors flex items-center justify-between ${
                        ws.id === activeWorkspaceId 
                          ? 'bg-violet-600 text-white font-medium' 
                          : 'hover:bg-neutral-800 text-neutral-300'
                      }`}
                    >
                      <span>{ws.name}</span>
                      {ws.id === activeWorkspaceId && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Middle: Command Launcher Search Input */}
      <div className="flex-1 max-w-sm mx-4 relative">
        <button 
          onClick={() => setCommandPaletteOpen(true)}
          className="w-full h-7 px-3 rounded border border-neutral-700 hover:border-neutral-500 bg-neutral-800/40 text-neutral-400 text-xs flex items-center justify-between transition-all group"
          style={{ 
            backgroundColor: 'var(--bg-app)', 
            borderColor: 'var(--border-main)',
            color: 'var(--text-muted)'
          }}
        >
          <div className="flex items-center gap-2">
            <Search size={12} className="group-hover:text-neutral-300" />
            <span>Quick search... (Ctrl + P)</span>
          </div>
          <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-[10px] opacity-60">Ctrl P</kbd>
        </button>
      </div>

      {/* Right side: Split screen, Zen Mode, Locking and Native Title Windows controls */}
      <div className="flex items-center gap-3">
        {/* Toggle split view */}
        <button 
          onClick={toggleSplitView}
          className={`p-1.5 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded transition-colors ${
            isSplitView ? 'text-violet-400' : 'text-neutral-400'
          }`}
          title="Toggle Split View"
        >
          <Columns size={15} />
        </button>

        {/* Lock button */}
        {hasSetupPasscode && (
          <button 
            onClick={lockApp}
            className="p-1.5 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded text-amber-500 transition-colors"
            title="Lock Notes Database"
          >
            {isLocked ? <Lock size={15} /> : <Unlock size={15} />}
          </button>
        )}

        <div className="h-4 w-[1px] bg-neutral-700" style={{ backgroundColor: 'var(--border-main)' }} />

        {/* Window controls (Mocking Windows shell controls) */}
        <div className="flex items-center gap-0.5">
          <button 
            onClick={mockMinimize}
            className="p-1.5 hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-400 rounded transition-colors"
            title="Minimize"
          >
            <Minus size={14} />
          </button>
          <button 
            onClick={mockMaximize}
            className="p-1.5 hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-400 rounded transition-colors"
            title="Maximize"
          >
            <Square size={12} />
          </button>
          <button 
            onClick={mockClose}
            className="p-1.5 hover:bg-red-600 hover:text-white text-neutral-400 rounded transition-colors"
            title="Close"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { useLayoutStore } from '../store/layoutStore';
import { useNotesStore } from '../store/notesStore';
import { useWorkspaceStore } from '../store/workspaceStore';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, FileText, Key, Database, SunMoon, Plus } from 'lucide-react';

export const CommandPalette: React.FC = () => {
  const { isCommandPaletteOpen, setCommandPaletteOpen, openTab } = useLayoutStore();
  const { notes, createNote } = useNotesStore();
  const { updateSetting, lockApp, triggerBackup } = useWorkspaceStore();

  const [query, setQuery] = React.useState('');
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Command items definition
  const commands = React.useMemo(() => [
    {
      id: 'cmd-new-note',
      title: 'Create New Note',
      category: 'Actions',
      icon: <Plus size={14} className="text-emerald-400" />,
      action: async () => {
        const id = await createNote(null);
        openTab(id);
      }
    },
    {
      id: 'cmd-theme-light',
      title: 'Switch to Light Theme',
      category: 'Appearance',
      icon: <SunMoon size={14} className="text-amber-400" />,
      action: () => updateSetting('theme', 'light')
    },
    {
      id: 'cmd-theme-dark',
      title: 'Switch to Dark Theme',
      category: 'Appearance',
      icon: <SunMoon size={14} className="text-indigo-400" />,
      action: () => updateSetting('theme', 'dark')
    },
    {
      id: 'cmd-theme-amoled',
      title: 'Switch to AMOLED Theme',
      category: 'Appearance',
      icon: <SunMoon size={14} className="text-neutral-400" />,
      action: () => updateSetting('theme', 'amoled')
    },
    {
      id: 'cmd-lock',
      title: 'Lock Notes Application',
      category: 'Security',
      icon: <Key size={14} className="text-rose-400" />,
      action: () => lockApp()
    },
    {
      id: 'cmd-backup',
      title: 'Trigger Manual Workspace Backup',
      category: 'Data Management',
      icon: <Database size={14} className="text-violet-400" />,
      action: () => triggerBackup('manual')
    }
  ], [createNote, openTab, updateSetting, lockApp, triggerBackup]);

  // Combine matching notes and commands based on search
  const filteredItems = React.useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) {
      // Default to commands and first 5 notes
      const initialNotes = notes.filter(n => n.is_deleted === 0).slice(0, 5).map(n => ({
        id: n.id,
        title: n.title || 'Untitled Note',
        category: 'Notes',
        icon: <FileText size={14} className="text-blue-400" />,
        action: () => openTab(n.id)
      }));
      return [...commands, ...initialNotes];
    }

    const matchedCommands = commands.filter(cmd => 
      cmd.title.toLowerCase().includes(q) || cmd.category.toLowerCase().includes(q)
    );

    const matchedNotes = notes.filter(n => 
      n.is_deleted === 0 && (
        (n.title || '').toLowerCase().includes(q) || (n.plain_text || '').toLowerCase().includes(q)
      )
    ).map(n => ({
      id: n.id,
      title: n.title || 'Untitled Note',
      category: 'Notes',
      icon: <FileText size={14} className="text-blue-400" />,
      action: () => openTab(n.id)
    }));

    return [...matchedCommands, ...matchedNotes];
  }, [query, notes, commands, openTab]);

  // Keyboard navigation listener
  React.useEffect(() => {
    const handleKeyDownGlobal = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        setCommandPaletteOpen(!isCommandPaletteOpen);
      }
    };

    window.addEventListener('keydown', handleKeyDownGlobal);
    return () => window.removeEventListener('keydown', handleKeyDownGlobal);
  }, [isCommandPaletteOpen, setCommandPaletteOpen]);

  React.useEffect(() => {
    if (isCommandPaletteOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isCommandPaletteOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % filteredItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filteredItems.length) % filteredItems.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        filteredItems[selectedIndex].action();
        setCommandPaletteOpen(false);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setCommandPaletteOpen(false);
    }
  };

  return (
    <AnimatePresence>
      {isCommandPaletteOpen && (
        <>
          {/* Overlay backdrop */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setCommandPaletteOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          {/* Dialog Panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -20 }}
            transition={{ duration: 0.15 }}
            className="fixed left-1/2 top-[15%] -translate-x-1/2 w-full max-w-lg rounded-lg border shadow-2xl overflow-hidden z-50 text-sm font-sans"
            style={{ 
              backgroundColor: 'var(--bg-card)', 
              borderColor: 'var(--border-main)',
              color: 'var(--text-primary)'
            }}
          >
            {/* Input search */}
            <div className="flex items-center border-b px-3 py-2.5 gap-2" style={{ borderColor: 'var(--border-main)' }}>
              <Search size={16} className="text-neutral-500 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Search notes, commands, settings..."
                className="w-full bg-transparent outline-none text-sm placeholder-neutral-500 text-neutral-200"
              />
              <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-[10px] text-neutral-400">ESC</kbd>
            </div>

            {/* List Results */}
            <div className="max-h-[300px] overflow-y-auto p-1.5 space-y-0.5">
              {filteredItems.length === 0 ? (
                <div className="text-xs text-neutral-500 py-6 text-center italic">
                  No matching notes or commands found.
                </div>
              ) : (
                filteredItems.map((item, idx) => (
                  <div
                    key={item.id}
                    onClick={() => {
                      item.action();
                      setCommandPaletteOpen(false);
                    }}
                    className={`flex items-center justify-between px-3 py-2 rounded cursor-pointer transition-all ${
                      idx === selectedIndex 
                        ? 'bg-violet-600 text-white font-medium shadow-sm' 
                        : 'hover:bg-neutral-800/40 text-neutral-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {item.icon}
                      <span className="truncate">{item.title}</span>
                    </div>
                    <span 
                      className={`text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded ${
                        idx === selectedIndex
                          ? 'text-white bg-violet-700/60'
                          : 'text-neutral-500 bg-neutral-800'
                      }`}
                    >
                      {item.category}
                    </span>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

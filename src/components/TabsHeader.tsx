import React from 'react';
import { useLayoutStore } from '../store/layoutStore';
import { useNotesStore } from '../store/notesStore';
import { FileText, X, Pin, Star } from 'lucide-react';

interface TabsHeaderProps {
  inSplit?: boolean;
}

export const TabsHeader: React.FC<TabsHeaderProps> = ({ inSplit = false }) => {
  const { 
    tabs, 
    activeTabId, 
    splitTabs, 
    activeSplitTabId, 
    setActiveTabId, 
    closeTab 
  } = useLayoutStore();
  
  const { notes } = useNotesStore();

  const openTabsList = inSplit ? splitTabs : tabs;
  const activeId = inSplit ? activeSplitTabId : activeTabId;

  const handleSelectTab = (id: string) => {
    setActiveTabId(id, inSplit);
  };

  const handleCloseTab = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    closeTab(id, inSplit);
  };

  if (openTabsList.length === 0) return null;

  return (
    <div 
      className="flex items-center overflow-x-auto select-none border-b shrink-0 text-xs gap-[1px]"
      style={{ 
        backgroundColor: 'var(--bg-sidebar)', 
        borderColor: 'var(--border-main)',
        scrollbarWidth: 'none' // Hide scrollbar Firefox
      }}
    >
      {openTabsList.map((tabId) => {
        const note = notes.find(n => n.id === tabId);
        const isActive = tabId === activeId;
        if (!note) return null;

        return (
          <div
            key={tabId}
            onClick={() => handleSelectTab(tabId)}
            className={`flex items-center gap-1.5 px-3 py-2 cursor-pointer border-r relative transition-colors ${
              isActive 
                ? 'bg-neutral-900 text-white font-medium border-t-2 border-t-violet-500' 
                : 'hover:bg-neutral-800/40 text-neutral-400'
            }`}
            style={{ 
              backgroundColor: isActive ? 'var(--bg-app)' : 'transparent',
              borderColor: 'var(--border-main)',
              borderTopColor: isActive ? 'var(--accent)' : 'var(--border-main)'
            }}
          >
            <FileText size={12} className={isActive ? 'text-violet-400' : 'text-neutral-500'} />
            <span className="max-w-[120px] truncate">{note.title || 'Untitled Note'}</span>
            
            {/* Pin/Fav status icons */}
            <div className="flex items-center gap-0.5 shrink-0 scale-75">
              {note.is_pinned === 1 && <Pin size={10} className="text-amber-500 fill-amber-500" />}
              {note.is_favorite === 1 && <Star size={10} className="text-rose-500 fill-rose-500" />}
            </div>

            {/* Close Button */}
            <button
              onClick={(e) => handleCloseTab(e, tabId)}
              className="p-0.5 hover:bg-neutral-700 rounded text-neutral-500 hover:text-neutral-200 transition-colors ml-1"
            >
              <X size={10} />
            </button>
          </div>
        );
      })}
    </div>
  );
};

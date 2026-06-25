import React from 'react';
import { useWorkspaceStore } from '../store/workspaceStore';
import { useNotesStore } from '../store/notesStore';
import type { SpecialFilterType } from '../store/notesStore';
import { useLayoutStore } from '../store/layoutStore';
import { FolderTree } from './FolderTree';
import { 
  Pin, 
  Star, 
  Archive, 
  Trash2, 
  Settings, 
  Clock, 
  Tag as TagIcon, 
  Plus,
  Search
} from 'lucide-react';
import { showToast } from '../services/tauriBridge';

interface SidebarProps {
  onOpenSettings: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onOpenSettings }) => {
  const { settings, updateSetting, hasSetupPasscode } = useWorkspaceStore();
  const { 
    notes, 
    tags, 
    createTag, 
    deleteTag,
    specialFilter, 
    setSpecialFilter,
    selectedFolderId,
    selectedTagId,
    setFilterTag,
    createNote,
    searchQuery,
    setSearchQuery
  } = useNotesStore();
  
  const { isSidebarOpen, openTab } = useLayoutStore();

  const [resizing, setResizing] = React.useState(false);
  const sidebarRef = React.useRef<HTMLDivElement>(null);

  // Drag resizer handlers
  React.useEffect(() => {
    if (!resizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (sidebarRef.current) {
        const newWidth = Math.max(180, Math.min(450, e.clientX));
        updateSetting('sidebarWidth', newWidth);
      }
    };

    const handleMouseUp = () => {
      setResizing(false);
      document.body.style.cursor = 'default';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setResizing(true);
    document.body.style.cursor = 'col-resize';
  };

  const handleCreateNewTag = async () => {
    const name = prompt("Enter new tag name:");
    if (!name?.trim()) return;

    // Pick random color
    const colors = ['#f43f5e', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    await createTag(name.trim(), color);
    showToast(`Tag #${name} created`, 'success');
  };

  const handleCreateNoteAtRoot = async () => {
    const id = await createNote(null);
    openTab(id);
  };

  // Helper counting
  const getNoteCount = (filterType: SpecialFilterType) => {
    switch (filterType) {
      case 'pinned': return notes.filter(n => n.is_pinned === 1 && n.is_deleted === 0 && n.is_archived === 0).length;
      case 'favorites': return notes.filter(n => n.is_favorite === 1 && n.is_deleted === 0 && n.is_archived === 0).length;
      case 'archived': return notes.filter(n => n.is_archived === 1 && n.is_deleted === 0).length;
      case 'trash': return notes.filter(n => n.is_deleted === 1).length;
      default: return 0;
    }
  };

  if (!isSidebarOpen) return null;

  return (
    <div 
      ref={sidebarRef}
      className="h-full flex relative select-none shrink-0"
      style={{ 
        width: `${settings.sidebarWidth}px`,
        backgroundColor: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border-main)'
      }}
    >
      <div className="flex-1 flex flex-col h-full overflow-hidden py-3 px-2 text-sm">
        
        {/* Quick actions row */}
        <div className="flex items-center gap-1.5 mb-2">
          <button 
            onClick={handleCreateNoteAtRoot}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded bg-violet-600 hover:bg-violet-500 font-medium text-white shadow-sm transition-colors text-xs"
          >
            <Plus size={14} /> New Note
          </button>
        </div>

        {/* Sidebar Search Input */}
        <div className="px-1 mb-4 shrink-0">
          <div className="relative flex items-center bg-neutral-950/40 border border-neutral-800 rounded px-2.5 py-1.5 hover:border-neutral-700/80 focus-within:border-violet-500/80 transition-colors" style={{ borderColor: 'var(--border-main)' }}>
            <Search size={12} className="text-neutral-500 mr-2 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notes..."
              className="bg-transparent text-xs outline-none w-full text-neutral-300 placeholder-neutral-500"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="text-[10px] text-neutral-500 hover:text-neutral-300 font-bold ml-1.5 cursor-pointer"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Section 1: Smart Collections */}
        <div className="space-y-0.5 mb-4 shrink-0">
          <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-500 px-2 block mb-1">Collections</span>
          
          <button
            onClick={() => setSpecialFilter(null)}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs transition-colors ${
              specialFilter === null && !selectedFolderId && !selectedTagId
                ? 'bg-neutral-800 text-white font-medium'
                : 'hover:bg-neutral-800/40 text-neutral-400'
            }`}
          >
            <div className="flex items-center gap-2">
              <Clock size={13} className="text-violet-400" />
              <span>All Notes</span>
            </div>
            <span className="text-[10px] opacity-60">{notes.filter(n => n.is_deleted === 0 && n.is_archived === 0).length}</span>
          </button>

          <button
            onClick={() => setSpecialFilter('pinned')}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs transition-colors ${
              specialFilter === 'pinned' ? 'bg-neutral-800 text-white font-medium' : 'hover:bg-neutral-800/40 text-neutral-400'
            }`}
          >
            <div className="flex items-center gap-2">
              <Pin size={13} className="text-amber-400 fill-amber-400/20" />
              <span>Pinned</span>
            </div>
            <span className="text-[10px] opacity-60">{getNoteCount('pinned')}</span>
          </button>

          <button
            onClick={() => setSpecialFilter('favorites')}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs transition-colors ${
              specialFilter === 'favorites' ? 'bg-neutral-800 text-white font-medium' : 'hover:bg-neutral-800/40 text-neutral-400'
            }`}
          >
            <div className="flex items-center gap-2">
              <Star size={13} className="text-rose-400 fill-rose-400/20" />
              <span>Favorites</span>
            </div>
            <span className="text-[10px] opacity-60">{getNoteCount('favorites')}</span>
          </button>

          <button
            onClick={() => setSpecialFilter('archived')}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs transition-colors ${
              specialFilter === 'archived' ? 'bg-neutral-800 text-white font-medium' : 'hover:bg-neutral-800/40 text-neutral-400'
            }`}
          >
            <div className="flex items-center gap-2">
              <Archive size={13} className="text-emerald-400" />
              <span>Archived</span>
            </div>
            <span className="text-[10px] opacity-60">{getNoteCount('archived')}</span>
          </button>

          <button
            onClick={() => setSpecialFilter('trash')}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs transition-colors ${
              specialFilter === 'trash' ? 'bg-neutral-800 text-white font-medium' : 'hover:bg-neutral-800/40 text-neutral-400'
            }`}
          >
            <div className="flex items-center gap-2">
              <Trash2 size={13} className="text-red-400" />
              <span>Trash Bin</span>
            </div>
            <span className="text-[10px] opacity-60">{getNoteCount('trash')}</span>
          </button>
        </div>

        <div className="h-[1px] bg-neutral-800 my-2" style={{ backgroundColor: 'var(--border-main)' }} />

        {/* Section 2: Folders Tree */}
        <FolderTree />

        <div className="h-[1px] bg-neutral-800 my-2" style={{ backgroundColor: 'var(--border-main)' }} />

        {/* Section 3: Tags List */}
        <div className="shrink-0 max-h-40 flex flex-col mb-4">
          <div className="flex items-center justify-between px-2 mb-1.5">
            <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-500">Tags</span>
            <button 
              onClick={handleCreateNewTag}
              className="p-1 hover:bg-neutral-800 rounded text-neutral-500 hover:text-neutral-200 transition-colors"
              title="Add Tag"
            >
              <Plus size={13} />
            </button>
          </div>

          <div className="overflow-y-auto flex flex-wrap gap-1 px-2 pb-1">
            {tags.length === 0 ? (
              <span className="text-[10px] text-neutral-600 italic">No tags</span>
            ) : (
              tags.map((tag) => (
                <div 
                  key={tag.id}
                  onClick={() => setFilterTag(tag.id)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium cursor-pointer transition-all border group ${
                    selectedTagId === tag.id
                      ? 'text-white'
                      : 'hover:bg-neutral-800'
                  }`}
                  style={{ 
                    borderColor: tag.color,
                    backgroundColor: selectedTagId === tag.id ? tag.color : 'transparent',
                    color: selectedTagId === tag.id ? '#fff' : tag.color
                  }}
                >
                  <TagIcon size={8} />
                  <span>{tag.name}</span>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete tag #${tag.name}?`)) {
                        deleteTag(tag.id);
                      }
                    }}
                    className="opacity-0 group-hover:opacity-100 hover:text-white transition-opacity ml-1"
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Section 4: Footer Operations */}
        <div className="mt-auto shrink-0 space-y-1">
          <div className="h-[1px] bg-neutral-800 my-2" style={{ backgroundColor: 'var(--border-main)' }} />
          
          <div className="flex items-center justify-between px-2">
            <button
              onClick={onOpenSettings}
              className="p-1.5 hover:bg-neutral-800 rounded text-neutral-400 hover:text-neutral-200 transition-colors flex items-center gap-2 text-xs"
              title="Open Settings"
            >
              <Settings size={14} /> Settings
            </button>

            {hasSetupPasscode && (
              <span className="flex items-center gap-1.5 text-[10px] text-emerald-500 font-medium px-2 py-0.5 rounded bg-emerald-500/10">
                Encrypted
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Resize Handle Drag Area */}
      <div 
        onMouseDown={handleMouseDown}
        className="w-1 absolute right-0 top-0 bottom-0 cursor-col-resize hover:bg-violet-500/50 active:bg-violet-500 transition-colors z-20"
      />
    </div>
  );
};

import React from 'react';
import { useNotesStore } from '../store/notesStore';
import { useLayoutStore } from '../store/layoutStore';
import * as db from '../services/db';
import { 
  ChevronRight, 
  ChevronDown, 
  Folder, 
  FolderPlus, 
  FilePlus, 
  MoreVertical,
  Trash2, 
  Edit3, 
  Paintbrush, 
  FileText,
  Pin,
  Star
} from 'lucide-react';
import { showToast } from '../services/tauriBridge';

interface FolderNodeProps {
  folder: db.Folder;
  depth: number;
}

const COLOR_PALETTE = [
  '#6366f1', // Indigo
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#f43f5e', // Rose
  '#f59e0b', // Amber
  '#8b5cf6', // Violet
  '#ef4444', // Red
  '#ec4899', // Pink
];

export const FolderNode: React.FC<FolderNodeProps> = ({ folder, depth }) => {
  const { 
    folders, 
    notes, 
    activeNoteId, 
    createNote, 
    createFolder, 
    renameFolder, 
    deleteFolder, 
    moveFolder, 
    updateFolderMeta,
    selectedFolderId,
    setFilterFolder,
    specialFilter,
    selectedTagId,
    searchQuery,
    noteTags
  } = useNotesStore();
  const { openTab } = useLayoutStore();

  const [isEditing, setIsEditing] = React.useState(false);
  const [editName, setEditName] = React.useState(folder.name);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [colorPickerOpen, setColorPickerOpen] = React.useState(false);

  // Filter function for notes
  const filterNoteFn = React.useCallback((n: db.Note) => {
    if (specialFilter === 'trash') {
      if (n.is_deleted !== 1) return false;
    } else if (specialFilter === 'archived') {
      if (n.is_archived !== 1 || n.is_deleted === 1) return false;
    } else {
      if (n.is_deleted === 1 || n.is_archived === 1) return false;
      if (specialFilter === 'pinned' && n.is_pinned !== 1) return false;
      if (specialFilter === 'favorites' && n.is_favorite !== 1) return false;
    }

    if (selectedTagId) {
      const tagIds = noteTags[n.id] || [];
      if (!tagIds.includes(selectedTagId)) return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const titleMatch = (n.title || '').toLowerCase().includes(q);
      const plainTextMatch = (n.plain_text || '').toLowerCase().includes(q);
      if (!titleMatch && !plainTextMatch) return false;
    }

    return true;
  }, [specialFilter, selectedTagId, searchQuery, noteTags]);

  // Recursive match checker for folders
  const folderHasMatches = React.useCallback((fid: string): boolean => {
    const hasMatchingNotes = notes.some(n => n.folder_id === fid && filterNoteFn(n));
    if (hasMatchingNotes) return true;

    const subDirs = folders.filter(f => f.parent_id === fid);
    return subDirs.some(sub => folderHasMatches(sub.id));
  }, [notes, folders, filterNoteFn]);

  const shouldRenderFolder = React.useMemo(() => {
    // If no filter is active, show everything
    const hasActiveFilter = !!(searchQuery.trim() || specialFilter || selectedTagId);
    if (!hasActiveFilter) return true;

    // Check name match
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      if (folder.name.toLowerCase().includes(q)) return true;
    }

    return folderHasMatches(folder.id);
  }, [folder.id, folder.name, searchQuery, specialFilter, selectedTagId, folderHasMatches]);

  if (!shouldRenderFolder) return null;

  // Auto-expand folder if there is active search query and this folder has matching notes/subfolders
  const hasActiveFilter = !!(searchQuery.trim() || specialFilter || selectedTagId);
  const isExpanded = folder.is_expanded === 1 || (hasActiveFilter && folderHasMatches(folder.id));

  // Find child folders
  const childFolders = folders.filter(f => f.parent_id === folder.id);
  // Find notes inside this folder
  const folderNotes = notes.filter(n => n.folder_id === folder.id && filterNoteFn(n));

  const toggleExpand = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await updateFolderMeta(folder.id, { is_expanded: folder.is_expanded === 1 ? 0 : 1 });
  };

  const handleSelect = () => {
    setFilterFolder(folder.id);
  };

  const handleRename = async () => {
    if (editName.trim() && editName !== folder.name) {
      await renameFolder(folder.id, editName.trim());
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleRename();
    if (e.key === 'Escape') {
      setEditName(folder.name);
      setIsEditing(false);
    }
  };

  const handleCreateSubFolder = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const name = prompt("Enter subfolder name:");
    if (name?.trim()) {
      await createFolder(name.trim(), folder.id, folder.color);
      // Ensure folder is expanded to see subfolder
      if (folder.is_expanded === 0) {
        await updateFolderMeta(folder.id, { is_expanded: 1 });
      }
    }
  };

  const handleCreateNote = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const nid = await createNote(folder.id);
    openTab(nid);
    if (folder.is_expanded === 0) {
      await updateFolderMeta(folder.id, { is_expanded: 1 });
    }
  };

  // --- HTML5 Native Drag & Drop Handlers ---
  const handleDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    e.dataTransfer.setData('application/koda-folder-id', folder.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Add hover styles
    e.currentTarget.classList.add('bg-neutral-800/50');
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('bg-neutral-800/50');
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('bg-neutral-800/50');

    const draggedFolderId = e.dataTransfer.getData('application/koda-folder-id');
    const draggedNoteId = e.dataTransfer.getData('application/koda-note-id');

    if (draggedFolderId) {
      // Moving folder inside folder (nesting)
      await moveFolder(draggedFolderId, folder.id);
    } else if (draggedNoteId) {
      // Moving note inside folder
      const { updateNote } = useNotesStore.getState();
      await updateNote(draggedNoteId, { folder_id: folder.id });
      showToast("Note moved inside folder", "success");
    }
  };

  const handleNoteDragStart = (e: React.DragEvent, noteId: string) => {
    e.stopPropagation();
    e.dataTransfer.setData('application/koda-note-id', noteId);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="select-none text-neutral-300">
      {/* Folder Header Item */}
      <div
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleSelect}
        className={`group flex items-center justify-between py-1 px-2 rounded cursor-pointer transition-all ${
          selectedFolderId === folder.id
            ? 'bg-neutral-800 text-white font-medium border-l-2'
            : 'hover:bg-neutral-800/40 text-neutral-400'
        }`}
        style={{ 
          paddingLeft: `${depth * 8 + 8}px`,
          borderLeftColor: selectedFolderId === folder.id ? folder.color : 'transparent'
        }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <button 
            onClick={toggleExpand}
            className="p-0.5 hover:bg-neutral-700 rounded transition-colors text-neutral-500 hover:text-neutral-300"
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          
          <Folder size={14} style={{ color: folder.color }} className="shrink-0" />
          
          {isEditing ? (
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleRename}
              onKeyDown={handleKeyDown}
              className="bg-neutral-800 border border-neutral-700 text-xs px-1 rounded text-white outline-none w-28"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="text-xs truncate">{folder.name}</span>
          )}
        </div>

        {/* Hover Operations */}
        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity relative">
          <button 
            onClick={handleCreateNote} 
            className="p-1 hover:bg-neutral-700 rounded text-neutral-400 hover:text-neutral-200"
            title="Create Note in Folder"
          >
            <FilePlus size={11} />
          </button>
          <button 
            onClick={handleCreateSubFolder} 
            className="p-1 hover:bg-neutral-700 rounded text-neutral-400 hover:text-neutral-200"
            title="Create Subfolder"
          >
            <FolderPlus size={11} />
          </button>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(!menuOpen);
            }} 
            className="p-1 hover:bg-neutral-700 rounded text-neutral-400 hover:text-neutral-200"
            title="Folder Options"
          >
            <MoreVertical size={11} />
          </button>

          {/* Folder actions dropdown */}
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div 
                className="absolute right-0 top-6 w-36 bg-neutral-900 border border-neutral-800 rounded-md shadow-lg py-1 z-50 text-xs"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setIsEditing(true);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-neutral-800 flex items-center gap-2"
                >
                  <Edit3 size={12} /> Rename
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setColorPickerOpen(true);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-neutral-800 flex items-center gap-2"
                >
                  <Paintbrush size={12} /> Change Color
                </button>
                <hr className="border-neutral-800 my-1" />
                <button
                  onClick={() => {
                    if (confirm(`Are you sure you want to delete folder "${folder.name}" and all subfolders?`)) {
                      deleteFolder(folder.id);
                    }
                    setMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-neutral-800 text-red-400 flex items-center gap-2"
                >
                  <Trash2 size={12} /> Delete Folder
                </button>
              </div>
            </>
          )}

          {/* Color picker popup */}
          {colorPickerOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setColorPickerOpen(false)} />
              <div 
                className="absolute right-0 top-6 p-2 bg-neutral-900 border border-neutral-800 rounded-md shadow-lg z-50 w-32 grid grid-cols-4 gap-1.5"
                onClick={(e) => e.stopPropagation()}
              >
                {COLOR_PALETTE.map((color) => (
                  <button
                    key={color}
                    onClick={async () => {
                      await updateFolderMeta(folder.id, { color });
                      setColorPickerOpen(false);
                    }}
                    className="w-5 h-5 rounded-full border border-neutral-700 hover:scale-110 transition-transform"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Children lists: folders & notes */}
      {isExpanded && (
        <div className="mt-0.5">
          {/* Render subfolders */}
          {childFolders.map((subFolder) => (
            <FolderNode key={subFolder.id} folder={subFolder} depth={depth + 1} />
          ))}

          {/* Render notes belonging to this folder */}
          {folderNotes.map((note) => (
            <div
              key={note.id}
              draggable
              onDragStart={(e) => handleNoteDragStart(e, note.id)}
              onClick={() => {
                openTab(note.id);
              }}
              className={`group flex items-center justify-between py-0.5 pr-2 pl-3 rounded cursor-pointer select-none text-[11px] font-light transition-all ${
                activeNoteId === note.id
                  ? 'bg-neutral-800/80 text-white border-r border-violet-500 font-medium'
                  : 'hover:bg-neutral-800/20 text-neutral-400 hover:text-neutral-200'
              }`}
              style={{ paddingLeft: `${depth * 8 + 26}px` }}
            >
              <div className="flex items-center gap-1.5 truncate">
                <FileText size={11} className="text-neutral-500 shrink-0" />
                <span className="truncate">{note.title || 'Untitled Note'}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                {note.is_pinned === 1 && <Pin size={9} className="text-amber-500 fill-amber-500" />}
                {note.is_favorite === 1 && <Star size={9} className="text-rose-500 fill-rose-500" />}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const FolderTree: React.FC = () => {
  const { 
    folders, 
    notes,
    activeNoteId,
    createFolder,
    specialFilter,
    selectedTagId,
    searchQuery,
    noteTags
  } = useNotesStore();
  const { openTab } = useLayoutStore();

  // Filter function for notes
  const filterNoteFn = React.useCallback((n: db.Note) => {
    if (specialFilter === 'trash') {
      if (n.is_deleted !== 1) return false;
    } else if (specialFilter === 'archived') {
      if (n.is_archived !== 1 || n.is_deleted === 1) return false;
    } else {
      if (n.is_deleted === 1 || n.is_archived === 1) return false;
      if (specialFilter === 'pinned' && n.is_pinned !== 1) return false;
      if (specialFilter === 'favorites' && n.is_favorite !== 1) return false;
    }

    if (selectedTagId) {
      const tagIds = noteTags[n.id] || [];
      if (!tagIds.includes(selectedTagId)) return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const titleMatch = (n.title || '').toLowerCase().includes(q);
      const plainTextMatch = (n.plain_text || '').toLowerCase().includes(q);
      if (!titleMatch && !plainTextMatch) return false;
    }

    return true;
  }, [specialFilter, selectedTagId, searchQuery, noteTags]);

  // Root folders (no parent)
  const rootFolders = folders.filter(f => f.parent_id === null);
  // Root notes (no folder)
  const rootNotes = notes.filter(n => n.folder_id === null && filterNoteFn(n));

  const handleCreateRootFolder = async () => {
    const name = prompt("Enter folder name:");
    if (name?.trim()) {
      await createFolder(name.trim(), null);
    }
  };

  const handleDragOverRoot = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.add('bg-neutral-800/10');
  };

  const handleDragLeaveRoot = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('bg-neutral-800/10');
  };

  const handleDropRoot = async (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove('bg-neutral-800/10');
    
    const draggedFolderId = e.dataTransfer.getData('application/koda-folder-id');
    const draggedNoteId = e.dataTransfer.getData('application/koda-note-id');

    if (draggedFolderId) {
      const { moveFolder } = useNotesStore.getState();
      await moveFolder(draggedFolderId, null);
    } else if (draggedNoteId) {
      const { updateNote } = useNotesStore.getState();
      await updateNote(draggedNoteId, { folder_id: null });
      showToast("Note moved to root", "success");
    }
  };

  return (
    <div 
      onDragOver={handleDragOverRoot}
      onDragLeave={handleDragLeaveRoot}
      onDrop={handleDropRoot}
      className="flex-1 flex flex-col min-h-[150px] transition-colors p-1"
    >
      <div className="flex items-center justify-between px-2 mb-1.5">
        <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-500">Folders</span>
        <button 
          onClick={handleCreateRootFolder}
          className="p-1 hover:bg-neutral-800 rounded text-neutral-500 hover:text-neutral-200 transition-colors"
          title="New Folder"
        >
          <FolderPlus size={13} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-0.5 animate-fade-in">
        {rootFolders.length === 0 && rootNotes.length === 0 ? (
          <div className="text-[11px] text-neutral-600 px-2 py-4 italic text-center select-none">
            No items in folders.
          </div>
        ) : (
          <>
            {rootFolders.map((folder) => (
              <FolderNode key={folder.id} folder={folder} depth={0} />
            ))}

            {rootNotes.map((note) => (
              <div
                key={note.id}
                draggable
                onDragStart={(e) => {
                  e.stopPropagation();
                  e.dataTransfer.setData('application/koda-note-id', note.id);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onClick={() => {
                  openTab(note.id);
                }}
                className={`group flex items-center justify-between py-1 pr-2 pl-3 rounded cursor-pointer select-none text-[11px] font-light transition-all ${
                  activeNoteId === note.id
                    ? 'bg-neutral-800/80 text-white border-r border-violet-500 font-medium'
                    : 'hover:bg-neutral-800/20 text-neutral-400 hover:text-neutral-200'
                }`}
                style={{ paddingLeft: '8px' }}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <FileText size={11} className="text-neutral-500 shrink-0" />
                  <span className="truncate">{note.title || 'Untitled Note'}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  {note.is_pinned === 1 && <Pin size={9} className="text-amber-500 fill-amber-500" />}
                  {note.is_favorite === 1 && <Star size={9} className="text-rose-500 fill-rose-500" />}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
};

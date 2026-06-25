import { create } from 'zustand';
import * as db from '../services/db';
import { showToast } from '../services/tauriBridge';

export type SpecialFilterType = 'pinned' | 'favorites' | 'archived' | 'trash' | 'recent_edited' | 'recent_opened' | null;

interface NotesState {
  notes: db.Note[];
  folders: db.Folder[];
  tags: db.Tag[];
  noteTags: Record<string, string[]>; // noteId -> tagIds[]
  
  // Navigation & Filtering
  activeNoteId: string | null;
  selectedFolderId: string | null;
  selectedTagId: string | null;
  specialFilter: SpecialFilterType;
  searchQuery: string;

  // Actions
  loadWorkspaceData: (workspaceId: string) => Promise<void>;
  setActiveNoteId: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  setFilterFolder: (id: string | null) => void;
  setFilterTag: (id: string | null) => void;
  setSpecialFilter: (filter: SpecialFilterType) => void;

  // Note actions
  createNote: (folderId?: string | null) => Promise<string>;
  updateNote: (noteId: string, fields: Partial<db.Note>) => Promise<void>;
  duplicateNote: (noteId: string) => Promise<string>;
  deleteNote: (noteId: string) => Promise<void>; // soft delete
  restoreNote: (noteId: string) => Promise<void>;
  permanentlyDeleteNote: (noteId: string) => Promise<void>;
  pinNote: (noteId: string, isPinned: boolean) => Promise<void>;
  favoriteNote: (noteId: string, isFavorite: boolean) => Promise<void>;
  archiveNote: (noteId: string, isArchived: boolean) => Promise<void>;

  // Folder actions
  createFolder: (name: string, parentId?: string | null, color?: string, icon?: string) => Promise<string>;
  renameFolder: (id: string, name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  moveFolder: (id: string, parentId: string | null) => Promise<void>;
  updateFolderMeta: (id: string, fields: Partial<Pick<db.Folder, 'color' | 'icon' | 'is_expanded'>>) => Promise<void>;

  // Tag actions
  createTag: (name: string, color: string) => Promise<string>;
  deleteTag: (id: string) => Promise<void>;
  updateTag: (id: string, fields: Partial<db.Tag>) => Promise<void>;
  addTagToNote: (noteId: string, tagId: string) => Promise<void>;
  removeTagFromNote: (noteId: string, tagId: string) => Promise<void>;

  // Version History
  saveNoteVersion: (noteId: string, content: string) => Promise<void>;
  restoreNoteVersion: (noteId: string, content: string) => Promise<void>;
}

export const useNotesStore = create<NotesState>((set, get) => ({
  notes: [],
  folders: [],
  tags: [],
  noteTags: {},
  
  activeNoteId: null,
  selectedFolderId: null,
  selectedTagId: null,
  specialFilter: null,
  searchQuery: '',

  loadWorkspaceData: async (workspaceId: string) => {
    const foldersList = await db.getFolders(workspaceId);
    const notesList = await db.getNotes(workspaceId);
    const tagsList = await db.getTags(workspaceId);

    // Map noteTags
    const noteTagsMap: Record<string, string[]> = {};
    for (const note of notesList) {
      const tagIds = await db.getNoteTags(note.id);
      noteTagsMap[note.id] = tagIds;
    }

    set({
      folders: foldersList,
      notes: notesList,
      tags: tagsList,
      noteTags: noteTagsMap,
      selectedFolderId: null,
      selectedTagId: null,
      specialFilter: null,
      searchQuery: '',
      activeNoteId: notesList.filter(n => n.is_deleted === 0 && n.is_archived === 0)[0]?.id || null
    });
  },

  setActiveNoteId: (id) => {
    set({ activeNoteId: id });
    if (id) {
      // Touch last opened state or add to recent lists (in App UI logic)
      const note = get().notes.find(n => n.id === id);
      if (note) {
        get().updateNote(id, { updated_at: Date.now() }); // touches updated_at to bring it to top of recent files
      }
    }
  },

  setSearchQuery: (query) => set({ searchQuery: query }),
  setFilterFolder: (id) => set({ selectedFolderId: id, selectedTagId: null, specialFilter: null }),
  setFilterTag: (id) => set({ selectedTagId: id, selectedFolderId: null, specialFilter: null }),
  setSpecialFilter: (filter) => set({ specialFilter: filter, selectedFolderId: null, selectedTagId: null }),

  // ================= NOTES ACTIONS =================
  createNote: async (folderId = null) => {
    const activeWorkspaceId = localStorage.getItem('koda_active_workspace') || 'default-workspace';
    const noteId = crypto.randomUUID();
    const newNote: db.Note = {
      id: noteId,
      workspace_id: activeWorkspaceId,
      folder_id: folderId,
      title: 'Untitled Note',
      content: '<p></p>',
      plain_text: '',
      is_pinned: 0,
      is_favorite: 0,
      is_archived: 0,
      is_deleted: 0,
      deleted_at: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      is_read_only: 0,
      editor_mode: 'text'
    };

    await db.saveNote(newNote);
    
    set((state) => ({
      notes: [newNote, ...state.notes],
      activeNoteId: noteId,
      noteTags: { ...state.noteTags, [noteId]: [] }
    }));

    return noteId;
  },

  updateNote: async (noteId, fields) => {
    const notesList = get().notes;
    const targetIndex = notesList.findIndex(n => n.id === noteId);
    if (targetIndex === -1) return;

    const updatedNote = {
      ...notesList[targetIndex],
      ...fields,
      updated_at: Date.now()
    };

    // Save changes to DB
    await db.saveNote(updatedNote);

    // If content is modified, schedule historical versions on actual editor blur (handled by editor component)
    set((state) => {
      const copy = [...state.notes];
      copy[targetIndex] = updatedNote;
      return { notes: copy };
    });
  },

  duplicateNote: async (noteId) => {
    const note = get().notes.find(n => n.id === noteId);
    if (!note) return '';

    const newId = crypto.randomUUID();
    const copy: db.Note = {
      ...note,
      id: newId,
      title: `${note.title} (Copy)`,
      created_at: Date.now(),
      updated_at: Date.now(),
      is_pinned: 0,
      is_favorite: 0
    };

    await db.saveNote(copy);
    
    // Duplicate tag associations
    const sourceTags = get().noteTags[noteId] || [];
    for (const tid of sourceTags) {
      await db.addNoteTag(newId, tid);
    }

    set((state) => ({
      notes: [copy, ...state.notes],
      activeNoteId: newId,
      noteTags: { ...state.noteTags, [newId]: [...sourceTags] }
    }));

    showToast(`Duplicated "${note.title}"`, 'success');
    return newId;
  },

  deleteNote: async (noteId) => {
    // Soft Delete (move to Trash)
    await get().updateNote(noteId, { is_deleted: 1, deleted_at: Date.now() });
    
    // If active note was deleted, select another active note
    if (get().activeNoteId === noteId) {
      const remaining = get().notes.filter(n => n.id !== noteId && n.is_deleted === 0 && n.is_archived === 0);
      set({ activeNoteId: remaining[0]?.id || null });
    }
    
    showToast("Note moved to Trash Bin", "info");
  },

  restoreNote: async (noteId) => {
    await get().updateNote(noteId, { is_deleted: 0, deleted_at: null });
    set({ activeNoteId: noteId });
    showToast("Note restored from Trash", "success");
  },

  permanentlyDeleteNote: async (noteId) => {
    await db.deleteNote(noteId);
    
    // Cleanup associations
    const noteTags = { ...get().noteTags };
    delete noteTags[noteId];

    // Cleanup version histories and attachments inside db in parallel
    const dbInstance = await db.initDB();
    const tx = dbInstance.transaction(['note_tags', 'version_history', 'attachments'], 'readwrite');
    
    // Delete note tags
    const ntStore = tx.objectStore('note_tags');
    const ntIdx = ntStore.index('note_id');
    ntIdx.openCursor(IDBKeyRange.only(noteId)).onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (cursor) { cursor.delete(); cursor.continue(); }
    };

    // Delete version history
    const vStore = tx.objectStore('version_history');
    const vIdx = vStore.index('note_id');
    vIdx.openCursor(IDBKeyRange.only(noteId)).onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (cursor) { cursor.delete(); cursor.continue(); }
    };

    // Delete attachments
    const aStore = tx.objectStore('attachments');
    const aIdx = aStore.index('note_id');
    aIdx.openCursor(IDBKeyRange.only(noteId)).onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (cursor) { cursor.delete(); cursor.continue(); }
    };

    set((state) => ({
      notes: state.notes.filter(n => n.id !== noteId),
      noteTags
    }));

    showToast("Note deleted permanently", "success");
  },

  pinNote: async (noteId, isPinned) => {
    await get().updateNote(noteId, { is_pinned: isPinned ? 1 : 0 });
  },

  favoriteNote: async (noteId, isFavorite) => {
    await get().updateNote(noteId, { is_favorite: isFavorite ? 1 : 0 });
  },

  archiveNote: async (noteId, isArchived) => {
    await get().updateNote(noteId, { is_archived: isArchived ? 1 : 0 });
    
    if (isArchived && get().activeNoteId === noteId) {
      const remaining = get().notes.filter(n => n.id !== noteId && n.is_deleted === 0 && n.is_archived === 0);
      set({ activeNoteId: remaining[0]?.id || null });
    }
  },

  // ================= FOLDER ACTIONS =================
  createFolder: async (name, parentId = null, color = '#6366f1', icon = 'Folder') => {
    const activeWorkspaceId = localStorage.getItem('koda_active_workspace') || 'default-workspace';
    const folderId = crypto.randomUUID();
    const newFolder: db.Folder = {
      id: folderId,
      workspace_id: activeWorkspaceId,
      parent_id: parentId,
      name,
      color,
      icon,
      is_expanded: 1,
      created_at: Date.now()
    };

    await db.saveFolder(newFolder);
    set((state) => ({ folders: [...state.folders, newFolder] }));
    showToast(`Folder "${name}" created`, 'success');
    return folderId;
  },

  renameFolder: async (id, name) => {
    const target = get().folders.find(f => f.id === id);
    if (!target) return;

    const updated = { ...target, name };
    await db.saveFolder(updated);

    set((state) => ({
      folders: state.folders.map(f => f.id === id ? updated : f)
    }));
    showToast("Folder renamed", "success");
  },

  deleteFolder: async (id) => {
    // Delete folder and its nested items.
    // Gather all child folders recursively
    const foldersList = get().folders;
    const findSubFolders = (fid: string): string[] => {
      const subs = foldersList.filter(f => f.parent_id === fid).map(f => f.id);
      return [fid, ...subs.flatMap(sub => findSubFolders(sub))];
    };

    const foldersToDelete = findSubFolders(id);

    // Save changes inside DB and state
    for (const fid of foldersToDelete) {
      await db.deleteFolder(fid);
    }

    // Soft-delete notes belonging to these folders
    const notesToTrash = get().notes.filter(n => n.folder_id && foldersToDelete.includes(n.folder_id));
    for (const note of notesToTrash) {
      await get().deleteNote(note.id);
    }

    set((state) => ({
      folders: state.folders.filter(f => !foldersToDelete.includes(f.id)),
      selectedFolderId: state.selectedFolderId === id ? null : state.selectedFolderId
    }));

    showToast("Folder deleted", "info");
  },

  moveFolder: async (id, parentId) => {
    // Prevent cycles
    if (id === parentId) return;
    
    // Cycle check recursively
    const foldersList = get().folders;
    const isDescendant = (parent: string, child: string): boolean => {
      const item = foldersList.find(f => f.id === child);
      if (!item || !item.parent_id) return false;
      if (item.parent_id === parent) return true;
      return isDescendant(parent, item.parent_id);
    };

    if (parentId && isDescendant(id, parentId)) {
      showToast("Cannot move a folder into its own subfolder", "error");
      return;
    }

    const target = foldersList.find(f => f.id === id);
    if (!target) return;

    const updated = { ...target, parent_id: parentId };
    await db.saveFolder(updated);

    set((state) => ({
      folders: state.folders.map(f => f.id === id ? updated : f)
    }));
    showToast("Folder structure updated", "success");
  },

  updateFolderMeta: async (id, fields) => {
    const target = get().folders.find(f => f.id === id);
    if (!target) return;

    const updated = { ...target, ...fields };
    await db.saveFolder(updated);

    set((state) => ({
      folders: state.folders.map(f => f.id === id ? updated : f)
    }));
  },

  // ================= TAG ACTIONS =================
  createTag: async (name, color) => {
    const activeWorkspaceId = localStorage.getItem('koda_active_workspace') || 'default-workspace';
    const tagId = crypto.randomUUID();
    const newTag: db.Tag = {
      id: tagId,
      workspace_id: activeWorkspaceId,
      name,
      color,
      is_favorite: 0
    };

    await db.saveTag(newTag);
    set((state) => ({ tags: [...state.tags, newTag] }));
    return tagId;
  },

  deleteTag: async (id) => {
    await db.deleteTag(id);
    
    // Clean state tag list and tags mapping
    const cleanNoteTags: Record<string, string[]> = {};
    Object.keys(get().noteTags).forEach(nid => {
      cleanNoteTags[nid] = get().noteTags[nid].filter(tid => tid !== id);
    });

    set((state) => ({
      tags: state.tags.filter(t => t.id !== id),
      noteTags: cleanNoteTags,
      selectedTagId: state.selectedTagId === id ? null : state.selectedTagId
    }));

    showToast("Tag deleted", "info");
  },

  updateTag: async (id, fields) => {
    const target = get().tags.find(t => t.id === id);
    if (!target) return;

    const updated = { ...target, ...fields };
    await db.saveTag(updated);

    set((state) => ({
      tags: state.tags.map(t => t.id === id ? updated : t)
    }));
  },

  addTagToNote: async (noteId, tagId) => {
    await db.addNoteTag(noteId, tagId);
    set((state) => {
      const tags = state.noteTags[noteId] || [];
      if (!tags.includes(tagId)) {
        return {
          noteTags: { ...state.noteTags, [noteId]: [...tags, tagId] }
        };
      }
      return {};
    });
  },

  removeTagFromNote: async (noteId, tagId) => {
    await db.removeNoteTag(noteId, tagId);
    set((state) => ({
      noteTags: {
        ...state.noteTags,
        [noteId]: (state.noteTags[noteId] || []).filter(tid => tid !== tagId)
      }
    }));
  },

  // ================= VERSION HISTORY ACTIONS =================
  saveNoteVersion: async (noteId, content) => {
    // Write new history version to db
    const version: db.VersionHistory = {
      id: crypto.randomUUID(),
      note_id: noteId,
      content,
      updated_at: Date.now()
    };
    await db.saveVersion(version);
  },

  restoreNoteVersion: async (noteId, content) => {
    await get().updateNote(noteId, { content });
    showToast("Restored historical note version", "success");
  }
}));

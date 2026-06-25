/**
 * Database Service
 * Implements a local IndexedDB persistence layer.
 * Written with standard async transactions to resemble SQL operations.
 */

import { showToast } from './tauriBridge';

const DB_NAME = 'koda_notes_db';
const DB_VERSION = 1;

let dbInstance: IDBDatabase | null = null;

// Interfaces mapping to database schema
export interface Workspace {
  id: string;
  name: string;
  created_at: number;
}

export interface Folder {
  id: string;
  workspace_id: string;
  parent_id: string | null;
  name: string;
  color: string;
  icon: string;
  is_expanded: number; // 0 or 1
  created_at: number;
}

export interface Note {
  id: string;
  workspace_id: string;
  folder_id: string | null;
  title: string;
  content: string; // Tiptap HTML content
  plain_text: string; // For text search
  is_pinned: number; // 0 or 1
  is_favorite: number; // 0 or 1
  is_archived: number; // 0 or 1
  is_deleted: number; // 0 or 1 (soft delete for Trash)
  deleted_at: number | null;
  created_at: number;
  updated_at: number;
  is_read_only: number; // 0 or 1
  editor_mode?: 'text' | 'scratchpad';
  drawing_data?: string;
}

export interface Tag {
  id: string;
  workspace_id: string;
  name: string;
  color: string;
  is_favorite: number; // 0 or 1
}

export interface NoteTag {
  note_id: string;
  tag_id: string;
}

export interface VersionHistory {
  id: string;
  note_id: string;
  content: string;
  updated_at: number;
}

export interface Attachment {
  id: string;
  note_id: string;
  name: string;
  type: string;
  size: number;
  data: string; // base64 string or blob URI
  created_at: number;
}

export interface BackupRecord {
  id: string;
  workspace_id: string;
  name: string;
  created_at: number;
  type: 'auto' | 'manual';
  data: string; // JSON backup representation
}

// Initialise DB
export function initDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (e) => {
      console.error('Failed to open IndexedDB:', e);
      reject(e);
    };

    request.onsuccess = (e) => {
      dbInstance = (e.target as IDBOpenDBRequest).result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;

      // Create object stores
      if (!db.objectStoreNames.contains('workspaces')) {
        db.createObjectStore('workspaces', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('folders')) {
        const store = db.createObjectStore('folders', { keyPath: 'id' });
        store.createIndex('workspace_id', 'workspace_id', { unique: false });
      }

      if (!db.objectStoreNames.contains('notes')) {
        const store = db.createObjectStore('notes', { keyPath: 'id' });
        store.createIndex('workspace_id', 'workspace_id', { unique: false });
        store.createIndex('folder_id', 'folder_id', { unique: false });
      }

      if (!db.objectStoreNames.contains('tags')) {
        const store = db.createObjectStore('tags', { keyPath: 'id' });
        store.createIndex('workspace_id', 'workspace_id', { unique: false });
      }

      if (!db.objectStoreNames.contains('note_tags')) {
        const store = db.createObjectStore('note_tags', { keyPath: 'id' }); // Key is noteId + '_' + tagId
        store.createIndex('note_id', 'note_id', { unique: false });
        store.createIndex('tag_id', 'tag_id', { unique: false });
      }

      if (!db.objectStoreNames.contains('version_history')) {
        const store = db.createObjectStore('version_history', { keyPath: 'id' });
        store.createIndex('note_id', 'note_id', { unique: false });
      }

      if (!db.objectStoreNames.contains('attachments')) {
        const store = db.createObjectStore('attachments', { keyPath: 'id' });
        store.createIndex('note_id', 'note_id', { unique: false });
      }

      if (!db.objectStoreNames.contains('backups')) {
        const store = db.createObjectStore('backups', { keyPath: 'id' });
        store.createIndex('workspace_id', 'workspace_id', { unique: false });
      }
    };
  });
}

// Transaction Helpers
async function getStore(storeName: string, mode: IDBTransactionMode = 'readonly'): Promise<IDBObjectStore> {
  const db = await initDB();
  const transaction = db.transaction(storeName, mode);
  return transaction.objectStore(storeName);
}

// ================= WORKSPACES =================
export async function getWorkspaces(): Promise<Workspace[]> {
  const store = await getStore('workspaces');
  return new Promise((resolve) => {
    const req = store.getAll();
    req.onsuccess = () => {
      let list = req.result as Workspace[];
      if (list.length === 0) {
        // Create default workspace if empty
        const defaultWorkspace: Workspace = {
          id: 'default-workspace',
          name: 'My Notes',
          created_at: Date.now()
        };
        saveWorkspace(defaultWorkspace).then(() => resolve([defaultWorkspace]));
      } else {
        resolve(list);
      }
    };
  });
}

export async function saveWorkspace(workspace: Workspace): Promise<void> {
  const store = await getStore('workspaces', 'readwrite');
  return new Promise((resolve) => {
    const req = store.put(workspace);
    req.onsuccess = () => resolve();
  });
}

export async function deleteWorkspace(id: string): Promise<void> {
  const db = await initDB();
  // Perform deletions in parallel transaction
  const tx = db.transaction(['workspaces', 'folders', 'notes', 'tags', 'backups'], 'readwrite');
  
  tx.objectStore('workspaces').delete(id);
  
  // Custom cursor cleanup for associated objects
  const clearAssociated = (storeName: string, indexName: string) => {
    const os = tx.objectStore(storeName);
    const idx = os.index(indexName);
    const req = idx.openCursor(IDBKeyRange.only(id));
    req.onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
  };

  clearAssociated('folders', 'workspace_id');
  clearAssociated('notes', 'workspace_id');
  clearAssociated('tags', 'workspace_id');
  clearAssociated('backups', 'workspace_id');

  return new Promise((resolve) => {
    tx.oncomplete = () => resolve();
  });
}

// ================= FOLDERS =================
export async function getFolders(workspaceId: string): Promise<Folder[]> {
  const store = await getStore('folders');
  const index = store.index('workspace_id');
  return new Promise((resolve) => {
    const req = index.getAll(IDBKeyRange.only(workspaceId));
    req.onsuccess = () => resolve(req.result as Folder[]);
  });
}

export async function saveFolder(folder: Folder): Promise<void> {
  const store = await getStore('folders', 'readwrite');
  return new Promise((resolve) => {
    const req = store.put(folder);
    req.onsuccess = () => resolve();
  });
}

export async function deleteFolder(id: string): Promise<void> {
  const store = await getStore('folders', 'readwrite');
  return new Promise((resolve) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve();
  });
}

// ================= NOTES =================
export async function getNotes(workspaceId: string): Promise<Note[]> {
  const store = await getStore('notes');
  const index = store.index('workspace_id');
  return new Promise((resolve) => {
    const req = index.getAll(IDBKeyRange.only(workspaceId));
    req.onsuccess = () => resolve(req.result as Note[]);
  });
}

export async function saveNote(note: Note): Promise<void> {
  const store = await getStore('notes', 'readwrite');
  return new Promise((resolve) => {
    const req = store.put(note);
    req.onsuccess = () => resolve();
  });
}

export async function deleteNote(id: string): Promise<void> {
  const store = await getStore('notes', 'readwrite');
  return new Promise((resolve) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve();
  });
}

// ================= TAGS =================
export async function getTags(workspaceId: string): Promise<Tag[]> {
  const store = await getStore('tags');
  const index = store.index('workspace_id');
  return new Promise((resolve) => {
    const req = index.getAll(IDBKeyRange.only(workspaceId));
    req.onsuccess = () => resolve(req.result as Tag[]);
  });
}

export async function saveTag(tag: Tag): Promise<void> {
  const store = await getStore('tags', 'readwrite');
  return new Promise((resolve) => {
    const req = store.put(tag);
    req.onsuccess = () => resolve();
  });
}

export async function deleteTag(id: string): Promise<void> {
  const store = await getStore('tags', 'readwrite');
  return new Promise((resolve) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve();
  });
}

// ================= NOTE TAGS =================
export async function getNoteTags(noteId: string): Promise<string[]> {
  const store = await getStore('note_tags');
  const index = store.index('note_id');
  return new Promise((resolve) => {
    const req = index.getAll(IDBKeyRange.only(noteId));
    req.onsuccess = () => {
      const records = req.result as NoteTag[];
      resolve(records.map(r => r.tag_id));
    };
  });
}

export async function addNoteTag(noteId: string, tagId: string): Promise<void> {
  const store = await getStore('note_tags', 'readwrite');
  const key = `${noteId}_${tagId}`;
  return new Promise((resolve) => {
    const req = store.put({ id: key, note_id: noteId, tag_id: tagId });
    req.onsuccess = () => resolve();
  });
}

export async function removeNoteTag(noteId: string, tagId: string): Promise<void> {
  const store = await getStore('note_tags', 'readwrite');
  const key = `${noteId}_${tagId}`;
  return new Promise((resolve) => {
    const req = store.delete(key);
    req.onsuccess = () => resolve();
  });
}

// ================= VERSION HISTORY =================
export async function getVersionHistory(noteId: string): Promise<VersionHistory[]> {
  const store = await getStore('version_history');
  const index = store.index('note_id');
  return new Promise((resolve) => {
    const req = index.getAll(IDBKeyRange.only(noteId));
    req.onsuccess = () => {
      // Sort descending by timestamp
      const history = req.result as VersionHistory[];
      history.sort((a, b) => b.updated_at - a.updated_at);
      resolve(history);
    };
  });
}

export async function saveVersion(version: VersionHistory): Promise<void> {
  const store = await getStore('version_history', 'readwrite');
  return new Promise((resolve) => {
    const req = store.put(version);
    req.onsuccess = () => resolve();
  });
}

// ================= ATTACHMENTS =================
export async function getAttachments(noteId: string): Promise<Attachment[]> {
  const store = await getStore('attachments');
  const index = store.index('note_id');
  return new Promise((resolve) => {
    const req = index.getAll(IDBKeyRange.only(noteId));
    req.onsuccess = () => resolve(req.result as Attachment[]);
  });
}

export async function saveAttachment(attachment: Attachment): Promise<void> {
  const store = await getStore('attachments', 'readwrite');
  return new Promise((resolve) => {
    const req = store.put(attachment);
    req.onsuccess = () => resolve();
  });
}

export async function deleteAttachment(id: string): Promise<void> {
  const store = await getStore('attachments', 'readwrite');
  return new Promise((resolve) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve();
  });
}

// ================= BACKUPS =================
export async function getBackups(workspaceId: string): Promise<BackupRecord[]> {
  const store = await getStore('backups');
  const index = store.index('workspace_id');
  return new Promise((resolve) => {
    const req = index.getAll(IDBKeyRange.only(workspaceId));
    req.onsuccess = () => {
      const records = req.result as BackupRecord[];
      records.sort((a, b) => b.created_at - a.created_at);
      resolve(records);
    };
  });
}

export async function saveBackup(backup: BackupRecord): Promise<void> {
  const store = await getStore('backups', 'readwrite');
  return new Promise((resolve) => {
    const req = store.put(backup);
    req.onsuccess = () => resolve();
  });
}

export async function deleteBackup(id: string): Promise<void> {
  const store = await getStore('backups', 'readwrite');
  return new Promise((resolve) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve();
  });
}

// ================= FULL BACKUP / EXPORT UTILS =================
export async function exportWorkspaceToJSON(workspaceId: string): Promise<string> {
  const workspace = await (async () => {
    const store = await getStore('workspaces');
    return new Promise<Workspace>((res) => {
      const req = store.get(workspaceId);
      req.onsuccess = () => res(req.result);
    });
  })();

  const folders = await getFolders(workspaceId);
  const notes = await getNotes(workspaceId);
  const tags = await getTags(workspaceId);

  // Fetch all attachments & history for notes in workspace
  const noteIds = notes.map(n => n.id);
  
  const attachments: Attachment[] = [];
  const histories: VersionHistory[] = [];
  const noteTags: NoteTag[] = [];

  const ntStore = await getStore('note_tags');
  const allNoteTags = await new Promise<NoteTag[]>((res) => {
    const req = ntStore.getAll();
    req.onsuccess = () => res(req.result);
  });
  
  // Filter associations for current workspace notes
  allNoteTags.forEach(record => {
    if (noteIds.includes(record.note_id)) {
      noteTags.push(record);
    }
  });

  for (const nid of noteIds) {
    const atts = await getAttachments(nid);
    attachments.push(...atts);
    
    const hist = await getVersionHistory(nid);
    histories.push(...hist);
  }

  const exportPayload = {
    exportVersion: 1,
    exportedAt: Date.now(),
    workspace,
    folders,
    notes,
    tags,
    noteTags,
    attachments,
    histories
  };

  return JSON.stringify(exportPayload, null, 2);
}

export async function importWorkspaceFromJSON(jsonString: string): Promise<string> {
  const data = JSON.parse(jsonString);
  if (!data.workspace || !data.notes) {
    throw new Error('Invalid export file format');
  }

  const db = await initDB();
  const tx = db.transaction(
    ['workspaces', 'folders', 'notes', 'tags', 'note_tags', 'attachments', 'version_history'], 
    'readwrite'
  );

  // Use unique workspace ID if duplicate
  const workspace = data.workspace as Workspace;
  workspace.name = `${workspace.name} (Imported)`;
  workspace.created_at = Date.now();

  tx.objectStore('workspaces').put(workspace);

  if (Array.isArray(data.folders)) {
    data.folders.forEach((f: Folder) => tx.objectStore('folders').put(f));
  }

  if (Array.isArray(data.notes)) {
    data.notes.forEach((n: Note) => tx.objectStore('notes').put(n));
  }

  if (Array.isArray(data.tags)) {
    data.tags.forEach((t: Tag) => tx.objectStore('tags').put(t));
  }

  if (Array.isArray(data.noteTags)) {
    data.noteTags.forEach((nt: NoteTag) => {
      const key = `${nt.note_id}_${nt.tag_id}`;
      tx.objectStore('note_tags').put({ id: key, ...nt });
    });
  }

  if (Array.isArray(data.attachments)) {
    data.attachments.forEach((a: Attachment) => tx.objectStore('attachments').put(a));
  }

  if (Array.isArray(data.histories)) {
    data.histories.forEach((h: VersionHistory) => tx.objectStore('version_history').put(h));
  }

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      showToast(`Imported workspace "${workspace.name}" successfully`, 'success');
      resolve(workspace.id);
    };
    tx.onerror = (e) => reject(e);
  });
}

import { create } from 'zustand';
import * as db from '../services/db';
import { showToast } from '../services/tauriBridge';

export type ThemeType = 'light' | 'dark' | 'amoled';
export type AccentType = 'indigo' | 'blue' | 'emerald' | 'rose' | 'amber' | 'violet';
export type FontSize = '14' | '16' | '18' | '20';
export type FontFamily = 'sans' | 'heading' | 'mono';

export interface AppSettings {
  theme: ThemeType;
  accentColor: AccentType;
  fontSize: FontSize;
  fontFamily: FontFamily;
  sidebarWidth: number;
  editorWidth: number;
  zoom: number; // percentage (e.g. 100)
  autoBackupInterval: number; // minutes (0 to disable)
  passcodeHash: string; // empty if disabled
}

interface WorkspaceState {
  workspaces: db.Workspace[];
  activeWorkspaceId: string;
  settings: AppSettings;
  isLocked: boolean;
  hasSetupPasscode: boolean;
  
  // Backups
  backups: db.BackupRecord[];

  // Initialisation
  initStore: () => Promise<void>;
  
  // Workspace Actions
  createWorkspace: (name: string) => Promise<string>;
  switchWorkspace: (id: string) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;
  renameWorkspace: (id: string, name: string) => Promise<void>;
  
  // Settings Actions
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  
  // Security
  setupPasscode: (passcode: string) => void;
  disablePasscode: () => void;
  lockApp: () => void;
  unlockApp: (passcode: string) => boolean;

  // Backups
  loadBackups: () => Promise<void>;
  triggerBackup: (type: 'auto' | 'manual') => Promise<void>;
  deleteBackup: (id: string) => Promise<void>;
  restoreBackup: (backupRecord: db.BackupRecord) => Promise<void>;
}

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  accentColor: 'indigo',
  fontSize: '16',
  fontFamily: 'sans',
  sidebarWidth: 260,
  editorWidth: 800,
  zoom: 100,
  autoBackupInterval: 0, // Disabled by default
  passcodeHash: ''
};

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: 'default-workspace',
  settings: DEFAULT_SETTINGS,
  isLocked: false,
  hasSetupPasscode: false,
  backups: [],

  initStore: async () => {
    // Load settings from localStorage
    const savedSettings = localStorage.getItem('koda_settings');
    let settings = DEFAULT_SETTINGS;
    if (savedSettings) {
      try {
        settings = { ...DEFAULT_SETTINGS, ...JSON.parse(savedSettings) };
      } catch (e) {
        console.error('Failed to parse settings', e);
      }
    }

    // Load workspaces from DB
    const workspaceList = await db.getWorkspaces();
    const savedActiveId = localStorage.getItem('koda_active_workspace') || 'default-workspace';
    
    // Fallback if saved id doesn't exist anymore
    const activeWorkspaceId = workspaceList.some(w => w.id === savedActiveId)
      ? savedActiveId
      : (workspaceList[0]?.id || 'default-workspace');

    localStorage.setItem('koda_active_workspace', activeWorkspaceId);

    // Apply Theme & Zoom to document body/html on startup
    applyThemeStyles(settings.theme, settings.accentColor, settings.zoom);

    set({
      workspaces: workspaceList,
      activeWorkspaceId,
      settings,
      hasSetupPasscode: !!settings.passcodeHash,
      isLocked: !!settings.passcodeHash // lock on startup if passcode is set
    });

    await get().loadBackups();
  },

  createWorkspace: async (name: string) => {
    const id = crypto.randomUUID();
    const newWorkspace: db.Workspace = {
      id,
      name,
      created_at: Date.now()
    };
    await db.saveWorkspace(newWorkspace);
    
    const list = await db.getWorkspaces();
    set({ workspaces: list });
    showToast(`Workspace "${name}" created`, 'success');
    return id;
  },

  switchWorkspace: async (id: string) => {
    localStorage.setItem('koda_active_workspace', id);
    set({ activeWorkspaceId: id });
    await get().loadBackups();
  },

  deleteWorkspace: async (id: string) => {
    if (get().workspaces.length <= 1) {
      showToast("Cannot delete the only workspace", "warning");
      return;
    }

    await db.deleteWorkspace(id);
    const list = await db.getWorkspaces();
    
    let newActiveId = get().activeWorkspaceId;
    if (get().activeWorkspaceId === id) {
      newActiveId = list[0].id;
      localStorage.setItem('koda_active_workspace', newActiveId);
    }

    set({ workspaces: list, activeWorkspaceId: newActiveId });
    showToast("Workspace deleted", "success");
  },

  renameWorkspace: async (id: string, name: string) => {
    const target = get().workspaces.find(w => w.id === id);
    if (!target) return;

    const updated = { ...target, name };
    await db.saveWorkspace(updated);
    
    const list = await db.getWorkspaces();
    set({ workspaces: list });
    showToast("Workspace renamed", "success");
  },

  updateSetting: (key, value) => {
    const newSettings = { ...get().settings, [key]: value };
    localStorage.setItem('koda_settings', JSON.stringify(newSettings));
    
    // Apply styling side-effects
    if (key === 'theme' || key === 'accentColor' || key === 'zoom') {
      applyThemeStyles(newSettings.theme, newSettings.accentColor, newSettings.zoom);
    }

    set({ settings: newSettings });
  },

  setupPasscode: (passcode: string) => {
    // Basic hash representation (simple string hashing for offline storage protection)
    const hash = simpleHash(passcode);
    const newSettings = { ...get().settings, passcodeHash: hash };
    localStorage.setItem('koda_settings', JSON.stringify(newSettings));
    set({ settings: newSettings, hasSetupPasscode: true, isLocked: false });
    showToast("PIN lock enabled", "success");
  },

  disablePasscode: () => {
    const newSettings = { ...get().settings, passcodeHash: '' };
    localStorage.setItem('koda_settings', JSON.stringify(newSettings));
    set({ settings: newSettings, hasSetupPasscode: false, isLocked: false });
    showToast("PIN lock disabled", "success");
  },

  lockApp: () => {
    if (get().hasSetupPasscode) {
      set({ isLocked: true });
    }
  },

  unlockApp: (passcode: string) => {
    const hash = simpleHash(passcode);
    if (hash === get().settings.passcodeHash) {
      set({ isLocked: false });
      return true;
    }
    return false;
  },

  loadBackups: async () => {
    const activeId = get().activeWorkspaceId;
    const backupList = await db.getBackups(activeId);
    set({ backups: backupList });
  },

  triggerBackup: async (type: 'auto' | 'manual') => {
    const activeId = get().activeWorkspaceId;
    const workspaceName = get().workspaces.find(w => w.id === activeId)?.name || 'workspace';
    
    try {
      const dataJSON = await db.exportWorkspaceToJSON(activeId);
      const backupId = crypto.randomUUID();
      const backupRecord: db.BackupRecord = {
        id: backupId,
        workspace_id: activeId,
        name: `${workspaceName}_backup_${new Date().toISOString().slice(0, 10)}_${type}`,
        created_at: Date.now(),
        type,
        data: dataJSON
      };

      await db.saveBackup(backupRecord);
      await get().loadBackups();
      
      if (type === 'manual') {
        showToast("Backup created successfully", "success");
      }
    } catch (e) {
      console.error("Backup trigger failed:", e);
      showToast("Failed to create backup", "error");
    }
  },

  deleteBackup: async (id: string) => {
    await db.deleteBackup(id);
    await get().loadBackups();
    showToast("Backup deleted", "success");
  },

  restoreBackup: async (backupRecord: db.BackupRecord) => {
    try {
      const restoredWorkspaceId = await db.importWorkspaceFromJSON(backupRecord.data);
      // Refresh workspaces
      const workspaceList = await db.getWorkspaces();
      set({ workspaces: workspaceList });
      await get().switchWorkspace(restoredWorkspaceId);
      showToast("Workspace restored successfully", "success");
    } catch (e) {
      console.error("Restore failed:", e);
      showToast("Restore failed: invalid backup file", "error");
    }
  }
}));

// Help helper triggers
function applyThemeStyles(theme: ThemeType, accent: AccentType, zoom: number) {
  const root = document.documentElement;
  
  // 1. Theme Class
  root.classList.remove('theme-light', 'theme-dark', 'theme-amoled');
  if (theme === 'dark') root.classList.add('theme-dark');
  else if (theme === 'amoled') root.classList.add('theme-amoled');
  // Light is default, so no extra class needed or it falls back

  // 2. Accent Color Class
  root.classList.remove(
    'accent-indigo', 'accent-blue', 'accent-emerald',
    'accent-rose', 'accent-amber', 'accent-violet'
  );
  root.classList.add(`accent-${accent}`);

  // 3. Zoom Factor
  root.style.fontSize = `${zoom}%`;
}

function simpleHash(str: string): string {
  // A simple hashing algorithm for storage lock (CryptoJS AES is used for actual content locking if requested, 
  // but for login PIN lock, this lightweight hash is perfect)
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(16);
}

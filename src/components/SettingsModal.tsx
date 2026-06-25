import React from 'react';
import { useWorkspaceStore } from '../store/workspaceStore';
import type { ThemeType, AccentType, FontSize } from '../store/workspaceStore';
import { useNotesStore } from '../store/notesStore';
import { useLayoutStore } from '../store/layoutStore';
import * as db from '../services/db';
import { saveLocalFile, openLocalFile, showToast } from '../services/tauriBridge';
import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import { 
  X, Paintbrush, Shield, Database, Upload, Download, History, 
  Settings, RotateCcw, Trash2, FileText, Check, AlertCircle 
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'appearance' | 'backup' | 'data' | 'security' | 'history';

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { 
    settings, 
    updateSetting, 
    setupPasscode, 
    disablePasscode, 
    hasSetupPasscode, 
    backups, 
    triggerBackup, 
    deleteBackup, 
    restoreBackup,
    activeWorkspaceId
  } = useWorkspaceStore();

  const { notes, activeNoteId, restoreNoteVersion, loadWorkspaceData } = useNotesStore();
  const { closeAllTabs } = useLayoutStore();

  const [activeTab, setActiveTab] = React.useState<TabType>('appearance');
  const [pinInput, setPinInput] = React.useState('');
  
  // Historical versions state
  const [historyVersions, setHistoryVersions] = React.useState<db.VersionHistory[]>([]);
  const [selectedVersionId, setSelectedVersionId] = React.useState<string | null>(null);

  const activeNote = notes.find(n => n.id === activeNoteId);

  // Load history list when tab switches to 'history'
  React.useEffect(() => {
    if (activeTab === 'history' && activeNoteId) {
      db.getVersionHistory(activeNoteId).then(list => {
        setHistoryVersions(list);
        if (list.length > 0) {
          setSelectedVersionId(list[0].id);
        } else {
          setSelectedVersionId(null);
        }
      });
    }
  }, [activeTab, activeNoteId]);

  if (!isOpen) return null;

  // --- Theme Switcher ---
  const themes: { id: ThemeType; label: string; desc: string }[] = [
    { id: 'light', label: 'Light Theme', desc: 'Minimal clean light interface' },
    { id: 'dark', label: 'Dark Slate', desc: 'Default eye-comfort dark mode' },
    { id: 'amoled', label: 'AMOLED Black', desc: 'Deep black for OLED laptop displays' }
  ];

  const accents: { id: AccentType; color: string; label: string }[] = [
    { id: 'indigo', color: '#6366f1', label: 'Indigo' },
    { id: 'blue', color: '#3b82f6', label: 'Blue' },
    { id: 'emerald', color: '#10b981', label: 'Emerald' },
    { id: 'rose', color: '#f43f5e', label: 'Rose' },
    { id: 'amber', color: '#f59e0b', label: 'Amber' },
    { id: 'violet', color: '#8b5cf6', label: 'Violet' }
  ];

  // --- Export Note Handlers ---
  const handleExportNote = async (format: 'txt' | 'md' | 'html' | 'pdf') => {
    if (!activeNote) {
      showToast("No active note to export", "warning");
      return;
    }

    const title = activeNote.title || 'Untitled_Note';
    const filename = `${title.replace(/\s+/g, '_')}.${format}`;

    if (format === 'txt' || format === 'md') {
      const content = format === 'md' 
        ? `# ${activeNote.title}\n\n${activeNote.plain_text}` 
        : activeNote.plain_text;
      await saveLocalFile(content, {
        suggestedName: filename,
        filters: [{ name: 'Text files', extensions: [format] }]
      });
    } else if (format === 'html') {
      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>${activeNote.title}</title>
  <style>
    body { font-family: sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6; }
    blockquote { border-left: 4px solid #6366f1; background: #f3f4f6; padding: 10px; margin: 10px 0; }
    pre { background: #1f2937; color: #fff; padding: 15px; border-radius: 6px; overflow-x: auto; }
    code { font-family: monospace; background: #e5e7eb; padding: 2px 4px; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>${activeNote.title}</h1>
  ${activeNote.content}
</body>
</html>`;
      await saveLocalFile(htmlContent, {
        suggestedName: filename,
        filters: [{ name: 'HTML files', extensions: ['html'] }]
      });
    } else if (format === 'pdf') {
      try {
        const doc = new jsPDF();
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(20);
        doc.text(activeNote.title, 20, 20);

        doc.setFont("Helvetica", "normal");
        doc.setFontSize(11);
        
        const plain = activeNote.plain_text;
        const splitText = doc.splitTextToSize(plain, 170);
        doc.text(splitText, 20, 32);

        // Convert base64 data to blob download inside saveLocalFile bridging
        const pdfData = doc.output('arraybuffer');
        await saveLocalFile(new Uint8Array(pdfData), {
          suggestedName: filename,
          filters: [{ name: 'PDF files', extensions: ['pdf'] }]
        });
      } catch (e) {
        console.error("PDF generation failed:", e);
        showToast("PDF Export failed", "error");
      }
    }
  };

  // --- ZIP Backup export ---
  const handleExportWorkspaceZIP = async () => {
    try {
      const jsonPayload = await db.exportWorkspaceToJSON(activeWorkspaceId);
      const zip = new JSZip();
      
      // Save full workspace JSON backup
      zip.file("workspace_database.json", jsonPayload);
      
      // Also write all notes individually as Markdown files inside a notes/ subfolder!
      const notesFolder = zip.folder("notes");
      notes.forEach(note => {
        if (note.is_deleted === 0) {
          const name = `${note.title.replace(/[/\\?%*:|"<>\s]/g, '_') || 'untitled'}_${note.id.slice(0, 8)}.md`;
          notesFolder?.file(name, `# ${note.title}\n\n${note.plain_text}`);
        }
      });

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const arrayBuffer = await zipBlob.arrayBuffer();
      
      await saveLocalFile(new Uint8Array(arrayBuffer), {
        suggestedName: `Koda_workspace_export_${new Date().toISOString().slice(0, 10)}.zip`,
        filters: [{ name: 'ZIP Archive', extensions: ['zip'] }]
      });
    } catch (e) {
      console.error("ZIP packaging failed:", e);
      showToast("Workspace Export failed", "error");
    }
  };

  const handleImportWorkspaceZIP = async () => {
    try {
      const files = await openLocalFile({
        filters: [{ name: 'ZIP Workspace Backup', extensions: ['zip'] }],
        multiple: false
      });

      if (!files || files.length === 0) return;

      const file = files[0];
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          const zipContent = e.target?.result as ArrayBuffer;
          const zip = await JSZip.loadAsync(zipContent);
          
          const dbFile = zip.file("workspace_database.json");
          if (!dbFile) {
            showToast("Invalid Koda ZIP archive: missing DB database", "error");
            return;
          }

          const jsonString = await dbFile.async("text");
          const newWorkspaceId = await db.importWorkspaceFromJSON(jsonString);

          // Force reload active workspace
          await useWorkspaceStore.getState().switchWorkspace(newWorkspaceId);
          await loadWorkspaceData(newWorkspaceId);
          closeAllTabs();
          onClose();
        } catch (err) {
          console.error(err);
          showToast("Failed to parse workspace zip", "error");
        }
      };

      reader.readAsArrayBuffer(file);
    } catch (e) {
      console.error(e);
      showToast("Import failed", "error");
    }
  };

  const handleImportNoteMD = async () => {
    try {
      const files = await openLocalFile({
        filters: [{ name: 'Markdown or Text', extensions: ['md', 'txt'] }],
        multiple: false
      });

      if (!files || files.length === 0) return;

      const file = files[0];
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        const text = e.target?.result as string;
        const noteTitle = file.name.replace(/\.(md|txt)$/i, '');

        const newNote: db.Note = {
          id: crypto.randomUUID(),
          workspace_id: activeWorkspaceId,
          folder_id: null,
          title: noteTitle,
          content: `<p>${text.replace(/\n/g, '<br>')}</p>`,
          plain_text: text,
          is_pinned: 0,
          is_favorite: 0,
          is_archived: 0,
          is_deleted: 0,
          deleted_at: null,
          created_at: Date.now(),
          updated_at: Date.now(),
          is_read_only: 0
        };

        await db.saveNote(newNote);
        
        // Reload state
        await loadWorkspaceData(activeWorkspaceId);
        showToast(`Imported note: "${noteTitle}"`, "success");
        onClose();
      };

      reader.readAsText(file);
    } catch (e) {
      console.error(e);
    }
  };

  // --- Pin Setup Handlers ---
  const handleSetupPin = () => {
    if (pinInput.length < 4) {
      showToast("Passcode must be at least 4 digits", "warning");
      return;
    }
    setupPasscode(pinInput);
    setPinInput('');
  };

  const handleRestoreVersion = async (v: db.VersionHistory) => {
    if (activeNote) {
      await restoreNoteVersion(activeNote.id, v.content);
      showToast("Version restored successfully", "success");
      onClose();
    }
  };

  const selectedVersion = historyVersions.find(v => v.id === selectedVersionId);

  return (
    <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-center justify-center font-sans text-neutral-200 select-none p-4">
      <div 
        className="w-full max-w-3xl h-[480px] rounded-lg border shadow-2xl overflow-hidden flex animate-in zoom-in-95 duration-200"
        style={{ 
          backgroundColor: 'var(--bg-card)', 
          borderColor: 'var(--border-main)'
        }}
      >
        {/* Settings Sidebar Tabs */}
        <div 
          className="w-48 h-full border-r flex flex-col p-4 space-y-1"
          style={{ 
            backgroundColor: 'var(--bg-sidebar)', 
            borderColor: 'var(--border-main)',
            color: 'var(--text-secondary)'
          }}
        >
          <div className="flex items-center gap-2 px-2.5 mb-5 text-neutral-200">
            <Settings size={16} className="text-violet-400" />
            <span className="font-bold text-xs uppercase tracking-wider">Dashboard</span>
          </div>

          <button
            onClick={() => setActiveTab('appearance')}
            className={`w-full text-left px-3 py-1.5 rounded text-xs transition-colors flex items-center gap-2 ${
              activeTab === 'appearance' ? 'bg-neutral-800 text-white font-medium' : 'hover:bg-neutral-800/40 text-neutral-400'
            }`}
          >
            <Paintbrush size={13} /> Appearance
          </button>

          <button
            onClick={() => setActiveTab('backup')}
            className={`w-full text-left px-3 py-1.5 rounded text-xs transition-colors flex items-center gap-2 ${
              activeTab === 'backup' ? 'bg-neutral-800 text-white font-medium' : 'hover:bg-neutral-800/40 text-neutral-400'
            }`}
          >
            <Database size={13} /> Backups Manager
          </button>

          <button
            onClick={() => setActiveTab('data')}
            className={`w-full text-left px-3 py-1.5 rounded text-xs transition-colors flex items-center gap-2 ${
              activeTab === 'data' ? 'bg-neutral-800 text-white font-medium' : 'hover:bg-neutral-800/40 text-neutral-400'
            }`}
          >
            <Download size={13} /> Import & Export
          </button>

          <button
            onClick={() => setActiveTab('security')}
            className={`w-full text-left px-3 py-1.5 rounded text-xs transition-colors flex items-center gap-2 ${
              activeTab === 'security' ? 'bg-neutral-800 text-white font-medium' : 'hover:bg-neutral-800/40 text-neutral-400'
            }`}
          >
            <Shield size={13} /> Security PIN Lock
          </button>

          {activeNoteId && (
            <button
              onClick={() => setActiveTab('history')}
              className={`w-full text-left px-3 py-1.5 rounded text-xs transition-colors flex items-center gap-2 ${
                activeTab === 'history' ? 'bg-neutral-800 text-white font-medium' : 'hover:bg-neutral-800/40 text-neutral-400'
              }`}
            >
              <History size={13} /> Version History
            </button>
          )}

          {/* Close button in sidebar footer */}
          <button
            onClick={onClose}
            className="mt-auto w-full text-left px-3 py-1.5 rounded text-xs text-neutral-500 hover:text-white transition-colors flex items-center gap-2"
          >
            <X size={13} /> Close Settings
          </button>
        </div>

        {/* Settings Tab Details Content Panel */}
        <div className="flex-1 h-full flex flex-col overflow-hidden p-6 relative">
          
          {/* Close Button Top Right */}
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-1 rounded hover:bg-neutral-800 text-neutral-500 hover:text-neutral-200 transition-colors"
          >
            <X size={16} />
          </button>

          {/* APPEARANCE TAB */}
          {activeTab === 'appearance' && (
            <div className="flex-1 overflow-y-auto space-y-5 text-sm">
              <h3 className="text-base font-bold font-heading text-neutral-200">Visual Appearance</h3>
              
              {/* Theme selectors */}
              <div className="space-y-2">
                <span className="text-xs text-neutral-400">Color Theme</span>
                <div className="grid grid-cols-3 gap-2.5">
                  {themes.map(t => (
                    <button
                      key={t.id}
                      onClick={() => updateSetting('theme', t.id)}
                      className={`p-3 rounded border text-left flex flex-col transition-all cursor-pointer ${
                        settings.theme === t.id 
                          ? 'border-violet-500 bg-violet-500/10 text-white shadow' 
                          : 'border-neutral-800 hover:border-neutral-700 bg-neutral-900/60'
                      }`}
                    >
                      <span className="text-xs font-semibold">{t.label}</span>
                      <span className="text-[10px] text-neutral-500 mt-1">{t.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Accent Color selectors */}
              <div className="space-y-2">
                <span className="text-xs text-neutral-400">Accent Tint Badge Color</span>
                <div className="flex gap-2">
                  {accents.map(ac => (
                    <button
                      key={ac.id}
                      onClick={() => updateSetting('accentColor', ac.id)}
                      className={`w-6 h-6 rounded-full flex items-center justify-center transition-all scale-100 hover:scale-110 cursor-pointer border ${
                        settings.accentColor === ac.id ? 'border-white scale-110 shadow-md' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: ac.color }}
                      title={ac.label}
                    >
                      {settings.accentColor === ac.id && <Check size={12} className="text-white" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom editor font sizing */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-neutral-400">UI Zoom Ratio</span>
                  <select 
                    value={settings.zoom}
                    onChange={(e) => updateSetting('zoom', Number(e.target.value))}
                    className="bg-neutral-900 border border-neutral-800 rounded p-1.5 text-xs text-neutral-200 outline-none"
                  >
                    <option value={85}>Compact UI (85%)</option>
                    <option value={100}>Normal Screen (100%)</option>
                    <option value={115}>Scaled Large (115%)</option>
                    <option value={130}>Scaled Huge (130%)</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-neutral-400">Default Font Sizes</span>
                  <select 
                    value={settings.fontSize}
                    onChange={(e) => updateSetting('fontSize', e.target.value as FontSize)}
                    className="bg-neutral-900 border border-neutral-800 rounded p-1.5 text-xs text-neutral-200 outline-none"
                  >
                    <option value="14">Small UI Text (14px)</option>
                    <option value="16">Comfortable Reader (16px)</option>
                    <option value="18">Large Reader (18px)</option>
                    <option value="20">Bold Reader (20px)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* BACKUPS MANAGER TAB */}
          {activeTab === 'backup' && (
            <div className="flex-1 overflow-y-auto flex flex-col space-y-4 text-sm h-full">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold font-heading text-neutral-200">Backups History Manager</h3>
                <button 
                  onClick={() => triggerBackup('manual')}
                  className="px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-500 font-semibold text-white text-xs transition-colors flex items-center gap-1.5 shadow"
                >
                  <Database size={13} /> Backup Now
                </button>
              </div>

              <span className="text-[11px] text-neutral-500 leading-normal block">
                Koda retains backup states in IndexedDB. Restoring replaces your current folders and notes metadata with snapshot versions. Export to file is recommended for actual permanent safe keeping.
              </span>

              {/* Backups List */}
              <div className="flex-1 border border-neutral-800 rounded-md overflow-hidden flex flex-col" style={{ borderColor: 'var(--border-main)' }}>
                <div className="flex bg-neutral-950/40 p-2 text-[10px] uppercase font-bold tracking-wider text-neutral-500 border-b" style={{ borderColor: 'var(--border-main)' }}>
                  <div className="flex-1 px-1">Backup Name</div>
                  <div className="w-28 px-1">Created At</div>
                  <div className="w-20 px-1 text-center">Actions</div>
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-neutral-800/50 p-1">
                  {backups.length === 0 ? (
                    <div className="text-xs text-neutral-500 p-6 text-center italic">
                      No backups stored in database.
                    </div>
                  ) : (
                    backups.map(b => (
                      <div key={b.id} className="flex items-center py-2 px-2 hover:bg-neutral-800/10 text-xs">
                        <div className="flex-1 font-medium truncate pr-3">{b.name}</div>
                        <div className="w-28 text-neutral-500">{new Date(b.created_at).toLocaleString().slice(0, 17)}</div>
                        <div className="w-20 flex justify-center gap-2.5">
                          <button
                            onClick={() => restoreBackup(b)}
                            className="p-1 hover:bg-neutral-800 rounded text-emerald-500 hover:text-emerald-400 transition-colors"
                            title="Restore"
                          >
                            <RotateCcw size={13} />
                          </button>
                          <button
                            onClick={() => deleteBackup(b.id)}
                            className="p-1 hover:bg-neutral-800 rounded text-red-400 hover:text-red-300 transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* DATA IMPORT / EXPORT TAB */}
          {activeTab === 'data' && (
            <div className="flex-1 overflow-y-auto space-y-5 text-sm">
              <h3 className="text-base font-bold font-heading text-neutral-200">Import & Export Utilities</h3>

              <div className="grid grid-cols-2 gap-4">
                
                {/* Export Column */}
                <div className="p-4 rounded border border-neutral-800 bg-neutral-900/40 space-y-3" style={{ borderColor: 'var(--border-main)' }}>
                  <span className="font-semibold text-xs text-neutral-300 block">Export Data</span>
                  <div className="flex flex-col gap-2">
                    <button 
                      onClick={handleExportWorkspaceZIP}
                      className="w-full justify-center flex items-center gap-2 py-2 px-3 border border-neutral-800 hover:border-neutral-600 rounded text-xs transition-colors"
                    >
                      <Download size={13} className="text-violet-400" /> Export Workspace (.ZIP)
                    </button>
                    
                    {activeNote && (
                      <>
                        <div className="h-[1px] bg-neutral-800 my-1" />
                        <span className="text-[10px] text-neutral-500 uppercase font-semibold">Active Note Export</span>
                        <div className="grid grid-cols-2 gap-1.5">
                          <button onClick={() => handleExportNote('md')} className="py-1.5 px-2 bg-neutral-900 hover:bg-neutral-800 rounded text-[11px] text-center text-neutral-300 font-light border border-neutral-800">Markdown (.md)</button>
                          <button onClick={() => handleExportNote('pdf')} className="py-1.5 px-2 bg-neutral-900 hover:bg-neutral-800 rounded text-[11px] text-center text-neutral-300 font-light border border-neutral-800">PDF Document</button>
                          <button onClick={() => handleExportNote('html')} className="py-1.5 px-2 bg-neutral-900 hover:bg-neutral-800 rounded text-[11px] text-center text-neutral-300 font-light border border-neutral-800">HTML Format</button>
                          <button onClick={() => handleExportNote('txt')} className="py-1.5 px-2 bg-neutral-900 hover:bg-neutral-800 rounded text-[11px] text-center text-neutral-300 font-light border border-neutral-800">Plain Text (.txt)</button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Import Column */}
                <div className="p-4 rounded border border-neutral-800 bg-neutral-900/40 space-y-3" style={{ borderColor: 'var(--border-main)' }}>
                  <span className="font-semibold text-xs text-neutral-300 block">Import Data</span>
                  <div className="flex flex-col gap-2">
                    <button 
                      onClick={handleImportWorkspaceZIP}
                      className="w-full justify-center flex items-center gap-2 py-2 px-3 border border-neutral-800 hover:border-neutral-600 rounded text-xs transition-colors"
                    >
                      <Upload size={13} className="text-violet-400" /> Import Workspace (.ZIP)
                    </button>
                    <button 
                      onClick={handleImportNoteMD}
                      className="w-full justify-center flex items-center gap-2 py-2 px-3 border border-neutral-800 hover:border-neutral-600 rounded text-xs transition-colors"
                    >
                      <FileText size={13} className="text-emerald-400" /> Import Note (.md, .txt)
                    </button>
                  </div>
                  <span className="text-[10px] text-neutral-500 leading-normal block">
                    Importing workspace zip merges folders and notes. Importing MD files parses the document and creates a note inside your active workspace root.
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* SECURITY SECURITY TAB */}
          {activeTab === 'security' && (
            <div className="flex-1 overflow-y-auto space-y-5 text-sm">
              <h3 className="text-base font-bold font-heading text-neutral-200">Security & PIN Lock</h3>
              
              <div className="p-4 rounded border border-neutral-800 bg-neutral-900/40 space-y-3" style={{ borderColor: 'var(--border-main)' }}>
                {hasSetupPasscode ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-emerald-500 text-xs">
                      <Check size={16} /> PIN lock protection is currently active
                    </div>
                    <button
                      onClick={disablePasscode}
                      className="py-1.5 px-3 rounded bg-red-950/20 hover:bg-red-950/40 border border-red-500/30 text-red-400 hover:text-red-300 text-xs transition-colors"
                    >
                      Disable Passcode Protection
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-start gap-2 text-amber-500 text-xs leading-normal">
                      <AlertCircle size={16} className="shrink-0 mt-0.5" />
                      <span>Setting a passcode locks the application after launching or clicking Lock. The database contents remain offline, stored on your machine.</span>
                    </div>

                    <div className="flex gap-2 max-w-sm">
                      <input
                        type="password"
                        maxLength={6}
                        value={pinInput}
                        onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))} // numeric digits only
                        placeholder="Enter 4-6 digit security PIN"
                        className="flex-1 bg-neutral-900 border border-neutral-800 rounded px-3 py-1.5 text-xs text-neutral-200 outline-none"
                      />
                      <button
                        onClick={handleSetupPin}
                        className="px-4 py-1.5 rounded bg-violet-600 hover:bg-violet-500 font-semibold text-white text-xs transition-colors"
                      >
                        Enable Lock
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ACTIVE FILE HISTORY TAB */}
          {activeTab === 'history' && (
            <div className="flex-1 overflow-y-auto flex flex-col space-y-4 text-sm h-full">
              <h3 className="text-base font-bold font-heading text-neutral-200">Note Version History</h3>

              <div className="flex-1 flex gap-3 h-full overflow-hidden">
                {/* Left side list */}
                <div className="w-48 border border-neutral-800 rounded-md overflow-y-auto p-1 space-y-1" style={{ borderColor: 'var(--border-main)' }}>
                  {historyVersions.length === 0 ? (
                    <div className="text-[11px] text-neutral-500 italic p-3 text-center">
                      No versions recorded. Blur the editor to save snapshots.
                    </div>
                  ) : (
                    historyVersions.map(v => (
                      <button
                        key={v.id}
                        onClick={() => setSelectedVersionId(v.id)}
                        className={`w-full text-left p-2 rounded text-[11px] transition-colors border ${
                          selectedVersionId === v.id
                            ? 'border-violet-500 bg-violet-500/10 text-white font-medium'
                            : 'border-transparent hover:bg-neutral-800 text-neutral-400'
                        }`}
                      >
                        {new Date(v.updated_at).toLocaleString().slice(0, 17)}
                      </button>
                    ))
                  )}
                </div>

                {/* Right side snapshot preview */}
                <div className="flex-1 border border-neutral-800 rounded-md flex flex-col overflow-hidden" style={{ borderColor: 'var(--border-main)' }}>
                  {selectedVersion ? (
                    <>
                      {/* Preview header */}
                      <div className="flex justify-between items-center bg-neutral-950/40 p-2 border-b border-neutral-800" style={{ borderColor: 'var(--border-main)' }}>
                        <span className="text-[10px] text-neutral-500 uppercase font-bold">Snapshot Preview</span>
                        <button
                          onClick={() => handleRestoreVersion(selectedVersion)}
                          className="px-2.5 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 font-semibold text-white text-[10px] transition-colors shadow"
                        >
                          Restore Version
                        </button>
                      </div>

                      {/* Content Preview render */}
                      <div 
                        className="flex-1 p-4 overflow-y-auto text-xs opacity-75 font-serif select-text cursor-text"
                        style={{ color: 'var(--text-secondary)' }}
                        dangerouslySetInnerHTML={{ __html: selectedVersion.content }}
                      />
                    </>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-xs text-neutral-500 italic">
                      Select a snapshot version to preview.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

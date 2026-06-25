/**
 * Tauri Bridge Service
 * Handles transparent redirection of desktop native functions
 * to standard browser APIs or custom mock overlays when running in a web browser.
 */

export const isTauri = (): boolean => {
  return typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;
};

// Custom toast dispatch trigger for app-wide toasts
type ToastType = 'success' | 'error' | 'info' | 'warning';
let toastCallback: ((message: string, type: ToastType) => void) | null = null;

export const registerToastHandler = (callback: (message: string, type: ToastType) => void) => {
  toastCallback = callback;
};

export const showToast = (message: string, type: ToastType = 'info') => {
  if (toastCallback) {
    toastCallback(message, type);
  } else {
    console.log(`[Toast: ${type}] ${message}`);
  }
};

/**
 * Trigger system notification
 */
export async function sendNotification(title: string, body: string) {
  if (isTauri()) {
    try {
      const { isPermissionGranted, requestPermission, sendNotification: tauriSend } = await import('@tauri-apps/plugin-notification');
      let permission = await isPermissionGranted();
      if (!permission) {
        permission = (await requestPermission()) === 'granted';
      }
      if (permission) {
        tauriSend({ title, body });
        return;
      }
    } catch (e) {
      console.warn("Tauri notification failed, falling back to web notification:", e);
    }
  }

  // Web fallback
  if ('Notification' in window) {
    if (Notification.permission === 'granted') {
      new Notification(title, { body });
    } else if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        new Notification(title, { body });
      }
    }
  }

  showToast(`${title}: ${body}`, 'info');
}

/**
 * File Dialogue - Open
 */
export interface OpenFileOptions {
  filters?: { name: string; extensions: string[] }[];
  multiple?: boolean;
}

export async function openLocalFile(options: OpenFileOptions = {}): Promise<File[] | null> {
  if (isTauri()) {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        multiple: options.multiple,
        filters: options.filters,
      });

      if (!selected) return null;

      // Tauri returns file paths. In real Tauri app, you'd read files via FS plugin.
      // For simulation, we return empty mock files with paths or use readTextFile.
      const { readTextFile, readFile } = await import('@tauri-apps/plugin-fs');
      const paths = Array.isArray(selected) ? selected : [selected];
      const files: File[] = [];

      for (const filePath of paths) {
        // extract name from path
        const name = filePath.split(/[/\\]/).pop() || 'file';
        const lowercaseName = name.toLowerCase();
        const isText = lowercaseName.endsWith('.txt') || 
                       lowercaseName.endsWith('.md') || 
                       lowercaseName.endsWith('.json') || 
                       lowercaseName.endsWith('.html') || 
                       lowercaseName.endsWith('.xml');

        if (isText) {
          try {
            const content = await readTextFile(filePath);
            files.push(new File([content], name, { type: 'text/plain' }));
            continue;
          } catch (e) {
            console.warn(`Failed to read ${name} as text, falling back to binary:`, e);
          }
        }

        // Read binary content directly for PDF, images, etc.
        const binaryContent = await readFile(filePath);
        files.push(new File([binaryContent], name));
      }
      return files;
    } catch (e) {
      console.warn("Tauri open file failed, falling back to web selector:", e);
    }
  }

  // Web Browser Fallback (HTML input picker)
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = !!options.multiple;
    
    if (options.filters && options.filters.length > 0) {
      const exts = options.filters.flatMap(f => f.extensions).map(ext => `.${ext}`).join(',');
      input.accept = exts;
    }

    input.onchange = () => {
      if (input.files && input.files.length > 0) {
        resolve(Array.from(input.files));
      } else {
        resolve(null);
      }
    };
    
    input.click();
  });
}

/**
 * File Dialogue - Save
 */
export interface SaveFileOptions {
  suggestedName?: string;
  filters?: { name: string; extensions: string[] }[];
}

export async function saveLocalFile(content: string | Uint8Array, options: SaveFileOptions = {}) {
  if (isTauri()) {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const filePath = await save({
        defaultPath: options.suggestedName,
        filters: options.filters,
      });

      if (filePath) {
        const { writeTextFile, writeFile } = await import('@tauri-apps/plugin-fs');
        if (typeof content === 'string') {
          await writeTextFile(filePath, content);
        } else {
          await writeFile(filePath, content);
        }
        showToast("File saved successfully", "success");
        return true;
      }
      return false;
    } catch (e) {
      console.warn("Tauri save file failed, falling back to browser download:", e);
    }
  }

  // Browser Fallback (download trigger)
  try {
    const blob = new Blob([content as BlobPart], { 
      type: typeof content === 'string' ? 'text/plain;charset=utf-8' : 'application/octet-stream' 
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = options.suggestedName || 'file';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("Download triggered", "success");
    return true;
  } catch (e) {
    console.error("Save file fallback failed:", e);
    return false;
  }
}

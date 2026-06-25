import React from 'react';
import * as pdfjs from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import FontFamily from '@tiptap/extension-font-family';
import Highlight from '@tiptap/extension-highlight';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';
import { Extension } from '@tiptap/core';

import { useNotesStore } from '../store/notesStore';
import { useLayoutStore } from '../store/layoutStore';
import { openLocalFile, saveLocalFile, showToast } from '../services/tauriBridge';
import { DrawingBoard } from './DrawingBoard';
import { HandwrittenCanvas } from './HandwrittenCanvas';

import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Highlighter, 
  List, ListOrdered, CheckSquare, Quote, Minus, Table as TableIcon,
  Image as ImageIcon, Link as LinkIcon, Undo, Redo, Heading1, Heading2, Heading3,
  Pin, Star, Archive, Trash, FileText, ChevronLeft, ChevronRight,
  Eye, EyeOff, Plus, Paintbrush, Palette, ChevronDown, Maximize2, Minimize2,
  Download
} from 'lucide-react';

// Custom Tiptap Extension for inline font-size
const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() {
    return {
      types: ['textStyle'],
    };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: element => element.style.fontSize,
            renderHTML: attributes => {
              if (!attributes.fontSize) {
                return {};
              }
              return {
                style: `font-size: ${attributes.fontSize}`,
              };
            },
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontSize: (fontSize: string) => ({ chain }: any) => {
        return chain()
          .setMark('textStyle', { fontSize })
          .run();
      },
      unsetFontSize: () => ({ chain }: any) => {
        return chain()
          .setMark('textStyle', { fontSize: null })
          .run();
      },
    } as any;
  },
});

interface NoteEditorProps {
  inSplit?: boolean;
}

const TEXT_COLORS = [
  { label: 'Default', value: 'var(--text-primary)' },
  { label: 'Gray', value: '#9ca3af' },
  { label: 'Red', value: '#ef4444' },
  { label: 'Orange', value: '#f97316' },
  { label: 'Yellow', value: '#eab308' },
  { label: 'Green', value: '#22c55e' },
  { label: 'Blue', value: '#3b82f6' },
  { label: 'Indigo', value: '#6366f1' },
  { label: 'Purple', value: '#a855f7' },
  { label: 'Rose', value: '#f43f5e' }
];

const HIGHLIGHT_COLORS = [
  { label: 'Clear', value: '' },
  { label: 'Yellow', value: '#fef08a' },
  { label: 'Green', value: '#bbf7d0' },
  { label: 'Blue', value: '#bfdbfe' },
  { label: 'Purple', value: '#e9d5ff' },
  { label: 'Pink', value: '#fbcfe8' },
  { label: 'Red', value: '#fecaca' }
];

const FONT_FAMILIES = [
  { label: 'Sans UI', value: 'Inter, sans-serif' },
  { label: 'Outfit Heading', value: 'Outfit, sans-serif' },
  { label: 'Monospace', value: 'JetBrains Mono, monospace' },
  { label: 'Georgia Serif', value: 'Georgia, serif' }
];

const FONT_SIZES = [
  { label: '12px', value: '12px' },
  { label: '14px', value: '14px' },
  { label: '16px', value: '16px' },
  { label: '18px', value: '18px' },
  { label: '24px', value: '24px' },
  { label: '32px', value: '32px' }
];

export const NoteEditor: React.FC<NoteEditorProps> = ({ inSplit = false }) => {
  const { activeTabId, activeSplitTabId, isZenMode, toggleZenMode } = useLayoutStore();
  const { 
    notes, 
    updateNote, 
    pinNote, 
    favoriteNote, 
    archiveNote, 
    deleteNote, 
    tags, 
    noteTags,
    addTagToNote,
    removeTagFromNote
  } = useNotesStore();

  const noteId = inSplit ? activeSplitTabId : activeTabId;
  const note = notes.find(n => n.id === noteId);

  // Smooth Title Local State
  const [localTitle, setLocalTitle] = React.useState(note?.title || '');
  const titleTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  // Stats & Layout States
  const [wordCount, setWordCount] = React.useState(0);
  const [charCount, setCharCount] = React.useState(0);
  const [headings, setHeadings] = React.useState<{ pos: number; text: string; level: number }[]>([]);
  const [showToc, setShowToc] = React.useState(false);
  const [tagDropdownOpen, setTagDropdownOpen] = React.useState(false);

  // Dropdown Open States
  const [fontFamilyOpen, setFontFamilyOpen] = React.useState(false);
  const [fontSizeOpen, setFontSizeOpen] = React.useState(false);
  const [textColorOpen, setTextColorOpen] = React.useState(false);
  const [highlightColorOpen, setHighlightColorOpen] = React.useState(false);

  // Pen Drawing State
  const [drawingOpen, setDrawingOpen] = React.useState(false);
  const [exportMenuOpen, setExportMenuOpen] = React.useState(false);
  const [isTopBarCollapsed, setIsTopBarCollapsed] = React.useState(false);

  // Autosave debounce timer for content
  const autosaveTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  // Ref to track the current noteId for stable closures in useEditor callbacks
  const noteIdRef = React.useRef(noteId);
  React.useEffect(() => { noteIdRef.current = noteId; }, [noteId]);

  // Initialize Tiptap Editor
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: {
          HTMLAttributes: {
            class: 'rounded-md bg-neutral-900 text-neutral-200 p-4 font-mono text-sm overflow-x-auto',
          },
        },
      }),
      Underline,
      TextStyle,
      Color,
      FontFamily,
      Highlight.configure({ multicolor: true }),
      FontSize,
      Image.configure({
        inline: true,
        allowBase64: true,
        HTMLAttributes: {
          class: 'rounded-lg max-w-full h-auto border border-neutral-700/50 shadow-md',
        },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-violet-400 underline hover:text-violet-300 cursor-pointer',
        },
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Placeholder.configure({
        placeholder: 'Start typing your thoughts...',
      }),
      CharacterCount,
    ],
    content: note?.content || '',
    editable: note ? note.is_read_only === 0 : true,
    onUpdate: ({ editor }) => {
      const currentNoteId = noteIdRef.current;
      if (!currentNoteId) return;

      const htmlContent = editor.getHTML();
      const plainText = editor.getText();
      
      // Update statistics
      setWordCount(editor.storage.characterCount.words());
      setCharCount(editor.storage.characterCount.characters());

      // Parse headings for TOC
      updateHeadingsList(editor);

      // Debounce saving to IndexedDB
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = setTimeout(async () => {
        await useNotesStore.getState().updateNote(currentNoteId, {
          content: htmlContent,
          plain_text: plainText
        });
      }, 500);
    },
    // Triggers historical snapshot on blur
    onBlur: ({ editor }) => {
      const currentNoteId = noteIdRef.current;
      if (currentNoteId && !editor.isDestroyed) {
        try {
          useNotesStore.getState().saveNoteVersion(currentNoteId, editor.getHTML());
        } catch (e) {
          console.warn("Failed to save note version on blur:", e);
        }
      }
    }
  }, []);

  // Keep editor content synchronized if active note changes
  React.useEffect(() => {
    if (editor && !editor.isDestroyed && note) {
      setLocalTitle(note.title);
      try {
        const currentHTML = editor.getHTML();
        if (currentHTML !== note.content) {
          editor.commands.setContent(note.content);
          editor.setEditable(note.is_read_only === 0);
          updateHeadingsList(editor);
          setWordCount(editor.storage.characterCount.words());
          setCharCount(editor.storage.characterCount.characters());
        }
      } catch (e) {
        console.error("Failed to sync editor content:", e);
      }
    }
  }, [noteId, editor]);

  // Clean autosave timeouts on unmount
  React.useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
    };
  }, []);

  const updateHeadingsList = (editorInstance: any) => {
    const list: { pos: number; text: string; level: number }[] = [];
    editorInstance.state.doc.descendants((node: any, pos: number) => {
      if (node.type.name === 'heading') {
        list.push({
          pos,
          text: node.textContent,
          level: node.attrs.level
        });
      }
    });
    setHeadings(list);
  };

  const scrollToHeading = (pos: number) => {
    if (editor) {
      editor.commands.focus(pos);
      // Native window scroll into view
      const viewDOM = editor.view.dom;
      const element = viewDOM.querySelector(`[data-placeholder]`) || viewDOM;
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  if (!note) return null;

  // Formatting operations helpers
  const toggleBold = () => editor?.chain().focus().toggleBold().run();
  const toggleItalic = () => editor?.chain().focus().toggleItalic().run();
  const toggleUnderline = () => editor?.chain().focus().toggleUnderline().run();
  const toggleStrike = () => editor?.chain().focus().toggleStrike().run();
  const toggleHighlight = (color?: string) => editor?.chain().focus().toggleHighlight(color ? { color } : undefined).run();
  const toggleBulletList = () => editor?.chain().focus().toggleBulletList().run();
  const toggleOrderedList = () => editor?.chain().focus().toggleOrderedList().run();
  const toggleTaskList = () => editor?.chain().focus().toggleTaskList().run();
  const toggleBlockquote = () => editor?.chain().focus().toggleBlockquote().run();
  const toggleCodeBlock = () => editor?.chain().focus().toggleCodeBlock().run();
  const setHeading = (level: 1 | 2 | 3) => editor?.chain().focus().toggleHeading({ level }).run();
  const insertHorizontalRule = () => editor?.chain().focus().setHorizontalRule().run();
  const insertTable = () => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  const handleUndo = () => editor?.chain().focus().undo().run();
  const handleRedo = () => editor?.chain().focus().redo().run();

  const handleInsertImage = async () => {
    try {
      const files = await openLocalFile({
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
        multiple: false
      });

      if (files && files.length > 0) {
        const file = files[0];
        const reader = new FileReader();
        reader.onload = (e) => {
          const base64Url = e.target?.result as string;
          if (base64Url && editor) {
            editor.chain().focus().setImage({ src: base64Url, alt: file.name }).run();
          }
        };
        reader.readAsDataURL(file);
      }
    } catch (e) {
      console.error("Image loading failed:", e);
    }
  };

  const handleAddLink = () => {
    const url = prompt("Enter hyperlink URL:");
    if (url === null) return;
    if (url === '') {
      editor?.chain().focus().unsetLink().run();
    } else {
      editor?.chain().focus().setLink({ href: url }).run();
    }
  };

  // Insert base64 drawing into note editor
  const handleInsertDrawing = (base64DataUrl: string) => {
    if (editor) {
      editor.chain().focus().setImage({ src: base64DataUrl, alt: 'sketch' }).run();
    }
  };

  const handleExportDocument = async (format: 'pdf' | 'markdown' | 'html' | 'txt') => {
    if (!note) return;
    const title = note.title || 'Untitled';

    if (format === 'txt') {
      await saveLocalFile(note.plain_text || '', {
        suggestedName: `${title}.txt`,
        filters: [{ name: 'Text Files', extensions: ['txt'] }]
      });
    } else if (format === 'markdown') {
      let md = note.content || '';
      md = md.replace(/<h1>(.*?)<\/h1>/gi, '# $1\n\n')
             .replace(/<h2>(.*?)<\/h2>/gi, '## $1\n\n')
             .replace(/<h3>(.*?)<\/h3>/gi, '### $1\n\n')
             .replace(/<p>(.*?)<\/p>/gi, '$1\n\n')
             .replace(/<li>(.*?)<\/li>/gi, '- $1\n')
             .replace(/<ul>/gi, '')
             .replace(/<\/ul>/gi, '\n')
             .replace(/<ol>/gi, '')
             .replace(/<\/ol>/gi, '\n')
             .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
             .replace(/<em>(.*?)<\/em>/gi, '*$1*')
             .replace(/<pre><code>(.*?)<\/code><\/pre>/gi, '```\n$1\n```\n\n')
             .replace(/<br\s*\/?>/gi, '\n')
             .replace(/<[^>]+>/g, '');
      
      await saveLocalFile(md, {
        suggestedName: `${title}.md`,
        filters: [{ name: 'Markdown Files', extensions: ['md'] }]
      });
    } else if (format === 'html') {
      await saveLocalFile(note.content || '', {
        suggestedName: `${title}.html`,
        filters: [{ name: 'HTML Files', extensions: ['html'] }]
      });
    } else if (format === 'pdf') {
      try {
        const { jsPDF } = await import('jspdf');
        const doc = new jsPDF('p', 'pt', 'a4');
        
        const tempDiv = document.createElement('div');
        tempDiv.style.width = '500px';
        tempDiv.style.padding = '40px';
        tempDiv.style.fontFamily = 'sans-serif';
        tempDiv.style.color = '#1f2937';
        tempDiv.innerHTML = `
          <h1 style="font-size: 24px; margin-bottom: 20px; font-weight: bold; color: #111827;">${title}</h1>
          <div style="font-size: 12px; line-height: 1.6;">${note.content || ''}</div>
        `;
        document.body.appendChild(tempDiv);

        doc.html(tempDiv, {
          callback: async (pdf) => {
            document.body.removeChild(tempDiv);
            const pdfBytes = pdf.output('arraybuffer');
            await saveLocalFile(new Uint8Array(pdfBytes), {
              suggestedName: `${title}.pdf`,
              filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
            });
          },
          x: 10,
          y: 10,
          autoPaging: 'text',
        });
      } catch (err) {
        console.error("PDF generation failed:", err);
        showToast("PDF generation failed", "error");
      }
    }
  };

  const handleExportScratchpad = async (format: 'pdf' | 'png') => {
    if (!note || !note.drawing_data) return;
    const title = note.title || 'Untitled';
    let payload: any;
    try {
      payload = JSON.parse(note.drawing_data);
    } catch {
      showToast("No drawing data found", "error");
      return;
    }

    const pages = payload.pages || [];
    if (pages.length === 0) {
      showToast("No drawing pages found", "error");
      return;
    }

    showToast("Preparing pages for export...", "info");

    const dpr = 2; // high resolution
    const canvases: HTMLCanvasElement[] = [];

    // Load PDF if present
    let pdfDoc: any = null;
    if (payload.pdfFile && payload.pdfFile.data) {
      try {
        const binaryString = window.atob(payload.pdfFile.data);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const loadingTask = pdfjs.getDocument({ data: bytes });
        pdfDoc = await loadingTask.promise;
      } catch (e) {
        console.error("PDF load failed during export:", e);
      }
    }

    const renderBG = (canvas: HTMLCanvasElement, template: string, bgColor: string) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, w, h);

      const isDark = bgColor === '#1e1e24' || bgColor === '#000000';
      const lineColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';
      ctx.strokeStyle = lineColor;

      if (template === 'ruled') {
        ctx.lineWidth = 1 * dpr;
        const step = 28 * dpr;
        const pad = 30 * dpr;
        for (let y = 50 * dpr; y < h; y += step) {
          ctx.beginPath();
          ctx.moveTo(pad, y);
          ctx.lineTo(w - pad, y);
          ctx.stroke();
        }
      } else if (template === 'grid') {
        ctx.lineWidth = 0.5 * dpr;
        const step = 24 * dpr;
        for (let x = step; x < w; x += step) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
          ctx.stroke();
        }
        for (let y = step; y < h; y += step) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }
      } else if (template === 'dotted') {
        ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.25)';
        const step = 24 * dpr;
        const dotRadius = 1 * dpr;
        for (let x = step; x < w; x += step) {
          for (let y = step; y < h; y += step) {
            ctx.beginPath();
            ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    };

    const renderPDF = async (canvas: HTMLCanvasElement, pageNum: number) => {
      if (!pdfDoc) return;
      try {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        if (pageNum <= pdfDoc.numPages) {
          const page = await pdfDoc.getPage(pageNum);
          const originalViewport = page.getViewport({ scale: 1 });
          const scale = canvas.width / originalViewport.width;
          const viewport = page.getViewport({ scale });
          await page.render({ canvasContext: ctx, viewport }).promise;
        }
      } catch (e) {
        console.error("PDF render failed during export:", e);
      }
    };

    // Render all pages
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const canvas = document.createElement('canvas');
      canvas.width = 900 * dpr;
      canvas.height = 1270 * dpr;

      renderBG(canvas, page.template, page.bgColor);

      if (pdfDoc) {
        await renderPDF(canvas, i + 1);
      }

      if (page.annotations) {
        await new Promise<void>((resolve) => {
          const img = new window.Image();
          img.onload = () => {
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve();
          };
          img.src = page.annotations;
        });
      }

      canvases.push(canvas);
    }

    if (format === 'png') {
      if (canvases.length === 1) {
        const dataUrl = canvases[0].toDataURL('image/png');
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const arrayBuffer = await blob.arrayBuffer();
        await saveLocalFile(new Uint8Array(arrayBuffer), {
          suggestedName: `${title}.png`,
          filters: [{ name: 'PNG Image', extensions: ['png'] }]
        });
      } else {
        const JSZip = (await import('jszip')).default;
        const zip = new JSZip();
        for (let i = 0; i < canvases.length; i++) {
          const dataUrl = canvases[i].toDataURL('image/png');
          const base64Data = dataUrl.split(',')[1];
          zip.file(`page_${i + 1}.png`, base64Data, { base64: true });
        }
        const zipContent = await zip.generateAsync({ type: 'uint8array' });
        await saveLocalFile(zipContent, {
          suggestedName: `${title}_pages.zip`,
          filters: [{ name: 'Zip Archive', extensions: ['zip'] }]
        });
      }
    } else if (format === 'pdf') {
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF('p', 'mm', 'a4');
      for (let i = 0; i < canvases.length; i++) {
        if (i > 0) pdf.addPage();
        const dataUrl = canvases[i].toDataURL('image/jpeg', 0.9);
        pdf.addImage(dataUrl, 'JPEG', 0, 0, 210, 297);
      }
      const pdfBytes = pdf.output('arraybuffer');
      await saveLocalFile(new Uint8Array(pdfBytes), {
        suggestedName: `${title}.pdf`,
        filters: [{ name: 'PDF Document', extensions: ['pdf'] }]
      });
    }
  };

  // Title debounce typing handler
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setLocalTitle(newTitle);

    if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
    titleTimerRef.current = setTimeout(async () => {
      await updateNote(note.id, { title: newTitle });
    }, 300);
  };

  // Associated tags
  const associatedTagIds = noteTags[note.id] || [];

  return (
    <div className="flex-1 flex overflow-hidden h-full">
      {/* Koda Sketchpad Modal */}
      <DrawingBoard 
        isOpen={drawingOpen} 
        onClose={() => setDrawingOpen(false)} 
        onInsertImage={handleInsertDrawing} 
      />

      {/* Editor Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-neutral-900 relative" style={{ backgroundColor: 'var(--bg-app)' }}>
        
        {isTopBarCollapsed && (
          <button
            onClick={() => setIsTopBarCollapsed(false)}
            className="absolute top-0 left-1/2 -translate-x-1/2 z-30 px-3 py-1 bg-violet-600 hover:bg-violet-500 text-white rounded-b-md text-[10px] font-medium shadow-md flex items-center gap-1 cursor-pointer transition-all animate-fade-in hover:py-1.5"
            title="Expand Toolbar"
          >
            <span>Show Menu</span>
            <ChevronDown size={10} />
          </button>
        )}

        {!isTopBarCollapsed && (
          <>
            {/* Editor Top Bar: Title controls & note states */}
            <div 
              className="flex flex-wrap items-center justify-between px-6 py-3 border-b shrink-0 gap-3"
              style={{ borderColor: 'var(--border-main)' }}
            >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <input
              type="text"
              value={localTitle}
              onChange={handleTitleChange}
              disabled={note.is_read_only === 1}
              className="text-2xl font-bold bg-transparent outline-none font-heading border-b border-transparent focus:border-neutral-500 w-full truncate"
              style={{ color: 'var(--text-primary)' }}
              placeholder="Note Title"
            />
          </div>

          {/* Pin, Star, Archive, Trash actions */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Editor Mode Selector */}
            <div className="flex bg-neutral-950/60 p-0.5 rounded border border-neutral-800 gap-0.5 mr-1" style={{ borderColor: 'var(--border-main)' }}>
              <button
                onClick={() => updateNote(note.id, { editor_mode: 'text' })}
                disabled={note.is_read_only === 1}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  note.editor_mode !== 'scratchpad' ? 'bg-violet-600 text-white font-medium shadow-sm' : 'text-neutral-400 hover:text-neutral-200'
                }`}
                title="Switch to Document Editor"
              >
                <FileText size={10} /> Document
              </button>
              <button
                onClick={() => updateNote(note.id, { editor_mode: 'scratchpad' })}
                disabled={note.is_read_only === 1}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  note.editor_mode === 'scratchpad' ? 'bg-violet-600 text-white font-medium shadow-sm' : 'text-neutral-400 hover:text-neutral-200'
                }`}
                title="Switch to Scratchpad Canvas"
              >
                <Paintbrush size={10} /> Scratchpad
              </button>
            </div>

            {/* Export Dropdown */}
            <div className="relative mr-1 shrink-0">
              <button
                onClick={() => setExportMenuOpen(!exportMenuOpen)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-neutral-950/60 border border-neutral-800 hover:border-neutral-700 text-neutral-300 text-[10px] transition-colors cursor-pointer"
                title="Save As / Export Note"
                style={{ borderColor: 'var(--border-main)' }}
              >
                <Download size={10} className="text-violet-400" /> Export <ChevronDown size={8} />
              </button>
              {exportMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setExportMenuOpen(false)} />
                  <div 
                    className="absolute right-0 mt-1.5 w-36 bg-neutral-900 border border-neutral-800 rounded shadow-lg py-1 z-50 text-[11px]" 
                    style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-main)' }}
                  >
                    {note.editor_mode === 'scratchpad' ? (
                      <>
                        <button
                          onClick={() => { handleExportScratchpad('pdf'); setExportMenuOpen(false); }}
                          className="w-full text-left px-3 py-1.5 hover:bg-neutral-800 text-neutral-300 flex items-center gap-2 cursor-pointer transition-colors"
                        >
                          <FileText size={11} className="text-red-400" /> Export PDF
                        </button>
                        <button
                          onClick={() => { handleExportScratchpad('png'); setExportMenuOpen(false); }}
                          className="w-full text-left px-3 py-1.5 hover:bg-neutral-800 text-neutral-300 flex items-center gap-2 cursor-pointer transition-colors"
                        >
                          <ImageIcon size={11} className="text-blue-400" /> Export PNG
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => { handleExportDocument('pdf'); setExportMenuOpen(false); }}
                          className="w-full text-left px-3 py-1.5 hover:bg-neutral-800 text-neutral-300 flex items-center gap-2 cursor-pointer transition-colors"
                        >
                          <FileText size={11} className="text-red-400" /> Export PDF
                        </button>
                        <button
                          onClick={() => { handleExportDocument('markdown'); setExportMenuOpen(false); }}
                          className="w-full text-left px-3 py-1.5 hover:bg-neutral-800 text-neutral-300 flex items-center gap-2 cursor-pointer transition-colors"
                        >
                          <FileText size={11} className="text-emerald-400" /> Export Markdown
                        </button>
                        <button
                          onClick={() => { handleExportDocument('html'); setExportMenuOpen(false); }}
                          className="w-full text-left px-3 py-1.5 hover:bg-neutral-800 text-neutral-300 flex items-center gap-2 cursor-pointer transition-colors"
                        >
                          <FileText size={11} className="text-blue-400" /> Export HTML
                        </button>
                        <button
                          onClick={() => { handleExportDocument('txt'); setExportMenuOpen(false); }}
                          className="w-full text-left px-3 py-1.5 hover:bg-neutral-800 text-neutral-300 flex items-center gap-2 cursor-pointer transition-colors"
                        >
                          <FileText size={11} className="text-neutral-400" /> Export Text
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Zen Mode toggle */}
            <button
              onClick={toggleZenMode}
              className={`p-1.5 rounded transition-colors ${
                isZenMode ? 'text-violet-500 bg-violet-500/10' : 'text-neutral-500 hover:bg-neutral-800'
              }`}
              title={isZenMode ? 'Exit Zen Mode (Esc)' : 'Enter Zen Mode'}
            >
              {isZenMode ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>

            {/* Read only toggle */}
            <button
              onClick={() => updateNote(note.id, { is_read_only: note.is_read_only === 1 ? 0 : 1 })}
              className={`p-1.5 rounded transition-colors ${
                note.is_read_only === 1 ? 'text-amber-500 bg-amber-500/10' : 'text-neutral-500 hover:bg-neutral-800'
              }`}
              title={note.is_read_only === 1 ? 'Read Only (Click to edit)' : 'Editable (Click to lock)'}
            >
              {note.is_read_only === 1 ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>

            <button
              onClick={() => pinNote(note.id, note.is_pinned !== 1)}
              className={`p-1.5 rounded transition-colors ${
                note.is_pinned === 1 ? 'text-amber-500 bg-amber-500/10' : 'text-neutral-500 hover:bg-neutral-800'
              }`}
              title="Pin Note"
            >
              <Pin size={15} className={note.is_pinned === 1 ? 'fill-amber-500' : ''} />
            </button>

            <button
              onClick={() => favoriteNote(note.id, note.is_favorite !== 1)}
              className={`p-1.5 rounded transition-colors ${
                note.is_favorite === 1 ? 'text-rose-500 bg-rose-500/10' : 'text-neutral-500 hover:bg-neutral-800'
              }`}
              title="Favorite Note"
            >
              <Star size={15} className={note.is_favorite === 1 ? 'fill-rose-500' : ''} />
            </button>

            <button
              onClick={() => archiveNote(note.id, note.is_archived !== 1)}
              className={`p-1.5 rounded transition-colors ${
                note.is_archived === 1 ? 'text-emerald-500 bg-emerald-500/10' : 'text-neutral-500 hover:bg-neutral-800'
              }`}
              title="Archive Note"
            >
              <Archive size={15} />
            </button>

            <div className="h-4 w-[1px] bg-neutral-800" style={{ backgroundColor: 'var(--border-main)' }} />

            <button
              onClick={() => deleteNote(note.id)}
              className="p-1.5 hover:bg-red-950/20 hover:text-red-400 text-neutral-500 rounded transition-colors"
              title="Move to Trash"
            >
              <Trash size={15} />
            </button>

            <div className="h-4 w-[1px] bg-neutral-800" style={{ backgroundColor: 'var(--border-main)' }} />

            <button
              onClick={() => setIsTopBarCollapsed(true)}
              className="p-1.5 rounded transition-colors text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
              title="Collapse Toolbar (Maximize Space)"
            >
              <ChevronDown size={15} className="rotate-180" />
            </button>
          </div>
        </div>

        {/* Tags Row */}
        <div className="px-6 py-1.5 flex items-center gap-1.5 flex-wrap border-b" style={{ borderColor: 'var(--border-main)' }}>
          <span className="text-[10px] text-neutral-500 uppercase font-semibold">Tags:</span>
          {associatedTagIds.map(tid => {
            const tag = tags.find(t => t.id === tid);
            if (!tag) return null;
            return (
              <span 
                key={tag.id}
                className="text-[10px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1 border"
                style={{ borderColor: tag.color, color: tag.color }}
              >
                <span>{tag.name}</span>
                {note.is_read_only === 0 && (
                  <button 
                    onClick={() => removeTagFromNote(note.id, tag.id)}
                    className="hover:bg-neutral-800 rounded px-0.5"
                  >
                    ×
                  </button>
                )}
              </span>
            );
          })}

          {note.is_read_only === 0 && (
            <div className="relative">
              <button 
                onClick={() => setTagDropdownOpen(!tagDropdownOpen)}
                className="text-[10px] px-2 py-0.5 rounded-full border border-neutral-700 hover:border-neutral-500 text-neutral-400 flex items-center gap-0.5"
              >
                <Plus size={8} /> Add Tag
              </button>

              {tagDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setTagDropdownOpen(false)} />
                  <div 
                    className="absolute left-0 mt-1 w-40 bg-neutral-900 border border-neutral-800 rounded-md shadow-lg p-1.5 z-50 text-xs max-h-48 overflow-y-auto"
                    style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-main)' }}
                  >
                    {tags.filter(t => !associatedTagIds.includes(t.id)).length === 0 ? (
                      <span className="text-[10px] text-neutral-500 block p-1 italic text-center">No tags available</span>
                    ) : (
                      tags.filter(t => !associatedTagIds.includes(t.id)).map(tag => (
                        <button
                          key={tag.id}
                          onClick={() => {
                            addTagToNote(note.id, tag.id);
                            setTagDropdownOpen(false);
                          }}
                          className="w-full text-left px-2 py-1 hover:bg-neutral-800 rounded flex items-center gap-1.5"
                          style={{ color: tag.color }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tag.color }} />
                          {tag.name}
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
          </>
        )}

        {note.editor_mode === 'scratchpad' ? (
          <HandwrittenCanvas noteId={note.id} />
        ) : (
          <>
            {/* Formatting Toolbar */}
            {note.is_read_only === 0 && editor && (
              <div 
                className="flex flex-wrap items-center gap-0.5 px-4 py-1.5 border-b bg-neutral-950/20 shrink-0"
                style={{ borderColor: 'var(--border-main)', backgroundColor: 'var(--bg-sidebar)' }}
              >
                {/* Bold, Italic, Underline, Strike */}
                <button onClick={toggleBold} className={`p-1.5 rounded text-neutral-400 hover:bg-neutral-800 ${editor.isActive('bold') ? 'text-violet-400 bg-neutral-800' : ''}`} title="Bold"><Bold size={13} /></button>
                <button onClick={toggleItalic} className={`p-1.5 rounded text-neutral-400 hover:bg-neutral-800 ${editor.isActive('italic') ? 'text-violet-400 bg-neutral-800' : ''}`} title="Italic"><Italic size={13} /></button>
                <button onClick={toggleUnderline} className={`p-1.5 rounded text-neutral-400 hover:bg-neutral-800 ${editor.isActive('underline') ? 'text-violet-400 bg-neutral-800' : ''}`} title="Underline"><UnderlineIcon size={13} /></button>
                <button onClick={toggleStrike} className={`p-1.5 rounded text-neutral-400 hover:bg-neutral-800 ${editor.isActive('strike') ? 'text-violet-400 bg-neutral-800' : ''}`} title="Strikethrough"><Strikethrough size={13} /></button>

                <div className="h-4 w-[1px] bg-neutral-800 mx-1" style={{ backgroundColor: 'var(--border-main)' }} />

                {/* Font Family selector dropdown */}
                <div className="relative">
                  <button 
                    onClick={() => setFontFamilyOpen(!fontFamilyOpen)}
                    className="p-1 px-2 rounded hover:bg-neutral-800 text-neutral-400 text-xs flex items-center gap-1"
                    title="Font Family"
                  >
                    Font <ChevronDown size={10} />
                  </button>
                  {fontFamilyOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setFontFamilyOpen(false)} />
                      <div className="absolute left-0 mt-1 w-36 bg-neutral-900 border border-neutral-800 rounded-md shadow-lg p-1 z-50 text-xs flex flex-col" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-main)' }}>
                        {FONT_FAMILIES.map(f => (
                          <button
                            key={f.value}
                            onClick={() => {
                              editor.chain().focus().setFontFamily(f.value).run();
                              setFontFamilyOpen(false);
                            }}
                            className={`text-left px-2 py-1 hover:bg-neutral-800 rounded text-neutral-300 font-light`}
                            style={{ fontFamily: f.value }}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Font Size selector dropdown */}
                <div className="relative">
                  <button 
                    onClick={() => setFontSizeOpen(!fontSizeOpen)}
                    className="p-1 px-2 rounded hover:bg-neutral-800 text-neutral-400 text-xs flex items-center gap-1"
                    title="Font Size"
                  >
                    Size <ChevronDown size={10} />
                  </button>
                  {fontSizeOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setFontSizeOpen(false)} />
                      <div className="absolute left-0 mt-1 w-24 bg-neutral-900 border border-neutral-800 rounded-md shadow-lg p-1 z-50 text-xs flex flex-col" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-main)' }}>
                        {FONT_SIZES.map(s => (
                          <button
                            key={s.value}
                            onClick={() => {
                              (editor.commands as any).setFontSize(s.value);
                              setFontSizeOpen(false);
                            }}
                            className="text-left px-2 py-1 hover:bg-neutral-800 rounded text-neutral-300 font-light"
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <div className="h-4 w-[1px] bg-neutral-800 mx-1" style={{ backgroundColor: 'var(--border-main)' }} />

                {/* Text Color picker dropdown */}
                <div className="relative">
                  <button 
                    onClick={() => setTextColorOpen(!textColorOpen)}
                    className="p-1.5 rounded text-neutral-400 hover:bg-neutral-800 flex items-center"
                    title="Text Color"
                  >
                    <Palette size={13} />
                  </button>
                  {textColorOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setTextColorOpen(false)} />
                      <div className="absolute left-0 mt-1 p-2 bg-neutral-900 border border-neutral-800 rounded-md shadow-lg z-50 w-32 grid grid-cols-4 gap-1.5" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-main)' }}>
                        {TEXT_COLORS.map(c => (
                          <button
                            key={c.value}
                            onClick={() => {
                              editor.chain().focus().setColor(c.value).run();
                              setTextColorOpen(false);
                            }}
                            className="w-5 h-5 rounded-full border border-neutral-700 hover:scale-110 transition-transform cursor-pointer"
                            style={{ backgroundColor: c.value }}
                            title={c.label}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Text Highlight picker dropdown */}
                <div className="relative">
                  <button 
                    onClick={() => setHighlightColorOpen(!highlightColorOpen)}
                    className="p-1.5 rounded text-neutral-400 hover:bg-neutral-800 flex items-center"
                    title="Highlight Background"
                  >
                    <Highlighter size={13} />
                  </button>
                  {highlightColorOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setHighlightColorOpen(false)} />
                      <div className="absolute left-0 mt-1 p-2 bg-neutral-900 border border-neutral-800 rounded-md shadow-lg z-50 w-32 grid grid-cols-4 gap-1.5" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-main)' }}>
                        {HIGHLIGHT_COLORS.map(c => (
                          <button
                            key={c.value}
                            onClick={() => {
                              if (c.value === '') {
                                editor.chain().focus().unsetHighlight().run();
                              } else {
                                toggleHighlight(c.value);
                              }
                              setHighlightColorOpen(false);
                            }}
                            className="w-5 h-5 rounded-full border border-neutral-700 hover:scale-110 transition-transform cursor-pointer flex items-center justify-center bg-transparent text-[10px] text-neutral-500 font-bold"
                            style={{ backgroundColor: c.value || '#00000020' }}
                            title={c.label}
                          >
                            {c.value === '' && '×'}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Sketch / Drawing Pen writing tool */}
                <button 
                  onClick={() => setDrawingOpen(true)} 
                  className="p-1.5 rounded text-neutral-400 hover:bg-neutral-800 flex items-center" 
                  title="Pen Drawing Sketchpad"
                >
                  <Paintbrush size={13} className="text-violet-400" />
                </button>

                <div className="h-4 w-[1px] bg-neutral-800 mx-1" style={{ backgroundColor: 'var(--border-main)' }} />

                <button onClick={() => setHeading(1)} className={`p-1.5 rounded text-neutral-400 hover:bg-neutral-800 ${editor.isActive('heading', { level: 1 }) ? 'text-violet-400 bg-neutral-800' : ''}`} title="Heading 1"><Heading1 size={13} /></button>
                <button onClick={() => setHeading(2)} className={`p-1.5 rounded text-neutral-400 hover:bg-neutral-800 ${editor.isActive('heading', { level: 2 }) ? 'text-violet-400 bg-neutral-800' : ''}`} title="Heading 2"><Heading2 size={13} /></button>
                <button onClick={() => setHeading(3)} className={`p-1.5 rounded text-neutral-400 hover:bg-neutral-800 ${editor.isActive('heading', { level: 3 }) ? 'text-violet-400 bg-neutral-800' : ''}`} title="Heading 3"><Heading3 size={13} /></button>

                <div className="h-4 w-[1px] bg-neutral-800 mx-1" style={{ backgroundColor: 'var(--border-main)' }} />

                <button onClick={toggleBulletList} className={`p-1.5 rounded text-neutral-400 hover:bg-neutral-800 ${editor.isActive('bulletList') ? 'text-violet-400 bg-neutral-800' : ''}`} title="Bullet List"><List size={13} /></button>
                <button onClick={toggleOrderedList} className={`p-1.5 rounded text-neutral-400 hover:bg-neutral-800 ${editor.isActive('orderedList') ? 'text-violet-400 bg-neutral-800' : ''}`} title="Numbered List"><ListOrdered size={13} /></button>
                <button onClick={toggleTaskList} className={`p-1.5 rounded text-neutral-400 hover:bg-neutral-800 ${editor.isActive('taskList') ? 'text-violet-400 bg-neutral-800' : ''}`} title="Checklist"><CheckSquare size={13} /></button>
                <button onClick={toggleBlockquote} className={`p-1.5 rounded text-neutral-400 hover:bg-neutral-800 ${editor.isActive('blockquote') ? 'text-violet-400 bg-neutral-800' : ''}`} title="Blockquote"><Quote size={13} /></button>
                <button onClick={toggleCodeBlock} className={`p-1.5 rounded text-neutral-400 hover:bg-neutral-800 ${editor.isActive('codeBlock') ? 'text-violet-400 bg-neutral-800' : ''}`} title="Code Block"><FileText size={13} /></button>
                
                <div className="h-4 w-[1px] bg-neutral-800 mx-1" style={{ backgroundColor: 'var(--border-main)' }} />

                <button onClick={handleInsertImage} className="p-1.5 rounded text-neutral-400 hover:bg-neutral-800" title="Insert Image"><ImageIcon size={13} /></button>
                <button onClick={handleAddLink} className={`p-1.5 rounded text-neutral-400 hover:bg-neutral-800 ${editor.isActive('link') ? 'text-violet-400 bg-neutral-800' : ''}`} title="Hyperlink"><LinkIcon size={13} /></button>
                <button onClick={insertTable} className="p-1.5 rounded text-neutral-400 hover:bg-neutral-800" title="Insert Table"><TableIcon size={13} /></button>
                <button onClick={insertHorizontalRule} className="p-1.5 rounded text-neutral-400 hover:bg-neutral-800" title="Horizontal Rule"><Minus size={13} /></button>

                <div className="h-4 w-[1px] bg-neutral-800 mx-1" style={{ backgroundColor: 'var(--border-main)' }} />

                <button onClick={handleUndo} className="p-1.5 rounded text-neutral-400 hover:bg-neutral-800" title="Undo"><Undo size={13} /></button>
                <button onClick={handleRedo} className="p-1.5 rounded text-neutral-400 hover:bg-neutral-800" title="Redo"><Redo size={13} /></button>
              </div>
            )}

            {/* Editor Body Wrapper */}
            <div className="flex-1 overflow-y-auto px-10 py-6">
              <div className="max-w-[800px] mx-auto min-h-[400px]">
                <EditorContent editor={editor} />
              </div>
            </div>

            {/* Footer Statistics */}
            <div 
              className="h-8 px-6 border-t flex items-center justify-between text-[11px] shrink-0 text-neutral-500"
              style={{ borderColor: 'var(--border-main)', backgroundColor: 'var(--bg-sidebar)' }}
            >
              <div className="flex items-center gap-4">
                <span>Words: <strong className="text-neutral-400">{wordCount}</strong></span>
                <span>Characters: <strong className="text-neutral-400">{charCount}</strong></span>
                <span>Reading Time: <strong className="text-neutral-400">{Math.ceil(wordCount / 200)} min</strong></span>
              </div>

              <div className="flex items-center gap-3">
                {headings.length > 0 && (
                  <button 
                    onClick={() => setShowToc(!showToc)}
                    className={`flex items-center gap-1.5 px-2 py-0.5 rounded transition-colors ${
                      showToc ? 'text-violet-400 bg-neutral-800' : 'hover:bg-neutral-800'
                    }`}
                  >
                    Outline
                    {showToc ? <ChevronLeft size={10} /> : <ChevronRight size={10} />}
                  </button>
                )}
                <span className="italic">Autosaved</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Outlining Header Panel (Table of Contents) */}
      {note.editor_mode !== 'scratchpad' && showToc && headings.length > 0 && (
        <div 
          className="w-56 h-full border-l overflow-y-auto p-4 select-none shrink-0"
          style={{ 
            backgroundColor: 'var(--bg-sidebar)', 
            borderColor: 'var(--border-main)',
            color: 'var(--text-secondary)'
          }}
        >
          <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-500 block mb-3">Outline</span>
          <div className="space-y-1.5 text-xs">
            {headings.map((heading, i) => (
              <div
                key={i}
                onClick={() => scrollToHeading(heading.pos)}
                className="hover:text-violet-400 hover:underline cursor-pointer truncate font-light"
                style={{ 
                  paddingLeft: `${(heading.level - 1) * 8}px`,
                  opacity: heading.level === 1 ? 1 : heading.level === 2 ? 0.8 : 0.6
                }}
              >
                {heading.text || <span className="italic opacity-40">Empty heading</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

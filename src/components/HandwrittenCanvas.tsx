import React from 'react';
import { useNotesStore } from '../store/notesStore';
import { useLayoutStore } from '../store/layoutStore';
import { openLocalFile, showToast } from '../services/tauriBridge';
import { 
  Paintbrush, Eraser, Highlighter, ChevronLeft, ChevronRight, 
  Plus, Trash2, Upload, Undo, Redo, Maximize2, Minimize2,
  Lock, Unlock
} from 'lucide-react';
import * as pdfjs from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Set PDF.js worker locally using Vite resource importer
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

interface HandwrittenCanvasProps {
  noteId: string;
}

type TemplateType = 'blank' | 'ruled' | 'grid' | 'dotted';
type ToolType = 'pen' | 'highlighter' | 'eraser';

interface PageData {
  template: TemplateType;
  bgColor: string;
  annotations: string; // Base64 image data URL of drawings
  pdfPageNum?: number; // link to PDF page
}

interface DrawingDataPayload {
  pages: PageData[];
  currentPageIndex: number;
  pdfFile?: {
    name: string;
    data: string; // base64 representation of PDF file
    totalPages: number;
  } | null;
}

const PAGE_TEMPLATES: { id: TemplateType; label: string }[] = [
  { id: 'blank', label: 'Blank Page' },
  { id: 'ruled', label: 'Ruled Lined' },
  { id: 'grid', label: 'Graph Grid' },
  { id: 'dotted', label: 'Dotted Bullet' }
];

const PEN_COLORS = [
  '#000000', // Black
  '#ffffff', // White
  '#ef4444', // Red
  '#3b82f6', // Blue
  '#10b981', // Green
  '#f59e0b', // Yellow
  '#8b5cf6', // Violet
  '#ec4899', // Pink
];

const PEN_SIZES = [
  { label: 'Fine', value: 2 },
  { label: 'Medium', value: 5 },
  { label: 'Thick', value: 10 },
  { label: 'Heavy', value: 20 }
];

export const HandwrittenCanvas: React.FC<HandwrittenCanvasProps> = ({ noteId }) => {
  const { notes, updateNote } = useNotesStore();
  const { isZenMode, toggleZenMode } = useLayoutStore();
  const note = notes.find(n => n.id === noteId);

  // States
  const [pages, setPages] = React.useState<PageData[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = React.useState(0);
  const [pdfFile, setPdfFile] = React.useState<DrawingDataPayload['pdfFile']>(null);

  // Drawing config states
  const [isScrollLocked, setIsScrollLocked] = React.useState(false);
  const [tool, setTool] = React.useState<ToolType>('pen');
  const [color, setColor] = React.useState('#000000');
  const [lineWidth, setLineWidth] = React.useState(5);

  const [isDrawing, setIsDrawing] = React.useState(false);
  const [colorMenuOpen, setColorMenuOpen] = React.useState(false);

  // Canvas Refs
  const bgCanvasRef = React.useRef<HTMLCanvasElement>(null);
  const drawingCanvasRef = React.useRef<HTMLCanvasElement>(null);
  
  // Real-time draw bypass and Undo/Redo history stacks
  const justDrawnRef = React.useRef(false);
  const pointsRef = React.useRef<{ x: number; y: number }[]>([]);
  const [undoStack, setUndoStack] = React.useState<string[]>([]);
  const [redoStack, setRedoStack] = React.useState<string[]>([]);

  // Reset undo stacks when page changes to keep them scoped
  React.useEffect(() => {
    setUndoStack([]);
    setRedoStack([]);
  }, [noteId, currentPageIndex]);
  
  // Parse state from note database
  React.useEffect(() => {
    if (!note) return;

    let payload: DrawingDataPayload = {
      pages: [{ template: 'ruled', bgColor: '#faf8f0', annotations: '' }],
      currentPageIndex: 0,
      pdfFile: null
    };

    if ((note as any).drawing_data) {
      try {
        payload = JSON.parse((note as any).drawing_data);
      } catch (e) {
        console.error("Failed to parse drawing data:", e);
      }
    }

    setPages(payload.pages || [{ template: 'ruled', bgColor: '#faf8f0', annotations: '' }]);
    setCurrentPageIndex(payload.currentPageIndex || 0);
    setPdfFile(payload.pdfFile || null);
  }, [noteId]);

  const currentPage = pages[currentPageIndex] || { template: 'ruled', bgColor: '#faf8f0', annotations: '' };

  // Sync state back to note database (autosave debounce)
  const saveTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const triggerSave = (updatedPages: PageData[], index: number, pdf: DrawingDataPayload['pdfFile']) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const payload: DrawingDataPayload = {
        pages: updatedPages,
        currentPageIndex: index,
        pdfFile: pdf
      };
      await updateNote(noteId, {
        drawing_data: JSON.stringify(payload)
      } as any);
    }, 400);
  };

  // Adjust canvases size and render background + drawings
  const adjustCanvas = React.useCallback(async () => {
    const drawingCanvas = drawingCanvasRef.current;
    const bgCanvas = bgCanvasRef.current;
    if (!drawingCanvas || !bgCanvas) return;

    if (justDrawnRef.current) {
      justDrawnRef.current = false;
      return;
    }

    // Keep internal resolution fixed to A4 (900x1270) scaled by DPR for crispness
    const dpr = window.devicePixelRatio || 1;
    const fixedWidth = 900 * dpr;
    const fixedHeight = 1270 * dpr;

    drawingCanvas.width = fixedWidth;
    drawingCanvas.height = fixedHeight;
    bgCanvas.width = fixedWidth;
    bgCanvas.height = fixedHeight;

    // Render BG Template
    renderBackground(bgCanvas, currentPage.template, currentPage.bgColor);

    // If PDF page is linked, render PDF page on top of background
    if (pdfFile && pdfFile.data) {
      await renderPDFPage(bgCanvas, pdfFile.data, currentPageIndex + 1);
    }

    // Render Drawing Annotations
    const ctx = drawingCanvas.getContext('2d');
    if (ctx && currentPage.annotations) {
      ctx.clearRect(0, 0, fixedWidth, fixedHeight);
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, fixedWidth, fixedHeight);
      };
      img.src = currentPage.annotations;
    } else if (ctx) {
      ctx.clearRect(0, 0, fixedWidth, fixedHeight);
    }
  }, [currentPageIndex, pages, pdfFile, currentPage.template, currentPage.bgColor]);

  // Trigger adjust canvas on layout sizes
  React.useEffect(() => {
    adjustCanvas();
  }, [adjustCanvas, currentPageIndex, pages.length]);

  // Clean timer on unmount
  React.useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);



  // --- Background Render helpers ---
  const renderBackground = (canvas: HTMLCanvasElement, template: TemplateType, bgColor: string) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const dpr = window.devicePixelRatio || 1;

    // Draw background color
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);

    // Determine grid line color based on background luminance
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

  const renderPDFPage = async (canvas: HTMLCanvasElement, pdfBase64: string, pageNum: number) => {
    try {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Convert base64 to binary ArrayBuffer
      const binaryString = window.atob(pdfBase64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const loadingTask = pdfjs.getDocument({ data: bytes });
      const pdf = await loadingTask.promise;

      if (pageNum <= pdf.numPages) {
        const page = await pdf.getPage(pageNum);
        
        // Scale to fit canvas width
        const originalViewport = page.getViewport({ scale: 1 });
        const scale = canvas.width / originalViewport.width;
        const viewport = page.getViewport({ scale });

        // Draw PDF page on top of canvas background color
        const renderContext = {
          canvasContext: ctx,
          viewport: viewport,
          canvas: canvas
        };
        await page.render(renderContext as any).promise;
      }
    } catch (e) {
      console.error("PDF page render failed:", e);
    }
  };

  // --- Drawing Core Logics ---
  const getCoordinatesFromPointer = (pe: PointerEvent | React.PointerEvent, canvas: HTMLCanvasElement): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect();
    const displayWidth = rect.width || 1;
    const displayHeight = rect.height || 1;
    return {
      x: (pe.clientX - rect.left) * (canvas.width / displayWidth),
      y: (pe.clientY - rect.top) * (canvas.height / displayHeight)
    };
  };

  const getCoordinates = (e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } | null => {
    const canvas = drawingCanvasRef.current;
    if (!canvas) return null;
    return getCoordinatesFromPointer(e, canvas);
  };

  const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return; // only left click / primary pointer
    e.preventDefault();
    const coords = getCoordinates(e);
    if (!coords) return;

    const canvas = drawingCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx) {
      // Save current annotations to undo stack before starting stroke
      const currentAnnotations = currentPage.annotations || '';
      setUndoStack(prev => [...prev.slice(-19), currentAnnotations]);
      setRedoStack([]); // Clear redo history

      pointsRef.current = [coords];
      setIsDrawing(true);
    }
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault();

    const canvas = drawingCanvasRef.current;
    const ctx = canvas?.getContext('2d');

    if (ctx && canvas) {
      const dpr = window.devicePixelRatio || 1;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Setup brush size and stylus pressure sensitivity
      let currentLineWidth = lineWidth * dpr;
      if (e.pointerType === 'pen' && e.pressure > 0) {
        currentLineWidth = lineWidth * dpr * (e.pressure * 1.5 + 0.25);
      }

      // Select styling options
      if (tool === 'highlighter') {
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.45;
        ctx.lineWidth = currentLineWidth * 2.5; // Highlighter is wider
        ctx.globalCompositeOperation = 'source-over';
      } else if (tool === 'eraser') {
        ctx.strokeStyle = '#ffffff';
        ctx.globalAlpha = 1.0;
        ctx.lineWidth = currentLineWidth * 3.5;
        ctx.globalCompositeOperation = 'destination-out'; // transparent erasing
      } else {
        ctx.strokeStyle = color;
        ctx.globalAlpha = 1.0;
        ctx.lineWidth = currentLineWidth;
        ctx.globalCompositeOperation = 'source-over';
      }

      // Retrieve coalesced events if supported
      const nativeEvent = e.nativeEvent;
      let coordsList: { x: number; y: number }[] = [];

      if (nativeEvent && typeof (nativeEvent as any).getCoalescedEvents === 'function') {
        const coalesced = (nativeEvent as any).getCoalescedEvents() as PointerEvent[];
        if (coalesced && coalesced.length > 0) {
          coordsList = coalesced.map(pe => getCoordinatesFromPointer(pe, canvas));
        }
      }

      // Fallback
      if (coordsList.length === 0) {
        const coords = getCoordinates(e);
        if (coords) coordsList.push(coords);
      }

      const points = pointsRef.current;

      for (const coords of coordsList) {
        if (!coords) continue;
        points.push(coords);

        if (points.length > 2) {
          ctx.beginPath();
          // Midpoint of last two segments
          const xc = (points[points.length - 2].x + points[points.length - 1].x) / 2;
          const yc = (points[points.length - 2].y + points[points.length - 1].y) / 2;

          ctx.moveTo(points[points.length - 3].x, points[points.length - 3].y);
          ctx.quadraticCurveTo(points[points.length - 2].x, points[points.length - 2].y, xc, yc);
          ctx.stroke();

          // Shift coordinates
          points[points.length - 3] = { x: xc, y: yc };
          points.splice(points.length - 2, 1);
        } else if (points.length === 2) {
          ctx.beginPath();
          ctx.moveTo(points[0].x, points[0].y);
          ctx.lineTo(points[1].x, points[1].y);
          ctx.stroke();
        }
      }
    }
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    pointsRef.current = []; // Reset points list

    // Save annotations
    const canvas = drawingCanvasRef.current;
    if (canvas) {
      const dataUrl = canvas.toDataURL('image/png');
      const updatedPages = [...pages];
      updatedPages[currentPageIndex] = {
        ...currentPage,
        annotations: dataUrl
      };
      justDrawnRef.current = true; // Avoid anti-flicker reloads
      setPages(updatedPages);
      triggerSave(updatedPages, currentPageIndex, pdfFile);
    }
  };

  // --- Undo/Redo Logics ---
  const handleUndo = React.useCallback(() => {
    if (undoStack.length === 0) return;

    const previousAnnotation = undoStack[undoStack.length - 1];
    const newUndoStack = undoStack.slice(0, -1);
    
    const currentAnnotation = currentPage.annotations || '';
    setRedoStack(prev => [...prev, currentAnnotation]);
    setUndoStack(newUndoStack);

    const updatedPages = [...pages];
    updatedPages[currentPageIndex] = {
      ...currentPage,
      annotations: previousAnnotation
    };
    
    justDrawnRef.current = false;
    setPages(updatedPages);
    triggerSave(updatedPages, currentPageIndex, pdfFile);
    showToast("Undo", "info");
  }, [undoStack, pages, currentPageIndex, currentPage, pdfFile]);

  const handleRedo = React.useCallback(() => {
    if (redoStack.length === 0) return;

    const nextAnnotation = redoStack[redoStack.length - 1];
    const newRedoStack = redoStack.slice(0, -1);
    
    const currentAnnotation = currentPage.annotations || '';
    setUndoStack(prev => [...prev, currentAnnotation]);
    setRedoStack(newRedoStack);

    const updatedPages = [...pages];
    updatedPages[currentPageIndex] = {
      ...currentPage,
      annotations: nextAnnotation
    };
    
    justDrawnRef.current = false;
    setPages(updatedPages);
    triggerSave(updatedPages, currentPageIndex, pdfFile);
    showToast("Redo", "info");
  }, [redoStack, pages, currentPageIndex, currentPage, pdfFile]);

  // Keyboard shortcuts listener
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' || 
        target.tagName === 'TEXTAREA' || 
        target.isContentEditable
      ) {
        return;
      }

      const key = e.key.toLowerCase();

      // Undo/Redo (Ctrl+Z / Ctrl+Y)
      if ((e.ctrlKey || e.metaKey) && key === 'z') {
        e.preventDefault();
        handleUndo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && key === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }

      // Tool selection: 1/P = Pen, 2/H = Highlighter, 3/E = Eraser
      if (key === 'p' || e.key === '1') {
        e.preventDefault();
        setTool('pen');
        showToast("Pen selected", "info");
      } else if (key === 'h' || e.key === '2') {
        e.preventDefault();
        setTool('highlighter');
        showToast("Highlighter selected", "info");
      } else if (key === 'e' || e.key === '3') {
        e.preventDefault();
        setTool('eraser');
        showToast("Eraser selected", "info");
      }

      // Brush size [ and ]
      if (e.key === '[') {
        e.preventDefault();
        setLineWidth(prev => Math.max(2, prev - 3));
      } else if (e.key === ']') {
        e.preventDefault();
        setLineWidth(prev => Math.min(50, prev + 3));
      }

      // Colors cycling with C
      if (key === 'c') {
        e.preventDefault();
        const currentIndex = PEN_COLORS.indexOf(color);
        const nextIndex = (currentIndex + 1) % PEN_COLORS.length;
        setColor(PEN_COLORS[nextIndex]);
        showToast(`Color cycled`, "info");
      }

      // Specific Colors shortcuts (k, w, r, b, g, y, v)
      const keyColorMap: Record<string, string> = {
        'k': '#000000',
        'w': '#ffffff',
        'r': '#ef4444',
        'b': '#3b82f6',
        'g': '#10b981',
        'y': '#f59e0b',
        'v': '#8b5cf6'
      };
      if (key in keyColorMap) {
        e.preventDefault();
        setColor(keyColorMap[key]);
        showToast(`Color changed`, "info");
      }

      // Delete key clears canvas
      if (e.key === 'Delete') {
        e.preventDefault();
        handleClearPage();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tool, color, lineWidth, undoStack, redoStack, pages, currentPageIndex, handleUndo, handleRedo]);

  // --- Toolbar Commands ---
  const handleClearPage = () => {
    const canvas = drawingCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      // Save snapshot to undo stack first
      const currentAnnotations = currentPage.annotations || '';
      setUndoStack(prev => [...prev.slice(-19), currentAnnotations]);
      setRedoStack([]);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const updatedPages = [...pages];
      updatedPages[currentPageIndex] = {
        ...currentPage,
        annotations: ''
      };
      justDrawnRef.current = false; // We want to redraw to clear it
      setPages(updatedPages);
      triggerSave(updatedPages, currentPageIndex, pdfFile);
      showToast("Annotations cleared", "info");
    }
  };

  const handleChangeTemplate = (template: TemplateType) => {
    const updatedPages = [...pages];
    updatedPages[currentPageIndex] = {
      ...currentPage,
      template
    };
    setPages(updatedPages);
    triggerSave(updatedPages, currentPageIndex, pdfFile);
  };

  const handleChangeBgColor = (bgColor: string) => {
    const updatedPages = [...pages];
    updatedPages[currentPageIndex] = {
      ...currentPage,
      bgColor
    };
    setPages(updatedPages);
    triggerSave(updatedPages, currentPageIndex, pdfFile);
  };

  const handleAddPage = () => {
    const newPage: PageData = {
      template: currentPage.template,
      bgColor: currentPage.bgColor,
      annotations: ''
    };
    const updated = [...pages, newPage];
    const newIndex = updated.length - 1;
    
    setPages(updated);
    setCurrentPageIndex(newIndex);
    triggerSave(updated, newIndex, pdfFile);
    showToast("Blank page added", "success");
  };

  const handleDeletePage = () => {
    if (pages.length <= 1) {
      showToast("Notebook must have at least 1 page", "warning");
      return;
    }

    if (confirm("Delete the current drawing page permanently?")) {
      const updated = pages.filter((_, idx) => idx !== currentPageIndex);
      const newIndex = Math.max(0, currentPageIndex - 1);
      
      setPages(updated);
      setCurrentPageIndex(newIndex);
      triggerSave(updated, newIndex, pdfFile);
      showToast("Page deleted", "info");
    }
  };

  const handleImportPDF = async () => {
    try {
      const files = await openLocalFile({
        filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
        multiple: false
      });

      if (!files || files.length === 0) return;

      const file = files[0];
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        
        // Base64 encode array buffer
        let binary = '';
        const bytes = new Uint8Array(arrayBuffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64Pdf = window.btoa(binary);

        // Load document to get total page counts
        const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) });
        const pdf = await loadingTask.promise;

        const totalPages = pdf.numPages;

        // Initialize pages list mapping to PDF page counts
        const pdfPages: PageData[] = [];
        for (let i = 1; i <= totalPages; i++) {
          pdfPages.push({
            template: 'blank', // no template lines for PDFs
            bgColor: '#ffffff',
            annotations: '',
            pdfPageNum: i
          });
        }

        const newPdfFile = {
          name: file.name,
          data: base64Pdf,
          totalPages
        };

        setPdfFile(newPdfFile);
        setPages(pdfPages);
        setCurrentPageIndex(0);
        
        triggerSave(pdfPages, 0, newPdfFile);
        showToast(`Imported PDF: ${file.name} (${totalPages} pages)`, "success");
      };

      reader.readAsArrayBuffer(file);
    } catch (err) {
      console.error(err);
      showToast("Failed to load PDF", "error");
    }
  };

  const handleRemovePDF = () => {
    if (confirm("Remove PDF background document?")) {
      const cleanPages: PageData[] = [
        { template: 'ruled', bgColor: '#faf8f0', annotations: '' }
      ];
      setPdfFile(null);
      setPages(cleanPages);
      setCurrentPageIndex(0);
      triggerSave(cleanPages, 0, null);
      showToast("PDF background removed", "info");
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden select-none bg-neutral-950 font-sans">
      
      {/* Canvas Specialized Toolbar */}
      <div 
        className="flex flex-wrap items-center justify-between px-4 py-2 border-b bg-neutral-900 shrink-0 gap-3 text-xs"
        style={{ borderColor: 'var(--border-main)', backgroundColor: 'var(--bg-sidebar)' }}
      >
        <div className="flex items-center gap-3.5 flex-wrap">
          
          {/* Tool choices: Pen, Highlighter, Eraser */}
          <div className="flex bg-neutral-950/60 p-0.5 rounded border border-neutral-800 gap-0.5" style={{ borderColor: 'var(--border-main)' }}>
            <button
              onClick={() => setTool('pen')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded transition-all cursor-pointer ${
                tool === 'pen' ? 'bg-violet-600 text-white font-medium shadow-sm' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Paintbrush size={12} /> Pen
            </button>
            <button
              onClick={() => setTool('highlighter')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded transition-all cursor-pointer ${
                tool === 'highlighter' ? 'bg-violet-600 text-white font-medium shadow-sm' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Highlighter size={12} /> Highlighter
            </button>
            <button
              onClick={() => setTool('eraser')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded transition-all cursor-pointer ${
                tool === 'eraser' ? 'bg-violet-600 text-white font-medium shadow-sm' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Eraser size={12} /> Eraser
            </button>
          </div>

          {/* Undo/Redo buttons */}
          <div className="flex bg-neutral-950/60 p-0.5 rounded border border-neutral-800 gap-0.5" style={{ borderColor: 'var(--border-main)' }}>
            <button
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              className="p-1.5 hover:bg-neutral-800 text-neutral-400 disabled:opacity-30 rounded transition-colors cursor-pointer"
              title="Undo (Ctrl+Z)"
            >
              <Undo size={12} />
            </button>
            <button
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              className="p-1.5 hover:bg-neutral-800 text-neutral-400 disabled:opacity-30 rounded transition-colors cursor-pointer"
              title="Redo (Ctrl+Y)"
            >
              <Redo size={12} />
            </button>
          </div>

          {/* Color Picker Dropdown */}
          {tool !== 'eraser' && (
            <div className="relative">
              <button
                onClick={() => setColorMenuOpen(!colorMenuOpen)}
                className="p-1 px-2.5 rounded border border-neutral-700 hover:border-neutral-500 bg-neutral-800/40 text-neutral-300 flex items-center gap-1.5 cursor-pointer"
              >
                <div className="w-3.5 h-3.5 rounded-full border border-neutral-600" style={{ backgroundColor: color }} />
                <span>Color</span>
              </button>

              {colorMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setColorMenuOpen(false)} />
                  <div 
                    className="absolute left-0 mt-1 p-2 bg-neutral-900 border border-neutral-800 rounded-md shadow-lg z-50 w-32 grid grid-cols-4 gap-1.5"
                    style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-main)' }}
                  >
                    {PEN_COLORS.map(c => (
                      <button
                        key={c}
                        onClick={() => {
                          setColor(c);
                          setColorMenuOpen(false);
                        }}
                        className={`w-5 h-5 rounded-full border cursor-pointer ${
                          color === c ? 'border-white scale-110 shadow-md' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Pen stroke weight selectors */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-neutral-500 uppercase mr-1">Stroke:</span>
            {PEN_SIZES.map(w => (
              <button
                key={w.value}
                onClick={() => setLineWidth(w.value)}
                className={`px-2 py-0.5 rounded border text-[10px] cursor-pointer transition-colors ${
                  lineWidth === w.value ? 'bg-neutral-800 border-neutral-600 text-white font-bold' : 'border-neutral-800 hover:border-neutral-700 text-neutral-400'
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>

          <div className="h-4 w-[1px] bg-neutral-800 mx-0.5" style={{ backgroundColor: 'var(--border-main)' }} />

          {/* Background Templates selector */}
          {!pdfFile && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-neutral-500 uppercase">Page Style:</span>
              <select
                value={currentPage.template}
                onChange={(e) => handleChangeTemplate(e.target.value as TemplateType)}
                className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-xs text-neutral-200 outline-none"
              >
                {PAGE_TEMPLATES.map(t => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>

              {/* Background Color selections */}
              <div className="flex gap-1 ml-1.5">
                {[
                  { value: '#faf8f0', title: 'Ivory Paper' },
                  { value: '#ffffff', title: 'White' },
                  { value: '#1e1e24', title: 'Slate Dark' },
                  { value: '#000000', title: 'AMOLED Black' }
                ].map(item => (
                  <button
                    key={item.value}
                    onClick={() => handleChangeBgColor(item.value)}
                    className={`w-4 h-4 rounded border transition-all cursor-pointer ${
                      currentPage.bgColor === item.value ? 'border-violet-500 scale-110 shadow-sm' : 'border-neutral-800'
                    }`}
                    style={{ backgroundColor: item.value }}
                    title={item.title}
                  />
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Right side options: PDF imports, Page navigations, Clears */}
        <div className="flex items-center gap-3">
          {/* Zen Mode Toggle */}
          <button
            onClick={toggleZenMode}
            className={`p-1.5 rounded transition-colors cursor-pointer ${
              isZenMode ? 'text-violet-500 bg-violet-500/10' : 'text-neutral-500 hover:bg-neutral-800'
            }`}
            title={isZenMode ? 'Exit Zen Mode (Esc)' : 'Enter Zen Mode'}
          >
            {isZenMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>

          {/* Scroll Lock Toggle */}
          <button
            onClick={() => {
              setIsScrollLocked(!isScrollLocked);
              showToast(isScrollLocked ? "Scroll Unlocked" : "Scroll Locked (Canvas Sheet Fixed)", "info");
            }}
            className={`p-1.5 rounded transition-colors cursor-pointer ${
              isScrollLocked ? 'text-amber-500 bg-amber-500/10' : 'text-neutral-500 hover:bg-neutral-800'
            }`}
            title={isScrollLocked ? 'Unlock Scrolling' : 'Lock Scrolling (Palm Rejection)'}
          >
            {isScrollLocked ? <Lock size={14} /> : <Unlock size={14} />}
          </button>
          
          {/* PDF Background Load controls */}
          {pdfFile ? (
            <button
              onClick={handleRemovePDF}
              className="py-1 px-2.5 rounded border border-red-500/20 text-red-400 hover:text-red-300 bg-red-950/10 text-xs transition-colors flex items-center gap-1.5 cursor-pointer font-light"
            >
              Remove PDF
            </button>
          ) : (
            <button
              onClick={handleImportPDF}
              className="py-1 px-2.5 rounded border border-neutral-700 hover:border-neutral-500 text-neutral-300 text-xs transition-colors flex items-center gap-1.5 cursor-pointer font-light"
            >
              <Upload size={12} className="text-violet-400" /> Annotate PDF
            </button>
          )}

          {/* Page controls */}
          <div className="flex items-center gap-1 bg-neutral-950/60 p-0.5 rounded border border-neutral-800" style={{ borderColor: 'var(--border-main)' }}>
            <button
              onClick={() => {
                if (currentPageIndex > 0) {
                  setCurrentPageIndex(currentPageIndex - 1);
                  triggerSave(pages, currentPageIndex - 1, pdfFile);
                }
              }}
              disabled={currentPageIndex === 0}
              className="p-1 hover:bg-neutral-800 text-neutral-400 disabled:opacity-30 rounded transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="px-2 text-[10px] text-neutral-400">
              Page {currentPageIndex + 1} of {pages.length}
            </span>
            <button
              onClick={() => {
                if (currentPageIndex < pages.length - 1) {
                  setCurrentPageIndex(currentPageIndex + 1);
                  triggerSave(pages, currentPageIndex + 1, pdfFile);
                } else if (!pdfFile) {
                  // Allow adding pages to sketchpads, but not to static PDFs
                  handleAddPage();
                }
              }}
              className="p-1 hover:bg-neutral-800 text-neutral-400 rounded transition-colors"
            >
              {currentPageIndex === pages.length - 1 && !pdfFile ? <Plus size={14} className="text-violet-400" /> : <ChevronRight size={14} />}
            </button>
          </div>

          {/* Delete Page */}
          {!pdfFile && pages.length > 1 && (
            <button
              onClick={handleDeletePage}
              className="p-1.5 hover:bg-red-950/20 hover:text-red-400 text-neutral-500 rounded transition-colors"
              title="Delete Page"
            >
              <Trash2 size={13} />
            </button>
          )}

          {/* Clear Current */}
          <button
            onClick={handleClearPage}
            className="py-1 px-2.5 rounded border border-neutral-700 hover:border-neutral-500 text-neutral-400 hover:text-red-400 transition-all text-xs cursor-pointer font-light"
          >
            Clear Drawing
          </button>
        </div>
      </div>

      {/* Main Canvas Canvas Drawing Container Sheets */}
      <div className={`flex-1 flex items-start justify-center p-6 bg-neutral-950 scroll-smooth ${isScrollLocked ? '!overflow-hidden' : 'overflow-auto'}`}>
        <div 
          className="relative shadow-2xl transition-all border border-neutral-800/60 rounded animate-fade-in w-full max-w-[900px]" 
          style={{ 
            aspectRatio: '900 / 1270',
            borderColor: 'var(--border-main)'
          }}
        >
          {/* Bottom Canvas: Background Render & PDF renders */}
          <canvas
            ref={bgCanvasRef}
            className="absolute inset-0 z-0 rounded pointer-events-none w-full h-full"
          />

          {/* Top Canvas: Drawing strokes captures */}
          <canvas
            ref={drawingCanvasRef}
            onPointerDown={startDrawing}
            onPointerMove={draw}
            onPointerUp={stopDrawing}
            onPointerLeave={stopDrawing}
            className="absolute inset-0 z-10 rounded cursor-crosshair active:scale-[0.999] transition-transform w-full h-full touch-none"
          />
        </div>
      </div>

    </div>
  );
};

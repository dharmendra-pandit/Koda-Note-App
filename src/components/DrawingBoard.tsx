import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Paintbrush, Eraser, Trash2, Check, Undo, Redo } from 'lucide-react';
import { showToast } from '../services/tauriBridge';

interface DrawingBoardProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertImage: (base64DataUrl: string) => void;
}

const PEN_COLORS = [
  '#000000', // Black
  '#ffffff', // White (useful for dark themes)
  '#ef4444', // Red
  '#3b82f6', // Blue
  '#10b981', // Green
  '#f59e0b', // Yellow/Amber
  '#8b5cf6', // Purple/Violet
];

const LINE_WIDTHS = [
  { value: 2, label: 'Thin' },
  { value: 5, label: 'Medium' },
  { value: 10, label: 'Thick' },
  { value: 20, label: 'Heavy' },
];

export const DrawingBoard: React.FC<DrawingBoardProps> = ({ isOpen, onClose, onInsertImage }) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const pointsRef = React.useRef<{ x: number; y: number }[]>([]);
  const [color, setColor] = React.useState('#000000');
  const [lineWidth, setLineWidth] = React.useState(5);
  const [isEraser, setIsEraser] = React.useState(false);
  const [isDrawing, setIsDrawing] = React.useState(false);

  // Undo/Redo Stacks
  const [undoStack, setUndoStack] = React.useState<string[]>([]);
  const [redoStack, setRedoStack] = React.useState<string[]>([]);

  // Clear undo histories on open
  React.useEffect(() => {
    if (isOpen) {
      setUndoStack([]);
      setRedoStack([]);
    }
  }, [isOpen]);

  // Set default color based on theme (white for dark/amoled, black for light)
  React.useEffect(() => {
    if (isOpen) {
      const isDark = document.documentElement.classList.contains('theme-dark') || 
                     document.documentElement.classList.contains('theme-amoled');
      setColor(isDark ? '#ffffff' : '#000000');
    }
  }, [isOpen]);

  // Adjust canvas size on load
  React.useEffect(() => {
    if (!isOpen) return;

    const timeout = setTimeout(() => {
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.parentElement?.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const width = rect?.width || 600;
        const height = (rect?.height || 400) - 20; // leaves space

        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        
        // Fill canvas with background (transparency can look odd, let's fill with white/card background)
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
        }
      }
    }, 100);

    return () => clearTimeout(timeout);
  }, [isOpen]);

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
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return getCoordinatesFromPointer(e, canvas);
  };

  const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return; // only left click / primary pointer
    e.preventDefault();
    const coords = getCoordinates(e);
    if (!coords) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx && canvas) {
      // Save current state to undo stack before starting a new stroke
      const snapshot = canvas.toDataURL('image/png');
      setUndoStack(prev => [...prev.slice(-19), snapshot]);
      setRedoStack([]); // Clear redo stack on new stroke

      pointsRef.current = [coords];
      setIsDrawing(true);
    }
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault();

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    
    if (ctx && canvas) {
      const dpr = window.devicePixelRatio || 1;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      let currentLineWidth = lineWidth * dpr; // Scale brush size by DPR
      if (e.pointerType === 'pen' && e.pressure > 0) {
        currentLineWidth = lineWidth * dpr * (e.pressure * 1.5 + 0.25);
      }
      ctx.lineWidth = currentLineWidth;
      ctx.strokeStyle = isEraser ? '#ffffff' : color;
      
      if (isEraser) {
        ctx.globalCompositeOperation = 'destination-out';
      } else {
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
    pointsRef.current = [];
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx && canvas) {
      // Save to undo stack
      const snapshot = canvas.toDataURL('image/png');
      setUndoStack(prev => [...prev.slice(-19), snapshot]);
      setRedoStack([]);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      showToast("Canvas cleared", "info");
    }
  };

  const handleInsert = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      // Export as PNG base64 data url
      const dataUrl = canvas.toDataURL('image/png');
      onInsertImage(dataUrl);
      showToast("Sketch inserted into note", "success");
      onClose();
    }
  };

  const handleUndo = React.useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || undoStack.length === 0) return;

    // Save current state to redo stack
    const currentSnapshot = canvas.toDataURL('image/png');
    setRedoStack(prev => [...prev, currentSnapshot]);

    const previousSnapshot = undoStack[undoStack.length - 1];
    const newUndoStack = undoStack.slice(0, -1);
    setUndoStack(newUndoStack);

    // Render previous snapshot
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (previousSnapshot) {
      const img = new Image();
      img.onload = () => {
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      img.src = previousSnapshot;
    }
    showToast("Undo", "info");
  }, [undoStack]);

  const handleRedo = React.useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || redoStack.length === 0) return;

    // Save current state to undo stack
    const currentSnapshot = canvas.toDataURL('image/png');
    setUndoStack(prev => [...prev, currentSnapshot]);

    const nextSnapshot = redoStack[redoStack.length - 1];
    const newRedoStack = redoStack.slice(0, -1);
    setRedoStack(newRedoStack);

    // Render next snapshot
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (nextSnapshot) {
      const img = new Image();
      img.onload = () => {
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      img.src = nextSnapshot;
    }
    showToast("Redo", "info");
  }, [redoStack]);

  // Keyboard shortcuts listener
  React.useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();

      // Ctrl + Z / Ctrl + Y (Undo/Redo)
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

      // 1 / P: Pen, 2 / E: Eraser
      if (key === 'p' || e.key === '1') {
        e.preventDefault();
        setIsEraser(false);
        showToast("Pen tool selected", "info");
      } else if (key === 'e' || e.key === '2') {
        e.preventDefault();
        setIsEraser(true);
        showToast("Eraser selected", "info");
      }

      // [ and ]: stroke width
      if (e.key === '[') {
        e.preventDefault();
        setLineWidth(prev => Math.max(2, prev - 3));
      } else if (e.key === ']') {
        e.preventDefault();
        setLineWidth(prev => Math.min(50, prev + 3));
      }

      // Colors cycling with C
      if (key === 'c' && !isEraser) {
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
      if (key in keyColorMap && !isEraser) {
        e.preventDefault();
        setColor(keyColorMap[key]);
        showToast(`Color changed`, "info");
      }

      // Clear (Delete)
      if (e.key === 'Delete') {
        e.preventDefault();
        handleClear();
      }

      // Enter / Ctrl+Enter / S: Insert Sketch
      if ((e.ctrlKey || e.metaKey) && (e.key === 'Enter' || key === 's')) {
        e.preventDefault();
        handleInsert();
      } else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        handleInsert();
      }

      // Escape to close
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, color, lineWidth, isEraser, undoStack, redoStack, handleUndo, handleRedo, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 pointer-events-auto"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-6 rounded-lg border shadow-2xl flex flex-col overflow-hidden z-50 text-sm font-sans"
            style={{ 
              backgroundColor: 'var(--bg-card)', 
              borderColor: 'var(--border-main)',
              color: 'var(--text-primary)'
            }}
          >
            {/* Header */}
            <div className="h-12 px-4 border-b flex items-center justify-between shrink-0" style={{ borderColor: 'var(--border-main)' }}>
              <div className="flex items-center gap-2">
                <Paintbrush size={16} className="text-violet-400" />
                <span className="font-bold font-heading">Koda Sketchpad</span>
              </div>
              <button 
                onClick={onClose} 
                className="p-1 rounded hover:bg-neutral-800 text-neutral-500 hover:text-neutral-200 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Canvas Body */}
            <div className="flex-1 bg-neutral-100 dark:bg-neutral-900 relative overflow-auto flex items-start justify-center p-6">
              <canvas
                ref={canvasRef}
                onPointerDown={startDrawing}
                onPointerMove={draw}
                onPointerUp={stopDrawing}
                onPointerLeave={stopDrawing}
                className="cursor-crosshair bg-white shadow-inner border border-neutral-200 rounded-md shrink-0 touch-none"
              />
            </div>

            {/* Toolbar Footer */}
            <div 
              className="h-16 px-6 border-t flex items-center justify-between gap-4 shrink-0 bg-neutral-950/20"
              style={{ borderColor: 'var(--border-main)', backgroundColor: 'var(--bg-sidebar)' }}
            >
              <div className="flex items-center gap-4 flex-wrap">
                {/* Mode Selector */}
                <div className="flex bg-neutral-900/60 p-0.5 rounded border border-neutral-800 gap-0.5">
                  <button
                    onClick={() => setIsEraser(false)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                      !isEraser ? 'bg-violet-600 text-white font-medium' : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    <Paintbrush size={12} /> Pen
                  </button>
                  <button
                    onClick={() => setIsEraser(true)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                      isEraser ? 'bg-violet-600 text-white font-medium' : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    <Eraser size={12} /> Eraser
                  </button>
                </div>

                {/* Undo/Redo Actions */}
                <div className="flex bg-neutral-900/60 p-0.5 rounded border border-neutral-800 gap-0.5">
                  <button
                    onClick={handleUndo}
                    disabled={undoStack.length === 0}
                    className="p-1 hover:bg-neutral-800 text-neutral-400 disabled:opacity-30 rounded transition-colors cursor-pointer"
                    title="Undo (Ctrl+Z)"
                  >
                    <Undo size={12} />
                  </button>
                  <button
                    onClick={handleRedo}
                    disabled={redoStack.length === 0}
                    className="p-1 hover:bg-neutral-800 text-neutral-400 disabled:opacity-30 rounded transition-colors cursor-pointer"
                    title="Redo (Ctrl+Y)"
                  >
                    <Redo size={12} />
                  </button>
                </div>

                {/* Color Selector */}
                {!isEraser && (
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-neutral-500 uppercase mr-1">Color:</span>
                    {PEN_COLORS.map(c => (
                      <button
                        key={c}
                        onClick={() => setColor(c)}
                        className={`w-5 h-5 rounded-full border transition-transform cursor-pointer ${
                          color === c ? 'border-white scale-110 shadow-md' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                )}

                {/* Size Selector */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-neutral-500 uppercase mr-1">Size:</span>
                  {LINE_WIDTHS.map(w => (
                    <button
                      key={w.value}
                      onClick={() => setLineWidth(w.value)}
                      className={`text-[10px] px-2 py-0.5 rounded border cursor-pointer ${
                        lineWidth === w.value ? 'bg-neutral-800 border-neutral-600 text-white font-bold' : 'border-neutral-800 hover:border-neutral-700 text-neutral-400'
                      }`}
                    >
                      {w.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleClear}
                  className="flex items-center gap-1.5 py-1.5 px-3 rounded hover:bg-neutral-800 text-neutral-400 hover:text-red-400 border border-transparent hover:border-neutral-800 transition-colors text-xs cursor-pointer font-light"
                >
                  <Trash2 size={13} /> Clear
                </button>

                <button
                  onClick={handleInsert}
                  className="flex items-center gap-1.5 py-1.5 px-4 bg-violet-600 hover:bg-violet-500 text-white rounded font-medium text-xs transition-colors shadow cursor-pointer active:scale-95"
                >
                  <Check size={13} /> Insert Sketch
                </button>
              </div>

            </div>

          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

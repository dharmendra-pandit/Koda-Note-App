import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { registerToastHandler } from '../services/tauriBridge';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  React.useEffect(() => {
    // Register toast handler in Tauri Bridge
    registerToastHandler((message, type) => {
      const id = crypto.randomUUID();
      setToasts(prev => [...prev, { id, message, type }]);

      // Remove after 3.5s
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 3500);
    });
  }, []);

  const handleDismiss = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'success': return <CheckCircle size={15} className="text-emerald-400" />;
      case 'error': return <AlertCircle size={15} className="text-rose-400" />;
      case 'warning': return <AlertCircle size={15} className="text-amber-400" />;
      default: return <Info size={15} className="text-blue-400" />;
    }
  };

  const getBorderColor = (type: string) => {
    switch (type) {
      case 'success': return 'border-emerald-500/30 bg-emerald-950/20';
      case 'error': return 'border-rose-500/30 bg-rose-950/20';
      case 'warning': return 'border-amber-500/30 bg-amber-950/20';
      default: return 'border-blue-500/30 bg-blue-950/20';
    }
  };

  return (
    <div className="fixed right-4 top-16 z-[60] flex flex-col gap-2 pointer-events-none select-none max-w-sm">
      <AnimatePresence>
        {toasts.map(toast => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={`pointer-events-auto flex items-start gap-2.5 px-3.5 py-2.5 rounded border shadow-lg text-xs font-sans text-neutral-300 font-light ${getBorderColor(
              toast.type
            )} backdrop-blur-sm`}
          >
            <div className="shrink-0 mt-0.5">{getIcon(toast.type)}</div>
            <div className="flex-1 break-words">{toast.message}</div>
            <button
              onClick={() => handleDismiss(toast.id)}
              className="text-neutral-500 hover:text-neutral-300 transition-colors"
            >
              <X size={12} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

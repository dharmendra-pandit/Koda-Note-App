import React from 'react';
import { useWorkspaceStore } from '../store/workspaceStore';
import { motion } from 'framer-motion';
import { Lock, Delete, ArrowRight } from 'lucide-react';
import { showToast } from '../services/tauriBridge';

export const SecurityLock: React.FC = () => {
  const { isLocked, unlockApp } = useWorkspaceStore();
  const [pin, setPin] = React.useState('');
  const [shake, setShake] = React.useState(false);

  const handleKeyPress = (digit: string) => {
    if (pin.length < 6) {
      setPin(prev => prev + digit);
    }
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
  };

  const handleSubmit = () => {
    const success = unlockApp(pin);
    if (success) {
      setPin('');
      showToast("App unlocked", "success");
    } else {
      setPin('');
      setShake(true);
      showToast("Incorrect passcode", "error");
      setTimeout(() => setShake(false), 500);
    }
  };

  React.useEffect(() => {
    // Submit immediately when PIN reaches 4 or 6 depending on code length
    if (pin.length >= 4 && pin.length === 4) {
      // Allow user to click enter or auto submit if typical 4 digit
    }
  }, [pin]);

  // Keyboard support
  React.useEffect(() => {
    if (!isLocked) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        handleKeyPress(e.key);
      } else if (e.key === 'Backspace') {
        handleDelete();
      } else if (e.key === 'Enter') {
        handleSubmit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLocked, pin]);

  if (!isLocked) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center font-sans text-neutral-200 select-none">
      
      {/* Padlock header animation */}
      <motion.div 
        animate={shake ? { x: [-10, 10, -10, 10, 0] } : {}}
        transition={{ duration: 0.4 }}
        className="flex flex-col items-center mb-8 text-center"
      >
        <div className="w-16 h-16 rounded-full bg-violet-600/10 border border-violet-500/20 flex items-center justify-center text-violet-400 mb-4">
          <Lock size={28} className="animate-pulse" />
        </div>
        <h2 className="text-xl font-bold font-heading">Koda is Locked</h2>
        <p className="text-xs text-neutral-500 mt-1.5">Enter passcode to access your offline workspace</p>
      </motion.div>

      {/* Pin bullets representation */}
      <div className="flex justify-center gap-4 mb-10">
        {[...Array(6)].map((_, i) => (
          <div 
            key={i}
            className={`w-3.5 h-3.5 rounded-full border border-neutral-700 transition-all duration-150 ${
              i < pin.length ? 'bg-violet-500 scale-110 shadow-[0_0_8px_rgba(139,92,246,0.6)]' : 'bg-neutral-900'
            }`}
          />
        ))}
      </div>

      {/* Numeric Keypad */}
      <div className="w-64 grid grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
          <button
            key={num}
            onClick={() => handleKeyPress(num)}
            className="h-14 rounded-full border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-lg font-medium transition-all active:scale-95"
          >
            {num}
          </button>
        ))}
        
        {/* Backspace */}
        <button
          onClick={handleDelete}
          className="h-14 rounded-full flex items-center justify-center hover:bg-neutral-800 text-neutral-400 active:scale-95"
        >
          <Delete size={18} />
        </button>

        {/* 0 */}
        <button
          onClick={() => handleKeyPress('0')}
          className="h-14 rounded-full border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-lg font-medium transition-all active:scale-95"
        >
          0
        </button>

        {/* Submit Enter */}
        <button
          onClick={handleSubmit}
          className="h-14 rounded-full bg-violet-600 hover:bg-violet-500 text-white flex items-center justify-center transition-all active:scale-95"
        >
          <ArrowRight size={18} />
        </button>
      </div>

    </div>
  );
};

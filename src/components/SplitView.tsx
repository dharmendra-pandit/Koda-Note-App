import React from 'react';
import { useLayoutStore } from '../store/layoutStore';
import { TabsHeader } from './TabsHeader';
import { NoteEditor } from './NoteEditor';
import { BookOpen } from 'lucide-react';

export const SplitView: React.FC = () => {
  const { isSplitView, activeTabId, activeSplitTabId } = useLayoutStore();

  return (
    <div className="flex-1 flex w-full h-full overflow-hidden">
      {/* Primary Column */}
      <div className="flex-1 flex flex-col h-full overflow-hidden border-r border-neutral-800" style={{ borderColor: 'var(--border-main)' }}>
        <TabsHeader inSplit={false} />
        {activeTabId ? (
          <NoteEditor inSplit={false} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 select-none text-neutral-500">
            <BookOpen size={48} className="text-neutral-600 mb-3 animate-pulse" />
            <h3 className="font-semibold text-neutral-400">No Note Open</h3>
            <p className="text-xs text-neutral-600 mt-1 max-w-[240px]">
              Select a note from the sidebar or press <kbd className="px-1 py-0.5 rounded bg-neutral-800 text-[10px]">Ctrl + P</kbd> to open.
            </p>
          </div>
        )}
      </div>

      {/* Split Column (Conditional) */}
      {isSplitView && (
        <div className="flex-1 flex flex-col h-full overflow-hidden animate-in slide-in-from-right duration-200">
          <TabsHeader inSplit={true} />
          {activeSplitTabId ? (
            <NoteEditor inSplit={true} />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 select-none text-neutral-500 bg-neutral-950/20">
              <BookOpen size={48} className="text-neutral-600 mb-3 animate-pulse" />
              <h3 className="font-semibold text-neutral-400">No Split Note Open</h3>
              <p className="text-xs text-neutral-600 mt-1 max-w-[240px]">
                Open another note in split screen by clicking on files or split toggles.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

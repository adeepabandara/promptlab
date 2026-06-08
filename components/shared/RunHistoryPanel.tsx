'use client';

import { ConceptRun, ImageRun } from '@/types';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Skeleton } from '@/components/ui/skeleton';

interface RunHistoryPanelProps {
  open: boolean;
  onToggle: () => void;
  activeTab: 'concept' | 'image';
  onTabChange: (tab: 'concept' | 'image') => void;
  conceptRuns: ConceptRun[];
  imageRuns: ImageRun[];
  conceptLoading: boolean;
  imageLoading: boolean;
  selectedConceptId?: string;
  selectedImageId?: string;
  onSelectConcept: (run: ConceptRun) => void;
  onSelectImage: (run: ImageRun) => void;
}

export function RunHistoryPanel({
  open,
  onToggle,
  activeTab,
  onTabChange,
  conceptRuns,
  imageRuns,
  conceptLoading,
  imageLoading,
  selectedConceptId,
  selectedImageId,
  onSelectConcept,
  onSelectImage,
}: RunHistoryPanelProps) {
  return (
    <div className={`shrink-0 border-l bg-white flex flex-col h-full transition-all duration-200 ${open ? 'w-64' : 'w-9'}`}>
      <button
        onClick={onToggle}
        className="flex items-center gap-2 px-2.5 py-4 border-b w-full hover:bg-gray-50 transition-colors"
        title={open ? 'Collapse history' : 'Expand history'}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14" height="14"
          viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          className={`shrink-0 text-gray-400 transition-transform duration-200 ${open ? 'rotate-0' : 'rotate-180'}`}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        {open && <span className="text-sm font-semibold text-gray-900 whitespace-nowrap">Run History</span>}
      </button>

      {open && (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Two-tab switcher */}
          <div className="flex border-b shrink-0">
            <button
              onClick={() => onTabChange('concept')}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${
                activeTab === 'concept'
                  ? 'text-gray-900 border-b-2 border-gray-900 -mb-px'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              Concept
            </button>
            <button
              onClick={() => onTabChange('image')}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${
                activeTab === 'image'
                  ? 'text-gray-900 border-b-2 border-gray-900 -mb-px'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              Image
            </button>
          </div>

          {/* Run list */}
          <div className="flex-1 overflow-y-auto py-1">
            {activeTab === 'concept' && (
              conceptLoading ? (
                <div className="space-y-1 px-2 pt-2">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8" />)}
                </div>
              ) : conceptRuns.length === 0 ? (
                <p className="text-xs text-gray-400 italic px-3 pt-3">No concept runs yet.</p>
              ) : (
                conceptRuns.map((run) => (
                  <button
                    key={run.id}
                    onClick={() => onSelectConcept(run)}
                    className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 hover:bg-gray-50 transition-colors ${
                      selectedConceptId === run.id ? 'bg-blue-50' : ''
                    }`}
                  >
                    <span className="text-xs truncate text-gray-700 flex-1">{run.models?.name ?? 'Unknown'}</span>
                    <StatusBadge status={run.status} />
                  </button>
                ))
              )
            )}

            {activeTab === 'image' && (
              imageLoading ? (
                <div className="space-y-1 px-2 pt-2">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8" />)}
                </div>
              ) : imageRuns.length === 0 ? (
                <p className="text-xs text-gray-400 italic px-3 pt-3">No image runs yet.</p>
              ) : (
                imageRuns.map((run) => (
                  <button
                    key={run.id}
                    onClick={() => onSelectImage(run)}
                    className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 hover:bg-gray-50 transition-colors ${
                      selectedImageId === run.id ? 'bg-blue-50' : ''
                    }`}
                  >
                    <span className="text-xs truncate text-gray-700 flex-1">{run.models?.name ?? 'Unknown'}</span>
                    <StatusBadge status={run.status} />
                  </button>
                ))
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

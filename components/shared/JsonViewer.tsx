'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface JsonViewerProps {
  data: Record<string, unknown>;
  maxHeight?: string;
}

export function JsonViewer({ data, maxHeight = '400px' }: JsonViewerProps) {
  const [expanded, setExpanded] = useState(false);
  const json = JSON.stringify(data, null, 2);

  function copy() {
    navigator.clipboard.writeText(json);
    toast.success('Copied to clipboard');
  }

  return (
    <div className="rounded-md border bg-gray-950 text-gray-100">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-800">
        <span className="text-xs text-gray-400 font-mono">JSON</span>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-gray-400 hover:text-white"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? 'Collapse' : 'Expand'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-gray-400 hover:text-white"
            onClick={copy}
          >
            Copy
          </Button>
        </div>
      </div>
      <pre
        className="p-3 text-xs font-mono overflow-y-auto whitespace-pre-wrap break-all"
        style={{ maxHeight: expanded ? 'none' : maxHeight }}
      >
        {json}
      </pre>
    </div>
  );
}

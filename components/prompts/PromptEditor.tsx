'use client';

import { useEffect, useRef } from 'react';
import { EditorState, RangeSetBuilder } from '@codemirror/state';
import { EditorView, Decoration, ViewPlugin, ViewUpdate, DecorationSet } from '@codemirror/view';
import { minimalSetup } from 'codemirror';

// Highlight {{variable}} tokens in amber
const variableHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.build(update.view);
      }
    }
    build(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>();
      const text = view.state.doc.toString();
      const regex = /\{\{(\w+)\}\}/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        builder.add(
          match.index,
          match.index + match[0].length,
          Decoration.mark({ class: 'cm-variable-token' })
        );
      }
      return builder.finish();
    }
  },
  { decorations: (v) => v.decorations }
);

interface PromptEditorProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

export function PromptEditor({ value, onChange, readOnly }: PromptEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        minimalSetup,
        variableHighlight,
        EditorView.lineWrapping,
        EditorState.readOnly.of(readOnly ?? false),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChange(update.state.doc.toString());
          }
        }),
        EditorView.theme({
          '&': { height: '100%', fontSize: '14px' },
          '.cm-content': { padding: '12px', fontFamily: 'monospace' },
          '.cm-variable-token': {
            backgroundColor: '#fef3c7',
            color: '#92400e',
            borderRadius: '3px',
            padding: '1px 2px',
          },
          '.cm-scroller': { overflow: 'auto' },
        }),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => { view.destroy(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  return (
    <div
      ref={containerRef}
      className="border rounded-md overflow-hidden min-h-[300px] bg-white"
    />
  );
}

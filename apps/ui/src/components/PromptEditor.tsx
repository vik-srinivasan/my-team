import { useMemo, type ReactElement } from 'react';
import CodeMirror, { EditorView } from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';

export interface PromptEditorProps {
  /** Markdown body the editor shows. Treated as controlled — the editor
   *  surfaces every keystroke via `onChange`. */
  value: string;
  /** Called for every change. Pass the dirty body straight through to the
   *  enclosing form/state. */
  onChange(next: string): void;
  /** When true, gestures are accepted but no edits land in the document. */
  readOnly?: boolean;
  /** Tailwind height class applied to the editor wrapper. Defaults to a
   *  fixed `h-[60vh]` so the editor doesn't collapse in narrow layouts. */
  heightClassName?: string;
}

/**
 * Thin wrapper around `@uiw/react-codemirror` configured for markdown.
 *
 * Loads the markdown language pack and the one-dark theme so prompt
 * content (headings, code fences, lists) gets readable syntax colouring
 * against the dark UI. The editor is set to fixed height + vertical
 * scroll so it slots into the Workflow tab's two-column layout without
 * pushing the surrounding controls off-screen.
 */
export function PromptEditor({
  value,
  onChange,
  readOnly = false,
  heightClassName = 'h-[60vh]',
}: PromptEditorProps): ReactElement {
  const extensions = useMemo(
    () => [
      markdown(),
      EditorView.lineWrapping,
      EditorView.theme({
        '&': { fontSize: '13px' },
        '.cm-content': { fontFamily: 'JetBrains Mono, Menlo, monospace' },
        '.cm-scroller': { fontFamily: 'JetBrains Mono, Menlo, monospace' },
      }),
    ],
    [],
  );

  return (
    <div
      data-testid="prompt-editor"
      className={`w-full overflow-hidden border border-neutral-800 rounded-sm ${heightClassName}`}
    >
      <CodeMirror
        value={value}
        onChange={onChange}
        readOnly={readOnly}
        theme={oneDark}
        extensions={extensions}
        height="100%"
        basicSetup={{
          lineNumbers: true,
          highlightActiveLine: !readOnly,
          highlightActiveLineGutter: !readOnly,
          foldGutter: true,
        }}
        style={{ height: '100%' }}
      />
    </div>
  );
}

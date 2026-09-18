'use client'

import Editor, { type BeforeMount, loader, type OnMount } from '@monaco-editor/react'
import { useTheme } from 'next-themes'
import { useEffect, useRef, useState } from 'react'

type Monaco = Parameters<BeforeMount>[0]
type EditorInstance = Parameters<OnMount>[0]

export interface EditorMarker {
  readonly line: number
  readonly column?: number | undefined
  readonly message: string
}

const MODEL_URI = 'file:///sandbox/pelda.ts'

const lightTheme = {
  base: 'vs' as const,
  inherit: true,
  rules: [
    { token: 'keyword', foreground: '00642f' },
    { token: 'string', foreground: '844b17' },
    { token: 'number', foreground: 'a83825' },
    { token: 'comment', foreground: '75756c', fontStyle: 'italic' },
    { token: 'type', foreground: '1c5284' },
    { token: 'identifier', foreground: '121b15' },
    { token: 'delimiter', foreground: '646b65' },
  ],
  colors: {
    'editor.background': '#f6f5ee',
    'editor.foreground': '#121b15',
    'editorLineNumber.foreground': '#a3a39b',
    'editorLineNumber.activeForeground': '#343d37',
    'editor.lineHighlightBackground': '#efede5',
    'editor.selectionBackground': '#fde8b4',
    'editorCursor.foreground': '#167337',
    'editorIndentGuide.background1': '#e2e0d8',
    'editorWidget.background': '#fffefb',
    'editorWidget.border': '#cbc9c0',
    'editorSuggestWidget.selectedBackground': '#e3f1e3',
    'scrollbarSlider.background': '#cbc9c066',
  },
}

const darkTheme = {
  base: 'vs-dark' as const,
  inherit: true,
  rules: [
    { token: 'keyword', foreground: '7cd591' },
    { token: 'string', foreground: 'eac07a' },
    { token: 'number', foreground: 'faa178' },
    { token: 'comment', foreground: '85877e', fontStyle: 'italic' },
    { token: 'type', foreground: '91c8f0' },
    { token: 'identifier', foreground: 'edebe4' },
    { token: 'delimiter', foreground: '94968e' },
  ],
  colors: {
    'editor.background': '#141b17',
    'editor.foreground': '#edebe4',
    'editorLineNumber.foreground': '#5a625d',
    'editorLineNumber.activeForeground': '#ceccc5',
    'editor.lineHighlightBackground': '#1c2420',
    'editor.selectionBackground': '#47300c',
    'editorCursor.foreground': '#76d38c',
    'editorIndentGuide.background1': '#272f2a',
    'editorWidget.background': '#111714',
    'editorWidget.border': '#39423d',
    'editorSuggestWidget.selectedBackground': '#1f3326',
    'scrollbarSlider.background': '#39423d88',
  },
}

let typesPromise: Promise<void> | undefined
let configuredPath: string | undefined

function configureTypeScript(monaco: Monaco, typesUrl: string): Promise<void> {
  typesPromise ??= (async () => {
    const ts = monaco.typescript
    ts.typescriptDefaults.setCompilerOptions({
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      lib: ['es2023', 'dom'],
      strict: true,
      allowNonTsExtensions: true,
      noEmit: true,
      moduleDetection: 3,
    } as Parameters<typeof ts.typescriptDefaults.setCompilerOptions>[0])
    ts.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
    })
    ts.typescriptDefaults.setEagerModelSync(true)
    const response = await fetch(typesUrl)
    if (!response.ok) return
    const manifest = (await response.json()) as { files: Record<string, string> }
    ts.typescriptDefaults.setExtraLibs(
      Object.entries(manifest.files).map(([filePath, content]) => ({ filePath, content })),
    )
  })()
  return typesPromise
}

export function CodeEditor({
  value,
  onChange,
  onRun,
  onReady,
  monacoPath,
  typesUrl,
  marker,
}: {
  value: string
  onChange: (value: string) => void
  onRun: () => void
  onReady: () => void
  monacoPath: string
  typesUrl: string
  marker: EditorMarker | undefined
}) {
  const { resolvedTheme } = useTheme()
  const monacoRef = useRef<Monaco | null>(null)
  const editorRef = useRef<EditorInstance | null>(null)
  const runRef = useRef(onRun)
  runRef.current = onRun
  const [fontFamily] = useState(() => {
    const family = getComputedStyle(document.documentElement).getPropertyValue('--ff-mono').trim()
    return family ? `${family}, ui-monospace, monospace` : 'ui-monospace, monospace'
  })

  if (configuredPath !== monacoPath) {
    loader.config({ paths: { vs: monacoPath } })
    configuredPath = monacoPath
  }

  useEffect(() => {
    const monaco = monacoRef.current
    const model = editorRef.current?.getModel()
    if (!monaco || !model) return
    monaco.editor.setModelMarkers(
      model,
      'kassza-sandbox',
      marker
        ? [
            {
              severity: monaco.MarkerSeverity.Error,
              message: marker.message,
              startLineNumber: marker.line,
              startColumn: marker.column ?? 1,
              endLineNumber: marker.line,
              endColumn: model.getLineMaxColumn(Math.min(marker.line, model.getLineCount())),
            },
          ]
        : [],
    )
  }, [marker])

  const beforeMount: BeforeMount = (monaco) => {
    monaco.editor.defineTheme('kassza-light', lightTheme)
    monaco.editor.defineTheme('kassza-dark', darkTheme)
    void configureTypeScript(monaco, typesUrl)
  }

  const onMount: OnMount = (editor, monaco) => {
    monacoRef.current = monaco
    editorRef.current = editor
    void document.fonts.ready.then(() => monaco.editor.remeasureFonts())
    editor.addAction({
      id: 'kassza.run',
      label: 'Futtatás',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run: () => runRef.current(),
    })
    onReady()
  }

  return (
    <Editor
      path={MODEL_URI}
      language="typescript"
      value={value}
      onChange={(next) => onChange(next ?? '')}
      beforeMount={beforeMount}
      onMount={onMount}
      theme={resolvedTheme === 'dark' ? 'kassza-dark' : 'kassza-light'}
      loading={<span className="sr-only">A szerkesztő betöltése…</span>}
      options={{
        fontFamily,
        fontSize: 13.5,
        lineHeight: 22,
        fontLigatures: false,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        padding: { top: 16, bottom: 16 },
        tabSize: 2,
        renderLineHighlight: 'line',
        smoothScrolling: true,
        automaticLayout: true,
        wordWrap: 'on',
        fixedOverflowWidgets: true,
        scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
        stickyScroll: { enabled: false },
        guides: { indentation: true },
        quickSuggestions: { other: true, comments: false, strings: true },
      }}
    />
  )
}

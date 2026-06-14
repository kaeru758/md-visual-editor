import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';

export class MarkdownVisualEditorProvider implements vscode.CustomTextEditorProvider {

  public static readonly viewType = 'mdVisualEditorDebug.markdownEditor';

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(
      MarkdownVisualEditorProvider.viewType,
      new MarkdownVisualEditorProvider(context),
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
        supportsMultipleEditorsPerDocument: false,
      }
    );
  }

  constructor(private readonly context: vscode.ExtensionContext) {}

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const docDir = vscode.Uri.joinPath(document.uri, '..');
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    const roots: vscode.Uri[] = [
      vscode.Uri.joinPath(this.context.extensionUri, 'media'),
      docDir,
    ];
    if (workspaceFolder) {
      roots.push(workspaceFolder.uri);
    }
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: roots,
    };

    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    function updateWebview() {
      webviewPanel.webview.postMessage({
        type: 'update',
        text: document.getText(),
      });
      webviewPanel.webview.postMessage({
        type: 'saveStatus',
        dirty: document.isDirty,
      });
    }

    let isWebviewEdit = false;

    const messageDisposable = webviewPanel.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'edit': {
          isWebviewEdit = true;
          const edit = new vscode.WorkspaceEdit();
          const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(document.getText().length)
          );
          edit.replace(document.uri, fullRange, message.text);
          await vscode.workspace.applyEdit(edit);
          isWebviewEdit = false;
          webviewPanel.webview.postMessage({ type: 'saveStatus', dirty: document.isDirty });
          break;
        }
        case 'ready': {
          updateWebview();
          break;
        }
        case 'openLink': {
          const href = String(message.href || '').trim();
          if (!href) break;
          try {
            if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
              if (/^(https?|mailto):/i.test(href)) {
                await vscode.env.openExternal(vscode.Uri.parse(href));
              } else {
                await vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(href));
              }
            } else if (href.startsWith('#')) {
              break;
            } else {
              const target = vscode.Uri.joinPath(document.uri, '..', href);
              await vscode.commands.executeCommand('vscode.open', target);
            }
          } catch (e) {
            const detail = e instanceof Error ? e.message : String(e);
            vscode.window.showWarningMessage(`リンクを開けませんでした: ${href}\n理由: ${detail}`);
          }
          break;
        }
        case 'openAsText': {
          await vscode.commands.executeCommand('vscode.openWith', document.uri, 'default');
          break;
        }
        case 'undo': {
          await vscode.commands.executeCommand('undo');
          break;
        }
        case 'redo': {
          await vscode.commands.executeCommand('redo');
          break;
        }
        case 'resolveImage': {
          const src = String(message.src || '');
          const requestId = message.requestId;
          if (!src) {
            webviewPanel.webview.postMessage({ type: 'imageResolved', requestId, src, uri: '', error: 'empty' });
            break;
          }
          try {
            // marked encodes non-ASCII image URLs (e.g. encodeURI on Japanese filenames).
            // joinPath would treat literal '%' as a path character and re-encode it,
            // breaking lookup of the actual file on disk. Decode first.
            let decoded = src;
            try { decoded = decodeURI(src); } catch { /* keep original */ }
            const targetUri = vscode.Uri.joinPath(document.uri, '..', decoded);
            const webviewUri = webviewPanel.webview.asWebviewUri(targetUri).toString();
            webviewPanel.webview.postMessage({ type: 'imageResolved', requestId, src, uri: webviewUri });
          } catch (e) {
            const detail = e instanceof Error ? e.message : String(e);
            webviewPanel.webview.postMessage({ type: 'imageResolved', requestId, src, uri: '', error: detail });
          }
          break;
        }
        case 'saveImage': {
          const requestId = message.requestId;
          const name = String(message.name || 'image.png');
          const base64 = String(message.dataBase64 || '');
          if (!base64) {
            webviewPanel.webview.postMessage({ type: 'imageSaved', requestId, ok: false, error: '空のデータです' });
            break;
          }
          try {
            const cleanName = sanitizeFileName(name);
            const imagesDir = vscode.Uri.joinPath(document.uri, '..', 'images');
            try { await vscode.workspace.fs.createDirectory(imagesDir); } catch { /* may exist */ }
            const finalName = await uniqueFileName(imagesDir, cleanName);
            const fileUri = vscode.Uri.joinPath(imagesDir, finalName);
            const bytes = Buffer.from(base64, 'base64');
            await vscode.workspace.fs.writeFile(fileUri, new Uint8Array(bytes));
            const relPath = 'images/' + finalName;
            webviewPanel.webview.postMessage({
              type: 'imageSaved',
              requestId,
              ok: true,
              relPath,
              webviewUri: webviewPanel.webview.asWebviewUri(fileUri).toString(),
              altText: stripExt(finalName),
            });
          } catch (e) {
            const detail = e instanceof Error ? e.message : String(e);
            vscode.window.showWarningMessage(`画像の保存に失敗しました: ${detail}`);
            webviewPanel.webview.postMessage({ type: 'imageSaved', requestId, ok: false, error: detail });
          }
          break;
        }
        case 'exportPdf': {
          try {
            await this.handleExportPdf(document, String(message.html || ''));
          } catch (e) {
            const detail = e instanceof Error ? e.message : String(e);
            vscode.window.showErrorMessage(`PDF出力に失敗しました: ${detail}`);
          }
          break;
        }
      }
    });

    const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() === document.uri.toString() && !isWebviewEdit) {
        updateWebview();
      }
    });

    const saveDocumentSubscription = vscode.workspace.onDidSaveTextDocument((doc) => {
      if (doc.uri.toString() === document.uri.toString()) {
        webviewPanel.webview.postMessage({ type: 'saveStatus', dirty: false });
      }
    });

    webviewPanel.onDidDispose(() => {
      changeDocumentSubscription.dispose();
      saveDocumentSubscription.dispose();
      messageDisposable.dispose();
    });
  }

  /**
   * Build a self-contained HTML snapshot of the rendered document and open
   * it in the OS default browser. The browser's print dialog can then be
   * used to "Save as PDF". We auto-trigger window.print() on load so the
   * dialog appears immediately.
   *
   * The HTML file itself is written to the OS temp directory so we don't
   * pollute the user's working directory. Image references that were
   * originally relative are rewritten to absolute `file://` URIs based on
   * the md document's directory so they render correctly outside the
   * webview sandbox.
   */
  private async handleExportPdf(document: vscode.TextDocument, innerHtml: string): Promise<void> {
    const docFsPath = document.uri.fsPath;
    if (!docFsPath) {
      vscode.window.showErrorMessage('PDF出力には保存済みのファイルが必要です。一度ファイルを保存してから再度実行してください。');
      return;
    }
    const docDir = path.dirname(docFsPath);
    const baseName = path.basename(docFsPath, path.extname(docFsPath));

    // Rewrite relative <img src="..."> to absolute file:// URIs so the
    // external browser can load them. Skip already-absolute schemes.
    const rewrittenHtml = innerHtml.replace(
      /(<img\b[^>]*?\bsrc=)(["'])([^"']+)\2/gi,
      (_m, prefix: string, quote: string, src: string) => {
        if (/^(data:|blob:|https?:|file:|vscode-)/i.test(src) || src.startsWith('#')) {
          return `${prefix}${quote}${src}${quote}`;
        }
        try {
          const absPath = path.resolve(docDir, decodeURI(src));
          const uri = vscode.Uri.file(absPath).toString();
          return `${prefix}${quote}${uri}${quote}`;
        } catch {
          return `${prefix}${quote}${src}${quote}`;
        }
      }
    );

    const katexCssUri = vscode.Uri.file(
      path.join(this.context.extensionUri.fsPath, 'media', 'vendor', 'katex.min.css')
    ).toString();
    const editorCssUri = vscode.Uri.file(
      path.join(this.context.extensionUri.fsPath, 'media', 'editor.css')
    ).toString();

    const titleSafe = escapeHtml(baseName);
    const dirSafe = escapeHtml(docDir);

    const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>${titleSafe} — PDF出力</title>
<link rel="stylesheet" href="${katexCssUri}">
<link rel="stylesheet" href="${editorCssUri}">
<style>
  /* Force a clean white printable surface and rely on editor.css's
     @media print rules to suppress toolbar / overlays (which aren't even
     rendered here, but the body.printing class also covers transient UI). */
  html, body {
    margin: 0;
    padding: 0;
    background: #ffffff;
    color: #000000;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans",
                 "Yu Gothic UI", Meiryo, sans-serif;
  }
  /* Force light-mode palette by overriding VS Code theme variables that
     editor.css falls back on. The exported page is opened in a regular
     browser (no VS Code theme context), so without these overrides the
     hard-coded dark fallbacks in editor.css would produce a dark PDF. */
  :root, body, #print-root {
    --vscode-editor-background: #ffffff;
    --vscode-editor-foreground: #000000;
    --vscode-editorWidget-background: #f3f3f3;
    --vscode-editorWidget-border: #cccccc;
    --vscode-editorWidget-foreground: #000000;
    --vscode-textLink-foreground: #1155cc;
    --vscode-textBlockQuote-border: #cccccc;
    --vscode-textBlockQuote-foreground: #555555;
    --vscode-descriptionForeground: #666666;
    --vscode-input-background: #ffffff;
    --vscode-input-foreground: #000000;
    --vscode-input-border: #cccccc;
    --vscode-button-background: #0e639c;
    --vscode-button-foreground: #ffffff;
    --vscode-focusBorder: #0078d4;
    --vscode-foreground: #000000;
    --vscode-editor-selectionBackground: #cce5ff;
    color-scheme: light;
  }
  #print-root {
    max-width: 800px;
    margin: 24px auto;
    padding: 0 16px;
    color: #000;
    background: #fff;
  }
  /* Mermaid: keep the natural size when it fits, scale down when it
     overflows. Avoid stretching small SVGs to the container width. */
  #print-root .mermaid-diagram {
    background: transparent !important;
    padding: 8px 0 !important;
    overflow: visible !important;
    display: block !important;
    text-align: center;
  }
  #print-root .mermaid-diagram svg {
    max-width: 100% !important;
    max-height: 90vh !important;
    height: auto !important;
    display: inline-block;
  }
  #print-root img {
    max-width: 100% !important;
    max-height: 90vh !important;
    height: auto !important;
    object-fit: contain;
  }
  /* Allow blocks to flow across page boundaries so we don't leave large
     blank pages whenever a single block (image / diagram / table) is
     taller than the remaining space. */
  #print-root .block {
    page-break-inside: auto !important;
    break-inside: auto !important;
  }
  /* Tables: ensure wide tables wrap inside the page instead of being
     clipped at the right margin. */
  #print-root table {
    width: 100% !important;
    max-width: 100% !important;
    table-layout: auto;
    border-collapse: collapse;
    word-break: break-word;
    overflow-wrap: anywhere;
  }
  #print-root th, #print-root td {
    word-break: break-word;
    overflow-wrap: anywhere;
    background: #ffffff;
    color: #000000;
  }
  #print-root th {
    background: #eaeaea;
  }
  #print-root pre, #print-root code {
    background: #f5f5f5 !important;
    color: #000000 !important;
  }
  /* Hide the in-app save-as-pdf hint when actually printing. */
  @media print {
    #export-hint { display: none !important; }
    #print-root { margin: 0; padding: 0; max-width: 100%; }
    @page { margin: 12mm; }
  }
  #export-hint {
    position: fixed;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    background: #fffbe6;
    border: 1px solid #e0c97a;
    color: #6b5a1a;
    padding: 6px 12px;
    border-radius: 4px;
    font-size: 12px;
    z-index: 9999;
    box-shadow: 0 2px 6px rgba(0,0,0,0.1);
    max-width: 90vw;
  }
  #export-hint code {
    background: #f4ecc7;
    padding: 1px 4px;
    border-radius: 3px;
  }
  #export-hint button {
    margin-left: 8px;
    padding: 2px 8px;
    font-size: 12px;
    cursor: pointer;
  }
</style>
</head>
<body class="printing">
  <div id="export-hint">
    印刷ダイアログの保存先に <code>${dirSafe}</code> を指定すると、Markdownファイルと同じ場所に保存されます。
    <button onclick="window.print()">再印刷</button>
  </div>
  <div id="print-root">${rewrittenHtml}</div>
  <script>
    // Give KaTeX fonts / images a moment to load before triggering print.
    window.addEventListener('load', function () {
      setTimeout(function () {
        try { window.print(); } catch (e) { console.warn(e); }
      }, 600);
    });
  </script>
</body>
</html>`;

    const tmpDir = os.tmpdir();
    const safeBase = baseName.replace(/[^A-Za-z0-9._-]+/g, '_') || 'document';
    const tmpFile = path.join(tmpDir, `mdve-pdf-${Date.now()}-${safeBase}.html`);
    await vscode.workspace.fs.writeFile(vscode.Uri.file(tmpFile), Buffer.from(html, 'utf8'));

    // Open in the OS default handler (typically the default web browser).
    // `vscode.env.openExternal` does not reliably handle file:// URIs on
    // all platforms, so use the platform-specific shell command instead.
    const opened = await openInDefaultApp(tmpFile);
    if (!opened) {
      vscode.window.showWarningMessage(
        `ブラウザを自動起動できませんでした。次のHTMLを手動で開いて印刷してください: ${tmpFile}`
      );
      return;
    }

    vscode.window.showInformationMessage(
      `PDF出力用ページを既定ブラウザで開きました。印刷ダイアログで「PDFとして保存」を選び、保存先に「${docDir}」を指定してください。`
    );
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = getNonce();

    const editorScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'editor.js')
    );
    const visualEditorScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'mermaid-visual-editor.js')
    );
    const diagramEditorsScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'diagram-editors.js')
    );
    const extraDiagramEditorsScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'extra-diagram-editors.js')
    );
    const editorStyleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'editor.css')
    );
    const markedUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'vendor', 'marked.min.js')
    );
    const mermaidUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'vendor', 'mermaid.min.js')
    );
    const katexJsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'vendor', 'katex.min.js')
    );
    const katexCssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'vendor', 'katex.min.css')
    );

    const cspSource = webview.cspSource;

    return /* html */`<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'none';
    img-src ${cspSource} data: blob: https:;
    style-src ${cspSource} 'unsafe-inline';
    script-src 'nonce-${nonce}' 'unsafe-eval';
    font-src ${cspSource};
    worker-src ${cspSource} blob:;
    connect-src ${cspSource};
  ">
  <link href="${katexCssUri}" rel="stylesheet">
  <link href="${editorStyleUri}" rel="stylesheet">
  <title>Markdown Visual Editor</title>
</head>
<body>
  <div id="topbar">
    <div id="toolbar" role="toolbar" aria-label="書式ツールバー">
      <div class="toolbar-group" role="group" aria-label="インライン書式">
        <button class="toolbar-btn" data-action="bold" title="太字" aria-label="太字" aria-keyshortcuts="Control+B"><b>B</b></button>
        <button class="toolbar-btn" data-action="italic" title="斜体" aria-label="斜体" aria-keyshortcuts="Control+I"><i>I</i></button>
        <button class="toolbar-btn" data-action="strikethrough" title="取り消し線" aria-label="取り消し線"><s>S</s></button>
        <button class="toolbar-btn" data-action="code" title="インラインコード" aria-label="インラインコード">&lt;/&gt;</button>
      </div>
      <div class="toolbar-group" role="group" aria-label="見出し">
        <button class="toolbar-btn" data-action="h1" title="見出し1" aria-label="見出し1">H1</button>
        <button class="toolbar-btn" data-action="h2" title="見出し2" aria-label="見出し2">H2</button>
        <button class="toolbar-btn" data-action="h3" title="見出し3" aria-label="見出し3">H3</button>
        <button class="toolbar-btn toolbar-btn-more" data-action="heading-more" title="見出し4〜6" aria-label="見出し4〜6" aria-haspopup="menu">…</button>
      </div>
      <div class="toolbar-group" role="group" aria-label="リスト・リンク・表">
        <button class="toolbar-btn" data-action="ul" title="箇条書き" aria-label="箇条書き">• List</button>
        <button class="toolbar-btn" data-action="ol" title="番号付きリスト" aria-label="番号付きリスト">1. List</button>
        <button class="toolbar-btn" data-action="link" title="リンク挿入" aria-label="リンク挿入">&#128279;</button>
        <button class="toolbar-btn" data-action="table" title="テーブル挿入" aria-label="テーブル挿入">&#8862;</button>
      </div>
      <div class="toolbar-group" role="group" aria-label="コード・図">
        <button class="toolbar-btn" data-action="codeblock" title="コードブロック" aria-label="コードブロック">{ }</button>
        <button class="toolbar-btn" data-action="mermaid" title="Mermaidダイアグラム挿入" aria-label="Mermaidダイアグラム挿入">&#9671; Mermaid</button>
        <button class="toolbar-btn" data-action="math" title="数式 (LaTeX) 挿入" aria-label="数式 LaTeX 挿入">&#8721; 数式</button>
      </div>
      <div class="toolbar-group toolbar-group-right" role="group" aria-label="ユーティリティ">
        <span id="save-status" class="save-status save-status-saved" role="status" aria-live="polite" title="保存済み">●</span>
        <button class="toolbar-btn" data-action="undo" title="元に戻す" aria-label="元に戻す" aria-keyshortcuts="Control+Z">↶</button>
        <button class="toolbar-btn" data-action="redo" title="やり直し" aria-label="やり直し" aria-keyshortcuts="Control+Y Control+Shift+Z">↷</button>
        <button class="toolbar-btn" data-action="find" title="検索と置換" aria-label="検索と置換" aria-keyshortcuts="Control+F Control+H" aria-pressed="false" aria-controls="find-bar">🔍</button>
        <button class="toolbar-btn" data-action="toggleTheme" title="テーマ切替" aria-label="ライト / ダークテーマ切替">☀️</button>
        <button class="toolbar-btn" data-action="openAsText" title="テキストエディタで開く" aria-label="テキストエディタで開く">📝</button>
      </div>
    </div>
    <div id="find-bar" role="search" aria-label="検索と置換" hidden>
      <input type="text" id="find-input" placeholder="検索文字列" aria-label="検索文字列" />
      <button id="find-prev" title="前へ (Shift+Enter)" aria-label="前の一致へ">↑</button>
      <button id="find-next" title="次へ (Enter)" aria-label="次の一致へ">↓</button>
      <span id="find-count" aria-live="polite" aria-atomic="true">0/0</span>
      <input type="text" id="replace-input" placeholder="置換文字列" aria-label="置換文字列" />
      <button id="replace-one" title="置換 (Enter)" aria-label="現在の一致を置換">置換</button>
      <button id="replace-all" title="すべて置換" aria-label="すべて置換">すべて置換</button>
      <label class="find-opt" title="大文字・小文字を区別"><input type="checkbox" id="find-case" aria-label="大文字・小文字を区別" /> Aa</label>
      <label class="find-opt" title="正規表現"><input type="checkbox" id="find-regex" aria-label="正規表現" /> .*</label>
      <button id="find-close" title="閉じる (Esc)" aria-label="検索バーを閉じる">×</button>
    </div>
  </div>
  <div id="editor-container">
    <div id="editor" role="textbox" aria-multiline="true" aria-label="Markdown エディタ。Tab でブロックを移動、Enter で編集開始、Esc または Ctrl+Enter で確定"></div>
  </div>
  <script nonce="${nonce}" src="${markedUri}"></script>
  <script nonce="${nonce}" src="${mermaidUri}"></script>
  <script nonce="${nonce}" src="${katexJsUri}"></script>
  <script nonce="${nonce}" src="${visualEditorScriptUri}"></script>
  <script nonce="${nonce}" src="${diagramEditorsScriptUri}"></script>
  <script nonce="${nonce}" src="${extraDiagramEditorsScriptUri}"></script>
  <script nonce="${nonce}" src="${editorScriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

function sanitizeFileName(name: string): string {
  // Strip directory components and unsafe characters.
  let base = name.replace(/[\\/]/g, '_').trim();
  base = base.replace(/[<>:"|?*\x00-\x1f]/g, '_');
  if (!base) base = 'image.png';
  // Limit length.
  if (base.length > 120) {
    const dot = base.lastIndexOf('.');
    if (dot > 0 && base.length - dot <= 10) {
      base = base.slice(0, 120 - (base.length - dot)) + base.slice(dot);
    } else {
      base = base.slice(0, 120);
    }
  }
  return base;
}

function stripExt(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

async function uniqueFileName(dir: vscode.Uri, name: string): Promise<string> {
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let candidate = name;
  let i = 1;
  // Try up to 1000 variants.
  while (i < 1000) {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.joinPath(dir, candidate));
      // Exists — try next.
      candidate = `${base}-${i}${ext}`;
      i++;
    } catch {
      return candidate;
    }
  }
  return `${base}-${Date.now()}${ext}`;
}
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Open a local file using the OS default application (typically the
 * default web browser for .html). Returns true on apparent success.
 * `vscode.env.openExternal` does not reliably handle `file://` URIs across
 * platforms, so spawn the platform-native opener instead.
 */
async function openInDefaultApp(fsPath: string): Promise<boolean> {
  try {
    if (process.platform === 'win32') {
      // `start` is a cmd builtin; the empty quoted string is the window title
      // placeholder that prevents `start` from treating the path as a title.
      const child = spawn('cmd.exe', ['/c', 'start', '""', fsPath], {
        detached: true,
        stdio: 'ignore',
        windowsVerbatimArguments: false,
      });
      child.unref();
      return true;
    }
    if (process.platform === 'darwin') {
      const child = spawn('open', [fsPath], { detached: true, stdio: 'ignore' });
      child.unref();
      return true;
    }
    const child = spawn('xdg-open', [fsPath], { detached: true, stdio: 'ignore' });
    child.unref();
    return true;
  } catch {
    // Fallback: try VS Code's openExternal with the file URI.
    try {
      return await vscode.env.openExternal(vscode.Uri.file(fsPath));
    } catch {
      return false;
    }
  }
}
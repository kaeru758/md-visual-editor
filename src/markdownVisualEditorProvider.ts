import * as vscode from 'vscode';

export class MarkdownVisualEditorProvider implements vscode.CustomTextEditorProvider {

  public static readonly viewType = 'mdVisualEditor.markdownEditor';

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
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'media'),
        vscode.Uri.joinPath(this.context.extensionUri, 'node_modules'),
      ],
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
      vscode.Uri.joinPath(this.context.extensionUri, 'node_modules', 'marked', 'marked.min.js')
    );
    const mermaidUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'node_modules', 'mermaid', 'dist', 'mermaid.min.js')
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

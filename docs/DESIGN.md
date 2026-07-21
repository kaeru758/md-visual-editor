# Markdown Visual Editor — 設計書

| 項目 | 内容 |
|---|---|
| ドキュメントバージョン | 4.0 |
| 対象拡張機能 | Markdown Visual Editor v1.0.0 |
| 作成日 | 2026-04-10 |
| 最終更新日 | 2026-07-21 |
| 対象読者 | 開発者・保守担当者 |

---

## 目次

1. [システム全体構成](#1-システム全体構成)
2. [プロジェクト構成](#2-プロジェクト構成)
3. [ホストプロセス設計](#3-ホストプロセス設計)
4. [WebView設計](#4-webview設計)
5. [WYSIWYG エディタ設計（editor.js）](#5-wysiwyg-エディタ設計editorjs)
6. [フローチャートエディタ設計（mermaid-visual-editor.js）](#6-フローチャートエディタ設計mermaid-visual-editorjs)
7. [ダイアグラムエディタ群設計（diagram-editors.js / extra-diagram-editors.js）](#7-ダイアグラムエディタ群設計diagram-editorsjs--extra-diagram-editorsjs)
8. [ズーム / パン設計（3系統）](#8-ズーム--パン設計3系統)
9. [数式（KaTeX）設計](#9-数式katex設計)
10. [画像処理設計](#10-画像処理設計)
11. [PDF出力設計](#11-pdf出力設計)
12. [スタイル設計（editor.css）](#12-スタイル設計editorcss)
13. [ビルドパイプライン設計](#13-ビルドパイプライン設計)
14. [依存パッケージ管理方針](#14-依存パッケージ管理方針)
15. [セキュリティアーキテクチャ](#15-セキュリティアーキテクチャ)
16. [状態管理設計](#16-状態管理設計)
17. [エラーハンドリング設計](#17-エラーハンドリング設計)
18. [拡張性設計](#18-拡張性設計)
19. [設計判断の記録（ADR）](#19-設計判断の記録adr)

---

## 1. システム全体構成

### 1.1 アーキテクチャ概要

```
┌─────────────────────────────────────────────────────────────────┐
│  VS Code メインプロセス (Electron / Node.js)                       │
│                                                                 │
│  ┌─────────────────────────────────────┐                        │
│  │  Extension Host (Node.js)           │                        │
│  │                                     │                        │
│  │  extension.ts                       │                        │
│  │   ├→ activate()                     │                        │
│  │   │   └→ registerCustomEditorProvider│                       │
│  │   └→ command: mdVisualEditor.openVisualEditor                │
│  │       └→ vscode.openWith(uri, viewType)                      │
│  │                                     │                        │
│  │  markdownVisualEditorProvider.ts (~626行)                     │
│  │   ├→ resolveCustomTextEditor()      │                        │
│  │   │   ├→ getHtmlForWebview()        │                        │
│  │   │   ├→ updateWebview()            │                        │
│  │   │   └→ onDidReceiveMessage()  … 9 種のメッセージを処理        │
│  │   ├→ handleExportPdf()  … 一時HTMLを os.tmpdir() に書き出し     │
│  │   │                        OS既定ブラウザで開く                 │
│  │   └→ 画像保存 … <mdと同階層>/images/ にファイル書き込み          │
│  └──────────────┬──────────────────────┘                        │
│                 │ postMessage                                    │
│  ┌──────────────▼──────────────────────┐                        │
│  │  WebView (Chromium Sandbox)          │                        │
│  │                                     │                        │
│  │  ┌─────────────────────────────┐    │                        │
│  │  │ editor.js (メインコントローラ)  │    │  External Libraries    │
│  │  │  ├→ renderAllBlocks()       │    │  （すべて media/vendor/ に │
│  │  │  ├→ computeBlockRanges()    │    │   同梱・コピーされたもの） │
│  │  │  ├→ startEditing()          │    │  ┌──────────────────┐  │
│  │  │  ├→ startMermaidEditing()   │    │  │ marked.min.js     │  │
│  │  │  ├→ startTableEditing()     │    │  │ mermaid.min.js    │  │
│  │  │  ├→ renderMathInDom()       │    │  │ katex.min.js/.css │  │
│  │  │  ├→ resolveImage / saveImage│    │  └──────────────────┘  │
│  │  │  ├→ exportPdf               │    │                        │
│  │  │  ├→ PreviewMermaidZoom      │    │                        │
│  │  │  └→ sanitizeHtml()          │    │                        │
│  │  └──────────┬──────────────────┘    │                        │
│  │             │                       │                        │
│  │  ┌──────────▼──────────────────┐    │                        │
│  │  │ mermaid-visual-editor.js    │    │                        │
│  │  │  └→ FlowchartModel /        │    │                        │
│  │  │      MermaidVisualEditor    │    │                        │
│  │  └─────────────────────────────┘    │                        │
│  │                                     │                        │
│  │  ┌─────────────────────────────┐    │                        │
│  │  │ diagram-editors.js          │    │                        │
│  │  │  ├→ ClassDiagramEditor      │    │                        │
│  │  │  ├→ SequenceDiagramEditor   │    │                        │
│  │  │  ├→ TableVisualEditor       │    │                        │
│  │  │  ├→ MindmapEditor          │    │                        │
│  │  │  ├→ QuadrantChartEditor     │    │                        │
│  │  │  ├→ GanttChartEditor        │    │                        │
│  │  │  ├→ ERDiagramEditor         │    │                        │
│  │  │  └→ DiagramZoom（共通ズーム/パン基盤）                       │
│  │  └─────────────────────────────┘    │                        │
│  │                                     │                        │
│  │  ┌─────────────────────────────┐    │                        │
│  │  │ extra-diagram-editors.js    │    │                        │
│  │  │  └→ GenericFormDiagramEditor │   │                        │
│  │  │      派生 14 クラス          │    │                        │
│  │  └─────────────────────────────┘    │                        │
│  │                                     │                        │
│  │  editor.css                         │                        │
│  └─────────────────────────────────────┘                        │
└─────────────────────────────────────────────────────────────────┘
```

v0.4.x からの主な変化は次の 2 点。

1. **ホストプロセスの責務拡大**: 従来はテキスト全文の受け渡しのみだったが、v0.4.3 以降は画像 URI 解決（`resolveImage`）、v0.4.x〜 で画像ファイルの書き込み（`saveImage` → `<mdと同階層>/images/`）、PDF 出力用一時 HTML の書き出し（`exportPdf` → `os.tmpdir()`）と、**ドキュメント本体以外のファイルシステム操作**を担うようになった。
2. **WebView 側スクリプトが 4 本から 5 本に増加**（`extra-diagram-editors.js` を追加）し、外部ライブラリが marked / mermaid の 2 本から **KaTeX を加えた 3 本**になった。いずれも `node_modules` から直接ロードするのではなく、ビルド時に `media/vendor/` へコピーされたファイルをロードする（詳細は [13. ビルドパイプライン設計](#13-ビルドパイプライン設計)）。

### 1.2 プロセスモデル

| プロセス | 実行環境 | 役割 |
|---|---|---|
| Extension Host | Node.js (VS Code) | ファイル読み書き（本文・画像・PDF用一時HTML）、WebView 管理、コマンド／メニュー登録 |
| WebView | Chromium Sandbox (iframe) | UI レンダリング、ユーザー操作処理、Mermaid/KaTeX レンダリング |

### 1.3 通信方式

ホスト ↔ WebView 間は `postMessage` による非同期メッセージングのみ。直接関数呼び出しは不可（プロセス分離）。メッセージ型は WebView→ホストが 9 種類、ホスト→WebView が 4 種類ある（詳細は [3.4](#34-メッセージプロトコル9種類)）。

---

## 2. プロジェクト構成

### 2.1 ディレクトリ構造

```
md-visual-editor/
├── .vscode/
│   ├── launch.json          # デバッグ設定（extensionHost）
│   └── tasks.json           # npm watch タスク定義
├── docs/
│   ├── DESIGN.md            # 本ファイル（設計書）
│   ├── SPECIFICATION.md     # 機能仕様書
│   ├── SECURITY.md          # セキュリティ仕様書
│   ├── LICENSE-COMPLIANCE.md # ライセンスコンプライアンス
│   ├── INSTALL-GUIDE.md     # 配布者向けガイド
│   ├── USER-GUIDE.md        # 利用者向けガイド
│   ├── USAGE-GUIDE.md       # 起動・開発者向けガイド
│   └── MERMAID-SUPPORT-MATRIX.md # Mermaid 図種別対応表
├── dist/
│   └── extension.js         # ビルド出力（TypeScript → JS、esbuild バンドル）
├── media/
│   ├── editor.js            # WebView メインスクリプト（~3566行）
│   ├── editor.css           # WebView スタイルシート（~3637行）
│   ├── mermaid-visual-editor.js  # フローチャートGUI（~2217行）
│   ├── diagram-editors.js   # 専用エディタ7種 + テーブル + 共通ズーム基盤（~4298行）
│   ├── extra-diagram-editors.js  # 汎用フォームエディタ14種（~2836行）
│   ├── icon.png
│   └── vendor/               # ビルド時に node_modules からコピーされる同梱ライブラリ
│       ├── marked.min.js
│       ├── mermaid.min.js
│       ├── katex.min.js
│       ├── katex.min.css
│       └── fonts/            # KaTeX Webフォント（.ttf は容量削減のため除外）
├── src/
│   ├── extension.ts          # エントリポイント（~31行、コマンド登録含む）
│   └── markdownVisualEditorProvider.ts  # エディタプロバイダ（~626行）
├── node_modules/              # 依存パッケージ（VSIX には含まれない）
├── package.json               # マニフェスト・依存定義
├── package-lock.json          # 依存バージョンロック
├── tsconfig.json              # TypeScript 設定
├── esbuild.mjs                # ビルドスクリプト（vendor コピー処理を含む）
├── .vscodeignore               # VSIX 除外定義
├── .gitignore
├── CHANGELOG.md
├── README.md
└── test-all-features.md       # 手動確認用の全機能サンプル Markdown
```

### 2.2 ファイル規模

| ファイル | 行数 | 言語 | 役割 |
|---|---|---|---|
| extension.ts | 31 | TypeScript | エントリポイント + コマンド登録 |
| markdownVisualEditorProvider.ts | 626 | TypeScript | エディタプロバイダ + 画像保存 + PDF出力 |
| editor.js | 3566 | JavaScript | WebView メインロジック（ブロックモデル・数式・画像・検索・ズーム 等） |
| mermaid-visual-editor.js | 2217 | JavaScript | フローチャート GUI |
| diagram-editors.js | 4298 | JavaScript | 専用エディタ 7 種 + テーブルエディタ + 共通ズーム基盤 `DiagramZoom` |
| extra-diagram-editors.js | 2836 | JavaScript | 汎用フォームエディタ 14 種（`GenericFormDiagramEditor` 派生） |
| editor.css | 3637 | CSS | 全 UI スタイル |
| **合計** | **17211** | | |

v0.4.1 時点（~6290 行）から約 2.7 倍に増加している。主因はブロックモデルの刷新（v0.5.4）、汎用フォームエディタ 14 種の追加、ズーム/パン 3 系統の実装、数式（KaTeX）・画像・PDF出力・検索置換・変更ハイライトなどの機能追加。

---

## 3. ホストプロセス設計

### 3.1 extension.ts

```typescript
export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    MarkdownVisualEditorProvider.register(context)
  );

  // テキストエディタからビジュアルエディタへの1クリック復帰用コマンド（v0.5.3）
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'mdVisualEditor.openVisualEditor',
      async (uri?: vscode.Uri) => {
        const target = uri ?? vscode.window.activeTextEditor?.document.uri;
        if (!target) {
          vscode.window.showWarningMessage('アクティブな Markdown ファイルが見つかりません。');
          return;
        }
        await vscode.commands.executeCommand(
          'vscode.openWith',
          target,
          MarkdownVisualEditorProvider.viewType
        );
      }
    )
  );
}
```

**設計方針:** エントリポイントは登録のみ。ロジックは Provider に集約する方針は維持しつつ、v0.5.3 で「テキストエディタ → ビジュアルエディタ」の往復コマンドを追加した。引数の `uri` が渡らないケース（コマンドパレット実行など）は `activeTextEditor` にフォールバックし、対象が特定できない場合は警告を表示して何もしない。

### 3.2 markdownVisualEditorProvider.ts

#### クラス構造

```
MarkdownVisualEditorProvider implements vscode.CustomTextEditorProvider
  ├── static register(context) → Disposable
  ├── resolveCustomTextEditor(document, webviewPanel, token)
  │   ├── localResourceRoots 設定（extension media / mdの親フォルダ / ワークスペースフォルダ）
  │   ├── WebView HTMLの生成・設定
  │   ├── メッセージリスナー登録（9 種類、下記 3.4 参照）
  │   ├── onDidChangeTextDocument リスナー登録（外部変更の反映）
  │   └── onDidSaveTextDocument リスナー登録（saveStatus 送出）
  ├── handleExportPdf(document, innerHtml)
  │   ├── 相対 <img src> を絶対 file:// へ書き換え
  │   ├── ライトモード固定・@media print 付きの単体 HTML を生成
  │   ├── os.tmpdir() に書き出し
  │   └── openInDefaultApp() で OS 既定ブラウザを起動
  ├── getHtmlForWebview(webview) → string
  │   ├── nonce 生成（32文字ランダム英数字）
  │   ├── CSP ヘッダー構築
  │   ├── ライブラリ URI 取得（marked, mermaid, katex, editor, css）
  │   └── HTML テンプレート返却（トップバー・ツールバー・検索バー・#editor を含む）
  └── getNonce() / sanitizeFileName() / uniqueFileName() / stripExt() / escapeHtml() / openInDefaultApp()
```

#### WebView ライフサイクル

```
1. ユーザーが .md を「Markdown Visual Editor」で開く
   （または開いているテキストエディタでタイトルバーの「Markdown ビジュアルエディタで開く」ボタンを押す）
2. VS Code が resolveCustomTextEditor() を呼び出し
3. getHtmlForWebview() で HTML 生成 → WebView にセット
4. WebView の JS が 'ready' メッセージを送信
5. ホストが 'update'（全文）と 'saveStatus'（dirty真偽）を WebView に送信
6. ユーザー操作（編集 / 画像D&D / PDF出力 / undo・redo 等）
7. WebView が対応するメッセージ（'edit' / 'saveImage' / 'exportPdf' / 'undo' 等）を送信
8. ホストが WorkspaceEdit・ファイル書き込み・VS Code コマンド実行等で応答
```

#### 循環更新防止メカニズム

```typescript
let isWebviewEdit = false;

// WebView からの編集メッセージ受信時
case 'edit':
    isWebviewEdit = true;
    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, fullRange, message.text);
    await vscode.workspace.applyEdit(edit);
    isWebviewEdit = false;
    webviewPanel.webview.postMessage({ type: 'saveStatus', dirty: document.isDirty });
    break;

// ドキュメント変更イベント
vscode.workspace.onDidChangeTextDocument(e => {
    if (e.document.uri.toString() === document.uri.toString() && !isWebviewEdit) {
        updateWebview();  // 外部変更（他エディタ・git操作等）の場合のみ WebView に反映
    }
});
```

拡張機能自身は `document.save()` を一切呼ばない。保存は VS Code 標準の保存フロー（`Ctrl+S` 等）に委ね、`onDidSaveTextDocument` で `saveStatus{dirty:false}` を WebView に伝えるだけに留める設計。

### 3.3 WebView HTML 構造

```html
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="...CSP...">
    <link href="${katexCssUri}" rel="stylesheet">
    <link href="${editorCssUri}" rel="stylesheet">
</head>
<body>
    <div id="topbar">
      <div id="toolbar">...</div>
      <div id="find-bar" hidden>...</div>
    </div>
    <div id="editor-container"><div id="editor"></div></div>

    <script nonce="${nonce}" src="${markedUri}"></script>
    <script nonce="${nonce}" src="${mermaidUri}"></script>
    <script nonce="${nonce}" src="${katexJsUri}"></script>
    <script nonce="${nonce}" src="${visualEditorScriptUri}"></script>
    <script nonce="${nonce}" src="${diagramEditorsScriptUri}"></script>
    <script nonce="${nonce}" src="${extraDiagramEditorsScriptUri}"></script>
    <script nonce="${nonce}" src="${editorScriptUri}"></script>
</body>
</html>
```

**スクリプトロード順序:**
1. `marked.min.js` — Markdown パーサー（依存なし）
2. `mermaid.min.js` — ダイアグラムレンダラ（依存なし）
3. `katex.min.js` — 数式レンダラ（依存なし）
4. `mermaid-visual-editor.js` — フローチャート GUI（mermaid に依存、`window.MermaidVisualEditor` を公開）
5. `diagram-editors.js` — 専用エディタ7種 + `DiagramZoom` 共通基盤（mermaid に依存）
6. `extra-diagram-editors.js` — 汎用フォームエディタ14種（mermaid・`DiagramZoom` に依存）
7. `editor.js` — メインコントローラ（上記すべて + katex に依存）

CSS は `katex.min.css` → `editor.css` の順でロードする（KaTeX のデフォルトスタイルを editor.css 側で上書きできるようにするため）。

### 3.4 メッセージプロトコル（9種類）

v0.3.1 時点では `edit` / `ready` の 2 種類のみだったが、v0.3.1〜v0.5.x で段階的に増え、現在は WebView→ホストが 9 種類ある。詳細は [SPECIFICATION.md §17](SPECIFICATION.md#17-ホスト-webview間通信プロトコル) を参照。設計上の要点のみ記す。

- **`resolveImage` にホスト側キャッシュを持たせない**: 同一画像を何度要求されても毎回 `asWebviewUri` を計算するだけの単純なステートレス処理とし、キャッシュは WebView 側の `_imageUriCache` に一本化した。ホストとWebViewの両方にキャッシュを持つと無効化のタイミングがずれるリスクがあるため。
- **`saveImage` はファイル名衝突を `uniqueFileName()` で解決**: `images/` ディレクトリ内に同名ファイルがあれば `-1`, `-2`... のサフィックスを付与する（最大1000回試行、それでも衝突する場合はタイムスタンプにフォールバック）。
- **`undo` / `redo` は WebView 側で状態を持たず、VS Code の `commands.executeCommand('undo'/'redo')` に委譲**する。ドキュメント全体の undo/redo スタックを VS Code 標準のものと共有するため、ブロックエディタ独自の undo スタックは持たない（ダイアグラムエディタ内部の一時的な undo スタックは別、[6.3](#63-undoredo-設計) 参照）。

---

## 4. WebView設計

### 4.1 スクリプト間の依存関係

```
marked.min.js (グローバル: marked)
mermaid.min.js (グローバル: mermaid)
katex.min.js (グローバル: katex)
    ↓ 使用
mermaid-visual-editor.js (グローバル: window.MermaidVisualEditor)
    ↓ 参照
diagram-editors.js (グローバル:
    window.ClassDiagramEditor,
    window.SequenceDiagramEditor,
    window.TableVisualEditor,
    window.MindmapEditor,
    window.QuadrantChartEditor,
    window.GanttChartEditor,
    window.ERDiagramEditor,
    window.DiagramZoom,
    window.DiagramEditorUtils)
    ↓ 参照
extra-diagram-editors.js (グローバル:
    window.GenericFormDiagramEditor 派生 14 クラス,
    window.ExtraDiagramUtils)
    ↓ 参照
editor.js
```

### 4.2 グローバルエクスポート方式

WebView 内のスクリプトはモジュールシステム（ES Modules / CommonJS）を使用せず、`window` オブジェクトへの直接代入でクラスを共有する。

```javascript
// diagram-editors.js 末尾
window.ClassDiagramEditor = ClassDiagramEditor;
window.SequenceDiagramEditor = SequenceDiagramEditor;
window.ERDiagramEditor = ERDiagramEditor;
window.DiagramZoom = { attach(container, opts) { ... }, ... };
// ...
window.DiagramEditorUtils = { isClassDiagram, isSequenceDiagram, isERDiagram, ... };
```

**理由:** WebView のスクリプトは CSP の `nonce` 制約下で `<script src>` タグとしてロードされる。ES Modules（`type="module"`）を使わないのは、CSP との相互作用やブラウザ互換性を単純化するため（v0.4.1 時点から変更なし）。

---

## 5. WYSIWYG エディタ設計（editor.js）

### 5.1 全体構造

```
editor.js (即時実行)
├── 状態変数
│   ├── allTokens[]           // marked.lexer() の全トークン
│   ├── editingBlockIndex     // 編集中ブロックインデックス (-1 = なし)
│   ├── _editingRange          // 編集中のトークン範囲 {start,end}（特殊ブロックは null）
│   ├── baselineText           // 変更ハイライトの基準テキスト（v0.5.0）
│   ├── mermaidCounter        // Mermaid レンダリング一意ID
│   ├── activeVisualEditor    // アクティブなビジュアルエディタインスタンス
│   ├── activeTableEditor     // アクティブなテーブルエディタインスタンス
│   ├── _imageUriCache / _imageRequestSeq  // 画像解決キャッシュ・リクエストID（v0.4.3）
│   ├── _forcedTheme           // auto/light/dark 強制テーマ（v0.3.1）
│   └── preventBlurFinish     // ツールバー操作中のblur防止フラグ
│
├── 初期化
│   ├── mermaid.initialize()
│   ├── vscode API 取得 (acquireVsCodeApi)
│   └── message リスナー登録（update / saveStatus / imageResolved / imageSaved）
│
├── ブロック範囲計算（v0.5.4 で新設 — 5.2 参照）
│   ├── computeBlockRanges(tokens)
│   ├── _isSpecialTokenType(t)
│   └── rawOfRange(range) / rangeOf(startIdx)
│
├── レンダリング
│   ├── renderAllBlocks()            // ブロック範囲ごとに1要素を描画
│   ├── renderBlockContent(block, rep, index)  // 個別ブロックのHTML生成
│   ├── renderMathInDom(root)        // インライン/ディスプレイ数式の後処理（9章）
│   ├── sanitizeHtml(html)          // XSS防止サニタイズ
│   ├── escapeHtml(text) / escapeHtmlAttr(text)
│   └── PreviewMermaidZoom            // 本文中Mermaid図のズーム/パン（8章）
│
├── ブロック編集
│   ├── startEditing(tokenIndex)    // 編集モード開始（範囲全体を textarea に展開）
│   ├── finishEditing()             // 編集モード終了・保存
│   └── ツールバー / 右クリックメニューイベントハンドラ
│
├── Mermaid 編集ルーティング
│   ├── startMermaidEditing(tokenIndex)         // 種別判定 → 振り分け
│   ├── startGenericDiagramEditing(...)         // 専用/汎用エディタ起動
│   └── destroyVisualEditor()                   // エディタ破棄
│
├── テーブル編集
│   └── startTableEditing(tokenIndex)           // テーブルGUI起動
│
├── 画像処理（10章）
│   ├── resolveImage(src) → resolveImageBatch()  // バッチ解決 + キャッシュ
│   └── 画像 D&D → saveImage メッセージ送信
│
├── PDF出力（11章）
│   └── exportPdf()  // レンダリング済みDOMを収集して postMessage
│
└── 検索/置換・変更ハイライト・キーボード操作・右クリックメニュー
```

### 5.2 ブロックモデル（v0.5.4 — 最重要のアーキテクチャ変更）

#### 5.2.1 背景

v0.5.3 以前は「marked トークン 1 個 = 1 編集ブロック」という単純な対応だった。この方式では見出しや段落 1 つ 1 つが個別ブロックになり、文章量が多い文書ではブロック数が肥大化して選択・移動・D&D 並べ替えの操作コストが上がっていた。v0.5.4 では **テキスト系トークンを H1/H2 見出し単位のセクションにまとめて 1 ブロックにする** よう設計を変更した。

#### 5.2.2 ブロック = トークン範囲（range）

```javascript
// editor.js:645-694
function _isSpecialTokenType(t) {
  return !!t && (t.type === 'table' || t.type === 'code');
}

function computeBlockRanges(tokens) {
  // 1) type: 'space'（空行）トークンは直前の range に吸収する
  // 2) table / code（プレーンコード・```mermaid・```math を含むフェンス全般）は
  //    単独で1レンジ（直後の空行も吸収）
  // 3) それ以外（見出し・段落・リスト・引用・hr等）は、
  //    「次の H1/H2 見出し・特殊ブロック・EOF の直前」までを1レンジにまとめる
  ...
}

function rawOfRange(range, tokens) {
  // range内の各トークンの raw を連結して元テキストを再構成
}

function rangeOf(startIdx) {
  // startIdx から始まる range を返す（見つからなければ startIdx を含む range、
  // それも無ければ単一トークンにフォールバック）
}
```

ポイント:

- **1 ブロック = 1 DOM 要素 = トークンの連続範囲 `{start, end}`**（従来の「1トークン=1ブロック」ではない）。
- `_isSpecialTokenType(t)` は `table` と `code` のみを「特殊」と判定する。`code` は marked が `type:'code'` + `lang` で区別するプレーンコード・` ```mermaid `・` ```math ` を **すべて含む**。したがって Mermaid 図や数式ブロックは常に単独ブロックとして専用ビジュアルエディタに渡る。
- **テキストセクション**: H1 または H2 見出しから、次の H1/H2 見出し・特殊ブロック・文書末尾の **直前まで** を1ブロックとする。H3〜H6 見出し・段落・リスト・引用・水平線は同じセクションの中に同居する（個別ブロックにはならない）。
- DOM 上は `data-token-index`（= `range.start`）と `data-token-end`（= `range.end`）の 2 属性でブロックの範囲を表現する。ブロック検索・フォーカス移動・D&D 並べ替えなどはすべてこの2属性を介して range を復元する。

#### 5.2.3 代表トークン（`rep`）と v0.5.6 の修正

`renderAllBlocks()` は各 range について「どのトークンを描画の入力にするか」を決める必要がある。

```javascript
// editor.js:751 (v0.5.6)
const rep = (_isSpecialTokenType(allTokens[index]) || range.end - range.start === 1)
  ? allTokens[index]
  : { type: 'section', raw: rawOfRange(range) };
```

- 特殊ブロック（table / code）は常にその**先頭トークン自体**を `rep` として使い、専用の描画分岐（Mermaid 描画・テーブル描画・コードハイライト等）に流す。
- それ以外の range で長さが 1（テキストセクションだが実質1トークンしかない）場合もそのトークンをそのまま使う。
- 上記いずれでもない（= 複数トークンからなるテキストセクション）場合のみ、合成の `{type:'section', raw: ...}` トークンを作り、`marked.parser()` に通常のセクションとして再パースさせる。

**v0.5.4 の当初実装のバグ（v0.5.6で修正）**: 判定条件が `range.end - range.start === 1`（range長が1かどうか）だけだったため、特殊ブロックの直後に空行があると `computeBlockRanges()` がその空行を吸収して range 長が 2 になり、`rep` が誤って合成 `section` トークンになっていた。結果、Mermaid 図・表・数式ブロックが SVG/テーブル/KaTeX ではなく **生の Markdown コードとして表示される**リグレッションが発生していた（CHANGELOG v0.5.6）。修正版では「特殊トークン種別かどうか」を長さより先に判定するようにし、空行の有無に関わらず特殊ブロックが正しく専用描画に回るようにした。

#### 5.2.4 ブロック操作への影響

- **編集**: `startEditing(tokenIndex)` は `rangeOf(tokenIndex)` で range を復元し、`rawOfRange()` で連結した生テキストを textarea に展開する。保存時は textarea の内容で range 全体を置換する。
- **選択・移動・削除・D&D並べ替え**: すべて `data-token-index` / `data-token-end` から range を復元して操作する。複数選択のコピー/切り取りは、選択された各 range の raw を `\n\n` で連結する。
- **変更ハイライト（v0.5.0、[16章](#16-状態管理設計)参照）**: baseline テキストも同じ `computeBlockRanges()` で分割し、raw 文字列同士を比較する。

### 5.3 トークン管理方式（v0.5.4 以降）

```
Markdown テキスト
    ↓ marked.lexer()
allTokens[] = すべてのトークン（space含む）を保持
    ↓ computeBlockRanges()
_blockRanges[] = { start, end } の配列（1ブロック=1レンジ）
    ↓ 各レンジについて renderBlockContent(rep)
DOM: <div class="block" data-token-index data-token-end>

保存時: allTokens[].map(t => t.raw).join('') でテキスト再構成
```

**設計理由:** `space` 型トークン（空行）を `allTokens` に保持し続けることで、編集していないブロック間の空白を正確に再現する方針は v0.4.1 から変更していない。v0.5.4 で追加されたのは、その上にもう一段「範囲」の抽象化を載せた点である。

### 5.4 Mermaid ルーティングフロー

```
startMermaidEditing(tokenIndex)
    ├── token.text の先頭行を解析
    │
    ├── graph/flowchart? → startFlowchartEditing()
    │   └→ new MermaidVisualEditor(container, code, onSave, onCancel)
    │
    ├── classDiagram? → startGenericDiagramEditing(..., ClassDiagramEditor)
    ├── sequenceDiagram? → startGenericDiagramEditing(..., SequenceDiagramEditor)
    ├── mindmap? → startGenericDiagramEditing(..., MindmapEditor)
    ├── quadrantChart? → startGenericDiagramEditing(..., QuadrantChartEditor)
    ├── gantt? → startGenericDiagramEditing(..., GanttChartEditor)
    ├── erDiagram? → startGenericDiagramEditing(..., ERDiagramEditor)
    │
    ├── window.ExtraDiagramUtils の判定関数に一致?
    │   → startGenericDiagramEditing(..., 対応する GenericFormDiagramEditor 派生クラス)
    │   （stateDiagram-v2 / pie / journey / gitGraph / timeline / requirementDiagram /
    │     C4 / sankey-beta / xychart-beta / block-beta / packet-beta /
    │     architecture-beta / kanban の 13 種。zenuml のみ検出対象から除外）
    │
    └── (その他・zenuml含む) → コード+プレビュー分割エディタ（editor.js 内蔵）
```

### 5.5 汎用ダイアグラムエディタ起動パターン

`startGenericDiagramEditing()` は以下の統一パターンで各エディタを起動する。専用エディタ7種・汎用フォームエディタ14種のいずれも同じ起動関数を通る。

```javascript
function startGenericDiagramEditing(tokenIndex, token, blockEl, EditorClass) {
    const container = document.createElement('div');
    container.className = 'diagram-visual-editor';
    const editor = new EditorClass(container, token.text, onSave, onCancel);
    blockEl.innerHTML = '';
    blockEl.appendChild(container);
    activeVisualEditor = editor;
}
```

---

## 6. フローチャートエディタ設計（mermaid-visual-editor.js）

### 6.1 クラス構成

```
FlowchartModel
├── parse(code)           // Mermaid コード → データモデル
├── generate()            // データモデル → Mermaid コード
├── direction             // TD | LR | BT | RL
├── layout                // dagre | elk | elk.tree（%%{init:{"layout":...}}%% で永続化）
├── nodes: Map            // ノード定義
├── edges: Array          // 接続定義
├── subgraphs: Array      // サブグラフ定義（parentSgId で入れ子表現）
└── styles: Map           // ノードスタイル

MermaidVisualEditor (window.MermaidVisualEditor)
├── constructor(container, code, onSave, onCancel)
├── ツールバー生成
│   ├── ノード形状ボタン群（8種）
│   ├── 接続モードボタン
│   ├── 接続線種ドロップダウン
│   ├── フロー方向ドロップダウン
│   ├── レイアウトドロップダウン（dagre/elk/elk.tree）
│   ├── 色変更ボタン
│   ├── グループ化ボタン
│   ├── 削除ボタン
│   ├── ズーム/フィットボタン（自前実装、8章参照）
│   └── Undo/Redo ボタン
├── SVG キャンバス管理
│   ├── renderDiagram()       // mermaid.render() でSVG更新
│   ├── setupSvgInteraction() // ノード/接続線/サブグラフのクリック・ダブルクリック
│   └── インライン編集UI
├── 接続リスト管理
│   ├── renderEdgeList()
│   └── 編集/削除ボタン
├── Undo/Redo スタック
│   ├── undoStack[]
│   ├── redoStack[]
│   └── pushSnapshot()
└── 保存/キャンセルバー
```

### 6.2 SVG インタラクション

```
SVG ノード要素
    ↓ クリック → 選択状態（ハイライト表示）
    ↓ ダブルクリック → インライン編集UI表示
         ├── テキスト入力 <input>
         └── 形状選択バー

SVG 接続線要素
    ↓ ダブルクリック → 操作パネル表示
         ├── 方向反転
         ├── 削除
         ├── 線種変更
         └── ラベル編集

SVG サブグラフ要素
    ↓ ダブルクリック → サブグラフ編集UI表示
         ├── 名前変更
         └── ノードの追加/除外

接続モード:
    ノード1 クリック → 接続元選択（緑ハイライト）
    ノード2 クリック → ラベル入力ダイアログ → 接続追加
```

### 6.3 Undo/Redo 設計

- 操作ごとに `FlowchartModel` の JSON スナップショット（`JSON.stringify`）をスタックに push
- Undo: `undoStack.pop()` → モデル復元 → 再レンダリング
- Redo: `redoStack.pop()` → モデル復元 → 再レンダリング
- 新規操作時は `redoStack` をクリア
- この undo/redo はエディタインスタンス内のローカル状態であり、ドキュメント全体の VS Code undo（`Ctrl+Z`）とは別スタックである。汎用フォームエディタ14種にはこの内部 undo スタックが**存在しない**（[7.5](#75-汎用フォームエディタとの違いextra-diagram-editorsjs) 参照）。

### 6.4 ズーム/パンの独自実装

フローチャートエディタはズーム/パン UI を [8章](#8-ズーム--パン設計3系統)の共通基盤 `DiagramZoom` に相乗りせず、独自に実装している（`mermaid-visual-editor.js:2108-2166`）。ズーム(+/−)・フィットボタンと `Ctrl`+ホイールには対応するが、**方向ボタン・中ボタンドラッグによるパンには対応していない**。他の20種のエディタと挙動が非対称になっている点は既知の設計上の不整合であり、[19章 ADR-016](#adr-016-ズームパンを3系統に分けて実装した理由) に理由と今後の方針を記す。

---

## 7. ダイアグラムエディタ群設計（diagram-editors.js / extra-diagram-editors.js）

### 7.1 共通設計パターン（専用エディタ7種）

`diagram-editors.js` の 7 クラス（Class / Sequence / Table / Mindmap / Quadrant / Gantt / ER）は以下の共通パターンに従う。

```javascript
class XxxEditor {
    constructor(container, code, onSave, onCancel) {
        this.parseCode(code);        // 1. Mermaid コードをパースしてデータモデル構築
        this.buildLeftPanel(container);   // 2. 左パネル（フォーム/ツリー）を構築
        this.buildPreviewPanel(container); // 3. 右パネル（プレビュー）を構築
        this.buildActionBar(container);    // 4. 保存/キャンセルバーを構築
        this.updatePreview();              // 5. 初回プレビュー更新
        DiagramZoom.attach(this.previewEl, { ... }); // 6. ズーム/パンを付与（8章）
    }
    parseCode(code) { /* Mermaid テキスト → 内部データ */ }
    generateCode() { /* 内部データ → Mermaid テキスト */ }
    updatePreview() {
        const code = this.generateCode();
        mermaid.render(id, code).then(({svg}) => { previewEl.innerHTML = svg; });
    }
}
```

`TableVisualEditor` のみこのパターンに従わず、`DiagramCommon` / `DiagramZoom` を使わない独自実装（プレビューが Mermaid SVG ではなく HTML テーブルであるため）。

### 7.2 クラス別設計詳細（専用エディタ7種）

| クラス | パース方式 | UI方式 | 主なデータ構造 |
|---|---|---|---|
| ClassDiagramEditor | 正規表現（`class {}` ブロック + インライン） | フォーム | classes[], relations[] |
| SequenceDiagramEditor | 行単位正規表現 | フォーム + 並替 + カラーパレット | participants[], messages[] (note/rect含む) |
| TableVisualEditor | パイプ(`\|`)分割（区切り行は読み捨て） | `<textarea>` セル（自動高さ） | headers[], rows[][] |
| MindmapEditor | インデント解析（空白数） | ツリー表示 | root (再帰ノード) |
| QuadrantChartEditor | ディレクティブ解析（引用符付きラベル対応） | フォーム | title, axes, quadrants, points[] |
| GanttChartEditor | セクション/タスク行解析 + `%%gantt-style` | フォーム + 並替 | title, dateFormat, sections[{tasks[]}] |
| ERDiagramEditor | 行単位正規表現 | フォーム + SVGコンテキストメニュー | entities[], relationships[] |

各クラス別の詳細な UI 仕様（右クリックメニュー・ドラッグ操作等）は [SPECIFICATION.md §8〜§16](SPECIFICATION.md#8-フローチャートビジュアルエディタ) を参照。

### 7.3 ヘルパー関数

```javascript
function _el(tag, cls)           // document.createElement + className
function _elText(tag, text, cls) // createElement + textContent
function _escHtml(text)          // & < > " のエスケープ
```

### 7.4 検出ヘルパー（DiagramEditorUtils / ExtraDiagramUtils）

```javascript
window.DiagramEditorUtils = {
    isClassDiagram(code),     // /^classDiagram/
    isSequenceDiagram(code),  // /^sequenceDiagram/
    isMindmap(code),          // /^mindmap/
    isQuadrantChart(code),    // /^quadrantChart/
    isGanttChart(code),       // /^gantt/
    isERDiagram(code)         // /^erDiagram/
};

// extra-diagram-editors.js
window.ExtraDiagramUtils = {
    isStateDiagram(code), isPieChart(code), isJourney(code), isGitGraph(code),
    isTimeline(code), isRequirementDiagram(code), isC4(code), isSankey(code),
    isXyChart(code), isBlockDiagram(code), isPacket(code), isArchitecture(code),
    isKanban(code)
    // zenuml の判定関数は存在しない（挿入ピッカー・自動振り分けの対象外）
};
```

### 7.5 汎用フォームエディタとの違い（extra-diagram-editors.js）

`GenericFormDiagramEditor` を基底クラスとし、14 図種（うち実際に GUI 編集が機能するのは 13 種、zenuml はコード編集のみ）のサブクラスが「セクション定義」だけを記述する形で実装されている（[19章 ADR-007](#adr-007-その他-mermaid-14-種を汎用フォームエディタで実装v030) 参照、クラス名・設計意図は v0.3.0 から変更なし）。

専用エディタ7種との相違点:

- **エディタ内 Undo スタックを持たない**。`Ctrl+Z` はドキュメント全体の VS Code undo に委譲される。専用エディタ7種のうちフローチャートは独自 undo スタックを持つが、汎用フォームエディタにはこの仕組みがない。
- **`↑`/`↓` ボタンはリスト内フォーカス移動のみ**で、データの並べ替えは行わない。実際の並べ替えは D&D または右クリックメニューから行う（README/CHANGELOG が「↑↓で並べ替え」と誤解されやすい表現をしていた箇所があるため注意）。
- `DiagramCommon`（`extra-diagram-editors.js:34-209`）でオンボーディング表示（`mountOnboarding`、localStorage `mve.onboarding.dismissed.<key>` で既読管理）・キーハンドラ・ツールチップ・D&D並べ替え・右クリックメニューを共通化している。`TableVisualEditor` はこの `DiagramCommon` を使わず、オンボーディング表示もない。
- ズーム/パンは `DiagramZoom`（[8章](#8-ズーム--パン設計3系統)）を専用エディタ7種と共有する。

---

## 8. ズーム / パン設計（3系統）

v0.5.5 でMermaid図の拡大縮小・移動に対応したが、**実装は単一の共通コンポーネントに統一されておらず、3つの独立した系統として存在する**。これは機能追加が段階的に行われた結果であり、意図的な統一設計ではない（経緯は [19章 ADR-016](#adr-016-ズームパンを3系統に分けて実装した理由) 参照）。

| 系統 | 実装場所 | 対象 | 操作 | 倍率範囲 |
|---|---|---|---|---|
| **A. `DiagramZoom`** | `diagram-editors.js:189-360` | 編集モードの20種（専用エディタ6種 + 汎用フォーム14種。フローチャートを除く） | 🔍+/− ・ ⊞フィット ・ 方向ボタン(◀▶▲▼、60px刻み) ・ %表示 ・ `Ctrl`+ホイール ・ **中ボタンドラッグでパン** | 0.2〜3.0（step 0.15） |
| **B. フローチャート独自** | `mermaid-visual-editor.js:2108-2166` | フローチャート編集モードのみ | 🔍+/− ・ ⊞フィット ・ `Ctrl`+ホイール | — |
| **C. `PreviewMermaidZoom`** | `editor.js:943-1038` | 本文中の全 Mermaid 図（種別問わず、編集していない状態のプレビュー） | 🔍+/− ・ ⊞フィット ・ 方向ボタン ・ `Ctrl`+ホイール ・ **左ドラッグでパン**（Pointer Capture） | 0.2〜4.0（step 0.2） |

設計上の注意点:

- **系統B（フローチャート）だけパン非対応**。方向ボタンも中ボタンドラッグも実装されておらず、他の20種のエディタと操作性が非対称になっている。フローチャートエディタは SVG 上でのノード直接操作（ドラッグでの接続作成等）が多いため、パン操作用のポインタイベントとの競合を避けるために後回しにされたと考えられるが、明文化された設計意図は残っていない。
- **系統Cのみ独立した実装**である理由は、対象が「編集用の単一ダイアグラム」ではなく「本文中に複数存在しうる、種別を問わないプレビュー画像」だからである。個々の Mermaid ブロックごとに独立したズーム状態を持たせる必要があり、`DiagramZoom` のような単一コンテナ前提の実装を流用しにくかった。
- 系統Cは初回描画時、SVG が表示領域より大きい場合のみ自動フィットする（[19章 ADR-012](#adr-012-フローチャート初期描画の倍率自動調整は条件付きv031) と同じ考え方を踏襲）。コンテナには `max-height: 70vh` の上限を設ける。
- 3系統とも `Ctrl`+ホイールでのズームには対応しているが、パン方式（中ボタンドラッグ／左ドラッグ／なし）と方向ボタンの有無が系統ごとに異なる。将来的に共通化する場合は系統Cのマルチインスタンス対応を`DiagramZoom`側に取り込む形が有力だが、本バージョンでは未着手。

---

## 9. 数式（KaTeX）設計

### 9.1 依存ライブラリの追加

marked / mermaid に加えて **KaTeX 0.17.x** を `media/vendor/katex.min.js` / `katex.min.css` として同梱した（[19章 ADR-014](#adr-014-数式レンダリングに-katex-を採用しフォントごと同梱)）。CSS は KaTeX が独自の Web フォントを `./fonts/` 相対パスで参照するため、フォントファイル一式（`.ttf` を除く）も `media/vendor/fonts/` にコピーしている。

### 9.2 2つの数式構文と2つの処理経路

Mermaid 図と異なり、marked 4.3.x には数式構文（LaTeX の `$...$` 記法）を解釈する機能がない。そのため、数式は構文によって処理経路が分かれる。

| 構文 | ブロックモデル上の扱い | 描画方式 |
|---|---|---|
| ` ```math ` フェンス（ディスプレイ数式） | `type:'code'` + `lang:'math'` の**独立ブロック**（`_isSpecialTokenType` が true） | `renderBlockContent()` が直接 `katex.renderToString()` を呼び `.math-display` として描画。ホバーで「✎ 数式を編集」オーバーレイを表示 |
| インライン `$...$` / ディスプレイ `$$...$$` | 通常の段落・見出し等のテキストの一部（marked は素通しする） | **描画後の DOM を `TreeWalker` で走査**し、テキストノード中の数式パターンを KaTeX の `<span>` に置換する後処理（`renderMathInDom()`） |

後者を「後処理」にせざるを得ない理由は、marked のトークナイザがインライン数式を認識しないため、`marked.parser()` が生成した HTML の中に生の `$...$` がテキストとして残ってしまうこと。素朴に正規表現で HTML 文字列を置換すると `<code>` や属性値の中の `$` まで誤爆するリスクがあるため、DOM 構築後に `TreeWalker` でテキストノードのみを対象に走査する設計にした。走査時は `CODE` / `PRE` / `SCRIPT` / `STYLE` / `A` / `TEXTAREA` の子孫と、既に KaTeX ノードになっている箇所をスキップする。

### 9.3 レンダリング設定とエラーハンドリング

```javascript
katex.renderToString(src, {
  throwOnError: false,
  output: 'html',
  strict: 'ignore',
  trust: false,
});
```

- `throwOnError:false` により、構文エラーでも例外を投げさせず `katex.renderToString` 自身にエラー表示 HTML を生成させた上で、呼び出し側でも `<span class="math-error" title="理由">` を追加でラップし、赤背景・`cursor:help` のツールチップとして提示する。
- `trust:false` により `\includegraphics` 等の危険になりうるコマンドを無効化する（[15章 セキュリティアーキテクチャ](#15-セキュリティアーキテクチャ)の多層防御の一部）。
- KaTeX 自体が未ロード（スクリプトの読み込み失敗等）の場合は `.math-fallback` としてソースをそのまま表示するフォールバックを用意する。

### 9.4 数式エディタ

` ```math ` ブロックの編集UIは textarea + 200ms デバウンスのライブプレビューに加え、**LaTeX 記号パレット**を持つ。パレットは「構造」「演算子」「関係」「大記号」「ギリシャ」「集合・論理」「行列・整列」の7グループに分類され、テンプレート挿入時は `$1` / `$2` のようなプレースホルダでカーソル位置を制御する（Mermaid ビジュアルエディタのフォームパターンとは異なる、数式専用の UI）。

---

## 10. 画像処理設計

### 10.1 表示（相対パス画像の解決）

WebView はサンドボックスされており、ローカルファイルシステム上の相対パス画像（`![alt](images/foo.png)` 等）をそのまま `<img src>` に指定しても表示できない。そこで次の設計を採る。

1. `renderBlockContent()` が `<img>` を描画する際、`src` が絶対扱い可能なスキーム（`data:` `blob:` `http(s):` `vscode-webview:` `vscode-resource:` `file:` `#`）でなければ「解決が必要」と判定する。
2. 同一 `src` への複数リクエストは1回にバッチし、`resolveImage` メッセージでホストに解決を依頼する。ホストは `decodeURI` してから `Uri.joinPath(document.uri, '..', decoded)` → `asWebviewUri()` した結果を `imageResolved` で返す。
3. WebView 側は `_imageUriCache` に結果をキャッシュし、以後の同一パスの解決要求はキャッシュから即答する。ホスト側はキャッシュを持たない（[3.4](#34-メッセージプロトコル9種類)参照）。
4. 解決待ちは `.image-loading`、失敗は `.image-error`（破線枠）で視覚的に示す。

### 10.2 保存（画像 D&D）

ブロック上またはエディタ余白への画像ファイルドロップに対応する（対応拡張子: `png/jpe?g/gif/webp/svg/bmp/ico/avif`）。

```
画像ファイルドロップ
    → FileReader で base64 化
    → saveImage メッセージ（name, dataBase64）をホストへ送信
    → ホスト: sanitizeFileName() でファイル名サニタイズ
             → <mdと同階層>/images/ ディレクトリを作成（既存なら無視）
             → uniqueFileName() で重複回避
             → base64 デコードして書き込み
             → imageSaved（relPath, webviewUri, altText）を返送
    → WebView: ![altText](images/xxx.png) をカーソル位置 / ドロップ位置に挿入
```

この設計により、拡張機能は**開いている .md ファイル1つだけでなく、その親ディレクトリ配下にも書き込みを行う**。README/SECURITY.md 等で「ファイルシステムアクセスは開いているドキュメント1ファイルのみ」と記載していた場合は誤りであり、実態は画像保存用の `images/` ディレクトリ作成・書き込みと、PDF出力用の一時ディレクトリ書き込み（[11章](#11-pdf出力設計)）の少なくとも2つの追加書き込み経路がある。

---

## 11. PDF出力設計

### 11.1 方式選定

VS Code の Extension Host（Node.js）には PDF 生成ライブラリを同梱していない。Puppeteer 等のヘッドレスブラウザ埋め込みはバイナリサイズと保守コストが大きいため、**「レンダリング済みDOMをそのまま単体HTMLとして書き出し、OS既定ブラウザの印刷ダイアログ（Save as PDF）に委ねる」**方式を採用した。

### 11.2 処理フロー

```
1. WebView が現在表示中のレンダリング済み DOM（innerHTML）を exportPdf メッセージで送信
2. ホスト: 未保存（パスなし）ドキュメントはエラーメッセージを表示して中断
3. <img src> の相対パスを md の階層基準で絶対 file:// URI に書き換え
   （data: / blob: / http(s): / file: / vscode-* / # はそのまま）
4. katex.min.css と editor.css を file:// 参照するライトモード固定の単体 HTML を生成
   - VS Code テーマ変数のフォールバックをライトモード用の値で上書き（暗い印刷を防止）
   - @media print ルールでエクスポート案内バナーを非表示化
   - Mermaid SVG・画像・テーブルが印刷時にはみ出さないようスタイル調整
5. os.tmpdir() に mdve-pdf-<timestamp>-<name>.html として書き出す
6. OS 既定ブラウザで開く
   - win32: cmd /c start　/ darwin: open / linux: xdg-open
   - 失敗時は vscode.env.openExternal(file://...) にフォールバック
7. window の load イベントから 600ms 後に window.print() を自動実行
   （KaTeX フォント・画像の読み込み猶予のためのディレイ）
```

### 11.3 設計上のトレードオフ

- **利点**: 追加バイナリ依存なし、OSネイティブの印刷ダイアログでページサイズ・余白・ヘッダーフッターをユーザーが調整できる。
- **欠点**: 実際のPDF生成はユーザーの「PDFとして保存」操作に依存し、拡張機能側で完全に自動化できない。保存先ディレクトリもユーザーが手動指定する必要があるため、生成された案内バナーで「md と同じディレクトリに保存してください」と明示している。
- 一時 HTML ファイルは `os.tmpdir()` に残置される（拡張機能側でクリーンアップしない）。OS の一時ファイル管理に委ねる設計。
- PDF出力時は一時的に Mermaid を `default` テーマへ切り替えて出力し、完了後に元のテーマへ復帰する（ダークテーマのまま印刷すると背景が黒くなるため）。

---

## 12. スタイル設計（editor.css）

### 12.1 CSS 設計方針

- VS Code テーマ変数（`--vscode-*`）を活用しテーマ追従
- BEM 風の命名規則（ただし厳密な BEM ではない）
- WebView はシャドウ DOM ではないため、グローバルスコープ
- `body.printing` / `@media print` で PDF出力用HTML・通常表示の両方に対応するスタイルを共存させる

### 12.2 主要セレクタ構成

```
.toolbar                     # 上部ツールバー（sticky）
.toolbar .btn-group          # ボタングループ
#find-bar                    # 検索/置換バー

.block                       # Markdown ブロック（= トークン範囲、5.2参照）
.block:hover                 # ホバー時の枠線表示
.block.editing               # 編集中ブロック
.block.block-changed         # 変更ハイライト（v0.5.0）
.block textarea              # 編集テキストエリア

.mermaid-edit-overlay        # Mermaid 編集ボタンオーバーレイ
.table-edit-overlay          # テーブル編集ボタンオーバーレイ
.math-display / .math-error / .math-fallback  # 数式表示・エラー・フォールバック

.diagram-visual-editor       # ダイアグラムエディタ共通コンテナ
.diagram-ve-toolbar          # エディタツールバー
.diagram-ve-split            # 左右分割コンテナ
.diagram-ve-list             # 左パネル
.diagram-ve-preview          # 右パネル（プレビュー）
.diagram-ve-actions          # 保存/キャンセルバー
.diagram-zoom-controls       # DiagramZoom 共通ズームUI（8章）

.mindmap-tree / .mindmap-node
.quadrant-config-panel / .quadrant-field-row
.gantt-config-panel / .gantt-section-header
.color-picker-bar / .subgraph-list

.image-loading / .image-error  # 画像解決の状態表示（10章）
.search-highlight / .svg-search-highlight  # 検索ハイライト（HTML/SVG）
```

### 12.3 レスポンシブ設計

- 左右分割は `display: flex` で実装
- 左パネル `flex: 1`、右パネル `flex: 1`
- 最小幅の制約なし（WebView パネルサイズに依存）

---

## 13. ビルドパイプライン設計

### 13.1 ビルドフロー

```
esbuild.mjs 実行時
    ↓ 1) copyVendorAssets()
node_modules/marked, mermaid, katex から min.js / min.css / フォントを
media/vendor/ へコピー（.ttf は容量削減のため除外）
    ↓ 2) esbuild バンドル
src/extension.ts (TypeScript)
    ↓ esbuild (bundle:true, format:'cjs', platform:'node', external:['vscode'])
dist/extension.js
```

`media/*.js`, `media/*.css`, `media/vendor/*` はトランスパイルせずそのまま VSIX パッケージに含まれる。

### 13.2 esbuild 設定（要旨）

```javascript
// esbuild.mjs
await copyVendorAssets();  // vendor コピーは毎回のビルドで実行

const ctx = await esbuild.context({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  outfile: 'dist/extension.js',
  external: ['vscode'],
  minify: production,
  sourcemap: !production,
});
```

**設計判断:** `media/` 配下の JS ファイルは esbuild でバンドルしない。WebView は Chromium 上のブラウザ環境で Node.js モジュールシステムが使えないため。この方針は v0.4.1 から変更していない。

### 13.3 vendor アセットのコピー方式への変更（重要な設計変更）

旧設計（〜v0.4.x のある時点まで）では、marked / mermaid を `node_modules/` から WebView が直接 `<script src="...node_modules/marked/...">` として読み込み、VSIX にも `node_modules/marked/` `node_modules/mermaid/` をそのまま含める方式だった。**現在の実装はこの方式を採っていない。**

現行方式:

- `esbuild.mjs` の `copyVendorAssets()` が、ビルドのたびに `node_modules/{marked,mermaid,katex}` から必要なファイル（`marked.min.js` / `mermaid/dist/mermaid.min.js` / `katex/dist/katex.min.js` / `katex/dist/katex.min.css` / KaTeX フォント一式）を `media/vendor/` にコピーする。
- WebView は常に `media/vendor/` 配下のファイルを読み込む（`markdownVisualEditorProvider.ts` の `getHtmlForWebview()` 参照）。
- `.vscodeignore` は `node_modules/**` を**全面的に除外**する。VSIX には `node_modules` が一切含まれない。
- パッケージングコマンドは `vsce package --no-dependencies --no-yarn`（`package.json` の `scripts.package`）で、依存関係の同梱チェックを vsce に行わせない。

理由: `node_modules` 丸ごとを VSIX に含めると不要なファイル（型定義・テスト・ソースマップ等）まで同梱されてパッケージサイズが肥大化し、`vsce` の依存関係解析（後述のNode.jsバージョン問題の原因）にも巻き込まれる。必要なファイルだけを明示的にコピーする方式にすることで、両方の問題を同時に解消した。詳細な経緯は [19章 ADR-013](#adr-013-vendor-アセットをビルド時コピー方式に変更しvsce-を-3x-へ移行) を参照。

### 13.4 VSIX パッケージング

```
npm run compile   # esbuild.mjs（vendorコピー + TSビルド）
vsce package --no-dependencies --no-yarn
    ↓
.vscodeignore に基づいてファイル選別（node_modules・src・docs等を除外）
    ↓
md-visual-editor-{version}.vsix (ZIP 形式)
```

---

## 14. 依存パッケージ管理方針

### 14.1 原則

1. **ランタイム依存は最小限**（marked, mermaid, katex の3つ）だが、**VSIX には `node_modules` 経由ではなくビルド時コピーで同梱**する（13.3参照）
2. **開発依存は固定的に管理**（`package-lock.json` でロック）
3. `package.json` の `overrides` は現在空（後述の通り不要になった）

### 14.2 vsce のバージョンと Node.js 互換性（v0.4.1 時点から状況が変化）

v0.4.1 時点のドキュメントでは「`@vscode/vsce` 3.x は推移的依存 `lru-cache` 11.x が `node:diagnostics_channel` の `tracingChannel()`（Node 20+ 限定API）を要求するため使用不可。2.x に固定し、`overrides` で `lru-cache` を `~10.4.3` に固定して Node 18.x でのビルドを維持する」としていた。

**現在の `package.json` はこの方針を採っていない。**

```json
{
  "devDependencies": {
    "@vscode/vsce": "^3.2.1"
  },
  "overrides": {}
}
```

- `@vscode/vsce` は **3.2.1系（3.x）を使用**しており、2.x への固定は行っていない。
- `overrides` は空オブジェクトで、`lru-cache` の固定は行っていない。
- `node_modules/@vscode/vsce/package.json` の `engines.node` は `>= 20` であり、**ビルド環境（VSIXパッケージング時）は Node.js 20 以上が必須**になっている。
- ADR-003 / ADR-004（旧バージョンの vsce 2.x 固定・lru-cache 固定の決定）は**この時点で覆っている**。判断が変わった正式な記録（CHANGELOGへの記載）は見当たらないため、[19章 ADR-013](#adr-013-vendor-アセットをビルド時コピー方式に変更しvsce-を-3x-へ移行) として本書に改めて記録する。

### 14.3 `npm run watch` とファイルロック

`npm run watch` は esbuild のウォッチモードを起動し、`node_modules/.esbuild/` 内のバイナリ（`esbuild.exe`）がプロセスとして常駐する。このプロセスが `node_modules/` 内のファイルをロックするため、watch 実行中は `node_modules` の削除が失敗する（Windows 固有）。

**運用ルール:** `node_modules` の削除・再インストール前に watch ターミナルを停止すること。この制約は v0.4.1 から変わっていない。

---

## 15. セキュリティアーキテクチャ

### 15.1 多層防御モデル

```
Layer 6: WebView サンドボックス（Chromium iframe 分離）
Layer 5: CSP（Content Security Policy） — 15.2 参照
Layer 4: Mermaid securityLevel: 'loose' + DOMPurify 内部サニタイズ
Layer 3: KaTeX trust:false（危険なLaTeXコマンドを無効化）
Layer 2: HTMLサニタイズ（sanitizeHtml, escapeHtml — denylist方式、DOMPurifyのようなallowlistではない）
Layer 1: メッセージ型制限（9種類のみを switch で明示的に処理、それ以外は無視）
```

### 15.2 CSP（実測値）

```
default-src 'none';
img-src ${cspSource} data: blob: https:;
style-src ${cspSource} 'unsafe-inline';
script-src 'nonce-${nonce}' 'unsafe-eval';
font-src ${cspSource};
worker-src ${cspSource} blob:;
connect-src ${cspSource};
```

旧ドキュメントは「`script-src` 以外はすべて `'none'`」としていたが誤りで、実際は上記の通り `img-src` に `https:` を含む。これは Markdown 本文に外部URLの画像（`![alt](https://example.com/x.png)`）を書いた場合に読み込めるようにするためだが、副作用として**「拡張機能は一切ネットワーク通信を行わない」とは言い切れない**（拡張機能自体が能動的に通信するコードは持たないが、ユーザーが外部URL画像をMarkdownに書けば、WebViewがその画像を取得しにいく）。この点は README/SECURITY.md でも正確に記載する必要がある。

### 15.3 信頼境界

```
┌─────────────────────────────────────────────┐
│ 信頼済み                                     │
│ ・extension.ts / markdownVisualEditorProvider.ts │
│ ・WebView 内の自作スクリプト（nonce 付き）      │
│ ・marked.min.js / mermaid.min.js / katex.min.js（nonce 付き、vendor同梱） │
└────────────────────┬────────────────────────┘
                     │ postMessage（9種類のメッセージ型のみ）
┌────────────────────▼────────────────────────┐
│ 非信頼（ユーザー入力）                         │
│ ・Markdown ファイルの内容                     │
│ ・Mermaid ダイアグラム / LaTeX 数式の定義テキスト │
│ ・D&D される画像ファイル                      │
│ → sanitizeHtml() / escapeHtml() / katex trust:false で無害化 │
└─────────────────────────────────────────────┘
```

### 15.4 データフロー上の防御ポイント

```
Markdown テキスト
    → marked.lexer() / marked.parser()  [HTMLに変換: <script>等がそのまま含まれうる]
    → sanitizeHtml()         [★ 防御ポイント1: 危険タグ・属性除去（denylist）]
    → innerHTML に代入

Mermaid テキスト
    → mermaid.render()       [★ 防御ポイント2: securityLevel:'loose' + DOMPurify]
    → SVG を innerHTML に代入

数式テキスト（$...$ / ```math）
    → katex.renderToString({trust:false, throwOnError:false})  [★ 防御ポイント3]
    → renderMathInDom() の TreeWalker が CODE/PRE/SCRIPT/STYLE/A/TEXTAREA をスキップ

ユーザー入力（テキストエリア）
    → raw 文字列としてトークンに保持
    → postMessage('edit') でホストに送信 → WorkspaceEdit.replace() でファイル書き込み
    [★ 防御ポイント4: eval() や動的コード実行に渡さない]

画像ファイル（D&D）
    → base64 化して postMessage('saveImage')
    → ホスト側で sanitizeFileName() [★ 防御ポイント5: パストラバーサル対策]
    → images/ ディレクトリへの書き込みに限定
```

詳細は [SECURITY.md](SECURITY.md) を参照。

---

## 16. 状態管理設計

### 16.1 グローバル状態（editor.js）

| 変数 | 型 | 初期値 | 用途 |
|---|---|---|---|
| `allTokens` | `Array` | `[]` | 全 Marked トークン |
| `editingBlockIndex` | `number` | `-1` | 編集中ブロック（-1=なし） |
| `_editingRange` | `{start,end}\|null` | `null` | 編集中のトークン範囲（テキストセクション編集時） |
| `baselineText` | `string\|null` | `null` | 変更ハイライトの基準テキスト（v0.5.0） |
| `mermaidCounter` | `number` | `0` | Mermaid ID 生成用カウンタ |
| `activeVisualEditor` | `Object\|null` | `null` | アクティブなビジュアルエディタ |
| `activeTableEditor` | `Object\|null` | `null` | アクティブなテーブルエディタ |
| `_imageUriCache` | `Map` | `new Map()` | 画像解決結果のキャッシュ（v0.4.3） |
| `_imageRequestSeq` / `_imageSaveSeq` | `number` | `0` | resolveImage / saveImage のリクエストID採番 |
| `_forcedTheme` | `string` | `'auto'` | auto/light/dark 強制テーマ（v0.3.1） |
| `_selectionAnchor` | `number\|null` | `null` | Shift+Click 範囲選択の起点 |
| `_draggingSourceIndex` | `number` | `-1` | D&D 並べ替え中のドラッグ元インデックス |
| `_svgOriginalCache` | `WeakMap` | `new WeakMap()` | 検索ハイライトのためのSVG元テキスト退避 |
| `preventBlurFinish` | `boolean` | `false` | ツールバー操作中の blur 防止 |

### 16.2 アクティブエディタの排他制御

同時に1つのエディタのみアクティブにする方針は v0.4.1 から変更なし。

```
ブロック編集中 (editingBlockIndex >= 0)
    → ビジュアルエディタ起動不可（先にfinishEditing()）

ビジュアルエディタ起動時
    → 既存エディタがあれば destroyVisualEditor()

テーブルエディタ起動時
    → 既存テーブルエディタがあれば destroyVisualEditor()
```

### 16.3 各エディタの内部状態

各ダイアグラムエディタは `this` でインスタンス内に状態を保持。グローバル変数への依存を避け、複数エディタの切り替えに対応する。

---

## 17. エラーハンドリング設計

### 17.1 Mermaid レンダリングエラー

```javascript
try {
    const { svg } = await mermaid.render(id, code);
    container.innerHTML = svg;
} catch (e) {
    container.innerHTML = `<div class="mermaid-error">
        レンダリングエラー: ${escapeHtml(e.message)}
    </div>`;
}
```

- エラーメッセージは `escapeHtml()` でエスケープしてから表示
- ユーザーはコードエディタで構文を修正可能

### 17.2 KaTeX レンダリングエラー

`katex.renderToString(..., {throwOnError:false})` により例外化させず、KaTeX自身が生成するエラーHTMLをそのまま `.math-error` としてラップして表示する（[9.3](#93-レンダリング設定とエラーハンドリング)参照）。KaTeX未ロード時は `.math-fallback` でソースを平文表示する。

### 17.3 パースエラー（ダイアグラムエディタ）

各ダイアグラムエディタの `parseCode()` は不正な構文に対して:
- パースできない行はスキップ
- デフォルト値でデータモデルを構築
- 致命的エラーの場合は空のエディタを表示

### 17.4 ファイル操作エラー

| 操作 | エラー時の挙動 |
|---|---|
| 本文保存（`WorkspaceEdit.applyEdit`） | VS Code のデフォルトエラーハンドリングに委任 |
| 画像保存（`saveImage`） | `showWarningMessage` で通知 + `imageSaved{ok:false, error}` を返送 |
| 画像解決（`resolveImage`） | `imageResolved{uri:'', error}` を返送し、WebView側は `.image-error` 表示 |
| PDF出力（未保存ドキュメント） | `showErrorMessage` で中断（一時ファイルは作成しない） |
| PDF出力（ブラウザ起動失敗） | `showWarningMessage` で一時HTMLのパスを提示し手動オープンを促す |

---

## 18. 拡張性設計

### 18.1 新しいダイアグラムエディタの追加手順

専用エディタとして追加する場合:

1. **diagram-editors.js** に新しいエディタクラスを追加（`parseCode` / `generateCode` / `updatePreview` を実装、`DiagramZoom.attach()` を呼ぶ）
2. **検出ヘルパーを追加**して `window.DiagramEditorUtils` に登録
3. **window にエクスポート**
4. **editor.js の `startMermaidEditing()` ルーティングに分岐を追加**
5. **editor.css** に必要なスタイルを追加
6. **test-all-features.md** にサンプルを追加

汎用フォームエディタとして追加する場合（セクション別リスト編集で十分な図種）は、`extra-diagram-editors.js` に `GenericFormDiagramEditor` のサブクラスとしてセクション定義のみを記述すればよく、手順3〜4を `window.ExtraDiagramUtils` 経由の登録に置き換えるだけで済む（[19章 ADR-007](#adr-007-その他-mermaid-14-種を汎用フォームエディタで実装v030)参照）。

### 18.2 設計上の制約

- WebView 内のスクリプトはモジュールシステムを使わない（CSP 制約）
- `window` オブジェクト経由でクラスを共有する必要がある
- 新しいスクリプトファイルを追加する場合は `markdownVisualEditorProvider.ts` の `getHtmlForWebview()` に `<script>` タグを追加する必要がある
- ブロックモデル（5.2章）は `_isSpecialTokenType()` が `table` / `code` のみを特殊扱いする前提で設計されている。marked の新しいトークン種別（例: 将来の拡張構文）を独立ブロックとして扱いたい場合は、この判定関数の拡張と `computeBlockRanges()` の見直しが必要になる

---

## 19. 設計判断の記録（ADR）

### ADR-001: WebView スクリプトを esbuild でバンドルしない

- **決定:** `media/*.js` は esbuild のバンドル対象外とし、`<script src>` でブラウザ直接ロードする
- **理由:** WebView は Chromium 上のブラウザ環境であり、Node.js モジュールシステムが使えない。esbuild でバンドルすると `require()` が残り動作しない
- **影響:** ファイル間の依存は `window` グローバルで管理する必要がある

### ADR-002: Markdownパーサーにmarkedのlexerモードを使用

- **決定:** `marked.lexer()` でトークン分割し、トークンの `raw` プロパティで元テキストを保持
- **理由:** ブロック単位の編集では、変更していないブロックの原文を保持する必要がある。`marked.parse()` を使うと原文が失われる
- **影響:** 対応する Markdown 要素は marked のトークン種別に依存する。v0.5.4 のブロック範囲モデル（ADR-015）もこのトークン保持方針の上に構築されている

### ADR-003（廃止・v0.5.x時点で覆っている）: @vscode/vsce を 2.x に固定

- **当初の決定（〜v0.4.1）:** `@vscode/vsce` を `^2.22.0` に固定（3.x は不使用）
- **当初の理由:** vsce 3.x の推移的依存 `lru-cache` 11.x が `diagnostics_channel.tracingChannel()` を使用し、Node.js 20+ を要求する。ビルド環境が Node 18.x のため互換性が失われる
- **現状:** `package.json` は `@vscode/vsce: ^3.2.1` を使用しており、この決定は**覆っている**。詳細は ADR-013 を参照
- **日付:** 2026-04-10（決定） / 2026-07-19時点で無効化を確認・記録

### ADR-004（廃止・v0.5.x時点で覆っている）: lru-cache を overrides で 10.4.3 に固定

- **当初の決定:** `package.json` の `overrides` で `lru-cache` を `~10.4.3` に固定
- **現状:** `package.json` の `overrides` は空オブジェクト。この固定は行われていない。詳細は ADR-013 を参照
- **日付:** 2026-04-10（決定） / 2026-07-19時点で無効化を確認・記録

### ADR-005: ダイアグラムエディタの共通パターン

- **決定:** クラス図・シーケンス図・マインドマップ・象限チャート・ガントチャート・ER図とテーブルのエディタを同一ファイル（diagram-editors.js）に配置し、`startGenericDiagramEditing()` で統一起動
- **理由:** 各エディタは「パース → フォーム構築 → プレビュー → コード生成」の同一パターンに従う。ファイル分割すると `<script>` タグ追加が必要になり、Provider の変更が頻繁に発生する
- **影響:** diagram-editors.js が ~4298 行と大きいが、各クラスは独立しており保守性は維持。共通ズーム基盤 `DiagramZoom` もこのファイルに同居する

### ADR-006: npm run watch 時のファイルロック問題

- **決定:** ドキュメントに「watch 停止後に node_modules 削除」の手順を明記
- **理由:** esbuild のウォッチモードが `node_modules/.esbuild/esbuild.exe` をロックし、`node_modules` フォルダの削除が `EBUSY` で失敗する。Windows 固有の問題
- **日付:** 2026-04-10
- **代替案:** `npm run watch` を使わず毎回 `npm run compile` する方式は開発効率が低下するため不採用

### ADR-007: その他 Mermaid 14 種を汎用フォームエディタで実装（v0.3.0）

- **決定:** 状態遷移／パイ／ジャーニー／Git／タイムライン／要求／C4／Sankey／XY／ブロック／ZenUML／パケット／アーキテクチャ／Kanban の 14 種は、`media/extra-diagram-editors.js` に共通基底クラス `GenericFormDiagramEditor` を置き、サブクラスでセクション定義のみを記述する形で実装する
- **理由:** Mermaid 構文は図種ごとに大きく異なる一方、UI は「セクション別リスト編集 + ライブ SVG プレビュー + コードモード切替」で共通化できる。1 ファイルあたり数十行の差分で図種を追加できる
- **日付:** 2026-04-26
- **影響:** 21 種すべてが GUI 編集対応となる想定だったが、zenuml はバンドル未同梱のため実際にはコード編集のみに留まり、挿入ピッカーからも除外されている（20種がGUI編集対応）。コード+プレビュー分割エディタは「判定不能な構文（および zenuml）」のフォールバック専用

### ADR-008: フローチャートのレイアウト切替を init ディレクティブで永続化（v0.3.1）

- **決定:** `FlowchartModel.layout` を導入し、`dagre` 以外を選んだ場合は Mermaid コード冒頭に `%%{init:{"layout":"..."}}%%` を出力する。パーサーも同ディレクティブを読み取って `layout` を復元する
- **理由:** Mermaid は ELK レイアウトを `init` ディレクティブで指定する。SVG 上の見た目はノードと同列の重要属性のため、モデル側の独立フィールドとして管理するのが自然
- **日付:** 2026-04-27

### ADR-009: サブグラフの入れ子化（v0.3.1）

- **決定:** `Subgraph` に `parentSgId` を追加し、`emitSg(sg, depth)` で再帰的に Mermaid コードを生成する。`setSubgraphParent()` は祖先チェーンを辿ってサイクルを検出し拒否する
- **理由:** Mermaid のサブグラフは入れ子可能だが、UI でフラットな一覧として扱うとサイクル設定が容易に発生する。明示的な祖先走査でモデル整合性を担保する
- **日付:** 2026-04-27

### ADR-010（一部改訂・v0.3.1決定→現状は無条件クリック）: リンクを開く操作

- **当初の決定（v0.3.1）:** WebView 上のリンクの通常クリックは抑止し、`Ctrl/Cmd + Click` のみホストへ `openLink` メッセージを送る
- **現状:** 実装は修飾キーの有無に関わらず、リンククリックを常に `preventDefault()` した上で無条件に `openLink` を送信する（`editor.js` のクリックハンドラ参照）。`Ctrl+Click` 限定の判定は行われていない
- **ホスト側の振り分けは変更なし:** `http(s):` / `mailto:` は `env.openExternal`、それ以外（相対パス含む、mdの階層基準で解決）は `commands.executeCommand('vscode.open', uri)`。`#` のみのアンカーは無視
- **日付:** 2026-04-27（当初決定） / 2026-07-19時点で挙動の相違を確認・記録
- **今後の方針:** 「常にクリックで開く」という現状の挙動を意図的な仕様とするか、`Ctrl+Click` 限定に戻すかは未決定。README等のユーザー向けドキュメントは実装（無条件クリック）に合わせて修正する

### ADR-011: テーマ強制切替を CSS クラスと Mermaid 再初期化で実装（v0.3.1）

- **決定:** ツールバーの ☀️/🌙 ボタンで `_forcedTheme` を `auto` → `light` → `dark` と循環させ、`body.force-theme-light` / `body.force-theme-dark` クラスで CSS 変数を上書きする。Mermaid は `mermaid.initialize({ theme })` を呼び直して再描画する
- **理由:** VS Code のテーマに常に追従する場合、ダークテーマでスクリーンショットを共有したいときなどに不便。WebView 内で完結する形で UI トグルを提供する
- **日付:** 2026-04-27
- **補足（v0.5.x）:** PDF出力時（11章）もこの仕組みを流用し、一時的に `default` テーマへ切り替えてから出力する

### ADR-012: フローチャート初期描画の倍率自動調整は条件付き（v0.3.1）

- **決定:** SVG が描画領域より 16px 以上大きい場合のみ自動フィットし、収まる場合はズーム 1.0 を維持する
- **理由:** 旧実装では小さな図でも勝手に拡大され、ユーザーから「勝手に倍率が変わる」と苦情があった。表示領域に収まるなら原寸で表示するのが自然
- **日付:** 2026-04-27
- **補足（v0.5.5）:** 本文プレビュー用のズーム系統C（`PreviewMermaidZoom`、8章）も同じ考え方を踏襲している

### ADR-013: vendor アセットをビルド時コピー方式に変更し、vsce を 3.x へ移行

- **決定:** `esbuild.mjs` に `copyVendorAssets()` を追加し、`node_modules/{marked,mermaid,katex}` の必要ファイルをビルドのたびに `media/vendor/` へコピーする。`.vscodeignore` で `node_modules/**` を全面除外し、`vsce package --no-dependencies --no-yarn` でパッケージングする。`@vscode/vsce` は 3.2.1 系を使用し、`overrides` によるバージョン固定は撤廃した
- **理由:** `node_modules` を丸ごと VSIX に含める旧方式は、パッケージサイズの肥大化と、vsce の依存解析（`lru-cache` の Node バージョン要求）に巻き込まれる問題の両方を抱えていた。必要なファイルだけを明示コピーする方式にすれば、vsce のバージョンに関わらず配布物の内容を自分たちで完全に制御できる
- **影響:** ビルド環境（VSIXパッケージング時）は `@vscode/vsce@3.x` の要求により **Node.js 20 以上が必須**になった（旧ドキュメントの「Node 18.x 以上」という記載は古い）。ADR-003 / ADR-004 は本ADRにより無効化される
- **日付:** 記録日 2026-07-19（変更自体がいつ行われたか示す CHANGELOG エントリは見当たらず、正確な導入日は不明）
- **見直し条件:** vsce のバージョン要求が再び変わった場合、または `node_modules` を含める必要が生じた場合

### ADR-014: 数式レンダリングに KaTeX を採用し、フォントごと同梱

- **決定:** LaTeX 数式のレンダリングに KaTeX 0.17.x を採用し、`media/vendor/` に `katex.min.js` / `katex.min.css` / Webフォント（`.ttf`を除く）を同梱する。フェンス `` ```math `` はブロックモデル上「特殊トークン（`code`）」として扱い独立ブロック化し、インライン `$...$` は描画後 DOM への `TreeWalker` 後処理で対応する
- **理由:** KaTeX は MathJax と比べてレンダリングが高速でバンドルサイズも小さく、WebView のようなリソース制約下での埋め込みに適する。marked がインライン数式構文を持たないため、後処理方式以外の統合手段がなかった
- **影響:** WebView 読み込みスクリプトが `marked → mermaid → katex → mermaid-visual-editor.js → ...` の順に増え、CSSも `katex.min.css → editor.css` の順になった。`trust:false` により一部の高度なLaTeXコマンド（`\includegraphics`等）は使用不可
- **日付:** 記録日 2026-07-19（機能自体はCHANGELOG上 v0.4.3〜v0.4.4 の画像修正・README改訂時期に導入されたと推測されるが、KaTeX統合自体の変更点を記した専用エントリはない）

### ADR-015: テキストブロックを H1/H2 セクション単位のトークン範囲に変更（v0.5.4）

- **決定:** `computeBlockRanges()` を新設し、「1トークン=1ブロック」から「1レンジ（トークンの連続範囲）=1ブロック」へブロックモデルを変更する。table / code（Mermaid・数式含む）は従来どおり単独ブロック、それ以外のテキスト系トークンは H1/H2 見出し単位でセクション化する。DOM 上は `data-token-index` / `data-token-end` の2属性でレンジを表現する
- **理由:** 文章量の多い文書では「1トークン=1ブロック」だとブロック数が肥大化し、選択・移動・D&D 並べ替えの操作コストが上がる。H1/H2という見出し階層の区切りは文書の論理構造と一致するため、ユーザーの心的モデルに近いブロック単位になる
- **影響:** ブロック選択・編集・削除・D&D並べ替え・変更ハイライト（v0.5.0機能）が軒並みレンジ単位に書き換わった。導入直後の v0.5.4 には「特殊ブロック直後の空行でレンジ長が2になり生コード表示になる」というリグレッションがあり、v0.5.6 で修正された（5.2.3参照）
- **日付:** 2026-07-16（機能導入） / 2026-07-17（v0.5.6でのバグ修正）
- **今後の課題:** H3〜H6見出しはセクションを区切らない仕様のため、長いH2セクション配下に多数のH3が並ぶ文書では、依然として1ブロックが大きくなりすぎる可能性がある。H3までセクション区切りに含めるかどうかは未検討

### ADR-016: ズーム/パンを3系統に分けて実装した理由

- **決定:** Mermaid図のズーム/パンを、(A) 編集モード20種共通の `DiagramZoom`、(B) フローチャート編集モード専用の独自実装、(C) 本文プレビュー用の `PreviewMermaidZoom` という3つの独立した実装として提供する。統一されたズーム/パンコンポーネントへのリファクタリングは行わない
- **理由:** 各系統は対象・要求が異なる。(A)は単一コンテナ内の編集エディタが前提で仕様を統一しやすかった。(B)はSVG上でのノード直接操作（クリック・ドラッグでの接続作成等）と操作イベントが競合しやすく、パン機能の追加を見送った。(C)は本文中に種別を問わず複数個存在しうるプレビュー画像が対象で、個々に独立したズーム状態を持たせる必要があり、(A)のようなシングルトン的な実装をそのまま使えなかった
- **影響:** フローチャートのみパン非対応という、ユーザーから見て説明のつきにくい非対称な挙動が残っている
- **日付:** 2026-07-16（v0.5.5導入時点の設計として記録。統一しない判断は明文化されたものではなく、実装状況からの推測を含む）
- **見直し条件:** フローチャートエディタのSVGインタラクションとパン操作のイベント競合を解消できれば、(A)への統合を検討する

---

*最終更新: 2026年7月21日（v1.0.0 対応）*

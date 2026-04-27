# Markdown Visual Editor — 設計書

| 項目 | 内容 |
|---|---|
| ドキュメントバージョン | 3.1 |
| 対象拡張機能 | Markdown Visual Editor v0.4.1 |
| 作成日 | 2026-04-10 |
| 最終更新日 | 2026-04-27 |
| 対象読者 | 開発者・保守担当者 |

---

## 目次

1. [システム全体構成](#1-システム全体構成)
2. [プロジェクト構成](#2-プロジェクト構成)
3. [ホストプロセス設計](#3-ホストプロセス設計)
4. [WebView設計](#4-webview設計)
5. [WYSIWYG エディタ設計（editor.js）](#5-wysiwyg-エディタ設計editorjs)
6. [フローチャートエディタ設計（mermaid-visual-editor.js）](#6-フローチャートエディタ設計mermaid-visual-editorjs)
7. [ダイアグラムエディタ群設計（diagram-editors.js）](#7-ダイアグラムエディタ群設計diagram-editorsjs)
8. [スタイル設計（editor.css）](#8-スタイル設計editorcss)
9. [ビルドパイプライン設計](#9-ビルドパイプライン設計)
10. [依存パッケージ管理方針](#10-依存パッケージ管理方針)
11. [セキュリティアーキテクチャ](#11-セキュリティアーキテクチャ)
12. [状態管理設計](#12-状態管理設計)
13. [エラーハンドリング設計](#13-エラーハンドリング設計)
14. [拡張性設計](#14-拡張性設計)
15. [設計判断の記録（ADR）](#15-設計判断の記録adr)

---

## 1. システム全体構成

### 1.1 アーキテクチャ概要

```
┌─────────────────────────────────────────────────────────────┐
│  VS Code メインプロセス (Electron / Node.js)                   │
│                                                             │
│  ┌─────────────────────────────────────┐                    │
│  │  Extension Host (Node.js)           │                    │
│  │                                     │                    │
│  │  extension.ts                       │                    │
│  │   └→ activate()                     │                    │
│  │       └→ registerCustomEditorProvider│                    │
│  │                                     │                    │
│  │  markdownVisualEditorProvider.ts     │                    │
│  │   ├→ resolveCustomTextEditor()      │                    │
│  │   │   ├→ getHtmlForWebview()        │                    │
│  │   │   ├→ updateWebview()            │                    │
│  │   │   └→ onDidReceiveMessage()      │                    │
│  │   └→ getHtmlForWebview()            │                    │
│  │       ├→ CSP ヘッダー生成           │                    │
│  │       ├→ nonce 生成                 │                    │
│  │       └→ <script> タグ生成          │                    │
│  └──────────────┬──────────────────────┘                    │
│                 │ postMessage                                │
│  ┌──────────────▼──────────────────────┐                    │
│  │  WebView (Chromium Sandbox)          │                    │
│  │                                     │                    │
│  │  ┌─────────────────────────────┐    │                    │
│  │  │ editor.js (メインコントローラ) │    │                    │
│  │  │  ├→ renderBlocks()          │    │                    │
│  │  │  ├→ startEditing()          │    │                    │
│  │  │  ├→ startMermaidEditing()   │    │  External Libraries │
│  │  │  ├→ startTableEditing()     │    │  ┌──────────────┐  │
│  │  │  └→ sanitizeHtml()          │    │  │ marked.js    │  │
│  │  └──────────┬──────────────────┘    │  │ mermaid.js   │  │
│  │             │                       │  └──────────────┘  │
│  │  ┌──────────▼──────────────────┐    │                    │
│  │  │ mermaid-visual-editor.js    │    │                    │
│  │  │  └→ FlowchartModel         │    │                    │
│  │  └─────────────────────────────┘    │                    │
│  │                                     │                    │
│  │  ┌─────────────────────────────┐    │                    │
│  │  │ diagram-editors.js          │    │                    │
│  │  │  ├→ ClassDiagramEditor      │    │                    │
│  │  │  ├→ SequenceDiagramEditor   │    │                    │
│  │  │  ├→ TableVisualEditor       │    │                    │
│  │  │  ├→ MindmapEditor          │    │                    │
│  │  │  ├→ QuadrantChartEditor     │    │                    │
│  │  │  ├→ GanttChartEditor        │    │                    │
│  │  │  └→ ERDiagramEditor         │    │                    │
│  │  └─────────────────────────────┘    │                    │
│  │                                     │                    │
│  │  editor.css                         │                    │
│  └─────────────────────────────────────┘                    │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 プロセスモデル

| プロセス | 実行環境 | 役割 |
|---|---|---|
| Extension Host | Node.js (VS Code) | ファイル読み書き、WebView 管理 |
| WebView | Chromium Sandbox (iframe) | UI レンダリング、ユーザー操作処理 |

### 1.3 通信方式

ホスト ↔ WebView 間は `postMessage` による非同期メッセージングのみ。直接関数呼び出しは不可（プロセス分離）。

---

## 2. プロジェクト構成

### 2.1 ディレクトリ構造

```
markdown-visual-editor/
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
│   └── USAGE-GUIDE.md       # 起動・開発者向けガイド
├── dist/
│   └── extension.js         # ビルド出力（TypeScript → JS）
├── media/
│   ├── editor.js            # WebView メインスクリプト（~870行）
│   ├── editor.css           # WebView スタイルシート（~2230行）
│   ├── mermaid-visual-editor.js  # フローチャートGUI（~1700行）
│   └── diagram-editors.js   # 7種ダイアグラム + テーブルエディタ（~3480行）
├── src/
│   ├── extension.ts         # エントリポイント（9行）
│   └── markdownVisualEditorProvider.ts  # エディタプロバイダ（170行）
├── node_modules/             # 依存パッケージ
├── package.json             # マニフェスト・依存定義
├── package-lock.json        # 依存バージョンロック
├── tsconfig.json            # TypeScript 設定
├── esbuild.mjs              # ビルドスクリプト（20行）
├── .vscodeignore            # VSIX 除外定義
├── .gitignore
├── README.md
├── test-document.md         # テスト用 Markdown
└── sample-document.md       # サンプル Markdown
```

### 2.2 ファイル規模

| ファイル | 行数 | 言語 | 役割 |
|---|---|---|---|
| extension.ts | 9 | TypeScript | エントリポイント |
| markdownVisualEditorProvider.ts | 170 | TypeScript | エディタプロバイダ |
| editor.js | ~870 | JavaScript | WebView メインロジック |
| mermaid-visual-editor.js | ~1700 | JavaScript | フローチャート GUI |
| diagram-editors.js | ~3480 | JavaScript | 7 種ダイアグラム + テーブルエディタ |
| editor.css | ~2230 | CSS | 全 UI スタイル |
| **合計** | **~6290** | | |

---

## 3. ホストプロセス設計

### 3.1 extension.ts

```typescript
// 最小限のエントリポイント
export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        MarkdownVisualEditorProvider.register(context)
    );
}
```

**設計方針:** エントリポイントは登録のみ。ロジックは Provider に集約。

### 3.2 markdownVisualEditorProvider.ts

#### クラス構造

```
MarkdownVisualEditorProvider implements vscode.CustomTextEditorProvider
  ├── static register(context) → Disposable
  ├── resolveCustomTextEditor(document, webviewPanel, token)
  │   ├── WebView HTMLの生成・設定
  │   ├── メッセージリスナー登録
  │   │   ├── 'ready' → updateWebview()
  │   │   └── 'edit' → WorkspaceEdit 実行
  │   └── onDidChangeTextDocument リスナー登録
  ├── getHtmlForWebview(webview) → string
  │   ├── nonce 生成（32文字ランダム英数字）
  │   ├── CSP ヘッダー構築
  │   ├── ライブラリ URI 取得（marked, mermaid, editor, css）
  │   └── HTML テンプレート返却
  └── getNonce() → string
```

#### WebView ライフサイクル

```
1. ユーザーが .md を「Markdown Visual Editor」で開く
2. VS Code が resolveCustomTextEditor() を呼び出し
3. getHtmlForWebview() で HTML 生成 → WebView にセット
4. WebView の JS が 'ready' メッセージを送信
5. ホストが document.getText() をWebView に送信
6. ユーザー操作
7. WebView が 'edit' メッセージ（編集後テキスト）を送信
8. ホストが WorkspaceEdit でドキュメント更新
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
    break;

// ドキュメント変更イベント
vscode.workspace.onDidChangeTextDocument(e => {
    if (e.document.uri.toString() === document.uri.toString() && !isWebviewEdit) {
        updateWebview();  // 外部変更の場合のみ WebView に反映
    }
});
```

### 3.3 WebView HTML 構造

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="...CSP...">
    <link href="${editorCssUri}" rel="stylesheet">
</head>
<body>
    <div class="toolbar">...</div>
    <div id="editor-container"></div>

    <script nonce="${nonce}" src="${markedUri}"></script>
    <script nonce="${nonce}" src="${mermaidUri}"></script>
    <script nonce="${nonce}" src="${mermaidVisualEditorUri}"></script>
    <script nonce="${nonce}" src="${diagramEditorsUri}"></script>
    <script nonce="${nonce}" src="${editorScriptUri}"></script>
</body>
</html>
```

**スクリプトロード順序:**
1. `marked.js` — Markdown パーサー（依存なし）
2. `mermaid.js` — ダイアグラムレンダラ（依存なし）
3. `mermaid-visual-editor.js` — フローチャート GUI（mermaid に依存）
4. `diagram-editors.js` — 他ダイアグラムエディタ（mermaid に依存）
5. `editor.js` — メインコントローラ（上記すべてに依存）

---

## 4. WebView設計

### 4.1 スクリプト間の依存関係

```
marked.js (グローバル: marked)
    ↓ 使用
editor.js (グローバル: なし、即時実行)
    ↓ 参照
mermaid.js (グローバル: mermaid)
    ↓ 使用
mermaid-visual-editor.js (グローバル: window.MermaidVisualEditor)
    ↓ 参照
editor.js
    ↓ 参照
diagram-editors.js (グローバル:
    window.ClassDiagramEditor,
    window.SequenceDiagramEditor,
    window.TableVisualEditor,
    window.MindmapEditor,
    window.QuadrantChartEditor,
    window.GanttChartEditor,
    window.ERDiagramEditor,
    window.DiagramEditorUtils)
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
// ...
window.DiagramEditorUtils = { isClassDiagram, isSequenceDiagram, isERDiagram, ... };
```

**理由:** WebView のスクリプトは CSP の `nonce` 制約下で `<script src>` タグとしてロードされる。ES Modules（`type="module"`）を使わないのは、CSP との相互作用やブラウザ互換性を単純化するため。

---

## 5. WYSIWYG エディタ設計（editor.js）

### 5.1 全体構造

```
editor.js (即時実行)
├── 状態変数
│   ├── allTokens[]           // marked.lexer() の全トークン
│   ├── editingBlockIndex     // 編集中ブロックインデックス (-1 = なし)
│   ├── mermaidCounter        // Mermaid レンダリング一意ID
│   ├── activeVisualEditor    // アクティブなビジュアルエディタインスタンス
│   ├── activeTableEditor     // アクティブなテーブルエディタインスタンス
│   └── preventBlurFinish     // ツールバー操作中のblur防止フラグ
│
├── 初期化
│   ├── mermaid.initialize()
│   ├── vscode API 取得 (acquireVsCodeApi)
│   └── message リスナー登録
│
├── レンダリング
│   ├── renderBlocks(text)           // テキスト全体をブロックに分割描画
│   ├── renderBlockContent(token)    // 個別ブロックのHTML生成
│   ├── sanitizeHtml(html)          // XSS防止サニタイズ
│   ├── escapeHtml(text)            // テキストエスケープ
│   └── escapeHtmlAttr(text)        // 属性値エスケープ
│
├── ブロック編集
│   ├── startEditing(blockIndex)    // 編集モード開始
│   ├── finishEditing()             // 編集モード終了・保存
│   └── ツールバーイベントハンドラ
│
├── Mermaid 編集ルーティング
│   ├── startMermaidEditing(tokenIndex)         // 種別判定 → 振り分け
│   ├── startGenericDiagramEditing(...)         // 汎用エディタ起動
│   └── destroyVisualEditor()                   // エディタ破棄
│
└── テーブル編集
    └── startTableEditing(tokenIndex)           // テーブルGUI起動
```

### 5.2 トークン管理方式

```
Markdown テキスト
    ↓ marked.lexer()
[token, token, space, token, space, token, ...]
    ↓ フィルタリング
allTokens[] = すべてのトークン（space含む）を保持

ブロック表示: space 以外のトークンのみレンダリング
トークン参照: allTokens[] のインデックスで管理

保存時: allTokens[].map(t => t.raw).join('') でテキスト再構成
```

**設計理由:** `space` 型トークン（空行）を保持することで、編集していないブロック間の空白を正確に再現する。

### 5.3 Mermaid ルーティングフロー

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
    └── (その他) → コード+プレビュー分割エディタ
```

### 5.4 汎用ダイアグラムエディタ起動パターン

`startGenericDiagramEditing()` は以下の統一パターンで各エディタを起動する:

```javascript
function startGenericDiagramEditing(tokenIndex, token, blockEl, EditorClass) {
    // 1. コンテナ要素を作成
    const container = document.createElement('div');
    container.className = 'diagram-visual-editor';

    // 2. エディタインスタンスを生成
    const editor = new EditorClass(container, token.text, onSave, onCancel);

    // 3. ブロック要素を差し替え
    blockEl.innerHTML = '';
    blockEl.appendChild(container);

    // 4. 状態を記録
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
├── nodes: Map            // ノード定義
├── edges: Array          // 接続定義
├── subgraphs: Array      // サブグラフ定義
└── styles: Map           // ノードスタイル

MermaidVisualEditor (window.MermaidVisualEditor)
├── constructor(container, code, onSave, onCancel)
├── ツールバー生成
│   ├── ノード形状ボタン群（8種）
│   ├── 接続モードボタン
│   ├── 接続線種ドロップダウン
│   ├── フロー方向ドロップダウン
│   ├── 色変更ボタン
│   ├── グループ化ボタン
│   ├── 削除ボタン
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

---

## 7. ダイアグラムエディタ群設計（diagram-editors.js）

### 7.1 共通設計パターン

7 クラスすべてが以下の共通パターンに従う:

```javascript
class XxxEditor {
    constructor(container, code, onSave, onCancel) {
        // 1. Mermaid コードをパースしてデータモデル構築
        this.parseCode(code);

        // 2. 左パネル（フォーム/ツリー）を構築
        this.buildLeftPanel(container);

        // 3. 右パネル（プレビュー）を構築
        this.buildPreviewPanel(container);

        // 4. 保存/キャンセルバーを構築
        this.buildActionBar(container);

        // 5. 初回プレビュー更新
        this.updatePreview();
    }

    parseCode(code) { /* Mermaid テキスト → 内部データ */ }
    generateCode() { /* 内部データ → Mermaid テキスト */ }
    updatePreview() {
        const code = this.generateCode();
        mermaid.render(id, code).then(({svg}) => {
            previewEl.innerHTML = svg;
        });
    }
}
```

### 7.2 クラス別設計詳細

| クラス | 行範囲 | パース方式 | UI方式 | 主なデータ構造 |
|---|---|---|---|---|
| ClassDiagramEditor | L30-403 | 正規表現（`class {}` ブロック + インライン） | フォーム | classes[], relations[] |
| SequenceDiagramEditor | L404-770 | 行単位正規表現 | フォーム + 並替 + カラーパレット | participants[], messages[] (note/rect含む) |
| TableVisualEditor | L771-991 | パイプ(`\|`)分割 | HTML テーブル + input | headers[], rows[][] |
| MindmapEditor | L992-1247 | インデント解析（空白数） | ツリー表示 | root (再帰ノード) |
| QuadrantChartEditor | L1248-1470 | ディレクティブ解析 | フォーム | title, axes, quadrants, points[] |
| GanttChartEditor | L1471-1770 | セクション/タスク行解析 | フォーム + 並替 | title, dateFormat, sections[{tasks[]}] |
| ERDiagramEditor | L2481-2960 | 行単位正規表現 | フォーム + SVGコンテキストメニュー | entities[], relationships[] |

### 7.3 ヘルパー関数

```javascript
function _el(tag, cls)           // document.createElement + className
function _elText(tag, text, cls) // createElement + textContent
function _escHtml(text)          // & < > " のエスケープ
```

### 7.4 検出ヘルパー（DiagramEditorUtils）

```javascript
window.DiagramEditorUtils = {
    isClassDiagram(code),     // /^classDiagram/
    isSequenceDiagram(code),  // /^sequenceDiagram/
    isMindmap(code),          // /^mindmap/
    isQuadrantChart(code),    // /^quadrantChart/
    isGanttChart(code),       // /^gantt/
    isERDiagram(code)         // /^erDiagram/
};
```

---

## 8. スタイル設計（editor.css）

### 8.1 CSS 設計方針

- VS Code テーマ変数（`--vscode-*`）を活用しテーマ追従
- BEM 風の命名規則（ただし厳密な BEM ではない）
- WebView はシャドウ DOM ではないため、グローバルスコープ

### 8.2 主要セレクタ構成

```
.toolbar                     # 上部ツールバー（sticky）
.toolbar .btn-group          # ボタングループ

.block                       # Markdown ブロック
.block:hover                 # ホバー時の枠線表示
.block.editing               # 編集中ブロック
.block textarea              # 編集テキストエリア

.mermaid-edit-overlay        # Mermaid 編集ボタンオーバーレイ
.table-edit-overlay          # テーブル編集ボタンオーバーレイ

.diagram-visual-editor       # ダイアグラムエディタ共通コンテナ
.diagram-ve-toolbar          # エディタツールバー
.diagram-ve-split            # 左右分割コンテナ
.diagram-ve-list             # 左パネル
.diagram-ve-preview          # 右パネル（プレビュー）
.diagram-ve-actions          # 保存/キャンセルバー

.mindmap-tree                # マインドマップツリー
.mindmap-node                # マインドマップノード

.quadrant-config-panel       # 象限チャート設定パネル
.quadrant-field-row          # フォーム行

.gantt-config-panel          # ガントチャート設定パネル
.gantt-section-header        # セクションヘッダー

.color-picker-bar            # フローチャート色変更バー
.subgraph-list               # サブグラフ管理リスト
```

### 8.3 レスポンシブ設計

- 左右分割は `display: flex` で実装
- 左パネル `flex: 1`、右パネル `flex: 1`
- 最小幅の制約なし（WebView パネルサイズに依存）

---

## 9. ビルドパイプライン設計

### 9.1 ビルドフロー

```
src/extension.ts
    ↓ esbuild (TypeScript → JavaScript)
dist/extension.js (CommonJS, Node.js 互換)

media/*.js, media/*.css
    ↓ コピー（トランスパイルなし）
VSIX パッケージに直接含まれる
```

### 9.2 esbuild 設定

```javascript
// esbuild.mjs
{
    entryPoints: ['src/extension.ts'],
    bundle: true,
    outfile: 'dist/extension.js',
    external: ['vscode'],
    format: 'cjs',
    platform: 'node',
    sourcemap: !isProduction,
    minify: isProduction,
    watch: isWatch
}
```

**設計判断:** `media/` 配下の JS ファイルは esbuild でバンドルしない。これらは WebView で `<script src>` として個別にロードされるため、Node.js モジュールとしてバンドルすると動作しない。

### 9.3 VSIX パッケージング

```
npx @vscode/vsce package --baseContentUrl https://localhost --baseImagesUrl https://localhost --allow-missing-repository --skip-license
    ↓
.vscodeignore に基づいてファイル選別
    ↓
md-visual-editor-{version}.vsix (ZIP 形式)
```

`marked` と `mermaid` は WebView が `node_modules/` から直接読み込むため、パッケージ作成時に除外しない。`--baseContentUrl`、`--baseImagesUrl`、`--allow-missing-repository`、`--skip-license` は社内配布向けのパッケージング警告回避用オプション。

---

## 10. 依存パッケージ管理方針

### 10.1 原則

1. **ランタイム依存は最小限**（marked, mermaid のみ）
2. **開発依存は固定的に管理**（`package-lock.json` でロック）
3. **推移的依存の互換性は `overrides` で制御**

### 10.2 Node.js 互換性問題と対策

#### 問題の発生経緯

```
@vscode/vsce 3.x
  → @npmcli/installed-package-contents
    → npm-bundled → npm-normalize-package-bin
      → path-scurry
        → lru-cache 11.x
          → node:diagnostics_channel の tracingChannel() を使用
          → Node.js 20+ 限定 API
```

**エラー:** `TypeError: (0 , L.tracingChannel) is not a function` (Node 18.17.1)

#### 対策の経緯

| 試行 | 結果 |
|---|---|
| `overrides` で `lru-cache ~10.4.3` 固定 | ✅ 有効。Node 18 で動作 |
| `@vscode/vsce` 3.x → 2.x ダウングレード | ✅ 有効。Node 20+ API 回避 |
| `node_modules` 削除 + 再インストール | ⚠ `npm run watch` のロックに注意 |

#### 最終構成

```json
{
  "devDependencies": {
    "@vscode/vsce": "^2.22.0"
  },
  "overrides": {
    "lru-cache": "~10.4.3"
  }
}
```

### 10.3 `npm run watch` とファイルロック

`npm run watch` は esbuild のウォッチモードを起動し、`node_modules/.esbuild/` 内のバイナリ（`esbuild.exe`）がプロセスとして常駐する。このプロセスが `node_modules/` 内のファイルをロックするため、watch 実行中は `node_modules` の削除が失敗する。

**運用ルール:** `node_modules` の削除・再インストール前に watch ターミナルを停止すること。

---

## 11. セキュリティアーキテクチャ

### 11.1 多層防御モデル

```
Layer 5: WebView サンドボックス（Chromium iframe 分離）
Layer 4: CSP（Content Security Policy）
         └── connect-src: ${cspSource} → 外部URLへのネットワーク遮断
         └── script-src: 'nonce-xxx' → 未承認スクリプトブロック
Layer 3: Mermaid securityLevel: 'loose' + DOMPurify 内部サニタイズ
Layer 2: HTMLサニタイズ（sanitizeHtml, escapeHtml）
Layer 1: メッセージ型制限（edit / ready のみ）
```

### 11.2 信頼境界

```
┌─────────────────────────────────────────────┐
│ 信頼済み                                     │
│ ・extension.ts                              │
│ ・markdownVisualEditorProvider.ts            │
│ ・WebView 内の自作スクリプト（nonce 付き）      │
│ ・marked.js / mermaid.js（nonce 付き）        │
└────────────────────┬────────────────────────┘
                     │ postMessage（テキストのみ）
┌────────────────────▼────────────────────────┐
│ 非信頼（ユーザー入力）                         │
│ ・Markdown ファイルの内容                     │
│ ・Mermaid ダイアグラムの定義テキスト            │
│ → sanitizeHtml() / escapeHtml() で無害化     │
└─────────────────────────────────────────────┘
```

### 11.3 データフロー上の防御ポイント

```
Markdown テキスト
    → marked.lexer()         [パーサー: XSS コードをそのまま保持]
    → marked.parser()        [HTMLに変換: <script>等がそのまま含まれうる]
    → sanitizeHtml()         [★ 防御ポイント1: 危険タグ・属性除去]
    → innerHTML に代入        [安全なHTMLのみ]

Mermaid テキスト
    → mermaid.render()       [★ 防御ポイント2: securityLevel:'loose' + DOMPurify]
    → SVG を innerHTML に代入 [Mermaid がサニタイズ済み]

ユーザー入力（テキストエリア）
    → raw 文字列としてトークンに保持
    → postMessage() でホストに送信
    → WorkspaceEdit.replace() でファイル書き込み
    [★ 防御ポイント3: eval() や動的コード実行に渡さない]
```

詳細は [SECURITY.md](SECURITY.md) を参照。

---

## 12. 状態管理設計

### 12.1 グローバル状態（editor.js）

| 変数 | 型 | 初期値 | 用途 |
|---|---|---|---|
| `allTokens` | `Array` | `[]` | 全 Marked トークン |
| `editingBlockIndex` | `number` | `-1` | 編集中ブロック（-1=なし） |
| `mermaidCounter` | `number` | `0` | Mermaid ID 生成用カウンタ |
| `activeVisualEditor` | `Object\|null` | `null` | アクティブなビジュアルエディタ |
| `activeTableEditor` | `Object\|null` | `null` | アクティブなテーブルエディタ |
| `preventBlurFinish` | `boolean` | `false` | ツールバー操作中の blur 防止 |

### 12.2 アクティブエディタの排他制御

同時に1つのエディタのみアクティブにする:

```
ブロック編集中 (editingBlockIndex >= 0)
    → ビジュアルエディタ起動不可（先にfinishEditing()）

ビジュアルエディタ起動時
    → 既存エディタがあれば destroyVisualEditor()

テーブルエディタ起動時
    → 既存テーブルエディタがあれば destroyVisualEditor()
```

### 12.3 各エディタの内部状態

各ダイアグラムエディタは `this` でインスタンス内に状態を保持。グローバル変数への依存を避け、複数エディタの切り替えに対応。

---

## 13. エラーハンドリング設計

### 13.1 Mermaid レンダリングエラー

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

### 13.2 パースエラー

各ダイアグラムエディタの `parseCode()` は不正な構文に対して:
- パースできない行はスキップ
- デフォルト値でデータモデルを構築
- 致命的エラーの場合は空のエディタを表示

### 13.3 ファイル保存エラー

ホスト側の `WorkspaceEdit.applyEdit()` のエラーは VS Code のデフォルトエラーハンドリングに委任。

---

## 14. 拡張性設計

### 14.1 新しいダイアグラムエディタの追加手順

1. **diagram-editors.js** に新しいエディタクラスを追加
   ```javascript
   class NewDiagramEditor {
       constructor(container, code, onSave, onCancel) { ... }
       parseCode(code) { ... }
       generateCode() { ... }
       updatePreview() { ... }
   }
   ```

2. **検出ヘルパーを追加**
   ```javascript
   function isNewDiagram(code) {
       return code.trim().startsWith('newDiagramType');
   }
   ```

3. **window にエクスポート**
   ```javascript
   window.NewDiagramEditor = NewDiagramEditor;
   window.DiagramEditorUtils.isNewDiagram = isNewDiagram;
   ```

4. **editor.js のルーティングに追加**
   ```javascript
   else if (window.NewDiagramEditor && window.DiagramEditorUtils.isNewDiagram(token.text)) {
       startGenericDiagramEditing(tokenIndex, token, blockEl, window.NewDiagramEditor);
   }
   ```

5. **editor.css** に必要なスタイルを追加

6. **test-document.md** にサンプルを追加

### 14.2 設計上の制約

- WebView 内のスクリプトはモジュールシステムを使わない（CSP 制約）
- `window` オブジェクト経由でクラスを共有する必要がある
- 新しいスクリプトファイルを追加する場合は `markdownVisualEditorProvider.ts` の `getHtmlForWebview()` に `<script>` タグを追加する必要がある

---

## 15. 設計判断の記録（ADR）

### ADR-001: WebView スクリプトを esbuild でバンドルしない

- **決定:** `media/*.js` は esbuild のバンドル対象外とし、`<script src>` でブラウザ直接ロードする
- **理由:** WebView は Chromium 上のブラウザ環境であり、Node.js モジュールシステムが使えない。esbuild でバンドルすると `require()` が残り動作しない
- **影響:** ファイル間の依存は `window` グローバルで管理する必要がある

### ADR-002: Markdownパーサーにmarkedのlexerモードを使用

- **決定:** `marked.lexer()` でトークン分割し、トークンの `raw` プロパティで元テキストを保持
- **理由:** ブロック単位の編集では、変更していないブロックの原文を保持する必要がある。`marked.parse()` を使うと原文が失われる
- **影響:** 対応する Markdown 要素は marked のトークン種別に依存する

### ADR-003: @vscode/vsce を 2.x に固定

- **決定:** `@vscode/vsce` を `^2.22.0` に固定（3.x は不使用）
- **理由:** vsce 3.x の推移的依存 `lru-cache` 11.x が `diagnostics_channel.tracingChannel()` を使用し、Node.js 20+ を要求する。ビルド環境が Node 18.x のため互換性が失われる
- **日付:** 2026-04-10
- **見直し条件:** ビルド環境を Node 20+ にアップグレードした場合、vsce 3.x + overrides 削除を検討

### ADR-004: lru-cache を overrides で 10.4.3 に固定

- **決定:** `package.json` の `overrides` で `lru-cache` を `~10.4.3` に固定
- **理由:** vsce 2.x の推移的依存でも `lru-cache` の最新版（11.x）が解決される場合があるため、明示的に固定
- **日付:** 2026-04-10
- **リスク:** `lru-cache` 10.x にセキュリティ脆弱性が発見された場合、Node アップグレードが必要

### ADR-005: ダイアグラムエディタの共通パターン

- **決定:** クラス図・シーケンス図・マインドマップ・象限チャート・ガントチャート・ER図とテーブルのエディタを同一ファイル（diagram-editors.js）に配置し、`startGenericDiagramEditing()` で統一起動
- **理由:** 各エディタは「パース → フォーム構築 → プレビュー → コード生成」の同一パターンに従う。ファイル分割すると `<script>` タグ追加が必要になり、Provider の変更が頻繁に発生する
- **影響:** diagram-editors.js が ~2960 行と大きいが、各クラスは独立しており保守性は維持

### ADR-006: npm run watch 時のファイルロック問題

- **決定:** ドキュメントに「watch 停止後に node_modules 削除」の手順を明記
- **理由:** esbuild のウォッチモードが `node_modules/.esbuild/esbuild.exe` をロックし、`node_modules` フォルダの削除が `EBUSY` で失敗する。Windows 固有の問題
- **日付:** 2026-04-10
- **代替案:** `npm run watch` を使わず毎回 `npm run compile` する方式は開発効率が低下するため不採用

### ADR-007: その他 Mermaid 14 種を汎用フォームエディタで実装（v0.3.0）

- **決定:** 状態遷移／パイ／ジャーニー／Git／タイムライン／要求／C4／Sankey／XY／ブロック／ZenUML／パケット／アーキテクチャ／Kanban の 14 種は、`media/extra-diagram-editors.js` に共通基底クラス `GenericFormDiagramEditor` を置き、サブクラスでセクション定義のみを記述する形で実装する
- **理由:** Mermaid 構文は図種ごとに大きく異なる一方、UI は「セクション別リスト編集 + ライブ SVG プレビュー + コードモード切替」で共通化できる。1 ファイルあたり数十行の差分で図種を追加できる
- **日付:** 2026-04-26
- **影響:** 21 種すべてが GUI 編集対応となり、コード+プレビュー分割エディタは「判定不能な構文」のフォールバック専用となった

### ADR-008: フローチャートのレイアウト切替を init ディレクティブで永続化（v0.3.1）

- **決定:** `FlowchartModel.layout` を導入し、`dagre` 以外を選んだ場合は Mermaid コード冒頭に `%%{init:{"layout":"..."}}%%` を出力する。パーサーも同ディレクティブを読み取って `layout` を復元する
- **理由:** Mermaid は ELK レイアウトを `init` ディレクティブで指定する。SVG 上の見た目はノードと同列の重要属性のため、モデル側の独立フィールドとして管理するのが自然
- **日付:** 2026-04-27

### ADR-009: サブグラフの入れ子化（v0.3.1）

- **決定:** `Subgraph` に `parentSgId` を追加し、`emitSg(sg, depth)` で再帰的に Mermaid コードを生成する。`setSubgraphParent()` は祖先チェーンを辿ってサイクルを検出し拒否する
- **理由:** Mermaid のサブグラフは入れ子可能だが、UI でフラットな一覧として扱うとサイクル設定が容易に発生する。明示的な祖先走査でモデル整合性を担保する
- **日付:** 2026-04-27

### ADR-010: リンクの Ctrl+Click 動作（v0.3.1）

- **決定:** WebView 上のリンクの通常クリックは抑止し、`Ctrl/Cmd + Click` のみホストへ `openLink` メッセージを送る。ホストは `http(s):` / `mailto:` を `vscode.env.openExternal`、それ以外を `vscode.commands.executeCommand('vscode.open', uri)` で開く
- **理由:** プレビュー型 WYSIWYG では誤クリックでリンク遷移が発生しやすい。VS Code 標準の Markdown プレビューも `Ctrl+Click` で開く挙動と統一する
- **日付:** 2026-04-27

### ADR-011: テーマ強制切替を CSS クラスと Mermaid 再初期化で実装（v0.3.1）

- **決定:** ツールバーの ☀️/🌙 ボタンで `_forcedTheme` を `auto` → `light` → `dark` と循環させ、`body.force-theme-light` / `body.force-theme-dark` クラスで CSS 変数を上書きする。Mermaid は `mermaid.initialize({ theme })` を呼び直して再描画する
- **理由:** VS Code のテーマに常に追従する場合、ダークテーマでスクリーンショットを共有したいときなどに不便。WebView 内で完結する形で UI トグルを提供する
- **日付:** 2026-04-27

### ADR-012: フローチャート初期描画の倍率自動調整は条件付き（v0.3.1）

- **決定:** SVG が描画領域より 16px 以上大きい場合のみ自動フィットし、収まる場合はズーム 1.0 を維持する
- **理由:** 旧実装では小さな図でも勝手に拡大され、ユーザーから「勝手に倍率が変わる」と苦情があった。表示領域に収まるなら原寸で表示するのが自然
- **日付:** 2026-04-27

---

*最終更新: 2026年4月27日（v0.4.1 対応）*

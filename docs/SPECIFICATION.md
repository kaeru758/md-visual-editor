# Markdown Visual Editor — 機能仕様書

| 項目 | 内容 |
|---|---|
| ドキュメントバージョン | 4.0 |
| 対象拡張機能 | Markdown Visual Editor v1.0.0 |
| 作成日 | 2026-04-10 |
| 最終更新日 | 2026-07-21 |
| 対象読者 | 開発者・保守担当者・レビュアー |

---

## 目次

1. [概要](#1-概要)
2. [動作環境](#2-動作環境)
3. [機能一覧](#3-機能一覧)
4. [カスタムエディタ登録・コマンド仕様](#4-カスタムエディタ登録コマンド仕様)
5. [WYSIWYG Markdown編集（ブロックモデル）](#5-wysiwyg-markdown編集ブロックモデル)
6. [ツールバー機能](#6-ツールバー機能)
7. [キーボード操作](#7-キーボード操作)
8. [ブロック右クリックメニュー・挿入位置ピッカー](#8-ブロック右クリックメニュー挿入位置ピッカー)
9. [Mermaidダイアグラム共通仕様](#9-mermaidダイアグラム共通仕様)
10. [フローチャートビジュアルエディタ](#10-フローチャートビジュアルエディタ)
11. [クラス図ビジュアルエディタ](#11-クラス図ビジュアルエディタ)
12. [シーケンス図ビジュアルエディタ](#12-シーケンス図ビジュアルエディタ)
13. [マインドマップビジュアルエディタ](#13-マインドマップビジュアルエディタ)
14. [象限チャートビジュアルエディタ](#14-象限チャートビジュアルエディタ)
15. [ガントチャートビジュアルエディタ](#15-ガントチャートビジュアルエディタ)
16. [ER図ビジュアルエディタ](#16-er図ビジュアルエディタ)
17. [汎用フォームダイアグラムエディタ（14種）](#17-汎用フォームダイアグラムエディタ14種)
18. [Mermaidコードエディタ（フォールバック）](#18-mermaidコードエディタフォールバック)
19. [テーブルビジュアルエディタ](#19-テーブルビジュアルエディタ)
20. [数式（KaTeX）編集](#20-数式katex編集)
21. [画像の表示・保存](#21-画像の表示保存)
22. [ズーム / パン](#22-ズーム--パン)
23. [検索 / 置換](#23-検索--置換)
24. [変更ハイライト](#24-変更ハイライト)
25. [PDF出力](#25-pdf出力)
26. [ホスト-WebView間通信プロトコル](#26-ホスト-webview間通信プロトコル)
27. [セキュリティ仕様](#27-セキュリティ仕様)
28. [依存パッケージ仕様](#28-依存パッケージ仕様)
29. [ビルド・パッケージング仕様](#29-ビルドパッケージング仕様)
30. [既知の制限事項](#30-既知の制限事項)

---

## 1. 概要

### 1.1 目的

VS Code 上で Markdown ファイルをプレビュー表示のまま直接編集する WYSIWYG カスタムエディタ拡張機能。Mermaid ダイアグラム 21 種類のビジュアル編集（GUI、うち20種）、LaTeX 数式（KaTeX）編集、テーブルの GUI 編集に対応する。

### 1.2 利用形態

- **社内利用限定**（マーケットプレイス非公開）
- VSIX ファイルによる社内配布
- 拡張機能自体が能動的にネットワーク通信するコードは持たない。ただし CSP の `img-src` が `https:` を許可しているため、Markdown 本文に外部URLの画像を書いた場合はその画像取得によって通信が発生しうる（[27.1](#271-cspcontent-security-policy)参照）。「完全にネットワーク遮断」とは言い切れない点に注意

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
| Node.js | **20.x 以上** | `@vscode/vsce` 3.x 系が `engines.node: ">= 20"` を要求するため必須。Node 18.x でのビルド自体（`npm run compile`）は可能だが、VSIX 作成（`vsce package`）はNode 20未満では失敗しうる |
| npm | 8.x 以上 | |
| VS Code | 1.80.0 以上 | |
| esbuild | 0.19.x | devDependencies に含まれる。ビルド時に `media/vendor/` へ marked/mermaid/katex をコピーする処理も兼ねる（[29章](#29-ビルドパッケージング仕様)） |
| TypeScript | 5.x | devDependencies に含まれる |
| @vscode/vsce | **3.2.1系** | VSIX パッケージング用。**v0.4.1時点の「2.22.x固定」から移行済み** |

> 旧版（v0.4.1）の本書は「Node 18.x 推奨、`overrides` で `lru-cache` を固定して vsce 2.x を使用」としていたが、現在の `package.json` は `@vscode/vsce: ^3.2.1` を採用し `overrides` は空になっている。vendor ライブラリ（marked/mermaid/katex）を `node_modules` からではなくビルド時コピーで `media/vendor/` に取り込む方式に変更されたことに伴う変更で、`.vscodeignore` も `node_modules/**` を全面除外するようになった。詳細は [DESIGN.md §13.3, §14.2](DESIGN.md#133-vendor-アセットのコピー方式への変更重要な設計変更) を参照。

---

## 3. 機能一覧

### 3.1 機能マトリクス

| # | 機能 | エディタ種別 | 入力 | 出力 |
|---|---|---|---|---|
| F01 | WYSIWYG Markdown 編集（H1/H2セクション単位、v0.5.4） | ブロックエディタ | マウス + キーボード | Markdown テキスト |
| F02 | ツールバー要素挿入 | ブロックエディタ | ボタンクリック | Markdown テキスト |
| F03 | フローチャート編集 | ビジュアル（GUI） | マウス + キーボード | Mermaid コード |
| F04 | クラス図編集 | ビジュアル（GUI） | フォーム入力 | Mermaid コード |
| F05 | シーケンス図編集 | ビジュアル（GUI） | フォーム入力 | Mermaid コード |
| F06 | マインドマップ編集 | ビジュアル（GUI） | ツリー操作 | Mermaid コード |
| F07 | 象限チャート編集（日本語ラベル対応） | ビジュアル（GUI） | フォーム入力 | Mermaid コード |
| F08 | ガントチャート編集 | ビジュアル（GUI） | フォーム入力 | Mermaid コード |
| F09 | ER 図編集 | ビジュアル（GUI） | フォーム入力 + SVG操作 | Mermaid コード |
| F10 | Mermaid コード編集（フォールバック） | 分割エディタ | テキスト入力 | Mermaid コード |
| F11 | テーブル編集（配置指定は非対応） | ビジュアル（GUI） | セル直接入力 | Markdown テーブル |
| F12 | その他 Mermaid 13 種 GUI 編集（v0.3.0〜） | 汎用フォーム GUI | セクション別リスト編集 + SVG プレビュー | Mermaid コード |
| F13 | 検索／置換バー（v0.3.1） | グローバル UI | `Ctrl+F` / `Ctrl+H` / ツールバー | ドキュメント中のテキストを一括置換 |
| F14 | テーマ切替（v0.3.1） | グローバル UI | ツールバー | `body.force-theme-light/dark` + Mermaid テーマを同期切替 |
| F15 | テキストエディタで開く（v0.3.1） | グローバル UI | ツールバー | `vscode.openWith` を `'default'` で実行 |
| F16 | リンククリックで開く | ブロックエディタ | マウスクリック（修飾キー不要） | OS / VS Code のハンドラで開く |
| F17 | フローチャートレイアウト切替（v0.3.1） | ビジュアル（GUI） | ツールバー選択 | Mermaid `%%{init:{"layout":"..."}}%%` |
| F18 | サブグラフの入れ子化（v0.3.1） | ビジュアル（GUI） | サブグラフ一覧で親選択 | ネストされた Mermaid サブグラフ |
| F19 | ブロック右クリックメニュー（v0.4.x〜v0.5.2） | ブロックエディタ | 右クリック | 追加/切り取り/コピー/貼り付け/移動/PDF出力/削除 |
| F20 | LaTeX 数式編集（KaTeX） | ブロックエディタ + 専用エディタ | `$..$` / `$$..$$` / ` ```math ` | インライン/ディスプレイ数式レンダリング |
| F21 | 画像のドラッグ&ドロップ保存 | ブロックエディタ | ファイルD&D | `images/` への保存 + `![alt](images/xxx)` 挿入 |
| F22 | 相対パス画像の表示解決 | ブロックエディタ | — | `resolveImage` → `asWebviewUri` |
| F23 | PDF出力 | ブロックエディタ / 右クリックメニュー | ツールバー・右クリック | 一時HTML書き出し + OS既定ブラウザの印刷ダイアログ |
| F24 | Mermaid図のズーム/パン（v0.5.5、3系統） | プレビュー + 各ビジュアルエディタ | ボタン・ホイール・ドラッグ | 表示倍率・表示位置の変更（文書には影響しない） |
| F25 | 変更ハイライト（v0.5.0） | ブロックエディタ | — | 未保存ブロックの視覚的強調 |
| F26 | テキストエディタ→ビジュアルエディタの1クリック復帰（v0.5.3） | コマンド / editor/title メニュー | ボタンクリック・コマンドパレット | `vscode.openWith` でビジュアルエディタを開く |

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
| `window.ExtraDiagramUtils` の各判定関数 | 状態遷移 / パイ / ジャーニー / Git / タイムライン / 要求 / C4 / Sankey / XY / ブロック / パケット / アーキテクチャ / Kanban（13種、zenumlは判定関数なし） | `isStateDiagram()`, `isPieChart()`, ... |
| — | その他（zenuml を含む） | 上記のいずれにも一致しない |

**ルーティング先:**
- フローチャート → `MermaidVisualEditor`（mermaid-visual-editor.js）
- クラス図/シーケンス図/マインドマップ/象限チャート/ガントチャート/ER図 → `startGenericDiagramEditing()` → 各 `*Editor` クラス（diagram-editors.js）
- その他 13 種 → `window.ExtraDiagramUtils` 経由で `extra-diagram-editors.js` の各 `*Editor` クラスへ
- 上記いずれにも一致しない（zenuml を含む） → コード + ライブプレビュー分割エディタ（editor.js 内蔵、[18章](#18-mermaidコードエディタフォールバック)）
- 挿入ピッカーに一覧表示されるのは 20 種（zenuml を除外）

---

## 4. カスタムエディタ登録・コマンド仕様

### 4.1 package.json 設定（customEditors）

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

### 4.2 コマンド・メニュー登録（v0.5.3 追加）

```json
{
  "contributes": {
    "commands": [{
      "command": "mdVisualEditor.openVisualEditor",
      "title": "Markdown ビジュアルエディタで開く",
      "category": "Markdown Visual Editor",
      "icon": "$(preview)"
    }],
    "menus": {
      "editor/title": [{
        "command": "mdVisualEditor.openVisualEditor",
        "when": "resourceExtname == .md && activeCustomEditorId != mdVisualEditor.markdownEditor",
        "group": "navigation"
      }],
      "commandPalette": [{
        "command": "mdVisualEditor.openVisualEditor",
        "when": "resourceExtname == .md"
      }]
    }
  }
}
```

| 項目 | 内容 |
|---|---|
| コマンドID | `mdVisualEditor.openVisualEditor` |
| タイトル | 「Markdown ビジュアルエディタで開く」 |
| カテゴリ | 「Markdown Visual Editor」 |
| アイコン | `$(preview)` |
| `editor/title` の `when` | `.md` をテキストエディタ（標準エディタ）で開いており、かつビジュアルエディタがアクティブでない場合にタイトルバーへボタン表示 |
| `commandPalette` の `when` | 拡張子が `.md` のファイルがアクティブな場合のみコマンドパレットに表示 |

**実装（`extension.ts`）:** コマンド引数の `uri`、無ければ `vscode.window.activeTextEditor` のドキュメント URI を対象に `vscode.commands.executeCommand('vscode.openWith', target, MarkdownVisualEditorProvider.viewType)` を実行する。対象が特定できない場合は `showWarningMessage` で警告して終了する。

このコマンドにより「テキストエディタ ⇄ ビジュアルエディタ」の往復が両方向ワンクリックになる（ビジュアル→テキストは従来どおりツールバーの 📝 ボタン、[6.5](#65-ツールバー右端ユーティリティv031)参照）。

### 4.3 アクティベーション

- `activationEvents: []`（空配列）
- カスタムエディタまたはコマンドが実行されたときのみアクティベート
- バックグラウンド常駐しない

---

## 5. WYSIWYG Markdown編集（ブロックモデル）

### 5.1 レンダリングエンジン

| 項目 | 値 |
|---|---|
| パーサー | marked.js 4.3.x `marked.lexer()` |
| トークン保持方式 | `allTokens[]` 配列で全トークン（`space` 型含む）を保持 |
| ブロック区分 | **v0.5.4 以降、トークン1個ではなく「トークン範囲（range）」単位** |

### 5.2 ブロック = トークン範囲（v0.5.4、最重要の変更点）

v0.4.1時点までは「marked トークン1個 = 1編集ブロック」だった。**v0.5.4 でこの対応関係が変更され**、テキスト系のトークンは H1/H2 見出し単位でまとめられるようになった。

#### 5.2.1 範囲の決め方（`computeBlockRanges()`）

| トークン種別 | 範囲の決め方 |
|---|---|
| `table` | 単独で1ブロック（直後の空行があれば吸収）。**特殊ブロック** |
| `code`（プレーンコード・` ```mermaid `・` ```math ` を含むフェンス全般） | 単独で1ブロック（直後の空行があれば吸収）。**特殊ブロック** |
| `space`（空行） | 直前のブロック範囲に吸収される（単独のブロックにはならない） |
| それ以外（見出し・段落・リスト・引用・水平線 等） | H1 または H2 見出しから、次の H1/H2 見出し・特殊ブロック・文書末尾の**直前まで**をまとめて1ブロック（**テキストセクション**）。H3〜H6見出し・段落・リスト・引用・hr は同一セクション内に同居する |

つまり「特殊ブロック（表・コード・Mermaid・数式）は今まで通り単独ブロック」「それ以外のテキストは、H1かH2が出てくるたびに新しいブロックが始まる」という規則になる。

#### 5.2.2 DOM 表現

各ブロック要素（`.block`）は次の2つの `data-*` 属性で自分が対応するトークン範囲を表現する。

| 属性 | 値 |
|---|---|
| `data-token-index` | range の開始トークンインデックス（`range.start`） |
| `data-token-end` | range の終了トークンインデックス（`range.end`、この値自身は範囲に含まない） |

ブロックの検索・フォーカス移動・編集開始・削除・D&D並べ替えなどの内部処理は、いずれもこの2属性から range を復元して動作する。

#### 5.2.3 v0.5.6 での不具合修正

v0.5.4 導入時、どのトークンを描画に使うか（代表トークン）の判定が「range の長さが1かどうか」だけに依存していたため、**特殊ブロック（表/コード/Mermaid/数式）の直後に空行があると range が2トークン分になり、意図せず「複数トークンのテキストセクション」として扱われて生の Markdown コードのまま表示される**不具合があった（v0.5.4のリグレッション）。v0.5.6 では「先頭トークンが特殊種別かどうか」を長さより先に判定するよう修正し、空行の有無に関わらず表・コード・Mermaid・数式が正しく専用の描画（テーブル/シンタックスハイライト/SVG/KaTeX）に回るようになった。

### 5.3 対応 Markdown 要素

| Markdown 要素 | レンダリング | 編集 |
|---|---|---|
| 見出し（`#` ～ `######`） | ✅ | ✅（H1/H2はセクション区切り、H3〜H6はセクション内） |
| 段落 | ✅ | ✅（所属セクションの一部として） |
| 箇条書き / 番号リスト / タスクリスト | ✅ | ✅ |
| テーブル | ✅ | ✅（GUI 編集対応、[19章](#19-テーブルビジュアルエディタ)、独立ブロック） |
| コードブロック | ✅（シンタックスハイライトなし、等幅表示） | ✅（独立ブロック） |
| Mermaid コードブロック | ✅（SVG 描画） | ✅（ビジュアル / コード、独立ブロック） |
| 数式コードブロック（` ```math `） | ✅（KaTeX 描画） | ✅（専用エディタ、独立ブロック、[20章](#20-数式katex編集)） |
| インライン数式（`$..$` / `$$..$$`） | ✅（KaTeX 描画、後処理） | ✅（所属セクションのテキストとして編集） |
| 引用 / 水平線 | ✅ | ✅（所属セクション内） |
| インラインコード / 太字 / 斜体 / 取り消し線 / リンク | ✅ | ✅ |
| 画像 | ✅（相対パスも `resolveImage` で解決して表示） | ✅（raw 記法。D&D 挿入にも対応） |

### 5.4 ブロック編集フロー

```
[レンダリング状態] --(ダブルクリック / Enter / F2)--> [編集モード]
                                        ↓
                     textarea に range 全体の raw テキストを連結して表示
                                        ↓
                   [Escape / Ctrl+Enter / ブロック外クリック / Alt+↑↓ でジャンプ]
                                        ↓
                        range 内のトークンの raw をまとめて更新
                                        ↓
                        postMessage({type:'edit', text}) → ファイル保存
                                        ↓
                                  再レンダリング
                        （Escape/Ctrl+Enter完了後はそのブロックへフォーカス+選択が復帰、v0.5.3）
```

### 5.5 HTMLサニタイズ

`renderBlockContent()` 内で `marked.parser()` の出力を `sanitizeHtml()` に通してから `innerHTML` に代入する。方式は**危険な要素・属性を除去する denylist** であり、DOMPurify のような allowlist ではない（CSPが第2の防御層として機能する）。

**除去対象タグ:** `script, iframe, object, embed, form, input, textarea, select, button, style, link, meta, base, applet, frame, frameset, layer, ilayer, bgsound`

**除去対象属性・値:** 全要素の `on*` イベントハンドラ属性、`href/src/action/formaction/xlink:href` の `javascript:` / `vbscript:` スキーム。`src` の `data:` は `<img>` のみ許可し、それ以外の要素では除去する。

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
| H1 / H2 / H3 | `# ` / `## ` / `### ` + テンプレート（H4〜H6は「…」ポップアップから） |
| • List / 1. List | `- リスト項目\n- リスト項目` / `1. リスト項目\n2. リスト項目` |
| リンク | `[リンクテキスト](URL)` |
| テーブル | 3列ヘッダ + 区切り + 2行のテンプレート |
| コードブロック | ` ```\n\n``` ` |
| Mermaid | ダイアグラム種別選択ピッカー（20 種類、zenuml除く）を表示し、選択した種類のテンプレートを挿入 |
| 数式（∑） | 数式テンプレートを挿入（` ```math ` フェンス、または選択範囲があればインライン `$..$`） |

### 6.3 挿入位置ピッカー

ブロック編集中でない場合にツールバーボタン（見出し・リスト・テーブル・Mermaid・数式等）を押すと、**挿入位置選択ダイアログ**が表示される。一覧はブロック範囲単位（H1/H2セクション、または特殊ブロック）で表示される。

- 「先頭に挿入」を選択するとドキュメント先頭に挿入。空ドキュメントの場合はダイアログを出さず先頭に挿入
- 「○○の後に挿入」を選択すると該当ブロックの直後に挿入
- Mermaid ボタンの場合は、先にダイアグラム種別ピッカーを表示し、種類選択後に挿入位置ピッカーを表示
- **ブロックが選択中の場合、その項目が挿入位置ピッカーの初期選択・フォーカス・スクロール位置になる**（そのまま `Enter` で即確定できる）

### 6.4 挿入先ルールまとめ

- **編集中のブロックあり**: テキストエリアのカーソル位置に挿入
- **編集中のブロックなし**: 挿入位置ピッカーで位置を選択
- ツールバーの `mousedown` イベントで `preventDefault()` を呼び出し、テキストエリアのフォーカス喪失を防止。ただし `<select>` 要素に対しては `preventDefault()` を呼ばない（ドロップダウンの動作を阻害するため）

### 6.5 ツールバー右端ユーティリティ（v0.3.1）

ツールバーに `.toolbar-group-right`（`margin-left: auto`）を配置し、以下のボタン・インジケータを右寄せで表示する。

| data-action / 要素 | ラベル | 動作 |
|---|---|---|
| `save-status` | ●（保存済み）/ ○（未保存系） | 保存状態インジケータ。**クリック不可**（表示のみ） |
| `undo` | ↶ | ホストへ `undo` メッセージ送信 → `commands.executeCommand('undo')` |
| `redo` | ↷ | ホストへ `redo` メッセージ送信 → `commands.executeCommand('redo')` |
| `find` | 🔍 | 検索／置換バー `#find-bar` をトグルして表示・フォーカス |
| `toggleTheme` | ☀️ ↔ 🌙 | `_forcedTheme` を `auto` → `light` → `dark` と循環し、`body.force-theme-light/dark` クラスと Mermaid テーマを一括切替。状態は `vscode.setState` に永続化 |
| `openAsText` | 📝 | ホストに `openAsText` メッセージを送信し、`vscode.openWith` を `'default'` で実行して標準テキストエディタを開く |

### 6.6 検索／置換バー（v0.3.1）

- HTML: `#find-bar` 内に `#find-input`・`#find-prev`・`#find-next`・`#find-count`・`#replace-input`・`#replace-one`・`#replace-all`・`#find-case`・`#find-regex`・`#find-close` を配置
- ショートカット: `Ctrl+F` でバーを表示し検索ボックスにフォーカス、`Ctrl+H` でバー表示後に置換ボックスへフォーカス、`Esc` でバーを閉じる
- マッチング対象は**レンダリング結果ではなく生の Markdown 全文**。詳細な検索仕様は [23章](#23-検索--置換) を参照
- 検索オプション: `Aa`（大文字・小文字を区別）、`.*`（正規表現）

### 6.7 リンククリック動作

- 修飾キーの有無に関わらず、**クリックすると常に** `event.preventDefault()` した上でホストへ `openLink` メッセージを送信する
- ホスト側の振り分け:
  - `http://` / `https://` / `mailto:` → `vscode.env.openExternal(vscode.Uri.parse(...))`
  - その他のスキーム付きURL → `vscode.commands.executeCommand('vscode.open', uri)`
  - `#` のみのアンカーリンクは無視
  - スキームのない相対パスは、md ファイルの階層を基準に解決してから `vscode.open` で開く

> v0.3.1時点の設計では「通常クリックは抑止し `Ctrl/Cmd+Click` のみ開く」という仕様だったが、現在の実装は修飾キー不要で常にクリックのみで開く。誤クリックによる意図しない遷移が起きやすい点は既知のトレードオフ。

---

## 7. キーボード操作

### 7.1 ブロック選択中（編集していない）

| キー | 動作 |
|---|---|
| `Enter` / `F2` | 編集開始 |
| `Delete` | 削除（確認ダイアログを表示、削除前にクリップボードへコピー） |
| `↑` / `↓` | 前後ブロックへフォーカス移動 + 単一選択 |
| `Ctrl+Enter` | 「下にブロックを追加」メニューを開く |
| `Ctrl+Shift+Enter` | 「上にブロックを追加」メニューを開く |
| `Tab` | ネイティブのフォーカス移動（各ブロックは `tabIndex=0`） |

### 7.2 テキストセクション編集中（textarea）

| キー | 動作 |
|---|---|
| `Escape` | 変更ありなら破棄確認ダイアログ → 編集完了。**完了後そのブロックにフォーカス + 選択が戻る（v0.5.3）** |
| `Ctrl+Enter` | 確定（同上、フォーカス復帰あり） |
| `Alt+↑` / `Alt+↓` | 確定して前後ブロックの**編集へ直接ジャンプ**（マウスに持ち替えず「編集→確定→次を編集」を連続実行できる） |
| `Ctrl+B` / `Ctrl+I` | 太字 / 斜体 |
| `Tab` | 半角スペース 4 個を挿入 |

### 7.3 複数選択時（documentレベル）

`Ctrl+C` / `Ctrl+X` / `Ctrl+V`（コピー/切り取り/貼り付け）。`Delete`・`Backspace` は**2個以上選択している場合のみ**削除として機能する。`Escape` で選択解除。

### 7.4 グローバル（captureフェーズ）

| キー | 動作 |
|---|---|
| `Ctrl+F` | 検索バーを開く |
| `Ctrl+H` | 置換バーを開く |
| `Ctrl+Z` | undo |
| `Ctrl+Shift+Z` / `Ctrl+Y` | redo |

テキスト入力中（`INPUT`/`TEXTAREA`/contentEditable 要素にフォーカスがある場合）は undo/redo をブラウザ既定の挙動に委ねる（グローバルハンドラを発火させない）。**`Ctrl+S` は横取りしない**（VS Code 標準の保存フローに任せる）。

### 7.5 Mermaid / 数式のコードエディタ

| キー | 動作 |
|---|---|
| `Ctrl+Enter` | 保存 |
| `Escape` | キャンセル（変更があれば確認ダイアログ） |
| `Tab` | 4スペース挿入 |

---

## 8. ブロック右クリックメニュー・挿入位置ピッカー

### 8.1 単一ブロック選択時

`✎ 編集` / — / `⬆ 上にブロックを追加…` / `⬇ 下にブロックを追加…` / — / `✂ 切り取り` / `⧉ コピー` / `📋 貼り付け(このブロックの後ろ)` / — / `↑ 上に移動`（先頭ブロックでは無効）/ `↓ 下に移動`（末尾ブロックでは無効）/ — / `📄 PDF として出力` / — / `🗑 削除`

### 8.2 複数ブロック選択時（2件以上）

`✂ 切り取り(N件)` / `⧉ コピー(N件)` / `📋 貼り付け` / — / `📄 PDF として出力` / — / `🗑 N件のブロックを削除`

### 8.3 背景（ブロック外）右クリック

`📋 貼り付け(末尾に追加)` / — / `📄 PDF として出力`

### 8.4 「ブロックを追加」サブメニュー（v0.5.2）

¶ 段落 / H1 / H2 / H3 見出し / • 箇条書き / 1. 番号付き / ☑ タスクリスト / ⊞ 表 / { } コードブロック / ∑ 数式 / ❝ 引用 / ─ 水平線 / — / ◇ Mermaid ダイアグラム…（20種ピッカーへ）

挿入後は**そのまま編集状態に入る**。挿入テキストの前後には必ず空行を確保する（隣接する段落・リストと意図せず結合するのを防ぐため、v0.5.2で修正済み）。

### 8.5 ブロック選択・操作の基本仕様

| 操作 | 内容 |
|---|---|
| クリック | 単一選択 |
| `Ctrl+Click` | トグル選択 |
| `Shift+Click` | 範囲選択 |
| 背景クリック | 選択解除 |
| コピー/切り取り | 選択ブロックの raw を `\n\n` で連結してクリップボードへ |
| 貼り付け | クリップボードの内容を `marked.lexer()` で再解析してトークンとして挿入 |
| D&D 並べ替え | ハンドル `⋮⋮`（ホバー表示）またはブロック自体をドラッグ。ドロップ位置は上下中点で判定し `.block-drop-before/after` で線表示。複数選択時はまとめて移動 |

---

## 9. Mermaidダイアグラム共通仕様

### 9.1 Mermaid初期化設定

```javascript
mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'loose',
  theme: (現在のVS Codeテーマ、またはツールバーの強制テーマ設定に応じて 'dark' or 'default')
});
```

### 9.2 SVGレンダリング

- `mermaid.render(id, code)` でSVGを生成
- `mermaidCounter` により一意のID（`mermaid-N`）を付与
- レンダリングエラー時はエラーメッセージを `escapeHtml()` で表示

### 9.3 編集ボタン表示

```
[Mermaidブロック]
   hover → 右上に「✎ ダイアグラムを編集」ボタン表示
   クリック or ダブルクリック → エディタ起動
```

### 9.4 共通保存/キャンセルフロー

1. **保存:** エディタが生成した Mermaid コードを取得 → トークンの `raw` を更新 → `postMessage({type:'edit'})` → ファイル保存
2. **キャンセル:** 変更を破棄しエディタを閉じる

### 9.5 対応 21 種の分類

| 分類 | 図種別 | エディタ実装 |
|---|---|---|
| 専用エディタ（7種） | flowchart, sequenceDiagram, classDiagram, mindmap, quadrantChart, gantt, erDiagram | `mermaid-visual-editor.js` / `diagram-editors.js` |
| 汎用フォームエディタ（13種、GUI編集可） | stateDiagram-v2, pie, journey, gitGraph, timeline, requirementDiagram, C4, sankey-beta, xychart-beta, block-beta, packet-beta, architecture-beta, kanban | `extra-diagram-editors.js`（`GenericFormDiagramEditor` 派生） |
| コード編集のみ（1種） | zenuml | バンドル未同梱のため専用/汎用いずれのビジュアルエディタも提供されない。挿入ピッカーからも除外 |
| 判定不能なMermaid | — | コード + ライブプレビュー分割エディタへフォールバック（[18章](#18-mermaidコードエディタフォールバック)） |

---

## 10. フローチャートビジュアルエディタ

### 10.1 対象

先頭行が `graph [TD|LR|BT|RL]` または `flowchart [TD|LR|BT|RL]` のMermaidブロック。

### 10.2 データモデル（FlowchartModel）

| プロパティ | 型 | 説明 |
|---|---|---|
| `direction` | `string` | グラフ方向（`TD`, `LR`, `BT`, `RL`） |
| `layout` | `string` | Mermaid レイアウトエンジン名（`dagre` / `elk` / `elk.tree`）。`dagre` 以外のとき `%%{init:{"layout":"..."}}%%` ディレクティブを出力。パーサーも同ディレクティブを読み取る |
| `nodes` | `Map<id, {shape, label}>` | ノード定義 |
| `edges` | `Array<{from, to, label, type}>` | 接続定義 |
| `subgraphs` | `Array<{id, label, nodeIds[], parentSgId?}>` | サブグラフ定義。`parentSgId` で入れ子を表現（サイクル防止付き）。出力時は `emitSg(sg, depth)` で再帰的にインデントして生成 |
| `styles` | `Map<nodeId, {fill, stroke, color}>` | ノードスタイル |

### 10.3 ノード形状

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

### 10.4 接続線種

| 種別 | Mermaid 構文 | 表示 |
|---|---|---|
| arrow | `-->` / `-->|label|` | 矢印 |
| line | `---` / `---|label|` | 直線 |
| dotted | `-.->` / `-. label .->` | 点線 |
| thick | `==>` / `==>|label|` | 太線 |

### 10.5 ノード操作

| 操作 | UIアクション | 内部処理 |
|---|---|---|
| 追加 | ツールバー形状ボタン | `model.nodes.set(newId, {shape, label})` |
| テキスト編集 | ダブルクリック → インライン入力 | `model.nodes.get(id).label = newText` |
| 形状変更 | ダブルクリック → 形状バー選択 | `model.nodes.get(id).shape = newShape` |
| 色変更 | クリック選択 → カラーボタン | `model.styles.set(id, {fill, color})` |
| サブグラフ追加 | クリック選択 → 「📦 グループ」 | `model.subgraphs.push({...})` |
| 削除 | クリック選択 → Delete or 🗑 | ノード + 関連接続を削除 |

### 10.6 接続操作

| 操作 | UIアクション |
|---|---|
| 追加 | 「🔗 接続」→ ノード2つ選択 → ラベル入力 |
| ラベル編集 | 接続一覧の ✏️ ボタン or 接続線ダブルクリック |
| 接続線ダブルクリック | 方向反転 ⇄ ／削除 🗑 ／線種変更／ラベル編集 の操作パネルを表示 |
| 削除 | 接続一覧の ✕ ボタン or 選択 + Delete |

### 10.7 サブグラフ操作

SVGダブルクリックでサブグラフ編集パネル（名前変更・ノードの追加／除外）を表示する。

### 10.8 Undo/Redo

操作ごとに JSON スナップショットをスタックに保存し、`Ctrl+Z` / `Ctrl+Y` で復元する（エディタ内ローカルスタック）。

### 10.9 右クリックメニュー・パン非対応

ノード右クリック: ラベル編集・色変更・ここから接続・削除。エッジ右クリック: 編集・線種切替・削除。

ズーム/フィット/`Ctrl`+ホイールには対応するが、**方向ボタン・中ボタンドラッグによるパンには対応していない**。これは他20種のビジュアルエディタと非対称な既知の制限で、[22章](#22-ズーム--パン)で詳述する。

---

## 11. クラス図ビジュアルエディタ

### 11.1 対象

先頭行が `classDiagram` のMermaidブロック。

### 11.2 データモデル

```
classes: [ { name, properties: [string], methods: [string] } ]
relations: [ { from, to, type, label } ]
```

### 11.3 関連タイプ

| タイプ | Mermaid 構文 | 意味 |
|---|---|---|
| inheritance | `<\|--` | 継承 |
| composition | `*--` | コンポジション |
| aggregation | `o--` | 集約 |
| association | `-->` | 関連 |
| link | `--` | リンク |
| dependency | `..>` | 依存 |
| realization | `..\|>` | リアライゼーション |

### 11.4 パース対応構文

- `class ClassName { ... }` ブロック形式
- `ClassName : +method()` / `ClassName : -property` インライン形式
- `ClassA <|-- ClassB` / `ClassA --> ClassB : label` 関連形式

### 11.5 画面レイアウトと右クリック

左パネル（フォーム）+ 右パネル（プレビュー）の2カラム分割。右クリックでの属性・メソッド追加のみ**ネイティブ `prompt()`** を使用する（他のダイアログはカスタムUI）。

---

## 12. シーケンス図ビジュアルエディタ

### 12.1 対象

先頭行が `sequenceDiagram` のMermaidブロック。**`alt`・`opt`・`loop`・`par`・`activate` は未対応。**

### 12.2 データモデル

```
participants: [{ type: 'participant'|'actor', name, alias? }]
messages: [{ from, to, type, text }]
notes: [{ position, over, text }]
```

### 12.3 メッセージタイプ

| タイプ | Mermaid 構文 | 意味 |
|---|---|---|
| solid_arrow | `->>` | 実線矢印 |
| dotted_arrow | `-->>` | 点線矢印 |
| solid_line | `->` | 実線 |
| dotted_line | `-->` | 点線 |
| solid_cross | `-x` | 実線×印 |
| dotted_cross | `--x` | 点線×印 |
| solid_open / dotted_open | `-)` / `--)` | 実線/点線オープン矢印 |

### 12.4 ノート位置

| 位置 | Mermaid 構文 |
|---|---|
| right of | `Note right of Participant` |
| left of | `Note left of Participant` |
| over | `Note over Participant` |

### 12.5 メッセージ並び替え

↑↓ ボタンで `messages[]` 配列内の順序を変更する（この専用エディタでは実際の並べ替え操作として機能する。汎用フォームエディタ14種の↑↓との違いは[17章](#17-汎用フォームダイアグラムエディタ14種)参照）。

### 12.6 ブロック背景（rect）

| 項目 | 内容 |
|---|---|
| 対応構文 | `rect rgb(...)` 〜 `end` |
| 追加手順 | 「🟦 ブロック追加」→ カラーパレットで色選択 → 始点メッセージをクリック → 終点メッセージをクリック |
| 編集 | リストの「ブロック開始」行の ✏️ ボタンでカラーパレットから色変更 |
| 削除 | リストの「ブロック開始」行の ✕ ボタンで `rect_start`/`rect_end` ペアを一括削除 |
| カラーパレット | ダーク系6色 + ライト（半透明）系6色のプリセット + カスタム色入力 |

### 12.7 SVG インタラクション

ライフライン間をドラッグしてメッセージを新規作成できる。メッセージ線クリックでメッセージ種類をサイクル切り替え、メッセージテキストのダブルクリックで編集ダイアログを表示。右クリックで順序変更も可能。

---

## 13. マインドマップビジュアルエディタ

### 13.1 対象

先頭行が `mindmap` のMermaidブロック。

### 13.2 データモデル

```
root: {
  text: string,
  shape: 'default'|'rounded'|'square'|'cloud'|'hexagon'|'bang',
  children: [Node]   // 再帰構造
}
```

### 13.3 ノード形状

| 形状 | Mermaid 構文 | 表示名 |
|---|---|---|
| default | `text` | デフォルト |
| rounded | `(text)` | 角丸 |
| square | `[text]` | 四角 |
| cloud | `)text(` | 雲形 |
| hexagon | `{{text}}` | 六角形 |
| bang | `)text(` | バン |

### 13.4 インデントベースのパース

Mermaid のマインドマップ構文はインデント（スペース数）で階層を表現する。パーサーは各行のインデントレベルを計測し、ツリー構造を構築する。

### 13.5 操作

| 操作 | 方法 |
|---|---|
| 子ノード追加 | 各ノードの「+」ボタン |
| テキスト編集 | 「✎」→ テキスト入力 → 確定 |
| 形状変更 | 「形状」ドロップダウン |
| 削除 | 「✕」（子ノードも再帰的に削除） |
| 親付け替え | SVG上でドラッグ（子孫へのドロップは禁止） |

ルートノードは削除不可。

---

## 14. 象限チャートビジュアルエディタ

### 14.1 対象

先頭行が `quadrantChart` のMermaidブロック。

### 14.2 データモデル

```
title: string
xAxisLeft: string, xAxisRight: string
yAxisBottom: string, yAxisTop: string
quadrant1~4: string
points: [{ name, x: 0.0~1.0, y: 0.0~1.0 }]
```

### 14.3 日本語（非ASCII）ラベル対応（v0.5.1）

Mermaid のレキサーは引用符なしラベルを `[A-Za-z]` / `\w` ベースでしかトークン化できず、軸・象限・データ点名に日本語が含まれると本来はパースエラーになる。本エディタはこの制約を解消しており、**生成時に軸ラベル・象限ラベル・データ点名を自動でダブルクォート `"..."` で囲む**ため日本語を含むラベルを問題なく使える。読み戻し（パース）も引用符付きラベルに対応済み。スペースや全角コロンを含むデータ点名も扱える。

- `title` のみは引用符を付けない。Mermaid の `title` 構文は行末までを1つのタイトルとして読むため、引用符がなくても日本語を含め問題なく扱える
- **残る制限**: ラベル内に `"`（ダブルクォート）が含まれる場合、保存時にその文字は削除される
- v0.5.1 より前に引用符なしで保存された図がある場合、一度エディタを開いて保存し直すことで自動的に引用符付きの形式へ修正される

> 旧バージョンの本書・README では「象限チャートは ASCII 文字のみ推奨」としていたが、これは v0.5.1 で解消済みであり誤り。

### 14.4 データ点操作

SVG上のドラッグでデータ点を移動でき、ドラッグ中は座標がリアルタイムに表示される。**点とラベル文字列の対応付けは近傍推定によるため、データ点同士が近接していると誤対応する可能性がある。**

### 14.5 座標範囲

- X / Y ともに `0.0` ～ `1.0`
- 入力フィールドは `step="0.01"` の number input

---

## 15. ガントチャートビジュアルエディタ

### 15.1 対象

先頭行が `gantt` のMermaidブロック。

### 15.2 データモデル

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

### 15.3 スタイル管理（`%%gantt-style`、Mermaid標準構文ではない独自拡張）

セクションおよびタスクの背景色は `%%gantt-style bg:#hex` コメントとして Mermaid コードブロック内に格納される。

```
%%gantt-style bg:#1a73e8
section フェーズ1
%%gantt-style bg:#34a853
タスク1 :a1, 2024-01-01, 7d
```

- セクションの bgColor は配下の全タスクに自動適用（SVG上）
- タスク個別の bgColor が設定されている場合はそちらが優先
- SVGポストプロセス: `_applyDiagramColors()` メソッドで Mermaid が生成した SVG を後処理し、`rect` 要素の `/\btask\d*\b/` クラスに対して背景色を適用する

### 15.4 タスクステータス

| ステータス | Mermaid 構文 | 意味 |
|---|---|---|
| (なし) | `(空)` | 通常タスク |
| done | `done,` | 完了済み |
| active | `active,` | 進行中 |
| crit | `crit,` | 重要 |
| milestone | `milestone,` | マイルストーン |

### 15.5 タスク定義構文

```
タスク名 : [status,] [id,] [startDate|after id,] duration
```

例:
```
要件定義 : done, req, 2024-01-01, 30d
設計 : active, design, after req, 20d
```

### 15.6 操作

| 操作 | 方法 |
|---|---|
| セクション追加 | 「+ セクションを追加」ボタン |
| セクション折りたたみ | セクションヘッダーの ▼/▶ トグルボタン（折りたたみ時は `📂 name (N)` とタスク数を表示） |
| セクション色設定 | セクションヘッダーのカラードット → カラーピッカー（18色プリセット + カスタム色 + クリアボタン） |
| タスク追加 | 各セクション内の「+ タスクを追加」ボタン |
| タスク編集 | 名前/ID/ステータス/開始日/依存先/期間の各入力欄 |
| タスク色設定 | タスク行のカラードット → カラーピッカー（セクション色の上書き） |
| **タスクバーのドラッグ** | SVG上でタスクバー本体をドラッグすると**開始日**が変わる。バー右端8pxをドラッグすると**期間**が変わる |
| タスク並び替え | ドラッグハンドル（≡）でセクション内・セクション間を移動。ドロップ位置は青線で表示 |
| 削除 | 各セクション/タスクの「✕」ボタン |
| 右クリック | タスクの開始日を ±1日・±7日 |

**制限:** `after` 依存で開始日が決まるタスクはドラッグでの開始日変更ができない（依存元タスクの終了日に従属するため）。

---

## 16. ER図ビジュアルエディタ

### 16.1 対象

先頭行が `erDiagram` のMermaidブロック。

### 16.2 データモデル

```
entities: [ { name, attributes: [{ type, name, key }] } ]
relationships: [ { from, fromCard, to, toCard, label } ]
```

### 16.3 カーディナリティ

| 記号 | Mermaid 構文 | 意味 |
|---|---|---|
| `\|\|` | `\|\|` | 1（exactly one） |
| `o\|` | `o\|` | 0 or 1 |
| `}\|` | `}\|` | 1 以上 |
| `}o` | `}o` | 0 以上 |
| `\|{` | `\|{` | 1 以上（逆方向） |
| `o{` | `o{` | 0 以上（逆方向） |

### 16.4 属性キー

| キー | Mermaid 構文 | 意味 |
|---|---|---|
| PK | `PK` | 主キー |
| FK | `FK` | 外部キー |
| UK | `UK` | ユニークキー |
| (なし) | | キーなし |

### 16.5 操作

| 操作 | 方法 |
|---|---|
| エンティティ追加 | 「+ エンティティを追加」ボタン |
| エンティティ名変更 | リスト内の名前をクリック → インライン編集 |
| 属性追加 | 各エンティティ内の「+ 属性」ボタン |
| 属性編集 | 型・名前をクリック → インライン編集、キーをクリック → サイクル切替 |
| リレーション追加 | 「+ リレーション追加」ボタン |
| リレーション編集 | リスト内の「✏️」ボタン → ダイアログ |
| 削除 | 各項目の「✕」ボタン |

### 16.6 SVG インタラクション

エンティティ名クリックでパネルの該当箇所へスクロール・ハイライト。ダブルクリックでコンテキストメニュー（名前変更・属性追加・削除）を表示。エンティティ間の接続もSVGクリックで作成できる。

---

## 17. 汎用フォームダイアグラムエディタ（14種）

### 17.1 対象

`extra-diagram-editors.js` に実装された、共通基底クラス `GenericFormDiagramEditor` の派生クラス。専用エディタ7種ではカバーしない図種を、「セクション別リスト編集 + ライブSVGプレビュー + コードモード切替」という共通UIパターンで提供する。

**対象14種**: stateDiagram-v2 / pie / journey / gitGraph / timeline / requirementDiagram / C4 / sankey-beta / xychart-beta / block-beta / zenuml / packet-beta / architecture-beta / kanban

このうち **zenuml はバンドル未同梱のためコード編集のみ**（GenericFormDiagramEditorのGUIは提供されず、[18章](#18-mermaidコードエディタフォールバック)のフォールバックエディタへ回る）。実質的にGUI編集が機能するのは13種。

### 17.2 専用エディタ7種との違い

| 項目 | 専用エディタ7種 | 汎用フォームエディタ13種 |
|---|---|---|
| エディタ内Undoスタック | フローチャートは独自スタックを持つ | **持たない**（`Ctrl+Z`はドキュメント全体のVS Code undoに委譲） |
| `↑`/`↓`ボタン | シーケンス図は実際の並べ替えとして機能 | **リスト内フォーカス移動のみ**。実際の並べ替えはD&Dまたは右クリックメニュー |
| オンボーディング表示 | 一部あり | `DiagramCommon.mountOnboarding()` で共通化（localStorage `mve.onboarding.dismissed.<key>` で既読管理） |
| ズーム/パン | フローチャートのみ独自実装でパン非対応、他はDiagramZoom共通基盤 | `DiagramZoom` 共通基盤（[22章](#22-ズーム--パン)） |

### 17.3 主要な図種別メモ

| 図種 | 備考 |
|---|---|
| xychart-beta | 向き（縦/横）・カテゴリ・Y軸（ラベル・min・max・**自動追従が既定ON**）・bar/lineシリーズを編集可能。**表編集モードが既定**。※「表示モード（重ね合わせ/積み上げ/横並び）」や `%% mdve:xy=` メタコメントによる制御は**実装されていない**（旧CHANGELOGにのみ存在した記述で、コード上は一度も実装されたことがない） |
| pie / sankey-beta | 表編集モードあり（pieは既定ON） |
| architecture-beta | 組込アイコン5種のみ（cloud/database/disk/internet/server）。**カスタムアイコンパックはCSPにより無効** |
| block-beta / C4 | ソース上「簡易版（simplified）」と明記。blockは行ごとの自由テキスト編集 |
| packet-beta | ビット範囲の重複検証なし |
| requirementDiagram | 非ASCII値を自動引用符化。パースは正規表現ベースでネストした波括弧に弱い |
| zenuml | バンドル未同梱のためコード編集のみ。挿入ピッカーからも除外 |

---

## 18. Mermaidコードエディタ（フォールバック）

### 18.1 対象

専用エディタ・汎用フォームエディタのいずれの判定にも一致しないMermaidダイアグラム、および **zenuml**（バンドル未同梱のため常にここへフォールバック）。

### 18.2 画面レイアウト

左右2カラム分割: 左＝Mermaidコードのテキストエリア、右＝SVGライブプレビュー。

### 18.3 プレビュー更新タイミング

テキストエリアの `input` イベント発火後、500msのデバウンスで `mermaid.render()` を実行する。

### 18.4 キーボード操作

| キー | 動作 |
|---|---|
| `Ctrl+Enter` | 保存して閉じる |
| `Escape` | キャンセルして閉じる |
| `Tab` | 4スペース挿入 |

---

## 19. テーブルビジュアルエディタ

### 19.1 対象

Markdown テーブル（ヘッダー行 + 区切り行 + データ行）。独立ブロックとして扱われる（[5.2章](#52-ブロック--トークン範囲v054最重要の変更点)）。

### 19.2 起動トリガー

テーブルブロック上にマウスホバー → 「✎ テーブルを編集」オーバーレイボタン表示 → クリック。`DiagramCommon` / `DiagramZoom` を使わない独自実装で、オンボーディング表示もない。

### 19.3 パース仕様

```
| ヘッダ1 | ヘッダ2 |    → headers[]
|---------|---------|    → 区切り行（配置指定は読み捨てられ、パースに反映されない）
| データ  | データ   |    → rows[][]
```

### 19.4 セル編集

全セルは**自動高さ調整の `<textarea>`**（v0.5.0、折り返し対応）。セル内改行はMarkdown上の `<br>` と双方向変換される。

### 19.5 操作

| 操作 | 方法 |
|---|---|
| セル編集 | 各セルの `<textarea>` に直接入力（自動高さ調整・折り返し対応） |
| 列/行の追加 | 左右上下への追加ボタン、または右クリックメニュー |
| 列削除 | 2列以上のとき可能（右クリックメニュー「この列を削除」） |
| 行削除 | 2行以上のとき可能（右クリックメニュー「この行を削除」） |
| 列幅調整 | `.col-resize-handle` をドラッグ（最小50px）。**表示上のみの調整で、Markdownテーブルには列幅の概念がないため文書には保存されない** |
| 右クリック | 列追加(左/右) / 行追加(上/下) / この列を削除 / この行を削除（独自メニュー） |

### 19.6 Markdown生成と既知の制限

保存時に `headers[]` と `rows[][]` から Markdown テーブル構文を再生成する。

**配置（alignment）は未対応。** `_generate()` は区切り行を常に `-` のみ（例: `|---|---|`）で出力し、`_parse()` も区切り行（`lines[1]`）を読み取らずに捨てる。そのため:

- **既存の `:---:` / `:---` / `---:` のような配置指定は、テーブルエディタで開いて保存し直すと失われる。**
- テーブルエディタ経由では配置指定を新たに設定する手段がない。

エディタ内Undoはなし（`Ctrl+Z`はドキュメント全体のVS Code undoに委譲）。

> 旧版の本書・README にあった「テーブルのヘッダーの配置変更」機能の記述は実装が存在しないため削除した。

---

## 20. 数式（KaTeX）編集

### 20.1 対応構文

| 構文 | 種別 | ブロックモデル上の扱い |
|---|---|---|
| ` ```math `〜` ``` ` フェンス | ディスプレイ数式 | `type:'code'` + `lang:'math'`。独立した特殊ブロック |
| `$...$` | インライン数式 | 通常のテキストセクション内。描画後DOMの `TreeWalker` 走査で置換 |
| `$$...$$` | ディスプレイ数式（インライン文脈） | 同上 |

marked 4.3.x は数式構文をネイティブに解釈しないため、インライン/ディスプレイの `$` 記法は marked が素通しした後、レンダリング済みDOMを `TreeWalker` で走査して置換する後処理方式を取る。走査時に `CODE` / `PRE` / `SCRIPT` / `STYLE` / `A` / `TEXTAREA` の子孫ノードと、既にKaTeXでレンダリング済みのノードはスキップする。

### 20.2 レンダリング設定

```javascript
katex.renderToString(src, {
  throwOnError: false,
  output: 'html',
  strict: 'ignore',
  trust: false,
});
```

- エラー時は `<span class="math-error" title="理由">`（赤背景、`cursor:help` でツールチップ表示）
- KaTeX未ロード時は `.math-fallback` としてソースをそのまま表示

### 20.3 数式ブロック（```math```）の編集UI

- textarea + 200msデバウンスのライブプレビュー
- **LaTeX記号パレット**: 「構造」「演算子」「関係」「大記号」「ギリシャ」「集合・論理」「行列・整列」の7グループ。テンプレート挿入時は `$1`/`$2` のプレースホルダでカーソル位置を制御
- 起動: 数式ブロックホバー時の「✎ 数式を編集」オーバーレイをクリック

### 20.4 ツールバーからの挿入

ツールバーの ∑（数式）ボタンで、選択範囲があればインライン `$..$` に、なければ ` ```math ` フェンスのテンプレートを挿入する（[6.2章](#62-構造要素挿入)）。

---

## 21. 画像の表示・保存

### 21.1 相対パス画像の表示解決

| 項目 | 内容 |
|---|---|
| 絶対扱い（解決不要） | `data:` `blob:` `http(s):` `vscode-webview:` `vscode-resource:` `file:` `#` |
| 解決対象 | それ以外の相対パス。`resolveImage` メッセージでホストに解決依頼 |
| バッチ処理 | 同一 `src` はまとめて1リクエストにバッチ |
| キャッシュ | WebView側の `_imageUriCache` にキャッシュ（ホスト側キャッシュなし） |
| 表示状態 | 読み込み中は `.image-loading`、失敗は `.image-error`（破線枠） |

ホストは `decodeURI` してから md ファイルの階層基準で `Uri.joinPath` → `asWebviewUri()` した結果を `imageResolved` として返す。

### 21.2 画像のドラッグ&ドロップ保存

| 項目 | 内容 |
|---|---|
| ドロップ対象 | ブロック上、またはエディタ余白 |
| 対応拡張子 | `png` `jpe?g` `gif` `webp` `svg` `bmp` `ico` `avif` |
| 保存先 | `<mdと同階層>/images/`（ディレクトリが無ければ作成） |
| ファイル名 | サニタイズ（ディレクトリ成分・危険文字を除去）し、既存ファイルと衝突する場合は連番サフィックスで回避 |
| 挿入テキスト | `![altText](images/xxx.png)`（altTextはファイル名から拡張子を除いたもの） |

処理フロー: 画像ファイルをbase64化 → `saveImage` メッセージ送信 → ホストがファイル書き込み → `imageSaved`（relPath / webviewUri / altText）を返送 → WebViewが挿入テキストを生成しカーソル/ドロップ位置に挿入。

> この機能により、拡張機能は開いている .md ファイル1つだけでなく**その親ディレクトリの `images/` サブディレクトリにも書き込みを行う**。「ファイルシステムアクセスは開いているドキュメント1ファイルのみ」という記述は不正確であり削除した。

---

## 22. ズーム / パン

v0.5.5でMermaid図の拡大縮小・移動に対応した。**単一の共通実装ではなく、3つの独立した系統が併存する。**

| 系統 | 対象 | ズーム(+/-) | フィット | 方向ボタン | ホイール | パン |
|---|---|---|---|---|---|---|
| A. 編集モード共通（`DiagramZoom`） | 専用エディタ6種（フローチャート除く）+ 汎用フォーム13種 = 計19種 | ✅ | ✅（⊞） | ✅（◀▶▲▼、60px刻み） | `Ctrl`+ホイール | ✅ 中ボタンドラッグ |
| B. フローチャート編集モード独自 | フローチャートのみ | ✅ | ✅（⊞） | ❌ | `Ctrl`+ホイール | ❌ **非対応** |
| C. 本文プレビュー用（`PreviewMermaidZoom`） | 本文中の全Mermaid図（編集していない状態、種別問わず） | ✅ | ✅（⊞、はみ出す図は初回自動フィット） | ✅（◀▶▲▼） | `Ctrl`+ホイール | ✅ 左ドラッグ（Pointer Capture） |

- 系統A・Cの倍率範囲: A=0.2〜3.0（step 0.15）、C=0.2〜4.0（step 0.2）
- 系統Cのプレビューコンテナは `max-height: 70vh`
- **系統B（フローチャート）だけパン非対応**という非対称性は既知の制限（[DESIGN.md ADR-016](DESIGN.md#adr-016-ズームパンを3系統に分けて実装した理由)参照）
- いずれもズーム/パンは表示上の操作であり、保存されるMarkdown/Mermaidコードには影響しない

---

## 23. 検索 / 置換

| 項目 | 内容 |
|---|---|
| 起動 | `Ctrl+F` / `Ctrl+H` / ツールバー🔍ボタン |
| オプション | `Aa`（大文字小文字を区別）・`.*`（正規表現） |
| 検索対象 | **レンダリング結果ではなく生のMarkdown全文** |
| 移動 | `Enter`/`Shift+Enter` = 次/前の一致（置換欄にフォーカス中は 置換/全置換） |

**ハイライト方式:**
- HTMLテキストノード: `<mark class="search-highlight">` で囲む。現在位置は `mark.current` でオレンジ枠表示し、`scrollIntoView` で表示領域にスクロール
- SVG（Mermaid図）内: `<tspan class="svg-search-highlight">` に分割して埋め込む。失敗時は元のSVGテキストに戻し `.svg-search-hit-fallback` を付与
- SVG側のヒット件数はHTML側の件数と厳密には一致しない「視覚的ヒント」に留まる（SVGテキストのトークン化がMarkdown側の検索ロジックと完全同一ではないため）

**置換:**
- `replace-one`（置換ボタン）: 現在の一致1件のみを置換して次へ進む
- `replace-all`（すべて置換）: ドキュメント全体のMarkdownテキストに対して文字列置換を行い、1回の `edit` メッセージで送信する

---

## 24. 変更ハイライト

v0.5.0で追加。VS Code標準の差分表示がこのカスタムエディタには届かないため、保存前後の変更箇所をエディタ上で視覚的に確認できるようにした機能。

| 項目 | 内容 |
|---|---|
| `baselineText` | 最後に「dirty でない」と通知された時点（＝直近の保存時点）の全文 |
| 比較単位 | baseline も現在のドキュメントと同じ H1/H2 ブロック範囲（[5.2章](#52-ブロック--トークン範囲v054最重要の変更点)）に分割 |
| 突合方式 | baseline側の raw文字列 → 出現回数のMapを作り、各ブロックのrawを照合しながら出現回数を消費する。同一内容のブロックが複数あっても1対1で対応付けられる |
| 表示 | 一致しないブロックに `.block-changed` を付与: 左ガターバー + 淡い背景色 + 右上「未保存」バッジ（ホバー時・編集中は非表示） |
| 解除 | 保存（`Ctrl+S`等）すると `saveStatus{dirty:false}` を受けて baseline が更新され、ハイライトが解除される |

---

## 25. PDF出力

### 25.1 起動方法

ツールバーの右クリックメニュー内「📄 PDF として出力」（単一選択・複数選択・背景のいずれからも実行可能、[8章](#8-ブロック右クリックメニュー挿入位置ピッカー)参照）。

### 25.2 処理フロー

1. WebViewが現在のレンダリング済みDOMを `exportPdf` メッセージでホストに送信
2. 未保存（ファイルパスがない）ドキュメントの場合はエラーメッセージを表示して中断
3. ホストが `<img src>` の相対パスをmdの階層基準で絶対 `file://` URIに書き換える（`data:`/`blob:`/`http(s):`/`file:`/`vscode-*`/`#` はそのまま）
4. `katex.min.css` と `editor.css` を `file://` 参照する、ライトモード固定・`@media print` ルール付きの単体HTMLを生成
5. `os.tmpdir()` に `mdve-pdf-<timestamp>-<name>.html` として書き出す
6. OS既定ブラウザで開く（win32: `cmd /c start` / darwin: `open` / linux: `xdg-open`。失敗時は `env.openExternal` にフォールバック）
7. ページの `load` イベントから600ms後に `window.print()` を自動実行
8. 出力ページ上部に「保存先にmdのディレクトリを指定してください」という案内バナーを表示

### 25.3 テーマの扱い

PDF出力時は一時的にMermaidを `default` テーマへ切り替えて出力し、完了後に元のテーマへ復帰する（ダークテーマのまま出力すると背景が黒いPDFになるため）。

### 25.4 制限

- 実際のPDFファイル生成はOSブラウザの印刷ダイアログでの「PDFとして保存」操作に依存し、拡張機能側では完結しない
- 保存先ディレクトリはユーザーが手動で指定する必要がある
- 一時HTMLファイルは `os.tmpdir()` に残置され、拡張機能側では削除しない

---

## 26. ホスト-WebView間通信プロトコル

### 26.1 WebView → ホスト（9種類）

| type | 主なペイロード | 動作 |
|---|---|---|
| `edit` | `{text}` | `WorkspaceEdit` で全文置換 → `applyEdit`。`isWebviewEdit`フラグでエコーバック抑止。完了後 `saveStatus` を返す |
| `ready` | `{}` | 初回 `update` + `saveStatus` を送出 |
| `openLink` | `{href}` | `http(s)`/`mailto`→`env.openExternal`。他スキーム→`vscode.open`。`#`は無視。相対パスはmdの階層基準で解決して`vscode.open` |
| `openAsText` | `{}` | `vscode.openWith(uri, 'default')` |
| `undo` | `{}` | `commands.executeCommand('undo')` |
| `redo` | `{}` | `commands.executeCommand('redo')` |
| `resolveImage` | `{src, requestId}` | `decodeURI`→mdの階層基準で`Uri.joinPath`→`asWebviewUri`→`imageResolved`を返す。ホスト側キャッシュなし |
| `saveImage` | `{name, dataBase64, requestId}` | ファイル名サニタイズ→`images/`ディレクトリ作成→重複名回避→base64デコードして書き込み→`imageSaved`（relPath/webviewUri/altText）を返す |
| `exportPdf` | `{html}` | `handleExportPdf()` を呼ぶ |

> 実際のメッセージ名は `resolveImage` / `imageResolved` である（旧版の本書・README にあった `imageResolve` という表記は誤り）。

v0.3.1時点は `edit` / `ready` の2種類のみだったが、`openLink` / `openAsText`（v0.3.1）、`undo` / `redo`、`resolveImage`（画像表示修正時）、`saveImage`（画像D&D保存）、`exportPdf`（PDF出力）が段階的に追加され、現在9種類になっている。

### 26.2 ホスト → WebView（4種類）

| type | ペイロード | 説明 |
|---|---|---|
| `update` | `{text}` | ドキュメント全文の送信 |
| `saveStatus` | `{dirty: boolean}` | 保存状態（dirty真偽） |
| `imageResolved` | `{requestId, src, uri, error?}` | `resolveImage` への応答 |
| `imageSaved` | `{requestId, ok, relPath?, webviewUri?, altText?, error?}` | `saveImage` への応答 |

### 26.3 循環更新防止

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
                              → saveStatus を送出
```

### 26.4 ドキュメント同期

- `onDidChangeTextDocument`: 自WebView発の編集（`isWebviewEdit`）でなければ `updateWebview()` で反映する（外部エディタ・git操作等の変更に追従）
- `onDidSaveTextDocument`: `saveStatus{dirty:false}` を送出
- 拡張機能は `document.save()` を自ら呼ばない。保存はVS Code標準の保存フロー（`Ctrl+S`等）に委ねる

---

## 27. セキュリティ仕様

詳細は [SECURITY.md](SECURITY.md) を参照。

### 27.1 CSP（Content Security Policy）

```
default-src 'none';
img-src ${cspSource} data: blob: https:;
style-src ${cspSource} 'unsafe-inline';
script-src 'nonce-${nonce}' 'unsafe-eval';
font-src ${cspSource};
worker-src ${cspSource} blob:;
connect-src ${cspSource};
```

> 旧版は「`script-src` 以外はすべて `'none'`」としていたが不正確。`img-src` に `https:` が含まれるため、Markdown本文に外部URL画像を記述すると通信が発生しうる（拡張機能自体が能動的に通信するわけではない）。

- nonce: 32文字ランダム英数字、全 `<script>` タグに付与
- `enableScripts: true`
- `localResourceRoots`: `[extensionUri/media, ドキュメントの親フォルダ, ワークスペースフォルダ（あれば）]`
- `retainContextWhenHidden: true`、`supportsMultipleEditorsPerDocument: false`

### 27.2 サニタイズ関数

| 関数 | 用途 | 実装箇所 |
|---|---|---|
| `sanitizeHtml(html)` | `DOMParser`で解析し、危険タグを要素ごと削除・`on*`属性を削除・`javascript:`/`vbscript:`スキームを除去。`data:`は`<img>`のみ許可（denylist方式） | editor.js |
| `escapeHtml(text)` | `<>&"` のエンティティ変換 | editor.js |
| `escapeHtmlAttr(text)` | HTML属性値のエスケープ | editor.js |
| `_escHtml(text)` | diagram-editors.js / extra-diagram-editors.js 内部用エスケープ | diagram-editors.js |

**除去対象タグ:** `script, iframe, object, embed, form, input, textarea, select, button, style, link, meta, base, applet, frame, frameset, layer, ilayer, bgsound`

### 27.3 Mermaid / KaTeX

- Mermaid: `securityLevel: 'loose'` — HTMLラベルを許可しつつ内部でDOMPurifyによりサニタイズ
- KaTeX: `trust:false` — `\includegraphics`等の危険になりうるLaTeXコマンドを無効化。`throwOnError:false` でエラーも安全に表示

### 27.4 ファイルシステム書き込み（開いているドキュメント以外への書き込みがある点に注意）

| 契機 | 書き込み先 |
|---|---|
| 本文編集 | 対象の`.md`ファイル（`WorkspaceEdit`） |
| 画像D&D | `<mdと同階層>/images/`（ディレクトリ作成 + ファイル書き込み） |
| PDF出力 | `os.tmpdir()`（一時HTMLファイル） |

「ファイルシステムアクセスは開いているドキュメント1ファイルのみ」という記述は不正確であり、上記2つの追加書き込み経路がある。

---

## 28. 依存パッケージ仕様

### 28.1 ランタイム依存

| パッケージ | バージョン | ライセンス | ロード方式 | 用途 |
|---|---|---|---|---|
| marked | ^4.3.0 | MIT | `media/vendor/marked.min.js`（ビルド時コピー） | Markdown lexer / parser |
| mermaid | ^11.14.0 | MIT | `media/vendor/mermaid.min.js`（ビルド時コピー） | ダイアグラム SVG レンダリング（21種類対応） |
| katex | ^0.17.0 | MIT | `media/vendor/katex.min.js` / `.css`（ビルド時コピー） | LaTeX 数式レンダリング |

**いずれも `node_modules` から直接ロードするのではなく、`esbuild.mjs` の `copyVendorAssets()` によりビルド時に `media/vendor/` へコピーされたファイルをWebViewが読み込む。** KaTeXはWebフォント一式（`.ttf`を除く）も同様にコピーされる。

### 28.2 開発依存

| パッケージ | バージョン | ライセンス | 用途 |
|---|---|---|---|
| @types/vscode | ^1.80.0 | MIT | TypeScript 型定義 |
| esbuild | ^0.19.0 | MIT | TypeScript ビルド + vendor アセットコピー |
| typescript | ^5.0.0 | Apache-2.0 | コンパイラ |
| @vscode/vsce | **^3.2.1** | MIT | VSIX パッケージング（Node.js 20+ が必須） |

### 28.3 バージョン固定（overrides）

`package.json` の `overrides` は現在**空**。以前（v0.4.1時点）は `lru-cache` を `~10.4.3` に固定していたが、`node_modules` を丸ごとVSIXへ含めない方式（[29章](#29-ビルドパッケージング仕様)）へ移行したことで固定が不要になり、撤廃されている。

---

## 29. ビルド・パッケージング仕様

### 29.1 ビルド構成（esbuild）

| 項目 | 値 |
|---|---|
| vendor アセットコピー | `esbuild.mjs` の `copyVendorAssets()` が `node_modules/{marked,mermaid,katex}` から `media/vendor/` へコピー（ビルドのたびに実行） |
| エントリポイント | `src/extension.ts` |
| 出力先 | `dist/extension.js` |
| フォーマット | CommonJS |
| 外部依存 | `vscode`（バンドルしない） |
| プラットフォーム | `node` |
| ソースマップ | 開発時: `true`, プロダクション: `false` |
| ミニファイ | プロダクション時のみ |

### 29.2 VSIX パッケージ

**コマンド:** `npm run package` → `vsce package --no-dependencies --no-yarn`

`--no-dependencies` により、vsceによる依存関係の解析・同梱チェックをスキップする（ランタイム依存はすべて`media/vendor/`へのビルド時コピーとして解決済みのため）。

**パッケージ内容（`.vscodeignore` による制御）:**

| 含まれる | 含まれない |
|---|---|
| `package.json` | `src/**` |
| `dist/extension.js` | `docs/**` |
| `media/editor.js` / `editor.css` | `.vscode/**` / `.github/**` |
| `media/mermaid-visual-editor.js` | `tsconfig.json` / `esbuild.mjs` |
| `media/diagram-editors.js` | `*.map` / `**/*.ts` |
| `media/extra-diagram-editors.js` | `test-all-features.md` |
| `media/vendor/**`（marked/mermaid/katex/フォント） | **`node_modules/**`（全面除外）** |
| `README.md` | `package-lock.json` / `yarn.lock` |

> v0.4.1時点は `node_modules/marked/` `node_modules/mermaid/` をVSIXに直接含める方式だったが、現在は vendor コピー方式に置き換わっており `node_modules` は一切含まれない（[DESIGN.md ADR-013](DESIGN.md#adr-013-vendor-アセットをビルド時コピー方式に変更し-vsce-を-3x-へ移行)参照）。

### 29.3 ビルドコマンド

| コマンド | 用途 |
|---|---|
| `npm run compile` | 単発ビルド（vendorコピー + esbuild） |
| `npm run watch` | ファイル監視 + 自動ビルド（開発用） |
| `npm run vscode:prepublish` | production ビルド（minify有効） |
| `npm run package` | `vsce package --no-dependencies --no-yarn` でVSIX作成 |

---

## 30. 既知の制限事項

| # | 制限事項 | 影響 | 回避策 |
|---|---|---|---|
| L01 | VSIXパッケージング（`vsce package`）にはNode.js 20以上が必要 | Node 18.x環境ではVSIX作成不可（`npm run compile`自体は可能） | ビルド環境をNode 20+にする |
| L02 | `npm run watch` 中の `node_modules` 削除不可 | `esbuild.exe` のファイルロック（Windows固有） | watchターミナルを停止してから削除 |
| L03 | `mermaid.js` が `unsafe-eval` を要求 | CSPに `unsafe-eval` が必要 | mermaid将来バージョンで解消される可能性あり |
| L04 | 一部ダイアグラムではSVG上の直接操作が限定的 | クラス図・ガントチャート等は主にフォーム/リスト編集 | 対象のビジュアルエディタ内フォーム、またはコードエディタで編集可能 |
| L05 | Mermaidコード保存時にフォーマットが正規化される | インデントや空行が変わる場合がある | 意味は保持される。見た目のみの差異 |
| L06 | **テーブルの配置（alignment）指定が保持されない** | `:---:` 等を付けたテーブルをテーブルエディタで開いて保存すると配置指定が失われる | テーブルエディタを使わずテキストエディタで配置を編集する |
| L07 | テーブルの列幅調整は表示のみで文書に保存されない | エディタを開き直すと列幅がリセットされる | 影響軽微（表示上の利便性のための機能） |
| L08 | フローチャートエディタのみズーム操作でパンに対応していない | 方向ボタン・中ボタンドラッグが使えず、大きな図の一部確認がしづらい | ホイールでのズーム、またはブラウザのスクロール操作で代替 |
| L09 | zenumlはビジュアル/汎用フォームいずれのGUI編集にも対応しない | コード編集のみ、挿入ピッカーにも表示されない | Mermaidコードを直接編集 |
| L10 | 汎用フォームエディタ13種にエディタ内Undoがない | 誤操作の取り消しはドキュメント全体のUndo（`Ctrl+Z`）のみ | 保存前にキャンセルして再編集する |
| L11 | シーケンス図の `alt`・`opt`・`loop`・`par`・`activate` が未対応 | これらを含む図はビジュアルエディタで完全に編集できない | コードエディタ（フォールバック）で該当ブロックを直接編集 |
| L12 | 象限チャートの点とラベルの対応付けは近傍推定 | データ点が密集していると誤対応の可能性がある | データ点を離して配置するか、コードで確認・修正する |
| L13 | ラベル内の `"`（ダブルクォート）は保存時に削除される（象限チャート） | 引用符を含むラベルは完全な形で保持できない | ラベルに引用符を使わない |
| L14 | `img-src` CSPが`https:`を許可しているため、外部URL画像を含む文書では通信が発生しうる | 「完全にネットワーク遮断」ではない | 社内利用ポリシー上問題があれば外部URL画像の使用を避ける |
| L15 | architecture-betaのカスタムアイコンパックはCSP制約により無効 | 組込み5種のアイコンのみ使用可能 | 組込みアイコンで代替するか、コードエディタでSVGアイコンの直接指定を試す（動作は保証されない） |

---

*最終更新: 2026年7月21日（v1.0.0 対応）*

# Markdown Visual Editor

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![No Telemetry](https://img.shields.io/badge/telemetry-none-brightgreen.svg)](#privacy--security)
[![100% Local](https://img.shields.io/badge/network-offline-blue.svg)](#privacy--security)
[![Mermaid 11.14](https://img.shields.io/badge/Mermaid-11.14-ff3670.svg)](https://mermaid.js.org/)
[![VS Code ^1.80](https://img.shields.io/badge/VS%20Code-%5E1.80-007ACC.svg)](https://code.visualstudio.com/)

> **EN:** A WYSIWYG Markdown editor for VS Code. Edit Markdown directly in its rendered preview, with **GUI editing for 21 Mermaid diagram types** (flowchart, sequence, class, ER, mindmap, gantt, quadrant, state, pie, journey, gitGraph, timeline, requirement, C4, sankey, xychart, block, ZenUML, packet, architecture, kanban) and tables. **100% local** — no network calls, no telemetry, no authentication.

Markdown ファイルを **プレビュー表示のまま直接編集** できる VS Code 拡張機能です。  
Mermaid ダイアグラム **21 種類** のビジュアル（GUI）編集と、テーブルの GUI 編集にも対応しています。

完全ローカル動作 — ネットワーク通信を一切行わず、テレメトリも送信しません。

---

## 主な機能

### WYSIWYG Markdown 編集

- 見出し・段落・リスト・コードブロックなどがレンダリングされた状態で表示
- ブロックを **ダブルクリック** すると Markdown ソースが表示され、その場で編集
- `Escape` / `Ctrl+Enter` / ブロック外クリックで確定、即座に再レンダリング
- 編集内容はファイルに自動保存

### ツールバー

ワンクリックで以下の要素を挿入：

| ボタン | 挿入内容 |
|---|---|
| H1 〜 H6 | 見出し |
| **B** / *I* / ~~S~~ / `Code` | インラインスタイル |
| リンク / 画像 | `[text](url)` / `![alt](url)` |
| 区切り線 | `---` |
| 表 | 3×3 の Markdown テーブル |
| Mermaid | ダイアグラム種別選択ピッカー（21 種類） |

> **挿入位置ピッカー:** ブロック編集中でない場合、ツールバーボタンを押すと挿入位置選択ダイアログが表示され、「先頭に挿入」または任意のブロックの後に挿入できます。

### ツールバー右端のユーティリティ

| ボタン | 機能 |
|---|---|
| 🔍 検索 | 検索・置換バーを表示（`Ctrl+F` / `Ctrl+H` でも起動）。大文字・正規表現・一括置換に対応。**SVG 図中の文字も検索ヒットで強調表示**（`<tspan>` 分割による黄色の縁取り） |
| ☀️ / 🌙 テーマ切替 | VS Code のテーマと独立してライト／ダークを強制。Mermaid 図の色も連動 |
| 📝 テキストで開く | 当該 Markdown を標準テキストエディタで開き直し |

### リンクのクリック動作

- 通常クリックではリンクを踏まず、誤作動を防止
- **`Ctrl + Click`**（macOS は `Cmd + Click`）で OS のデフォルトハンドラで開く
  - `http://` / `https://` / `mailto:` → 外部ブラウザ・メーラー
  - その他（相対パスなど）→ VS Code 内で `vscode.open` で開く

### テーブル GUI 編集

- セルの直接入力・編集
- 行・列の追加／削除
- テーブルヘッダーの配置変更

---

## Mermaid ダイアグラム — ビジュアルエディタ

Markdown 内の Mermaid コードブロックを自動検出し、ダイアグラム種別に応じた専用ビジュアルエディタを起動します。  
SVG プレビューと設定パネルを併用した直感的な GUI 操作で、Mermaid 構文を知らなくても図を作成・編集できます。

### 共通 UX 基盤（全 21 種に適用）

- **初回オンボーディングヒント** — 各エディタを初めて開いた際に使い方ガイドを表示。「次回から表示しない」を保存
- **キーボードショートカット** — `Delete` 削除 / `↑↓` 並び替え / `Enter` 編集 / `Ctrl+Z`・`Ctrl+Y` 元に戻す/やり直し
- **ドラッグ & ドロップ並び替え** — 左パネルのリスト項目を掴んで並べ替え
- **右クリックコンテキストメニュー** — リスト項目で `編集 / ↑上に移動 / ↓下に移動 / 🗑 削除`、SVG 上で各図種に応じた操作（後述）
- **レスポンシブレイアウト** — 画面幅に応じて左パネルと SVG エリアを縦積みに切替

### フローチャート (`flowchart` / `graph`)

- ノード追加・編集・削除（ラベル・形状の選択）
- エッジ追加（接続元 → 接続先の選択）、ラベル・線種の編集
- SVG 上でノードをクリックして選択、ダブルクリックで編集
- SVG 上でエッジをクリックしてラベル・線種を変更
- SVG 上でエッジをダブルクリック → 方向反転 ⇄ ／削除 🗑 ／線種変更／ラベル編集
- SVG 上でサブグラフをダブルクリック → 名前変更・ノード追加／除外
- 方向切り替え（TB / LR / RL / BT）
- **SVG 右クリックメニュー** — ノード上で `ラベル編集 / 色変更 / ここから接続 / 削除`、エッジ上で `編集 / 線種切替 / 削除`
- **レイアウトエンジン切替** — Dagre / ELK / ELK ツリー をツールバーで選択。`%%{init:{"layout":"..."}}%%` ディレクティブとして保存
- **サブグラフの入れ子化** — サブグラフ一覧で複数チェック → 「🗂️ 複数グループを 1 つに結合」、または個別に「親グループ」を選択（サイクル防止付き）

### クラス図 (`classDiagram`)

- クラスの追加・編集・削除
- 属性（プロパティ）とメソッドの管理
- リレーション（継承・実装・関連・依存など）の追加・編集・削除
- SVG 上でクラスをクリック → リストパネルの該当箇所にスクロール・ハイライト
- SVG 上でリレーションの線をクリック → 編集ダイアログを表示
- **SVG 右クリックメニュー** — クラスノード上で `クラス名編集 / 属性追加 / メソッド追加 / 削除`、リレーション上で `編集 / 削除`

### シーケンス図 (`sequenceDiagram`)

- アクター / 参加者の追加・編集・削除・並べ替え
- メッセージの追加・編集・削除（ラベル・種類の選択）
- メッセージの並び替え（↑↓ ボタン）
- ノートの追加・編集・削除（位置指定: right of / left of / over）
- SVG 上でメッセージの線をクリック → 種類変更
- SVG 上でメッセージのテキストをダブルクリック → テキスト編集
- **SVG 右クリックメニュー** — 参加者上で `編集 / 削除`、メッセージ線上で `編集 / ↑↓ 順序変更 / 削除`

### マインドマップ (`mindmap`)

- ノードの追加・編集・削除（テキスト・形状の選択）
- ツリー構造の階層操作
- SVG 上でノードをドラッグ＆ドロップして親ノードを変更（再グループ化）
- SVG 上でノードをダブルクリックしてテキストをインライン編集
- **SVG 右クリックメニュー** — ノード上で `子ノード追加 / 名前を編集 / このノードを削除`

### 象限チャート (`quadrantChart`)

- タイトル・軸ラベル・象限ラベルの設定
- データポイントの追加・編集・削除（名前・X/Y 座標）
- SVG 上でデータポイントをドラッグ＆ドロップして位置を変更
- SVG 上でデータポイントをダブルクリックして名前を編集
- ドラッグ中のリアルタイム座標表示
- **SVG 右クリックメニュー** — ポイント上で `編集 / 削除`

> **制限事項:** 象限チャートの構文解析器の制約により、タイトル・軸ラベル・象限ラベル・データポイント名は **ASCII 文字のみ** を推奨します（Mermaid 11 でも一部 CJK で解析エラーとなる場合があります）。

### ガントチャート (`gantt`)

- セクション・タスクの追加・編集・削除
- タスクの日付・期間・ステータス・依存関係の設定
- タイトル・日付フォーマット・軸フォーマットの設定
- セクションの折りたたみ（▼/▶ トグル）
- タスクのドラッグ＆ドロップ並び替え（セクション内・セクション間移動対応）
- 色カスタマイズ（セクション背景色 → 配下タスクに自動適用、タスク個別の背景色の上書きも可）
- **SVG 上でのタスクバー直接操作** — 左右ドラッグで開始日変更、右端ドラッグで期間変更、右クリックで `±1日 / ±7日` 即時シフト・削除（`after X` 依存タスクはドラッグ不可）
- SVG ライブプレビュー

### ER 図 (`erDiagram`)

- エンティティの追加・名前変更・削除
- 属性の追加・編集・削除（型・名前・PK/FK/UK キー設定）
- リレーションの追加・編集・削除（6 種のカーディナリティ・ラベル）
- SVG 上でエンティティ名をクリック → パネルの該当箇所にスクロール
- **SVG 右クリックメニュー** — エンティティ上で `名前を変更 / 属性を追加 / このエンティティを削除`

### その他の Mermaid ダイアグラム（14 種）

以下の Mermaid ダイアグラムは専用の汎用フォームエディタ（セクション別リスト編集 + ライブ SVG プレビュー + コードモード切替）で GUI 編集できます。リスト項目の右クリックメニューは全種で共通です。

| 種別 | 構文 | 特記事項 |
|---|---|---|
| 状態遷移図 | `stateDiagram-v2` | 「遷移追加」モード: SVG 上で From → To のノードを順クリックして遷移を作成 |
| パイチャート | `pie` | 表編集モード（既定）でラベル × 値を Excel 風に編集 |
| ユーザージャーニー | `journey` | セクション・ステップ・スコア (1-5) を構造化編集 |
| Git グラフ | `gitGraph` | コミット・ブランチ・チェックアウト・マージを順序制御 |
| タイムライン | `timeline` | 時代区分セクション内にイベントを追加 |
| 要求図 | `requirementDiagram` | 「リレーション追加」モード: SVG 上で要素間を順クリックしてリレーション (satisfies, traces 等) を作成。日本語値は自動的に `"…"` でクォート |
| C4 図 | `C4Context` 系 | Person / System / Container / Rel を追加 |
| Sankey 図 | `sankey-beta` | 各行 `送信元, 受信先, 数値` で流量を編集 |
| XY チャート | `xychart-beta` | 表編集モード（既定）でカテゴリ × シリーズ値を編集。**Y 軸はデータに自動追従**（手動範囲指定にも切替可） |
| ブロック図 | `block-beta` | `columns N` と各ブロック行で配置 |
| ZenUML | `zenuml` | バンドル制約により**コード編集のみ**動作（SVG プレビューは未対応・図種ピッカーからは除外） |
| パケット図 | `packet-beta` | `開始-終了: "ラベル"` でビット配列を編集 |
| アーキテクチャ図 | `architecture-beta` | 「接続モード」: SVG 上でサービス／グループを順クリックして接続を作成。クラウド・データベース・サーバ等の組込アイコン対応 |
| Kanban | `kanban` | 列とタスクの 2 階層リスト編集 |

---

## 動作環境

| 項目 | 要件 |
|---|---|
| VS Code | 1.80.0 以上 |
| OS | Windows 10 / 11（macOS / Linux でも動作見込みですが未検証） |

外部ネットワーク接続は不要です。

---

## 使い方

1. `.md` ファイルを右クリック →「**Open With...**」→「**Markdown Visual Editor**」を選択
2. プレビュー表示のまま、各ブロックをダブルクリックして編集
3. Mermaid コードブロックやテーブルは専用のビジュアルエディタで GUI 操作

> 詳しい操作方法は [利用者向けガイド](docs/USER-GUIDE.md) を参照してください。  
> 各 Mermaid 種別ごとの対応マトリクスは [MERMAID-SUPPORT-MATRIX.md](docs/MERMAID-SUPPORT-MATRIX.md) にまとまっています。

---

## インストール

### Marketplace から（公開後）

VS Code の Extensions ビューで `Markdown Visual Editor` を検索してインストールしてください。  
コマンドラインからは以下でインストールできます（`<publisher>` は公開時の Marketplace パブリッシャー ID）：

```
ext install <publisher>.md-visual-editor
```

### VSIX ファイルからインストール

```powershell
code --install-extension md-visual-editor-0.4.1.vsix
```

または VS Code のコマンドパレット (`Ctrl+Shift+P`) で「**Extensions: Install from VSIX...**」を選択し、`.vsix` ファイルを指定してください。

VSIX のビルド手順は [VSIX-BUILD-PROCEDURE.md](docs/VSIX-BUILD-PROCEDURE.md) を参照してください。

---

## Privacy & Security

- ✅ **ネットワーク通信を一切行わない**（CDN 参照・フォント取得・更新チェックもなし）
- ✅ **テレメトリ・分析・クラッシュレポートを送信しない**
- ✅ **認証・アカウント不要**
- ✅ ファイルシステムアクセスは **開いているドキュメント 1 ファイルのみ**
- ✅ WebView は Strict CSP で保護（`script-src 'nonce-...' 'unsafe-eval'`、その他は `'none'`）
  - ※ `'unsafe-eval'` は Mermaid ライブラリが要求するため付与。WebView 内に限定された狭いサンドボックスです
- ✅ リンクは **デフォルトで踏まれず**、`Ctrl/Cmd + Click` でのみ開いた上でスキームホワイトリスト（`http(s):` / `mailto:`）を適用
- ✅ Markdown レンダリング時に `script` / `iframe` / `on*` 属性等を除去（XSS 防止）

詳細は [SECURITY.md](docs/SECURITY.md) を参照してください。

---

## 技術仕様

| 項目 | 値 |
|---|---|
| Markdown パーサー | [marked](https://github.com/markedjs/marked) 4.3.x |
| ダイアグラムエンジン | [Mermaid](https://mermaid.js.org/) 11.14.x |
| バンドラー | esbuild |
| HTML サニタイズ | `script` / `iframe` / `on*` 属性等を除去 |
| 通信 | 完全ローカル（ネットワーク通信なし） |

---

## 既知の制限事項

- 象限チャート (`quadrantChart`) のジャンル付近で一部ラベルに日本語が使えないケースがあります（Mermaid の仕様）
- ZenUML (`zenuml`) は UMD バンドルに含まれていないため **コード編集のみ動作**（図種ピッカーからは除外）
- XY チャート (`xychart-beta`) はパレート図のような **左右 2 軸 (Y 軸 2 本)** に未対応（Mermaid 自体の制約）
- デフォルトエディタではなく、オプションエディタとして登録されます（「Open With...」で選択）
- 対応 OS は Windows 10/11 のみ検証済み

---

## ライセンス

[MIT License](LICENSE) のもとで提供されます。依存ライブラリのライセンス詳細は [LICENSE-COMPLIANCE.md](docs/LICENSE-COMPLIANCE.md) を参照してください。

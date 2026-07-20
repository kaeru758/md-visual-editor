# Markdown Visual Editor — 配布者向けガイド

> **社内利用限定** — マーケットプレイスへの公開は行いません。  
> VSIXファイルを作成し、共有フォルダ経由でメンバーに配布します。

---

## 目次

1. [概要](#概要)
2. [前提条件（配布者の環境）](#前提条件配布者の環境)
3. [初回セットアップ](#初回セットアップ)
4. [VSIXファイルの作成手順](#vsixファイルの作成手順)
5. [配布方法](#配布方法)
6. [既定エディタに設定する](#既定エディタに設定する)
7. [バージョンアップ手順](#バージョンアップ手順)
8. [不要ファイルの判断と削除](#不要ファイルの判断と削除)
9. [配布前チェックリスト](#配布前チェックリスト)
10. [対応機能一覧](#対応機能一覧)
11. [トラブルシューティング（ビルド）](#トラブルシューティングビルド)

---

## 概要

本拡張機能は VS Code 上で Markdown ファイルを WYSIWYG 形式で編集するカスタムエディタです。  
Mermaid ダイアグラム **21 種類** のビジュアル編集（高機能 GUI 7 種 + 汎用フォーム GUI 14 種）、**LaTeX 数式 (KaTeX)** のレンダリング、テーブルの GUI 編集に対応しています。

配布者は本ガイドに従い VSIX ファイルを作成し、利用者に配布してください。

---

## 前提条件（配布者の環境）

| ソフトウェア | バージョン | 確認コマンド |
|---|---|---|
| **Node.js** | 20.x 以上 | `node --version` |
| **npm** | 10.x 以上 | `npm --version` |
| **VS Code** | 1.80.0 以上 | メニュー → ヘルプ → バージョン情報 |

> ⚠️ **Node.js 18.x 以下はサポート対象外です。** パッケージングに使う `@vscode/vsce`（`package.json` では `^3.2.1` を指定、現在インストールされているのは `3.9.1`）が `engines.node` に `>= 20` を要求しているため、Node.js 20 未満では `npm install` や VSIX パッケージング時にエラーになる可能性があります。
>
> ℹ️ 過去のバージョンでは `package.json` の `overrides` に `"lru-cache": "~10.4.3"` を設定して Node 18 環境向けの依存衝突を回避していましたが、`@vscode/vsce` を v3 系に統一したことでこの固定は不要になりました。**現在 `overrides` は空（`{}`）です。** 復活させる必要はありません。

---

## 初回セットアップ

プロジェクトフォルダで以下を実行します。

```powershell
cd "プロジェクトフォルダのパス"
npm install
```

> `node_modules/` フォルダが生成されれば成功です。

---

## VSIXファイルの作成手順

### 手順

```powershell
# 1. ビルド確認（任意。npm run package が内部で自動実行するため省略可）
npm run compile

# 2. VSIXパッケージ作成
npm run package
```

`npm run package` は内部で `vsce package --no-dependencies --no-yarn` を実行します。パッケージング前に `vscode:prepublish`（`node esbuild.mjs --production`）が自動的に走り、`dist/extension.js` の再ビルドと `media/vendor/` へのライブラリコピーが行われます。

> ⚠️ 以前は「`--no-dependencies` は使用しないでください」という注意がありましたが、これは**現在の構成では逆になっています**。Webview が読み込む `marked` / `mermaid` / `katex` は `esbuild.mjs` のビルド時に `node_modules/` から `media/vendor/` へコピーされ、そのファイルが VSIX に含まれる方式に変わりました（詳細は [VSIX-BUILD-PROCEDURE.md](VSIX-BUILD-PROCEDURE.md) 参照）。`.vscodeignore` は `node_modules/**` を完全に除外しているため、**`--no-dependencies` を付けるのが正しい**（`npm run package` は既にこの設定です）。
>
> ℹ️ リポジトリ URL・`LICENSE` ファイルが `package.json` に整備済みのため、`--baseContentUrl` / `--baseImagesUrl` / `--allow-missing-repository` / `--skip-license` といった旧バージョンで使っていた回避オプションは不要です。

成功すると **`md-visual-editor-<バージョン>.vsix`** が生成されます。

### 出力確認

```powershell
# ファイルが生成されたか確認
Get-ChildItem *.vsix
```

`vsce` はパッケージング時に含まれるファイル一覧（`media/vendor/` 配下の同梱ライブラリなど）をコンソールに出力するので、そこでも内容を確認できます（`vsce ls --tree` で改めて一覧表示も可能）。

### 生成されるファイル例

```
md-visual-editor-0.5.6.vsix
```

---

## 配布方法

1. 生成された `.vsix` ファイルを共有フォルダに配置
2. 利用者に共有フォルダのパスと [利用者向けガイド（USER-GUIDE.md）](USER-GUIDE.md) を案内
3. 利用者はガイドに従ってインストール

### 推奨フォルダ構成

```
\\共有サーバー\tools\md-visual-editor\
  ├── md-visual-editor-0.5.6.vsix    ← VSIXファイル
  └── USER-GUIDE.md                  ← 利用者向けガイド（コピー）
```

---

## 既定エディタに設定する

本拡張はオプションエディタとして登録されているため、インストール直後は `.md` ファイルは標準テキストエディタで開き、開くたびに「Open With...」で選ぶ必要があります。すべての `.md` ファイルを常に Markdown Visual Editor で開くようにしたい利用者には、以下のいずれかの方法を案内してください。

### 方法 A: GUI から設定（おすすめ）

1. `.md` ファイルを右クリック →「**Open With...**」を選択
2. 一覧の下部にある「**Configure default editor for '\*.md'...**」（既定エディタを構成）をクリック
3. 「**Markdown Visual Editor**」を選択

以降、`.md` ファイルはダブルクリックで本エディタが開きます。

### 方法 B: `settings.json` に直接記述

コマンドパレット (`Ctrl+Shift+P`) →「**Preferences: Open User Settings (JSON)**」を開き、以下を追記します。

```json
"workbench.editorAssociations": {
  "*.md": "mdVisualEditor.markdownEditor"
}
```

### 元に戻す方法

標準テキストエディタに戻したい場合は、上記の値を `"default"` に変更するか、`workbench.editorAssociations` から `*.md` の行を削除してください。

### 既定エディタにせず、都度切り替える場合

- テキストエディタで `.md` を開いている状態からビジュアルエディタに切り替えるには、エディタタイトルバーに表示される「**Markdown ビジュアルエディタで開く**」ボタン（コマンド `mdVisualEditor.openVisualEditor`）またはコマンドパレットから同名コマンドを実行します。
- 逆にビジュアルエディタからテキストエディタに戻すには、ツールバー右端の「📝 テキストで開く」ボタンを使います。

---

## バージョンアップ手順

### 1. バージョン番号の更新

`package.json` の `version` フィールドを更新します。

```json
"version": "0.5.7"
```

### 2. CHANGELOG の更新

`CHANGELOG.md` の先頭に新バージョンの変更点を追記します（詳しいリリース手順は [VSIX-BUILD-PROCEDURE.md](VSIX-BUILD-PROCEDURE.md) を参照）。

### 3. VSIXの再作成

```powershell
npm run compile
npm run package
```

### 4. 共有フォルダの差し替え

古い `.vsix` を削除（またはアーカイブ）し、新しいファイルを配置します。

### 5. 利用者への案内

メンバーに「新しいバージョンをインストールしてください」と案内します。  
アンインストール不要で、新しい VSIX をそのままインストールすれば上書きされます。

---

## 不要ファイルの判断と削除

プロジェクトルートには、開発用・ビルド用のファイルと、VSIX に含まれるファイルが混在しています。  
以下を参考に、不要なファイルを整理してください。

### ファイル分類一覧

| ファイル / フォルダ | 役割 | VSIX に含まれるか | 削除可否 |
|---|---|---|---|
| `dist/` | ビルド出力 | ✅ 含まれる | ❌ 削除不可（`npm run compile` で再生成可） |
| `media/`（`media/vendor/` 含む） | エディタ UI（CSS / JS）・同梱ライブラリ | ✅ 含まれる | ❌ 削除不可（`media/vendor/` は `npm run compile` / `npm run package` 実行時に `esbuild.mjs` が自動生成） |
| `README.md` | 拡張機能の説明 | ✅ 含まれる | ❌ 削除不可 |
| `package.json` | 拡張機能の定義 | ✅ 含まれる | ❌ 削除不可 |
| `LICENSE` | 本拡張機能自体のライセンス（MIT） | ✅ 含まれる | ❌ 削除不可 |
| `src/` | TypeScript ソースコード | ❌ 含まれない | ❌ 削除不可（ビルド元） |
| `esbuild.mjs` | ビルドスクリプト（vendor コピー含む） | ❌ 含まれない | ❌ 削除不可（ビルドに必要） |
| `tsconfig.json` | TypeScript 設定 | ❌ 含まれない | ❌ 削除不可（ビルドに必要） |
| `package-lock.json` | 依存バージョン固定 | ❌ 含まれない | ❌ 削除不可（再現性に必要） |
| `.vscodeignore` | VSIX 除外設定 | ❌ 含まれない | ❌ 削除不可（パッケージングに必要） |
| `.gitignore` | Git 除外設定 | ❌ 含まれない | ❌ 削除不可（Git 管理に必要） |
| `docs/` | ドキュメント | ❌ 含まれない | ❌ 削除不可（運用ガイド） |
| `node_modules/` | npm 依存パッケージ | ❌ **含まれない**（vendor アセットはビルド時に `media/vendor/` へコピー済みのため `node_modules` 自体は同梱不要） | ⚠️ 削除可（`npm install` で再生成） |
| `*.vsix` | パッケージファイル | — | ✅ 削除可（配布後は不要。旧バージョンが複数残りがちなので定期的に整理） |
| `test-all-features.md`（ルート） | 動作確認用サンプル文書 | ❌ 含まれない（`.vscodeignore` で除外） | ✅ 削除可（動作確認済みなら） |

> ℹ️ 旧版の本ガイドでは `test-document.md` / `sample-document.md` というルート直下のファイルを挙げていましたが、現在ルートに存在するのは `test-all-features.md` のみです（サンプル文書は `docs/sample-document.md` に移動済み）。

### 安全に削除できるファイル

以下は配布に不要で、削除しても開発・ビルドに影響しません。

```powershell
# 配布済みの古い VSIX ファイルを削除
Remove-Item *.vsix

# 動作確認用サンプル文書を削除（不要な場合）
Remove-Item test-all-features.md
```

### ディスク容量を節約したいとき

`node_modules/` は容量が大きいため、長期間ビルド予定がなければ削除できます。  
次のビルド前に `npm install` で復元してください。

```powershell
Remove-Item -Recurse -Force node_modules
# 再ビルド時:
npm install
npm run compile
```

> ⚠️ `npm run watch` が動作中の場合は先に停止してから削除してください。

---

## 配布前チェックリスト

- [ ] `npm install` が完了していること
- [ ] `npm run compile` でビルドエラーがないこと
- [ ] `dist/extension.js` と `media/vendor/` 配下のファイル（`marked.min.js` / `mermaid.min.js` / `katex.min.js` / `katex.min.css` / `fonts/`）が生成されていること
- [ ] `.vsix` ファイルが生成されていること
- [ ] `test-all-features.md` で以下の機能が動作すること
  - [ ] テキストブロックの WYSIWYG 編集
  - [ ] フローチャートのビジュアル編集
  - [ ] シーケンス図のビジュアル編集
  - [ ] クラス図のビジュアル編集
  - [ ] マインドマップのビジュアル編集
  - [ ] 象限チャートのビジュアル編集
  - [ ] ガントチャートのビジュアル編集
  - [ ] ER 図のビジュアル編集
  - [ ] テーブルの GUI 編集
  - [ ] LaTeX 数式（KaTeX）のインライン・ディスプレイ表示
- [ ] 共有フォルダに VSIX を配置
- [ ] 利用者向けガイドを配布

---

## 対応機能一覧

| 機能 | エディタ種別 | 説明 |
|------|------------|------|
| WYSIWYG Markdown 編集 | ブロックエディタ | プレビュー表示のまま直接編集（H1/H2 単位のテキストセクション、表・コード・Mermaid・数式は個別ブロック） |
| LaTeX 数式（KaTeX） | インライン/ディスプレイ | `$...$` / `$$...$$` / ` ```math ` を完全ローカルでレンダリング。ダブルクリックで TeX ソース編集 |
| 検索／置換（v0.3.1） | グローバル UI | `Ctrl+F` / `Ctrl+H`、大文字区別・正規表現・一括置換 |
| テーマ切替（v0.3.1） | グローバル UI | 自動／ライト強制／ダーク強制をトグル |
| テキストエディタで開く（v0.3.1） | グローバル UI | 標準テキストエディタで開き直し |
| ビジュアルエディタで開く（v0.5.3） | グローバル UI | テキストエディタのタイトルバーのボタン／コマンドパレットからビジュアルエディタへ切り替え |
| リンクのクリックで開く | グローバル UI | 修飾キー不要でクリックするとリンクを開く（`http(s)`/`mailto` は外部、それ以外は VS Code 内） |
| Mermaid 図のズーム / パン（v0.5.5） | グローバル UI | 本文中・編集モードともにズーム・フィット・パン操作に対応 |
| フローチャート | ビジュアル（GUI） | ノード追加・接続・色変更・接続線/サブグラフの直接編集、レイアウト選択（Dagre/ELK, v0.3.1）、サブグラフの入れ子化（v0.3.1） |
| クラス図 | ビジュアル（GUI） | クラス・プロパティ・メソッド・関連を GUI 操作 |
| シーケンス図 | ビジュアル（GUI） | 参加者・メッセージ・ノート・ブロック背景を GUI 操作 |
| マインドマップ | ビジュアル（GUI） | ノードのツリー操作・形状変更 |
| 象限チャート | ビジュアル（GUI） | 軸・象限名・データ点を GUI 操作（日本語ラベル対応、v0.5.1） |
| ガントチャート | ビジュアル（GUI） | セクション折りたたみ・D&D並び替え・色カスタマイズ・ステータス管理 |
| ER 図 | ビジュアル（GUI） | エンティティ・属性・リレーションを GUI 操作 |
| その他の Mermaid 図（14 種、v0.3.0+） | 汎用フォーム GUI | 状態遷移・パイ・ジャーニー・Git グラフ・タイムライン・要求・C4・Sankey・XY・ブロック・パケット・アーキテクチャ・Kanban（ZenUML はコード編集のみ） |
| テーブル | ビジュアル（GUI） | 行・列をボタンで追加削除、セルを直接入力（`<br>` 双方向変換、列幅ドラッグ調整） |

---

## トラブルシューティング（ビルド）

### `npm install` でエラーになる（Node バージョン起因）

Node.js のバージョンが 20.x 未満の可能性があります。

```powershell
# Node.js バージョン確認
node --version
# v20.x 以上であることを確認
```

**原因:** `@vscode/vsce`（v3 系）の `engines.node` が `>= 20` を要求しています。  
**対策:** Node.js を 20.x 以上にアップグレードしてください。`package.json` の `overrides` に依存バージョンを固定する対応は現在不要です（`overrides` は空です）。

```powershell
Remove-Item -Recurse -Force node_modules
Remove-Item package-lock.json
npm install
```

> ℹ️ `npm run watch` が動作中の場合、`esbuild.exe` が `node_modules` 内のファイルをロックして削除できないことがあります。先に watch ターミナルを停止してください。

### `npm run compile` でエラーが出る

```powershell
# node_modules を再インストール
Remove-Item -Recurse node_modules
npm install
npm run compile
```

### `npm run package` でエラーが出る

```powershell
# vsce が最新か確認
npx @vscode/vsce --version

# README.md / LICENSE が存在しない場合エラーになることがある
Test-Path README.md
Test-Path LICENSE
```

### VSIXファイルのサイズが異常に大きい／小さい

`.vscodeignore` の設定を確認してください。現在は `node_modules/**` を完全に除外し、Webview で使うライブラリ（`marked` / `mermaid` / `katex`）はビルド時に `media/vendor/` へコピーされたものだけを含めています。

正常なサイズは **概ね 1.5〜2 MB**（内訳の大半は `mermaid.min.js` と KaTeX フォント）です。

- **数百 KB 以下** → ❌ `media/vendor/` が空の可能性が高い（`esbuild.mjs` のビルドが実行されていない）。`npm run compile` または `npm run package` を実行し直してください
- **概ね 1.5〜2 MB** → ✅ 正常

> ⚠️ 以前の版にあった「`--no-dependencies` を付けるとエディタが真っ白になる」という注意は、現在の構成（vendor を `media/vendor/` に事前コピーし `node_modules` を VSIX から除外する方式）には当てはまりません。`npm run package` は既定で `--no-dependencies --no-yarn` を使用します。

### インストール後にエディタが真っ白 / 何も表示されない

**最も多い原因:** `media/vendor/` の生成をスキップしたままパッケージングした（`esbuild.mjs` を経由せず手動で `vsce package` だけを実行した場合など）。

**確認方法:**

```powershell
# VSIX のサイズを確認（正常: 概ね 1.5〜2 MB）
Get-ChildItem *.vsix | Format-Table Name, @{N='Size(MB)';E={[math]::Round($_.Length / 1MB, 2)}}
```

**復旧手順:**

```powershell
# 1. 不正な VSIX を削除
Remove-Item *.vsix

# 2. 正しい手順で再ビルド（compile を経由してから package する）
npm run compile
npm run package

# 3. サイズが 1.5〜2MB 前後であることを確認してから配布
```

> ℹ️ 本拡張機能は Webview 内で `marked`（Markdown パーサー）・`mermaid`（ダイアグラム描画ライブラリ）・`katex`（数式レンダリング）を `<script>` / `<link>` タグで読み込みます。これらは `esbuild.mjs` のビルド時に `node_modules/` から `media/vendor/` へコピーされ、`.vscodeignore` により `media/vendor/**` が VSIX に含まれる一方、`node_modules/**` そのものは完全に除外されます。

### `node_modules` が削除できない

`npm run watch` タスクがバックグラウンドで動作していると、`esbuild.exe` がファイルをロックします。

```powershell
# 1. watch ターミナルを停止（Ctrl+C または × で閉じる）
# 2. その後削除
Remove-Item -Recurse -Force node_modules
npm install
```

---

*最終更新: 2026年7月19日*

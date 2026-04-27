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
6. [バージョンアップ手順](#バージョンアップ手順)
7. [配布前チェックリスト](#配布前チェックリスト)
8. [対応機能一覧](#対応機能一覧)
9. [トラブルシューティング（ビルド）](#トラブルシューティングビルド)

---

## 概要

本拡張機能は VS Code 上で Markdown ファイルを WYSIWYG 形式で編集するカスタムエディタです。  
Mermaid ダイアグラム **21 種類** のビジュアル編集（高機能 GUI 7 種 + 汎用フォーム GUI 14 種）と、テーブルの GUI 編集に対応しています。

配布者は本ガイドに従い VSIX ファイルを作成し、利用者に配布してください。

---

## 前提条件（配布者の環境）

| ソフトウェア | バージョン | 確認コマンド |
|---|---|---|
| **Node.js** | 18.x 以上（推奨: 18.17+） | `node --version` |
| **npm** | 8.x 以上 | `npm --version` |
| **VS Code** | 1.80.0 以上 | メニュー → ヘルプ → バージョン情報 |

> ⚠️ **Node.js 16.x はサポート対象外です。** 開発依存パッケージ（`@vscode/vsce`）の推移的依存が Node.js 18+ の API（`diagnostics_channel.tracingChannel`）を使用するため、Node.js 16.x では `npm install` または VSIX パッケージング時にエラーが発生します。
>
> **`package.json` の `overrides`** に `"lru-cache": "~10.4.3"` を設定し、Node 18 で動作するバージョンに固定しています。この設定を削除しないでください。

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
# 1. ビルド
npm run compile

# 2. VSIXパッケージ作成
npx @vscode/vsce package --baseContentUrl https://localhost --baseImagesUrl https://localhost --allow-missing-repository --skip-license
```

> ⚠️ 社内配布専用のためリポジトリURLは公開していません。`--baseContentUrl`、`--baseImagesUrl`、`--allow-missing-repository`、`--skip-license` はそのエラー回避用オプションです。
>
> ⚠️ **`--no-dependencies` は使用しないでください。** 本拡張機能は Webview 内で `marked`（Markdown パーサー）と `mermaid`（ダイアグラム描画）をランタイムで読み込むため、これらの `node_modules` ファイルが VSIX に含まれる必要があります。`.vscodeignore` で必要なファイルのみ含めるよう制御しています。

成功すると **`md-visual-editor-<バージョン>.vsix`** が生成されます。

### 出力確認

```powershell
# ファイルが生成されたか確認
Get-ChildItem *.vsix
```

### 生成されるファイル例

```
md-visual-editor-0.2.4.vsix
```

---

## 配布方法

1. 生成された `.vsix` ファイルを共有フォルダに配置
2. 利用者に共有フォルダのパスと [利用者向けガイド（USER-GUIDE.md）](USER-GUIDE.md) を案内
3. 利用者はガイドに従ってインストール

### 推奨フォルダ構成

```
\\共有サーバー\tools\md-visual-editor\
  ├── md-visual-editor-0.2.4.vsix    ← VSIXファイル
  └── USER-GUIDE.md                  ← 利用者向けガイド（コピー）
```

---

## バージョンアップ手順

### 1. バージョン番号の更新

`package.json` の `version` フィールドを更新します。

```json
"version": "0.0.2"
```

### 2. VSIXの再作成

```powershell
npm run compile
npx @vscode/vsce package --baseContentUrl https://localhost --baseImagesUrl https://localhost --allow-missing-repository --skip-license
```

### 3. 共有フォルダの差し替え

古い `.vsix` を削除（またはアーカイブ）し、新しいファイルを配置します。

### 4. 利用者への案内

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
| `media/` | エディタ UI（CSS / JS） | ✅ 含まれる | ❌ 削除不可 |
| `README.md` | 拡張機能の説明 | ✅ 含まれる | ❌ 削除不可 |
| `package.json` | 拡張機能の定義 | ✅ 含まれる | ❌ 削除不可 |
| `src/` | TypeScript ソースコード | ❌ 含まれない | ❌ 削除不可（ビルド元） |
| `esbuild.mjs` | ビルドスクリプト | ❌ 含まれない | ❌ 削除不可（ビルドに必要） |
| `tsconfig.json` | TypeScript 設定 | ❌ 含まれない | ❌ 削除不可（ビルドに必要） |
| `package-lock.json` | 依存バージョン固定 | ❌ 含まれない | ❌ 削除不可（再現性に必要） |
| `.vscodeignore` | VSIX 除外設定 | ❌ 含まれない | ❌ 削除不可（パッケージングに必要） |
| `.gitignore` | Git 除外設定 | ❌ 含まれない | ❌ 削除不可（Git 管理に必要） |
| `docs/` | ドキュメント | ❌ 含まれない | ❌ 削除不可（運用ガイド） |
| `node_modules/` | npm 依存パッケージ | ⚠️ 一部含まれる（marked, mermaid） | ⚠️ 削除可（`npm install` で再生成） |
| `*.vsix` | パッケージファイル | — | ✅ 削除可（配布後は不要） |
| `test-document.md` | テスト用文書 | ❌ 含まれない | ✅ 削除可（動作確認済みなら） |
| `sample-document.md` | サンプル文書 | ❌ 含まれない | ✅ 削除可（不要なら） |

### 安全に削除できるファイル

以下は配布に不要で、削除しても開発・ビルドに影響しません。

```powershell
# 配布済みの古い VSIX ファイルを削除
Remove-Item *.vsix

# テスト・サンプル文書を削除（不要な場合）
Remove-Item test-document.md
Remove-Item sample-document.md
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
- [ ] `dist/extension.js` が生成されていること
- [ ] `.vsix` ファイルが生成されていること
- [ ] `test-document.md` で以下の機能が動作すること
  - [ ] テキストブロックの WYSIWYG 編集
  - [ ] フローチャートのビジュアル編集
  - [ ] シーケンス図のビジュアル編集
  - [ ] クラス図のビジュアル編集
  - [ ] マインドマップのビジュアル編集
  - [ ] 象限チャートのビジュアル編集
  - [ ] ガントチャートのビジュアル編集
  - [ ] ER 図のビジュアル編集
  - [ ] テーブルの GUI 編集
- [ ] 共有フォルダに VSIX を配置
- [ ] 利用者向けガイドを配布

---

## 対応機能一覧

| 機能 | エディタ種別 | 説明 |
|------|------------|------|
| WYSIWYG Markdown 編集 | ブロックエディタ | プレビュー表示のまま直接編集 |
| 検索／置換（v0.3.1） | グローバル UI | `Ctrl+F` / `Ctrl+H`、大文字区別・正規表現・一括置換 |
| テーマ切替（v0.3.1） | グローバル UI | 自動／ライト強制／ダーク強制をトグル |
| テキストエディタで開く（v0.3.1） | グローバル UI | 標準テキストエディタで開き直し |
| リンクの Ctrl+Click（v0.3.1） | グローバル UI | OS デフォルトハンドラでリンクを開く |
| フローチャート | ビジュアル（GUI） | ノード追加・接続・色変更・接続線/サブグラフの直接編集、レイアウト選択（Dagre/ELK, v0.3.1）、サブグラフの入れ子化（v0.3.1） |
| クラス図 | ビジュアル（GUI） | クラス・プロパティ・メソッド・関連を GUI 操作 |
| シーケンス図 | ビジュアル（GUI） | 参加者・メッセージ・ノート・ブロック背景を GUI 操作 |
| マインドマップ | ビジュアル（GUI） | ノードのツリー操作・形状変更 |
| 象限チャート | ビジュアル（GUI） | 軸・象限名・データ点を GUI 操作 |
| ガントチャート | ビジュアル（GUI） | セクション折りたたみ・D&D並び替え・色カスタマイズ・ステータス管理 |
| ER 図 | ビジュアル（GUI） | エンティティ・属性・リレーションを GUI 操作 |
| その他の Mermaid 図（14 種、v0.3.0+） | 汎用フォーム GUI | 状態遷移・パイ・ジャーニー・Git グラフ・タイムライン・要求・C4・Sankey・XY・ブロック・ZenUML・パケット・アーキテクチャ・Kanban |
| テーブル | ビジュアル（GUI） | 行・列をボタンで追加削除、セルを直接入力 |

---

## トラブルシューティング（ビルド）

### `npm install` で `tracingChannel is not a function` エラー

Node.js のバージョンが 18.x 未満の可能性があります。

```powershell
# Node.js バージョン確認
node --version
# v18.17.1 以上であることを確認
```

**原因:** `lru-cache` 11.x が `node:diagnostics_channel` の `tracingChannel()` API を使用しており、この API は Node.js 20+ で追加されたものです。  
**対策:** `package.json` の `overrides` に `"lru-cache": "~10.4.3"` が設定されていることを確認してください。設定がある場合は `node_modules` を削除して再インストールしてください。

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

### `npx vsce package` でエラーが出る

```powershell
# vsce が最新か確認
npx @vscode/vsce --version

# README.md が存在しない場合エラーになることがある
# README.md が存在するか確認
Test-Path README.md
```

### VSIXファイルのサイズが異常に大きい

`.vscodeignore` の設定を確認してください。  
このファイルで `node_modules` から必要なファイル（`marked`、`mermaid`）のみを含めるよう制御しています。  
正常なサイズは **約 5〜6 MB** です（大部分は mermaid ライブラリ）。

> ⚠️ `--no-dependencies` オプションは**使用しないでください**。Webview で使用する `marked` と `mermaid` が VSIX から除外され、エディタが空白になります。

### インストール後にエディタが真っ白 / 何も表示されない

**最も多い原因:** VSIX パッケージング時に `--no-dependencies` を付けてしまい、`node_modules/marked/` と `node_modules/mermaid/` が除外された。

**確認方法:**

```powershell
# VSIX のサイズを確認（正常: 約 5〜6 MB）
Get-ChildItem *.vsix | Format-Table Name, @{N='Size(MB)';E={[math]::Round($_.Length / 1MB, 2)}}
```

- **約 70〜100 KB** → ❌ `node_modules` が含まれていない。再ビルドが必要
- **約 5〜6 MB** → ✅ 正常

**復旧手順:**

```powershell
# 1. 不正な VSIX を削除
Remove-Item *.vsix

# 2. 正しいコマンドで再ビルド（--no-dependencies を付けない！）
npx @vscode/vsce package --baseContentUrl https://localhost --baseImagesUrl https://localhost --allow-missing-repository --skip-license

# 3. サイズが 5MB 前後であることを確認してから配布
```

> ℹ️ 本拡張機能は Webview 内で `marked`（Markdown パーサー）と `mermaid`（ダイアグラム描画ライブラリ）を `<script>` タグで読み込みます。これらは npm パッケージとして `node_modules/` に存在し、`.vscodeignore` の `!node_modules/marked/**` / `!node_modules/mermaid/dist/**` パターンで VSIX に含めています。`--no-dependencies` はこの仕組みを無効化するため、絶対に使わないでください。

### `node_modules` が削除できない

`npm run watch` タスクがバックグラウンドで動作していると、`esbuild.exe` がファイルをロックします。

```powershell
# 1. watch ターミナルを停止（Ctrl+C または × で閉じる）
# 2. その後削除
Remove-Item -Recurse -Force node_modules
npm install
```

---

*最終更新: 2026年4月*

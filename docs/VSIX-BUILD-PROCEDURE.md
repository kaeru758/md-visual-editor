# VSIX ビルド手順 / トラブルシューティング

このドキュメントは、本拡張機能 (`md-visual-editor`) を VSIX としてパッケージングする際の **正しい手順** と、過去に発生した **失敗パターン** を記録するものです。同じ失敗を繰り返さないために、リリース作業前に必ず一読してください。

---

## 1. 標準リリース手順（チェックリスト）

リリース時は以下の順番で必ず実施します。

1. **コード修正・動作確認を完了させる**（手動 F5 デバッグでも可）。
2. **`package.json` の `version` を上げる**（例: `0.5.1` → `0.5.2`）。
3. **`CHANGELOG.md` の先頭に新バージョンの項目を追加する**。
4. **コンパイル確認**:
   ```powershell
   npm run compile
   ```
   `dist/extension.js` が更新されること。
5. **VSIX 作成**:
   ```powershell
   npx @vscode/vsce package --allow-missing-repository
   ```
   - **絶対に `--no-dependencies` を付けない**（理由は §3 参照）。
6. **生成された VSIX の中身を必ず確認する**:
   - 出力ログに `node_modules/marked/marked.min.js` と `node_modules/mermaid/dist/mermaid.min.js` が含まれていること。
   - サイズの目安は **約 1 MB**。極端に小さい (例: 100 KB 台) 場合は依存欠落の疑いあり。
7. **インストールテスト**:
   ```powershell
   code --install-extension md-visual-editor-<version>.vsix --force
   ```
   実際に Markdown ファイルを開いて Mermaid 図が描画されることを確認。

---

## 2. 必要な依存・前提

- **Node.js**: v20 以上を推奨（v24 でも動作確認済み 2026-04-27）。
- **`@vscode/vsce`**: `^3.2.1` 以上を `devDependencies` に固定。
  - v2 系は新しい `hosted-git-info` などの依存と非互換のため使わないこと。
- **`marked`** と **`mermaid`** はランタイム依存 (`dependencies`)。webview が `node_modules/...` を直接 `<script src=...>` で読み込む構造のため、**VSIX に必ず同梱する必要がある**。

---

## 3. 失敗事例と恒久対策

### 失敗 1: `TypeError: LRU is not a constructor` で vsce が起動できない

**症状**:
```
node_modules/hosted-git-info/index.js:6
const cache = new LRU({ max: 1000 })
              ^
TypeError: LRU is not a constructor
```

**原因**:
- `package.json` の `overrides` に `"lru-cache": "~10.4.3"` が指定されていた。
- vsce v2 系の依存 `hosted-git-info@4` は古い `lru-cache` の `new LRU()` API を呼ぶが、override で v10 を強制すると壊れる。
- v10 系の `lru-cache` はクラスを default export しておらず、コンストラクタ呼び出しが失敗する。

**恒久対策**:
- `overrides` で `lru-cache` を強制しない（必要なら別途 npm audit で個別に対応）。
- `@vscode/vsce` を v3 系（`^3.2.1` 以上）にアップグレードする。v3 では `hosted-git-info` 等が更新されており本問題が起きない。
- どうしても override が必要な場合は、`@vscode/vsce` の依存ツリーを除外する形 (`overrides` のネスト指定) で限定する。

### 失敗 2: VSIX を作ったが拡張機能が動作しない（webview が真っ白 / Mermaid 描画されない）

**症状**:
- `--no-dependencies` を付けて VSIX を作成。サイズが極端に小さい（100 KB 台）。
- インストール後、Markdown を開いても Mermaid 図が描画されない、コンソールに 404 エラー。

**原因**:
- 本拡張は `src/markdownVisualEditorProvider.ts` で webview から
  `node_modules/marked/marked.min.js` と
  `node_modules/mermaid/dist/mermaid.min.js`
  を `<script src>` で直接読み込む設計になっている。
- `--no-dependencies` を指定すると `node_modules/` が VSIX から除外され、上記ファイルが見つからず動作不能になる。

**恒久対策**:
- **`--no-dependencies` は使用禁止**。標準は `npx @vscode/vsce package --allow-missing-repository` のみ。
- リリース後、出力ログで `node_modules/marked/marked.min.js` と `node_modules/mermaid/dist/mermaid.min.js` が含まれていることを必ず目視確認する。
- VSIX の最終サイズが概ね 1 MB 前後であることを確認する（極端に小さい場合は依存欠落）。

### 失敗 3: `npx vsce@latest` のインストールが OneDrive 配下で失敗する

**症状**:
```
npm warn cleanup Failed to remove some directories
EPERM: operation not permitted, rmdir ...
```

**原因**:
- OneDrive 同期フォルダ配下では、npm のキャッシュクリーンアップでファイルロックが起きやすい。
- `--cwd` オプション付きで親ディレクトリから vsce を呼ぶと、`Extension manifest not found` で失敗する。

**恒久対策**:
- vsce は **常にプロジェクト直下で実行する**（`cd` してから）。
- vsce は `devDependencies` にローカルインストール済みなので、`npx @vscode/vsce ...` で十分。`@latest` を毎回 `npx` で取得しない。

---

## 4. 緊急時のリセット手順

依存関係が壊れて何をやっても vsce が動かない場合:

```powershell
# プロジェクト直下で実行
Remove-Item -Recurse -Force node_modules
Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue
npm install --no-audit --no-fund
npx @vscode/vsce package --allow-missing-repository
```

これでクリーン状態から再構築できます。

---

## 5. リリース直前の最終チェックリスト

- [ ] `package.json` の `version` を更新した
- [ ] `CHANGELOG.md` を更新した
- [ ] `npm run compile` が成功する
- [ ] `npx @vscode/vsce package --allow-missing-repository` を `--no-dependencies` **なし** で実行した
- [ ] 出力ログに `node_modules/marked/marked.min.js` と `node_modules/mermaid/dist/mermaid.min.js` が含まれている
- [ ] VSIX サイズが概ね 1 MB 前後である
- [ ] `code --install-extension md-visual-editor-<version>.vsix --force` でインストールし、Mermaid 図が描画されることを確認した
- [ ] 旧バージョンの `*.vsix` は削除またはアーカイブした

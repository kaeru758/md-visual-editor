# VSIX ビルド手順 / トラブルシューティング

このドキュメントは、本拡張機能 (`md-visual-editor`) を VSIX としてパッケージングする際の **正しい手順** と、過去に発生した **失敗パターン** を記録するものです。同じ失敗を繰り返さないために、リリース作業前に必ず一読してください。

---

## 1. 標準リリース手順（チェックリスト）

リリース時は以下の順番で必ず実施します。

1. **コード修正・動作確認を完了させる**（手動 F5 デバッグでも可）。
2. **`package.json` の `version` を上げる**（例: `0.5.6` → `0.5.7`）。
3. **`CHANGELOG.md` の先頭に新バージョンの項目を追加する**。
4. **コンパイル確認**:
   ```powershell
   npm run compile
   ```
   `dist/extension.js` が更新され、`media/vendor/` 配下（`marked.min.js` / `mermaid.min.js` / `katex.min.js` / `katex.min.css` / `fonts/`）が最新化されること（下記 §2 参照）。
5. **VSIX 作成**:
   ```powershell
   npm run package
   ```
   これは内部で `vsce package --no-dependencies --no-yarn` を実行します。パッケージング前に `vscode:prepublish`（= `node esbuild.mjs --production`）が自動実行されるため、手順 4 のコンパイルは事前確認用の任意ステップです。
   - **`--no-dependencies` は必須**（理由は §3 参照。以前の「使用禁止」という記載とは逆になっています）。
6. **生成された VSIX の中身を必ず確認する**:
   - コンソール出力（`INFO Files included in the VSIX:` の一覧、または `vsce ls --tree`）に `media/vendor/marked.min.js` / `media/vendor/mermaid.min.js` / `media/vendor/katex.min.js` / `media/vendor/katex.min.css` / `media/vendor/fonts/*.woff*` が含まれていること。
   - サイズの目安は **概ね 1.5〜2 MB**（大半は `mermaid.min.js` と KaTeX フォント一式）。極端に小さい場合は vendor アセットの欠落を疑う。
7. **インストールテスト**:
   ```powershell
   code --install-extension md-visual-editor-<version>.vsix --force
   ```
   実際に Markdown ファイルを開いて Mermaid 図・数式（KaTeX）が描画されることを確認。
8. **（Marketplace へ公開する場合のみ）`npm run publish`**:
   ```powershell
   npm run publish
   ```
   内部で `vsce publish --no-dependencies --no-yarn` を実行します。社内配布限定で運用している間は通常このステップは不要です（[INSTALL-GUIDE.md](INSTALL-GUIDE.md) 参照）。事前に `vsce login <publisher>` などでパブリッシャー認証が済んでいることを確認してください。

---

## 2. 必要な依存・前提

- **Node.js**: v20 以上を推奨（v24 でも動作確認済み）。`@vscode/vsce` v3 系が `engines.node: >= 20` を要求するため、v18 以下では動作しません。
- **`@vscode/vsce`**: `^3.2.1` 以上を `devDependencies` に固定（現在インストール済みバージョン: `3.9.1`）。
  - v2 系は新しい `hosted-git-info` などの依存と非互換のため使わないこと。
- **ビルド時の vendor アセットコピー（`esbuild.mjs`）**: Webview は `marked`（Markdown パーサー）・`mermaid`（ダイアグラム描画）・`katex`（数式レンダリング、CSS・フォント含む）を `<script>` / `<link>` タグでランタイム読み込みします。これらは `dependencies`（`package.json`）としてインストールされますが、**VSIX には `node_modules` のままでは同梱されません**。代わりに `esbuild.mjs` の `copyVendorAssets()` が `compile` / `--production` 実行のたびに以下をコピーします。

  | コピー元 | コピー先 |
  |---|---|
  | `node_modules/marked/marked.min.js` | `media/vendor/marked.min.js` |
  | `node_modules/mermaid/dist/mermaid.min.js` | `media/vendor/mermaid.min.js` |
  | `node_modules/katex/dist/katex.min.js` | `media/vendor/katex.min.js` |
  | `node_modules/katex/dist/katex.min.css` | `media/vendor/katex.min.css` |
  | `node_modules/katex/dist/fonts/*.{woff,woff2}`（`.ttf` は除外） | `media/vendor/fonts/*` |

  その後 `src/extension.ts` を esbuild で `dist/extension.js`（CJS バンドル、`--production` 時は minify）にバンドルします。`.vscodeignore` は `node_modules/**` を丸ごと除外する一方、`media/vendor/**` は通常の `media/**` として VSIX に含まれます。

---

## 3. 失敗事例と恒久対策

### 失敗 1: `TypeError: LRU is not a constructor` で vsce が起動できない（過去の事象・現在は発生しない構成）

**症状**:
```
node_modules/hosted-git-info/index.js:6
const cache = new LRU({ max: 1000 })
              ^
TypeError: LRU is not a constructor
```

**原因**:
- 当時の `package.json` の `overrides` に `"lru-cache": "~10.4.3"` が指定されていた。
- vsce v2 系の依存 `hosted-git-info@4` は古い `lru-cache` の `new LRU()` API を呼ぶが、override で v10 を強制すると壊れる。

**現在の状態**:
- `@vscode/vsce` を v3 系（`^3.2.1` 以上）に統一したことでこの問題自体が解消し、**`overrides` は空（`{}`）** になっています。この override を復活させる必要はありません。
- どうしても特定の推移的依存を固定したい場合のみ、`@vscode/vsce` の依存ツリーに限定した `overrides` のネスト指定を検討してください。

### 失敗 2: VSIX を作ったが拡張機能が動作しない（webview が真っ白 / Mermaid・数式が描画されない）

**症状**:
- インストール後、Markdown を開いても Mermaid 図や数式が描画されない、コンソールに 404 エラー。
- VSIX のサイズが極端に小さい（数百 KB 以下）。

**原因**:
- 本拡張は webview から `media/vendor/marked.min.js` / `media/vendor/mermaid.min.js` / `media/vendor/katex.min.js` / `media/vendor/katex.min.css` を `<script src>` / `<link href>` で直接読み込む設計になっています。
- `esbuild.mjs` の `copyVendorAssets()` が実行されないまま（＝ `npm run compile` や `vscode:prepublish` を経由せず）パッケージングすると、`media/vendor/` が空または古いままになり、上記ファイルが見つからず動作不能になります。

**恒久対策**:
- リリース時は **`npm run package` を使う**（`vscode:prepublish` フックで `esbuild.mjs --production` が自動実行されるため、vendor コピー漏れが起きにくい）。
- 直接 `vsce package` を呼ぶ場合は、必ず事前に `npm run compile` を実行して `media/vendor/` が最新であることを確認する。
- リリース後、出力ログまたは `vsce ls --tree` で `media/vendor/marked.min.js` / `media/vendor/mermaid.min.js` / `media/vendor/katex.min.js` / `media/vendor/katex.min.css` / `media/vendor/fonts/` が含まれていることを必ず目視確認する。
- VSIX の最終サイズが概ね 1.5〜2 MB 前後であることを確認する（極端に小さい場合は vendor 欠落の疑い）。

> ⚠️ **旧版の注意書き「`--no-dependencies` は使用禁止」は現在の構成では誤りです。** 当時は `node_modules/marked` と `node_modules/mermaid` を `.vscodeignore` の許可リストで直接 VSIX に含める方式だったため `--no-dependencies` を付けると必要なファイルが消えていましたが、現在は vendor アセットを `media/vendor/` に事前コピーし `node_modules` を丸ごと除外する方式に変わったため、**`--no-dependencies` を付けるのが正しい構成**です（`npm run package` は既定でこのオプションを使用します）。

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
- vsce は `devDependencies` にローカルインストール済みなので、`npm run package` / `npm run publish`（内部で `npx @vscode/vsce ...` 相当）で十分。`@latest` を毎回 `npx` で取得しない。

---

## 4. 緊急時のリセット手順

依存関係が壊れて何をやっても vsce が動かない場合:

```powershell
# プロジェクト直下で実行
Remove-Item -Recurse -Force node_modules
Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue
npm install --no-audit --no-fund
npm run package
```

これでクリーン状態から再構築できます。

---

## 5. リリース直前の最終チェックリスト

- [ ] `package.json` の `version` を更新した
- [ ] `CHANGELOG.md` の先頭に新バージョンの変更点を追加した
- [ ] `npm run compile` が成功する（`dist/extension.js` と `media/vendor/` 一式が最新化される）
- [ ] `npm run package` を実行した（`--no-dependencies --no-yarn` は既定で付与される）
- [ ] 出力ログまたは `vsce ls --tree` で `media/vendor/marked.min.js` / `media/vendor/mermaid.min.js` / `media/vendor/katex.min.js` / `media/vendor/katex.min.css` / `media/vendor/fonts/` が含まれていることを確認した
- [ ] VSIX サイズが概ね 1.5〜2 MB 前後である
- [ ] `code --install-extension md-visual-editor-<version>.vsix --force` でインストールし、Mermaid 図・数式（KaTeX）が描画されることを確認した
- [ ] 旧バージョンの `*.vsix` は削除またはアーカイブした
- [ ] （Marketplace へ公開する場合のみ）`npm run publish` を実行した

---

*最終更新: 2026年7月19日*

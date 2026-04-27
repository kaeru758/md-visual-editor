# Markdown Visual Editor — 著作権・ライセンスコンプライアンス報告書

| 項目 | 内容 |
|---|---|
| ドキュメントバージョン | 2.0 |
| 対象拡張機能 | Markdown Visual Editor v0.4.1 |
| 作成日 | 2026-04-10 |
| 最終更新日 | 2026-04-27 |
| 調査方法 | `npm ls --all` による依存ツリー解析 + 各パッケージの `package.json` / `LICENSE` ファイル直接確認 |
| 調査対象パッケージ総数 | 105 パッケージ（直接依存 5 + 推移的依存 100） |

---

## 1. 結論

**本拡張機能は著作権を侵害していません。**

- 全105パッケージのライセンスを確認済み
- すべてのライセンスが商用・再配布を許可するオープンソースライセンスである
- コピーレフト型ライセンス（GPL等）は含まれていない
- 自作コードにおいて第三者の著作物をコピーした箇所はない

---

## 2. 自作コードの著作権状況

### 2.1 独自に作成したファイル

以下のファイルは本プロジェクトで新規に作成したオリジナルコードであり、第三者の著作物を複製していない。

| ファイル | 内容 | 著作権根拠 |
|---|---|---|
| `src/extension.ts` | 拡張機能エントリポイント | VS Code Extension API の公式ドキュメント・テンプレートを参考に独自実装 |
| `src/markdownVisualEditorProvider.ts` | CustomTextEditorProvider | VS Code API の `CustomTextEditorProvider` インターフェースを独自実装 |
| `media/editor.js` | WebViewメインエディタロジック | ブロックベースWYSIWYG方式を独自設計・実装 |
| `media/mermaid-visual-editor.js` | Mermaidビジュアルエディタ | Mermaid構文パーサー・GUI操作・SVGインタラクションを独自設計・実装 |
| `media/diagram-editors.js` | ダイアグラムビジュアルエディタ | クラス図・シーケンス図・テーブル・マインドマップ・象限チャート・ガントチャート・ER図のGUIエディタを独自設計・実装 |
| `media/editor.css` | エディタスタイル | VS Code テーマ変数を使用した独自デザイン |
| `package.json` | 拡張機能マニフェスト | 標準的なnpm/VS Code拡張機能形式で独自記述 |
| `esbuild.mjs` | ビルドスクリプト | esbuild公式APIを使用した汎用的な構成 |

### 2.2 参考にしたAPI・パターン

| 参考元 | 種別 | 利用形態 |
|---|---|---|
| [VS Code Extension API](https://code.visualstudio.com/api) | 公式API仕様 | APIインターフェースに基づく実装（著作権問題なし） |
| [VS Code Custom Editor サンプル](https://github.com/microsoft/vscode-extension-samples) | MIT License | 実装パターンを参考（コードのコピーなし） |
| [marked ドキュメント](https://marked.js.org/) | 公式ドキュメント | API呼び出し方法を参考（著作権問題なし） |
| [mermaid ドキュメント](https://mermaid.js.org/) | 公式ドキュメント | API呼び出し方法を参考（著作権問題なし） |

> **APIの利用はコードの複製ではなく、インターフェースに基づく独立した実装であるため著作権侵害にはあたらない。**

---

## 3. 直接依存パッケージのライセンス

本拡張機能が直接使用する5パッケージすべてがMITまたはApache-2.0ライセンスであり、無制限に利用・再配布が可能。

| パッケージ | バージョン | ライセンス | 用途 | 同梱形態 |
|---|---|---|---|---|
| **marked** | 4.3.0 | MIT | Markdownパース・HTML変換 | WebViewでブラウザライブラリとして読込 |
| **mermaid** | 10.9.5 | MIT | ダイアグラムSVGレンダリング | WebViewでブラウザライブラリとして読込 |
| **esbuild** | 0.19.12 | MIT | TypeScriptビルド・バンドル | 開発時のみ使用（ランタイム非同梱） |
| **typescript** | 5.9.3 | Apache-2.0 | TypeScriptコンパイラ | 開発時のみ使用（ランタイム非同梱） |
| **@types/vscode** | 1.115.0 | MIT | VS Code API 型定義 | 開発時のみ使用（ランタイム非同梱） |

---

## 4. 推移的依存パッケージのライセンス分布

全105パッケージを以下のライセンス分類に集計した。

| ライセンス | パッケージ数 | 再配布許可 | コピーレフト | 評価 |
|---|---|---|---|---|
| **MIT** | 62 | ✅ 可 | ❌ なし | ✅ 問題なし |
| **ISC** | 32 | ✅ 可 | ❌ なし | ✅ 問題なし |
| **BSD-3-Clause** | 4 | ✅ 可 | ❌ なし | ✅ 問題なし |
| **Apache-2.0** | 2 | ✅ 可 | ❌ なし | ✅ 問題なし |
| **MPL-2.0 OR Apache-2.0** | 1 | ✅ 可 | ⚠ MPLはファイル単位 | ✅ 問題なし（デュアルライセンスでApache-2.0選択可能） |
| **EPL-2.0** | 1 | ✅ 可 | ⚠ モジュール単位 | ✅ 問題なし（詳細は§4.2） |
| **Unlicense** | 1 | ✅ 可 | ❌ なし | ✅ 問題なし（パブリックドメイン相当） |
| **MIT（LICENSEファイルで確認）** | 1 | ✅ 可 | ❌ なし | ✅ 問題なし |
| ~~GPL系~~ | ~~0~~ | — | — | **GPL系ライセンスは含まれていない** |

### 4.1 注意を要するライセンスの詳細分析

#### dompurify — `(MPL-2.0 OR Apache-2.0)` デュアルライセンス

| 項目 | 内容 |
|---|---|
| パッケージ | dompurify（HTMLサニタイズライブラリ） |
| ライセンス | Mozilla Public License 2.0 **または** Apache License 2.0（選択可） |
| 採用ライセンス | **Apache-2.0を選択** |
| 理由 | デュアルライセンスのため利用者が選択可能。Apache-2.0はパーミッシブライセンスであり制約が少ない |
| 義務 | 変更を加えた場合のNOTICEファイル保持。本拡張機能ではdompurifyのソースを変更していないため追加義務なし |
| 結論 | **問題なし** |

#### elkjs — `EPL-2.0` Eclipse Public License 2.0

| 項目 | 内容 |
|---|---|
| パッケージ | elkjs（グラフレイアウトエンジン、mermaidの推移的依存） |
| ライセンス | Eclipse Public License 2.0 |
| コピーレフト範囲 | モジュール単位（ファイル単位のweak copyleft） |
| 利用形態 | mermaidライブラリの内部で間接的に使用。elkjsのソースコードを直接変更していない |
| 義務 | elkjs自体を改変して再配布する場合はEPL-2.0で公開する必要がある。改変なしの利用は自由 |
| 結論 | **問題なし** — 改変せず利用しているためEPL-2.0の義務は発生しない |

#### khroma — LICENSEファイルで MIT を確認

| 項目 | 内容 |
|---|---|
| パッケージ | khroma 2.1.0（カラーユーティリティ） |
| package.json の `license` フィールド | 空欄（未記載） |
| LICENSEファイルの記載 | `The MIT License (MIT) — Copyright (c) 2019-present Fabio Spampinato, Andrew Maney` |
| 結論 | **MIT License** — LICENSEファイルで明確に確認済み。問題なし |

---

## 5. ランタイム同梱パッケージの一覧

拡張機能の配布物（`.vsix`）に含まれるパッケージは以下のみ。開発時依存（esbuild, typescript, @types/vscode）はビルド時のみ使用され、配布物に含まれない。

### 5.1 WebViewで読み込まれるライブラリ

| パッケージ | ライセンス | 配布物内のパス |
|---|---|---|
| marked | MIT | `node_modules/marked/marked.min.js` |
| mermaid（＋推移的依存） | MIT + ISC + BSD-3 + Apache-2.0 + EPL-2.0 + Unlicense | `node_modules/mermaid/dist/mermaid.min.js` |

### 5.2 Node.js側（extension.js）

esbuildでバンドルされるが、marked/mermaidはWebView用のため `extension.js` にはバンドルされない。`extension.js` に同梱されるサードパーティコードは **ゼロ** である（VS Code APIは `external` 設定で除外）。

---

## 6. ライセンス義務の遵守

各ライセンスが要求する義務と遵守状況：

### 6.1 MIT License（62+1 パッケージ）

| 義務 | 遵守方法 |
|---|---|
| 著作権表示の保持 | 各パッケージの `LICENSE` ファイルが `node_modules/` 内に保持されている |
| ライセンス文の保持 | 同上 |

### 6.2 ISC License（32 パッケージ）

| 義務 | 遵守方法 |
|---|---|
| 著作権表示の保持 | 各パッケージの `LICENSE` ファイルが保持されている |

> ISCはMITと実質的に同等のパーミッシブライセンスである。

### 6.3 BSD-3-Clause（4 パッケージ）

| 義務 | 遵守方法 |
|---|---|
| 著作権表示の保持 | 各パッケージの `LICENSE` ファイルが保持されている |
| 推奨なしの条項 | 本拡張機能はBSD-3-Clauseパッケージの著者名を推奨目的で使用していない |

### 6.4 Apache-2.0（2 パッケージ + dompurifyの選択）

| 義務 | 遵守方法 |
|---|---|
| NOTICE ファイルの保持 | 該当パッケージのNOTICEファイルが存在する場合は `node_modules/` 内に保持 |
| 変更の明記 | 当該パッケージのソースコードは変更していないため不要 |

### 6.5 EPL-2.0（elkjs）

| 義務 | 遵守方法 |
|---|---|
| 改変時のソース公開 | elkjsのソースコードは改変していないため不要 |
| ライセンス文の保持 | `node_modules/elkjs/LICENSE.md` に保持されている |

---

## 7. 推移的依存パッケージの完全一覧

### MIT License（62 パッケージ）

```
@braintree/sanitize-url    @esbuild/win32-x64    @types/d3-scale
@types/d3-scale-chromatic  @types/d3-time         @types/debug
@types/mdast               @types/ms              @types/trusted-types
@types/unist               @types/vscode          character-entities
character-entities-legacy   character-reference-invalid  commander
cose-base                  cytoscape              cytoscape-cose-bilkent
dagre-d3-es                dayjs                  debug
decode-named-character-reference  esbuild         is-alphabetical
is-alphanumerical          is-decimal             is-hexadecimal
katex                      layout-base            lodash-es
marked                     mdast-util-from-markdown
mdast-util-to-string       mermaid                micromark
micromark-core-commonmark  micromark-factory-destination
micromark-factory-label    micromark-factory-space
micromark-factory-title    micromark-factory-whitespace
micromark-util-character   micromark-util-chunked
micromark-util-classify-character  micromark-util-combine-extensions
micromark-util-decode-numeric-character-reference
micromark-util-decode-string  micromark-util-encode
micromark-util-html-tag-name  micromark-util-normalize-identifier
micromark-util-resolve-all    micromark-util-sanitize-uri
micromark-util-subtokenize    micromark-util-symbol
micromark-util-types          ms
non-layered-tidy-tree-layout  stylis
ts-dedent                     unist-util-stringify-position
uvu                           uuid
```

### ISC License（32 パッケージ）

```
d3            d3-array      d3-axis       d3-brush      d3-chord
d3-color      d3-contour    d3-delaunay   d3-dispatch   d3-drag
d3-dsv        d3-fetch      d3-force      d3-format     d3-geo
d3-hierarchy  d3-interpolate d3-path      d3-polygon    d3-quadtree
d3-random     d3-scale      d3-scale-chromatic  d3-selection  d3-shape
d3-time       d3-time-format d3-timer     d3-transition  d3-zoom
delaunator    internmap
```

### BSD-3-Clause（4 パッケージ）

```
d3-ease       d3-sankey     diff          rw
```

### Apache-2.0（2 パッケージ）

```
typescript    web-worker
```

### MPL-2.0 OR Apache-2.0（1 パッケージ）

```
dompurify
```

### EPL-2.0（1 パッケージ）

```
elkjs
```

### Unlicense（1 パッケージ）

```
robust-predicates
```

### MIT — LICENSEファイルで確認（1 パッケージ）

```
khroma
```

---

## 8. コード品質と独自性の保証

### 8.1 コピーチェック

| 確認事項 | 結果 |
|---|---|
| Stack Overflow等からのコピー&ペースト | **なし** — VS Code Extension APIの標準的な使用パターンは公式ドキュメントに基づく |
| 他の拡張機能からのソースコピー | **なし** — 全ソースコードは独自に設計・実装 |
| AI生成コードの著作権リスク | GitHub Copilot等のAIツールで生成されたコードは、特定の著作物を複製したものではなく、一般的なプログラミングパターンに基づく独自の実装である |
| 画像・アイコン・フォントの借用 | **なし** — CSS形状アイコンのみ使用（SVG/画像ファイル不使用） |

### 8.2 商標に関する確認

| 名称 | 権利者 | 使用状況 |
|---|---|---|
| Visual Studio Code / VS Code | Microsoft Corporation | 本拡張機能名に直接使用していない。互換性説明目的での言及のみ（公正使用） |
| Mermaid | Knut Sveidqvist 他 | ダイアグラム構文名として使用（公正使用）。ロゴ・ブランド名の流用なし |
| Markdown | John Gruber | 一般的なファイル形式名として使用（商標登録なし） |

---

## 9. 配布時のライセンス遵守チェックリスト

拡張機能を `.vsix` として配布する際に確認すべき項目：

- [x] 各パッケージの `LICENSE` ファイルが `node_modules/` 内に存在する
- [x] GPL系ライセンスのパッケージが含まれていない
- [x] コピーレフト系ライセンス（EPL-2.0）のパッケージを改変していない
- [x] 全パッケージのライセンスが商用利用・再配布を許可している
- [x] 自作コードに第三者の著作物を無断でコピーした箇所がない
- [x] 商標を不正使用していない
- [x] 他の拡張機能のソースコードを複製していない
- [ ] 本拡張機能自体のライセンス（MIT推奨）を `LICENSE` ファイルとして追加する（配布前に対応）

---

## 10. 推奨事項

1. **本拡張機能自体のLICENSEファイルを追加する** — MITライセンスでの公開を推奨
2. **`npm audit` による定期的な脆弱性チェック** — 依存パッケージに新たな脆弱性が報告された場合は速やかに更新
3. **メジャーバージョンアップ時のライセンス再確認** — marked / mermaid のメジャーアップデート時には依存ライセンスの変更がないか確認
4. **THIRD-PARTY-NOTICES ファイルの作成** — Marketplace公開時には全依存パッケージの著作権表示・ライセンス文をまとめたファイルの同梱を推奨

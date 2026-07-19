# Markdown Visual Editor — 著作権・ライセンスコンプライアンス報告書

| 項目 | 内容 |
|---|---|
| ドキュメントバージョン | 2.1 |
| 対象拡張機能 | Markdown Visual Editor v0.5.6 |
| 作成日 | 2026-04-10 |
| 最終更新日 | 2026-07-19 |
| 調査方法 | `npm ls --all --omit=dev` による本番依存ツリー解析 + 各パッケージの `package.json` の `license` フィールド確認（未記載の場合は `LICENSE` ファイル直接確認） |
| 調査対象パッケージ総数 | **121 パッケージ**（本番依存ツリー: 直接依存 3 + 推移的依存 118）。開発依存（`esbuild` / `typescript` / `@types/vscode` / `@vscode/vsce`）は配布物 (`.vsix`) に含まれないため別掲（§3） |

> ⚠️ v2.0（2026-04-27）時点の本書は `mermaid` を `10.9.5` として調査していました。現在の `package.json` は `mermaid ^11.14.0` を使用しており、メジャーバージョンアップに伴い依存ツリーが大きく変わっています（`elkjs`(EPL-2.0) が本番依存から消え、代わりに `chevrotain` / `langium` 系（Apache-2.0 / MIT）が新規に追加されるなど）。本改訂版はインストール済みの実際の `node_modules` を再調査した結果です。

---

## 1. 結論

**本拡張機能は著作権を侵害していません。**

- 本番依存ツリー全121パッケージのライセンスを確認済み
- すべてのライセンスが商用・再配布を許可するオープンソースライセンスである
- コピーレフト型ライセンス（GPL等）は含まれていない
- 自作コードにおいて第三者の著作物をコピーした箇所はない

---

## 2. 自作コードの著作権状況

### 2.1 独自に作成したファイル

以下のファイルは本プロジェクトで新規に作成したオリジナルコードであり、第三者の著作物を複製していない。

| ファイル | 内容 | 著作権根拠 |
|---|---|---|
| `src/extension.ts` | 拡張機能エントリポイント（コマンド登録・CustomEditor 登録） | VS Code Extension API の公式ドキュメント・テンプレートを参考に独自実装 |
| `src/markdownVisualEditorProvider.ts` | CustomTextEditorProvider | VS Code API の `CustomTextEditorProvider` インターフェースを独自実装 |
| `media/editor.js` | WebViewメインエディタロジック | ブロックベースWYSIWYG方式・検索置換・テーマ・PDF出力・画像D&D・変更ハイライトを独自設計・実装 |
| `media/mermaid-visual-editor.js` | Mermaidビジュアルエディタ（専用GUI） | フローチャート等のMermaid構文パーサー・GUI操作・SVGインタラクションを独自設計・実装 |
| `media/diagram-editors.js` | ダイアグラムビジュアルエディタ（専用GUI） | クラス図・シーケンス図・テーブル・マインドマップ・象限チャート・ガントチャート・ER図のGUIエディタを独自設計・実装 |
| `media/extra-diagram-editors.js` | 汎用フォームダイアグラムエディタ（14種） | 状態遷移・パイ・ジャーニー・Gitグラフ・タイムライン・要求図・C4・Sankey・XY・ブロック・パケット・アーキテクチャ・Kanban等の共通GUI基盤 (`DiagramCommon`) を独自設計・実装 |
| `media/editor.css` | エディタスタイル | VS Code テーマ変数を使用した独自デザイン |
| `package.json` | 拡張機能マニフェスト | 標準的なnpm/VS Code拡張機能形式で独自記述 |
| `esbuild.mjs` | ビルドスクリプト（vendor アセットコピー含む） | esbuild公式APIを使用した汎用的な構成 |

### 2.2 参考にしたAPI・パターン

| 参考元 | 種別 | 利用形態 |
|---|---|---|
| [VS Code Extension API](https://code.visualstudio.com/api) | 公式API仕様 | APIインターフェースに基づく実装（著作権問題なし） |
| [VS Code Custom Editor サンプル](https://github.com/microsoft/vscode-extension-samples) | MIT License | 実装パターンを参考（コードのコピーなし） |
| [marked ドキュメント](https://marked.js.org/) | 公式ドキュメント | API呼び出し方法を参考（著作権問題なし） |
| [mermaid ドキュメント](https://mermaid.js.org/) | 公式ドキュメント | API呼び出し方法を参考（著作権問題なし） |
| [KaTeX ドキュメント](https://katex.org/) | 公式ドキュメント | `renderToString` 等のAPI呼び出し方法を参考（著作権問題なし） |

> **APIの利用はコードの複製ではなく、インターフェースに基づく独立した実装であるため著作権侵害にはあたらない。**

---

## 3. 直接依存パッケージのライセンス

| パッケージ | バージョン | ライセンス | 用途 | 同梱形態 |
|---|---|---|---|---|
| **marked** | 4.3.0 | MIT | Markdownパース・HTML変換 | `media/vendor/marked.min.js` としてWebViewに同梱 |
| **mermaid** | 11.14.0 | MIT | ダイアグラムSVGレンダリング | `media/vendor/mermaid.min.js` としてWebViewに同梱 |
| **katex** | 0.17.0 | MIT | LaTeX数式レンダリング | `media/vendor/katex.min.{js,css}` + `media/vendor/fonts/*` としてWebViewに同梱 |
| esbuild | 0.19.12 | MIT | TypeScriptビルド・バンドル | 開発時のみ使用（ランタイム非同梱） |
| typescript | 5.9.3 | Apache-2.0 | TypeScriptコンパイラ | 開発時のみ使用（ランタイム非同梱） |
| @types/vscode | 1.116.0 | MIT | VS Code API 型定義 | 開発時のみ使用（ランタイム非同梱） |
| @vscode/vsce | 3.9.1 | MIT | VSIXパッケージング/公開ツール | 開発時のみ使用（ランタイム非同梱） |

本拡張機能が配布物（`.vsix`）にランタイムとして同梱する直接依存は **marked / mermaid / katex の3パッケージ**（すべてMIT）。それ以外は開発時専用で `dependencies` ではなく `devDependencies` に属し、配布物には含まれない。

---

## 4. 推移的依存パッケージのライセンス分布

本番依存ツリー（`npm ls --all --omit=dev`、marked / mermaid / katex 経由）に含まれる全121パッケージを以下のライセンス分類に集計した。

| ライセンス | パッケージ数 | 再配布許可 | コピーレフト | 評価 |
|---|---|---|---|---|
| **MIT** | 77 | ✅ 可 | ❌ なし | ✅ 問題なし |
| **MIT（LICENSEファイルで確認、`license`フィールド空欄）** | 1（khroma） | ✅ 可 | ❌ なし | ✅ 問題なし |
| **ISC** | 32 | ✅ 可 | ❌ なし | ✅ 問題なし |
| **Apache-2.0** | 6 | ✅ 可 | ❌ なし | ✅ 問題なし |
| **BSD-3-Clause** | 3 | ✅ 可 | ❌ なし | ✅ 問題なし |
| **MPL-2.0 OR Apache-2.0** | 1（dompurify） | ✅ 可 | ⚠ MPLはファイル単位 | ✅ 問題なし（デュアルライセンスでApache-2.0選択可能） |
| **Unlicense** | 1（robust-predicates） | ✅ 可 | ❌ なし | ✅ 問題なし（パブリックドメイン相当） |
| ~~GPL系~~ | ~~0~~ | — | — | **GPL系ライセンスは含まれていない** |

> **v2.0 からの変更点**: 旧版が挙げていた `elkjs`（EPL-2.0）は、`mermaid ^11.14.0` の本番依存ツリーには**含まれていない**（`npm ls --all --omit=dev` で非検出、`node_modules/elkjs` も存在しない。詳細は §4.1）。一方で `mermaid` の構文パーサー刷新に伴い `chevrotain` 系（Apache-2.0、6パッケージ）・`langium` / `vscode-languageserver*` 系（MIT）が新規に加わっている。

### 4.1 注意を要するライセンスの詳細分析

#### dompurify — `(MPL-2.0 OR Apache-2.0)` デュアルライセンス

| 項目 | 内容 |
|---|---|
| パッケージ | dompurify（HTMLサニタイズライブラリ、mermaidの推移的依存） |
| ライセンス | Mozilla Public License 2.0 **または** Apache License 2.0（選択可） |
| 採用ライセンス | **Apache-2.0を選択** |
| 理由 | デュアルライセンスのため利用者が選択可能。Apache-2.0はパーミッシブライセンスであり制約が少ない |
| 義務 | 変更を加えた場合のNOTICEファイル保持。本拡張機能ではdompurifyのソースを変更していないため追加義務なし |
| 結論 | **問題なし** |

> 注: 本拡張機能自身のWebView側HTMLサニタイズ（`editor.js` の `sanitizeHtml`）はdompurifyを使わない独自のdenylist実装であり、ここでのdompurifyはあくまで`mermaid`が内部で使用する推移的依存。

#### elkjs（EPL-2.0）— 現在の依存ツリーには存在しない

| 項目 | 内容 |
|---|---|
| 旧版（v2.0）での扱い | 「mermaidの推移的依存」としてEPL-2.0パッケージに分類していた |
| 現状の調査結果 | `mermaid@11.14.0` の `package.json` の `dependencies` に `elkjs` は含まれず、`npm ls --all --omit=dev` の出力にも登場しない。`node_modules/elkjs` ディレクトリも存在しない |
| `mermaid.min.js` 内の文字列調査 | `"elkjs"` および `"Eclipse Public License"` の文字列は見つからず（`"elk"` という設定値の文字列は12箇所あるが、これはレイアウトエンジン名の識別子であり elkjs のコード本体ではない） |
| 結論 | **現時点の配布物にEPL-2.0コードが同梱されている証拠はない。** ELKレイアウトの実装詳細（Mermaid公式が別パッケージとして提供する `@mermaid-js/layout-elk` を利用しているか、`mermaid.min.js` に他の形で含まれているか）は本調査の対象外だが、本プロジェクトの `node_modules` / `package.json` の観点では EPL-2.0 パッケージへの直接的な依存はない |

#### chevrotain / langium 系 — mermaid 11 で新規に追加された推移的依存

| 項目 | 内容 |
|---|---|
| パッケージ | `chevrotain` 本体 + `@chevrotain/cst-dts-gen` / `@chevrotain/gast` / `@chevrotain/regexp-to-ast` / `@chevrotain/types` / `@chevrotain/utils`（構文解析ツールキット）、`langium` / `vscode-languageserver*`（言語ツール基盤） |
| ライセンス | chevrotain系: Apache-2.0（6パッケージ）／ langium・vscode-languageserver系: MIT |
| 利用形態 | `@mermaid-js/parser`（mermaidの内部依存）が一部ダイアグラム構文のパースに利用。ソースコードを変更せず利用 |
| 義務 | Apache-2.0: NOTICEファイル保持（変更なしのため追加義務なし）。MIT: 著作権表示保持 |
| 結論 | **問題なし** |

#### khroma — LICENSEファイルで MIT を確認

| 項目 | 内容 |
|---|---|
| パッケージ | khroma（カラーユーティリティ、mermaidの推移的依存） |
| package.json の `license` フィールド | 空欄（未記載） |
| LICENSEファイルの記載 | `The MIT License (MIT) — Copyright (c) 2019-present Fabio Spampinato, Andrew Maney` |
| 結論 | **MIT License** — LICENSEファイルで明確に確認済み。問題なし |

---

## 5. ランタイム同梱パッケージの一覧

拡張機能の配布物（`.vsix`）に含まれる第三者コードは、`esbuild.mjs` の `copyVendorAssets()` がビルド時に `node_modules/` から `media/vendor/` へコピーしたファイルのみ。**`node_modules/` 自体は `.vscodeignore` により VSIX から完全に除外されている**（旧版の「`node_modules/marked/**` 等を許可リストで含める」方式から変更済み）。開発時依存（esbuild, typescript, @types/vscode, @vscode/vsce）はビルド時のみ使用され、配布物に含まれない。

### 5.1 WebViewで読み込まれるライブラリ

| パッケージ | ライセンス | 配布物内のパス |
|---|---|---|
| marked | MIT | `media/vendor/marked.min.js` |
| mermaid（＋推移的依存） | MIT + ISC + Apache-2.0 + BSD-3-Clause + (MPL-2.0 OR Apache-2.0) + Unlicense（§4参照。EPL-2.0は含まれない） | `media/vendor/mermaid.min.js` |
| katex（フォント含む） | MIT | `media/vendor/katex.min.js`、`media/vendor/katex.min.css`、`media/vendor/fonts/*.woff` `*.woff2`（40ファイル、`.ttf` は除外） |

### 5.2 Node.js側（extension.js）

esbuildでバンドルされるが、marked/mermaid/katexはWebView用のため `extension.js` にはバンドルされない。`extension.js` に同梱されるサードパーティコードは **ゼロ** である（VS Code APIは `external` 設定で除外）。

---

## 6. ライセンス義務の遵守

各ライセンスが要求する義務と遵守状況：

### 6.1 MIT License（77+1 パッケージ）

| 義務 | 遵守方法 |
|---|---|
| 著作権表示の保持 | 各パッケージの `LICENSE` ファイルが `node_modules/` 内に保持されている（開発環境）。配布物にはコンパイル済み `media/vendor/*.min.js` `*.min.css` のみを含めるため、Marketplace公開時はTHIRD-PARTY-NOTICESファイルの同梱を推奨（§10参照） |
| ライセンス文の保持 | 同上 |

### 6.2 ISC License（32 パッケージ）

| 義務 | 遵守方法 |
|---|---|
| 著作権表示の保持 | 各パッケージの `LICENSE` ファイルが保持されている |

> ISCはMITと実質的に同等のパーミッシブライセンスである。

### 6.3 BSD-3-Clause（3 パッケージ）

| 義務 | 遵守方法 |
|---|---|
| 著作権表示の保持 | 各パッケージの `LICENSE` ファイルが保持されている |
| 推奨なしの条項 | 本拡張機能はBSD-3-Clauseパッケージの著者名を推奨目的で使用していない |

### 6.4 Apache-2.0（6 パッケージ + dompurifyの選択）

| 義務 | 遵守方法 |
|---|---|
| NOTICE ファイルの保持 | 該当パッケージのNOTICEファイルが存在する場合は `node_modules/` 内に保持 |
| 変更の明記 | 当該パッケージのソースコードは変更していないため不要 |

### 6.5 KaTeX（MIT）とフォントの扱い

| 義務 | 遵守方法 |
|---|---|
| 著作権表示の保持 | `node_modules/katex/LICENSE` は単一のMITライセンス文（Copyright (c) 2013-2020 Khan Academy and other contributors）であり、`package.json` の `license` フィールドも `MIT`。フォント専用の別ライセンスファイル（OFL等）は npm パッケージ内に存在しない |
| フォントの同梱 | `media/vendor/fonts/*.woff` `*.woff2`（KaTeXが `katex.min.css` から相対パスで参照する40ファイル）をそのまま同梱。改変なし |
| 結論 | KaTeX本体・CSS・フォントはすべて単一のMITライセンスの下で配布されている。**問題なし** |

---

## 7. 推移的依存パッケージの完全一覧

### MIT License（77 パッケージ）

```
@antfu/install-pkg          @braintree/sanitize-url     @iconify/types
@iconify/utils               @mermaid-js/parser          @types/d3
@types/d3-array               @types/d3-axis              @types/d3-brush
@types/d3-chord               @types/d3-color              @types/d3-contour
@types/d3-delaunay            @types/d3-dispatch           @types/d3-drag
@types/d3-dsv                  @types/d3-ease               @types/d3-fetch
@types/d3-force                 @types/d3-format             @types/d3-geo
@types/d3-hierarchy             @types/d3-interpolate        @types/d3-path
@types/d3-polygon               @types/d3-quadtree           @types/d3-random
@types/d3-scale                 @types/d3-scale-chromatic    @types/d3-selection
@types/d3-shape                 @types/d3-time                @types/d3-time-format
@types/d3-timer                 @types/d3-transition          @types/d3-zoom
@types/geojson                  @types/trusted-types          @upsetjs/venn.js
acorn                           chevrotain-allstar            commander
confbox                         cose-base                     cytoscape
cytoscape-cose-bilkent          cytoscape-fcose                dagre-d3-es
dayjs                           hachure-fill                   iconv-lite
katex                           langium                        layout-base
lodash-es                       marked                         mermaid
mlly                            package-manager-detector       path-data-parser
pathe                           pkg-types                      points-on-curve
points-on-path                  roughjs                        safer-buffer
stylis                          tinyexec                       ts-dedent
ufo                             uuid                           vscode-jsonrpc
vscode-languageserver           vscode-languageserver-protocol vscode-languageserver-textdocument
vscode-languageserver-types     vscode-uri
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

### Apache-2.0（6 パッケージ）

```
@chevrotain/cst-dts-gen   @chevrotain/gast   @chevrotain/regexp-to-ast
@chevrotain/types         @chevrotain/utils  chevrotain
```

### BSD-3-Clause（3 パッケージ）

```
d3-ease       d3-sankey     rw
```

### MPL-2.0 OR Apache-2.0（1 パッケージ）

```
dompurify
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
| 画像・アイコン・フォントの使用 | 独自作成のアイコンはCSS形状のみ（SVG/画像ファイル不使用）。**フォントはKaTeX同梱の`media/vendor/fonts/*`（MIT、§6.5参照）を無改変で使用** — 自作フォントではないが、ライセンス上再配布可能なものをそのまま同梱している |

### 8.2 商標に関する確認

| 名称 | 権利者 | 使用状況 |
|---|---|---|
| Visual Studio Code / VS Code | Microsoft Corporation | 本拡張機能名に直接使用していない。互換性説明目的での言及のみ（公正使用） |
| Mermaid | Knut Sveidqvist 他 | ダイアグラム構文名として使用（公正使用）。ロゴ・ブランド名の流用なし |
| Markdown | John Gruber | 一般的なファイル形式名として使用（商標登録なし） |
| KaTeX | Khan Academy | 数式レンダリング機能名・ライブラリ名として言及（公正使用）。ロゴ・ブランド名の流用なし |

---

## 9. 配布時のライセンス遵守チェックリスト

拡張機能を `.vsix` として配布する際に確認すべき項目：

- [x] 各パッケージの `LICENSE` ファイルが `node_modules/` 内（開発環境）に存在する
- [x] GPL系ライセンスのパッケージが含まれていない
- [x] コピーレフト系ライセンス（MPL-2.0系のdompurify）を改変していない
- [x] 全パッケージのライセンスが商用利用・再配布を許可している
- [x] 自作コードに第三者の著作物を無断でコピーした箇所がない
- [x] 商標を不正使用していない
- [x] 他の拡張機能のソースコードを複製していない
- [x] 本拡張機能自体のライセンス（MIT）を `LICENSE` ファイルとして追加済み（Copyright (c) 2026 R.Kojima、リポジトリルート `LICENSE`）

---

## 10. 推奨事項

1. **`npm audit` による定期的な脆弱性チェック** — 依存パッケージに新たな脆弱性が報告された場合は速やかに更新
2. **メジャーバージョンアップ時のライセンス再確認** — 本改訂で判明した通り、`mermaid` のようなメジャーアップデートは依存ツリーを大きく変える（`elkjs` の消失、`chevrotain`/`langium` 系の追加など）。`marked` / `mermaid` / `katex` のメジャーアップデート時は `npm ls --all --omit=dev` を再実行し、本書を更新すること
3. **THIRD-PARTY-NOTICES ファイルの作成** — Marketplace公開時には全依存パッケージの著作権表示・ライセンス文をまとめたファイルの同梱を推奨（現時点では社内配布限定のため未着手）
4. **本書の「調査対象パッケージ総数」は都度の実測値に置き換えること** — バージョンごとに変動するため、固定の数値として引用しない

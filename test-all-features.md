# Markdown Visual Editor — 全機能テストドキュメント

> **使い方:** このファイルを Markdown Visual Editor で開き（右クリック → Open With... → Markdown Visual Editor）、各セクションのチェックリストに従って動作を確認してください。  
> 対象バージョン: **v0.4.1** / Mermaid 11.14.x / 21 種類対応

---

## 0. テスト前の確認

- [ ] VS Code 1.80.0 以上
- [ ] 拡張機能 `md-visual-editor-0.4.1.vsix` がインストール済み
- [ ] このファイルを「Markdown Visual Editor」で開けている（タブのアイコンがプレビュー表示になっていること）

---

## 1. WYSIWYG ブロック編集 — 基本

このセクションの各ブロックを **ダブルクリック** して編集モードに入り、`Escape` または `Ctrl + Enter` で確定してください。

### 段落

これは段落です。**太字**、*斜体*、~~取り消し線~~、`インラインコード` が含まれます。  
ダブルクリック → 末尾に「（編集テスト済み）」を追加 → `Escape` で確定できれば OK。

- [ ] 段落をダブルクリックで編集できる
- [ ] `Escape` で確定 / `Ctrl + Enter` で確定 / 他ブロックのクリックで確定
- [ ] 編集中の背景色が VS Code エディタ色に **変化しない**（v0.3.1 の修正点）

### 見出し

# 見出し H1
## 見出し H2
### 見出し H3
#### 見出し H4
##### 見出し H5
###### 見出し H6

- [ ] 各見出しをダブルクリック編集できる

### リスト

- 箇条書き 1
- 箇条書き 2
  - ネスト項目 A
  - ネスト項目 B
- 箇条書き 3

1. 番号付き 1
2. 番号付き 2
3. 番号付き 3

- [ ] リスト全体をダブルクリックで編集できる
- [ ] ネストしたリストが保持される

### 引用 / 区切り線

> これは引用ブロックです。複数行も可。
> 2 行目。

---

- [ ] 引用ブロックがダブルクリック編集できる
- [ ] 区切り線が表示される

### コードブロック

```javascript
function hello(name) {
  console.log(`Hello, ${name}!`);
  return name.length;
}
```

- [ ] コードブロックがシンタックスハイライト表示される
- [ ] ダブルクリックで編集できる

### リンク / 画像

- 外部 HTTP: <https://example.com/>
- 外部 HTTPS: [Mermaid 公式](https://mermaid.js.org/)
- メール: [連絡先](mailto:test@example.com)
- 相対パス: [README へ](README.md)
- 画像（外部 URL は表示されない場合があります）: ![sample](https://via.placeholder.com/80)

**v0.3.1 リンク動作テスト:**

- [ ] 通常クリック → 何も起こらない（誤クリック防止）
- [ ] **`Ctrl + Click`**（macOS は `Cmd + Click`）で `https://mermaid.js.org/` が外部ブラウザで開く
- [ ] **`Ctrl + Click`** で `mailto:test@example.com` がメールクライアントで開く
- [ ] **`Ctrl + Click`** で `README.md` が VS Code 内で開く

---

## 2. ツールバー — 挿入

ツールバー左側のボタンで以下を順に挿入してください。

- [ ] **H1〜H6** を順に挿入
- [ ] **B / I / S / `</>`** を順に挿入
- [ ] **• List / 1. List** を挿入
- [ ] **🔗 リンク** を挿入
- [ ] **⊞ テーブル** を挿入（3×3 のテンプレートが入る）
- [ ] **{ } コードブロック** を挿入
- [ ] **--- 区切り線** を挿入

### 挿入位置ピッカー（ブロック編集していない状態でテスト）

- [ ] ツールバーボタンを押すと「挿入位置ピッカー」が表示される
- [ ] 「先頭に挿入」を選ぶとドキュメント先頭に入る
- [ ] 「○○の後に挿入」で任意ブロックの直後に入る

---

## 3. ツールバー右端 — v0.3.1 ユーティリティ

### 3.1 🔍 検索 / 置換バー

- [ ] ツールバー右端の **🔍** をクリック → 検索バーが表示される
- [ ] **`Ctrl + F`** でも検索バーが開く
- [ ] **`Ctrl + H`** で検索バーが開き、置換ボックスにフォーカスが移る
- [ ] 検索ボックスに `テスト` と入力 → 一致箇所が黄色でハイライト、現在位置がオレンジ
- [ ] `↑` / `↓` ボタン（または Enter / Shift+Enter）で次／前へ移動
- [ ] カウンタ表示（例: `3 / 12`）が正しい
- [ ] **`Aa`**（大文字小文字区別）を ON にして再検索 → 件数が変化する
- [ ] **`.*`**（正規表現）を ON にして `\d+` で検索 → 数字にマッチ
- [ ] 置換ボックスに `OK` と入力 → 「1 つ置換」で 1 箇所だけ置換される
- [ ] 「すべて置換」で残り全部が置換される（Undo で戻せる）
- [ ] **`Esc`** で検索バーが閉じる

### 3.2 ☀️ / 🌙 テーマ強制切替

- [ ] ボタンをクリックするたびに `自動` → `ライト強制` → `ダーク強制` → `自動` と循環
- [ ] テーマを変えると Mermaid 図の色も追従する
- [ ] 一度設定したら、ファイルを閉じて開き直しても保持される
- [ ] VS Code 自体のテーマを変えても、強制設定中は固定される

### 3.3 📝 テキストエディタで開く

- [ ] **📝** をクリック → 同じファイルが標準テキストエディタで開く
- [ ] 標準エディタで編集して保存 → ビジュアルエディタ側に変更が反映される

---

## 4. テーブル GUI 編集

| 商品名 | 数量 | 単価 |
|---|---:|---:|
| りんご | 3 | 150 |
| みかん | 5 | 80 |
| ぶどう | 2 | 400 |

- [ ] テーブル右上の「✎ テーブルを編集」ボタンが表示される
- [ ] ボタンをクリック → GUI 編集モードに切り替わる
- [ ] セルを直接クリック → 値を入力できる
- [ ] 「➕ 列追加」「➕ 行追加」で拡張できる
- [ ] 列・行の「✕」で削除できる
- [ ] 列ヘッダーで配置（左 / 中央 / 右）を変更できる
- [ ] 「保存」で確定 / 「キャンセル」で破棄

---

## 5. Mermaid — 高機能 GUI 7 種

各図にマウスを乗せて「✎ ダイアグラムを編集」をクリックし、専用ビジュアルエディタで操作してください。

### 5.1 フローチャート

```mermaid
flowchart TB
    Start([開始]) --> Input[/入力/]
    Input --> Decision{条件分岐}
    Decision -->|Yes| Process[処理 A]
    Decision -->|No| Skip[処理 B]
    Process --> End([終了])
    Skip --> End

    subgraph 前処理
        Input
        Decision
    end
```

- [ ] ノード追加・編集・削除（形状: 矩形・角丸・ひし形・円形 等）
- [ ] エッジの追加（接続元 → 接続先）
- [ ] エッジをダブルクリック → 方向反転 ⇄ / 削除 / 線種変更 / ラベル編集
- [ ] サブグラフをダブルクリック → 名前変更・ノード追加／除外
- [ ] 方向切り替え `TB / LR / RL / BT`
- [ ] **【v0.3.1】レイアウト切替: Dagre / ELK / ELK ツリー**
  - [ ] ELK を選んで保存 → コードに `%%{init:{"layout":"elk"}}%%` が付く
  - [ ] 再度開いてもレイアウト選択が復元される
- [ ] **【v0.3.1】サブグラフ入れ子化**
  - [ ] サブグラフを 2 つ以上作る
  - [ ] 一覧の「親グループ」プルダウンで片方をもう片方の中に入れる
  - [ ] サイクルになる組み合わせは選択肢に出ない（拒否される）
  - [ ] 複数選択 → 「🗂️ 複数グループを 1 つに結合」で 1 つのサブグラフにまとめられる
- [ ] **【v0.3.1】SVG が描画領域に収まる図は、初期表示で勝手に拡大されない（倍率 1.0）**
- [ ] Undo（`Ctrl + Z`）/ Redo（`Ctrl + Y`）が動く

### 5.2 シーケンス図

```mermaid
sequenceDiagram
    participant U as ユーザー
    participant W as WebView
    participant H as ホスト
    U->>W: ダブルクリック
    W->>W: 編集モード開始
    U->>W: テキスト入力
    W->>H: edit メッセージ
    H-->>W: update メッセージ
    Note over U,H: 完全ローカルでやり取り
```

- [ ] アクター / 参加者の追加・編集・削除・並べ替え
- [ ] メッセージの追加・編集・並び替え（↑↓）
- [ ] ノートの追加（right of / left of / over）
- [ ] SVG 上のメッセージ線をクリック → 種類変更
- [ ] SVG 上のメッセージテキストをダブルクリック → 編集

### 5.3 クラス図

```mermaid
classDiagram
    class Animal {
        +String name
        +int age
        +eat() void
    }
    class Dog {
        +bark() void
    }
    class Cat {
        +meow() void
    }
    Animal <|-- Dog
    Animal <|-- Cat
```

- [ ] クラスの追加・編集・削除
- [ ] 属性・メソッドの追加・編集・削除
- [ ] リレーション（継承・実装・関連・依存等）の追加・編集・削除
- [ ] SVG 上のクラスをクリック → リストパネルがスクロール・ハイライト

### 5.4 マインドマップ

```mermaid
mindmap
  root((テスト))
    機能
      WYSIWYG
      ツールバー
      検索
    Mermaid
      フロー
      クラス
      シーケンス
    UI
      テーマ
      ショートカット
```

- [ ] ノードの追加・編集・削除（形状選択）
- [ ] SVG 上のノードをドラッグ＆ドロップで親変更
- [ ] SVG 上のノードをダブルクリックでインライン編集

### 5.5 象限チャート

```mermaid
quadrantChart
    title Reach and Engagement
    x-axis Low Reach --> High Reach
    y-axis Low Engagement --> High Engagement
    quadrant-1 Expand
    quadrant-2 Niche
    quadrant-3 Avoid
    quadrant-4 Reevaluate
    Campaign A: [0.3, 0.6]
    Campaign B: [0.45, 0.23]
    Campaign C: [0.57, 0.69]
    Campaign D: [0.78, 0.34]
```

- [ ] タイトル・軸ラベル・象限ラベルの編集（**ASCII 推奨**）
- [ ] データポイントの追加・編集・削除
- [ ] SVG 上のデータポイントをドラッグして移動
- [ ] ダブルクリックで名前変更

### 5.6 ガントチャート

```mermaid
gantt
    title プロジェクト計画
    dateFormat YYYY-MM-DD
    axisFormat %m/%d
    section 設計
    要件定義  :a1, 2026-04-01, 7d
    基本設計  :a2, after a1, 5d
    section 実装
    コーディング :b1, after a2, 14d
    テスト       :b2, after b1, 7d
```

- [ ] セクション・タスクの追加・編集・削除
- [ ] 日付・期間・依存関係・ステータス
- [ ] セクション折りたたみ（▼/▶）
- [ ] タスクのドラッグ＆ドロップ並び替え（セクション内・間）
- [ ] セクション色 → 配下タスクに自動適用

### 5.7 ER 図

```mermaid
erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE_ITEM : contains
    PRODUCT ||--o{ LINE_ITEM : "ordered in"
    CUSTOMER {
        string name PK
        string email UK
    }
    ORDER {
        int id PK
        date created_at
    }
```

- [ ] エンティティの追加・名前変更・削除
- [ ] 属性の追加・編集（PK/FK/UK 設定）
- [ ] リレーション（6 種カーディナリティ）の追加・編集
- [ ] エンティティ名ダブルクリック → コンテキストメニュー

---

## 6. Mermaid — 汎用フォーム GUI 14 種（v0.3.0 追加）

各図でも「✎ ダイアグラムを編集」から汎用フォームエディタが起動します。  
共通機能: **セクション別リスト編集 + ライブ SVG プレビュー + コードモード切替**

### 6.1 状態遷移図

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> Editing : ダブルクリック
    Editing --> Idle : Escape / Ctrl+Enter
    Editing --> [*] : エラー
```

- [ ] フォームで状態追加・遷移追加・削除
- [ ] コードモード切替で Mermaid ソースを直接編集
- [ ] ライブプレビューが更新される

### 6.2 パイチャート

```mermaid
pie title 利用ブラウザ
    "Chrome" : 60
    "Edge" : 25
    "Firefox" : 10
    "Safari" : 5
```

### 6.3 ユーザージャーニー

```mermaid
journey
    title 利用者の朝の習慣
    section 起床
      目覚ましを止める: 3: User
      ストレッチ: 4: User
    section 出勤
      電車に乗る: 2: User
      コーヒー購入: 5: User
```

### 6.4 Git グラフ

```mermaid
gitGraph
    commit
    commit
    branch develop
    checkout develop
    commit
    commit
    checkout main
    merge develop
    commit
```

### 6.5 タイムライン

```mermaid
timeline
    title プロジェクトの歴史
    2024 : 構想
    2025 : プロトタイプ : v0.1 リリース
    2026 : v0.4.1 リリース
```

### 6.6 要求図

```mermaid
requirementDiagram
    requirement test_req {
        id: "1"
        text: "テスト要件"
        risk: high
        verifymethod: test
    }
    element test_entity {
        type: "simulation"
    }
    test_entity - satisfies -> test_req
```

### 6.7 C4 図

```mermaid
C4Context
    title System Context for Markdown Visual Editor
    Person(user, "ユーザー")
    System(vsce, "VS Code", "エディタ")
    System_Ext(fs, "ファイルシステム")
    Rel(user, vsce, "操作")
    Rel(vsce, fs, "読み書き")
```

### 6.8 Sankey 図

```mermaid
sankey-beta
Source A,Target X,10
Source A,Target Y,5
Source B,Target X,7
Source B,Target Z,3
```

### 6.9 XY チャート

```mermaid
xychart-beta
    title "Sales Revenue"
    x-axis [Jan, Feb, Mar, Apr, May]
    y-axis "Revenue" 0 --> 10000
    bar [5000, 6000, 7500, 8200, 9500]
    line [5000, 6000, 7500, 8200, 9500]
```

### 6.10 ブロック図

```mermaid
block-beta
columns 3
  A B C
  D:3
  E F G
```

### 6.12 パケット図

```mermaid
packet-beta
0-15: "Source Port"
16-31: "Destination Port"
32-63: "Sequence Number"
64-95: "Acknowledgment Number"
```

### 6.13 アーキテクチャ図

```mermaid
architecture-beta
    group api(cloud)[API]

    service db(database)[Database] in api
    service disk1(disk)[Storage] in api
    service server(server)[Server] in api

    db:L -- R:server
    disk1:T -- B:server
```

### 6.14 Kanban

```mermaid
kanban
    todo[To Do]
        task1[テスト準備]
        task2[資料作成]
    inprogress[In Progress]
        task3[コードレビュー]
    done[Done]
        task4[v0.4.1 リリース]
```

**14 種共通チェック:**

- [ ] 各図でビジュアルエディタが起動する
- [ ] フォーム入力でリスト追加・編集・削除ができる
- [ ] ライブ SVG プレビューが更新される
- [ ] コードモードに切り替えて直接編集できる
- [ ] 保存して再オープンしても内容が保持される

---

## 7. Mermaid コードフォールバック

未知の構文や判定不能な図は、コード + プレビュー分割エディタにフォールバックします。

```mermaid
%% コメントだけのブロック（判定不能）
%% Mermaid 構文として判定できない場合のフォールバックテスト
graph TD
    %% 上の comment ヘッダーで始まる場合の挙動
    A --> B
```

- [ ] 判定不能な構文でも編集ボタンが表示され、コード+プレビュー分割で編集できる
- [ ] エラーがあるとプレビュー側にエラー表示される

---

## 8. キーボードショートカット まとめ

### グローバル

| キー | 動作 |
|---|---|
| `Ctrl + F` | 検索バーを開く |
| `Ctrl + H` | 検索 / 置換バーを開いて置換へフォーカス |
| `Esc`（検索バー中） | 検索バーを閉じる |
| `Ctrl + Click` | リンクを開く |

### ブロック編集中

| キー | 動作 |
|---|---|
| `Escape` | 編集確定 |
| `Ctrl + Enter` | 編集確定 |
| `Ctrl + B` | 太字 |
| `Ctrl + I` | 斜体 |
| `Tab` | インデント |

### フローチャート編集中

| キー | 動作 |
|---|---|
| `Delete` / `Backspace` | 選択ノード／エッジ削除 |
| `Esc` | 選択解除・接続モード終了 |
| `Ctrl + Z` / `Ctrl + Y` | Undo / Redo |

- [ ] 上記すべてが期待通り動作する

---

## 9. ファイル間連携

- [ ] このファイルと別の `.md` を両方ビジュアルエディタで開ける
- [ ] 一方を VS Code 標準エディタで開いても **同時には開けない**（`supportsMultipleEditorsPerDocument: false`）
- [ ] 標準エディタで保存 → ビジュアルエディタ側に反映される
- [ ] ビジュアルエディタで編集 → ファイルが自動保存される

---

## 10. 既知の制限

- [ ] 象限チャートで日本語ラベルを使うと一部解析エラーになる（Mermaid 仕様）
- [ ] デフォルトエディタではない（Open With... で選択）
- [ ] 検証 OS は Windows 10/11 のみ

---

## チェック完了サイン

```
テスト実施日:
テスト実施者:
不具合報告:
```

---

> 完了したら、見つかった不具合を [`拡張機能要望.md`](拡張機能要望.md) に追記してください。

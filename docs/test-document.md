# Markdown Visual Editor テスト

このファイルは **Markdown Visual Editor** のテスト用ドキュメントです。

## 基本的なテキスト書式

これは通常の段落です。**太字**、*斜体*、~~取り消し線~~、`インラインコード` を含みます。

## リスト

- 項目1
- 項目2
  - サブ項目2-1
  - サブ項目2-2
- 項目3

### 番号付きリスト

1. 最初の項目
2. 次の項目
3. 最後の項目

## テーブル

| 機能カテゴリ | 機能名 | 実装状態 | 対応バージョン | 備考 |
| --- | --- | --- | --- | --- |
| テキスト編集 | インライン書式 (太字・斜体) | ✅ 対応済み | v1.0 | ダブルクリックで編集 |
| テキスト編集 | 見出し (H1〜H6) | ✅ 対応済み | v1.0 | ツールバーから変更可 |
| テキスト編集 | 箇条書きリスト | ✅ 対応済み | v1.0 | ネスト対応 |
| テキスト編集 | 番号付きリスト | ✅ 対応済み | v1.0 | ネスト対応 |
| テキスト編集 | 引用ブロック | ✅ 対応済み | v1.0 | 複数行対応 |
| テキスト編集 | インラインコード | ✅ 対応済み | v1.0 | バッククォート記法 |
| テキスト編集 | コードブロック | ✅ 対応済み | v1.0 | 言語ハイライト対応 |
| テキスト編集 | リンク挿入 | ✅ 対応済み | v1.1 | URL・タイトル設定可 |
| テキスト編集 | 取り消し線 | ✅ 対応済み | v1.1 | ~~ 記法 |
| テーブル編集 | GUIテーブルエディタ | ✅ 対応済み | v1.2 | 行・列の追加削除 |
| テーブル編集 | セル結合 | ⚠️ 部分対応 | v1.3 | 表示のみ |
| テーブル編集 | 列幅調整 | 🚧 開発中 | v1.4 | ドラッグ対応予定 |
| テーブル編集 | ソート機能 | 📋 計画中 | v2.0 | クリックソート予定 |
| Mermaid | フローチャート (GUI) | ✅ 対応済み | v1.2 | ノード・エッジGUI操作 |
| Mermaid | シーケンス図 (GUI) | ✅ 対応済み | v1.2 | ドラッグで接続 |
| Mermaid | クラス図 (GUI) | ✅ 対応済み | v1.2 | SVGクリック接続 |
| Mermaid | マインドマップ (GUI) | ✅ 対応済み | v1.3 | ツリー編集 |
| Mermaid | ガントチャート (GUI) | ✅ 対応済み | v1.3 | タスク管理 |
| Mermaid | 象限チャート (GUI) | ✅ 対応済み | v1.3 | ポイント編集 |
| Mermaid | ER図 (GUI) | 🚧 開発中 | v1.4 | エンティティ・関連 |
| Mermaid | ズーム機能 | ✅ 対応済み | v1.3 | Ctrl+ホイール対応 |
| Mermaid | 色カスタマイズ | ✅ 対応済み | v1.2 | プリセット+カスタム |
| Mermaid | サブグラフ | ✅ 対応済み | v1.2 | グループ化GUI |
| Mermaid | 元に戻す/やり直し | ✅ 対応済み | v1.2 | Ctrl+Z/Y |
| UI/UX | ダークテーマ | ✅ 対応済み | v1.0 | VS Codeテーマ連動 |
| UI/UX | ツールバー | ✅ 対応済み | v1.0 | 書式ボタン群 |
| UI/UX | ステータスバー | ✅ 対応済み | v1.1 | 操作ヒント表示 |
| UI/UX | キーボードショートカット | ✅ 対応済み | v1.1 | Ctrl+Z/Y/Del他 |
| セキュリティ | 外部通信なし | ✅ 対応済み | v1.0 | 完全ローカル動作 |
| セキュリティ | CSP設定 | ✅ 対応済み | v1.0 | Webviewセキュリティ |
| セキュリティ | HTMLサニタイズ | ✅ 対応済み | v1.0 | XSS対策済み |
| 配布 | VSIX パッケージ | ✅ 対応済み | v1.0 | ローカルインストール可 |
| 配布 | マーケットプレイス | 📋 計画中 | v2.0 | 審査申請予定 |
## コードブロック

```javascript
function hello() {
  console.log("Hello, World!");
}
```

## 引用

> これは引用ブロックです。
> 複数行にまたがる引用も対応しています。

## Mermaidダイアグラム

### フローチャート

```mermaid
graph TD
    FF[完了通知]
    subgraph 初期判定[ファイル判定フェーズ]
        A[ユーザーがmdファイルを開く]
        B{{Visual Editorで開く?}}
    end
    subgraph WYSIWYGフロー[WYSIWYG編集フロー]
        B{{Visual Editorで開く?}}
        C[WYSIWYGエディタ表示]
        X[ツールバー表示]
        Y[書式ボタン群]
        Z[元に戻す/やり直し]
        E[ブロックをダブルクリック]
        R[Mermaidブロック検出]
        S[テーブルブロック検出]
        T[コードブロック検出]
        U[Mermaidビジュアルエディタ起動]
        V[テーブルGUIエディタ起動]
        W[コードハイライト表示]
        F[その場で編集]
        G[変更を保存]
    end
    subgraph 保存フロー[保存・検証フロー]
        G[変更を保存]
        H{{保存方法を選択}}
        I[自動保存]
        N[エラーチェック]
        K[差分プレビュー表示]
        L{{確認OK?}}
        F[その場で編集]
        O{{エラーあり?}}
        P[エラー通知表示]
        Q[修正を促す]
        M[VS Codeに反映]
    end
    subgraph テキストフロー[テキストエディタフロー]
        B{{Visual Editorで開く?}}
        D[通常のテキストエディタ]
        AA[エクスポート機能]
        BB{{出力形式?}}
        CC[PDF出力]
        DD[HTML出力]
        EE[画像出力]
    end
    A --> B
    B -->|はい| C
    C --> X
    X --> Y
    X --> Z
    C --> E
    E --> R
    E --> S
    E --> T
    R --> U
    S --> V
    T --> W
    U --> F
    V --> F
    F --> G
    G --> H
    H -->|自動| I
    I --> N
    K --> L
    L -->|はい| N
    L -->|いいえ| F
    N --> O
    O -->|はい| P
    P --> Q
    Q --> F
    O -->|いいえ| M
    B -->|いいえ| D
    D --> AA
    AA --> BB
    BB -->|PDF| CC
    BB -->|HTML| DD
    BB -->|画像| EE
    M --> FF
    CC --> FF
    DD --> FF
    EE --> FF
    style A fill:#4a90d9,stroke:#2c5ea0,color:#ffffff
    style B fill:#f0ad4e,stroke:#d48b0c
    style H fill:#f0ad4e,stroke:#d48b0c
    style L fill:#f0ad4e,stroke:#d48b0c
    style O fill:#f0ad4e,stroke:#d48b0c
    style BB fill:#f0ad4e,stroke:#d48b0c
    style P fill:#d9534f,stroke:#b52b27,color:#ffffff
    style Q fill:#d9534f,stroke:#b52b27,color:#ffffff
    style M fill:#5cb85c,stroke:#3d8b3d,color:#ffffff
    style FF fill:#5cb85c,stroke:#3d8b3d,color:#ffffff
```



### シーケンス図

```mermaid
sequenceDiagram
    participant U as ユーザー
    participant TB as ツールバー
    participant E as エディタCore
    participant P as パーサー
    participant R as レンダラー
    participant M as Mermaidエンジン
    participant D as ドキュメント
    participant V as VS Code API
    participant FS as ファイルシステム

    U->>E: mdファイルを開く
    E->>V: CustomTextEditorProvider起動
    V->>E: ドキュメント内容取得
    E->>P: Markdownをパース
    P->>P: トークン分割処理
    P-->>E: トークン配列を返却
    E->>R: HTML生成・レンダリング
    R-->>U: WYSIWYGプレビュー表示

    rect rgb(40, 60, 80)
    Note over U,R: ブロック編集フロー
    U->>E: Mermaidブロックをダブルクリック
    E->>E: 編集モードに切り替え
    E->>M: Mermaidコードをパース
    M-->>E: SVGダイアグラム生成
    E->>R: ビジュアルエディタ表示
    R-->>U: ツールバー＋SVGプレビュー
    end

    U->>TB: ノード追加ボタンをクリック
    TB->>E: addNode(shape)
    E->>M: 再レンダリング要求
    M-->>E: 更新されたSVG
    E->>R: プレビュー更新
    R-->>U: 新しいダイアグラム表示

    U->>TB: 接続モードON
    TB-->>U: 接続元ノード選択を促す
    U->>E: ノードAをクリック
    E-->>U: 接続先ノード選択を促す
    U->>E: ノードBをクリック
    E->>E: エッジ追加
    E->>M: 再レンダリング
    M-->>R: SVG更新

    rect rgb(60, 40, 40)
    Note over U,FS: 保存フロー
    U->>TB: 保存ボタンをクリック
    TB->>E: saveMermaidEdit()
    E->>P: 新しいMermaidコードで再パース
    P->>D: トークン更新
    D->>V: ドキュメント変更通知
    V->>FS: ファイル書き込み
    FS-->>V: 書き込み完了
    V-->>E: 保存成功
    E->>R: 通常プレビューに復帰
    R-->>U: 更新されたプレビュー表示
    end

    U->>TB: 元に戻すボタン
    TB->>E: undo()
    E->>E: スナップショット復元
    E->>M: 再レンダリング
    M-->>R: 復元されたSVG
    R-->>U: 以前の状態を表示
```


### クラス図

```mermaid
classDiagram
    class MarkdownVisualEditorProvider {
        +allTokens: Token[]
        +editingBlockIndex: number
        +webviewPanel: WebviewPanel
        +document: TextDocument
        +provideCustomTextEditor()
        +getHtmlForWebview()
        +updateDocument()
        +parseMarkdown()
    }
    class TokenParser {
        +parse(text: string): Token[]
        -parseInline(text: string): string
        -parseMermaidBlock(lines: string[]): MermaidToken
        -parseTable(lines: string[]): TableToken
        -parseCodeBlock(lines: string[]): CodeToken
        -parseHeading(line: string): HeadingToken
    }
    class Token {
        <<interface>>
        +type: string
        +raw: string
        +text: string
        +depth: number
    }
    class MermaidToken {
        +type: "mermaid"
        +text: string
        +diagramType: string
    }
    class TableToken {
        +type: "table"
        +header: string[]
        +rows: string[][]
        +alignments: string[]
    }
    class MermaidVisualEditor {
        +container: HTMLElement
        +model: FlowchartModel
        +undo: UndoStack
        +mode: Mode
        +selectedNodeId: string
        +zoomLevel: number
        +constructor(container, code, onChange)
        +destroy()
        +getCode(): string
        -_buildUI()
        -_renderDiagram()
        -_attachSvgHandlers()
        -_zoomIn()
        -_zoomOut()
        -_zoomFit()
        -_commitChange()
    }
    class FlowchartModel {
        +direction: string
        +nodes: Map
        +edges: Edge[]
        +subgraphs: Subgraph[]
        +styles: Map
        +parse(code: string)
        +generate(): string
        +addNode(shape, label): string
        +removeNode(id)
        +addEdge(from, to, type, label)
        +addSubgraph(label, nodeIds)
    }
    class UndoStack {
        -_stack: string[]
        -_index: number
        +push(state)
        +canUndo(): boolean
        +canRedo(): boolean
        +undo(): object
        +redo(): object
    }
    class SequenceDiagramEditor {
        +actors: Actor[]
        +messages: Message[]
        +constructor(container, code, onChange)
        -_buildUI()
        -_render()
        -_generate(): string
        -_attachSvgEvents()
    }
    class ClassDiagramEditor {
        +classes: ClassDef[]
        +relations: Relation[]
        +constructor(container, code, onChange)
        -_buildUI()
        -_render()
        -_generate(): string
    }
    class TableVisualEditor {
        +headers: string[]
        +rows: string[][]
        +alignments: string[]
        +constructor(container, markdown, onChange)
        +destroy()
        -_buildUI()
        -_render()
    }
    class MindmapEditor {
        +rootNode: MindmapNode
        +constructor(container, code, onChange)
        -_buildUI()
        -_render()
    }
    class GanttChartEditor {
        +tasks: GanttTask[]
        +sections: string[]
        +constructor(container, code, onChange)
        -_buildUI()
        -_render()
    }
    class DiagramEditorUtils {
        +isFlowchart(code): boolean
        +isSequenceDiagram(code): boolean
        +isClassDiagram(code): boolean
        +isMindmap(code): boolean
        +isGanttChart(code): boolean
        +isQuadrantChart(code): boolean
    }

    MarkdownVisualEditorProvider --> TokenParser : uses
    TokenParser --> Token : produces
    Token <|-- MermaidToken
    Token <|-- TableToken
    MarkdownVisualEditorProvider --> MermaidVisualEditor : creates
    MarkdownVisualEditorProvider --> SequenceDiagramEditor : creates
    MarkdownVisualEditorProvider --> ClassDiagramEditor : creates
    MarkdownVisualEditorProvider --> TableVisualEditor : creates
    MarkdownVisualEditorProvider --> MindmapEditor : creates
    MarkdownVisualEditorProvider --> GanttChartEditor : creates
    MarkdownVisualEditorProvider --> DiagramEditorUtils : uses
    MermaidVisualEditor --> FlowchartModel : contains
    MermaidVisualEditor --> UndoStack : contains
```


### マインドマップ

```mermaid
mindmap
  root((Markdown Visual Editor))
    編集機能
      WYSIWYG編集
        ブロック単位編集
        ダブルクリック起動
        インライン書式サポート
      ツールバー
        テキスト書式ボタン
        見出しレベル変更
        リスト挿入
        リンク・画像挿入
      元に戻す/やり直し
        スナップショット管理
        無制限履歴
    Mermaid対応
      フローチャート
        ノード追加・削除
        接続GUI操作
        形状変更 8種類
        色カスタマイズ
        サブグラフ対応
        ズーム機能
      シーケンス図
        アクター管理
        メッセージ追加
        ドラッグで接続
        SVGクリック連動
      クラス図
        クラス追加
        メソッド・属性管理
        関連線GUI接続
        アクセス修飾子
      マインドマップ
        ツリー構造編集
        ノード追加・移動
        階層管理
      ガントチャート
        タスク管理
        日付設定
        セクション分割
        依存関係設定
      象限チャート
        4象限ラベル設定
        ポイント配置
        軸ラベル設定
    技術スタック
      TypeScript
        型安全な実装
        VS Code API型定義
      VS Code Extension API
        CustomTextEditorProvider
        WebviewPanel
        TextDocument
      Mermaid.js
        v10+ 対応
        SVGレンダリング
      esbuild
        高速バンドル
        Tree shaking
    セキュリティ
      完全ローカル動作
      外部通信なし
      CSP準拠
      サニタイズ処理
      XSS対策
    配布
      VSIX パッケージ
      GitHub リポジトリ
      ドキュメント完備
```


### 象限チャート

```mermaid
quadrantChart
    title Feature Priority Matrix
    x-axis Low  --> High Cost
    y-axis Low Value --> High Value
    quadrant-1 Implement First
    quadrant-2 Plan Carefully
    quadrant-3 Low Priority
    quadrant-4 Needs Review
    WYSIWYG Editor: [0.25, 0.95]
    Mermaid Preview: [0.35, 0.90]
    Flowchart GUI: [0.40, 0.88]
    Table GUI Editor: [0.45, 0.75]
    Sequence Diagram: [0.50, 0.80]
    Class Diagram: [0.55, 0.72]
    Mindmap Editor: [0.50, 0.68]
    Gantt Chart: [0.60, 0.70]
    Quadrant Chart: [0.65, 0.55]
    Dark Theme: [0.15, 0.65]
    Zoom Feature: [0.20, 0.60]
    Undo Redo: [0.22, 0.82]
    Drag and Drop: [0.55, 0.60]
    Export Feature: [0.70, 0.50]
    Realtime Collab: [0.90, 0.85]
    Plugin API: [0.85, 0.45]
    AI Completion: [0.80, 0.70]
    Custom Themes: [0.60, 0.40]
    Keyboard Shortcuts: [0.18, 0.72]
    Accessibility: [0.30, 0.55]
    i18n Support: [0.45, 0.35]
    Offline Support: [0.10, 0.50]
```



### ガントチャート

```mermaid
gantt
    title Markdown Visual Editor 開発ロードマップ 2026
    dateFormat YYYY-MM-DD
    axisFormat %m/%d

    section Phase 1: 基盤開発
    要件定義・設計 :done, req, 2026-02-15, 5d
    プロジェクトセットアップ :done, setup, after req, 3d
    CustomTextEditorProvider実装 :done, editor, after setup, 5d
    Markdownパーサー実装 :done, parser, after editor, 4d
    WYSIWYG基本レンダリング :done, render, after parser, 5d
    ブロック単位編集機能 :done, block, after render, 4d
    ツールバー実装 :done, toolbar, after block, 3d

    section Phase 2: Mermaidダイアグラム
    Mermaid統合基盤 :done, mbase, after toolbar, 3d
    フローチャートエディタ :done, flow, after mbase, 7d
    ノード追加・削除GUI :done, node, after flow, 3d
    接続操作GUI :done, edge, after node, 3d
    シーケンス図エディタ :done, seq, after edge, 5d
    クラス図エディタ :done, cls, after seq, 5d
    マインドマップエディタ :done, mind, after cls, 4d
    象限チャートエディタ :done, quad, after mind, 3d
    ガントチャートエディタ :done, gantt_ed, after quad, 4d

    section Phase 3: 高度な機能
    テーブルGUIエディタ :done, table, after gantt_ed, 5d
    色カスタマイズ機能 :done, color, after table, 3d
    サブグラフ対応 :done, subgraph, after color, 3d
    ズーム機能 :active, zoom, after subgraph, 2d
    元に戻す/やり直し :done, undo, after zoom, 2d
    ドラッグ&ドロップ並替え :active, dnd, after undo, 3d
    インラインテキスト編集 :done, inline, after dnd, 2d

    section Phase 4: 品質・UX
    ユニットテスト作成 :crit, utest, after inline, 5d
    統合テスト :crit, itest, after utest, 4d
    パフォーマンス最適化 :perf, after itest, 3d
    アクセシビリティ対応 :a11y, after perf, 3d
    エラーハンドリング強化 :errh, after a11y, 2d

    section Phase 5: ドキュメント・配布
    ユーザーガイド作成 :doc1, after errh, 3d
    API・設計ドキュメント :doc2, after doc1, 2d
    セキュリティレビュー :sec, after doc2, 2d
    ライセンス整備 :lic, after sec, 1d
    VSIX作成 :pkg, after lic, 2d
    マーケットプレイス公開 :milestone, pub, after pkg, 0d

    section 将来計画
    リアルタイムコラボ検討 :future1, after pub, 5d
    プラグインAPI設計 :future2, after future1, 5d
    AI補完機能検討 :future3, after future2, 5d
```


### ER図

```mermaid
erDiagram
    USER {
        int id PK
        string name
        string email
        string password_hash
        datetime created_at
        datetime updated_at
        boolean is_active
        string avatar_url
    }
    WORKSPACE {
        int id PK
        string name
        string description
        int owner_id FK
        datetime created_at
        datetime updated_at
        string theme
        boolean is_public
    }
    DOCUMENT {
        int id PK
        string title
        text content
        int workspace_id FK
        int author_id FK
        int last_editor_id FK
        datetime created_at
        datetime updated_at
        string status
        int version
    }
    DIAGRAM_BLOCK {
        int id PK
        int document_id FK
        int block_index
        string diagram_type
        text mermaid_code
        datetime created_at
        datetime updated_at
        string label
    }
    TABLE_BLOCK {
        int id PK
        int document_id FK
        int block_index
        text markdown_source
        int col_count
        int row_count
        datetime updated_at
    }
    DOCUMENT_VERSION {
        int id PK
        int document_id FK
        int editor_id FK
        int version_number
        text content_snapshot
        string change_summary
        datetime created_at
    }
    COMMENT {
        int id PK
        int document_id FK
        int author_id FK
        int parent_comment_id FK
        text body
        int block_index
        datetime created_at
        datetime updated_at
        boolean is_resolved
    }
    TAG {
        int id PK
        string name
        string color
        int workspace_id FK
    }
    DOCUMENT_TAG {
        int document_id FK
        int tag_id FK
        datetime tagged_at
    }
    WORKSPACE_MEMBER {
        int workspace_id FK
        int user_id FK
        string role
        datetime joined_at
    }
    EXPORT_JOB {
        int id PK
        int document_id FK
        int requested_by FK
        string format
        string status
        string output_url
        datetime requested_at
        datetime completed_at
    }
    DIAGRAM_STYLE_PRESET {
        int id PK
        string name
        text style_json
        int created_by FK
        boolean is_global
        datetime created_at
    }

    USER ||--o{ WORKSPACE : "owns"
    USER ||--o{ DOCUMENT : "authors"
    USER ||--o{ DOCUMENT : "last edits"
    USER ||--o{ DOCUMENT_VERSION : "creates"
    USER ||--o{ COMMENT : "writes"
    USER ||--o{ EXPORT_JOB : "requests"
    USER ||--o{ DIAGRAM_STYLE_PRESET : "creates"
    USER }o--o{ WORKSPACE : "member of"
    WORKSPACE_MEMBER }|--|| WORKSPACE : "belongs to"
    WORKSPACE_MEMBER }|--|| USER : "is"
    WORKSPACE ||--o{ DOCUMENT : "contains"
    WORKSPACE ||--o{ TAG : "has"
    DOCUMENT ||--o{ DIAGRAM_BLOCK : "contains"
    DOCUMENT ||--o{ TABLE_BLOCK : "contains"
    DOCUMENT ||--o{ DOCUMENT_VERSION : "versioned as"
    DOCUMENT ||--o{ COMMENT : "has"
    DOCUMENT ||--o{ EXPORT_JOB : "exported via"
    DOCUMENT }o--o{ TAG : "tagged with"
    DOCUMENT_TAG }|--|| DOCUMENT : "links"
    DOCUMENT_TAG }|--|| TAG : "links"
    COMMENT ||--o{ COMMENT : "replied to"
```


## リンク

[VS Code公式サイト](https://code.visualstudio.com/) を参照してください。

---

*このドキュメントは Markdown Visual Editor で編集できます。*


```mermaid
graph TD
    A[開始] --> B[処理]
    B --> C[終了]
```

(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();

  /** @type {any[]} All marked tokens (including 'space' type) */
  let allTokens = [];
  /** Index in allTokens of the block being edited (-1 = none) */
  let editingBlockIndex = -1;
  /** Token range {start,end} of the section/text block being edited (null = special/none) */
  let _editingRange = null;
  /** Counter for unique mermaid element IDs */
  let mermaidCounter = 0;
  /** Flag to prevent blur-triggered finish when toolbar is clicked */
  let preventBlurFinish = false;
  /** Whether mermaid is available */
  let mermaidAvailable = false;
  /** Last-saved markdown (the "before" baseline for change highlighting). null until known. */
  let baselineText = null;

  // ─── Global Error Handler ───
  window.addEventListener('error', (e) => {
    console.error('[Markdown Visual Editor] Uncaught error:', e.error || e.message);
  });
  window.addEventListener('unhandledrejection', (e) => {
    console.error('[Markdown Visual Editor] Unhandled rejection:', e.reason);
  });

  // ─── Initialize Mermaid ───
  try {
    if (typeof mermaid !== 'undefined') {
      // @ts-ignore
      mermaid.initialize({
        startOnLoad: false,
        theme: document.body.classList.contains('vscode-light') ? 'default' : 'dark',
        securityLevel: 'loose',
        flowchart: { useMaxWidth: true },
      });
      mermaidAvailable = true;
    } else {
      console.warn('Mermaid library not loaded');
    }
  } catch (e) {
    console.warn('Mermaid initialization failed:', e);
  }

  // ─── Message Handling ───
  window.addEventListener('message', (event) => {
    const message = event.data;
    switch (message.type) {
      case 'update':
        handleDocumentUpdate(message.text);
        break;
      case 'saveStatus':
        updateSaveStatus(!!message.dirty);
        // A non-dirty document means the on-disk content matches the editor:
        // adopt it as the new "before" baseline so change highlights clear on
        // save (and are established on first load).
        if (!message.dirty) {
          baselineText = getFullMarkdown();
        }
        updateChangedHighlights();
        break;
      case 'imageResolved':
        handleImageResolved(message);
        break;
      case 'imageSaved':
        handleImageSaved(message);
        break;
      case 'imageResolved':
        handleImageResolved(message);
        break;
      case 'imageSaved':
        handleImageSaved(message);
        break;
    }
  });

  // ─── Save Status Indicator ───
  function updateSaveStatus(dirty) {
    const el = document.getElementById('save-status');
    if (!el) return;
    if (dirty) {
      el.textContent = '○';
      el.title = '未保存の変更があります (Ctrl+S で保存)';
      el.classList.remove('save-status-saved');
      el.classList.add('save-status-dirty');
    } else {
      el.textContent = '●';
      el.title = '保存済み';
      el.classList.remove('save-status-dirty');
      el.classList.add('save-status-saved');
    }
  }

  // Tell extension we're ready to receive content
  vscode.postMessage({ type: 'ready' });

  // ─── Undo / Redo bridge ───
  // If the user is inside a textarea/input/contenteditable that has its own
  // local undo stack, let the browser handle it. Otherwise, ask the host
  // VS Code editor to perform document undo/redo.
  function requestUndoRedo(kind) {
    // If currently editing a block, finish first so VS Code's undo applies
    // to the actual saved document state, not stale block state.
    if (editingBlockIndex >= 0) {
      finishEditing();
    }
    vscode.postMessage({ type: kind });
  }

  // ─── Confirm Dialog (custom modal) ───
  function showConfirmDialog(message, onConfirm, opts) {
    const options = opts || {};
    const okLabel = options.okLabel || 'OK';
    const cancelLabel = options.cancelLabel || 'キャンセル';
    const danger = !!options.danger;

    const overlay = document.createElement('div');
    overlay.className = 'confirm-dialog-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', '確認');

    const dialog = document.createElement('div');
    dialog.className = 'confirm-dialog';

    const msg = document.createElement('div');
    msg.className = 'confirm-dialog-message';
    msg.textContent = message;
    dialog.appendChild(msg);

    const actions = document.createElement('div');
    actions.className = 'confirm-dialog-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'confirm-dialog-btn';
    cancelBtn.textContent = cancelLabel;

    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'confirm-dialog-btn ' + (danger ? 'confirm-dialog-btn-danger' : 'confirm-dialog-btn-primary');
    okBtn.textContent = okLabel;

    actions.appendChild(cancelBtn);
    actions.appendChild(okBtn);
    dialog.appendChild(actions);
    overlay.appendChild(dialog);

    function close() {
      document.removeEventListener('keydown', keyHandler, true);
      overlay.remove();
    }
    function keyHandler(ev) {
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(); }
      else if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); close(); onConfirm(); }
      else if (ev.key === 'Tab') {
        // simple focus trap between two buttons
        ev.preventDefault();
        if (document.activeElement === okBtn) cancelBtn.focus(); else okBtn.focus();
      }
    }
    cancelBtn.addEventListener('click', () => close());
    okBtn.addEventListener('click', () => { close(); onConfirm(); });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', keyHandler, true);

    document.body.appendChild(overlay);
    // Default focus to the destructive/primary button so Enter immediately confirms,
    // but for danger dialogs prefer Cancel for safety.
    setTimeout(() => { (danger ? cancelBtn : okBtn).focus(); }, 0);
  }

  // ─── Toolbar ───
  // Prevent blur on textarea when clicking toolbar buttons
  const toolbarEl = document.getElementById('toolbar');
  if (toolbarEl) {
    toolbarEl.addEventListener('mousedown', (e) => {
      if (e.target.closest('.toolbar-btn')) {
        // Keep focus on textarea so format actions can apply to selection
        preventBlurFinish = true;
        e.preventDefault();
        // Reset shortly after the click event finishes
        setTimeout(() => { preventBlurFinish = false; }, 250);
      }
    });

    toolbarEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.toolbar-btn');
      if (!btn) return;
      handleToolbarAction(btn.dataset.action, btn);
    });
  }

  function handleToolbarAction(action, btn) {
    // Global actions (work even while editing)
    if (action === 'find') { toggleFindBar(!_find.visible); return; }
    if (action === 'toggleTheme') { toggleTheme(); return; }
    if (action === 'openAsText') { vscode.postMessage({ type: 'openAsText' }); return; }
    if (action === 'undo') { requestUndoRedo('undo'); return; }
    if (action === 'redo') { requestUndoRedo('redo'); return; }
    if (action === 'heading-more') { showHeadingMoreMenu(btn); return; }

    if (editingBlockIndex >= 0) {
      const textarea = document.querySelector('.block.editing textarea');
      if (textarea) {
        applyFormatting(textarea, action);
      }
      return;
    }

    // Mermaid — show diagram type picker
    if (action === 'mermaid') {
      showMermaidPicker();
      return;
    }

    // Not editing — show insert position picker then insert
    const template = getNewBlockTemplate(action);
    if (template) {
      showInsertPositionPicker((insertAfterIndex) => {
        _insertTemplateAfter(template, insertAfterIndex);
      });
    }
  }

  function showHeadingMoreMenu(anchorBtn) {
    // Remove any open menu first
    const existing = document.querySelector('.heading-more-menu');
    if (existing) { existing.remove(); return; }

    const menu = document.createElement('div');
    menu.className = 'heading-more-menu';
    menu.setAttribute('role', 'menu');
    ['h4', 'h5', 'h6'].forEach((lvl) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'toolbar-btn';
      item.setAttribute('role', 'menuitem');
      item.textContent = lvl.toUpperCase();
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.remove();
        handleToolbarAction(lvl);
      });
      menu.appendChild(item);
    });

    const rect = anchorBtn.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = rect.bottom + 'px';
    menu.style.left = rect.left + 'px';
    document.body.appendChild(menu);

    const closer = (ev) => {
      if (!menu.contains(ev.target) && ev.target !== anchorBtn) {
        menu.remove();
        document.removeEventListener('mousedown', closer, true);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', closer, true), 0);
  }

  // `fixedInsert` (optional): { tokenIndex, where } to insert the diagram
  // above/below a specific block instead of prompting for the position.
  function showMermaidPicker(fixedInsert) {
    // Remove existing picker if any
    const existing = document.querySelector('.mermaid-picker-overlay');
    if (existing) existing.remove();

    // Diagrams grouped by category for easier discovery.
    const DIAGRAM_CATEGORIES = [
      { name: 'フロー系', items: [
        { key: 'flowchart', label: 'フローチャート', icon: '🔀', template: '```mermaid\ngraph TD\n    A[開始] --> B[処理]\n    B --> C[終了]\n```' },
        { key: 'state', label: '状態遷移図', icon: '⚙️', template: '```mermaid\nstateDiagram-v2\n    [*] --> Idle\n    Idle --> Active : start\n    Active --> Idle : stop\n    Active --> [*]\n```' },
        { key: 'journey', label: 'ユーザージャーニー', icon: '🚶', template: '```mermaid\njourney\n    title カスタマージャーニー\n    section 朝\n      起床: 3: User\n      コーヒー: 5: User\n    section 仕事\n      通勤: 1: User\n```' },
      ]},
      { name: 'シーケンス・関係系', items: [
        { key: 'sequence', label: 'シーケンス図', icon: '🔄', template: '```mermaid\nsequenceDiagram\n    participant A as ユーザー\n    participant B as システム\n    A->>B: リクエスト\n    B-->>A: レスポンス\n```' },
        { key: 'class', label: 'クラス図', icon: '📦', template: '```mermaid\nclassDiagram\n    class MyClass {\n        +String name\n        +getName()\n    }\n```' },
        { key: 'er', label: 'ER図', icon: '🗄️', template: '```mermaid\nerDiagram\n    USER ||--o{ ORDER : places\n    ORDER ||--|{ LINE_ITEM : contains\n```' },
        { key: 'c4', label: 'C4図', icon: '🏛️', template: '```mermaid\nC4Context\n    title システムコンテキスト図\n    Person(user, "ユーザー", "システム利用者")\n    System(sys, "本システム", "メインシステム")\n    Rel(user, sys, "利用する")\n```' },
      ]},
      { name: 'データ・チャート系', items: [
        { key: 'pie', label: 'パイチャート', icon: '🥧', template: '```mermaid\npie title 構成比\n    "項目A" : 40\n    "項目B" : 35\n    "項目C" : 25\n```' },
        { key: 'quadrant', label: '四象限チャート', icon: '📐', template: '```mermaid\nquadrantChart\n    title Priority Matrix\n    x-axis Low Impact --> High Impact\n    y-axis Low Urgency --> High Urgency\n    quadrant-1 Do Now\n    quadrant-2 Schedule\n    quadrant-3 Delegate\n    quadrant-4 Eliminate\n    Item A: [0.8, 0.9]\n    Item B: [0.3, 0.6]\n```' },
        { key: 'sankey', label: 'Sankey図', icon: '🌊', template: '```mermaid\nsankey-beta\n%% source,target,value\nA,B,10\nA,C,5\nB,D,7\nC,D,3\n```' },
        { key: 'xychart', label: 'XYチャート', icon: '📈', template: '```mermaid\nxychart-beta\n    title "売上推移"\n    x-axis [Jan, Feb, Mar, Apr, May]\n    y-axis "売上 (千円)" 0 --> 100\n    bar [50, 60, 75, 85, 95]\n    line [50, 60, 75, 85, 95]\n```' },
      ]},
      { name: 'プロジェクト系', items: [
        { key: 'gantt', label: 'ガントチャート', icon: '📊', template: '```mermaid\ngantt\n    title プロジェクト計画\n    dateFormat YYYY-MM-DD\n    section フェーズ1\n    タスク1 :a1, 2024-01-01, 7d\n    タスク2 :after a1, 5d\n```' },
        { key: 'timeline', label: 'タイムライン', icon: '📅', template: '```mermaid\ntimeline\n    title プロジェクト履歴\n    section 2024\n      Q1 : 企画開始 : 要件定義\n      Q2 : 設計\n    section 2025\n      Q1 : 実装\n```' },
        { key: 'kanban', label: 'Kanban', icon: '📋', template: '```mermaid\nkanban\n    Todo[ToDo]\n        task1[タスク1]\n        task2[タスク2]\n    Doing[進行中]\n        task3[タスク3]\n    Done[完了]\n```' },
        { key: 'gitgraph', label: 'Gitグラフ', icon: '🌿', template: '```mermaid\ngitGraph\n    commit\n    commit\n    branch develop\n    checkout develop\n    commit\n    checkout main\n    merge develop\n```' },
        { key: 'requirement', label: '要求図', icon: '📑', template: '```mermaid\nrequirementDiagram\n    requirement testReq {\n        id: "1"\n        text: "性能要件"\n        risk: medium\n        verifymethod: test\n    }\n    element testEl {\n        type: "simulation"\n    }\n    testEl - satisfies -> testReq\n```' },
      ]},
      { name: 'その他', items: [
        { key: 'mindmap', label: 'マインドマップ', icon: '🧠', template: '```mermaid\nmindmap\n  root((テーマ))\n    トピック1\n      サブ項目A\n      サブ項目B\n    トピック2\n```' },
        { key: 'block', label: 'ブロック図', icon: '🧱', template: '```mermaid\nblock-beta\n    columns 3\n    A B C\n    D E F\n```' },
        { key: 'packet', label: 'パケット図', icon: '📦', template: '```mermaid\npacket-beta\n    title TCP ヘッダ\n    0-15: "送信元ポート"\n    16-31: "宛先ポート"\n    32-63: "シーケンス番号"\n```' },
        { key: 'architecture', label: 'アーキテクチャ図', icon: '🏗️', template: '```mermaid\narchitecture-beta\n    group api(cloud)[API レイヤ]\n    service db(database)[DB] in api\n    service web(server)[Web] in api\n    web:R --> L:db\n```' },
      ]},
    ];

    const overlay = document.createElement('div');
    overlay.className = 'mermaid-picker-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Mermaidダイアグラムの種類を選択');

    const dialog = document.createElement('div');
    dialog.className = 'mermaid-picker-dialog';

    const title = document.createElement('div');
    title.className = 'mermaid-picker-title';
    title.textContent = 'Mermaidダイアグラムの種類を選択';
    dialog.appendChild(title);

    function selectItem(dt) {
      overlay.remove();
      // When invoked from the block "add block" menu, insert at the fixed
      // above/below position instead of prompting.
      if (fixedInsert && typeof fixedInsert.tokenIndex === 'number') {
        insertBlockRelative(dt.template, fixedInsert.tokenIndex, fixedInsert.where, { edit: true });
        return;
      }
      showInsertPositionPicker((insertAfterIndex) => {
        _insertTemplateAfter(dt.template, insertAfterIndex);
      });
    }

    DIAGRAM_CATEGORIES.forEach((cat) => {
      const section = document.createElement('div');
      section.className = 'mermaid-picker-section';

      const header = document.createElement('div');
      header.className = 'mermaid-picker-section-header';
      header.textContent = cat.name;
      section.appendChild(header);

      const grid = document.createElement('div');
      grid.className = 'mermaid-picker-grid';
      cat.items.forEach((dt) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'mermaid-picker-card';
        card.setAttribute('aria-label', dt.label);
        card.innerHTML = '<span class="mermaid-picker-icon" aria-hidden="true">' + dt.icon + '</span>' +
          '<span class="mermaid-picker-label">' + dt.label + '</span>';
        card.addEventListener('click', () => selectItem(dt));
        grid.appendChild(card);
      });
      section.appendChild(grid);
      dialog.appendChild(section);
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'mermaid-picker-cancel';
    cancelBtn.textContent = 'キャンセル';
    cancelBtn.addEventListener('click', () => overlay.remove());
    dialog.appendChild(cancelBtn);

    overlay.appendChild(dialog);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
    // Esc to close
    const escHandler = (ev) => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        overlay.remove();
        document.removeEventListener('keydown', escHandler, true);
      }
    };
    document.addEventListener('keydown', escHandler, true);

    document.body.appendChild(overlay);
    // Focus the first card for immediate keyboard navigation
    setTimeout(() => {
      const firstCard = dialog.querySelector('.mermaid-picker-card');
      if (firstCard) firstCard.focus();
    }, 0);
  }

  function showInsertPositionPicker(callback) {
    // One entry per visual block (H1/H2 section or special block). `index` is
    // the block's start token (for preselect matching); `after` is the token to
    // insert after (its last token).
    const visibleTokens = computeBlockRanges().map(r => ({
      token: allTokens[r.start], index: r.start, after: r.end - 1,
    }));

    // If document is empty, insert at position 0
    if (visibleTokens.length === 0) {
      callback(-1);
      return;
    }

    const existing = document.querySelector('.insert-pos-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'insert-pos-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'insert-pos-dialog';

    const title = document.createElement('div');
    title.className = 'insert-pos-title';
    title.textContent = '挿入位置を選択';
    dialog.appendChild(title);

    // If a block is currently selected, default the picker to "after that block"
    // (use the last block in the selection). null = nothing selected.
    const _sel = getSortedSelection();
    const preselectIndex = _sel.length ? _sel[_sel.length - 1] : null;
    /** @type {HTMLElement|null} the item to highlight + focus on open */
    let preselectedEl = null;

    const list = document.createElement('div');
    list.className = 'insert-pos-list';

    // "Insert at beginning" option
    const topItem = document.createElement('button');
    topItem.className = 'insert-pos-item insert-pos-top';
    topItem.innerHTML = '<span class="insert-pos-icon">⬆</span><span class="insert-pos-label">先頭に挿入</span>';
    topItem.addEventListener('click', () => { overlay.remove(); callback(-1); });
    list.appendChild(topItem);

    // Options for after each visible block
    for (const { token, index, after } of visibleTokens) {
      const item = document.createElement('button');
      item.className = 'insert-pos-item';
      let label = '';
      const raw = rawOfRange(rangeOf(index)).trim();
      if (token.type === 'heading') {
        label = '#'.repeat(token.depth) + ' ' + token.text;
      } else if (token.type === 'paragraph') {
        label = raw.length > 50 ? raw.substring(0, 50) + '…' : raw;
      } else if (token.type === 'code') {
        label = token.lang ? '```' + token.lang + '```' : '```コードブロック```';
      } else if (token.type === 'table') {
        label = '📊 テーブル';
      } else if (token.type === 'list') {
        label = '📋 リスト (' + (token.items ? token.items.length : 0) + '項目)';
      } else if (token.type === 'blockquote') {
        label = '> 引用';
      } else if (token.type === 'hr') {
        label = '─── 水平線 ───';
      } else {
        label = raw.length > 50 ? raw.substring(0, 50) + '…' : raw || token.type;
      }
      item.innerHTML = '<span class="insert-pos-icon">↓</span><span class="insert-pos-label">' + escapeHtml(label) + ' の後に挿入</span>';
      item.addEventListener('click', () => { overlay.remove(); callback(after); });
      if (index === preselectIndex) {
        item.classList.add('insert-pos-selected');
        preselectedEl = item;
      }
      list.appendChild(item);
    }

    dialog.appendChild(list);

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'mermaid-picker-cancel';
    cancelBtn.textContent = 'キャンセル';
    cancelBtn.addEventListener('click', () => overlay.remove());
    dialog.appendChild(cancelBtn);

    overlay.appendChild(dialog);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);

    // Focus the currently-selected block's entry so it is highlighted from the
    // start and Enter confirms it. Fall back to the first option otherwise.
    const focusTarget = preselectedEl || topItem;
    focusTarget.focus({ preventScroll: true });
    focusTarget.scrollIntoView({ block: 'nearest' });
  }

  function applyFormatting(textarea, action) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selected = text.substring(start, end);

    let before = '';
    let middle = '';
    let after = '';

    switch (action) {
      case 'bold':
        before = '**'; middle = selected || '太字テキスト'; after = '**';
        break;
      case 'italic':
        before = '*'; middle = selected || '斜体テキスト'; after = '*';
        break;
      case 'strikethrough':
        before = '~~'; middle = selected || '取り消しテキスト'; after = '~~';
        break;
      case 'code':
        before = '`'; middle = selected || 'コード'; after = '`';
        break;
      case 'h1':
        before = '# '; middle = selected || '見出し1'; after = '';
        break;
      case 'h2':
        before = '## '; middle = selected || '見出し2'; after = '';
        break;
      case 'h3':
        before = '### '; middle = selected || '見出し3'; after = '';
        break;
      case 'h4':
        before = '#### '; middle = selected || '見出し4'; after = '';
        break;
      case 'h5':
        before = '##### '; middle = selected || '見出し5'; after = '';
        break;
      case 'h6':
        before = '###### '; middle = selected || '見出し6'; after = '';
        break;
      case 'ul':
        before = '- '; middle = selected || 'リスト項目'; after = '';
        break;
      case 'ol':
        before = '1. '; middle = selected || 'リスト項目'; after = '';
        break;
      case 'link':
        before = '['; middle = selected || 'リンクテキスト'; after = '](URL)';
        break;
      case 'table':
        before = ''; middle = '| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n|  |  |  |'; after = '';
        break;
      case 'codeblock':
        before = '```\n'; middle = selected || 'コード'; after = '\n```';
        break;
      case 'mermaid':
        before = '```mermaid\n'; middle = 'graph TD\n    A[開始] --> B[処理]\n    B --> C[終了]'; after = '\n```';
        break;
      default:
        return;
    }

    const replacement = before + middle + after;
    textarea.value = text.substring(0, start) + replacement + text.substring(end);
    textarea.focus();

    // Place cursor after the inserted middle text
    const cursorPos = start + before.length + middle.length;
    textarea.setSelectionRange(cursorPos, cursorPos);

    textarea.dispatchEvent(new Event('input'));
  }

  function getNewBlockTemplate(action) {
    switch (action) {
      case 'h1': return '# 見出し1';
      case 'h2': return '## 見出し2';
      case 'h3': return '### 見出し3';
      case 'h4': return '#### 見出し4';
      case 'h5': return '##### 見出し5';
      case 'h6': return '###### 見出し6';
      case 'bold': return '**太字テキスト**';
      case 'italic': return '*斜体テキスト*';
      case 'ul': return '- リスト項目';
      case 'ol': return '1. リスト項目';
      case 'link': return '[リンクテキスト](URL)';
      case 'table': return '| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n|  |  |  |';
      case 'codeblock': return '```\nコード\n```';
      case 'mermaid': return '```mermaid\ngraph TD\n    A[開始] --> B[処理]\n    B --> C[終了]\n```';
      case 'math': return '```math\nE = mc^2\n```';
      default: return null;
    }
  }

  // ─── Document Update ───
  function handleDocumentUpdate(markdownText) {
    // @ts-ignore
    allTokens = marked.lexer(markdownText);
    editingBlockIndex = -1;
    // Structural changes invalidate prior block indices.
    clearBlockSelection();
    // Sweep any leftover mermaid bombs from a previous render pass.
    cleanupMermaidOrphans();
    renderAllBlocks();
  }

  function getFullMarkdown() {
    return allTokens.map(t => t.raw).join('');
  }

  function sendEdit(text) {
    vscode.postMessage({ type: 'edit', text: text });
    updateSaveStatus(true);
    updateChangedHighlights();
  }

  // ─── Change Highlighting (before/after vs last-saved baseline) ───
  // VS Code's built-in diff doesn't reach this custom editor, so we surface
  // which blocks differ from the last-saved content right in the visual view.
  // Matching is by block raw text: a current block whose raw isn't present in
  // the baseline (consuming one occurrence) is flagged as changed/added.
  function buildBaselineRawCounts() {
    if (baselineText == null) return null;
    let toks;
    // @ts-ignore
    try { toks = marked.lexer(baselineText); } catch { return null; }
    // Group baseline into the same H1/H2 section blocks and count their raws.
    const counts = new Map();
    for (const r of computeBlockRanges(toks)) {
      const raw = rawOfRange(r, toks);
      counts.set(raw, (counts.get(raw) || 0) + 1);
    }
    return counts;
  }

  function updateChangedHighlights() {
    const editor = document.getElementById('editor');
    if (!editor) return;
    const counts = buildBaselineRawCounts();
    // Blocks appear in DOM order, which matches token order — consume baseline
    // occurrences left-to-right so duplicate blocks match correctly.
    const blocks = editor.querySelectorAll('.block[data-token-index]');
    blocks.forEach((blockEl) => {
      let changed = false;
      if (counts) {
        const start = parseInt(blockEl.dataset.tokenIndex, 10);
        const end = parseInt(blockEl.dataset.tokenEnd, 10);
        const raw = (!isNaN(start) && !isNaN(end)) ? rawOfRange({ start, end }) : undefined;
        const remaining = raw !== undefined ? (counts.get(raw) || 0) : 0;
        if (remaining > 0) { counts.set(raw, remaining - 1); }
        else { changed = true; }
      }
      blockEl.classList.toggle('block-changed', changed);
    });
  }

  // ─── Block grouping (H1/H2 sections) ───
  // Text tokens (headings, paragraphs, lists, blockquotes…) are grouped into a
  // single editable block per H1/H2 section. Tables and code blocks (incl.
  // Mermaid / math) stay as their own blocks so their dedicated visual editors
  // still apply. A "block" is a contiguous token range [start, end).
  let _blockRanges = [];
  function _isSpecialTokenType(t) {
    return !!t && (t.type === 'table' || t.type === 'code');
  }
  function computeBlockRanges(tokens) {
    tokens = tokens || allTokens;
    const ranges = [];
    const n = tokens.length;
    let i = 0;
    while (i < n) {
      const t = tokens[i];
      if (t.type === 'space') {
        // Absorb a trailing/standalone blank line into the previous block.
        if (ranges.length) ranges[ranges.length - 1].end = i + 1;
        i++;
        continue;
      }
      if (_isSpecialTokenType(t)) {
        ranges.push({ start: i, end: i + 1 });
        i++;
        if (i < n && tokens[i].type === 'space') { ranges[ranges.length - 1].end = i + 1; i++; }
        continue;
      }
      // A text section runs until the next H1/H2 heading, a special block, or EOF.
      const start = i;
      i++;
      while (i < n) {
        const tt = tokens[i];
        if (tt.type === 'space') { i++; continue; }
        if (_isSpecialTokenType(tt)) break;
        if (tt.type === 'heading' && tt.depth <= 2) break;
        i++;
      }
      ranges.push({ start, end: i });
    }
    return ranges;
  }
  function rawOfRange(range, tokens) {
    tokens = tokens || allTokens;
    let s = '';
    for (let i = range.start; i < range.end && i < tokens.length; i++) s += (tokens[i].raw || '');
    return s;
  }
  /** Range (in allTokens) of the block that starts at token index `startIdx`. */
  function rangeOf(startIdx) {
    const ranges = computeBlockRanges();
    for (const r of ranges) if (r.start === startIdx) return r;
    // Fallback: single token (or the block that contains startIdx).
    for (const r of ranges) if (startIdx >= r.start && startIdx < r.end) return r;
    return { start: startIdx, end: Math.min(startIdx + 1, allTokens.length) };
  }

  // ─── Render ───
  function renderAllBlocks() {
    const editor = document.getElementById('editor');
    editor.innerHTML = '';

    const visibleTokens = allTokens.filter(t => t.type !== 'space');

    if (visibleTokens.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.tabIndex = 0;
      empty.setAttribute('role', 'button');
      empty.setAttribute('aria-label', '空のドキュメント。Enter で挿入位置を選びコンテンツを追加');
      empty.innerHTML =
        '<h2>空のドキュメント</h2>' +
        '<p>ツールバーのボタンを押すか、<b>Enter キー</b>または<b>クリック</b>でコンテンツを追加してください</p>' +
        '<p class="empty-state-hint">ヒント: <kbd>Ctrl</kbd>+<kbd>F</kbd> で検索、<kbd>Ctrl</kbd>+<kbd>Z</kbd> で元に戻す</p>';
      const triggerInsert = () => {
        // Show the Mermaid-or-text choice via the toolbar's standard heading insertion entry.
        // Use a paragraph block as the simplest starting point.
        const tpl = getNewBlockTemplate('h1');
        if (!tpl) return;
        const fullText = tpl + '\n';
        sendEdit(fullText);
        handleDocumentUpdate(fullText);
        // Move focus to the new block and start editing it
        setTimeout(() => {
          const firstBlock = document.querySelector('[data-token-index]');
          if (firstBlock) {
            const idx = parseInt(firstBlock.dataset.tokenIndex, 10);
            if (!isNaN(idx)) startEditing(idx);
          }
        }, 0);
      };
      empty.addEventListener('click', triggerInsert);
      empty.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          triggerInsert();
        }
      });
      editor.appendChild(empty);
      // Auto-focus so keyboard users can immediately start
      setTimeout(() => empty.focus(), 0);
      return;
    }

    const ranges = computeBlockRanges();
    _blockRanges = ranges;
    ranges.forEach((range) => {
      const index = range.start;
      // Special blocks (table / code incl. Mermaid & math) always render via
      // their own token so their dedicated branch + editors fire — even when a
      // trailing blank line makes the range span 2 tokens. Multi-token text
      // sections render their stitched-together markdown.
      const rep = (_isSpecialTokenType(allTokens[index]) || range.end - range.start === 1)
        ? allTokens[index]
        : { type: 'section', raw: rawOfRange(range) };

      const block = document.createElement('div');
      block.className = 'block';
      block.dataset.tokenIndex = String(index);
      block.dataset.tokenEnd = String(range.end);
      block.tabIndex = 0;
      block.setAttribute('role', 'group');
      block.setAttribute('aria-label', 'ブロック (' + (rep.type || 'text') + ')');

      // Drag handle for reordering (visible on hover)
      const handle = document.createElement('div');
      handle.className = 'block-drag-handle';
      handle.setAttribute('draggable', 'true');
      handle.setAttribute('aria-label', 'ドラッグして並び替え');
      handle.title = 'ドラッグして並び替え';
      handle.textContent = '⋮⋮';
      attachBlockDragHandlers(handle, block);
      block.appendChild(handle);

      // Also allow dragging the block itself (so users can reorder by
      // grabbing anywhere on the highlighted area). Text selection and
      // interactive elements are excluded inside dragstart.
      block.setAttribute('draggable', 'true');
      attachBlockSelfDragSource(block);

      renderBlockContent(block, rep, index);

      block.addEventListener('dblclick', (e) => {
        if (e.target.tagName === 'A') return;
        if (e.target.closest('.mermaid-edit-overlay')) return;
        if (e.target.closest('.block-drag-handle')) return;
        startEditing(index);
      });

      // Click selection (plain / Ctrl / Shift). Skipped if the click landed
      // on an interactive child (link, button, input, etc.) or while editing.
      block.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (block.classList.contains('editing')) return;
        if (e.target.closest('a, button, input, textarea, select, label, .block-drag-handle, .mermaid-edit-overlay, .dve-ctxmenu, .table-ctx-menu')) return;
        handleBlockSelectionClick(index, e);
      });

      block.addEventListener('keydown', (e) => {
        if (e.target !== block) return; // only when block itself is focused
        if (e.key === 'Enter' || e.key === 'F2') {
          e.preventDefault();
          startEditing(index);
        }
        if (e.key === 'Delete' || (e.shiftKey && e.key === 'Delete')) {
          e.preventDefault();
          requestDeleteBlock(index);
        }
        // Keyboard-only navigation between blocks.
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          focusAdjacentBlock(index, e.key === 'ArrowDown' ? 1 : -1);
        }
        // Add a new block below (or above with Shift) without the mouse.
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          showAddBlockMenuAtBlock(index, e.shiftKey ? 'above' : 'below');
        }
      });

      // Right-click context menu on the block
      block.addEventListener('contextmenu', (e) => {
        // Allow native menus in editing textareas, links, and table-editor.
        if (block.classList.contains('editing')) return;
        if (e.target.closest('a, textarea, input, select, .table-ctx-menu')) return;
        e.preventDefault();
        e.stopPropagation();
        // If right-clicking outside the current multi-selection, reset to this block.
        if (!_selectedBlockIndices.has(index)) {
          replaceBlockSelection([index]);
        }
        showBlockContextMenu(index, e.clientX, e.clientY);
      });

      // Image drop zone: highlight the block while dragging files over it.
      attachBlockImageDropHandlers(block, index);

      editor.appendChild(block);
    });

    // Render mermaid diagrams after DOM is ready
    requestAnimationFrame(() => renderMermaidDiagrams());
    // Resolve relative image paths via the host extension.
    requestAnimationFrame(() => resolveRenderedImages());
    // Flag blocks that differ from the last-saved baseline.
    updateChangedHighlights();
  }

  function renderBlockContent(container, token, index) {
    container.innerHTML = '';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'block-content';

    if (token.type === 'code' && token.lang === 'mermaid') {
      const mermaidId = 'mermaid-block-' + (mermaidCounter++);
      contentDiv.innerHTML = `
        <div class="mermaid-container">
          <div class="mermaid-diagram" id="${mermaidId}" data-mermaid-code="${escapeHtmlAttr(token.text)}">
            <div class="loading-indicator">ダイアグラムを読み込み中...</div>
          </div>
          <button class="mermaid-edit-overlay">✎ ダイアグラムを編集</button>
        </div>
      `;
      const editBtn = contentDiv.querySelector('.mermaid-edit-overlay');
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        startMermaidEditing(index);
      });
    } else if (token.type === 'code' && token.lang === 'math') {
      const wrap = document.createElement('div');
      wrap.className = 'math-container';
      const display = document.createElement('div');
      display.className = 'math-display';
      display.innerHTML = renderMathToHtml(token.text || '', true);
      const editBtn = document.createElement('button');
      editBtn.className = 'mermaid-edit-overlay';
      editBtn.textContent = '✎ 数式を編集';
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        startMathEditing(index);
      });
      wrap.appendChild(display);
      wrap.appendChild(editBtn);
      contentDiv.appendChild(wrap);
    } else if (token.type === 'table' && window.TableVisualEditor) {
      // Render table normally but add edit overlay
      try {
        // @ts-ignore
        const html = marked.parse(token.raw);
        contentDiv.innerHTML = sanitizeHtml(html);
      } catch (err) {
        contentDiv.innerHTML = '<pre class="raw-block">' + escapeHtml(token.raw) + '</pre>';
      }
      const tableEditBtn = document.createElement('button');
      tableEditBtn.className = 'mermaid-edit-overlay';
      tableEditBtn.textContent = '✎ テーブルを編集';
      tableEditBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        startTableEditing(index);
      });
      contentDiv.style.position = 'relative';
      contentDiv.appendChild(tableEditBtn);
    } else {
      try {
        // @ts-ignore
        const html = marked.parse(token.raw);
        if (html.trim()) {
          contentDiv.innerHTML = sanitizeHtml(html);
        } else {
          contentDiv.innerHTML = '<pre class="raw-block">' + escapeHtml(token.raw) + '</pre>';
        }
      } catch (err) {
        contentDiv.innerHTML = '<pre class="raw-block">' + escapeHtml(token.raw) + '</pre>';
      }
    }

    // Link navigation: open via VS Code on plain click or Ctrl/Cmd+Click
    contentDiv.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const href = a.getAttribute('href') || '';
        if (href) vscode.postMessage({ type: 'openLink', href: href });
      });
      a.title = (a.title ? a.title + ' — ' : '') + 'クリックで開く';
    });

    // Inline / display math substitution ($..$ and $$..$$) inside rendered text.
    renderInlineMathInElement(contentDiv);

    container.appendChild(contentDiv);
    // Kick off async resolution of any relative image paths in this block.
    requestAnimationFrame(() => resolveRenderedImages(container));
  }

  // ─── Mermaid preview zoom / pan ───
  // Adds zoom (in/out/fit), directional pan buttons, Ctrl+wheel zoom and
  // drag-to-pan to a rendered mermaid diagram in the (non-editing) preview.
  // Idempotent: state lives on the `.mermaid-container`, so re-rendering the
  // SVG keeps the current zoom/pan.
  function attachMermaidPreviewZoomPan(container) {
    if (!container) return;
    const host = container.querySelector('.mermaid-diagram');
    if (!host) return;
    container.classList.add('mermaid-zoomable');

    const clamp = (z) => Math.max(0.2, Math.min(4, z));
    let st = container.__mzp;
    const apply = () => {
      host.style.transformOrigin = 'top center';
      if (st.z === 1 && st.px === 0 && st.py === 0) {
        host.style.transform = '';
      } else {
        host.style.transform = 'translate(' + st.px + 'px,' + st.py + 'px) scale(' + st.z + ')';
      }
      if (st.label) st.label.textContent = Math.round(st.z * 100) + '%';
    };
    const fit = () => {
      st.px = 0; st.py = 0; st.z = 1;
      host.style.transform = 'none';
      const svg = host.querySelector('svg');
      if (svg) {
        const sr = svg.getBoundingClientRect();
        const cr = container.getBoundingClientRect();
        if (sr.width > 0 && sr.height > 0) {
          const s = Math.min((cr.width - 16) / sr.width, (cr.height - 16) / sr.height);
          st.z = clamp(s < 1 ? s : 1); // only shrink to fit; keep small diagrams at 100%
        }
      }
      apply();
    };

    if (!st) {
      st = { z: 1, px: 0, py: 0 };
      container.__mzp = st;
      st.fit = fit; st.apply = apply;

      const ov = document.createElement('div');
      ov.className = 'mermaid-zoom-controls';
      const mk = (html, title, fn) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'mzc-btn'; b.innerHTML = html; b.title = title;
        b.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); fn(); });
        ov.appendChild(b);
      };
      mk('🔍+', '拡大 (Ctrl+ホイール↑)', () => { st.z = clamp(st.z + 0.2); apply(); });
      mk('🔍−', '縮小 (Ctrl+ホイール↓)', () => { st.z = clamp(st.z - 0.2); apply(); });
      mk('⊞', 'フィット', () => fit());
      mk('◀', '左へ移動', () => { st.px += 60; apply(); });
      mk('▶', '右へ移動', () => { st.px -= 60; apply(); });
      mk('▲', '上へ移動', () => { st.py += 60; apply(); });
      mk('▼', '下へ移動', () => { st.py -= 60; apply(); });
      st.label = document.createElement('span');
      st.label.className = 'mzc-label'; st.label.textContent = '100%';
      ov.appendChild(st.label);
      container.appendChild(ov);

      // Ctrl + wheel to zoom.
      container.addEventListener('wheel', (e) => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        st.z = clamp(st.z + (e.deltaY < 0 ? 0.2 : -0.2));
        apply();
      }, { passive: false });

      // Drag to pan (pointer capture avoids document-level listener leaks).
      let panning = false, sx = 0, sy = 0, ox = 0, oy = 0;
      host.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        panning = true; sx = e.clientX; sy = e.clientY; ox = st.px; oy = st.py;
        container.classList.add('mermaid-panning');
        try { host.setPointerCapture(e.pointerId); } catch (_e) { /* */ }
      });
      host.addEventListener('pointermove', (e) => {
        if (!panning) return;
        st.px = ox + (e.clientX - sx); st.py = oy + (e.clientY - sy); apply();
      });
      const endPan = (e) => {
        if (!panning) return;
        panning = false; container.classList.remove('mermaid-panning');
        try { host.releasePointerCapture(e.pointerId); } catch (_e) { /* */ }
      };
      host.addEventListener('pointerup', endPan);
      host.addEventListener('pointercancel', endPan);

      // Auto-fit on first render when the diagram overflows the viewport.
      requestAnimationFrame(() => {
        const svg = host.querySelector('svg');
        if (!svg) return;
        const sr = svg.getBoundingClientRect(), cr = container.getBoundingClientRect();
        if (sr.height > cr.height + 4 || sr.width > cr.width + 4) fit();
      });
    } else {
      apply();
    }
  }

  async function renderMermaidDiagrams() {
    if (!mermaidAvailable) return;
    const diagrams = document.querySelectorAll('.mermaid-diagram[data-mermaid-code]');
    for (const el of diagrams) {
      const code = el.getAttribute('data-mermaid-code');
      if (!code) continue;

      const rendererId = el.id + '-svg-' + Date.now();
      try {
        // @ts-ignore
        const { svg } = await mermaid.render(rendererId, code);
        el.innerHTML = svg;
        attachMermaidPreviewZoomPan(el.closest('.mermaid-container'));
      } catch (err) {
        el.innerHTML = '<div class="mermaid-error">Mermaid構文エラー:\n' +
          escapeHtml(err.message || String(err)) + '</div>' +
          '<button class="mermaid-error-edit toolbar-btn" type="button">✎ コードを編集して修正</button>';
        const editBtn = el.querySelector('.mermaid-error-edit');
        if (editBtn) {
          const tokenBlock = el.closest('.block');
          const idx = tokenBlock ? Number(tokenBlock.dataset.tokenIndex) : -1;
          editBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            ev.preventDefault();
            if (idx >= 0) startMermaidEditing(idx);
          });
        }
      } finally {
        cleanupMermaidOrphans(rendererId);
      }
    }
  }

  // ─── Text Block Editing ───
  function startEditing(tokenIndex) {
    if (editingBlockIndex === tokenIndex) return;

    if (editingBlockIndex >= 0) {
      finishEditing();
    }

    editingBlockIndex = tokenIndex;
    _editingRange = null;
    const token = allTokens[tokenIndex];
    const blockEl = document.querySelector('[data-token-index="' + tokenIndex + '"]');
    if (!blockEl) return;

    if (token.type === 'code' && token.lang === 'mermaid') {
      startMermaidEditing(tokenIndex);
      return;
    }

    if (token.type === 'code' && token.lang === 'math') {
      startMathEditing(tokenIndex);
      return;
    }

    // @ts-ignore
    if (token.type === 'table' && window.TableVisualEditor) {
      startTableEditing(tokenIndex);
      return;
    }

    blockEl.classList.add('editing');

    // Section/text block: edit the whole H1/H2 section's markdown at once.
    const range = rangeOf(tokenIndex);
    _editingRange = range;
    // Remove trailing newline(s) for nicer editing
    const rawText = rawOfRange(range).replace(/\n+$/, '');
    // Snapshot original text for dirty-check on cancel
    const originalText = rawText;

    blockEl.innerHTML =
      '<div class="block-editor">' +
        '<textarea>' + escapeHtml(rawText) + '</textarea>' +
        '<div class="block-editor-hint">Escape / Ctrl+Enter: 編集完了　|　Alt+↑/↓: 前後のブロックへ　|　Ctrl+B: 太字　|　Ctrl+I: 斜体</div>' +
      '</div>';

    const textarea = blockEl.querySelector('textarea');

    autoResizeTextarea(textarea);
    textarea.focus();
    // Move cursor to end
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    textarea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    textarea.addEventListener('input', () => {
      autoResizeTextarea(textarea);
    });

    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        // If user has typed changes, ask before discarding.
        if (textarea.value !== originalText) {
          showConfirmDialog(
            '編集内容を破棄しますか？',
            () => {
              // Restore original then finish (which writes back the now-restored value)
              textarea.value = originalText;
              finishEditing(true);
            },
            { okLabel: '破棄', cancelLabel: '編集を続ける', danger: true }
          );
        } else {
          finishEditing(true);
        }
      } else if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        finishEditing(true);
      } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.altKey) {
        // Commit this block and jump straight into editing the adjacent one.
        e.preventDefault();
        editAdjacentBlock(tokenIndex, e.key === 'ArrowDown' ? 1 : -1);
      } else if (e.key === 'b' && e.ctrlKey) {
        e.preventDefault();
        applyFormatting(textarea, 'bold');
      } else if (e.key === 'i' && e.ctrlKey) {
        e.preventDefault();
        applyFormatting(textarea, 'italic');
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        textarea.value = textarea.value.substring(0, start) + '    ' + textarea.value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + 4;
        autoResizeTextarea(textarea);
      }
    });

    textarea.addEventListener('blur', () => {
      setTimeout(() => {
        if (preventBlurFinish) return;
        if (editingBlockIndex === tokenIndex) {
          finishEditing();
        }
      }, 200);
    });
  }

  // `restoreFocus` (keyboard-initiated finish): keep the block selected and
  // focused so the user can keep navigating (↑/↓, Enter) without the mouse.
  function finishEditing(restoreFocus) {
    if (editingBlockIndex < 0) return;

    // Clean up visual editor if active
    destroyVisualEditor();

    const tokenIndex = editingBlockIndex;
    const range = _editingRange;
    const blockEl = document.querySelector('[data-token-index="' + tokenIndex + '"]');

    if (!blockEl) {
      editingBlockIndex = -1;
      _editingRange = null;
      return;
    }

    const textarea = blockEl.querySelector('textarea');

    // Section / text block: re-lex the edited markdown and splice it back in
    // place, then re-render fully (its block structure may have changed).
    if (range && textarea) {
      let newRaw = textarea.value;
      if (!newRaw.endsWith('\n')) newRaw += '\n';
      const before = allTokens.slice(0, range.start).map(t => t.raw).join('');
      const after = allTokens.slice(range.end).map(t => t.raw).join('');
      const fullText = before + newRaw + after;
      editingBlockIndex = -1;
      _editingRange = null;
      sendEdit(fullText);
      handleDocumentUpdate(fullText);
      if (restoreFocus) {
        const el = document.querySelector('[data-token-index="' + range.start + '"]');
        if (el) {
          replaceBlockSelection([range.start]);
          el.focus();
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
      return;
    }

    // Legacy single-token path (special blocks cleaned up above have no textarea).
    const token = allTokens[tokenIndex];
    if (textarea && token) {
      let newRaw = textarea.value;
      if (!newRaw.endsWith('\n')) newRaw += '\n';
      token.raw = newRaw;
    }

    editingBlockIndex = -1;
    _editingRange = null;

    blockEl.classList.remove('editing');
    if (token) renderBlockContent(blockEl, token, tokenIndex);

    if (token && token.type === 'code' && token.lang === 'mermaid') {
      requestAnimationFrame(() => renderMermaidDiagrams());
    }

    sendEdit(getFullMarkdown());

    if (restoreFocus) {
      replaceBlockSelection([tokenIndex]);
      blockEl.focus();
      blockEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  /** Active visual editor instance (if any) */
  let activeVisualEditor = null;

  // ─── Onboarding hints for high-functionality editors ───
  const ADV_ONBOARDING = {
    flowchart: { title: 'フローチャートエディタ', hints: [
      '<b>左パネル</b> でノード・エッジを追加・編集します。',
      'SVG 上の <b>ノードをクリック</b> で選択ハイライト。<b>Delete</b> キーで削除。',
      '<b>方向</b>（TB/LR…）や <b>レイアウト</b>（Dagre/ELK）はツールバーから切替。',
      '<b>Ctrl+Z / Ctrl+Y</b> で Undo / Redo。',
    ]},
    sequence: { title: 'シーケンス図エディタ', hints: [
      '<b>参加者</b>（actor / participant）を先に追加し、続けて <b>メッセージ</b> を並べます。',
      'メッセージは ↑↓ で順序入れ替え可能。<b>Note</b> で注釈を追加できます。',
    ]},
    class: { title: 'クラス図エディタ', hints: [
      '<b>クラス</b>を追加し、各クラスに <b>属性 / メソッド</b> を登録します。',
      '<b>リレーション</b>（継承・実装・関連…）でクラス間を結びます。',
    ]},
    mindmap: { title: 'マインドマップエディタ', hints: [
      'ルート以下に <b>ノードをツリー状</b> に追加します。形状（rect / cloud 等）も選択可。',
    ]},
    quadrant: { title: '象限チャートエディタ', hints: [
      '軸・象限・データ点の<b>ラベルは日本語でもそのまま</b>使えます（保存時に自動で引用符が付きます）。',
      '図上で<b>データ点をドラッグ</b>して位置を変更、<b>ダブルクリック</b>で名前を編集できます。',
    ]},
    gantt: { title: 'ガントチャートエディタ', hints: [
      '<b>セクション</b>（章）を作り、その中に <b>タスク</b> を追加します。',
      '日付形式は <code>dateFormat</code> で指定。<code>after &lt;id&gt;</code> で依存関係を表現。',
    ]},
    er: { title: 'ER 図エディタ', hints: [
      '<b>エンティティ</b>を追加し、属性に <b>PK / FK / UK</b> を設定できます。',
      '<b>リレーション</b>のカーディナリティ（1対多 等）は 6 種類から選択。',
    ]},
  };

  function _showAdvOnboarding(container, key) {
    const ob = ADV_ONBOARDING[key];
    if (ob && window.DiagramCommon) {
      window.DiagramCommon.mountOnboarding(container, 'adv-' + key, ob.title, ob.hints);
    }
  }

  // ─── Mermaid Editing ───
  function startMermaidEditing(tokenIndex) {
    if (editingBlockIndex >= 0 && editingBlockIndex !== tokenIndex) {
      finishEditing();
    }

    editingBlockIndex = tokenIndex;
    const token = allTokens[tokenIndex];
    const blockEl = document.querySelector('[data-token-index="' + tokenIndex + '"]');
    if (!blockEl) return;

    blockEl.classList.add('editing');

    // Use visual editor for flowcharts, class/sequence diagrams; code editor for others
    // @ts-ignore
    if (window.MermaidVisualEditor && window.MermaidVisualEditor.isFlowchart(token.text)) {
      startVisualMermaidEditing(tokenIndex, token, blockEl);
    // @ts-ignore
    } else if (window.ClassDiagramEditor && window.DiagramEditorUtils.isClassDiagram(token.text)) {
      startClassDiagramEditing(tokenIndex, token, blockEl);
    // @ts-ignore
    } else if (window.SequenceDiagramEditor && window.DiagramEditorUtils.isSequenceDiagram(token.text)) {
      startSequenceDiagramEditing(tokenIndex, token, blockEl);
    // @ts-ignore
    } else if (window.MindmapEditor && window.DiagramEditorUtils.isMindmap(token.text)) {
      startGenericDiagramEditing(tokenIndex, token, blockEl, window.MindmapEditor);
    // @ts-ignore
    } else if (window.QuadrantChartEditor && window.DiagramEditorUtils.isQuadrantChart(token.text)) {
      startGenericDiagramEditing(tokenIndex, token, blockEl, window.QuadrantChartEditor);
    // @ts-ignore
    } else if (window.GanttChartEditor && window.DiagramEditorUtils.isGanttChart(token.text)) {
      startGenericDiagramEditing(tokenIndex, token, blockEl, window.GanttChartEditor);
    // @ts-ignore
    } else if (window.ERDiagramEditor && window.DiagramEditorUtils.isERDiagram(token.text)) {
      startGenericDiagramEditing(tokenIndex, token, blockEl, window.ERDiagramEditor);
    // @ts-ignore — Extra editors (Mermaid 11.x supported types)
    } else if (window.ExtraDiagramUtils) {
      const X = window.ExtraDiagramUtils;
      const code = token.text;
      let EditorClass = null;
      if (X.isStateDiagram(code)) EditorClass = window.StateDiagramEditor;
      else if (X.isPieChart(code)) EditorClass = window.PieChartEditor;
      else if (X.isJourney(code)) EditorClass = window.JourneyEditor;
      else if (X.isGitGraph(code)) EditorClass = window.GitGraphEditor;
      else if (X.isTimeline(code)) EditorClass = window.TimelineEditor;
      else if (X.isRequirement(code)) EditorClass = window.RequirementEditor;
      else if (X.isC4(code)) EditorClass = window.C4Editor;
      else if (X.isSankey(code)) EditorClass = window.SankeyEditor;
      else if (X.isXYChart(code)) EditorClass = window.XYChartEditor;
      else if (X.isBlock(code)) EditorClass = window.BlockDiagramEditor;
      else if (X.isZenUml(code)) EditorClass = window.ZenUmlEditor;
      else if (X.isPacket(code)) EditorClass = window.PacketEditor;
      else if (X.isArchitecture(code)) EditorClass = window.ArchitectureEditor;
      else if (X.isKanban(code)) EditorClass = window.KanbanEditor;
      if (EditorClass) startGenericDiagramEditing(tokenIndex, token, blockEl, EditorClass);
      else startCodeMermaidEditing(tokenIndex, token, blockEl);
    } else {
      startCodeMermaidEditing(tokenIndex, token, blockEl);
    }
  }

  function startVisualMermaidEditing(tokenIndex, token, blockEl) {
    // Build container with save/cancel actions
    const editorContainer = document.createElement('div');
    editorContainer.style.width = '100%';

    const actionsBar = document.createElement('div');
    actionsBar.className = 'mermaid-editor-actions';
    actionsBar.innerHTML =
      '<button class="btn-cancel">キャンセル</button>' +
      '<button class="btn-save">保存</button>';

    blockEl.innerHTML = '';
    blockEl.appendChild(editorContainer);
    blockEl.appendChild(actionsBar);
    _showAdvOnboarding(editorContainer, 'flowchart');

    // Keep original code for cancel
    const originalCode = token.text;
    let latestCode = token.text;

    // @ts-ignore
    activeVisualEditor = new window.MermaidVisualEditor(
      editorContainer,
      token.text,
      (newCode) => { latestCode = newCode; }
    );

    const saveBtn = actionsBar.querySelector('.btn-save');
    const cancelBtn = actionsBar.querySelector('.btn-cancel');

    saveBtn.addEventListener('click', () => {
      destroyVisualEditor();
      saveMermaidEdit(tokenIndex, latestCode, blockEl);
    });

    cancelBtn.addEventListener('click', () => {
      destroyVisualEditor();
      cancelMermaidEdit(tokenIndex, blockEl);
    });

    blockEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function startClassDiagramEditing(tokenIndex, token, blockEl) {
    const editorContainer = document.createElement('div');
    editorContainer.style.width = '100%';

    const actionsBar = document.createElement('div');
    actionsBar.className = 'mermaid-editor-actions';
    actionsBar.innerHTML =
      '<button class="btn-cancel">キャンセル</button>' +
      '<button class="btn-save">保存</button>';

    blockEl.innerHTML = '';
    blockEl.appendChild(editorContainer);
    blockEl.appendChild(actionsBar);
    _showAdvOnboarding(editorContainer, 'class');

    let latestCode = token.text;

    // @ts-ignore
    activeVisualEditor = new window.ClassDiagramEditor(
      editorContainer,
      token.text,
      (newCode) => { latestCode = newCode; }
    );

    actionsBar.querySelector('.btn-save').addEventListener('click', () => {
      destroyVisualEditor();
      saveMermaidEdit(tokenIndex, latestCode, blockEl);
    });

    actionsBar.querySelector('.btn-cancel').addEventListener('click', () => {
      destroyVisualEditor();
      cancelMermaidEdit(tokenIndex, blockEl);
    });

    blockEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function startSequenceDiagramEditing(tokenIndex, token, blockEl) {
    const editorContainer = document.createElement('div');
    editorContainer.style.width = '100%';

    const actionsBar = document.createElement('div');
    actionsBar.className = 'mermaid-editor-actions';
    actionsBar.innerHTML =
      '<button class="btn-cancel">キャンセル</button>' +
      '<button class="btn-save">保存</button>';

    blockEl.innerHTML = '';
    blockEl.appendChild(editorContainer);
    blockEl.appendChild(actionsBar);
    _showAdvOnboarding(editorContainer, 'sequence');

    let latestCode = token.text;

    // @ts-ignore
    activeVisualEditor = new window.SequenceDiagramEditor(
      editorContainer,
      token.text,
      (newCode) => { latestCode = newCode; }
    );

    actionsBar.querySelector('.btn-save').addEventListener('click', () => {
      destroyVisualEditor();
      saveMermaidEdit(tokenIndex, latestCode, blockEl);
    });

    actionsBar.querySelector('.btn-cancel').addEventListener('click', () => {
      destroyVisualEditor();
      cancelMermaidEdit(tokenIndex, blockEl);
    });

    blockEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function startGenericDiagramEditing(tokenIndex, token, blockEl, EditorClass) {
    const editorContainer = document.createElement('div');
    editorContainer.style.width = '100%';

    const actionsBar = document.createElement('div');
    actionsBar.className = 'mermaid-editor-actions';
    actionsBar.innerHTML =
      '<button class="btn-cancel">キャンセル</button>' +
      '<button class="btn-save">保存</button>';

    blockEl.innerHTML = '';
    blockEl.appendChild(editorContainer);
    blockEl.appendChild(actionsBar);
    // Map EditorClass -> onboarding key for the second-tier visual editors.
    const _advKeyMap = new Map([
      [window.MindmapEditor, 'mindmap'],
      [window.QuadrantChartEditor, 'quadrant'],
      [window.GanttChartEditor, 'gantt'],
      [window.ERDiagramEditor, 'er'],
    ]);
    const _advKey = _advKeyMap.get(EditorClass);
    if (_advKey) _showAdvOnboarding(editorContainer, _advKey);

    let latestCode = token.text;

    activeVisualEditor = new EditorClass(
      editorContainer,
      token.text,
      (newCode) => { latestCode = newCode; }
    );

    actionsBar.querySelector('.btn-save').addEventListener('click', () => {
      destroyVisualEditor();
      saveMermaidEdit(tokenIndex, latestCode, blockEl);
    });

    actionsBar.querySelector('.btn-cancel').addEventListener('click', () => {
      destroyVisualEditor();
      cancelMermaidEdit(tokenIndex, blockEl);
    });

    blockEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function destroyVisualEditor() {
    if (activeVisualEditor) {
      activeVisualEditor.destroy();
      activeVisualEditor = null;
    }
    if (activeTableEditor) {
      activeTableEditor.destroy();
      activeTableEditor = null;
    }
  }

  function startCodeMermaidEditing(tokenIndex, token, blockEl) {
    const previewId = 'mermaid-preview-' + (mermaidCounter++);

    blockEl.innerHTML =
      '<div class="mermaid-editor">' +
        '<div class="mermaid-editor-code">' +
          '<div class="mermaid-editor-code-label">Mermaid コード</div>' +
          '<textarea>' + escapeHtml(token.text) + '</textarea>' +
        '</div>' +
        '<div class="mermaid-editor-preview">' +
          '<div class="mermaid-editor-preview-label">ライブプレビュー</div>' +
          '<div class="mermaid-editor-preview-content" id="' + previewId + '">' +
            '<div class="loading-indicator">読み込み中...</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="mermaid-editor-actions">' +
        '<button class="btn-cancel">キャンセル</button>' +
        '<button class="btn-save">保存 (Ctrl+Enter)</button>' +
      '</div>';

    const textarea = blockEl.querySelector('textarea');
    const previewEl = document.getElementById(previewId);
    const saveBtn = blockEl.querySelector('.btn-save');
    const cancelBtn = blockEl.querySelector('.btn-cancel');

    // Snapshot for dirty-check on cancel
    const originalCode = textarea.value;

    // Initial render
    renderMermaidPreview(textarea.value, previewId, previewEl);

    // Debounced live preview
    let debounceTimer;
    textarea.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        renderMermaidPreview(textarea.value, previewId, previewEl);
      }, 500);
    });

    textarea.focus();

    function tryCancel() {
      if (textarea.value !== originalCode) {
        showConfirmDialog(
          '編集内容を破棄しますか？',
          () => cancelMermaidEdit(tokenIndex, blockEl),
          { okLabel: '破棄', cancelLabel: '編集を続ける', danger: true }
        );
      } else {
        cancelMermaidEdit(tokenIndex, blockEl);
      }
    }

    // Keyboard shortcuts in mermaid editor
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        saveMermaidEdit(tokenIndex, textarea.value, blockEl);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        tryCancel();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        textarea.value = textarea.value.substring(0, start) + '    ' + textarea.value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + 4;
      }
    });

    saveBtn.addEventListener('click', () => {
      saveMermaidEdit(tokenIndex, textarea.value, blockEl);
    });

    cancelBtn.addEventListener('click', () => {
      tryCancel();
    });

    textarea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  // ─── Table Visual Editing ───
  let activeTableEditor = null;

  function startTableEditing(tokenIndex) {
    if (editingBlockIndex >= 0 && editingBlockIndex !== tokenIndex) {
      finishEditing();
    }

    editingBlockIndex = tokenIndex;
    const token = allTokens[tokenIndex];
    const blockEl = document.querySelector('[data-token-index="' + tokenIndex + '"]');
    if (!blockEl) return;

    blockEl.classList.add('editing');

    const editorContainer = document.createElement('div');
    editorContainer.style.width = '100%';

    const actionsBar = document.createElement('div');
    actionsBar.className = 'mermaid-editor-actions';
    actionsBar.innerHTML =
      '<button class="btn-cancel">キャンセル</button>' +
      '<button class="btn-save">保存</button>';

    blockEl.innerHTML = '';
    blockEl.appendChild(editorContainer);
    blockEl.appendChild(actionsBar);

    let latestMarkdown = token.raw;

    // @ts-ignore
    activeTableEditor = new window.TableVisualEditor(
      editorContainer,
      token.raw,
      (newMd) => { latestMarkdown = newMd; }
    );

    actionsBar.querySelector('.btn-save').addEventListener('click', () => {
      if (activeTableEditor) {
        activeTableEditor.destroy();
        activeTableEditor = null;
      }
      // Update token raw
      token.raw = latestMarkdown + '\n';
      editingBlockIndex = -1;
      blockEl.classList.remove('editing');
      renderBlockContent(blockEl, token, tokenIndex);
      sendEdit(getFullMarkdown());
    });

    actionsBar.querySelector('.btn-cancel').addEventListener('click', () => {
      if (activeTableEditor) {
        activeTableEditor.destroy();
        activeTableEditor = null;
      }
      editingBlockIndex = -1;
      blockEl.classList.remove('editing');
      renderBlockContent(blockEl, token, tokenIndex);
    });

    blockEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function saveMermaidEdit(tokenIndex, newCode, blockEl) {
    const token = allTokens[tokenIndex];
    token.text = newCode;
    token.raw = '```mermaid\n' + newCode + '\n```\n';

    editingBlockIndex = -1;
    blockEl.classList.remove('editing');
    renderBlockContent(blockEl, token, tokenIndex);
    requestAnimationFrame(() => renderMermaidDiagrams());

    sendEdit(getFullMarkdown());
  }

  function cancelMermaidEdit(tokenIndex, blockEl) {
    const token = allTokens[tokenIndex];
    editingBlockIndex = -1;
    blockEl.classList.remove('editing');
    renderBlockContent(blockEl, token, tokenIndex);
    requestAnimationFrame(() => renderMermaidDiagrams());
  }

  // ═══════════════════════════════════════════════════════════════
  // ─── LaTeX / KaTeX support ───
  // ═══════════════════════════════════════════════════════════════
  /** Safely render a TeX string to HTML via KaTeX, or return an error block. */
  function renderMathToHtml(tex, displayMode) {
    if (typeof window.katex === 'undefined') {
      return '<span class="math-fallback">' + escapeHtml(tex) + '</span>';
    }
    try {
      return window.katex.renderToString(String(tex || ''), {
        displayMode: !!displayMode,
        throwOnError: false,
        output: 'html',
        strict: 'ignore',
        trust: false,
      });
    } catch (e) {
      return '<span class="math-error" title="' + escapeHtmlAttr(String(e && e.message || e)) + '">'
        + escapeHtml(tex) + '</span>';
    }
  }

  /**
   * Walk text nodes inside `root` and replace $$...$$ (display) and $...$
   * (inline) sequences with KaTeX-rendered HTML. Skips text already inside
   * <code>, <pre>, <a>, .katex, .math-display, .math-error containers.
   */
  function renderInlineMathInElement(root) {
    if (typeof window.katex === 'undefined') return;
    const SKIP_TAGS = new Set(['CODE', 'PRE', 'SCRIPT', 'STYLE', 'A', 'TEXTAREA']);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        // Skip nodes inside skip tags or KaTeX-rendered subtrees.
        let p = node.parentNode;
        while (p && p !== root) {
          if (p.nodeType === 1) {
            if (SKIP_TAGS.has(p.tagName)) return NodeFilter.FILTER_REJECT;
            if (p.classList && (p.classList.contains('katex') || p.classList.contains('math-display') || p.classList.contains('math-error') || p.classList.contains('math-container'))) {
              return NodeFilter.FILTER_REJECT;
            }
          }
          p = p.parentNode;
        }
        return /\$/.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    const targets = [];
    let n;
    while ((n = walker.nextNode())) targets.push(n);

    // Display math first ($$...$$), then inline ($...$). Use non-greedy with no newlines for inline.
    const DISPLAY_RE = /\$\$([\s\S]+?)\$\$/g;
    const INLINE_RE = /(^|[^\\$])\$([^\s$][^\n$]*?[^\\\s$]|[^\s\\$])\$(?!\d)/g;

    targets.forEach(textNode => {
      const original = textNode.nodeValue;
      if (!original || (!original.includes('$'))) return;
      // Quick reject: needs at least two $.
      if (original.indexOf('$') === original.lastIndexOf('$')) return;

      const fragments = []; // array of { type:'text'|'math', text, display? }
      let lastIdx = 0;
      let m;

      // First pass: display $$...$$
      DISPLAY_RE.lastIndex = 0;
      const displayMatches = [];
      while ((m = DISPLAY_RE.exec(original)) !== null) {
        displayMatches.push({ start: m.index, end: m.index + m[0].length, tex: m[1] });
      }

      let cursor = 0;
      function pushText(s) { if (s) fragments.push({ type: 'text', text: s }); }

      for (const dm of displayMatches) {
        if (dm.start > cursor) {
          // Process inline math in this text chunk.
          processInline(original.slice(cursor, dm.start), fragments);
        }
        fragments.push({ type: 'math', text: dm.tex, display: true });
        cursor = dm.end;
      }
      if (cursor < original.length) {
        processInline(original.slice(cursor), fragments);
      }

      function processInline(chunk, out) {
        INLINE_RE.lastIndex = 0;
        let last = 0;
        let mm;
        const found = [];
        while ((mm = INLINE_RE.exec(chunk)) !== null) {
          // Group 1 = preceding char (kept), Group 2 = tex body.
          const matchStart = mm.index + mm[1].length;
          const matchEnd = mm.index + mm[0].length;
          found.push({ start: matchStart, end: matchEnd, tex: mm[2] });
        }
        if (!found.length) {
          out.push({ type: 'text', text: chunk });
          return;
        }
        for (const f of found) {
          if (f.start > last) out.push({ type: 'text', text: chunk.slice(last, f.start) });
          out.push({ type: 'math', text: f.tex, display: false });
          last = f.end;
        }
        if (last < chunk.length) out.push({ type: 'text', text: chunk.slice(last) });
      }

      if (fragments.length === 1 && fragments[0].type === 'text') return;

      // Build replacement.
      const tpl = document.createElement('span');
      for (const f of fragments) {
        if (f.type === 'text') {
          tpl.appendChild(document.createTextNode(f.text));
        } else {
          const holder = document.createElement(f.display ? 'div' : 'span');
          holder.className = f.display ? 'math-display' : 'math-inline';
          holder.innerHTML = renderMathToHtml(f.text, f.display);
          tpl.appendChild(holder);
        }
      }
      // Replace the original text node with the new children.
      const parent = textNode.parentNode;
      while (tpl.firstChild) parent.insertBefore(tpl.firstChild, textNode);
      parent.removeChild(textNode);
    });
  }

  // ─── LaTeX symbol palette for the math editor ───
  // Each entry: { label, insert, title? }
  // insert may include "$1" / "$2" placeholders — the first becomes the
  // selection (or caret) and the second positions the caret after insertion.
  const MATH_PALETTE_GROUPS = [
    {
      title: '構造',
      items: [
        { label: 'x²',  insert: '$1^{2}',         title: 'べき乗  x^{2}' },
        { label: 'xⁿ',  insert: '$1^{$2}',        title: 'べき乗  x^{n}' },
        { label: 'x₁',  insert: '$1_{$2}',        title: '下付き  x_{1}' },
        { label: 'a⁄b', insert: '\\frac{$1}{$2}', title: '分数  \\frac{a}{b}' },
        { label: '√x',  insert: '\\sqrt{$1}',     title: '平方根  \\sqrt{x}' },
        { label: 'ⁿ√x', insert: '\\sqrt[$1]{$2}', title: 'n 乗根  \\sqrt[n]{x}' },
        { label: '( )', insert: '\\left( $1 \\right)', title: '自動サイズ括弧' },
        { label: '| |', insert: '\\left| $1 \\right|', title: '絶対値' },
        { label: '⏟',   insert: '\\underbrace{$1}_{$2}', title: '波括弧 (下)' },
      ],
    },
    {
      title: '演算子',
      items: [
        { label: '×',  insert: '\\times ',  title: '乗算' },
        { label: '÷',  insert: '\\div ',    title: '除算' },
        { label: '±',  insert: '\\pm ',     title: 'プラスマイナス' },
        { label: '∓',  insert: '\\mp ',     title: 'マイナスプラス' },
        { label: '·',  insert: '\\cdot ',   title: 'ドット積' },
        { label: '∗',  insert: '\\ast ',    title: 'アスタリスク' },
        { label: '∘',  insert: '\\circ ',   title: '関数合成' },
        { label: '⊕',  insert: '\\oplus ',  title: '直和' },
        { label: '⊗',  insert: '\\otimes ', title: 'テンソル積' },
      ],
    },
    {
      title: '関係',
      items: [
        { label: '≤', insert: '\\le ',     title: '≦' },
        { label: '≥', insert: '\\ge ',     title: '≧' },
        { label: '≠', insert: '\\ne ',     title: '≠' },
        { label: '≈', insert: '\\approx ', title: 'ほぼ等しい' },
        { label: '≡', insert: '\\equiv ',  title: '合同' },
        { label: '∝', insert: '\\propto ', title: '比例' },
        { label: '∼', insert: '\\sim ',    title: '近い' },
        { label: '→', insert: '\\to ',     title: '右矢印' },
        { label: '⇒', insert: '\\Rightarrow ', title: '含意' },
        { label: '⇔', insert: '\\iff ',    title: '同値' },
      ],
    },
    {
      title: '大記号',
      items: [
        { label: '∑',  insert: '\\sum_{$1}^{$2} ', title: '総和' },
        { label: '∏',  insert: '\\prod_{$1}^{$2} ', title: '総積' },
        { label: '∫',  insert: '\\int_{$1}^{$2} ', title: '積分' },
        { label: '∬',  insert: '\\iint ',   title: '重積分' },
        { label: '∮',  insert: '\\oint ',   title: '周回積分' },
        { label: 'lim', insert: '\\lim_{$1 \\to $2} ', title: '極限' },
        { label: '∂',  insert: '\\partial ', title: '偏微分' },
        { label: '∇',  insert: '\\nabla ',  title: 'ナブラ' },
        { label: '∞',  insert: '\\infty ',  title: '無限大' },
      ],
    },
    {
      title: 'ギリシャ',
      items: [
        { label: 'α', insert: '\\alpha ' }, { label: 'β', insert: '\\beta ' },
        { label: 'γ', insert: '\\gamma ' }, { label: 'δ', insert: '\\delta ' },
        { label: 'ε', insert: '\\varepsilon ' }, { label: 'θ', insert: '\\theta ' },
        { label: 'λ', insert: '\\lambda ' }, { label: 'μ', insert: '\\mu ' },
        { label: 'π', insert: '\\pi ' }, { label: 'ρ', insert: '\\rho ' },
        { label: 'σ', insert: '\\sigma ' }, { label: 'τ', insert: '\\tau ' },
        { label: 'φ', insert: '\\varphi ' }, { label: 'ω', insert: '\\omega ' },
        { label: 'Γ', insert: '\\Gamma ' }, { label: 'Δ', insert: '\\Delta ' },
        { label: 'Θ', insert: '\\Theta ' }, { label: 'Λ', insert: '\\Lambda ' },
        { label: 'Π', insert: '\\Pi ' },    { label: 'Σ', insert: '\\Sigma ' },
        { label: 'Φ', insert: '\\Phi ' },   { label: 'Ω', insert: '\\Omega ' },
      ],
    },
    {
      title: '集合・論理',
      items: [
        { label: '∈', insert: '\\in ' }, { label: '∉', insert: '\\notin ' },
        { label: '⊂', insert: '\\subset ' }, { label: '⊆', insert: '\\subseteq ' },
        { label: '∪', insert: '\\cup ' }, { label: '∩', insert: '\\cap ' },
        { label: '∅', insert: '\\emptyset ' },
        { label: 'ℝ', insert: '\\mathbb{R} ' }, { label: 'ℕ', insert: '\\mathbb{N} ' },
        { label: 'ℤ', insert: '\\mathbb{Z} ' }, { label: 'ℚ', insert: '\\mathbb{Q} ' },
        { label: 'ℂ', insert: '\\mathbb{C} ' },
        { label: '∀', insert: '\\forall ' }, { label: '∃', insert: '\\exists ' },
        { label: '¬', insert: '\\neg ' }, { label: '∧', insert: '\\wedge ' },
        { label: '∨', insert: '\\vee ' },
      ],
    },
    {
      title: '行列・整列',
      items: [
        { label: '行列', insert: '\\begin{pmatrix} $1 & $2 \\\\ c & d \\end{pmatrix}', title: 'pmatrix' },
        { label: '場合分け', insert: '\\begin{cases} $1 & \\text{if } $2 \\\\ b & \\text{otherwise} \\end{cases}', title: 'cases' },
        { label: '整列', insert: '\\begin{aligned} $1 &= $2 \\\\ &= \\cdots \\end{aligned}', title: 'aligned' },
      ],
    },
  ];

  function buildMathPalette(containerEl, textarea, onChange) {
    if (!containerEl || !textarea) return;
    containerEl.innerHTML = '';

    const hint = document.createElement('div');
    hint.className = 'math-palette-hint';
    hint.textContent = '記号をクリックすると LaTeX が挿入されます。';
    containerEl.appendChild(hint);

    MATH_PALETTE_GROUPS.forEach(group => {
      const groupEl = document.createElement('div');
      groupEl.className = 'math-palette-group';
      const label = document.createElement('span');
      label.className = 'math-palette-group-label';
      label.textContent = group.title;
      groupEl.appendChild(label);
      group.items.forEach(item => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'math-palette-btn';
        btn.textContent = item.label;
        btn.title = item.title || item.insert.replace(/\$1|\$2/g, '');
        // Prevent stealing focus from the textarea on mousedown.
        btn.addEventListener('mousedown', (e) => e.preventDefault());
        btn.addEventListener('click', () => {
          insertSnippetAtCursor(textarea, item.insert);
          textarea.focus();
          if (typeof onChange === 'function') onChange();
        });
        groupEl.appendChild(btn);
      });
      containerEl.appendChild(groupEl);
    });
  }

  /**
   * Insert `snippet` into `textarea` at the current selection.
   * `$1` is replaced by the current selection (or becomes the new cursor
   * position when there is no selection). `$2` becomes the second cursor
   * stop reached when the user presses Tab — for simplicity we just keep
   * the literal placeholder text "$2" if present so the user can overwrite
   * it; if absent the cursor lands after the inserted snippet.
   */
  function insertSnippetAtCursor(textarea, snippet) {
    const value = textarea.value;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.substring(start, end);

    let body = snippet;
    let cursorOffset = -1;

    // Replace $1 with the current selection (or empty).
    if (body.indexOf('$1') >= 0) {
      body = body.replace('$1', selected);
      // If there was no selection, place the cursor where $1 was.
      if (!selected) {
        cursorOffset = snippet.indexOf('$1');
      }
    }

    // If $2 exists and we don't already have a cursor target, place cursor there.
    if (body.indexOf('$2') >= 0) {
      const idx2 = body.indexOf('$2');
      body = body.replace('$2', '');
      if (cursorOffset < 0) cursorOffset = idx2;
    }

    textarea.value = value.substring(0, start) + body + value.substring(end);
    const insertedLen = body.length;
    let caret;
    if (cursorOffset >= 0) {
      caret = start + cursorOffset;
    } else if (selected) {
      // Place caret after the inserted snippet.
      caret = start + insertedLen;
    } else {
      caret = start + insertedLen;
    }
    textarea.selectionStart = textarea.selectionEnd = caret;
    // Fire input event so listeners (preview refresh) react.
    try {
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    } catch (_e) { /* */ }
  }

  function startMathEditing(tokenIndex) {
    if (editingBlockIndex >= 0 && editingBlockIndex !== tokenIndex) {
      finishEditing();
    }
    editingBlockIndex = tokenIndex;
    const token = allTokens[tokenIndex];
    const blockEl = document.querySelector('[data-token-index="' + tokenIndex + '"]');
    if (!blockEl) return;
    blockEl.classList.add('editing');

    blockEl.innerHTML =
      '<div class="mermaid-editor">' +
        '<div class="mermaid-editor-code">' +
          '<div class="mermaid-editor-code-label">LaTeX 数式 (例: E = mc^2 , \\\\frac{a}{b} , \\\\int_0^1 x\\\\,dx )</div>' +
          '<div class="math-palette" role="toolbar" aria-label="LaTeX 記号パレット"></div>' +
          '<textarea spellcheck="false">' + escapeHtml(token.text || '') + '</textarea>' +
        '</div>' +
        '<div class="mermaid-editor-preview">' +
          '<div class="mermaid-editor-preview-label">ライブプレビュー</div>' +
          '<div class="mermaid-editor-preview-content math-preview-content">' +
            '<div class="loading-indicator">入力してください...</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="mermaid-editor-actions">' +
        '<button class="btn-cancel">キャンセル</button>' +
        '<button class="btn-save">保存 (Ctrl+Enter)</button>' +
      '</div>';

    const textarea = blockEl.querySelector('textarea');
    const previewEl = blockEl.querySelector('.math-preview-content');
    const saveBtn = blockEl.querySelector('.btn-save');
    const cancelBtn = blockEl.querySelector('.btn-cancel');
    const paletteEl = blockEl.querySelector('.math-palette');
    const originalCode = textarea.value;

    buildMathPalette(paletteEl, textarea, () => refreshPreview());

    function refreshPreview() {
      const code = textarea.value;
      if (!code.trim()) {
        previewEl.innerHTML = '<div class="loading-indicator">数式を入力してください</div>';
        return;
      }
      previewEl.innerHTML = '<div class="math-display">' + renderMathToHtml(code, true) + '</div>';
    }
    refreshPreview();

    let debounceTimer;
    textarea.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(refreshPreview, 200);
    });

    function tryCancel() {
      if (textarea.value !== originalCode) {
        showConfirmDialog(
          '編集内容を破棄しますか？',
          () => cancelMathEdit(tokenIndex, blockEl),
          { okLabel: '破棄', cancelLabel: '編集を続ける', danger: true }
        );
      } else {
        cancelMathEdit(tokenIndex, blockEl);
      }
    }

    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        saveMathEdit(tokenIndex, textarea.value, blockEl);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        tryCancel();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        textarea.value = textarea.value.substring(0, start) + '    ' + textarea.value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + 4;
      }
    });

    saveBtn.addEventListener('click', () => saveMathEdit(tokenIndex, textarea.value, blockEl));
    cancelBtn.addEventListener('click', tryCancel);

    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    blockEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function saveMathEdit(tokenIndex, newCode, blockEl) {
    const token = allTokens[tokenIndex];
    token.text = newCode;
    token.raw = '```math\n' + newCode + '\n```\n';
    editingBlockIndex = -1;
    blockEl.classList.remove('editing');
    renderBlockContent(blockEl, token, tokenIndex);
    sendEdit(getFullMarkdown());
  }

  function cancelMathEdit(tokenIndex, blockEl) {
    const token = allTokens[tokenIndex];
    editingBlockIndex = -1;
    blockEl.classList.remove('editing');
    renderBlockContent(blockEl, token, tokenIndex);
  }

  async function renderMermaidPreview(code, containerId, container) {
    if (!code.trim()) {
      container.innerHTML = '<div class="mermaid-error">コードを入力してください</div>';
      return;
    }

    const rendererId = containerId + '-render-' + Date.now();
    try {
      // @ts-ignore
      const { svg } = await mermaid.render(rendererId, code);
      container.innerHTML = svg;
    } catch (err) {
      container.innerHTML = '<div class="mermaid-error">構文エラー:\n' +
        escapeHtml(err.message || String(err)) + '</div>';
    } finally {
      cleanupMermaidOrphans(rendererId);
    }
  }

  // ─── Utility Functions ───
  /**
   * Mermaid v11 leaves temporary <div id="d{rendererId}"> and possibly the
   * rendered <svg id="{rendererId}"> attached to <body> after render() — most
   * notably when the render throws (the "bomb" error SVG).  Strip them so the
   * page does not accumulate stray icons above the editor.
   */
  function cleanupMermaidOrphans(rendererId) {
    if (rendererId) {
      const ids = [rendererId, 'd' + rendererId];
      ids.forEach(id => {
        const node = document.getElementById(id);
        if (node && node.parentElement === document.body) {
          node.remove();
        }
      });
    }
    // Sweep stray mermaid artifacts that ended up directly under <body>.
    document.querySelectorAll('body > svg[aria-roledescription="error"]').forEach(n => n.remove());
    document.querySelectorAll('body > div.mermaidTooltip').forEach(n => n.remove());
    // Mermaid v11 sometimes leaves the offscreen render container itself.
    document.querySelectorAll('body > div[id^="d"][id$="-svg-"], body > div[id^="dmermaid-"]').forEach(n => {
      // Only remove if it actually contains a mermaid svg or is empty-looking
      if (n.querySelector('svg[aria-roledescription]') || n.children.length === 0) n.remove();
    });
    // Generic: any svg whose direct parent is <body> and that carries the mermaid id pattern.
    document.querySelectorAll('body > svg').forEach(n => {
      const id = n.getAttribute('id') || '';
      if (id.startsWith('mermaid-') || id.includes('-svg-')) n.remove();
    });
  }

  // Continuous safety net: if any stray mermaid element is appended to <body>
  // outside of our render cycle (e.g. async error rendering), remove it on the
  // next animation frame.  This is cheap because the observer only fires when
  // <body>'s direct children change.
  try {
    const bodyObserver = new MutationObserver((mutations) => {
      let needsSweep = false;
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          const tag = node.tagName;
          const id = node.id || '';
          if (
            (tag === 'SVG' && (id.startsWith('mermaid-') || id.includes('-svg-') || node.getAttribute('aria-roledescription') === 'error')) ||
            (tag === 'DIV' && (id.startsWith('dmermaid-') || id.startsWith('d') && id.includes('-svg-') || node.classList.contains('mermaidTooltip')))
          ) {
            needsSweep = true;
            break;
          }
        }
        if (needsSweep) break;
      }
      if (needsSweep) requestAnimationFrame(() => cleanupMermaidOrphans());
    });
    bodyObserver.observe(document.body, { childList: true });
  } catch (e) { /* ignore */ }

  function autoResizeTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.max(60, textarea.scrollHeight) + 'px';
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function escapeHtmlAttr(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ═══════════════════════════════════════════════════════════════
  // ─── Image Resolution (relative paths → webview URI) ───
  // ═══════════════════════════════════════════════════════════════
  /** Map of original src → resolved webview URI (cache across renders). */
  const _imageUriCache = new Map();
  /** Map of pending src → array of <img> elements awaiting resolution. */
  const _pendingImageRequests = new Map();
  let _imageRequestSeq = 0;

  function isAbsoluteImageSrc(src) {
    if (!src) return true;
    // Already a webview-safe scheme or remote URL.
    return /^(data:|blob:|https?:|vscode-webview:|vscode-resource:|file:)/i.test(src)
      || src.startsWith('#');
  }

  function _imageCacheVariants(src) {
    const set = new Set();
    if (!src) return set;
    set.add(src);
    try { set.add(decodeURI(src)); } catch { /* */ }
    try { set.add(encodeURI(src)); } catch { /* */ }
    return set;
  }

  function _lookupImageCache(src) {
    for (const key of _imageCacheVariants(src)) {
      const hit = _imageUriCache.get(key);
      if (hit) return hit;
    }
    return null;
  }

  function resolveRenderedImages(scope) {
    const root = scope || document.getElementById('editor');
    if (!root) return;
    const imgs = root.querySelectorAll('img');
    imgs.forEach(img => {
      const original = img.getAttribute('data-original-src') || img.getAttribute('src') || '';
      if (!original) return;
      if (isAbsoluteImageSrc(original)) return;
      // Mark with the original src so future renders can match.
      img.setAttribute('data-original-src', original);
      const cached = _lookupImageCache(original);
      if (cached) {
        if (img.getAttribute('src') !== cached) img.setAttribute('src', cached);
        img.classList.remove('image-loading');
        return;
      }
      // Add a placeholder alt-ish styling while waiting.
      img.classList.add('image-loading');
      let bucket = _pendingImageRequests.get(original);
      if (!bucket) {
        bucket = [];
        _pendingImageRequests.set(original, bucket);
        const requestId = 'img-' + (++_imageRequestSeq);
        vscode.postMessage({ type: 'resolveImage', src: original, requestId: requestId });
      }
      bucket.push(img);
    });
  }

  function handleImageResolved(message) {
    const src = message && message.src;
    if (!src) return;
    const bucket = _pendingImageRequests.get(src) || [];
    _pendingImageRequests.delete(src);
    if (message.uri) {
      for (const key of _imageCacheVariants(src)) {
        _imageUriCache.set(key, message.uri);
      }
      bucket.forEach(img => {
        img.classList.remove('image-loading');
        img.setAttribute('src', message.uri);
      });
    } else {
      bucket.forEach(img => {
        img.classList.remove('image-loading');
        img.classList.add('image-error');
        img.title = (img.title ? img.title + ' — ' : '') + '画像を読み込めませんでした';
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // ─── Drag-and-drop image insertion ───
  // ═══════════════════════════════════════════════════════════════
  const _pendingImageSaves = new Map(); // requestId → { afterTokenIndex }
  let _imageSaveSeq = 0;

  function isImageFile(file) {
    if (!file) return false;
    if (file.type && file.type.toLowerCase().startsWith('image/')) return true;
    const name = (file.name || '').toLowerCase();
    return /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/.test(name);
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const comma = result.indexOf(',');
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = () => reject(reader.error || new Error('read failed'));
      reader.readAsDataURL(file);
    });
  }

  async function handleDroppedFiles(files, afterTokenIndex) {
    if (!files || !files.length) return;
    let firstInsert = true;
    for (const file of Array.from(files)) {
      if (!isImageFile(file)) continue;
      try {
        const base64 = await fileToBase64(file);
        const requestId = 'save-' + (++_imageSaveSeq);
        // Insert at the end on first drop unless a position was given; subsequent files insert after the just-inserted one.
        _pendingImageSaves.set(requestId, {
          afterTokenIndex: (firstInsert ? afterTokenIndex : undefined),
        });
        firstInsert = false;
        vscode.postMessage({
          type: 'saveImage',
          requestId,
          name: file.name || 'image.png',
          dataBase64: base64,
        });
      } catch (e) {
        console.warn('[Markdown Visual Editor] image read failed:', e);
      }
    }
  }

  function handleImageSaved(message) {
    const req = _pendingImageSaves.get(message.requestId);
    _pendingImageSaves.delete(message.requestId);
    if (!message || !message.ok) return;
    // Cache the resolved URI right away so the inserted block won't need a round-trip.
    if (message.relPath && message.webviewUri) {
      for (const key of _imageCacheVariants(message.relPath)) {
        _imageUriCache.set(key, message.webviewUri);
      }
    }
    const alt = String(message.altText || '画像');
    const md = '![' + alt + '](' + String(message.relPath || '') + ')';
    const blockText = md + '\n';

    const afterIdx = req && typeof req.afterTokenIndex === 'number' ? req.afterTokenIndex : -1;
    insertMarkdownAtPosition(blockText, afterIdx);
  }

  function insertMarkdownAtPosition(blockText, afterTokenIndex) {
    const content = '\n\n' + blockText.trim() + '\n';
    let fullText;
    if (afterTokenIndex < 0 || afterTokenIndex >= allTokens.length) {
      fullText = getFullMarkdown();
      if (!fullText.endsWith('\n')) fullText += '\n';
      fullText += content.trimStart();
    } else {
      let splitAt = afterTokenIndex + 1;
      if (splitAt < allTokens.length && allTokens[splitAt].type === 'space') splitAt++;
      const before = allTokens.slice(0, splitAt).map(t => t.raw).join('');
      const after = allTokens.slice(splitAt).map(t => t.raw).join('');
      fullText = before + content + after;
    }
    sendEdit(fullText);
    handleDocumentUpdate(fullText);
  }

  function attachBlockImageDropHandlers(block, index) {
    block.addEventListener('dragenter', (e) => {
      if (!e.dataTransfer || !e.dataTransfer.types) return;
      if (!Array.from(e.dataTransfer.types).includes('Files')) return;
      block.classList.add('image-drop-target');
    });
    block.addEventListener('dragover', (e) => {
      if (!e.dataTransfer || !e.dataTransfer.types) return;
      if (!Array.from(e.dataTransfer.types).includes('Files')) return;
      e.preventDefault();
      try { e.dataTransfer.dropEffect = 'copy'; } catch (_e) { /* */ }
      block.classList.add('image-drop-target');
    });
    block.addEventListener('dragleave', (e) => {
      // Only clear when leaving the block, not its children.
      if (!block.contains(e.relatedTarget)) block.classList.remove('image-drop-target');
    });
    block.addEventListener('drop', (e) => {
      if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
      const files = Array.from(e.dataTransfer.files).filter(isImageFile);
      if (!files.length) return;
      e.preventDefault();
      e.stopPropagation();
      block.classList.remove('image-drop-target');
      handleDroppedFiles(files, rangeOf(index).end - 1);
    });
  }

  // Editor-wide drop handler (drops onto empty area → append at end).
  function installEditorWideDropHandlers() {
    const editor = document.getElementById('editor');
    if (!editor) return;
    editor.addEventListener('dragover', (e) => {
      if (!e.dataTransfer || !e.dataTransfer.types) return;
      if (!Array.from(e.dataTransfer.types).includes('Files')) return;
      e.preventDefault();
      try { e.dataTransfer.dropEffect = 'copy'; } catch (_e) { /* */ }
    });
    editor.addEventListener('drop', (e) => {
      if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
      // If a block handled it, files length will still be there but we check propagation.
      // Use a flag via the event target — if drop target is a block, skip (block handler already ran).
      if (e.defaultPrevented) return;
      const files = Array.from(e.dataTransfer.files).filter(isImageFile);
      if (!files.length) return;
      e.preventDefault();
      handleDroppedFiles(files, allTokens.length - 1);
    });
  }
  setTimeout(installEditorWideDropHandlers, 0);

  // ═══════════════════════════════════════════════════════════════
  // ─── Block Context Menu (right-click) ───
  // ═══════════════════════════════════════════════════════════════
  function showBlockContextMenu(tokenIndex, clientX, clientY) {
    if (!window.DiagramCommon || !window.DiagramCommon.showContextMenu) return;
    const token = allTokens[tokenIndex];
    if (!token) return;

    // Multi-selection menu: when 2+ blocks are selected and the clicked
    // block is part of that selection, show batch operations instead.
    const selected = getSortedSelection();
    if (selected.length >= 2 && _selectedBlockIndices.has(tokenIndex)) {
      const count = selected.length;
      const items = [
        { label: '✂ 切り取り (' + count + ' 件)', onClick: () => cutSelectedBlocksToClipboard() },
        { label: '⧉ コピー (' + count + ' 件)', onClick: () => copySelectedBlocksToClipboard() },
        { label: '📋 貼り付け (このブロックの後ろ)', onClick: () => pasteAfterBlock(tokenIndex) },
        'separator',
        { label: '📄 PDF として出力', onClick: () => exportToPdf() },
        'separator',
        { label: '🗑 ' + count + ' 件のブロックを削除', danger: true, onClick: () => requestDeleteSelectedBlocks() },
      ];
      window.DiagramCommon.showContextMenu(clientX, clientY, items);
      return;
    }

    // Find sibling blocks so move-up/down are sensible.
    const visibleIdx = _visibleBlockIndices();
    const orderPos = visibleIdx.indexOf(tokenIndex);
    const canUp = orderPos > 0;
    const canDown = orderPos >= 0 && orderPos < visibleIdx.length - 1;

    const items = [
      { label: '✎ 編集', onClick: () => startEditing(tokenIndex) },
      'separator',
      { label: '⬆ 上にブロックを追加…', onClick: () => showAddBlockMenu(tokenIndex, 'above', clientX, clientY) },
      { label: '⬇ 下にブロックを追加…', onClick: () => showAddBlockMenu(tokenIndex, 'below', clientX, clientY) },
      'separator',
      { label: '✂ 切り取り', onClick: () => cutBlockToClipboard(tokenIndex) },
      { label: '⧉ コピー', onClick: () => copyBlockToClipboard(tokenIndex) },
      { label: '📋 貼り付け (このブロックの後ろ)', onClick: () => pasteAfterBlock(tokenIndex) },
      'separator',
      { label: '↑ 上に移動', disabled: !canUp, onClick: () => moveBlock(tokenIndex, -1) },
      { label: '↓ 下に移動', disabled: !canDown, onClick: () => moveBlock(tokenIndex, +1) },
      'separator',
      { label: '📄 PDF として出力', onClick: () => exportToPdf() },
      'separator',
      { label: '🗑 削除', danger: true, onClick: () => requestDeleteBlock(tokenIndex) },
    ];
    window.DiagramCommon.showContextMenu(clientX, clientY, items);
  }

  // Editor-background right-click (not on a block) → minimal menu with PDF export.
  function installEditorContextMenu() {
    const editor = document.getElementById('editor');
    if (!editor) return;
    editor.addEventListener('contextmenu', (e) => {
      // If the click landed inside a block, the block's own handler already ran.
      if (e.defaultPrevented) return;
      if (e.target.closest('.block')) return;
      if (e.target.closest('a, textarea, input, select, .dve-ctxmenu, .table-ctx-menu')) return;
      if (!window.DiagramCommon || !window.DiagramCommon.showContextMenu) return;
      e.preventDefault();
      window.DiagramCommon.showContextMenu(e.clientX, e.clientY, [
        { label: '📋 貼り付け (末尾に追加)', onClick: () => pasteAtEnd() },
        'separator',
        { label: '📄 PDF として出力', onClick: () => exportToPdf() },
      ]);
    });
  }
  setTimeout(installEditorContextMenu, 0);

  // ─── Clipboard helpers (block-level cut / copy / paste) ───
  function _fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_e) { /* */ }
    document.body.removeChild(ta);
    return ok;
  }
  function writeClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch((err) => {
        console.warn('[Markdown Visual Editor] clipboard.writeText failed:', err);
        _fallbackCopy(text);
      });
    }
    _fallbackCopy(text);
    return Promise.resolve();
  }
  async function readClipboard() {
    if (navigator.clipboard && navigator.clipboard.readText) {
      try { return await navigator.clipboard.readText(); }
      catch (err) {
        console.warn('[Markdown Visual Editor] clipboard.readText failed:', err);
      }
    }
    return null;
  }
  function copyBlockToClipboard(tokenIndex) {
    const raw = rawOfRange(rangeOf(tokenIndex));
    if (!raw) return Promise.resolve();
    return writeClipboard(raw);
  }
  function cutBlockToClipboard(tokenIndex) {
    copyBlockToClipboard(tokenIndex).finally(() => deleteBlock(tokenIndex));
  }
  function _insertMarkdownTokens(text, insertAt) {
    if (!text) return;
    const pasted = text.endsWith('\n') ? text : text + '\n';
    let newTokens;
    try {
      // @ts-ignore
      newTokens = marked.lexer(pasted);
    } catch (_e) {
      newTokens = null;
    }
    if (!newTokens || !newTokens.length) return;
    if (insertAt < 0) insertAt = 0;
    if (insertAt > allTokens.length) insertAt = allTokens.length;
    allTokens.splice(insertAt, 0, ...newTokens);
    const fullText = getFullMarkdown();
    sendEdit(fullText);
    handleDocumentUpdate(fullText);
  }
  async function pasteAfterBlock(tokenIndex) {
    const text = await readClipboard();
    if (text == null) return;
    _insertMarkdownTokens(text, rangeOf(tokenIndex).end);
  }
  async function pasteAtEnd() {
    const text = await readClipboard();
    if (text == null) return;
    _insertMarkdownTokens(text, allTokens.length);
  }

  // ─── Multi-block selection (Click / Ctrl-click / Shift-click) ───
  /** @type {Set<number>} token indices of currently selected blocks */
  const _selectedBlockIndices = new Set();
  /** @type {number|null} anchor for Shift-click range selection */
  let _selectionAnchor = null;

  function _applyBlockSelectionStyles() {
    document.querySelectorAll('.block.block-selected').forEach(el => {
      const idx = parseInt(el.dataset.tokenIndex || '', 10);
      if (isNaN(idx) || !_selectedBlockIndices.has(idx)) {
        el.classList.remove('block-selected');
      }
    });
    _selectedBlockIndices.forEach(idx => {
      const el = document.querySelector('[data-token-index="' + idx + '"]');
      if (el) el.classList.add('block-selected');
    });
  }

  function clearBlockSelection() {
    if (_selectedBlockIndices.size === 0 && _selectionAnchor == null) return;
    _selectedBlockIndices.clear();
    _selectionAnchor = null;
    _applyBlockSelectionStyles();
  }

  function replaceBlockSelection(indices) {
    _selectedBlockIndices.clear();
    indices.forEach(i => _selectedBlockIndices.add(i));
    _selectionAnchor = indices.length ? indices[indices.length - 1] : null;
    _applyBlockSelectionStyles();
  }

  function getSortedSelection() {
    return Array.from(_selectedBlockIndices).sort((a, b) => a - b);
  }

  // Block identities = the start token index of each visual block (H1/H2
  // section or special block), in document order.
  function _visibleBlockIndices() {
    return computeBlockRanges().map(r => r.start);
  }

  // ─── Keyboard navigation between blocks ───
  /** Move DOM focus + selection to the previous/next visible block (dir: -1 | +1). */
  function focusAdjacentBlock(tokenIndex, dir) {
    const visible = _visibleBlockIndices();
    const pos = visible.indexOf(tokenIndex);
    if (pos < 0) return;
    const targetPos = pos + dir;
    if (targetPos < 0 || targetPos >= visible.length) return;
    const targetIndex = visible[targetPos];
    // Keep the selection in sync so the current block stays highlighted.
    replaceBlockSelection([targetIndex]);
    const el = document.querySelector('[data-token-index="' + targetIndex + '"]');
    if (el) { el.focus(); el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  }

  /** Commit the current edit and open the previous/next block for editing. */
  function editAdjacentBlock(tokenIndex, dir) {
    const visible = _visibleBlockIndices();
    const pos = visible.indexOf(tokenIndex);
    if (pos < 0) return;
    const targetPos = pos + dir;
    if (targetPos < 0 || targetPos >= visible.length) return;
    const targetIndex = visible[targetPos];
    // finishEditing() only rewrites the current block's raw and re-renders that
    // single block, so token indices stay valid for the follow-up startEditing.
    finishEditing();
    replaceBlockSelection([targetIndex]);
    startEditing(targetIndex);
  }

  // ─── Insert a new block relative to an existing one ───
  /** Insert `template` after the given token index (-1 = document start). */
  function _insertTemplateAfter(template, insertAfterIndex, opts) {
    let fullText, offset;
    if (insertAfterIndex < 0) {
      fullText = template + '\n\n' + getFullMarkdown();
      offset = 0;
    } else {
      let splitAt = insertAfterIndex + 1;
      if (splitAt < allTokens.length && allTokens[splitAt].type === 'space') splitAt++;
      const before = allTokens.slice(0, splitAt).map(t => t.raw).join('');
      const after = allTokens.slice(splitAt).map(t => t.raw).join('');
      // Guarantee a blank line on both sides so the inserted block never merges
      // into an adjacent paragraph/list (markdown lazy continuation).
      const beforeSep = /\n\n$/.test(before) ? '' : (/\n$/.test(before) ? '\n' : '\n\n');
      const afterSep = after ? (/^\n/.test(after) ? '\n' : '\n\n') : '';
      fullText = before + beforeSep + template + afterSep + after;
      offset = (before + beforeSep).length;
    }
    sendEdit(fullText);
    handleDocumentUpdate(fullText);
    if (opts && opts.edit) _startEditingAtOffset(offset);
  }

  /** Start editing the block containing the first token at/after `offset`. */
  function _startEditingAtOffset(offset) {
    let acc = 0;
    for (let i = 0; i < allTokens.length; i++) {
      const t = allTokens[i];
      if (t.type !== 'space' && acc >= offset) {
        // Snap to the start of the block that contains token i.
        const r = computeBlockRanges().find(rr => i >= rr.start && i < rr.end);
        startEditing(r ? r.start : i);
        return;
      }
      acc += (t.raw || '').length;
    }
  }

  /** Insert `template` above/below the block at tokenIndex. */
  function insertBlockRelative(template, tokenIndex, where, opts) {
    let insertAfterIndex;
    if (where === 'below') {
      // After the block = after its last token.
      insertAfterIndex = rangeOf(tokenIndex).end - 1;
    } else {
      const visible = _visibleBlockIndices();
      const pos = visible.indexOf(tokenIndex);
      insertAfterIndex = (pos > 0) ? (rangeOf(visible[pos - 1]).end - 1) : -1;
    }
    _insertTemplateAfter(template, insertAfterIndex, opts);
  }

  // Block types offered by the right-click "add block" menu.
  function _addBlockTypes() {
    return [
      { label: '¶ 段落', tpl: 'テキスト' },
      { label: 'H1 見出し1', tpl: '# 見出し1' },
      { label: 'H2 見出し2', tpl: '## 見出し2' },
      { label: 'H3 見出し3', tpl: '### 見出し3' },
      { label: '• 箇条書きリスト', tpl: '- リスト項目' },
      { label: '1. 番号付きリスト', tpl: '1. リスト項目' },
      { label: '☑ タスクリスト', tpl: '- [ ] タスク' },
      { label: '⊞ 表', tpl: getNewBlockTemplate('table') },
      { label: '{ } コードブロック', tpl: '```\nコード\n```' },
      { label: '∑ 数式', tpl: '```math\nE = mc^2\n```' },
      { label: '❝ 引用', tpl: '> 引用' },
      { label: '─ 水平線', tpl: '---' },
    ];
  }

  /**
   * Show a block-type picker (as a context menu) and insert the chosen block
   * above/below the reference block. `where` is 'above' | 'below'.
   */
  function showAddBlockMenu(tokenIndex, where, clientX, clientY) {
    if (!window.DiagramCommon || !window.DiagramCommon.showContextMenu) return;
    const items = _addBlockTypes().map(bt => ({
      label: bt.label,
      onClick: () => insertBlockRelative(bt.tpl, tokenIndex, where, { edit: true }),
    }));
    items.push('separator');
    items.push({
      label: '◇ Mermaid ダイアグラム…',
      onClick: () => showMermaidPicker({ tokenIndex, where }),
    });
    window.DiagramCommon.showContextMenu(clientX, clientY, items);
  }

  /** Keyboard entry point: open the add-block picker anchored to the block. */
  function showAddBlockMenuAtBlock(tokenIndex, where) {
    const el = document.querySelector('[data-token-index="' + tokenIndex + '"]');
    const rect = el ? el.getBoundingClientRect() : { left: 80, bottom: 80 };
    showAddBlockMenu(tokenIndex, where, rect.left + 20, (where === 'below' ? rect.bottom : rect.top) );
  }

  function handleBlockSelectionClick(tokenIndex, e) {
    const visible = _visibleBlockIndices();
    if (e.shiftKey && _selectionAnchor != null && visible.includes(_selectionAnchor)) {
      const a = visible.indexOf(_selectionAnchor);
      const b = visible.indexOf(tokenIndex);
      if (b < 0) return;
      const [lo, hi] = a < b ? [a, b] : [b, a];
      _selectedBlockIndices.clear();
      for (let i = lo; i <= hi; i++) _selectedBlockIndices.add(visible[i]);
      _applyBlockSelectionStyles();
    } else if (e.ctrlKey || e.metaKey) {
      if (_selectedBlockIndices.has(tokenIndex)) {
        _selectedBlockIndices.delete(tokenIndex);
      } else {
        _selectedBlockIndices.add(tokenIndex);
      }
      _selectionAnchor = tokenIndex;
      _applyBlockSelectionStyles();
    } else {
      replaceBlockSelection([tokenIndex]);
    }
    // Focus the block so keyboard shortcuts work without an extra click.
    const el = document.querySelector('[data-token-index="' + tokenIndex + '"]');
    if (el && typeof el.focus === 'function') el.focus({ preventScroll: true });
  }

  /** Serialize the selected blocks (in document order) to a markdown string. */
  function _serializeSelectedBlocks() {
    const sorted = getSortedSelection();
    if (!sorted.length) return '';
    const parts = sorted
      .map(i => rawOfRange(rangeOf(i)))
      .map(s => s.replace(/\s+$/, ''))
      .filter(s => s.length);
    return parts.join('\n\n') + '\n';
  }

  function copySelectedBlocksToClipboard() {
    const text = _serializeSelectedBlocks();
    if (!text) return Promise.resolve();
    return writeClipboard(text);
  }

  function _deleteBlocksByIndices(sortedIndices) {
    if (!sortedIndices.length) return;
    // Resolve to ranges, then splice high → low so earlier ranges stay valid.
    const ranges = sortedIndices.map(rangeOf).sort((a, b) => b.start - a.start);
    for (const r of ranges) {
      if (r.start < 0 || r.start >= allTokens.length) continue;
      allTokens.splice(r.start, r.end - r.start);
    }
    const fullText = getFullMarkdown();
    sendEdit(fullText);
    handleDocumentUpdate(fullText);
  }

  function cutSelectedBlocksToClipboard() {
    const sorted = getSortedSelection();
    if (!sorted.length) return;
    copySelectedBlocksToClipboard().finally(() => _deleteBlocksByIndices(sorted));
  }

  function requestDeleteSelectedBlocks() {
    const sorted = getSortedSelection();
    if (!sorted.length) return;
    if (sorted.length === 1) {
      requestDeleteBlock(sorted[0]);
      return;
    }
    showConfirmDialog(
      sorted.length + ' 件のブロックを削除しますか？',
      () => _deleteBlocksByIndices(sorted),
      { okLabel: '削除', cancelLabel: 'キャンセル', danger: true }
    );
  }

  // Background click on the editor (outside any block) clears selection.
  function installSelectionClearOnBackgroundClick() {
    const editor = document.getElementById('editor');
    if (!editor) return;
    editor.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('.block')) return;
      if (e.target.closest('.dve-ctxmenu, .table-ctx-menu')) return;
      clearBlockSelection();
    });
  }
  setTimeout(installSelectionClearOnBackgroundClick, 0);

  // Document-level keyboard shortcuts for block clipboard operations.
  document.addEventListener('keydown', async (e) => {
    if (_selectedBlockIndices.size === 0) return;
    // Don't hijack typing inside any editable surface.
    const t = e.target;
    if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (t && t.closest && t.closest('.editing, .mermaid-editor, .dve-ctxmenu, .table-ctx-menu')) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === 'c' || e.key === 'C')) {
      e.preventDefault();
      await copySelectedBlocksToClipboard();
    } else if (mod && (e.key === 'x' || e.key === 'X')) {
      e.preventDefault();
      cutSelectedBlocksToClipboard();
    } else if (mod && (e.key === 'v' || e.key === 'V')) {
      e.preventDefault();
      const text = await readClipboard();
      if (text == null) return;
      const sorted = getSortedSelection();
      const last = sorted[sorted.length - 1];
      let insertAt = last + 1;
      if (insertAt < allTokens.length && allTokens[insertAt].type === 'space') insertAt++;
      _insertMarkdownTokens(text, insertAt);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (_selectedBlockIndices.size >= 2) {
        e.preventDefault();
        requestDeleteSelectedBlocks();
      }
    } else if (e.key === 'Escape') {
      clearBlockSelection();
    }
  });

  /**
   * Export the current document to PDF. VS Code webviews silently block
   * `window.print()`, so we serialize the rendered editor DOM, send it to
   * the extension host, and let the host write a standalone HTML file and
   * open it in the system default browser where the print dialog can be
   * used to "Save as PDF" (with the md file's directory suggested as the
   * save location).
   */
  async function exportToPdf() {
    // If a block is being edited, commit changes first so the exported view
    // reflects the latest state.
    if (editingBlockIndex >= 0) {
      try { finishEditing(); } catch (_e) { /* */ }
    }
    // Dismiss any open lightweight menus / overlays so they don't leak into
    // the printable snapshot.
    document.querySelectorAll('.dve-ctxmenu').forEach(m => m.remove());

    const editorEl = document.getElementById('editor');
    if (!editorEl) {
      alert('エディタの内容を取得できませんでした。');
      return;
    }

    // Work on a detached clone so we can sanitize freely without disturbing
    // the live editor.
    const clone = editorEl.cloneNode(true);

    // Restore original (relative) image paths so the extension host can
    // resolve them against the md file's directory.
    clone.querySelectorAll('img').forEach(img => {
      const orig = img.getAttribute('data-original-src');
      if (orig) {
        img.setAttribute('src', orig);
        img.removeAttribute('data-original-src');
      }
      img.classList.remove('image-loading', 'image-error');
    });

    // Strip transient interactive affordances.
    clone.querySelectorAll('.block').forEach(b => {
      b.classList.remove('editing', 'selected', 'search-current', 'block-changed');
      b.removeAttribute('contenteditable');
      b.removeAttribute('tabindex');
    });
    clone.querySelectorAll(
      '.block-drag-handle, .mermaid-edit-overlay, .mermaid-error-edit, ' +
      '.dve-ctxmenu, .heading-more-menu, .confirm-dialog-overlay, ' +
      'mark.search-highlight'
    ).forEach(n => {
      // For search highlights, unwrap to keep the inner text.
      if (n.classList && n.classList.contains('search-highlight')) {
        const parent = n.parentNode;
        if (parent) {
          while (n.firstChild) parent.insertBefore(n.firstChild, n);
          parent.removeChild(n);
        }
      } else {
        n.remove();
      }
    });

    // Re-render Mermaid diagrams with the light theme so the exported PDF
    // does not carry over dark backgrounds/colors from the webview.
    if (mermaidAvailable && typeof mermaid !== 'undefined') {
      try {
        // @ts-ignore
        mermaid.initialize({
          startOnLoad: false,
          theme: 'default',
          securityLevel: 'loose',
          flowchart: { useMaxWidth: true },
        });
      } catch (_e) { /* */ }
      const diagrams = clone.querySelectorAll('.mermaid-diagram[data-mermaid-code]');
      let i = 0;
      for (const el of diagrams) {
        const code = el.getAttribute('data-mermaid-code');
        if (!code) continue;
        const rid = 'mdve-pdf-mmd-' + Date.now() + '-' + (i++);
        try {
          // @ts-ignore
          const { svg } = await mermaid.render(rid, code);
          el.innerHTML = svg;
        } catch (_e) { /* keep existing rendering on failure */ }
        finally { try { cleanupMermaidOrphans(rid); } catch (_e2) {} }
      }
      // Restore the webview's preferred theme for live editing.
      try {
        // @ts-ignore
        mermaid.initialize({
          startOnLoad: false,
          theme: isCurrentlyLight() ? 'default' : 'dark',
          securityLevel: 'loose',
          flowchart: { useMaxWidth: true },
        });
      } catch (_e) { /* */ }
    }

    vscode.postMessage({ type: 'exportPdf', html: clone.innerHTML });
  }

  function requestDeleteBlock(tokenIndex) {
    const raw = rawOfRange(rangeOf(tokenIndex));
    if (!raw && !allTokens[tokenIndex]) return;
    const preview = (raw || '').trim().split('\n')[0].slice(0, 60) || '(空のブロック)';
    showConfirmDialog(
      'このブロックを削除しますか？\n\n' + preview,
      () => deleteBlock(tokenIndex),
      { okLabel: '削除', cancelLabel: 'キャンセル', danger: true }
    );
  }

  function deleteBlock(tokenIndex) {
    const range = rangeOf(tokenIndex);
    if (range.start < 0 || range.start >= allTokens.length) return;
    // Remove the whole block range (heading + section body + trailing blank).
    if (editingBlockIndex >= range.start && editingBlockIndex < range.end) {
      editingBlockIndex = -1;
      _editingRange = null;
    }
    allTokens.splice(range.start, range.end - range.start);
    const fullText = getFullMarkdown();
    sendEdit(fullText);
    handleDocumentUpdate(fullText);
  }

  function moveBlock(tokenIndex, direction) {
    const starts = _visibleBlockIndices();
    const pos = starts.indexOf(tokenIndex);
    if (pos < 0) return;
    const targetPos = pos + direction;
    if (targetPos < 0 || targetPos >= starts.length) return;
    const targetRange = rangeOf(starts[targetPos]);
    // Down → drop after the target block; up → drop before it.
    reorderBlock(tokenIndex, direction > 0 ? targetRange.end : targetRange.start);
  }

  /**
   * Move the block starting at sourceTokenIndex (plus any attached trailing
   * 'space' token) so that it appears before the token currently at
   * destBeforeIndex. Indices refer to positions in allTokens *before* moving.
   */
  function reorderBlock(sourceTokenIndex, destBeforeIndex) {
    if (sourceTokenIndex === destBeforeIndex) return;
    // Source slice = the whole block range (section body + trailing space).
    const srcRange = rangeOf(sourceTokenIndex);
    const len = srcRange.end - srcRange.start;
    sourceTokenIndex = srcRange.start;
    if (destBeforeIndex > sourceTokenIndex && destBeforeIndex < sourceTokenIndex + len) return;
    const removed = allTokens.splice(sourceTokenIndex, len);
    let insertAt = destBeforeIndex;
    if (destBeforeIndex > sourceTokenIndex) insertAt -= len;
    if (insertAt < 0) insertAt = 0;
    if (insertAt > allTokens.length) insertAt = allTokens.length;
    allTokens.splice(insertAt, 0, ...removed);
    const fullText = getFullMarkdown();
    sendEdit(fullText);
    handleDocumentUpdate(fullText);
  }

  // ═══════════════════════════════════════════════════════════════
  // ─── Block Drag-and-Drop Reordering ───
  // ═══════════════════════════════════════════════════════════════
  let _draggingSourceIndex = -1;

  function attachBlockDragHandlers(handle, block) {
    handle.addEventListener('dragstart', (e) => {
      const idx = parseInt(block.dataset.tokenIndex, 10);
      if (isNaN(idx)) return;
      _draggingSourceIndex = idx;
      block.classList.add('block-dragging');
      try {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('application/x-md-block-index', String(idx));
        e.dataTransfer.setData('text/plain', '');
      } catch (_e) { /* */ }
    });
    handle.addEventListener('dragend', () => {
      block.classList.remove('block-dragging');
      _draggingSourceIndex = -1;
      document.querySelectorAll('.block-drop-before, .block-drop-after').forEach(b => {
        b.classList.remove('block-drop-before');
        b.classList.remove('block-drop-after');
      });
    });

    block.addEventListener('dragover', (e) => {
      if (_draggingSourceIndex < 0) return;
      e.preventDefault();
      try { e.dataTransfer.dropEffect = 'move'; } catch (_e) { /* */ }
      const rect = block.getBoundingClientRect();
      const before = (e.clientY - rect.top) < rect.height / 2;
      block.classList.toggle('block-drop-before', before);
      block.classList.toggle('block-drop-after', !before);
    });
    block.addEventListener('dragleave', (e) => {
      if (!block.contains(e.relatedTarget)) {
        block.classList.remove('block-drop-before');
        block.classList.remove('block-drop-after');
      }
    });
    block.addEventListener('drop', (e) => {
      if (_draggingSourceIndex < 0) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = block.getBoundingClientRect();
      const before = (e.clientY - rect.top) < rect.height / 2;
      const targetIdx = parseInt(block.dataset.tokenIndex, 10);
      const source = _draggingSourceIndex;
      _draggingSourceIndex = -1;
      block.classList.remove('block-drop-before');
      block.classList.remove('block-drop-after');
      if (isNaN(targetIdx) || source === targetIdx) return;
      // Compute destBeforeIndex from the target block's range.
      const targetRange = rangeOf(targetIdx);
      const dest = before ? targetRange.start : targetRange.end;
      reorderBlock(source, dest);
    });
  }

  /**
   * Add dragstart/dragend handlers to the block element itself so the user
   * can grab the highlighted area anywhere (not just the small handle).
   * The block's dragover/dragleave/drop listeners are already attached by
   * attachBlockDragHandlers(handle, block) and must not be re-registered.
   */
  function attachBlockSelfDragSource(block) {
    block.addEventListener('dragstart', (e) => {
      if (block.classList.contains('editing')) { e.preventDefault(); return; }
      const tgt = e.target;
      // Let the handle's own dragstart fire instead.
      if (tgt && tgt.closest && tgt.closest('.block-drag-handle')) return;
      if (tgt && tgt.closest && tgt.closest('a, textarea, input, select, button, .mermaid-edit-overlay, .table-ctx-menu, .dve-ctxmenu')) {
        e.preventDefault();
        return;
      }
      const sel = window.getSelection && window.getSelection();
      if (sel && sel.toString && sel.toString().length > 0) {
        e.preventDefault();
        return;
      }
      const idx = parseInt(block.dataset.tokenIndex, 10);
      if (isNaN(idx)) return;
      _draggingSourceIndex = idx;
      block.classList.add('block-dragging');
      try {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('application/x-md-block-index', String(idx));
        e.dataTransfer.setData('text/plain', '');
      } catch (_e) { /* */ }
    });
    block.addEventListener('dragend', () => {
      block.classList.remove('block-dragging');
      _draggingSourceIndex = -1;
      document.querySelectorAll('.block-drop-before, .block-drop-after').forEach(b => {
        b.classList.remove('block-drop-before');
        b.classList.remove('block-drop-after');
      });
    });
  }

  /**
   * Lightweight HTML sanitizer — strips dangerous tags/attributes from
   * marked output.  Allowed: structural HTML elements only.
   * Removes: script, iframe, object, embed, form, input, on* attributes,
   *          javascript: hrefs, data: hrefs (except images).
   */
  function sanitizeHtml(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');

    // Remove dangerous elements
    const dangerousTags = ['script', 'iframe', 'object', 'embed', 'form',
      'input', 'textarea', 'select', 'button', 'style', 'link', 'meta',
      'base', 'applet', 'frame', 'frameset', 'layer', 'ilayer', 'bgsound'];
    dangerousTags.forEach(tag => {
      doc.querySelectorAll(tag).forEach(el => el.remove());
    });

    // Remove event handler attributes and dangerous href/src values
    doc.querySelectorAll('*').forEach(el => {
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        // Remove all on* event handlers
        if (name.startsWith('on')) {
          el.removeAttribute(attr.name);
          continue;
        }
        // Remove javascript: and vbscript: URLs
        if (['href', 'src', 'action', 'formaction', 'xlink:href'].includes(name)) {
          const val = attr.value.trim().toLowerCase();
          if (val.startsWith('javascript:') || val.startsWith('vbscript:')) {
            el.removeAttribute(attr.name);
          }
        }
        // Remove data: URIs except on img tags
        if (name === 'src' && el.tagName !== 'IMG') {
          const val = attr.value.trim().toLowerCase();
          if (val.startsWith('data:')) {
            el.removeAttribute(attr.name);
          }
        }
      }
    });

    return doc.body.innerHTML;
  }

  // ═══════════════════════════════════════════════════════════════
  // ─── Theme Toggle (Light / Dark) ───
  // ═══════════════════════════════════════════════════════════════
  /** @type {'auto'|'light'|'dark'} */
  let _forcedTheme = 'auto';
  try {
    const saved = vscode.getState && vscode.getState();
    if (saved && saved.forcedTheme) _forcedTheme = saved.forcedTheme;
  } catch (e) {}
  applyTheme();

  function isCurrentlyLight() {
    if (_forcedTheme === 'light') return true;
    if (_forcedTheme === 'dark') return false;
    return document.body.classList.contains('vscode-light')
      || document.body.classList.contains('vscode-high-contrast-light');
  }

  function applyTheme() {
    document.body.classList.remove('force-theme-light', 'force-theme-dark');
    if (_forcedTheme === 'light') document.body.classList.add('force-theme-light');
    else if (_forcedTheme === 'dark') document.body.classList.add('force-theme-dark');

    // Update toolbar button icon
    const btn = document.querySelector('.toolbar-btn[data-action="toggleTheme"]');
    if (btn) {
      const light = isCurrentlyLight();
      btn.textContent = light ? '☀️' : '🌙';
      btn.title = (light ? 'ダークモードに切替' : 'ライトモードに切替') + '（現在: ' + (light ? 'ライト' : 'ダーク') + (_forcedTheme === 'auto' ? ' / 自動' : ' / 強制') + '）';
    }

    // Re-init mermaid theme and re-render existing diagrams
    if (mermaidAvailable) {
      try {
        // @ts-ignore
        mermaid.initialize({
          startOnLoad: false,
          theme: isCurrentlyLight() ? 'default' : 'dark',
          securityLevel: 'loose',
          flowchart: { useMaxWidth: true },
        });
      } catch (e) { /* ignore */ }
      // Re-render visible diagrams
      document.querySelectorAll('.mermaid-diagram[data-mermaid-code]').forEach(el => {
        el.innerHTML = '';
      });
      renderMermaidDiagrams();
    }
  }

  function toggleTheme() {
    const light = isCurrentlyLight();
    _forcedTheme = light ? 'dark' : 'light';
    try { vscode.setState && vscode.setState({ forcedTheme: _forcedTheme }); } catch (e) {}
    applyTheme();
  }

  // ═══════════════════════════════════════════════════════════════
  // ─── Find / Replace Bar ───
  // ═══════════════════════════════════════════════════════════════
  const _find = {
    bar: null, input: null, replaceInput: null, count: null,
    caseEl: null, regexEl: null,
    matches: [], current: -1,
    visible: false,
  };

  function _initFindBar() {
    _find.bar = document.getElementById('find-bar');
    _find.input = document.getElementById('find-input');
    _find.replaceInput = document.getElementById('replace-input');
    _find.count = document.getElementById('find-count');
    _find.caseEl = document.getElementById('find-case');
    _find.regexEl = document.getElementById('find-regex');
    if (!_find.bar) return;

    document.getElementById('find-close').addEventListener('click', () => toggleFindBar(false));
    document.getElementById('find-next').addEventListener('click', () => findStep(+1));
    document.getElementById('find-prev').addEventListener('click', () => findStep(-1));
    document.getElementById('replace-one').addEventListener('click', () => doReplace(false));
    document.getElementById('replace-all').addEventListener('click', () => doReplace(true));

    _find.input.addEventListener('input', () => { _find.current = -1; recomputeMatches(); highlightAll(); });
    _find.caseEl.addEventListener('change', () => { recomputeMatches(); highlightAll(); });
    _find.regexEl.addEventListener('change', () => { recomputeMatches(); highlightAll(); });
    _find.input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); toggleFindBar(false); }
      else if (e.key === 'Enter') { e.preventDefault(); findStep(e.shiftKey ? -1 : +1); }
    });
    _find.replaceInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); toggleFindBar(false); }
      else if (e.key === 'Enter') { e.preventDefault(); doReplace(e.shiftKey); }
    });
  }

  function toggleFindBar(show) {
    if (!_find.bar) _initFindBar();
    if (!_find.bar) return;
    _find.visible = show;
    _find.bar.hidden = !show;
    const btn = document.querySelector('.toolbar-btn[data-action="find"]');
    if (btn) btn.setAttribute('aria-pressed', show ? 'true' : 'false');
    if (show) {
      _find.input.focus();
      _find.input.select();
      recomputeMatches();
      highlightAll();
    } else {
      clearHighlights();
      _find.matches = [];
      _find.current = -1;
      if (_find.input) _find.input.classList.remove('no-match');
      if (_find.count) _find.count.classList.remove('no-match');
    }
  }

  function _buildPattern() {
    const q = _find.input ? _find.input.value : '';
    if (!q) return null;
    const flags = (_find.caseEl && _find.caseEl.checked) ? 'g' : 'gi';
    try {
      const isRegex = _find.regexEl && _find.regexEl.checked;
      return new RegExp(isRegex ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
    } catch (e) {
      return null;
    }
  }

  function recomputeMatches() {
    _find.matches = [];
    const re = _buildPattern();
    if (!re) { updateFindCount(); return; }
    const text = getFullMarkdown();
    let m;
    while ((m = re.exec(text)) !== null) {
      _find.matches.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
      if (m.index === re.lastIndex) re.lastIndex++; // empty match guard
    }
    if (_find.matches.length > 0 && _find.current < 0) _find.current = 0;
    if (_find.current >= _find.matches.length) _find.current = _find.matches.length - 1;
    updateFindCount();
  }

  function updateFindCount() {
    if (!_find.count) return;
    const total = _find.matches.length;
    const cur = total === 0 ? 0 : _find.current + 1;
    _find.count.textContent = cur + '/' + total;
    const q = _find.input ? _find.input.value : '';
    const noMatch = total === 0 && q.length > 0;
    if (_find.input) _find.input.classList.toggle('no-match', noMatch);
    _find.count.classList.toggle('no-match', noMatch);
  }

  function findStep(delta) {
    if (_find.matches.length === 0) { recomputeMatches(); }
    if (_find.matches.length === 0) return;
    _find.current = ((_find.current + delta) % _find.matches.length + _find.matches.length) % _find.matches.length;
    updateFindCount();
    highlightAll();
    scrollToCurrentMatch();
  }

  function clearHighlights() {
    // HTML 側
    document.querySelectorAll('mark.search-highlight').forEach(m => {
      const parent = m.parentNode;
      if (!parent) return;
      while (m.firstChild) parent.insertBefore(m.firstChild, m);
      parent.removeChild(m);
      parent.normalize();
    });
    // SVG 側（tspan 分割）。元の <text> に保存しておいた原文を戻す。
    document.querySelectorAll('text[data-search-orig]').forEach(t => {
      const orig = t.getAttribute('data-search-orig');
      // 元の子ノード構造を保存していた場合は復元、無ければテキストだけ戻す
      const html = t.getAttribute('data-search-orig-html');
      if (html !== null) {
        // innerHTML 相当を SVG 名前空間で復元するのは難しいので、保存しておいた DocumentFragment を使う
        const cache = _svgOriginalCache.get(t);
        if (cache) {
          while (t.firstChild) t.removeChild(t.firstChild);
          cache.forEach(n => t.appendChild(n));
        } else if (orig !== null) {
          t.textContent = orig;
        }
      } else if (orig !== null) {
        t.textContent = orig;
      }
      t.removeAttribute('data-search-orig');
      t.removeAttribute('data-search-orig-html');
      t.classList.remove('svg-search-hit');
    });
    _svgOriginalCache = new WeakMap();
    // フォールバック（A 方式）クラスも解除
    document.querySelectorAll('.svg-search-hit-fallback').forEach(el => {
      el.classList.remove('svg-search-hit-fallback');
    });
  }

  let _svgOriginalCache = new WeakMap();

  function highlightAll() {
    clearHighlights();
    if (!_find.visible || _find.matches.length === 0) return;
    const re = _buildPattern();
    if (!re) return;

    const blocks = document.querySelectorAll('.block .block-content');
    blocks.forEach((blockEl, blockIdx) => {
      _highlightInElement(blockEl, re);
    });

    // Mark current（current/スクロールは HTML mark のみを基準にする。
    // SVG 内の強調は「視覚的なヒント」として表示するだけで、ヒット件数とは厳密に対応させない）
    const all = document.querySelectorAll('mark.search-highlight');
    if (all[_find.current]) all[_find.current].classList.add('current');
  }

  function _allHighlightElements() {
    return Array.from(document.querySelectorAll('mark.search-highlight, tspan.svg-search-highlight, .svg-search-hit-fallback'));
  }

  function _highlightInElement(root, re) {
    // HTML テキストノード収集
    const htmlTargets = [];
    // SVG テキスト要素収集（要素単位で扱う）
    const svgTextEls = new Set();

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        const p = n.parentElement;
        if (!p) return NodeFilter.FILTER_ACCEPT;
        if (p.closest('script,style,textarea')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let node;
    while ((node = walker.nextNode())) {
      const p = node.parentElement;
      if (p && (p.namespaceURI === 'http://www.w3.org/2000/svg' || p.closest('svg'))) {
        const textEl = p.closest('text');
        if (textEl) svgTextEls.add(textEl);
      } else {
        htmlTargets.push(node);
      }
    }

    // --- HTML 側: 従来通り <mark> でラップ ---
    for (const txt of htmlTargets) {
      const s = txt.nodeValue;
      if (!s) continue;
      re.lastIndex = 0;
      let m, last = 0;
      const frag = document.createDocumentFragment();
      let any = false;
      while ((m = re.exec(s)) !== null) {
        any = true;
        if (m.index > last) frag.appendChild(document.createTextNode(s.slice(last, m.index)));
        const mark = document.createElement('mark');
        mark.className = 'search-highlight';
        mark.textContent = m[0];
        frag.appendChild(mark);
        last = m.index + m[0].length;
        if (m.index === re.lastIndex) re.lastIndex++;
      }
      if (any) {
        if (last < s.length) frag.appendChild(document.createTextNode(s.slice(last)));
        txt.parentNode.replaceChild(frag, txt);
      }
    }

    // --- SVG 側: <text> の textContent を <tspan> で分割。失敗したら text 全体を強調(A方式) ---
    const SVG_NS = 'http://www.w3.org/2000/svg';
    for (const textEl of svgTextEls) {
      const original = textEl.textContent || '';
      re.lastIndex = 0;
      // ヒットがあるか確認
      const matches = [];
      let m;
      while ((m = re.exec(original)) !== null) {
        matches.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
        if (m.index === re.lastIndex) re.lastIndex++;
      }
      if (matches.length === 0) continue;

      // 元の子ノードをキャッシュ（復元用）
      const cache = [];
      for (const c of Array.from(textEl.childNodes)) cache.push(c.cloneNode(true));
      _svgOriginalCache.set(textEl, cache);
      textEl.setAttribute('data-search-orig', original);
      textEl.setAttribute('data-search-orig-html', '1');

      try {
        // 既存の子を削除して tspan で再構築
        while (textEl.firstChild) textEl.removeChild(textEl.firstChild);
        let pos = 0;
        for (const mt of matches) {
          if (mt.start > pos) {
            const ts = document.createElementNS(SVG_NS, 'tspan');
            ts.textContent = original.slice(pos, mt.start);
            textEl.appendChild(ts);
          }
          const hit = document.createElementNS(SVG_NS, 'tspan');
          hit.setAttribute('class', 'svg-search-highlight');
          hit.textContent = mt.text;
          textEl.appendChild(hit);
          pos = mt.end;
        }
        if (pos < original.length) {
          const ts = document.createElementNS(SVG_NS, 'tspan');
          ts.textContent = original.slice(pos);
          textEl.appendChild(ts);
        }
      } catch (e) {
        // フォールバック: 元に戻して text 全体を強調
        while (textEl.firstChild) textEl.removeChild(textEl.firstChild);
        cache.forEach(n => textEl.appendChild(n));
        textEl.classList.add('svg-search-hit-fallback');
      }
    }
  }

  function scrollToCurrentMatch() {
    const all = document.querySelectorAll('mark.search-highlight');
    const cur = all[_find.current];
    if (cur) cur.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function doReplace(all) {
    if (editingBlockIndex >= 0) {
      // Disallow replace while a block is being edited (would conflict with textarea state)
      finishEditing();
    }
    const re = _buildPattern();
    if (!re) return;
    const replacement = _find.replaceInput ? _find.replaceInput.value : '';
    const text = getFullMarkdown();
    let newText;
    if (all) {
      newText = text.replace(re, replacement);
    } else {
      // Replace only current match
      if (_find.matches.length === 0) return;
      const m = _find.matches[_find.current];
      newText = text.slice(0, m.start) + replacement + text.slice(m.end);
    }
    sendEdit(newText);
    handleDocumentUpdate(newText);
    // Recompute after re-render
    setTimeout(() => { recomputeMatches(); highlightAll(); scrollToCurrentMatch(); }, 50);
  }

  // Global Ctrl+F / Ctrl+H to open find bar (capture phase to win over VS Code/webview)
  document.addEventListener('keydown', (e) => {
    const isMod = e.ctrlKey || e.metaKey;
    if (!isMod) return;
    if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      e.stopPropagation();
      toggleFindBar(true);
    } else if (e.key === 'h' || e.key === 'H') {
      e.preventDefault();
      e.stopPropagation();
      toggleFindBar(true);
      if (_find.replaceInput) setTimeout(() => _find.replaceInput.focus(), 30);
    } else if (e.key === 'z' || e.key === 'Z') {
      // Ctrl+Z = undo, Ctrl+Shift+Z = redo. Skip when focus is in a text input/textarea
      // so the user's local typing-undo still works.
      const tag = (e.target && e.target.tagName) || '';
      const isTextField = tag === 'TEXTAREA' || tag === 'INPUT' ||
        (e.target && e.target.isContentEditable);
      if (isTextField) return;
      e.preventDefault();
      e.stopPropagation();
      requestUndoRedo(e.shiftKey ? 'redo' : 'undo');
    } else if (e.key === 'y' || e.key === 'Y') {
      const tag = (e.target && e.target.tagName) || '';
      const isTextField = tag === 'TEXTAREA' || tag === 'INPUT' ||
        (e.target && e.target.isContentEditable);
      if (isTextField) return;
      e.preventDefault();
      e.stopPropagation();
      requestUndoRedo('redo');
    }
  }, true);
})();

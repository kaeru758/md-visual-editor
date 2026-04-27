(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();

  /** @type {any[]} All marked tokens (including 'space' type) */
  let allTokens = [];
  /** Index in allTokens of the block being edited (-1 = none) */
  let editingBlockIndex = -1;
  /** Counter for unique mermaid element IDs */
  let mermaidCounter = 0;
  /** Flag to prevent blur-triggered finish when toolbar is clicked */
  let preventBlurFinish = false;
  /** Whether mermaid is available */
  let mermaidAvailable = false;

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
        const newContent = '\n\n' + template + '\n';
        let fullText;
        if (insertAfterIndex < 0) {
          fullText = newContent.trimStart() + '\n' + getFullMarkdown();
        } else {
          // Include any trailing space token after the target
          let splitAt = insertAfterIndex + 1;
          if (splitAt < allTokens.length && allTokens[splitAt].type === 'space') splitAt++;
          const before = allTokens.slice(0, splitAt).map(t => t.raw).join('');
          const after = allTokens.slice(splitAt).map(t => t.raw).join('');
          fullText = before + newContent + after;
        }
        sendEdit(fullText);
        handleDocumentUpdate(fullText);
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

  function showMermaidPicker() {
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
      showInsertPositionPicker((insertAfterIndex) => {
        const newContent = '\n\n' + dt.template + '\n';
        let fullText;
        if (insertAfterIndex < 0) {
          fullText = newContent.trimStart() + '\n' + getFullMarkdown();
        } else {
          let splitAt = insertAfterIndex + 1;
          if (splitAt < allTokens.length && allTokens[splitAt].type === 'space') splitAt++;
          const before = allTokens.slice(0, splitAt).map(t => t.raw).join('');
          const after = allTokens.slice(splitAt).map(t => t.raw).join('');
          fullText = before + newContent + after;
        }
        sendEdit(fullText);
        handleDocumentUpdate(fullText);
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
    const visibleTokens = [];
    allTokens.forEach((t, i) => { if (t.type !== 'space') visibleTokens.push({ token: t, index: i }); });

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

    const list = document.createElement('div');
    list.className = 'insert-pos-list';

    // "Insert at beginning" option
    const topItem = document.createElement('button');
    topItem.className = 'insert-pos-item insert-pos-top';
    topItem.innerHTML = '<span class="insert-pos-icon">⬆</span><span class="insert-pos-label">先頭に挿入</span>';
    topItem.addEventListener('click', () => { overlay.remove(); callback(-1); });
    list.appendChild(topItem);

    // Options for after each visible block
    for (const { token, index } of visibleTokens) {
      const item = document.createElement('button');
      item.className = 'insert-pos-item';
      let label = '';
      const raw = (token.raw || '').trim();
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
      item.addEventListener('click', () => { overlay.remove(); callback(index); });
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
      default: return null;
    }
  }

  // ─── Document Update ───
  function handleDocumentUpdate(markdownText) {
    // @ts-ignore
    allTokens = marked.lexer(markdownText);
    editingBlockIndex = -1;
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

    allTokens.forEach((token, index) => {
      if (token.type === 'space') return;

      const block = document.createElement('div');
      block.className = 'block';
      block.dataset.tokenIndex = String(index);
      block.tabIndex = 0;
      block.setAttribute('role', 'group');
      block.setAttribute('aria-label', 'ブロック (' + (token.type || 'text') + ')');

      renderBlockContent(block, token, index);

      block.addEventListener('dblclick', (e) => {
        if (e.target.tagName === 'A') return;
        if (e.target.closest('.mermaid-edit-overlay')) return;
        startEditing(index);
      });

      block.addEventListener('keydown', (e) => {
        if (e.target !== block) return; // only when block itself is focused
        if (e.key === 'Enter' || e.key === 'F2') {
          e.preventDefault();
          startEditing(index);
        }
      });

      editor.appendChild(block);
    });

    // Render mermaid diagrams after DOM is ready
    requestAnimationFrame(() => renderMermaidDiagrams());
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

    container.appendChild(contentDiv);
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
    const token = allTokens[tokenIndex];
    const blockEl = document.querySelector('[data-token-index="' + tokenIndex + '"]');
    if (!blockEl) return;

    if (token.type === 'code' && token.lang === 'mermaid') {
      startMermaidEditing(tokenIndex);
      return;
    }

    // @ts-ignore
    if (token.type === 'table' && window.TableVisualEditor) {
      startTableEditing(tokenIndex);
      return;
    }

    blockEl.classList.add('editing');

    // Remove trailing newline for nicer editing
    const rawText = token.raw.replace(/\n$/, '');
    // Snapshot original text for dirty-check on cancel
    const originalText = rawText;

    blockEl.innerHTML =
      '<div class="block-editor">' +
        '<textarea>' + escapeHtml(rawText) + '</textarea>' +
        '<div class="block-editor-hint">Escape / Ctrl+Enter: 編集完了　|　Ctrl+B: 太字　|　Ctrl+I: 斜体</div>' +
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
              finishEditing();
            },
            { okLabel: '破棄', cancelLabel: '編集を続ける', danger: true }
          );
        } else {
          finishEditing();
        }
      } else if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        finishEditing();
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

  function finishEditing() {
    if (editingBlockIndex < 0) return;

    // Clean up visual editor if active
    destroyVisualEditor();

    const tokenIndex = editingBlockIndex;
    const token = allTokens[tokenIndex];
    const blockEl = document.querySelector('[data-token-index="' + tokenIndex + '"]');

    if (!blockEl) {
      editingBlockIndex = -1;
      return;
    }

    const textarea = blockEl.querySelector('textarea');
    if (textarea) {
      let newRaw = textarea.value;
      if (!newRaw.endsWith('\n')) {
        newRaw += '\n';
      }
      token.raw = newRaw;
    }

    editingBlockIndex = -1;

    // Re-render the block as preview
    blockEl.classList.remove('editing');
    renderBlockContent(blockEl, token, tokenIndex);

    if (token.type === 'code' && token.lang === 'mermaid') {
      requestAnimationFrame(() => renderMermaidDiagrams());
    }

    sendEdit(getFullMarkdown());
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
      '日本語ラベルは Mermaid 仕様上エラーになることがあるため <b>ASCII 推奨</b> です。',
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

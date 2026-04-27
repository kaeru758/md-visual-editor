// ═══════════════════════════════════════════════════════════════════════════
//  Extra Diagram Editors — Form-based visual editors for Mermaid 11.x
//  Covers: state, pie, journey, gitGraph, requirement, C4, timeline,
//          sankey, xychart, block, zenuml, packet, architecture, kanban
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  // ─── Lightweight DOM helpers ───
  function _el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
  function _elText(tag, text, cls) { const e = _el(tag, cls); e.textContent = text; return e; }
  function _esc(t) { const d = document.createElement('div'); d.textContent = String(t == null ? '' : t); return d.innerHTML; }

  // ═══════════════════════════════════════════════════════════════════════════
  //  DiagramCommon — Step 1 cross-cutting infrastructure
  //  - onboarding banner (per-editor, dismissible, persisted)
  //  - keyboard helper (Delete / arrows / Esc on list panels)
  //  - tooltip helper (label + shortcut)
  // ═══════════════════════════════════════════════════════════════════════════
  const ONBOARD_KEY_PREFIX = 'mve.onboarding.dismissed.';
  function _isDismissed(key) {
    try { return localStorage.getItem(ONBOARD_KEY_PREFIX + key) === '1'; } catch (_e) { return false; }
  }
  function _dismiss(key) {
    try { localStorage.setItem(ONBOARD_KEY_PREFIX + key, '1'); } catch (_e) { /* */ }
  }

  /**
   * Mount an onboarding hint banner above `host`.  Returns the banner element
   * (or null when already dismissed).  The banner shows `title` plus a list of
   * bullet hints, with a "閉じる" button that hides it and a "次回も表示しない"
   * button that persists dismissal.
   */
  function mountOnboarding(host, key, title, hints) {
    if (!host || !key) return null;
    if (_isDismissed(key)) return null;
    const banner = _el('div', 'dve-onboarding');
    const head = _el('div', 'dve-onboarding-head');
    head.appendChild(_elText('span', '💡 ' + (title || 'ヒント'), 'dve-onboarding-title'));
    const closeBtn = _el('button', 'dve-onboarding-close');
    closeBtn.textContent = '×';
    closeBtn.title = 'このヒントを閉じる';
    closeBtn.addEventListener('click', () => banner.remove());
    head.appendChild(closeBtn);
    banner.appendChild(head);
    if (hints && hints.length) {
      const ul = _el('ul', 'dve-onboarding-list');
      for (const h of hints) {
        const li = _el('li');
        li.innerHTML = h;
        ul.appendChild(li);
      }
      banner.appendChild(ul);
    }
    const foot = _el('div', 'dve-onboarding-foot');
    const dontShow = _el('button', 'dve-onboarding-dontshow');
    dontShow.textContent = '次回から表示しない';
    dontShow.addEventListener('click', () => { _dismiss(key); banner.remove(); });
    foot.appendChild(dontShow);
    banner.appendChild(foot);
    host.insertBefore(banner, host.firstChild);
    return banner;
  }

  /**
   * Attach a unified keyboard handler to `root`.
   * `handlers` keys (all optional):
   *   onDelete(target)   — Delete / Backspace on a focused list item
   *   onUndo() / onRedo()
   *   onEscape()
   *   onMove(target, dir) — ArrowUp/Down on a focused list item, dir = -1 | +1
   * Events originating in <input>/<textarea>/<select>/contenteditable are
   * ignored so users can type freely.
   */
  function attachKeyHandlers(root, handlers) {
    if (!root || !handlers) return;
    root.addEventListener('keydown', (e) => {
      const t = e.target;
      const tag = t && t.tagName;
      const editable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
        || (t && t.isContentEditable);
      if (e.key === 'Escape' && handlers.onEscape) {
        handlers.onEscape(t); return;
      }
      if (editable) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && handlers.onDelete) {
        const item = t && t.closest && t.closest('.dve-list-item, .mve-list-item');
        if (item) { e.preventDefault(); handlers.onDelete(item); }
        return;
      }
      if (e.key === 'ArrowDown' && handlers.onMove) {
        const item = t && t.closest && t.closest('.dve-list-item, .mve-list-item');
        if (item) { e.preventDefault(); handlers.onMove(item, 1); }
        return;
      }
      if (e.key === 'ArrowUp' && handlers.onMove) {
        const item = t && t.closest && t.closest('.dve-list-item, .mve-list-item');
        if (item) { e.preventDefault(); handlers.onMove(item, -1); }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey && handlers.onUndo) {
        e.preventDefault(); handlers.onUndo(); return;
      }
      if ((e.ctrlKey || e.metaKey) && ((e.key === 'y' || e.key === 'Y') || ((e.key === 'z' || e.key === 'Z') && e.shiftKey)) && handlers.onRedo) {
        e.preventDefault(); handlers.onRedo(); return;
      }
    });
  }

  /** Compose a tooltip string with optional keyboard shortcut hint. */
  function tooltip(btn, label, shortcut) {
    if (!btn) return;
    btn.title = shortcut ? (label + ' (' + shortcut + ')') : label;
    if (!btn.getAttribute('aria-label')) btn.setAttribute('aria-label', label);
  }

  /**
   * Make `rows` (an array of row HTMLElements, in display order) sortable
   * by drag-and-drop. `items` is the underlying data array (mutated in place
   * via splice). After a successful reorder, `onChange()` is invoked so the
   * caller can re-render and emit changes.
   */
  function enableDragSort(rows, items, onChange) {
    if (!rows || !rows.length || !items || items.length !== rows.length) return;
    rows.forEach((row, idx) => {
      row.setAttribute('draggable', 'true');
      row.classList.add('dve-draggable');
      row.dataset.dragIdx = String(idx);
      row.addEventListener('dragstart', (e) => {
        row.classList.add('dve-dragging');
        try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(idx)); } catch (_e) { /* */ }
      });
      row.addEventListener('dragend', () => {
        row.classList.remove('dve-dragging');
        rows.forEach(r => r.classList.remove('dve-drag-over'));
      });
      row.addEventListener('dragover', (e) => {
        e.preventDefault();
        try { e.dataTransfer.dropEffect = 'move'; } catch (_e) { /* */ }
        row.classList.add('dve-drag-over');
      });
      row.addEventListener('dragleave', () => row.classList.remove('dve-drag-over'));
      row.addEventListener('drop', (e) => {
        e.preventDefault();
        row.classList.remove('dve-drag-over');
        let from = -1;
        try { from = parseInt(e.dataTransfer.getData('text/plain'), 10); } catch (_e) { /* */ }
        const to = parseInt(row.dataset.dragIdx, 10);
        if (isNaN(from) || isNaN(to) || from === to || from < 0 || to < 0) return;
        const [moved] = items.splice(from, 1);
        items.splice(to, 0, moved);
        if (onChange) onChange(from, to);
      });
    });
  }

  /**
   * Show a lightweight right-click context menu at (clientX, clientY).
   * `items` is an array of { label, onClick, danger?, disabled? } or 'separator'.
   */
  function showContextMenu(clientX, clientY, items) {
    document.querySelectorAll('.dve-ctxmenu').forEach(m => m.remove());
    const menu = document.createElement('div');
    menu.className = 'dve-ctxmenu';
    menu.style.position = 'fixed';
    menu.style.left = clientX + 'px';
    menu.style.top = clientY + 'px';
    menu.style.zIndex = '99999';
    for (const it of items) {
      if (it === 'separator' || it === '-') {
        const sep = document.createElement('div');
        sep.className = 'dve-ctxmenu-sep';
        menu.appendChild(sep);
        continue;
      }
      const row = document.createElement('div');
      row.className = 'dve-ctxmenu-item' + (it.danger ? ' danger' : '') + (it.disabled ? ' disabled' : '');
      row.textContent = it.label;
      if (!it.disabled) {
        row.addEventListener('click', () => {
          menu.remove();
          try { it.onClick && it.onClick(); } catch (_e) { /* */ }
        });
      }
      menu.appendChild(row);
    }
    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 4) + 'px';
    if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 4) + 'px';
    const dismiss = () => { menu.remove(); cleanup(); };
    const onKey = (e) => { if (e.key === 'Escape') dismiss(); };
    const onClickAway = (e) => { if (!menu.contains(e.target)) dismiss(); };
    function cleanup() {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onClickAway, true);
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss, true);
    }
    setTimeout(() => {
      document.addEventListener('keydown', onKey, true);
      document.addEventListener('mousedown', onClickAway, true);
      window.addEventListener('scroll', dismiss, true);
      window.addEventListener('resize', dismiss, true);
    }, 0);
    return menu;
  }

  window.DiagramCommon = { mountOnboarding, attachKeyHandlers, tooltip, enableDragSort, showContextMenu };


  // ─── Dialog (clone of diagram-editors._showDialog so this file is standalone) ───
  function _showDialog(container, config) {
    return new Promise((resolve) => {
      const existing = container.querySelector('.ve-dialog-overlay');
      if (existing) existing.remove();
      const overlay = _el('div', 've-dialog-overlay');
      const dialog = _el('div', 've-dialog');
      if (config.title) dialog.appendChild(_elText('div', config.title, 've-dialog-title'));
      const form = _el('div', 've-dialog-form');
      const inputs = {};
      for (const f of (config.fields || [])) {
        const row = _el('div', 've-dialog-field');
        if (f.label) row.appendChild(_elText('label', f.label, 've-dialog-label'));
        let input;
        if (f.type === 'select') {
          input = _el('select', 've-dialog-input');
          for (const opt of (f.options || [])) {
            const o = document.createElement('option');
            o.value = opt.value;
            o.textContent = opt.label;
            if (String(opt.value) === String(f.value)) o.selected = true;
            input.appendChild(o);
          }
        } else if (f.type === 'textarea') {
          input = _el('textarea', 've-dialog-input');
          input.value = f.value || '';
          input.rows = f.rows || 4;
        } else {
          input = _el('input', 've-dialog-input');
          input.type = f.type || 'text';
          input.value = f.value !== undefined ? String(f.value) : '';
          if (f.placeholder) input.placeholder = f.placeholder;
          if (f.step) input.step = f.step;
          if (f.min !== undefined) input.min = String(f.min);
          if (f.max !== undefined) input.max = String(f.max);
        }
        inputs[f.key] = input;
        row.appendChild(input);
        form.appendChild(row);
      }
      dialog.appendChild(form);
      const actions = _el('div', 've-dialog-actions');
      const cancel = _el('button', 've-dialog-cancel');
      cancel.textContent = config.cancelLabel || 'キャンセル';
      cancel.addEventListener('click', () => { overlay.remove(); resolve(null); });
      actions.appendChild(cancel);
      if (config.deleteLabel) {
        const del = _el('button', 've-dialog-cancel');
        del.textContent = config.deleteLabel;
        del.style.color = '#f44';
        del.style.marginRight = 'auto';
        del.addEventListener('click', () => { overlay.remove(); resolve({ __delete: true }); });
        actions.appendChild(del);
      }
      const ok = _el('button', 've-dialog-ok');
      ok.textContent = config.okLabel || 'OK';
      ok.addEventListener('click', () => {
        const r = {};
        for (const f of (config.fields || [])) r[f.key] = inputs[f.key].value;
        overlay.remove();
        resolve(r);
      });
      actions.appendChild(ok);
      dialog.appendChild(actions);
      overlay.appendChild(dialog);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) { overlay.remove(); resolve(null); } });
      dialog.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          const r = {};
          for (const f of (config.fields || [])) r[f.key] = inputs[f.key].value;
          overlay.remove();
          resolve(r);
        }
        if (e.key === 'Escape') { e.preventDefault(); overlay.remove(); resolve(null); }
      });
      container.appendChild(overlay);
      const fi = dialog.querySelector('input, select, textarea');
      if (fi) { fi.focus(); if (fi.select) fi.select(); }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  GenericFormDiagramEditor — base class
  //
  //  Subclasses implement:
  //    _parse(code)       → populate this.state
  //    _generate()        → string  (mermaid code)
  //    _sections()        → [{title, items[], onAdd, renderItem(item, i, host)}]
  //    static template()  → default mermaid code
  //
  //  Provided:
  //    - toolbar with Add buttons (per section)
  //    - list panel + live SVG preview side by side
  //    - debounced re-render on every state change
  //    - Code mode toggle (editable textarea fallback)
  // ═══════════════════════════════════════════════════════════════════════════
  class GenericFormDiagramEditor {
    constructor(container, code, onChange) {
      this.container = container;
      this.onChange = onChange;
      this.state = {};
      this._codeMode = false;
      this._renderToken = 0;
      // Subclasses may opt in to opening the table editor by default
      // (e.g. Pie / XY chart) via `static defaultTableMode = true`.
      if (this.constructor.defaultTableMode) this._tableMode = true;
      try { this._parse(code); } catch (_e) { /* ignore */ }
      this._buildUI();
      this._render();
    }

    destroy() {
      this.container.innerHTML = '';
    }

    getCode() { return this._generate(); }

    // ─── To override ───
    _parse(_code) { /* override */ }
    _generate() { return ''; }
    _sections() { return []; }

    // ─── Internals ───
    _emit() {
      const code = this._generate();
      try { if (typeof this.onChange === 'function') this.onChange(code); } catch (_e) { /* */ }
      this._renderPreview(code);
    }

    _buildUI() {
      this.container.innerHTML = '';
      this.container.classList.add('dve-root');
      this.container.tabIndex = 0; // allow keyboard focus

      // Onboarding banner (per-class key, dismissible)
      const ctor = this.constructor;
      const key = ctor.onboardingKey || ctor.name || 'generic';
      const ob = ctor.onboarding || GenericFormDiagramEditor._defaultOnboarding;
      if (ob) mountOnboarding(this.container, key, ob.title, ob.hints);

      this._toolbar = _el('div', 'dve-toolbar');
      this.container.appendChild(this._toolbar);

      this._body = _el('div', 'dve-body');
      this._listPanel = _el('div', 'dve-list-panel');
      this._svgArea = _el('div', 'dve-svg-area');
      this._body.appendChild(this._listPanel);
      this._body.appendChild(this._svgArea);
      this.container.appendChild(this._body);

      // Unified keyboard shortcuts
      attachKeyHandlers(this.container, {
        onDelete: (item) => {
          const btn = item.querySelector('.dve-icon-btn[title="削除"]');
          if (btn) btn.click();
        },
        onMove: (item, dir) => {
          const items = Array.from(this._listPanel.querySelectorAll('.dve-list-item'));
          const idx = items.indexOf(item);
          const next = items[idx + dir];
          if (next) next.focus();
        },
      });
    }

    _render() {
      // Toolbar
      this._toolbar.innerHTML = '';
      for (const s of this._sections()) {
        if (s.onAdd) {
          const btn = _el('button', 'mve-tool-btn');
          btn.textContent = '➕ ' + (s.addLabel || s.title);
          tooltip(btn, (s.addLabel || s.title) + ' を追加');
          btn.addEventListener('click', () => Promise.resolve(s.onAdd()).then(() => this._renderListAndPreview()));
          this._toolbar.appendChild(btn);
        }
      }
      const codeBtn = _el('button', 'mve-tool-btn');
      codeBtn.textContent = this._codeMode ? '📊 フォームに戻る' : '⟨/⟩ コード編集';
      tooltip(codeBtn, this._codeMode ? 'GUI フォーム編集に戻る' : 'Mermaid コードを直接編集');
      codeBtn.addEventListener('click', () => {
        this._codeMode = !this._codeMode;
        if (this._codeMode === false) {
          // Re-parse from textarea
          const ta = this._listPanel.querySelector('.dve-code-ta');
          if (ta) {
            try { this._parse(ta.value); } catch (_e) { /* */ }
          }
        }
        this._render();
      });
      this._toolbar.appendChild(codeBtn);

      // Table mode toggle (only shown when subclass defines _renderTable)
      if (typeof this._renderTable === 'function') {
        const tableBtn = _el('button', 'mve-tool-btn');
        tableBtn.textContent = this._tableMode ? '📋 リスト表示' : '📊 表で編集';
        tooltip(tableBtn, this._tableMode ? 'リスト表示に戻る' : '表形式で編集');
        if (this._tableMode) tableBtn.classList.add('mve-active');
        tableBtn.addEventListener('click', () => {
          this._tableMode = !this._tableMode;
          if (this._tableMode) this._codeMode = false;
          this._render();
        });
        this._toolbar.appendChild(tableBtn);
      }

      // Add click-to-connect button if subclass opted in
      this._maybeAddConnectButton();

      this._renderListAndPreview();
    }

    _renderListAndPreview() {
      this._listPanel.innerHTML = '';
      if (this._codeMode) {
        const ta = _el('textarea', 'dve-code-ta');
        ta.value = this._generate();
        ta.style.width = '100%';
        ta.style.height = '100%';
        ta.style.minHeight = '300px';
        ta.style.fontFamily = 'monospace';
        let t;
        ta.addEventListener('input', () => {
          clearTimeout(t);
          t = setTimeout(() => {
            try { this._parse(ta.value); } catch (_e) { /* */ }
            try { this.onChange && this.onChange(this._generate()); } catch (_e) { /* */ }
            this._renderPreview(ta.value);
          }, 350);
        });
        this._listPanel.appendChild(ta);
      } else if (this._tableMode && typeof this._renderTable === 'function') {
        try { this._renderTable(this._listPanel); } catch (e) {
          this._listPanel.appendChild(_elText('div', 'テーブル表示エラー: ' + e, 'mermaid-error'));
        }
      } else {
        for (const s of this._sections()) {
          const sec = _el('div', 'dve-list-section');
          const head = _el('div', 'dve-list-section-title');
          head.textContent = s.title;
          sec.appendChild(head);
          if (!s.items || s.items.length === 0) {
            const empty = _elText('div', '（なし）', 'dve-hint');
            empty.style.padding = '4px 8px';
            sec.appendChild(empty);
          } else {
            const builtRows = [];
            s.items.forEach((it, i) => {
              const row = _el('div', 'dve-list-item');
              row.tabIndex = 0;
              // Append BEFORE renderItem so subclasses can use host.parentElement
              // to inject sub-rows (Journey/Timeline/Kanban).
              sec.appendChild(row);
              try { s.renderItem(it, i, row); } catch (e) {
                row.textContent = String(e);
              }
              builtRows.push(row);

              // Right-click context menu on the row
              row.addEventListener('contextmenu', (ev) => {
                ev.preventDefault();
                const editBtn = row.querySelector('.dve-icon-btn[title^="編集"]');
                const delBtn = row.querySelector('.dve-icon-btn[title^="削除"]');
                const items = [];
                if (editBtn) items.push({ label: '✎ 編集', onClick: () => editBtn.click() });
                items.push({ label: '↑ 上に移動', disabled: i === 0, onClick: () => {
                  const [m] = s.items.splice(i, 1); s.items.splice(i - 1, 0, m); this._renderListAndPreview();
                }});
                items.push({ label: '↓ 下に移動', disabled: i === s.items.length - 1, onClick: () => {
                  const [m] = s.items.splice(i, 1); s.items.splice(i + 1, 0, m); this._renderListAndPreview();
                }});
                if (delBtn) {
                  items.push('separator');
                  items.push({ label: '🗑 削除', danger: true, onClick: () => delBtn.click() });
                }
                window.DiagramCommon.showContextMenu(ev.clientX, ev.clientY, items);
              });
            });
            // Enable drag-to-reorder on the rows of this section
            window.DiagramCommon.enableDragSort(builtRows, s.items, () => this._renderListAndPreview());
          }
          this._listPanel.appendChild(sec);
        }
      }
      this._emit();
    }

    _renderPreview(code) {
      if (!this._svgArea) return;
      const token = ++this._renderToken;
      this._svgArea.innerHTML = '<div class="loading-indicator">プレビュー生成中...</div>';
      if (typeof window.mermaid === 'undefined') {
        this._svgArea.innerHTML = '<div class="mermaid-error">Mermaid が読み込まれていません</div>';
        return;
      }
      const id = 'gfde-prev-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
      try {
        Promise.resolve(window.mermaid.render(id, code)).then((res) => {
          if (token !== this._renderToken) return;
          const svg = (res && res.svg) || '';
          this._svgArea.innerHTML = svg;
          // Attach click-to-connect handlers after render if enabled
          this._maybeAttachSvgConnect();
        }).catch((err) => {
          if (token !== this._renderToken) return;
          this._svgArea.innerHTML = '<div class="mermaid-error">プレビューエラー:\n' + _esc(err.message || err) + '</div>';
        });
      } catch (err) {
        this._svgArea.innerHTML = '<div class="mermaid-error">プレビューエラー:\n' + _esc(err.message || err) + '</div>';
      }
    }

    // ─── Click-to-connect mixin ──────────────────────────────────────────
    // Subclasses may override `_connectOpts()` to return:
    //   { label, getNodes(): [{id,label}], onConnect(fromId, toId, event) }
    // The base class then:
    //   - adds a "🔗 接続" toggle button to the toolbar
    //   - shows an inline status bar above the body while active
    //   - on each preview render, attaches SVG handlers so clicking a node
    //     in the diagram picks From → To and invokes onConnect().
    _connectOpts() { return null; }

    _maybeAddConnectButton() {
      const opts = this._connectOpts();
      if (!opts || !this._toolbar) return;
      // Insert before the "コード編集" / table buttons by appending — order is fine
      if (this._connectBtn && this._toolbar.contains(this._connectBtn)) return;
      this._connectMode = !!this._connectMode;
      this._connectFrom = this._connectFrom || null;
      this._connectBtn = _el('button', 'mve-tool-btn');
      this._connectBtn.textContent = '🔗 ' + (opts.label || '接続');
      this._connectBtn.title = 'クリックで接続モード ON/OFF: 図の上で From → To を順にクリック';
      this._connectBtn.addEventListener('click', () => {
        this._connectMode = !this._connectMode;
        this._connectFrom = null;
        this._refreshConnectUI();
        this._maybeAttachSvgConnect();
      });
      this._toolbar.appendChild(this._connectBtn);
      // Status bar (hidden by default)
      if (!this._connectStatusBar) {
        this._connectStatusBar = _el('div', 'dve-status');
        this._connectStatusBar.style.display = 'none';
        if (this._body && this._body.parentNode === this.container) {
          this.container.insertBefore(this._connectStatusBar, this._body);
        } else {
          this.container.appendChild(this._connectStatusBar);
        }
      }
      this._refreshConnectUI();
    }

    _refreshConnectUI() {
      if (this._connectBtn) {
        this._connectBtn.classList.toggle('mve-active', !!this._connectMode);
      }
      if (this._connectStatusBar) {
        if (this._connectMode) {
          this._connectStatusBar.style.display = '';
          this._connectStatusBar.textContent = this._connectFrom
            ? '🔗 接続モード: 「' + this._connectFrom + '」→ 接続先のノードをクリック (Esc で解除)'
            : '🔗 接続モード: 図上で接続元のノードをクリック (Esc で解除)';
        } else {
          this._connectStatusBar.style.display = 'none';
          this._connectStatusBar.textContent = '';
        }
      }
    }

    _maybeAttachSvgConnect() {
      const opts = this._connectOpts();
      if (!opts || !this._svgArea) return;
      const svgEl = this._svgArea.querySelector('svg');
      if (!svgEl) return;
      svgEl.style.cursor = this._connectMode ? 'crosshair' : '';
      const nodes = opts.getNodes();
      // Build node id → containing <g> set, by matching descendant text content
      const nodeGroups = new Map();
      svgEl.querySelectorAll('g').forEach(g => {
        // Gather text content from this group (immediate + nested texts + <title>)
        const texts = g.querySelectorAll('text, foreignObject, title');
        for (const t of texts) {
          const txt = (t.textContent || '').trim();
          if (!txt) continue;
          const found = nodes.find(n => n.id === txt || n.label === txt);
          if (found) {
            if (!nodeGroups.has(found.id)) nodeGroups.set(found.id, new Set());
            nodeGroups.get(found.id).add(g);
            break;
          }
        }
      });
      // Restrict each node to the innermost matching <g> only.
      // Without this, ancestor wrappers (which contain ALL nodes) would also
      // be highlighted, making the entire diagram glow.
      const allMatched = [];
      nodeGroups.forEach(set => set.forEach(g => allMatched.push(g)));
      nodeGroups.forEach((groupSet) => {
        const arr = Array.from(groupSet);
        const innermost = arr.filter(g => !allMatched.some(o => o !== g && g.contains(o)));
        groupSet.clear();
        innermost.forEach(g => groupSet.add(g));
      });
      nodeGroups.forEach((groupSet, nodeId) => {
        groupSet.forEach(g => {
          g.style.cursor = this._connectMode ? 'crosshair' : '';
          g.querySelectorAll('rect, polygon, path, circle, ellipse').forEach(shape => {
            shape.style.pointerEvents = 'all';
          });
          if (g.dataset.dveConnBound) {
            // Refresh highlight only
            g.style.filter = (this._connectMode && this._connectFrom === nodeId)
              ? 'drop-shadow(0 0 6px #00cc66)' : '';
            return;
          }
          g.dataset.dveConnBound = '1';
          g.addEventListener('click', (e) => {
            if (!this._connectMode) return;
            e.stopPropagation();
            this._handleSvgConnect(nodeId, e);
          });
          g.addEventListener('mouseenter', () => {
            if (this._connectMode) g.style.filter = 'brightness(1.3) drop-shadow(0 0 6px #007fd4)';
          });
          g.addEventListener('mouseleave', () => {
            g.style.filter = (this._connectMode && this._connectFrom === nodeId)
              ? 'drop-shadow(0 0 6px #00cc66)' : '';
          });
          if (this._connectMode && this._connectFrom === nodeId) {
            g.style.filter = 'drop-shadow(0 0 6px #00cc66)';
          }
        });
      });
      // Esc to cancel
      if (!this._connectEscBound) {
        this._connectEscBound = true;
        this.container.addEventListener('keydown', (e) => {
          if (e.key === 'Escape' && this._connectMode) {
            this._connectMode = false;
            this._connectFrom = null;
            this._refreshConnectUI();
            this._maybeAttachSvgConnect();
          }
        });
      }
    }

    async _handleSvgConnect(nodeId, event) {
      const opts = this._connectOpts();
      if (!opts) return;
      if (!this._connectFrom) {
        this._connectFrom = nodeId;
        this._refreshConnectUI();
        this._maybeAttachSvgConnect();
        return;
      }
      if (this._connectFrom === nodeId) {
        // Cancel selection
        this._connectFrom = null;
        this._refreshConnectUI();
        this._maybeAttachSvgConnect();
        return;
      }
      const fromId = this._connectFrom;
      this._connectFrom = null;
      this._refreshConnectUI();
      try {
        await opts.onConnect(fromId, nodeId, event);
      } catch (_e) { /* ignore */ }
      this._renderListAndPreview();
    }

    // ─── Helpers for subclasses ───
    _itemRow(host, label, onEdit, onDelete) {
      const lbl = _elText('span', label, 'dve-list-item-label');
      lbl.style.flex = '1';
      lbl.style.overflow = 'hidden';
      lbl.style.textOverflow = 'ellipsis';
      lbl.style.whiteSpace = 'nowrap';
      host.appendChild(lbl);
      if (onEdit) {
        const e = _el('button', 'dve-icon-btn');
        e.textContent = '✎';
        tooltip(e, '編集', 'Enter');
        e.addEventListener('click', () => Promise.resolve(onEdit()).then(() => this._renderListAndPreview()));
        host.appendChild(e);
      }
      if (onDelete) {
        const d = _el('button', 'dve-icon-btn');
        d.textContent = '🗑';
        tooltip(d, '削除', 'Delete');
        d.addEventListener('click', () => Promise.resolve(onDelete()).then(() => this._renderListAndPreview()));
        host.appendChild(d);
      }
    }
  }

  // Default onboarding (used when a subclass does not override `onboarding`).
  GenericFormDiagramEditor._defaultOnboarding = {
    title: '使い方のヒント',
    hints: [
      '上部の <b>➕ ボタン</b> で要素を追加できます。',
      'リスト項目の <b>✎</b> で編集、<b>🗑</b> または <kbd>Delete</kbd> キーで削除。',
      '<b>⟨/⟩ コード編集</b> ボタンで Mermaid コードを直接編集できます。',
      '右側のプレビューは入力に合わせて自動更新されます。',
    ],
  };

  // ═══════════════════════════════════════════════════════════════════════════
  //  STATE DIAGRAM EDITOR
  // ═══════════════════════════════════════════════════════════════════════════
  class StateDiagramEditor extends GenericFormDiagramEditor {
    static template() {
      return 'stateDiagram-v2\n    [*] --> Idle\n    Idle --> Active : start\n    Active --> Idle : stop\n    Active --> [*]';
    }
    _parse(code) {
      const lines = code.split('\n').map(l => l.trim()).filter(Boolean);
      const states = new Set();
      const transitions = [];
      const directives = [];
      const isV2 = /^stateDiagram(?:-v2)?\b/.test(lines[0] || '');
      this.state.v2 = (lines[0] || '').includes('-v2');
      for (let i = 1; i < lines.length; i++) {
        const ln = lines[i];
        if (ln.startsWith('%%') || ln === '') continue;
        const m = ln.match(/^(\[\*\]|\w+)\s*-->\s*(\[\*\]|\w+)\s*(?::\s*(.+))?$/);
        if (m) {
          if (m[1] !== '[*]') states.add(m[1]);
          if (m[2] !== '[*]') states.add(m[2]);
          transitions.push({ from: m[1], to: m[2], label: (m[3] || '').trim() });
        } else if (/^state\s+/.test(ln)) {
          const sm = ln.match(/^state\s+"?([^"{]+?)"?\s*(?:as\s+(\w+))?\s*(\{)?$/);
          if (sm) states.add(sm[2] || sm[1]);
          else directives.push(ln);
        } else if (/^[\w]+\s*:\s*/.test(ln)) {
          const dm = ln.match(/^(\w+)\s*:\s*(.+)$/);
          if (dm) { states.add(dm[1]); }
        } else if (ln !== '{' && ln !== '}') {
          if (/^\w+$/.test(ln)) states.add(ln);
        }
      }
      this.state.states = Array.from(states);
      this.state.transitions = transitions;
      if (!isV2) this.state.v2 = true;
    }
    _generate() {
      const lines = [this.state.v2 ? 'stateDiagram-v2' : 'stateDiagram'];
      for (const s of (this.state.states || [])) lines.push('    ' + s);
      for (const t of (this.state.transitions || [])) {
        lines.push('    ' + t.from + ' --> ' + t.to + (t.label ? ' : ' + t.label : ''));
      }
      return lines.join('\n');
    }
    _sections() {
      const self = this;
      return [
        {
          title: '状態 (' + (this.state.states || []).length + ')',
          addLabel: '状態追加',
          items: this.state.states || [],
          onAdd: async () => {
            const r = await _showDialog(self.container, {
              title: '状態追加',
              fields: [{ key: 'name', label: '状態名 (英数字のみ)', value: '' }]
            });
            if (!r || !r.name) return;
            const name = r.name.trim().replace(/\s+/g, '_');
            if (name && !self.state.states.includes(name)) self.state.states.push(name);
          },
          renderItem: (st, i, host) => {
            self._itemRow(host, st,
              async () => {
                const r = await _showDialog(self.container, {
                  title: '状態編集',
                  fields: [{ key: 'name', label: '状態名', value: st }]
                });
                if (!r || !r.name) return;
                const newName = r.name.trim().replace(/\s+/g, '_');
                self.state.states[i] = newName;
                self.state.transitions.forEach(t => {
                  if (t.from === st) t.from = newName;
                  if (t.to === st) t.to = newName;
                });
              },
              async () => {
                self.state.states.splice(i, 1);
                self.state.transitions = self.state.transitions.filter(t => t.from !== st && t.to !== st);
              }
            );
          }
        },
        {
          title: '遷移 (' + (this.state.transitions || []).length + ')',
          addLabel: '遷移追加',
          items: this.state.transitions || [],
          onAdd: async () => {
            const opts = [{ value: '[*]', label: '[*] (開始/終了)' }, ...self.state.states.map(s => ({ value: s, label: s }))];
            const r = await _showDialog(self.container, {
              title: '遷移追加',
              fields: [
                { key: 'from', label: 'From', type: 'select', options: opts, value: opts[0].value },
                { key: 'to', label: 'To', type: 'select', options: opts, value: opts[opts.length - 1].value },
                { key: 'label', label: 'ラベル (任意)', value: '' }
              ]
            });
            if (!r) return;
            self.state.transitions.push({ from: r.from, to: r.to, label: r.label || '' });
          },
          renderItem: (t, i, host) => {
            const lbl = t.from + ' → ' + t.to + (t.label ? ' : ' + t.label : '');
            self._itemRow(host, lbl,
              async () => {
                const opts = [{ value: '[*]', label: '[*]' }, ...self.state.states.map(s => ({ value: s, label: s }))];
                const r = await _showDialog(self.container, {
                  title: '遷移編集',
                  fields: [
                    { key: 'from', label: 'From', type: 'select', options: opts, value: t.from },
                    { key: 'to', label: 'To', type: 'select', options: opts, value: t.to },
                    { key: 'label', label: 'ラベル', value: t.label || '' }
                  ]
                });
                if (!r) return;
                Object.assign(t, { from: r.from, to: r.to, label: r.label || '' });
              },
              async () => { self.state.transitions.splice(i, 1); }
            );
          }
        }
      ];
    }

    // Click-to-connect: clicking states in the SVG creates a transition.
    _connectOpts() {
      const self = this;
      return {
        label: '遷移追加',
        getNodes() {
          return (self.state.states || []).map(s => ({ id: s, label: s }));
        },
        async onConnect(fromId, toId) {
          const r = await _showDialog(self.container, {
            title: fromId + ' → ' + toId + ' の遷移',
            fields: [{ key: 'label', label: 'ラベル (任意)', value: '' }]
          });
          if (r === null) return;
          self.state.transitions.push({ from: fromId, to: toId, label: (r && r.label) || '' });
        }
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  PIE CHART EDITOR
  // ═══════════════════════════════════════════════════════════════════════════
  class PieChartEditor extends GenericFormDiagramEditor {
    static template() {
      return 'pie title 構成比\n    "項目A" : 40\n    "項目B" : 35\n    "項目C" : 25';
    }    _parse(code) {
      const lines = code.split('\n').map(l => l.trim());
      this.state.title = '';
      this.state.showData = /^pie\s+showData\b/i.test(lines[0] || '');
      const tm = (lines[0] || '').match(/title\s+(.+)$/);
      if (tm) this.state.title = tm[1].trim();
      this.state.slices = [];
      for (let i = 1; i < lines.length; i++) {
        const m = lines[i].match(/^"([^"]*)"\s*:\s*([\d.]+)$/);
        if (m) this.state.slices.push({ label: m[1], value: parseFloat(m[2]) });
      }
    }
    _generate() {
      const head = 'pie' + (this.state.showData ? ' showData' : '') + (this.state.title ? ' title ' + this.state.title : '');
      const body = (this.state.slices || []).map(s => '    "' + (s.label || '').replace(/"/g, '') + '" : ' + (s.value || 0)).join('\n');
      return head + (body ? '\n' + body : '');
    }
    _sections() {
      const self = this;
      return [
        {
          title: '設定',
          items: [
            { kind: 'title', value: this.state.title || '' },
            { kind: 'showData', value: this.state.showData }
          ],
          renderItem: (it, i, host) => {
            if (it.kind === 'title') {
              self._itemRow(host, 'タイトル: ' + (it.value || '(なし)'), async () => {
                const r = await _showDialog(self.container, { title: 'タイトル編集', fields: [{ key: 'title', label: 'タイトル', value: it.value }] });
                if (!r) return;
                self.state.title = r.title || '';
              });
            } else {
              self._itemRow(host, 'showData: ' + (it.value ? 'ON' : 'OFF'), async () => {
                self.state.showData = !self.state.showData;
              });
            }
          }
        },
        {
          title: 'スライス (' + (this.state.slices || []).length + ')',
          addLabel: 'スライス追加',
          items: this.state.slices || [],
          onAdd: async () => {
            const r = await _showDialog(self.container, {
              title: 'スライス追加',
              fields: [
                { key: 'label', label: 'ラベル', value: '新しい項目' },
                { key: 'value', label: '値', type: 'number', value: '10' }
              ]
            });
            if (!r) return;
            self.state.slices.push({ label: r.label, value: parseFloat(r.value) || 0 });
          },
          renderItem: (s, i, host) => {
            self._itemRow(host, s.label + ' : ' + s.value,
              async () => {
                const r = await _showDialog(self.container, {
                  title: 'スライス編集',
                  fields: [
                    { key: 'label', label: 'ラベル', value: s.label },
                    { key: 'value', label: '値', type: 'number', value: String(s.value) }
                  ]
                });
                if (!r) return;
                s.label = r.label;
                s.value = parseFloat(r.value) || 0;
              },
              async () => { self.state.slices.splice(i, 1); }
            );
          }
        }
      ];
    }

    // ─── Table edit mode (label × value) ───
    _renderTable(host) {
      const self = this;
      const wrap = _el('div', 'dve-table-wrap');
      const tbl = _el('table', 'dve-edit-table');
      const thead = _el('thead');
      const trh = _el('tr');
      ['ラベル', '値', ''].forEach(h => {
        const th = _el('th'); th.textContent = h; trh.appendChild(th);
      });
      thead.appendChild(trh); tbl.appendChild(thead);
      const tbody = _el('tbody');
      (this.state.slices || []).forEach((s, i) => {
        const tr = _el('tr');
        const tdL = _el('td');
        const inL = _el('input', 'dve-cell-input'); inL.type = 'text'; inL.value = s.label;
        inL.addEventListener('input', () => { s.label = inL.value; self._emit(); });
        tdL.appendChild(inL); tr.appendChild(tdL);
        const tdV = _el('td');
        const inV = _el('input', 'dve-cell-input'); inV.type = 'number'; inV.value = String(s.value);
        inV.addEventListener('input', () => { s.value = parseFloat(inV.value) || 0; self._emit(); });
        tdV.appendChild(inV); tr.appendChild(tdV);
        const tdD = _el('td');
        const del = _el('button', 'dve-icon-btn'); del.textContent = '🗑';
        del.addEventListener('click', () => { self.state.slices.splice(i, 1); self._renderListAndPreview(); });
        tdD.appendChild(del); tr.appendChild(tdD);
        tbody.appendChild(tr);
      });
      tbl.appendChild(tbody);
      wrap.appendChild(tbl);
      const addBtn = _el('button', 'mve-tool-btn');
      addBtn.textContent = '➕ 行追加';
      addBtn.addEventListener('click', () => {
        self.state.slices.push({ label: '新項目', value: 10 });
        self._renderListAndPreview();
      });
      wrap.appendChild(addBtn);
      host.appendChild(wrap);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  USER JOURNEY EDITOR
  // ═══════════════════════════════════════════════════════════════════════════
  class JourneyEditor extends GenericFormDiagramEditor {
    static template() {
      return 'journey\n    title カスタマージャーニー\n    section 朝\n      起床: 3: User\n      コーヒー: 5: User\n    section 仕事\n      通勤: 1: User';
    }
    _parse(code) {
      const lines = code.split('\n');
      this.state.title = '';
      this.state.sections = [];
      let cur = null;
      for (const ln of lines) {
        const t = ln.trim();
        const tm = t.match(/^title\s+(.+)$/);
        if (tm) { this.state.title = tm[1]; continue; }
        const sm = t.match(/^section\s+(.+)$/);
        if (sm) { cur = { name: sm[1], tasks: [] }; this.state.sections.push(cur); continue; }
        const taskM = t.match(/^([^:]+):\s*(\d+)\s*:\s*(.+)$/);
        if (taskM && cur) cur.tasks.push({ name: taskM[1].trim(), score: parseInt(taskM[2], 10), actors: taskM[3].trim() });
      }
    }
    _generate() {
      const lines = ['journey'];
      if (this.state.title) lines.push('    title ' + this.state.title);
      for (const s of (this.state.sections || [])) {
        lines.push('    section ' + s.name);
        for (const t of s.tasks) lines.push('      ' + t.name + ': ' + t.score + ': ' + t.actors);
      }
      return lines.join('\n');
    }
    _sections() {
      const self = this;
      return [
        {
          title: 'タイトル',
          items: [{ value: this.state.title || '' }],
          renderItem: (it, i, host) => {
            self._itemRow(host, it.value || '(なし)', async () => {
              const r = await _showDialog(self.container, { title: 'タイトル', fields: [{ key: 'v', label: 'タイトル', value: it.value }] });
              if (!r) return;
              self.state.title = r.v || '';
            });
          }
        },
        {
          title: 'セクション (' + (this.state.sections || []).length + ')',
          addLabel: 'セクション追加',
          items: this.state.sections || [],
          onAdd: async () => {
            const r = await _showDialog(self.container, { title: 'セクション追加', fields: [{ key: 'name', label: '名前', value: '新セクション' }] });
            if (!r) return;
            self.state.sections.push({ name: r.name, tasks: [] });
          },
          renderItem: (sec, si, host) => {
            const lbl = '📂 ' + sec.name + ' (' + sec.tasks.length + ' タスク)';
            self._itemRow(host, lbl,
              async () => {
                const r = await _showDialog(self.container, { title: 'セクション編集', fields: [{ key: 'name', label: '名前', value: sec.name }] });
                if (!r) return;
                sec.name = r.name;
              },
              async () => { self.state.sections.splice(si, 1); }
            );
            // Add task button row
            const addRow = _el('div', 'dve-list-subitem');
            const addBtn = _el('button', 'dve-icon-btn');
            addBtn.textContent = '➕ タスク追加';
            addBtn.style.fontSize = '11px';
            addBtn.addEventListener('click', async () => {
              const r = await _showDialog(self.container, {
                title: 'タスク追加',
                fields: [
                  { key: 'name', label: '名前', value: 'タスク' },
                  { key: 'score', label: 'スコア (1-5)', type: 'number', value: '3', min: 1, max: 5 },
                  { key: 'actors', label: 'アクター (カンマ区切り)', value: 'User' }
                ]
              });
              if (!r) return;
              sec.tasks.push({ name: r.name, score: parseInt(r.score, 10) || 3, actors: r.actors });
              self._renderListAndPreview();
            });
            addRow.appendChild(addBtn);
            host.parentElement.appendChild(addRow);
            sec.tasks.forEach((task, ti) => {
              const tRow = _el('div', 'dve-list-subitem');
              tRow.style.paddingLeft = '20px';
              self._itemRow(tRow, '• ' + task.name + ' [' + task.score + '] ' + task.actors,
                async () => {
                  const r = await _showDialog(self.container, {
                    title: 'タスク編集',
                    fields: [
                      { key: 'name', label: '名前', value: task.name },
                      { key: 'score', label: 'スコア', type: 'number', value: String(task.score), min: 1, max: 5 },
                      { key: 'actors', label: 'アクター', value: task.actors }
                    ]
                  });
                  if (!r) return;
                  task.name = r.name; task.score = parseInt(r.score, 10) || task.score; task.actors = r.actors;
                },
                async () => { sec.tasks.splice(ti, 1); }
              );
              host.parentElement.appendChild(tRow);
            });
          }
        }
      ];
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  GIT GRAPH EDITOR
  // ═══════════════════════════════════════════════════════════════════════════
  class GitGraphEditor extends GenericFormDiagramEditor {
    static template() {
      return 'gitGraph\n    commit\n    commit\n    branch develop\n    checkout develop\n    commit\n    checkout main\n    merge develop';
    }
    _parse(code) {
      const lines = code.split('\n').map(l => l.trim()).filter(Boolean);
      this.state.commands = [];
      for (let i = 1; i < lines.length; i++) {
        const ln = lines[i];
        if (ln.startsWith('%%') || ln === 'gitGraph') continue;
        let m;
        if ((m = ln.match(/^commit(?:\s+id:\s*"([^"]+)")?(?:\s+tag:\s*"([^"]+)")?(?:\s+type:\s*(\w+))?$/))) {
          this.state.commands.push({ cmd: 'commit', id: m[1] || '', tag: m[2] || '', type: m[3] || '' });
        } else if ((m = ln.match(/^branch\s+(\S+)$/))) {
          this.state.commands.push({ cmd: 'branch', name: m[1] });
        } else if ((m = ln.match(/^checkout\s+(\S+)$/))) {
          this.state.commands.push({ cmd: 'checkout', name: m[1] });
        } else if ((m = ln.match(/^merge\s+(\S+)$/))) {
          this.state.commands.push({ cmd: 'merge', name: m[1] });
        } else if ((m = ln.match(/^cherry-pick\s+id:\s*"([^"]+)"$/))) {
          this.state.commands.push({ cmd: 'cherry-pick', id: m[1] });
        }
      }
    }
    _generate() {
      const lines = ['gitGraph'];
      for (const c of (this.state.commands || [])) {
        if (c.cmd === 'commit') {
          let s = '    commit';
          if (c.id) s += ' id: "' + c.id + '"';
          if (c.tag) s += ' tag: "' + c.tag + '"';
          if (c.type) s += ' type: ' + c.type;
          lines.push(s);
        } else if (c.cmd === 'branch') lines.push('    branch ' + c.name);
        else if (c.cmd === 'checkout') lines.push('    checkout ' + c.name);
        else if (c.cmd === 'merge') lines.push('    merge ' + c.name);
        else if (c.cmd === 'cherry-pick') lines.push('    cherry-pick id: "' + c.id + '"');
      }
      return lines.join('\n');
    }
    _sections() {
      const self = this;
      const cmdOpts = [
        { value: 'commit', label: 'commit (コミット)' },
        { value: 'branch', label: 'branch (ブランチ作成)' },
        { value: 'checkout', label: 'checkout (切替)' },
        { value: 'merge', label: 'merge (マージ)' },
        { value: 'cherry-pick', label: 'cherry-pick' }
      ];
      const typeOpts = [
        { value: '', label: '(なし)' },
        { value: 'NORMAL', label: 'NORMAL' },
        { value: 'HIGHLIGHT', label: 'HIGHLIGHT' },
        { value: 'REVERSE', label: 'REVERSE' }
      ];
      return [{
        title: 'コマンド (' + (this.state.commands || []).length + ')',
        addLabel: 'コマンド追加',
        items: this.state.commands || [],
        onAdd: async () => {
          const r = await _showDialog(self.container, {
            title: 'コマンド追加',
            fields: [
              { key: 'cmd', label: 'コマンド', type: 'select', options: cmdOpts, value: 'commit' },
              { key: 'name', label: '名前/ID (branch/checkout/merge/cherry-pick id)', value: '' },
              { key: 'tag', label: 'タグ (commit のみ)', value: '' },
              { key: 'type', label: '種別 (commit のみ)', type: 'select', options: typeOpts, value: '' }
            ]
          });
          if (!r) return;
          if (r.cmd === 'commit') self.state.commands.push({ cmd: 'commit', id: r.name, tag: r.tag, type: r.type });
          else if (r.cmd === 'cherry-pick') self.state.commands.push({ cmd: 'cherry-pick', id: r.name });
          else self.state.commands.push({ cmd: r.cmd, name: r.name });
        },
        renderItem: (c, i, host) => {
          let lbl;
          if (c.cmd === 'commit') lbl = '⬤ commit' + (c.id ? ' #' + c.id : '') + (c.tag ? ' [' + c.tag + ']' : '') + (c.type ? ' (' + c.type + ')' : '');
          else if (c.cmd === 'cherry-pick') lbl = '🍒 cherry-pick #' + c.id;
          else lbl = (c.cmd === 'branch' ? '🌿' : c.cmd === 'merge' ? '⤳' : '⤴') + ' ' + c.cmd + ' ' + c.name;
          self._itemRow(host, lbl,
            async () => {
              const r = await _showDialog(self.container, {
                title: 'コマンド編集',
                fields: [
                  { key: 'cmd', label: 'コマンド', type: 'select', options: cmdOpts, value: c.cmd },
                  { key: 'name', label: '名前/ID', value: c.cmd === 'commit' || c.cmd === 'cherry-pick' ? (c.id || '') : (c.name || '') },
                  { key: 'tag', label: 'タグ', value: c.tag || '' },
                  { key: 'type', label: '種別', type: 'select', options: typeOpts, value: c.type || '' }
                ]
              });
              if (!r) return;
              if (r.cmd === 'commit') { c.cmd = 'commit'; c.id = r.name; c.tag = r.tag; c.type = r.type; delete c.name; }
              else if (r.cmd === 'cherry-pick') { c.cmd = 'cherry-pick'; c.id = r.name; delete c.name; delete c.tag; delete c.type; }
              else { c.cmd = r.cmd; c.name = r.name; delete c.id; delete c.tag; delete c.type; }
            },
            async () => { self.state.commands.splice(i, 1); }
          );
        }
      }];
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  TIMELINE EDITOR
  // ═══════════════════════════════════════════════════════════════════════════
  class TimelineEditor extends GenericFormDiagramEditor {
    static template() {
      return 'timeline\n    title プロジェクト履歴\n    section 2024\n      Q1 : 企画開始 : 要件定義\n      Q2 : 設計\n    section 2025\n      Q1 : 実装';
    }
    _parse(code) {
      const lines = code.split('\n');
      this.state.title = '';
      this.state.sections = [];
      let cur = null;
      for (const ln of lines) {
        const t = ln.trim();
        const tm = t.match(/^title\s+(.+)$/);
        if (tm) { this.state.title = tm[1]; continue; }
        const sm = t.match(/^section\s+(.+)$/);
        if (sm) { cur = { name: sm[1], items: [] }; this.state.sections.push(cur); continue; }
        if (t === 'timeline' || t === '') continue;
        const im = t.match(/^([^:]+?)\s*:\s*(.+)$/);
        if (im && cur) {
          cur.items.push({ time: im[1].trim(), events: im[2].split(':').map(s => s.trim()) });
        } else if (im && !cur) {
          // No section: add to ungrouped
          if (!this.state.ungrouped) this.state.ungrouped = [];
          this.state.ungrouped.push({ time: im[1].trim(), events: im[2].split(':').map(s => s.trim()) });
        }
      }
    }
    _generate() {
      const lines = ['timeline'];
      if (this.state.title) lines.push('    title ' + this.state.title);
      for (const it of (this.state.ungrouped || [])) lines.push('      ' + it.time + ' : ' + it.events.join(' : '));
      for (const s of (this.state.sections || [])) {
        lines.push('    section ' + s.name);
        for (const it of s.items) lines.push('      ' + it.time + ' : ' + it.events.join(' : '));
      }
      return lines.join('\n');
    }
    _sections() {
      const self = this;
      const renderItems = (items, host, owner) => {
        items.forEach((it, idx) => {
          const r = _el('div', 'dve-list-subitem');
          r.style.paddingLeft = '20px';
          self._itemRow(r, '• ' + it.time + ' : ' + it.events.join(' / '),
            async () => {
              const dr = await _showDialog(self.container, {
                title: 'イベント編集',
                fields: [
                  { key: 'time', label: '時点 (ラベル)', value: it.time },
                  { key: 'events', label: 'イベント (改行区切り)', type: 'textarea', value: it.events.join('\n') }
                ]
              });
              if (!dr) return;
              it.time = dr.time;
              it.events = dr.events.split('\n').map(s => s.trim()).filter(Boolean);
            },
            async () => { items.splice(idx, 1); }
          );
          host.appendChild(r);
        });
      };
      return [
        {
          title: 'タイトル',
          items: [{ value: this.state.title || '' }],
          renderItem: (it, i, host) => {
            self._itemRow(host, it.value || '(なし)', async () => {
              const r = await _showDialog(self.container, { title: 'タイトル', fields: [{ key: 'v', label: 'タイトル', value: it.value }] });
              if (!r) return;
              self.state.title = r.v || '';
            });
          }
        },
        {
          title: 'セクション (' + (this.state.sections || []).length + ')',
          addLabel: 'セクション追加',
          items: this.state.sections || [],
          onAdd: async () => {
            const r = await _showDialog(self.container, { title: 'セクション追加', fields: [{ key: 'name', label: '名前', value: '新セクション' }] });
            if (!r) return;
            self.state.sections.push({ name: r.name, items: [] });
          },
          renderItem: (sec, si, host) => {
            self._itemRow(host, '📂 ' + sec.name + ' (' + sec.items.length + ' 件)',
              async () => {
                const r = await _showDialog(self.container, { title: 'セクション編集', fields: [{ key: 'name', label: '名前', value: sec.name }] });
                if (!r) return;
                sec.name = r.name;
              },
              async () => { self.state.sections.splice(si, 1); }
            );
            const addBtn = _el('button', 'dve-icon-btn');
            addBtn.textContent = '➕ イベント追加';
            addBtn.style.fontSize = '11px';
            addBtn.style.marginLeft = '20px';
            addBtn.addEventListener('click', async () => {
              const r = await _showDialog(self.container, {
                title: 'イベント追加',
                fields: [
                  { key: 'time', label: '時点', value: '時点' },
                  { key: 'events', label: 'イベント (改行区切り)', type: 'textarea', value: 'イベント' }
                ]
              });
              if (!r) return;
              sec.items.push({ time: r.time, events: r.events.split('\n').map(s => s.trim()).filter(Boolean) });
              self._renderListAndPreview();
            });
            const addRow = _el('div', 'dve-list-subitem');
            addRow.appendChild(addBtn);
            host.parentElement.appendChild(addRow);
            renderItems(sec.items, host.parentElement);
          }
        }
      ];
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  REQUIREMENT DIAGRAM EDITOR
  // ═══════════════════════════════════════════════════════════════════════════
  class RequirementEditor extends GenericFormDiagramEditor {
    static template() {
      return 'requirementDiagram\n    requirement testReq {\n        id: "1"\n        text: "性能要件"\n        risk: medium\n        verifymethod: test\n    }\n    element testEl {\n        type: "simulation"\n    }\n    testEl - satisfies -> testReq';
    }
    _parse(code) {
      this.state.requirements = [];
      this.state.elements = [];
      this.state.relations = [];
      const stripQuotes = (s) => {
        if (typeof s !== 'string') return s;
        const t = s.trim();
        if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
          return t.slice(1, -1);
        }
        return t;
      };
      // Block matching for `requirement|...Requirement name { ... }` and `element name { ... }`
      const reqRe = /(\w*[Rr]equirement|requirement)\s+(\w+)\s*\{([\s\S]*?)\}/g;
      const elRe = /element\s+(\w+)\s*\{([\s\S]*?)\}/g;
      let m;
      while ((m = reqRe.exec(code)) !== null) {
        const body = m[3];
        const fields = {};
        body.split('\n').forEach(l => {
          const x = l.trim().match(/^(\w+):\s*(.+?)$/);
          if (x) fields[x[1]] = stripQuotes(x[2]);
        });
        this.state.requirements.push({ kind: m[1], name: m[2], ...fields });
      }
      while ((m = elRe.exec(code)) !== null) {
        const body = m[2];
        const fields = {};
        body.split('\n').forEach(l => {
          const x = l.trim().match(/^(\w+):\s*(.+?)$/);
          if (x) fields[x[1]] = stripQuotes(x[2]);
        });
        this.state.elements.push({ name: m[1], ...fields });
      }
      const relRe = /^\s*(\w+)\s*-\s*(\w+)\s*->\s*(\w+)\s*$/;
      code.split('\n').forEach(l => {
        const x = l.match(relRe);
        if (x) this.state.relations.push({ src: x[1], type: x[2], dst: x[3] });
      });
    }
    _generate() {
      // Quote values that are not pure ASCII alphanumerics (Mermaid lexer requires quotes for spaces / non-ASCII).
      const q = (v) => {
        if (v === undefined || v === null) return v;
        const s = String(v);
        if (/^[A-Za-z0-9_]+$/.test(s)) return s;
        // Already quoted? leave as-is.
        if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s;
        return '"' + s.replace(/"/g, '\\"') + '"';
      };
      const lines = ['requirementDiagram'];
      for (const r of this.state.requirements) {
        lines.push('    ' + r.kind + ' ' + r.name + ' {');
        for (const k of ['id', 'text', 'risk', 'verifymethod']) {
          if (r[k] !== undefined) lines.push('        ' + k + ': ' + q(r[k]));
        }
        lines.push('    }');
      }
      for (const e of this.state.elements) {
        lines.push('    element ' + e.name + ' {');
        if (e.type) lines.push('        type: ' + q(e.type));
        if (e.docref) lines.push('        docref: ' + q(e.docref));
        lines.push('    }');
      }
      for (const r of this.state.relations) {
        lines.push('    ' + r.src + ' - ' + r.type + ' -> ' + r.dst);
      }
      return lines.join('\n');
    }
    _sections() {
      const self = this;
      const reqKinds = [
        { value: 'requirement', label: 'requirement' },
        { value: 'functionalRequirement', label: 'functionalRequirement' },
        { value: 'performanceRequirement', label: 'performanceRequirement' },
        { value: 'interfaceRequirement', label: 'interfaceRequirement' },
        { value: 'physicalRequirement', label: 'physicalRequirement' },
        { value: 'designConstraint', label: 'designConstraint' }
      ];
      const riskOpts = [{ value: 'low', label: 'low' }, { value: 'medium', label: 'medium' }, { value: 'high', label: 'high' }];
      const vmOpts = [
        { value: 'analysis', label: 'analysis' },
        { value: 'inspection', label: 'inspection' },
        { value: 'test', label: 'test' },
        { value: 'demonstration', label: 'demonstration' }
      ];
      const elTypeOpts = [
        { value: 'simulation', label: 'simulation' },
        { value: 'document', label: 'document' },
        { value: 'feature', label: 'feature' },
        { value: 'test', label: 'test' }
      ];
      const relTypeOpts = [
        { value: 'satisfies', label: 'satisfies' }, { value: 'derives', label: 'derives' },
        { value: 'refines', label: 'refines' }, { value: 'verifies', label: 'verifies' },
        { value: 'contains', label: 'contains' }, { value: 'copies', label: 'copies' },
        { value: 'traces', label: 'traces' }
      ];
      return [
        {
          title: '要件 (' + this.state.requirements.length + ')',
          addLabel: '要件追加',
          items: this.state.requirements,
          onAdd: async () => {
            const r = await _showDialog(self.container, {
              title: '要件追加',
              fields: [
                { key: 'kind', label: '種別', type: 'select', options: reqKinds, value: 'requirement' },
                { key: 'name', label: '名前', value: 'newReq' },
                { key: 'id', label: 'ID', value: '1' },
                { key: 'text', label: 'テキスト', value: '要件説明' },
                { key: 'risk', label: 'リスク', type: 'select', options: riskOpts, value: 'medium' },
                { key: 'verifymethod', label: '検証方法', type: 'select', options: vmOpts, value: 'test' }
              ]
            });
            if (!r) return;
            self.state.requirements.push(r);
          },
          renderItem: (req, i, host) => {
            self._itemRow(host, '📋 ' + req.kind + ' ' + req.name + ' #' + (req.id || '?'),
              async () => {
                const r = await _showDialog(self.container, {
                  title: '要件編集',
                  fields: [
                    { key: 'kind', label: '種別', type: 'select', options: reqKinds, value: req.kind },
                    { key: 'name', label: '名前', value: req.name },
                    { key: 'id', label: 'ID', value: req.id || '' },
                    { key: 'text', label: 'テキスト', value: req.text || '' },
                    { key: 'risk', label: 'リスク', type: 'select', options: riskOpts, value: req.risk || 'medium' },
                    { key: 'verifymethod', label: '検証', type: 'select', options: vmOpts, value: req.verifymethod || 'test' }
                  ]
                });
                if (!r) return;
                Object.assign(req, r);
              },
              async () => { self.state.requirements.splice(i, 1); }
            );
          }
        },
        {
          title: 'エレメント (' + this.state.elements.length + ')',
          addLabel: 'エレメント追加',
          items: this.state.elements,
          onAdd: async () => {
            const r = await _showDialog(self.container, {
              title: 'エレメント追加',
              fields: [
                { key: 'name', label: '名前', value: 'newEl' },
                { key: 'type', label: '型', type: 'select', options: elTypeOpts, value: 'simulation' }
              ]
            });
            if (!r) return;
            self.state.elements.push(r);
          },
          renderItem: (e, i, host) => {
            self._itemRow(host, '🔷 ' + e.name + ' (' + (e.type || '') + ')',
              async () => {
                const r = await _showDialog(self.container, {
                  title: 'エレメント編集',
                  fields: [
                    { key: 'name', label: '名前', value: e.name },
                    { key: 'type', label: '型', type: 'select', options: elTypeOpts, value: e.type || 'simulation' }
                  ]
                });
                if (!r) return;
                Object.assign(e, r);
              },
              async () => { self.state.elements.splice(i, 1); }
            );
          }
        },
        {
          title: 'リレーション (' + this.state.relations.length + ')',
          addLabel: 'リレーション追加',
          items: this.state.relations,
          onAdd: async () => {
            const all = [...self.state.requirements.map(r => r.name), ...self.state.elements.map(e => e.name)];
            if (all.length < 2) return;
            const opts = all.map(n => ({ value: n, label: n }));
            const r = await _showDialog(self.container, {
              title: 'リレーション追加',
              fields: [
                { key: 'src', label: 'From', type: 'select', options: opts, value: opts[0].value },
                { key: 'type', label: '関係', type: 'select', options: relTypeOpts, value: 'satisfies' },
                { key: 'dst', label: 'To', type: 'select', options: opts, value: opts[opts.length - 1].value }
              ]
            });
            if (!r) return;
            self.state.relations.push(r);
          },
          renderItem: (r, i, host) => {
            self._itemRow(host, r.src + ' -' + r.type + '→ ' + r.dst,
              async () => {
                const all = [...self.state.requirements.map(x => x.name), ...self.state.elements.map(x => x.name)];
                const opts = all.map(n => ({ value: n, label: n }));
                const dr = await _showDialog(self.container, {
                  title: 'リレーション編集',
                  fields: [
                    { key: 'src', label: 'From', type: 'select', options: opts, value: r.src },
                    { key: 'type', label: '関係', type: 'select', options: relTypeOpts, value: r.type },
                    { key: 'dst', label: 'To', type: 'select', options: opts, value: r.dst }
                  ]
                });
                if (!dr) return;
                Object.assign(r, dr);
              },
              async () => { self.state.relations.splice(i, 1); }
            );
          }
        }
      ];
    }

    // Click-to-connect: clicking requirements/elements creates a relation.
    _connectOpts() {
      const self = this;
      const relTypeOpts = [
        { value: 'satisfies', label: 'satisfies' }, { value: 'derives', label: 'derives' },
        { value: 'refines', label: 'refines' }, { value: 'verifies', label: 'verifies' },
        { value: 'contains', label: 'contains' }, { value: 'copies', label: 'copies' },
        { value: 'traces', label: 'traces' }
      ];
      return {
        label: 'リレーション追加',
        getNodes() {
          return [
            ...self.state.requirements.map(r => ({ id: r.name, label: r.name })),
            ...self.state.elements.map(e => ({ id: e.name, label: e.name }))
          ];
        },
        async onConnect(fromId, toId) {
          const r = await _showDialog(self.container, {
            title: fromId + ' → ' + toId + ' のリレーション',
            fields: [
              { key: 'type', label: '関係', type: 'select', options: relTypeOpts, value: 'satisfies' }
            ]
          });
          if (!r) return;
          self.state.relations.push({ src: fromId, type: r.type, dst: toId });
        }
      };
    }
  }
  // ═══════════════════════════════════════════════════════════════════════════
  //  C4 DIAGRAM EDITOR (simplified)
  // ═══════════════════════════════════════════════════════════════════════════
  class C4Editor extends GenericFormDiagramEditor {
    static template() {
      return 'C4Context\n    title システムコンテキスト図\n    Person(user, "ユーザー", "システム利用者")\n    System(sys, "本システム", "メインシステム")\n    Rel(user, sys, "利用する")';
    }
    _parse(code) {
      const lines = code.split('\n');
      this.state.kind = 'C4Context';
      this.state.title = '';
      this.state.elements = [];
      this.state.relations = [];
      const km = (lines[0] || '').match(/^(C4\w+)/);
      if (km) this.state.kind = km[1];
      for (const ln of lines) {
        const t = ln.trim();
        const tm = t.match(/^title\s+(.+)$/);
        if (tm) { this.state.title = tm[1]; continue; }
        const em = t.match(/^(Person|System|System_Ext|Container|Container_Db|Component|System_Boundary|Container_Boundary)\s*\(\s*(\w+)\s*,\s*"([^"]*)"(?:\s*,\s*"([^"]*)")?\s*\)/);
        if (em) {
          this.state.elements.push({ kind: em[1], id: em[2], label: em[3], desc: em[4] || '' });
          continue;
        }
        const rm = t.match(/^Rel(?:_[A-Za-z]+)?\s*\(\s*(\w+)\s*,\s*(\w+)\s*,\s*"([^"]*)"(?:\s*,\s*"([^"]*)")?\s*\)/);
        if (rm) this.state.relations.push({ from: rm[1], to: rm[2], label: rm[3], tech: rm[4] || '' });
      }
    }
    _generate() {
      const lines = [this.state.kind || 'C4Context'];
      if (this.state.title) lines.push('    title ' + this.state.title);
      for (const e of this.state.elements) {
        lines.push('    ' + e.kind + '(' + e.id + ', "' + e.label + '"' + (e.desc ? ', "' + e.desc + '"' : '') + ')');
      }
      for (const r of this.state.relations) {
        lines.push('    Rel(' + r.from + ', ' + r.to + ', "' + r.label + '"' + (r.tech ? ', "' + r.tech + '"' : '') + ')');
      }
      return lines.join('\n');
    }
    _sections() {
      const self = this;
      const kindOpts = ['C4Context', 'C4Container', 'C4Component', 'C4Dynamic', 'C4Deployment'].map(v => ({ value: v, label: v }));
      const elKindOpts = ['Person', 'System', 'System_Ext', 'Container', 'Container_Db', 'Component', 'System_Boundary', 'Container_Boundary'].map(v => ({ value: v, label: v }));
      return [
        {
          title: '図種別 / タイトル',
          items: [{ k: 'kind' }, { k: 'title' }],
          renderItem: (it, i, host) => {
            if (it.k === 'kind') {
              self._itemRow(host, 'Kind: ' + (self.state.kind || 'C4Context'), async () => {
                const r = await _showDialog(self.container, { title: 'C4 図種別', fields: [{ key: 'kind', label: '種別', type: 'select', options: kindOpts, value: self.state.kind }] });
                if (!r) return;
                self.state.kind = r.kind;
              });
            } else {
              self._itemRow(host, 'タイトル: ' + (self.state.title || '(なし)'), async () => {
                const r = await _showDialog(self.container, { title: 'タイトル', fields: [{ key: 't', label: 'タイトル', value: self.state.title }] });
                if (!r) return;
                self.state.title = r.t || '';
              });
            }
          }
        },
        {
          title: '要素 (' + this.state.elements.length + ')',
          addLabel: '要素追加',
          items: this.state.elements,
          onAdd: async () => {
            const r = await _showDialog(self.container, {
              title: '要素追加',
              fields: [
                { key: 'kind', label: '種別', type: 'select', options: elKindOpts, value: 'Person' },
                { key: 'id', label: 'ID', value: 'newId' },
                { key: 'label', label: 'ラベル', value: 'ラベル' },
                { key: 'desc', label: '説明', value: '' }
              ]
            });
            if (!r) return;
            self.state.elements.push(r);
          },
          renderItem: (e, i, host) => {
            self._itemRow(host, e.kind + '(' + e.id + ') ' + e.label,
              async () => {
                const r = await _showDialog(self.container, {
                  title: '要素編集',
                  fields: [
                    { key: 'kind', label: '種別', type: 'select', options: elKindOpts, value: e.kind },
                    { key: 'id', label: 'ID', value: e.id },
                    { key: 'label', label: 'ラベル', value: e.label },
                    { key: 'desc', label: '説明', value: e.desc || '' }
                  ]
                });
                if (!r) return;
                Object.assign(e, r);
              },
              async () => { self.state.elements.splice(i, 1); }
            );
          }
        },
        {
          title: 'リレーション (' + this.state.relations.length + ')',
          addLabel: 'リレーション追加',
          items: this.state.relations,
          onAdd: async () => {
            const opts = self.state.elements.map(e => ({ value: e.id, label: e.id + ' (' + e.label + ')' }));
            if (opts.length < 1) return;
            const r = await _showDialog(self.container, {
              title: 'リレーション追加',
              fields: [
                { key: 'from', label: 'From', type: 'select', options: opts, value: opts[0].value },
                { key: 'to', label: 'To', type: 'select', options: opts, value: opts[opts.length - 1].value },
                { key: 'label', label: 'ラベル', value: '使用する' },
                { key: 'tech', label: '技術', value: '' }
              ]
            });
            if (!r) return;
            self.state.relations.push(r);
          },
          renderItem: (r, i, host) => {
            self._itemRow(host, r.from + ' → ' + r.to + ' : ' + r.label,
              async () => {
                const opts = self.state.elements.map(e => ({ value: e.id, label: e.id }));
                const dr = await _showDialog(self.container, {
                  title: 'リレーション編集',
                  fields: [
                    { key: 'from', label: 'From', type: 'select', options: opts, value: r.from },
                    { key: 'to', label: 'To', type: 'select', options: opts, value: r.to },
                    { key: 'label', label: 'ラベル', value: r.label },
                    { key: 'tech', label: '技術', value: r.tech || '' }
                  ]
                });
                if (!dr) return;
                Object.assign(r, dr);
              },
              async () => { self.state.relations.splice(i, 1); }
            );
          }
        }
      ];
    }

    // Click-to-connect: clicking elements creates a Rel(from, to, label).
    _connectOpts() {
      const self = this;
      return {
        label: 'リレーション追加',
        getNodes() {
          return self.state.elements.map(e => ({ id: e.id, label: e.label || e.id }));
        },
        async onConnect(fromId, toId) {
          const r = await _showDialog(self.container, {
            title: fromId + ' → ' + toId + ' のリレーション',
            fields: [
              { key: 'label', label: 'ラベル', value: '使用する' },
              { key: 'tech', label: '技術 (任意)', value: '' }
            ]
          });
          if (!r) return;
          self.state.relations.push({ from: fromId, to: toId, label: r.label || '', tech: r.tech || '' });
        }
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  SANKEY EDITOR
  // ═══════════════════════════════════════════════════════════════════════════
  class SankeyEditor extends GenericFormDiagramEditor {
    static template() {
      return 'sankey-beta\n%% source,target,value\nA,B,10\nA,C,5\nB,D,7\nC,D,3';
    }
    _parse(code) {
      const lines = code.split('\n');
      this.state.flows = [];
      for (const ln of lines) {
        const t = ln.trim();
        if (!t || t.startsWith('%%') || /^sankey/i.test(t)) continue;
        const parts = t.split(',').map(p => p.trim().replace(/^"|"$/g, ''));
        if (parts.length >= 3) this.state.flows.push({ src: parts[0], dst: parts[1], value: parseFloat(parts[2]) || 0 });
      }
    }
    _generate() {
      const lines = ['sankey-beta'];
      for (const f of this.state.flows) {
        lines.push('"' + f.src + '","' + f.dst + '",' + f.value);
      }
      return lines.join('\n');
    }
    _sections() {
      const self = this;
      return [{
        title: 'フロー (' + this.state.flows.length + ')',
        addLabel: 'フロー追加',
        items: this.state.flows,
        onAdd: async () => {
          const r = await _showDialog(self.container, {
            title: 'フロー追加',
            fields: [
              { key: 'src', label: 'ソース', value: 'A' },
              { key: 'dst', label: 'ターゲット', value: 'B' },
              { key: 'value', label: '値', type: 'number', value: '10' }
            ]
          });
          if (!r) return;
          self.state.flows.push({ src: r.src, dst: r.dst, value: parseFloat(r.value) || 0 });
        },
        renderItem: (f, i, host) => {
          self._itemRow(host, f.src + ' → ' + f.dst + ' (' + f.value + ')',
            async () => {
              const r = await _showDialog(self.container, {
                title: 'フロー編集',
                fields: [
                  { key: 'src', label: 'ソース', value: f.src },
                  { key: 'dst', label: 'ターゲット', value: f.dst },
                  { key: 'value', label: '値', type: 'number', value: String(f.value) }
                ]
              });
              if (!r) return;
              f.src = r.src; f.dst = r.dst; f.value = parseFloat(r.value) || 0;
            },
            async () => { self.state.flows.splice(i, 1); }
          );
        }
      }];
    }

    // ─── Table edit mode (src, dst, value) ───
    _renderTable(host) {
      const self = this;
      const wrap = _el('div', 'dve-table-wrap');
      const tbl = _el('table', 'dve-edit-table');
      const thead = _el('thead');
      const trh = _el('tr');
      ['ソース', 'ターゲット', '値', ''].forEach(h => {
        const th = _el('th'); th.textContent = h; trh.appendChild(th);
      });
      thead.appendChild(trh); tbl.appendChild(thead);
      const tbody = _el('tbody');
      (this.state.flows || []).forEach((f, i) => {
        const tr = _el('tr');
        const mkInput = (key, type) => {
          const td = _el('td');
          const inp = _el('input', 'dve-cell-input');
          inp.type = type; inp.value = String(f[key]);
          inp.addEventListener('input', () => {
            f[key] = (type === 'number') ? (parseFloat(inp.value) || 0) : inp.value;
            self._emit();
          });
          td.appendChild(inp); return td;
        };
        tr.appendChild(mkInput('src', 'text'));
        tr.appendChild(mkInput('dst', 'text'));
        tr.appendChild(mkInput('value', 'number'));
        const tdD = _el('td');
        const del = _el('button', 'dve-icon-btn'); del.textContent = '🗑';
        del.addEventListener('click', () => { self.state.flows.splice(i, 1); self._renderListAndPreview(); });
        tdD.appendChild(del); tr.appendChild(tdD);
        tbody.appendChild(tr);
      });
      tbl.appendChild(tbody);
      wrap.appendChild(tbl);
      const addBtn = _el('button', 'mve-tool-btn');
      addBtn.textContent = '➕ 行追加';
      addBtn.addEventListener('click', () => {
        self.state.flows.push({ src: 'A', dst: 'B', value: 10 });
        self._renderListAndPreview();
      });
      wrap.appendChild(addBtn);
      host.appendChild(wrap);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  XY CHART EDITOR
  // ═══════════════════════════════════════════════════════════════════════════
  class XYChartEditor extends GenericFormDiagramEditor {
    static template() {
      return 'xychart-beta\n    title "売上推移"\n    x-axis [Jan, Feb, Mar, Apr, May]\n    y-axis "売上 (千円)" 0 --> 100\n    bar [50, 60, 75, 85, 95]\n    line [50, 60, 75, 85, 95]';
    }
    _parse(code) {
      this.state.title = '';
      this.state.orient = 'vertical';
      this.state.xCategories = '';
      this.state.yLabel = '';
      this.state.yMin = '';
      this.state.yMax = '';
      this.state.yAuto = true;
      this.state.series = [];
      const lines = code.split('\n');
      for (const ln of lines) {
        const t = ln.trim();
        if (/^xychart-beta(?:\s+horizontal)?/.test(t)) {
          if (/horizontal/.test(t)) this.state.orient = 'horizontal';
          continue;
        }
        let m;
        if ((m = t.match(/^title\s+"([^"]*)"/))) { this.state.title = m[1]; continue; }
        if ((m = t.match(/^x-axis\s+\[([^\]]*)\]/))) { this.state.xCategories = m[1]; continue; }
        if ((m = t.match(/^y-axis\s+"([^"]*)"\s+([\d.\-]+)\s*-->\s*([\d.\-]+)/))) {
          this.state.yLabel = m[1]; this.state.yMin = m[2]; this.state.yMax = m[3];
          // Explicit y-axis range in source → user is controlling it manually
          this.state.yAuto = false;
          continue;
        }
        if ((m = t.match(/^(bar|line)\s+\[([^\]]*)\]/))) {
          this.state.series.push({ kind: m[1], values: m[2] });
        }
      }
    }
    // Compute a "nice" min/max that fully contains all series values.
    // Called from _generate() when yAuto is true so the axis follows the data.
    _computeAutoY() {
      const nums = [];
      for (const s of this.state.series) {
        for (const v of (s.values || '').split(',')) {
          const n = parseFloat(v);
          if (!isNaN(n)) nums.push(n);
        }
      }
      if (!nums.length) return;
      let lo = Math.min.apply(null, nums);
      let hi = Math.max.apply(null, nums);
      if (lo === hi) { lo -= 1; hi += 1; }
      // Pad ~5%, snap to a "nice" rounding step based on the range magnitude.
      const span = hi - lo;
      const step = Math.pow(10, Math.floor(Math.log10(span))) || 1;
      const niceLo = Math.floor((lo - span * 0.05) / step) * step;
      const niceHi = Math.ceil((hi + span * 0.05) / step) * step;
      // Keep 0 baseline if all values are non-negative (typical for sales / pareto).
      this.state.yMin = String(lo >= 0 ? Math.min(0, niceLo) : niceLo);
      this.state.yMax = String(niceHi);
    }
    _generate() {
      if (this.state.yAuto) this._computeAutoY();
      const lines = ['xychart-beta' + (this.state.orient === 'horizontal' ? ' horizontal' : '')];
      if (this.state.title) lines.push('    title "' + this.state.title + '"');
      if (this.state.xCategories) lines.push('    x-axis [' + this.state.xCategories + ']');
      if (this.state.yLabel || this.state.yMin || this.state.yMax) {
        lines.push('    y-axis "' + (this.state.yLabel || 'Y') + '" ' + (this.state.yMin || '0') + ' --> ' + (this.state.yMax || '100'));
      }
      for (const s of this.state.series) lines.push('    ' + s.kind + ' [' + s.values + ']');
      return lines.join('\n');
    }
    _sections() {
      const self = this;
      const orientOpts = [{ value: 'vertical', label: '縦' }, { value: 'horizontal', label: '横' }];
      const kindOpts = [{ value: 'bar', label: 'bar (棒)' }, { value: 'line', label: 'line (折線)' }];
      return [
        {
          title: '基本設定',
          items: [{ k: 'orient' }, { k: 'title' }, { k: 'x' }, { k: 'y' }],
          renderItem: (it, i, host) => {
            if (it.k === 'orient') {
              self._itemRow(host, '向き: ' + (self.state.orient === 'horizontal' ? '横' : '縦'), async () => {
                const r = await _showDialog(self.container, { title: '向き', fields: [{ key: 'o', label: '向き', type: 'select', options: orientOpts, value: self.state.orient }] });
                if (!r) return; self.state.orient = r.o;
              });
            } else if (it.k === 'title') {
              self._itemRow(host, 'タイトル: ' + (self.state.title || '(なし)'), async () => {
                const r = await _showDialog(self.container, { title: 'タイトル', fields: [{ key: 't', label: 'タイトル', value: self.state.title }] });
                if (!r) return; self.state.title = r.t || '';
              });
            } else if (it.k === 'x') {
              self._itemRow(host, 'X 軸カテゴリ: ' + (self.state.xCategories || '(なし)'), async () => {
                const r = await _showDialog(self.container, { title: 'X 軸', fields: [{ key: 'x', label: 'カテゴリ (カンマ区切り)', value: self.state.xCategories }] });
                if (!r) return; self.state.xCategories = r.x || '';
              });
            } else {
              const autoLabel = self.state.yAuto ? ' (自動)' : '';
              self._itemRow(host, 'Y 軸: ' + (self.state.yLabel || '') + ' [' + (self.state.yMin || 0) + '..' + (self.state.yMax || 100) + ']' + autoLabel, async () => {
                const r = await _showDialog(self.container, {
                  title: 'Y 軸', fields: [
                    { key: 'l', label: 'ラベル', value: self.state.yLabel },
                    { key: 'auto', label: 'データに自動追従', type: 'select',
                      options: [{ value: '1', label: 'ON (推奨)' }, { value: '0', label: 'OFF (手動範囲)' }],
                      value: self.state.yAuto ? '1' : '0' },
                    { key: 'mn', label: '最小 (手動時)', type: 'number', value: self.state.yMin },
                    { key: 'mx', label: '最大 (手動時)', type: 'number', value: self.state.yMax }
                  ]
                });
                if (!r) return;
                self.state.yLabel = r.l;
                self.state.yAuto = (r.auto === '1' || r.auto === 1 || r.auto === true);
                if (!self.state.yAuto) { self.state.yMin = r.mn; self.state.yMax = r.mx; }
              });
            }
          }
        },
        {
          title: 'シリーズ (' + this.state.series.length + ')',
          addLabel: 'シリーズ追加',
          items: this.state.series,
          onAdd: async () => {
            const r = await _showDialog(self.container, {
              title: 'シリーズ追加',
              fields: [
                { key: 'kind', label: '種類', type: 'select', options: kindOpts, value: 'bar' },
                { key: 'values', label: '値 (カンマ区切り)', value: '10, 20, 30, 40, 50' }
              ]
            });
            if (!r) return;
            self.state.series.push({ kind: r.kind, values: r.values });
          },
          renderItem: (s, i, host) => {
            self._itemRow(host, s.kind + ' [' + s.values + ']',
              async () => {
                const r = await _showDialog(self.container, {
                  title: 'シリーズ編集',
                  fields: [
                    { key: 'kind', label: '種類', type: 'select', options: kindOpts, value: s.kind },
                    { key: 'values', label: '値', value: s.values }
                  ]
                });
                if (!r) return;
                s.kind = r.kind; s.values = r.values;
              },
              async () => { self.state.series.splice(i, 1); }
            );
          }
        }
      ];
    }

    // ─── Table edit mode (categories × series) ───
    _renderTable(host) {
      const self = this;
      // X categories array
      const cats = (this.state.xCategories || '').split(',').map(s => s.trim()).filter(Boolean);
      // Series values arrays
      const seriesVals = this.state.series.map(s => ({
        kind: s.kind,
        vals: s.values.split(',').map(v => v.trim()).filter(Boolean)
      }));
      // Pad / truncate so each series has cats.length entries
      seriesVals.forEach(s => {
        while (s.vals.length < cats.length) s.vals.push('0');
        s.vals.length = cats.length;
      });
      const commit = () => {
        self.state.xCategories = cats.join(', ');
        self.state.series = seriesVals.map(s => ({ kind: s.kind, values: s.vals.join(', ') }));
        self._emit();
      };
      const wrap = _el('div', 'dve-table-wrap');
      const hint = _elText('div', 'X 軸カテゴリを行、シリーズを列にしたテーブルです。セルが値です。', 'dve-hint');
      hint.style.padding = '4px 0 8px';
      wrap.appendChild(hint);

      const tbl = _el('table', 'dve-edit-table');
      // Header row: [カテゴリ] [series1 (kind selector + del)] [series2 ...] [+列追加]
      const thead = _el('thead');
      const trh = _el('tr');
      const thCat = _el('th'); thCat.textContent = 'カテゴリ \\ シリーズ'; trh.appendChild(thCat);
      const kindOpts = [{ value: 'bar', label: 'bar' }, { value: 'line', label: 'line' }];
      seriesVals.forEach((s, si) => {
        const th = _el('th');
        const sel = _el('select', 'dve-cell-input');
        kindOpts.forEach(o => {
          const opt = document.createElement('option');
          opt.value = o.value; opt.textContent = o.label;
          if (o.value === s.kind) opt.selected = true;
          sel.appendChild(opt);
        });
        sel.addEventListener('change', () => { s.kind = sel.value; commit(); });
        th.appendChild(sel);
        const del = _el('button', 'dve-icon-btn'); del.textContent = '✕';
        del.title = 'シリーズ削除';
        del.addEventListener('click', () => {
          seriesVals.splice(si, 1);
          self.state.series.splice(si, 1);
          commit(); self._renderListAndPreview();
        });
        th.appendChild(del);
        trh.appendChild(th);
      });
      const thAdd = _el('th');
      const addColBtn = _el('button', 'dve-icon-btn'); addColBtn.textContent = '➕';
      addColBtn.title = 'シリーズ追加';
      addColBtn.addEventListener('click', () => {
        seriesVals.push({ kind: 'bar', vals: cats.map(() => '0') });
        commit(); self._renderListAndPreview();
      });
      thAdd.appendChild(addColBtn);
      trh.appendChild(thAdd);
      thead.appendChild(trh); tbl.appendChild(thead);

      // Body: one row per category
      const tbody = _el('tbody');
      cats.forEach((cat, ci) => {
        const tr = _el('tr');
        const tdC = _el('td');
        const inC = _el('input', 'dve-cell-input'); inC.type = 'text'; inC.value = cat;
        inC.addEventListener('input', () => { cats[ci] = inC.value; commit(); });
        tdC.appendChild(inC); tr.appendChild(tdC);
        seriesVals.forEach((s, si) => {
          const td = _el('td');
          const inV = _el('input', 'dve-cell-input'); inV.type = 'number'; inV.value = s.vals[ci] || '0';
          inV.addEventListener('input', () => { s.vals[ci] = inV.value; commit(); });
          td.appendChild(inV); tr.appendChild(td);
        });
        const tdD = _el('td');
        const del = _el('button', 'dve-icon-btn'); del.textContent = '🗑';
        del.title = 'カテゴリ削除';
        del.addEventListener('click', () => {
          cats.splice(ci, 1);
          seriesVals.forEach(s => s.vals.splice(ci, 1));
          commit(); self._renderListAndPreview();
        });
        tdD.appendChild(del); tr.appendChild(tdD);
        tbody.appendChild(tr);
      });
      tbl.appendChild(tbody);
      wrap.appendChild(tbl);

      const addRowBtn = _el('button', 'mve-tool-btn');
      addRowBtn.textContent = '➕ カテゴリ追加';
      addRowBtn.addEventListener('click', () => {
        cats.push('Cat' + (cats.length + 1));
        seriesVals.forEach(s => s.vals.push('0'));
        commit(); self._renderListAndPreview();
      });
      wrap.appendChild(addRowBtn);
      host.appendChild(wrap);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  BLOCK DIAGRAM EDITOR (simplified)
  // ═══════════════════════════════════════════════════════════════════════════
  class BlockDiagramEditor extends GenericFormDiagramEditor {
    static template() {
      return 'block-beta\n    columns 3\n    A B C\n    D E F';
    }
    _parse(code) {
      this.state.columns = 3;
      this.state.lines = [];
      const lines = code.split('\n');
      for (const ln of lines) {
        const t = ln.trim();
        if (!t || /^block-beta/i.test(t) || t.startsWith('%%')) continue;
        const cm = t.match(/^columns\s+(\d+)/);
        if (cm) { this.state.columns = parseInt(cm[1], 10); continue; }
        this.state.lines.push(t);
      }
    }
    _generate() {
      const out = ['block-beta'];
      out.push('    columns ' + (this.state.columns || 3));
      for (const l of this.state.lines) out.push('    ' + l);
      return out.join('\n');
    }
    _sections() {
      const self = this;
      return [
        {
          title: '列数',
          items: [{ k: 'col' }],
          renderItem: (it, i, host) => {
            self._itemRow(host, 'columns: ' + self.state.columns, async () => {
              const r = await _showDialog(self.container, { title: '列数', fields: [{ key: 'c', label: '列数', type: 'number', value: String(self.state.columns), min: 1, max: 12 }] });
              if (!r) return; self.state.columns = parseInt(r.c, 10) || 3;
            });
          }
        },
        {
          title: 'ブロック行 (' + this.state.lines.length + ')',
          addLabel: '行追加',
          items: this.state.lines,
          onAdd: async () => {
            const r = await _showDialog(self.container, { title: 'ブロック行追加', fields: [{ key: 'l', label: '行 (例: A B[ラベル] C)', value: 'A B C' }] });
            if (!r) return; self.state.lines.push(r.l);
          },
          renderItem: (line, i, host) => {
            self._itemRow(host, line,
              async () => {
                const r = await _showDialog(self.container, { title: 'ブロック行編集', fields: [{ key: 'l', label: '行', value: line }] });
                if (!r) return; self.state.lines[i] = r.l;
              },
              async () => { self.state.lines.splice(i, 1); }
            );
          }
        }
      ];
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  ZENUML EDITOR (delegates to text-based fields)
  // ═══════════════════════════════════════════════════════════════════════════
  class ZenUmlEditor extends GenericFormDiagramEditor {
    static template() {
      return 'zenuml\n    title 注文処理\n    User -> Frontend.click()\n    Frontend -> Backend.request()\n    Backend -> Database.query()\n    Backend -> Frontend.response()';
    }
    _parse(code) {
      this.state.title = '';
      this.state.lines = [];
      const lines = code.split('\n');
      for (const ln of lines) {
        const t = ln.trim();
        if (!t || /^zenuml/i.test(t)) continue;
        const tm = t.match(/^title\s+(.+)$/);
        if (tm) { this.state.title = tm[1]; continue; }
        this.state.lines.push(t);
      }
    }
    _generate() {
      const out = ['zenuml'];
      if (this.state.title) out.push('    title ' + this.state.title);
      for (const l of this.state.lines) out.push('    ' + l);
      return out.join('\n');
    }
    _sections() {
      const self = this;
      return [
        {
          title: 'タイトル',
          items: [{ k: 'title' }],
          renderItem: (it, i, host) => {
            self._itemRow(host, self.state.title || '(なし)', async () => {
              const r = await _showDialog(self.container, { title: 'タイトル', fields: [{ key: 't', label: 'タイトル', value: self.state.title }] });
              if (!r) return; self.state.title = r.t || '';
            });
          }
        },
        {
          title: 'ステートメント (' + this.state.lines.length + ')',
          addLabel: 'ステートメント追加',
          items: this.state.lines,
          onAdd: async () => {
            const r = await _showDialog(self.container, { title: 'ステートメント追加', fields: [{ key: 'l', label: '例: A -> B.method()', value: 'A -> B.call()' }] });
            if (!r) return; self.state.lines.push(r.l);
          },
          renderItem: (line, i, host) => {
            self._itemRow(host, line,
              async () => {
                const r = await _showDialog(self.container, { title: 'ステートメント編集', fields: [{ key: 'l', label: '内容', value: line }] });
                if (!r) return; self.state.lines[i] = r.l;
              },
              async () => { self.state.lines.splice(i, 1); }
            );
          }
        }
      ];
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  PACKET EDITOR
  // ═══════════════════════════════════════════════════════════════════════════
  class PacketEditor extends GenericFormDiagramEditor {
    static template() {
      return 'packet-beta\n    title TCP ヘッダ\n    0-15: "送信元ポート"\n    16-31: "宛先ポート"\n    32-63: "シーケンス番号"';
    }
    _parse(code) {
      this.state.title = '';
      this.state.fields = [];
      const lines = code.split('\n');
      for (const ln of lines) {
        const t = ln.trim();
        if (!t || /^packet/i.test(t)) continue;
        const tm = t.match(/^title\s+(.+)$/);
        if (tm) { this.state.title = tm[1]; continue; }
        const fm = t.match(/^(\d+)(?:-(\d+))?\s*:\s*"([^"]*)"$/);
        if (fm) this.state.fields.push({ start: parseInt(fm[1], 10), end: fm[2] ? parseInt(fm[2], 10) : parseInt(fm[1], 10), label: fm[3] });
      }
    }
    _generate() {
      const out = ['packet-beta'];
      if (this.state.title) out.push('    title ' + this.state.title);
      for (const f of this.state.fields) {
        const range = f.start === f.end ? String(f.start) : f.start + '-' + f.end;
        out.push('    ' + range + ': "' + f.label + '"');
      }
      return out.join('\n');
    }
    _sections() {
      const self = this;
      return [
        {
          title: 'タイトル',
          items: [{}],
          renderItem: (it, i, host) => {
            self._itemRow(host, self.state.title || '(なし)', async () => {
              const r = await _showDialog(self.container, { title: 'タイトル', fields: [{ key: 't', label: 'タイトル', value: self.state.title }] });
              if (!r) return; self.state.title = r.t || '';
            });
          }
        },
        {
          title: 'フィールド (' + this.state.fields.length + ')',
          addLabel: 'フィールド追加',
          items: this.state.fields,
          onAdd: async () => {
            const last = self.state.fields[self.state.fields.length - 1];
            const start = last ? last.end + 1 : 0;
            const r = await _showDialog(self.container, {
              title: 'フィールド追加',
              fields: [
                { key: 's', label: '開始ビット', type: 'number', value: String(start) },
                { key: 'e', label: '終了ビット', type: 'number', value: String(start + 7) },
                { key: 'l', label: 'ラベル', value: '名前' }
              ]
            });
            if (!r) return;
            self.state.fields.push({ start: parseInt(r.s, 10), end: parseInt(r.e, 10), label: r.l });
          },
          renderItem: (f, i, host) => {
            self._itemRow(host, f.start + (f.start !== f.end ? '-' + f.end : '') + ': ' + f.label,
              async () => {
                const r = await _showDialog(self.container, {
                  title: 'フィールド編集',
                  fields: [
                    { key: 's', label: '開始', type: 'number', value: String(f.start) },
                    { key: 'e', label: '終了', type: 'number', value: String(f.end) },
                    { key: 'l', label: 'ラベル', value: f.label }
                  ]
                });
                if (!r) return;
                f.start = parseInt(r.s, 10); f.end = parseInt(r.e, 10); f.label = r.l;
              },
              async () => { self.state.fields.splice(i, 1); }
            );
          }
        }
      ];
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  ARCHITECTURE EDITOR
  // ═══════════════════════════════════════════════════════════════════════════
  class ArchitectureEditor extends GenericFormDiagramEditor {
    static template() {
      return 'architecture-beta\n    group api(cloud)[API レイヤ]\n    service db(database)[DB] in api\n    service web(server)[Web] in api\n    web:R --> L:db';
    }
    _parse(code) {
      this.state.groups = [];
      this.state.services = [];
      this.state.edges = [];
      const lines = code.split('\n');
      for (const ln of lines) {
        const t = ln.trim();
        if (!t || /^architecture/i.test(t)) continue;
        let m;
        if ((m = t.match(/^group\s+(\w+)\s*(?:\(([^)]+)\))?\s*(?:\[([^\]]+)\])?\s*(?:in\s+(\w+))?$/))) {
          this.state.groups.push({ id: m[1], icon: m[2] || '', label: m[3] || '', parent: m[4] || '' });
          continue;
        }
        if ((m = t.match(/^service\s+(\w+)\s*(?:\(([^)]+)\))?\s*(?:\[([^\]]+)\])?\s*(?:in\s+(\w+))?$/))) {
          this.state.services.push({ id: m[1], icon: m[2] || '', label: m[3] || '', parent: m[4] || '' });
          continue;
        }
        if ((m = t.match(/^(\w+):([LRTB])\s*-->\s*([LRTB]):(\w+)$/))) {
          this.state.edges.push({ from: m[1], fromSide: m[2], toSide: m[3], to: m[4] });
        }
      }
    }
    _generate() {
      const out = ['architecture-beta'];
      for (const g of this.state.groups) {
        out.push('    group ' + g.id + (g.icon ? '(' + g.icon + ')' : '') + (g.label ? '[' + g.label + ']' : '') + (g.parent ? ' in ' + g.parent : ''));
      }
      for (const s of this.state.services) {
        out.push('    service ' + s.id + (s.icon ? '(' + s.icon + ')' : '') + (s.label ? '[' + s.label + ']' : '') + (s.parent ? ' in ' + s.parent : ''));
      }
      for (const e of this.state.edges) {
        out.push('    ' + e.from + ':' + e.fromSide + ' --> ' + e.toSide + ':' + e.to);
      }
      return out.join('\n');
    }
    _sections() {
      const self = this;
      const sideOpts = ['L', 'R', 'T', 'B'].map(v => ({ value: v, label: v }));
      const groupOpts = () => [{ value: '', label: '(ルート)' }, ...self.state.groups.map(g => ({ value: g.id, label: g.id }))];
      const allNodes = () => [...self.state.services, ...self.state.groups].map(n => ({ value: n.id, label: n.id }));
      // Built-in icons supported by Mermaid architecture-beta out of the box.
      // Reference: https://mermaid.js.org/syntax/architecture.html#icons
      // Additional packs (logos:, mdi:, etc.) require `mermaid.registerIconPacks()`
      // with a loader that fetches the JSON pack — webview CSP currently blocks
      // external fetches, so only the built-ins are exposed.
      const ICONS = [
        { value: 'cloud', label: 'cloud (☁️ クラウド)' },
        { value: 'database', label: 'database (🗄️ データベース)' },
        { value: 'disk', label: 'disk (💽 ディスク)' },
        { value: 'internet', label: 'internet (🌐 インターネット)' },
        { value: 'server', label: 'server (🖥️ サーバ)' }
      ];
      const iconOpts = (extra) => {
        const list = ICONS.slice();
        if (extra && !list.find(o => o.value === extra)) {
          list.unshift({ value: extra, label: extra + ' (カスタム)' });
        }
        return list;
      };
      return [
        {
          title: 'グループ (' + this.state.groups.length + ')',
          addLabel: 'グループ追加',
          items: this.state.groups,
          onAdd: async () => {
            const r = await _showDialog(self.container, {
              title: 'グループ追加',
              fields: [
                { key: 'id', label: 'ID', value: 'g1' },
                { key: 'icon', label: 'アイコン', type: 'select', options: iconOpts('cloud'), value: 'cloud' },
                { key: 'label', label: 'ラベル', value: '' },
                { key: 'parent', label: '親グループ', type: 'select', options: groupOpts(), value: '' }
              ]
            });
            if (!r) return;
            self.state.groups.push(r);
          },
          renderItem: (g, i, host) => {
            self._itemRow(host, '📁 ' + g.id + (g.label ? ' [' + g.label + ']' : ''),
              async () => {
                const r = await _showDialog(self.container, {
                  title: 'グループ編集',
                  fields: [
                    { key: 'id', label: 'ID', value: g.id },
                    { key: 'icon', label: 'アイコン', type: 'select', options: iconOpts(g.icon), value: g.icon || 'cloud' },
                    { key: 'label', label: 'ラベル', value: g.label },
                    { key: 'parent', label: '親', type: 'select', options: groupOpts(), value: g.parent }
                  ]
                });
                if (!r) return; Object.assign(g, r);
              },
              async () => { self.state.groups.splice(i, 1); }
            );
          }
        },
        {
          title: 'サービス (' + this.state.services.length + ')',
          addLabel: 'サービス追加',
          items: this.state.services,
          onAdd: async () => {
            const r = await _showDialog(self.container, {
              title: 'サービス追加',
              fields: [
                { key: 'id', label: 'ID', value: 'svc1' },
                { key: 'icon', label: 'アイコン', type: 'select', options: iconOpts('server'), value: 'server' },
                { key: 'label', label: 'ラベル', value: '' },
                { key: 'parent', label: '所属グループ', type: 'select', options: groupOpts(), value: '' }
              ]
            });
            if (!r) return;
            self.state.services.push(r);
          },
          renderItem: (s, i, host) => {
            self._itemRow(host, '⬢ ' + s.id + (s.label ? ' [' + s.label + ']' : ''),
              async () => {
                const r = await _showDialog(self.container, {
                  title: 'サービス編集',
                  fields: [
                    { key: 'id', label: 'ID', value: s.id },
                    { key: 'icon', label: 'アイコン', type: 'select', options: iconOpts(s.icon), value: s.icon || 'server' },
                    { key: 'label', label: 'ラベル', value: s.label },
                    { key: 'parent', label: '所属', type: 'select', options: groupOpts(), value: s.parent }
                  ]
                });
                if (!r) return; Object.assign(s, r);
              },
              async () => { self.state.services.splice(i, 1); }
            );
          }
        },
        {
          title: '接続 (' + this.state.edges.length + ')',
          addLabel: '接続追加',
          items: this.state.edges,
          onAdd: async () => {
            const opts = allNodes();
            if (opts.length < 1) return;
            const r = await _showDialog(self.container, {
              title: '接続追加',
              fields: [
                { key: 'from', label: 'From', type: 'select', options: opts, value: opts[0].value },
                { key: 'fromSide', label: 'From 側', type: 'select', options: sideOpts, value: 'R' },
                { key: 'toSide', label: 'To 側', type: 'select', options: sideOpts, value: 'L' },
                { key: 'to', label: 'To', type: 'select', options: opts, value: opts[opts.length - 1].value }
              ]
            });
            if (!r) return;
            self.state.edges.push(r);
          },
          renderItem: (e, i, host) => {
            self._itemRow(host, e.from + ':' + e.fromSide + ' → ' + e.toSide + ':' + e.to,
              async () => {
                const opts = allNodes();
                const r = await _showDialog(self.container, {
                  title: '接続編集',
                  fields: [
                    { key: 'from', label: 'From', type: 'select', options: opts, value: e.from },
                    { key: 'fromSide', label: 'From 側', type: 'select', options: sideOpts, value: e.fromSide },
                    { key: 'toSide', label: 'To 側', type: 'select', options: sideOpts, value: e.toSide },
                    { key: 'to', label: 'To', type: 'select', options: opts, value: e.to }
                  ]
                });
                if (!r) return; Object.assign(e, r);
              },
              async () => { self.state.edges.splice(i, 1); }
            );
          }
        }
      ];
    }

    // ─── Click-to-connect mode ─────────────────────────────────
    _render() {
      super._render();
      // Add connect-mode toggle next to the standard toolbar buttons
      if (this._toolbar && !this._connectBtn) {
        this._connectBtn = _el('button', 'mve-tool-btn');
        this._connectBtn.textContent = '🔗 接続モード';
        this._connectBtn.title = 'クリックで接続モード ON/OFF: SVG 上で From → To サービス/グループを順にクリック';
        this._connectBtn.addEventListener('click', () => this._toggleConnectMode());
        this._toolbar.appendChild(this._connectBtn);
        this._statusBar = _el('div', 'dve-status-bar');
        this._statusBar.style.display = 'none';
        this.container.insertBefore(this._statusBar, this._body);
      }
      this._refreshConnectBtn();
    }

    _refreshConnectBtn() {
      if (!this._connectBtn) return;
      this._connectBtn.classList.toggle('mve-active', !!this._connectMode);
      if (this._statusBar) {
        if (this._connectMode) {
          this._statusBar.style.display = '';
          this._statusBar.textContent = this._connectFrom
            ? '🔗 接続モード: 「' + this._connectFrom + '」→ 接続先をクリック'
            : '🔗 接続モード: SVG 上で接続元をクリック';
        } else {
          this._statusBar.style.display = 'none';
          this._statusBar.textContent = '';
        }
      }
    }

    _toggleConnectMode() {
      this._connectMode = !this._connectMode;
      this._connectFrom = null;
      this._refreshConnectBtn();
      this._renderPreview(this._generate());
    }

    _renderPreview(code) {
      super._renderPreview(code);
      // Wait for the async render to complete, then attach handlers
      setTimeout(() => this._attachSvgConnectHandlers(), 0);
      setTimeout(() => this._attachSvgConnectHandlers(), 200);
    }

    _attachSvgConnectHandlers() {
      const svgEl = this._svgArea && this._svgArea.querySelector('svg');
      if (!svgEl) return;
      svgEl.style.cursor = this._connectMode ? 'crosshair' : '';
      // Find <g> for each node by matching descendant <text>/<title>/foreignObject
      const nodeGroups = new Map();
      svgEl.querySelectorAll('g').forEach(g => {
        // architecture-beta sometimes also encodes the node id in data-* / id attributes
        const attrId = (g.getAttribute('data-id') || g.getAttribute('id') || '').trim();
        if (attrId) {
          const svc = this.state.services.find(s => attrId === s.id || attrId.endsWith('-' + s.id));
          const grp = !svc && this.state.groups.find(gr => attrId === gr.id || attrId.endsWith('-' + gr.id));
          const foundA = svc || grp;
          if (foundA) {
            if (!nodeGroups.has(foundA.id)) nodeGroups.set(foundA.id, new Set());
            nodeGroups.get(foundA.id).add(g);
            return;
          }
        }
        const texts = g.querySelectorAll('text, foreignObject, title');
        for (const t of texts) {
          const txt = (t.textContent || '').trim();
          if (!txt) continue;
          // Match against id or label
          const svc = this.state.services.find(s => s.id === txt || s.label === txt);
          const grp = !svc && this.state.groups.find(gr => gr.id === txt || gr.label === txt);
          const found = svc || grp;
          if (found) {
            if (!nodeGroups.has(found.id)) nodeGroups.set(found.id, new Set());
            nodeGroups.get(found.id).add(g);
            break;
          }
        }
      });
      // Keep only innermost matching <g> per node — drops ancestor wrappers
      // that would otherwise highlight the entire diagram.
      const allMatched = [];
      nodeGroups.forEach(set => set.forEach(g => allMatched.push(g)));
      nodeGroups.forEach((groupSet) => {
        const arr = Array.from(groupSet);
        const innermost = arr.filter(g => !allMatched.some(o => o !== g && g.contains(o)));
        groupSet.clear();
        innermost.forEach(g => groupSet.add(g));
      });
      nodeGroups.forEach((groupSet, nodeId) => {
        groupSet.forEach(g => {
          g.style.cursor = this._connectMode ? 'crosshair' : 'pointer';
          g.querySelectorAll('rect, polygon, path, circle, ellipse').forEach(shape => {
            shape.style.pointerEvents = 'all';
          });
          if (g.dataset.dveArchBound) {
            // Update highlight only
            g.style.filter = (this._connectMode && this._connectFrom === nodeId)
              ? 'drop-shadow(0 0 6px #00cc66)' : '';
            return;
          }
          g.dataset.dveArchBound = '1';
          g.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!this._connectMode) return;
            this._handleConnectClick(nodeId);
          });
          g.addEventListener('mouseenter', () => {
            if (this._connectMode) g.style.filter = 'brightness(1.3) drop-shadow(0 0 6px #007fd4)';
          });
          g.addEventListener('mouseleave', () => {
            g.style.filter = (this._connectMode && this._connectFrom === nodeId)
              ? 'drop-shadow(0 0 6px #00cc66)' : '';
          });
          if (this._connectMode && this._connectFrom === nodeId) {
            g.style.filter = 'drop-shadow(0 0 6px #00cc66)';
          }
        });
      });
    }

    async _handleConnectClick(nodeId) {
      if (!this._connectFrom) {
        this._connectFrom = nodeId;
        this._refreshConnectBtn();
        this._attachSvgConnectHandlers();
        return;
      }
      if (this._connectFrom === nodeId) {
        this._connectFrom = null;
        this._refreshConnectBtn();
        this._attachSvgConnectHandlers();
        return;
      }
      const fromId = this._connectFrom;
      this._connectFrom = null;
      const sideOpts = ['L', 'R', 'T', 'B'].map(v => ({ value: v, label: v }));
      const r = await _showDialog(this.container, {
        title: fromId + ' → ' + nodeId + ' の接続',
        fields: [
          { key: 'fromSide', label: 'From 側', type: 'select', options: sideOpts, value: 'R' },
          { key: 'toSide', label: 'To 側', type: 'select', options: sideOpts, value: 'L' }
        ]
      });
      if (r) {
        this.state.edges.push({ from: fromId, fromSide: r.fromSide, to: nodeId, toSide: r.toSide });
        this._renderListAndPreview();
      }
      this._refreshConnectBtn();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  KANBAN EDITOR
  // ═══════════════════════════════════════════════════════════════════════════
  class KanbanEditor extends GenericFormDiagramEditor {
    static template() {
      return 'kanban\n    Todo[ToDo]\n        task1[タスク1]\n        task2[タスク2]\n    Doing[進行中]\n        task3[タスク3]\n    Done[完了]';
    }
    _parse(code) {
      this.state.columns = [];
      const lines = code.split('\n');
      let cur = null;
      for (const ln of lines) {
        if (!ln.trim() || /^kanban/i.test(ln.trim())) continue;
        const indent = ln.search(/\S/);
        const t = ln.trim();
        const m = t.match(/^(\w+)(?:\[([^\]]+)\])?$/);
        if (!m) continue;
        if (indent <= 4) {
          cur = { id: m[1], label: m[2] || m[1], cards: [] };
          this.state.columns.push(cur);
        } else if (cur) {
          cur.cards.push({ id: m[1], label: m[2] || m[1] });
        }
      }
    }
    _generate() {
      const out = ['kanban'];
      for (const c of this.state.columns) {
        out.push('    ' + c.id + (c.label !== c.id ? '[' + c.label + ']' : ''));
        for (const card of c.cards) out.push('        ' + card.id + (card.label !== card.id ? '[' + card.label + ']' : ''));
      }
      return out.join('\n');
    }
    _sections() {
      const self = this;
      return [{
        title: 'カラム (' + this.state.columns.length + ')',
        addLabel: 'カラム追加',
        items: this.state.columns,
        onAdd: async () => {
          const r = await _showDialog(self.container, {
            title: 'カラム追加',
            fields: [{ key: 'id', label: 'ID', value: 'col' + (self.state.columns.length + 1) }, { key: 'label', label: 'ラベル', value: '新カラム' }]
          });
          if (!r) return;
          self.state.columns.push({ id: r.id, label: r.label, cards: [] });
        },
        renderItem: (col, ci, host) => {
          self._itemRow(host, '📋 ' + col.label + ' (' + col.cards.length + ')',
            async () => {
              const r = await _showDialog(self.container, {
                title: 'カラム編集',
                fields: [{ key: 'id', label: 'ID', value: col.id }, { key: 'label', label: 'ラベル', value: col.label }]
              });
              if (!r) return; col.id = r.id; col.label = r.label;
            },
            async () => { self.state.columns.splice(ci, 1); }
          );
          const addBtn = _el('button', 'dve-icon-btn');
          addBtn.textContent = '➕ カード追加';
          addBtn.style.fontSize = '11px';
          addBtn.addEventListener('click', async () => {
            const r = await _showDialog(self.container, {
              title: 'カード追加',
              fields: [{ key: 'id', label: 'ID', value: 'task' + Date.now().toString().slice(-4) }, { key: 'label', label: '内容', value: 'タスク' }]
            });
            if (!r) return; col.cards.push({ id: r.id, label: r.label });
            self._renderListAndPreview();
          });
          const addRow = _el('div', 'dve-list-subitem');
          addRow.style.paddingLeft = '20px';
          addRow.appendChild(addBtn);
          host.parentElement.appendChild(addRow);
          col.cards.forEach((card, ki) => {
            const r = _el('div', 'dve-list-subitem');
            r.style.paddingLeft = '20px';
            self._itemRow(r, '• ' + card.label,
              async () => {
                const dr = await _showDialog(self.container, {
                  title: 'カード編集',
                  fields: [{ key: 'id', label: 'ID', value: card.id }, { key: 'label', label: '内容', value: card.label }]
                });
                if (!dr) return; card.id = dr.id; card.label = dr.label;
              },
              async () => { col.cards.splice(ki, 1); }
            );
            host.parentElement.appendChild(r);
          });
        }
      }];
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Detection helpers
  // ═══════════════════════════════════════════════════════════════════════════
  function _firstLine(code) { return (code || '').trim().split('\n')[0].trim(); }
  function isStateDiagram(code) { return /^stateDiagram(?:-v2)?\b/.test(_firstLine(code)); }
  function isPieChart(code) { return /^pie\b/.test(_firstLine(code)); }
  function isJourney(code) { return /^journey\b/.test(_firstLine(code)); }
  function isGitGraph(code) { return /^gitGraph\b/i.test(_firstLine(code)); }
  function isTimeline(code) { return /^timeline\b/.test(_firstLine(code)); }
  function isRequirement(code) { return /^requirement(?:Diagram)?\b/.test(_firstLine(code)); }
  function isC4(code) { return /^C4(Context|Container|Component|Dynamic|Deployment)\b/.test(_firstLine(code)); }
  function isSankey(code) { return /^sankey(?:-beta)?\b/i.test(_firstLine(code)); }
  function isXYChart(code) { return /^xychart(?:-beta)?\b/i.test(_firstLine(code)); }
  function isBlock(code) { return /^block(?:-beta)?\b/i.test(_firstLine(code)); }
  function isZenUml(code) { return /^zenuml\b/i.test(_firstLine(code)); }
  function isPacket(code) { return /^packet(?:-beta)?\b/i.test(_firstLine(code)); }
  function isArchitecture(code) { return /^architecture(?:-beta)?\b/i.test(_firstLine(code)); }
  function isKanban(code) { return /^kanban\b/i.test(_firstLine(code)); }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Per-editor onboarding hints (shown once, dismissible)
  // ═══════════════════════════════════════════════════════════════════════════
  StateDiagramEditor.onboarding = { title: '状態遷移図エディタ', hints: [
    '<b>➕ 状態</b> で状態を追加、<b>➕ 遷移</b> で状態間の矢印を追加します。',
    '<code>[*]</code> は開始 / 終了の特殊状態です。遷移の元・先に使えます。',
  ]};
  PieChartEditor.onboarding = { title: 'パイチャートエディタ', hints: [
    '<b>📊 表で編集</b> モード（既定）でラベルと値を Excel 風に編集できます。',
    '<b>➕ スライス</b> でラベルと数値を追加します。比率は自動計算されます。',
  ]};
  PieChartEditor.defaultTableMode = true;
  JourneyEditor.onboarding = { title: 'ユーザージャーニーエディタ', hints: [
    'まず <b>➕ セクション</b> で章を作り、続けて <b>➕ ステップ</b> で項目を追加します。',
    'スコアは 1〜5 で気分／満足度を表します。',
  ]};
  GitGraphEditor.onboarding = { title: 'Git グラフエディタ', hints: [
    'コミット・ブランチ・チェックアウト・マージを順序通りに並べてください。',
  ]};
  TimelineEditor.onboarding = { title: 'タイムラインエディタ', hints: [
    '<b>➕ セクション</b> で時代区分、<b>➕ イベント</b> で出来事を追加します。',
  ]};
  RequirementEditor.onboarding = { title: '要求図エディタ', hints: [
    '値に日本語やスペースを含む場合は自動的に <code>"…"</code> で囲まれます。',
    '関係は <code>src - 種類 -&gt; dst</code> 形式（例: satisfies, traces）。',
  ]};
  C4Editor.onboarding = { title: 'C4 図エディタ', hints: [
    '<b>Person / System / Container</b> を追加し、<b>Rel</b> で関係を結びます。',
  ]};
  SankeyEditor.onboarding = { title: 'Sankey 図エディタ', hints: [
    '各行は <code>送信元, 受信先, 数値</code> の流量を表します。',
  ]};
  XYChartEditor.onboarding = { title: 'XY チャートエディタ', hints: [
    '<b>📊 表で編集</b> モード（既定）でカテゴリ × シリーズ値を Excel 風に編集できます。',
    '<b>X 軸</b>はカテゴリ配列、<b>Y 軸</b>は数値の最小〜最大、データは bar / line で追加します。',
  ]};
  XYChartEditor.defaultTableMode = true;
  BlockDiagramEditor.onboarding = { title: 'ブロック図エディタ', hints: [
    '<code>columns N</code> で列数を決め、各ブロックを並べて配置します。',
  ]};
  ZenUmlEditor.onboarding = { title: 'ZenUML エディタ', hints: [
    'ZenUML はバンドルに含まれていないため、現状ではコード編集のみ動作します。',
  ]};
  PacketEditor.onboarding = { title: 'パケット図エディタ', hints: [
    '各行は <code>開始ビット-終了ビット: "ラベル"</code> の形式で記述します。',
  ]};
  ArchitectureEditor.onboarding = { title: 'アーキテクチャ図エディタ', hints: [
    '<b>group</b> でグループを作り、その中に <b>service</b> を配置、<b>edge</b> で接続します。',
  ]};
  KanbanEditor.onboarding = { title: 'Kanban エディタ', hints: [
    '<b>➕ 列</b> でステータス列を作り、<b>➕ タスク</b> で各列にタスクを追加します。',
  ]};

  // ═══════════════════════════════════════════════════════════════════════════
  //  Exports
  // ═══════════════════════════════════════════════════════════════════════════
  window.StateDiagramEditor = StateDiagramEditor;
  window.PieChartEditor = PieChartEditor;
  window.JourneyEditor = JourneyEditor;
  window.GitGraphEditor = GitGraphEditor;
  window.TimelineEditor = TimelineEditor;
  window.RequirementEditor = RequirementEditor;
  window.C4Editor = C4Editor;
  window.SankeyEditor = SankeyEditor;
  window.XYChartEditor = XYChartEditor;
  window.BlockDiagramEditor = BlockDiagramEditor;
  window.ZenUmlEditor = ZenUmlEditor;
  window.PacketEditor = PacketEditor;
  window.ArchitectureEditor = ArchitectureEditor;
  window.KanbanEditor = KanbanEditor;

  window.ExtraDiagramUtils = {
    isStateDiagram, isPieChart, isJourney, isGitGraph, isTimeline,
    isRequirement, isC4, isSankey, isXYChart, isBlock, isZenUml,
    isPacket, isArchitecture, isKanban
  };
})();

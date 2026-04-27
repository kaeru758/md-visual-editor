/**
 * Visual Editors for Class, Sequence, Table, Mindmap, Quadrant, Gantt.
 * v4: Diagram-first layout with large SVG preview area.
 *     Sequence: drag actor→actor to add messages, SVG click→list highlight.
 *     Class: SVG click-to-connect classes directly on diagram.
 *     All editors: collapsible list/config panel below the SVG.
 */
(function () {
  'use strict';

  // ─── Dialog position capture (for positioning dialogs near dblclick) ───
  let _dialogPosition = null;
  document.addEventListener('dblclick', (e) => {
    _dialogPosition = { clientX: e.clientX, clientY: e.clientY };
  }, true); // capture phase — fires before target handlers

  // ─── DOM helpers ───
  function _el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
  function _elText(tag, text, cls) { const e = _el(tag, cls); e.textContent = text; return e; }
  function _escHtml(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

  // ─── Inline Edit ───
  function _inlineEdit(parentEl, currentValue, onSave, opts) {
    opts = opts || {};
    const input = _el('input', 'inline-edit-input');
    input.type = opts.type || 'text';
    input.value = currentValue;
    if (opts.placeholder) input.placeholder = opts.placeholder;
    if (opts.width) input.style.width = opts.width;
    const saved = { done: false };
    const originalHTML = parentEl.innerHTML;
    parentEl.innerHTML = '';
    parentEl.appendChild(input);
    input.focus(); input.select();
    const commit = () => {
      if (saved.done) return; saved.done = true;
      const v = input.value.trim();
      if (v && v !== currentValue) onSave(v);
      else parentEl.innerHTML = originalHTML;
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { e.preventDefault(); saved.done = true; parentEl.innerHTML = originalHTML; }
    });
    input.addEventListener('blur', () => setTimeout(commit, 120));
  }

  // ─── D&D reorder helper ───
  function _makeDraggable(item, type, index, inst, listName) {
    item.draggable = true;
    const handle = _el('span', 'dnd-handle'); handle.textContent = '⠿';
    item.insertBefore(handle, item.firstChild);
    item.addEventListener('dragstart', (e) => {
      inst._dragData = { type, index }; item.classList.add('dnd-dragging');
      e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', '');
    });
    item.addEventListener('dragend', () => {
      item.classList.remove('dnd-dragging'); inst._dragData = null;
      const list = item.closest('.dve-list-panel');
      if (list) list.querySelectorAll('.dnd-over, .dnd-over-above, .dnd-over-below').forEach(el =>
        el.classList.remove('dnd-over', 'dnd-over-above', 'dnd-over-below'));
    });
    item.addEventListener('dragover', (e) => {
      const dd = inst._dragData; if (!dd || dd.type !== type) return;
      e.preventDefault(); e.dataTransfer.dropEffect = 'move';
      const rect = item.getBoundingClientRect(); const mid = rect.top + rect.height / 2;
      item.classList.remove('dnd-over-above', 'dnd-over-below');
      item.classList.add(e.clientY < mid ? 'dnd-over-above' : 'dnd-over-below', 'dnd-over');
    });
    item.addEventListener('dragleave', (e) => {
      if (!item.contains(e.relatedTarget)) item.classList.remove('dnd-over', 'dnd-over-above', 'dnd-over-below');
    });
    item.addEventListener('drop', (e) => {
      e.preventDefault(); item.classList.remove('dnd-over', 'dnd-over-above', 'dnd-over-below');
      const dd = inst._dragData; if (!dd || dd.type !== type) return;
      const from = dd.index; const rect = item.getBoundingClientRect(); const mid = rect.top + rect.height / 2;
      let to = index; if (e.clientY >= mid && to < inst[listName].length - 1) to++;
      if (from !== to) {
        const list = inst[listName]; const [moved] = list.splice(from, 1);
        if (to > from) to--; list.splice(to, 0, moved); inst._render();
      }
    });
  }

  // ─── Dialog helpers ───
  function _showDialog(container, config) {
    return new Promise((resolve) => {
      const existing = container.querySelector('.ve-dialog-overlay'); if (existing) existing.remove();
      const overlay = _el('div', 've-dialog-overlay');
      const dialog = _el('div', 've-dialog');
      if (config.title) dialog.appendChild(_elText('div', config.title, 've-dialog-title'));
      const form = _el('div', 've-dialog-form'); const inputs = {};
      for (const field of (config.fields || [])) {
        const row = _el('div', 've-dialog-field');
        if (field.label) row.appendChild(_elText('label', field.label, 've-dialog-label'));
        if (field.type === 'select') {
          const select = _el('select', 've-dialog-input');
          for (const opt of (field.options || [])) {
            const o = document.createElement('option'); o.value = opt.value; o.textContent = opt.label;
            if (String(opt.value) === String(field.value)) o.selected = true; select.appendChild(o);
          }
          inputs[field.key] = select; row.appendChild(select);
        } else {
          const input = _el('input', 've-dialog-input');
          input.type = field.type || 'text';
          input.value = field.value !== undefined ? String(field.value) : '';
          if (field.placeholder) input.placeholder = field.placeholder;
          if (field.step) input.step = field.step;
          if (field.min !== undefined) input.min = String(field.min);
          if (field.max !== undefined) input.max = String(field.max);
          inputs[field.key] = input; row.appendChild(input);
        }
        form.appendChild(row);
      }
      dialog.appendChild(form);
      const actions = _el('div', 've-dialog-actions');
      if (config.cancelLabel !== null) {
        const cancelBtn = _el('button', 've-dialog-cancel');
        cancelBtn.textContent = config.cancelLabel || 'キャンセル';
        cancelBtn.addEventListener('click', () => { overlay.remove(); resolve(null); });
        actions.appendChild(cancelBtn);
      }
      if (config.deleteLabel) {
        const delBtn = _el('button', 've-dialog-cancel');
        delBtn.textContent = config.deleteLabel;
        delBtn.style.color = '#f44'; delBtn.style.marginRight = 'auto';
        delBtn.addEventListener('click', () => { overlay.remove(); resolve({ __delete: true }); });
        actions.appendChild(delBtn);
      }
      const okBtn = _el('button', 've-dialog-ok'); okBtn.textContent = config.okLabel || 'OK';
      okBtn.addEventListener('click', () => {
        const result = {}; for (const f of (config.fields || [])) result[f.key] = inputs[f.key].value;
        overlay.remove(); resolve(result);
      });
      actions.appendChild(okBtn); dialog.appendChild(actions); overlay.appendChild(dialog);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) { overlay.remove(); resolve(null); } });
      dialog.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
          e.preventDefault(); const r = {};
          for (const f of (config.fields || [])) r[f.key] = inputs[f.key].value;
          overlay.remove(); resolve(r);
        }
        if (e.key === 'Escape') { e.preventDefault(); overlay.remove(); resolve(null); }
      });
      container.appendChild(overlay);
      // Position near dblclick if available
      const pos = _dialogPosition;
      _dialogPosition = null;
      if (pos) {
        overlay.style.alignItems = 'flex-start';
        overlay.style.justifyContent = 'flex-start';
        dialog.style.position = 'absolute';
        const oRect = overlay.getBoundingClientRect();
        let x = pos.clientX - oRect.left;
        let y = pos.clientY - oRect.top;
        const dw = dialog.offsetWidth || 320;
        const dh = dialog.offsetHeight || 200;
        x = Math.max(10, Math.min(x - dw / 2, oRect.width - dw - 10));
        y = Math.max(10, Math.min(y - 10, oRect.height - dh - 10));
        dialog.style.left = x + 'px';
        dialog.style.top = y + 'px';
      }
      const fi = dialog.querySelector('input, select'); if (fi) { fi.focus(); if (fi.select) fi.select(); }
    });
  }

  function _showAlert(container, message) {
    return new Promise((resolve) => {
      const existing = container.querySelector('.ve-dialog-overlay'); if (existing) existing.remove();
      const overlay = _el('div', 've-dialog-overlay'); const dialog = _el('div', 've-dialog');
      dialog.appendChild(_elText('div', message, 've-dialog-title'));
      const actions = _el('div', 've-dialog-actions');
      const okBtn = _el('button', 've-dialog-ok'); okBtn.textContent = 'OK';
      okBtn.addEventListener('click', () => { overlay.remove(); resolve(); });
      actions.appendChild(okBtn); dialog.appendChild(actions); overlay.appendChild(dialog);
      container.appendChild(overlay);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) { overlay.remove(); resolve(); } });
      dialog.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); overlay.remove(); resolve(); } });
      okBtn.focus();
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  ZOOM MIXIN — Shared zoom/fit for all diagram editors
  // ═══════════════════════════════════════════════════════════════
  function _initZoom(editor) {
    editor._zoomLevel = 1.0;
    editor._zoomMin = 0.2;
    editor._zoomMax = 3.0;
    editor._zoomStep = 0.15;
    editor._initialRender = true;
  }

  function _addZoomControls(toolbar, editor) {
    const section = _el('span', 'dve-zoom-section');

    const zoomInBtn = _el('button', 'mve-tool-btn dve-zoom-btn');
    zoomInBtn.innerHTML = '🔍+';
    zoomInBtn.title = '拡大 (Ctrl+マウスホイール↑)';
    zoomInBtn.addEventListener('click', () => _zoomIn(editor));
    section.appendChild(zoomInBtn);

    const zoomOutBtn = _el('button', 'mve-tool-btn dve-zoom-btn');
    zoomOutBtn.innerHTML = '🔍−';
    zoomOutBtn.title = '縮小 (Ctrl+マウスホイール↓)';
    zoomOutBtn.addEventListener('click', () => _zoomOut(editor));
    section.appendChild(zoomOutBtn);

    const zoomFitBtn = _el('button', 'mve-tool-btn dve-zoom-btn');
    zoomFitBtn.innerHTML = '⊞ フィット';
    zoomFitBtn.title = 'ダイアグラムを表示領域に合わせる';
    zoomFitBtn.addEventListener('click', () => _zoomFit(editor));
    section.appendChild(zoomFitBtn);

    editor._zoomLabel = _elText('span', '100%', 'dve-zoom-label');
    section.appendChild(editor._zoomLabel);

    toolbar.appendChild(section);
  }

  function _attachZoomWheel(editor) {
    if (!editor._svgArea) return;
    editor._svgArea.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      if (e.deltaY < 0) _zoomIn(editor); else _zoomOut(editor);
    }, { passive: false });
  }

  function _applyZoom(editor) {
    const svg = editor._svgArea ? editor._svgArea.querySelector('svg') : null;
    if (!svg) return;
    if (editor._zoomLevel === 1.0) {
      svg.style.transform = '';
      svg.style.maxWidth = '100%';
    } else {
      svg.style.maxWidth = 'none';
      svg.style.transform = 'scale(' + editor._zoomLevel + ')';
    }
    svg.style.transformOrigin = 'top center';
    if (editor._zoomLabel) {
      editor._zoomLabel.textContent = Math.round(editor._zoomLevel * 100) + '%';
    }
  }

  function _zoomIn(editor) {
    editor._zoomLevel = Math.min(editor._zoomMax, editor._zoomLevel + editor._zoomStep);
    _applyZoom(editor);
  }

  function _zoomOut(editor) {
    editor._zoomLevel = Math.max(editor._zoomMin, editor._zoomLevel - editor._zoomStep);
    _applyZoom(editor);
  }

  function _zoomFit(editor) {
    const svg = editor._svgArea ? editor._svgArea.querySelector('svg') : null;
    if (!svg) { editor._zoomLevel = 1.0; _applyZoom(editor); return; }
    svg.style.transform = 'none';
    svg.style.maxWidth = '100%';
    const svgRect = svg.getBoundingClientRect();
    const areaRect = editor._svgArea.getBoundingClientRect();
    const padH = 32, padV = 32;
    const availW = areaRect.width - padH;
    const availH = areaRect.height - padV;
    if (svgRect.width <= 0 || svgRect.height <= 0) {
      editor._zoomLevel = 1.0;
    } else {
      const scaleW = availW / svgRect.width;
      const scaleH = availH / svgRect.height;
      editor._zoomLevel = Math.max(editor._zoomMin, Math.min(editor._zoomMax, Math.min(scaleW, scaleH)));
    }
    _applyZoom(editor);
  }

  /** Call after SVG render; auto-fits on first render only when the diagram
   *  overflows the area, otherwise keeps natural 100% so users don't get a
   *  surprise zoom-in on small diagrams. */
  function _postRenderZoom(editor) {
    if (editor._initialRender) {
      editor._initialRender = false;
      try {
        const svg = editor._svgArea ? editor._svgArea.querySelector('svg') : null;
        if (!svg) { _applyZoom(editor); return; }
        svg.style.transform = 'none';
        const r = svg.getBoundingClientRect();
        const areaRect = editor._svgArea.getBoundingClientRect();
        if (r.width > areaRect.width - 16 || r.height > areaRect.height - 16) {
          _zoomFit(editor);
        } else {
          editor._zoomLevel = 1.0;
          _applyZoom(editor);
        }
      } catch (_e) {
        _applyZoom(editor);
      }
    } else {
      _applyZoom(editor);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  UNDO STACK — Shared undo/redo for all diagram editors
  // ═══════════════════════════════════════════════════════════════
  class _UndoStack {
    constructor() { this._stack = []; this._index = -1; }
    push(state) {
      this._index++;
      this._stack.length = this._index;
      this._stack.push(JSON.stringify(state));
    }
    canUndo() { return this._index > 0; }
    canRedo() { return this._index < this._stack.length - 1; }
    undo() { if (!this.canUndo()) return null; this._index--; return JSON.parse(this._stack[this._index]); }
    redo() { if (!this.canRedo()) return null; this._index++; return JSON.parse(this._stack[this._index]); }
  }

  /** Mixin: adds undo/redo + Delete key support to a diagram editor.
   *  Requires: editor._snapshot(), editor._restoreSnapshot(snap), editor._render(),
   *            editor.container, editor._setStatus (optional).
   *  Optional: editor._deleteSelected() for Delete key support.
   */
  function _initUndoKeyboard(editor) {
    editor._undo = new _UndoStack();
    editor._keyHandler = (e) => {
      if (!editor.container.offsetParent) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'z' && e.ctrlKey && !e.shiftKey) {
        e.preventDefault(); editor._doUndo();
      } else if ((e.key === 'y' && e.ctrlKey) || (e.key === 'z' && e.ctrlKey && e.shiftKey)) {
        e.preventDefault(); editor._doRedo();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && editor._deleteSelected) {
        e.preventDefault(); editor._deleteSelected();
      } else if (e.key === 'Escape' && editor._cancelRectSelect) {
        editor._cancelRectSelect();
      }
    };
    document.addEventListener('keydown', editor._keyHandler);
  }

  function _destroyUndoKeyboard(editor) {
    if (editor._keyHandler) document.removeEventListener('keydown', editor._keyHandler);
  }

  function _commitUndo(editor) {
    if (editor._undo && editor._snapshot) editor._undo.push(editor._snapshot());
  }

  // ═══════════════════════════════════════════════════════════════
  //  SEQUENCE DIAGRAM VISUAL EDITOR
  //  - Diagram-first layout: large SVG on top, collapsible list below
  //  - Drag actor → actor in SVG to create new message
  //  - Click message line/text in SVG → highlight list item
  //  - D&D reordering in list
  // ═══════════════════════════════════════════════════════════════
  class SequenceDiagramEditor {
    constructor(container, code, onChange) {
      this.container = container;
      this.onChange = onChange;
      this.participants = [];
      this.messages = [];
      this._dragData = null;
      this._highlightedMsgIdx = -1;
      this._highlightedPartIdx = -1;
      this._svgDrag = null;
      this._rectSelectMode = null; // null | { color, startIdx }
      _initZoom(this);
      _initUndoKeyboard(this);
      this._parse(code);
      this._buildUI();
      this._render();
    }
    destroy() { _destroyUndoKeyboard(this); this.container.innerHTML = ''; }
    getCode() { return this._generate(); }

    _snapshot() { return { participants: JSON.parse(JSON.stringify(this.participants)), messages: JSON.parse(JSON.stringify(this.messages)) }; }
    _restoreSnapshot(snap) { this.participants = snap.participants; this.messages = snap.messages; }
    _doUndo() { const s = this._undo.undo(); if (s) { this._restoreSnapshot(s); this._render(true); } }
    _doRedo() { const s = this._undo.redo(); if (s) { this._restoreSnapshot(s); this._render(true); } }
    _deleteSelected() {
      if (this._highlightedMsgIdx >= 0) {
        this.messages.splice(this._highlightedMsgIdx, 1);
        this._highlightedMsgIdx = -1; this._render();
      } else if (this._highlightedPartIdx >= 0) {
        this._deleteParticipant(this._highlightedPartIdx);
      }
    }

    _parse(code) {
      this.participants = []; this.messages = [];
      const lines = code.split('\n');
      for (const line of lines) {
        const t = line.trim();
        if (!t || t === 'sequenceDiagram' || t.startsWith('%%')) continue;
        const partMatch = t.match(/^(?:participant|actor)\s+(\S+?)(?:\s+as\s+(.+))?$/);
        if (partMatch) { this._ensureParticipant(partMatch[1], partMatch[2] || ''); continue; }

        const msgPatterns = [
          { re: /^(\S+)\s*->>>\s*(\S+)\s*:\s*(.+)$/, type: 'solidArrowAsync' },
          { re: /^(\S+)\s*-->>\s*(\S+)\s*:\s*(.+)$/, type: 'dottedArrow' },
          { re: /^(\S+)\s*->>\s*(\S+)\s*:\s*(.+)$/, type: 'solidArrow' },
          { re: /^(\S+)\s*-->\s*(\S+)\s*:\s*(.+)$/, type: 'dottedLine' },
          { re: /^(\S+)\s*->\s*(\S+)\s*:\s*(.+)$/, type: 'solidLine' },
          { re: /^(\S+)\s*-x\s*(\S+)\s*:\s*(.+)$/i, type: 'cross' },
          { re: /^(\S+)\s*-\)\s*(\S+)\s*:\s*(.+)$/, type: 'async' },
        ];
        let matched = false;
        for (const mp of msgPatterns) {
          const m = t.match(mp.re);
          if (m) {
            this._ensureParticipant(m[1]); this._ensureParticipant(m[2]);
            this.messages.push({ from: m[1], to: m[2], type: mp.type, text: m[3].trim() });
            matched = true; break;
          }
        }
        if (matched) continue;
        const noteMatch = t.match(/^Note\s+(right of|left of|over)\s+(\S+?)(?:,\s*(\S+))?\s*:\s*(.+)$/i);
        if (noteMatch) {
          this.messages.push({ from: '__note__', to: noteMatch[2], type: 'note', text: noteMatch[4].trim(), notePosition: noteMatch[1].toLowerCase() });
          continue;
        }
        // rect blocks: "rect rgb(...)" or "rect rgba(...)" → store as pseudo-messages
        const rectMatch = t.match(/^rect\s+(rgb[a]?\([^)]+\))\s*$/i);
        if (rectMatch) {
          this.messages.push({ type: 'rect_start', rectColor: rectMatch[1], text: '', from: '', to: '' });
          continue;
        }
        if (t.toLowerCase() === 'end') {
          this.messages.push({ type: 'rect_end', text: '', from: '', to: '' });
          continue;
        }
      }
    }

    _ensureParticipant(name, alias) {
      if (!this.participants.find(p => p.name === name)) {
        this.participants.push({ name, alias: alias || '' });
      } else if (alias) {
        const p = this.participants.find(p => p.name === name);
        if (p && !p.alias) p.alias = alias;
      }
    }

    _displayName(name) {
      const p = this.participants.find(pp => pp.name === name);
      return p ? (p.alias || p.name) : name;
    }

    _participantOpts() {
      return this.participants.map(p => ({ value: p.name, label: p.alias ? p.alias + ' (' + p.name + ')' : p.name }));
    }

    _generate() {
      const lines = ['sequenceDiagram'];
      for (const p of this.participants) {
        lines.push(p.alias ? '    participant ' + p.name + ' as ' + p.alias : '    participant ' + p.name);
      }
      const syn = { solidArrow: '->>', dottedArrow: '-->>', solidLine: '->', dottedLine: '-->', cross: '-x', async: '-)', solidArrowAsync: '->>>' };
      let rectDepth = 0;
      for (const msg of this.messages) {
        if (msg.type === 'rect_start') {
          const indent = '    '.repeat(rectDepth + 1);
          lines.push(indent + 'rect ' + (msg.rectColor || 'rgb(40, 60, 80)'));
          rectDepth++;
          continue;
        }
        if (msg.type === 'rect_end') {
          rectDepth = Math.max(0, rectDepth - 1);
          const indent = '    '.repeat(rectDepth + 1);
          lines.push(indent + 'end');
          continue;
        }
        const pad = '    '.repeat(rectDepth + 1);
        if (msg.type === 'note') {
          lines.push(pad + 'Note ' + (msg.notePosition || 'right of') + ' ' + msg.to + ': ' + msg.text);
        } else {
          lines.push(pad + msg.from + (syn[msg.type] || '->>') + msg.to + ': ' + msg.text);
        }
      }
      return lines.join('\n');
    }

    _buildUI() {
      this.container.innerHTML = '';
      this.container.classList.add('dve-root');
      // ── Toolbar ──
      const toolbar = _el('div', 'dve-toolbar');
      const addPartBtn = _el('button', 'mve-tool-btn'); addPartBtn.textContent = '👤 参加者追加';
      addPartBtn.addEventListener('click', () => this._addParticipant());
      toolbar.appendChild(addPartBtn);
      const addMsgBtn = _el('button', 'mve-tool-btn'); addMsgBtn.textContent = '💬 メッセージ追加';
      addMsgBtn.addEventListener('click', () => this._addMessage());
      toolbar.appendChild(addMsgBtn);
      const addNoteBtn = _el('button', 'mve-tool-btn'); addNoteBtn.textContent = '📝 ノート追加';
      addNoteBtn.addEventListener('click', () => this._addNote());
      toolbar.appendChild(addNoteBtn);
      const addRectBtn = _el('button', 'mve-tool-btn'); addRectBtn.textContent = '🟦 ブロック追加';
      addRectBtn.addEventListener('click', () => this._startRectSelect());
      toolbar.appendChild(addRectBtn);
      this._addRectBtn = addRectBtn;
      toolbar.appendChild(_elText('span', '図上で参加者間をドラッグしてメッセージ追加', 'dve-hint'));

      const undoBtn = _el('button', 'mve-tool-btn'); undoBtn.textContent = '↩ 元に戻す';
      undoBtn.addEventListener('click', () => this._doUndo());
      toolbar.appendChild(undoBtn);
      const redoBtn = _el('button', 'mve-tool-btn'); redoBtn.textContent = '↪ やり直し';
      redoBtn.addEventListener('click', () => this._doRedo());
      toolbar.appendChild(redoBtn);

      _addZoomControls(toolbar, this);
      this.container.appendChild(toolbar);

      // ── Status bar ──
      this._statusBar = _el('div', 'dve-status');
      this._statusBar.style.display = 'none';
      this.container.appendChild(this._statusBar);

      // ── Body: list (left 20%) + SVG (right 80%) ──
      const body = _el('div', 'dve-body');

      // ── List panel (left) ──
      this._listPanel = _el('div', 'dve-list-panel');
      body.appendChild(this._listPanel);

      // ── SVG preview (main area) ──
      this._svgArea = _el('div', 'dve-svg-area');
      _attachZoomWheel(this);
      body.appendChild(this._svgArea);

      this.container.appendChild(body);
    }

    _setStatus(text) {
      this._statusBar.textContent = text;
      this._statusBar.style.display = text ? '' : 'none';
    }

    async _render(skipUndo) {
      if (!skipUndo) _commitUndo(this);
      const code = this._generate();
      this.onChange(code);
      this._renderList();
      await this._renderSvg(code);
    }

    async _renderSvg(code) {
      try {
        const id = 'seq-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
        const { svg } = await mermaid.render(id, code);
        this._svgArea.innerHTML = svg;
        _postRenderZoom(this);
        this._attachSvgEvents();
      } catch (err) {
        this._svgArea.innerHTML = '<div class="mermaid-error">プレビューエラー:<br>' + _escHtml(String(err)) + '</div>';
      }
    }

    // ── SVG interaction: actor drag + message/actor click ──
    _attachSvgEvents() {
      const svgEl = this._svgArea.querySelector('svg');
      if (!svgEl) return;

      // Ensure pointer events work
      svgEl.style.pointerEvents = 'all';
      svgEl.style.cursor = 'default';

      // Map actor positions from SVG
      this._actorPositions = this._mapActorPositions(svgEl);

      // Click on actor boxes → highlight in list
      // Mermaid v10: the <g> parent does NOT have class="actor";
      // instead <rect class="actor ..."> and <text class="actor"> are inside the <g>.
      const actorRects = svgEl.querySelectorAll('rect[class*="actor"]');
      const processedGroups = new Set();
      actorRects.forEach((rect) => {
        const ag = rect.closest('g') || rect.parentElement;
        if (!ag || processedGroups.has(ag)) return;
        processedGroups.add(ag);

        ag.style.cursor = 'pointer';
        const actorText = this._getActorTextFromGroup(ag);
        const pIdx = this._findParticipantByDisplayName(actorText);

        ag.addEventListener('mouseenter', () => {
          ag.style.filter = 'brightness(1.2) drop-shadow(0 0 4px #007fd4)';
        });
        ag.addEventListener('mouseleave', () => {
          if (this._highlightedPartIdx !== pIdx) ag.style.filter = '';
          else ag.style.filter = 'drop-shadow(0 0 4px #007fd4)';
        });
        ag.addEventListener('click', (e) => {
          e.stopPropagation();
          if (pIdx >= 0) {
            this._highlightedPartIdx = pIdx;
            this._highlightedMsgIdx = -1;
            this._highlightListItem();
            this._setStatus('参加者: ' + (this.participants[pIdx].alias || this.participants[pIdx].name));
          }
        });
        ag.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          if (pIdx >= 0) this._editParticipant(pIdx);
        });
        ag.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (pIdx < 0 || !window.DiagramCommon) return;
          this._highlightedPartIdx = pIdx;
          this._highlightedMsgIdx = -1;
          this._highlightListItem();
          window.DiagramCommon.showContextMenu(e.clientX, e.clientY, [
            { label: '✎ 参加者を編集', onClick: () => this._editParticipant(pIdx) },
            'separator',
            { label: '🗑 この参加者を削除', danger: true, onClick: () => this._deleteParticipant(pIdx) },
          ]);
        });
      });

      // Click on message lines → highlight in list
      // Mermaid v10 uses line.messageLine0, line.messageLine1, and also path elements
      const msgLines = svgEl.querySelectorAll('line[class*="messageLine"], path[class*="messageLine"]');
      const nonNoteMessages = this.messages.filter(m => m.type !== 'note' && m.type !== 'rect_start' && m.type !== 'rect_end');

      msgLines.forEach((ml, idx) => {
        if (idx >= nonNoteMessages.length) return;
        // Find the real index in this.messages
        const realIdx = this.messages.indexOf(nonNoteMessages[idx]);
        if (realIdx < 0) return;

        ml.style.cursor = 'pointer';
        ml.style.pointerEvents = 'stroke';
        const capturedIdx = realIdx;

        // Create wider invisible hit area for easier clicking
        let hitEl;
        if (ml.tagName === 'line') {
          hitEl = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          hitEl.setAttribute('x1', ml.getAttribute('x1'));
          hitEl.setAttribute('y1', ml.getAttribute('y1'));
          hitEl.setAttribute('x2', ml.getAttribute('x2'));
          hitEl.setAttribute('y2', ml.getAttribute('y2'));
        } else {
          hitEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          hitEl.setAttribute('d', ml.getAttribute('d'));
        }
        hitEl.setAttribute('stroke-width', '16');
        hitEl.setAttribute('stroke', 'transparent');
        hitEl.setAttribute('fill', 'none');
        hitEl.style.pointerEvents = 'stroke';
        hitEl.style.cursor = 'pointer';

        const makeClick = (ci) => (e) => {
          e.stopPropagation();
          if (this._rectSelectMode) {
            this._handleRectSelectClick(ci);
            return;
          }
          this._highlightedMsgIdx = ci;
          this._highlightedPartIdx = -1;
          this._highlightListItem();
          const m = this.messages[ci];
          this._setStatus('メッセージ: ' + this._displayName(m.from) + ' → ' + this._displayName(m.to) + ': ' + m.text + ' — ダブルクリックで編集');
        };
        const makeDblClick = (ci) => (e) => {
          e.stopPropagation();
          if (this._rectSelectMode) return;
          this._editMessage(ci);
        };

        hitEl.addEventListener('click', makeClick(capturedIdx));
        hitEl.addEventListener('dblclick', makeDblClick(capturedIdx));
        ml.addEventListener('click', makeClick(capturedIdx));
        ml.addEventListener('dblclick', makeDblClick(capturedIdx));
        const makeCtx = (ci) => (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (this._rectSelectMode || !window.DiagramCommon) return;
          this._highlightedMsgIdx = ci;
          this._highlightedPartIdx = -1;
          this._highlightListItem();
          window.DiagramCommon.showContextMenu(e.clientX, e.clientY, [
            { label: '✎ メッセージを編集', onClick: () => this._editMessage(ci) },
            { label: '↑ 上に移動', disabled: ci === 0, onClick: () => {
              const [m] = this.messages.splice(ci, 1); this.messages.splice(ci - 1, 0, m); this._render();
            }},
            { label: '↓ 下に移動', disabled: ci === this.messages.length - 1, onClick: () => {
              const [m] = this.messages.splice(ci, 1); this.messages.splice(ci + 1, 0, m); this._render();
            }},
            'separator',
            { label: '🗑 このメッセージを削除', danger: true, onClick: () => {
              this.messages.splice(ci, 1); this._render();
            }},
          ]);
        };
        hitEl.addEventListener('contextmenu', makeCtx(capturedIdx));
        ml.addEventListener('contextmenu', makeCtx(capturedIdx));
        if (ml.parentNode) ml.parentNode.appendChild(hitEl);
      });

      // Also handle message text labels
      const msgTexts = svgEl.querySelectorAll('.messageText');
      msgTexts.forEach((mt, idx) => {
        if (idx >= nonNoteMessages.length) return;
        const realIdx = this.messages.indexOf(nonNoteMessages[idx]);
        if (realIdx < 0) return;
        mt.style.cursor = 'pointer';
        mt.style.pointerEvents = 'all';
        const capturedIdx = realIdx;
        mt.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this._rectSelectMode) {
            this._handleRectSelectClick(capturedIdx);
            return;
          }
          this._highlightedMsgIdx = capturedIdx;
          this._highlightedPartIdx = -1;
          this._highlightListItem();
          this._setStatus('メッセージ: ' + this.messages[capturedIdx].from + ' → ' + this.messages[capturedIdx].to + ': ' + this.messages[capturedIdx].text);
        });
        mt.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          if (this._rectSelectMode) return;
          this._editMessage(capturedIdx);
        });
      });

      // ── Actor-to-actor drag to create new message ──
      const self = this;
      let dragLine = null;

      svgEl.addEventListener('mousedown', (e) => {
        // Don't start drag on interactive elements (actor boxes, buttons, etc.)
        if (e.target.closest && (e.target.closest('rect[class*="actor"]') || e.target.closest('text[class*="actor"]'))) return;
        // Only start drag if clicking near an actor lifeline
        const pt = self._svgPoint(svgEl, e);
        const fromActor = self._findNearestActor(pt.x, 60);
        if (!fromActor) return;
        self._svgDrag = { fromName: fromActor.name, fromX: fromActor.x, startY: pt.y };
        dragLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        dragLine.setAttribute('x1', String(fromActor.x));
        dragLine.setAttribute('y1', String(pt.y));
        dragLine.setAttribute('x2', String(fromActor.x));
        dragLine.setAttribute('y2', String(pt.y));
        dragLine.setAttribute('stroke', '#007fd4');
        dragLine.setAttribute('stroke-width', '2');
        dragLine.setAttribute('stroke-dasharray', '6,3');
        dragLine.style.pointerEvents = 'none';
        svgEl.appendChild(dragLine);
        self._setStatus('ドラッグ中: ' + fromActor.name + ' →');
        e.preventDefault();
      });

      svgEl.addEventListener('mousemove', (e) => {
        if (!self._svgDrag || !dragLine) return;
        const pt = self._svgPoint(svgEl, e);
        dragLine.setAttribute('x2', String(pt.x));
        dragLine.setAttribute('y2', String(pt.y));
        const toActor = self._findNearestActor(pt.x, 80);
        if (toActor && toActor.name !== self._svgDrag.fromName) {
          dragLine.setAttribute('x2', String(toActor.x));
          self._setStatus('ドラッグ中: ' + self._svgDrag.fromName + ' → ' + toActor.name);
        }
      });

      svgEl.addEventListener('mouseup', async (e) => {
        if (!self._svgDrag) return;
        if (dragLine) { dragLine.remove(); dragLine = null; }
        const pt = self._svgPoint(svgEl, e);
        const toActor = self._findNearestActor(pt.x, 80);
        const fromName = self._svgDrag.fromName;
        self._svgDrag = null;
        self._setStatus('');

        if (!toActor || toActor.name === fromName) return;

        const result = await _showDialog(self.container, {
          title: fromName + ' → ' + toActor.name,
          fields: [
            { key: 'text', label: 'メッセージ', type: 'text', value: '' },
            { key: 'type', label: 'タイプ', type: 'select', value: 'solidArrow', options: [
              { value: 'solidArrow', label: '実線矢印 (->>)' },
              { value: 'dottedArrow', label: '点線矢印 (-->>)' },
              { value: 'solidLine', label: '実線 (->)' },
              { value: 'dottedLine', label: '点線 (-->)' },
            ]},
          ],
        });
        if (result && result.text.trim()) {
          const newMsg = { from: fromName, to: toActor.name, type: result.type, text: result.text.trim() };
          const insertIdx = self._findInsertPosition(svgEl, pt.y);
          if (insertIdx >= 0 && insertIdx < self.messages.length) {
            self.messages.splice(insertIdx, 0, newMsg);
          } else {
            self.messages.push(newMsg);
          }
          self._render();
        }
      });

      // Click empty area → deselect
      svgEl.addEventListener('click', () => {
        this._highlightedMsgIdx = -1;
        this._highlightedPartIdx = -1;
        this._highlightListItem();
        this._setStatus('');
      });
    }

    // Map actor display names to SVG x positions
    // Mermaid v10: <g> contains <rect class="actor ..."> + <text class="actor">
    _mapActorPositions(svgEl) {
      const positions = [];
      const seen = new Map();
      // Find all rect elements with actor class
      const actorRects = svgEl.querySelectorAll('rect[class*="actor"]');
      actorRects.forEach((rect) => {
        const x = parseFloat(rect.getAttribute('x') || '0') + parseFloat(rect.getAttribute('width') || '0') / 2;
        const g = rect.closest('g') || rect.parentElement;
        const name = g ? this._getActorTextFromGroup(g) : '';
        if (!name || seen.has(name)) return;
        seen.set(name, true);
        const pIdx = this._findParticipantByDisplayName(name);
        if (pIdx >= 0) positions.push({ name: this.participants[pIdx].name, displayName: name, x });
      });
      return positions;
    }

    _getActorTextFromGroup(g) {
      // Mermaid v10: text may have class="actor" or be a <tspan> inside <text>
      const textEl = g.querySelector('text');
      if (textEl) {
        const tspan = textEl.querySelector('tspan');
        return tspan ? tspan.textContent.trim() : textEl.textContent.trim();
      }
      return '';
    }

    _findParticipantByDisplayName(displayName) {
      for (let i = 0; i < this.participants.length; i++) {
        const p = this.participants[i];
        if (p.alias === displayName || p.name === displayName) return i;
      }
      return -1;
    }

    _findNearestActor(x, threshold) {
      if (!this._actorPositions || this._actorPositions.length === 0) return null;
      let best = null, bestDist = Infinity;
      for (const ap of this._actorPositions) {
        const d = Math.abs(ap.x - x);
        if (d < bestDist) { bestDist = d; best = ap; }
      }
      return bestDist <= threshold ? best : null;
    }

    _svgPoint(svgEl, evt) {
      // Use viewBox for reliable coordinate mapping (works in webview)
      const rect = svgEl.getBoundingClientRect();
      const vb = svgEl.viewBox && svgEl.viewBox.baseVal;
      if (vb && vb.width > 0 && vb.height > 0) {
        return {
          x: (evt.clientX - rect.left) / rect.width * vb.width + vb.x,
          y: (evt.clientY - rect.top) / rect.height * vb.height + vb.y
        };
      }
      // Fallback: getScreenCTM
      const CTM = svgEl.getScreenCTM();
      if (CTM) return { x: (evt.clientX - CTM.e) / CTM.a, y: (evt.clientY - CTM.f) / CTM.d };
      return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
    }

    // ── List panel rendering with highlight ──
    _renderList() {
      this._listPanel.innerHTML = '';

      // Participants
      this._listPanel.appendChild(_elText('div', '参加者', 'diagram-ve-section-header'));
      for (let i = 0; i < this.participants.length; i++) {
        const p = this.participants[i];
        const item = _el('div', 'diagram-ve-item dnd-item');
        item.setAttribute('data-part-idx', String(i));
        if (this._highlightedPartIdx === i) item.classList.add('dve-highlighted');
        item.addEventListener('click', ((ci) => (e) => {
          if (e.target.closest('button')) return;
          this._highlightedPartIdx = (this._highlightedPartIdx === ci) ? -1 : ci;
          this._highlightedMsgIdx = -1;
          this._highlightListItem();
        })(i));
        item.addEventListener('dblclick', ((ci) => (e) => {
          if (e.target.closest('button')) return;
          e.stopPropagation();
          this._editParticipant(ci);
        })(i));
        const label = _el('span', 'diagram-ve-item-label');
        label.textContent = '👤 ' + p.name + (p.alias ? ' (' + p.alias + ')' : '');
        label.title = label.textContent;
        item.appendChild(label);
        const actions = _el('div', 'diagram-ve-item-actions');
        const editBtn = _el('button', ''); editBtn.textContent = '✏️'; editBtn.title = '編集';
        editBtn.addEventListener('click', (e) => { e.stopPropagation(); this._editParticipant(i); });
        actions.appendChild(editBtn);
        const delBtn = _el('button', ''); delBtn.textContent = '✕';
        delBtn.addEventListener('click', (e) => { e.stopPropagation(); this._deleteParticipant(i); });
        actions.appendChild(delBtn);
        item.appendChild(actions);
        _makeDraggable(item, 'participant', i, this, 'participants');
        this._listPanel.appendChild(item);
      }

      // Messages
      this._listPanel.appendChild(_elText('div', 'メッセージ', 'diagram-ve-section-header'));
      const inRectSelect = !!this._rectSelectMode;
      for (let i = 0; i < this.messages.length; i++) {
        const msg = this.messages[i];
        const item = _el('div', 'diagram-ve-item dnd-item');
        item.setAttribute('data-msg-idx', String(i));
        if (this._highlightedMsgIdx === i) item.classList.add('dve-highlighted');

        // In rect select mode, highlight selectable items and the chosen start
        if (inRectSelect && msg.type !== 'rect_start' && msg.type !== 'rect_end') {
          item.classList.add('dve-rect-selectable');
          if (this._rectSelectMode.startIdx === i) item.classList.add('dve-rect-selected-start');
        }

        item.addEventListener('click', ((ci) => (e) => {
          if (e.target.closest('button')) return;
          // If in rect select mode, handle rect selection
          if (this._rectSelectMode) {
            this._handleRectSelectClick(ci);
            return;
          }
          this._highlightedMsgIdx = (this._highlightedMsgIdx === ci) ? -1 : ci;
          this._highlightedPartIdx = -1;
          this._highlightListItem();
        })(i));
        item.addEventListener('dblclick', ((ci) => (e) => {
          if (e.target.closest('button')) return;
          e.stopPropagation();
          if (this._rectSelectMode) return; // ignore dblclick in rect select mode
          const m = this.messages[ci];
          if (m && m.type === 'rect_start') this._editRect(ci);
          else if (m && m.type !== 'rect_end') this._editMessage(ci);
        })(i));
        const label = _el('span', 'diagram-ve-item-label');
        if (msg.type === 'note') {
          label.textContent = '📝 Note (' + (msg.notePosition || 'right of') + ' ' + this._displayName(msg.to) + '): ' + msg.text;
        } else if (msg.type === 'rect_start') {
          label.textContent = '🟦 ブロック開始 [' + (msg.rectColor || 'rgb(40,60,80)') + ']';
        } else if (msg.type === 'rect_end') {
          label.textContent = '🟦 ブロック終了';
        } else {
          label.textContent = '💬 ' + this._displayName(msg.from) + ' → ' + this._displayName(msg.to) + ': ' + msg.text;
        }
        label.title = label.textContent;
        item.appendChild(label);
        const actions = _el('div', 'diagram-ve-item-actions');
        if (msg.type === 'rect_start') {
          const editBtn = _el('button', ''); editBtn.textContent = '✏️'; editBtn.title = '色を変更';
          editBtn.addEventListener('click', (e) => { e.stopPropagation(); this._editRect(i); });
          actions.appendChild(editBtn);
          const delBtn = _el('button', ''); delBtn.textContent = '✕'; delBtn.title = 'ブロック削除';
          delBtn.addEventListener('click', (e) => { e.stopPropagation(); this._deleteRect(i); });
          actions.appendChild(delBtn);
        } else if (msg.type === 'rect_end') {
          // No actions for rect_end
        } else {
          const editBtn = _el('button', ''); editBtn.textContent = '✏️';
          editBtn.addEventListener('click', (e) => { e.stopPropagation(); this._editMessage(i); });
          actions.appendChild(editBtn);
          const delBtn = _el('button', ''); delBtn.textContent = '✕';
          delBtn.addEventListener('click', (e) => { e.stopPropagation(); this.messages.splice(i, 1); this._render(); });
          actions.appendChild(delBtn);
        }
        item.appendChild(actions);
        _makeDraggable(item, 'message', i, this, 'messages');
        this._listPanel.appendChild(item);
      }
    }

    _highlightListItem() {
      this._listPanel.querySelectorAll('.dve-highlighted').forEach(el => el.classList.remove('dve-highlighted'));
      if (this._highlightedPartIdx >= 0) {
        const el = this._listPanel.querySelector('[data-part-idx="' + this._highlightedPartIdx + '"]');
        if (el) el.classList.add('dve-highlighted');
      }
      if (this._highlightedMsgIdx >= 0) {
        const el = this._listPanel.querySelector('[data-msg-idx="' + this._highlightedMsgIdx + '"]');
        if (el) el.classList.add('dve-highlighted');
      }
    }

    // ── CRUD operations ──
    async _addParticipant() {
      const result = await _showDialog(this.container, {
        title: '参加者追加',
        fields: [
          { key: 'name', label: '参加者名（英数字）', type: 'text', value: 'User' },
          { key: 'alias', label: '表示名（空欄可 / 日本語OK）', type: 'text', value: '' },
        ],
      });
      if (!result || !result.name.trim()) return;
      const clean = result.name.trim().replace(/\s+/g, '');
      if (this.participants.find(p => p.name === clean)) { await _showAlert(this.container, '同名の参加者が既に存在します。'); return; }
      this.participants.push({ name: clean, alias: (result.alias || '').trim() });
      this._render();
    }

    async _editParticipant(index) {
      const p = this.participants[index]; if (!p) return;
      const result = await _showDialog(this.container, {
        title: '参加者「' + p.name + '」を編集',
        fields: [{ key: 'alias', label: '表示名', type: 'text', value: p.alias || p.name }],
      });
      if (result) { p.alias = result.alias.trim(); this._render(); }
    }

    _deleteParticipant(index) {
      const p = this.participants[index]; if (!p) return;
      this.messages = this.messages.filter(m => m.from !== p.name && m.to !== p.name);
      this.participants.splice(index, 1); this._render();
    }

    async _addMessage() {
      if (this.participants.length < 2) { await _showAlert(this.container, 'メッセージを追加するには2人以上の参加者が必要です。'); return; }
      const opts = this._participantOpts();
      const result = await _showDialog(this.container, {
        title: 'メッセージ追加',
        fields: [
          { key: 'from', label: '送信元', type: 'select', value: this.participants[0].name, options: opts },
          { key: 'to', label: '送信先', type: 'select', value: this.participants.length > 1 ? this.participants[1].name : this.participants[0].name, options: opts },
          { key: 'type', label: 'タイプ', type: 'select', value: 'solidArrow', options: [
            { value: 'solidArrow', label: '実線矢印 (->>)' }, { value: 'dottedArrow', label: '点線矢印 (-->>)' },
            { value: 'solidLine', label: '実線 (->)' }, { value: 'dottedLine', label: '点線 (-->)' },
            { value: 'async', label: '非同期 (-)' }, { value: 'cross', label: '×印 (-x)' },
          ]},
          { key: 'text', label: 'メッセージ内容', type: 'text', value: 'メッセージ' },
        ],
      });
      if (!result) return;
      this.messages.push({ from: result.from, to: result.to, type: result.type, text: result.text || 'メッセージ' });
      this._render();
    }

    async _addNote() {
      if (this.participants.length < 1) { await _showAlert(this.container, 'ノートを追加するには参加者が必要です。'); return; }
      const opts = this._participantOpts();
      const result = await _showDialog(this.container, {
        title: 'ノート追加',
        fields: [
          { key: 'position', label: '配置', type: 'select', value: 'right of', options: [
            { value: 'right of', label: '右側 (right of)' },
            { value: 'left of', label: '左側 (left of)' },
            { value: 'over', label: '上 (over)' },
          ]},
          { key: 'over', label: 'ノートを付ける参加者', type: 'select', value: this.participants[0].name, options: opts },
          { key: 'text', label: 'ノートの内容', type: 'text', value: 'メモ' },
        ],
      });
      if (!result) return;
      this.messages.push({ from: '__note__', to: result.over, type: 'note', text: result.text || 'メモ', notePosition: result.position || 'right of' });
      this._render();
    }

    // ── Rect block: color palette → click start message → click end message ──

    async _startRectSelect() {
      // Show color palette to pick rect color
      const color = await this._showColorPalette();
      if (!color) return;
      this._rectSelectMode = { color, startIdx: null };
      this._addRectBtn.classList.add('mve-tool-btn-active');
      this._setStatus('🟦 ブロック始点のメッセージをクリックしてください（Escでキャンセル）');
      this._renderList(); // re-render to show clickable items
    }

    _cancelRectSelect() {
      this._rectSelectMode = null;
      if (this._addRectBtn) this._addRectBtn.classList.remove('mve-tool-btn-active');
      this._setStatus('');
      this._renderList();
    }

    _handleRectSelectClick(msgIdx) {
      if (!this._rectSelectMode) return;
      const msg = this.messages[msgIdx];
      if (!msg || msg.type === 'rect_start' || msg.type === 'rect_end') return; // skip rect items

      if (this._rectSelectMode.startIdx === null) {
        // First click: select start
        this._rectSelectMode.startIdx = msgIdx;
        this._setStatus('🟦 ブロック終点のメッセージをクリックしてください（Escでキャンセル）');
        this._renderList(); // update highlight
      } else {
        // Second click: select end → insert rect
        const startIdx = this._rectSelectMode.startIdx;
        const endIdx = msgIdx;
        const color = this._rectSelectMode.color;
        this._cancelRectSelect();

        const lo = Math.min(startIdx, endIdx);
        const hi = Math.max(startIdx, endIdx);

        // Insert rect_end AFTER the end message, then rect_start BEFORE the start message
        this.messages.splice(hi + 1, 0, { type: 'rect_end', text: '', from: '', to: '' });
        this.messages.splice(lo, 0, { type: 'rect_start', rectColor: color, text: '', from: '', to: '' });
        this._render();
      }
    }

    _showColorPalette() {
      return new Promise((resolve) => {
        const existing = this.container.querySelector('.ve-dialog-overlay');
        if (existing) existing.remove();

        const overlay = _el('div', 've-dialog-overlay');
        const dialog = _el('div', 've-dialog');
        dialog.appendChild(_elText('div', 'ブロック背景色を選択', 've-dialog-title'));

        // Preset colors
        const presets = [
          { color: 'rgb(40, 60, 80)', label: 'ダークブルー' },
          { color: 'rgb(30, 50, 40)', label: 'ダークグリーン' },
          { color: 'rgb(60, 40, 60)', label: 'ダークパープル' },
          { color: 'rgb(60, 50, 30)', label: 'ダークオレンジ' },
          { color: 'rgb(50, 30, 30)', label: 'ダークレッド' },
          { color: 'rgb(30, 40, 60)', label: 'ネイビー' },
          { color: 'rgba(0, 100, 200, 0.15)', label: 'ライトブルー' },
          { color: 'rgba(0, 180, 80, 0.15)', label: 'ライトグリーン' },
          { color: 'rgba(160, 60, 200, 0.15)', label: 'ライトパープル' },
          { color: 'rgba(200, 140, 0, 0.15)', label: 'ライトオレンジ' },
          { color: 'rgba(220, 50, 50, 0.15)', label: 'ライトレッド' },
          { color: 'rgba(100, 100, 100, 0.15)', label: 'ライトグレー' },
        ];

        const paletteGrid = _el('div', 'dve-color-palette');
        let selectedColor = presets[0].color;

        for (const preset of presets) {
          const swatch = _el('button', 'dve-color-swatch');
          swatch.style.backgroundColor = preset.color;
          swatch.title = preset.label + ' (' + preset.color + ')';
          if (preset.color === selectedColor) swatch.classList.add('dve-color-selected');
          swatch.addEventListener('click', () => {
            paletteGrid.querySelectorAll('.dve-color-selected').forEach(s => s.classList.remove('dve-color-selected'));
            swatch.classList.add('dve-color-selected');
            selectedColor = preset.color;
            customInput.value = preset.color;
          });
          paletteGrid.appendChild(swatch);
        }
        dialog.appendChild(paletteGrid);

        // Custom color input
        const customRow = _el('div', 've-dialog-field');
        customRow.appendChild(_elText('label', 'カスタム色 (例: rgb(40, 60, 80))', 've-dialog-label'));
        const customInput = _el('input', 've-dialog-input');
        customInput.type = 'text';
        customInput.value = selectedColor;
        customInput.addEventListener('input', () => {
          selectedColor = customInput.value.trim();
          paletteGrid.querySelectorAll('.dve-color-selected').forEach(s => s.classList.remove('dve-color-selected'));
        });
        customRow.appendChild(customInput);
        dialog.appendChild(customRow);

        // Actions
        const actions = _el('div', 've-dialog-actions');
        const cancelBtn = _el('button', 've-dialog-cancel');
        cancelBtn.textContent = 'キャンセル';
        cancelBtn.addEventListener('click', () => { overlay.remove(); resolve(null); });
        actions.appendChild(cancelBtn);
        const okBtn = _el('button', 've-dialog-ok');
        okBtn.textContent = '次へ: 範囲を選択';
        okBtn.addEventListener('click', () => {
          overlay.remove();
          resolve(selectedColor || 'rgb(40, 60, 80)');
        });
        actions.appendChild(okBtn);
        dialog.appendChild(actions);
        overlay.appendChild(dialog);

        overlay.addEventListener('click', (e) => { if (e.target === overlay) { overlay.remove(); resolve(null); } });
        dialog.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
            e.preventDefault(); overlay.remove(); resolve(selectedColor || 'rgb(40, 60, 80)');
          }
          if (e.key === 'Escape') { e.preventDefault(); overlay.remove(); resolve(null); }
        });

        this.container.appendChild(overlay);
        customInput.focus();
      });
    }

    async _editRect(index) {
      const msg = this.messages[index];
      if (!msg || msg.type !== 'rect_start') return;
      const color = await this._showColorPalette();
      if (color === null) return; // cancelled
      msg.rectColor = color;
      this._render();
    }

    async _deleteRect(index) {
      const msg = this.messages[index];
      if (!msg || msg.type !== 'rect_start') return;
      // Find matching rect_end and remove the pair
      let depth = 0;
      let endIdx = -1;
      for (let i = index; i < this.messages.length; i++) {
        if (this.messages[i].type === 'rect_start') depth++;
        if (this.messages[i].type === 'rect_end') {
          depth--;
          if (depth === 0) { endIdx = i; break; }
        }
      }
      if (endIdx >= 0) {
        this.messages.splice(endIdx, 1);
        this.messages.splice(index, 1);
      } else {
        this.messages.splice(index, 1);
      }
      this._render();
    }

    async _editMessage(index) {
      const msg = this.messages[index]; if (!msg) return;
      const opts = this._participantOpts();
      if (msg.type === 'note') {
        const result = await _showDialog(this.container, {
          title: 'ノート編集',
          deleteLabel: '🗑 削除',
          fields: [
            { key: 'position', label: '配置', type: 'select', value: msg.notePosition || 'right of', options: [
              { value: 'right of', label: '右側 (right of)' },
              { value: 'left of', label: '左側 (left of)' },
              { value: 'over', label: '上 (over)' },
            ]},
            { key: 'over', label: '参加者', type: 'select', value: msg.to, options: opts },
            { key: 'text', label: '内容', type: 'text', value: msg.text },
          ],
        });
        if (!result) return;
        if (result.__delete) { this.messages.splice(index, 1); this._render(); return; }
        msg.notePosition = result.position; msg.to = result.over; msg.text = result.text; this._render();
      } else {
        const typeOptions = [
          { value: 'solidArrow', label: '実線矢印 (->>)' },
          { value: 'dottedArrow', label: '点線矢印 (-->>)' },
          { value: 'solidLine', label: '実線 (->)' },
          { value: 'dottedLine', label: '点線 (-->)' },
          { value: 'async', label: '非同期 (-)' },
          { value: 'cross', label: '×印 (-x)' },
        ];
        const result = await _showDialog(this.container, {
          title: 'メッセージ編集',
          deleteLabel: '🗑 削除',
          fields: [
            { key: 'from', label: 'From', type: 'select', value: msg.from, options: opts },
            { key: 'type', label: '線の種類', type: 'select', value: msg.type, options: typeOptions },
            { key: 'to', label: 'To', type: 'select', value: msg.to, options: opts },
            { key: 'text', label: 'メッセージ内容', type: 'text', value: msg.text },
          ],
        });
        if (!result) return;
        if (result.__delete) { this.messages.splice(index, 1); this._render(); return; }
        msg.from = result.from; msg.type = result.type;
        msg.to = result.to; msg.text = result.text; this._render();
      }
    }

    // Find insertion position for new message based on Y coordinate in SVG
    _findInsertPosition(svgEl, dropY) {
      const msgLines = svgEl.querySelectorAll('line[class*="messageLine"], path[class*="messageLine"]');
      const nonNoteMessages = this.messages.filter(m => m.type !== 'note' && m.type !== 'rect_start' && m.type !== 'rect_end');
      let insertIdx = this.messages.length; // default: append
      for (let i = 0; i < msgLines.length && i < nonNoteMessages.length; i++) {
        const ml = msgLines[i];
        let lineY;
        if (ml.tagName === 'line') {
          lineY = (parseFloat(ml.getAttribute('y1')) + parseFloat(ml.getAttribute('y2'))) / 2;
        } else {
          const bbox = ml.getBBox ? ml.getBBox() : null;
          lineY = bbox ? bbox.y + bbox.height / 2 : 0;
        }
        if (dropY < lineY) {
          insertIdx = this.messages.indexOf(nonNoteMessages[i]);
          if (insertIdx < 0) insertIdx = this.messages.length;
          break;
        }
      }
      return insertIdx;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  CLASS DIAGRAM VISUAL EDITOR
  //  - Diagram-first: large SVG, click nodes to connect directly
  //  - Click class on SVG → select/start connection
  //  - Click relation path on SVG → highlight in list
  //  - Collapsible list panel below
  // ═══════════════════════════════════════════════════════════════
  class ClassDiagramEditor {
    constructor(container, code, onChange) {
      this.container = container;
      this.onChange = onChange;
      this.classes = [];
      this.relations = [];
      this._connectMode = false;
      this._connectFrom = null; // class name
      this._highlightedClass = null;
      this._highlightedRelIdx = -1;
      _initZoom(this);
      _initUndoKeyboard(this);
      this._parse(code);
      this._buildUI();
      this._render();
    }
    destroy() { _destroyUndoKeyboard(this); this.container.innerHTML = ''; }
    getCode() { return this._generate(); }

    _snapshot() { return { classes: JSON.parse(JSON.stringify(this.classes)), relations: JSON.parse(JSON.stringify(this.relations)) }; }
    _restoreSnapshot(snap) { this.classes = snap.classes; this.relations = snap.relations; }
    _doUndo() { const s = this._undo.undo(); if (s) { this._restoreSnapshot(s); this._render(true); } }
    _doRedo() { const s = this._undo.redo(); if (s) { this._restoreSnapshot(s); this._render(true); } }
    _deleteSelected() {
      if (this._highlightedRelIdx >= 0) {
        this.relations.splice(this._highlightedRelIdx, 1);
        this._highlightedRelIdx = -1; this._render();
      } else if (this._highlightedClass) {
        const name = this._highlightedClass;
        this.classes = this.classes.filter(c => c.name !== name);
        this.relations = this.relations.filter(r => r.from !== name && r.to !== name);
        this._highlightedClass = null; this._render();
      }
    }

    _parse(code) {
      this.classes = []; this.relations = [];
      const lines = code.split('\n'); let currentClass = null;
      for (const line of lines) {
        const t = line.trim();
        if (!t || t === 'classDiagram' || t.startsWith('%%')) continue;
        const classBlock = t.match(/^class\s+(\w+)\s*\{?\s*$/);
        if (classBlock) { currentClass = { name: classBlock[1], properties: [], methods: [] }; this.classes.push(currentClass); continue; }
        if (t === '}') { currentClass = null; continue; }
        if (currentClass && !t.match(/[<>|.*o-]/)) {
          if (t.includes('(')) currentClass.methods.push(t);
          else if (t.length > 0) currentClass.properties.push(t);
          continue;
        }
        const relPatterns = [
          { re: /^(\w+)\s+<\|--\s+(\w+)(?:\s*:\s*(.+))?$/, type: 'inheritance' },
          { re: /^(\w+)\s+\*--\s+(\w+)(?:\s*:\s*(.+))?$/, type: 'composition' },
          { re: /^(\w+)\s+o--\s+(\w+)(?:\s*:\s*(.+))?$/, type: 'aggregation' },
          { re: /^(\w+)\s+-->\s+(\w+)(?:\s*:\s*(.+))?$/, type: 'association' },
          { re: /^(\w+)\s+--\s+(\w+)(?:\s*:\s*(.+))?$/, type: 'link' },
          { re: /^(\w+)\s+\.\.\>\s+(\w+)(?:\s*:\s*(.+))?$/, type: 'dependency' },
          { re: /^(\w+)\s+\.\.\|>\s+(\w+)(?:\s*:\s*(.+))?$/, type: 'realization' },
        ];
        let matched = false;
        for (const rp of relPatterns) {
          const m = t.match(rp.re);
          if (m) { this.relations.push({ from: m[1], to: m[2], type: rp.type, label: m[3] || '' }); this._ensureClass(m[1]); this._ensureClass(m[2]); matched = true; break; }
        }
        if (matched) continue;
        const inlineMember = t.match(/^(\w+)\s*:\s*(.+)$/);
        if (inlineMember) {
          const cls = this._ensureClass(inlineMember[1]); const member = inlineMember[2].trim();
          if (member.includes('(')) cls.methods.push(member); else cls.properties.push(member);
        }
      }
    }

    _ensureClass(name) {
      let cls = this.classes.find(c => c.name === name);
      if (!cls) { cls = { name, properties: [], methods: [] }; this.classes.push(cls); }
      return cls;
    }

    _generate() {
      const lines = ['classDiagram'];
      for (const cls of this.classes) {
        lines.push('    class ' + cls.name + ' {');
        for (const p of cls.properties) lines.push('        ' + p);
        for (const m of cls.methods) lines.push('        ' + m);
        lines.push('    }');
      }
      const syn = { inheritance: '<|--', composition: '*--', aggregation: 'o--', association: '-->', link: '--', dependency: '..>', realization: '..|>' };
      for (const rel of this.relations) {
        let line = '    ' + rel.from + ' ' + (syn[rel.type] || '-->') + ' ' + rel.to;
        if (rel.label) line += ' : ' + rel.label; lines.push(line);
      }
      return lines.join('\n');
    }

    _buildUI() {
      this.container.innerHTML = '';
      this.container.classList.add('dve-root');
      const toolbar = _el('div', 'dve-toolbar');

      const addClassBtn = _el('button', 'mve-tool-btn'); addClassBtn.textContent = '📦 クラス追加';
      addClassBtn.addEventListener('click', () => this._addClass());
      toolbar.appendChild(addClassBtn);

      this._connectBtn = _el('button', 'mve-tool-btn'); this._connectBtn.textContent = '🔗 接続モード';
      this._connectBtn.title = 'SVG上のクラスをクリックして関連を作成';
      this._connectBtn.addEventListener('click', () => this._toggleConnectMode());
      toolbar.appendChild(this._connectBtn);

      const addRelBtn = _el('button', 'mve-tool-btn'); addRelBtn.textContent = '➕ 関連追加';
      addRelBtn.addEventListener('click', () => this._addRelation());
      toolbar.appendChild(addRelBtn);

      toolbar.appendChild(_elText('span', '図上のクラスをクリックして接続', 'dve-hint'));

      const undoBtn = _el('button', 'mve-tool-btn'); undoBtn.textContent = '↩ 元に戻す';
      undoBtn.addEventListener('click', () => this._doUndo());
      toolbar.appendChild(undoBtn);
      const redoBtn = _el('button', 'mve-tool-btn'); redoBtn.textContent = '↪ やり直し';
      redoBtn.addEventListener('click', () => this._doRedo());
      toolbar.appendChild(redoBtn);

      _addZoomControls(toolbar, this);
      this.container.appendChild(toolbar);

      this._statusBar = _el('div', 'dve-status');
      this._statusBar.style.display = 'none';
      this.container.appendChild(this._statusBar);

      const body = _el('div', 'dve-body');
      this._listPanel = _el('div', 'dve-list-panel');
      body.appendChild(this._listPanel);

      this._svgArea = _el('div', 'dve-svg-area');
      _attachZoomWheel(this);
      body.appendChild(this._svgArea);

      this.container.appendChild(body);
    }

    _setStatus(text) {
      this._statusBar.textContent = text;
      this._statusBar.style.display = text ? '' : 'none';
    }

    _toggleConnectMode() {
      this._connectMode = !this._connectMode;
      this._connectFrom = null;
      if (this._connectMode) {
        this._connectBtn.classList.add('mve-active');
        this._setStatus('🔗 接続モード: SVG上の関連元クラスをクリック');
      } else {
        this._connectBtn.classList.remove('mve-active');
        this._setStatus('');
      }
    }

    async _render(skipUndo) {
      if (!skipUndo) _commitUndo(this);
      const code = this._generate();
      this.onChange(code);
      this._renderList();
      await this._renderSvg(code);
    }

    async _renderSvg(code) {
      try {
        const id = 'cls-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
        const { svg } = await mermaid.render(id, code);
        this._svgArea.innerHTML = svg;
        _postRenderZoom(this);
        this._attachSvgEvents();
      } catch (err) {
        this._svgArea.innerHTML = '<div class="mermaid-error">プレビューエラー:<br>' + _escHtml(String(err)) + '</div>';
      }
    }

    _attachSvgEvents() {
      const svgEl = this._svgArea.querySelector('svg');
      if (!svgEl) return;

      // Ensure pointer events work
      svgEl.style.pointerEvents = 'all';
      svgEl.style.cursor = this._connectMode ? 'crosshair' : 'default';

      // Find class node groups (mermaid v10: g.classGroup, fallback g[id*="classId"])
      let nodeGroups = svgEl.querySelectorAll('g.classGroup');
      if (nodeGroups.length === 0) nodeGroups = svgEl.querySelectorAll('g[id*="classId"]');
      // Also try nodes by looking for text.classTitle
      if (nodeGroups.length === 0) {
        const titles = svgEl.querySelectorAll('text.classTitle');
        const groups = new Set();
        titles.forEach(t => { const g = t.closest('g'); if (g) groups.add(g); });
        nodeGroups = Array.from(groups);
      }

      const nodeGroupList = Array.from(nodeGroups);
      nodeGroupList.forEach((ng) => {
        const className = this._extractClassName(ng);
        if (!className) return;

        ng.style.cursor = this._connectMode ? 'crosshair' : 'pointer';

        ng.addEventListener('mouseenter', () => {
          if (this._connectMode) {
            ng.style.filter = 'brightness(1.3) drop-shadow(0 0 6px #007fd4)';
          } else {
            ng.style.filter = 'brightness(1.15)';
          }
        });
        ng.addEventListener('mouseleave', () => {
          if (this._highlightedClass === className) ng.style.filter = 'drop-shadow(0 0 4px #007fd4)';
          else ng.style.filter = '';
        });

        ng.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this._connectMode) {
            this._handleSvgConnect(className);
          } else {
            this._highlightedClass = className;
            this._highlightedRelIdx = -1;
            this._renderList();
            this._setStatus('クラス: ' + className);
          }
        });

        ng.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          const ci = this.classes.findIndex(c => c.name === className);
          if (ci >= 0) this._editClassName(ci);
        });

        ng.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (this._connectMode || !window.DiagramCommon) return;
          const ci = this.classes.findIndex(c => c.name === className);
          if (ci < 0) return;
          this._highlightedClass = className;
          this._highlightedRelIdx = -1;
          this._renderList();
          const cls = this.classes[ci];
          window.DiagramCommon.showContextMenu(e.clientX, e.clientY, [
            { label: '✎ クラス名を編集', onClick: () => this._editClassName(ci) },
            { label: '➕ 属性を追加', onClick: () => {
              const v = prompt('属性 (例: +name: string)', '+attr: string');
              if (v) { cls.properties.push(v); this._render(); }
            }},
            { label: '➕ メソッドを追加', onClick: () => {
              const v = prompt('メソッド (例: +run(): void)', '+method(): void');
              if (v) { cls.methods.push(v); this._render(); }
            }},
            'separator',
            { label: '🗑 このクラスを削除', danger: true, onClick: () => this._deleteClass(ci) },
          ]);
        });

        if (this._highlightedClass === className) {
          ng.style.filter = 'drop-shadow(0 0 4px #007fd4)';
        }
        if (this._connectMode && this._connectFrom === className) {
          ng.style.filter = 'drop-shadow(0 0 6px #00cc66)';
        }
      });

      // Relation paths — click to highlight
      // Mermaid v10: try .relation, .edgePath path, path[class*="relation"]
      let edgePaths = svgEl.querySelectorAll('g.relation, .relation');
      if (edgePaths.length === 0) edgePaths = svgEl.querySelectorAll('.edgePath');
      const edgeList = Array.from(edgePaths);
      edgeList.forEach((ep, idx) => {
        if (idx >= this.relations.length) return;
        const path = ep.querySelector('path') || (ep.tagName === 'path' ? ep : null);
        if (!path) return;
        path.style.cursor = 'pointer';
        path.style.pointerEvents = 'stroke';
        const capturedIdx = idx;
        const handleClick = (e) => {
          e.stopPropagation();
          this._highlightedRelIdx = capturedIdx;
          this._highlightedClass = null;
          this._renderList();
        };
        const handleDblClick = (e) => {
          e.stopPropagation();
          this._editRelation(capturedIdx);
        };
        path.addEventListener('click', handleClick);
        path.addEventListener('dblclick', handleDblClick);
        path.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!window.DiagramCommon) return;
          this._highlightedRelIdx = capturedIdx;
          this._highlightedClass = null;
          this._renderList();
          window.DiagramCommon.showContextMenu(e.clientX, e.clientY, [
            { label: '✎ リレーションを編集', onClick: () => this._editRelation(capturedIdx) },
            'separator',
            { label: '🗑 このリレーションを削除', danger: true, onClick: () => {
              this.relations.splice(capturedIdx, 1); this._render();
            }},
          ]);
        });

        // Also handle edge labels (text near the edge)
        const edgeLabels = ep.querySelectorAll('text, .edgeLabel');
        edgeLabels.forEach(lbl => {
          lbl.style.cursor = 'pointer';
          lbl.style.pointerEvents = 'all';
          lbl.addEventListener('click', handleClick);
          lbl.addEventListener('dblclick', handleDblClick);
        });
      });

      svgEl.addEventListener('click', () => {
        this._highlightedClass = null;
        this._highlightedRelIdx = -1;
        this._renderList();
        if (!this._connectMode) this._setStatus('');
      });
    }

    _extractClassName(gEl) {
      // Try id attribute first (mermaid v10: classId-ClassName-N)
      const id = gEl.id || '';
      const m = id.match(/classId-(\w+)-\d+/);
      if (m) return m[1];
      // Try text.classTitle
      const textEl = gEl.querySelector('text.classTitle, .classTitle');
      if (textEl) { const name = textEl.textContent.trim(); if (this.classes.find(c => c.name === name)) return name; }
      // Try first bold/large text or any text
      const textEls = gEl.querySelectorAll('text');
      for (const t of textEls) { const name = t.textContent.trim(); if (name && this.classes.find(c => c.name === name)) return name; }
      // Last resort: try text that looks like a class name (PascalCase/camelCase)
      for (const t of textEls) { const name = t.textContent.trim(); if (/^[A-Z]\w*$/.test(name)) return name; }
      return null;
    }

    async _handleSvgConnect(className) {
      if (!this._connectFrom) {
        this._connectFrom = className;
        this._setStatus('🔗 接続モード: 「' + className + '」→ 関連先クラスをクリック');
        await this._renderSvg(this._generate());
      } else {
        if (this._connectFrom === className) {
          this._connectFrom = null;
          this._setStatus('🔗 接続モード: 関連元クラスをクリック');
          return;
        }
        const fromName = this._connectFrom;
        this._connectFrom = null;
        const result = await _showDialog(this.container, {
          title: fromName + ' → ' + className + ' の関連タイプ',
          fields: [
            { key: 'type', label: '関連タイプ', type: 'select', value: 'association', options: [
              { value: 'inheritance', label: '継承 (<|--)' },
              { value: 'composition', label: 'コンポジション (*--)' },
              { value: 'aggregation', label: '集約 (o--)' },
              { value: 'association', label: '関連 (-->)' },
              { value: 'dependency', label: '依存 (..>)' },
              { value: 'realization', label: '実現 (..|>)' },
            ]},
            { key: 'label', label: 'ラベル（空欄可）', type: 'text', value: '' },
          ],
        });
        if (result) {
          this.relations.push({ from: fromName, to: className, type: result.type, label: result.label || '' });
        }
        this._setStatus('🔗 接続モード: 関連元クラスをクリック');
        this._render();
      }
    }

    _renderList() {
      this._listPanel.innerHTML = '';
      this._listPanel.appendChild(_elText('div', 'クラス一覧', 'diagram-ve-section-header'));
      for (let ci = 0; ci < this.classes.length; ci++) {
        const cls = this.classes[ci];
        const item = _el('div', 'diagram-ve-item');
        if (this._highlightedClass === cls.name) item.classList.add('dve-highlighted');
        const label = _el('span', 'diagram-ve-item-label');
        label.textContent = '📦 ' + cls.name;
        label.style.cursor = 'pointer'; label.title = label.textContent;
        label.addEventListener('click', (e) => { e.stopPropagation(); this._editClassName(ci); });
        item.appendChild(label);
        const actions = _el('div', 'diagram-ve-item-actions');
        const delBtn = _el('button', ''); delBtn.textContent = '✕';
        delBtn.addEventListener('click', (e) => { e.stopPropagation(); this._deleteClass(ci); });
        actions.appendChild(delBtn);
        item.appendChild(actions);
        this._listPanel.appendChild(item);

        // Members inline
        for (let pi = 0; pi < cls.properties.length; pi++) {
          const mItem = _el('div', 'diagram-ve-item member-item'); mItem.style.paddingLeft = '24px';
          const mLabel = _el('span', 'diagram-ve-item-label'); mLabel.textContent = '  📄 ' + cls.properties[pi];
          mLabel.title = mLabel.textContent; mLabel.style.cursor = 'pointer';
          mLabel.addEventListener('click', (e) => { e.stopPropagation(); _inlineEdit(mLabel, cls.properties[pi], (v) => { cls.properties[pi] = v; this._render(); }); });
          mItem.appendChild(mLabel);
          const mAct = _el('div', 'diagram-ve-item-actions');
          const mDel = _el('button', ''); mDel.textContent = '✕';
          mDel.addEventListener('click', (e) => { e.stopPropagation(); cls.properties.splice(pi, 1); this._render(); });
          mAct.appendChild(mDel); mItem.appendChild(mAct);
          this._listPanel.appendChild(mItem);
        }
        for (let mi = 0; mi < cls.methods.length; mi++) {
          const mItem = _el('div', 'diagram-ve-item member-item'); mItem.style.paddingLeft = '24px';
          const mLabel = _el('span', 'diagram-ve-item-label'); mLabel.textContent = '  ⚡ ' + cls.methods[mi];
          mLabel.title = mLabel.textContent; mLabel.style.cursor = 'pointer';
          mLabel.addEventListener('click', (e) => { e.stopPropagation(); _inlineEdit(mLabel, cls.methods[mi], (v) => { cls.methods[mi] = v; this._render(); }); });
          mItem.appendChild(mLabel);
          const mAct = _el('div', 'diagram-ve-item-actions');
          const mDel = _el('button', ''); mDel.textContent = '✕';
          mDel.addEventListener('click', (e) => { e.stopPropagation(); cls.methods.splice(mi, 1); this._render(); });
          mAct.appendChild(mDel); mItem.appendChild(mAct);
          this._listPanel.appendChild(mItem);
        }
        // Quick-add
        const addRow = _el('div', 'diagram-ve-item member-add-row'); addRow.style.paddingLeft = '24px';
        const addPropBtn = _el('button', 'member-add-btn'); addPropBtn.textContent = '+ プロパティ';
        addPropBtn.addEventListener('click', (e) => {
          e.stopPropagation(); const span = _el('span', 'diagram-ve-item-label'); addRow.innerHTML = ''; addRow.appendChild(span);
          _inlineEdit(span, '', (v) => { cls.properties.push(v); this._render(); }, { placeholder: '+name: String' });
        });
        const addMethodBtn = _el('button', 'member-add-btn'); addMethodBtn.textContent = '+ メソッド';
        addMethodBtn.addEventListener('click', (e) => {
          e.stopPropagation(); const span = _el('span', 'diagram-ve-item-label'); addRow.innerHTML = ''; addRow.appendChild(span);
          _inlineEdit(span, '', (v) => { cls.methods.push(v); this._render(); }, { placeholder: '+method(): void' });
        });
        addRow.appendChild(addPropBtn); addRow.appendChild(addMethodBtn);
        this._listPanel.appendChild(addRow);
      }

      // Relations
      if (this.relations.length > 0) {
        this._listPanel.appendChild(_elText('div', '関連一覧', 'diagram-ve-section-header'));
        const relLabels = { inheritance: '継承', composition: 'コンポジション', aggregation: '集約', association: '関連', link: 'リンク', dependency: '依存', realization: '実現' };
        for (let ri = 0; ri < this.relations.length; ri++) {
          const rel = this.relations[ri];
          const item = _el('div', 'diagram-ve-item');
          if (this._highlightedRelIdx === ri) item.classList.add('dve-highlighted');
          const label = _el('span', 'diagram-ve-item-label');
          label.textContent = rel.from + ' → ' + rel.to + ' (' + (relLabels[rel.type] || rel.type) + ')' + (rel.label ? ' : ' + rel.label : '');
          label.title = label.textContent; label.style.cursor = 'pointer';
          label.addEventListener('click', (e) => {
            e.stopPropagation();
            this._highlightedRelIdx = ri;
            this._highlightedClass = null;
            this._renderList();
          });
          label.addEventListener('dblclick', (e) => { e.stopPropagation(); this._editRelation(ri); });
          item.appendChild(label);
          const actions = _el('div', 'diagram-ve-item-actions');
          const delBtn = _el('button', ''); delBtn.textContent = '✕';
          delBtn.addEventListener('click', (e) => { e.stopPropagation(); this.relations.splice(ri, 1); this._render(); });
          actions.appendChild(delBtn); item.appendChild(actions);
          this._listPanel.appendChild(item);
        }
      }
    }

    async _editClassName(ci) {
      const cls = this.classes[ci]; if (!cls) return;
      const result = await _showDialog(this.container, {
        title: 'クラス名変更', fields: [{ key: 'name', label: '新しい名前', type: 'text', value: cls.name }],
      });
      if (!result || !result.name.trim()) return;
      const newName = result.name.trim().replace(/\s+/g, '');
      if (this.classes.find((c, idx) => c.name === newName && idx !== ci)) return;
      const oldName = cls.name; cls.name = newName;
      for (const rel of this.relations) { if (rel.from === oldName) rel.from = newName; if (rel.to === oldName) rel.to = newName; }
      this._render();
    }

    async _addClass() {
      const result = await _showDialog(this.container, { title: 'クラス追加', fields: [{ key: 'name', label: 'クラス名', type: 'text', value: 'NewClass' }] });
      if (!result || !result.name.trim()) return;
      const clean = result.name.trim().replace(/\s+/g, '');
      if (this.classes.find(c => c.name === clean)) { await _showAlert(this.container, '同名のクラスが既に存在します。'); return; }
      this.classes.push({ name: clean, properties: [], methods: [] }); this._render();
    }

    _deleteClass(index) {
      const cls = this.classes[index]; if (!cls) return;
      this.relations = this.relations.filter(r => r.from !== cls.name && r.to !== cls.name);
      this.classes.splice(index, 1); this._render();
    }

    async _editRelation(ri) {
      const rel = this.relations[ri]; if (!rel) return;
      const classOpts = this.classes.map(c => ({ value: c.name, label: c.name }));
      const typeOpts = [
        { value: 'inheritance', label: '継承 (<|--)' }, { value: 'composition', label: 'コンポジション (*--)' },
        { value: 'aggregation', label: '集約 (o--)' }, { value: 'association', label: '関連 (-->)' },
        { value: 'dependency', label: '依存 (..>)' }, { value: 'realization', label: '実現 (..|>)' },
      ];
      const result = await _showDialog(this.container, {
        title: '関連編集',
        deleteLabel: '🗑 削除',
        fields: [
          { key: 'from', label: '関連元', type: 'select', value: rel.from, options: classOpts },
          { key: 'to', label: '関連先', type: 'select', value: rel.to, options: classOpts },
          { key: 'type', label: '関連タイプ', type: 'select', value: rel.type, options: typeOpts },
          { key: 'label', label: 'ラベル', type: 'text', value: rel.label || '' },
        ],
      });
      if (!result) return;
      if (result.__delete) { this.relations.splice(ri, 1); this._render(); return; }
      rel.from = result.from; rel.to = result.to;
      rel.type = result.type; rel.label = result.label || ''; this._render();
    }

    async _addRelation() {
      if (this.classes.length < 2) { await _showAlert(this.container, '関連を追加するには2つ以上のクラスが必要です。\n接続モードでSVG上のクラスをクリックして追加もできます。'); return; }
      const names = this.classes.map(c => c.name); const opts = names.map(n => ({ value: n, label: n }));
      const result = await _showDialog(this.container, {
        title: '関連追加',
        fields: [
          { key: 'from', label: '関連元', type: 'select', value: names[0], options: opts },
          { key: 'to', label: '関連先', type: 'select', value: names.length > 1 ? names[1] : names[0], options: opts },
          { key: 'type', label: '関連タイプ', type: 'select', value: 'association', options: [
            { value: 'inheritance', label: '継承 (<|--)' }, { value: 'composition', label: 'コンポジション (*--)' },
            { value: 'aggregation', label: '集約 (o--)' }, { value: 'association', label: '関連 (-->)' },
            { value: 'dependency', label: '依存 (..>)' }, { value: 'realization', label: '実現 (..|>)' },
          ]},
          { key: 'label', label: 'ラベル', type: 'text', value: '' },
        ],
      });
      if (!result) return;
      this.relations.push({ from: result.from, to: result.to, type: result.type, label: result.label || '' }); this._render();
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  TABLE VISUAL EDITOR (unchanged — diagram-first not applicable)
  // ═══════════════════════════════════════════════════════════════
  class TableVisualEditor {
    constructor(container, markdownTable, onChange) {
      this.container = container; this.onChange = onChange;
      this.headers = []; this.rows = [];
      this._selectedRow = -1; this._selectedCol = -1;
      this._parse(markdownTable); this._buildUI();
    }
    destroy() { this.container.innerHTML = ''; }
    getMarkdown() { return this._generate(); }
    _parse(md) {
      const lines = md.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0);
      if (lines.length < 2) { this.headers = ['列1', '列2', '列3']; this.rows = [['', '', '']]; return; }
      this.headers = this._parseRow(lines[0]);
      this.rows = [];
      for (let i = 2; i < lines.length; i++) {
        const cells = this._parseRow(lines[i]);
        while (cells.length < this.headers.length) cells.push('');
        if (cells.length > this.headers.length) cells.length = this.headers.length;
        this.rows.push(cells);
      }
      if (this.rows.length === 0) this.rows.push(new Array(this.headers.length).fill(''));
    }
    _parseRow(line) { return line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim()); }
    _generate() {
      const colCount = this.headers.length;
      const widths = this.headers.map((h, i) => {
        let max = h.length;
        for (const row of this.rows) max = Math.max(max, (row[i] || '').length);
        return Math.max(max, 3);
      });
      const pad = (str, w) => str + ' '.repeat(Math.max(0, w - str.length));
      let md = '| ' + this.headers.map((h, i) => pad(h, widths[i])).join(' | ') + ' |\n';
      md += '| ' + widths.map(w => '-'.repeat(w)).join(' | ') + ' |\n';
      for (const row of this.rows) md += '| ' + row.map((c, i) => pad(c || '', widths[i])).join(' | ') + ' |\n';
      return md.trimEnd();
    }
    _buildUI() {
      this.container.innerHTML = ''; this.container.classList.add('table-visual-editor');
      const toolbar = _el('div', 'table-visual-toolbar');
      const colLeftBtn = _el('button', ''); colLeftBtn.textContent = '⬅ 列追加(左)';
      colLeftBtn.addEventListener('click', () => this._insertColumn(this._selectedCol >= 0 ? this._selectedCol : 0));
      toolbar.appendChild(colLeftBtn);
      const colRightBtn = _el('button', ''); colRightBtn.textContent = '列追加(右) ➡';
      colRightBtn.addEventListener('click', () => this._insertColumn((this._selectedCol >= 0 ? this._selectedCol : this.headers.length - 1) + 1));
      toolbar.appendChild(colRightBtn);
      const rowAboveBtn = _el('button', ''); rowAboveBtn.textContent = '⬆ 行追加(上)';
      rowAboveBtn.addEventListener('click', () => this._insertRow(this._selectedRow >= 0 ? this._selectedRow : 0));
      toolbar.appendChild(rowAboveBtn);
      const rowBelowBtn = _el('button', ''); rowBelowBtn.textContent = '行追加(下) ⬇';
      rowBelowBtn.addEventListener('click', () => this._insertRow((this._selectedRow >= 0 ? this._selectedRow : this.rows.length - 1) + 1));
      toolbar.appendChild(rowBelowBtn);
      this._selIndicator = _el('span', 'table-sel-indicator'); this._selIndicator.textContent = '選択: なし';
      toolbar.appendChild(this._selIndicator);
      this.container.appendChild(toolbar);
      const wrap = _el('div', 'table-visual-wrap');
      this._tableEl = _el('table', ''); wrap.appendChild(this._tableEl);
      this.container.appendChild(wrap); this._renderTable();

      // Right-click context menu
      this._ctxMenu = _el('div', 'table-ctx-menu');
      this._ctxMenu.style.display = 'none';
      this.container.appendChild(this._ctxMenu);
      document.addEventListener('click', () => this._hideCtxMenu());
      document.addEventListener('contextmenu', (e) => {
        if (!this._ctxMenu.contains(e.target) && !this._tableEl.contains(e.target)) this._hideCtxMenu();
      });
    }
    _showCtxMenu(e, ri, ci) {
      e.preventDefault();
      this._selectedRow = ri; this._selectedCol = ci; this._updateSelIndicator();
      const menu = this._ctxMenu;
      menu.innerHTML = '';
      const items = [
        { label: '⬅ 列追加（左）', action: () => this._insertColumn(ci) },
        { label: '➡ 列追加（右）', action: () => this._insertColumn(ci + 1) },
        { label: '---' },
        { label: '⬆ 行追加（上）', action: () => this._insertRow(ri >= 0 ? ri : 0) },
        { label: '⬇ 行追加（下）', action: () => this._insertRow(ri >= 0 ? ri + 1 : this.rows.length) },
        { label: '---' },
        { label: '✕ この列を削除', action: () => this._deleteColumn(ci), disabled: this.headers.length <= 1 },
        { label: '✕ この行を削除', action: () => this._deleteRow(ri), disabled: ri < 0 || this.rows.length <= 1 },
      ];
      for (const item of items) {
        if (item.label === '---') { const sep = _el('div', 'table-ctx-sep'); menu.appendChild(sep); continue; }
        const btn = _el('div', 'table-ctx-item');
        btn.textContent = item.label;
        if (item.disabled) { btn.classList.add('disabled'); } else {
          btn.addEventListener('click', () => { this._hideCtxMenu(); item.action(); });
        }
        menu.appendChild(btn);
      }
      menu.style.display = 'block';
      menu.style.left = e.clientX + 'px';
      menu.style.top = e.clientY + 'px';
      // Adjust if off-screen
      requestAnimationFrame(() => {
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) menu.style.left = (e.clientX - rect.width) + 'px';
        if (rect.bottom > window.innerHeight) menu.style.top = (e.clientY - rect.height) + 'px';
      });
    }
    _hideCtxMenu() { if (this._ctxMenu) this._ctxMenu.style.display = 'none'; }
    _updateSelIndicator() {
      this._selIndicator.textContent = (this._selectedRow >= 0 && this._selectedCol >= 0) ?
        '選択: 行' + (this._selectedRow + 1) + ' / 列' + (this._selectedCol + 1) : '選択: なし';
    }
    _renderTable() {
      this._tableEl.innerHTML = ''; const colCount = this.headers.length;
      if (colCount > 1) {
        const cdr = _el('tr', '');
        for (let ci = 0; ci < colCount; ci++) {
          const th = _el('th', ''); th.style.padding = '0'; th.style.textAlign = 'center';
          const btn = _el('button', 'col-del-btn'); btn.textContent = '✕'; btn.title = 'この列を削除';
          btn.addEventListener('click', () => this._deleteColumn(ci)); th.appendChild(btn); cdr.appendChild(th);
        }
        cdr.appendChild(_el('th', '')); this._tableEl.appendChild(cdr);
      }
      const headerRow = _el('tr', '');
      for (let ci = 0; ci < colCount; ci++) {
        const th = _el('th', ''); const input = _el('input', ''); input.value = this.headers[ci]; input.placeholder = '列名';
        const cc = ci;
        input.addEventListener('focus', () => { this._selectedCol = cc; this._selectedRow = -1; this._updateSelIndicator(); });
        input.addEventListener('change', () => { this.headers[cc] = input.value; this._emitChange(); });
        th.addEventListener('contextmenu', (e) => this._showCtxMenu(e, -1, cc));
        th.appendChild(input); headerRow.appendChild(th);
      }
      headerRow.appendChild(_el('th', 'row-actions')); this._tableEl.appendChild(headerRow);
      for (let ri = 0; ri < this.rows.length; ri++) {
        const tr = _el('tr', '');
        for (let ci = 0; ci < colCount; ci++) {
          const td = _el('td', ''); const input = _el('input', ''); input.value = this.rows[ri][ci] || ''; input.placeholder = '...';
          const cri = ri, cci = ci;
          input.addEventListener('focus', () => { this._selectedRow = cri; this._selectedCol = cci; this._updateSelIndicator(); });
          input.addEventListener('change', () => { this.rows[cri][cci] = input.value; this._emitChange(); });
          td.addEventListener('contextmenu', (e) => this._showCtxMenu(e, cri, cci));
          td.appendChild(input); tr.appendChild(td);
        }
        if (this.rows.length > 1) {
          const actionTd = _el('td', 'row-actions');
          const delBtn = _el('button', 'row-del-btn'); delBtn.textContent = '✕';
          delBtn.addEventListener('click', () => this._deleteRow(ri));
          actionTd.appendChild(delBtn); tr.appendChild(actionTd);
        } else tr.appendChild(_el('td', 'row-actions'));
        this._tableEl.appendChild(tr);
      }
    }
    _emitChange() { this.onChange(this._generate()); }
    _insertColumn(at) { const idx = Math.max(0, Math.min(at, this.headers.length)); this.headers.splice(idx, 0, '新列'); for (const r of this.rows) r.splice(idx, 0, ''); this._selectedCol = idx; this._renderTable(); this._emitChange(); }
    _insertRow(at) { const idx = Math.max(0, Math.min(at, this.rows.length)); this.rows.splice(idx, 0, new Array(this.headers.length).fill('')); this._selectedRow = idx; this._renderTable(); this._emitChange(); }
    _deleteColumn(ci) { if (this.headers.length <= 1) return; this.headers.splice(ci, 1); for (const r of this.rows) r.splice(ci, 1); if (this._selectedCol >= this.headers.length) this._selectedCol = this.headers.length - 1; this._renderTable(); this._emitChange(); }
    _deleteRow(ri) { if (this.rows.length <= 1) return; this.rows.splice(ri, 1); if (this._selectedRow >= this.rows.length) this._selectedRow = this.rows.length - 1; this._renderTable(); this._emitChange(); }
  }

  // ═══════════════════════════════════════════════════════════════
  //  MINDMAP VISUAL EDITOR — Diagram-first layout
  // ═══════════════════════════════════════════════════════════════
  class MindmapEditor {
    constructor(container, code, onChange) {
      this.container = container; this.onChange = onChange;
      this.root = null; this._dragData = null;
      this._highlightedNode = null;
      _initZoom(this);
      _initUndoKeyboard(this);
      this._parse(code); this._buildUI(); this._render();
    }
    destroy() { _destroyUndoKeyboard(this); this.container.innerHTML = ''; }
    getCode() { return this._generate(); }

    _snapshot() { return JSON.parse(JSON.stringify(this.root)); }
    _restoreSnapshot(snap) { this.root = snap; }
    _doUndo() { const s = this._undo.undo(); if (s) { this._restoreSnapshot(s); this._render(true); } }
    _doRedo() { const s = this._undo.redo(); if (s) { this._restoreSnapshot(s); this._render(true); } }
    _deleteSelected() {
      if (!this._highlightedNode || this._highlightedNode === this.root) return;
      const parent = this._findParent(this.root, this._highlightedNode);
      if (parent) {
        parent.children = parent.children.filter(c => c !== this._highlightedNode);
        this._highlightedNode = null;
        this._render();
      }
    }
    _findParent(node, target) {
      for (const child of node.children) {
        if (child === target) return node;
        const found = this._findParent(child, target);
        if (found) return found;
      }
      return null;
    }

    _parse(code) {
      const lines = code.split('\n'); const nodeStack = [];
      for (const line of lines) {
        if (!line.trim() || line.trim() === 'mindmap' || line.trim().startsWith('%%')) continue;
        const indent = line.search(/\S/); const raw = line.trim();
        let text = raw, shape = 'default';
        const shapePatterns = [
          { re: /^\(\((.+)\)\)$/, shape: 'cloud' }, { re: /^\((.+)\)$/, shape: 'rounded' },
          { re: /^\[(.+)\]$/, shape: 'square' }, { re: /^\)\)(.+)\(\($/, shape: 'bang' },
          { re: /^\{\{(.+)\}\}$/, shape: 'hexagon' },
        ];
        for (const sp of shapePatterns) { const m = raw.match(sp.re); if (m) { text = m[1]; shape = sp.shape; break; } }
        const node = { text, shape, children: [] };
        if (nodeStack.length === 0) { this.root = node; nodeStack.push({ node, indent }); }
        else {
          while (nodeStack.length > 1 && nodeStack[nodeStack.length - 1].indent >= indent) nodeStack.pop();
          nodeStack[nodeStack.length - 1].node.children.push(node);
          nodeStack.push({ node, indent });
        }
      }
      if (!this.root) this.root = { text: 'Root', shape: 'cloud', children: [] };
    }

    _generate() {
      const lines = ['mindmap']; this._genNode(this.root, 2, lines); return lines.join('\n');
    }
    _genNode(node, indent, lines) {
      const pad = ' '.repeat(indent); let wrapped = node.text;
      switch (node.shape) {
        case 'cloud': wrapped = '((' + node.text + '))'; break; case 'rounded': wrapped = '(' + node.text + ')'; break;
        case 'square': wrapped = '[' + node.text + ']'; break; case 'bang': wrapped = '))' + node.text + '(('; break;
        case 'hexagon': wrapped = '{{' + node.text + '}}'; break;
      }
      lines.push(pad + wrapped);
      for (const child of node.children) this._genNode(child, indent + 2, lines);
    }

    _buildUI() {
      this.container.innerHTML = ''; this.container.classList.add('dve-root');
      const toolbar = _el('div', 'dve-toolbar');
      const addBtn = _el('button', 'mve-tool-btn'); addBtn.textContent = '➕ ノード追加';
      addBtn.addEventListener('click', () => this._quickAddChild(this.root));
      toolbar.appendChild(addBtn);
      toolbar.appendChild(_elText('span', '⠿ ドラッグで移動 | クリックでテキスト編集', 'dve-hint'));

      const undoBtn = _el('button', 'mve-tool-btn'); undoBtn.textContent = '↩ 元に戻す';
      undoBtn.addEventListener('click', () => this._doUndo());
      toolbar.appendChild(undoBtn);
      const redoBtn = _el('button', 'mve-tool-btn'); redoBtn.textContent = '↪ やり直し';
      redoBtn.addEventListener('click', () => this._doRedo());
      toolbar.appendChild(redoBtn);

      _addZoomControls(toolbar, this);
      this.container.appendChild(toolbar);

      const body = _el('div', 'dve-body');
      this._listPanel = _el('div', 'dve-list-panel');
      body.appendChild(this._listPanel);

      this._svgArea = _el('div', 'dve-svg-area');
      _attachZoomWheel(this);
      body.appendChild(this._svgArea);

      this.container.appendChild(body);
    }

    async _render(skipUndo) {
      if (!skipUndo) _commitUndo(this);
      const code = this._generate(); this.onChange(code);
      this._renderTree();
      try {
        const id = 'mm-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
        const { svg } = await mermaid.render(id, code);
        this._svgArea.innerHTML = svg;
        _postRenderZoom(this);
        this._attachSvgEvents();
      } catch (err) { this._svgArea.innerHTML = '<div class="mermaid-error">プレビューエラー:<br>' + _escHtml(String(err)) + '</div>'; }
    }

    // SVG click: find text in SVG node, match to tree node, trigger inline edit
    // SVG drag: drag node to another node to reparent
    _attachSvgEvents() {
      const svgEl = this._svgArea.querySelector('svg');
      if (!svgEl) return;
      svgEl.style.pointerEvents = 'all';
      svgEl.style.cursor = 'default';

      const allNodes = this._flattenNodes(this.root);
      const nodeTexts = allNodes.map(n => n.text);
      const self = this;
      let svgDragState = null; // { node, nodeIdx, startX, startY, indicator }

      // Build a map of nodeIdx → <g> element for drop target detection
      const nodeGroupMap = new Map();

      const setupNodeHandlers = (g, text, nodeIdx) => {
        nodeGroupMap.set(nodeIdx, g);
        g.style.cursor = 'pointer';
        g.addEventListener('mouseenter', () => {
          if (svgDragState && svgDragState.nodeIdx !== nodeIdx) {
            // Highlight as potential drop target
            if (!self._isDescendant(allNodes[svgDragState.nodeIdx], allNodes[nodeIdx])) {
              g.style.filter = 'brightness(1.3) drop-shadow(0 0 6px #00cc66)';
            }
          } else if (!svgDragState) {
            g.style.filter = 'brightness(1.2) drop-shadow(0 0 4px #007fd4)';
          }
        });
        g.addEventListener('mouseleave', () => { g.style.filter = ''; });

        // Click → highlight in tree
        g.addEventListener('click', (e) => {
          if (svgDragState) return; // Don't handle click during drag
          e.stopPropagation();
          self._highlightedNode = (self._highlightedNode === allNodes[nodeIdx]) ? null : allNodes[nodeIdx];
          self._renderTree();
        });

        // Dblclick → inline edit
        g.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          const node = allNodes[nodeIdx];
          if (node) {
            self._highlightedNode = node;
            self._renderTree();
            const labels = self._listPanel.querySelectorAll('.mindmap-editable-label');
            if (labels[nodeIdx]) {
              _inlineEdit(labels[nodeIdx], node.text, (v) => { node.text = v; self._render(); });
            }
          }
        });

        // Mousedown → start SVG D&D (only non-root nodes)
        g.addEventListener('mousedown', (e) => {
          if (nodeIdx === 0) return; // Can't drag root
          e.stopPropagation();
          const rect = svgEl.getBoundingClientRect();
          svgDragState = { node: allNodes[nodeIdx], nodeIdx, startX: e.clientX, startY: e.clientY, moved: false, indicator: null };
        });

        // Right-click → context menu
        g.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const node = allNodes[nodeIdx];
          if (!node || !window.DiagramCommon) return;
          self._highlightedNode = node;
          self._renderTree();
          const isRoot = (nodeIdx === 0);
          const menu = [
            { label: '➕ 子ノードを追加', onClick: () => self._quickAddChild(node) },
            { label: '✎ 名前を編集', onClick: () => {
              const labels = self._listPanel.querySelectorAll('.mindmap-editable-label');
              if (labels[nodeIdx]) _inlineEdit(labels[nodeIdx], node.text, (v) => { node.text = v; self._render(); });
            }},
            'separator',
            { label: '🗑 このノードを削除', danger: true, disabled: isRoot, onClick: () => self._deleteSelected() },
          ];
          window.DiagramCommon.showContextMenu(e.clientX, e.clientY, menu);
        });
      };

      // Strategy 1: foreignObject divs
      const foreignDivs = svgEl.querySelectorAll('foreignObject');
      foreignDivs.forEach((fo) => {
        const text = fo.textContent.trim();
        const nodeIdx = nodeTexts.indexOf(text);
        if (nodeIdx < 0) return;
        const g = fo.closest('g') || fo.parentElement;
        if (g) setupNodeHandlers(g, text, nodeIdx);
      });

      // Strategy 2: <text> fallback
      if (foreignDivs.length === 0) {
        const textEls = svgEl.querySelectorAll('text');
        textEls.forEach((te) => {
          const text = te.textContent.trim();
          const nodeIdx = nodeTexts.indexOf(text);
          if (nodeIdx < 0) return;
          const g = te.closest('g') || te.parentElement;
          if (g) setupNodeHandlers(g, text, nodeIdx);
        });
      }

      // SVG-level drag handlers
      svgEl.addEventListener('mousemove', (e) => {
        if (!svgDragState) return;
        const dx = e.clientX - svgDragState.startX;
        const dy = e.clientY - svgDragState.startY;
        if (!svgDragState.moved && Math.abs(dx) + Math.abs(dy) > 8) {
          svgDragState.moved = true;
          // Create drag indicator
          const ind = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          ind.setAttribute('fill', '#007fd4');
          ind.setAttribute('font-size', '14');
          ind.style.pointerEvents = 'none';
          ind.textContent = '📦 ' + allNodes[svgDragState.nodeIdx].text;
          svgEl.appendChild(ind);
          svgDragState.indicator = ind;
          svgEl.style.cursor = 'grabbing';
        }
        if (svgDragState.indicator) {
          const pt = self._svgPoint ? self._svgPoint(svgEl, e) : { x: e.offsetX, y: e.offsetY };
          svgDragState.indicator.setAttribute('x', String(pt.x + 10));
          svgDragState.indicator.setAttribute('y', String(pt.y - 10));
        }
      });

      svgEl.addEventListener('mouseup', (e) => {
        if (!svgDragState) return;
        const dragState = svgDragState;
        svgDragState = null;
        svgEl.style.cursor = 'default';
        if (dragState.indicator) dragState.indicator.remove();
        // Reset all group filters
        nodeGroupMap.forEach(g => { g.style.filter = ''; });

        if (!dragState.moved) return; // Was just a click, not a drag

        // Find drop target: which node group is under the mouse?
        const dropTarget = document.elementFromPoint(e.clientX, e.clientY);
        if (!dropTarget) return;
        let targetNodeIdx = -1;
        nodeGroupMap.forEach((g, idx) => {
          if (g.contains(dropTarget) || g === dropTarget) targetNodeIdx = idx;
        });
        if (targetNodeIdx < 0 || targetNodeIdx === dragState.nodeIdx) return;

        const draggedNode = allNodes[dragState.nodeIdx];
        const targetNode = allNodes[targetNodeIdx];
        // Prevent dropping onto a descendant
        if (self._isDescendant(draggedNode, targetNode)) return;

        // Remove from current parent
        const parent = self._findParent(self.root, draggedNode);
        if (!parent) return;
        const childIdx = parent.children.indexOf(draggedNode);
        if (childIdx >= 0) parent.children.splice(childIdx, 1);
        // Add as child of target
        targetNode.children.push(draggedNode);
        self._render();
      });

      // Click empty area → deselect
      svgEl.addEventListener('click', () => {
        if (svgDragState) return;
        if (self._highlightedNode) { self._highlightedNode = null; self._renderTree(); }
      });
    }

    // Find parent of a node in the tree
    _findParent(root, targetNode) {
      for (const child of root.children) {
        if (child === targetNode) return root;
        const found = this._findParent(child, targetNode);
        if (found) return found;
      }
      return null;
    }

    // SVG point conversion (viewBox-based)
    _svgPoint(svgEl, e) {
      const rect = svgEl.getBoundingClientRect();
      const vb = svgEl.viewBox.baseVal;
      if (vb && vb.width > 0 && vb.height > 0) {
        return {
          x: ((e.clientX - rect.left) / rect.width) * vb.width + vb.x,
          y: ((e.clientY - rect.top) / rect.height) * vb.height + vb.y,
        };
      }
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    // Flatten tree to array for text matching
    _flattenNodes(node) {
      if (!node) return [];
      const result = [node];
      for (const child of node.children) result.push(...this._flattenNodes(child));
      return result;
    }

    _renderTree() {
      this._listPanel.innerHTML = '';
      if (this.root) this._renderTreeNode(this.root, 0, this._listPanel, null, -1);
    }

    _renderTreeNode(node, depth, parentEl, parentNode, indexInParent) {
      const row = _el('div', 'mindmap-tree-row dnd-item');
      row.style.paddingLeft = (8 + depth * 16) + 'px';
      if (this._highlightedNode === node) row.classList.add('dve-highlighted');
      const shapes = { 'default': '■', 'cloud': '☁', 'rounded': '●', 'square': '□', 'bang': '💥', 'hexagon': '⬡' };

      if (parentNode) { const handle = _el('span', 'dnd-handle'); handle.textContent = '⠿'; row.appendChild(handle); }
      row.appendChild(_elText('span', (shapes[node.shape] || '■') + ' ', 'mindmap-tree-icon'));

      const label = _el('span', 'diagram-ve-item-label mindmap-editable-label');
      label.textContent = node.text; label.title = node.text;
      label.addEventListener('click', (e) => {
        e.stopPropagation();
        this._highlightedNode = (this._highlightedNode === node) ? null : node;
        this._renderTree();
      });
      label.addEventListener('dblclick', (e) => { e.stopPropagation(); _inlineEdit(label, node.text, (v) => { node.text = v; this._render(); }); });
      row.appendChild(label);

      const actions = _el('span', 'diagram-ve-item-actions');
      const addChildBtn = _el('button', ''); addChildBtn.textContent = '+'; addChildBtn.title = '子ノード追加';
      addChildBtn.addEventListener('click', (e) => { e.stopPropagation(); this._quickAddChild(node); }); actions.appendChild(addChildBtn);
      const shapeBtn = _el('button', ''); shapeBtn.textContent = '◇'; shapeBtn.title = '形状変更';
      shapeBtn.addEventListener('click', (e) => { e.stopPropagation(); this._changeShape(node); }); actions.appendChild(shapeBtn);
      if (parentNode) {
        const delBtn = _el('button', ''); delBtn.textContent = '✕';
        delBtn.addEventListener('click', (e) => { e.stopPropagation(); parentNode.children.splice(indexInParent, 1); this._render(); });
        actions.appendChild(delBtn);
      }
      row.appendChild(actions);

      // D&D
      if (parentNode) {
        row.draggable = true;
        row.addEventListener('dragstart', (e) => { e.stopPropagation(); this._dragData = { node, parentNode, indexInParent }; row.classList.add('dnd-dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', ''); });
        row.addEventListener('dragend', (e) => { e.stopPropagation(); row.classList.remove('dnd-dragging'); this._dragData = null; this._listPanel.querySelectorAll('.dnd-over, .dnd-over-child').forEach(el => el.classList.remove('dnd-over', 'dnd-over-child', 'dnd-over-above', 'dnd-over-below')); });
      }
      row.addEventListener('dragover', (e) => {
        if (!this._dragData) return; if (this._dragData.node === node) return; if (this._isDescendant(this._dragData.node, node)) return;
        e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move';
        const rect = row.getBoundingClientRect(); const relY = e.clientY - rect.top;
        row.classList.remove('dnd-over-above', 'dnd-over-below', 'dnd-over-child');
        if (relY < rect.height * 0.25) row.classList.add('dnd-over-above');
        else if (relY > rect.height * 0.75) row.classList.add('dnd-over-below');
        else row.classList.add('dnd-over-child');
        row.classList.add('dnd-over');
      });
      row.addEventListener('dragleave', (e) => { if (!row.contains(e.relatedTarget)) row.classList.remove('dnd-over', 'dnd-over-above', 'dnd-over-below', 'dnd-over-child'); });
      row.addEventListener('drop', (e) => {
        e.preventDefault(); e.stopPropagation(); row.classList.remove('dnd-over', 'dnd-over-above', 'dnd-over-below', 'dnd-over-child');
        if (!this._dragData || this._dragData.node === node) return; if (this._isDescendant(this._dragData.node, node)) return;
        const dd = this._dragData; const rect = row.getBoundingClientRect(); const relY = e.clientY - rect.top;
        dd.parentNode.children.splice(dd.indexInParent, 1);
        if (relY >= rect.height * 0.25 && relY <= rect.height * 0.75) { node.children.push(dd.node); }
        else if (parentNode) { parentNode.children.splice(relY < rect.height * 0.25 ? indexInParent : indexInParent + 1, 0, dd.node); }
        else { node.children.push(dd.node); }
        this._render();
      });

      parentEl.appendChild(row);
      for (let i = 0; i < node.children.length; i++) this._renderTreeNode(node.children[i], depth + 1, parentEl, node, i);
    }

    _isDescendant(potentialParent, node) {
      for (const child of potentialParent.children) { if (child === node || this._isDescendant(child, node)) return true; }
      return false;
    }

    _quickAddChild(parentNode) {
      const newNode = { text: '新しいノード', shape: 'default', children: [] };
      parentNode.children.push(newNode); this._render();
      const labels = this._listPanel.querySelectorAll('.mindmap-editable-label');
      if (labels.length > 0) _inlineEdit(labels[labels.length - 1], '新しいノード', (v) => { newNode.text = v; this._render(); });
    }

    async _changeShape(node) {
      const result = await _showDialog(this.container, {
        title: '形状変更',
        fields: [{ key: 'shape', label: '形状', type: 'select', value: node.shape, options: [
          { value: 'default', label: 'デフォルト' }, { value: 'rounded', label: '丸角 ( )' }, { value: 'square', label: '四角 [ ]' },
          { value: 'cloud', label: '雲 (( ))' }, { value: 'hexagon', label: '六角 {{ }}' }, { value: 'bang', label: '爆発 )) ((' },
        ]}],
      });
      if (result) { node.shape = result.shape; this._render(); }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  QUADRANT CHART VISUAL EDITOR — Diagram-first layout
  // ═══════════════════════════════════════════════════════════════
  class QuadrantChartEditor {
    constructor(container, code, onChange) {
      this.container = container; this.onChange = onChange;
      this.title = ''; this.xAxisLeft = ''; this.xAxisRight = '';
      this.yAxisBottom = ''; this.yAxisTop = '';
      this.quadrants = ['', '', '', '']; this.points = [];
      _initZoom(this);
      _initUndoKeyboard(this);
      this._parse(code); this._buildUI(); this._render();
    }
    destroy() { _destroyUndoKeyboard(this); this.container.innerHTML = ''; }
    getCode() { return this._generate(); }

    _snapshot() { return { title: this.title, xAxisLeft: this.xAxisLeft, xAxisRight: this.xAxisRight, yAxisBottom: this.yAxisBottom, yAxisTop: this.yAxisTop, quadrants: [...this.quadrants], points: JSON.parse(JSON.stringify(this.points)) }; }
    _restoreSnapshot(snap) { this.title = snap.title; this.xAxisLeft = snap.xAxisLeft; this.xAxisRight = snap.xAxisRight; this.yAxisBottom = snap.yAxisBottom; this.yAxisTop = snap.yAxisTop; this.quadrants = snap.quadrants; this.points = snap.points; }
    _doUndo() { const s = this._undo.undo(); if (s) { this._restoreSnapshot(s); this._render(true); } }
    _doRedo() { const s = this._undo.redo(); if (s) { this._restoreSnapshot(s); this._render(true); } }
    _parse(code) {
      const lines = code.split('\n');
      for (const line of lines) {
        const t = line.trim();
        if (!t || t === 'quadrantChart' || t.startsWith('%%')) continue;
        const tm = t.match(/^title\s+(.+)$/); if (tm) { this.title = tm[1]; continue; }
        const xm = t.match(/^x-axis\s+"?(.+?)"?\s+-->\s+"?(.+?)"?\s*$/); if (xm) { this.xAxisLeft = xm[1]; this.xAxisRight = xm[2]; continue; }
        const ym = t.match(/^y-axis\s+"?(.+?)"?\s+-->\s+"?(.+?)"?\s*$/); if (ym) { this.yAxisBottom = ym[1]; this.yAxisTop = ym[2]; continue; }
        const q1 = t.match(/^quadrant-1\s+(.+)$/); if (q1) { this.quadrants[0] = q1[1]; continue; }
        const q2 = t.match(/^quadrant-2\s+(.+)$/); if (q2) { this.quadrants[1] = q2[1]; continue; }
        const q3 = t.match(/^quadrant-3\s+(.+)$/); if (q3) { this.quadrants[2] = q3[1]; continue; }
        const q4 = t.match(/^quadrant-4\s+(.+)$/); if (q4) { this.quadrants[3] = q4[1]; continue; }
        const pm = t.match(/^(.+?):\s*\[\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\]$/);
        if (pm) this.points.push({ name: pm[1].trim(), x: parseFloat(pm[2]), y: parseFloat(pm[3]) });
      }
    }
    _generate() {
      const lines = ['quadrantChart'];
      if (this.title) lines.push('    title ' + this.title);
      if (this.xAxisLeft || this.xAxisRight) lines.push('    x-axis ' + this.xAxisLeft + ' --> ' + this.xAxisRight);
      if (this.yAxisBottom || this.yAxisTop) lines.push('    y-axis ' + this.yAxisBottom + ' --> ' + this.yAxisTop);
      for (let i = 0; i < 4; i++) if (this.quadrants[i]) lines.push('    quadrant-' + (i + 1) + ' ' + this.quadrants[i]);
      for (const p of this.points) lines.push('    ' + p.name + ': [' + p.x.toFixed(2) + ', ' + p.y.toFixed(2) + ']');
      return lines.join('\n');
    }
    _buildUI() {
      this.container.innerHTML = ''; this.container.classList.add('dve-root');
      const toolbar = _el('div', 'dve-toolbar');
      const addPtBtn = _el('button', 'mve-tool-btn'); addPtBtn.textContent = '📍 データ点追加';
      addPtBtn.addEventListener('click', () => this._addPoint()); toolbar.appendChild(addPtBtn);
      toolbar.appendChild(_elText('span', '図上でドラッグして位置変更 | ダブルクリックで名前編集', 'dve-hint'));

      const undoBtn = _el('button', 'mve-tool-btn'); undoBtn.textContent = '↩ 元に戻す';
      undoBtn.addEventListener('click', () => this._doUndo());
      toolbar.appendChild(undoBtn);
      const redoBtn = _el('button', 'mve-tool-btn'); redoBtn.textContent = '↪ やり直し';
      redoBtn.addEventListener('click', () => this._doRedo());
      toolbar.appendChild(redoBtn);

      _addZoomControls(toolbar, this);
      this.container.appendChild(toolbar);

      this._statusBar = _el('div', 'dve-status');
      this._statusBar.style.display = 'none';
      this.container.appendChild(this._statusBar);

      const body = _el('div', 'dve-body');
      this._listPanel = _el('div', 'dve-list-panel');
      body.appendChild(this._listPanel);

      this._svgArea = _el('div', 'dve-svg-area');
      _attachZoomWheel(this);
      body.appendChild(this._svgArea);

      this.container.appendChild(body);
    }
    async _render(skipUndo) {
      if (!skipUndo) _commitUndo(this);
      const code = this._generate(); this.onChange(code);
      this._renderConfig();
      try {
        const id = 'qc-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
        const { svg } = await mermaid.render(id, code);
        this._svgArea.innerHTML = svg;
        _postRenderZoom(this);
        this._attachSvgEvents();
      } catch (err) { this._svgArea.innerHTML = '<div class="mermaid-error">プレビューエラー:<br>' + _escHtml(String(err)) + '</div>'; }
    }
    _setStatus(msg) {
      if (msg) { this._statusBar.textContent = msg; this._statusBar.style.display = ''; }
      else { this._statusBar.textContent = ''; this._statusBar.style.display = 'none'; }
    }
    _attachSvgEvents() {
      const svgEl = this._svgArea.querySelector('svg');
      if (!svgEl || this.points.length === 0) return;
      svgEl.style.pointerEvents = 'all';
      svgEl.style.cursor = 'default';

      // ── Detect the quadrant plotting area ──
      // Mermaid v10 quadrant chart renders colored <rect> elements for the 4 quadrants
      // and <circle> elements for data points. We need to find the plot bounding box.
      const allRects = svgEl.querySelectorAll('rect');
      const allCircles = svgEl.querySelectorAll('circle');
      const allTexts = svgEl.querySelectorAll('text');
      if (allCircles.length === 0) return;

      // Find the quadrant bounding box: the 4 quadrant rects are usually the large colored rects.
      // Strategy: find rects that are large and have fill colors (not white/transparent)
      let plotLeft = Infinity, plotRight = -Infinity, plotTop = Infinity, plotBottom = -Infinity;
      const candidateRects = [];
      allRects.forEach(r => {
        const x = parseFloat(r.getAttribute('x'));
        const y = parseFloat(r.getAttribute('y'));
        const w = parseFloat(r.getAttribute('width'));
        const h = parseFloat(r.getAttribute('height'));
        if (isNaN(x) || isNaN(y) || isNaN(w) || isNaN(h)) return;
        if (w > 20 && h > 20) candidateRects.push({ x, y, w, h });
      });
      // Use the 4 largest rects as quadrant areas (or just use their combined bounds)
      candidateRects.sort((a, b) => (b.w * b.h) - (a.w * a.h));
      const quadRects = candidateRects.slice(0, 4);
      if (quadRects.length < 4) {
        // Fallback: use circle positions to estimate bounds
        allCircles.forEach(c => {
          const cx = parseFloat(c.getAttribute('cx'));
          const cy = parseFloat(c.getAttribute('cy'));
          if (!isNaN(cx)) { plotLeft = Math.min(plotLeft, cx - 20); plotRight = Math.max(plotRight, cx + 20); }
          if (!isNaN(cy)) { plotTop = Math.min(plotTop, cy - 20); plotBottom = Math.max(plotBottom, cy + 20); }
        });
      } else {
        for (const r of quadRects) {
          plotLeft = Math.min(plotLeft, r.x);
          plotRight = Math.max(plotRight, r.x + r.w);
          plotTop = Math.min(plotTop, r.y);
          plotBottom = Math.max(plotBottom, r.y + r.h);
        }
      }
      const plotW = plotRight - plotLeft;
      const plotH = plotBottom - plotTop;
      if (plotW <= 0 || plotH <= 0) return;

      // ── Map circles to data points by matching nearby text labels ──
      const circlePointMap = []; // { circle, textEl, pointIdx }
      const usedPointIdxs = new Set();

      allCircles.forEach(circle => {
        const cx = parseFloat(circle.getAttribute('cx'));
        const cy = parseFloat(circle.getAttribute('cy'));
        if (isNaN(cx) || isNaN(cy)) return;

        // Find nearest text element
        let bestTextEl = null, bestDist = Infinity;
        allTexts.forEach(t => {
          const tx = parseFloat(t.getAttribute('x'));
          const ty = parseFloat(t.getAttribute('y'));
          if (isNaN(tx) || isNaN(ty)) return;
          const dist = Math.sqrt((cx - tx) ** 2 + (cy - ty) ** 2);
          if (dist < bestDist && dist < 100) { bestDist = dist; bestTextEl = t; }
        });

        // Match to a data point by name
        const textContent = bestTextEl ? bestTextEl.textContent.trim() : '';
        let matchIdx = -1;
        for (let i = 0; i < this.points.length; i++) {
          if (!usedPointIdxs.has(i) && this.points[i].name === textContent) {
            matchIdx = i; break;
          }
        }
        // If no name match, match by coordinate proximity
        if (matchIdx < 0) {
          const normX = (cx - plotLeft) / plotW;
          const normY = 1 - (cy - plotTop) / plotH;
          let bestCoordDist = Infinity;
          for (let i = 0; i < this.points.length; i++) {
            if (usedPointIdxs.has(i)) continue;
            const dx = normX - this.points[i].x;
            const dy = normY - this.points[i].y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < bestCoordDist) { bestCoordDist = d; matchIdx = i; }
          }
        }
        if (matchIdx >= 0) {
          usedPointIdxs.add(matchIdx);
          circlePointMap.push({ circle, textEl: bestTextEl, pointIdx: matchIdx });
        }
      });

      // ── Attach event handlers to each mapped circle ──
      const self = this;
      circlePointMap.forEach(({ circle, textEl, pointIdx }) => {
        const point = this.points[pointIdx];
        circle.style.cursor = 'grab';
        circle.style.pointerEvents = 'all';

        // Hover
        circle.addEventListener('mouseenter', () => { circle.style.filter = 'brightness(1.4) drop-shadow(0 0 6px #007fd4)'; });
        circle.addEventListener('mouseleave', () => { if (!self._qcDrag || self._qcDrag.pointIdx !== pointIdx) circle.style.filter = ''; });

        // Dblclick on circle → edit point name
        circle.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          self._editPoint(pointIdx);
        });

        // Click on circle → highlight in config list
        circle.addEventListener('click', (e) => {
          e.stopPropagation();
          self._setStatus('📍 ' + point.name + ' (' + point.x.toFixed(2) + ', ' + point.y.toFixed(2) + ')');
        });

        // Right-click → context menu
        circle.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!window.DiagramCommon) return;
          window.DiagramCommon.showContextMenu(e.clientX, e.clientY, [
            { label: '✎ ポイントを編集', onClick: () => self._editPoint(pointIdx) },
            'separator',
            { label: '🗑 このポイントを削除', danger: true, onClick: () => {
              self.points.splice(pointIdx, 1); self._render();
            }},
          ]);
        });

        // Drag to reposition
        circle.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          e.preventDefault();
          self._qcDrag = { pointIdx, circle, textEl, startCx: parseFloat(circle.getAttribute('cx')), startCy: parseFloat(circle.getAttribute('cy')) };
          circle.style.cursor = 'grabbing';
          svgEl.style.cursor = 'grabbing';
        });

        // Dblclick on text label → edit point name
        if (textEl) {
          textEl.style.cursor = 'pointer';
          textEl.style.pointerEvents = 'all';
          textEl.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            self._editPoint(pointIdx);
          });
          textEl.addEventListener('click', (e) => {
            e.stopPropagation();
            self._setStatus('📍 ' + point.name + ' (' + point.x.toFixed(2) + ', ' + point.y.toFixed(2) + ')');
          });
        }
      });

      // SVG-level drag handlers
      svgEl.addEventListener('mousemove', (e) => {
        if (!self._qcDrag) return;
        const pt = self._svgPoint(svgEl, e);
        // Clamp to plot area
        const clampedX = Math.max(plotLeft, Math.min(plotRight, pt.x));
        const clampedY = Math.max(plotTop, Math.min(plotBottom, pt.y));
        self._qcDrag.circle.setAttribute('cx', String(clampedX));
        self._qcDrag.circle.setAttribute('cy', String(clampedY));
        // Move text label too
        if (self._qcDrag.textEl) {
          self._qcDrag.textEl.setAttribute('x', String(clampedX));
          self._qcDrag.textEl.setAttribute('y', String(clampedY - 12));
        }
        // Update coordinates in real time (status bar)
        const normX = Math.max(0, Math.min(1, (clampedX - plotLeft) / plotW));
        const normY = Math.max(0, Math.min(1, 1 - (clampedY - plotTop) / plotH));
        self._setStatus('📍 移動中: (' + normX.toFixed(2) + ', ' + normY.toFixed(2) + ')');
      });

      svgEl.addEventListener('mouseup', (e) => {
        if (!self._qcDrag) return;
        const drag = self._qcDrag;
        self._qcDrag = null;
        svgEl.style.cursor = 'default';
        drag.circle.style.cursor = 'grab';
        drag.circle.style.filter = '';
        self._setStatus('');

        const pt = self._svgPoint(svgEl, e);
        const clampedX = Math.max(plotLeft, Math.min(plotRight, pt.x));
        const clampedY = Math.max(plotTop, Math.min(plotBottom, pt.y));
        const normX = Math.max(0, Math.min(1, (clampedX - plotLeft) / plotW));
        const normY = Math.max(0, Math.min(1, 1 - (clampedY - plotTop) / plotH));
        const oldX = self.points[drag.pointIdx].x;
        const oldY = self.points[drag.pointIdx].y;
        // Only re-render if position actually changed
        if (Math.abs(normX - oldX) > 0.005 || Math.abs(normY - oldY) > 0.005) {
          self.points[drag.pointIdx].x = parseFloat(normX.toFixed(2));
          self.points[drag.pointIdx].y = parseFloat(normY.toFixed(2));
          self._render();
        }
      });

      // Cancel drag on mouseleave
      svgEl.addEventListener('mouseleave', () => {
        if (self._qcDrag) {
          // Restore original position
          self._qcDrag.circle.setAttribute('cx', String(self._qcDrag.startCx));
          self._qcDrag.circle.setAttribute('cy', String(self._qcDrag.startCy));
          self._qcDrag = null;
          svgEl.style.cursor = 'default';
          self._setStatus('');
        }
      });

      // Click empty area → deselect
      svgEl.addEventListener('click', () => { self._setStatus(''); });
    }
    _svgPoint(svgEl, e) {
      const rect = svgEl.getBoundingClientRect();
      const vb = svgEl.viewBox.baseVal;
      if (vb && vb.width > 0 && vb.height > 0) {
        return {
          x: ((e.clientX - rect.left) / rect.width) * vb.width + vb.x,
          y: ((e.clientY - rect.top) / rect.height) * vb.height + vb.y,
        };
      }
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    _renderConfig() {
      this._listPanel.innerHTML = '';
      const mkField = (labelText, value, onChange) => {
        const row = _el('div', 'gantt-inline-field');
        row.appendChild(_elText('label', labelText, 'gantt-inline-label'));
        const input = _el('input', 'gantt-inline-input'); input.type = 'text'; input.value = value;
        input.addEventListener('change', () => onChange(input.value)); row.appendChild(input); return row;
      };
      const s = _el('div', '');
      s.appendChild(_elText('div', 'チャート設定', 'diagram-ve-section-header'));
      s.appendChild(mkField('タイトル', this.title, (v) => { this.title = v; this._render(); }));
      s.appendChild(mkField('X軸 左', this.xAxisLeft, (v) => { this.xAxisLeft = v; this._render(); }));
      s.appendChild(mkField('X軸 右', this.xAxisRight, (v) => { this.xAxisRight = v; this._render(); }));
      s.appendChild(mkField('Y軸 下', this.yAxisBottom, (v) => { this.yAxisBottom = v; this._render(); }));
      s.appendChild(mkField('Y軸 上', this.yAxisTop, (v) => { this.yAxisTop = v; this._render(); }));
      for (let i = 0; i < 4; i++) { const qi = i; s.appendChild(mkField('第' + (i + 1) + '象限', this.quadrants[i], (v) => { this.quadrants[qi] = v; this._render(); })); }
      this._listPanel.appendChild(s);
      this._listPanel.appendChild(_elText('div', 'データ点', 'diagram-ve-section-header'));
      for (let i = 0; i < this.points.length; i++) {
        const p = this.points[i]; const item = _el('div', 'diagram-ve-item');
        const label = _el('span', 'diagram-ve-item-label');
        label.textContent = '📍 ' + p.name + ' (' + p.x.toFixed(2) + ', ' + p.y.toFixed(2) + ')';
        label.title = label.textContent;
        item.appendChild(label);
        const actions = _el('div', 'diagram-ve-item-actions');
        const editBtn = _el('button', ''); editBtn.textContent = '✏️';
        editBtn.addEventListener('click', () => this._editPoint(i)); actions.appendChild(editBtn);
        const delBtn = _el('button', ''); delBtn.textContent = '✕';
        delBtn.addEventListener('click', () => { this.points.splice(i, 1); this._render(); }); actions.appendChild(delBtn);
        item.appendChild(actions); this._listPanel.appendChild(item);
      }
    }
    async _addPoint() {
      const result = await _showDialog(this.container, {
        title: 'データ点追加',
        fields: [
          { key: 'name', label: '名前', type: 'text', value: '' },
          { key: 'x', label: 'X (0.0〜1.0)', type: 'number', value: '0.5', step: '0.01', min: 0, max: 1 },
          { key: 'y', label: 'Y (0.0〜1.0)', type: 'number', value: '0.5', step: '0.01', min: 0, max: 1 },
        ],
      });
      if (!result || !result.name.trim()) return;
      const x = parseFloat(result.x), y = parseFloat(result.y);
      if (isNaN(x) || x < 0 || x > 1 || isNaN(y) || y < 0 || y > 1) { await _showAlert(this.container, '座標は0〜1の範囲で入力してください。'); return; }
      this.points.push({ name: result.name.trim(), x, y }); this._render();
    }
    async _editPoint(idx) {
      const p = this.points[idx]; if (!p) return;
      const result = await _showDialog(this.container, {
        title: 'データ点編集',
        fields: [
          { key: 'name', label: '名前', type: 'text', value: p.name },
          { key: 'x', label: 'X (0.0〜1.0)', type: 'number', value: String(p.x), step: '0.01', min: 0, max: 1 },
          { key: 'y', label: 'Y (0.0〜1.0)', type: 'number', value: String(p.y), step: '0.01', min: 0, max: 1 },
        ],
      });
      if (!result) return;
      const x = parseFloat(result.x), y = parseFloat(result.y);
      if (isNaN(x) || x < 0 || x > 1 || isNaN(y) || y < 0 || y > 1) { await _showAlert(this.container, '座標は0〜1の範囲で入力してください。'); return; }
      p.name = result.name.trim() || p.name; p.x = x; p.y = y; this._render();
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  GANTT CHART VISUAL EDITOR — Diagram-first, inline date pickers
  // ═══════════════════════════════════════════════════════════════
  class GanttChartEditor {
    constructor(container, code, onChange) {
      this.container = container; this.onChange = onChange;
      this.title = ''; this.dateFormat = 'YYYY-MM-DD'; this.axisFormat = '';
      this.sections = [];
      this._dragData = null;
      this._collapsedSections = new Set();
      _initZoom(this);
      _initUndoKeyboard(this);
      this._parse(code); this._buildUI(); this._render();
    }
    destroy() { _destroyUndoKeyboard(this); this.container.innerHTML = ''; }
    getCode() { return this._generate(); }

    _snapshot() { return { title: this.title, dateFormat: this.dateFormat, axisFormat: this.axisFormat, sections: JSON.parse(JSON.stringify(this.sections)) }; }
    _restoreSnapshot(snap) { this.title = snap.title; this.dateFormat = snap.dateFormat; this.axisFormat = snap.axisFormat; this.sections = snap.sections; }
    _doUndo() { const s = this._undo.undo(); if (s) { this._restoreSnapshot(s); this._render(true); } }
    _doRedo() { const s = this._undo.redo(); if (s) { this._restoreSnapshot(s); this._render(true); } }

    _parse(code) {
      const lines = code.split('\n'); let currentSection = null; let pendingStyle = null;
      for (const line of lines) {
        const t = line.trim();
        if (!t || t === 'gantt') continue;
        const styleMeta = t.match(/^%%gantt-style\s+(.+)$/);
        if (styleMeta) {
          pendingStyle = {};
          const pairs = styleMeta[1].split(/\s+/);
          for (const p of pairs) {
            const [k, v] = p.split(':'); if (k && v) pendingStyle[k] = v;
          }
          continue;
        }
        if (t.startsWith('%%')) continue;
        const tm = t.match(/^title\s+(.+)$/); if (tm) { this.title = tm[1]; pendingStyle = null; continue; }
        const df = t.match(/^dateFormat\s+(.+)$/); if (df) { this.dateFormat = df[1]; pendingStyle = null; continue; }
        const af = t.match(/^axisFormat\s+(.+)$/); if (af) { this.axisFormat = af[1]; pendingStyle = null; continue; }
        const sm = t.match(/^section\s+(.+)$/);
        if (sm) { currentSection = { name: sm[1], tasks: [], bgColor: '' }; if (pendingStyle) { currentSection.bgColor = pendingStyle.bg || ''; pendingStyle = null; } this.sections.push(currentSection); continue; }
        if (currentSection && t.includes(':')) {
          const colonIdx = t.indexOf(':'); const taskName = t.substring(0, colonIdx).trim();
          const parts = t.substring(colonIdx + 1).trim().split(',').map(p => p.trim());
          const task = { name: taskName, id: '', status: '', startDate: '', duration: '', after: '', bgColor: '' };
          if (pendingStyle) { task.bgColor = pendingStyle.bg || ''; pendingStyle = null; }
          const statusKw = ['done', 'active', 'crit', 'milestone'];
          let pi = 0; const statuses = [];
          while (pi < parts.length && statusKw.includes(parts[pi])) { statuses.push(parts[pi]); pi++; }
          task.status = statuses.join(', ');
          if (pi < parts.length && /^[a-zA-Z_]\w*$/.test(parts[pi])) { task.id = parts[pi]; pi++; }
          if (pi < parts.length) { if (parts[pi].startsWith('after ')) { task.after = parts[pi].substring(6).trim(); pi++; } else { task.startDate = parts[pi]; pi++; } }
          if (pi < parts.length) { task.duration = parts[pi]; pi++; }
          currentSection.tasks.push(task);
        }
      }
      if (this.sections.length === 0) this.sections.push({ name: 'デフォルト', tasks: [], bgColor: '' });
    }

    _generate() {
      const lines = ['gantt'];
      if (this.title) lines.push('    title ' + this.title);
      lines.push('    dateFormat ' + this.dateFormat);
      if (this.axisFormat) lines.push('    axisFormat ' + this.axisFormat);
      lines.push('');
      for (const section of this.sections) {
        if (section.bgColor) {
          const styleParts = [];
          if (section.bgColor) styleParts.push('bg:' + section.bgColor);
          lines.push('    %%gantt-style ' + styleParts.join(' '));
        }
        lines.push('    section ' + section.name);
        for (const task of section.tasks) {
          if (task.bgColor) {
            lines.push('    %%gantt-style bg:' + task.bgColor);
          }
          const parts = [];
          if (task.status) parts.push(task.status);
          if (task.id) parts.push(task.id);
          if (task.after) parts.push('after ' + task.after);
          else if (task.startDate) parts.push(task.startDate);
          if (task.duration) parts.push(task.duration);
          lines.push('    ' + task.name + ' :' + parts.join(', '));
        }
      }
      return lines.join('\n');
    }

    _buildUI() {
      this.container.innerHTML = ''; this.container.classList.add('dve-root');
      const toolbar = _el('div', 'dve-toolbar');
      const addSectionBtn = _el('button', 'mve-tool-btn'); addSectionBtn.textContent = '📂 セクション追加';
      addSectionBtn.addEventListener('click', () => this._addSection()); toolbar.appendChild(addSectionBtn);
      const addTaskBtn = _el('button', 'mve-tool-btn'); addTaskBtn.textContent = '📋 タスク追加';
      addTaskBtn.addEventListener('click', () => this._addTask()); toolbar.appendChild(addTaskBtn);

      const undoBtn = _el('button', 'mve-tool-btn'); undoBtn.textContent = '↩ 元に戻す';
      undoBtn.addEventListener('click', () => this._doUndo());
      toolbar.appendChild(undoBtn);
      const redoBtn = _el('button', 'mve-tool-btn'); redoBtn.textContent = '↪ やり直し';
      redoBtn.addEventListener('click', () => this._doRedo());
      toolbar.appendChild(redoBtn);

      _addZoomControls(toolbar, this);
      this.container.appendChild(toolbar);

      const body = _el('div', 'dve-body dve-body-gantt');
      this._listPanel = _el('div', 'dve-list-panel');
      body.appendChild(this._listPanel);

      this._svgArea = _el('div', 'dve-svg-area');
      _attachZoomWheel(this);
      body.appendChild(this._svgArea);

      this.container.appendChild(body);
    }

    _toHtmlDate(ds) { return /^\d{4}-\d{2}-\d{2}$/.test(ds) ? ds : ''; }
    _fromHtmlDate(hd) { return hd || ''; }
    _computeEndDate(start, dur) {
      if (!start || !dur) return '';
      const m = dur.match(/^(\d+)(d|w|m)$/i);
      if (!m) return /^\d{4}-\d{2}-\d{2}$/.test(dur) ? dur : '';
      const n = parseInt(m[1], 10); const u = m[2].toLowerCase();
      const d = new Date(start); if (isNaN(d.getTime())) return '';
      if (u === 'd') d.setDate(d.getDate() + n);
      else if (u === 'w') d.setDate(d.getDate() + n * 7);
      else if (u === 'm') d.setMonth(d.getMonth() + n);
      return d.toISOString().split('T')[0];
    }
    _computeDuration(start, end) {
      if (!start || !end) return '';
      const d1 = new Date(start), d2 = new Date(end);
      if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return '';
      const diff = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
      return (diff <= 0 ? 1 : diff) + 'd';
    }

    async _render(skipUndo) {
      if (!skipUndo) _commitUndo(this);
      const code = this._generate(); this.onChange(code);
      this._renderConfig();
      try {
        const id = 'gantt-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
        const { svg } = await mermaid.render(id, code);
        this._svgArea.innerHTML = svg;
        this._applyDiagramColors();
        this._attachSvgEvents();
        _postRenderZoom(this);
      } catch (err) { this._svgArea.innerHTML = '<div class="mermaid-error">プレビューエラー:<br>' + _escHtml(String(err)) + '</div>'; }
    }

    /**
     * SVG interactions for Gantt chart:
     *  - Drag a task bar horizontally → shift `startDate`
     *  - Drag the right edge of a bar  → adjust `duration`
     *  - Right-click a bar             → context menu (edit / delete)
     */
    _attachSvgEvents() {
      const svgEl = this._svgArea.querySelector('svg');
      if (!svgEl) return;

      // Build a flat list of editable tasks (only date-based, not "after X" deps)
      const flatTasks = [];
      for (let si = 0; si < this.sections.length; si++) {
        const sec = this.sections[si];
        for (let ti = 0; ti < sec.tasks.length; ti++) {
          flatTasks.push({ si, ti, task: sec.tasks[ti] });
        }
      }
      // Find task bar rects in DOM order (matches _applyDiagramColors logic)
      const taskBars = [];
      for (const rect of svgEl.querySelectorAll('rect')) {
        const cls = rect.getAttribute('class') || '';
        if (/\btask\d*\b/.test(cls) && !/section/.test(cls)) taskBars.push(rect);
      }
      if (taskBars.length === 0 || flatTasks.length === 0) return;

      // Calibrate pixels-per-day from the first task that has a known startDate + duration
      const calib = this._calibratePxPerDay(taskBars, flatTasks);
      if (!calib) return;
      const { pxPerDay } = calib;

      const self = this;
      taskBars.forEach((rect, i) => {
        const meta = flatTasks[i];
        if (!meta) return;
        const t = meta.task;
        // Skip tasks driven by "after X" — dragging would be ambiguous
        if (t.after && !t.startDate) {
          rect.style.cursor = 'not-allowed';
          rect.title = 'after 依存タスクは直接ドラッグできません';
          return;
        }
        const hasDates = /^\d{4}-\d{2}-\d{2}$/.test(t.startDate || '');
        if (!hasDates) {
          rect.style.cursor = 'default';
          return;
        }

        rect.style.cursor = 'grab';
        rect.style.pointerEvents = 'all';

        // Right-click context menu
        rect.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!window.DiagramCommon) return;
          const canShift = /^\d{4}-\d{2}-\d{2}$/.test(t.startDate || '');
          const shiftDays = (n) => {
            const d = new Date(t.startDate);
            d.setDate(d.getDate() + n);
            t.startDate = d.toISOString().split('T')[0];
            self._render();
          };
          window.DiagramCommon.showContextMenu(e.clientX, e.clientY, [
            { label: '◀ 開始日を −1 日', disabled: !canShift, onClick: () => shiftDays(-1) },
            { label: '▶ 開始日を +1 日', disabled: !canShift, onClick: () => shiftDays(1) },
            { label: '◀ 開始日を −7 日', disabled: !canShift, onClick: () => shiftDays(-7) },
            { label: '▶ 開始日を +7 日', disabled: !canShift, onClick: () => shiftDays(7) },
            'separator',
            { label: '🗑 タスクを削除', danger: true, onClick: () => {
              self.sections[meta.si].tasks.splice(meta.ti, 1);
              self._render();
            }},
          ]);
        });

        // Mousedown → start drag (body = move, right 8px = resize)
        rect.addEventListener('mousedown', (e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          const bbox = rect.getBoundingClientRect();
          const onRightEdge = (e.clientX > bbox.right - 8) && t.duration;
          const startDateObj = new Date(t.startDate);
          const origDurDays = self._durationToDays(t.duration);
          const origStartIso = t.startDate;
          const origDuration = t.duration;
          let moved = false;
          rect.style.cursor = onRightEdge ? 'ew-resize' : 'grabbing';

          const onMove = (mv) => {
            const dx = mv.clientX - e.clientX;
            const deltaDays = Math.round(dx / pxPerDay);
            if (deltaDays === 0) return;
            moved = true;
            if (onRightEdge) {
              const newDur = Math.max(1, origDurDays + deltaDays);
              t.duration = newDur + 'd';
              // visual feedback only — width
              rect.setAttribute('width', String(parseFloat(rect.getAttribute('width')) + (deltaDays * pxPerDay) - (parseFloat(rect.getAttribute('_lastDx') || '0'))));
              rect.setAttribute('_lastDx', String(deltaDays * pxPerDay));
            } else {
              const d = new Date(startDateObj);
              d.setDate(d.getDate() + deltaDays);
              t.startDate = d.toISOString().split('T')[0];
              const baseX = parseFloat(rect.getAttribute('_baseX') || rect.getAttribute('x'));
              if (!rect.getAttribute('_baseX')) rect.setAttribute('_baseX', String(baseX));
              rect.setAttribute('x', String(baseX + deltaDays * pxPerDay));
            }
          };
          const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            rect.style.cursor = 'grab';
            if (moved) {
              self._render(); // full re-render with new dates → mermaid recalculates layout
            } else {
              // Was a click without drag → restore (in case any visual residue)
              t.startDate = origStartIso;
              t.duration = origDuration;
            }
          };
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        });
      });
    }

    /** Compute pixels-per-day by reading two task bars whose dates we know. */
    _calibratePxPerDay(taskBars, flatTasks) {
      const datedTasks = [];
      for (let i = 0; i < taskBars.length && i < flatTasks.length; i++) {
        const t = flatTasks[i].task;
        if (/^\d{4}-\d{2}-\d{2}$/.test(t.startDate || '') && t.duration) {
          const dur = this._durationToDays(t.duration);
          if (dur > 0) datedTasks.push({ rect: taskBars[i], date: t.startDate, dur });
        }
      }
      if (datedTasks.length === 0) return null;
      // Use bar width / duration as primary calibration
      let pxPerDay = 0, n = 0;
      for (const d of datedTasks) {
        const w = parseFloat(d.rect.getAttribute('width'));
        if (!isNaN(w) && d.dur > 0) { pxPerDay += w / d.dur; n++; }
      }
      if (n === 0) return null;
      pxPerDay = pxPerDay / n;
      if (pxPerDay <= 0 || !isFinite(pxPerDay)) return null;
      return { pxPerDay };
    }

    _durationToDays(dur) {
      if (!dur) return 0;
      const m = dur.match(/^(\d+)(d|w|m)$/i);
      if (!m) return 0;
      const n = parseInt(m[1], 10);
      switch (m[2].toLowerCase()) {
        case 'd': return n;
        case 'w': return n * 7;
        case 'm': return n * 30;
      }
      return 0;
    }

    _applyDiagramColors() {
      const svgEl = this._svgArea.querySelector('svg');
      if (!svgEl) return;

      // Build flat list of all tasks with effective color (task override > section default)
      const allTasks = [];
      for (const section of this.sections) {
        for (const task of section.tasks) {
          allTasks.push({ bgColor: task.bgColor || section.bgColor });
        }
      }

      // Apply task bar colors: task bars are <rect> with class like "task task0"
      const taskBars = [];
      for (const rect of svgEl.querySelectorAll('rect')) {
        const cls = rect.getAttribute('class') || '';
        if (/\btask\d*\b/.test(cls) && !/section/.test(cls)) taskBars.push(rect);
      }

      for (let i = 0; i < allTasks.length && i < taskBars.length; i++) {
        if (allTasks[i].bgColor) { taskBars[i].style.fill = allTasks[i].bgColor; taskBars[i].style.stroke = allTasks[i].bgColor; }
      }
    }

    _renderConfig() {
      this._listPanel.innerHTML = '';
      const settings = _el('div', '');
      settings.appendChild(_elText('div', 'チャート設定', 'diagram-ve-section-header'));
      const mkField = (l, v, fn) => {
        const row = _el('div', 'gantt-inline-field');
        row.appendChild(_elText('label', l, 'gantt-inline-label'));
        const input = _el('input', 'gantt-inline-input'); input.type = 'text'; input.value = v;
        input.addEventListener('change', () => fn(input.value)); row.appendChild(input); return row;
      };
      settings.appendChild(mkField('タイトル', this.title, (v) => { this.title = v; this._render(); }));
      settings.appendChild(mkField('日付形式', this.dateFormat, (v) => { this.dateFormat = v; this._render(); }));
      settings.appendChild(mkField('軸表示', this.axisFormat || '%Y-%m-%d', (v) => { this.axisFormat = v; this._render(); }));
      this._listPanel.appendChild(settings);

      for (let si = 0; si < this.sections.length; si++) {
        const section = this.sections[si];
        const sHeader = _el('div', 'diagram-ve-section-header gantt-section-header dnd-item');
        _makeDraggable(sHeader, 'gantt-section', si, this, 'sections');
        const isCollapsed = this._collapsedSections.has(section.name);
        const sToggle = _el('button', 'gantt-section-toggle'); sToggle.textContent = isCollapsed ? '▶' : '▼'; sToggle.title = isCollapsed ? '展開' : '折りたたみ';
        sToggle.addEventListener('click', (e) => { e.stopPropagation(); if (this._collapsedSections.has(section.name)) this._collapsedSections.delete(section.name); else this._collapsedSections.add(section.name); this._renderConfig(); });
        sHeader.appendChild(sToggle);
        const sLabel = _el('span', 'gantt-section-label'); sLabel.textContent = '📂 ' + section.name + ' (' + section.tasks.length + ')';
        sLabel.title = sLabel.textContent; sLabel.style.cursor = 'pointer';
        sLabel.addEventListener('click', (e) => { e.stopPropagation(); _inlineEdit(sLabel, section.name, (v) => { section.name = v; this._render(); }); });
        sHeader.appendChild(sLabel);
        const sColorBtn = _el('button', 'gantt-color-btn'); sColorBtn.textContent = '🎨';
        sColorBtn.title = '色を変更';
        if (section.bgColor) {
          const dot = _el('span', 'gantt-color-dot'); dot.style.backgroundColor = section.bgColor;
          sColorBtn.textContent = ''; sColorBtn.appendChild(dot);
        }
        sColorBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this._showTaskColorPicker(section.bgColor, (bg) => {
            section.bgColor = bg; this._render();
          });
        });
        sHeader.appendChild(sColorBtn);
        const sAct = _el('span', 'diagram-ve-item-actions');
        if (this.sections.length > 1) {
          const delS = _el('button', ''); delS.textContent = '✕';
          delS.addEventListener('click', (e) => { e.stopPropagation(); this.sections.splice(si, 1); this._render(); });
          sAct.appendChild(delS);
        }
        sHeader.appendChild(sAct); this._listPanel.appendChild(sHeader);

        if (isCollapsed) {
          const addRow = _el('div', 'gantt-add-task-row');
          const addBtn = _el('button', 'gantt-add-task-btn'); addBtn.textContent = '+ タスク追加';
          addBtn.addEventListener('click', () => { this._collapsedSections.delete(section.name); this._quickAddTask(si); });
          addRow.appendChild(addBtn); this._listPanel.appendChild(addRow);
          continue;
        }

        if (section.tasks.length > 0) {
          const th = _el('div', 'gantt-task-header');
          th.innerHTML = '<span class="gantt-col gantt-col-name">タスク名</span><span class="gantt-col gantt-col-status">状態</span><span class="gantt-col gantt-col-date">開始日</span><span class="gantt-col gantt-col-date">終了日</span><span class="gantt-col gantt-col-dur">期間</span><span class="gantt-col gantt-col-actions"></span>';
          this._listPanel.appendChild(th);
        }

        for (let ti = 0; ti < section.tasks.length; ti++) {
          const task = section.tasks[ti];
          const row = _el('div', 'gantt-task-row dnd-item');
          this._makeTaskDraggable(row, si, ti);          const nc = _el('span', 'gantt-col gantt-col-name');
          const ni = _el('input', 'gantt-cell-input'); ni.value = task.name;
          ni.addEventListener('change', () => { task.name = ni.value.trim() || task.name; this._deferRender(); });
          nc.appendChild(ni); row.appendChild(nc);
          const sc = _el('span', 'gantt-col gantt-col-status');
          const ss = _el('select', 'gantt-cell-select');
          for (const opt of [{ value: '', label: '—' }, { value: 'done', label: '完了' }, { value: 'active', label: '進行中' }, { value: 'crit', label: '重要' }, { value: 'milestone', label: 'M' }]) {
            const o = document.createElement('option'); o.value = opt.value; o.textContent = opt.label;
            if (opt.value === (task.status || '')) o.selected = true; ss.appendChild(o);
          }
          ss.addEventListener('change', () => { task.status = ss.value; this._deferRender(); });
          sc.appendChild(ss); row.appendChild(sc);
          const sdc = _el('span', 'gantt-col gantt-col-date');
          const sdi = _el('input', 'gantt-cell-date'); sdi.type = 'date'; sdi.value = this._toHtmlDate(task.startDate);
          sdi.addEventListener('change', () => {
            task.startDate = this._fromHtmlDate(sdi.value); task.after = '';
            const ed = this._computeEndDate(task.startDate, task.duration);
            const ei = row.querySelector('.gantt-cell-end'); if (ei && ed) ei.value = ed;
            this._deferRender();
          });
          sdc.appendChild(sdi); row.appendChild(sdc);
          const edc = _el('span', 'gantt-col gantt-col-date');
          const edi = _el('input', 'gantt-cell-date gantt-cell-end'); edi.type = 'date';
          const cEnd = this._computeEndDate(task.startDate, task.duration);
          edi.value = /^\d{4}-\d{2}-\d{2}$/.test(task.duration) ? task.duration : cEnd;
          edi.addEventListener('change', () => {
            if (task.startDate && edi.value) { task.duration = edi.value; }
            else task.duration = edi.value;
            this._deferRender();
          });
          edc.appendChild(edi); row.appendChild(edc);
          const dc = _el('span', 'gantt-col gantt-col-dur');
          const di = _el('input', 'gantt-cell-input gantt-cell-dur'); di.value = task.duration || ''; di.placeholder = '7d, 2w';
          di.addEventListener('change', () => {
            task.duration = di.value.trim() || task.duration;
            const ed = this._computeEndDate(task.startDate, task.duration);
            const ei = row.querySelector('.gantt-cell-end'); if (ei && ed) ei.value = ed;
            this._deferRender();
          });
          dc.appendChild(di); row.appendChild(dc);
          const ac = _el('span', 'gantt-col gantt-col-actions');
          const colorB = _el('button', 'gantt-action-btn gantt-color-btn-sm'); colorB.textContent = '🎨';
          colorB.title = '色を変更';
          if (task.bgColor) {
            const dot = _el('span', 'gantt-color-dot-sm'); dot.style.backgroundColor = task.bgColor;
            colorB.textContent = ''; colorB.appendChild(dot);
          }
          colorB.addEventListener('click', () => {
            this._showTaskColorPicker(task.bgColor, (bg) => {
              task.bgColor = bg; this._render();
            });
          });
          ac.appendChild(colorB);
          const delB = _el('button', 'gantt-action-btn'); delB.textContent = '✕';
          delB.addEventListener('click', () => { section.tasks.splice(ti, 1); this._render(); });
          ac.appendChild(delB); row.appendChild(ac);
          this._listPanel.appendChild(row);
        }

        const addRow = _el('div', 'gantt-add-task-row');
        const addBtn = _el('button', 'gantt-add-task-btn'); addBtn.textContent = '+ タスク追加';
        addBtn.addEventListener('click', () => this._quickAddTask(si));
        addRow.appendChild(addBtn); this._listPanel.appendChild(addRow);
      }
    }

    _makeTaskDraggable(row, si, ti) {
      row.draggable = true;
      const handle = _el('span', 'dnd-handle'); handle.textContent = '⠿';
      row.insertBefore(handle, row.firstChild);
      row.addEventListener('dragstart', (e) => {
        this._dragData = { type: 'gantt-task', si, ti }; row.classList.add('dnd-dragging');
        e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', '');
      });
      row.addEventListener('dragend', () => {
        row.classList.remove('dnd-dragging'); this._dragData = null;
        const list = row.closest('.dve-list-panel');
        if (list) list.querySelectorAll('.dnd-over, .dnd-over-above, .dnd-over-below').forEach(el =>
          el.classList.remove('dnd-over', 'dnd-over-above', 'dnd-over-below'));
      });
      row.addEventListener('dragover', (e) => {
        const dd = this._dragData; if (!dd || dd.type !== 'gantt-task') return;
        e.preventDefault(); e.dataTransfer.dropEffect = 'move';
        const rect = row.getBoundingClientRect(); const mid = rect.top + rect.height / 2;
        row.classList.remove('dnd-over-above', 'dnd-over-below');
        row.classList.add(e.clientY < mid ? 'dnd-over-above' : 'dnd-over-below', 'dnd-over');
      });
      row.addEventListener('dragleave', (e) => {
        if (!row.contains(e.relatedTarget)) row.classList.remove('dnd-over', 'dnd-over-above', 'dnd-over-below');
      });
      row.addEventListener('drop', (e) => {
        e.preventDefault(); row.classList.remove('dnd-over', 'dnd-over-above', 'dnd-over-below');
        const dd = this._dragData; if (!dd || dd.type !== 'gantt-task') return;
        const fromSi = dd.si, fromTi = dd.ti;
        const rect = row.getBoundingClientRect(); const mid = rect.top + rect.height / 2;
        let toTi = ti; if (e.clientY >= mid && toTi < this.sections[si].tasks.length - 1) toTi++;
        if (fromSi === si) {
          if (fromTi !== toTi) {
            const [moved] = this.sections[si].tasks.splice(fromTi, 1);
            if (toTi > fromTi) toTi--;
            this.sections[si].tasks.splice(toTi, 0, moved); this._render();
          }
        } else {
          const [moved] = this.sections[fromSi].tasks.splice(fromTi, 1);
          this.sections[si].tasks.splice(toTi, 0, moved); this._render();
        }
      });
    }

    _showTaskColorPicker(currentBg, onApply) {
      const existing = this.container.querySelector('.ve-dialog-overlay');
      if (existing) existing.remove();
      const overlay = _el('div', 've-dialog-overlay');
      const dialog = _el('div', 've-dialog');
      dialog.appendChild(_elText('div', 'タスクバーの色', 've-dialog-title'));

      const presets = [
        '', '#1a73e8', '#d93025', '#188038', '#e8710a', '#9334e6',
        '#4285f4', '#ea4335', '#34a853', '#fbbc04', '#a142f4', '#24c1e0',
        '#f06292', '#7986cb', '#4db6ac', '#aed581', '#ff8a65', '#90a4ae'
      ];

      const grid = _el('div', 'dve-color-palette');
      let selectedBg = currentBg || '';
      for (const c of presets) {
        const swatch = _el('button', 'dve-color-swatch');
        if (c) { swatch.style.backgroundColor = c; swatch.title = c; }
        else { swatch.textContent = '✕'; swatch.title = 'なし（デフォルト）'; swatch.style.fontSize = '14px'; swatch.style.lineHeight = '32px'; }
        if (c === selectedBg) swatch.classList.add('dve-color-selected');
        swatch.addEventListener('click', () => {
          grid.querySelectorAll('.dve-color-selected').forEach(s => s.classList.remove('dve-color-selected'));
          swatch.classList.add('dve-color-selected');
          selectedBg = c; customInput.value = c;
        });
        grid.appendChild(swatch);
      }
      dialog.appendChild(grid);
      const customRow = _el('div', 've-dialog-field');
      customRow.appendChild(_elText('label', 'カスタム色', 've-dialog-label'));
      const customInput = _el('input', 've-dialog-input'); customInput.type = 'text'; customInput.value = selectedBg; customInput.placeholder = '#hex or empty';
      customInput.addEventListener('input', () => { selectedBg = customInput.value.trim(); grid.querySelectorAll('.dve-color-selected').forEach(s => s.classList.remove('dve-color-selected')); });
      customRow.appendChild(customInput); dialog.appendChild(customRow);

      const actions = _el('div', 've-dialog-actions');
      const cancelBtn = _el('button', 've-dialog-cancel'); cancelBtn.textContent = 'キャンセル';
      cancelBtn.addEventListener('click', () => { overlay.remove(); });
      actions.appendChild(cancelBtn);
      const okBtn = _el('button', 've-dialog-ok'); okBtn.textContent = '適用';
      okBtn.addEventListener('click', () => { overlay.remove(); onApply(selectedBg); });
      actions.appendChild(okBtn);
      dialog.appendChild(actions);
      overlay.appendChild(dialog); this.container.appendChild(overlay);
    }



    _deferRender() { clearTimeout(this._renderTimer); this._renderTimer = setTimeout(() => this._render(), 300); }

    async _addSection() {
      const result = await _showDialog(this.container, { title: 'セクション追加', fields: [{ key: 'name', label: 'セクション名', type: 'text', value: '新しいセクション' }] });
      if (!result || !result.name.trim()) return;
      this.sections.push({ name: result.name.trim(), tasks: [], bgColor: '' }); this._render();
    }

    _quickAddTask(si) {
      const today = new Date().toISOString().split('T')[0];
      this.sections[si].tasks.push({ name: '新しいタスク', id: 't' + Date.now().toString(36), status: '', startDate: today, after: '', duration: '7d', bgColor: '' });
      this._render();
      const rows = this._listPanel.querySelectorAll('.gantt-task-row');
      if (rows.length > 0) { const ni = rows[rows.length - 1].querySelector('.gantt-cell-input'); if (ni) { ni.focus(); ni.select(); } }
    }

    async _addTask() {
      let si = 0;
      if (this.sections.length > 1) {
        const opts = this.sections.map((s, i) => ({ value: String(i), label: s.name }));
        const r = await _showDialog(this.container, { title: 'タスク追加先', fields: [{ key: 'section', label: 'セクション', type: 'select', value: '0', options: opts }] });
        if (!r) return; si = parseInt(r.section, 10); if (isNaN(si) || si < 0 || si >= this.sections.length) return;
      }
      this._quickAddTask(si);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  ER DIAGRAM VISUAL EDITOR — Entity-Relationship GUI editing
  // ═══════════════════════════════════════════════════════════════
  class ERDiagramEditor {
    constructor(container, code, onChange) {
      this.container = container; this.onChange = onChange;
      this.entities = []; this.relationships = [];
      this._dragData = null;
      this._connectMode = false; this._connectFrom = null;
      this._highlightedEntityIdx = -1; this._highlightedRelIdx = -1;
      _initZoom(this);
      _initUndoKeyboard(this);
      this._parse(code); this._buildUI(); this._render();
    }
    destroy() { _destroyUndoKeyboard(this); this.container.innerHTML = ''; }
    getCode() { return this._generate(); }

    _snapshot() { return { entities: JSON.parse(JSON.stringify(this.entities)), relationships: JSON.parse(JSON.stringify(this.relationships)) }; }
    _restoreSnapshot(snap) { this.entities = snap.entities; this.relationships = snap.relationships; }
    _doUndo() { const s = this._undo.undo(); if (s) { this._restoreSnapshot(s); this._render(true); } }
    _doRedo() { const s = this._undo.redo(); if (s) { this._restoreSnapshot(s); this._render(true); } }
    _deleteSelected() {
      if (this._highlightedRelIdx >= 0) {
        this.relationships.splice(this._highlightedRelIdx, 1);
        this._highlightedRelIdx = -1; this._render();
      } else if (this._highlightedEntityIdx >= 0) {
        const name = this.entities[this._highlightedEntityIdx]?.name;
        if (name) {
          this.entities.splice(this._highlightedEntityIdx, 1);
          this.relationships = this.relationships.filter(r => r.from !== name && r.to !== name);
        }
        this._highlightedEntityIdx = -1; this._render();
      }
    }

    _parse(code) {
      const lines = code.split('\n');
      let currentEntity = null;
      for (const line of lines) {
        const t = line.trim();
        if (!t || t === 'erDiagram' || t.startsWith('%%')) continue;

        // Entity block start: ENTITY_NAME {
        const entityStart = t.match(/^([A-Za-z_]\w*)\s*\{$/);
        if (entityStart) {
          currentEntity = { name: entityStart[1], attributes: [] };
          this.entities.push(currentEntity);
          continue;
        }
        // Entity block end
        if (t === '}') { currentEntity = null; continue; }

        // Attribute inside entity: type name [PK|FK|UK]
        if (currentEntity) {
          const attrMatch = t.match(/^(\w+)\s+(\w+)(?:\s+(PK|FK|UK))?$/);
          if (attrMatch) {
            currentEntity.attributes.push({
              type: attrMatch[1],
              name: attrMatch[2],
              key: attrMatch[3] || ''
            });
          }
          continue;
        }

        // Relationship: ENTITY1 <cardinality> ENTITY2 : "label"
        const relMatch = t.match(/^([A-Za-z_]\w*)\s+(\|[|o}]--[o|{]\{?|\}[|o]--[o|{]\{?|[|}{o][|}{o]--[|}{o][|}{o])\s+([A-Za-z_]\w*)\s*:\s*"?([^"]*)"?\s*$/);
        if (relMatch) {
          this.relationships.push({
            from: relMatch[1],
            cardinality: relMatch[2],
            to: relMatch[3],
            label: relMatch[4]
          });
          continue;
        }
        // More flexible relationship pattern
        const relMatch2 = t.match(/^([A-Za-z_]\w*)\s+(\S+)\s+([A-Za-z_]\w*)\s*:\s*"?([^"]*)"?\s*$/);
        if (relMatch2) {
          this.relationships.push({
            from: relMatch2[1],
            cardinality: relMatch2[2],
            to: relMatch2[3],
            label: relMatch2[4]
          });
        }
      }
    }

    _generate() {
      const lines = ['erDiagram'];
      for (const entity of this.entities) {
        lines.push('    ' + entity.name + ' {');
        for (const attr of entity.attributes) {
          let line = '        ' + attr.type + ' ' + attr.name;
          if (attr.key) line += ' ' + attr.key;
          lines.push(line);
        }
        lines.push('    }');
      }
      if (this.relationships.length > 0) lines.push('');
      for (const rel of this.relationships) {
        lines.push('    ' + rel.from + ' ' + rel.cardinality + ' ' + rel.to + ' : "' + rel.label + '"');
      }
      return lines.join('\n');
    }

    _buildUI() {
      this.container.innerHTML = ''; this.container.classList.add('dve-root');
      const toolbar = _el('div', 'dve-toolbar');

      const addEntityBtn = _el('button', 'mve-tool-btn');
      addEntityBtn.textContent = '📦 エンティティ追加';
      addEntityBtn.addEventListener('click', () => this._addEntity());
      toolbar.appendChild(addEntityBtn);

      this._connectBtn = _el('button', 'mve-tool-btn');
      this._connectBtn.textContent = '🔗 リレーション追加';
      this._connectBtn.title = 'クリックで接続モード ON/OFF: SVG上でFrom→Toテーブルを順番にクリック';
      this._connectBtn.addEventListener('click', () => this._toggleConnectMode());
      toolbar.appendChild(this._connectBtn);

      toolbar.appendChild(_elText('span', 'クリックでエンティティ選択 | パネルで属性編集', 'dve-hint'));

      const undoBtn = _el('button', 'mve-tool-btn'); undoBtn.textContent = '↩ 元に戻す';
      undoBtn.addEventListener('click', () => this._doUndo());
      toolbar.appendChild(undoBtn);
      const redoBtn = _el('button', 'mve-tool-btn'); redoBtn.textContent = '↪ やり直し';
      redoBtn.addEventListener('click', () => this._doRedo());
      toolbar.appendChild(redoBtn);

      _addZoomControls(toolbar, this);
      this.container.appendChild(toolbar);

      this._statusBar = _el('div', 'dve-status-bar');
      this._statusBar.style.display = 'none';
      this.container.appendChild(this._statusBar);

      const body = _el('div', 'dve-body');
      this._listPanel = _el('div', 'dve-list-panel');
      body.appendChild(this._listPanel);

      this._svgArea = _el('div', 'dve-svg-area');
      _attachZoomWheel(this);
      body.appendChild(this._svgArea);

      this.container.appendChild(body);
    }

    async _render(skipUndo) {
      if (!skipUndo) _commitUndo(this);
      const code = this._generate(); this.onChange(code);
      this._renderList();
      try {
        const id = 'er-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
        const { svg } = await mermaid.render(id, code);
        this._svgArea.innerHTML = svg;
        _postRenderZoom(this);
        this._attachSvgEvents();
      } catch (err) {
        this._svgArea.innerHTML = '<div class="mermaid-error">プレビューエラー:<br>' + _escHtml(String(err)) + '</div>';
      }
    }

    _setStatus(text) {
      this._statusBar.textContent = text;
      this._statusBar.style.display = text ? '' : 'none';
    }

    _toggleConnectMode() {
      this._connectMode = !this._connectMode;
      this._connectFrom = null;
      if (this._connectMode) {
        this._connectBtn.classList.add('mve-active');
        this._setStatus('🔗 接続モード: SVG上の接続元テーブルをクリック');
      } else {
        this._connectBtn.classList.remove('mve-active');
        this._setStatus('');
      }
      this._render();
    }

    async _handleSvgConnect(entityName) {
      if (!this._connectFrom) {
        this._connectFrom = entityName;
        this._setStatus('🔗 接続モード: 「' + entityName + '」→ 接続先テーブルをクリック');
        await this._renderSvgOnly();
      } else {
        if (this._connectFrom === entityName) {
          this._connectFrom = null;
          this._setStatus('🔗 接続モード: SVG上の接続元テーブルをクリック');
          return;
        }
        const fromName = this._connectFrom;
        this._connectFrom = null;
        const cardOpts = [
          { value: '||--o{', label: '||--o{ (1対多)' },
          { value: '}o--o{', label: '}o--o{ (多対多)' },
          { value: '||--||', label: '||--|| (1対1)' },
          { value: '}|--||', label: '}|--|| (多対1)' },
          { value: '||--|{', label: '||--|{ (1対1以上)' },
          { value: '}o--||', label: '}o--|| (0以上対1)' },
        ];
        const result = await _showDialog(this.container, {
          title: fromName + ' → ' + entityName + ' のリレーション',
          fields: [
            { key: 'card', label: 'カーディナリティ', type: 'select', value: '||--o{', options: cardOpts },
            { key: 'label', label: 'ラベル（空欄可）', type: 'text', value: '', placeholder: 'has, belongs to...' },
          ],
        });
        if (result) {
          this.relationships.push({
            from: fromName, cardinality: result.card,
            to: entityName, label: result.label || ''
          });
        }
        this._setStatus('🔗 接続モード: SVG上の接続元テーブルをクリック');
        this._render();
      }
    }

    async _renderSvgOnly() {
      try {
        const code = this._generate();
        const id = 'er-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
        const { svg } = await mermaid.render(id, code);
        this._svgArea.innerHTML = svg;
        _postRenderZoom(this);
        this._attachSvgEvents();
      } catch (err) {
        this._svgArea.innerHTML = '<div class="mermaid-error">プレビューエラー:<br>' + _escHtml(String(err)) + '</div>';
      }
    }

    _attachSvgEvents() {
      const svgEl = this._svgArea.querySelector('svg');
      if (!svgEl) return;
      svgEl.style.cursor = this._connectMode ? 'crosshair' : 'default';

      // Find entity groups in SVG — Mermaid ER diagrams render entities as <g> with class "er entityBox"
      // or as labeled rect+text groups
      const entityLabels = svgEl.querySelectorAll('.er.entityLabel');
      const entityBoxes = svgEl.querySelectorAll('.er.entityBox');

      // Highlight entity on click by matching text content
      const allTexts = svgEl.querySelectorAll('text');
      const entityTexts = [];
      const relLabelTexts = [];

      allTexts.forEach(textEl => {
        const txt = (textEl.textContent || '').trim();
        const entityIdx = this.entities.findIndex(e => e.name === txt);
        if (entityIdx >= 0) {
          entityTexts.push({ el: textEl, idx: entityIdx });
        }
      });

      // Build entity name → containing <g> map (robust across Mermaid versions).
      // Strategy 1: Each entity is rendered as a <g> with a `.er.entityBox`
      // rect plus a `.er.entityLabel` text inside (or as a sibling). Walk up
      // from the label text to find the nearest <g> that also contains the
      // entity rect — this gives us the *whole table* group, so clicking
      // anywhere on the entity (header, body, attribute rows, border) hits.
      const entityGroups = new Map(); // entityIdx → Set<HTMLElement>
      const labelEls = svgEl.querySelectorAll('.er.entityLabel, text.er.entityLabel');
      labelEls.forEach(labelEl => {
        const txt = (labelEl.textContent || '').trim();
        const idx = this.entities.findIndex(e => e.name === txt);
        if (idx < 0) return;
        // Walk up until we find a <g> that also contains an entityBox
        let g = labelEl.parentElement;
        while (g && g !== svgEl) {
          if (g.tagName && g.tagName.toLowerCase() === 'g'
            && g.querySelector(':scope .er.entityBox, :scope rect.er.entityBox')) {
            if (!entityGroups.has(idx)) entityGroups.set(idx, new Set());
            entityGroups.get(idx).add(g);
            break;
          }
          g = g.parentElement;
        }
      });
      // Strategy 2 (fallback): also scan via direct child <text> matching
      const allGroups = svgEl.querySelectorAll('g');
      allGroups.forEach(g => {
        const texts = g.querySelectorAll(':scope > text, :scope > foreignObject, :scope > g > text');
        for (const t of texts) {
          const txt = (t.textContent || '').trim();
          const idx = this.entities.findIndex(e => e.name === txt);
          if (idx >= 0) {
            if (!entityGroups.has(idx)) entityGroups.set(idx, new Set());
            entityGroups.get(idx).add(g);
            break;
          }
        }
      });
      // Fallback: if a <text> matches but its <g> wasn't picked up above
      entityTexts.forEach(({ el, idx }) => {
        const g = el.closest('g');
        if (g) {
          if (!entityGroups.has(idx)) entityGroups.set(idx, new Set());
          entityGroups.get(idx).add(g);
        }
      });

      // Identify relationship labels in SVG
      // Mermaid ER renders relationship labels as text elements with class "er relationshipLabel"
      const relLabels = svgEl.querySelectorAll('.er.relationshipLabel');
      relLabels.forEach(labelEl => {
        const txt = (labelEl.textContent || '').trim();
        const ri = this.relationships.findIndex(r => r.label === txt);
        if (ri >= 0) relLabelTexts.push({ el: labelEl, idx: ri });
      });

      // Fallback: match labels from all text elements not matching entity names
      if (relLabelTexts.length === 0 && this.relationships.length > 0) {
        const entityNames = new Set(this.entities.map(e => e.name));
        const attrNames = new Set();
        this.entities.forEach(e => e.attributes.forEach(a => { attrNames.add(a.name); attrNames.add(a.type); attrNames.add(a.key); }));
        allTexts.forEach(textEl => {
          const txt = (textEl.textContent || '').trim();
          if (!txt || entityNames.has(txt) || attrNames.has(txt)) return;
          const ri = this.relationships.findIndex(r => r.label && r.label === txt);
          if (ri >= 0 && !relLabelTexts.find(x => x.idx === ri)) {
            relLabelTexts.push({ el: textEl, idx: ri });
          }
        });
      }

      // Entity text event handlers
      entityTexts.forEach(({ el: textEl, idx: entityIdx }) => {
        textEl.style.cursor = this._connectMode ? 'crosshair' : 'pointer';

        textEl.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this._connectMode) {
            this._handleSvgConnect(this.entities[entityIdx].name);
            return;
          }
          this._highlightedEntityIdx = entityIdx;
          this._highlightedRelIdx = -1;
          this._renderList();
        });

        textEl.addEventListener('mouseenter', () => {
          if (this._connectMode) {
            textEl.style.filter = 'brightness(1.3) drop-shadow(0 0 6px #007fd4)';
          }
        });
        textEl.addEventListener('mouseleave', () => {
          textEl.style.filter = '';
          if (this._connectMode && this._connectFrom === this.entities[entityIdx].name) {
            textEl.style.filter = 'drop-shadow(0 0 6px #00cc66)';
          }
        });

        // Highlight connect-from entity
        if (this._connectMode && this._connectFrom === this.entities[entityIdx].name) {
          textEl.style.filter = 'drop-shadow(0 0 6px #00cc66)';
        }

        // Double click to show entity action menu (rename / add attribute)
        textEl.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          if (!this._connectMode) {
            this._showEntitySvgMenu(entityIdx, e);
          }
        });

        // Right-click → unified context menu
        textEl.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (this._connectMode || !window.DiagramCommon) return;
          this._highlightedEntityIdx = entityIdx;
          this._highlightedRelIdx = -1;
          this._renderList();
          window.DiagramCommon.showContextMenu(e.clientX, e.clientY, [
            { label: '✏️ 名前を変更', onClick: () => this._renameEntity(entityIdx) },
            { label: '➕ 属性を追加', onClick: () => this._addAttribute(entityIdx) },
            'separator',
            { label: '🗑 このエンティティを削除', danger: true, onClick: () => this._deleteEntity(entityIdx) },
          ]);
        });
      });

      // Make entire entity group (<g>) and any <rect>/<polygon> inside clickable.
      // This is the reliable path for connect mode: clicking anywhere on the
      // table — header, body, border — registers the entity.
      entityGroups.forEach((groupSet, entityIdx) => {
        const entityName = this.entities[entityIdx].name;
        groupSet.forEach(g => {
          g.style.cursor = this._connectMode ? 'crosshair' : 'pointer';
          // Ensure SVG shapes inside receive pointer events
          g.querySelectorAll('rect, polygon, path').forEach(shape => {
            shape.style.pointerEvents = 'all';
            shape.style.cursor = this._connectMode ? 'crosshair' : 'pointer';
          });
          if (g.dataset.dveErBound) return;
          g.dataset.dveErBound = '1';
          g.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this._connectMode) {
              this._handleSvgConnect(entityName);
              return;
            }
            this._highlightedEntityIdx = entityIdx;
            this._highlightedRelIdx = -1;
            this._renderList();
          });
          g.addEventListener('mouseenter', () => {
            if (this._connectMode) g.style.filter = 'brightness(1.3) drop-shadow(0 0 6px #007fd4)';
          });
          g.addEventListener('mouseleave', () => {
            g.style.filter = (this._connectMode && this._connectFrom === entityName)
              ? 'drop-shadow(0 0 6px #00cc66)' : '';
          });
          if (this._connectMode && this._connectFrom === entityName) {
            g.style.filter = 'drop-shadow(0 0 6px #00cc66)';
          }
        });
      });

      // Relationship label event handlers — double-click to edit
      relLabelTexts.forEach(({ el, idx: ri }) => {
        el.style.cursor = 'pointer';
        el.style.pointerEvents = 'all';
        el.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          this._editRelationship(ri);
        });
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          this._highlightedRelIdx = ri;
          this._highlightedEntityIdx = -1;
          this._renderList();
        });
      });

      // Also handle relationshipLine paths for click interaction
      const relLines = svgEl.querySelectorAll('.er.relationshipLine');
      const relLineArr = Array.from(relLines);
      relLineArr.forEach((pathEl, idx) => {
        if (idx >= this.relationships.length) return;
        pathEl.style.cursor = 'pointer';
        pathEl.style.pointerEvents = 'stroke';
        const ri = idx;
        const handleRelClick = (e) => {
          e.stopPropagation();
          this._highlightedRelIdx = ri;
          this._highlightedEntityIdx = -1;
          this._renderList();
        };
        const handleRelDblClick = (e) => {
          e.stopPropagation();
          this._editRelationship(ri);
        };
        pathEl.addEventListener('click', handleRelClick);
        pathEl.addEventListener('dblclick', handleRelDblClick);
      });

      // Click on SVG background to reset (but NOT in connect mode — keep
      // selection so user can keep clicking entities).
      svgEl.addEventListener('click', () => {
        if (this._connectMode) return;
        this._highlightedEntityIdx = -1;
        this._highlightedRelIdx = -1;
        this._renderList();
        this._setStatus('');
      });
    }

    /** Show a small context menu on SVG entity double-click */
    _showEntitySvgMenu(ei, event) {
      const entity = this.entities[ei]; if (!entity) return;
      // Remove any existing menu
      const old = this.container.querySelector('.er-svg-menu');
      if (old) old.remove();

      const menu = _el('div', 'er-svg-menu');
      menu.style.position = 'absolute';
      const rect = this._svgArea.getBoundingClientRect();
      menu.style.left = (event.clientX - rect.left + this._svgArea.scrollLeft) + 'px';
      menu.style.top = (event.clientY - rect.top + this._svgArea.scrollTop) + 'px';

      const btnRename = _el('button', 'er-svg-menu-btn');
      btnRename.textContent = '✏️ 名前変更';
      btnRename.addEventListener('click', () => { menu.remove(); this._renameEntity(ei); });

      const btnAddAttr = _el('button', 'er-svg-menu-btn');
      btnAddAttr.textContent = '➕ 属性追加';
      btnAddAttr.addEventListener('click', () => { menu.remove(); this._addAttribute(ei); });

      const btnDelete = _el('button', 'er-svg-menu-btn er-svg-menu-btn-danger');
      btnDelete.textContent = '🗑 削除';
      btnDelete.addEventListener('click', () => { menu.remove(); this._deleteEntity(ei); });

      menu.appendChild(btnRename);
      menu.appendChild(btnAddAttr);
      menu.appendChild(btnDelete);
      this._svgArea.appendChild(menu);

      // Close on outside click
      const closeHandler = (ev) => {
        if (!menu.contains(ev.target)) {
          menu.remove();
          document.removeEventListener('mousedown', closeHandler);
        }
      };
      setTimeout(() => document.addEventListener('mousedown', closeHandler), 0);
    }

    _renderList() {
      this._listPanel.innerHTML = '';

      // ── Entities section ──
      const entSection = _el('div', '');
      entSection.appendChild(_elText('div', 'エンティティ (' + this.entities.length + ')', 'diagram-ve-section-header'));

      for (let ei = 0; ei < this.entities.length; ei++) {
        const entity = this.entities[ei];
        const item = _el('div', 'er-entity-item dve-list-item');
        if (this._highlightedEntityIdx === ei) item.classList.add('dve-highlighted');

        item.addEventListener('click', (e) => {
          if (e.target.closest('button') || e.target.closest('.inline-edit-input')) return;
          this._highlightedEntityIdx = (this._highlightedEntityIdx === ei) ? -1 : ei;
          this._highlightedRelIdx = -1;
          this._renderList();
        });

        const headerRow = _el('div', 'er-entity-header');
        const nameSpan = _elText('span', entity.name, 'er-entity-name');
        nameSpan.title = entity.name;
        nameSpan.style.cursor = 'pointer';
        nameSpan.addEventListener('dblclick', () => this._renameEntity(ei));
        headerRow.appendChild(nameSpan);

        const attrCount = _elText('span', '(' + entity.attributes.length + ' attrs)', 'er-attr-count');
        headerRow.appendChild(attrCount);

        const addAttrBtn = _el('button', 'mve-tool-btn er-mini-btn');
        addAttrBtn.textContent = '+ 属性';
        addAttrBtn.addEventListener('click', () => this._addAttribute(ei));
        headerRow.appendChild(addAttrBtn);

        const delEntityBtn = _el('button', 'mve-tool-btn er-mini-btn er-del-btn');
        delEntityBtn.textContent = '✕';
        delEntityBtn.title = 'エンティティ削除';
        delEntityBtn.addEventListener('click', () => this._deleteEntity(ei));
        headerRow.appendChild(delEntityBtn);

        item.appendChild(headerRow);

        // Attribute list
        if (entity.attributes.length > 0) {
          const attrList = _el('div', 'er-attr-list');
          for (let ai = 0; ai < entity.attributes.length; ai++) {
            const attr = entity.attributes[ai];
            const attrRow = _el('div', 'er-attr-row');

            const typeSpan = _elText('span', attr.type, 'er-attr-type');
            typeSpan.title = attr.type;
            typeSpan.style.cursor = 'pointer';
            typeSpan.addEventListener('click', () => {
              _inlineEdit(typeSpan, attr.type, (v) => { attr.type = v; this._render(); });
            });
            attrRow.appendChild(typeSpan);

            const nameEl = _elText('span', attr.name, 'er-attr-name');
            nameEl.title = attr.name;
            nameEl.style.cursor = 'pointer';
            nameEl.addEventListener('click', () => {
              _inlineEdit(nameEl, attr.name, (v) => { attr.name = v; this._render(); });
            });
            attrRow.appendChild(nameEl);

            const keyEl = _elText('span', attr.key || '-', 'er-attr-key');
            keyEl.title = attr.key || '-';
            keyEl.style.cursor = 'pointer';
            keyEl.addEventListener('click', () => {
              const keys = ['', 'PK', 'FK', 'UK'];
              const current = keys.indexOf(attr.key);
              attr.key = keys[(current + 1) % keys.length];
              this._render();
            });
            attrRow.appendChild(keyEl);

            const delAttrBtn = _el('button', 'er-attr-del');
            delAttrBtn.textContent = '✕';
            delAttrBtn.addEventListener('click', () => {
              entity.attributes.splice(ai, 1); this._render();
            });
            attrRow.appendChild(delAttrBtn);

            attrList.appendChild(attrRow);
          }
          item.appendChild(attrList);
        }

        _makeDraggable(item, 'entity', ei, this, 'entities');
        entSection.appendChild(item);
      }
      this._listPanel.appendChild(entSection);

      // ── Relationships section ──
      const relSection = _el('div', '');
      relSection.appendChild(_elText('div', 'リレーション (' + this.relationships.length + ')', 'diagram-ve-section-header'));

      for (let ri = 0; ri < this.relationships.length; ri++) {
        const rel = this.relationships[ri];
        const item = _el('div', 'er-rel-item dve-list-item');
        if (this._highlightedRelIdx === ri) item.classList.add('dve-highlighted');

        item.addEventListener('click', (e) => {
          if (e.target.closest('button') || e.target.closest('.inline-edit-input')) return;
          this._highlightedRelIdx = (this._highlightedRelIdx === ri) ? -1 : ri;
          this._highlightedEntityIdx = -1;
          this._renderList();
        });
        item.addEventListener('dblclick', (e) => {
          if (e.target.closest('button') || e.target.closest('.inline-edit-input')) return;
          e.stopPropagation();
          this._editRelationship(ri);
        });

        const relText = _elText('span', rel.from + ' ' + rel.cardinality + ' ' + rel.to, 'er-rel-text');
        relText.title = relText.textContent;
        item.appendChild(relText);

        const labelSpan = _elText('span', '"' + rel.label + '"', 'er-rel-label');
        labelSpan.title = rel.label;
        labelSpan.style.cursor = 'pointer';
        labelSpan.addEventListener('click', () => {
          _inlineEdit(labelSpan, rel.label, (v) => { rel.label = v; this._render(); });
        });
        item.appendChild(labelSpan);

        const editRelBtn = _el('button', 'mve-tool-btn er-mini-btn');
        editRelBtn.textContent = '✎';
        editRelBtn.title = 'リレーション編集';
        editRelBtn.addEventListener('click', () => this._editRelationship(ri));
        item.appendChild(editRelBtn);

        const delRelBtn = _el('button', 'mve-tool-btn er-mini-btn er-del-btn');
        delRelBtn.textContent = '✕';
        delRelBtn.addEventListener('click', () => { this.relationships.splice(ri, 1); this._render(); });
        item.appendChild(delRelBtn);

        _makeDraggable(item, 'relationship', ri, this, 'relationships');
        relSection.appendChild(item);
      }
      this._listPanel.appendChild(relSection);
    }

    async _addEntity() {
      const result = await _showDialog(this.container, {
        title: 'エンティティ追加',
        fields: [{ key: 'name', label: 'エンティティ名', type: 'text', value: '', placeholder: 'ENTITY_NAME' }]
      });
      if (!result || !result.name.trim()) return;
      const name = result.name.trim().replace(/\s+/g, '_').toUpperCase();
      if (this.entities.find(e => e.name === name)) {
        await _showAlert(this.container, 'エンティティ "' + name + '" は既に存在します');
        return;
      }
      this.entities.push({ name, attributes: [{ type: 'int', name: 'id', key: 'PK' }] });
      this._render();
    }

    async _renameEntity(ei) {
      const entity = this.entities[ei]; if (!entity) return;
      const result = await _showDialog(this.container, {
        title: 'エンティティ名変更',
        fields: [{ key: 'name', label: '新しい名前', type: 'text', value: entity.name }]
      });
      if (!result || !result.name.trim()) return;
      const newName = result.name.trim().replace(/\s+/g, '_').toUpperCase();
      const oldName = entity.name;
      entity.name = newName;
      // Update relationships referencing old name
      for (const rel of this.relationships) {
        if (rel.from === oldName) rel.from = newName;
        if (rel.to === oldName) rel.to = newName;
      }
      this._render();
    }

    async _addAttribute(ei) {
      const entity = this.entities[ei]; if (!entity) return;
      const result = await _showDialog(this.container, {
        title: entity.name + ' に属性追加',
        fields: [
          { key: 'type', label: '型', type: 'text', value: 'string', placeholder: 'int, string, text, datetime...' },
          { key: 'name', label: '属性名', type: 'text', value: '', placeholder: 'column_name' },
          { key: 'key', label: 'キー', type: 'select', value: '', options: [
            { value: '', label: 'なし' }, { value: 'PK', label: 'PK (主キー)' },
            { value: 'FK', label: 'FK (外部キー)' }, { value: 'UK', label: 'UK (ユニーク)' }
          ]}
        ]
      });
      if (!result || !result.name.trim()) return;
      entity.attributes.push({ type: result.type || 'string', name: result.name.trim(), key: result.key || '' });
      this._render();
    }

    _deleteEntity(ei) {
      const entity = this.entities[ei]; if (!entity) return;
      // Remove relationships referencing this entity
      this.relationships = this.relationships.filter(r => r.from !== entity.name && r.to !== entity.name);
      this.entities.splice(ei, 1);
      this._render();
    }

    async _addRelationship() {
      if (this.entities.length < 2) {
        await _showAlert(this.container, 'リレーション追加には2つ以上のエンティティが必要です');
        return;
      }
      const entityOpts = this.entities.map(e => ({ value: e.name, label: e.name }));
      const cardOpts = [
        { value: '||--o{', label: '||--o{ (1対多)' },
        { value: '}o--o{', label: '}o--o{ (多対多)' },
        { value: '||--||', label: '||--|| (1対1)' },
        { value: '}|--||', label: '}|--|| (多対1)' },
        { value: '||--|{', label: '||--|{ (1対1以上)' },
        { value: '}o--||', label: '}o--|| (0以上対1)' },
      ];
      const result = await _showDialog(this.container, {
        title: 'リレーション追加',
        fields: [
          { key: 'from', label: 'From', type: 'select', value: entityOpts[0].value, options: entityOpts },
          { key: 'card', label: 'カーディナリティ', type: 'select', value: '||--o{', options: cardOpts },
          { key: 'to', label: 'To', type: 'select', value: entityOpts.length > 1 ? entityOpts[1].value : entityOpts[0].value, options: entityOpts },
          { key: 'label', label: 'ラベル', type: 'text', value: '', placeholder: 'has, belongs to...' }
        ]
      });
      if (!result) return;
      this.relationships.push({
        from: result.from, cardinality: result.card,
        to: result.to, label: result.label || ''
      });
      this._render();
    }

    async _editRelationship(ri) {
      const rel = this.relationships[ri]; if (!rel) return;
      const entityOpts = this.entities.map(e => ({ value: e.name, label: e.name }));
      const cardOpts = [
        { value: '||--o{', label: '||--o{ (1対多)' },
        { value: '}o--o{', label: '}o--o{ (多対多)' },
        { value: '||--||', label: '||--|| (1対1)' },
        { value: '}|--||', label: '}|--|| (多対1)' },
        { value: '||--|{', label: '||--|{ (1対1以上)' },
        { value: '}o--||', label: '}o--|| (0以上対1)' },
      ];
      const result = await _showDialog(this.container, {
        title: 'リレーション編集',
        deleteLabel: '🗑 削除',
        fields: [
          { key: 'from', label: 'From', type: 'select', value: rel.from, options: entityOpts },
          { key: 'card', label: 'カーディナリティ', type: 'select', value: rel.cardinality, options: cardOpts },
          { key: 'to', label: 'To', type: 'select', value: rel.to, options: entityOpts },
          { key: 'label', label: 'ラベル', type: 'text', value: rel.label }
        ]
      });
      if (!result) return;
      if (result.__delete) { this.relationships.splice(ri, 1); this._render(); return; }
      rel.from = result.from; rel.cardinality = result.card;
      rel.to = result.to; rel.label = result.label || '';
      this._render();
    }
  }

  // ═══════ Detection helpers ═══════
  function isClassDiagram(code) { return code.trim().split('\n')[0].trim().startsWith('classDiagram'); }
  function isSequenceDiagram(code) { return code.trim().split('\n')[0].trim().startsWith('sequenceDiagram'); }
  function isMindmap(code) { return code.trim().split('\n')[0].trim().startsWith('mindmap'); }
  function isQuadrantChart(code) { return code.trim().split('\n')[0].trim().startsWith('quadrantChart'); }
  function isGanttChart(code) { return code.trim().split('\n')[0].trim().startsWith('gantt'); }
  function isERDiagram(code) { return code.trim().split('\n')[0].trim().startsWith('erDiagram'); }

  // ═══════ Exports ═══════
  window.ClassDiagramEditor = ClassDiagramEditor;
  window.SequenceDiagramEditor = SequenceDiagramEditor;
  window.TableVisualEditor = TableVisualEditor;
  window.MindmapEditor = MindmapEditor;
  window.QuadrantChartEditor = QuadrantChartEditor;
  window.GanttChartEditor = GanttChartEditor;
  window.ERDiagramEditor = ERDiagramEditor;
  window.DiagramEditorUtils = { isClassDiagram, isSequenceDiagram, isMindmap, isQuadrantChart, isGanttChart, isERDiagram };
})();

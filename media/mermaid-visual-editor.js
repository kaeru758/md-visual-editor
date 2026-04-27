/**
 * Mermaid Visual Editor — draw.io風のGUIダイアグラム編集
 * ノードのクリック追加、テキスト直接編集、接続のGUI操作に対応
 */
(function () {
  'use strict';

  // ─── 定数 ───
  const SHAPES = {
    rect:     { label: '矩形',     open: '[',  close: ']'  },
    rounded:  { label: '角丸',     open: '(',  close: ')'  },
    diamond:  { label: '分岐',     open: '{',  close: '}'  },
    circle:   { label: '円形',     open: '((',  close: '))' },
    stadium:  { label: 'スタジアム', open: '([', close: '])' },
    hexagon:  { label: '六角形',   open: '{{', close: '}}' },
    cylinder: { label: 'シリンダー', open: '[(', close: ')]' },
    subroutine: { label: 'サブルーチン', open: '[[', close: ']]' },
  };

  const EDGE_TYPES = {
    arrow:  { label: '→ 矢印',   syntax: '-->' },
    line:   { label: '— 直線',   syntax: '---' },
    dotted: { label: '⋯ 点線',   syntax: '-.->' },
    thick:  { label: '⇒ 太線',   syntax: '==>' },
  };

  const DIRECTIONS = {
    TD: '↓ 上から下',
    LR: '→ 左から右',
    BT: '↑ 下から上',
    RL: '← 右から左',
  };

  // ─── Color Presets ───
  const NODE_COLORS = [
    { label: 'デフォルト', fill: '', stroke: '' },
    { label: '青',       fill: '#4a90d9', stroke: '#2c5ea0' },
    { label: '緑',       fill: '#5cb85c', stroke: '#3d8b3d' },
    { label: '赤',       fill: '#d9534f', stroke: '#b52b27' },
    { label: '黄',       fill: '#f0ad4e', stroke: '#d48b0c' },
    { label: '紫',       fill: '#9b59b6', stroke: '#7d3c98' },
    { label: 'ティール', fill: '#1abc9c', stroke: '#148f77' },
    { label: 'ピンク',   fill: '#e91e90', stroke: '#b5176e' },
    { label: 'グレー',   fill: '#95a5a6', stroke: '#7f8c8d' },
  ];

  const TEXT_COLORS = [
    { label: 'デフォルト', color: '' },
    { label: '白',         color: '#ffffff' },
    { label: '黒',         color: '#000000' },
    { label: '赤',         color: '#e74c3c' },
    { label: '青',         color: '#3498db' },
    { label: '緑',         color: '#27ae60' },
    { label: '黄',         color: '#f39c12' },
  ];

  const MODE = { NORMAL: 'normal', CONNECTING: 'connecting', GROUPING: 'grouping' };

  // ─── FlowchartModel ───
  class FlowchartModel {
    constructor() {
      this.direction = 'TD';
      this.layout = 'dagre';
      this.nodes = new Map();
      this.edges = [];
      this.subgraphs = []; // { id, label, nodeIds: [], parentSgId: string|null }
      this.styles = new Map(); // nodeId → { fill, stroke, color }
      this._idCounter = 0;
      this._sgCounter = 0;
    }

    /** Mermaid flowchart コードをパースしてモデルに変換 */
    parse(code) {
      this.nodes = new Map();
      this.edges = [];
      this.subgraphs = [];
      this.styles = new Map();
      this.layout = 'dagre';
      this._idCounter = 0;
      this._sgCounter = 0;

      const lines = code.split('\n');
      const sgStack = []; // nesting stack

      for (const line of lines) {
        const t = line.trim();
        if (!t) continue;

        // Init directive: %%{init: {...}}%%
        const initMatch = t.match(/^%%\{\s*init\s*:\s*(\{[\s\S]*\})\s*\}%%$/);
        if (initMatch) {
          try {
            const obj = JSON.parse(initMatch[1].replace(/'/g, '"'));
            if (obj && typeof obj === 'object') {
              if (obj.layout) this.layout = String(obj.layout);
              else if (obj.flowchart && obj.flowchart.defaultRenderer === 'elk') this.layout = 'elk';
            }
          } catch (_e) { /* ignore */ }
          continue;
        }
        if (t.startsWith('%%')) continue;

        // Direction
        const dirMatch = t.match(/^(?:graph|flowchart)\s+(TD|TB|LR|RL|BT)/i);
        if (dirMatch) {
          this.direction = dirMatch[1].toUpperCase() === 'TB' ? 'TD' : dirMatch[1].toUpperCase();
          continue;
        }
        if (/^(?:graph|flowchart)\b/i.test(t)) continue;

        // Style line: style N0 fill:#f9f,stroke:#333,color:#000
        const styleMatch = t.match(/^style\s+(\S+)\s+(.+)$/);
        if (styleMatch) {
          const nodeId = styleMatch[1];
          const propsStr = styleMatch[2];
          const props = {};
          for (const pair of propsStr.split(',')) {
            const [k, v] = pair.split(':').map(s => s.trim());
            if (k && v) props[k] = v;
          }
          this.styles.set(nodeId, {
            fill: props.fill || '',
            stroke: props.stroke || '',
            color: props.color || '',
          });
          continue;
        }

        // Subgraph start
        const sgMatch = t.match(/^subgraph\s+(\S+)\s*\[(.+)\]$/);
        const sgMatchSimple = !sgMatch ? t.match(/^subgraph\s+(.+)$/) : null;
        if (sgMatch || sgMatchSimple) {
          const sgId = sgMatch ? sgMatch[1] : ('SG' + this._sgCounter++);
          const sgLabel = sgMatch ? sgMatch[2] : (sgMatchSimple ? sgMatchSimple[1].trim() : sgId);
          const parent = sgStack.length > 0 ? sgStack[sgStack.length - 1].id : null;
          const sg = { id: sgId, label: sgLabel, nodeIds: [], parentSgId: parent };
          this.subgraphs.push(sg);
          sgStack.push(sg);
          continue;
        }

        // Subgraph end
        if (t === 'end') {
          sgStack.pop();
          continue;
        }

        const currentSubgraph = sgStack.length > 0 ? sgStack[sgStack.length - 1] : null;

        // Edge
        const edge = this._parseEdgeLine(t);
        if (edge) {
          this._ensureNode(edge.fromId, edge.fromLabel, edge.fromShape);
          this._ensureNode(edge.toId, edge.toLabel, edge.toShape);
          this.edges.push({ from: edge.fromId, to: edge.toId, label: edge.edgeLabel, type: edge.edgeType });
          if (currentSubgraph) {
            if (!currentSubgraph.nodeIds.includes(edge.fromId)) currentSubgraph.nodeIds.push(edge.fromId);
            if (!currentSubgraph.nodeIds.includes(edge.toId)) currentSubgraph.nodeIds.push(edge.toId);
          }
          continue;
        }

        // Standalone node
        const node = this._parseNodeRef(t);
        if (node && node.label) {
          this._ensureNode(node.id, node.label, node.shape);
          if (currentSubgraph) {
            if (!currentSubgraph.nodeIds.includes(node.id)) currentSubgraph.nodeIds.push(node.id);
          }
          continue;
        }
      }

      // Sync _idCounter
      for (const id of this.nodes.keys()) {
        const m = id.match(/^N(\d+)$/);
        if (m) this._idCounter = Math.max(this._idCounter, parseInt(m[1], 10) + 1);
      }
    }

    /** モデルからMermaidコードを生成 */
    generate() {
      const lines = [];
      // Layout directive
      const layout = this.layout || 'dagre';
      if (layout && layout !== 'dagre') {
        lines.push('%%{init: {"layout": "' + layout + '"}}%%');
      }
      lines.push('graph ' + this.direction);

      // Determine which nodes are inside any subgraph
      const groupedNodeIds = new Set();
      for (const sg of this.subgraphs) {
        for (const nid of sg.nodeIds) groupedNodeIds.add(nid);
      }

      // Ungrouped node definitions
      for (const [id, node] of this.nodes) {
        if (groupedNodeIds.has(id)) continue;
        const s = SHAPES[node.shape] || SHAPES.rect;
        lines.push('    ' + id + s.open + node.label + s.close);
      }

      // Build subgraph tree (root subgraphs first, then nested)
      const childrenOf = new Map();
      const roots = [];
      for (const sg of this.subgraphs) {
        if (sg.parentSgId && this.subgraphs.some(s => s.id === sg.parentSgId)) {
          if (!childrenOf.has(sg.parentSgId)) childrenOf.set(sg.parentSgId, []);
          childrenOf.get(sg.parentSgId).push(sg);
        } else {
          roots.push(sg);
        }
      }

      const emitSg = (sg, depth) => {
        const indent = '    '.repeat(depth + 1);
        const innerIndent = '    '.repeat(depth + 2);
        lines.push(indent + 'subgraph ' + sg.id + '[' + sg.label + ']');
        const childIds = new Set((childrenOf.get(sg.id) || []).flatMap(c => c.nodeIds));
        for (const nid of sg.nodeIds) {
          if (childIds.has(nid)) continue; // node will be emitted by descendant subgraph
          const node = this.nodes.get(nid);
          if (!node) continue;
          const s = SHAPES[node.shape] || SHAPES.rect;
          lines.push(innerIndent + nid + s.open + node.label + s.close);
        }
        for (const child of (childrenOf.get(sg.id) || [])) emitSg(child, depth + 1);
        lines.push(indent + 'end');
      };
      for (const root of roots) emitSg(root, 0);

      // Edges
      for (const edge of this.edges) {
        const syn = (EDGE_TYPES[edge.type] || EDGE_TYPES.arrow).syntax;
        let line = '    ' + edge.from + ' ' + syn;
        if (edge.label) line += '|' + edge.label + '|';
        line += ' ' + edge.to;
        lines.push(line);
      }

      // Style definitions
      for (const [nodeId, style] of this.styles) {
        if (!this.nodes.has(nodeId)) continue;
        const parts = [];
        if (style.fill) parts.push('fill:' + style.fill);
        if (style.stroke) parts.push('stroke:' + style.stroke);
        if (style.color) parts.push('color:' + style.color);
        if (parts.length > 0) {
          lines.push('    style ' + nodeId + ' ' + parts.join(','));
        }
      }

      return lines.join('\n');
    }

    generateNextId() {
      while (this.nodes.has('N' + this._idCounter)) this._idCounter++;
      return 'N' + (this._idCounter++);
    }

    addNode(shape, label) {
      const id = this.generateNextId();
      this.nodes.set(id, { id, label: label || '新しいノード', shape: shape || 'rect' });
      return id;
    }

    removeNode(id) {
      this.nodes.delete(id);
      this.edges = this.edges.filter(e => e.from !== id && e.to !== id);
      this.styles.delete(id);
      // Remove from subgraphs
      for (const sg of this.subgraphs) {
        sg.nodeIds = sg.nodeIds.filter(nid => nid !== id);
      }
      this.subgraphs = this.subgraphs.filter(sg => sg.nodeIds.length > 0);
    }

    updateNodeLabel(id, label) {
      const n = this.nodes.get(id);
      if (n) n.label = label;
    }

    updateNodeShape(id, shape) {
      const n = this.nodes.get(id);
      if (n) n.shape = shape;
    }

    addEdge(from, to, type, label) {
      this.edges.push({ from, to, label: label || '', type: type || 'arrow' });
    }

    removeEdge(index) {
      this.edges.splice(index, 1);
    }

    updateEdgeLabel(index, label) {
      if (this.edges[index]) this.edges[index].label = label;
    }

    updateEdgeType(index, type) {
      if (this.edges[index]) this.edges[index].type = type;
    }

    // ─── Style methods ───
    getNodeStyle(id) {
      return this.styles.get(id) || { fill: '', stroke: '', color: '' };
    }

    setNodeStyle(id, fill, stroke, color) {
      if (!fill && !stroke && !color) {
        this.styles.delete(id);
      } else {
        this.styles.set(id, { fill: fill || '', stroke: stroke || '', color: color || '' });
      }
    }

    // ─── Subgraph methods ───
    addSubgraph(label, nodeIds) {
      const id = 'SG' + this._sgCounter++;
      // Remove these nodes from other subgraphs
      for (const sg of this.subgraphs) {
        sg.nodeIds = sg.nodeIds.filter(nid => !nodeIds.includes(nid));
      }
      // Drop empty subgraphs that aren't parents of others
      this.subgraphs = this.subgraphs.filter(sg => sg.nodeIds.length > 0 || this.subgraphs.some(c => c.parentSgId === sg.id));
      this.subgraphs.push({ id, label: label || 'グループ', nodeIds: [...nodeIds], parentSgId: null });
      return id;
    }

    /** 既存サブグラフ複数を 1 つの新しい親サブグラフに括る */
    groupSubgraphs(label, sgIds) {
      if (!sgIds || sgIds.length === 0) return null;
      const id = 'SG' + this._sgCounter++;
      this.subgraphs.push({ id, label: label || 'グループ', nodeIds: [], parentSgId: null });
      for (const sg of this.subgraphs) {
        if (sgIds.includes(sg.id) && sg.id !== id) sg.parentSgId = id;
      }
      return id;
    }

    /** サブグラフの親を変更（null でルートへ） */
    setSubgraphParent(sgId, parentSgId) {
      const sg = this.subgraphs.find(s => s.id === sgId);
      if (!sg) return;
      // 循環防止
      if (parentSgId) {
        let p = parentSgId;
        const seen = new Set();
        while (p) {
          if (p === sgId) return;
          if (seen.has(p)) return;
          seen.add(p);
          const pp = this.subgraphs.find(s => s.id === p);
          p = pp ? pp.parentSgId : null;
        }
      }
      sg.parentSgId = parentSgId || null;
    }

    removeSubgraph(sgId) {
      // Children become root-level
      for (const sg of this.subgraphs) {
        if (sg.parentSgId === sgId) sg.parentSgId = null;
      }
      this.subgraphs = this.subgraphs.filter(sg => sg.id !== sgId);
    }

    updateSubgraphLabel(sgId, newLabel) {
      const sg = this.subgraphs.find(s => s.id === sgId);
      if (sg) sg.label = newLabel;
    }

    addNodeToSubgraph(sgId, nodeId) {
      // Remove from other subgraphs first
      for (const sg of this.subgraphs) {
        sg.nodeIds = sg.nodeIds.filter(nid => nid !== nodeId);
      }
      const sg = this.subgraphs.find(s => s.id === sgId);
      if (sg && !sg.nodeIds.includes(nodeId)) sg.nodeIds.push(nodeId);
    }

    removeNodeFromSubgraph(sgId, nodeId) {
      const sg = this.subgraphs.find(s => s.id === sgId);
      if (sg) sg.nodeIds = sg.nodeIds.filter(nid => nid !== nodeId);
      // Keep parent subgraphs that have child subgraphs
      this.subgraphs = this.subgraphs.filter(s => s.nodeIds.length > 0 || this.subgraphs.some(c => c.parentSgId === s.id));
    }

    getSubgraphForNode(nodeId) {
      return this.subgraphs.find(sg => sg.nodeIds.includes(nodeId)) || null;
    }

    // ─── Internal parsers ───
    _ensureNode(id, label, shape) {
      if (!this.nodes.has(id)) {
        this.nodes.set(id, { id, label: label || id, shape: shape || 'rect' });
      } else if (label) {
        const n = this.nodes.get(id);
        n.label = label;
        if (shape) n.shape = shape;
      }
    }

    _parseEdgeLine(line) {
      // Find the edge operator first
      const ops = [
        { re: /\s*-\.->/, type: 'dotted' },
        { re: /\s*==>/, type: 'thick' },
        { re: /\s*-->/, type: 'arrow' },
        { re: /\s*---/, type: 'line' },
      ];

      for (const op of ops) {
        const m = line.match(op.re);
        if (!m) continue;

        const idx = line.indexOf(m[0]);
        const left = line.substring(0, idx).trim();
        let right = line.substring(idx + m[0].length).trim();

        // Edge label: -->|text| or similar
        let edgeLabel = '';
        const lm = right.match(/^\|([^|]*)\|\s*/);
        if (lm) { edgeLabel = lm[1]; right = right.substring(lm[0].length).trim(); }

        // Also handle -- text --> style (label embedded between --)
        if (!edgeLabel) {
          const lm2 = m[0].match(/--\s*(.+?)\s*-->/);
          if (lm2) edgeLabel = lm2[1];
        }

        const fromNode = this._parseNodeRef(left);
        const toNode = this._parseNodeRef(right);
        if (fromNode && toNode) {
          return {
            fromId: fromNode.id, fromLabel: fromNode.label, fromShape: fromNode.shape,
            toId: toNode.id, toLabel: toNode.label, toShape: toNode.shape,
            edgeLabel, edgeType: op.type,
          };
        }
      }
      return null;
    }

    _parseNodeRef(str) {
      const patterns = [
        { re: /^([a-zA-Z_\u3000-\u9FFF][a-zA-Z0-9_\u3000-\u9FFF]*)\[\[(.*?)\]\]$/, shape: 'subroutine' },
        { re: /^([a-zA-Z_\u3000-\u9FFF][a-zA-Z0-9_\u3000-\u9FFF]*)\(\((.*?)\)\)$/, shape: 'circle' },
        { re: /^([a-zA-Z_\u3000-\u9FFF][a-zA-Z0-9_\u3000-\u9FFF]*)\(\[(.*?)\]\)$/, shape: 'stadium' },
        { re: /^([a-zA-Z_\u3000-\u9FFF][a-zA-Z0-9_\u3000-\u9FFF]*)\{\{(.*?)\}\}$/, shape: 'hexagon' },
        { re: /^([a-zA-Z_\u3000-\u9FFF][a-zA-Z0-9_\u3000-\u9FFF]*)\[\((.*?)\)\]$/, shape: 'cylinder' },
        { re: /^([a-zA-Z_\u3000-\u9FFF][a-zA-Z0-9_\u3000-\u9FFF]*)\[(.*?)\]$/, shape: 'rect' },
        { re: /^([a-zA-Z_\u3000-\u9FFF][a-zA-Z0-9_\u3000-\u9FFF]*)\((.*?)\)$/, shape: 'rounded' },
        { re: /^([a-zA-Z_\u3000-\u9FFF][a-zA-Z0-9_\u3000-\u9FFF]*)\{(.*?)\}$/, shape: 'diamond' },
      ];
      for (const p of patterns) {
        const m = str.match(p.re);
        if (m) return { id: m[1], label: m[2], shape: p.shape };
      }
      const plain = str.match(/^([a-zA-Z_\u3000-\u9FFF][a-zA-Z0-9_\u3000-\u9FFF]*)$/);
      if (plain) return { id: plain[1], label: '', shape: 'rect' };
      return null;
    }
  }

  // ─── Undo Stack ───
  class UndoStack {
    constructor() { this._stack = []; this._index = -1; }
    push(state) {
      this._index++;
      this._stack.length = this._index;
      this._stack.push(JSON.stringify(state));
    }
    canUndo() { return this._index > 0; }
    canRedo() { return this._index < this._stack.length - 1; }
    undo() {
      if (!this.canUndo()) return null;
      this._index--;
      return JSON.parse(this._stack[this._index]);
    }
    redo() {
      if (!this.canRedo()) return null;
      this._index++;
      return JSON.parse(this._stack[this._index]);
    }
  }

  // ─── MermaidVisualEditor ───
  class MermaidVisualEditor {
    /**
     * @param {HTMLElement} container   編集ブロック要素
     * @param {string}      code       初期Mermaidコード
     * @param {Function}    onChange   コード変更時コールバック (newCode) => void
     */
    constructor(container, code, onChange) {
      this.container = container;
      this.onChange = onChange;
      this.model = new FlowchartModel();
      this.model.parse(code);
      this.undo = new UndoStack();
      this.undo.push(this._snapshot());

      this.mode = MODE.NORMAL;
      this.selectedNodeId = null;
      this.selectedEdgeIndex = -1;
      this._hoveredEdgeIndex = -1;
      this.connectFrom = null;
      this.currentEdgeType = 'arrow';
      this._inlineEditor = null;
      this._codeVisible = false;
      this._renderTimer = null;

      // Zoom state
      this._zoomLevel = 1.0;
      this._zoomMin = 0.2;
      this._zoomMax = 3.0;
      this._zoomStep = 0.15;
      this._initialRender = true;

      this._buildUI();
      this._renderDiagram();
    }

    destroy() {
      this._dismissInlineEditor(false);
      this.container.innerHTML = '';
    }

    // ═══════ UI Construction ═══════

    _buildUI() {
      this.container.innerHTML = '';
      this.container.classList.add('mve-root');

      // ── Toolbar ──
      const toolbar = el('div', 'mve-toolbar');

      // Node shapes
      const nodeSection = el('div', 'mve-toolbar-section');
      nodeSection.appendChild(elText('span', 'ノード追加:', 'mve-toolbar-label'));
      for (const [key, shape] of Object.entries(SHAPES)) {
        const btn = el('button', 'mve-shape-btn');
        btn.title = shape.label + 'ノードを追加';
        btn.dataset.shape = key;
        btn.innerHTML = '<span class="mve-shape-icon mve-si-' + key + '"></span>';
        btn.addEventListener('click', () => this._addNode(key));
        nodeSection.appendChild(btn);
      }
      toolbar.appendChild(nodeSection);

      // Connection
      const connSection = el('div', 'mve-toolbar-section');
      this._connectBtn = el('button', 'mve-tool-btn');
      this._connectBtn.innerHTML = '🔗 接続';
      this._connectBtn.title = '2つのノードを接続';
      this._connectBtn.addEventListener('click', () => this._toggleConnectMode());
      connSection.appendChild(this._connectBtn);

      const edgeSelect = el('select', 'mve-select');
      for (const [key, et] of Object.entries(EDGE_TYPES)) {
        const opt = document.createElement('option');
        opt.value = key; opt.textContent = et.label;
        edgeSelect.appendChild(opt);
      }
      edgeSelect.addEventListener('change', (e) => { this.currentEdgeType = e.target.value; });
      connSection.appendChild(edgeSelect);
      toolbar.appendChild(connSection);

      // Actions
      const actSection = el('div', 'mve-toolbar-section');

      const undoBtn = el('button', 'mve-tool-btn');
      undoBtn.innerHTML = '↩ 戻す';
      undoBtn.title = '元に戻す (Ctrl+Z)';
      undoBtn.addEventListener('click', () => this._doUndo());
      actSection.appendChild(undoBtn);

      const redoBtn = el('button', 'mve-tool-btn');
      redoBtn.innerHTML = '↪ やり直す';
      redoBtn.title = 'やり直す (Ctrl+Y)';
      redoBtn.addEventListener('click', () => this._doRedo());
      actSection.appendChild(redoBtn);

      const delBtn = el('button', 'mve-tool-btn mve-tool-danger');
      delBtn.innerHTML = '🗑 削除';
      delBtn.title = '選択中の要素を削除 (Del)';
      delBtn.addEventListener('click', () => this._deleteSelected());
      actSection.appendChild(delBtn);
      toolbar.appendChild(actSection);

      // Direction
      const dirSection = el('div', 'mve-toolbar-section');
      dirSection.appendChild(elText('span', '方向:', 'mve-toolbar-label'));
      const dirSelect = el('select', 'mve-select');
      for (const [key, label] of Object.entries(DIRECTIONS)) {
        const opt = document.createElement('option');
        opt.value = key; opt.textContent = label;
        if (key === this.model.direction) opt.selected = true;
        dirSelect.appendChild(opt);
      }
      dirSelect.addEventListener('change', (e) => {
        this.model.direction = e.target.value;
        this._commitChange();
      });
      dirSection.appendChild(dirSelect);
      toolbar.appendChild(dirSection);

      // Layout (Mermaid renderer choice)
      const layoutSection = el('div', 'mve-toolbar-section');
      layoutSection.appendChild(elText('span', 'レイアウト:', 'mve-toolbar-label'));
      const layoutSelect = el('select', 'mve-select');
      const LAYOUTS = [
        { v: 'dagre', t: 'Dagre（標準）' },
        { v: 'elk', t: 'ELK（高度）' },
        { v: 'elk-mrtree', t: 'ELK ツリー' },
      ];
      for (const opt of LAYOUTS) {
        const o = document.createElement('option');
        o.value = opt.v; o.textContent = opt.t;
        if ((this.model.layout || 'dagre') === opt.v) o.selected = true;
        layoutSelect.appendChild(o);
      }
      layoutSelect.addEventListener('change', (e) => {
        this.model.layout = e.target.value;
        this._commitChange();
      });
      layoutSection.appendChild(layoutSelect);
      toolbar.appendChild(layoutSection);

      // Zoom controls
      const zoomSection = el('div', 'mve-toolbar-section');
      zoomSection.appendChild(elText('span', '表示:', 'mve-toolbar-label'));

      const zoomInBtn = el('button', 'mve-tool-btn mve-zoom-btn');
      zoomInBtn.innerHTML = '🔍+';
      zoomInBtn.title = '拡大 (Ctrl+マウスホイール↑)';
      zoomInBtn.addEventListener('click', () => this._zoomIn());
      zoomSection.appendChild(zoomInBtn);

      const zoomOutBtn = el('button', 'mve-tool-btn mve-zoom-btn');
      zoomOutBtn.innerHTML = '🔍−';
      zoomOutBtn.title = '縮小 (Ctrl+マウスホイール↓)';
      zoomOutBtn.addEventListener('click', () => this._zoomOut());
      zoomSection.appendChild(zoomOutBtn);

      const zoomFitBtn = el('button', 'mve-tool-btn mve-zoom-btn');
      zoomFitBtn.innerHTML = '⊞ フィット';
      zoomFitBtn.title = 'ダイアグラムを表示領域に合わせる';
      zoomFitBtn.addEventListener('click', () => this._zoomFit());
      zoomSection.appendChild(zoomFitBtn);

      this._zoomLabel = elText('span', '100%', 'mve-zoom-label');
      zoomSection.appendChild(this._zoomLabel);

      toolbar.appendChild(zoomSection);

      // Code toggle
      const codeSection = el('div', 'mve-toolbar-section');
      this._codeToggleBtn = el('button', 'mve-tool-btn');
      this._codeToggleBtn.innerHTML = '📝 コード';
      this._codeToggleBtn.title = 'Mermaidコードを表示/非表示';
      this._codeToggleBtn.addEventListener('click', () => this._toggleCode());
      codeSection.appendChild(this._codeToggleBtn);
      toolbar.appendChild(codeSection);

      // Grouping
      const groupSection = el('div', 'mve-toolbar-section');
      this._groupBtn = el('button', 'mve-tool-btn');
      this._groupBtn.innerHTML = '📦 グループ化';
      this._groupBtn.title = '選択ノードをグループにまとめる';
      this._groupBtn.addEventListener('click', () => this._startGrouping());
      groupSection.appendChild(this._groupBtn);
      toolbar.appendChild(groupSection);

      this.container.appendChild(toolbar);

      // ── Status bar ──
      this._statusBar = el('div', 'mve-status');
      this._statusBar.textContent = 'ヒント: ノードをクリックで選択。ダブルクリックでテキスト編集。';
      this.container.appendChild(this._statusBar);

      // ── Body (sidebar + SVG) ──
      const body = el('div', 'dve-body dve-body-wide');

      // Left list panel
      this._listPanel = el('div', 'dve-list-panel');

      // ── Edge List ──
      this._edgeList = el('div', 'mve-edge-list');
      this._listPanel.appendChild(this._edgeList);

      // ── Subgraph List ──
      this._subgraphList = el('div', 'mve-subgraph-list');
      this._listPanel.appendChild(this._subgraphList);

      body.appendChild(this._listPanel);

      // ── SVG Area ──
      this._svgArea = el('div', 'mve-svg-area');
      this._svgArea.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
      body.appendChild(this._svgArea);

      this.container.appendChild(body);

      // ── Code Editor (hidden initially) ──
      this._codePanel = el('div', 'mve-code-panel mve-hidden');
      const codeLabel = elText('div', 'Mermaid コード（直接編集可能）', 'mve-code-label');
      this._codePanel.appendChild(codeLabel);
      this._codeTextarea = el('textarea', 'mve-code-textarea');
      this._codeTextarea.spellcheck = false;
      this._codePanel.appendChild(this._codeTextarea);
      const codeApplyBtn = el('button', 'mve-tool-btn mve-code-apply');
      codeApplyBtn.textContent = 'コードを適用';
      codeApplyBtn.addEventListener('click', () => this._applyCodeEdit());
      this._codePanel.appendChild(codeApplyBtn);
      this.container.appendChild(this._codePanel);

      // ── Keyboard ──
      this._keyHandler = (e) => this._onKeyDown(e);
      document.addEventListener('keydown', this._keyHandler);

      // Prevent toolbar button clicks from stealing focus (but allow selects to open)
      toolbar.addEventListener('mousedown', (e) => {
        if (e.target.closest('button') && !e.target.closest('select')) e.preventDefault();
      });
    }

    // ═══════ Rendering ═══════

    async _renderDiagram() {
      const code = this.model.generate();
      this.onChange(code);

      // Update code textarea if visible
      if (this._codeVisible) {
        this._codeTextarea.value = code;
      }

      // Render SVG
      try {
        const renderId = 'mve-svg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
        // @ts-ignore
        const { svg } = await mermaid.render(renderId, code);
        this._svgArea.innerHTML = svg;
        if (this._initialRender) {
          this._initialRender = false;
          // Only auto-fit if the rendered SVG is larger than the available area;
          // otherwise preserve the natural 100% so users don't see a sudden zoom change.
          try {
            const svgEl = this._svgArea.querySelector('svg');
            const areaRect = this._svgArea.getBoundingClientRect();
            if (svgEl) {
              svgEl.style.transform = 'none';
              const r = svgEl.getBoundingClientRect();
              if (r.width > areaRect.width - 16 || r.height > areaRect.height - 16) {
                this._zoomFit();
              } else {
                this._zoomLevel = 1.0;
                this._applyZoom();
              }
            } else {
              this._applyZoom();
            }
          } catch (_e) {
            this._applyZoom();
          }
        } else {
          this._applyZoom();
        }
        this._attachSvgHandlers();
      } catch (err) {
        this._svgArea.innerHTML = '<div class="mermaid-error">レンダリングエラー:\n' +
          _escHtml(err.message || String(err)) + '</div>';
      }

      // Render edge list
      this._renderEdgeList();

      // Render subgraph list
      this._renderSubgraphList();
    }

    _debouncedRender() {
      clearTimeout(this._renderTimer);
      this._renderTimer = setTimeout(() => this._renderDiagram(), 80);
    }

    _renderEdgeList() {
      this._edgeList.innerHTML = '';
      if (this.model.edges.length === 0) {
        this._edgeList.innerHTML = '<div class="mve-edge-empty">接続なし — ツールバーの「🔗 接続」でノードを接続できます</div>';
        return;
      }

      const header = elText('div', '接続一覧', 'mve-edge-header');
      this._edgeList.appendChild(header);

      const edgeTypeKeys = Object.keys(EDGE_TYPES);

      this.model.edges.forEach((edge, idx) => {
        const row = el('div', 'mve-edge-row' + (idx === this.selectedEdgeIndex ? ' mve-selected' : ''));
        row.dataset.edgeIndex = String(idx);

        const fromNode = this.model.nodes.get(edge.from);
        const toNode = this.model.nodes.get(edge.to);
        const fromLabel = fromNode ? fromNode.label : edge.from;
        const toLabel = toNode ? toNode.label : edge.to;
        const edgeType = EDGE_TYPES[edge.type] || EDGE_TYPES.arrow;

        // From label
        const fromSpan = el('span', 'mve-edge-desc');
        fromSpan.textContent = fromLabel;
        fromSpan.title = fromLabel;
        row.appendChild(fromSpan);

        // Edge type button — click to cycle through types
        const typeBtn = el('button', 'mve-edge-type-btn');
        typeBtn.textContent = edgeType.label;
        typeBtn.title = '線種を切り替え（クリックでサイクル）';
        typeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const curIdx = edgeTypeKeys.indexOf(edge.type || 'arrow');
          const nextType = edgeTypeKeys[(curIdx + 1) % edgeTypeKeys.length];
          this.model.updateEdgeType(idx, nextType);
          this._commitChange();
          this._setStatus('線種を変更: ' + EDGE_TYPES[nextType].label);
        });
        row.appendChild(typeBtn);

        // To label
        const toSpan = el('span', 'mve-edge-desc');
        toSpan.textContent = toLabel;
        if (edge.label) toSpan.textContent += '  「' + edge.label + '」';
        toSpan.title = toSpan.textContent;
        row.appendChild(toSpan);

        // Edit (from/to/label/type)
        const labelBtn = el('button', 'mve-edge-btn');
        labelBtn.textContent = '✏️';
        labelBtn.title = '接続を編集（つなぎ変え・ラベル・線種）';
        labelBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this._editEdgeLabel(idx, e);
        });
        row.appendChild(labelBtn);

        // Delete
        const delBtn = el('button', 'mve-edge-btn mve-edge-btn-del');
        delBtn.textContent = '✕';
        delBtn.title = '接続を削除';
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this._removeEdge(idx);
        });
        row.appendChild(delBtn);

        // Click to select
        row.addEventListener('click', () => {
          this.selectedEdgeIndex = (this.selectedEdgeIndex === idx) ? -1 : idx;
          this.selectedNodeId = null;
          this._renderEdgeList();
          this._updateSvgSelection();
        });

        // Hover → preview highlight on SVG
        row.addEventListener('mouseenter', () => {
          this._hoveredEdgeIndex = idx;
          this._updateSvgSelection();
        });
        row.addEventListener('mouseleave', () => {
          this._hoveredEdgeIndex = -1;
          this._updateSvgSelection();
        });

        this._edgeList.appendChild(row);
      });
    }

    // ═══════ SVG Interaction ═══════

    _attachSvgHandlers() {
      const svg = this._svgArea.querySelector('svg');
      if (!svg) return;

      svg.style.cursor = 'default';

      // Node click/dblclick
      const nodeEls = svg.querySelectorAll('.node');
      nodeEls.forEach((nodeEl) => {
        const nodeId = this._extractNodeId(nodeEl);
        if (!nodeId) return;

        nodeEl.style.cursor = 'pointer';

        // Hover effect
        nodeEl.addEventListener('mouseenter', () => {
          if (this.mode === MODE.CONNECTING || this.mode === MODE.GROUPING) {
            nodeEl.style.filter = 'brightness(1.3) drop-shadow(0 0 6px #00aaff)';
          } else {
            nodeEl.style.filter = 'brightness(1.15)';
          }
        });
        nodeEl.addEventListener('mouseleave', () => {
          if (this.mode === MODE.GROUPING && this._groupingNodes && this._groupingNodes.has(nodeId)) {
            nodeEl.style.filter = 'drop-shadow(0 0 6px #22cc88)';
          } else if (this.selectedNodeId !== nodeId) {
            nodeEl.style.filter = '';
          } else {
            nodeEl.style.filter = 'drop-shadow(0 0 4px #007fd4)';
          }
        });

        // Single click
        nodeEl.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this.mode === MODE.CONNECTING) {
            this._handleConnectClick(nodeId, e);
          } else if (this.mode === MODE.GROUPING) {
            this._handleGroupingClick(nodeId);
          } else {
            this._selectNode(nodeId);
          }
        });

        // Double click = edit text
        nodeEl.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          if (this.mode !== MODE.CONNECTING && this.mode !== MODE.GROUPING) {
            this._showInlineEditor(nodeId, nodeEl);
          }
        });

        // Right-click → context menu
        nodeEl.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!window.DiagramCommon) return;
          this._selectNode(nodeId);
          window.DiagramCommon.showContextMenu(e.clientX, e.clientY, [
            { label: '✎ ラベルを編集', onClick: () => this._showInlineEditor(nodeId, nodeEl) },
            { label: '🎨 色を変更', onClick: () => this._showColorPicker(nodeId) },
            { label: '🔗 ここから接続', onClick: () => {
              if (typeof this._toggleConnectMode === 'function') {
                this.mode = MODE.IDLE;
                this._toggleConnectMode();
                if (typeof this._handleConnectClick === 'function') this._handleConnectClick(nodeId, e);
              }
            }},
            'separator',
            { label: '🗑 ノードを削除', danger: true, onClick: () => {
              this.selectedNodeId = nodeId;
              this._deleteSelected();
            }},
          ]);
        });

        // Apply selection style if selected
        if (this.selectedNodeId === nodeId) {
          nodeEl.style.filter = 'drop-shadow(0 0 4px #007fd4)';
        }
      });

      // Edge paths — tag with data-edge-idx for highlight (no click handlers)
      const edgeGroups = svg.querySelectorAll('.edgePath');
      const pathUsed = new Set();
      let idMatchCount = 0;
      edgeGroups.forEach((group) => {
        const modelIdx = this._matchEdgeIdToModel(group.id || '', pathUsed);
        if (modelIdx < 0) return;
        pathUsed.add(modelIdx);
        group.setAttribute('data-edge-idx', String(modelIdx));
        idMatchCount++;
      });
      // Fallback: if ID matching failed, use DOM order
      if (idMatchCount === 0 && edgeGroups.length > 0) {
        edgeGroups.forEach((group, i) => {
          if (i < this.model.edges.length) {
            group.setAttribute('data-edge-idx', String(i));
          }
        });
      }
      // Also tag edge labels
      const edgeLabels = svg.querySelectorAll('.edgeLabel');
      const labelUsed = new Set();
      let labelMatchCount = 0;
      edgeLabels.forEach((lbl) => {
        const modelIdx = this._matchEdgeIdToModel(lbl.id || '', labelUsed);
        if (modelIdx < 0) return;
        labelUsed.add(modelIdx);
        lbl.setAttribute('data-edge-idx', String(modelIdx));
        labelMatchCount++;
      });
      // Fallback: DOM order
      if (labelMatchCount === 0 && edgeLabels.length > 0) {
        edgeLabels.forEach((lbl, i) => {
          if (i < this.model.edges.length) {
            lbl.setAttribute('data-edge-idx', String(i));
          }
        });
      }

      // Subgraph (cluster) click/dblclick
      const clusters = svg.querySelectorAll('.cluster');
      clusters.forEach((clusterEl) => {
        // Extract subgraph id from cluster element id
        const clusterId = clusterEl.id || '';
        const sg = this.model.subgraphs.find(s => clusterId.includes(s.id));
        if (!sg) return;

        clusterEl.style.cursor = 'pointer';

        clusterEl.addEventListener('mouseenter', () => {
          clusterEl.style.filter = 'brightness(1.1) drop-shadow(0 0 4px #22cc88)';
        });
        clusterEl.addEventListener('mouseleave', () => {
          clusterEl.style.filter = '';
        });

        clusterEl.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          this._editSubgraph(sg.id);
        });
      });

      // Click on empty area to deselect
      svg.addEventListener('click', () => {
        this._deselect();
      });

      // Right-click on edges → context menu (delegated, since edges may have varying class)
      svg.addEventListener('contextmenu', (e) => {
        const target = e.target;
        const edgeGroup = target && target.closest && target.closest('[data-edge-idx]');
        if (!edgeGroup || !window.DiagramCommon) return;
        e.preventDefault();
        e.stopPropagation();
        const idx = parseInt(edgeGroup.getAttribute('data-edge-idx'), 10);
        if (isNaN(idx) || idx < 0 || idx >= this.model.edges.length) return;
        const edge = this.model.edges[idx];
        const edgeTypeKeys = Object.keys(EDGE_TYPES);
        const cycleType = () => {
          const cur = edgeTypeKeys.indexOf(edge.type || 'arrow');
          const next = edgeTypeKeys[(cur + 1) % edgeTypeKeys.length];
          this.model.updateEdgeType(idx, next);
          this._commitChange();
        };
        window.DiagramCommon.showContextMenu(e.clientX, e.clientY, [
          { label: '✎ 接続を編集', onClick: () => this._editEdgeLabel(idx, { clientX: e.clientX, clientY: e.clientY }) },
          { label: '↻ 線種を切替: ' + EDGE_TYPES[edge.type || 'arrow'].label, onClick: cycleType },
          'separator',
          { label: '🗑 接続を削除', danger: true, onClick: () => this._removeEdge(idx) },
        ]);
      });
    }

    // Map SVG edge element id to model edge index
    // Mermaid generates ids like "L-{from}-{to}-{n}" or "L_{from}_{to}_{n}"
    // Also handles variations across Mermaid versions
    _matchEdgeIdToModel(svgId, usedSet) {
      if (!svgId) return -1;
      // Strict match first: L-{from}-{to} or L_{from}_{to} prefix
      for (let ei = 0; ei < this.model.edges.length; ei++) {
        if (usedSet.has(ei)) continue;
        const e = this.model.edges[ei];
        const p1 = 'L-' + e.from + '-' + e.to;
        const p2 = 'L_' + e.from + '_' + e.to;
        if (svgId === p1 || svgId.startsWith(p1 + '-') || svgId.startsWith(p1 + '_') ||
            svgId === p2 || svgId.startsWith(p2 + '-') || svgId.startsWith(p2 + '_')) {
          return ei;
        }
      }
      // Fallback: check if svgId contains both from and to node IDs as separate segments
      const parts = svgId.split(/[-_]/);
      for (let ei = 0; ei < this.model.edges.length; ei++) {
        if (usedSet.has(ei)) continue;
        const e = this.model.edges[ei];
        const fromIdx = parts.indexOf(e.from);
        const toIdx = parts.indexOf(e.to);
        if (fromIdx >= 0 && toIdx >= 0 && fromIdx < toIdx) {
          return ei;
        }
      }
      return -1;
    }

    _extractNodeId(svgElement) {
      const id = svgElement.id || '';
      // Mermaid 10.x: "flowchart-{nodeId}-{n}"
      const m = id.match(/flowchart-(.+?)-\d+$/);
      if (m) return m[1];
      // Fallback: try other patterns
      const m2 = id.match(/^(.+?)-\d+$/);
      if (m2 && this.model.nodes.has(m2[1])) return m2[1];
      return null;
    }

    _updateSvgSelection() {
      const svg = this._svgArea.querySelector('svg');
      if (!svg) return;

      // Reset all node styles
      svg.querySelectorAll('.node').forEach((nodeEl) => {
        const nid = this._extractNodeId(nodeEl);
        if (nid === this.selectedNodeId) {
          nodeEl.style.filter = 'drop-shadow(0 0 4px #007fd4)';
        } else {
          nodeEl.style.filter = '';
        }
      });

      // Highlight selected / hovered edge via data-edge-idx
      svg.querySelectorAll('.edgePath').forEach((group) => {
        const mi = parseInt(group.getAttribute('data-edge-idx'), 10);
        if (isNaN(mi)) { group.style.filter = ''; group.style.opacity = ''; return; }
        if (mi === this.selectedEdgeIndex) {
          group.style.filter = 'drop-shadow(0 0 4px #ff6600) brightness(1.3)';
          group.style.opacity = '1';
        } else if (mi === this._hoveredEdgeIndex) {
          group.style.filter = 'drop-shadow(0 0 3px #ff9900) brightness(1.2)';
          group.style.opacity = '1';
        } else {
          group.style.filter = '';
          group.style.opacity = '';
        }
      });
      svg.querySelectorAll('.edgeLabel').forEach((lbl) => {
        const mi = parseInt(lbl.getAttribute('data-edge-idx'), 10);
        if (isNaN(mi)) return;
        if (mi === this.selectedEdgeIndex) {
          lbl.style.filter = 'drop-shadow(0 0 3px #ff6600)';
          lbl.style.fontWeight = 'bold';
        } else if (mi === this._hoveredEdgeIndex) {
          lbl.style.filter = 'drop-shadow(0 0 2px #ff9900)';
          lbl.style.fontWeight = '';
        } else {
          lbl.style.filter = '';
          lbl.style.fontWeight = '';
        }
      });
    }

    // ═══════ Node Operations ═══════

    _addNode(shape) {
      this._dismissInlineEditor(true);
      const id = this.model.addNode(shape);
      this._commitChange();
      // Auto-select new node
      this.selectedNodeId = id;
      this.selectedEdgeIndex = -1;
      this._setStatus('ノード「' + this.model.nodes.get(id).label + '」を追加しました。ダブルクリックでテキスト編集。');
    }

    _selectNode(nodeId) {
      this._dismissInlineEditor(true);
      if (this.selectedNodeId === nodeId) {
        this._deselect();
        return;
      }
      this.selectedNodeId = nodeId;
      this.selectedEdgeIndex = -1;
      this._updateSvgSelection();
      this._renderEdgeList();

      const node = this.model.nodes.get(nodeId);
      const shapeLabel = SHAPES[node.shape] ? SHAPES[node.shape].label : node.shape;
      this._setStatus('選択中: 「' + node.label + '」(' + shapeLabel + ') — ダブルクリックでテキスト編集、Deleteで削除');
    }

    _deselect() {
      this._dismissInlineEditor(true);
      this.selectedNodeId = null;
      this.selectedEdgeIndex = -1;
      this._updateSvgSelection();
      this._renderEdgeList();
      if (this.mode === MODE.NORMAL) {
        this._setStatus('ヒント: ノードをクリックで選択。ダブルクリックでテキスト編集。');
      }
    }

    _deleteSelected() {
      if (this.selectedNodeId) {
        const label = this.model.nodes.get(this.selectedNodeId)?.label || this.selectedNodeId;
        this.model.removeNode(this.selectedNodeId);
        this.selectedNodeId = null;
        this._commitChange();
        this._setStatus('ノード「' + label + '」を削除しました。');
      } else if (this.selectedEdgeIndex >= 0) {
        const desc = this._edgeDescription(this.selectedEdgeIndex);
        this.model.removeEdge(this.selectedEdgeIndex);
        this.selectedEdgeIndex = -1;
        this._commitChange();
        this._setStatus('接続 ' + desc + ' を削除しました。');
      }
    }

    // ═══════ Inline Text Editor ═══════

    _showInlineEditor(nodeId, svgNodeEl) {
      this._dismissInlineEditor(true);
      this._selectNode(nodeId);

      const node = this.model.nodes.get(nodeId);
      if (!node) return;

      const svgRect = svgNodeEl.getBoundingClientRect();
      const areaRect = this._svgArea.getBoundingClientRect();

      const editorWrap = el('div', 'mve-inline-wrap');
      editorWrap.style.position = 'absolute';
      editorWrap.style.left = (svgRect.left - areaRect.left + svgRect.width / 2) + 'px';
      editorWrap.style.top = (svgRect.top - areaRect.top + svgRect.height / 2) + 'px';
      editorWrap.style.transform = 'translate(-50%, -50%)';

      const input = el('input', 'mve-inline-input');
      input.type = 'text';
      input.value = node.label;
      input.style.minWidth = Math.max(svgRect.width + 20, 120) + 'px';
      editorWrap.appendChild(input);

      // Shape selector below input
      const shapeBar = el('div', 'mve-inline-shapes');
      for (const [key, shape] of Object.entries(SHAPES)) {
        const btn = el('button', 'mve-inline-shape-btn' + (key === node.shape ? ' mve-active' : ''));
        btn.innerHTML = '<span class="mve-shape-icon mve-si-' + key + '"></span>';
        btn.title = shape.label;
        btn.addEventListener('mousedown', (e) => {
          e.preventDefault();
          this.model.updateNodeShape(nodeId, key);
          shapeBar.querySelectorAll('.mve-inline-shape-btn').forEach(b => b.classList.remove('mve-active'));
          btn.classList.add('mve-active');
        });
        shapeBar.appendChild(btn);
      }
      editorWrap.appendChild(shapeBar);

      // Color button below shapes
      const colorBtn = el('button', 'mve-inline-color-btn');
      colorBtn.textContent = '🎨 色変更';
      colorBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this._dismissInlineEditor(true);
        this._showColorPicker(nodeId);
      });
      editorWrap.appendChild(colorBtn);

      this._svgArea.style.position = 'relative';
      this._svgArea.appendChild(editorWrap);
      this._inlineEditor = { el: editorWrap, input, nodeId };

      input.focus();
      input.select();

      const commit = () => {
        if (!this._inlineEditor || this._inlineEditor.nodeId !== nodeId) return;
        const val = input.value.trim();
        if (val && val !== node.label) {
          this.model.updateNodeLabel(nodeId, val);
        }
        this._dismissInlineEditor(false);
        this._commitChange();
      };

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { e.preventDefault(); this._dismissInlineEditor(false); this._debouncedRender(); }
      });

      input.addEventListener('blur', () => {
        setTimeout(commit, 150);
      });

      this._setStatus('テキストを編集中 — Enter: 確定 / Escape: キャンセル');
    }

    _dismissInlineEditor(skipCommit) {
      if (!this._inlineEditor) return;
      const editor = this._inlineEditor;
      this._inlineEditor = null;
      if (!skipCommit) {
        const val = editor.input.value.trim();
        const node = this.model.nodes.get(editor.nodeId);
        if (node && val && val !== node.label) {
          this.model.updateNodeLabel(editor.nodeId, val);
        }
      }
      editor.el.remove();
    }

    // ═══════ Edge Operations ═══════

    _toggleConnectMode() {
      if (this.mode === MODE.CONNECTING) {
        this.mode = MODE.NORMAL;
        this.connectFrom = null;
        this._connectBtn.classList.remove('mve-active');
        this._setStatus('接続モードを終了しました。');
        this._debouncedRender();
      } else {
        this._dismissInlineEditor(true);
        this.mode = MODE.CONNECTING;
        this.connectFrom = null;
        this._connectBtn.classList.add('mve-active');
        this._setStatus('🔗 接続モード: 接続元のノードをクリックしてください');
        this._debouncedRender();
      }
    }

    _handleConnectClick(nodeId, event) {
      if (!this.connectFrom) {
        this.connectFrom = nodeId;
        this._setStatus('🔗 接続元: 「' + (this.model.nodes.get(nodeId)?.label || nodeId) +
          '」 → 接続先のノードをクリックしてください');
        this._highlightNode(nodeId, '#00cc66');
      } else {
        if (this.connectFrom === nodeId) {
          this._setStatus('⚠ 同じノードへの接続はスキップされました。別のノードを選択してください。');
          return;
        }

        // Ask for optional label
        const fromLabel = this.model.nodes.get(this.connectFrom)?.label || this.connectFrom;
        const toLabel = this.model.nodes.get(nodeId)?.label || nodeId;
        this._showEdgeLabelPrompt(this.connectFrom, nodeId, fromLabel, toLabel, event);
      }
    }

    _showEdgeLabelPrompt(fromId, toId, fromLabel, toLabel, event) {
      // Position near the click (target node) with viewport-fixed positioning
      // so the prompt is always visible near the mouse, never lost off-screen.
      const wrap = el('div', 'mve-edge-prompt');
      wrap.style.position = 'fixed';
      wrap.style.zIndex = '9999';
      // Initial offscreen position; will be repositioned after measurement
      wrap.style.left = '-9999px';
      wrap.style.top = '-9999px';
      wrap.style.transform = 'none';

      wrap.innerHTML =
        '<div class="mve-edge-prompt-title">' + _escHtml(fromLabel) + ' → ' + _escHtml(toLabel) + '</div>' +
        '<input type="text" class="mve-edge-prompt-input" placeholder="ラベル（空欄可）">' +
        '<div class="mve-edge-prompt-actions">' +
        '  <button class="mve-tool-btn mve-ep-ok">追加</button>' +
        '  <button class="mve-tool-btn mve-ep-cancel">キャンセル</button>' +
        '</div>';

      // Append to body so position:fixed works regardless of ancestor transforms
      document.body.appendChild(wrap);
      const input = wrap.querySelector('input');
      const okBtn = wrap.querySelector('.mve-ep-ok');
      const cancelBtn = wrap.querySelector('.mve-ep-cancel');

      // Reposition near the mouse, clamped to viewport
      try {
        const r = wrap.getBoundingClientRect();
        const margin = 8;
        let cx = (event && typeof event.clientX === 'number') ? event.clientX : window.innerWidth / 2;
        let cy = (event && typeof event.clientY === 'number') ? event.clientY : window.innerHeight / 2;
        // Place slightly below+right of cursor
        let x = cx + 12;
        let y = cy + 12;
        if (x + r.width + margin > window.innerWidth) x = Math.max(margin, cx - r.width - 12);
        if (y + r.height + margin > window.innerHeight) y = Math.max(margin, cy - r.height - 12);
        if (x < margin) x = margin;
        if (y < margin) y = margin;
        wrap.style.left = x + 'px';
        wrap.style.top = y + 'px';
      } catch (_e) { /* fallback */ }

      input.focus();

      const commit = () => {
        const label = input.value.trim();
        this.model.addEdge(fromId, toId, this.currentEdgeType, label);
        wrap.remove();
        this.connectFrom = null;
        this._commitChange();
        this._setStatus('🔗 接続を追加しました。続けて接続するか、「🔗 接続」ボタンで終了。');
      };

      const cancel = () => {
        wrap.remove();
        this.connectFrom = null;
        this._setStatus('🔗 接続モード: 接続元のノードをクリックしてください');
      };

      okBtn.addEventListener('click', commit);
      cancelBtn.addEventListener('click', cancel);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      });
    }

    _editEdgeLabel(index, event) {
      const edge = this.model.edges[index];
      if (!edge) return;

      // Show inline label editor
      const existing = this._svgArea.querySelector('.mve-edge-label-edit');
      if (existing) existing.remove();

      const dialog = el('div', 'mve-edge-label-edit mve-edge-prompt');
      dialog.innerHTML = '<div class="mve-edge-prompt-title">接続編集</div>';

      // Edge type selector
      const typeRow = el('div', 'mve-edge-prompt-row');
      const typeLabel = el('span', 'mve-edge-prompt-label');
      typeLabel.textContent = '線の種類: ';
      typeRow.appendChild(typeLabel);
      const typeSelect = el('select', 'mve-edge-prompt-input');
      for (const [key, et] of Object.entries(EDGE_TYPES)) {
        const opt = document.createElement('option');
        opt.value = key; opt.textContent = et.label;
        if (key === (edge.type || 'arrow')) opt.selected = true;
        typeSelect.appendChild(opt);
      }
      typeRow.appendChild(typeSelect);
      dialog.appendChild(typeRow);

      // Label input
      const labelRow = el('div', 'mve-edge-prompt-row');
      const labelLabel = el('span', 'mve-edge-prompt-label');
      labelLabel.textContent = 'ラベル: ';
      labelRow.appendChild(labelLabel);
      const input = el('input', 'mve-edge-prompt-input');
      input.type = 'text';
      input.value = edge.label || '';
      input.placeholder = '空欄でラベル削除';
      labelRow.appendChild(input);
      dialog.appendChild(labelRow);

      // Direction: from / to selectors
      const nodeEntries = [...this.model.nodes.entries()];
      const fromRow = el('div', 'mve-edge-prompt-row');
      const fromLabel = el('span', 'mve-edge-prompt-label');
      fromLabel.textContent = '接続元: ';
      fromRow.appendChild(fromLabel);
      const fromSelect = el('select', 'mve-edge-prompt-input');
      for (const [id, n] of nodeEntries) {
        const opt = document.createElement('option');
        opt.value = id; opt.textContent = n.label || id;
        if (id === edge.from) opt.selected = true;
        fromSelect.appendChild(opt);
      }
      fromRow.appendChild(fromSelect);
      dialog.appendChild(fromRow);

      const toRow = el('div', 'mve-edge-prompt-row');
      const toLabel = el('span', 'mve-edge-prompt-label');
      toLabel.textContent = '接続先: ';
      toRow.appendChild(toLabel);
      const toSelect = el('select', 'mve-edge-prompt-input');
      for (const [id, n] of nodeEntries) {
        const opt = document.createElement('option');
        opt.value = id; opt.textContent = n.label || id;
        if (id === edge.to) opt.selected = true;
        toSelect.appendChild(opt);
      }
      toRow.appendChild(toSelect);
      const swapBtn = el('button', 'mve-tool-btn mve-edge-swap-btn');
      swapBtn.textContent = '⇄ 反転';
      swapBtn.title = '接続の向きを反転';
      swapBtn.addEventListener('click', () => {
        const tmpVal = fromSelect.value;
        fromSelect.value = toSelect.value;
        toSelect.value = tmpVal;
      });
      toRow.appendChild(swapBtn);
      dialog.appendChild(toRow);

      const actions = el('div', 'mve-edge-prompt-actions');
      const okBtn = el('button', 'mve-tool-btn mve-ep-ok');
      okBtn.textContent = 'OK';
      const delBtn = el('button', 'mve-tool-btn mve-edge-del-btn');
      delBtn.textContent = '🗑 削除';
      delBtn.title = 'この接続を削除';
      const cancelBtn = el('button', 'mve-tool-btn');
      cancelBtn.textContent = 'キャンセル';

      const commit = () => {
        edge.from = fromSelect.value;
        edge.to = toSelect.value;
        this.model.updateEdgeLabel(index, input.value);
        this.model.updateEdgeType(index, typeSelect.value);
        dialog.remove();
        this._commitChange();
      };
      const cancel = () => { dialog.remove(); };
      const deleteEdge = () => {
        dialog.remove();
        this._removeEdge(index);
      };

      okBtn.addEventListener('click', commit);
      delBtn.addEventListener('click', deleteEdge);
      cancelBtn.addEventListener('click', cancel);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      });

      actions.appendChild(okBtn);
      actions.appendChild(delBtn);
      actions.appendChild(cancelBtn);
      dialog.appendChild(actions);

      this._svgArea.appendChild(dialog);
      dialog.style.position = 'fixed';
      dialog.style.zIndex = '9999';
      // Move to body so position:fixed isn't constrained by ancestor transforms
      document.body.appendChild(dialog);
      // Position near click if event is available, else center on viewport
      try {
        const dw = dialog.offsetWidth || 260;
        const dh = dialog.offsetHeight || 220;
        const margin = 8;
        const cx = (event && typeof event.clientX === 'number') ? event.clientX : window.innerWidth / 2;
        const cy = (event && typeof event.clientY === 'number') ? event.clientY : window.innerHeight / 2;
        let x = cx - dw / 2;
        let y = cy - dh / 2;
        if (x + dw > window.innerWidth - margin) x = window.innerWidth - dw - margin;
        if (y + dh > window.innerHeight - margin) y = window.innerHeight - dh - margin;
        if (x < margin) x = margin;
        if (y < margin) y = margin;
        dialog.style.left = x + 'px';
        dialog.style.top = y + 'px';
        dialog.style.transform = 'none';
      } catch (_e) { /* fallback to default */ }
      input.focus();
      input.select();
    }

    _removeEdge(index) {
      const desc = this._edgeDescription(index);
      this.model.removeEdge(index);
      this.selectedEdgeIndex = -1;
      this._commitChange();
      this._setStatus('接続 ' + desc + ' を削除しました。');
    }

    _edgeDescription(index) {
      const e = this.model.edges[index];
      if (!e) return '';
      const f = this.model.nodes.get(e.from)?.label || e.from;
      const t = this.model.nodes.get(e.to)?.label || e.to;
      return f + ' → ' + t + (e.label ? ' 「' + e.label + '」' : '');
    }

    _highlightNode(nodeId, color) {
      const svg = this._svgArea.querySelector('svg');
      if (!svg) return;
      svg.querySelectorAll('.node').forEach((nodeEl) => {
        if (this._extractNodeId(nodeEl) === nodeId) {
          nodeEl.style.filter = 'drop-shadow(0 0 6px ' + color + ')';
        }
      });
    }

    // ═══════ Color Operations ═══════

    _showColorPicker(nodeId) {
      const existing = this.container.querySelector('.mve-color-popup');
      if (existing) existing.remove();

      const node = this.model.nodes.get(nodeId);
      if (!node) return;

      const style = this.model.getNodeStyle(nodeId);

      const popup = el('div', 'mve-color-popup');
      popup.innerHTML = '<div class="mve-color-popup-title">🎨 ' + _escHtml(node.label) + ' のスタイル</div>';

      // Node color (fill) section
      const fillSection = el('div', 'mve-color-section');
      fillSection.appendChild(elText('span', '背景色:', 'mve-color-label'));
      const fillRow = el('div', 'mve-color-row');
      for (const preset of NODE_COLORS) {
        const swatch = el('button', 'mve-color-swatch' + (style.fill === preset.fill ? ' mve-active' : ''));
        if (preset.fill) {
          swatch.style.backgroundColor = preset.fill;
        } else {
          swatch.classList.add('mve-swatch-default');
        }
        swatch.title = preset.label;
        swatch.addEventListener('click', () => {
          this.model.setNodeStyle(nodeId, preset.fill, preset.stroke || style.stroke, style.color);
          this._commitChange();
          this._showColorPicker(nodeId); // re-render picker
        });
        fillRow.appendChild(swatch);
      }
      // Custom color input
      const customFill = el('input', 'mve-color-custom');
      customFill.type = 'color';
      customFill.value = style.fill || '#4a90d9';
      customFill.title = 'カスタム色を選択';
      customFill.addEventListener('change', () => {
        const hex = customFill.value;
        this.model.setNodeStyle(nodeId, hex, _darkenColor(hex), style.color);
        this._commitChange();
        this._showColorPicker(nodeId);
      });
      fillRow.appendChild(customFill);
      fillSection.appendChild(fillRow);
      popup.appendChild(fillSection);

      // Text color section
      const colorSection = el('div', 'mve-color-section');
      colorSection.appendChild(elText('span', '文字色:', 'mve-color-label'));
      const colorRow = el('div', 'mve-color-row');
      for (const preset of TEXT_COLORS) {
        const swatch = el('button', 'mve-color-swatch' + (style.color === preset.color ? ' mve-active' : ''));
        if (preset.color) {
          swatch.style.backgroundColor = preset.color;
        } else {
          swatch.classList.add('mve-swatch-default');
        }
        swatch.title = preset.label;
        swatch.addEventListener('click', () => {
          this.model.setNodeStyle(nodeId, style.fill, style.stroke, preset.color);
          this._commitChange();
          this._showColorPicker(nodeId);
        });
        colorRow.appendChild(swatch);
      }
      const customColor = el('input', 'mve-color-custom');
      customColor.type = 'color';
      customColor.value = style.color || '#ffffff';
      customColor.title = 'カスタム文字色を選択';
      customColor.addEventListener('change', () => {
        this.model.setNodeStyle(nodeId, style.fill, style.stroke, customColor.value);
        this._commitChange();
        this._showColorPicker(nodeId);
      });
      colorRow.appendChild(customColor);
      colorSection.appendChild(colorRow);
      popup.appendChild(colorSection);

      // Close button
      const closeBtn = el('button', 'mve-tool-btn mve-color-close');
      closeBtn.textContent = '閉じる';
      closeBtn.addEventListener('click', () => popup.remove());
      popup.appendChild(closeBtn);

      this._svgArea.appendChild(popup);
    }

    // ═══════ Subgraph (Grouping) Operations ═══════

    _startGrouping() {
      const nodeCount = this.model.nodes.size;
      if (nodeCount < 2) {
        this._setStatus('⚠ グループ化するには2つ以上のノードが必要です。');
        return;
      }

      // Enter grouping mode
      this._dismissInlineEditor(true);
      this.mode = MODE.GROUPING;
      this._groupingNodes = new Set();
      if (this.selectedNodeId) {
        this._groupingNodes.add(this.selectedNodeId);
      }

      // Show floating grouping panel
      const existing = this.container.querySelector('.mve-group-dialog');
      if (existing) existing.remove();

      const dialog = el('div', 'mve-group-dialog');
      dialog.innerHTML = '<div class="mve-group-dialog-title">📦 ノードをクリックして選択</div>';

      const labelWrap = el('div', 'mve-group-label-wrap');
      labelWrap.appendChild(elText('span', 'グループ名:', 'mve-color-label'));
      const labelInput = el('input', 'mve-group-label-input');
      labelInput.type = 'text';
      labelInput.value = 'グループ';
      labelInput.placeholder = 'グループ名を入力';
      labelWrap.appendChild(labelInput);
      dialog.appendChild(labelWrap);

      const countEl = elText('div', this._groupingNodes.size + ' 個のノードが選択中', 'mve-group-count');
      dialog.appendChild(countEl);
      this._groupingCountEl = countEl;

      const actions = el('div', 'mve-edge-prompt-actions');
      const okBtn = el('button', 'mve-tool-btn mve-ep-ok');
      okBtn.textContent = 'グループ作成';
      okBtn.addEventListener('click', () => {
        if (this._groupingNodes.size < 2) {
          this._setStatus('⚠ 2つ以上のノードを選択してください。');
          return;
        }
        const label = labelInput.value.trim() || 'グループ';
        const selectedIds = Array.from(this._groupingNodes);
        this.model.addSubgraph(label, selectedIds);
        dialog.remove();
        this.mode = MODE.NORMAL;
        this._groupingNodes = null;
        this._groupingCountEl = null;
        this._commitChange();
        this._setStatus('📦 グループ「' + label + '」を作成しました（' + selectedIds.length + ' ノード）。');
      });
      actions.appendChild(okBtn);

      const cancelBtn = el('button', 'mve-tool-btn');
      cancelBtn.textContent = 'キャンセル';
      cancelBtn.addEventListener('click', () => this._cancelGrouping());
      actions.appendChild(cancelBtn);
      dialog.appendChild(actions);

      this._svgArea.appendChild(dialog);
      this._groupingPanel = dialog;
      this._setStatus('📦 グループ化モード: ノードをクリックして選択してください (Escape で中止)');

      // Apply initial highlight
      this._updateGroupingHighlights();
    }

    _handleGroupingClick(nodeId) {
      if (!this._groupingNodes) return;
      if (this._groupingNodes.has(nodeId)) {
        this._groupingNodes.delete(nodeId);
      } else {
        this._groupingNodes.add(nodeId);
      }
      this._updateGroupingHighlights();
      if (this._groupingCountEl) {
        this._groupingCountEl.textContent = this._groupingNodes.size + ' 個のノードが選択中';
      }
    }

    _updateGroupingHighlights() {
      if (!this._groupingNodes) return;
      const nodeEls = this._svgArea.querySelectorAll('.node');
      nodeEls.forEach(nodeEl => {
        const nid = this._extractNodeId(nodeEl);
        if (nid && this._groupingNodes.has(nid)) {
          nodeEl.style.filter = 'drop-shadow(0 0 6px #22cc88)';
        } else {
          nodeEl.style.filter = '';
        }
      });
    }

    _cancelGrouping() {
      this.mode = MODE.NORMAL;
      this._groupingNodes = null;
      this._groupingCountEl = null;
      const dialog = this.container.querySelector('.mve-group-dialog');
      if (dialog) dialog.remove();
      this._groupingPanel = null;
      this._setStatus('グループ化をキャンセルしました。');
      this._debouncedRender();
    }

    _renderSubgraphList() {
      this._subgraphList.innerHTML = '';
      if (this.model.subgraphs.length === 0) return;

      const header = elText('div', '📦 グループ一覧', 'mve-edge-header');
      this._subgraphList.appendChild(header);

      // Header action: combine multiple subgraphs into one parent group
      if (this.model.subgraphs.length >= 2) {
        const groupBtn = el('button', 'mve-tool-btn');
        groupBtn.textContent = '🗂️ 複数グループを 1 つに結合';
        groupBtn.title = '下のチェックを ON にした複数のグループを 1 つの新しい親グループにまとめます';
        groupBtn.style.margin = '4px 0';
        groupBtn.addEventListener('click', () => {
          const checked = Array.from(this._subgraphList.querySelectorAll('input.mve-sg-multi:checked')).map(c => c.value);
          if (checked.length < 2) {
            this._setStatus('2 つ以上のグループにチェックを入れてください。');
            return;
          }
          const label = (window.prompt && window.prompt('新しい親グループ名:', '親グループ')) || '親グループ';
          this.model.groupSubgraphs(label, checked);
          this._commitChange();
          this._setStatus('選択した ' + checked.length + ' グループを「' + label + '」にまとめました。');
        });
        this._subgraphList.appendChild(groupBtn);
      }

      for (const sg of this.model.subgraphs) {
        const row = el('div', 'mve-sg-row');

        // Multi-select checkbox for grouping
        const multi = el('input', 'mve-sg-multi');
        multi.type = 'checkbox';
        multi.value = sg.id;
        multi.title = '結合対象として選択';
        multi.style.marginRight = '4px';
        row.appendChild(multi);

        const desc = el('span', 'mve-edge-desc');
        const nodeNames = sg.nodeIds
          .map(nid => { const n = this.model.nodes.get(nid); return n ? n.label : nid; })
          .join(', ');
        const parentSg = sg.parentSgId ? this.model.subgraphs.find(s => s.id === sg.parentSgId) : null;
        const parentLabel = parentSg ? '  ⊂ ' + parentSg.label : '';
        desc.textContent = sg.label + '  (' + nodeNames + ')' + parentLabel;
        desc.title = desc.textContent;
        row.appendChild(desc);

        // Parent selector (move under another subgraph)
        if (this.model.subgraphs.length >= 2) {
          const parentSel = el('select', 'mve-select');
          parentSel.title = '親グループ';
          parentSel.style.marginLeft = '4px';
          const optNone = document.createElement('option');
          optNone.value = ''; optNone.textContent = '（ルート）';
          parentSel.appendChild(optNone);
          for (const other of this.model.subgraphs) {
            if (other.id === sg.id) continue;
            // exclude descendants of sg to avoid cycles
            let p = other.parentSgId, isDesc = false;
            while (p) {
              if (p === sg.id) { isDesc = true; break; }
              const pp = this.model.subgraphs.find(s => s.id === p);
              p = pp ? pp.parentSgId : null;
            }
            if (isDesc) continue;
            const o = document.createElement('option');
            o.value = other.id; o.textContent = other.label;
            if (sg.parentSgId === other.id) o.selected = true;
            parentSel.appendChild(o);
          }
          parentSel.addEventListener('change', (e) => {
            this.model.setSubgraphParent(sg.id, e.target.value || null);
            this._commitChange();
          });
          row.appendChild(parentSel);
        }

        // Edit label
        const editBtn = el('button', 'mve-edge-btn');
        editBtn.textContent = '✏️';
        editBtn.title = 'グループ名を変更';
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          // Show inline edit for subgraph label
          const existingEdit = this._svgArea.querySelector('.mve-sg-label-edit');
          if (existingEdit) existingEdit.remove();

          const editDialog = el('div', 'mve-sg-label-edit mve-edge-prompt');
          editDialog.innerHTML = '<div class="mve-edge-prompt-title">グループ名変更</div>';
          const editInput = el('input', 'mve-edge-prompt-input');
          editInput.type = 'text';
          editInput.value = sg.label;
          editDialog.appendChild(editInput);

          const editActions = el('div', 'mve-edge-prompt-actions');
          const editOk = el('button', 'mve-tool-btn mve-ep-ok');
          editOk.textContent = 'OK';
          const editCancel = el('button', 'mve-tool-btn');
          editCancel.textContent = 'キャンセル';

          const commitEdit = () => {
            if (editInput.value.trim()) {
              this.model.updateSubgraphLabel(sg.id, editInput.value.trim());
              this._commitChange();
            }
            editDialog.remove();
          };
          const cancelEdit = () => { editDialog.remove(); };

          editOk.addEventListener('click', commitEdit);
          editCancel.addEventListener('click', cancelEdit);
          editInput.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') { ev.preventDefault(); commitEdit(); }
            if (ev.key === 'Escape') { ev.preventDefault(); cancelEdit(); }
          });

          editActions.appendChild(editOk);
          editActions.appendChild(editCancel);
          editDialog.appendChild(editActions);
          this._svgArea.appendChild(editDialog);
          editInput.focus();
          editInput.select();
        });
        row.appendChild(editBtn);

        // Delete subgraph
        const delBtn = el('button', 'mve-edge-btn mve-edge-btn-del');
        delBtn.textContent = '✕';
        delBtn.title = 'グループを解除（ノードは残ります）';
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.model.removeSubgraph(sg.id);
          this._commitChange();
          this._setStatus('グループ「' + sg.label + '」を解除しました。');
        });
        row.appendChild(delBtn);

        this._subgraphList.appendChild(row);
      }
    }

    _editSubgraph(sgId) {
      const sg = this.model.subgraphs.find(s => s.id === sgId);
      if (!sg) return;

      const existing = this._svgArea.querySelector('.mve-sg-edit-dialog');
      if (existing) existing.remove();

      const dialog = el('div', 'mve-sg-edit-dialog mve-edge-prompt');
      dialog.innerHTML = '<div class="mve-edge-prompt-title">📦 グループ編集: ' + _escHtml(sg.label) + '</div>';

      // Name input
      const nameRow = el('div', 'mve-edge-prompt-row');
      const nameLabel = el('span', 'mve-edge-prompt-label');
      nameLabel.textContent = 'グループ名: ';
      nameRow.appendChild(nameLabel);
      const nameInput = el('input', 'mve-edge-prompt-input');
      nameInput.type = 'text'; nameInput.value = sg.label;
      nameRow.appendChild(nameInput);
      dialog.appendChild(nameRow);

      // Node list with checkboxes
      const nodeSection = el('div', 'mve-sg-node-section');
      nodeSection.appendChild(elText('div', 'ノード割り当て:', 'mve-edge-prompt-label'));
      const nodeList = el('div', 'mve-sg-node-list');

      const checkboxes = [];
      for (const [nodeId, node] of this.model.nodes) {
        const row = el('label', 'mve-sg-node-check');
        const cb = el('input', '');
        cb.type = 'checkbox';
        cb.value = nodeId;
        cb.checked = sg.nodeIds.includes(nodeId);
        // Check if node is in another subgraph
        const otherSg = this.model.subgraphs.find(s => s.id !== sgId && s.nodeIds.includes(nodeId));
        row.appendChild(cb);
        const text = el('span', '');
        text.textContent = node.label + ' (' + nodeId + ')' + (otherSg ? ' [' + otherSg.label + ']' : '');
        row.appendChild(text);
        if (otherSg) {
          row.title = '現在「' + otherSg.label + '」に所属（チェックするとこのグループに移動）';
          row.style.opacity = '0.7';
        }
        nodeList.appendChild(row);
        checkboxes.push(cb);
      }
      nodeSection.appendChild(nodeList);
      dialog.appendChild(nodeSection);

      // Actions
      const actions = el('div', 'mve-edge-prompt-actions');
      const okBtn = el('button', 'mve-tool-btn mve-ep-ok');
      okBtn.textContent = 'OK';
      const delBtn = el('button', 'mve-tool-btn mve-edge-del-btn');
      delBtn.textContent = '🗑 グループ解除';
      const cancelBtn = el('button', 'mve-tool-btn');
      cancelBtn.textContent = 'キャンセル';

      const commit = () => {
        const newName = nameInput.value.trim();
        if (newName) this.model.updateSubgraphLabel(sgId, newName);

        // Update node assignments
        const newNodeIds = checkboxes.filter(cb => cb.checked).map(cb => cb.value);
        // Remove nodes that were unchecked
        sg.nodeIds = [];
        for (const nid of newNodeIds) {
          // Remove from other subgraphs
          for (const other of this.model.subgraphs) {
            if (other.id !== sgId) {
              other.nodeIds = other.nodeIds.filter(id => id !== nid);
            }
          }
          sg.nodeIds.push(nid);
        }
        // Clean up empty subgraphs
        this.model.subgraphs = this.model.subgraphs.filter(s => s.nodeIds.length > 0);
        dialog.remove();
        this._commitChange();
      };
      const deleteSg = () => {
        this.model.removeSubgraph(sgId);
        dialog.remove();
        this._commitChange();
        this._setStatus('グループ「' + sg.label + '」を解除しました。');
      };
      const cancel = () => { dialog.remove(); };

      okBtn.addEventListener('click', commit);
      delBtn.addEventListener('click', deleteSg);
      cancelBtn.addEventListener('click', cancel);
      nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      });

      actions.appendChild(okBtn);
      actions.appendChild(delBtn);
      actions.appendChild(cancelBtn);
      dialog.appendChild(actions);

      this._svgArea.appendChild(dialog);
      nameInput.focus(); nameInput.select();
    }

    // ═══════ Undo/Redo ═══════

    _snapshot() {
      return {
        nodes: Array.from(this.model.nodes.entries()),
        edges: [...this.model.edges],
        direction: this.model.direction,
        layout: this.model.layout,
        styles: Array.from(this.model.styles.entries()),
        subgraphs: this.model.subgraphs.map(sg => ({ ...sg, nodeIds: [...sg.nodeIds] })),
      };
    }

    _restoreSnapshot(snap) {
      this.model.nodes = new Map(snap.nodes);
      this.model.edges = snap.edges.map(e => ({ ...e }));
      this.model.direction = snap.direction;
      this.model.layout = snap.layout || 'dagre';
      this.model.styles = new Map(snap.styles || []);
      this.model.subgraphs = (snap.subgraphs || []).map(sg => ({ ...sg, nodeIds: [...sg.nodeIds] }));
    }

    _commitChange() {
      this.undo.push(this._snapshot());
      this._debouncedRender();
    }

    _doUndo() {
      const snap = this.undo.undo();
      if (!snap) return;
      this._restoreSnapshot(snap);
      this._deselect();
      this._debouncedRender();
      this._setStatus('元に戻しました。');
    }

    _doRedo() {
      const snap = this.undo.redo();
      if (!snap) return;
      this._restoreSnapshot(snap);
      this._deselect();
      this._debouncedRender();
      this._setStatus('やり直しました。');
    }

    // ═══════ Code Editor Toggle ═══════

    _toggleCode() {
      this._codeVisible = !this._codeVisible;
      if (this._codeVisible) {
        this._codePanel.classList.remove('mve-hidden');
        this._codeTextarea.value = this.model.generate();
        this._codeToggleBtn.classList.add('mve-active');
      } else {
        this._codePanel.classList.add('mve-hidden');
        this._codeToggleBtn.classList.remove('mve-active');
      }
    }

    _applyCodeEdit() {
      const code = this._codeTextarea.value;
      this.model.parse(code);
      this._commitChange();
      this._setStatus('コードの変更を適用しました。');
    }

    // ═══════ Keyboard ═══════

    _onKeyDown(e) {
      // Only handle if our container is visible / focused
      if (!this.container.offsetParent) return;

      if (e.key === 'Escape') {
        if (this.mode === MODE.CONNECTING) {
          this._toggleConnectMode();
        } else if (this.mode === MODE.GROUPING) {
          this._cancelGrouping();
        } else {
          this._deselect();
        }
        return;
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && !this._inlineEditor && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        this._deleteSelected();
        return;
      }

      if (e.key === 'z' && e.ctrlKey && !e.shiftKey) {
        e.preventDefault();
        this._doUndo();
        return;
      }

      if ((e.key === 'y' && e.ctrlKey) || (e.key === 'z' && e.ctrlKey && e.shiftKey)) {
        e.preventDefault();
        this._doRedo();
        return;
      }
    }

    // ═══════ Zoom ═══════

    _applyZoom() {
      const svg = this._svgArea.querySelector('svg');
      if (!svg) return;
      if (this._zoomLevel === 1.0) {
        svg.style.transform = '';
        svg.style.maxWidth = '100%';
      } else {
        svg.style.maxWidth = 'none';
        svg.style.transform = 'scale(' + this._zoomLevel + ')';
      }
      svg.style.transformOrigin = 'top center';
      if (this._zoomLabel) {
        this._zoomLabel.textContent = Math.round(this._zoomLevel * 100) + '%';
      }
    }

    _zoomIn() {
      this._zoomLevel = Math.min(this._zoomMax, this._zoomLevel + this._zoomStep);
      this._applyZoom();
    }

    _zoomOut() {
      this._zoomLevel = Math.max(this._zoomMin, this._zoomLevel - this._zoomStep);
      this._applyZoom();
    }

    _zoomFit() {
      const svg = this._svgArea.querySelector('svg');
      if (!svg) { this._zoomLevel = 1.0; this._applyZoom(); return; }

      // Temporarily reset transform to measure natural size
      svg.style.transform = 'none';
      const svgRect = svg.getBoundingClientRect();
      const areaRect = this._svgArea.getBoundingClientRect();

      const padH = 32; // horizontal padding
      const padV = 32; // vertical padding
      const availW = areaRect.width - padH;
      const availH = areaRect.height - padV;

      if (svgRect.width <= 0 || svgRect.height <= 0) {
        this._zoomLevel = 1.0;
      } else {
        const scaleW = availW / svgRect.width;
        const scaleH = availH / svgRect.height;
        this._zoomLevel = Math.max(this._zoomMin, Math.min(this._zoomMax, Math.min(scaleW, scaleH)));
      }
      this._applyZoom();
    }

    _onWheel(e) {
      if (!e.ctrlKey) return;
      e.preventDefault();
      if (e.deltaY < 0) {
        this._zoomIn();
      } else {
        this._zoomOut();
      }
    }

    // ═══════ Status ═══════

    _setStatus(text) {
      this._statusBar.textContent = text;
    }

    /** 外部から最新コード取得 */
    getCode() {
      return this.model.generate();
    }
  }

  // ─── DOM Helpers ───
  function el(tag, className) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    return e;
  }

  function elText(tag, text, className) {
    const e = el(tag, className);
    e.textContent = text;
    return e;
  }

  function _escHtml(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  }

  /** Darken a hex color for stroke */
  function _darkenColor(hex) {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.max(0, ((num >> 16) & 0xff) - 40);
    const g = Math.max(0, ((num >> 8) & 0xff) - 40);
    const b = Math.max(0, (num & 0xff) - 40);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  /** フローチャートかどうか判定 */
  function isFlowchart(code) {
    const first = code.trim().split('\n')[0].trim();
    return /^(graph|flowchart)\s/i.test(first);
  }

  // Export
  window.MermaidVisualEditor = MermaidVisualEditor;
  window.MermaidVisualEditor.isFlowchart = isFlowchart;
})();

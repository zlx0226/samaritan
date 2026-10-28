/* ============================================================
   ROOF / TR1 —— 渲染与交互
   对外接口：window.RoofUI
     RoofUI.on(id, fn)          监听某个按钮被点击
     RoofUI.trigger(id)         代码里触发某个按钮
     RoofUI.press(id)           点击某个按钮（标记 + 与上一个连线，等同玩家点击）
     RoofUI.reset() / clear()   清空所有标记与连线
     RoofUI.getPath()           取回点击顺序，如 ['flower-pot', 'new-2']
     RoofUI.mark(id) / unmark(id)  只标记 / 取消标记，不动连线
     RoofUI.setPosition(id,x,y) 运行时改坐标（%）
     RoofUI.setVisible(id, bool) / RoofUI.setEnabled(bool)
     RoofUI.setDevMode(true)    开启拖拽微调
     RoofUI.getLayout()         取回当前所有坐标，可直接粘回 config.js
   另外每次点击也会派发：
     window 上  'game:hotspot'（CustomEvent）
     #tr1  上   'hotspot'（冒泡）
   ============================================================ */
(function () {
  'use strict';

  const CFG = window.ROOF_UI_CONFIG;
  const stage = document.getElementById('stage');
  const tr1 = document.getElementById('tr1');
  const layer = document.getElementById('hotspots');
  const roofEl = document.getElementById('tr1Roof');
  const devPanel = document.getElementById('devPanel');

  const nodes = new Map();      // id -> <button>
  const cancelEls = new Map();  // id -> 右上角的「取消」标注
  const spots = new Map();      // id -> 配置对象（运行时坐标以此为准）
  const listeners = new Map();  // id -> Set<fn>

  /* marked：已点击过的按钮（变大 + 亮薄荷）；path：点击顺序，用来画虚线箭头
     initial：起点按钮（永远保持选中，取消标注和 reset 都动不了它们） */
  const state = {
    active: null, marked: new Set(), path: [], initial: [],
    enabled: true, dev: !!CFG.devMode,
    editing: false, editTarget: null, editOccurrence: 1, armedGap: null, selectedRow: null,
    conditionTarget: null, prologue: false, prologueLeaving: false,
    executing: false, execPathNodes: null, execDanger: false, execCondition: null
  };
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const round2 = (v) => Math.round(v * 100) / 100;

  /* ---------------- 布局 ---------------- */

  function applyLayout() {
    tr1.style.setProperty('--tr1-left', CFG.tr1.left);
    tr1.style.setProperty('--tr1-top', CFG.tr1.top);
    tr1.style.setProperty('--tr1-width', CFG.tr1.width);
    tr1.style.setProperty('--roof-w', CFG.roofWidthPercent + '%');
    layer.style.setProperty('--btn-size', CFG.buttonSize + '%');
  }

  /* 舞台等比缩放：把设计像素换算成实际像素 */
  function fitStage() {
    const w = stage.clientWidth || CFG.design.width;
    stage.style.setProperty('--s', (w / CFG.design.width).toFixed(5));
  }

  /* ---------------- 按钮 ---------------- */

  /* ---------------- 装饰框（仿 TR1 的细边框 + 顶部缺口） ---------------- */

  const frames = new Map();      // id -> 外层 div

  function buildFrames() {
    const raw = CFG.frameStyle || {};
    const st = {
      lineInset: raw.lineInset != null ? raw.lineInset : 10,
      lineWidth: raw.lineWidth != null ? raw.lineWidth : 3,
      slitWidth: raw.slitWidth != null ? raw.slitWidth : 5.5,
      slitLean: raw.slitLean != null ? raw.slitLean : 0.4,
      notchOverrun: raw.notchOverrun != null ? raw.notchOverrun : 4,
      dashLength: raw.dashLength != null ? raw.dashLength : 34,
      dashGap: raw.dashGap != null ? raw.dashGap : 16,
      notch: raw.notch || { side: 'top', length: 135, depth: 17 }
    };

    (CFG.frames || []).forEach((fr) => {
      const box = document.createElement('div');
      box.className = 'frame-panel';
      box.dataset.id = fr.id;
      box.style.setProperty('--x', fr.x);
      box.style.setProperty('--y', fr.y);
      box.style.setProperty('--w', fr.width);
      box.style.setProperty('--h', fr.height);
      box.style.setProperty('--frame-line-width', st.lineWidth);
      box.style.setProperty('--frame-dash', st.dashLength + ' ' + st.dashGap);
      if (fr.color) box.style.setProperty('--frame-line', fr.color);   // 单框改色
      box.appendChild(buildFrameSvg(fr, st));
      stage.insertBefore(box, tr1);
      frames.set(fr.id, box);
    });
  }

  /* 把缺口的局部坐标 (u = 沿边方向, v = 凸出深度) 映射进框内坐标，
     所以同一个缺口形状可以挂在上/下/左/右任意一条边上 */
  function notchMapper(side, W, H, offset) {
    const cx = W / 2, cy = H / 2;
    const o = offset || 0;
    return (u, v) => {
      let x, y;
      if (side === 'bottom') { x = cx + u; y = H - o - v; }
      else if (side === 'left') { x = o + v; y = cy + u; }
      else if (side === 'right') { x = W - o - v; y = cy + u; }
      else { x = cx + u; y = o + v; }                // top
      return x.toFixed(1) + ',' + y.toFixed(1);
    };
  }

  /* 一个框 = 细边框（可上下虚线）+ 某条边上的梯形缺口，
     缺口里用遮罩挖 3 道斜缝（缝会把边框线一起切断，和 UI_TR1.png 一致） */
  function buildFrameSvg(fr, st) {
    const W = fr.width, H = fr.height;

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');

    /* --- 缺口梯形 + 3 道斜缝（notch: null 表示没有缺口） --- */
    let notchPath = null;
    const slits = [];
    if (fr.notch !== null) {
      const nf = Object.assign({}, st.notch, fr.notch || {});
      const offset = nf.offset || 0;
      /* 深度默认按 TR1 的关系算：从框外沿伸进来、刚越过边框线再多一点。
         也可以在这个框的 notch 里直接写 depth 覆盖 */
      const D = Math.max(1, nf.depth != null
        ? nf.depth
        : st.lineInset + st.lineWidth + st.notchOverrun - offset);
      const L = nf.length, Lb = Math.max(0, L - D);
      const lean = D * st.slitLean;
      const slitW = Math.min(st.slitWidth, D * 0.45);
      const map = notchMapper(nf.side, W, H, offset);
      notchPath = 'M' + map(-L / 2, 0) + ' L' + map(L / 2, 0) +
        ' L' + map(Lb / 2, D) + ' L' + map(-Lb / 2, D) + ' Z';
      [0.3, 0.5, 0.7].forEach((t) => {
        const u0 = -L / 2 + L * t - slitW / 2;
        slits.push('M' + map(u0, 0) + ' L' + map(u0 + slitW, 0) +
          ' L' + map(u0 + slitW + lean, D) + ' L' + map(u0 + lean, D) + ' Z');
      });
    }

    /* --- 遮罩：把斜缝挖空 --- */
    const defs = document.createElementNS(SVG_NS, 'defs');
    const mask = document.createElementNS(SVG_NS, 'mask');
    const maskId = 'frame-mask-' + fr.id;
    mask.setAttribute('id', maskId);
    mask.setAttribute('maskUnits', 'userSpaceOnUse');
    mask.setAttribute('x', '0');
    mask.setAttribute('y', '0');
    mask.setAttribute('width', W);
    mask.setAttribute('height', H);
    const keep = document.createElementNS(SVG_NS, 'rect');
    keep.setAttribute('x', '0');
    keep.setAttribute('y', '0');
    keep.setAttribute('width', W);
    keep.setAttribute('height', H);
    keep.setAttribute('fill', '#fff');
    mask.appendChild(keep);
    slits.forEach((d) => {
      const slit = document.createElementNS(SVG_NS, 'path');
      slit.setAttribute('fill', '#000');
      slit.setAttribute('d', d);
      mask.appendChild(slit);
    });
    defs.appendChild(mask);
    svg.appendChild(defs);

    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('mask', 'url(#' + maskId + ')');

    /* --- 边框线：整圈实线，或「上下虚线、左右实线」 --- */
    const inset = st.lineInset;
    if (fr.dashed === 'horizontal') {
      const dash = document.createElementNS(SVG_NS, 'path');
      dash.setAttribute('class', 'frame-line frame-line-dashed');
      dash.setAttribute('d', 'M' + inset + ',' + inset + ' H' + (W - inset) +
        ' M' + inset + ',' + (H - inset) + ' H' + (W - inset));
      group.appendChild(dash);

      const sides = document.createElementNS(SVG_NS, 'path');
      sides.setAttribute('class', 'frame-line');
      sides.setAttribute('d', 'M' + inset + ',' + inset + ' V' + (H - inset) +
        ' M' + (W - inset) + ',' + inset + ' V' + (H - inset));
      group.appendChild(sides);
    } else {
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('class', 'frame-line');
      rect.setAttribute('x', inset);
      rect.setAttribute('y', inset);
      rect.setAttribute('width', Math.max(0, W - inset * 2));
      rect.setAttribute('height', Math.max(0, H - inset * 2));
      group.appendChild(rect);
    }

    if (notchPath) {
      const notch = document.createElementNS(SVG_NS, 'path');
      notch.setAttribute('class', 'frame-notch');
      notch.setAttribute('d', notchPath);
      group.appendChild(notch);
    }

    svg.appendChild(group);
    return svg;
  }

  /* ---------------- 面板按钮（同色系，功能待接） ---------------- */

  const panelButtons = new Map();   // id -> <button>

  function buildPanelButtons() {
    (CFG.panelButtons || []).forEach((btn) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'panel-button';
      el.dataset.id = btn.id;
      el.style.setProperty('--x', btn.x);
      el.style.setProperty('--y', btn.y);
      el.style.setProperty('--w', btn.width);
      el.style.setProperty('--h', btn.height);
      el.textContent = btn.label || '';
      el.setAttribute('aria-label', btn.label || btn.id);
      /* 功能暂时不做：只把点击抛成事件，以后在这里接逻辑即可 */
      el.addEventListener('click', () => {
        if (btn.id === 'panel-button') startExecution();
        window.dispatchEvent(new CustomEvent('game:panel-button', {
          detail: { id: btn.id, config: btn }
        }));
      });
      stage.insertBefore(el, tr1);
      panelButtons.set(btn.id, el);
    });
  }

  /* ---------------- 点击顺序连线（虚线箭头） ---------------- */

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const VIEW_W = 3000;         // 视图坐标系 = roof2.jpg 原始像素，横竖等比
  const VIEW_H = 1678;
  const MARK_SCALE = 1.1;      // 与 CSS 里 .hotspot.is-active 的放大倍数保持一致
  let arrowsLayer = null;
  const pairCount = new Map(); // 'a|b' -> 这一对按钮之间已经画了几条线

  function pairKey(a, b) { return a < b ? a + '|' + b : b + '|' + a; }

  function initArrows() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'tr1-arrows');
    svg.setAttribute('viewBox', '0 0 ' + VIEW_W + ' ' + VIEW_H);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');

    const defs = document.createElementNS(SVG_NS, 'defs');
    const marker = document.createElementNS(SVG_NS, 'marker');
    marker.setAttribute('id', 'route-arrow-head');
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '8.5');
    marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '46');
    marker.setAttribute('markerHeight', '46');
    marker.setAttribute('markerUnits', 'userSpaceOnUse');
    marker.setAttribute('orient', 'auto');
    const head = document.createElementNS(SVG_NS, 'path');
    head.setAttribute('d', 'M0,0 L10,5 L0,10 Z');
    /* 箭头颜色跟随 CSS 变量 --route，改一处即可同时改线和箭头 */
    const routeColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--route').trim();
    head.setAttribute('fill', routeColor || '#2fe0ff');
    marker.appendChild(head);
    defs.appendChild(marker);
    svg.appendChild(defs);

    arrowsLayer = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(arrowsLayer);
    roofEl.insertBefore(svg, roofEl.firstChild);   // 垫在按钮层下面，按钮照样可点
  }

  /* 从 from 指向 to 的一条虚线，两端都让出圆圈半径 */
  function addArrow(from, to) {
    if (!arrowsLayer) return;
    const x1 = from.x / 100 * VIEW_W, y1 = from.y / 100 * VIEW_H;
    const x2 = to.x / 100 * VIEW_W, y2 = to.y / 100 * VIEW_H;
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 1) return;
    const ux = dx / len, uy = dy / len;
    const r = (CFG.buttonSize / 2) / 100 * VIEW_W * MARK_SCALE;   // 按钮半径（视图单位）
    const start = Math.min(r + 12, len * 0.3);
    const end = Math.min(r + 34, len * 0.3);                      // 再给箭头留位置
    /* 同一对按钮重复连线时，沿垂直方向依次错开：0, +1, -1, +2, -2 ... */
    const key = pairKey(from.id, to.id);
    const n = pairCount.get(key) || 0;
    pairCount.set(key, n + 1);
    const step = n === 0 ? 0 : Math.ceil(n / 2) * (n % 2 ? 1 : -1);
    const shift = step * (CFG.arrowOffset != null ? CFG.arrowOffset : 34);
    /* 垂直方向的基准要跟按钮 id 的顺序绑定，否则反向的那条线会跑到同一侧叠在一起 */
    const dir = from.id < to.id ? 1 : -1;
    const sx = -uy * shift * dir, sy = ux * shift * dir;

    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('class', 'route-line');
    line.setAttribute('x1', (x1 + ux * start + sx).toFixed(1));
    line.setAttribute('y1', (y1 + uy * start + sy).toFixed(1));
    line.setAttribute('x2', (x2 - ux * end + sx).toFixed(1));
    line.setAttribute('y2', (y2 - uy * end + sy).toFixed(1));
    line.setAttribute('marker-end', 'url(#route-arrow-head)');
    arrowsLayer.appendChild(line);
  }

  function redrawArrows() {
    if (!arrowsLayer) return;
    while (arrowsLayer.firstChild) arrowsLayer.removeChild(arrowsLayer.firstChild);
    pairCount.clear();
    for (let i = 1; i < state.path.length; i++) {
      const a = spots.get(state.path[i - 1]);
      const b = spots.get(state.path[i]);
      if (a && b) addArrow(a, b);
    }
  }

  function buildHotspots() {
    CFG.hotspots.forEach((spot) => {
      const item = Object.assign({}, spot, { visible: spot.visible !== false });
      spots.set(item.id, item);

      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'hotspot';
      el.dataset.id = item.id;
      el.style.left = item.x + '%';
      el.style.top = item.y + '%';
      el.hidden = !item.visible;
      el.setAttribute('aria-pressed', 'false');
      el.setAttribute('aria-label', item.label || item.id);
      el.title = item.label || item.id;

      const tag = document.createElement('span');
      tag.className = 'hotspot-label';
      el.appendChild(tag);
      refreshLabel(item);

      /* 右上角的「取消」标注：悬停在被选中的按钮上时出现，点它回退一级 */
      const cancel = document.createElement('span');
      cancel.className = 'hotspot-cancel';
      cancel.textContent = '取消';
      cancel.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();               // 不要连带触发按钮本身的点击
        if (state.dev) return;              // 开发模式只用来调位置
        undoFrom(item.id);
      });
      el.appendChild(cancel);
      cancelEls.set(item.id, cancel);

      /* 编辑过内容后，按钮左上角显示一枚小旗（编辑模式下统一隐藏） */
      const markCfg = (CFG.editPanel && CFG.editPanel.editFlagMark) || {};
      const flagMark = document.createElement('span');
      flagMark.className = 'hotspot-flag';
      flagMark.appendChild(buildFlagIcon(markCfg.size || 26, markCfg.fill || 0.9));
      el.appendChild(flagMark);

      el.addEventListener('click', () => {
        if (!state.enabled || state.dev || state.editing) return;   // 编辑模式 / dev 模式不响应
        press(item.id);
      });
      /* 悬停 / 键盘聚焦时，最下面那个框里显示这个按钮的选项 */
      el.addEventListener('mouseenter', () => setHover(item.id));
      el.addEventListener('mouseleave', () => setHover(null));
      el.addEventListener('focus', () => setHover(item.id));
      el.addEventListener('blur', () => setHover(null));
      el.addEventListener('keydown', onKeyNudge);
      el.addEventListener('pointerdown', onPointerDown);

      layer.appendChild(el);
      nodes.set(item.id, el);
    });
  }

  function refreshLabel(spot) {
    const el = nodes.get(spot.id);
    if (!el) return;
    el.firstChild.textContent =
      (spot.label || spot.id) + '  ' + spot.x + ', ' + spot.y;
  }

  function press(id) {
    if (state.editing) return;                     // 编辑模式下圆按钮不可点击
    const spot = spots.get(id);
    if (!spot || spot.visible === false) return;
    lastHoverId = null;                            // 点过之后不再沿用旧的悬停记忆
    /* 新手教学：点“新按钮 1”时 K 会提醒一句 */
    if (id === 'new-1' && CFG.tutorial && CFG.tutorial.kLines) {
      showKLine(CFG.tutorial.kLines.newOne);
    }
    if (CFG.keepAllMarks === false) state.marked.forEach(unmark);   // 只留最新一个
    const last = state.path[state.path.length - 1];
    mark(id);
    if (last !== id) state.path.push(id);          // 连点同一个按钮不重复入栈
    state.active = id;
    redrawArrows();
    refreshUi();
    dispatch(spot);
  }

  /* 回退：撤掉这个按钮「上一次被选中之后」的所有连线与后续按钮的选中状态；
     如果它本身就是最后一个，则撤销它自己的选中（起点按钮除外） */
  function undoFrom(id) {
    const idx = state.path.lastIndexOf(id);
    if (idx < 0) return;

    if (idx < state.path.length - 1) {
      const tail = state.path.slice(idx + 1);
      state.path = state.path.slice(0, idx + 1);
      tail.forEach((tid) => {
        if (state.initial.indexOf(tid) >= 0) return;         // 起点永不动
        if (state.path.indexOf(tid) < 0) unmark(tid);         // 后面还有用到就先留着
      });
    } else if (state.initial.indexOf(id) < 0) {
      state.path.pop();
      /* 前面还选过它的话，撤销这一层之后它仍然处于选中状态（保持绿色） */
      if (state.path.indexOf(id) < 0) unmark(id);
    } else {
      /* 起点本身永远保持选中；但路径里前面还选过它时，可以把最后这次重复撤销掉 */
      if (state.path.indexOf(id) < state.path.length - 1) {
        state.path.pop();
        state.active = state.path[state.path.length - 1] || null;
        redrawArrows();
        refreshUi();
      }
      return;
    }

    state.active = state.path[state.path.length - 1] || null;
    redrawArrows();
    refreshUi();
  }

  /* 只有「还有东西可撤」的被选中按钮才挂上 can-cancel 类 */
  function updateCancelLabels() {
    nodes.forEach((el, id) => {
      const idx = state.path.lastIndexOf(id);
      const isInitial = state.initial.indexOf(id) >= 0;
      const hasEarlier = idx >= 0 && state.path.indexOf(id) < idx;   // 前面还选过它
      /* 可撤的三种情况：不是最后一个；不是起点（能撤掉自己）；
         起点但前面还有一次（能撤掉最后这一层重复） */
      const canUndo = state.marked.has(id) && idx >= 0 &&
        (idx < state.path.length - 1 || !isInitial || hasEarlier);
      el.classList.toggle('can-cancel', canUndo);
    });
  }

  function mark(id) {
    const el = nodes.get(id);
    if (!el || state.marked.has(id)) return;
    state.marked.add(id);
    el.classList.add('is-active');
    el.setAttribute('aria-pressed', 'true');
    refreshUi();
  }

  function unmark(id) {
    const el = nodes.get(id);
    state.marked.delete(id);
    if (!el) return;
    el.classList.remove('is-active');
    el.setAttribute('aria-pressed', 'false');
    /* 选中状态被撤销后，这个按钮上一次选中时编辑的 if 条件也一起删掉 */
    clearEditContent(id);
    refreshUi();
  }

  function resetPath() {
    Array.from(state.marked).forEach((id) => {
      if (state.initial.indexOf(id) < 0) unmark(id);          // 起点保留
    });
    state.path = state.initial.slice();
    state.active = state.path[state.path.length - 1] || null;
    redrawArrows();
    refreshUi();
  }

  function dispatch(spot) {
    const detail = { id: spot.id, label: spot.label, config: spot, value: spot.value };
    const set = listeners.get(spot.id);
    if (set) set.forEach((fn) => { try { fn(detail); } catch (err) { console.error(err); } });
    tr1.dispatchEvent(new CustomEvent('hotspot', { detail, bubbles: true }));
    window.dispatchEvent(new CustomEvent('game:hotspot', { detail }));
  }

  /* 兼容旧写法：activate(id) = 标记一个，activate(null) = 全部清掉 */
  function activate(id) {
    if (id) { mark(id); state.active = id; } else { resetPath(); }
  }

  function setPosition(id, x, y) {
    const spot = spots.get(id);
    if (!spot) return null;
    if (typeof x === 'number') spot.x = round2(clamp(x, 0, 100));
    if (typeof y === 'number') spot.y = round2(clamp(y, 0, 100));
    const el = nodes.get(id);
    el.style.left = spot.x + '%';
    el.style.top = spot.y + '%';
    refreshLabel(spot);
    updateDevPanel();
    redrawArrows();          // 拖动已标记的按钮时，连线跟着走
    layoutSprites();         // 立绘跟着它的锚点走
    return { id: id, x: spot.x, y: spot.y };
  }

  /* ---------------- 天台上的角色立绘（垫在按钮下方） ---------------- */

  let spriteLayer = null;
  let bloodLayer = null;
  let speechBubbleEl = null;
  let speechBubbleTimer = null;
  let alertEls = [];
  let alertTimer = null;
  const sprites = new Map();        // id -> { cfg, el }
  const spriteOverrides = new Map(); // id -> { x, y }（执行模式下 K 可以离开锚点）

  function roofDesignSize() {
    const w = CFG.tr1.width * (CFG.roofWidthPercent != null ? CFG.roofWidthPercent : 94) / 100;
    return { w: w, h: w * 1678 / 3000 };
  }

  function buildSprites() {
    const list = CFG.sprites || [];
    if (!list.length) return;
    spriteLayer = document.createElement('div');
    spriteLayer.className = 'tr1-sprites';
    roofEl.insertBefore(spriteLayer, layer);       // 放在按钮层之前 → z 序更低

    list.forEach((sp) => {
      const el = document.createElement('div');
      el.className = 'sprite';
      el.dataset.id = sp.id;
      const img = document.createElement('img');
      img.alt = '';
      el.appendChild(img);
      spriteLayer.appendChild(el);
      const item = { cfg: sp, el: el, step: 0, timer: null, visionEl: null, visionFrameEl: null };

      /* 视野警戒光（跟着角色朝向翻） */
      if (sp.vision) {
        const frame = document.createElement('div');
        frame.className = 'vision-frame';
        const v = document.createElement('div');
        v.className = 'vision';
        v.style.width = 'calc(' + (sp.vision.width || 360) + ' * var(--u))';
        v.style.height = 'calc(' + (sp.vision.height || 260) + ' * var(--u))';
        const cone = document.createElement('div');
        cone.className = 'vision-cone';
        v.appendChild(cone);
        frame.appendChild(v);
        spriteLayer.appendChild(frame);
        item.visionFrameEl = frame;
        item.visionEl = v;
      }

      sprites.set(sp.id, item);
      applyFrame(item, 0);
    });
    layoutSprites();
  }

  function spriteFrames(sp) {
    return sp.frames || [{ src: sp.src, canvas: sp.canvas, box: sp.box }];
  }

  /* 套用某一帧（尺寸按该帧的包围盒算，翻转跟着朝向走） */
  function applyFrame(item, step) {
    const sp = item.cfg;
    const frames = spriteFrames(sp);
    const f = frames[step % frames.length];
    const flipped = !!sp.flipFrames && (step % 4) >= 2;
    const h = sp.height;
    const w = h * f.box[2] / f.box[3];
    const el = item.el;
    el.style.width = 'calc(' + w.toFixed(2) + ' * var(--u))';
    el.style.height = 'calc(' + h + ' * var(--u))';
    el.style.transform = 'translate(-50%, -50%) scaleY(' +
      (sp.squash != null ? sp.squash : 1) + ')' + (flipped ? ' scaleX(-1)' : '');
    const img = el.querySelector('img');
    img.src = f.src;
    const k = h / f.box[3];                        // 素材像素 → 显示像素
    img.style.width = (f.canvas[0] * k / w * 100).toFixed(3) + '%';
    img.style.left = (-f.box[0] * k / w * 100).toFixed(3) + '%';
    img.style.top = (-f.box[1] * k / h * 100).toFixed(3) + '%';
    if (item.visionEl) {
      const tilt = f.tilt != null ? f.tilt : -16;
      item.visionEl.style.transform = 'translate(-100%, -50%) rotate(' + tilt + 'deg)' +
        (flipped ? ' scaleX(-1)' : '');
      if (item.visionFrameEl) {
        item.visionFrameEl.classList.toggle('is-down', f.clip === 'down');
        item.visionFrameEl.classList.toggle('is-left', f.clip === 'left');
      }
    }
  }

  /* 通讯界面里让有 frames 的立绘自己轮播 */
  function startSpriteAnim() {
    sprites.forEach((item) => {
      if (!item.cfg.frames) return;
      item.step = 0;
      applyFrame(item, 0);
      if (item.timer) clearInterval(item.timer);
      item.timer = setInterval(() => {
        item.step += 1;
        applyFrame(item, item.step);
      }, item.cfg.frameMs || 500);
    });
  }

  function stopSpriteAnim() {
    sprites.forEach((item) => {
      if (item.timer) {
        clearInterval(item.timer);
        item.timer = null;
      }
      item.step = 0;
      applyFrame(item, 0);
    });
  }

  function stopVillainSpriteAnim() {
    ['bb1104', 'bb1001'].forEach((id) => {
      const item = sprites.get(id);
      if (!item) return;
      if (item.timer) clearInterval(item.timer);
      item.timer = null;
      item.step = 0;
      applyFrame(item, 0);
    });
  }

  /* 按锚点算位置：锚点可以是圆按钮，也可以是前面已经算过的立绘 */
  function layoutSprites() {
    if (!sprites.size) return;
    const roof = roofDesignSize();
    const centers = new Map();
    spots.forEach((s, id) => {
      centers.set(id, { x: s.x / 100 * roof.w, y: s.y / 100 * roof.h });
    });
    (CFG.sprites || []).forEach((sp) => {
      const a = centers.get(sp.anchor);
      const ov = spriteOverrides.get(sp.id);
      if (!a && !ov) return;
      const x = ov ? ov.x / 100 * roof.w : a.x + (sp.dx || 0);
      const y = ov ? ov.y / 100 * roof.h : a.y + (sp.dy || 0);
      centers.set(sp.id, { x: x, y: y });
      const item = sprites.get(sp.id);
      if (!item) return;
      item.el.style.left = (x / roof.w * 100).toFixed(3) + '%';
      item.el.style.top = (y / roof.h * 100).toFixed(3) + '%';
      if (item.visionEl) {
        item.visionEl.style.left = (x / roof.w * 100).toFixed(3) + '%';
        item.visionEl.style.top = (y / roof.h * 100).toFixed(3) + '%';
      }
    });
  }

  /* ---------------- 右侧框的编辑界面（小旗 → 指令） ---------------- */

  let editRoot = null;
  let editRows = null;
  let occurrenceChoicesEl = null;
  const editContent = new Map();   // 每个圆按钮各自的 if 行
  let attachedRows = [];           // 当前挂在编辑框里的行
  let addBtnEl = null;
  let editRingEl = null;

  function contentKey(id, occurrence) {
    return id + '#' + (occurrence || 1);
  }

  function occurrenceTotal(id) {
    return Math.max(1, state.path.filter((x) => x === id).length);
  }

  /* 把 flag.png 裁到小旗本身，按百分比放大居中（不依赖舞台缩放） */
  function buildFlagIcon(size, fill) {
    const fc = (CFG.editPanel && CFG.editPanel.flag) || {};
    const box = fc.box || [525, 126, 46, 79];
    const canvas = fc.canvas || [1280, 720];
    const k = size * (fill || 0.5) / Math.max(box[2], box[3]);
    const wrap = document.createElement('span');
    wrap.className = 'flag-icon';
    wrap.style.width = 'calc(' + size + ' * var(--u))';
    wrap.style.height = 'calc(' + size + ' * var(--u))';
    const img = document.createElement('img');
    img.src = 'assets/flag.png';
    img.alt = '';
    img.style.width = (canvas[0] * k / size * 100).toFixed(3) + '%';
    img.style.left = ((size / 2 - (box[0] + box[2] / 2) * k) / size * 100).toFixed(3) + '%';
    img.style.top = ((size / 2 - (box[1] + box[3] / 2) * k) / size * 100).toFixed(3) + '%';
    wrap.appendChild(img);
    return wrap;
  }

  function setPanelButtonsEnabled(on) {
    panelButtons.forEach((el) => {
      el.disabled = !on;
      el.classList.toggle('is-disabled', !on);
    });
  }

  function buildEditPanel() {
    const cfg = CFG.editPanel;
    if (!cfg) return;
    const fr = (CFG.frames || []).filter((f) => f.id === (cfg.frame || 'panel-c'))[0];
    if (!fr) return;

    editRoot = document.createElement('div');
    editRoot.className = 'edit-panel';
    editRoot.style.setProperty('--x', fr.x);
    editRoot.style.setProperty('--y', fr.y);
    editRoot.style.setProperty('--w', fr.width);
    editRoot.style.setProperty('--h', fr.height);
    editRoot.style.setProperty('--pad', cfg.pad != null ? cfg.pad : 28);
    editRoot.style.setProperty('--gap', cfg.gap != null ? cfg.gap : 16);

    /* 小旗按钮：把 flag.png 里的小旗等比放大、居中放进按钮 */
    const fc = cfg.flag || {};
    const fSize = fc.size || 104;
    const flagBtn = document.createElement('button');
    flagBtn.type = 'button';
    flagBtn.className = 'edit-flag';
    flagBtn.setAttribute('aria-label', '编辑指令');
    flagBtn.style.height = 'calc(' + fSize + ' * var(--u))';
    flagBtn.style.borderRadius = 'calc(' + (fc.radius || 22) + ' * var(--u))';
    /* 图标是小旗本身，按钮只是外壳，所以宽高用固定尺寸、由 flex 居中 */
    flagBtn.appendChild(buildFlagIcon(fSize, fc.fill || 0.36));
    flagBtn.addEventListener('click', () => enterEdit());

    const title = document.createElement('div');
    title.className = 'edit-title';
    title.textContent = cfg.title || '指令';
    title.style.fontSize = 'calc(' + (cfg.titleSize || 40) + ' * var(--u))';

    const ac = cfg.addButton || {};
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'edit-add';
    addBtn.textContent = ac.label || '添加+';
    addBtn.style.width = 'calc(' + (ac.width || 136) + ' * var(--u))';
    addBtn.style.height = 'calc(' + (ac.height || 74) + ' * var(--u))';
    addBtn.style.borderRadius = 'calc(' + (ac.radius || 16) + ' * var(--u))';
    addBtnEl = addBtn;
    addBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (state.selectedRow) deleteRow(state.selectedRow);
      else addIfRow();
    });

    /* 「指令」和「添加+」之间的分割线：两头虚线、中间实线 */
    const divider = document.createElement('div');
    divider.className = 'edit-divider';
    divider.innerHTML = '<i class="dash"></i><i class="solid"></i><i class="dash"></i>';

    editRows = document.createElement('div');
    editRows.className = 'edit-rows';
    editRows.style.setProperty('--rows-top', cfg.ifRow && cfg.ifRow.topOffset != null
      ? cfg.ifRow.topOffset : 0);

    occurrenceChoicesEl = document.createElement('div');
    occurrenceChoicesEl.className = 'edit-occurrences';
    const rowsArea = document.createElement('div');
    rowsArea.className = 'edit-rows-area';
    rowsArea.appendChild(occurrenceChoicesEl);
    rowsArea.appendChild(editRows);

    const ec = cfg.endButton || {};
    const endBtn = document.createElement('button');
    endBtn.type = 'button';
    endBtn.className = 'edit-end';
    endBtn.textContent = ec.label || '结束';
    endBtn.style.width = 'calc(' + (ec.width || 240) + ' * var(--u))';
    endBtn.style.height = 'calc(' + (ec.height || 58) + ' * var(--u))';
    endBtn.style.borderRadius = 'calc(' + (ec.radius || 16) + ' * var(--u))';
    endBtn.addEventListener('click', () => saveEdit());

    editRoot.appendChild(flagBtn);
    editRoot.appendChild(title);
    editRoot.appendChild(divider);
    editRoot.appendChild(addBtn);
    editRoot.appendChild(rowsArea);
    editRoot.appendChild(endBtn);
    stage.insertBefore(editRoot, tr1);
    updateAddButton();

    /* 点到编辑框以外（或框内不属于 if 行的地方）就取消选中 */
    document.addEventListener('click', (ev) => {
      if (!state.selectedRow) return;
      const t = ev.target;
      if (t && t.closest && (t.closest('.if-row-wrap') || t.closest('.if-row') ||
          t.closest('.edit-add'))) return;
      clearRowSelection();
    }, true);
  }

  /* 编辑时围着被编辑圆按钮的旋转环 */
  function buildEditRing() {
    const cfg = CFG.editPanel && CFG.editPanel.ring;
    if (!cfg) return;
    editRingEl = document.createElement('div');
    editRingEl.className = 'edit-ring';
    editRingEl.style.backgroundImage = 'url(' + cfg.src + ')';
    if (cfg.scale) editRingEl.style.width = 'calc(var(--btn-size) * ' + cfg.scale + ')';
    const step = cfg.stepMs || 1000;
    const steps = cfg.steps || 8;
    editRingEl.style.animationDuration = ((step * steps) / 1000) + 's';
    editRingEl.style.animationTimingFunction = 'steps(' + steps + ')';
    layer.appendChild(editRingEl);
  }

  function showEditRing(id) {
    if (!editRingEl) return;
    const spot = id ? spots.get(id) : null;
    if (!spot) {
      editRingEl.classList.remove('is-on');
      return;
    }
    editRingEl.style.left = spot.x + '%';
    editRingEl.style.top = spot.y + '%';
    editRingEl.classList.add('is-on');
  }

  /* if 左侧：选择这次编辑的是第几次连线 */
  function updateOccurrenceChoices() {
    if (!occurrenceChoicesEl) return;
    occurrenceChoicesEl.innerHTML = '';
    if (!state.editTarget) return;
    const total = occurrenceTotal(state.editTarget);
    for (let i = 1; i <= total; i += 1) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'edit-occurrence' +
        (i === state.editOccurrence ? ' is-active' : '');
      btn.textContent = String(i);
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (i === state.editOccurrence) return;
        showEditContent(state.editTarget, i);
        updateOccurrenceChoices();
      });
      occurrenceChoicesEl.appendChild(btn);
    }
  }

  /* 有编辑内容的圆按钮 → 左上角小旗 */
  function refreshEditFlags() {
    nodes.forEach((el, id) => {
      const has = Array.from(editContent.entries()).some(([key, rows]) =>
        key.indexOf(id + '#') === 0 && rows && rows.length);
      el.classList.toggle('has-edit', has);
    });
  }

  function enterEdit() {
    if (!editRoot || state.editing) return;
    state.editing = true;
    const occurrence = 1;
    showEditContent(state.active, occurrence); // 默认从第一次连线开始
    updateOccurrenceChoices();
    showEditRing(state.active);               // 围住正在编辑的圆按钮
    editRoot.classList.add('is-editing');
    stage.classList.add('is-editing');        // 编辑模式：圆按钮全部不可点
    setPanelButtonsEnabled(false);            // complete 变灰、不可点
    window.dispatchEvent(new CustomEvent('game:edit', {
      detail: { mode: 'enter', target: state.editTarget }
    }));
  }

  function exitEdit() {
    if (!editRoot || !state.editing) return;
    state.editing = false;
    state.armedGap = null;
    /* 退出编辑时收起条件模式（还没选条件的那一格恢复原样） */
    if (state.conditionTarget) {
      state.conditionTarget.classList.remove('is-armed');
      if (!state.conditionTarget.dataset.condition) {
        state.conditionTarget.classList.remove('is-condition');
      }
      state.conditionTarget = null;
    }
    editRoot.classList.remove('is-editing');
    stage.classList.remove('is-editing');
    showEditRing(null);                       // 退出编辑后旋转环消失
    refreshEditFlags();
    setPanelButtonsEnabled(true);
    updateGapHints();
    renderOptions();
    window.dispatchEvent(new CustomEvent('game:edit', {
      detail: { mode: 'exit', target: state.editTarget }
    }));
  }

  function hasConditionWithoutGap() {
    const rows = [];
    editContent.forEach((list) => {
      list.forEach((row) => { if (rows.indexOf(row) < 0) rows.push(row); });
    });
    attachedRows.forEach((row) => { if (rows.indexOf(row) < 0) rows.push(row); });
    return rows.some((row) => {
      const value = row.querySelector('.if-value');
      const gap = row.querySelector('.if-gap');
      return !!((value && value.dataset.condition) && !(gap && gap.dataset.value));
    });
  }

  function saveEdit() {
    const lines = (CFG.tutorial && CFG.tutorial.kLines) || {};
    if (hasInvalidCommandPlan() && lines.actionInvalid) {
      showKLine(lines.actionInvalid);
      return;
    }
    if (hasConditionWithoutGap() && lines.saveWait) showKLine(lines.saveWait);
    exitEdit();
  }

  /* 切换编辑对象：把当前的行收回它自己的按钮，再把新按钮的行挂上来。
     每个圆按钮的编辑内容是分开存的，换到另一个按钮时看不到上一个的内容 */
  function showEditContent(id, occurrence) {
    if (!editRows) return;
    const nextOccurrence = occurrence || 1;
    if (state.editTarget === id && state.editOccurrence === nextOccurrence && attachedRows.length &&
        attachedRows[0].parentNode === editRows) {
      return;                                  // 还是同一次连线，保持原样
    }
    /* 收回当前的行 */
    attachedRows.forEach((el) => {
      if (el.parentNode === editRows) editRows.removeChild(el);
    });
    if (state.editTarget) {
      editContent.set(contentKey(state.editTarget, state.editOccurrence), attachedRows);
    }
    /* 切组时把行层彻底清空，避免上一组或旧版本残留行继续露出来 */
    while (editRows.firstChild) editRows.removeChild(editRows.firstChild);

    if (state.conditionTarget) {
      state.conditionTarget.classList.remove('is-armed');
      if (!state.conditionTarget.dataset.condition) {
        state.conditionTarget.classList.remove('is-condition');
      }
      state.conditionTarget = null;
    }
    state.armedGap = null;
    clearRowSelection();
    state.editTarget = id || null;
    state.editOccurrence = nextOccurrence;
    state.armedGap = null;
    attachedRows = (id && editContent.get(contentKey(id, nextOccurrence))) || [];
    attachedRows.forEach((el) => editRows.appendChild(el));
    updateGapHints();
  }


  /* 加一行 if：素材按包围盒裁切显示，里面垫一个纯色按钮 + 一个透明缺口按钮 */
  function addIfRow() {
    const cfg = CFG.editPanel && CFG.editPanel.ifRow;
    if (!editRows || !cfg) return null;
    const canvas = cfg.canvas || [1280, 720];
    const box = cfg.box || [359, 69, 262, 193];
    const hole = cfg.hole || [101, 15, 128, 40];
    const gap = cfg.gapBox || [37, 72, 222, 71];
    const boxW = box[2], boxH = box[3];
    const W = cfg.width || 270;
    const H = W * boxH / boxW;

    /* 外层包一层不裁切的容器，左上角的次数标才能露在 if 图外面 */
    const wrap = document.createElement('div');
    wrap.className = 'if-row-wrap';
    const row = document.createElement('div');
    row.className = 'if-row';
    row.style.width = 'calc(' + W + ' * var(--u))';
    row.style.height = 'calc(' + H.toFixed(2) + ' * var(--u))';
    row.innerHTML =
      '<img class="if-img" src="' + cfg.src + '" alt="">' +
      '<button type="button" class="if-value"></button>' +
      '<button type="button" class="if-gap"><span class="if-gap-text"></span></button>';

    const img = row.querySelector('.if-img');
    img.style.width = (canvas[0] / boxW * 100).toFixed(3) + '%';
    img.style.left = (-box[0] / boxW * 100).toFixed(3) + '%';
    img.style.top = (-box[1] / boxH * 100).toFixed(3) + '%';

    const valueBtn = row.querySelector('.if-value');
    valueBtn.style.left = (hole[0] / boxW * 100).toFixed(3) + '%';
    valueBtn.style.top = (hole[1] / boxH * 100).toFixed(3) + '%';
    valueBtn.style.width = (hole[2] / boxW * 100).toFixed(3) + '%';
    valueBtn.style.height = (hole[3] / boxH * 100).toFixed(3) + '%';
    valueBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      /* 再点一次：退出条件模式 */
      if (state.conditionTarget === valueBtn) {
        state.conditionTarget = null;
        valueBtn.classList.remove('is-armed');
        if (!valueBtn.dataset.condition) valueBtn.classList.remove('is-condition');
        renderOptions();
        return;
      }
      /* 进入条件模式：最下框换成黄色条件选项，这个格子变黄色纯色 */
      state.armedGap = null;
      state.conditionTarget = valueBtn;
      valueBtn.classList.add('is-condition', 'is-armed');
      renderOptions();
      window.dispatchEvent(new CustomEvent('game:if-value', { detail: { row: wrap } }));
    });

    const gapBtn = row.querySelector('.if-gap');
    gapBtn.style.left = (gap[0] / boxW * 100).toFixed(3) + '%';
    gapBtn.style.top = (gap[1] / boxH * 100).toFixed(3) + '%';
    gapBtn.style.width = (gap[2] / boxW * 100).toFixed(3) + '%';
    gapBtn.style.height = (gap[3] / boxH * 100).toFixed(3) + '%';
    gapBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      armGap(gapBtn);
    });

    /* 只有点到图形不透明（黄色）的部分才选中这一行：添加按钮会变成删除 */
    const bars = cfg.bars || [[0, 0, boxW, boxH]];
    const hitSvg = document.createElementNS(SVG_NS, 'svg');
    hitSvg.setAttribute('class', 'if-hit');
    hitSvg.setAttribute('viewBox', '0 0 ' + boxW + ' ' + boxH);
    hitSvg.setAttribute('preserveAspectRatio', 'none');
    const hitPath = document.createElementNS(SVG_NS, 'path');
    let d = bars.map((b) => 'M' + b[0] + ',' + b[1] + ' H' + (b[0] + b[2]) +
      ' V' + (b[1] + b[3]) + ' H' + b[0] + ' Z').join(' ');
    /* “if 后”的空框反向绕一圈挖掉，点这里不算选中 */
    d += ' M' + hole[0] + ',' + hole[1] + ' V' + (hole[1] + hole[3]) +
      ' H' + (hole[0] + hole[2]) + ' V' + hole[1] + ' Z';
    hitPath.setAttribute('d', d);
    hitPath.setAttribute('fill', 'transparent');
    hitPath.setAttribute('fill-rule', 'nonzero');
    hitPath.addEventListener('click', (ev) => {
      ev.stopPropagation();
      selectRow(wrap);
    });
    hitSvg.appendChild(hitPath);
    row.insertBefore(hitSvg, valueBtn);

    wrap.insertBefore(row, wrap.firstChild);
    editRows.appendChild(wrap);
    attachedRows.push(wrap);                   // 记到现在这个按钮名下
    if (state.editTarget) {
      editContent.set(contentKey(state.editTarget, state.editOccurrence), attachedRows);
    }
    refreshEditFlags();
    updateGapHints();
    return wrap;
  }

  /* 点缺口：进入/退出「等一个选项」的状态 */
  function armGap(gapEl) {
    if (state.conditionTarget) {                 // 两种模式互斥
      state.conditionTarget.classList.remove('is-armed');
      if (!state.conditionTarget.dataset.condition) {
        state.conditionTarget.classList.remove('is-condition');
      }
      state.conditionTarget = null;
    }
    state.armedGap = state.armedGap === gapEl ? null : gapEl;
    renderOptions();
    updateGapHints();
  }

  /* 把选项填进缺口 */
  function fillGap(gapEl, label) {
    if (!gapEl) return;
    gapEl.dataset.value = label;
    state.armedGap = null;
    updateGapHints();
    window.dispatchEvent(new CustomEvent('game:if-gap', { detail: { value: label } }));
  }

  function updateGapHints() {
    if (!editRoot) return;
    Array.prototype.forEach.call(editRoot.querySelectorAll('.if-gap'), (g) => {
      const armed = g === state.armedGap;
      g.classList.toggle('is-armed', armed);
      g.classList.toggle('is-filled', !!g.dataset.value);
      const text = g.querySelector('.if-gap-text');
      if (text) {
        text.textContent = g.dataset.value || (armed ? '选择选项' : '');
      }
    });
  }

  /* 选了路线条件：写进那个条件格，并退出条件模式 */
  function applyCondition(label) {
    const target = state.conditionTarget;
    if (!target) return;
    target.dataset.condition = label;
    target.textContent = label;
    target.classList.remove('is-armed');
    target.classList.add('is-condition');
    state.conditionTarget = null;
    renderOptions();
    window.dispatchEvent(new CustomEvent('game:if-condition', {
      detail: { condition: label, row: target.parentNode }
    }));
  }

  /* 选中某一行 if：添加按钮变成「删除」；点别处取消选中 */
  function updateAddButton() {
    if (!addBtnEl) return;
    const selected = !!state.selectedRow;
    addBtnEl.textContent = selected ? '删除'
      : ((CFG.editPanel.addButton && CFG.editPanel.addButton.label) || '添加+');
    addBtnEl.classList.toggle('is-delete', selected);
  }

  function selectRow(row) {
    if (!row || state.selectedRow === row) return;
    if (state.selectedRow) state.selectedRow.classList.remove('is-selected');
    state.selectedRow = row;
    row.classList.add('is-selected');
    updateAddButton();
  }

  function clearRowSelection() {
    if (!state.selectedRow) return;
    state.selectedRow.classList.remove('is-selected');
    state.selectedRow = null;
    updateAddButton();
  }

  function deleteRow(row) {
    if (!row) return;
    const i = attachedRows.indexOf(row);
    if (i >= 0) attachedRows.splice(i, 1);
    if (state.editTarget) {
      editContent.set(contentKey(state.editTarget, state.editOccurrence), attachedRows);
    }
    if (row.parentNode) row.parentNode.removeChild(row);
    if (state.armedGap && row.contains(state.armedGap)) state.armedGap = null;
    state.selectedRow = null;
    updateAddButton();
    refreshEditFlags();
    updateGapHints();
  }

  /* 选中被撤销：把这个按钮存着的 if 行整组删掉（如果正显示着，也从框里摘掉） */
  function clearEditContent(id) {
    let removed = false;
    Array.from(editContent.keys()).forEach((key) => {
      if (key.indexOf(id + '#') !== 0) return;
      const rows = editContent.get(key) || [];
      editContent.delete(key);
      removed = true;
      if (state.editTarget === id) {
        rows.forEach((row) => {
          if (row === state.selectedRow) state.selectedRow = null;
          if (row.parentNode) row.parentNode.removeChild(row);
        });
      }
    });
    if (!removed) return;
    if (state.editTarget === id) {
      attachedRows = [];
      state.armedGap = null;
      updateAddButton();
      updateGapHints();
    }
    refreshEditFlags();
  }

  /* ---------------- 新手教学的 K 台词 ---------------- */

  let kBox = null;
  let kTextEl = null;
  let kTimer = null;

  function buildKBox() {
    const cfg = CFG.tutorial;
    if (!cfg) return;
    const fr = (CFG.frames || []).filter((f) => f.id === (cfg.frame || 'panel-a'))[0];
    if (!fr) return;
    const pad = cfg.pad != null ? cfg.pad : 24;
    kBox = document.createElement('div');
    kBox.className = 'k-box';
    kBox.style.setProperty('--x', fr.x + pad);
    kBox.style.setProperty('--y', fr.y + pad);
    kBox.style.setProperty('--w', fr.width - pad * 2);
    kBox.style.setProperty('--h', fr.height - pad * 2);
    const name = document.createElement('span');
    name.className = 'k-name';
    name.textContent = 'K：';
    kTextEl = document.createElement('span');
    kTextEl.className = 'k-text';
    kBox.appendChild(name);
    kBox.appendChild(kTextEl);
    stage.insertBefore(kBox, tr1);
  }

  /* 逐字打出 K 的话（快），新的台词会打断旧的 */
  function showKLine(text) {
    if (!kBox || !text) return;
    if (kTimer) { clearInterval(kTimer); kTimer = null; }
    kTextEl.textContent = '';
    kBox.classList.add('is-on');
    const D = CFG.dialogue || {};
    const delay = D.charDelay || (CFG.tutorial && CFG.tutorial.charDelay) || 18;
    let i = 0;
    kTimer = setInterval(() => {
      i += 1;
      kTextEl.textContent = text.slice(0, i);
      if (i >= text.length) {
        clearInterval(kTimer);
        kTimer = null;
      }
    }, delay);
  }

  /* 取一行的 if 条件（“if 后”格子里选的条件） */
  function conditionOf(wrap) {
    const v = wrap && wrap.querySelector('.if-value');
    return (v && v.dataset.condition) || '';
  }

  function conditionsCompatible(a, b) {
    /* 空条件视为与所有条件一致 */
    return !a || !b || a === b;
  }

  function rowIsEmpty(row) {
    const gap = row && row.querySelector('.if-gap');
    return !conditionOf(row) && !(gap && gap.dataset.value);
  }

  function isInterventionAction(action) {
    return action === '干预' || ['劝说', '击杀', '击晕'].indexOf(action) >= 0;
  }

  /* 同一条件下：干预后前进允许；前进后干预、动作与空缺口等待混用都无效 */
  function hasConditionConflict(row, condition, action) {
    const rows = Array.from(editRows.querySelectorAll('.if-row-wrap'));
    const current = rows.indexOf(row);
    return rows.some((other, index) => {
      if (other === row || rowIsEmpty(other)) return false;
      const otherCond = conditionOf(other);
      if (!conditionsCompatible(condition, otherCond)) return false;
      const gap = other.querySelector('.if-gap');
      const otherAction = (gap && gap.dataset.value) || '';
      if (action === '调查') return otherAction === '前进';
      if (!otherAction) return action === '前进' || isInterventionAction(action);
      if (action === '前进' && isInterventionAction(otherAction)) return index > current;
      if (isInterventionAction(action) && otherAction === '前进') return index < current;
      return false;
    });
  }

  function invalidRowSet(rows) {
    const list = (rows || []).map((row, order) => {
      const value = row.querySelector('.if-value');
      const gap = row.querySelector('.if-gap');
      return {
        order: order,
        condition: (value && value.dataset.condition) || '',
        action: (gap && gap.dataset.value) || ''
      };
    }).filter((row) => row.condition || row.action);
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i];
        const b = list[j];
        if (!conditionsCompatible(a.condition, b.condition)) continue;
        if (a.action === '前进' && isInterventionAction(b.action)) return true;
        if (a.action === '调查' && b.action === '前进') return true;
        if (b.action === '调查' && a.action === '前进') return true;
        if (!a.action && (b.action === '前进' || isInterventionAction(b.action))) return true;
        if (!b.action && (a.action === '前进' || isInterventionAction(a.action))) return true;
      }
    }
    return false;
  }

  function hasInvalidCommandPlan() {
    let invalid = false;
    editContent.forEach((rows) => {
      if (invalidRowSet(rows)) invalid = true;
    });
    return invalid;
  }

  function decisionCanParticipate(decision, endpointIntervenable) {
    if (decision.kind === 'actions') {
      return decision.hasAdvance || decision.actions.length > 0;
    }
    if (decision.kind === 'default' || decision.kind === 'nomatch') {
      /* 中间点没有指令时仍会默认前进；终点可干预点没有指令才会等待 */
      return !endpointIntervenable;
    }
    return false;
  }

  function hasStuckRoutePoint() {
    const conditions = (CFG.editPanel && CFG.editPanel.conditionOptions) ||
      ['路线安全', '路线危险'];
    const path = state.path;
    for (let i = 0; i < path.length; i += 1) {
      const id = path[i];
      const occurrence = path.slice(0, i + 1).filter((x) => x === id).length;
      const endpointIntervenable =
        i >= path.length - 1 && isIntervenableSpot(id);
      const canMove = conditions.some((condition) => {
        const decision = commandDecisionAt(id, occurrence, condition);
        return decisionCanParticipate(decision, endpointIntervenable);
      });
      if (!canMove) return true;
    }
    return false;
  }

  /* 新手教学里被 K 拦下的两种填法：返回 true 表示不填进缺口 */
  function pathHasInterventionByCurrentDecision() {
    const conditions = (CFG.editPanel && CFG.editPanel.conditionOptions) ||
      ['·�߰�ȫ', '·��Σ��'];
    const path = state.path;
    for (let i = 0; i < path.length; i += 1) {
      const id = path[i];
      const occurrence = path.slice(0, i + 1).filter((x) => x === id).length;
      for (let c = 0; c < conditions.length; c += 1) {
        const decision = commandDecisionAt(id, occurrence, conditions[c]);
        if ((decision.actions || []).some(isInterventionAction)) return true;
      }
    }
    return false;
  }

  function hasRouteInterventionInstruction() {
    const rows = [];
    const addRows = (list) => {
      (list || []).forEach((row) => {
        if (rows.indexOf(row) < 0) rows.push(row);
      });
    };
    editContent.forEach(addRows);
    addRows(attachedRows);
    return rows.some((row) => {
      const gap = row.querySelector('.if-gap');
      return isInterventionAction((gap && gap.dataset.value) || '');
    });
  }

  function hasParticipationPlan() {
    return state.path.indexOf('new-1') >= 0 || hasRouteInterventionInstruction();
  }

  function tutorialBlock(label, gapEl) {
    const lines = (CFG.tutorial && CFG.tutorial.kLines) || {};
    const row = gapEl ? gapEl.closest('.if-row-wrap') : null;
    if (label === '撤离' && lines.retreat) {
      showKLine(lines.retreat);
    } else if (lines.conflict && row && hasConditionConflict(row, conditionOf(row), label)) {
      showKLine(lines.conflict);
    } else {
      return false;
    }
    state.armedGap = null;                 // 这次填充被取消
    updateGapHints();
    return true;
  }

  /* ---------------- 前置互动（通讯） ---------------- */

  let commsBox = null;
  let commsChoiceEl = null;
  let commsChannelEl = null;
  let commsDotTimer = null;
  let commsDotStep = 0;
  let prologueFrameEl = null;
  let prologueTopsEl = null;

  function buildPrologue() {
    const P = CFG.prologue;
    if (!P) return;

    /* 黑色衬底：放进 tr1、压在 roof 下面 */
    const back = document.createElement('div');
    back.className = 'tr1-backdrop';
    tr1.insertBefore(back, tr1.firstChild);

    /* 通讯窗：下移 + 上下虚线 */
    prologueFrameEl = document.createElement('div');
    prologueFrameEl.className = 'frame-panel prologue-frame';
    prologueFrameEl.style.setProperty('--x', P.comms.x);
    prologueFrameEl.style.setProperty('--y', P.comms.y);
    prologueFrameEl.style.setProperty('--w', P.comms.width);
    prologueFrameEl.style.setProperty('--h', P.comms.height);
    prologueFrameEl.style.setProperty('--frame-line-width',
      (CFG.frameStyle && CFG.frameStyle.lineWidth) || 3);
    prologueFrameEl.style.setProperty('--frame-line', '#2f4442');
    const st = Object.assign({
      lineInset: 10, lineWidth: 3, slitWidth: 5.5, slitLean: 0.4,
      notch: { side: 'top', length: 135, depth: 17 }
    }, CFG.frameStyle || {});
    prologueFrameEl.appendChild(buildFrameSvg({
      id: 'prologue-comms',
      width: P.comms.width,
      height: P.comms.height,
      notch: null,
      dashed: 'horizontal'
    }, st));
    stage.insertBefore(prologueFrameEl, tr1);

    /* 台词窗：一行一行打字，最后一行下方出「让我想想」 */
    commsBox = document.createElement('div');
    commsBox.className = 'prologue-comms';
    commsBox.style.setProperty('--x', P.comms.x + 22);
    commsBox.style.setProperty('--y', P.comms.y + 22);
    commsBox.style.setProperty('--w', P.comms.width - 44);
    commsBox.style.setProperty('--h', P.comms.height - 44);

    commsChannelEl = document.createElement('div');
    commsChannelEl.className = 'comms-channel';
    const channelName = document.createElement('span');
    channelName.className = 'comms-channel-name';
    channelName.textContent = P.channel || '频道1';
    const channelDots = document.createElement('span');
    channelDots.className = 'comms-dots';
    for (let i = 0; i < 3; i += 1) {
      const dot = document.createElement('span');
      dot.className = 'comms-dot';
      dot.textContent = '.';
      channelDots.appendChild(dot);
    }
    commsChannelEl.appendChild(channelName);
    commsChannelEl.appendChild(channelDots);
    commsBox.appendChild(commsChannelEl);

    commsChoiceEl = document.createElement('button');
    commsChoiceEl.type = 'button';
    commsChoiceEl.className = 'comms-choice';
    commsChoiceEl.textContent = P.choice || '让我想想';
    commsChoiceEl.hidden = true;
    commsChoiceEl.addEventListener('click', (ev) => {
      ev.stopPropagation();
      endPrologue();
    });
    commsBox.appendChild(commsChoiceEl);
    stage.insertBefore(commsBox, tr1);

    /* 通讯窗上方的两个选项 */
    const T = P.topButtons || {};
    prologueTopsEl = document.createElement('div');
    prologueTopsEl.className = 'prologue-tops';
    prologueTopsEl.style.setProperty('--x', P.comms.x);
    prologueTopsEl.style.setProperty('--y', T.y != null ? T.y : P.comms.y - 72);
    prologueTopsEl.style.setProperty('--w', P.comms.width);
    prologueTopsEl.style.setProperty('--th', T.height != null ? T.height : 54);
    prologueTopsEl.style.setProperty('--tw', T.width != null ? T.width : 200);
    prologueTopsEl.style.setProperty('--gap', T.gap != null ? T.gap : 18);
    (T.labels || ['切换', '添加']).forEach((label) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'prologue-top';
      b.textContent = label;
      /* 效果先不做 */
      prologueTopsEl.appendChild(b);
    });
    stage.insertBefore(prologueTopsEl, tr1);
  }

  /* 逐字打字 */
  function typeInto(el, text, delay, done) {
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      el.textContent = text.slice(0, i);
      if (i >= text.length) {
        clearInterval(timer);
        done();
      }
    }, delay);
  }

  function applyChannelDots(step) {
    if (!commsChannelEl) return;
    commsChannelEl.querySelectorAll('.comms-dot').forEach((dot, i) => {
      dot.classList.toggle('is-on', i < step);
    });
  }

  function startChannelDots() {
    if (!commsChannelEl) return;
    if (commsDotTimer) clearInterval(commsDotTimer);
    const seq = [0, 1, 2, 3, 3, 0];
    commsDotStep = 0;
    applyChannelDots(seq[commsDotStep]);
    commsDotTimer = setInterval(() => {
      commsDotStep = (commsDotStep + 1) % seq.length;
      applyChannelDots(seq[commsDotStep]);
    }, (CFG.prologue && CFG.prologue.channelDotMs) || 260);
  }

  function stopChannelDots() {
    if (commsDotTimer) {
      clearInterval(commsDotTimer);
      commsDotTimer = null;
    }
    commsDotStep = 0;
    applyChannelDots(0);
  }

  function startPrologue() {
    const P = CFG.prologue;
    if (!P || !commsBox) return;
    const D = CFG.dialogue || {};
    const charDelay = D.charDelay || P.charDelay || 26;
    const lineHoldMs = D.lineHoldMs || 0;
    state.prologue = true;
    stage.classList.add('is-prologue');
    startChannelDots();
    tr1.style.setProperty('--tr1-left', P.tr1.left);
    tr1.style.setProperty('--tr1-top', P.tr1.top);
    tr1.style.setProperty('--tr1-width', P.tr1.width);
    tr1.style.setProperty('--tr1-h', P.tr1.height);
    startSpriteAnim();                     // 1001b/b2、1104/side 开始轮播

    /* 清掉上一次的台词（只留「让我想想」） */
    Array.prototype.slice.call(commsBox.querySelectorAll('.comms-line'))
      .forEach((el) => el.remove());
    commsChoiceEl.hidden = true;

    const lines = P.dialogueLines || P.lines || [];
    let idx = 0;
    let maleIndex = 0;
    const next = () => {
      if (idx >= lines.length) {
        commsChoiceEl.hidden = false;
        return;
      }
      const text = lines[idx];
      const speaker = text.charAt(0) === '男'
        ? ['bb1001', 'bb1104'][maleIndex++]
        : 'K';
      showSpeechBubble(speaker, Math.max(
        900,
        text.length * charDelay + lineHoldMs + 400
      ));
      const line = document.createElement('div');
      line.className = 'comms-line' + (text.charAt(0) === '男' ? ' is-man' : '');
      commsBox.insertBefore(line, commsChoiceEl);
      idx += 1;
      /* 男说完 → 下一句立刻接；K 说完 → 停一下再接（接 K 或接男都停） */
      const gap = text.charAt(0) === '男' ? 0 : (P.lineDelay || 460);
      typeInto(line, text, charDelay, () => {
        setTimeout(() => {
          clearSpeechBubble();
          setTimeout(next, gap);
        }, lineHoldMs);
      });
    };
    setTimeout(next, P.firstLineDelay || 0);
  }

  function endPrologue() {
    if (!state.prologue || state.prologueLeaving) return;
    state.prologueLeaving = true;
    clearDialogueEffects();
    if (commsChoiceEl) commsChoiceEl.disabled = true;
    stage.classList.add('is-leaving-prologue');

    const reduceMotion = window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = reduceMotion ? 1 : ((CFG.prologue && CFG.prologue.transitionMs) || 900);
    const startH = tr1.getBoundingClientRect().height;
    const endH = tr1.clientWidth * 9 / 16;
    const ease = 'cubic-bezier(.4, 0, .2, 1)';

    const panelAnim = tr1.animate([
      { height: startH + 'px' },
      { height: endH + 'px' }
    ], { duration: duration, easing: ease, fill: 'both' });

    /* roof 本身不额外做回弹：它跟随面板中心的连续上移即可 */
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      panelAnim.cancel();
      state.prologue = false;
      state.prologueLeaving = false;
      stage.classList.remove('is-leaving-prologue');
      stage.classList.remove('is-prologue');
      tr1.style.removeProperty('--tr1-h');
      if (commsChoiceEl) {
        commsChoiceEl.disabled = false;
        commsChoiceEl.hidden = true;
      }
      stopChannelDots();
      stopSpriteAnim();
      const intro = CFG.tutorial && CFG.tutorial.kLines &&
        CFG.tutorial.kLines.commandIntro;
      if (intro) showKLine(intro);
    };
    panelAnim.finished.catch(() => {}).then(finish);
    setTimeout(finish, duration + 80);
  }

  /* ---------------- 结算 / 执行 ---------------- */

  let execRoot = null;
  let execLogEl = null;
  let execStatusEl = null;
  let execRouteSvg = null;
  let execRouteLayer = null;
  let emergencyOverlayEl = null;
  let emergencyTimer = null;

  function buildExecutionPanel() {
    const E = CFG.execution;
    const P = CFG.prologue;
    const comms = P && P.comms;
    if (!E || !comms || execRoot) return;
    execRoot = document.createElement('div');
    execRoot.className = 'exec-panel';
    execRoot.style.setProperty('--x', comms.x + 22);
    execRoot.style.setProperty('--y', comms.y + 22);
    execRoot.style.setProperty('--w', comms.width - 44);
    execRoot.style.setProperty('--h', comms.height - 44);
    execRoot.style.setProperty('--pad', 24);

    const title = document.createElement('div');
    title.className = 'exec-title';
    title.textContent = '执行 / 结算';
    const condition = document.createElement('div');
    condition.className = 'exec-condition';
    condition.textContent = '条件：' + (E.condition || '路线安全');
    execLogEl = document.createElement('div');
    execLogEl.className = 'exec-log';
    execStatusEl = document.createElement('div');
    execStatusEl.className = 'exec-status';
    execStatusEl.textContent = '等待指令';
    execRoot.appendChild(title);
    execRoot.appendChild(condition);
    execRoot.appendChild(execLogEl);
    execRoot.appendChild(execStatusEl);
    stage.insertBefore(execRoot, tr1);
  }

  function buildExecutionRoutes() {
    if (execRouteSvg) return;
    const E = CFG.execution;
    if (!E) return;
    execRouteSvg = document.createElementNS(SVG_NS, 'svg');
    execRouteSvg.setAttribute('class', 'tr1-exec-routes');
    execRouteSvg.setAttribute('viewBox', '0 0 ' + VIEW_W + ' ' + VIEW_H);
    execRouteSvg.setAttribute('preserveAspectRatio', 'none');
    execRouteSvg.setAttribute('aria-hidden', 'true');
    execRouteLayer = document.createElementNS(SVG_NS, 'g');
    execRouteSvg.appendChild(execRouteLayer);
    roofEl.insertBefore(execRouteSvg, spriteLayer || layer);
  }

  let execGraph = null;

  function getExecutionGraph() {
    if (execGraph) return execGraph;
    const raw = CFG.execution && CFG.execution.routeGraph;
    if (!raw || !raw.nodes) {
      execGraph = { nodes: new Map(), adj: new Map(), edges: [] };
      return execGraph;
    }
    const g = { nodes: new Map(), adj: new Map(), edges: [] };
    Object.keys(raw.nodes).forEach((id) => {
      const n = raw.nodes[id];
      const node = { x: n.x, y: n.y, label: id };
      /* 节点如果正好是圆按钮，就带上它的名字 */
      spots.forEach((spot) => {
        if (Math.abs(spot.x - n.x) < 0.45 && Math.abs(spot.y - n.y) < 0.45) {
          node.label = spot.label || spot.id;
        }
      });
      g.nodes.set(id, node);
      g.adj.set(id, []);
    });
    (raw.edges || []).forEach((edge) => {
      const a = g.nodes.get(edge[0]);
      const b = g.nodes.get(edge[1]);
      if (!a || !b) return;
      const climb = edge[2] === 'orange';
      const cost = Math.hypot(a.x - b.x, a.y - b.y);
      g.adj.get(edge[0]).push({ to: edge[1], climb: climb, cost: cost });
      g.adj.get(edge[1]).push({ to: edge[0], climb: climb, cost: cost });
      g.edges.push({ a: edge[0], b: edge[1], climb: climb });
    });
    execGraph = g;
    return g;
  }

  function nodeForSpot(id) {
    const spot = spots.get(id);
    const g = getExecutionGraph();
    if (!spot) return null;
    let best = null;
    let bestD = Infinity;
    g.nodes.forEach((node, nodeId) => {
      const d = Math.hypot(node.x - spot.x, node.y - spot.y);
      if (d < bestD) { bestD = d; best = nodeId; }
    });
    return bestD < 0.6 ? best : null;
  }

  function nearestGraphNode(point, maxDistance) {
    if (!point) return null;
    const g = getExecutionGraph();
    let best = null;
    let bestDistance = Infinity;
    g.nodes.forEach((node, id) => {
      const distance = Math.hypot(node.x - point.x, node.y - point.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = id;
      }
    });
    return bestDistance <= (maxDistance || Infinity) ? best : null;
  }

  function shortestNodePath(start, end) {
    const g = getExecutionGraph();
    if (!g.nodes.has(start) || !g.nodes.has(end)) return null;
    if (start === end) return [start];
    const dist = new Map();
    const prev = new Map();
    const unvisited = new Set();
    g.nodes.forEach((_, id) => { dist.set(id, Infinity); unvisited.add(id); });
    dist.set(start, 0);
    while (unvisited.size) {
      let cur = null;
      let cd = Infinity;
      unvisited.forEach((id) => {
        if (dist.get(id) < cd) { cd = dist.get(id); cur = id; }
      });
      if (!cur || !isFinite(cd)) break;
      unvisited.delete(cur);
      if (cur === end) break;
      (g.adj.get(cur) || []).forEach((edge) => {
        const nd = cd + edge.cost;
        if (nd < dist.get(edge.to)) {
          dist.set(edge.to, nd);
          prev.set(edge.to, cur);
        }
      });
    }
    if (!isFinite(dist.get(end))) return null;
    const path = [];
    let cur = end;
    while (cur) {
      path.unshift(cur);
      if (cur === start) break;
      cur = prev.get(cur) || null;
    }
    return path[0] === start ? path : null;
  }

  function executionSegments() {
    return getExecutionGraph().edges.map((edge) => {
      const a = getExecutionGraph().nodes.get(edge.a);
      const b = getExecutionGraph().nodes.get(edge.b);
      return { a: a, b: b, aId: edge.a, bId: edge.b, climb: edge.climb };
    }).filter((edge) => edge.a && edge.b);
  }

  function currentVisionPolygon() {
    const item = sprites.get('bb1104');
    if (!item || !item.visionEl || !item.visionFrameEl) return null;
    const v = item.visionEl;
    const W = v.offsetWidth;
    const H = v.offsetHeight;
    const rw = roofEl.clientWidth;
    const rh = roofEl.clientHeight;
    if (!W || !H || !rw || !rh) return null;
    const frames = item.cfg.frames || [];
    const frame = frames[item.step % Math.max(1, frames.length)] || {};
    const tilt = frame.tilt != null ? frame.tilt : -16;
    const near = item.visionFrameEl.classList.contains('is-left') ? 94 : 87;
    const rad = tilt * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const ax = v.offsetLeft;
    const ay = v.offsetTop;
    return [[0, .18], [near / 100, .41], [near / 100, .59], [0, .82]].map((p) => {
      const dx = W * p[0] - W;
      const dy = H * p[1] - H / 2;
      return {
        x: (ax + dx * cos - dy * sin) / rw * 100,
        y: (ay + dx * sin + dy * cos) / rh * 100
      };
    });
  }

  function pointInPolygon(p, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if (((a.y > p.y) !== (b.y > p.y)) &&
          (p.x < (b.x - a.x) * (p.y - a.y) / ((b.y - a.y) || 1e-9) + a.x)) {
        inside = !inside;
      }
    }
    return inside;
  }

  function segmentIntersectsPolygon(a, b, poly) {
    if (pointInPolygon(a, poly) || pointInPolygon(b, poly)) return true;
    const orient = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    for (let i = 0; i < poly.length; i += 1) {
      const c = poly[i], d = poly[(i + 1) % poly.length];
      const o1 = orient(a, b, c), o2 = orient(a, b, d);
      const o3 = orient(c, d, a), o4 = orient(c, d, b);
      if (o1 * o2 < 0 && o3 * o4 < 0) return true;
    }
    return false;
  }

  function refreshExecutionDanger() {
    if (!state.executing) return;
    const path = state.execPathNodes;
    const poly = currentVisionPolygon();
    const hit = new Set();
    if (path && path.length > 1 && poly) {
      const g = getExecutionGraph();
      for (let i = 1; i < path.length; i += 1) {
        const a = g.nodes.get(path[i - 1]);
        const b = g.nodes.get(path[i]);
        if (a && b && segmentIntersectsPolygon(a, b, poly)) {
          hit.add([path[i - 1], path[i]].sort().join('|'));
        }
      }
    }
    document.querySelectorAll('.exec-route').forEach((line) => {
      const a = line.getAttribute('data-a');
      const b = line.getAttribute('data-b');
      line.classList.toggle('is-danger', hit.has([a, b].sort().join('|')));
    });
    const danger = hit.size > 0;
    if (danger && !state.execDanger) {
      appendExecLog('危险：前进路线进入监视光', 'danger');
      if (execRoot) execRoot.classList.add('is-danger');
    } else if (!danger && state.execDanger) {
      appendExecLog('监视光移开，路线暂时安全', 'muted');
      if (execRoot) execRoot.classList.remove('is-danger');
    }
    state.execDanger = danger;
    if (state.execPathNodes && state.execPathNodes.length > 1) {
      applyRuntimeCondition(danger ? '路线危险' : '路线安全', true);
    }
  }

  function drawExecutionRoutes() {
    buildExecutionRoutes();
    if (!execRouteLayer) return;
    while (execRouteLayer.firstChild) execRouteLayer.removeChild(execRouteLayer.firstChild);
    executionSegments().forEach((seg) => {
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('class', 'exec-route' + (seg.climb ? ' is-climb' : ''));
      line.setAttribute('data-a', seg.aId);
      line.setAttribute('data-b', seg.bId);
      line.setAttribute('x1', (seg.a.x / 100 * VIEW_W).toFixed(1));
      line.setAttribute('y1', (seg.a.y / 100 * VIEW_H).toFixed(1));
      line.setAttribute('x2', (seg.b.x / 100 * VIEW_W).toFixed(1));
      line.setAttribute('y2', (seg.b.y / 100 * VIEW_H).toFixed(1));
      execRouteLayer.appendChild(line);
    });
  }

  async function appendExecLog(text, kind, actorId, report) {
    if (!execLogEl) return;
    if (kind !== 'dialogue' && kind !== 'man' && kind !== 'combat-sound') return;
    const D = CFG.dialogue || {};
    const charDelay = D.charDelay || 38;
    const lineHoldMs = D.lineHoldMs || 0;
    const entry = document.createElement('div');
    entry.className = 'exec-entry' + (kind ? ' is-' + kind : '') +
      (report ? ' is-report' : '');
    if (kind === 'man' && /^男[：:]\s*[!！]\s*$/.test(text)) {
      showSurpriseAlerts();
      entry.textContent = text;
    } else if (kind !== 'combat-sound') {
      showSpeechBubble(
        kind === 'man' ? (actorId || 'bb1104') : 'K',
        text.length * charDelay + lineHoldMs + 400
      );
    }
    execLogEl.appendChild(entry);
    while (execLogEl.children.length > 9) execLogEl.removeChild(execLogEl.firstChild);
    if (entry.textContent) return;
    await new Promise((resolve) => {
      typeInto(entry, text, charDelay, resolve);
    });
  }

  function setExecStatus(text, kind) {
    if (!execStatusEl) return;
    execStatusEl.textContent = text;
    execStatusEl.className = 'exec-status' + (kind ? ' is-' + kind : '');
  }

  function actionLabel(action) {
    const subs = CFG.optionSubs || {};
    const parent = Object.keys(subs).filter((key) => subs[key].indexOf(action) >= 0)[0];
    return parent ? parent + '：' + action : action;
  }

  function pruneIfRows(id, occurrence) {
    const key = contentKey(id, occurrence || 1);
    const rows = (editContent.get(key) || []).slice();
    const valid = [];
    rows.forEach((row) => {
      const value = row.querySelector('.if-value');
      const gap = row.querySelector('.if-gap');
      const condition = (value && value.dataset.condition) || '';
      const action = (gap && gap.dataset.value) || '';
      if (!condition && !action) {
        /* 空 if 不参与判断，直接从当前编辑目标里摘掉 */
        if (state.editTarget === id && state.editOccurrence === (occurrence || 1)) {
          const i = attachedRows.indexOf(row);
          if (i >= 0) attachedRows.splice(i, 1);
        }
        if (row.parentNode) row.parentNode.removeChild(row);
        if (state.selectedRow === row) state.selectedRow = null;
        return;
      }
      valid.push({ condition: condition, action: action, row: row });
    });
    editContent.set(key, valid.map((item) => item.row));
    refreshEditFlags();
    return valid;
  }

  function applyRuntimeCondition(label, logIt) {
    if (!label || state.execCondition === label) return;
    state.execCondition = label;
    const conditionEl = execRoot && execRoot.querySelector('.exec-condition');
    if (conditionEl) conditionEl.textContent = '条件：' + label;
    if (logIt) appendExecLog('条件变为：' + label, 'move');
  }

  function isIntervenableSpot(id) {
    const spot = spots.get(id);
    return !!spot && (spot.options || []).indexOf('干预') >= 0;
  }

  function commandDecisionAt(id, occurrence, conditionOverride) {
    const E = CFG.execution || {};
    const rules = pruneIfRows(id, occurrence || 1);
    if (!rules.length) {
      return { kind: 'default', advance: true, actions: [], condition: '' };
    }
    const condition = conditionOverride || state.execCondition || E.condition || '路线安全';
    const matched = rules.filter((r) => !r.condition || r.condition === condition);
    if (!matched.length) {
      /* 当前条件没有专属指令，但对立条件里的「前进」已经写好：
         另一条件默认等待，而不是直接前进 */
      const otherInstruction = rules.some((r) =>
        r.condition && r.condition !== condition && r.action);
      if (otherInstruction) {
        return {
          kind: 'wait-opposite',
          advance: false,
          wait: true,
          actions: [],
          condition: condition
        };
      }
      return { kind: 'nomatch', advance: true, actions: [], condition: condition };
    }
    if (matched.some((r) => !r.action)) {
      return { kind: 'wait', advance: false, wait: true, actions: [], condition: condition };
    }
    const actions = matched.map((r) => r.action);
    const others = actions.filter((a) => a !== '前进');
    return {
      kind: 'actions',
      advance: true,
      actions: others,
      hasAdvance: actions.indexOf('前进') >= 0,
      condition: condition
    };
  }

  function logCommandDecision(decision) {
    if (decision.kind === 'default') appendExecLog('无 if → 默认前进', 'move');
    else if (decision.kind === 'nomatch') appendExecLog('无匹配条件 → 默认前进', 'muted');
    else if (decision.kind === 'wait') appendExecLog('等待：' + decision.condition + ' 下缺口未填写', 'wait');
    else if (decision.kind === 'wait-opposite') {
      appendExecLog('等待：当前条件没有指令', 'wait');
    }
    else if (decision.kind === 'actions') {
      if (decision.hasAdvance) appendExecLog('执行：前进', 'move');
    }
  }

  function evaluateCommandsAt(id, occurrence) {
    const decision = commandDecisionAt(id, occurrence);
    logCommandDecision(decision);
    return decision;
  }

  async function waitForConditionAt(id, label, requireAction, occurrence, currentNode) {
    const E = CFG.execution || {};
    const waitStartedAt = performance.now();
    let condition = state.execCondition || E.condition || '路线安全';
    setExecStatus(state.execDanger
      ? '等待：前路被监视 · ' + condition
      : '等待：' + label + ' · ' + condition, 'wait');
    while (state.executing) {
      await new Promise((r) => setTimeout(r, E.conditionPollMs || 300));
      /* 等待仍然发生在当前点上，所以这里继续检测当前点到下一点的危险状态 */
      if (state.execPathNodes) refreshExecutionDanger();
      const nextCondition = state.execCondition || E.condition || '路线安全';
      if (nextCondition !== condition) {
        condition = nextCondition;
        applyRuntimeCondition(condition, !state.execPathNodes);
      }
      const decision = commandDecisionAt(id, occurrence);
      const actionable = decision.kind === 'actions' &&
        (decision.hasAdvance || decision.actions.length > 0);
      if (!decision.wait && (!requireAction || actionable)) {
        setExecStatus('执行中 · ' + condition);
        logCommandDecision(decision);
        return decision;
      }
      if (performance.now() - waitStartedAt >= (E.waitTimeoutMs || 10000)) {
        const conflictId = E.conflictPoint || 'new-1';
        const conflictNode = nodeForSpot(conflictId);
        const forcedPath = conflictNode
          ? shortestNodePath(currentNode, conflictNode)
          : null;
        if (!forcedPath) return null;
        await appendExecLog('K：等不及了。', 'dialogue');
        state.execPathNodes = forcedPath.slice();
        refreshExecutionDanger();
        const forcedEntry = dangerEntryPoint(forcedPath);
        await runDangerKill(true, forcedEntry);
        return null;
      }
      if (requireAction && !actionable && !state.execDanger) {
        setExecStatus('等待：没有前进或干预指令', 'wait');
      } else {
        setExecStatus(state.execDanger
          ? '等待：前路被监视 · ' + condition
          : '等待：' + label + ' · ' + condition, 'wait');
      }
    }
    return null;
  }

  function setKPosition(x, y) {
    spriteOverrides.set('K', { x: x, y: y });
    const item = sprites.get('K');
    if (!item) return;
    item.el.style.left = x + '%';
    item.el.style.top = y + '%';
  }

  async function moveKAlongGraph(start, end) {
    const path = shortestNodePath(start, end);
    if (!path) return false;
    clearAlerts();
    const g = getExecutionGraph();
    const item = sprites.get('K');
    if (!item) return false;
    const roof = roofDesignSize();
    const points = path.map((id) => g.nodes.get(id));
    const lens = [];
    let total = 0;
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1];
      const b = points[i];
      const len = Math.hypot((a.x - b.x) / 100 * roof.w, (a.y - b.y) / 100 * roof.h);
      lens.push(len);
      total += len;
    }
    if (total < 0.01) {
      setKPosition(points[points.length - 1].x, points[points.length - 1].y);
      return true;
    }
    const frames = [{
      left: points[0].x + '%',
      top: points[0].y + '%',
      offset: 0
    }];
    const orangeRanges = [];
    let cum = 0;
    for (let i = 1; i < points.length; i += 1) {
      const edge = (g.adj.get(path[i - 1]) || []).filter((e) => e.to === path[i])[0];
      if (edge && edge.climb) {
        orangeRanges.push({ start: cum / total, end: (cum + lens[i - 1]) / total });
      }
      cum += lens[i - 1];
      frames.push({
        left: points[i].x + '%',
        top: points[i].y + '%',
        offset: cum / total
      });
    }
    const duration = Math.max(500, total * ((CFG.execution && CFG.execution.travelMsPerPx) || 10));
    const orientationTimers = [];
    let orientationDistance = 0;
    for (let i = 1; i < points.length; i += 1) {
      const dx = points[i].x - points[i - 1].x;
      const dy = points[i].y - points[i - 1].y;
      if (i === 1) {
        setKOrientation(dx, dy);
      } else {
        orientationTimers.push(setTimeout(() => {
          setKOrientation(dx, dy);
        }, duration * orientationDistance / total));
      }
      orientationDistance += lens[i - 1];
    }
    const anim = item.el.animate(frames, {
      duration: duration,
      easing: 'linear',
      fill: 'both'
    });
    const timers = orangeRanges.map((range) => setTimeout(() => {
      appendExecLog('翻越：橙色短段', 'climb');
      rotateKClimb(duration * (range.end - range.start));
    }, duration * range.start));
    await new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        timers.forEach((timer) => clearTimeout(timer));
        orientationTimers.forEach((timer) => clearTimeout(timer));
        anim.cancel();
        const last = points[points.length - 1];
        setKPosition(last.x, last.y);
        clearExecPath();
        resolve();
      };
      anim.finished.catch(() => {}).then(finish);
      setTimeout(finish, duration + 100);
    });
    return true;
  }

  function clearExecPath() {
    state.execPathNodes = null;
    if (state.execDanger) {
      state.execDanger = false;
      if (execRoot) execRoot.classList.remove('is-danger');
    }
    document.querySelectorAll('.exec-route.is-danger')
      .forEach((line) => line.classList.remove('is-danger'));
  }

  let kClimbReturnTimer = null;

  function rotateKClimb(turnMs) {
    const item = sprites.get('K');
    const img = item && item.el.querySelector('img');
    if (!img) return;
    img.style.transformOrigin = '50% 30%';
    if (kClimbReturnTimer) clearTimeout(kClimbReturnTimer);
    img.getAnimations().forEach((anim) => anim.cancel());
    const returnMs = 180;
    const slowMs = Math.max(
      (CFG.execution && CFG.execution.climbTurnMs) || 220,
      turnMs
    );
    const slow = img.animate([
      { transform: 'rotate(0deg)' },
      { transform: 'rotate(30deg)' }
    ], { duration: slowMs, easing: 'ease-in-out', fill: 'both' });
    kClimbReturnTimer = setTimeout(() => {
      const fast = img.animate([
        { transform: 'rotate(30deg)' },
        { transform: 'rotate(0deg)' }
      ], { duration: returnMs, easing: 'ease-out', fill: 'both' });
      const finish = () => {
        slow.cancel();
        fast.cancel();
      };
      fast.finished.catch(() => {}).then(finish);
      setTimeout(finish, returnMs + 80);
      kClimbReturnTimer = null;
    }, slowMs);
  }

  function setSpriteImage(id, src, canvas, box, flip, preserveTransform) {
    const item = sprites.get(id);
    if (!item) return;
    const h = item.cfg.height || 100;
    const w = h * box[2] / box[3];
    item.el.style.width = 'calc(' + w.toFixed(3) + ' * var(--u))';
    const img = item.el.querySelector('img');
    if (!img) return;
    const k = h / box[3];
    img.src = src;
    img.style.width = (canvas[0] * k / w * 100).toFixed(3) + '%';
    img.style.left = (-box[0] * k / w * 100).toFixed(3) + '%';
    img.style.top = (-box[1] * k / h * 100).toFixed(3) + '%';
    if (!preserveTransform) img.style.transform = flip ? 'scaleX(-1)' : '';
  }

  function setKFront(preserveTransform) {
    setSpriteImage(
      'K', 'assets/K.png', [256, 256], [62, 15, 108, 238], false, preserveTransform
    );
  }

  function setKOrientation(dx, dy) {
    if (Math.abs(dy) >= Math.abs(dx)) {
      if (dy < 0) {
        setSpriteImage('K', 'assets/K_back.png', [3000, 3000], [786, 190, 1234, 2789], false);
      } else {
        setKFront();
      }
    } else if (dx < 0) {
      setSpriteImage('K', 'assets/K_side.png', [3000, 3000], [824, 185, 1341, 2777], false);
    } else {
      setSpriteImage('K', 'assets/K_side.png', [3000, 3000], [824, 185, 1341, 2777], true);
    }
  }

  function setPersuasionCast(climb) {
    if (climb) {
      setSpriteImage('bb1104', 'assets/BB1104.png', [3000, 3000], [853, 175, 1118, 2798], false);
      setSpriteImage('bb1001', 'assets/BB1001_b.png', [3000, 3000], [191, 197, 1780, 2776], false);
    } else {
      setSpriteImage('bb1104', 'assets/BB1104_side_mirror.png', [3000, 3000], [1170, 180, 928, 2791], false);
      setSpriteImage('bb1001', 'assets/BB1001_side_b.png', [3000, 3000], [320, 208, 1839, 2765], false);
    }
    const v = sprites.get('bb1104');
    if (v && v.visionFrameEl) v.visionFrameEl.style.opacity = '0';
  }

  function animateKNodes(nodeIds, duration) {
    const item = sprites.get('K');
    const g = getExecutionGraph();
    if (!item || !nodeIds || nodeIds.length < 2) return Promise.resolve();
    clearAlerts();
    const points = nodeIds.map((id) => g.nodes.get(id)).filter(Boolean);
    if (points.length < 2) return Promise.resolve();
    const roof = roofDesignSize();
    let total = 0;
    const lens = [];
    for (let i = 1; i < points.length; i += 1) {
      const len = Math.hypot(
        (points[i - 1].x - points[i].x) / 100 * roof.w,
        (points[i - 1].y - points[i].y) / 100 * roof.h
      );
      lens.push(len);
      total += len;
    }
    const frames = [{ left: points[0].x + '%', top: points[0].y + '%', offset: 0 }];
    let cum = 0;
    for (let i = 1; i < points.length; i += 1) {
      cum += lens[i - 1];
      frames.push({
        left: points[i].x + '%',
        top: points[i].y + '%',
        offset: total ? cum / total : 1
      });
    }
    const anim = item.el.animate(frames, {
      duration: duration,
      easing: 'ease-in-out',
      fill: 'both'
    });
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        anim.cancel();
        const last = points[points.length - 1];
        setKPosition(last.x, last.y);
        resolve();
      };
      anim.finished.catch(() => {}).then(finish);
      setTimeout(finish, duration + 100);
    });
  }

  async function approachVillainsToK() {
    const k = spritePoint('K');
    if (!k) return;
    const E = CFG.execution || {};
    const duration = E.persuadeApproachMs || 500;
    const targets = [
      ['bb1104', { x: k.x + 4, y: k.y - 2 }],
      ['bb1001', { x: k.x + 5, y: k.y + 2 }]
    ];
    await Promise.all(targets.map(([id, target]) => animateSpriteTo(id, target, duration)));
  }

  function clearEmergencyOverlay() {
    if (emergencyTimer) {
      clearInterval(emergencyTimer);
      emergencyTimer = null;
    }
    if (emergencyOverlayEl) {
      emergencyOverlayEl.remove();
      emergencyOverlayEl = null;
    }
    stage.classList.remove('is-emergency');
  }

  function showEmergencyOverlay() {
    clearEmergencyOverlay();
    stage.classList.add('is-emergency');
    emergencyOverlayEl = document.createElement('div');
    emergencyOverlayEl.className = 'emergency-overlay';

    const head = document.createElement('div');
    head.className = 'emergency-head';
    const title = document.createElement('span');
    title.className = 'emergency-title';
    title.textContent = '紧急指令';
    const count = document.createElement('span');
    count.className = 'emergency-count';
    count.textContent = '3';
    head.appendChild(title);
    head.appendChild(count);

    const actions = document.createElement('div');
    actions.className = 'emergency-actions';
    const finish = (choice) => {
      clearEmergencyOverlay();
      if (choice === '击晕') {
        void runTakedown(true);
      } else {
        void runTakedown(false, true);
      }
    };
    ['击晕', '击杀'].forEach((label) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'emergency-choice';
      btn.textContent = label;
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        finish(label);
      });
      actions.appendChild(btn);
    });

    emergencyOverlayEl.appendChild(head);
    emergencyOverlayEl.appendChild(actions);
    tr1.appendChild(emergencyOverlayEl);
    let left = 3;
    emergencyTimer = setInterval(() => {
      left -= 1;
      if (left > 0) count.textContent = String(left);
      else finish('击杀');
    }, 1000);
  }

  async function runPersuasion(spot, next, nodePath) {
    const E = CFG.execution || {};
    const g = getExecutionGraph();
    const startNode = nodeForSpot(spot.id);
    let path = nodePath ? nodePath.slice() : null;
    if (!path && next) {
      const end = nodeForSpot(next.id);
      if (startNode && end) path = shortestNodePath(startNode, end);
    }
    stopSpriteAnim();
    const kItem = sprites.get('K');
    const kImg = kItem && kItem.el.querySelector('img');
    if (kImg) {
      kImg.getAnimations().forEach((anim) => anim.cancel());
      kImg.style.transform = '';
    }

    if (spot.id === 'new-2') {
      /* 新按钮 2 是例外：只向右走一小段，不绕去水箱翻越 */
      const from = spritePoint('K');
      setKOrientation(1, 0);
      if (from) {
        await slowMoveSprite('K', {
          x: from.x + 12,
          y: from.y
        }, E.persuadeWalkMs || 1100);
      }
      setPersuasionCast(false);
    } else {
      /* 其他位置触发劝说时，必须走到橙色翻越段并翻过去 */
      const climbEdge = (g.edges || []).filter((edge) => edge.climb)[0];
      let climbPath = null;
      if (climbEdge) {
        const toStart = startNode
          ? shortestNodePath(startNode, climbEdge.a)
          : null;
        climbPath = toStart
          ? toStart.concat([climbEdge.b])
          : [climbEdge.a, climbEdge.b];
      }

      if (climbPath && climbPath.length > 1) {
        const a = g.nodes.get(climbEdge.a);
        const b = g.nodes.get(climbEdge.b);
        const roof = roofDesignSize();
        let total = 0;
        let lastLen = 0;
        for (let i = 1; i < climbPath.length; i += 1) {
          const p = g.nodes.get(climbPath[i - 1]);
          const q = g.nodes.get(climbPath[i]);
          const len = Math.hypot(
            (p.x - q.x) / 100 * roof.w,
            (p.y - q.y) / 100 * roof.h
          );
          total += len;
          if (i === climbPath.length - 1) lastLen = len;
        }
        const normalMs = Math.max(500, total * (E.climbTravelMsPerPx || 5));
        const climbMs = normalMs * lastLen / Math.max(1, total);
        setTimeout(() => rotateKClimb(climbMs), normalMs * (total - lastLen) / Math.max(1, total));
        setKOrientation(b.x - a.x, b.y - a.y);
        await animateKNodes(climbPath, normalMs);
        setPersuasionCast(true);
        /* 翻越结束之后，再慢慢朝最近的反派走近一点 */
        const now = spritePoint('K');
        if (now) {
          const targets = ['bb1104', 'bb1001'].map((id) => spritePoint(id)).filter(Boolean);
          targets.sort((p, q) =>
            Math.hypot(p.x - now.x, p.y - now.y) - Math.hypot(q.x - now.x, q.y - now.y));
          const near = targets[0];
          const dx = near ? near.x - now.x : b.x - a.x;
          const dy = near ? near.y - now.y : b.y - a.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 0.1) {
            const step = Math.min(4, dist * .55);
            setKOrientation(dx, dy);
            await slowMoveSprite('K', {
              x: now.x + dx / dist * step,
              y: now.y + dy / dist * step
            }, E.persuadeWalkMs || 1100);
          }
        }
      } else {
        const p0 = startNode ? g.nodes.get(startNode) : null;
        let dx = 0;
        let dy = -1;
        if (path && path.length > 1) {
          const p1 = g.nodes.get(path[1]);
          if (p1 && p0) {
            dx = p1.x - p0.x;
            dy = p1.y - p0.y;
          }
        }
        const norm = Math.hypot(dx, dy) || 1;
        setKOrientation(dx, dy);
        const from = spritePoint('K');
        if (from) {
          const target = {
            x: from.x + dx / norm * 10,
            y: from.y + dy / norm * 7
          };
          await slowMoveSprite('K', target, E.persuadeWalkMs || 1100);
        }
        setPersuasionCast(true);
      }
    }

    const pause = E.persuadePauseMs || 800;
    const lineActors = ['K', 'bb1104', 'bb1001', 'K'];
    const lines = [
      ['K：嘿，小伙子们，差不多得了。', 'dialogue'],
      ['男：怎么又是你！', 'man'],
      ['男：这回我可不会大意了！', 'man'],
      ['K：嘿，他们可不怎么听话啊？', 'dialogue']
    ];
    for (let i = 0; i < lines.length; i += 1) {
      await appendExecLog(lines[i][0], lines[i][1], lineActors[i]);
      await new Promise((r) => setTimeout(r, pause));
      if (i === 2) await approachVillainsToK();
    }
    setExecStatus('等待选择', 'wait');
    showEmergencyOverlay();
  }

  function spritePoint(id) {
    const item = sprites.get(id);
    if (!item) return null;
    return {
      x: parseFloat(item.el.style.left),
      y: parseFloat(item.el.style.top)
    };
  }

  function clearSpeechBubble() {
    if (speechBubbleTimer) {
      clearTimeout(speechBubbleTimer);
      speechBubbleTimer = null;
    }
    if (speechBubbleEl) {
      speechBubbleEl.remove();
      speechBubbleEl = null;
    }
  }

  function clearAlerts() {
    if (alertTimer) {
      clearTimeout(alertTimer);
      alertTimer = null;
    }
    alertEls.forEach((el) => el.remove());
    alertEls = [];
  }

  function clearDialogueEffects() {
    clearSpeechBubble();
    clearAlerts();
  }

  function showSpeechBubble(actorId, durationMs) {
    if (!spriteLayer) return;
    clearSpeechBubble();
    const point = spritePoint(actorId);
    if (!point) return;
    const bubble = document.createElement('div');
    bubble.className = 'sprite-speech-bubble';
    bubble.style.left = point.x + '%';
    bubble.style.top = point.y + '%';
    const image = document.createElement('img');
    image.src = 'assets/speech_bubble.png';
    image.alt = '';
    bubble.appendChild(image);
    spriteLayer.appendChild(bubble);
    speechBubbleEl = bubble;
    speechBubbleTimer = setTimeout(() => {
      if (speechBubbleEl === bubble) clearSpeechBubble();
    }, durationMs || 1400);
  }

  function showSurpriseAlerts() {
    if (!spriteLayer) return;
    clearDialogueEffects();
    ['bb1001', 'bb1104'].forEach((id) => {
      const point = spritePoint(id);
      if (!point) return;
      const alert = document.createElement('span');
      alert.className = 'sprite-surprise-alert';
      alert.textContent = '!';
      alert.style.left = point.x + '%';
      alert.style.top = point.y + '%';
      spriteLayer.appendChild(alert);
      alertEls.push(alert);
    });
    alertTimer = setTimeout(clearAlerts, 1100);
  }

  function showBlood(id) {
    const point = spritePoint(id);
    if (!point) return;
    if (!bloodLayer) {
      bloodLayer = document.createElement('div');
      bloodLayer.className = 'blood-layer';
      roofEl.insertBefore(bloodLayer, spriteLayer || layer);
    }
    const img = document.createElement('img');
    img.className = 'blood-mark';
    img.src = 'assets/blood.png';
    img.alt = '';
    img.style.left = point.x + '%';
    img.style.top = (point.y + 4) + '%';
    bloodLayer.appendChild(img);
  }

  function animateSpriteTo(id, target, duration) {
    const item = sprites.get(id);
    const from = spritePoint(id);
    if (!item || !from || !isFinite(from.x) || !isFinite(from.y)) return Promise.resolve();
    clearAlerts();
    spriteOverrides.set(id, { x: from.x, y: from.y });
    const anim = item.el.animate([
      { left: from.x + '%', top: from.y + '%' },
      { left: target.x + '%', top: target.y + '%' }
    ], { duration: duration, easing: 'cubic-bezier(.2, .7, .25, 1)', fill: 'both' });
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        anim.cancel();
        spriteOverrides.set(id, { x: target.x, y: target.y });
        item.el.style.left = target.x + '%';
        item.el.style.top = target.y + '%';
        resolve();
      };
      anim.finished.catch(() => {}).then(finish);
      setTimeout(finish, duration + 100);
    });
  }

  function slowMoveSprite(id, target, duration) {
    const item = sprites.get(id);
    const from = spritePoint(id);
    if (!item || !from || !isFinite(from.x) || !isFinite(from.y)) return Promise.resolve();
    clearAlerts();
    spriteOverrides.set(id, { x: from.x, y: from.y });
    const start = performance.now();
    return new Promise((resolve) => {
      let done = false;
      let timer = null;
      const finish = () => {
        if (done) return;
        done = true;
        if (timer) clearInterval(timer);
        spriteOverrides.set(id, { x: target.x, y: target.y });
        item.el.style.left = target.x + '%';
        item.el.style.top = target.y + '%';
        resolve();
      };
      timer = setInterval(() => {
        const t = Math.min(1, (performance.now() - start) / duration);
        const e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        item.el.style.left = (from.x + (target.x - from.x) * e) + '%';
        item.el.style.top = (from.y + (target.y - from.y) * e) + '%';
        if (t >= 1) finish();
      }, 16);
      setTimeout(finish, duration + 120);
    });
  }

  function fallSprite(id, angle, durationOverride) {
    const item = sprites.get(id);
    const img = item && item.el.querySelector('img');
    if (!img) return Promise.resolve();
    clearAlerts();
    item.el.classList.add('is-falling');
    img.style.transformOrigin = '50% 90%';
    const E = CFG.execution || {};
    const duration = durationOverride || E.takedownFallMs || 340;
    const anim = img.animate([
      { transform: 'rotate(0deg)' },
      { transform: 'rotate(' + angle + 'deg)' }
    ], { duration: duration, easing: 'ease-in', fill: 'both' });
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        anim.cancel();
        img.style.transform = 'rotate(' + angle + 'deg)';
        resolve();
      };
      anim.finished.catch(() => {}).then(finish);
      setTimeout(finish, duration + 80);
    });
  }

  function shakeSprite(id, durationOverride) {
    const item = sprites.get(id);
    const point = spritePoint(id);
    if (!item || !point) return Promise.resolve();
    clearAlerts();
    const E = CFG.execution || {};
    const duration = durationOverride || E.takedownShakeMs || 240;
    const dx = 0.38;
    const dy = 0.18;
    const anim = item.el.animate([
      { left: point.x + '%', top: point.y + '%' },
      { left: (point.x - dx) + '%', top: (point.y + dy) + '%', offset: .18 },
      { left: (point.x + dx) + '%', top: (point.y - dy) + '%', offset: .36 },
      { left: (point.x - dx * .7) + '%', top: (point.y + dy * .6) + '%', offset: .56 },
      { left: (point.x + dx * .4) + '%', top: point.y + '%', offset: .76 },
      { left: point.x + '%', top: point.y + '%' }
    ], { duration: duration, easing: 'ease-in-out' });
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        anim.cancel();
        resolve();
      };
      anim.finished.catch(() => {}).then(finish);
      setTimeout(finish, duration + 80);
    });
  }

  async function runTakedown(prepositioned, blood) {
    const E = CFG.execution || {};
    let k = spritePoint('K');
    if (!k) return;
    const actors = ['bb1104', 'bb1001'].filter((id) => sprites.has(id));
    let target = null;
    let other = null;
    const v = sprites.get('bb1104');
    if (v && v.visionFrameEl) v.visionFrameEl.style.opacity = '0';
    if (!prepositioned) {
      const candidates = actors.map((id) => {
        const p = spritePoint(id);
        return p ? { id: id, p: p } : null;
      }).filter(Boolean);
      if (!candidates.length) return;
      candidates.sort((a, b) =>
        Math.hypot(a.p.x - k.x, a.p.y - k.y) - Math.hypot(b.p.x - k.x, b.p.y - k.y));
      target = candidates[0];
      other = candidates[1] || null;
      stopVillainSpriteAnim();
      const startNode = nearestGraphNode(k, 0.75);
      const targetNode = nearestGraphNode(target.p, 16);
      if (startNode && targetNode && startNode !== targetNode) {
        await moveKAlongGraph(startNode, targetNode);
        k = spritePoint('K') || k;
      }
      const near = {
        x: target.p.x + (k.x <= target.p.x ? -4 : 4),
        y: target.p.y
      };
      if (Math.hypot(near.x - k.x, near.y - k.y) > 0.1) {
        setKOrientation(near.x - k.x, near.y - k.y);
        await animateSpriteTo('K', near, E.takedownApproachMs || 320);
      }
      /* 最早的非劝说击晕：先击倒一个，另一个再接近补位 */
      await Promise.all([shakeSprite('K'), shakeSprite(target.id)]);
      await fallSprite(target.id, 82);
      if (blood) showBlood(target.id);
      if (other) {
        const otherNear = {
          x: near.x + (other.p.x <= near.x ? -5 : 5),
          y: near.y
        };
        await animateSpriteTo(other.id, otherNear, E.takedownDashMs || 700);
        await Promise.all([shakeSprite('K'), shakeSprite(other.id)]);
        await fallSprite(other.id, -82);
        if (blood) showBlood(other.id);
      }
    } else {
      await Promise.all([
        shakeSprite('K'),
        ...actors.map((id) => shakeSprite(id))
      ]);
      await Promise.all(actors.map((id, i) => fallSprite(id, i === 0 ? 82 : -82)));
      if (blood) actors.forEach(showBlood);
    }
    await appendExecLog('（打斗声）', 'combat-sound');
    await appendExecLog('K：任务完成。目标已控制。', 'dialogue', null, true);
    setExecStatus('任务完成', 'done');
    clearExecPath();
  }

  function inDangerZone(point) {
    const zone = (CFG.execution && CFG.execution.dangerZone) ||
      { x1: 58, y1: 12, x2: 100, y2: 57 };
    return point.x >= zone.x1 && point.x <= zone.x2 &&
      point.y >= zone.y1 && point.y <= zone.y2;
  }

  function dangerSegmentEntry(from, to, zone) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const candidates = [];
    const addCandidate = (t) => {
      if (t >= -1e-7 && t <= 1 + 1e-7) candidates.push(Math.max(0, t));
    };
    if (Math.abs(dx) > 1e-9) {
      addCandidate((zone.x1 - from.x) / dx);
      addCandidate((zone.x2 - from.x) / dx);
    }
    if (Math.abs(dy) > 1e-9) {
      addCandidate((zone.y1 - from.y) / dy);
      addCandidate((zone.y2 - from.y) / dy);
    }
    candidates.sort((a, b) => a - b);
    for (let i = 0; i < candidates.length; i += 1) {
      const t = candidates[i];
      const point = {
        x: from.x + dx * t,
        y: from.y + dy * t
      };
      if (inDangerZone(point)) {
        const distance = Math.hypot(dx, dy) || 1;
        return {
          x: point.x,
          y: point.y,
          direction: { x: dx / distance, y: dy / distance }
        };
      }
    }
    return null;
  }

  function dangerEntryPoint(nodeIds) {
    const start = spritePoint('K');
    if (!start) return null;
    const g = getExecutionGraph();
    const E = CFG.execution || {};
    const zone = E.dangerZone || { x1: 58, y1: 12, x2: 100, y2: 57 };

    if (inDangerZone(start)) {
      return {
        x: start.x,
        y: start.y,
        direction: dangerPathDirection(start, nodeIds),
        pathNodes: []
      };
    }

    let previous = start;
    for (let i = 0; i < (nodeIds || []).length; i += 1) {
      const node = g.nodes.get(nodeIds[i]);
      if (!node) continue;
      const hit = dangerSegmentEntry(previous, node, zone);
      if (hit) {
        return Object.assign(hit, {
          pathNodes: nodeIds.slice(0, i),
          segmentStartId: i === 0 ? nodeIds[0] : nodeIds[i - 1],
          segmentEndId: nodeIds[i]
        });
      }
      previous = node;
    }
    return null;
  }

  function dangerPathDirection(start, nodeIds) {
    const g = getExecutionGraph();
    let previous = start;
    for (let i = 0; i < (nodeIds || []).length; i += 1) {
      const node = g.nodes.get(nodeIds[i]);
      if (!node) continue;
      const dx = node.x - previous.x;
      const dy = node.y - previous.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 0.001) {
        return { x: dx / distance, y: dy / distance };
      }
      previous = node;
    }
    return null;
  }

  function dangerActionPoint(nodeIds) {
    const start = spritePoint('K');
    if (!start) return null;
    const route = nodeIds && nodeIds.length ? nodeIds : state.execPathNodes;
    return {
      x: start.x,
      y: start.y,
      direction: dangerPathDirection(start, route)
    };
  }

  function shiftDangerKillPoint(point) {
    if (!point || !point.direction) return point;
    const E = CFG.execution || {};
    const fromBelow = point.direction.y < -0.7;
    if (fromBelow && E.dangerKillFromBelowStage) {
      return {
        x: E.dangerKillFromBelowStage.x,
        y: E.dangerKillFromBelowStage.y
      };
    }
    const shift = E.dangerKillShift || 0;
    const zone = E.dangerZone || { x1: 58, y1: 12, x2: 100, y2: 57 };
    return {
      x: Math.min(zone.x2, Math.max(zone.x1, point.x + point.direction.x * shift)),
      y: Math.min(zone.y2, Math.max(zone.y1, point.y + point.direction.y * shift))
    };
  }

  async function moveKToDangerEntry(entryPoint) {
    const item = sprites.get('K');
    const start = spritePoint('K');
    if (!item || !start || !entryPoint) return false;
    clearAlerts();
    const g = getExecutionGraph();
    const roof = roofDesignSize();
    const pathIds = (entryPoint.pathNodes || []).filter((id) => g.nodes.has(id));
    const route = [{ point: start, edge: null }];
    let previousId = pathIds[0] || entryPoint.segmentStartId || null;
    for (let i = 1; i < pathIds.length; i += 1) {
      const node = g.nodes.get(pathIds[i]);
      const edge = (g.adj.get(previousId) || []).find((e) => e.to === pathIds[i]);
      route.push({ point: { x: node.x, y: node.y }, edge: edge || null });
      previousId = pathIds[i];
    }
    const finalEdge = previousId && entryPoint.segmentEndId
      ? (g.adj.get(previousId) || []).find((e) => e.to === entryPoint.segmentEndId)
      : null;
    route.push({
      point: { x: entryPoint.x, y: entryPoint.y },
      edge: finalEdge || null
    });

    const segments = [];
    let total = 0;
    for (let i = 1; i < route.length; i += 1) {
      const a = route[i - 1].point;
      const b = route[i].point;
      const len = Math.hypot(
        (a.x - b.x) / 100 * roof.w,
        (a.y - b.y) / 100 * roof.h
      );
      if (len < 0.01) continue;
      total += len;
      segments.push({
        from: a,
        point: b,
        length: len,
        edge: route[i].edge
      });
    }
    if (total < 0.01) {
      setKPosition(entryPoint.x, entryPoint.y);
      return true;
    }

    const frames = [{ left: start.x + '%', top: start.y + '%', offset: 0 }];
    const orangeRanges = [];
    let cum = 0;
    segments.forEach((segment) => {
      if (segment.edge && segment.edge.climb) {
        orangeRanges.push({
          start: cum / total,
          end: (cum + segment.length) / total
        });
      }
      cum += segment.length;
      frames.push({
        left: segment.point.x + '%',
        top: segment.point.y + '%',
        offset: cum / total
      });
    });
    const rate = (CFG.execution && CFG.execution.travelMsPerPx) || 6.5;
    const duration = Math.max(100, total * rate);
    const orientationTimers = [];
    let orientationDistance = 0;
    segments.forEach((segment, index) => {
      const dx = segment.point.x - segment.from.x;
      const dy = segment.point.y - segment.from.y;
      if (index === 0) {
        setKOrientation(dx, dy);
      } else {
        orientationTimers.push(setTimeout(() => {
          setKOrientation(dx, dy);
        }, duration * orientationDistance / total));
      }
      orientationDistance += segment.length;
    });
    const anim = item.el.animate(frames, {
      duration: duration,
      easing: 'linear',
      fill: 'both'
    });
    const timers = orangeRanges.map((range) => setTimeout(() => {
      appendExecLog('��Խ����ɫ�̶�', 'climb');
      rotateKClimb(duration * (range.end - range.start));
    }, duration * range.start));
    await new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        timers.forEach((timer) => clearTimeout(timer));
        orientationTimers.forEach((timer) => clearTimeout(timer));
        anim.cancel();
        setKPosition(entryPoint.x, entryPoint.y);
        resolve();
      };
      anim.finished.catch(() => {}).then(finish);
      setTimeout(finish, duration + 100);
    });
    return true;
  }

  function faceVillainsToK() {
    const k = spritePoint('K');
    if (!k) return;
    stopVillainSpriteAnim();
    const face = (id) => {
      const p = spritePoint(id);
      if (!p) return;
      const dx = k.x - p.x;
      const dy = k.y - p.y;
      if (Math.abs(dx) < Math.abs(dy)) {
        if (id === 'bb1104') {
          setSpriteImage('bb1104', 'assets/BB1104.png', [3000, 3000], [853, 175, 1118, 2798], false);
        } else {
          setSpriteImage('bb1001', 'assets/BB1001_b.png', [3000, 3000], [191, 197, 1780, 2776], false);
        }
      } else if (id === 'bb1104') {
        if (dx < 0) {
          setSpriteImage('bb1104', 'assets/BB1104_side_mirror.png', [3000, 3000], [1170, 180, 928, 2791], false);
        } else {
          setSpriteImage('bb1104', 'assets/BB1104_side.png', [3000, 3000], [903, 180, 928, 2791], false);
        }
      } else if (dx < 0) {
        setSpriteImage('bb1001', 'assets/BB1001_side_b.png', [3000, 3000], [320, 208, 1839, 2765], false);
      } else {
        setSpriteImage('bb1001', 'assets/BB1001_side_b.png', [3000, 3000], [320, 208, 1839, 2765], true);
      }
    };
    face('bb1104');
    face('bb1001');
    const v = sprites.get('bb1104');
    if (v && v.visionFrameEl) v.visionFrameEl.style.opacity = '0';
  }

  async function runDangerKill(enterZone, entryPoint) {
    const E = CFG.execution || {};
    let k = spritePoint('K');
    if (!k) return;
    if (enterZone && entryPoint && !inDangerZone(k)) {
      setKFront();
      await moveKToDangerEntry(entryPoint);
      k = spritePoint('K');
      if (!k) return;
    }
    let kTarget = null;
    if (enterZone || entryPoint) {
      const staging = entryPoint || E.dangerZoneEntry || { x: k.x, y: k.y };
      kTarget = shiftDangerKillPoint(Object.assign({}, staging, {
        direction: staging.direction || { x: 1, y: 0 }
      }));
    }
    faceVillainsToK();
    await appendExecLog('男：！', 'man');
    await new Promise((r) => setTimeout(r, 360));

    const killCenter = kTarget || k;
    const actors = ['bb1104', 'bb1001'].map((id) => {
      const p = spritePoint(id);
      return p ? { id: id, p: p } : null;
    }).filter(Boolean).sort((a, b) =>
      Math.hypot(a.p.x - killCenter.x, a.p.y - killCenter.y) -
      Math.hypot(b.p.x - killCenter.x, b.p.y - killCenter.y));
    const first = actors[0];
    const second = actors[1];
    if (!first) return;

    const firstNear = {
      x: killCenter.x + (first.p.x <= killCenter.x ? -4 : 4),
      y: killCenter.y - 2
    };
    const secondNear = second ? {
      x: killCenter.x + (second.p.x < killCenter.x ? -4 : 4),
      y: killCenter.y + 2
    } : null;

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const firstMoveMs = 420;
    const secondMoveMs = 520;
    const kMoveMs = E.dangerKillAdvanceMs || 1200;

    const firstMove = animateSpriteTo(first.id, firstNear, firstMoveMs);
    await wait(firstMoveMs * 0.3);

    let kMove = Promise.resolve();
    if (kTarget && (!inDangerZone(k) ||
        Math.hypot(kTarget.x - k.x, kTarget.y - k.y) > 0.1)) {
      setKFront(true);
      kMove = animateSpriteTo('K', kTarget, kMoveMs);
    }

    await wait(kMoveMs * 0.3);
    const secondMove = second
      ? animateSpriteTo(second.id, secondNear, secondMoveMs)
      : Promise.resolve();

    await Promise.all([firstMove, kMove, secondMove]);
    k = spritePoint('K');
    await appendExecLog('K：这就没办法了。', 'dialogue');
    const shakeMs = E.dangerKillShakeMs || 150;
    const fallMs = E.dangerKillFallMs || 360;
    const transitionMs = E.dangerKillTransitionMs || 100;
    await new Promise((r) => setTimeout(r, transitionMs));
    await Promise.all([
      shakeSprite('K', shakeMs),
      shakeSprite(first.id, shakeMs)
    ]);
    await fallSprite(first.id, 82, fallMs);
    showBlood(first.id);

    if (second) {
      await Promise.all([
        shakeSprite('K', shakeMs),
        shakeSprite(second.id, shakeMs)
      ]);
      await fallSprite(second.id, -82, fallMs);
      showBlood(second.id);
    }
    await appendExecLog('（打斗声）', 'combat-sound');
    await appendExecLog('K：任务完成。目标已控制。', 'dialogue', null, true);
    setExecStatus('任务完成', 'done');
    clearExecPath();
  }

  async function executeAction(action, spot, next, nodePath) {
    const E = CFG.execution || {};
    const pause = E.actionPauseMs || 650;
    if (state.execCondition === '路线危险' &&
        ['劝说', '击晕', '击杀'].indexOf(action) >= 0) {
      await runDangerKill(false, dangerActionPoint(nodePath));
      return true;
    }
    if (action === '调查') {
      await appendExecLog('K：调查这个？', 'dialogue');
      await new Promise((r) => setTimeout(r, pause));
      await appendExecLog('K：没有什么特别的', 'dialogue');
      await new Promise((r) => setTimeout(r, pause));
      return false;
    }
    if (action === '击晕') {
      await runTakedown();
      return true;
    }
    if (action === '劝说' && state.execCondition === '路线安全') {
      await runPersuasion(spot, next, nodePath);
      return true;
    }
    if (action === '击杀' && state.execCondition === '路线安全') {
      await runTakedown(false, true);
      return true;
    }
    appendExecLog('识别互动：' + actionLabel(action) + '（效果待实现）', 'action');
    await new Promise((r) => setTimeout(r, pause));
    return false;
  }

  async function startExecution() {
    if (!CFG.execution || state.executing || state.prologue || state.editing) return;
    const lines = (CFG.tutorial && CFG.tutorial.kLines) || {};
    if (hasInvalidCommandPlan() && lines.actionInvalid) {
      showKLine(lines.actionInvalid);
      return;
    }
    const hasIntervention = hasRouteInterventionInstruction();
    if (!hasParticipationPlan() && lines.noParticipation) {
      showKLine(lines.noParticipation);
      return;
    }
    if (!hasIntervention && hasStuckRoutePoint() && lines.noParticipation) {
      showKLine(lines.noParticipation);
      return;
    }
    state.executing = true;
    state.enabled = false;
    stage.classList.add('is-executing');
    startSpriteAnim();
    setPanelButtonsEnabled(false);
    closeSubMenu();
    clearRowSelection();
    buildExecutionPanel();
    drawExecutionRoutes();

    const E = CFG.execution;
    const P = CFG.prologue;
    const path = state.path.slice();
    const condition = E.condition || '路线安全';
    appendExecLog('开始结算，条件：' + condition, 'move');
    if (!path.length) {
      setExecStatus('没有可执行路线', 'wait');
      return;
    }
    const firstNode = nodeForSpot(path[0]);
    const graph = getExecutionGraph();
    if (!firstNode || !graph.nodes.get(firstNode)) {
      setExecStatus('路线起点不在红线网络上', 'wait');
      return;
    }
    const firstPoint = graph.nodes.get(firstNode);
    setKPosition(firstPoint.x, firstPoint.y);
    setExecStatus('准备执行 · ' + condition);

    /* 进入结算时把左侧框展开成通讯界面的高度，右侧沿用通讯窗 */
    if (P && P.tr1) {
      const startH = tr1.getBoundingClientRect().height;
      const targetH = P.tr1.height * (stage.clientWidth / CFG.design.width);
      tr1.style.setProperty('--tr1-h', P.tr1.height);
      if (!window.matchMedia || !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const anim = tr1.animate([
          { height: startH + 'px' },
          { height: targetH + 'px' }
        ], { duration: (P.transitionMs || 900), easing: 'cubic-bezier(.4, 0, .2, 1)' });
        await new Promise((resolve) => {
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            anim.cancel();
            resolve();
          };
          anim.finished.catch(() => {}).then(finish);
          setTimeout(finish, (P.transitionMs || 900) + 100);
        });
      }
    }
    setExecStatus('执行中 · ' + condition);
    await new Promise((r) => setTimeout(r, 260));
    let currentNode = firstNode;

    for (let i = 0; i < path.length; i += 1) {
      const spot = spots.get(path[i]);
      if (!spot) continue;
      const occurrence = path.slice(0, i + 1).filter((id) => id === spot.id).length;
      setExecStatus('抵达：' + (spot.label || spot.id));
      let next = null;
      let nextNode = null;
      let nodePath = null;
      let zoneEntry = null;
      let endpointIntervenable = false;
      let endpointConflictId = null;
      let endpointPath = null;
      if (i < path.length - 1) {
        next = spots.get(path[i + 1]);
        if (next) {
          nextNode = nodeForSpot(next.id);
          if (!nextNode) {
            appendExecLog('无法进入红线网络的点：' + (next.label || next.id), 'wait');
            setExecStatus('停在：' + (spot.label || spot.id), 'wait');
            return;
          }
          nodePath = shortestNodePath(currentNode, nextNode);
          if (!nodePath) {
            setExecStatus('没有连通的红色路线', 'wait');
            return;
          }
          /* 只在当前点判断“当前点到下一个点”的整条前进路线 */
          state.execPathNodes = nodePath.slice();
          refreshExecutionDanger();
          zoneEntry = dangerEntryPoint(nodePath);
        }
      }
      if (i >= path.length - 1) {
        /* 终点专属规则：中间的可干预点仍走上面的普通下一节点逻辑 */
        endpointIntervenable = isIntervenableSpot(spot.id);
        if (endpointIntervenable) {
          endpointConflictId = E.conflictPoint || 'new-1';
          const conflictNode = nodeForSpot(endpointConflictId);
          if (conflictNode) {
            endpointPath = shortestNodePath(currentNode, conflictNode);
            if (endpointPath) {
              state.execPathNodes = endpointPath.slice();
              refreshExecutionDanger();
              zoneEntry = dangerEntryPoint(endpointPath);
            }
          }
        }
        if (!endpointPath) {
          clearExecPath();
          applyRuntimeCondition(E.condition || '路线安全', true);
        }
      }

      let decision = commandDecisionAt(spot.id, occurrence);
      const actionable = decision.kind === 'actions' &&
        (decision.hasAdvance || decision.actions.length > 0);
      if (decision.wait || (endpointIntervenable && !actionable)) {
        if (decision.wait) logCommandDecision(decision);
        else appendExecLog('等待：终点没有前进或干预指令', 'wait');
        decision = await waitForConditionAt(
          spot.id, spot.label || spot.id, endpointIntervenable, occurrence, currentNode);
        if (!decision) return;
      } else {
        logCommandDecision(decision);
      }
      if (decision.actions.length) {
        let halted = false;
        for (let a = 0; a < decision.actions.length; a += 1) {
          if (await executeAction(decision.actions[a], spot, next, nodePath)) {
            halted = true;
            break;
          }
        }
        if (halted) return;
      }
      const conflictId = E.conflictPoint || 'new-1';
      const hasIntervention = decision.actions.some(isInterventionAction);
      const headsToConflict =
        (next && next.id === conflictId) ||
        (endpointIntervenable && endpointConflictId === conflictId && decision.hasAdvance);
      if (!hasIntervention && zoneEntry &&
          (next || headsToConflict)) {
        await runDangerKill(true, zoneEntry);
        return;
      }
      if (i >= path.length - 1) {
        if (endpointIntervenable && decision.hasAdvance && endpointConflictId) {
          const conflictNode = nodeForSpot(endpointConflictId);
          appendExecLog('K → ' + ((spots.get(endpointConflictId) || {}).label || endpointConflictId), 'move');
          if (conflictNode) await moveKAlongGraph(currentNode, conflictNode);
        }
        break;
      }
      if (!next || !nextNode) continue;
      appendExecLog('K → ' + (next.label || next.id), 'move');
      const moved = await moveKAlongGraph(currentNode, nextNode);
      if (!moved) {
        setExecStatus('没有连通的红色路线', 'wait');
        return;
      }
      currentNode = nextNode;
    }
    clearExecPath();
    setExecStatus('执行完成', 'done');
    appendExecLog('路线执行完成', 'move');
  }

  /* ---------------- 开发模式：拖拽微调 ---------------- */

  /* ---------------- 选项条（最下框里并排显示选项） ---------------- */

  let optionBar = null;
  let hoverId = null;        // 鼠标正悬停的按钮
  let lastHoverId = null;    // 上一次悬停的按钮（鼠标移到选项条上时用它兜住）
  let lastHoverAt = 0;       // 上次悬停的时间，用来判断这个记忆是否已经过期
  let barHover = false;      // 鼠标是否停在选项条上
  let revertTimer = null;    // 离开按钮后的延迟回退（避免经过空白处时跳一下）
  let renderedKey = null;    // 已画内容的完整标识（来源按钮 + 选项文字）
  let renderedLabels = null; // 已画内容的选项文字（用来判断能否原地重放动画）

  function buildOptionBar() {
    const cfg = CFG.optionBar;
    if (!cfg) return;
    const fr = (CFG.frames || []).filter((f) => f.id === cfg.frame)[0];
    if (!fr) return;
    const pad = cfg.padding != null ? cfg.padding : 26;
    const padLeft = cfg.paddingLeft != null ? cfg.paddingLeft : pad;
    optionBar = document.createElement('div');
    optionBar.className = 'option-bar';
    optionBar.style.setProperty('--x', fr.x + padLeft);
    optionBar.style.setProperty('--y', fr.y + pad);
    optionBar.style.setProperty('--w', Math.max(0, fr.width - padLeft - pad));
    optionBar.style.setProperty('--h', Math.max(0, fr.height - pad * 2));
    optionBar.style.setProperty('--gap', cfg.gap != null ? cfg.gap : 22);
    optionBar.addEventListener('mouseenter', () => {
      if (revertTimer) { clearTimeout(revertTimer); revertTimer = null; }
      barHover = true;
      renderOptions();          // 内容没变的话什么都不会发生
    });
    optionBar.addEventListener('mouseleave', () => {
      barHover = false;
      renderOptions();
    });
    /* 点到别处就收起子选项 */
    document.addEventListener('click', (ev) => {
      if (!optionBar.querySelector('.option-subs')) return;
      const t = ev.target;
      if (t && t.closest && (t.closest('.option-subs') || t.closest('.option-item'))) return;
      closeSubMenu();
    }, true);
    stage.insertBefore(optionBar, tr1);
  }

  /* 选项的子选项弹层：显示在被点选项的正上方 */
  function closeSubMenu() {
    if (!optionBar) return;
    const open = optionBar.querySelector('.option-subs');
    if (open) open.remove();
    optionBar.classList.remove('has-subs');
  }

  function openSubMenu(chipEl, subs) {
    const menu = document.createElement('div');
    menu.className = 'option-subs';
    subs.forEach((label) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'option-item is-sub';
      b.textContent = label;
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const gap = state.armedGap;
        closeSubMenu();
        if (gap) fillGap(gap, label);
        window.dispatchEvent(new CustomEvent('game:option', {
          detail: { id: optionSourceId(), label: label, sub: true }
        }));
      });
      menu.appendChild(b);
    });
    chipEl.appendChild(menu);
    if (optionBar) optionBar.classList.add('has-subs');
  }

  /* 显示谁的选项：优先悬停的那个，其次是「鼠标停在选项条上」时兜住的，最后是最后选中的那个 */
  function optionSourceId() {
    if (hoverId) return hoverId;
    /* 只有「刚从某个圆按钮滑过来」才沿用它的选项；
       过期的悬停记忆会让鼠标一进选项条就换一套选项、把正在点的选项替换掉 */
    if (barHover && lastHoverId && performance.now() - lastHoverAt < 1200) return lastHoverId;
    return state.active;
  }

  function setHover(id) {
    if (id) {
      lastHoverId = id;
      lastHoverAt = performance.now();
      if (revertTimer) { clearTimeout(revertTimer); revertTimer = null; }
      if (hoverId === id) return;
      hoverId = id;
      renderOptions();
      return;
    }
    /* 鼠标离开按钮：先等一小会儿，如果接着滑到选项上就不回退了 */
    if (revertTimer) clearTimeout(revertTimer);
    revertTimer = setTimeout(() => {
      revertTimer = null;
      hoverId = null;
      renderOptions();
    }, 220);
  }

  function renderOptions() {
    if (!optionBar) return;

    /* 条件模式：点过 “if 后” 的格子，最下框换成黄色的路线条件选项 */
    if (state.conditionTarget) {
      const conds = (CFG.editPanel && CFG.editPanel.conditionOptions) || [];
      const ckey = 'cond|' + conds.join('|');
      if (ckey === renderedKey) return;
      renderedKey = ckey;
      renderedLabels = conds.join('|');
      optionBar.innerHTML = '';
      conds.forEach((label) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'option-item is-condition';
        btn.textContent = label;
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          applyCondition(label);
        });
        optionBar.appendChild(btn);
      });
      return;
    }

    const id = optionSourceId();
    const spot = id ? spots.get(id) : null;
    const list = (spot && spot.options) || [];
    const labelsKey = list.join('|');
    const key = String(id) + '|' + labelsKey;
    if (key === renderedKey) return;         // 完全没变：什么都不做（鼠标停着不会闪）

    if (labelsKey === renderedLabels && optionBar.children.length === list.length) {
      /* 换到了别的按钮、但选项文字一模一样：保留现有元素，只重放一次切换动画。
         不重建 DOM，鼠标就不会因为元素被替换而"离开"，也就不会连锁闪烁 */
      renderedKey = key;
      replayOptionAnimation();
      return;
    }

    renderedKey = key;
    renderedLabels = labelsKey;
    optionBar.innerHTML = '';
    list.forEach((label) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'option-item';
      btn.textContent = label;
      /* 功能暂时不做：先把点击抛成事件，以后在这里接 */
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const curId = optionSourceId();
        /* 干预这类选项：不直接填，先在上方弹出子选项 */
        const subs = (CFG.optionSubs && CFG.optionSubs[label]) || null;
        if (subs && state.armedGap) {
          const already = !!btn.querySelector('.option-subs');
          closeSubMenu();
          if (!already) openSubMenu(btn, subs);
          return;
        }
        closeSubMenu();
        /* 编辑模式里已经点过一个缺口：把选项填进去（新手教学的两类操作会被 K 拦下） */
        if (state.armedGap && !tutorialBlock(label, state.armedGap)) {
          fillGap(state.armedGap, label);
        }
        window.dispatchEvent(new CustomEvent('game:option', {
          detail: { id: curId, label: label, hotspot: curId ? spots.get(curId) : null }
        }));
      });
      optionBar.appendChild(btn);
    });
  }

  /* 原地重放出现动画（元素不动，只是重新触发一次 CSS 动画） */
  function replayOptionAnimation() {
    Array.prototype.forEach.call(optionBar.children, (el) => {
      el.style.animation = 'none';
      void el.offsetWidth;                   // 强制重排，动画才会真正重启
      el.style.animation = '';
    });
  }

  /* 选中状态相关的界面统一在这里刷新 */
  function refreshUi() {
    updateCancelLabels();
    renderOptions();
  }

  function onPointerDown(event) {
    if (!state.dev) return;
    event.preventDefault();
    const el = event.currentTarget;
    const spot = spots.get(el.dataset.id);
    el.setPointerCapture(event.pointerId);
    el.classList.add('is-dragging');

    const move = (ev) => {
      const box = layer.getBoundingClientRect();
      setPosition(spot.id,
        (ev.clientX - box.left) / box.width * 100,
        (ev.clientY - box.top) / box.height * 100);
    };
    const up = () => {
      el.classList.remove('is-dragging');
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      printLayout();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    // 按下即吸附到指针位置
    move(event);
  }

  /* 方向键微调：1%，按住 Shift 为 0.2% */
  function onKeyNudge(event) {
    if (!state.dev) return;
    const step = event.shiftKey ? 0.2 : 1;
    const spot = spots.get(event.currentTarget.dataset.id);
    const map = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0],
      ArrowUp: [0, -step], ArrowDown: [0, step]
    };
    const delta = map[event.key];
    if (!delta) return;
    event.preventDefault();
    setPosition(spot.id, spot.x + delta[0], spot.y + delta[1]);
  }

  function updateDevPanel() {
    if (!state.dev || devPanel.hidden) return;
    const last = state.active;
    devPanel.innerHTML = Array.from(spots.values()).map((s) => {
      const line = s.id + '  ' + s.x + ', ' + s.y;
      return (s.id === last ? '<b>' + line + '</b>' : line);
    }).join('\n') + '\n\n拖拽按钮移动，方向键微调(Shift 精细)';
  }

  function printLayout() {
    const text = getLayout().map((s) => s.id + ': ' + s.x + ', ' + s.y).join('\n');
    console.log('[RoofUI] 当前坐标（可直接粘回 config.js）\n' + text);
    devPanel.innerHTML = '<b>' + text.replace(/\n/g, '</b>\n<b>') + '</b>';
  }

  function setDevMode(on) {
    state.dev = !!on;
    stage.classList.toggle('is-dev', state.dev);
    devPanel.hidden = !state.dev;
    if (state.dev) { devPanel.textContent = ''; updateDevPanel(); }
  }

  /* ---------------- 对外接口 ---------------- */

  function getLayout() {
    return Array.from(spots.values()).map((s) => ({
      id: s.id, label: s.label, x: s.x, y: s.y
    }));
  }

  const api = {
    on(id, fn) {
      if (typeof fn !== 'function') return () => {};
      if (!listeners.has(id)) listeners.set(id, new Set());
      listeners.get(id).add(fn);
      return () => api.off(id, fn);
    },
    off(id, fn) {
      const set = listeners.get(id);
      if (set) set.delete(fn);
    },
    trigger(id) {
      const spot = spots.get(id);
      if (spot) dispatch(spot);
    },
    press(id) { press(id); },
    undo(id) { undoFrom(id); },
    enterEdit() { enterEdit(); },
    exitEdit() { exitEdit(); },
    addIfRow() { return addIfRow(); },
    get editing() { return state.editing; },
    get editTarget() { return state.editTarget; },
    setOptions(id, list) {
      const spot = spots.get(id);
      if (!spot) return;
      spot.options = Array.isArray(list) ? list.slice() : [];
      if (optionSourceId() === id) renderOptions();
    },
    refreshOptions() { renderOptions(); },
    get initialPath() { return state.initial.slice(); },
    mark(id) { mark(id); },
    unmark(id) { unmark(id); },
    activate(id) { activate(id); },
    reset() { resetPath(); },
    clear() { resetPath(); },
    getPath() { return state.path.slice(); },
    getMarked() { return Array.from(state.marked); },
    setPosition(id, x, y) { return setPosition(id, x, y); },
    setVisible(id, visible) {
      const el = nodes.get(id);
      if (!el) return;
      spots.get(id).visible = !!visible;
      el.hidden = !visible;
    },
    setEnabled(on) {
      state.enabled = !!on;
      nodes.forEach((el) => el.classList.toggle('is-disabled', !state.enabled));
    },
    setDevMode(on) { setDevMode(on); },
    getLayout() { return getLayout(); },
    startExecution() { startExecution(); },
    get executing() { return state.executing; },
    setExecutionCondition(label) {
      if (!CFG.execution || !label) return;
      CFG.execution.condition = label;
      state.execCondition = label;
      const conditionEl = execRoot && execRoot.querySelector('.exec-condition');
      if (conditionEl) conditionEl.textContent = '条件：' + label;
      window.dispatchEvent(new CustomEvent('game:execute-condition', { detail: { condition: label } }));
    },
    get executionCondition() {
      return state.execCondition || (CFG.execution && CFG.execution.condition) || null;
    },
    panelButtons: panelButtons,
    nodes: nodes,
    get active() { return state.active; }
  };

  /* ---------------- 启动 ---------------- */

  applyLayout();
  initArrows();
  buildFrames();
  buildOptionBar();
  buildPanelButtons();
  buildEditPanel();
  buildEditRing();
  buildKBox();
  buildHotspots();
  buildSprites();
  buildExecutionPanel();
  buildExecutionRoutes();
  buildPrologue();
  window.RoomStory.init({ stage: stage, onStartPrologue: startPrologue });

  /* 起点按钮：页面一打开就是选中状态，且永远不会被取消 */
  (CFG.initialPath || []).forEach((id) => {
    if (!nodes.has(id)) return;
    state.initial.push(id);
    state.path.push(id);
    state.active = id;
    mark(id);
  });
  redrawArrows();
  refreshUi();

  fitStage();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.body.classList.remove('is-booting');
    });
  });
  if (state.dev) setDevMode(true);

  window.addEventListener('resize', fitStage);
  window.addEventListener('orientationchange', fitStage);
  if (window.ResizeObserver) new ResizeObserver(fitStage).observe(stage);

  window.RoofUI = api;
})();

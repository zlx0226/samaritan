/* ============================================================
   ROOF / TR1 —— 布局与按钮配置
   想调整位置，改这里即可（或打开 devMode 直接拖）：
   x / y 的单位是「屋面图片 roof2.jpg 内部的百分比」，
   0% = 屋面最左/最上，100% = 屋面最右/最下。
   ============================================================ */

window.ROOF_UI_CONFIG = {
  /* 设计稿尺寸，仅用于把像素换算成缩放系数，一般不用改 */
  design: { width: 1920, height: 1080 },

  /* TR1 面板：以左上角为锚点，整体占画面的 62.5%
     宽 1200 = 画面的 62.5%，高按 16:9 自动算（也是 62.5%）
     背景框内侧可用范围约 x 24~1890、y 28~1060，
     所以宽度最大还能加到 1740 左右（90%） */
  tr1: {
    left: 56,            // 距画面左边（设计像素）：左上角锚点，缩放时不动
    top: 78,             // 距画面上边（设计像素）
    width: 1200          // 面板宽度（设计像素）= 画面的 62.5%
  },

  /* 屋面大小：占面板宽度的百分比。调小 = 面板边框留白变多，
     屋面按 roof2.jpg 的原始比例居中摆放，不会被拉伸
     （缩小幅度比 TR1 大，所以边框留白会明显变宽） */
  roofWidthPercent: 94,

  dialogue: {
    charDelay: 38,
    lineHoldMs: 650,
    poseTurnMs: 1000
  },

  roomMovement: {
    speedPctPerSecond: 26,
    interactionRadius: 14,
    bounds: [
      [26.76, 29.30],
      [94.14, 29.30],
      [94.14, 41.02],
      [79.49, 41.02],
      [79.49, 83.79],
      [94.14, 83.79],
      [94.14, 96.29],
      [5.27, 96.29],
      [5.27, 68.36],
      [34.18, 61.52],
      [34.18, 37.89],
      [26.76, 37.89]
    ]
  },

  roomInteractions: [
    {
      id: 'elder',
      kind: 'character',
      priority: 2,
      rect: [312.1, 192.9, 385.8, 291.2],
      bubble: { left: 70.70, top: 37.60, transform: 'translate(5%, -92%)' },
      big: 'assets/BB905_big.png'
    },
    {
      id: 'gdoor',
      kind: 'door',
      priority: 1,
      targetId: 'roomGdoor',
      rect: [331, 80, 415, 154.8],
      bubble: { left: 76.05, top: 15.63, transform: 'translate(5%, -92%)' },
      action: 'corridor'
    },
    {
      id: 'death',
      rect: [98, 35, 161, 188],
      bubble: { left: 27.45, top: 9.84, transform: 'translate(5%, -92%)' },
      lines: [
        '（很新的遗像，一个老太太。）',
        '老头：不要动我家东西！',
        '老头：请回你家，就在对门。'
      ]
    },
    {
      id: 'table-chair',
      rect: [14, 148, 175, 400],
      bubble: { left: 26.18, top: 30.71, transform: 'translate(5%, -92%)' },
      lines: [
        '老头：不要动我家东西！',
        '老头：请回你家，就在对门。'
      ]
    },
    {
      id: 'sofa',
      rect: [418, 219, 496, 430],
      bubble: { left: 96.68, top: 42.77, transform: 'translate(-92%, -92%)' },
      lines: [
        '老头：不要动我家东西！',
        '老头：请回你家，就在对门。'
      ]
    },
    {
      id: 'side-door',
      kind: 'door',
      priority: 1,
      targetId: 'roomSideDoor',
      rect: [0, 371, 20, 491],
      bubble: { left: -1.09, top: 72.46, transform: 'translate(8%, -92%)' },
      lines: [
        '老头：那边是卧室，不要去！',
        '老头：请回你家，就在对门。'
      ]
    }
  ],

  corridorMovement: {
    speedPctPerSecond: 14,
    bounds: [
      [10.46, 47.64],
      [97.77, 47.64],
      [97.77, 68.61],
      [84.62, 68.61],
      [84.62, 83.89],
      [74.54, 83.89],
      [74.54, 78.89],
      [55.23, 78.89],
      [55.23, 68.61],
      [7.54, 68.61],
      [7.54, 53.19],
      [10.46, 53.19]
    ],
    extraAreas: [
      [
        [0.00, 53.19],
        [10.46, 53.19],
        [10.46, 68.61],
        [0.00, 68.61]
      ],
      [
        [74.00, 78.89],
        [84.69, 78.89],
        [84.69, 100.00],
        [74.00, 100.00]
      ]
    ]
  },

  corridorCollisionBoxes: [
    { id: 'corridor-box-1', rect: [1, 6, 108, 395] },
    { id: 'corridor-box-2', rect: [709, 497, 961, 720] },
    { id: 'corridor-box-3', rect: [966, 621, 1085, 720] }
  ],
  corridorCollisionDebugVisible: false,

  corridorInteractions: [
    {
      id: 'corridor-box-1',
      kind: 'zone',
      rect: [0.077, 0.833, 8.308, 54.861],
      bubble: { left: 2.0, top: 30.0, transform: 'translate(5%, -92%)' },
      action: 'zone-wait'
    },
    {
      id: 'corridor-box-2',
      kind: 'zone',
      rect: [54.538, 69.028, 73.923, 100.000],
      bubble: { left: 73.92, top: 69.03, transform: 'translate(-92%, -92%)' },
      action: 'zone-wait'
    },
    {
      id: 'corridor-box-3',
      kind: 'zone',
      rect: [74.308, 86.250, 83.462, 100.000],
      bubble: { left: 83.46, top: 86.25, transform: 'translate(-92%, -92%)' },
      action: 'zone-wait'
    },
    {
      id: 'corridorGdoor901',
      rect: [19.23, 26.64, 28.059, 48.915],
      bubble: { left: 23.06, top: 26.64, transform: 'translate(5%, -92%)' },
      action: 'enter-hq1'
    },
    {
      id: 'corridorGdoor902',
      rect: [40.77, 26.64, 49.599, 48.915],
      bubble: { left: 44.60, top: 26.64, transform: 'translate(5%, -92%)' },
      action: 'visit-901'
    },
    {
      id: 'corridorGdoor903',
      rect: [64.38, 26.64, 73.209, 48.915],
      bubble: { left: 68.21, top: 26.64, transform: 'translate(5%, -92%)' },
      action: 'visit-901'
    },
    {
      id: 'corridorGdoor904',
      rect: [86.38, 26.64, 95.209, 48.915],
      bubble: { left: 95.21, top: 26.64, transform: 'translate(-92%, -92%)' },
      action: 'visit-901'
    },
    {
      id: 'corridorDoorS905',
      rect: [19.00, 66.92, 27.877, 72.3605],
      bubble: { left: 22.88, top: 66.92, transform: 'translate(5%, -92%)' },
      action: 'return-905'
    },
    {
      id: 'corridorDoorS906',
      rect: [41.00, 66.92, 49.877, 72.3605],
      bubble: { left: 44.88, top: 66.92, transform: 'translate(5%, -92%)' },
      action: 'visit-901'
    },
    {
      id: 'corridorDoorS907',
      rect: [91.12, 65.92, 99.19, 71.3605],
      bubble: { left: 99.19, top: 65.92, transform: 'translate(-92%, -92%)' },
      action: 'visit-901'
    }
  ],

  /* 901 点击区域：[左, 上, 右, 下]，单位是 1920×1080 设计画布的比例（%）。
     例如 [25, 50, 75, 80] 表示从画面横向 25% 到 75%、纵向 50% 到 80%。 */
  /* 主分析完成后第一次离开901触发的走廊时间轴。
     时间均为毫秒，角色 x/y 与背景使用同一套百分比坐标。 */
  corridorRitual: {
    floorTravelMs: 1000,
    landlady: {
      x: 30.2,
      y: 58.89,
      turnAtMs: 500,
      arriveAtMs: 4000,
      sprites: {
        front: 'assets/BB301.png',
        side: 'assets/BB301_side.png',
        back: 'assets/BB301_back.png'
      }
    },
    oldMan: {
      x: 23.44,
      y: 58.89,
      startAtMs: 1000,
      arriveAtMs: 8000,
      boardAtMs: 16000,
      boardedAtMs: 16600,
      sprites: {
        front: 'assets/BB905_c.png',
        side: 'assets/BB905_side.png',
        back: 'assets/BB905_c.png' // 暂无独立背面素材，先使用正面占位
      }
    },
    route: {
      corridorX: 79.5,
      approachX: 79.5,
      approachY: 70.86,
      boardX: 80.1,
      boardY: 74.6
    },
    elevator: {
      area: [74.3, 84.7, 84.6, 100],
      approachArea: [74.3, 78.89, 84.6, 84.7],
      interactionBubble: {
        left: 79.35,
        top: 78.2,
        transform: 'translate(-50%, -50%)'
      },
      display: { left: 79, top: 90 },
      currentFloor: 9,
      bottomFloor: 3,
      topFloor: 12,
      leavesNinthAtMs: 4000,
      reachesBottomAtMs: 10000,
      returnsToNinthAtMs: 16000,
      leavesNinthForTopAtMs: 16600,
      reachesTopAtMs: 19600
    },
    npcInteractionRadius: 9
  },

  hqInteractions: [
    {
      id: 'sofa',
      label: '沙发',
      zIndex: 10,
      areas: [[22.9167, 46, 76, 84]],
      lines: [
        '（真破旧，但坐上去还挺舒服的）',
        '（但现在还不是休息的时候）'
      ]
    },
    {
      id: 'bookshelf',
      label: '书架',
      action: 'inspect-books',
      zIndex: 5,
      priority: 2,
      areas: [
        [23.6979, 29.6296, 76.0000, 46.0000]
      ],
      lines: [
        '（好多纸质书，真罕见！）',
        '（有时间再来看吧！）'
      ]
    },
    {
      id: 'book-pile',
      label: '书堆',
      action: 'inspect-books',
      zIndex: 20,
      priority: 2,
      areas: [[51.8229, 70, 89, 91]],
      lines: [
        '（好多纸质书，真罕见！）',
        '（有时间再来看吧！）'
      ]
    },
    {
      id: 'key',
      label: '钥匙',
      priority: 2,
      zIndex: 30,
      areas: [[11.7188, 55.5556, 19.2708, 62.0370]],
      lines: [
        '（901的钥匙）',
        '（随身带着吧！现在可以锁门了）'
      ]
    },
    {
      id: 'lamp',
      label: '灯',
      zIndex: 30,
      areas: [[44.2708, 1.8519, 55.7292, 21.2963]],
      lines: [
        '（灯一直在闪，但灯管看起来没什么问题）',
        '（其他地方有接触不良吗？）'
      ]
    }
  ],
  hqInteractionDebugVisible: false,

  /* hq2 点击区域：[左, 上, 右, 下]，单位是 1920×1080 设计画布的比例（%）。
     当前只显示调试框和悬停效果，点击逻辑尚未绑定。 */
  hq2Interactions: [
    {
      id: 'server',
      label: '左侧服务器',
      areas: [[0.0, 8.0, 21.0, 100.0]],
      lines: [
        '（这是……服务器！）',
        '（总感觉是不多见的东西）',
        '（有需求的话，可以做到很多事吧）'
      ]
    },
    {
      id: 'monitor',
      label: '显示器屏幕',
      areas: [[37.2, 14.2000, 63, 42]],
      action: 'open-desktop'
    },
    {
      id: 'phone',
      label: '手机',
      areas: [[70.4745, 50.6250, 78.6907, 59.2188]],
      action: 'open-phone'
    }
  ],
  hq2InteractionDebugVisible: false,

  /* 电脑桌面布局：
     left / top / width / height 为 1920×1080 设计画布百分比；
     gap / padding / 字号使用设计像素，会随舞台统一缩放。 */
  desktopUI: {
    apps: {
      left: 6,
      top: 8,
      width: 10.8,
      gap: 103.68
    },
    task: {
      left: 6,
      top: 40,
      width: 88,
      height: 52,
      padding: 28,
      titleSize: 40,
      textSize: 28
    },
    exit: {
      right: 3.5,
      bottom: 2.5,
      fontSize: 22
    }
  },

  plot0: [
    '老头：哦！你终于醒了！',
    '……',
    '老头：你叫什么名字，年轻人？',
    '（什么都想不起来）',
    '老头：摔糊涂了？',
    '老头：今天早上我发现你晕倒在楼前，就把你拖了上来。',
    '老头：我猜你是外城来的吧？',
    '……',
    '老头：也不记得了？',
    '老头：算了。至少你可以知道你要去哪儿。',
    '？',
    '老头：我在你的包里发现了这个。',
    '老头：这里就是BB楼。而且你很走运，901就是我家对门。',
    '老头：但遗憾的是，这位奥奇女士一个月前被发现死在了家里，也就是901。',
    '老头：房东还没有找到这间凶房的租客，房客之前的用品也还没收拾完。我想你可以暂住在那里。',
    '老头：我就叫你奥奇算了。你看上去和那位足不出户的奥奇一样奇怪。',
    '老头：好了，你既然醒了，就回901看看吧！就在对面。'
  ],

  /* 按钮直径占屋面宽度的百分比 */
  buttonSize: 4.5,

  /* 装饰框的线条规格：照着 UI_TR1.png 量出来的
     （线距框边 10、线宽 3、缺口默认 135×17 挂在顶边，单位=设计像素）
     单个框可以用 notch 覆盖缺口：{ side: 'top'|'bottom'|'left'|'right', length, depth }，
     写 notch: null 表示没有缺口；dashed: 'horizontal' 让上下两条边变成虚线 */
  frameStyle: {
    lineInset: 10,
    lineWidth: 3,
    slitWidth: 5.5,
    slitLean: 0.4,
    notchOverrun: 4,      // 缺口的深度 = 距边距 + 线宽 + 这个值
                          // 也就是缺口从框外沿伸进来、越过边框线再多出一点，
                          // TR1 素材里就是这个关系（11 + 3 + 约 4 ≈ 17）
    dashLength: 34,       // 虚线单段长度（只对 dashed 的框有效）
    dashGap: 16,          // 虚线间隔
    notch: { side: 'top', length: 135, depth: 17 }
  },

  /* 另外三个装饰框（纯装饰）：两个扁的在 TR1 正下方一上一下，长的那个在 TR1 右侧。
     x / y / width / height 都是设计像素（1920×1080 坐标系）；
     color 不写就用默认框线色 #20302f */
  frames: [
    /* 扁的 · 上：没有缺口，上下两条边是虚线（单段更长），上下边再往外挪 */
    { id: 'panel-a', x: 56, y: 756, width: 1200, height: 100,
      notch: null, dashed: 'horizontal' },

    /* 扁的 · 下：明度略高，缺口在下边线上（深度走 frameStyle 的规则 ≈ 17，跨过边线） */
    { id: 'panel-b', x: 56, y: 869, width: 1200, height: 166,
      color: '#2f4442', notch: { side: 'bottom', length: 260 } },

    /* 长的 · 右侧：与最下面的扁框同色，缺口在右边线上（同样跨过边线） */
    { id: 'panel-c', x: 1282, y: 78, width: 596, height: 831,
      color: '#2f4442', notch: { side: 'right', length: 260 } }
  ],

  /* 面板按钮：同色系，摆在右侧长框下面，宽度约为右框宽的 70% 且居中。
     complete 点击后进入结算 / 执行模式 */
  panelButtons: [
    { id: 'panel-button', x: 1370, y: 935, width: 420, height: 100, label: 'complete' }
  ],

  /* 右侧框里的编辑界面：平时顶部只有一个「小旗」按钮，
     点它进入编辑模式（编辑最后被选中的那个圆按钮），再点「结束」退出。
     里面所有坐标都是图片像素，配合 canvas / box 换算成显示尺寸 */
  editPanel: {
    frame: 'panel-c',
    pad: 24,                 // 距装饰框内边
    gap: 14,                 // 子元素之间的间距
    flag: {                  // 小旗按钮（左右撑满框，图标居中小旗）
      size: 104, radius: 22, fill: 0.36,
      canvas: [1280, 720],
      box: [525, 126, 46, 79]        // flag.png 里小旗的包围盒
    },
    title: '指令',                    // 编辑模式顶部文字（替换小旗按钮）
    titleSize: 52,                    // “指令”二字字号
    addButton: { width: 260, height: 48, radius: 12, label: '添加+' },   // 扁形：更矮更宽
    endButton: { width: 240, height: 58, radius: 16, label: '保存' },

    /* 编辑时围住被编辑圆按钮的旋转装饰（basic_botton_t.png）：
       scale 是相对按钮直径的倍数；stepMs 是"顿一下"的间隔；
       steps 是一整圈分几档（8 = 每次逆时针 45°） */
    ring: { src: 'assets/basic_botton_t.png', scale: 1.75, stepMs: 1000, steps: 8 },

    /* if 行左上角"第几次选中"的圆标 */
    countBadge: { size: 34 },

    /* 编辑过内容的圆按钮，左上角的小旗标记 */
    editFlagMark: { size: 26, fill: 0.9 },

    ifRow: {
      src: 'assets/if.png',
      canvas: [1280, 720],
      box: [360, 69, 261, 193],      // if 图形本体
      hole: [100, 15, 128, 40],      // “if 后”的空框（垫纯色按钮）
      gapBox: [36, 72, 205, 71],     // “if”下方的缺口（右边线往里收了一点）
      /* 图形不透明（黄色）部分的轮廓，相对包围盒的像素矩形：
         只有点到这些区域才算“选中这一行”（添加→删除） */
      bars: [[0, 0, 261, 71], [0, 0, 36, 193], [0, 144, 258, 49]],
      width: 250,                    // 每行 if 的显示宽度
      topOffset: 26                  // 整块 if 行区域往下挪一点
    },

    /* 点 “if 后” 的格子后，最下框切换成这两个"条件"选项（黄色） */
    conditionOptions: ['路线安全', '路线危险']
  },

  /* 新手教学的 K 引导：
     台词显示在 panel-a（那条上下虚线的框）里，逐字打出来 */
  tutorial: {
    frame: 'panel-a',
    pad: 24,
    charDelay: 18,          // 每个字的间隔（ms），要快
    kLines: {
      commandIntro: '让我占先手，处理起来会更有余裕。',
      retreat: '现在可不是撤退的时候吧？',
      conflict: '这可不行。执行不了。',
      newOne: '直接冲过去肯定要起冲突的。',
      saveWait: '条件下没有指令的话就默认是等待了。',
      actionInvalid: '这可不行。执行不了',
      noParticipation: '驳回。请让我能够参与事件。'
    }
  },

  /* 前置互动：页面一打开先跑这一段通讯，跑完点「让我想想」进入指挥模式 */
  prologue: {
    /* 左上框：宽度不变、下边线拉到底（底部 78 + 957 = 1035） */
    tr1: { left: 56, top: 78, width: 1200, height: 957 },
    /* roof 依旧按 roofWidthPercent 居中；底下衬一块同宽的黑色矩形，填满框内高度 */
    /* 右侧通讯窗：下移，上下边线为虚线 */
    comms: { x: 1282, y: 160, width: 596, height: 875 },
    /* 通讯窗上方（框外）的两个选项 */
    topButtons: { y: 88, width: 200, height: 54, gap: 18, labels: ['切换', '添加'] },
    charDelay: 26,        // 每行逐字打出的速度
    lineDelay: 460,       // 一行打完到下一行开始的停顿
    dialogueLines: [
      'K：我到了。',
      '男：……老头，我说过，我的耐心是有限的吧！',
      'K：喂？你看得到吗？',
      '男：毛仔，别墨迹了！',
      'K：听起来有两个人。',
      'K：电话那头的，协助一下。'
    ],
    lines: [
      '男：……老头，我说过，我的耐心是有限的吧！',
      'K：我到了，听起来不太妙。',
      'K：喂？你看得到吗？',
      '男：毛仔，别墨迹了！',
      'K：有至少两个人。可以协助吗？'
    ],
    choice: '让我想想',
    channel: '频道1',
    channelDotMs: 260,
    firstLineDelay: 800,
    transitionMs: 900
  },

  /* 结算 / 执行模式：点 complete 后进入。
     routeGraph 是标注图里的红线网络；K 只沿 graph 的边移动。
     其中 o1→o2 这条边画橙色，并播放 K 向左转再立正的小动作。 */
  execution: {
    /* 没有下一点（路线终点）时的回退条件；有下一点时，会按前路是否进入监视光自动切换安全/危险 */
    condition: '路线安全',
    conflictPoint: 'new-1',
    dangerZone: { x1: 58, y1: 12, x2: 100, y2: 57 },
    dangerZoneEntry: { x: 70, y: 40 },
    dangerKillShift: 8,
    dangerKillFromBelowStage: { x: 90, y: 48 },
    dangerKillAdvanceMs: 1200,
    dangerKillShakeMs: 150,
    dangerKillFallMs: 360,
    dangerKillTransitionMs: 100,
    conditionPollMs: 300,
    waitTimeoutMs: 10000,
    travelMsPerPx: 6.5,
    climbTravelMsPerPx: 7.5,
    climbTurnMs: 500,
    actionPauseMs: 650,
    persuadePauseMs: 800,
    persuadeWalkMs: 2000,
    persuadeApproachMs: 500,
    takedownDashMs: 700,
    takedownApproachMs: 320,
    takedownFallMs: 480,
    takedownShakeMs: 240,
    /* 严格按标注图复刻：红线的每个拐点都是 graph 节点，橙色只保留 O1→O2 这一小段。 */
    routeGraph: {
      nodes: {
        a:  { x: 4.16,  y: 25.51 },   // 左侧楼梯口
        t1: { x: 15.43, y: 25.51 },   // 花盆上方的横向支点
        t2: { x: 26.36, y: 25.51 },   // 楼梯间左侧上方的横向支点
        b:  { x: 15.43, y: 83.89 },   // 花盆
        c:  { x: 26.36, y: 64.76 },   // 楼梯间左侧
        d:  { x: 49,    y: 26 },      // 新按钮 2
        p:  { x: 49,    y: 84.01 },   // 新按钮 2 下方拐点
        e:  { x: 76.54, y: 84.01 },   // 水箱
        f:  { x: 88.45, y: 22.95 },   // 新按钮 1
        o1: { x: 78.71, y: 71.48 },   // 橙色短段起
        o2: { x: 83.37, y: 49.00 }    // 橙色短段止（上端延长）
      },
      edges: [
        ['a', 't1'], ['t1', 't2'], ['t2', 'd'], ['d', 'f'],
        ['t1', 'b'], ['t2', 'c'], ['b', 'c'],
        ['d', 'p'], ['p', 'e'],
        ['e', 'o1'], ['o1', 'o2', 'orange'], ['o2', 'f']
      ]
    }
  },

  /* 选项条：贴在某个装饰框内部显示「当前按钮」的选项。
     当前按钮 = 鼠标悬停的那个；没悬停时 = 最后被选中的那个。
     frame 写装饰框的 id（这里是最下面那个扁框）；
     padding 是离框边的距离（右/上/下），paddingLeft 单独控制左边界（调大 = 选项整体右移）；
     gap 是两个选项之间的间距 */
  optionBar: { frame: 'panel-b', padding: 26, paddingLeft: 70, gap: 40 },

  /* 点击过的圆圈是否一直保持「变大 + 亮薄荷」：
     true（默认）= 全部保留，配合虚线箭头连成一条链；
     false = 只保留最后点击的那一个 */
  keepAllMarks: true,

  /* 页面一打开就处于选中状态的按钮（路线起点）：
     它们永远不会被取消——「取消」标注和 reset() 都动不了它们 */
  initialPath: ['stair-left'],

  /* 同一对按钮之间被多次连线时，每多一条就沿垂直方向错开多少
     （单位是箭头 SVG 的视图单位，3000 ≈ 整块屋面宽度，34 约等于 13 设计像素） */
  arrowOffset: 34,

  /* true：按钮可拖动微调，并在控制台/右下角输出百分比坐标 */
  devMode: false,

  /* 天台上的按钮（坐标已按你拖动后的结果更新）；
     options 是这个按钮对应的选项，悬停或选中它时显示在最下面的框里 */
  hotspots: [
    { id: 'flower-pot',      label: '花盆',       x: 15.43, y: 83.89, options: ['前进', '调查'] },
    { id: 'water-tank',      label: '水箱',       x: 76.54, y: 84.01, options: ['前进', '干预'] },
    { id: 'stair-left',      label: '楼梯间左侧', x: 26.36, y: 64.76, options: ['前进', '撤离'] },
    { id: 'stair-exit-left', label: '左侧楼梯口', x: 4.16,  y: 25.51, options: ['前进', '撤离'] },

    /* 新增的两个：位置已定，显示名还是占位（新按钮 1 / 2），
       要正式名字直接告诉我 */
    { id: 'new-1',           label: '新按钮 1',   x: 88.45, y: 22.95, options: [] },
    { id: 'new-2',           label: '新按钮 2',   x: 49,    y: 26,    options: ['前进', '干预'] }
  ]
};

/* 有些选项点下去不直接填进缺口，先在其上方弹出子选项 */
window.ROOF_UI_CONFIG.optionSubs = {
  '干预': ['劝说', '击杀', '击晕']
};

/* 站在天台上的角色立绘：垫在圆按钮下方（z 序在按钮之下）。
   anchor 可以是圆按钮 id，也可以是另一个立绘 id；
   dx / dy 是相对锚点中心的偏移（设计像素），height 是显示高度；
   canvas / box 是素材的画布尺寸和人物包围盒（像素），用来裁掉透明边距。 */
window.ROOF_UI_CONFIG.sprites = [
  { id: 'K',      src: 'assets/K.png',           anchor: 'stair-left', dx: 0,   dy: 0,
    height: 96,  squash: 1,    canvas: [256, 256],     box: [62, 16, 107, 237] },
  { id: 'bb905',  src: 'assets/BB905.png',       anchor: 'new-1',      dx: 0,   dy: 16,
    height: 104, squash: 0.88, canvas: [3000, 3000],   box: [736, 178, 1235, 2807] },
  /* 1001b / b2 来回切换（通讯界面里跑） */
  { id: 'bb1001', anchor: 'bb905', dx: 0, dy: 106, height: 100, squash: 0.88,
    frameMs: 680,
    frames: [
      { src: 'assets/BB1001_back_b.png',  canvas: [3000, 3000], box: [900, 207, 1441, 2767] },
      { src: 'assets/BB1001_back_b2.png', canvas: [3000, 3000], box: [900, 87, 1339, 2887] }
    ] },
  /* 1104 / 1104_side 左右镜像慢速切换，面前带红色警戒光 */
  { id: 'bb1104', anchor: 'bb905', dx: -100, dy: -8, height: 100, squash: 0.88,
    frameMs: 2800,
    frames: [
      { src: 'assets/BB1104.png',      canvas: [3000, 3000], box: [855, 177, 1114, 2794], tilt: -90, clip: 'down' },
      { src: 'assets/BB1104_side_mirror.png', canvas: [3000, 3000], box: [1170, 180, 928, 2791], tilt: -16, clip: 'left' }
    ],
    vision: { width: 360, height: 260 } }
];

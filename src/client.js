// dsh-plugin-rightbar — Client half: one shared right column, plugins as tabs.
//
// harness 没有「多个插件并排挂在聊天旁边」的位置：`details` 是 single 型、被工具详情
// 占着，`shell.overlay` 只是一层没有布局协调的浮层。每个想贴着聊天的插件都在浮层里
// 自己 `position:fixed; right:0`，谁 z-index 大谁赢，还各自去压 #root 的宽度。
//
// 这里做那个缺的位置：本插件往 `shell.overlay` 注册一个条目，条目的 `children` 声明
// 一个新的 list 型 slot `rightbar.tab`（与 ui-layout 的 AppFrame 声明 sidebar /
// details 是同一个机制）。别的插件往 `rightbar.tab` 注册 `{ id, label, order }`，
// 这里把它们排成标签页，一次显示一个（`renderSlot(..., { only: id })`，与
// conversation.view 的做法相同）。让出的宽度只由这里写一次：--rightbar-w。
//
// 别的插件这样接入（slots.inject 会等到声明出现再注册，加载先后无所谓）：
//   slots.inject('rightbar.tab', () => slots.register(
//     { name: 'rightbar.tab', id: 'my-plugin', label: '我的面板', order: 20 }, MyPanel))
// 接入方要切到自己的标签时发窗口事件，不 import 本插件（没装 rightbar 时没人听，无害）：
//   window.dispatchEvent(new CustomEvent('rightbar:activate', { detail: { id: 'my-plugin' } }))
//
// 挂载点：面板 portal 到 document.body，不留在 shell.overlay 的 DOM 里。overlay 层在宿主
// .frame（overflow:hidden）里面，而 #root 被让窄后面板整个落在 .frame 的盒子外；Chrome 让
// fixed 元素逃出祖先裁剪，Safari（WebKit 26.4 实测）照样按 .frame 裁 —— DOM 在、能点中、
// 屏幕上一片空白。portal 不影响 React context 与事件冒泡，renderSlot 照常。
//
// 层级：rightbar 是右侧唯一的管理者，z-index 高过还没迁移进来的浮动面板（500–530），
// 低于全屏模态（9997+）。之前写成 40，被媒体展示台（500）整块盖住。
window.__ModuleLoader__.load({
  id: 'dsh-plugin-rightbar',
  factory: (require) => {
    var module = { exports: {} }
    var React = require('react')
    var ReactDOM = require('react-dom')
    var h = React.createElement

    var TAB_SLOT = 'rightbar.tab'
    var WIDTH_VAR = '--rightbar-w'
    var STRIP = 32
    var MIN_WIDTH = 280
    var DEFAULT_WIDTH = 420
    var LAYER = 600
    var ACTIVATE_EVENT = 'rightbar:activate'

    // ---- per-viewer prefs (localStorage may be missing or throw) ----------

    function readPref(key, fallback) {
      try {
        var raw = window.localStorage.getItem('rightbar.' + key)
        return raw === null ? fallback : JSON.parse(raw)
      } catch (e) { return fallback }
    }

    function writePref(key, value) {
      try { window.localStorage.setItem('rightbar.' + key, JSON.stringify(value)) } catch (e) { /* prefs are a convenience */ }
    }

    // ---- tab list: a stable snapshot of the slot's entries ------------------

    function labelOf(entry) {
      var label = entry.options.label
      if (typeof label === 'function') label = label()
      return typeof label === 'string' && label.length > 0 ? label : entry.options.id
    }

    /** subscribe/getSnapshot pair over `rightbar.tab`; the snapshot only changes when ids or labels do. */
    function tabSource(slots) {
      var last = []
      var lastKey = ''
      function getSnapshot() {
        var tabs = slots.entries(TAB_SLOT)
          .filter(function (entry) { return entry.options.id !== undefined })
          .map(function (entry) { return { id: entry.options.id, label: labelOf(entry) } })
        var key = JSON.stringify(tabs)
        if (key !== lastKey) { last = tabs; lastKey = key }
        return last
      }
      function subscribe(fn) { return slots.subscribe(TAB_SLOT, fn) }
      return { getSnapshot: getSnapshot, subscribe: subscribe }
    }

    function clampWidth(width) {
      var max = Math.max(MIN_WIDTH, Math.round(window.innerWidth * 0.7))
      return Math.min(max, Math.max(MIN_WIDTH, Math.round(width)))
    }

    // ---- the reserved width: written in exactly one place -------------------

    function useReservedWidth(px) {
      React.useEffect(function () {
        var root = document.documentElement
        root.style.setProperty(WIDTH_VAR, px + 'px')
        return function () { root.style.removeProperty(WIDTH_VAR) }
      }, [px])
    }

    /** Drag the left edge; the width is committed to prefs on release. */
    function useResize(width, setWidth) {
      return React.useCallback(function (down) {
        down.preventDefault()
        var startX = down.clientX
        var startW = width
        var move = function (e) { setWidth(clampWidth(startW + startX - e.clientX)) }
        var up = function (e) {
          window.removeEventListener('pointermove', move)
          window.removeEventListener('pointerup', up)
          writePref('width', clampWidth(startW + startX - e.clientX))
        }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
      }, [width, setWidth])
    }

    /** 接入方发 rightbar:activate { id }：切到那个标签，收起着就先展开。 */
    function useActivation(pick, setOpen) {
      React.useEffect(function () {
        var onActivate = function (e) {
          var id = e && e.detail ? e.detail.id : undefined
          if (typeof id !== 'string') return
          pick(id)
          setOpen(true)
        }
        window.addEventListener(ACTIVATE_EVENT, onActivate)
        return function () { window.removeEventListener(ACTIVATE_EVENT, onActivate) }
      }, [pick, setOpen])
    }

    // ---- views ---------------------------------------------------------------

    function TabButton(props) {
      return h('button', {
        type: 'button',
        className: 'rb-tab' + (props.active ? ' active' : ''),
        title: props.tab.label,
        onClick: function () { props.onPick(props.tab.id) },
      }, props.tab.label)
    }

    function Strip(props) {
      return h('div', { className: 'rb-strip' },
        props.tabs.map(function (tab) {
          return h(TabButton, { key: tab.id, tab: tab, active: false, onPick: props.onOpen })
        }))
    }

    function Panel(props) {
      return h('div', { className: 'rb-panel' },
        h('div', { className: 'rb-grip', onPointerDown: props.onGrip }),
        h('div', { className: 'rb-head' },
          h('div', { className: 'rb-tabs' }, props.tabs.map(function (tab) {
            return h(TabButton, { key: tab.id, tab: tab, active: tab.id === props.activeId, onPick: props.onPick })
          })),
          h('button', { type: 'button', className: 'rb-close', title: '收起', onClick: props.onCollapse }, '›')),
        h('div', { className: 'rb-body' }, props.renderSlot(TAB_SLOT, {}, { only: props.activeId })))
    }

    function makeRightbar(slots) {
      var source = tabSource(slots)
      return function Rightbar(props) {
        var tabs = React.useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot)
        var openState = React.useState(function () { return readPref('open', true) })
        var activeState = React.useState(function () { return readPref('active', null) })
        var widthState = React.useState(function () { return clampWidth(readPref('width', DEFAULT_WIDTH)) })
        var open = openState[0]
        var width = widthState[0]
        var activeId = tabs.some(function (t) { return t.id === activeState[0] }) ? activeState[0] : (tabs.length > 0 ? tabs[0].id : null)
        var setOpen = React.useCallback(function (value) { openState[1](value); writePref('open', value) }, [])
        var pick = React.useCallback(function (id) { activeState[1](id); writePref('active', id) }, [])
        var onGrip = useResize(width, widthState[1])
        useActivation(pick, setOpen)
        useReservedWidth(tabs.length === 0 ? 0 : (open ? width : STRIP))
        if (tabs.length === 0) return null
        var view = !open
          ? h(Strip, { tabs: tabs, onOpen: function (id) { pick(id); setOpen(true) } })
          : h(Panel, {
            tabs: tabs, activeId: activeId, renderSlot: props.renderSlot,
            onPick: pick, onCollapse: function () { setOpen(false) }, onGrip: onGrip,
          })
        return ReactDOM.createPortal(view, document.body)
      }
    }

    // ---- demo tabs: prove another registrant lands in the declared slot -----

    function DemoTab(props) {
      return h('div', { className: 'rb-demo' },
        h('p', null, props.text),
        h('p', { className: 'rb-demo-note' }, '这是 rightbar 自带的演示标签，默认关闭；localStorage 设 rightbar.demo=true 打开。'))
    }

    function registerDemoTabs(slots) {
      if (readPref('demo', false) !== true) return
      slots.inject(TAB_SLOT, function () {
        return [
          slots.register({ name: TAB_SLOT, id: 'rightbar-demo-a', label: '演示 A', order: 90 },
            function () { return h(DemoTab, { text: '演示 A：从 rightbar.tab 渲染出来的第一个标签。' }) }),
          slots.register({ name: TAB_SLOT, id: 'rightbar-demo-b', label: '演示 B', order: 91 },
            function () { return h(DemoTab, { text: '演示 B：切换标签只渲染当前这一个。' }) }),
        ]
      })
    }

    // ---- plugin surface ------------------------------------------------------

    var CSS = [
      '#root{width:calc(100vw - var(' + WIDTH_VAR + ',0px)) !important;min-width:0}',
      '.rb-panel,.rb-strip{position:fixed;top:0;right:0;bottom:0;z-index:' + LAYER + ';pointer-events:auto;display:flex;flex-direction:column;box-sizing:border-box;',
      'background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,inherit);border-left:1px solid var(--dsw-alias-border-l3,#e5e7eb)}',
      '.rb-panel{width:var(' + WIDTH_VAR + ')}',
      '.rb-strip{width:' + STRIP + 'px;align-items:stretch;padding-top:8px;gap:4px}',
      '.rb-strip .rb-tab{writing-mode:vertical-rl;padding:10px 0;border-radius:0}',
      '.rb-grip{position:absolute;left:-4px;top:0;bottom:0;width:8px;cursor:col-resize;z-index:2}',
      '.rb-head{display:flex;align-items:center;gap:4px;padding:6px 6px 0;border-bottom:1px solid var(--dsw-alias-border-l3,#e5e7eb)}',
      '.rb-tabs{display:flex;gap:2px;flex:1;min-width:0;overflow-x:auto}',
      '.rb-tab{border:none;background:transparent;color:var(--dsw-alias-label-secondary,#888);font:inherit;font-size:12px;padding:6px 10px;border-radius:6px 6px 0 0;cursor:pointer;white-space:nowrap}',
      '.rb-tab:hover{color:var(--dsw-alias-label-primary,#222)}',
      '.rb-tab.active{color:var(--dsw-alias-label-primary,#222);box-shadow:inset 0 -2px 0 currentColor}',
      '.rb-close{border:none;background:transparent;color:var(--dsw-alias-label-secondary,#888);font-size:18px;line-height:1;padding:2px 8px;cursor:pointer}',
      '.rb-body{flex:1;min-height:0;overflow:auto;position:relative}',
      '.rb-demo{padding:16px;font-size:13px;line-height:1.6}',
      '.rb-demo-note{color:var(--dsw-alias-label-secondary,#888);font-size:12px}',
    ].join('')

    function apply(ctx) {
      var slots = ctx.get('slots')
      if (slots === undefined) return
      ctx.effect(function () {
        var style = document.createElement('style')
        style.dataset.plugin = 'dsh-plugin-rightbar'
        style.textContent = CSS
        document.head.appendChild(style)
        return function () { style.remove() }
      })
      var Rightbar = makeRightbar(slots)
      slots.inject('shell.overlay', function () {
        return slots.register({
          name: 'shell.overlay', id: 'rightbar', order: 10,
          children: { 'rightbar.tab': { kind: 'list', scope: 'root' } },
        }, Rightbar)
      })
      registerDemoTabs(slots)
    }

    module.exports = { name: 'rightbar', inject: ['slots'], apply: apply }
    return module.exports
  },
})

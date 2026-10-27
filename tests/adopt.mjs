// 让位式 bridge（localStorage['rightbar.adopt']）的回归检查。
//
//   node tests/adopt.mjs
//
// 钉住的口径：默认**关**；只认显式声明；动手方式只有"把 right 改成 var(--rightbar-w)"，
// 绝不搬 DOM；我们自己的面板不碰；关掉/卸载之后原样还回去。
import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CLIENT = path.join(HERE, '..', 'src', 'client.js')
const WIDTH_EXPR = 'var(--rightbar-w, 0px)'

let failed = 0
const check = (name, fn) => {
  try { fn(); console.log('ok   ' + name) } catch (error) { failed += 1; console.log('FAIL ' + name + ' — ' + error.message) }
}

/* ─────────── 一个够用的假 DOM ─────────── */

function el(className, { right = '', rect = null, computed = null } = {}) {
  const props = new Map()
  if (right) { props.set('right', { value: right, priority: '' }) }
  const node = {
    className,
    parentNode: null,
    children: [],
    attrs: new Map(),
    mutated: [],
    style: {
      getPropertyValue: (k) => (props.get(k)?.value ?? ''),
      getPropertyPriority: (k) => (props.get(k)?.priority ?? ''),
      setProperty: (k, v, priority) => {
        props.set(k, { value: v, priority: priority || '' })
        node.mutated.push(['set', k, v, priority || ''])
      },
      removeProperty: (k) => { props.delete(k); node.mutated.push(['remove', k]) },
    },
    getComputedStyle: () => computed,
    getBoundingClientRect: () => rect || { width: 0, height: 0 },
    setAttribute: (k, v) => node.attrs.set(k, v),
    getAttribute: (k) => (node.attrs.has(k) ? node.attrs.get(k) : null),
    hasAttribute: (k) => node.attrs.has(k),
    removeAttribute: (k) => node.attrs.delete(k),
  }
  node.appendChild = (child) => { child.parentNode = node; node.children.push(child); return child }
  return node
}

function makeEnv({ adopt = null, innerWidth = 1600 } = {}) {
  const body = el('body')
  const root = el('root')
  const head = { appended: [], appendChild: (n) => { head.appended.push(n) } }
  const store = new Map()
  if (adopt !== null) store.set('rightbar.adopt', String(adopt))
  const observers = []

  class FakeMutationObserver {
    constructor(callback) { this.callback = callback; this.observed = null; observers.push(this) }
    observe(target, options) { this.observed = { target, options } }
    disconnect() { this.disconnected = true }
    trigger() { this.callback([]) }
  }

  const walk = (node, out) => {
    for (const child of node.children) { out.push(child); walk(child, out) }
    return out
  }

  const document = {
    body,
    documentElement: el('html'),
    head,
    createElement: () => ({ dataset: {}, textContent: '', remove() { this.removed = true } }),
    querySelectorAll: (selector) => {
      const all = walk(body, [])
      if (selector === '[data-rightbar-adopt]') return all.filter((n) => n.hasAttribute('data-rightbar-adopt'))
      return []
    },
  }

  const timers = []
  const window = {
    __ModuleLoader__: { load: (spec) => { window.__spec = spec } },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
    },
    innerWidth,
    getComputedStyle: (node) => node.getComputedStyle(),
    setTimeout: (fn) => { timers.push(fn); return timers.length },
    clearTimeout: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    MutationObserver: FakeMutationObserver,
  }

  return { body, root, head, document, window, observers, timers, store }
}

function loadPlugin(env) {
  const context = { window: env.window, document: env.document, JSON, Math }
  vm.createContext(context)
  vm.runInContext(fs.readFileSync(CLIENT, 'utf8'), context)
  const spec = env.window.__spec
  assert.ok(spec && typeof spec.factory === 'function', 'client.js 没有注册 factory')
  const fakeReact = {
    createElement: (...a) => ({ tag: a[0], props: a[1] }),
    useState: (v) => [v, () => {}],
    useCallback: (fn) => fn,
    useEffect: () => {},
    useSyncExternalStore: (_sub, get) => get(),
    Fragment: 'Fragment',
  }
  const module = spec.factory((name) => {
    if (name === 'react') return fakeReact
    if (name === 'react-dom') return { createPortal: (node) => node }
    throw new Error('unexpected require ' + name)
  })
  return module
}

/** 跑一次 apply()，返回 effect 的撤销器列表。 */
function apply(module, env) {
  const disposers = []
  const slots = {
    inject: (_key, callback) => callback(),
    register: () => ({ dispose() {} }),
    entries: () => [],
    subscribe: () => () => {},
  }
  module.apply({
    get: (name) => (name === 'slots' ? slots : undefined),
    effect: (fn) => { const disposer = fn(); if (typeof disposer === 'function') disposers.push(disposer) },
  })
  return () => { for (const d of disposers.reverse()) d() }
}

/* ─────────── 默认关 ─────────── */

check('没设 localStorage ⇒ 什么都不碰', () => {
  const env = makeEnv()
  const foreign = env.body.appendChild(el('their-panel', { right: '' }))
  foreign.setAttribute('data-rightbar-adopt', '1')
  apply(loadPlugin(env), env)
  assert.deepStrictEqual(foreign.mutated, [], '默认关就该一个 style 都不写')
  assert.strictEqual(foreign.hasAttribute('data-rightbar-adopted'), false)
})

check('设了看不懂的值 ⇒ 也按关处理', () => {
  const env = makeEnv({ adopt: 'yes-please' })
  const foreign = env.body.appendChild(el('their-panel'))
  foreign.setAttribute('data-rightbar-adopt', '1')
  apply(loadPlugin(env), env)
  assert.deepStrictEqual(foreign.mutated, [])
})

/* ─────────── declared：只处理声明了的 ─────────── */

check('declared：声明过的让位（right 改成 var(--rightbar-w)），没声明的无视', () => {
  const env = makeEnv({ adopt: 'declared' })
  const declared = env.body.appendChild(el('their-panel'))
  declared.setAttribute('data-rightbar-adopt', '1')
  const notDeclared = env.body.appendChild(el('their-panel-2'))
  apply(loadPlugin(env), env)
  assert.strictEqual(declared.style.getPropertyValue('right'), WIDTH_EXPR)
  assert.strictEqual(declared.style.getPropertyPriority('right'), 'important')
  assert.strictEqual(declared.getAttribute('data-rightbar-adopted'), '1')
  assert.deepStrictEqual(notDeclared.mutated, [])
})

check('declared：我们自己的面板（.rb-panel / .rb-strip）不碰', () => {
  const env = makeEnv({ adopt: 'declared' })
  const panel = env.body.appendChild(el('rb-panel'))
  const inner = panel.appendChild(el('their-nested-panel'))
  inner.setAttribute('data-rightbar-adopt', '1')
  apply(loadPlugin(env), env)
  assert.deepStrictEqual(inner.mutated, [], 'rightbar 自己的子树里不该被动过')
})

check('卸载后原样还回去（原来的 inline right 优先保留）', () => {
  const env = makeEnv({ adopt: 'declared' })
  const declared = env.body.appendChild(el('their-panel', { right: '12px' }))
  declared.setAttribute('data-rightbar-adopt', '1')
  const dispose = apply(loadPlugin(env), env)
  assert.strictEqual(declared.style.getPropertyValue('right'), WIDTH_EXPR)
  dispose()
  assert.strictEqual(declared.style.getPropertyValue('right'), '12px', '要还原成调用前那个值')
  assert.strictEqual(declared.hasAttribute('data-rightbar-adopted'), false)
})

check('卸载后原本没有 inline right 的，就删掉属性（不留脏值）', () => {
  const env = makeEnv({ adopt: 'declared' })
  const declared = env.body.appendChild(el('their-panel'))
  declared.setAttribute('data-rightbar-adopt', '1')
  const dispose = apply(loadPlugin(env), env)
  dispose()
  assert.strictEqual(declared.style.getPropertyValue('right'), '')
})

/* ─────────── all：按样式猜，但保守 ─────────── */

check('all：只收编「fixed + 贴右 + 不太宽 + 不太矮」的浮层', () => {
  const env = makeEnv({ adopt: 'all', innerWidth: 1600 })
  const good = env.body.appendChild(el('their-rail', {
    computed: { position: 'fixed', right: '0px' },
    rect: { width: 400, height: 800 },
  }))
  const modal = env.body.appendChild(el('their-modal', {
    computed: { position: 'fixed', right: '0px' },
    rect: { width: 1500, height: 900 },
  }))
  const toast = env.body.appendChild(el('their-toast', {
    computed: { position: 'fixed', right: '0px' },
    rect: { width: 300, height: 40 },
  }))
  const shifted = env.body.appendChild(el('their-shifted', {
    computed: { position: 'fixed', right: '16px' },
    rect: { width: 300, height: 600 },
  }))
  const inline = env.body.appendChild(el('their-inline', {
    computed: { position: 'relative', right: '0px' },
    rect: { width: 300, height: 600 },
  }))
  apply(loadPlugin(env), env)
  assert.strictEqual(good.style.getPropertyValue('right'), WIDTH_EXPR, '该收编的没收编')
  for (const [name, node] of Object.entries({ modal, toast, shifted, inline })) {
    assert.deepStrictEqual(node.mutated, [], name + ' 不该被动过')
  }
})

/* ─────────── 观察与调度 ─────────── */

check('declared：装了一个 MutationObserver，卸载时 disconnect', () => {
  const env = makeEnv({ adopt: 'declared' })
  const dispose = apply(loadPlugin(env), env)
  assert.strictEqual(env.observers.length, 1, '要观察新插入的声明面板')
  assert.strictEqual(env.observers[0].observed.options.subtree, true)
  dispose()
  assert.strictEqual(env.observers[0].disconnected, true)
})

check('后加进来的声明面板：一次 schedule 之后就被收编', () => {
  const env = makeEnv({ adopt: 'declared' })
  apply(loadPlugin(env), env)
  const late = env.body.appendChild(el('their-late-panel'))
  late.setAttribute('data-rightbar-adopt', '1')
  env.observers[0].trigger()            // 真 MutationObserver 在 DOM 变更时会这样回调
  assert.strictEqual(env.timers.length, 1, '应该排了一次合并扫描')
  env.timers[0]()                       // 跑掉那个 150ms 定时器
  assert.strictEqual(late.style.getPropertyValue('right'), WIDTH_EXPR)
  env.observers[0].trigger()
  assert.strictEqual(env.timers.length, 2, '再触发一次还能排（没被自己卡死）')
})

check('JSON 字符串形式（localStorage 里写 "declared"）也认', () => {
  const env = makeEnv({ adopt: '"declared"' })
  const declared = env.body.appendChild(el('their-panel'))
  declared.setAttribute('data-rightbar-adopt', '1')
  apply(loadPlugin(env), env)
  assert.strictEqual(declared.style.getPropertyValue('right'), WIDTH_EXPR)
})

process.exitCode = failed === 0 ? 0 : 1
console.log(failed === 0 ? '\nALL PASS' : '\n' + failed + ' 项失败')

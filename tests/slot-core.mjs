// 用 harness 真的 SlotCore 和 React 跑 rightbar：插件能不能自己声明一个 slot，
// 别的插件能不能往里注册，标签页渲染出来的是不是对的那一个。
//
//   cd $DSH_REPO && node --import tsx/esm /path/to/dsh-plugin-rightbar/tests/slot-core.mjs
//
// DSH_REPO 默认是本插件同级目录 deepseek-harness（与 lens/scripts/install.sh 同一约定）。
import fs from 'node:fs'
import vm from 'node:vm'
import path from 'node:path'
import assert from 'node:assert'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PLUGIN = path.join(HERE, '..')
const DSH = process.env.DSH_REPO || path.join(PLUGIN, '..', 'deepseek-harness')
const { SlotCore } = await import(path.join(DSH, 'packages/client/ui-slots/src/index.ts'))
const harnessRequire = createRequire(path.join(DSH, 'packages/client/ui-brand-official/package.json'))
const React = harnessRequire('react')
const { renderToStaticMarkup } = harnessRequire('react-dom/server')

let failed = 0
const check = (name, fn) => {
  try { fn(); console.log('ok   ' + name) } catch (error) { failed += 1; console.log('FAIL ' + name + ' — ' + error.message) }
}

/** ctx.slots 的最小等价物：register/entries/subscribe 直通 SlotCore，inject 照 registry.inject 的语义等声明。 */
function slotsOver(core) {
  const injected = new Map()
  const run = (key, callback) => {
    const result = callback()
    const disposers = typeof result === 'function' ? [result] : [...result]
    return () => disposers.reverse().forEach(d => d())
  }
  return {
    register: (options, component) => core.register(options, component),
    entries: key => core.entries(key),
    subscribe: (key, fn) => core.subscribe(key, fn),
    inject(key, callback) {
      const state = { active: undefined, epoch: undefined }
      const reconcile = () => {
        const epoch = core.declarationEpoch(key)
        if (state.active !== undefined && state.epoch === epoch) return
        state.active?.()
        state.active = undefined
        if (core.specDynamic(key) === undefined) return
        state.active = run(key, callback)
        state.epoch = epoch
      }
      core.subscribeDeclaration(key, reconcile)
      reconcile()
      injected.set(key, state)
    },
    /** 测试用：撤掉某个 inject 当前注册的东西（模拟插件卸载）。 */
    drop(key) { const s = injected.get(key); s.active?.(); s.active = undefined },
  }
}

/** 在 vm 里执行 src/client.js，拿到插件对象。 */
function loadPlugin() {
  const factories = new Map()
  const context = {
    window: { __ModuleLoader__: { load: r => factories.set(r.id, r.factory) }, localStorage: { getItem: k => (k === 'rightbar.demo' ? 'true' : null), setItem() {} }, innerWidth: 1600, addEventListener() {}, removeEventListener() {} },
    document: { body: {}, documentElement: { style: { setProperty() {}, removeProperty() {} } }, createElement: () => ({ dataset: {}, remove() {} }), head: { appendChild() {} } },
    JSON, Math,
  }
  vm.createContext(context)
  vm.runInContext(fs.readFileSync(path.join(PLUGIN, 'src', 'client.js'), 'utf8'), context)
  // 服务端渲染不支持 portal：测试里让 createPortal 原样返回元素，只验证渲染出来的内容。
  const ReactDOM = { createPortal: element => element }
  return factories.get('dsh-plugin-rightbar')(id => {
    if (id === 'react') return React
    if (id === 'react-dom') return ReactDOM
    throw new Error('unexpected require ' + id)
  })
}

const core = new SlotCore()
// 宿主 AppFrame 做的事：在 root 下声明 shell.overlay。
core.register({ name: 'root', children: { 'shell.overlay': { kind: 'list', scope: 'root' } } }, () => null)
const slots = slotsOver(core)
const ids = key => core.entries(key).map(e => e.options.id)

// 别的插件先加载：此时 rightbar.tab 还没声明，inject 必须等着而不是抛错。
const Other = () => React.createElement('div', null, 'OTHER-BODY')
slots.inject('rightbar.tab', () => slots.register({ name: 'rightbar.tab', id: 'other', label: '别的插件', order: 20 }, Other))

check('声明前：rightbar.tab 不存在，别的插件的注册在等', () => {
  assert.strictEqual(core.specDynamic('rightbar.tab'), undefined)
  assert.deepStrictEqual(ids('rightbar.tab'), [])
})

const plugin = loadPlugin()
plugin.apply({ get: name => (name === 'slots' ? slots : undefined), effect: fn => fn() })

check('apply 后：rightbar 挂在 shell.overlay，rightbar.tab 被声明成 list', () => {
  assert.deepStrictEqual(ids('shell.overlay'), ['rightbar'])
  assert.strictEqual(core.specDynamic('rightbar.tab').kind, 'list')
})

check('先等着的别的插件自动落进来，演示标签也在', () => {
  assert.deepStrictEqual([...ids('rightbar.tab')].sort(), ['other', 'rightbar-demo-a', 'rightbar-demo-b'])
})

check('再有人声明 rightbar.tab 会被拒（整页只有一个 rightbar）', () => {
  assert.throws(() => core.register({ name: 'shell.overlay', id: 'rightbar-2', children: { 'rightbar.tab': { kind: 'list', scope: 'root' } } }, () => null), /already declared/)
})

check('渲染：每个标签都有按钮，正文只渲染当前那一个', () => {
  const Rightbar = core.entries('shell.overlay')[0].component
  const calls = []
  const renderSlot = (key, owner, opts) => { calls.push({ key, only: opts && opts.only }); return 'BODY-OF-' + (opts && opts.only) }
  const html = renderToStaticMarkup(React.createElement(Rightbar, { renderSlot }))
  for (const label of ['别的插件', '演示 A', '演示 B']) assert.ok(html.includes('>' + label + '<'), '没有标签按钮 ' + label)
  assert.strictEqual(calls.length, 1, 'renderSlot 应只调一次')
  assert.strictEqual(calls[0].key, 'rightbar.tab')
  assert.ok(html.includes('BODY-OF-' + calls[0].only), '正文不是 renderSlot 给的那一个')
  assert.ok(ids('rightbar.tab').includes(calls[0].only), '渲染的 id 不在标签列表里')
})

check('rightbar 卸载：声明消失，标签一起撤掉', () => {
  slots.drop('shell.overlay')
  assert.strictEqual(core.specDynamic('rightbar.tab'), undefined)
  assert.deepStrictEqual(ids('rightbar.tab'), [])
})

check('rightbar 重新挂上：别的插件不用重载，自己回来', () => {
  const s = slotsOver(core)
  s.inject('shell.overlay', () => core.register({ name: 'shell.overlay', id: 'rightbar', children: { 'rightbar.tab': { kind: 'list', scope: 'root' } } }, () => null))
  assert.ok(ids('rightbar.tab').includes('other'), '别的插件没有自动重新注册：' + JSON.stringify(ids('rightbar.tab')))
})

process.exitCode = failed === 0 ? 0 : 1
console.log(failed === 0 ? '\nALL PASS' : '\n' + failed + ' 项失败')

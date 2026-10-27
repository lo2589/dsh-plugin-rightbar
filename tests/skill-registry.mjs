// 集成检查：把 src/skill.js 挂到**真的** SkillRegistry 上，确认目录里有它、正文能取到、卸载后消失。
//
// 跟 slot-core.mjs 一样需要 harness 仓库，且必须**在 harness 目录里跑**（tsx 在宿主那棵树里）：
//
//   cd /path/to/deepseek-harness
//   DSH_REPO=$PWD node --import tsx/esm /path/to/dsh-plugin-rightbar/tests/skill-registry.mjs
//
// 为什么非要有这一条：单元测试里的 ctx.skills.register 是假的，抓不到"字段缺失"这类问题。
// 实锤过一次：漏了 `source` ⇒ skill 能列出、加载时却抛 TypeError，目录里看得见却用不了。
import assert from 'node:assert'
import path from 'node:path'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PLUGIN = path.join(HERE, '..')
const DSH = process.env.DSH_REPO || path.join(PLUGIN, '..', 'deepseek-harness')

// 裸包名按"本文件的 URL"解析 —— 在插件目录里 import '@deepseek-ai/…' 找不到。
// 所以把解析锚点放在 harness 里声明了这两个依赖的包上（skill 自己），再从它的视角取入口。
const anchor = createRequire(path.join(DSH, 'packages', 'skill', 'skill', 'package.json'))
const entry = (name) => pathToFileURL(anchor.resolve(name)).href

const { Context } = await import(entry('@deepseek-ai/cordis'))
const { default: SkillRegistry } = await import(entry('@deepseek-ai/dsh-skill'))
const plugin = createRequire(import.meta.url)(path.join(PLUGIN, 'src', 'skill.js'))

let failed = 0
const check = (name, fn) => {
  try { fn(); console.log('ok   ' + name) } catch (error) { failed += 1; console.log('FAIL ' + name + ' — ' + error.message) }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 50))

const ctx = new Context()
await ctx.plugin(SkillRegistry)
const fiber = ctx.plugin(plugin)
await settle()

const catalog = await ctx.skills.list()
check('目录里有 rightbar-tab', () => {
  assert.ok(catalog.some((skill) => skill.name === 'rightbar-tab'), '目录里没有 rightbar-tab：' + JSON.stringify(catalog.map(s => s.name)))
})

const loaded = await ctx.skills.get('rightbar-tab')
check('取到的正文就是 skills/rightbar-tab.md（加载不抛错）', () => {
  assert.ok(loaded, 'ctx.skills.get 拿不到这条 skill')
  assert.match(loaded.content, /^# Attach a panel to the DSH right sidebar/)
  assert.ok(loaded.content.includes('rightbar.tab'))
  assert.ok(loaded.content.includes('rightbar:activate'))
  assert.strictEqual(typeof loaded.source, 'string')
  assert.ok(loaded.source.length > 0, 'source 不能是空串')
})

check('description 足够长（模型只看得到这一行）', () => {
  assert.ok(loaded.description.length > 60)
  assert.match(loaded.description, /rightbar/i)
})

await fiber.dispose()
await settle()
const after = await ctx.skills.list()
check('卸载后目录里没有它了', () => {
  assert.ok(!after.some((skill) => skill.name === 'rightbar-tab'), '卸载后还留着：' + JSON.stringify(after.map(s => s.name)))
})

process.exitCode = failed === 0 ? 0 : 1
console.log(failed === 0 ? '\nALL PASS' : '\n' + failed + ' 项失败')

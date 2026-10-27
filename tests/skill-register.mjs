// src/skill.js：不依赖宿主任何包（只用 ctx.skills.register()）。用一个假 ctx 真跑一遍。
//
//   node tests/skill-register.mjs
import assert from 'node:assert'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const SKILL_MODULE = '../src/skill.js'
const plugin = require(SKILL_MODULE)

let failed = 0
const check = (name, fn) => {
  try { fn(); console.log('ok   ' + name) } catch (error) { failed += 1; console.log('FAIL ' + name + ' — ' + error.message) }
}

check('插件声明了 skills 依赖，entry id 是 rightbar-skill', () => {
  assert.strictEqual(plugin.name, 'rightbar-skill')
  assert.deepStrictEqual(plugin.inject, ['skills'])
  assert.strictEqual(typeof plugin.apply, 'function')
})

const registered = []
plugin.apply({ skills: { register: (skill) => { registered.push(skill); return () => {} } } })

check('注册了一个 rightbar-tab skill，字段合法', () => {
  assert.strictEqual(registered.length, 1)
  const skill = registered[0]
  assert.strictEqual(skill.name, 'rightbar-tab')
  assert.match(skill.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'skill 名必须是 kebab-case')
  assert.ok(skill.description.length > 40, 'description 是给模型看的目录项，太短等于没有')
  assert.strictEqual(typeof skill.content, 'string')
})

check('正文把接入口径写全了', () => {
  const body = registered[0].content
  for (const needle of [
    'rightbar.tab',
    "slots.inject('rightbar.tab'",
    'slots.register(',
    'rightbar:activate',
    'position:fixed',
    '--rightbar-w',
    'z-index: 600',
    'data-rightbar-adopt',
  ]) assert.ok(body.includes(needle), '正文缺 ' + needle)
})

check('正文要求把 rightbar 当可选座位（不 import、不进依赖）', () => {
  const body = registered[0].content
  assert.match(body, /optional/i)
  assert.ok(body.includes('import'))
  assert.match(body, /(dependency|peerDependency)/)
})

/** 让读正文这一个文件必然失败（只拦 rightbar-tab.md，别影响模块加载本身）。 */
function withMissingBody(fn) {
  const fs = require('node:fs')
  const real = fs.readFileSync
  fs.readFileSync = (target, ...rest) =>
    String(target).endsWith('rightbar-tab.md') ? (() => { throw new Error('ENOENT: 模拟正文缺失') })() : real(target, ...rest)
  try {
    delete require.cache[require.resolve(SKILL_MODULE)]
    return fn(require(SKILL_MODULE))          // skill.js 在 require 时就解构了 readFileSync ⇒ 必须在补丁内 require
  } finally {
    fs.readFileSync = real
    delete require.cache[require.resolve(SKILL_MODULE)]
  }
}

check('读不到正文时不炸，也不注册，只 warn', () => {
  const warnings = []
  let registers = 0
  withMissingBody((fresh) => {
    fresh.apply({ skills: { register: () => { registers += 1 } }, logger: { warn: (msg) => warnings.push(msg) } })
  })
  assert.strictEqual(registers, 0, '读不到正文就不该注册半成品 skill')
  assert.strictEqual(warnings.length, 1, '要 warn 一次，别静默')
})

check('没有 logger 也不会炸（宿主可能没给）', () => {
  withMissingBody((fresh) => { fresh.apply({ skills: { register: () => {} } }) })
})

process.exitCode = failed === 0 ? 0 : 1
console.log(failed === 0 ? '\nALL PASS' : '\n' + failed + ' 项失败')

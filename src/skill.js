// dsh-plugin-rightbar — skill provider row.
//
// Ships one agent-facing skill, `rightbar-tab`, so that whoever has this plugin
// installed also has the integration rules in their session skill catalog: an
// agent writing another panel for this harness finds the slot name, the
// registration call, the three hard rules, the optional-seat fallback and the
// activation event without reading this repository.
//
// Deliberately dependency-free: `ctx.skills.register()` is a Cordis service call
// (it returns the effect disposer that unregisters the skill), so this file
// needs nothing from the host tree — the same reason the host half is empty.
'use strict'

const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const SKILL_NAME = 'rightbar-tab'
const BODY = join(__dirname, '..', 'skills', 'rightbar-tab.md')
const DESCRIPTION = 'Attach a panel to the DeepSeek Harness web right sidebar: register a tab into the '
  + '`rightbar.tab` slot instead of pinning a `position:fixed` panel. Use when a web plugin needs a tray, '
  + 'monitor, inspector or log viewer next to Chat, when a floating panel overlaps other plugins, or when '
  + 'an existing panel should move into the shared right column.'

module.exports = {
  name: 'rightbar-skill',
  inject: ['skills'],
  apply(ctx) {
    let content
    try {
      content = readFileSync(BODY, 'utf8')
    } catch (error) {
      // Missing asset must not take the plugin down: the sidebar itself still works.
      ctx.logger?.warn?.(`rightbar: skill body unreadable (${BODY}): ${error?.message ?? error}`)
      return
    }
    ctx.skills.register({ name: SKILL_NAME, description: DESCRIPTION, content })
  },
}

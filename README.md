# dsh-plugin-rightbar

A shared right sidebar for DeepSeek Harness: one column beside Chat, plugins appear in it as tabs.

The harness has no such seat. `details` is a single slot already held by the tool-details panel, and
`shell.overlay` is a floating layer with no layout coordination, so every plugin that wants to sit next
to Chat pins its own `position:fixed; right:0` panel and they cover each other.

This plugin registers one entry into `shell.overlay` whose `children` declare a new list slot,
`rightbar.tab`, the same mechanism the host's AppFrame uses to declare `sidebar` and `details`.

## Contributing a tab

```js
slots.inject('rightbar.tab', () => slots.register(
  { name: 'rightbar.tab', id: 'my-plugin', label: 'My panel', order: 20 },
  MyPanel,
))
```

`slots.inject` waits for the declaration, so load order does not matter. The reserved width is written
once, as `--rightbar-w` on `<html>`; a tab must not set `position:fixed` or resize `#root` itself.

## Install

```bash
cd /path/to/deepseek-harness
node --import tsx/esm apps/cli/src/bin.ts plugin --profile web add link:/path/to/dsh-plugin-rightbar
```

## Test

```bash
cd /path/to/deepseek-harness
node --import tsx/esm /path/to/dsh-plugin-rightbar/tests/slot-core.mjs
```

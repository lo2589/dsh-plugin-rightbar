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

## 报错记录

每条：现象 → 根因 → 证据 → 修复。验证一律在真实 dsh 页面上用 vco 截图 + 读 DOM，Chromium 和 Safari 各一遍；只靠 SlotCore 单测抓不到下面任何一条。

### 2026-10-07 · 面板被「媒体展示台」盖住

- **现象**：右侧一列只露出左边约 120px，其余被 quick-config 的「媒体展示台」压住。
- **根因**：rightbar 与其他插件的浮动面板同在宿主 overlay 层，按 z-index 比高低。rightbar 写成 `z-index:40`，媒体展示台是 `500`。
- **证据**：`document.elementFromPoint` 在面板中心命中 `.sc-head` / `.sc-title`（展示台），不在 rightbar 内。
- **修复**：`85ea8a5` z-index 提到 600（高过 500–530 的浮动面板，低于 9997+ 的全屏模态）；quick-config `0a57a2b` 把展示台改为软接入 `rightbar.tab`，不再自己浮着。

### 2026-10-07 · Safari 里右侧只有空白

- **现象**：Chrome 正常；Safari 26.4 里 `#root` 已让出宽度，右侧却一片空白。
- **根因**：overlay 层在宿主 `.frame`（`overflow:hidden`）里面，`#root` 让窄后面板（`position:fixed`）整个落在 `.frame` 的盒子之外。Chrome 让 fixed 元素逃出祖先裁剪，Safari 照样按 `.frame` 裁掉。
- **证据**：Safari 里面板在 DOM 中（x=1018, w=515, `visibility:visible`, `opacity:1`, z=600），`elementFromPoint` 命中 `.rb-tabs`，屏幕却是空的；临时把 `.frame` 的 `overflow` 改成 `visible`，面板立刻出现，改回即消失。Playwright 的无头 WebKit 复现不了，必须在真实 Safari 里查（Safari 设置 → 开发者 → 允许 Apple 事件中的 JavaScript，然后 `osascript … do JavaScript`）。
- **修复**：`5302be9` 面板与收起竖条用 `ReactDOM.createPortal` 挂到 `document.body`，不碰宿主 `.frame`。

### 观察到但不属于 rightbar

- 2026-10-07：页面加载时 `GET /plugins/known-manage/split` 返回 HTTP 400，共 11 次。来源是 dsh-plugin-known-manage，不是 rightbar。

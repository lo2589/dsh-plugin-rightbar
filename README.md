# dsh-plugin-rightbar

A shared right sidebar for DeepSeek Harness: one column beside Chat, and every plugin that wants to live
there contributes a **tab** instead of fighting over `position:fixed`.

## Why this exists

The harness has no such seat. `details` is a single slot already held by the tool-details panel, and
`shell.overlay` is a floating layer with no layout coordination — so every plugin that wants to sit next
to Chat pins its own `position:fixed; right:0` panel and they cover each other. The winner is whoever
picked the bigger `z-index`.

This plugin registers one entry into `shell.overlay` whose `children` declare a new list slot,
`rightbar.tab` — the same mechanism the host's AppFrame uses to declare `sidebar` and `details`.

## The contract

| what | value |
| --- | --- |
| slot name | `rightbar.tab` (`kind: 'list'`, `scope: 'root'`) |
| registration | `slots.register({ name: 'rightbar.tab', id, label, order }, Component)` |
| reserved width | `--rightbar-w` on `<html>` — written once, here |
| switch to my tab | `window.dispatchEvent(new CustomEvent('rightbar:activate', { detail: { id } }))` |
| layer | `z-index: 600` — above legacy floating panels (`500`–`530`), below full-screen modals (`9997+`) |
| preferences | `localStorage`: `rightbar.open` / `rightbar.active` / `rightbar.width` |

## Contributing a tab

```js
slots.inject('rightbar.tab', () => slots.register(
  { name: 'rightbar.tab', id: 'my-plugin', label: 'My panel', order: 20 },
  MyPanel,
))
```

- `slots.inject` **waits for the declaration**, so load order does not matter: your registration lands
  whenever rightbar appears, and is withdrawn automatically when it goes away.
- rightbar stays **optional** for you. If it is not installed, `rightbar.tab` is never declared, the
  inject never fires, and your own floating panel keeps working — keep that fallback.
- Inside the tab, fill the box you are given (width and height come from rightbar): no `position:fixed`,
  no resizing `#root`, no `z-index` games.
- One rightbar per page: a second declaration of `rightbar.tab` is rejected by the slot registry.
- To activate your tab (e.g. from a toolbar button or a URL), dispatch `rightbar:activate` as above.
  It is a **window event, not an import** — nothing links the two plugins, and nobody is listening when
  rightbar is absent.

## Install

```bash
# from a local checkout
cd /path/to/deepseek-harness
node --import tsx/esm apps/cli/src/bin.ts plugin --profile web add link:/path/to/dsh-plugin-rightbar

# or straight from GitHub
node --import tsx/esm apps/cli/src/bin.ts plugin --profile web add github:lo2589/dsh-plugin-rightbar
```

Then restart `dsh` once — the bundle layer is assembled at boot. It is a web-only plugin: the host half
is an empty `apply`, the whole sidebar lives in the browser.

## Test

`tests/slot-core.mjs` runs the plugin against the **real** `SlotCore` and React, so it needs a harness
checkout — and must run from there, because `tsx` comes from the harness tree:

```bash
cd /path/to/deepseek-harness
DSH_REPO=$PWD node --import tsx/esm /path/to/dsh-plugin-rightbar/tests/slot-core.mjs
```

`DSH_REPO` defaults to a sibling `deepseek-harness` directory. It covers: a plugin registering before
rightbar exists (must wait, not throw), the declaration itself, rendering only the active tab, teardown,
and a remount without reloading the registrants.

## Demo tabs

Two demo tabs prove that another registrant lands in the declared slot. They are off by default:

```js
localStorage.setItem('rightbar.demo', 'true')   // then reload
```

## 报错记录

每条：现象 → 根因 → 证据 → 修复。验证一律在真实 dsh 页面上截图 + 读 DOM，Chromium 和 Safari 各一遍；
只靠 SlotCore 单测抓不到下面任何一条。

### 2026-10-07 · 面板被另一个插件的浮动面板盖住

- **现象**：右侧一列只露出左边约 120px，其余被同层的「媒体展示台」面板压住。
- **根因**：rightbar 与其他插件的浮动面板同在宿主 overlay 层，按 z-index 比高低。rightbar 写成
  `z-index:40`，那个浮动面板是 `500`。
- **证据**：`document.elementFromPoint` 在面板中心命中对方的 `.sc-head` / `.sc-title`，不在 rightbar 内。
- **修复**：z-index 提到 600（高过 500–530 的浮动面板，低于 9997+ 的全屏模态）；对方插件后来也改成
  软接入 `rightbar.tab`，不再自己浮着。

### 2026-10-07 · Safari 里右侧只有空白

- **现象**：Chrome 正常；Safari 26.4 里 `#root` 已让出宽度，右侧却一片空白。
- **根因**：overlay 层在宿主 `.frame`（`overflow:hidden`）里面，`#root` 让窄后面板（`position:fixed`）
  整个落在 `.frame` 的盒子之外。Chrome 让 fixed 元素逃出祖先裁剪，Safari 照样按 `.frame` 裁掉。
- **证据**：Safari 里面板在 DOM 中（x=1018, w=515, `visibility:visible`, `opacity:1`, z=600），
  `elementFromPoint` 命中 `.rb-tabs`，屏幕却是空的；临时把 `.frame` 的 `overflow` 改成 `visible`，
  面板立刻出现，改回即消失。Playwright 的无头 WebKit 复现不了，必须在真实 Safari 里查
  （Safari 设置 → 开发者 → 允许 Apple 事件中的 JavaScript，然后 `osascript … do JavaScript`）。
- **修复**：面板与收起竖条用 `ReactDOM.createPortal` 挂到 `document.body`，不碰宿主 `.frame`。

### 观察到但不属于 rightbar

- 2026-10-07：页面加载时另一个插件自己的 HTTP 路由（`GET /plugins/<name>/split`）返回 HTTP 400，
  共 11 次；来源不是 rightbar。记在这里只是为了下次不必重新排查。

## License

MIT — see [LICENSE](LICENSE).

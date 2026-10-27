# dsh-plugin-rightbar

给 DeepSeek Harness 网页端加一个「**聊天右边那一列**」：别的插件往这一列里挂**标签页**，而不是各自
`position:fixed` 抢位置、比 z-index。

> English: a shared right sidebar for DeepSeek Harness. Other plugins contribute tabs into the
> `rightbar.tab` slot instead of each pinning its own fixed panel. Web client only. See
> [The contract](#契约也给别人看的接口) for the integration surface.

- 适用范围：**只支持 Web 客户端**（`dsh.client.platform = web`）。宿主半端是个空 `apply`，整个右栏都在浏览器里。
- 版本：`0.1.0` · 许可证 MIT · 插件 id `rightbar` · 标签页槽位名 `rightbar.tab`

---

## 它解决什么问题

Harness 没有「聊天旁边的一列」这个座位：

- `details` 是 **single** 型槽位，而且已经被工具详情面板占着 —— 谁要占就得顶掉别人；
- `shell.overlay` 只是一层**没有布局协调的浮层** —— 能浮起来，但不管谁压着谁。

于是每个想贴边的插件都自己写 `position:fixed; right:0`：互相遮挡（谁 z-index 大谁赢）、各自去压
`#root` 的宽度（谁最后渲染谁生效）、留宽 / 收起 / 记住宽度各写一遍。

本插件往 `shell.overlay` 注册**一个**条目，用它的 `children` 声明一个新的 list 型槽位 `rightbar.tab`
（跟宿主 AppFrame 声明 `sidebar` / `details` 是同一个机制）。想贴边的插件往这个槽位注册标签页即可。

---

## 安装

前置：一个能跑 Web 客户端的 DeepSeek Harness（`--profile web`）。

**方式 A：直接从 GitHub 装（推荐）**

```bash
cd /path/to/deepseek-harness        # 需 node ≥ 22 在 PATH 上

node --import tsx/esm apps/cli/src/bin.ts plugin --profile web add github:lo2589/dsh-plugin-rightbar
```

（装了全局 `dsh` 命令的话，等价于 `dsh plugin --profile web add github:lo2589/dsh-plugin-rightbar`。
第一次装会 clone 整个仓库，一两分钟起步，属正常。）

**方式 B：装本地目录（改代码时用）**

```bash
cd /path/to/deepseek-harness
node --import tsx/esm apps/cli/src/bin.ts plugin --profile web add link:/path/to/dsh-plugin-rightbar
```

**装完必须重启一次 dsh。** bundle 层是启动时组装的，不重启这个插件不会挂上去。

### 装完应该看到什么

页面右侧多出一列（默认展开，宽度 420px，可拖左边缘改宽；点右上角 `›` 收成 32px 竖条）。

⚠️ **如果右侧什么都没有，那是正常的**：本插件自己不提供任何标签页，**没有标签注册时整列不渲染**
（同时把让出的宽度归零）。想先确认它装好了，打开自带的两个演示标签：

```js
localStorage.setItem('rightbar.demo', 'true')   // 然后在浏览器里刷新页面
```

刷新后右侧会出现「演示 A」「演示 B」两个标签 —— 说明槽位声明、注册、渲染这条链是通的。

### 卸载

```bash
cd /path/to/deepseek-harness
node --import tsx/esm apps/cli/src/bin.ts plugin --profile web remove dsh-plugin-rightbar
```

然后重启一次。已经接入的插件不会崩：`rightbar.tab` 不再被声明，它们的 `slots.inject` 永远不触发。

---

## 给你自己的插件接入

最小可用例子（`id` 唯一，`label` 显示在标签上，`order` 决定标签顺序）：

```js
// 你的插件 client 半端 apply(ctx) 里
var slots = ctx.get('slots')
slots.inject('rightbar.tab', function () {
  return slots.register(
    { name: 'rightbar.tab', id: 'my-plugin', label: '我的面板', order: 20 },
    MyPanel,
  )
})
```

为什么这么写：

- **`slots.inject` 会等声明出现**，所以加载顺序无所谓：rightbar 晚一点挂上，你的注册会自动补进去；
  rightbar 卸载时自动撤销，重回来自动恢复（你不用重载）。
- **rightbar 对你始终是可选的**。没装它，`rightbar.tab` 永远不被声明，这个 inject 永远不触发 ——
  **保留你自己浮动的兜底**，别把 rightbar 写成硬依赖。
- 面板内只管**填满给定的盒子**（宽高由 rightbar 给）。三条硬性要求：
  1. 不要 `position:fixed`；
  2. 不要改 `#root` 的宽度（宽度只有 rightbar 写，写成 `<html>` 上的 `--rightbar-w`）；
  3. 不要自己造 z-index 去压别人。
- 同一页面只有一个 rightbar：第二次声明 `rightbar.tab` 会被槽位注册表拒掉。

### 从别处切到自己的标签

比如工具栏按钮、URL 参数、宿主里某个动作之后，想直接激活你的标签：

```js
window.dispatchEvent(new CustomEvent('rightbar:activate', { detail: { id: 'my-plugin' } }))
```

它只是**窗口事件，不是 import** —— 两个插件之间没有代码依赖，rightbar 没装时没人监听，无害。

---

## 自带的 skill（给 agent 看的）

装了这个插件，你的 **agent 会话 skill 目录里会多一条 `rightbar-tab`** —— 内容是"怎么给 rightbar 挂 tab"：
槽位名、注册调用、三条硬性要求、把 rightbar 当可选座位的写法、`rightbar:activate` 事件，以及下面那个让位开关。

它由 `cordis.patch.yml` 的第二行 `rightbar-skill` 提供（`src/skill.js`，依赖为零：只调
`ctx.skills.register()`，读不到正文就只 warn 不启用）。所以以后让 agent 给你写新面板时，它不用读这个
仓库也知道该往哪挂。

---

## 让还没迁过来的面板让位（默认关）

别的插件的老面板如果是自己 `position:fixed; right:0`，会和右栏重叠。本插件能按下面这套处理，但
**默认一个都不碰**：

| `localStorage['rightbar.adopt']` | 行为 |
| --- | --- |
| 不设 / `off`（默认） | 什么都不做 |
| `declared` | 只处理自己加了 `data-rightbar-adopt="1"` 的面板 |
| `all` | 按样式猜：同时满足 fixed、`right≈0`、宽度 < 窗口 80%、高度 ≥ 120px 的 **body 直接子元素** |

```js
localStorage.setItem('rightbar.adopt', 'declared')   // 然后刷新页面
```

⚠️ 为什么默认关：

- 只能靠样式猜，误伤面很大（模态、遮罩、toast、浮动工具栏都可能是 fixed + 贴右）；
- 收编动作只有一种 —— **把它的 `right` 改成 `var(--rightbar-w)`，绝不搬 DOM**。React 17+ 的合成事件挂在
  root 容器上，节点跨容器移动会让别人的事件与状态错乱；只改偏移量最坏是位置偏一点，不会让别人的插件崩；
- 默认开启等于告诉生态"不用改代码，rightbar 会捡"，契约就没人迁了。

被收编的面板会打上 `data-rightbar-adopted="1"`；卸载或关掉时**原样还回去**（原来的 inline `right`
优先保留）。它只是兼容性照顾，不是契约 —— 正式做法仍是注册一个 tab。

---

## 契约（也给别人看的接口）

| 项 | 值 |
| --- | --- |
| 槽位名 | `rightbar.tab`（`kind: 'list'`、`scope: 'root'`，由本插件声明） |
| 注册签名 | `slots.register({ name: 'rightbar.tab', id, label, order }, Component)` |
| 让出的宽度 | `<html>` 上的 CSS 变量 `--rightbar-w`（只有本插件写；无标签时为 `0px`） |
| 激活事件 | `window.dispatchEvent(new CustomEvent('rightbar:activate', { detail: { id } }))` |
| 渲染方式 | 一次只渲染当前那一个标签（`renderSlot('rightbar.tab', {}, { only: id })`） |
| 层级 | `z-index: 600`（高于遗留浮动面板 500–530，低于全屏模态 9997+） |
| 尺寸 | 默认宽 420 · 最小 280 · 最大窗口宽 70% · 收起时 32 |
| 浏览器偏好 | `localStorage`：`rightbar.open` / `rightbar.active` / `rightbar.width` |
| 演示标签开关 | `localStorage`：`rightbar.demo` |
| 让位开关 | `localStorage`：`rightbar.adopt`（`off` 默认 / `declared` / `all`） |
| 让位标记 | 面板上加 `data-rightbar-adopt`；被收编后变成 `data-rightbar-adopted="1"` |

---

## 测试

单测跑的是**真的** `SlotCore` 和真的 React，所以要有一个 harness 仓库；而且必须**在 harness 目录里跑**
（`tsx` 在宿主那棵树里，从插件目录跑会 `ERR_MODULE_NOT_FOUND`）：

```bash
cd /path/to/deepseek-harness
DSH_REPO=$PWD node --import tsx/esm /path/to/dsh-plugin-rightbar/tests/slot-core.mjs
```

`DSH_REPO` 不写的话默认取**插件的同级目录** `deepseek-harness`。

覆盖到的 7 项：rightbar 不存在时别人的注册会等（不抛错）、声明本身、先等着的一方自动落进来、
第二次声明被拒、只渲染当前标签、卸载时标签一起撤、重新挂载时注册者自动回来。

⚠️ 这个单测**抓不到**层级遮挡和 Safari 裁剪这两类问题，它们必须在真页面上看（见下面报错记录）。

另外两个测试**不需要 harness**，直接从插件目录跑（纯 node）：

```bash
node tests/skill-register.mjs   # 自带的 rightbar-tab skill：字段合法性、正文口径、正文读不到时只 warn
node tests/adopt.mjs            # 让位开关：默认关、只认声明、不碰自己的面板、卸载还原、all 模式的保守判据
```

---

## 常见问题

**装完右侧空白** —— 正常，见上文「装完应该看到什么」：没有标签注册时整列不渲染。开演示标签或接入一个 tab。

**右侧面板被别的插件盖住** —— 本插件层级是 600。如果对方压得更高，把对方迁进 `rightbar.tab`
（这是本插件存在的意义），或者给它提 issue。

**Safari 里右侧一片空白（Chrome 正常）** —— 宿主 `.frame` 是 `overflow:hidden`，`#root` 让窄后面板整个
落在 `.frame` 盒子外，Safari 照样按祖先裁剪。`0.1.0` 起面板与收起竖条用 `ReactDOM.createPortal` 挂到
`document.body`，已修；请确认真装上的是这个版本之后的。

**宽度 / 展开状态记不住** —— 偏好存在 `localStorage`，隐私模式下读写会抛错，此时静默退回默认值（展开、420px）。

**想默认收起** —— `localStorage.setItem('rightbar.open', 'false')`。

---

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

---

## License

MIT — 见 [LICENSE](LICENSE)。

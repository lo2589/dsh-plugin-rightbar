# Attach a panel to the DSH right sidebar

Use this when a DeepSeek Harness **web** plugin needs a panel next to Chat — a tray, monitor, inspector,
queue, log viewer — instead of pinning its own `position:fixed` panel.

`dsh-plugin-rightbar` declares one list slot, `rightbar.tab`. Registering into it gives you a tab in the
shared right column: it gets the layout, the width, the collapse handle and the per-browser memory for
free, and it never covers another plugin's panel.

## Register a tab

Client half, inside `apply(ctx)`:

```js
var slots = ctx.get('slots')
slots.inject('rightbar.tab', function () {
  return slots.register(
    { name: 'rightbar.tab', id: 'my-plugin', label: '我的面板', order: 20 },
    MyPanel,
  )
})
```

- `id` must be unique on the page; `label` is the tab text; `order` decides tab order (lower first).
- `slots.inject` **waits** for the declaration, so load order does not matter. Your registration is
  withdrawn automatically when rightbar unloads, and re-applied when it comes back — never cache a
  registration or re-register by hand.
- The returned component is rendered as `renderSlot('rightbar.tab', {}, { only: activeId })`: only the
  active tab is mounted, and it is unmounted when another tab is picked. Keep state that must survive a
  tab switch outside the component (module scope, a store, or host-side state).

## Rules inside a tab

1. Do **not** set `position:fixed` — the panel box is given to you.
2. Do **not** resize `#root` or write `--rightbar-w` — rightbar is the only writer of the reserved width.
3. Do **not** invent z-index values. rightbar sits at `z-index: 600` (above legacy floating panels
   `500`–`530`, below full-screen modals `9997+`).
4. Fill the box you are given (`width:100%; height:100%`, scroll internally). The host column reserves
   `--rightbar-w` on `<html>`; if there are zero tabs the whole column renders nothing and reserves `0px`.

## Keep rightbar optional

rightbar is a **seat**, not a dependency. If it is not installed, `rightbar.tab` is never declared and the
inject never fires — so keep your own floating fallback and let the inject upgrade it:

```js
slots.inject('rightbar.tab', function () {
  setHostedInRightbar(true)      // your panel now renders as a tab
  return slots.register({ name: 'rightbar.tab', id: 'my-plugin', label: '我的面板', order: 20 }, MyPanel)
})
```

Never `import` rightbar, and never make it a `dependency`/`peerDependency`. The only cross-plugin
surfaces are the slot name and the window event below.

## Activate your tab from elsewhere

```js
window.dispatchEvent(new CustomEvent('rightbar:activate', { detail: { id: 'my-plugin' } }))
```

A window event, not an import: harmless when rightbar is absent, no coupling when it is present. Use it
from a toolbar button, a URL parameter, a notification click, or after a host-side action completes.

## Contract

| what | value |
| --- | --- |
| slot | `rightbar.tab` (`kind: 'list'`, `scope: 'root'`, declared by rightbar) |
| register | `slots.register({ name: 'rightbar.tab', id, label, order }, Component)` |
| reserved width | `--rightbar-w` on `<html>`, written by rightbar only |
| activation | `window.dispatchEvent(new CustomEvent('rightbar:activate', { detail: { id } }))` |
| rendering | only the active tab is mounted |
| layer | `z-index: 600` |
| sizing | default 420, min 280, max 70% of window, collapsed strip 32 |
| prefs | `localStorage`: `rightbar.open` / `rightbar.active` / `rightbar.width` |
| one per page | a second declaration of `rightbar.tab` is rejected by the slot registry |

## Legacy panel (no code change)

A panel that cannot adopt the slot yet can ask rightbar to step aside instead: add
`data-rightbar-adopt="1"` to the element that carries `position:fixed`. When the user enables adoption
(`localStorage.setItem('rightbar.adopt', 'declared')`, default is `off`), rightbar rewrites that element's
`right` to `var(--rightbar-w)` so the two no longer overlap. It only moves the panel's offset — it never
re-parents the DOM, so your React tree is untouched. This is a compatibility courtesy, not a contract:
prefer registering a tab.

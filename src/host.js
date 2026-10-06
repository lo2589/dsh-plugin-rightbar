// dsh-plugin-rightbar — Host half.
//
// Nothing to serve: the sidebar is entirely a browser-side layout seat. The
// host half exists because a bundle entry is a cordis plugin, and a plugin
// needs an `apply`.
'use strict'

module.exports = {
  name: 'rightbar',
  apply() {},
}

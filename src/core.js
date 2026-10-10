/* core.js — pure tree algorithms for Mindmap Forge (no DOM; unit-tested). */

function walkTree(n, fn, depth, parent) {
  depth = depth || 0;
  fn(n, depth, parent || null);
  (n.children || []).forEach(function (c) { walkTree(c, fn, depth + 1, n); });
}
function countNodes(root) { var c = 0; if (root) walkTree(root, function () { c++; }); return c; }
function maxId(root) { var m = 0; walkTree(root, function (n) { m = Math.max(m, n.id || 0); }); return m; }

/* Path of nodes from root to the node with this id (inclusive), or [] if not found. */
function findPath(root, id) {
  var out = [];
  (function rec(n, trail) {
    if (n.id === id) { out = trail.concat([n]); return true; }
    return (n.children || []).some(function (c) { return rec(c, trail.concat([n])); });
  })(root, []);
  return out;
}
function findNode(root, id) { var p = findPath(root, id); return p[p.length - 1] || null; }
function isAncestor(root, ancestorId, id) { return findPath(root, id).slice(0, -1).some(function (n) { return n.id === ancestorId; }); }

/* Move node `id` under `newParentId`. Refuses root moves and cycles. Returns true on success. */
function moveNode(root, id, newParentId) {
  if (id === root.id || id === newParentId || isAncestor(root, id, newParentId)) return false;
  var path = findPath(root, id), target = findNode(root, newParentId);
  if (path.length < 2 || !target) return false;
  var parent = path[path.length - 2], node = path[path.length - 1];
  parent.children = parent.children.filter(function (c) { return c !== node; });
  target.children.push(node);
  target.collapsed = false;
  return true;
}

/* Radial layout: angular span proportional to visible leaf count; rings grow with depth. Mutates x/y/depth/branch. */
function radialLayout(root, ringGap) {
  ringGap = ringGap || 190;
  var leaves = function (n) { return n.collapsed || !n.children.length ? 1 : n.children.reduce(function (a, c) { return a + leaves(c); }, 0); };
  var ring = function (d) { return d === 0 ? 0 : 200 + (d - 1) * ringGap; };
  (function place(n, a0, a1, d, branch) {
    var mid = (a0 + a1) / 2;
    n.x = Math.cos(mid) * ring(d);
    n.y = Math.sin(mid) * ring(d);
    n.depth = d;
    n.branch = branch;
    if (n.collapsed) return;
    var a = a0, total = leaves(n);
    n.children.forEach(function (c, i) {
      var span = ((a1 - a0) * leaves(c)) / total;
      place(c, a, a + span, d + 1, d === 0 ? i : branch);
      a += span;
    });
  })(root, -Math.PI / 2, Math.PI * 1.5, 0, -1);
  return root;
}

/* Parse a Markdown/indented outline into a tree. Accepts "# Title", "- item", "  - child", "1. item", tabs. */
function parseOutline(text) {
  var lines = String(text).replace(/\t/g, '  ').split('\n').filter(function (l) { return l.trim(); });
  if (!lines.length) return null;
  var nextId = 1;
  var mkNode = function (title, note) { return { id: nextId++, title: title.slice(0, 60), note: note || '', children: [], collapsed: false }; };
  var root = null, stack = [];
  lines.forEach(function (l) {
    var h = l.match(/^\s*(#{1,6})\s+(.*)$/);
    var b = l.match(/^(\s*)(?:[-*+]|\d+[.)])\s+(.*)$/);
    var raw, level;
    if (h) { raw = h[2]; level = h[1].length - 1; }
    else if (b) { raw = b[2]; level = 1 + Math.floor(b[1].length / 2) + (root && stack.some(function (s) { return s.heading && s.level > 0; }) ? 1 : 0); }
    else { raw = l.trim(); level = root ? 1 : 0; }
    var parts = raw.replace(/\*\*/g, '').split(/\s+[—–-]\s+|:\s+/);
    var title = parts[0].trim(), note = parts.slice(1).join(' — ').trim();
    if (!root) { root = mkNode(title, note); stack = [{ node: root, level: 0, heading: !!h }]; return; }
    level = Math.max(1, level);
    while (stack.length > 1 && stack[stack.length - 1].level >= level) stack.pop();
    var n = mkNode(title, note);
    stack[stack.length - 1].node.children.push(n);
    stack.push({ node: n, level: level, heading: !!h });
  });
  return root;
}

/* Tree -> Markdown outline (inverse of parseOutline for headings+bullets). */
function toOutline(root) {
  var out = '';
  walkTree(root, function (n, d) { out += d === 0 ? '# ' + n.title + '\n\n' : new Array(d).join('  ') + '- **' + n.title + '**' + (n.note ? ' — ' + n.note : '') + '\n'; });
  return out;
}

/* Case/diacritic-insensitive search over titles and notes; returns ids in depth-first order. */
function searchTree(root, q) {
  var norm = function (s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); };
  var t = norm(q).trim(), hits = [];
  if (!t) return hits;
  walkTree(root, function (n) { if (norm(n.title).indexOf(t) >= 0 || norm(n.note).indexOf(t) >= 0) hits.push(n.id); });
  return hits;
}

/* Export as a JSON flashcard deck: one Q&A card per node that has a note. */
function toFlashcards(root) {
  var cards = [];
  walkTree(root, function (n, d, parent) {
    if (d === 0 || !n.note) return;
    cards.push({ type: 'qa', front: 'In “' + (parent ? parent.title : root.title) + '”, what is ' + n.title + '?', back: n.note });
  });
  return { name: root.title + ' (flashcards)', notes: toOutline(root), created: Date.now(), cards: cards };
}

/* Bounded undo/redo of JSON snapshots. */
function History(limit) { this.limit = limit || 60; this.past = []; this.future = []; }
History.prototype.push = function (state) {
  var s = JSON.stringify(state);
  if (this.past[this.past.length - 1] === s) return;
  this.past.push(s); if (this.past.length > this.limit) this.past.shift();
  this.future = [];
};
History.prototype.undo = function (current) {
  if (!this.past.length) return null;
  this.future.push(JSON.stringify(current));
  return JSON.parse(this.past.pop());
};
History.prototype.redo = function (current) {
  if (!this.future.length) return null;
  this.past.push(JSON.stringify(current));
  return JSON.parse(this.future.pop());
};

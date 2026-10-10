const { $, $$, h, esc, busy, toast, download, store, md } = Kit;
const NS = 'http://www.w3.org/2000/svg';
const PALETTE = ['#2f7de1', '#e2703a', '#1f9d63', '#d6457a', '#c98a0b', '#0ea5a8', '#7c5cd6', '#64748b'];
const svg = $('#canvas');
const undoStack = new History(80);
let root = null, selected = null, nextId = 1, hits = [], hitIdx = -1, dragNode = null, dropTarget = null;
let view = { x: 0, y: 0, k: 1 };

/* ---------------- model helpers ---------------- */
function mk(title, note = '', children = []) {
  return { id: nextId++, title: String(title).slice(0, 60), note, children: children.map((c) => mk(c.title, c.note, c.children || [])), collapsed: false };
}
const pathTo = (n) => findPath(root, n.id);
const parentOf = (n) => { const p = pathTo(n); return p[p.length - 2] || null; };
function save() { if (root) store.set('mindmap.v1', { root, nextId }); }
/* Every mutation goes through commit(): snapshot for undo, then persist + redraw. */
function commit(mutate) { undoStack.push(root); mutate(); save(); render(); inspector(); }

/* ---------------- render ---------------- */
function el(tag, attrs, parent) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
const color = (n) => (n.depth === 0 ? 'var(--accent)' : PALETTE[n.branch % PALETTE.length]);
const label = (t) => (t.length > 30 ? t.slice(0, 29) + '…' : t);
const visible = (n) => pathTo(n).slice(0, -1).every((a) => !a.collapsed);

function render() {
  svg.innerHTML = '';
  if (!root) return;
  radialLayout(root);
  const g = el('g', { id: 'vp', transform: `translate(${view.x},${view.y}) scale(${view.k})` }, svg);
  const links = el('g', {}, g), nodes = el('g', {}, g);
  walkTree(root, (n, d, p) => {
    if (p && visible(n)) el('path', { class: 'link', d: `M${p.x},${p.y} Q${((p.x + n.x) / 2) * 0.9},${((p.y + n.y) / 2) * 0.9} ${n.x},${n.y}`, stroke: color(n) }, links);
  });
  const hitSet = new Set(hits);
  walkTree(root, (n) => {
    if (!visible(n)) return;
    const w = Math.max(60, label(n.title).length * (n.depth ? 7.4 : 9) + 28), hgt = n.depth ? 32 : 44;
    const cls = ['node', n.depth === 0 && 'root', n === selected && 'sel', n.loading && 'loading', hitSet.has(n.id) && 'hit', n === dropTarget && 'drop'].filter(Boolean).join(' ');
    const gn = el('g', { class: cls, transform: `translate(${n.x},${n.y})`, tabindex: 0, role: 'button', 'aria-label': n.title }, nodes);
    el('rect', { x: -w / 2, y: -hgt / 2, width: w, height: hgt, rx: hgt / 2, fill: n.depth === 0 ? 'var(--accent)' : 'var(--panel)', stroke: color(n) }, gn);
    el('text', { 'text-anchor': 'middle', 'dominant-baseline': 'central' }, gn).textContent = label(n.title);
    el('title', {}, gn).textContent = n.title + (n.note ? ' — ' + n.note : '') + (n.depth ? '\n(drag onto another node to move it)' : '');
    if (n.collapsed && n.children.length) el('text', { class: 'plus', x: w / 2 + 6, y: 4 }, gn).textContent = '+' + n.children.length;
    gn.addEventListener('click', (e) => { e.stopPropagation(); if (!gn.dataset.dragged) select(n); delete gn.dataset.dragged; });
    gn.addEventListener('dblclick', (e) => { e.stopPropagation(); rename(n); });
    gn.addEventListener('keydown', (e) => { if (e.key === 'Enter') select(n); });
    gn.addEventListener('pointerdown', (e) => { if (n.depth === 0) return; e.stopPropagation(); dragNode = { n, gn, x0: e.clientX, y0: e.clientY, moved: false }; });
    gn.dataset.id = n.id;
  });
  $('#counter').textContent = countNodes(root) + ' ideas';
  $('#undo').disabled = !undoStack.past.length;
  $('#redo').disabled = !undoStack.future.length;
}
const applyView = () => $('#vp')?.setAttribute('transform', `translate(${view.x},${view.y}) scale(${view.k})`);
function fit() {
  const vp = $('#vp');
  if (!vp) return;
  const b = vp.getBBox(), r = svg.getBoundingClientRect();
  const k = Math.min(1.6, Math.min(r.width / (b.width + 120), r.height / (b.height + 120)));
  view = { k, x: r.width / 2 - (b.x + b.width / 2) * k, y: r.height / 2 - (b.y + b.height / 2) * k };
  applyView();
}
function centerOn(n) { const r = svg.getBoundingClientRect(); view.x = r.width / 2 - n.x * view.k; view.y = r.height / 2 - n.y * view.k; applyView(); }

/* ---------------- pan / zoom / drag-to-reparent ---------------- */
let pan = null;
svg.addEventListener('pointerdown', (e) => { if (e.target.closest('.node')) return; pan = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; svg.classList.add('panning'); svg.setPointerCapture(e.pointerId); });
window.addEventListener('pointermove', (e) => {
  if (pan) { view.x = pan.vx + e.clientX - pan.x; view.y = pan.vy + e.clientY - pan.y; applyView(); return; }
  if (!dragNode) return;
  const dx = e.clientX - dragNode.x0, dy = e.clientY - dragNode.y0;
  if (!dragNode.moved && Math.hypot(dx, dy) < 6) return;
  dragNode.moved = true;
  dragNode.gn.setAttribute('transform', `translate(${dragNode.n.x + dx / view.k},${dragNode.n.y + dy / view.k})`);
  dragNode.gn.classList.add('dragging');
  const under = document.elementsFromPoint(e.clientX, e.clientY).map((x) => x.closest?.('.node')).find((x) => x && x !== dragNode.gn);
  const t = under ? findNode(root, +under.dataset.id) : null;
  const ok = t && !isAncestor(root, dragNode.n.id, t.id) && t !== parentOf(dragNode.n);
  $$('.node.drop').forEach((x) => x.classList.remove('drop'));
  dropTarget = ok ? t : null;
  if (ok) under.classList.add('drop');
});
window.addEventListener('pointerup', () => {
  if (pan) { pan = null; svg.classList.remove('panning'); }
  if (!dragNode) return;
  const { n, gn, moved } = dragNode;
  dragNode = null;
  if (!moved) return;
  gn.dataset.dragged = '1';
  if (dropTarget) { const t = dropTarget; dropTarget = null; commit(() => moveNode(root, n.id, t.id)); toast(`Moved “${n.title}” under “${t.title}”`); }
  else render();
});
svg.addEventListener('wheel', (e) => {
  e.preventDefault();
  const r = svg.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  const k2 = Math.min(3, Math.max(0.2, view.k * Math.exp(-e.deltaY * 0.0015)));
  view.x = mx - ((mx - view.x) * k2) / view.k; view.y = my - ((my - view.y) * k2) / view.k; view.k = k2;
  applyView();
}, { passive: false });
svg.addEventListener('click', () => { selected = null; render(); inspector(); });

/* ---------------- inspector ---------------- */
function select(n) { selected = n; render(); inspector(); }
function inspector() {
  const box = $('#inspector');
  const n = selected && findNode(root, selected.id);
  if (!n) { box.innerHTML = '<div class="empty">Click a node to inspect it.<br><span class="small">Double-click to rename · drag a node onto another to move it · Ctrl+Z / Ctrl+Y</span></div>'; return; }
  selected = n;
  box.innerHTML = '';
  const noteEl = h('textarea', { rows: 2, placeholder: 'Note…', onchange: (e) => commit(() => { n.note = e.target.value; }) });
  noteEl.value = n.note || '';
  box.append(h('div', {},
    h('div', { class: 'small muted' }, pathTo(n).map((x) => x.title).join(' › ')),
    h('h2', {}, n.title),
    noteEl,
    h('div', { class: 'row', style: 'margin-top:8px' },
      h('button', { class: 'btn primary sm', onclick: (e) => busy(e.currentTarget, () => expand(n)) }, 'Expand'),
      h('button', { class: 'btn sm', onclick: (e) => busy(e.currentTarget, () => explain(n)) }, 'Explain'),
      h('button', { class: 'btn sm', onclick: (e) => busy(e.currentTarget, () => quiz(n)) }, 'Quiz me')),
    h('div', { class: 'row', style: 'margin-top:8px' },
      h('button', { class: 'btn ghost sm', onclick: () => addManual(n) }, '+ Child'),
      h('button', { class: 'btn ghost sm', onclick: () => rename(n) }, 'Rename'),
      n.children.length ? h('button', { class: 'btn ghost sm', onclick: () => commit(() => { n.collapsed = !n.collapsed; }) }, n.collapsed ? 'Unfold' : 'Fold') : null,
      n !== root ? h('button', { class: 'btn ghost sm danger', onclick: () => remove(n) }, 'Delete') : null),
    n.explain ? h('div', { class: 'prose', style: 'margin-top:12px', html: md(n.explain) }) : null,
    n.quiz ? h('div', { style: 'margin-top:12px' }, h('h3', {}, 'Quiz'), ...n.quiz.map((q, i) => h('details', { class: 'small', style: 'margin-bottom:8px' }, h('summary', {}, `${i + 1}. ${q.q}`), h('div', { class: 'muted', style: 'padding:6px 0 0 14px' }, q.a)))) : null));
}
function rename(n) { const t = prompt('Rename idea', n.title); if (t && t.trim()) commit(() => { n.title = t.trim().slice(0, 60); }); }
function addManual(n) { const t = prompt('New idea under "' + n.title + '"'); if (t && t.trim()) commit(() => { n.children.push(mk(t.trim())); n.collapsed = false; }); }
function remove(n) { const p = parentOf(n); if (!p) return; commit(() => { p.children = p.children.filter((c) => c !== n); selected = p; }); }

/* ---------------- undo / redo ---------------- */
function restore(state) { if (!state) return; root = state; nextId = maxId(root) + 1; selected = selected && findNode(root, selected.id); save(); render(); inspector(); }
$('#undo').onclick = () => restore(undoStack.undo(root));
$('#redo').onclick = () => restore(undoStack.redo(root));
document.addEventListener('keydown', (e) => {
  if (/input|textarea/i.test(e.target.tagName)) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); $('#undo').click(); }
  if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); $('#redo').click(); }
  if (e.key === 'Delete' && selected && selected !== root) remove(selected);
  if (e.key === '/' ) { e.preventDefault(); $('#search').focus(); }
});

/* ---------------- search ---------------- */
$('#search').addEventListener('input', () => { hits = searchTree(root, $('#search').value); hitIdx = -1; $('#hitInfo').textContent = $('#search').value ? `${hits.length} match${hits.length === 1 ? '' : 'es'}` : ''; walkTree(root, (n) => { if (hits.includes(n.id)) pathTo(n).slice(0, -1).forEach((a) => (a.collapsed = false)); }); render(); });
$('#search').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || !hits.length) return;
  hitIdx = (hitIdx + (e.shiftKey ? -1 : 1) + hits.length) % hits.length;
  const n = findNode(root, hits[hitIdx]);
  selected = n; render(); inspector(); centerOn(n);
  $('#hitInfo').textContent = `${hitIdx + 1}/${hits.length}`;
});

/* ---------------- AI actions ---------------- */
async function forge() {
  const topic = $('#topic').value.trim();
  if (!topic) return toast('Type a topic first', 'err');
  const depth = +$('#depth').value;
  const data = await AI.chat([
    { role: 'system', content: 'You build insightful, well-balanced mind maps. Titles are 1-5 words. Notes are one crisp sentence. Return JSON only.' },
    { role: 'user', content: `Topic: "${topic}". Make a mind map ${depth} level(s) deep below the root. 5-7 top-level branches that together cover the topic MECE-style${depth > 1 ? ', each with 3-4 children' : ''}.
Schema: {"title":"${topic}","children":[{"title":"","note":"","children":[{"title":"","note":""}]}]}` },
  ], { json: true, temperature: 0.6, demo: () => demoTree(topic) });
  if (root) undoStack.push(root);
  nextId = 1;
  root = mk(data.title || topic, data.note || '', data.children || []);
  selected = null;
  save(); render(); inspector();
  requestAnimationFrame(fit);
}
async function expand(n) {
  const trail = pathTo(n).map((x) => x.title).join(' > ');
  n.loading = true; n.collapsed = false; render();
  let data;
  try {
    data = await AI.chat([
      { role: 'system', content: 'You extend mind maps with specific, non-obvious sub-ideas. Titles 1-5 words, notes one sentence. Return JSON only.' },
      { role: 'user', content: `Mind map path: ${trail}\nExisting children (do not repeat): ${n.children.map((c) => c.title).join(', ') || 'none'}\nReturn 4-6 new children: {"children":[{"title":"","note":""}]}` },
    ], { json: true, temperature: 0.8, demo: () => ({ children: demoChildren(n.title) }) });
  } finally { n.loading = false; }
  commit(() => (data.children || []).slice(0, 8).forEach((c) => n.children.push(mk(c.title, c.note))));
}
async function explain(n) {
  const trail = pathTo(n).map((x) => x.title).join(' > ');
  n.explain = await AI.chat([
    { role: 'system', content: 'Explain concepts clearly for a curious student. Markdown allowed (short paragraphs, a bullet list if useful). Max 150 words.' },
    { role: 'user', content: `Explain "${n.title}" in the context of: ${trail}` },
  ], { temperature: 0.5, demo: `**${n.title}** is one branch of *${root.title}*. In short, it groups together ideas that share a common purpose.\n\n- **Why it matters:** it connects to ${n.children.length || 'several'} related ideas on this map.\n- **Key question:** what problem does ${n.title.toLowerCase()} solve, and what trade-offs does it make?\n- **Try next:** expand it to see concrete examples.\n\n*(Demo text: add a free Groq key for real explanations.)*` });
  save(); inspector();
}
async function quiz(n) {
  const trail = pathTo(n).map((x) => x.title).join(' > ');
  const data = await AI.chat([
    { role: 'system', content: 'Write short, specific recall questions. Return JSON only.' },
    { role: 'user', content: `3 quiz questions with brief answers about "${n.title}" (context: ${trail}). {"quiz":[{"q":"","a":""}]}` },
  ], { json: true, demo: { quiz: [{ q: `What is the main idea behind ${n.title}?`, a: 'See the Explain panel. Demo answers are placeholders.' }, { q: `Name one example related to ${n.title}.`, a: n.children[0]?.title || 'Expand the node to find examples.' }, { q: `How does ${n.title} connect to ${root.title}?`, a: `It is one of the branches of ${root.title}.` }] } });
  n.quiz = data.quiz || [];
  save(); inspector();
}
async function essay() {
  const text = await AI.chat([
    { role: 'system', content: 'Turn this mind map into a structured essay outline in Markdown: a working title, a one-sentence thesis, then numbered sections (one per main branch) each with 2-3 bullet points that cite specific sub-ideas, and a conclusion. Keep the map’s structure but add logical transitions.' },
    { role: 'user', content: toOutline(root) },
  ], { temperature: 0.5, maxTokens: 1500, demo: () => `## ${root.title}: an overview\n\n**Thesis:** ${root.title} is best understood through ${root.children.length} connected ideas: ${root.children.map((c) => c.title.toLowerCase()).join(', ')}.\n\n${root.children.map((c, i) => `${i + 1}. **${c.title}** — ${c.note || ''}\n${c.children.slice(0, 3).map((k) => `   - ${k.title}: ${k.note || ''}`).join('\n')}`).join('\n')}\n\n**Conclusion:** tie the branches back to the thesis.\n\n*(Demo outline built from your map.)*` });
  $('#essayOut').innerHTML = md(text);
  $('#essayCard').classList.remove('hidden');
  $('#essayText').value = text;
}

/* ---------------- import / export ---------------- */
$('#importBtn').onclick = () => $('#importCard').classList.toggle('hidden');
$('#importGo').onclick = () => {
  const t = parseOutline($('#importText').value);
  if (!t) return toast('Paste an outline first', 'err');
  if (root) undoStack.push(root);
  root = t; nextId = maxId(root) + 1; selected = null;
  $('#topic').value = root.title;
  save(); render(); inspector(); requestAnimationFrame(fit);
  $('#importCard').classList.add('hidden');
  toast(`Imported ${countNodes(root)} ideas`);
};
$('#expRaw').onclick = (e) => { e.stopPropagation(); $('#expMenu').classList.toggle('hidden'); };
document.addEventListener('click', () => $('#expMenu').classList.add('hidden'));
$('#expMenu').onclick = (e) => {
  const x = e.target.dataset.x;
  if (!x || !root) return;
  const strip = (n) => ({ title: n.title, note: n.note || undefined, children: n.children.length ? n.children.map(strip) : undefined });
  if (x === 'json') download('mindmap.json', JSON.stringify(strip(root), null, 2), 'application/json');
  if (x === 'md') download('mindmap.md', toOutline(root), 'text/markdown');
  if (x === 'cards') { const deck = toFlashcards(root); download('mindmap-deck.json', JSON.stringify(deck, null, 2), 'application/json'); toast(`${deck.cards.length} flashcards exported. Import them into any flashcard app that reads JSON.`); }
  if (x === 'essay') busy(null, essay);
  if (x === 'svg' || x === 'png') {
    const markup = standaloneSVG();
    if (x === 'svg') return download('mindmap.svg', markup, 'image/svg+xml');
    const img = new Image();
    img.onload = () => { const c = document.createElement('canvas'); c.width = img.width * 2; c.height = img.height * 2; const ctx = c.getContext('2d'); ctx.scale(2, 2); ctx.drawImage(img, 0, 0); c.toBlob((b) => download('mindmap.png', b)); };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup);
  }
};
function standaloneSVG() {
  const vp = $('#vp'), b = vp.getBBox(), pad = 40;
  const clone = vp.cloneNode(true);
  const src = vp.querySelectorAll('*'), dst = clone.querySelectorAll('*');
  src.forEach((s, i) => { const cs = getComputedStyle(s); ['fill', 'stroke', 'stroke-width', 'opacity', 'font-family', 'font-size', 'font-weight'].forEach((p) => dst[i].style.setProperty(p, cs.getPropertyValue(p))); });
  clone.removeAttribute('transform');
  const bg = getComputedStyle(document.body).backgroundColor;
  return `<svg xmlns="${NS}" width="${b.width + pad * 2}" height="${b.height + pad * 2}" viewBox="${b.x - pad} ${b.y - pad} ${b.width + pad * 2} ${b.height + pad * 2}"><rect x="${b.x - pad}" y="${b.y - pad}" width="100%" height="100%" fill="${bg}"/>${clone.outerHTML}</svg>`;
}
$('#copyEssay').onclick = () => navigator.clipboard.writeText($('#essayText').value).then(() => toast('Copied'));
$('#closeEssay').onclick = () => $('#essayCard').classList.add('hidden');

$('#go').onclick = (e) => busy(e.currentTarget, forge);
$('#topic').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#go').click(); });
$('#fit').onclick = fit;
window.addEventListener('resize', () => requestAnimationFrame(fit));

/* ---------------- boot ---------------- */
const saved = store.get('mindmap.v1');
if (saved?.root) {
  root = saved.root; nextId = Math.max(saved.nextId || 1, maxId(root) + 1);
  $('#topic').value = root.title;
  render(); requestAnimationFrame(fit);
} else $('#go').click();

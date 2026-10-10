const sample = () => ({ id: 1, title: 'Root', note: '', collapsed: false, children: [
  { id: 2, title: 'A', note: 'alpha', collapsed: false, children: [{ id: 4, title: 'A1', note: '', collapsed: false, children: [] }, { id: 5, title: 'A2', note: 'two', collapsed: false, children: [] }] },
  { id: 3, title: 'B', note: '', collapsed: false, children: [] },
] });

test('countNodes / maxId', () => {
  assert.eq(countNodes(sample()), 5);
  assert.eq(maxId(sample()), 5);
  assert.eq(countNodes(null), 0);
});

test('findPath returns the chain from root', () => {
  assert.deepEq(findPath(sample(), 5).map((n) => n.title), ['Root', 'A', 'A2']);
  assert.deepEq(findPath(sample(), 99), []);
});

test('isAncestor', () => {
  const r = sample();
  assert.ok(isAncestor(r, 2, 4));
  assert.ok(!isAncestor(r, 3, 4));
  assert.ok(!isAncestor(r, 4, 4), 'a node is not its own ancestor');
});

test('moveNode reparents and refuses cycles / root moves', () => {
  const r = sample();
  assert.ok(moveNode(r, 4, 3));
  assert.deepEq(findPath(r, 4).map((n) => n.id), [1, 3, 4]);
  assert.ok(!moveNode(r, 2, 5), 'cannot move into own descendant');
  assert.ok(!moveNode(r, 1, 3), 'cannot move root');
  assert.ok(!moveNode(r, 3, 3));
  assert.eq(countNodes(r), 5, 'no nodes lost');
});

test('radialLayout: root at origin, children on first ring, spans by leaves', () => {
  const r = radialLayout(sample());
  assert.eq(r.x, 0); assert.eq(r.y, 0);
  const a = r.children[0];
  assert.near(Math.hypot(a.x, a.y), 200, 1e-9);
  assert.near(Math.hypot(a.children[0].x, a.children[0].y), 390, 1e-9);
  assert.eq(a.children[1].branch, 0);
  assert.eq(r.children[1].branch, 1);
});

test('radialLayout: collapsed subtree is not placed further', () => {
  const r = sample();
  r.children[0].collapsed = true;
  radialLayout(r);
  assert.eq(r.children[0].children[0].x, undefined);
});

test('parseOutline: headings + nested bullets + notes', () => {
  const t = parseOutline('# Space\n- Planets — rocky and gas giants\n  - Mars: the red planet\n  - Jupiter\n- Stars\n');
  assert.eq(t.title, 'Space');
  assert.deepEq(t.children.map((c) => c.title), ['Planets', 'Stars']);
  assert.eq(t.children[0].note, 'rocky and gas giants');
  assert.deepEq(t.children[0].children.map((c) => c.title), ['Mars', 'Jupiter']);
  assert.eq(t.children[0].children[0].note, 'the red planet');
});

test('parseOutline: numbered lists and plain first line', () => {
  const t = parseOutline('Cooking\n1. Knife skills\n2. Heat\n   1. Searing');
  assert.eq(t.title, 'Cooking');
  assert.eq(t.children.length, 2);
  assert.eq(t.children[1].children[0].title, 'Searing');
  assert.eq(parseOutline('   \n'), null);
});

test('toOutline -> parseOutline round-trips structure', () => {
  const back = parseOutline(toOutline(sample()));
  assert.eq(countNodes(back), 5);
  assert.eq(back.children[0].children[1].note, 'two');
});

test('searchTree is case and accent insensitive, searches notes', () => {
  const r = sample();
  r.children[1].title = 'Café';
  assert.deepEq(searchTree(r, 'cafe'), [3]);
  assert.deepEq(searchTree(r, 'ALPHA'), [2]);
  assert.deepEq(searchTree(r, '  '), []);
});

test('toFlashcards: one card per noted node, deck shape', () => {
  const d = toFlashcards(sample());
  assert.eq(d.cards.length, 2);
  assert.eq(d.cards[0].type, 'qa');
  assert.ok(d.cards[1].front.includes('A2') && d.cards[1].front.includes('“A”'));
  assert.ok(Array.isArray(d.cards) && typeof d.name === 'string');
});

test('History: undo/redo restores snapshots and clears redo on new push', () => {
  const H = new History(3);
  H.push({ v: 1 }); H.push({ v: 2 });
  assert.deepEq(H.undo({ v: 3 }), { v: 2 });
  assert.deepEq(H.redo({ v: 2 }), { v: 3 });
  H.undo({ v: 3 }); H.push({ v: 9 });
  assert.eq(H.redo({ v: 9 }), null);
  H.push({ v: 9 }); H.push({ v: 10 }); H.push({ v: 11 }); H.push({ v: 12 });
  assert.eq(H.past.length, 3, 'bounded');
});

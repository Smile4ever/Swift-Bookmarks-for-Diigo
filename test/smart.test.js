// What the add-on works out for you: clean web addresses, what a page says of itself, the tags you use together,
// bookmarks at nearly the same web address, similar tags. options/settings.js, options/index-item.js and
// background/background.js run in a sandbox with a made-up browser.* API, as in background.test.js; the index of the
// Swift Library (options/library-index.js) on its own.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

// every browser.* path works and gives a Promise; tabs.query no tabs
const api = (path = '') => new Proxy(function () {}, {
  get: (target, name) => name == 'then' ? undefined : api(path ? path + '.' + String(name) : String(name)),
  apply: () => Promise.resolve(path == 'tabs.query' ? [] : undefined),
});

function load(...files) {
  const context = vm.createContext({browser: api(), console, URL, URLSearchParams, AbortController, AbortSignal,
    setTimeout, clearTimeout, TextDecoder, fetch: () => Promise.reject(new Error('no network in tests'))});
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context);
  return context;
}

const background = () => load('options/settings.js', 'options/index-item.js', 'background/background.js');
// a value of the sandbox as one of this realm, for deepStrictEqual
const plain = value => JSON.parse(JSON.stringify(value));

test('a clean web address: without tracking parameters, the rest as it is written', () => {
  const {cleanUrl} = background();
  assert.strictEqual(cleanUrl('https://example.com/a?utm_source=x&utm_medium=y'), 'https://example.com/a');
  assert.strictEqual(cleanUrl('https://example.com/a?b=1%2C2&fbclid=abc&c=x,y'), 'https://example.com/a?b=1%2C2&c=x,y');
  assert.strictEqual(cleanUrl('https://example.com/a?id=5#part'), 'https://example.com/a?id=5#part');
  assert.strictEqual(cleanUrl('https://example.com/a?gclid=1#'), 'https://example.com/a');
  assert.strictEqual(cleanUrl('https://example.com/a#'), 'https://example.com/a');
  assert.strictEqual(cleanUrl('ftp://example.com/?utm_source=x'), 'ftp://example.com/?utm_source=x');
  assert.strictEqual(cleanUrl('not a url'), 'not a url');
});

test('the web address of a new bookmark: clean, or the canonical one on the same site', () => {
  const {preferredUrl} = background();
  const page = 'https://www.example.com/news/1?utm_source=feed';
  assert.strictEqual(preferredUrl(page, ''), 'https://www.example.com/news/1');
  assert.strictEqual(preferredUrl(page, 'https://example.com/news/1-a-title'), 'https://example.com/news/1-a-title');
  // another site, the home page, or a page of an app (#…): not the canonical one
  assert.strictEqual(preferredUrl(page, 'https://other.example/news/1'), 'https://www.example.com/news/1');
  assert.strictEqual(preferredUrl(page, 'https://www.example.com/'), 'https://www.example.com/news/1');
  assert.strictEqual(preferredUrl('https://example.com/app#/inbox', 'https://example.com/app'), 'https://example.com/app#/inbox');
  assert.strictEqual(preferredUrl('https://example.com/', 'https://example.com/'), 'https://example.com/');
});

test('what a page says of itself, from its HTML', () => {
  const {pageInfoOf} = background();
  const html = `<html><head><title>Tom &amp; Jerry</title>
    <meta name="Description" content="A cat &amp; a mouse">
    <meta property="og:description" content='The best cartoon'>
    <meta name="keywords" content="cartoon, Cats ,cartoon">
    <meta property="article:tag" content="Animation">
    <link rel="stylesheet" href="/a.css"><link href="/tom-and-jerry" rel="canonical">
    <script type="application/ld+json">{"@graph": [{"keywords": ["Hanna-Barbera", "mice"]}]}</script>
    <script type="application/ld+json">not json</script>
    </head><body></body></html>`;
  assert.deepStrictEqual(plain(pageInfoOf(html, 'https://example.com/show?id=1')), {
    title: 'Tom & Jerry',
    description: 'The best cartoon',
    keywords: ['cartoon', 'Cats', 'Animation', 'Hanna-Barbera', 'mice'],
    canonical: 'https://example.com/tom-and-jerry',
  });
  assert.deepStrictEqual(plain(pageInfoOf('', 'https://example.com/')),
    {title: '', description: '', keywords: [], canonical: ''});
});

test('the tags you use together, not from bookmarks with a hidden tag', () => {
  const {relatedTagsOf} = background();
  const item = (...tags) => ({tags});
  const items = [
    item('JavaScript', 'webdev'), item('javascript', 'webdev', 'tutorial'), item('javascript', 'tutorial'),
    item('javascript', 'css'), item('secret', 'javascript', 'css'), item('secret', 'javascript', 'css'),
  ];
  const related = plain(relatedTagsOf(items, {hiddenTags: ['secret'], alsoHiddenTags: []}));
  assert.deepStrictEqual(related.javascript, [['webdev', 2], ['tutorial', 2]]);
  assert.deepStrictEqual(related.webdev, [['JavaScript', 2]]);
  // only once together: not related; with a hidden tag: not counted
  assert.strictEqual(related.css, undefined);
  assert.strictEqual(related.secret, undefined);
});

test('bookmarks at nearly the same web address, not the page itself', () => {
  const {similarBookmarks} = background();
  const items = [
    {url: 'http://www.example.com/a/', title: 'A', created: 1},
    {url: 'https://example.com/a?utm_source=x', title: 'A again', created: 2},
    {url: 'https://example.com/a', title: 'This one', created: 3},
    {url: 'https://example.com/b', title: 'B', created: 4},
    {url: '', title: 'A note', created: 5},
  ];
  assert.deepStrictEqual(plain(similarBookmarks(items, 'https://example.com/a')).map(item => item.title), ['A again', 'A']);
  assert.deepStrictEqual(plain(similarBookmarks(items, 'https://example.com/c')), []);
});

test('similar tags: separators, accents and plurals, the most used first', () => {
  const {similarTagGroups} = load('options/settings.js', 'options/index-item.js', 'options/library-index.js');
  const counts = [
    {name: 'recipes', count: 9}, {name: 'recipe', count: 3}, {name: 'e-mail', count: 4}, {name: 'email', count: 6},
    {name: 'Node.js', count: 2}, {name: 'nodejs', count: 1}, {name: 'café', count: 1}, {name: 'cafe', count: 1},
    {name: 'library', count: 2}, {name: 'libraries', count: 1}, {name: 'box', count: 1}, {name: 'boxes', count: 1},
    {name: 'news', count: 5}, {name: 'js', count: 3}, {name: 'j', count: 1}, {name: 'css', count: 2},
  ];
  const groups = plain(similarTagGroups(counts)).map(group => group.map(tag => tag.name));
  assert.deepStrictEqual(groups, [
    ['recipes', 'recipe'], ['email', 'e-mail'], ['Node.js', 'nodejs'], ['library', 'libraries'], ['café', 'cafe'],
    ['box', 'boxes'],
  ]);
});

test('merging tags: those with the same tags after in one request, all tags given at once', () => {
  const {bulkRequests} = load('options/settings.js', 'options/index-item.js', 'options/library-index.js');
  const items = [
    {id: '1', tags: ['recipe', 'italian'], type: 'bookmark'},
    {id: '2', tags: ['Recipes', 'italian'], type: 'bookmark'},
    {id: '3', tags: ['recipes', 'recipe'], type: 'bookmark'},
    {id: '4', tags: ['other'], type: 'bookmark'},
  ];
  const requests = bulkRequests({type: 'mergeTags', tags: ['recipe'], into: 'recipes'}, items);
  const summary = plain(requests.map(request => ({ids: request.batch.map(item => item.id), tags: request.params.editTags})));
  assert.deepStrictEqual(summary, [{ids: ['1'], tags: 'italian recipes'}, {ids: ['3'], tags: 'recipes'}]);
});

test('the trash keeps the file of a PDF only when it fits, with a fifth to spare', async () => {
  const context = load('options/settings.js', 'options/index-item.js');
  const roomWith = async (estimate, bytes) => {
    context.navigator = {storage: {estimate: () => Promise.resolve(estimate)}};
    return context.roomFor(bytes);
  };
  assert.strictEqual(await roomWith({usage: 10, quota: 100}, 70), true);
  assert.strictEqual(await roomWith({usage: 10, quota: 100}, 71), false);
  // the browser doesn't say: kept
  assert.strictEqual(await roomWith({}, 1e9), true);
  context.navigator = undefined;
  assert.strictEqual(await context.roomFor(1e9), true);
});

// A document just big enough for library-code.js: text nodes, spans with a class, fragments
function fakeDocument() {
  class Node {
    constructor(kind, text = '') {
      Object.assign(this, {kind, text, children: [], className: ''});
    }
    append(...nodes) {
      for (const node of nodes) this.children.push(typeof node == 'string' ? new Node('text', node) : node);
    }
    set textContent(text) {
      this.children = [new Node('text', text)];
    }
  }
  return {
    createTextNode: text => new Node('text', text),
    createElement: tag => new Node(tag),
    createDocumentFragment: () => new Node('fragment'),
  };
}

// what highlight made: [kind, text] for each piece, '' for plain text
function pieces(fragment) {
  return fragment.children.map(node => node.kind == 'text' ? ['', node.text] : [node.className.replace('tok-', ''), node.children[0].text]);
}

const code = () => {
  const context = load('options/library-code.js');
  context.document = fakeDocument();
  return context;
};

test('the language of a note, by the end of its title', () => {
  const {codeLanguage} = code();
  assert.strictEqual(codeLanguage('script.py'), 'python');
  assert.strictEqual(codeLanguage('Program.CS '), 'csharp');
  assert.strictEqual(codeLanguage('styles.css'), 'css');
  assert.strictEqual(codeLanguage('index.html'), 'markup');
  assert.strictEqual(codeLanguage('Shopping list'), '');
  assert.strictEqual(codeLanguage('version 2.0'), '');
});

test('code in colours: Python', () => {
  const {highlight} = code();
  const parts = pieces(highlight('def f(x):  # twice\n    return "a" + 2', 'python'));
  assert.deepStrictEqual(plain(parts.filter(([kind]) => kind)), [
    ['keyword', 'def'], ['function', 'f'], ['comment', '# twice'], ['keyword', 'return'], ['string', '"a"'], ['number', '2'],
  ]);
  // all of the text is there, in its order
  assert.strictEqual(parts.map(([, text]) => text).join(''), 'def f(x):  # twice\n    return "a" + 2');
});

test('code in colours: CSS, selectors outside { } and properties inside', () => {
  const {highlight} = code();
  const parts = pieces(highlight('a:hover, #main { color: #fff; margin: 0 2px; } /* end', 'css')).filter(([kind]) => kind);
  assert.deepStrictEqual(plain(parts), [
    ['selector', 'a'], ['selector', ':hover, #main '],
    ['property', 'color'], ['number', '#fff'], ['property', 'margin'], ['number', '0'], ['number', '2px'],
    ['selector', ' '], ['comment', '/* end'],
  ]);
});

test('code in colours: HTML, with CSS in <style>', () => {
  const {highlight} = code();
  const parts = pieces(highlight('<!-- hi --><p class="x">a &amp; b</p><style>p { color: red }</style>', 'markup'));
  assert.deepStrictEqual(plain(parts.filter(([kind]) => kind)), [
    ['comment', '<!-- hi -->'], ['tag', '<p'], ['attr', 'class'], ['string', '"x"'], ['tag', '>'], ['number', '&amp;'],
    ['tag', '</p'], ['tag', '>'], ['tag', '<style'], ['tag', '>'], ['selector', 'p '], ['property', 'color'],
    ['tag', '</style'], ['tag', '>'],
  ]);
});

test('code in colours: C# and an unknown language', () => {
  const {highlight} = code();
  const parts = pieces(highlight('public int N = 0x1F; // n\nvar s = @"C:\dir";', 'csharp')).filter(([kind]) => kind);
  assert.deepStrictEqual(plain(parts), [
    ['keyword', 'public'], ['keyword', 'int'], ['number', '0x1F'], ['comment', '// n'], ['keyword', 'var'], ['string', '@"C:\dir"'],
  ]);
  assert.deepStrictEqual(plain(pieces(highlight('a < b', 'nothing'))), [['', 'a < b']]);
});

test('what diigo.com deletes: the ids of its request, as a form or as bytes', () => {
  const {deletedIds} = background();
  assert.deepStrictEqual(plain(deletedIds({formData: {link_id: ['12,34, 56']}})), ['12', '34', '56']);
  const bytes = new TextEncoder().encode('link_id=7%2C8&other=1').buffer;
  assert.deepStrictEqual(plain(deletedIds({raw: [{bytes}]})), ['7', '8']);
  assert.deepStrictEqual(plain(deletedIds(undefined)), []);
  assert.deepStrictEqual(plain(deletedIds({formData: {link_id: ['']}})), []);
});

test('no menu to set for diigo.com; the Swift pages have all of them in theirs', () => {
  const context = background();
  const run = code => vm.runInContext(code, context);
  assert.strictEqual(run("'menuItems' in DEFAULT_SETTINGS"), false);
  assert.deepStrictEqual(plain(run('swiftNavItems().map(item => item.id)')),
    ['fastLibrary', 'discover', 'options', 'tools', 'learnMore']);
});

test('dead links you said are not dead: one link, or all of a site, not dead any more', () => {
  const context = load('options/settings.js', 'options/index-item.js', 'options/library-index.js', 'options/library-links.js');
  const run = code => vm.runInContext(code, context);
  run(`linkStates = new Map([
    ['https://a.example/x', {state: 'dead', status: 404}],
    ['https://blog.b.example/y', {state: 'unreachable', status: 0}],
    ['https://c.example/z', {state: 'dead', status: 410}],
  ]);
  ignoredLinks = {urls: new Set(['https://a.example/x']), sites: new Set(['b.example'])};`);
  const category = url => run(`linkCategory({type: 'bookmark', url: ${JSON.stringify(url)}})`);
  assert.strictEqual(category('https://a.example/x'), 'ignored');
  assert.strictEqual(category('https://blog.b.example/y'), 'ignored');
  assert.strictEqual(category('https://c.example/z'), 'dead');
  // as found, for what the menu of the code says
  assert.strictEqual(run(`linkCategory({type: 'bookmark', url: 'https://a.example/x'}, true)`), 'dead');
  assert.strictEqual(run(`LINKS.dead({type: 'bookmark', url: 'https://a.example/x'})`), false);
});

test('what the answer of a page says of its link: blocked, dead, gone, parked, moved or fine', () => {
  const {classifyLink} = background();
  const page = 'https://example.com/blog/post';
  const state = answer => plain(classifyLink(page, {status: 200, ...answer}));
  // a bot protection: not dead
  assert.deepStrictEqual(state({status: 403, server: 'cloudflare'}), {state: 'blocked', status: 403});
  assert.deepStrictEqual(state({status: 503, title: 'Just a moment...'}), {state: 'blocked', status: 503});
  assert.deepStrictEqual(state({status: 999}), {state: 'blocked', status: 999});
  assert.deepStrictEqual(state({status: 403}), {state: 'ok', status: 403});
  // too many requests: the site asks to slow down, not an error; with a bot protection, blocked
  assert.deepStrictEqual(state({status: 429}), {state: 'busy', status: 429});
  assert.deepStrictEqual(state({status: 429, server: 'cloudflare'}), {state: 'blocked', status: 429});
  // dead, also when it answers 200
  assert.deepStrictEqual(state({status: 404}), {state: 'dead', status: 404, why: 'status'});
  assert.deepStrictEqual(state({redirected: true, finalUrl: 'https://example.com/'}), {state: 'dead', status: 200, why: 'home'});
  assert.deepStrictEqual(state({title: '404 - Page Not Found'}), {state: 'dead', status: 200, why: 'notfound'});
  assert.deepStrictEqual(state({title: 'Pagina niet gevonden | Example'}), {state: 'dead', status: 200, why: 'notfound'});
  assert.deepStrictEqual(state({title: 'example.com is for sale | HugeDomains'}), {state: 'dead', status: 200, why: 'parked'});
  assert.deepStrictEqual(state({redirected: true, finalUrl: 'https://www.sedoparking.com/example.com'}).why, 'parked');
  // not dead: an article about 404 pages, or about something for sale
  assert.strictEqual(state({title: 'How to make a custom 404 page in WordPress'}).state, 'ok');
  assert.strictEqual(state({title: 'Car is for sale'}).state, 'ok');
  // moved, but not when only written otherwise, nor to sign in or accept cookies
  assert.deepStrictEqual(state({redirected: true, finalUrl: 'https://example.org/posts/post'}),
    {state: 'moved', status: 200, to: 'https://example.org/posts/post'});
  assert.strictEqual(state({redirected: true, finalUrl: 'https://www.example.com/blog/post/'}).state, 'ok');
  assert.strictEqual(state({redirected: true, finalUrl: 'https://example.com/login?next=/blog/post'}).state, 'ok');
  assert.strictEqual(state({redirected: true, finalUrl: 'https://consent.example.com/?continue=x'}).state, 'ok');
  // a home page that moved to another site: moved, not gone
  assert.strictEqual(plain(classifyLink('https://old.example/', {status: 200, redirected: true, finalUrl: 'https://new.example/'})).state, 'moved');
});

test('a site that answers 429 waits as long as it says, within bounds', () => {
  const {busyFor} = background();
  assert.strictEqual(busyFor('120'), 120000);
  assert.strictEqual(busyFor(''), 60000);
  assert.strictEqual(busyFor('1'), 5000);
  assert.strictEqual(busyFor('99999'), 600000);
  assert.strictEqual(busyFor('nonsense'), 60000);
});

test('bookmarks without a real title: none, their web address, or one such as Untitled', () => {
  const {untitled} = load('options/settings.js', 'options/index-item.js', 'options/library-index.js', 'options/library-edit.js');
  const bookmark = (title, url = 'https://example.com/page/') => ({type: 'bookmark', url, title});
  for (const title of ['', '  ', 'Untitled', 'untitled document', '(Untitled)', 'New Tab', 'No title',
    'https://example.com/page', 'example.com/page', 'http://www.example.com/page/']) {
    assert.strictEqual(untitled(bookmark(title)), true, title);
  }
  for (const title of ['Untitled Goose Game review', 'Example page', 'example.com']) {
    assert.strictEqual(untitled(bookmark(title)), false, title);
  }
  // only bookmarks of web pages
  assert.strictEqual(untitled({type: 'note', url: '', title: ''}), false);
  assert.strictEqual(untitled(bookmark('', 'ftp://example.com/file')), false);
});

test('the tags of yours a title or web address mentions, as the form suggests and a synced bookmark gets', () => {
  const {tagsMentioned} = load('options/settings.js');
  const names = ['machine-learning', 'python', 'js', 'recipes'];
  assert.deepStrictEqual(Array.from(tagsMentioned('Machine Learning with Python', 'https://example.com/post', names)),
    ['machine-learning', 'python']);
  // in the web address too, without www. and .html; not tags of fewer than 3 characters
  assert.deepStrictEqual(Array.from(tagsMentioned('Dinner', 'https://www.recipes.com/js/pasta.html', names)), ['recipes']);
});

test('an index is kept when Diigo gives no items, and replaced when it gives some', async () => {
  const context = load('options/settings.js', 'options/index-item.js', 'options/library-index.js');
  let answer = {items: [], total: 0};
  context.fetch = async () => ({json: async () => answer});
  vm.runInContext(`index = new Map([['a', {id: 'a', updated: 1}], ['b', {id: 'b', updated: 2}]]);
    meta = {user: 'me', newest: 2, version: INDEX_VERSION};`, context);
  const build = () => vm.runInContext(`buildIndex('me', new AbortController().signal, () => {})`, context);
  await assert.rejects(build());
  assert.strictEqual(vm.runInContext('index.size', context), 2);
  answer = {items: [{link_id: 'c', url: 'https://example.com/', updated_at: '2026-11-22 10:00:00', tags: ''}], total: 1};
  assert.strictEqual(await build(), 2);
  assert.deepStrictEqual(plain(vm.runInContext('[...index.keys()]', context)), ['c']);
  // what Diigo no longer has: in the trash, to put back
  const trashed = plain(vm.runInContext('[...trash.values()]', context));
  assert.deepStrictEqual(trashed.map(item => [item.id, item.goneFromDiigo, item.deletedAt > 0]), [['a', true, true], ['b', true, true]]);
  // someone else's index: Diigo's empty library is theirs, and theirs isn't put in the trash
  vm.runInContext(`meta = {...meta, user: 'other'}`, context);
  answer = {items: [], total: 0};
  vm.runInContext(`index = new Map([['x', {id: 'x', updated: 1}]])`, context);
  assert.strictEqual(await build(), 0);
  assert.strictEqual(vm.runInContext('index.size', context), 0);
  assert.ok(!vm.runInContext(`trash.has('x')`, context));
});

test('an index is kept when Diigo gives far fewer items, unless that is allowed', async () => {
  const context = load('options/settings.js', 'options/index-item.js', 'options/library-index.js');
  const bookmark = i => ({link_id: 'n' + i, url: `https://example.com/${i}`, updated_at: '2026-11-22 10:00:00', tags: ''});
  context.fetch = async () => ({json: async () => ({items: [1, 2, 3, 4, 5].map(bookmark), total: 5})});
  vm.runInContext(`index = new Map(Array.from({length: 30}, (_, i) => ['o' + i, {id: 'o' + i, updated: 1}]));
    meta = {user: 'me', newest: 1, version: INDEX_VERSION};`, context);
  const build = allowShrink => vm.runInContext(`buildIndex('me', new AbortController().signal, () => {}, options)`,
    Object.assign(context, {options: {allowShrink}}));
  let asked = null;
  await assert.rejects(build((count, before) => (asked = [count, before], false)));
  assert.deepStrictEqual(asked, [5, 30]);
  assert.strictEqual(vm.runInContext('index.size', context), 30);
  // without a question (built by itself): kept too
  await assert.rejects(build(undefined));
  assert.strictEqual(await build(() => true), 30);
  assert.strictEqual(vm.runInContext('index.size', context), 5);
  assert.strictEqual(vm.runInContext('trash.size', context), 30);
});

test('hiding a bookmark in the Swift Library hides its screenshot too, and taking the tag away shows it again', async () => {
  const context = load('options/settings.js', 'options/index-item.js', 'options/library-index.js');
  const posts = [];
  context.fetch = async (url, options) => {
    posts.push({url: String(url), params: Object.fromEntries(options.body)});
    return {ok: true, status: 200, text: async () => JSON.stringify({code: 1})};
  };
  vm.runInContext(`index = new Map([
    ['1', {id: '1', type: 'bookmark', url: 'https://example.com/a', title: 'A', description: '', tags: ['work']}],
    ['2', {id: '2', type: 'image', url: 'https://www.diigo.com/item/image/2', title: 'Shot', tags: ['work', 'screenshot'],
      description: 'Screenshot of the page A\\nhttps://example.com/a'}],
    ['3', {id: '3', type: 'image', url: 'https://www.diigo.com/item/image/3', title: 'Other', tags: ['work'], description: ''}],
  ]);`, context);
  const edit = change => vm.runInContext(`editItems(['1'], ${JSON.stringify(change)}, new AbortController().signal, () => {})`, context);
  const tags = id => plain(vm.runInContext(`index.get('${id}').tags`, context));
  await edit({type: 'addTags', tags: ['hidden']});
  assert.deepStrictEqual(tags('1'), ['work', 'hidden']);
  assert.deepStrictEqual(tags('2'), ['work', 'screenshot', 'hidden']);
  assert.deepStrictEqual(tags('3'), ['work']);
  await edit({type: 'removeTags', tags: ['hidden']});
  assert.deepStrictEqual(tags('2'), ['work', 'screenshot']);
  // the request for the screenshot: its own, by its link_id
  assert.ok(posts.some(post => /"2"/.test(post.params.infos || '')));
});

test('screenshots are hidden as with a hidden tag, by default, unless switched off', () => {
  const context = load('options/settings.js');
  const hidden = (settings, tag) => vm.runInContext(`isHiddenTag(${JSON.stringify(settings)}, ${JSON.stringify(tag)})`, context);
  assert.strictEqual(vm.runInContext('DEFAULT_SETTINGS.hideScreenshots && DEFAULT_SETTINGS.screenshotThumbs', context), true);
  assert.strictEqual(hidden({hiddenTags: [], hideScreenshots: true}, 'Screenshot'), true);
  assert.strictEqual(hidden({hiddenTags: [], hideScreenshots: false}, 'screenshot'), false);
  assert.strictEqual(hidden({hiddenTags: [], hideScreenshots: true}, 'photo'), false);
});


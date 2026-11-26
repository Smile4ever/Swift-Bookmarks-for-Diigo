// background/background.js, run in a sandbox with a made-up browser.* API
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

// what storage.get answers: one key, a list of them, or all (null)
const storageGet = (area, keys) => {
  const wanted = keys == null ? Object.keys(area) : [keys].flat();
  return Promise.resolve(Object.fromEntries(wanted.filter(key => key in area).map(key => [key, area[key]])));
};

// Every browser.* path works: a call gives a Promise, addListener keeps the listener, storage.local and storage.sync
// are kept in memory
function loadBackground() {
  const listeners = {};
  const storage = {};
  const synced = {};
  const calls = [];
  const callArgs = [];  // {name, args}, for what a call was given
  const menuUpdates = [];
  const special = {
    'contextMenus.update': (id, props) => Promise.resolve(menuUpdates.push({id, ...props})),
    'storage.local.get': keys => storageGet(storage, keys),
    'storage.local.set': items => Promise.resolve(Object.assign(storage, items)),
    'storage.sync.get': keys => storageGet(synced, keys),
    'storage.sync.set': items => Promise.resolve(Object.assign(synced, items)),
    'storage.sync.remove': keys => Promise.resolve([keys].flat().forEach(key => delete synced[key])),
    'i18n.getMessage': key => key,
    'tabs.query': () => Promise.resolve([]),
    'cookies.get': () => Promise.resolve(null),
    'runtime.getURL': file => 'moz-extension://id/' + file,
  };
  const api = (path = []) => new Proxy(function () {}, {
    get: (target, name) => name == 'then' ? undefined : api([...path, name]),
    apply: (target, self, args) => {
      const name = path.join('.');
      calls.push(name);
      callArgs.push({name, args});
      if (path.at(-1) == 'addListener') {
        (listeners[path.slice(0, -1).join('.')] ??= []).push(args[0]);
        return undefined;
      }
      return special[name] ? special[name](...args) : Promise.resolve();
    },
  });
  const context = vm.createContext({browser: api(), console, URL, URLSearchParams, AbortController, AbortSignal, setTimeout, clearTimeout, fetch: () => Promise.reject(new Error('no network in tests'))});
  // in the order of manifest.json: settings.js and index-item.js first
  for (const file of ['pages/settings.js', 'pages/index-item.js', 'background/background.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, {filename: file});
  }
  // special: a call answered otherwise in one test
  return {context, listeners, storage, synced, calls, callArgs, menuUpdates, special};
}

test('"Save page to Diigo" is in the menu of pages that can be bookmarked, but not on diigo.com', async () => {
  const {context, menuUpdates} = loadBackground();
  const pages = {
    'https://example.com/page': true,
    'https://www.diigo.com/user/someone': false,
    'https://www.diigo.com/tools': false,
    'https://diigo.com/': false,
    'https://notdiigo.com/': true,
    'about:addons': false,
  };
  for (const url of Object.keys(pages)) await context.showPageMenu(url);
  assert.deepStrictEqual(menuUpdates.map(update => update.visible), Object.values(pages));
  assert.ok(menuUpdates.every(update => update.id == 'save-page'));
});

test('pages that can be bookmarked', () => {
  const {context} = loadBackground();
  assert.ok(context.canBookmark('https://example.com/page'));
  assert.ok(context.canBookmark('http://www.diigo.com/about'));
  for (const url of ['about:blank', 'file:///C:/x.html', 'chrome://extensions', 'https://addons.mozilla.org/en-US/firefox/',
    'https://chromewebstore.google.com/detail/x', 'https://microsoftedge.microsoft.com/addons/detail/x',
    'https://www.diigo.com/user/someone', 'not a url']) {
    assert.ok(!context.canBookmark(url), url);
  }
});

test('the title of a page from its HTML', () => {
  const {context} = loadBackground();
  assert.strictEqual(context.decodeEntities('Tom &amp; Jerry &#39;1&#x27; &lt;b&gt;&nbsp;&bogus;'), "Tom & Jerry '1' <b> &bogus;");
  assert.strictEqual(context.decodeEntities('&#xFFFFFFF;'), '&#xFFFFFFF;');
});

test('the preview image of a page from its HTML: og:image first, else its largest icon, only http(s)', () => {
  const {context} = loadBackground();
  const of = html => ({...context.pagePreviewOf(html, 'https://site.example/a/page')});
  assert.deepStrictEqual(of(`<head><meta property="og:image" content="/img/cover.jpg?w=1&amp;h=2">
    <link rel="icon" href="/favicon.ico"><link rel="apple-touch-icon" sizes="180x180" href="touch.png"></head>`),
  {image: 'https://site.example/img/cover.jpg?w=1&h=2', icon: 'https://site.example/a/touch.png'});
  assert.deepStrictEqual(of(`<meta name="twitter:image" content="https://cdn.example/t.png">
    <link rel="icon" sizes="16x16" href="/16.png"><link rel="icon" sizes="32x32 64x64" href="/64.png">`),
  {image: 'https://cdn.example/t.png', icon: 'https://site.example/64.png'});
  // a small icon only: none; an image after the head (in the page itself): not the page's preview
  assert.deepStrictEqual(of(`<link rel="shortcut icon" href="/favicon.ico"></head><body><meta property="og:image" content="/x.jpg">`),
    {image: '', icon: ''});
  assert.deepStrictEqual(of(`<meta property="og:image" content="javascript:alert(1)"><link rel="icon" href="/i.svg">`),
    {image: '', icon: 'https://site.example/i.svg'});
});

test('menus and listeners are set up when the script starts', () => {
  const {listeners} = loadBackground();
  for (const event of ['runtime.onMessage', 'runtime.onInstalled', 'runtime.onStartup', 'contextMenus.onClicked',
    'action.onClicked', 'commands.onCommand', 'tabs.onUpdated', 'tabs.onRemoved']) {
    assert.strictEqual(listeners[event]?.length, 1, event);
  }
});

test('messages are answered with sendResponse, unknown ones not', async () => {
  const {listeners} = loadBackground();
  const onMessage = listeners['runtime.onMessage'][0];
  assert.strictEqual(onMessage({type: 'nothing'}, {}, () => assert.fail()), false);
  const answer = await new Promise(resolve => assert.strictEqual(onMessage({type: 'user'}, {}, resolve), true));
  assert.strictEqual(answer, '');
});

test('the tags of the last bookmark, only for the same site', async () => {
  const {context, storage} = loadBackground();
  context.setLastTags(['a', 'b'], 'https://www.example.com/one');
  // as JSON: objects from the sandbox have other prototypes
  assert.strictEqual(JSON.stringify(Object.values(storage)), '[{"site":"example.com","tags":["a","b"]}]');
  assert.strictEqual(JSON.stringify(await context.getLastTags('https://example.com/two')), '["a","b"]');
  assert.strictEqual(JSON.stringify(await context.getLastTags('https://other.com/')), '[]');
});

test('the toolbar button uses action, the form is put in the page with scripting', async () => {
  const {context, calls} = loadBackground();
  context.markTab({id: 1, url: 'https://example.com/'});
  assert.ok(calls.includes('action.enable') && calls.includes('action.setIcon') && calls.includes('action.setTitle'));
  assert.ok(!calls.some(call => call.startsWith('browserAction')));
  assert.ok(!fs.readFileSync(path.join(ROOT, 'background/background.js'), 'utf8').includes('localStorage'));
});

test('on diigo.com the button opens the options, with a gear on its icon; elsewhere the bookmark form', () => {
  const {context, listeners, calls, callArgs} = loadBackground();
  const last = name => callArgs.filter(call => call.name == name).at(-1).args[0];
  for (const url of ['https://www.diigo.com/user/someone', 'https://groups.diigo.com/g/x', 'https://diigo.com/']) {
    assert.strictEqual(context.markTab({id: 1, url}), false, url);
    assert.match(last('action.setIcon').path[19], /toolbar-options.png$/, url);
    assert.match(last('action.setIcon').path[38], /toolbar-options-38.png$/, url);
    assert.strictEqual(last('action.setTitle').title, 'browserActionOptionsTitle', url);
  }
  for (const url of ['https://example.com/', 'https://notdiigo.com/']) {
    assert.strictEqual(context.markTab({id: 2, url}), true, url);
    assert.match(last('action.setIcon').path[19], /toolbar.png$/, url);
  }
  const click = listeners['action.onClicked'][0];
  click({id: 1, url: 'https://www.diigo.com/tools'});
  assert.strictEqual(calls.filter(call => call == 'runtime.openOptionsPage').length, 1);
  click({id: 2, url: 'https://example.com/'});
  assert.strictEqual(calls.filter(call => call == 'runtime.openOptionsPage').length, 1);
});

test('the address bar suggests bookmarks with every word, those with a hidden tag only when it is typed', () => {
  const {context, listeners} = loadBackground();
  assert.strictEqual(listeners['omnibox.onInputChanged']?.length, 1);
  context.isHiddenTag = (settings, tag) => settings.hiddenTags.includes(tag.toLowerCase());
  const settings = {hiddenTags: ['secret']};
  const items = [
    {id: '1', url: 'https://a.example/', title: 'Italian recipes', description: '', tags: ['cooking']},
    {id: '2', url: 'https://b.example/', title: 'Recipes', description: 'from Italy', tags: ['secret']},
    {id: '3', url: 'https://c.example/italian', title: 'Grammar', description: '', tags: ['language']},
  ];
  // an array of this realm, not of the sandbox
  const ids = input => [...context.omniboxMatches(items, settings, input).map(item => item.id)];
  assert.deepStrictEqual(ids('italian'), ['1', '3']);
  assert.deepStrictEqual(ids('ITALIAN recipes'), ['1']);
  assert.deepStrictEqual(ids('recipes'), ['1']);
  assert.deepStrictEqual(ids('recipes secret'), ['2']);
  assert.deepStrictEqual(ids('cooking'), ['1']);
  assert.deepStrictEqual(ids('  '), []);
});

test('the menu of the toolbar button opens the Swift Library, a random bookmark, and Swift Discover', async () => {
  const {listeners, callArgs} = loadBackground();
  const onClicked = listeners['contextMenus.onClicked'][0];
  const tab = {index: 3};
  for (const menuItemId of ['library', 'random', 'discover']) await onClicked({menuItemId}, tab);
  const created = callArgs.filter(call => call.name == 'tabs.create').map(call => call.args[0]);
  // a random bookmark without an index (none here): Random in the Swift Library, which builds it
  assert.deepStrictEqual(created.map(props => props.url), [
    'moz-extension://id/pages/library.html',
    'moz-extension://id/pages/library.html#random=new',
    'moz-extension://id/pages/discover.html',
  ]);
  assert.ok(created.every(props => props.index == 4));
});

test('the Swift Library open in the window already: that tab, with what is asked for in its address', async () => {
  const {listeners, callArgs, special} = loadBackground();
  special['tabs.query'] = () => Promise.resolve([{id: 7, url: 'https://example.com/'},
    {id: 8, url: 'moz-extension://id/pages/library.html#view=all&q=x'}]);
  const onClicked = listeners['contextMenus.onClicked'][0];
  await onClicked({menuItemId: 'library'}, {index: 3, windowId: 1});
  await onClicked({menuItemId: 'random'}, {index: 3, windowId: 1});
  assert.strictEqual(callArgs.filter(call => call.name == 'tabs.create').length, 0);
  const updates = callArgs.filter(call => call.name == 'tabs.update').map(call => call.args);
  // as it is, made the tab you see; Random: with that in its address
  assert.deepStrictEqual(JSON.parse(JSON.stringify(updates)), [
    [8, {active: true}], [8, {active: true, url: 'moz-extension://id/pages/library.html#random=new'}],
  ]);
  // in the window of the tab of the button, not in another
  assert.ok(callArgs.some(call => call.name == 'tabs.query' && call.args[0]?.windowId == 1));
});

test('the toolbar button opens the Swift Library when set so; the shortcut still the bookmark form', async () => {
  const {listeners, callArgs, storage} = loadBackground();
  storage.toolbarButton = 'library';
  await listeners['storage.onChanged'][0]({toolbarButton: {newValue: 'library'}}, 'local');
  await new Promise(resolve => setTimeout(resolve));
  const page = {id: 5, index: 2, windowId: 1, url: 'https://example.com/article'};
  await listeners['action.onClicked'][0](page);
  const created = callArgs.filter(call => call.name == 'tabs.create').map(call => call.args[0].url);
  assert.deepStrictEqual(created, ['moz-extension://id/pages/library.html']);
  // the title of the button says so
  const titles = callArgs.filter(call => call.name == 'action.setTitle').map(call => call.args[0].title);
  assert.ok(!titles.length || titles.every(title => title == 'browserActionLibraryTitle'));
});

test('your library on diigo.com opens the Swift Library (by default), but not with ?swift=false', async () => {
  assert.strictEqual(vm.runInContext('DEFAULT_SETTINGS.myLibraryToSwift', loadBackground().context), true);
  const {context, callArgs, storage} = loadBackground();
  // after the cookie was read when it started (none here), which signs out
  await new Promise(resolve => setTimeout(resolve));
  vm.runInContext("user = 'Geoffrey'", context);
  const go = (url, id = 4) => context.libraryToSwift({id, index: 0, windowId: 1}, url);
  const updates = () => callArgs.filter(call => call.name == 'tabs.update').map(call => call.args[0]);
  // switched off: Diigo's own
  storage.myLibraryToSwift = false;
  await go('https://www.diigo.com/user/geoffrey');
  storage.myLibraryToSwift = true;
  for (const url of ['https://www.diigo.com/user/someone', 'https://www.diigo.com/user/geoffrey/tags']) await go(url);
  assert.deepStrictEqual(updates(), []);
  for (const url of ['https://www.diigo.com/user/geoffrey', 'https://www.diigo.com/user/Geoffrey/', 'https://www.diigo.com/user/geoffrey?type=all']) {
    await go(url);
  }
  assert.deepStrictEqual(updates(), [4, 4, 4]);
  // ?swift=false: Diigo's own for the rest of that tab on diigo.com, My Library too; not for another tab
  await go('https://www.diigo.com/user/geoffrey?swift=false#dqa-public-library', 5);
  await go('https://www.diigo.com/buzz/hot', 5);
  await go('https://www.diigo.com/user/geoffrey', 5);
  assert.deepStrictEqual(updates(), [4, 4, 4]);
  await go('https://www.diigo.com/user/geoffrey', 6);
  assert.deepStrictEqual(updates(), [4, 4, 4, 6]);
  // left diigo.com: as before
  await go('https://example.com/', 5);
  await go('https://www.diigo.com/user/geoffrey', 5);
  assert.deepStrictEqual(updates(), [4, 4, 4, 6, 5]);
});

test('the form on a page saved at nearly the same web address opens that bookmark, as the index has it', async () => {
  const {context} = loadBackground();
  await new Promise(resolve => setTimeout(resolve));
  const item = {id: '9', url: 'http://stackoverflow.com/questions/19516212/how-to', title: 'How to kill Firefox',
    description: 'kill -2', tags: ['firefox', 'linux'], private: true, unread: false, created: 1700000000, updated: 1700000000};
  vm.runInContext(`indexCache = {items: ${JSON.stringify([item])}, time: Date.now()}`, context);
  const answer = await context.openBookmark({url: 'https://stackoverflow.com/questions/19516212/how-to?utm_source=x', title: 'x'});
  assert.strictEqual(answer.otherAddress, true);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(answer.bookmark)), {saved: true, url: item.url, urlId: '', linkId: '9',
    title: item.title, description: 'kill -2', tags: ['firefox', 'linux'], private: true, unread: false, date: 'on Nov 14, 2023'});
  // at its own web address: that one, nothing to say
  const own = await context.openBookmark({url: item.url, title: 'x'});
  assert.strictEqual(own.otherAddress, false);
  assert.strictEqual(own.bookmark.saved, true);
  // nothing like it: a new one
  const fresh = await context.openBookmark({url: 'https://example.com/', title: 'Example'});
  assert.strictEqual(fresh.bookmark.saved, false);
});

test('a bookmark the toolbar API of Diigo does not find is saved again by its link_id, not anew', async () => {
  const {context} = loadBackground();
  const requests = [];
  context.fetch = async (url, options) => {
    requests.push({url: String(url), body: options?.body ? Object.fromEntries(options.body) : null});
    return {ok: true, status: 200, text: async () => JSON.stringify({items: [{link_id: '9'}]})};
  };
  const result = await context.saveBookmark({linkId: '9', oldUrl: 'http://stackoverflow.com/q/1',
    url: 'http://stackoverflow.com/q/1', title: 'Q', description: 'kill -2\n\nScreenshot: x', tags: ['linux', 'how to'],
    private: true, unread: false}, {id: 3, url: 'https://stackoverflow.com/q/1'});
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(requests.map(r => r.url), ['https://www.diigo.com/item/save/bookmark']);
  assert.deepStrictEqual(requests[0].body, {link_id: '9', url: 'http://stackoverflow.com/q/1', new_url: 'http://stackoverflow.com/q/1',
    title: 'Q', description: 'kill -2\n\nScreenshot: x', tags: 'linux "how to"', private: 'true', unread: 'false'});
});

test('a screenshot gets all tags of its bookmark, so a hidden one is hidden too', async () => {
  const {context, special} = loadBackground();
  special['tabs.captureVisibleTab'] = () => Promise.resolve('data:image/jpeg;base64,AAAA');
  Object.assign(context, {FormData, Blob});
  let sent = null;
  context.fetch = async (url, options) => {
    if (String(url).startsWith('data:')) return {blob: async () => new Blob(['x'], {type: 'image/jpeg'})};
    sent = options.body;
    return {ok: true, status: 200, text: async () => JSON.stringify({items: [{link_id: 'shot1'}]})};
  };
  const url = await context.pageScreenshot({id: 3, windowId: 1}, {title: 'Secret', url: 'https://example.com/',
    tags: ['hidden', 'work notes']});
  assert.strictEqual(url, 'https://www.diigo.com/item/image/shot1');
  assert.strictEqual(sent.get('tags'), 'hidden "work notes" screenshot');
  assert.strictEqual(sent.get('private'), 'true');
});

test('the screenshots of a bookmark: by the web address in their description, or a link to them', () => {
  const {context} = loadBackground();
  const page = {id: '1', url: 'https://example.com/a', description: 'see https://www.diigo.com/item/image/old7', tags: []};
  const items = [
    {id: '2', type: 'image', tags: ['screenshot'], description: 'Screenshot of the page A\nhttps://example.com/a'},
    {id: 'old7', type: 'image', tags: ['Screenshot'], description: ''},
    {id: '3', type: 'image', tags: ['photo'], description: 'Screenshot of the page A\nhttps://example.com/a'},
    {id: '4', type: 'image', tags: ['screenshot'], description: 'Screenshot of the page B\nhttps://example.com/b'},
  ];
  const ids = JSON.parse(JSON.stringify(context.screenshotsOf(page, items).map(item => item.id)));
  assert.deepStrictEqual(ids, ['2', 'old7']);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(vm.runInContext("screenshotTags(['hidden', 'Screenshot', 'work'])", context))),
    ['hidden', 'work', 'screenshot']);
});

test('a screenshot made before it had the address of its page: found by its own web address in the bookmark', () => {
  const {context} = loadBackground();
  const page = {id: '1', url: 'https://example.com/a', tags: [],
    description: 'About A.\n\nScreenshot: https://www.diigo.com/item/image/2k9xq7/abc-screenshot.'};
  const items = [
    {id: '1037', type: 'image', url: 'https://www.diigo.com/item/image/2k9xq7/abc-screenshot', tags: ['screenshot'], description: ''},
    {id: '1038', type: 'image', url: 'https://www.diigo.com/item/image/other', tags: ['screenshot'], description: ''},
  ];
  assert.deepStrictEqual(JSON.parse(JSON.stringify(context.screenshotsOf(page, items).map(item => item.id))), ['1037']);
});

test('saving a bookmark gives its screenshots its tags, a hidden one too', async () => {
  const {context, special} = loadBackground();
  special['cookies.get'] = () => Promise.resolve({value: 'x-.-me'});
  await new Promise(resolve => setTimeout(resolve));
  await context.readCookie();
  const shot = {id: '2', type: 'image', title: 'Screenshot', tags: ['work', 'screenshot'], private: true,
    description: 'Screenshot of the page A\nhttps://example.com/a'};
  vm.runInContext(`indexCache = {items: ${JSON.stringify([shot])}, time: Date.now()}`, context);
  const sent = [];
  context.fetch = async (url, options) => {
    sent.push({url: String(url), body: options?.body instanceof URLSearchParams ? Object.fromEntries(options.body) : null});
    return {ok: true, status: 200, text: async () => JSON.stringify({items: [{link_id: '1'}]})};
  };
  await context.saveBookmark({linkId: '1', url: 'https://example.com/a', title: 'A', tags: ['work', 'hidden']}, {id: 3});
  const image = sent.find(request => request.url == 'https://www.diigo.com/item/save/image');
  assert.deepStrictEqual(image?.body, {link_id: '2', title: 'Screenshot', description: shot.description,
    tags: 'work hidden screenshot', private: 'true'});
  // the same tags already: nothing to save
  sent.length = 0;
  vm.runInContext(`indexCache.items[0].tags = ['hidden', 'screenshot', 'work']`, context);
  await context.saveBookmark({linkId: '1', url: 'https://example.com/a', title: 'A', tags: ['work', 'hidden']}, {id: 3});
  assert.ok(!sent.some(request => request.url == 'https://www.diigo.com/item/save/image'));
});

test('the toolbar icon shows a page saved at nearly the same web address as saved', async () => {
  const {context, callArgs, special} = loadBackground();
  // signed in as me
  special['cookies.get'] = () => Promise.resolve({value: 'x-.-me'});
  await new Promise(resolve => setTimeout(resolve));
  // signed in first: a change of who is signed in empties the cache of the index
  await context.readCookie();
  vm.runInContext(`indexCache = {items: [{id: '9', url: 'http://stackoverflow.com/q/1', tags: []}], time: Date.now()}`, context);
  const icons = () => callArgs.filter(call => call.name == 'action.setIcon').map(call => call.args[0].path[19]);
  await context.onTabLoading({id: 3, url: 'https://stackoverflow.com/q/1?utm_source=x'});
  assert.strictEqual(icons().at(-1), '/icons/toolbar-saved.png');
  await context.onTabLoading({id: 3, url: 'https://example.com/'});
  assert.strictEqual(icons().at(-1), '/icons/toolbar.png');
});

test('the settings of what the add-on no longer does on diigo.com go once it is updated', async () => {
  const {listeners, callArgs} = loadBackground();
  listeners['runtime.onInstalled'][0]({reason: 'update'});
  const removed = callArgs.find(call => call.name == 'storage.local.remove').args[0];
  assert.ok(removed.includes('modernDiscover') && removed.includes('editDeleteButtons') && removed.includes('showTrash'));
  // not what is still used
  assert.ok(!removed.includes('deadLinks'));
});

test('hidden is added once to the hidden tags saved before, and stays out once taken out', async () => {
  const {listeners, storage} = loadBackground();
  storage.hiddenTags = ['secret'];
  await listeners['runtime.onInstalled'][0]({reason: 'update'});
  await new Promise(resolve => setTimeout(resolve));
  assert.deepStrictEqual([...storage.hiddenTags], ['secret', 'hidden']);
  storage.hiddenTags = ['secret'];
  await listeners['runtime.onInstalled'][0]({reason: 'update'});
  await new Promise(resolve => setTimeout(resolve));
  assert.deepStrictEqual([...storage.hiddenTags], ['secret']);
});

test('the settings go to storage.sync once, unless another computer put them there first', async () => {
  const {listeners, storage, synced, context} = loadBackground();
  Object.assign(storage, {splitAdd: false, deadLinks: false, syncFolders: ['1'], hiddenDefaultAdded: true});
  synced.deadLinks = true;
  await listeners['runtime.onInstalled'][0]({reason: 'update'});
  await new Promise(resolve => setTimeout(resolve));
  // the folders of this browser stay here; what another computer synced wins
  assert.deepStrictEqual({...synced}, {deadLinks: true, splitAdd: false});
  assert.strictEqual(storage.settingsSynced, true);
  const settings = await context.loadSettings();
  assert.strictEqual(settings.deadLinks, true);
  assert.strictEqual(settings.splitAdd, false);
  assert.deepStrictEqual([...settings.syncFolders], ['1']);
  // once: what is changed on this computer after isn't overwritten by the copy here
  synced.splitAdd = true;
  await listeners['runtime.onInstalled'][0]({reason: 'update'});
  await new Promise(resolve => setTimeout(resolve));
  assert.strictEqual(synced.splitAdd, true);
});

test('the lists of what you said go to storage.sync once, together with what another computer has', async () => {
  const {listeners, storage, synced} = loadBackground();
  Object.assign(storage, {ignoredTagGroups: ['a b'], ignoredLinks: {urls: ['https://x.example/'], sites: []},
    hiddenDefaultAdded: true});
  Object.assign(synced, {ignoredTagGroups: ['c d'], ignoredLinks: {urls: [], sites: ['y.example']}});
  await listeners['runtime.onInstalled'][0]({reason: 'update'});
  await new Promise(resolve => setTimeout(resolve));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(synced.ignoredTagGroups)), ['a b', 'c d']);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(synced.ignoredLinks)), {urls: ['https://x.example/'], sites: ['y.example']});
  assert.strictEqual(storage.listsSynced, true);
});

test('a setting too large for storage.sync stays here only', async () => {
  const {context, storage, synced, special} = loadBackground();
  synced.hiddenTags = ['old'];
  special['storage.sync.set'] = items => 'hiddenTags' in items ? Promise.reject(new Error('QUOTA_BYTES_PER_ITEM')) :
    Promise.resolve(Object.assign(synced, items));
  await context.saveSettings({hiddenTags: ['new'], splitAdd: false});
  assert.ok(!('hiddenTags' in synced));
  assert.strictEqual(synced.splitAdd, false);
  assert.strictEqual((await context.loadSettings()).hiddenTags[0], 'new');
  assert.strictEqual(storage.splitAdd, false);
});

test('a new install keeps hidden as the default, without saving hidden tags', async () => {
  const {listeners, storage} = loadBackground();
  await listeners['runtime.onInstalled'][0]({reason: 'install'});
  await new Promise(resolve => setTimeout(resolve));
  assert.ok(!('hiddenTags' in storage));
  assert.strictEqual(storage.hiddenDefaultAdded, true);
});

test('a random bookmark: a web page of yours, none with a hidden tag, no note or image', () => {
  const {context} = loadBackground();
  const settings = {hiddenTags: ['secret'], alsoHiddenTags: []};
  const items = [
    {id: '1', type: 'bookmark', url: 'https://a.example/', tags: ['secret']},
    {id: '2', type: 'note', url: 'https://www.diigo.com/item/note/x', tags: []},
    {id: '3', type: 'bookmark', url: 'javascript:void(0)', tags: []},
    {id: '4', type: 'bookmark', url: 'https://b.example/', tags: ['cooking']},
  ];
  for (let i = 0; i < 20; i++) assert.strictEqual(context.pickRandomBookmark(items, settings).id, '4');
  assert.strictEqual(context.pickRandomBookmark(items.slice(0, 3), settings), null);
});


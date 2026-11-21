// background/background.js, run in a sandbox with a made-up browser.* API
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

// Every browser.* path works: a call gives a Promise, addListener keeps the listener, storage.local is kept in memory
function loadBackground() {
  const listeners = {};
  const storage = {};
  const calls = [];
  const callArgs = [];  // {name, args}, for what a call was given
  const menuUpdates = [];
  const special = {
    'contextMenus.update': (id, props) => Promise.resolve(menuUpdates.push({id, ...props})),
    'storage.local.get': key => Promise.resolve(key in storage ? {[key]: storage[key]} : {}),
    'storage.local.set': items => Promise.resolve(Object.assign(storage, items)),
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
  const context = vm.createContext({browser: api(), console, URL, URLSearchParams, AbortController, AbortSignal, setTimeout, fetch: () => Promise.reject(new Error('no network in tests'))});
  // in the order of manifest.json: settings.js and index-item.js first
  for (const file of ['options/settings.js', 'options/index-item.js', 'background/background.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, {filename: file});
  }
  return {context, listeners, storage, calls, callArgs, menuUpdates};
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
    'moz-extension://id/options/library.html',
    'moz-extension://id/options/library.html#random=new',
    'moz-extension://id/options/discover.html',
  ]);
  assert.ok(created.every(props => props.index == 4));
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


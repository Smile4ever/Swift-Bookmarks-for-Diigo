// background/sync.js, run after options/settings.js and background/background.js in a sandbox with a made-up browser.* API
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

// root › Bookmarks Menu › Recipes › Italian Food › Pasta, and a bookmarklet in Recipes
const TREE = {id: 'root', children: [
  {id: 'menu', parentId: 'root', title: 'Bookmarks Menu', children: [
    {id: 'recipes', parentId: 'menu', title: 'Recipes', children: [
      {id: 'italian', parentId: 'recipes', title: 'Italian Food', children: [
        {id: 'pasta', parentId: 'italian', title: 'Pasta', url: 'https://example.com/pasta'},
      ]},
      {id: 'bookmarklet', parentId: 'recipes', title: 'Do it', url: 'javascript:void(0)'},
    ]},
  ]},
  {id: 'other', parentId: 'root', title: 'Other Bookmarks', children: [
    {id: 'amo', parentId: 'other', title: 'An add-on', url: 'https://addons.mozilla.org/firefox/addon/x/'},
  ]},
]};

function find(id, node = TREE) {
  if (node.id == id) return node;
  for (const child of node.children || []) {
    const found = find(id, child);
    if (found) return found;
  }
}

// Every browser.* path works: a call gives a Promise, addListener keeps the listener
function loadSync(storage = null) {
  const listeners = {};
  const special = {
    'storage.local.get': keys => Promise.resolve(storage
      ? Object.fromEntries([keys].flat().filter(key => key in storage).map(key => [key, storage[key]])) : {}),
    'storage.local.set': items => Promise.resolve(storage && Object.assign(storage, items)),
    'tabs.query': () => Promise.resolve([]),
    'cookies.get': () => Promise.resolve(null),
    'permissions.contains': () => Promise.resolve(false),
    'alarms.get': () => Promise.resolve(undefined),
    'bookmarks.get': id => Promise.resolve([find(id)]),
    'bookmarks.getSubTree': id => Promise.resolve([find(id)]),
    'bookmarks.onCreated.hasListener': () => false,
  };
  const api = (path = []) => new Proxy(function () {}, {
    get: (target, name) => name == 'then' ? undefined : api([...path, name]),
    apply: (target, self, args) => {
      const name = path.join('.');
      if (path.at(-1) == 'addListener') {
        (listeners[path.slice(0, -1).join('.')] ??= []).push(args[0]);
        return undefined;
      }
      return special[name] ? special[name](...args) : Promise.resolve();
    },
  });
  const context = vm.createContext({browser: api(), console, URL, URLSearchParams, AbortController, AbortSignal, setTimeout, fetch: () => Promise.reject(new Error('no network in tests'))});
  for (const file of ['options/settings.js', 'background/background.js', 'background/sync.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, {filename: file});
  }
  return {context, listeners};
}

// as JSON: objects from the sandbox have other prototypes
const json = value => JSON.parse(JSON.stringify(value));

test('the folders of a bookmark are its tags, without the folders right under the root', async () => {
  const {context} = loadSync();
  const pasta = {url: 'https://example.com/pasta', title: 'Pasta', tags: ['recipes', 'italian-food'], bookmarkId: 'pasta'};
  for (const id of ['menu', 'recipes', 'italian', 'pasta']) {
    assert.deepStrictEqual(json(await context.bookmarksIn(id, true)), [pasta], id);
  }
  assert.deepStrictEqual(json(await context.bookmarksIn('recipes', false)), [{...pasta, tags: []}]);
});

test('bookmarklets and other links that are not web pages are left out', async () => {
  const {context} = loadSync();
  assert.deepStrictEqual(json(await context.bookmarksIn('bookmarklet', true)), []);
});

test('the sync listens to alarms, settings, permissions and the menu, and answers syncNow', () => {
  const {context, listeners} = loadSync();
  for (const event of ['alarms.onAlarm', 'permissions.onAdded', 'permissions.onRemoved', 'bookmarks.onCreated']) {
    assert.strictEqual(listeners[event]?.length, 1, event);
  }
  // in background.js one for what the toolbar button opens (buttonOpens) and one for the hidden tags
  // (updateAlsoHidden); one for the settings of the sync
  assert.strictEqual(listeners['storage.onChanged']?.length, 3);
  // one for the page and link items of background.js, one for the bookmark items
  assert.strictEqual(listeners['contextMenus.onClicked']?.length, 2);
  assert.strictEqual(typeof vm.runInContext('requests.syncNow', context), 'function');
});

test('Move to Diigo goes before the folders of a sync, and stays a move when the bookmark waits already', async () => {
  const storage = {syncQueue: [
    {url: 'https://example.com/a', title: 'A', tags: [], bookmarkId: 'a'},
    {url: 'https://example.com/pasta', title: 'Pasta', tags: ['recipes'], bookmarkId: 'pasta'},
  ]};
  const {context} = loadSync(storage);
  context.runQueue = () => {};
  const pasta = {url: 'https://example.com/pasta', title: 'Pasta', tags: ['recipes'], bookmarkId: 'pasta', move: true};
  await context.enqueue([pasta], true, {first: true});
  assert.deepStrictEqual(json(storage.syncQueue).map(item => [item.url, !!item.move]),
    [['https://example.com/pasta', true], ['https://example.com/a', false]]);
  // the folders synced again later: no second one, and the move stays
  await context.enqueue([{url: 'https://example.com/pasta', title: 'Pasta', tags: [], bookmarkId: 'pasta'}]);
  assert.deepStrictEqual(json(storage.syncQueue).map(item => [item.url, !!item.move]),
    [['https://example.com/pasta', true], ['https://example.com/a', false]]);
  // a move of something waiting as a plain save makes it a move
  await context.enqueue([{url: 'https://example.com/a', title: 'A', tags: [], bookmarkId: 'a', move: true}]);
  assert.strictEqual(json(storage.syncQueue)[1].move, true);
});

test('a bookmark of a site where add-ons can do nothing on the page goes to Diigo all the same', async () => {
  const {context} = loadSync();
  assert.deepStrictEqual(json(await context.bookmarksIn('amo', true)).map(item => item.url),
    ['https://addons.mozilla.org/firefox/addon/x/']);
  // the toolbar button can't put the form there
  assert.strictEqual(context.canBookmark('https://addons.mozilla.org/firefox/addon/x/'), false);
});

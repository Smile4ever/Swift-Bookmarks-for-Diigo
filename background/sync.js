// Bookmarks of the browser to Diigo, one way: the folders chosen on the options page, once ("Sync now") or kept in sync,
// and "Save to Diigo" and "Move to Diigo" in the menu of a bookmark or folder (Firefox only: Chrome and Edge have no
// menu for bookmarks). Needs the optional permission "bookmarks", asked for on the options page.
// Loaded after background.js, whose user, readCookie, callDiigo, diigoSave, canBookmark and createMenus it uses.
//
// Bookmarks wait in a queue in storage (syncQueue), so a sync goes on after the browser stopped the background script,
// and go to Diigo one at a time, a second apart. A bookmark that is already in Diigo is left as it is there. The URLs
// that are done are kept per user (synced.<user>), so a next sync of the folders doesn't ask Diigo about them again.

const FOLDERS_ALARM = 'sync-folders';  // every 6 hours while kept in sync
const NEW_ALARM = 'sync-new';          // a minute after a new bookmark
const QUEUE_ALARM = 'sync-queue';      // every minute while the queue isn't empty, in case the background script was stopped
const SYNC_EVERY_MINUTES = 6 * 60;
const SYNC_PAUSE = 1000;
let syncRunning = false;

const local = key => browser.storage.local.get(key).then(items => items[key]);

// false on Firefox for Android, which has no bookmarks for add-ons
const hasBookmarks = () => browser.permissions.contains({permissions: ['bookmarks']}).catch(() => false);

// read, change and write one key of storage, one change at a time: bookmarks can come in by the thousand at once
let storageLock = Promise.resolve();
function change(key, fn) {
  const result = storageLock.then(async () => {
    const value = fn(await local(key));
    await browser.storage.local.set({[key]: value});
    return value;
  });
  storageLock = result.catch(() => {});
  return result;
}


// ---- bookmarks and their folders ----

// "Machine Learning" → machine-learning, like the tags the form suggests
const folderTag = title => title.trim().toLowerCase().replace(/\s+/g, '-');

// the folders from the root down to id, id included
async function ancestors(id) {
  const nodes = [];
  for (let next = id; next;) {
    const [node] = await browser.bookmarks.get(next);
    nodes.unshift(node);
    next = node.parentId;
  }
  return nodes;
}

// the bookmarks in a bookmark or folder and its subfolders that can go to Diigo: [{url, title, tags, bookmarkId}]
async function bookmarksIn(id, folderTags) {
  const [top] = await browser.bookmarks.getSubTree(id);
  const above = top.parentId ? await ancestors(top.parentId) : [];
  const found = [];
  // depth 0 is the root, 1 a folder right under it (Bookmarks Menu, Other Bookmarks...): no tags, every bookmark is in one
  const walk = (node, depth, folders) => {
    if (node.url) {
      if (canBookmark(node.url, {page: false})) {
        const tags = folderTags ? [...new Set(folders.map(folderTag))] : [];
        found.push({url: node.url, title: node.title || node.url, tags, bookmarkId: node.id});
      }
      return;
    }
    const inner = depth >= 2 && node.title ? [...folders, node.title] : folders;
    for (const child of node.children || []) walk(child, depth + 1, inner);
  };
  walk(top, above.length, above.slice(2).map(folder => folder.title).filter(Boolean));
  return found;
}


// ---- the queue ----

function showLeft(left) {
  browser.action.setBadgeText?.({text: left ? String(left) : ''}).catch(() => {});
}

// fresh: a new sync, which starts the counts on the options page again. first: before those waiting (Save to Diigo and
// Move to Diigo in the menu of a bookmark: you wait for those, not for the folders of a sync). One URL waits once; a
// move of it, now or before, stays a move, so the bookmark still leaves the browser once it is in Diigo.
async function enqueue(items, fresh, {first = false} = {}) {
  const queue = await change('syncQueue', (queue = []) => {
    const added = new Map(items.map(item => [item.url, item]));
    const waiting = new Map(queue.map(item => [item.url, item]));
    // a move wins over a plain save of the same bookmark
    const merged = (item, other) => other?.move && !item.move
      ? {...item, move: true, bookmarkId: other.bookmarkId, folderId: other.folderId} : item;
    if (first) {
      return [...[...added.values()].map(item => merged(item, waiting.get(item.url))),
        ...queue.filter(item => !added.has(item.url))];
    }
    return [...queue.map(item => merged(item, added.get(item.url))),
      ...[...added.values()].filter(item => !waiting.has(item.url))];
  });
  await change('syncStatus', status => ({
    ...fresh || !status ? {saved: 0, skipped: 0, failed: 0} : status,
    left: queue.length,
    signedOut: false,
  }));
  showLeft(queue.length);
  runQueue();
}

async function withoutDone(items) {
  const done = new Set(await local(`synced.${user}`) || []);
  return items.filter(item => !done.has(item.url));
}

// 'saved', 'skipped' (already in Diigo), 'failed' or 'signedOut'
async function syncOne(item) {
  const found = await callDiigo('bm_loadBookmark', {url: item.url, what: 'bookmarkInfo'});
  // without an answer, don't save: it would overwrite what is in Diigo
  if (!found.ok) {
    if (found.answer?.code == -1) return 'signedOut';
    logError('Sync', `Diigo didn't say whether it has the bookmark (${found.status})`, item.url, found.answer);
    return 'failed';
  }
  let result = 'skipped';
  if (!found.answer.result?.saved) {
    const {ok, status, answer} = await diigoSave({...item, tags: await withSuggestedTags(item)});
    if (answer?.code == -1) return 'signedOut';
    result = ok ? 'saved' : 'failed';
    if (!ok) logError('Sync', `Diigo did not save the bookmark (${status})`, item.url, answer);
  }
  if (result == 'failed') return result;
  if (result == 'saved') indexAfterSync();
  await change(`synced.${user}`, (urls = []) => [...urls, item.url]);
  if (item.move) await removeMoved(item);
  return result;
}

// A bookmark new to Diigo (one that is in Diigo already is left as it is): its folder names as tags, and the tags of
// yours that its title or web address mentions, as the bookmark form suggests them (settings.js: tagsMentioned); not
// hidden ones. Your tags are those the form has too (background.js: loadUserTags), asked again after a while.
async function withSuggestedTags(item) {
  try {
    if (!userTagsTime || Date.now() - userTagsTime > 15 * 60 * 1000) await loadUserTags();
    else if (userTagsLoading) await userTagsLoading;
    const settings = await loadSettings();
    const names = userTags.map(tag => tag.name).filter(name => name && !isHiddenTag(settings, name));
    const lower = new Set(item.tags.map(tag => tag.toLowerCase()));
    return [...item.tags, ...tagsMentioned(item.title, item.url, names).filter(name => !lower.has(name.toLowerCase()))];
  } catch (e) {
    return item.tags;
  }
}

// What the sync saved is in the index of the Swift Library too, and an open Swift Library or Swift Discover follows
// (background.js: refreshIndex, which says indexChanged), as after a save with the bookmark form. Not after each of
// thousands: INDEX_EVERY after a save when none is waiting, so at most once in that while, the last ones of the queue
// too (refreshIndex reads all that changed since the index was last brought up to date).
const INDEX_EVERY = 5000;
let indexTimer = 0;

function indexAfterSync() {
  if (indexTimer) return;
  indexTimer = setTimeout(() => {
    indexTimer = 0;
    refreshIndex();
  }, INDEX_EVERY);
}

// a moved bookmark leaves the browser once it is in Diigo; a moved folder too, once it has no bookmarks left
async function removeMoved({bookmarkId, folderId}) {
  await browser.bookmarks.remove(bookmarkId).catch(() => {});
  if (!folderId) return;
  const [folder] = await browser.bookmarks.getSubTree(folderId).catch(() => []);
  const hasBookmark = node => !!node.url || (node.children || []).some(hasBookmark);
  // the folders right under the root, such as Bookmarks Menu, can't be removed
  if (folder && !hasBookmark(folder)) await browser.bookmarks.removeTree(folderId).catch(() => {});
}

async function runQueue() {
  if (syncRunning) return;
  syncRunning = true;
  try {
    await readCookie();
    for (;;) {
      const [item] = await local('syncQueue') || [];
      if (!item) break;
      browser.alarms.create(QUEUE_ALARM, {periodInMinutes: 1});
      const result = user ? await syncOne(item) : 'signedOut';
      if (result == 'signedOut') {
        await change('syncStatus', status => ({...status, signedOut: true}));
        return;
      }
      const queue = await change('syncQueue', (queue = []) => queue.filter(other => other.url != item.url));
      await change('syncStatus', status => ({...status, [result]: (status?.[result] || 0) + 1, left: queue.length}));
      showLeft(queue.length);
      await new Promise(resolve => setTimeout(resolve, SYNC_PAUSE));
    }
    browser.alarms.clear(QUEUE_ALARM);
  } finally {
    syncRunning = false;
  }
  showLeft(0);
}

// called by setUser in background.js: a sync that stopped because you were signed out goes on
function resumeSync() {
  runQueue();
}


// ---- the folders of the options page ----

// the number of bookmarks put in the queue, or 'signedOut'
async function syncFolders(fresh) {
  if (!await hasBookmarks()) return 0;
  await readCookie();
  if (!user) return 'signedOut';
  const settings = await loadSettings();
  const items = [];
  for (const id of settings.syncFolders) {
    // a folder that was removed since
    const found = await bookmarksIn(id, settings.syncFolderTags).catch(() => []);
    items.push(...found.map(item => ({...item, private: settings.syncPrivate})));
  }
  const todo = await withoutDone(items);
  await enqueue(todo, fresh);
  return todo.length;
}

async function setFoldersAlarm() {
  const {syncAuto} = await loadSettings();
  if (!syncAuto || !await hasBookmarks()) return browser.alarms.clear(FOLDERS_ALARM);
  if (!await browser.alarms.get(FOLDERS_ALARM)) browser.alarms.create(FOLDERS_ALARM, {periodInMinutes: SYNC_EVERY_MINUTES});
}


// ---- new bookmarks, while kept in sync ----

// Ctrl+D makes the bookmark right away, and you give it its name and folder after: so it goes to Diigo a minute later
async function onBookmarkCreated(id, node) {
  if (!node.url || !(await loadSettings()).syncAuto) return;
  await change('syncPending', (ids = []) => [...ids, id]);
  browser.alarms.create(NEW_ALARM, {delayInMinutes: 1});
}

async function syncPending() {
  const settings = await loadSettings();
  let ids = [];
  await change('syncPending', (pending = []) => {
    ids = pending;
    return [];
  });
  await readCookie();
  if (!settings.syncAuto || !user) return;
  const items = [];
  for (const id of ids) {
    try {
      const [node] = await browser.bookmarks.get(id);
      const folders = await ancestors(node.parentId);
      if (!folders.some(folder => settings.syncFolders.includes(folder.id))) continue;
      items.push(...(await bookmarksIn(id, settings.syncFolderTags)).map(item => ({...item, private: settings.syncPrivate})));
    } catch (e) {
      // removed in the meantime
    }
  }
  enqueue(await withoutDone(items));
}

function listenToBookmarks() {
  if (browser.bookmarks && !browser.bookmarks.onCreated.hasListener(onBookmarkCreated)) {
    browser.bookmarks.onCreated.addListener(onBookmarkCreated);
  }
}


// ---- the menu of a bookmark or folder, Firefox only ----

// called by createMenus in background.js
async function createBookmarkMenus() {
  if (!browser.runtime.getBrowserInfo || !await hasBookmarks()) return;
  browser.contextMenus.create({id: 'bookmark-save', title: browser.i18n.getMessage('menuSaveBookmark'), contexts: ['bookmark']});
  browser.contextMenus.create({id: 'bookmark-move', title: browser.i18n.getMessage('menuMoveBookmark'), contexts: ['bookmark']});
}

// Save to Diigo and Move to Diigo in the menu of a bookmark or folder. At once a … on the toolbar button, so you see it
// is taken; then how many are still to go (showLeft). What goes wrong is said there too (!, with why in its tooltip)
// and in the console of the background script, instead of nothing happening.
function showMenuProblem(why) {
  logError('Sync: Save or Move to Diigo', why);
  browser.action.setBadgeText?.({text: '!'}).catch(() => {});
  browser.action.setTitle?.({title: `${browser.i18n.getMessage('menuMoveBookmark')}: ${why}`}).catch(() => {});
}

browser.contextMenus?.onClicked.addListener(async info => {
  if (info.menuItemId != 'bookmark-save' && info.menuItemId != 'bookmark-move') return;
  try {
    browser.action.setBadgeText?.({text: '…'}).catch(() => {});
    await readCookie();
    if (!user) {
      showLeft(0);
      return browser.tabs.create({url: 'https://www.diigo.com/sign-in'});
    }
    const settings = await loadSettings();
    const move = info.menuItemId == 'bookmark-move';
    if (!info.bookmarkId || !browser.bookmarks) throw new Error(`no bookmark (${info.bookmarkId}, ${!!browser.bookmarks})`);
    const [node] = await browser.bookmarks.get(info.bookmarkId);
    const items = await bookmarksIn(info.bookmarkId, settings.syncFolderTags);
    // a bookmark that can't go to Diigo (not a web page: javascript:, file:, about:…) or a folder without any; said
    // with its name, as it is a bookmark you chose, not the page you're on
    if (!items.length) {
      const name = node.title || node.url || '?';
      return showMenuProblem(node.url ? browser.i18n.getMessage('syncNotWebPage', [name, node.url])
        : browser.i18n.getMessage('syncFolderEmpty', name));
    }
    const folderId = move && !node.url ? node.id : undefined;
    await enqueue(items.map(item => ({...item, private: settings.syncPrivate, move, folderId})), true, {first: true});
  } catch (e) {
    showMenuProblem(e?.message || String(e));
  }
});


// ---- messages, events ----

requests.syncNow = () => syncFolders(true);

browser.alarms.onAlarm.addListener(alarm => {
  if (alarm.name == FOLDERS_ALARM) syncFolders();
  if (alarm.name == NEW_ALARM) syncPending();
  if (alarm.name == QUEUE_ALARM) runQueue();
});

browser.storage.onChanged.addListener((changes, area) => {
  if (!settingsArea(area) || !(changes.syncAuto || changes.syncFolders)) return;
  setFoldersAlarm();
  // switched on, or other folders while on
  loadSettings().then(settings => settings.syncAuto && syncFolders());
});

// asked for, or taken away, on the options page
browser.permissions.onAdded.addListener(() => {
  listenToBookmarks();
  createMenus();
  setFoldersAlarm();
});
browser.permissions.onRemoved.addListener(() => {
  createMenus();
  setFoldersAlarm();
});

// Firefox doesn't keep alarms when it closes: the folders are checked when it starts
browser.runtime.onStartup.addListener(async () => {
  setFoldersAlarm();
  if ((await loadSettings()).syncAuto) syncFolders();
});

listenToBookmarks();
runQueue();

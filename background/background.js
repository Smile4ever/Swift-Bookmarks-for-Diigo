// Background script: knows who is signed in on diigo.com, talks to the Diigo API,
// keeps the toolbar icon up to date and opens the bookmark form on the page.
// Firefox runs it as an event page, Chrome and Edge as a service worker (chrome-sw.js): both stop it when it's idle,
// so what is kept here in variables can be gone the next time, and is looked up again.

globalThis.browser = globalThis.browser || globalThis.chrome;

// Diigo needs pv=13 and ct=tb in the path, else it answers with a web page or an error instead of JSON. Diigo's official
// add-on also sent its version (cv=6.0.0.5resigned1), which Diigo doesn't need (tried signed out, October 2026).
const API_URL = 'https://toolbar3.diigo.com/chappai/pv=13/ct=tb';

// the toolbar button, at 19 px and 38 px for screens with twice as many pixels; drawn from icons/*.svg
const toolbarIcon = name => ({19: `/icons/${name}.png`, 38: `/icons/${name}-38.png`});
const ICON = {
  normal: toolbarIcon('toolbar'),
  saved: toolbarIcon('toolbar-saved'),
  busy: toolbarIcon('toolbar-busy'),
  // with books: on a page that can't be bookmarked the button opens the Swift Library (markTab, onButton)
  library: toolbarIcon('toolbar-library'),
  // on diigo.com: with a gear, as the button opens the options there (onDiigo)
  options: toolbarIcon('toolbar-options'),
};

// sites where the browser doesn't let add-ons into the page: Firefox (extensions.webextensions.restrictedDomains),
// then the extension stores of Chrome and Edge
const PROTECTED_HOSTS = [
  'accounts-static.cdn.mozilla.net', 'accounts.firefox.com', 'addons.cdn.mozilla.net', 'addons.mozilla.org',
  'api.accounts.firefox.com', 'content.cdn.mozilla.net', 'discovery.addons.mozilla.org', 'install.mozilla.org',
  'oauth.accounts.firefox.com', 'profile.accounts.firefox.com', 'support.mozilla.org', 'sync.services.mozilla.com',
  'chrome.google.com', 'chromewebstore.google.com', 'microsoftedge.microsoft.com',
];

let user = '';          // signed-in user on diigo.com, '' when signed out
let userTags = [];      // [{name, count}]
let userGroups = [];    // [{name, displayName}]
let userOutliners = []; // [{id, title}]
let userTagsTime = 0;
let userTagsLoading = null; // a Promise while loadUserTags() runs
let requestNr = 1;
const lookups = new Map(); // tabId -> {url, controller, result}: the bookmark of the page in that tab


// ---- Diigo API ----

async function callDiigo(cmd, data, signal) {
  const body = new URLSearchParams({
    cmd,
    v: 13,
    _nocache: Math.random(),
    json: JSON.stringify(data),
    user,
    transId: requestNr++,
  });
  let status = 0, answer = null;
  try {
    // with a time limit (settings.js: timeLimit), so the queue of the sync (background/sync.js) never waits for good
    const response = await fetch(`${API_URL}/user=${user}/cmd=${cmd}/`,
      {method: 'POST', body, credentials: 'include', signal: timeLimit(signal)});
    status = response.status;
    answer = await response.json();
  } catch (e) {
    // no connection, aborted, or no JSON
  }
  if (answer?.user) setUser(answer.user);
  return {status, answer, ok: answer?.code == 1};
}


// ---- who is signed in ----

// Signed in, out or as someone else on diigo.com: the add-on follows at once (cookies.onChanged, after readCookie).
// The pages of the add-on hear it (userChanged: the Swift Library and Swift Discover), the toolbar icons start again
// (none saved signed out), and signed in, the page in the active tabs is looked up again.
function setUser(name = '') {
  if (name == user) return;
  user = name;
  userTags = [];
  userGroups = [];
  userOutliners = [];
  userTagsTime = 0;
  indexCache = null;
  for (const tabId of lookups.keys()) forget(tabId);
  browser.runtime.sendMessage({type: 'userChanged', user}).catch(() => {});
  browser.tabs.query(user ? {active: true} : {}).then(tabs => tabs.forEach(tab => user ? onTabLoading(tab) : markTab(tab)))
    .catch(() => {});
  if (!user) return;
  loadUserTags();
  // a sync of bookmarks that stopped because you were signed out, in background/sync.js
  globalThis.resumeSync?.();
}

async function readCookie() {
  const cookie = await browser.cookies.get({url: 'https://www.diigo.com', name: 'diigoandlogincookie'});
  setUser(cookie ? cookie.value.split('-.-')[1] || '' : '');
}

// The sign-in cookie of diigo.com, as it changes: signing out removes it, signing in sets it. Read again a moment
// after, as one change can be a removal followed by a new one (overwrite).
let cookieRead = 0;
// signing in while signed out: who, and when (afterSignIn, below)
let signedIn = null;
browser.cookies?.onChanged?.addListener(({cookie, removed}) => {
  if (cookie?.name != 'diigoandlogincookie' || !/(^|\.)diigo\.com$/.test(cookie.domain.replace(/^\./, ''))) return;
  if (!removed && !user) signedIn = {name: cookie.value.split('-.-')[1] || '', time: Date.now()};
  clearTimeout(cookieRead);
  cookieRead = setTimeout(() => readCookie().catch(() => {}), 200);
});

// The form waits for this while it runs (openBookmark): setUser() starts it without waiting, and right after the
// background script starts again the form would otherwise open without your tags, groups and outliners.
// Each user their own: signed in as someone else, it starts again for them.
function loadUserTags() {
  userTagsTime = Date.now();
  if (userTagsLoading?.user == user) return userTagsLoading;
  const loading = fetchUserTags().finally(() => {
    if (userTagsLoading == loading) userTagsLoading = null;
  });
  loading.user = user;
  return userTagsLoading = loading;
}

async function fetchUserTags() {
  const name = user;
  const {ok, answer} = await callDiigo('user_loadMyStuff', {what: 'myTags myGroups myProfile myBookmarkLists myContacts permissions'});
  if (name != user) return;
  // tried again the next time the form opens
  if (!ok) return userTagsTime = 0;
  const result = answer.result;
  userTags = result.myTagsWithCount || [];
  userGroups = (result.myGroups || []).map(group => ({name: group.name, displayName: group.displayName || group.name}));
  // the outliners, and the lists of before Diigo had outliners: Diigo's old add-on showed both, and saved either in `lists`
  userOutliners = [...(result.outliners || []), ...(result.myList || [])].map(list => ({id: String(list.id), title: list.title}));
}

function siteOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (e) {
    return '';
  }
}

// the tags of the last saved bookmark, only for a page on the same site
async function getLastTags(url) {
  const key = `lastTags.${user}`;
  const last = (await browser.storage.local.get(key))[key];
  return last?.site && last.site == siteOf(url) ? last.tags : [];
}

function setLastTags(tags, url) {
  if (tags.length) browser.storage.local.set({[`lastTags.${user}`]: {site: siteOf(url), tags: tags.slice(0, 8)}});
}


// ---- pages and the toolbar icon ----

// page: whether the form can be put on it, as the toolbar button does; not on the sites where browsers allow no add-on
// (PROTECTED_HOSTS). A bookmark of the browser to such a site can go to Diigo all the same (background/sync.js: page
// false): no page is opened for it.
function canBookmark(url, {page = true} = {}) {
  let u;
  try {
    u = new URL(url);
  } catch (e) {
    return false;
  }
  if (!/^https?:$/.test(u.protocol) || page && PROTECTED_HOSTS.includes(u.hostname)) return false;
  if (/(^|\.)diigo\./.test(u.hostname)) {
    // diigo.com pages that are not about one page
    if (/^\/(annotated\/|bookmark\/|user\/|outliner\/|cached|text_view|site\/text_view|item\/pdf)/i.test(u.pathname)) return false;
    if (/(player|slides?)\.diigo\./.test(u.hostname) && /^\/(list|feed)/i.test(u.pathname)) return false;
  }
  return true;
}

// Firefox for Android has no setIcon: the button is an item in its menu
function setIcon(tabId, kind) {
  browser.action.setIcon?.({tabId, path: ICON[kind]}).catch(() => {});
}

// On diigo.com itself (and its other sites, such as groups.diigo.com) the button, and its shortcut, open the options
// of the add-on instead of the bookmark form, with a gear on the icon: what is there is Diigo's own already.
function onDiigo(url) {
  try {
    return /(^|\.)diigo\.com$/i.test(new URL(url).hostname);
  } catch (e) {
    return false;
  }
}

// what the button opens (settings.js: toolbarButton), known at once for markTab, which can't wait for the settings
let buttonOpens = DEFAULT_SETTINGS.toolbarButton;
loadSettings().then(settings => buttonOpens = settings.toolbarButton).catch(() => {});
browser.storage.onChanged.addListener((changes, area) => {
  if (settingsArea(area) && changes.toolbarButton) loadSettings().then(settings => buttonOpens = settings.toolbarButton);
});

// On pages that can't be bookmarked (about:, file:, addons.mozilla.org...) the button opens the Swift Library, with
// books on its icon and a title that says so; on diigo.com the options. Set to open the Swift Library always
// (toolbarButton): its title says so, and its icon still shows whether a page is saved, with books where it can't be.
// False when there is no bookmark to look up.
function markTab(tab) {
  const action = browser.action;
  if (buttonOpens == 'library') {
    const ok = !onDiigo(tab.url) && canBookmark(tab.url);
    action.enable?.(tab.id)?.catch(() => {});
    action.setTitle?.({tabId: tab.id, title: browser.i18n.getMessage('browserActionLibraryTitle')}).catch(() => {});
    setIcon(tab.id, ok ? 'normal' : 'library');
    return ok;
  }
  if (onDiigo(tab.url)) {
    action.enable?.(tab.id)?.catch(() => {});
    action.setTitle?.({tabId: tab.id, title: browser.i18n.getMessage('browserActionOptionsTitle')}).catch(() => {});
    setIcon(tab.id, 'options');
    return false;
  }
  const ok = canBookmark(tab.url);
  action.enable?.(tab.id)?.catch(() => {});
  // the title in full: Chrome doesn't take null for "the default title"
  action.setTitle?.({tabId: tab.id, title: browser.i18n.getMessage(ok ? 'browserActionDefaultTitle' : 'cannotBookmark')}).catch(() => {});
  setIcon(tab.id, ok ? 'normal' : 'library');
  return ok;
}

function lookUp(tabId, url) {
  forget(tabId);
  const controller = new AbortController();
  const result = callDiigo('bm_loadBookmark', {url, what: 'bookmarkInfo annotations pageComments'}, controller.signal)
    .then(r => r.ok ? r.answer.result : null);
  lookups.set(tabId, {url, controller, result});
  return result;
}

function forget(tabId) {
  lookups.get(tabId)?.controller.abort();
  lookups.delete(tabId);
}

async function onTabLoading(tab) {
  forget(tab.id);
  if (!markTab(tab)) return;
  await readCookie();
  if (!user) return;
  const result = lookUp(tab.id, tab.url);
  let saved = !!(await result)?.saved;
  // with cleanUrls the form saves it without tracking parameters (cleanUrl), so it can be there so
  const clean = cleanUrl(tab.url);
  if (!saved && clean != tab.url && (await loadSettings()).cleanUrls) {
    const {ok, answer} = await callDiigo('bm_loadBookmark', {url: clean, what: 'bookmarkInfo'});
    saved = ok && !!answer.result?.saved;
  }
  // at nearly the same web address in the index (urlKey: http or https, www., tracking parameters…), which the form
  // then opens to edit (openBookmark: otherAddress); also one Diigo doesn't find at its own web address
  if (!saved) {
    const {items} = await userIndex();
    const key = urlKey(tab.url);
    saved = !!items?.some(item => item.url && (item.url == tab.url || urlKey(item.url) == key));
  }
  if (saved && lookups.get(tab.id)?.result == result) setIcon(tab.id, 'saved');
}


// ---- what form/form.js, the pages of the add-on and the scripts of diigo-site/ ask ----

async function findBookmark(url, tab) {
  const lookup = lookups.get(tab?.id);
  if (lookup?.url == url) return lookup.result;
  const {ok, answer} = await callDiigo('bm_loadBookmark', {url, what: 'bookmarkInfo annotations pageComments'});
  return ok ? answer.result : null;
}

// The bookmark of a page for the form, with your tags, groups and outliners. Not saved at url: with cleanUrls, the
// bookmark at the web address preferredUrl gives, when that is another one; else the one at nearly the same web address
// (similarBookmarks: http or https, www., tracking parameters…), the newest, to edit rather than a new one beside it
// (otherAddress, which the form says); else a new one. Diigo's toolbar API finds a bookmark only at its web address as
// Diigo wrote it: one it doesn't find but the index has is as the index has it (asFound). Also from the index (when
// there is one): the tags you use together (relatedTags) and the other bookmarks at nearly the same web address
// (similar).
async function openBookmark({url, title, canonical = ''}, tab) {
  const tagsOutdated = user && Date.now() - userTagsTime > 15 * 60 * 1000;
  const [first, settings, cached] = await Promise.all([
    findBookmark(url, tab), loadSettings(), userIndex(), userTagsLoading || tagsOutdated && loadUserTags(),
  ]);
  let found = first;
  let bookmarkUrl = url;
  if (!found?.saved && settings.cleanUrls) {
    const preferred = preferredUrl(url, canonical);
    if (preferred != url) {
      found = await findBookmark(preferred);
      bookmarkUrl = preferred;
    }
  }
  const items = cached.items || [];
  if (!found?.saved) {
    const own = items.find(item => item.url == url || item.url == bookmarkUrl);
    if (own) {
      found = asFound(own);
      bookmarkUrl = own.url;
    }
  }
  let otherAddress = false;
  if (!found?.saved) {
    const [other] = similarBookmarks(items, bookmarkUrl);
    const item = other && items.find(item => item.url == other.url);
    if (item) {
      const diigo = await findBookmark(item.url);
      found = diigo?.saved ? diigo : asFound(item);
      bookmarkUrl = item.url;
      otherAddress = true;
    }
  }
  const saved = !!found?.saved;
  const info = saved && found.bookmarkInfo || {};
  // a saved one the index knows: its link_id, to save it again by that (saveByLinkId), as the toolbar API, by its web
  // address, can make a new one beside it (one at nearly the same web address, written otherwise by Diigo)
  const indexed = saved && items.find(item => item.url == (found.url || bookmarkUrl));
  const linkId = saved ? found.linkId || indexed?.id || '' : '';
  const browserBookmarks = await browserBookmarksOf([url, bookmarkUrl, found?.url]);
  return {
    // bookmarks of the browser of this page: the form has Move then (form.js), which removes them once it is saved
    browserBookmarks,
    user,
    userTags,
    userGroups,
    userOutliners,
    lastTags: await getLastTags(url),
    relatedTags: relatedTagsOf(items, settings),
    similar: similarBookmarks(items, saved ? found.url || bookmarkUrl : bookmarkUrl),
    otherAddress,
    annotated: !!(found && (found.annotated || found.annotations?.length || found.pageComments?.length)),
    bookmark: {
      saved,
      url: found?.url || bookmarkUrl,
      urlId: found?.urlId || '',
      // known in the index: saved again by its link_id (saveByLinkId)
      linkId,
      title: saved ? info.title : title || url,
      description: info.description || '',
      tags: info.tags || [],
      private: saved ? info.mode == 2 : true,
      unread: !!info.unread,
      date: info.datetime || '',
    },
  };
}

// The bookmarks of the browser at one of these web addresses: their ids. Only with access to the bookmarks (the
// optional permission of the options page); none without it.
async function browserBookmarksOf(urls) {
  if (!browser.bookmarks || !await browser.permissions.contains({permissions: ['bookmarks']}).catch(() => false)) return [];
  const ids = new Set();
  for (const url of new Set(urls.filter(Boolean))) {
    const found = await browser.bookmarks.search({url}).catch(() => []);
    found.filter(node => node.url && node.type != 'folder').forEach(node => ids.add(node.id));
  }
  return [...ids];
}

// Move in the form, once Diigo saved the page: these bookmarks leave the browser, as Move to Diigo in the menu of a
// bookmark does (sync.js: removeMoved)
async function removeBrowserBookmarks({ids = []}) {
  if (!browser.bookmarks) return false;
  for (const id of ids) {
    await browser.bookmarks.remove(String(id)).catch(e => logError('Bookmark form: Move', e, id));
  }
  return true;
}

// Random bookmark in the menu of the toolbar button: the page of one of your bookmarks, at random, in a new tab next to
// tab. From the index of the Swift Library: a bookmark of a web page, none with a hidden tag. Without an index (not
// built yet, or of someone else), Random in the Swift Library, which builds it.
// last: the id of the one opened before, not picked again right after (unless it's the only one)
function pickRandomBookmark(items, settings, last = '') {
  const fitting = items.filter(item => (!item.type || item.type == 'bookmark') && /^https?:\/\//i.test(item.url || '') &&
    !item.tags.some(tag => isHiddenTag(settings, tag)));
  const other = fitting.length > 1 ? fitting.filter(item => item.id != last) : fitting;
  return other.length ? other[Math.floor(Math.random() * other.length)] : null;
}

// The bookmark opened is remembered with its tab (storage.session, as a background script that sleeps in between
// forgets): once its page is loaded, the bookmark form opens on it, as a click on the toolbar button opens it, with
// that bookmark as Diigo has it (its web address, also when the site led elsewhere). Only within RANDOM_FORM_TIME.
const RANDOM_OPENED = 'randomOpened';
const RANDOM_FORM_TIME = 2 * 60 * 1000;

const randomOpened = async () =>
  (await browser.storage.session?.get(RANDOM_OPENED).catch(() => null))?.[RANDOM_OPENED] || {};

async function openRandomBookmark(tab) {
  const [{items}, settings, opened] = await Promise.all([userIndex(), loadSettings(), randomOpened()]);
  const item = items && pickRandomBookmark(items, settings, opened.lastId);
  if (!item) return openLibrary({view: 'random'}, tab);
  try {
    const created = await browser.tabs.create({url: item.url, index: tab ? tab.index + 1 : undefined});
    await browser.storage.session?.set({[RANDOM_OPENED]: {
      lastId: item.id, tabId: created.id, url: item.url, title: item.title || item.url, time: Date.now(),
    }});
  } catch (e) {
    logError('Random bookmark', e, item.url);
  }
}

// a page loaded: the form of the random bookmark on it, when that is what this tab was opened for
async function formForRandom(tab) {
  const opened = await randomOpened();
  if (!opened.tabId || opened.tabId != tab.id) return;
  // once: the next page in that tab is yours to open
  await browser.storage.session.set({[RANDOM_OPENED]: {lastId: opened.lastId}});
  if (Date.now() - opened.time > RANDOM_FORM_TIME) return;
  showForm(tab, {url: opened.url, title: opened.title});
}

// also used by background/sync.js
function diigoSave(bm) {
  return callDiigo('bm_saveBookmark', {
    url: bm.url,
    urlId: bm.urlId || '',
    title: bm.title,
    description: bm.description || '',
    tags: bm.tags,
    mode: bm.private ? 2 : 0,
    unread: !!bm.unread,
    cache: false,
    // a group by its name, an outliner by its id, as Diigo's old add-on sent them
    groups: bm.group ? [bm.group] : [],
    lists: bm.outliner ? [bm.outliner] : [],
    shareExistingAnnotations: false,
  });
}

async function saveBookmark(bm, tab) {
  // the toolbar icon is about the page, not about a link on it
  const isPage = tab?.url == bm.url;
  if (isPage) setIcon(tab.id, 'busy');

  // a screenshot of the page along (the box of the form): as an image in your library, a link to it in the description
  if (bm.screenshot && tab) {
    const shot = await pageScreenshot(tab, bm).catch(e => logError('Screenshot', e));
    if (shot) bm = {...bm, description: [bm.description, browser.i18n.getMessage('screenshotLine', shot)].filter(Boolean).join('\n\n')};
  }

  // a saved one the index knows (openBookmark: linkId) by its link_id, as Diigo's edit window saves one: the toolbar
  // API, by web address, can make a new one beside it; not when it is shared to a group or an outliner, which only the
  // toolbar API does
  const {ok, status, answer} = bm.linkId && !bm.group && !bm.outliner ? await saveByLinkId(bm) : await diigoSave(bm);

  if (ok) {
    setLastTags(bm.tags, bm.url);
    // in the index of the Swift Library too
    refreshIndexSoon();
  } else {
    logError('Bookmark form', `Diigo did not save the bookmark (${status})`, bm.url, answer);
  }
  // the page, or one at nearly its web address (opened by the form for it: openBookmark, otherAddress)
  if (isPage || bm.linkId && tab) {
    forget(tab.id);
    setIcon(tab.id, ok ? 'saved' : 'normal');
  }
  return {
    ok,
    status,
    code: answer?.code,
    message: typeof answer?.result == 'string' ? answer.result : answer?.message,
  };
}

// A bookmark saved as Diigo's own edit window saves one (options/library-index.js: saveWithNewUrl): by its link_id, at
// its web address (url, or new_url when the field of the form has another one now), the rest as the form has it. The
// answer as diigoSave's, for saveBookmark.
const BOOKMARK_SAVE_URL = 'https://www.diigo.com/item/save/bookmark';

async function saveByLinkId(bm) {
  const tags = (bm.tags || []).map(tag => /\s/.test(tag) ? `"${tag}"` : tag).join(' ');
  const body = new URLSearchParams({link_id: bm.linkId, url: bm.oldUrl || bm.url, new_url: bm.url, title: bm.title,
    description: bm.description || '', tags, private: !!bm.private, unread: !!bm.unread});
  try {
    const response = await fetch(BOOKMARK_SAVE_URL, {method: 'POST', credentials: 'include',
      headers: {'X-Requested-With': 'XMLHttpRequest'}, body, signal: timeLimit()});
    const text = await response.text();
    let saved = null;
    try {
      saved = JSON.parse(text)?.items?.[0];
    } catch (e) {
    }
    const ok = response.ok && !!saved?.link_id;
    return {ok, status: response.status, answer: ok ? {code: 1} : {code: 0, message: text.slice(0, 200)}};
  } catch (e) {
    return {ok: false, status: 0, answer: {message: e.message}};
  }
}

// A screenshot of what the tab shows, without the form (content.js: formVisible), as Diigo's Add Image uploads an
// image (options/library-index.js: uploadFile): private, with the tags of the bookmark and screenshot, named after its
// title. The answer is the web address of the image on Diigo, or '' when Diigo didn't take it.
const IMAGE_SAVE_URL = 'https://www.diigo.com/item/save/image';

async function pageScreenshot(tab, bm) {
  const visible = shown => browser.tabs.sendMessage(tab.id, {type: 'formVisible', visible: shown}).catch(() => {});
  await visible(false);
  let shot;
  try {
    shot = await browser.tabs.captureVisibleTab(tab.windowId, {format: 'jpeg', quality: 85});
  } finally {
    await visible(true);
  }
  const blob = await (await fetch(shot)).blob();
  const name = (browser.i18n.getMessage('screenshotName', (bm.title || bm.url).slice(0, 80)) || 'Screenshot')
    .replace(/[\\/:*?"<>|]+/g, ' ').trim() + '.jpg';
  const tags = [...new Set([...bm.tags || [], 'screenshot'])];
  const form = new FormData();
  form.append('qqfile', blob, name);
  form.append('qqfilename', name + '_1');
  form.append('private', true);
  form.append('tags', tags.map(tag => /\s/.test(tag) ? `"${tag}"` : tag).join(' '));
  form.append('lists', '');
  form.append('groups', '');
  const response = await fetch(IMAGE_SAVE_URL, {method: 'POST', credentials: 'include', body: form,
    headers: {'X-Requested-With': 'XMLHttpRequest'}, signal: timeLimit(undefined, FILE_TIME)});
  const answer = await response.text();
  let saved = null;
  try {
    saved = JSON.parse(answer)?.items?.[0];
  } catch (e) {
  }
  if (!response.ok || !saved?.link_id) {
    logError('Screenshot', `Diigo did not save the screenshot (${response.status})`, answer.slice(0, 300));
    return '';
  }
  return /^https?:/.test(saved.url || '') ? saved.url : `https://www.diigo.com/item/image/${saved.link_id}`;
}

async function deleteBookmark({url, urlId}, tab) {
  const {ok} = await callDiigo('bm_deleteBookmark', {urlId});
  // the Delete of the bookmark form: to the trash of the Swift Library too
  if (ok) trashItems({items: [{url}]});
  if (ok && tab?.url == url) {
    forget(tab.id);
    setIcon(tab.id, 'normal');
  }
  return ok;
}

// ---- the library page by page, for the index (refreshIndex) ----

// The library page by page, as diigo.com loads it itself (docs/diigo-com.md): {items, total}; tags are one string,
// separated by commas
const LIBRARY_URL = 'https://www.diigo.com/interact_api/load_user_items';

async function libraryPage(pageNum, {count, sort}) {
  const params = new URLSearchParams({page_num: pageNum, sort, count});
  try {
    const response = await fetch(`${LIBRARY_URL}?${params}`, {credentials: 'include', signal: timeLimit()});
    return await response.json();
  } catch (e) {
    return null;
  }
}

// ---- the trash of the Swift Library, for what is deleted elsewhere: Diigo's delete window, the bookmark form ----

// The index of options/library-index.js (IndexedDB library-index, opened by openIndexDb of options/index-item.js),
// which this background script shares as a page of the add-on. Each item is copied from the index when it's there (by link_id, else URL),
// with all it has, and taken out of it; else made of what the page showed (title, URL, tags; private, as it's not
// known). Fails quietly: the bookmark is deleted on Diigo all the same.
const idbDone = request => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const openLibraryIndex = () => openIndexDb();

// One after the other: what delete-window.js sends (with the file of an image or a PDF) and what the request of
// diigo.com itself says (DIIGO_DELETES, without it) are about the same items; the second finds them gone from the
// index then, and leaves the copy of the first as it is.
let trashing = Promise.resolve();

function trashItems(request) {
  const run = trashing.then(() => trashNow(request));
  trashing = run.catch(() => {});
  return run;
}

async function trashNow({items}) {
  try {
    const db = await openLibraryIndex();
    const indexed = await idbDone(db.transaction('items').objectStore('items').getAll());
    // the files of images and PDFs, asked for when Delete was chosen (keepFiles)
    const files = {};
    for (const {linkId} of items || []) {
      const kept = linkId && await keptFiles.get(String(linkId));
      if (kept) files[linkId] = {file: kept.file, fileName: kept.name};
      keptFiles.delete(String(linkId));
    }
    const transaction = db.transaction(['items', 'trash'], 'readwrite');
    let removed = 0;
    for (const {linkId, url, title, tags} of items || []) {
      const found = indexed.find(item => linkId ? item.id == linkId : item.url == url);
      const copy = found || {
        id: linkId || 'url:' + url, url: url || '', title: title || url || '', description: '', tags: tags || [],
        type: 'bookmark', private: true, unread: false, annotated: false, created: 0, updated: 0,
      };
      // a note has no URL: only one from the index; one with only its link_id (the request of
      // diigo.com, DIIGO_DELETES) neither
      if (!copy.url && !found) continue;
      transaction.objectStore('trash').put({...copy, ...files[linkId], deletedAt: Date.now()});
      if (found) {
        transaction.objectStore('items').delete(found.id);
        removed++;
      }
    }
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = transaction.onabort = () => reject(transaction.error);
    });
    db.close();
    // the address bar, the form and a Swift Library or Swift Discover that is open: without them from now on
    if (removed) {
      indexCache = null;
      browser.runtime.sendMessage({type: 'indexChanged'}).catch(() => {});
    }
    updateAlsoHidden();
  } catch (e) {
    logError('Trash', e);
  }
}

// The files of the images and PDFs about to be deleted in Diigo's delete window (diigo-site/delete-window.js): asked
// for when Delete is chosen, before Diigo deletes them once it's confirmed, as the trash can't get them after
// (itemFile). link_id -> the promise of {file, name} or null; only for images and PDFs in the index. Those not deleted after all are
// forgotten after a while.
const keptFiles = new Map();

async function keepFiles({items}) {
  try {
    const db = await openLibraryIndex();
    const indexed = await idbDone(db.transaction('items').objectStore('items').getAll());
    db.close();
    const withFile = new Set(indexed.filter(item => WITH_FILE.includes(item.type)).map(item => item.id));
    for (const {linkId} of items || []) {
      const id = String(linkId || '');
      if (!withFile.has(id) || keptFiles.has(id)) continue;
      keptFiles.set(id, itemFile(id));
      setTimeout(() => keptFiles.delete(id), 10 * 60 * 1000);
    }
  } catch (e) {
    logError('Trash: the files of images and PDFs', e);
  }
}

// ---- the index of the Swift Library, for what is saved elsewhere: on diigo.com itself, with the bookmark form ----

// What diigo.com saves (a new bookmark, note, image or PDF, an edit, tags, read or private) is in the index a moment
// later, brought up to date as options/library-index.js does it (updateIndex): the library by last change, page by
// page, until a page reaches what the index has already. Only an index of who is signed in, of this version; a fast
// library that is open reads it again (indexChanged). The requests of diigo.com are seen as they end (webRequest), the
// bookmark form asks for it itself (saveBookmark). Fails quietly: the next update of the Swift Library brings it.
const DIIGO_CHANGES = [
  'https://www.diigo.com/item/*', 'https://www.diigo.com/ditem_mana2/*',
  'https://www.diigo.com/interact_api/edit_item_tags*',
];
const INDEX_PAGE_SIZE = 96;
let indexRefresh = 0;

// one refresh for a few requests at once
function refreshIndexSoon() {
  clearTimeout(indexRefresh);
  indexRefresh = setTimeout(refreshIndex, 1000);
}

async function refreshIndex() {
  let db = null;
  try {
    db = await openLibraryIndex();
    const meta = await idbDone(db.transaction('meta').objectStore('meta').get('meta'));
    await readCookie();
    if (!meta?.newest || meta.user != user || meta.version != INDEX_VERSION) return;
    const changed = [];
    let total = meta.total;
    for (let pageNum = 0; ; pageNum++) {
      const page = await libraryPage(pageNum, {count: INDEX_PAGE_SIZE, sort: 'updated'});
      if (!Array.isArray(page?.items)) return;
      total = page.total || total;
      const items = page.items.map(indexItem).filter(item => item.id);
      changed.push(...items.filter(item => item.updated >= meta.newest));
      if (items.length < INDEX_PAGE_SIZE || items.some(item => item.updated < meta.newest)) break;
    }
    const newest = changed.reduce((newest, item) => Math.max(newest, item.updated), meta.newest);
    const transaction = db.transaction(['items', 'meta'], 'readwrite');
    changed.forEach(item => transaction.objectStore('items').put(item));
    transaction.objectStore('meta').put({...meta, updated: Date.now(), total, newest}, 'meta');
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = transaction.onabort = () => reject(transaction.error);
    });
    browser.runtime.sendMessage({type: 'indexChanged'}).catch(() => {});
  } catch (e) {
    logError('Index: update', e);
  } finally {
    db?.close();
  }
  updateAlsoHidden();
}

// The tags hidden along with the hidden ones (settings.js: alsoHiddenTags), from the whole index: after a refresh of it,
// and when the hidden tags change on the options page. Also done by the Swift Library, after its own changes.
async function updateAlsoHidden() {
  try {
    const db = await openLibraryIndex();
    const items = await idbDone(db.transaction('items').objectStore('items').getAll());
    db.close();
    const {hiddenTags, alsoHiddenTags} = await loadSettings();
    const found = alsoHiddenOf(items.map(item => ({tags: Array.isArray(item.tags) ? item.tags : []})), hiddenTags);
    if (JSON.stringify(found) != JSON.stringify(alsoHiddenTags)) await browser.storage.local.set({alsoHiddenTags: found});
  } catch (e) {
    logError('Index: tags hidden along', e);
  }
}

browser.storage.onChanged.addListener((changes, area) => {
  if (settingsArea(area) && changes.hiddenTags) updateAlsoHidden();
});

// only what diigo.com asks for itself (originUrl in Firefox, initiator in Chrome), not the add-on
const fromDiigo = details => (details.originUrl || details.initiator || '').startsWith('https://www.diigo.com');

browser.webRequest?.onCompleted.addListener(details => {
  if (details.statusCode == 200 && fromDiigo(details)) refreshIndexSoon();
}, {urls: DIIGO_CHANGES, types: ['xmlhttprequest']});

// ---- what diigo.com deletes, out of the index ----

// An update of the index can't see what was deleted (it only brings what changed), so without this the index would
// have to be built again. Diigo deletes items with one request, wherever on diigo.com (the ⋮ menu of a bookmark, Bulk
// Edit, the page of an item): delete_b, link_id with their ids separated by commas (docs/diigo-com.md). Its ids are
// read as it goes (onBeforeRequest, the form it sends), and once Diigo answered it (onCompleted, 200) they go out of
// the index, to the trash with what the index has of them (trashItems). What delete-window.js sent already is gone from
// the index, so it isn't there twice; the file of an image or a PDF only comes along that way (keepFiles), as it's
// gone once Diigo has deleted it. Not what is deleted elsewhere (Diigo's app, another browser): the Swift Library
// builds the index again by itself when the numbers differ (library.js: checkCount).
const DIIGO_DELETES = ['https://www.diigo.com/ditem_mana2/delete_b*'];
const deleting = new Map();  // requestId -> the ids it deletes

function deletedIds(body) {
  let ids = body?.formData?.link_id;
  if (!ids && body?.raw?.[0]?.bytes) {
    try {
      ids = new URLSearchParams(new TextDecoder().decode(body.raw[0].bytes)).getAll('link_id');
    } catch (e) {
    }
  }
  return [...new Set((ids || []).flatMap(value => String(value).split(',')).map(id => id.trim()).filter(Boolean))];
}

browser.webRequest?.onBeforeRequest.addListener(details => {
  if (details.method != 'POST' || !fromDiigo(details)) return;
  const ids = deletedIds(details.requestBody);
  if (ids.length) deleting.set(details.requestId, ids);
}, {urls: DIIGO_DELETES, types: ['xmlhttprequest']}, ['requestBody']);

browser.webRequest?.onCompleted.addListener(details => {
  const ids = deleting.get(details.requestId);
  deleting.delete(details.requestId);
  if (ids && details.statusCode == 200) trashItems({items: ids.map(linkId => ({linkId}))});
}, {urls: DIIGO_DELETES, types: ['xmlhttprequest']});

browser.webRequest?.onErrorOccurred.addListener(details => deleting.delete(details.requestId),
  {urls: DIIGO_DELETES, types: ['xmlhttprequest']});

// options/library.html, the library of the add-on: the tab it is open in already in this window (that of tab), with
// what is asked for in its address, else as it is; or a new tab next to tab; or in tab itself with here (My Library on
// diigo.com, diigo-site/header.js: takeOverMyLibrary, and after signing in). view: what it shows (trash), or random:
// some of your bookmarks at random (options/library-search.js: fillRandom picks them for an id it doesn't know)
async function openLibrary({view, here} = {}, tab) {
  const hash = view == 'random' ? '#random=new' : view ? '#view=' + encodeURIComponent(view) : '';
  const page = browser.runtime.getURL('options/library.html');
  const url = page + hash;
  if (here && tab) return browser.tabs.update(tab.id, {url});
  const inWindow = tab?.windowId != null ? {windowId: tab.windowId} : {currentWindow: true};
  const open = (await browser.tabs.query(inWindow).catch(() => []) || []).find(other => other.url?.split('#')[0] == page);
  if (open) return browser.tabs.update(open.id, hash ? {active: true, url} : {active: true});
  return browser.tabs.create({url, index: tab ? tab.index + 1 : undefined});
}

// options/discover.html, Swift Discover, in a new tab next to tab
function openDiscover(request, tab) {
  browser.tabs.create({url: browser.runtime.getURL('options/discover.html'), index: tab ? tab.index + 1 : undefined});
}

// options/tools.html, the Tools page of the add-on: in a new tab next to tab, or in tab itself with here (Tools on
// diigo.com, diigo-site/header.js)
function openPage(page, {here} = {}, tab) {
  const url = browser.runtime.getURL(page);
  if (here && tab) browser.tabs.update(tab.id, {url});
  else browser.tabs.create({url, index: tab ? tab.index + 1 : undefined});
}
const openTools = (request, tab) => openPage('options/tools.html', request, tab);
// options/guide.html, the guide of the add-on: what it does more than Diigo, in the place of Diigo's Learn more
const openGuide = (request, tab) => openPage('options/guide.html', request, tab);
// the options page, as the browser opens it (in a tab of its own: options_ui, open_in_tab)
const openOptions = () => browser.runtime.openOptionsPage();

// The settings of the improvements of diigo.com that are gone, and the bookmark Random bookmark picked for it: out of
// storage.local once the add-on is updated (onInstalled, below)
// menuItems: the menu at the top of diigo.com, set on the options page before 2026.11.22; now one button (header.js)
const OLD_SETTINGS = ['showSignedIn', 'editDeleteButtons', 'privateNoSharing', 'hideAds', 'compactLibrary',
  'hideGooglePlay', 'modernDiscover', 'hideClassic', 'hideUpgrade', 'randomBookmark', 'showTrash', 'menuItems',
  'myLibraryHidden', 'myGroupsHidden', 'myOutlinersHidden'];
const forgetOldSettings = () => {
  browser.storage.local.remove(OLD_SETTINGS).catch(() => {});
  browser.storage.sync?.remove(OLD_SETTINGS).catch(() => {});
};

// The tag hidden is one of the hidden tags by default (settings.js); hidden tags saved before that get it once, so
// taking it out again on the options page lasts (hiddenDefaultAdded, not a setting of the options page)
async function addHiddenDefault() {
  const {hiddenDefaultAdded} = await browser.storage.local.get('hiddenDefaultAdded');
  if (hiddenDefaultAdded) return;
  const {hiddenTags} = await loadSettings();
  if (Array.isArray(hiddenTags) && !hiddenTags.some(tag => tag.toLowerCase() == 'hidden')) {
    await saveSettings({hiddenTags: [...hiddenTags, 'hidden']});
  }
  await browser.storage.local.set({hiddenDefaultAdded: true});
}



// The settings were kept in this browser only (storage.local) before 2026.11.22: once, those of SYNCED_SETTINGS go to
// storage.sync too (settings.js), unless another computer put them there first, which then win, as they will on each
// computer (loadSettings). settingsSynced: done, not a setting of the options page.
async function settingsToSync() {
  if (!browser.storage.sync) return;
  const {settingsSynced, listsSynced} = await browser.storage.local.get(['settingsSynced', 'listsSynced']);
  if (!settingsSynced) {
    const [here, synced] = await Promise.all([browser.storage.local.get(SYNCED_SETTINGS), browser.storage.sync.get(SYNCED_SETTINGS)]);
    const missing = Object.fromEntries(Object.entries(here).filter(([key]) => !(key in synced)));
    await saveSettings(missing);
    await browser.storage.local.set({settingsSynced: true});
  }
  // the lists of SYNCED_LISTS: what each computer had, together
  if (!listsSynced) {
    const [here, synced] = await Promise.all([browser.storage.local.get(SYNCED_LISTS), browser.storage.sync.get(SYNCED_LISTS)]);
    const both = Object.fromEntries(Object.entries(here).map(([key, value]) => [key, keptTogether(value, synced[key])]));
    await saveSettings(both);
    await browser.storage.local.set({listsSynced: true});
  }
}

// two of a list of SYNCED_LISTS as one: a list, or {urls, sites} of lists (ignoredLinks)
function keptTogether(a, b) {
  if (b == null) return a;
  if (Array.isArray(a) || Array.isArray(b)) return [...new Set([...[a].flat(), ...[b].flat()].filter(v => v != null))];
  return Object.fromEntries([...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])]
    .map(key => [key, keptTogether(a?.[key] || [], b?.[key] || [])]));
}

// for diigo-site/diigo-site.js (who is signed in)
async function signedInUser() {
  await readCookie();
  return user;
}


// ---- the index, for the address bar and the bookmark form ----

// All items of the index of who is signed in ({items, time}; items null without one), read again after INDEX_KEEP, as
// the Swift Library and refreshIndex change it; what is worked out from it is kept along (bookmarks, for the address bar)
const INDEX_KEEP = 30 * 1000;
let indexCache = null;

async function userIndex() {
  if (indexCache && Date.now() - indexCache.time < INDEX_KEEP) return indexCache;
  let items = null;
  try {
    const db = await openLibraryIndex();
    const [meta, all] = await Promise.all([
      idbDone(db.transaction('meta').objectStore('meta').get('meta')),
      idbDone(db.transaction('items').objectStore('items').getAll()),
    ]);
    db.close();
    await readCookie();
    if (meta?.built && meta.user == user) items = all.filter(item => item && Array.isArray(item.tags));
  } catch (e) {
    logError('Index: read', e);
  }
  indexCache = {items, time: Date.now()};
  return indexCache;
}

// The tags you use together, for the bookmark form (form.js: showRelated): for each tag (in lower case) the tags most
// often on the same bookmarks, [[name, how many], …], at least RELATED_LEAST times together. Not from bookmarks with a
// hidden tag: those would give their tags away.
const RELATED_PER_TAG = 8;
const RELATED_LEAST = 2;

function relatedTagsOf(items, settings) {
  const together = new Map();  // tag -> Map(other tag -> how many)
  const names = new Map();     // tag -> as it is written
  for (const item of items) {
    const tags = new Map(item.tags.map(tag => [tag.toLowerCase(), tag]));
    if (tags.size < 2 || item.tags.some(tag => isHiddenTag(settings, tag))) continue;
    for (const [key, name] of tags) {
      if (!names.has(key)) names.set(key, name);
      if (!together.has(key)) together.set(key, new Map());
      const others = together.get(key);
      for (const other of tags.keys()) if (other != key) others.set(other, (others.get(other) || 0) + 1);
    }
  }
  // no prototype: a tag can be called constructor or __proto__
  const related = Object.create(null);
  for (const [key, others] of together) {
    const top = [...others].filter(([, count]) => count >= RELATED_LEAST).sort((a, b) => b[1] - a[1])
      .slice(0, RELATED_PER_TAG);
    if (top.length) related[key] = top.map(([other, count]) => [names.get(other), count]);
  }
  return related;
}

// a bookmark of the index as Diigo's toolbar API answers one (findBookmark), for the form: when it saves it, Diigo
// finds it again by its web address
function asFound(item) {
  const date = item.created ? 'on ' + new Date(item.created * 1000)
    .toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'}) : '';
  return {saved: true, url: item.url, urlId: '', linkId: item.id, bookmarkInfo: {title: item.title,
    description: item.description || '', tags: item.tags || [], mode: item.private ? 2 : 0, unread: item.unread ? 1 : 0,
    datetime: date}};
}

// The bookmarks of the index at the same web address but for how it is written (urlKey: http or https, www.,
// tracking parameters…), not url itself: for the bookmark form, that it is in your library already
const SIMILAR_MAX = 3;

function similarBookmarks(items, url) {
  const key = urlKey(url);
  return items.filter(item => item.url && item.url != url && urlKey(item.url) == key)
    .sort((a, b) => b.created - a.created).slice(0, SIMILAR_MAX)
    .map(item => ({url: item.url, title: item.title, created: item.created}));
}

// With cleanUrls: the web address a new bookmark gets, without tracking parameters (cleanUrl), or the one the page
// calls its own (rel=canonical), when that is on the same site. Not a canonical of the home page for a page that isn't:
// some sites give that on every page; nor for a page with a #…, which is often another page of an app (#/inbox).
function preferredUrl(url, canonical) {
  const clean = cleanUrl(url);
  try {
    const page = new URL(clean), own = new URL(canonical);
    const home = own.pathname == '/' && page.pathname != '/';
    const same = siteOf(own.href) == siteOf(page.href);
    if (/^https?:$/.test(own.protocol) && same && !home && !page.hash) return cleanUrl(own.href);
  } catch (e) {
  }
  return clean;
}


// ---- the address bar: d, a space and words give the bookmarks of the index with them ----

// Only bookmarks, not notes, images or PDFs, of who is signed in, the newest first. Each word has to be in the title,
// URL, description or tags; a bookmark with a hidden tag only when that tag is one of the words, as in the Swift Library.
// The index is read again after a while (userIndex), and when typing starts. Not in Firefox for Android,
// which has no omnibox.
const OMNIBOX_RESULTS = 10;

async function omniboxBookmarks() {
  const cached = await userIndex();
  if (!cached.items) return null;
  cached.bookmarks ||= cached.items.filter(item => item.type == 'bookmark' && item.url).sort((a, b) => b.created - a.created);
  return cached.bookmarks;
}

function omniboxMatches(items, settings, input) {
  const words = input.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return items.filter(item => {
    const tags = Array.isArray(item.tags) ? item.tags : [];
    if (tags.some(tag => isHiddenTag(settings, tag) && !words.includes(tag.toLowerCase()))) return false;
    const haystack = [item.title, item.url, item.description, ...tags].join('\n').toLowerCase();
    return words.every(word => haystack.includes(word));
  }).slice(0, OMNIBOX_RESULTS);
}

// Chrome and Edge read the description as XML, Firefox as plain text
const omniboxText = text => browser.runtime.getURL('').startsWith('moz-extension:') ? text
  : text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function omniboxSuggest(input, suggest) {
  const [items, settings] = await Promise.all([omniboxBookmarks(), loadSettings()]);
  browser.omnibox.setDefaultSuggestion({description: browser.i18n.getMessage(items ? 'omniboxSearch' : 'omniboxNoIndex')});
  suggest(omniboxMatches(items || [], settings, input).map(item => ({
    content: item.url,
    description: omniboxText(item.title && item.title != item.url ? `${item.title} — ${item.url}` : item.url),
  })));
}

// a bookmark opens its page; Enter on the words themselves opens them as a search in the Swift Library
function omniboxOpen(input, disposition) {
  const url = /^https?:\/\//i.test(input.trim()) ? input.trim()
    : browser.runtime.getURL('options/library.html') + '#' + new URLSearchParams({q: input.trim()});
  if (disposition == 'currentTab') browser.tabs.update({url});
  else browser.tabs.create({url, active: disposition != 'newBackgroundTab'});
}

if (browser.omnibox) {
  browser.omnibox.onInputStarted?.addListener(() => { indexCache = null; });
  browser.omnibox.onInputChanged.addListener(omniboxSuggest);
  browser.omnibox.onInputEntered.addListener(omniboxOpen);
}


// ---- dead links, for the Swift Library (options/library-links.js) ----

const linkChecks = new Map(); // url -> Promise of {state, status}, while the background script runs
const linkCheckQueue = [];
const LINK_CHECKS_AT_ONCE = 4;
let linkChecksRunning = 0;

// The page of a link as a browser would get it, without your cookies: its status, where it ended after redirects, the
// headers that tell a bot protection, and the start of an HTML page up to its <title> (PAGE_START at most: enough
// for its title, without loading whole pages)
const PAGE_START = 32 * 1024;

async function fetchPage(url) {
  const response = await fetch(url, {
    credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(20000),
    headers: {Accept: 'text/html,application/xhtml+xml,*/*;q=0.8'},
  });
  let start = '';
  const reader = /html/i.test(response.headers.get('content-type') || '') ? response.body?.getReader() : null;
  if (reader) {
    const decoder = new TextDecoder();
    try {
      while (start.length < PAGE_START && !/<\/title>/i.test(start)) {
        const {done, value} = await reader.read();
        if (done) break;
        start += decoder.decode(value, {stream: true});
      }
    } catch (e) {
      // what came is enough
    }
    reader.cancel().catch(() => {});
  } else {
    response.body?.cancel().catch(() => {});
  }
  return {
    status: response.status, finalUrl: response.url || url, redirected: response.redirected,
    server: response.headers.get('server') || '', mitigated: response.headers.get('cf-mitigated') || '',
    retryAfter: response.headers.get('retry-after') || '',
    title: decodeEntities(start.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').replace(/\s+/g, ' ').trim(),
  };
}

// What a page answer says of its link (classifyLink):
// - blocked: a bot protection refused the add-on (Cloudflare and the like: 403, 429 or 503 with its header, server or
//   page; 999 from LinkedIn): the page may well work in a tab, so not dead
// - dead: 404 or 410 (why: status); or gone though it answers 200: led to the home page of a site (why: home), a page
//   that says it isn't found (why: notfound), or a parked domain, for sale (why: parked)
// - moved: redirected to another web address for good (to), not one only written otherwise (urlKey), nor a page to
//   sign in or accept cookies, which comes before the page itself
// - busy: 429 without a bot protection, Too Many Requests: the site asks to slow down, which says nothing of the page;
//   asked again after a while (checkLink), not an error
// - ok, with its status (400 and more but these: warn, in the Swift Library)
const BOT_PAGE = /just a moment|attention required|checking (your|if the site connection is secure)|verify(ing)? you are (a )?human|are you a robot|access denied|request unsuccessful|ddos[- ]guard|captcha|bot (check|verification)|one more step|please enable cookies/i;
const BOT_SERVER = /cloudflare|ddos-guard|akamai|incapsula|imperva|sucuri|datadome|perimeterx|stackpath/i;
const PARKED_PAGE = /\bdomain (name )?(is |may be )?for sale\b|\bbuy this domain\b|\bthis domain (name )?(has been registered|is parked|may be for sale|has expired)\b|\bparked (free|domain)\b|\bdomain parking\b|hugedomains|sedo domain parking|\bdan\.com\b|afternic/i;
const PARKING_HOSTS = /(^|\.)(sedoparking\.com|sedo\.com|parkingcrew\.net|bodis\.com|dan\.com|afternic\.com|hugedomains\.com|above\.com|parklogic\.com|domainmarket\.com|undeveloped\.com|uniregistry\.com|godaddysites\.com|dsparking\.com|parked\.com)$/i;
const NOT_FOUND_PAGE = /^\s*(error\s*)?404\b|\b404\s*[-–—:|]?\s*(page\s*)?not found\b|^\s*(page|file|document)?\s*not found\b|\bpage (was )?not found\s*([-–—:|]|$)|\b(this )?page (does not|doesn't) exist\b|pagina niet gevonden|seite (wurde )?nicht gefunden|page (non |introuvable)|página no encontrada|pagina non trovata|página não encontrada|nie znaleziono strony|страница не найдена|ページが見つかりません|页面不存在|找不到页面/i;
const SIGN_IN_OR_CONSENT = /(^|[/.])(log-?in|sign-?in|signin|auth|oauth|sso|account(s)?|consent|gdpr|cookie(s)?|privacy-?gateway|captcha|challenge|session)([/._?-]|$)/i;

function classifyLink(url, {status, finalUrl = url, redirected = false, server = '', mitigated = '', title = ''}) {
  if (status == 999 || [403, 429, 503].includes(status) && (mitigated || BOT_SERVER.test(server) || BOT_PAGE.test(title))) {
    return {state: 'blocked', status};
  }
  if (status == 429) return {state: 'busy', status};
  if (status == 404 || status == 410) return {state: 'dead', status, why: 'status'};
  if (status >= 400) return {state: 'ok', status};
  let from, to;
  try {
    from = new URL(url);
    to = new URL(finalUrl);
  } catch (e) {
    return {state: 'ok', status};
  }
  if (PARKING_HOSTS.test(to.hostname) || PARKED_PAGE.test(title)) return {state: 'dead', status, why: 'parked'};
  const root = u => /^\/(index\.\w+)?$/i.test(u.pathname) && !u.search;
  if (redirected && root(to) && !root(from)) return {state: 'dead', status, why: 'home'};
  if (NOT_FOUND_PAGE.test(title)) return {state: 'dead', status, why: 'notfound'};
  if (redirected && urlKey(finalUrl) != urlKey(url) && !SIGN_IN_OR_CONSENT.test(to.hostname + to.pathname)) {
    return {state: 'moved', status, to: finalUrl};
  }
  return {state: 'ok', status};
}

// state: as classifyLink says; 'unreachable' when the site doesn't answer at all (no such domain, refused, bad
// certificate), 'unknown' when it takes too long
async function linkState(url) {
  try {
    const page = await fetchPage(url);
    const result = classifyLink(url, page);
    return result.state == 'busy' ? {...result, retryAfter: page.retryAfter} : result;
  } catch (e) {
    return {state: e.name == 'TimeoutError' || e.name == 'AbortError' ? 'unknown' : 'unreachable', status: 0};
  }
}

// A site that answered 429 (busy) is asked nothing for as long as it says (Retry-After: seconds or a date), else
// BUSY_WAIT, at most BUSY_WAIT_MAX: meanwhile the checks of other sites go on, then its links are asked again, each at
// most BUSY_TRIES times; after that the answer is unknown, which isn't kept, so it is asked again the next time.
const BUSY_WAIT = 60 * 1000;
const BUSY_WAIT_MAX = 10 * 60 * 1000;
const BUSY_TRIES = 2;
const busyUntil = new Map();  // host -> time
let busyTimer = 0;

function busyFor(retryAfter) {
  const seconds = Number(retryAfter);
  const wait = Number.isFinite(seconds) && String(retryAfter).trim() ? seconds * 1000
    : Date.parse(retryAfter) - Date.now() || BUSY_WAIT;
  return Math.min(BUSY_WAIT_MAX, Math.max(5000, Number.isFinite(wait) ? wait : BUSY_WAIT));
}

const linkHost = url => {
  try {
    return new URL(url).host;
  } catch (e) {
    return '';
  }
};

function runLinkChecks() {
  while (linkChecksRunning < LINK_CHECKS_AT_ONCE && linkCheckQueue.length) {
    // the first whose site isn't waiting; none: again once the first site may be asked
    const now = Date.now();
    const at = linkCheckQueue.findIndex(task => !(busyUntil.get(task.host) > now));
    if (at < 0) {
      const next = Math.min(...linkCheckQueue.map(task => busyUntil.get(task.host) || now));
      clearTimeout(busyTimer);
      busyTimer = setTimeout(runLinkChecks, Math.max(1000, next - now));
      return;
    }
    const [task] = linkCheckQueue.splice(at, 1);
    linkChecksRunning++;
    task.run().finally(() => {
      linkChecksRunning--;
      runLinkChecks();
    });
  }
}

// What was found is kept in the database of the index (the store links of openIndexDb, options/index-item.js), as the
// background script doesn't run for long (a service worker in Chrome, an event page in Firefox) and its linkChecks are
// gone with it: so a page is asked again only once its answer is older than LINK_KEEP says, not each time the library
// or the Swift Library shows it. A page that works is asked again after a week; one that is gone (404, 410) after 3
// days, as it seldom comes back; any other error, or a site that doesn't answer, after a day, as that is often for a
// while. Too slow (unknown) isn't kept. What is too old goes once each time the background script starts. Without
// IndexedDB, only linkChecks, as before.
const DAY_MS = 24 * 60 * 60 * 1000;
// moved: as one that works; blocked: as one that doesn't answer, as the protection may let it through later. Kept with
// LINK_CHECK, the version of classifyLink: what was found before it knew moved, blocked and gone pages is asked again.
const LINK_KEEP = {ok: 7 * DAY_MS, moved: 7 * DAY_MS, dead: 3 * DAY_MS, warn: DAY_MS, unreachable: DAY_MS, blocked: DAY_MS};
const LINK_CHECK = 2;
let linksDb = null;  // Promise of the database, or of null

const keepFor = ({state, status}) => LINK_KEEP[state == 'ok' && status >= 400 ? 'warn' : state] || 0;
const fresh = entry => !!entry && entry.v == LINK_CHECK && Date.now() - entry.time <= keepFor(entry);

function openLinks() {
  linksDb ||= openIndexDb().then(db => {
    const store = db.transaction('links', 'readwrite').objectStore('links');
    store.openCursor().onsuccess = e => {
      const cursor = e.target.result;
      if (!cursor) return;
      if (!fresh(cursor.value)) cursor.delete();
      cursor.continue();
    };
    return db;
  }).catch(() => null);
  return linksDb;
}

// closed meanwhile (onversionchange) or broken: opened again the next time
async function keptLink(url) {
  try {
    const db = await openLinks();
    return db && await idbDone(db.transaction('links').objectStore('links').get(url));
  } catch (e) {
    linksDb = null;
    return null;
  }
}

async function keepLink(url, {state, status, why, to}) {
  try {
    const db = await openLinks();
    db?.transaction('links', 'readwrite').objectStore('links')
      .put({url, state, status, ...why ? {why} : {}, ...to ? {to} : {}, time: Date.now(), v: LINK_CHECK});
  } catch (e) {
    linksDb = null;
  }
}

async function checkLink({url}) {
  if (!/^https?:/i.test(url)) return {state: 'unknown', status: 0};
  const entry = await keptLink(url);
  if (fresh(entry)) return {state: entry.state, status: entry.status, why: entry.why, to: entry.to};
  if (!linkChecks.has(url)) {
    linkChecks.set(url, new Promise(resolve => {
      const task = {host: linkHost(url), tries: 0, run: () => linkState(url).then(result => {
        // busy (429): its site waits, and this link is asked again later (runLinkChecks)
        if (result.state == 'busy') {
          busyUntil.set(task.host, Date.now() + busyFor(result.retryAfter));
          if (++task.tries < BUSY_TRIES) {
            linkCheckQueue.push(task);
            return;
          }
          result = {state: 'unknown', status: 429, why: 'busy'};
        }
        if (result.state == 'unknown') linkChecks.delete(url);
        else keepLink(url, result);
        resolve(result);
      })};
      linkCheckQueue.push(task);
      runLinkChecks();
    }));
  }
  return linkChecks.get(url);
}

// your groups and outliners, for Add PDF and Add Image of the Swift Library (options/library-add.js), loaded first when
// they are not there yet or are older than for the form
async function sharingLists() {
  if (user && (!userTagsTime || Date.now() - userTagsTime > 15 * 60 * 1000)) await loadUserTags();
  else if (userTagsLoading) await userTagsLoading;
  return {groups: userGroups, outliners: userOutliners};
}

// ---- the log of errors (settings.js: logError), shown on the options page (options/log.js) ----

// The last LOG_MAX in storage.session: in memory only, gone when the browser restarts, as the log of Neat URL. One
// change at a time, as errors can come in a row.
const ERROR_LOG = 'errorLog';
const LOG_MAX = 300;
let logLock = Promise.resolve();

function addLogEntry(entry) {
  if (!browser.storage?.session) return;
  logLock = logLock.then(async () => {
    const {[ERROR_LOG]: entries = []} = await browser.storage.session.get(ERROR_LOG);
    await browser.storage.session.set({[ERROR_LOG]: [...entries, entry].slice(-LOG_MAX)});
  }).catch(() => {});
}

// what goes wrong in the background script without being caught
globalThis.addEventListener?.('error', e => logError('Background', e.error || e.message));
globalThis.addEventListener?.('unhandledrejection', e => logError('Background', e.reason));

const requests = {
  logError: ({entry}) => entry && addLogEntry({...entry, where: String(entry.where || '?')}),
  removeBrowserBookmarks,
  open: openBookmark, save: saveBookmark, delete: deleteBookmark, user: signedInUser, checkLink, openLibrary,
  openDiscover, openTools, openOptions, openGuide, title: ({url}) => pageTitle(url), pageInfo: ({url}) => pageInfo(url), trash: trashItems, keepFiles, sharing: sharingLists,
};

// The answer goes back with sendResponse: Chrome doesn't take a Promise as the answer. After a restart of the background
// script the user is not known yet, so the cookie is read first.
browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const request = requests[msg.type];
  if (!request) return false;
  (user ? Promise.resolve() : readCookie())
    .then(() => request(msg, sender.tab))
    .then(sendResponse, e => {
      logError(`Background: ${msg.type}`, e);
      sendResponse(undefined);
    });
  return true;
});


// ---- opening the form ----

// link: {url, title} for a link or the right-click menu; without it the button toggles the form
async function showForm(tab, link) {
  if (!canBookmark(tab.url)) return;
  await readCookie();
  if (!user) {
    browser.tabs.create({url: 'https://www.diigo.com/sign-in', index: tab.index + 1});
    return;
  }
  try {
    await browser.scripting.executeScript({target: {tabId: tab.id}, files: ['content/content.js']});
    await browser.tabs.sendMessage(tab.id, {type: 'toggle', link});
  } catch (e) {
    console.warn('Cannot show the bookmark form on this page', e);
  }
}

// What a page says of itself, read from its HTML (a service worker has no DOMParser), as content/content.js reads it
// from the page that is open: its <title>, its description, its keywords and the web address it calls its own
// (rel=canonical). For a link of the right-click menu, and a bookmark added in the Swift Library (form.js: askUrl).
const KEYWORDS_MAX = 40;

// the attributes of a tag such as <meta name="description" content="…">, by their names in lower case
function attributesOf(tag) {
  const attributes = {};
  for (const match of tag.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    attributes[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attributes;
}

// the keywords of JSON-LD: a text with commas or a list, also in its @graph
function jsonLdKeywords(json) {
  try {
    return [JSON.parse(json)].flat(2).flatMap(data => [data, ...data?.['@graph'] || []]).flatMap(data => {
      const words = data?.keywords;
      return Array.isArray(words) ? words.map(String) : typeof words == 'string' ? words.split(',') : [];
    });
  } catch (e) {
    return [];
  }
}

function pageInfoOf(html, url) {
  const title = decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').replace(/\s+/g, ' ').trim();
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map(match => attributesOf(match[0]));
  const nameOf = meta => (meta.property || meta.name || '').toLowerCase();
  const content = name => metas.find(meta => nameOf(meta) == name)?.content?.trim() || '';
  const description = content('og:description') || content('description') || content('twitter:description');
  const keywords = metas.flatMap(meta => {
    const name = nameOf(meta);
    if (name == 'keywords' || name == 'news_keywords') return (meta.content || '').split(',');
    return ['article:tag', 'video:tag', 'book:tag'].includes(name) ? [meta.content || ''] : [];
  });
  for (const match of html.matchAll(/<script\b[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    keywords.push(...jsonLdKeywords(match[1]));
  }
  const link = [...html.matchAll(/<link\b[^>]*>/gi)].map(match => attributesOf(match[0]))
    .find(link => (link.rel || '').toLowerCase().split(/\s+/).includes('canonical'));
  let canonical = '';
  try {
    canonical = link?.href ? new URL(link.href, url).href : '';
  } catch (e) {
  }
  // JSON-LD is read as it is: its keywords have no entities
  return {
    title, description,
    keywords: [...new Set(keywords.map(word => word.trim()).filter(Boolean))].slice(0, KEYWORDS_MAX),
    canonical,
  };
}

async function pageInfo(url) {
  try {
    const response = await fetch(url, {signal: timeLimit()});
    // the head is enough, and a page can be very long
    const html = response.ok ? (await response.text()).slice(0, 1000000) : '';
    return pageInfoOf(html, response.url || url);
  } catch (e) {
    return {title: '', description: '', keywords: [], canonical: ''};
  }
}

const pageTitle = async url => (await pageInfo(url)).title;

const ENTITIES = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' '};

function decodeEntities(text) {
  return text.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (entity, name) => {
    if (name[0] != '#') return ENTITIES[name.toLowerCase()] ?? entity;
    const code = name[1] == 'x' || name[1] == 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    try {
      return String.fromCodePoint(code);
    } catch (e) {
      return entity;
    }
  });
}

// The browser keeps the menu items, so they are made when the add-on is installed or updated, and again when the browser
// starts (like Neat URL), each time after removing the old ones.
function createMenus() {
  browser.contextMenus.removeAll().then(() => {
    browser.contextMenus.create({id: 'save-link', title: browser.i18n.getMessage('menuSaveLink'), contexts: ['link']});
    browser.contextMenus.create({id: 'save-page', title: browser.i18n.getMessage('menuSavePage'), contexts: ['page']});
    // the menu of the toolbar button; Chrome and Edge have an Options item there themselves
    browser.contextMenus.create({id: 'random', title: browser.i18n.getMessage('randomBookmark'), contexts: ['action']});
    // the pages of the add-on without Swift, as in their own menu (settings.js: menuName): this menu is the add-on's
    browser.contextMenus.create({id: 'library', title: menuName('libraryMenu'), contexts: ['action']});
    browser.contextMenus.create({id: 'discover', title: menuName('discoverMenu'), contexts: ['action']});
    browser.contextMenus.create({id: 'guide', title: menuName('guideMenu'), contexts: ['action']});
    if (browser.runtime.getBrowserInfo) {
      browser.contextMenus.create({id: 'options', title: browser.i18n.getMessage('menuOptions'), contexts: ['action']});
    }
    // the menu of a bookmark, in background/sync.js
    globalThis.createBookmarkMenus?.();
  });
}

// "Save page to Diigo" only where the page can be bookmarked, and not on diigo.com itself: there it's your library or a
// page of Diigo. "Save link to Diigo" stays, as a link on diigo.com mostly leads elsewhere.
function showPageMenu(url) {
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch (e) {
  }
  const visible = canBookmark(url) && !/(^|\.)diigo\.com$/.test(host);
  return browser.contextMenus?.update('save-page', {visible}).catch(() => {});
}

// Chrome and Edge don't say which page the menu opens on, so there the item follows the active tab
async function showPageMenuOfActiveTab() {
  const [tab] = await browser.tabs.query({active: true, lastFocusedWindow: true});
  if (tab) showPageMenu(tab.url);
}

browser.runtime.onInstalled.addListener(({reason}) => {
  forgetOldSettings();
  // to storage.sync first: what comes after reads and saves the settings there
  settingsToSync().catch(e => logError('Settings: to sync', e)).then(async () => {
    await addHiddenDefault().catch(() => {});
  });
  if (browser.contextMenus) createMenus();
  // installed: the guide of the add-on, what it does more than Diigo's own (options/guide.html); updated from before
  // it: once a bar in the Swift Library that it's there (guideNews, library-page.js: showGuideNews)
  if (reason == 'install') {
    browser.storage.local.set({guideNewsSeen: true}).catch(() => {});
    openGuide();
  }
  if (reason == 'update') guideNewsOnce().catch(() => {});
});

async function guideNewsOnce() {
  const {guideNewsSeen} = await browser.storage.local.get('guideNewsSeen');
  if (!guideNewsSeen) await browser.storage.local.set({guideNews: true});
}

// Firefox for Android has no right-click menu and no shortcuts, only the button
if (browser.contextMenus) {
  browser.runtime.onStartup.addListener(createMenus);

  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId == 'save-link') {
      const page = await pageInfo(info.linkUrl);
      showForm(tab, {...page, url: info.linkUrl, title: page.title || info.linkText});
    }
    if (info.menuItemId == 'save-page') showForm(tab, {url: tab.url, title: tab.title});
    if (info.menuItemId == 'random') await openRandomBookmark(tab);
    if (info.menuItemId == 'library') openLibrary({}, tab);
    if (info.menuItemId == 'discover') openDiscover({}, tab);
    if (info.menuItemId == 'guide') openGuide({}, tab);
    if (info.menuItemId == 'options') browser.runtime.openOptionsPage();
  });

  // Firefox says it each time the menu opens
  if (browser.contextMenus.onShown) {
    browser.contextMenus.onShown.addListener(async info => {
      if (!info.contexts.includes('page')) return;
      await showPageMenu(info.pageUrl);
      browser.contextMenus.refresh();
    });
  } else {
    browser.tabs.onActivated.addListener(showPageMenuOfActiveTab);
    browser.windows.onFocusChanged.addListener(showPageMenuOfActiveTab);
  }
}

// the shortcut, and the button as it is by default: the bookmark form, or on diigo.com the options, or on a page that
// can't be bookmarked the Swift Library (markTab); Save link to Diigo of the menu still works on diigo.com, as a link
// there can lead anywhere
const onShortcut = tab => onDiigo(tab.url) ? browser.runtime.openOptionsPage()
  : canBookmark(tab.url) ? showForm(tab) : openLibrary({}, tab);
// the button: so, or always the Swift Library (toolbarButton)
const onButton = tab => buttonOpens == 'library' ? openLibrary({}, tab) : onShortcut(tab);

browser.action.onClicked.addListener(onButton);

browser.commands?.onCommand.addListener(async command => {
  if (command != 'show-bookmark-form') return;
  const [tab] = await browser.tabs.query({active: true, currentWindow: true});
  onShortcut(tab);
});

// Just signed in on diigo.com (the cookie came while signed out, above), Diigo leads to your library there,
// /user/<name>: the Swift Library opens in that tab instead (signInToSwift), once, and only within a minute of it.
// Diigo's own stays where it was: My Library in the menu of the Swift Library, or Ctrl+click on diigo.com.
async function afterSignIn(tab, url) {
  if (!signedIn?.name || Date.now() - signedIn.time > 60000) return;
  // Diigo's own asked for (?swift=false: My Library in the menu of diigo.com, the Swift pages)
  if (new URL(url).searchParams.get('swift') == 'false') return;
  const match = /^https:\/\/www\.diigo\.com\/user\/([^/?#]+)\/?(?:[?#]|$)/.exec(url);
  if (!match || decodeURIComponent(match[1]).toLowerCase() != signedIn.name.toLowerCase()) return;
  signedIn = null;
  if ((await loadSettings()).signInToSwift) openLibrary({here: true}, tab);
}

// With myLibraryToSwift, your library on diigo.com (/user/<name>, yours) opens the Swift Library in that tab, however
// you get there: a link, a bookmark, the address typed, Diigo's own pages leading there. Not with ?swift=false
// (DIIGO_OWN, settings.js), the way to Diigo's own; nor the library of someone else.
// A tab once at ?swift=false stays Diigo's own while it is on diigo.com (diigoOwnTabs): going to My Library there
// after that is going to Diigo's own (diigo-site/header.js knows it too, sessionStorage).
const diigoOwnTabs = new Set();

async function libraryToSwift(tab, url) {
  if (!/^https:\/\/([\w-]+\.)*diigo\.com\//i.test(url)) return diigoOwnTabs.delete(tab.id);
  const match = /^https:\/\/www\.diigo\.com\/user\/([^/?#]+)\/?(?:[?#]|$)/.exec(url);
  if (new URL(url).searchParams.get('swift') == 'false') return diigoOwnTabs.add(tab.id);
  if (!match || diigoOwnTabs.has(tab.id)) return;
  if (!user) await readCookie();
  if (!user || decodeURIComponent(match[1]).toLowerCase() != user.toLowerCase()) return;
  if ((await loadSettings()).myLibraryToSwift) openLibrary({here: true}, tab);
}

browser.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.url) afterSignIn(tab, change.url).catch(() => {});
  if (change.url) libraryToSwift(tab, change.url).catch(() => {});
  if (change.status == 'complete') formForRandom(tab).catch(e => logError('Random bookmark: the form', e));
  if (change.status == 'loading') onTabLoading(tab);
  if (change.url && tab.active && browser.contextMenus && !browser.contextMenus.onShown) showPageMenu(tab.url);
});

browser.tabs.onRemoved.addListener(tabId => {
  forget(tabId);
  diigoOwnTabs.delete(tabId);
});


readCookie();
browser.tabs.query({}).then(tabs => tabs.forEach(markTab));

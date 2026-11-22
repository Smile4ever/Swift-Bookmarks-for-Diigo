// The settings of the options page. Used by options/options.js, form/form.js, the scripts of diigo-site/ and the
// background scripts.
// Loaded first in those pages, so it also gives Chrome and Edge, which only have chrome.*, the browser.* of Firefox.
globalThis.browser = globalThis.browser || globalThis.chrome;

// the tag of a screenshot of a page (background.js: pageScreenshot; options/index-item.js: screenshotsOf)
const SCREENSHOT_TAG = 'screenshot';

// the blocks of Start in the Swift Library (options/library-home.js), in their order by default
const HOME_BLOCKS = ['pinned', 'recent', 'changed', 'shared', 'unread', 'stale', 'todo', 'random', 'day', 'trash', 'cleanup'];

const DEFAULT_SETTINGS = {
  // not suggested in the form unless typed in full, and their bookmarks hidden in the library unless such a tag is
  // searched for in full; hidden from the start (and added once to what was saved before: background.js:
  // addHiddenDefault)
  hiddenTags: ['hidden'],
  // not set on the options page but found by the add-on: the tags only on bookmarks with a hidden tag, which would give
  // those away, so they are hidden as well (options/index-item.js: alsoHiddenOf), in lower case
  alsoHiddenTags: [],

  // Going to your library on diigo.com (/user/<name>) opens the Swift Library in its place: a link, a bookmark, the
  // address typed (background.js: libraryToSwift). Diigo's own with ?swift=false after its address (DIIGO_OWN), which
  // My Library in the menu at the top of diigo.com has (diigo-site/header.js: never taken over), as do the ways to it
  // of the Swift pages (My Library, Public Library, To diigo.com). On by default.
  myLibraryToSwift: true,
  // Tools there opens the Tools page of the add-on in the same way (options/tools.html: without Google Play and Import
  // kindle highlights, with this add-on). My Outliners stays Diigo's own: your outliners are in the Swift Library.
  // off by default, as My Library
  toolsToSwift: false,
  // signed in on diigo.com, the page Diigo leads to after it (your library, /user/<name>) is the Swift Library instead
  // (background.js: signedInAt)
  signInToSwift: true,
  // the status code of the page of each bookmark in the Swift Library (options/library-links.js)
  deadLinks: true,
  // with deadLinks: each link checked by itself as it shows in the list (the site sees a request from this browser);
  // off, only what was checked before shows, and a link is checked when you ask for it (a click on its ·, Check all
  // links, or looking for dead links in the side bar)
  autoCheckLinks: true,
  // off by default: Share to outliner hidden, in the bookmark form and when adding in the Swift Library
  hideShareToOutliner: false,
  // the four add buttons at the top of the side bar of the Swift Library, in place of + and its menu
  splitAdd: true,
  // in the list of the Swift Library no Private next to each private item, as most are; Public next to a public one
  // instead (options/library-list.js: itemElement)
  hidePrivateFlag: true,

  // what the toolbar button opens (background.js: onButton): form, the bookmark form (the Swift Library on a page that
  // can't be bookmarked, the options on diigo.com), or library, always the Swift Library; the shortcut stays the form
  toolbarButton: 'form',
  // the bookmark form (form/form.js): without text selected on the page, the description the page gives of itself
  // (og:description, description) as the description of a new bookmark
  pageDescription: true,
  // the bookmark form, saving the page you're on: also a screenshot of it, as an image in your library, with a link
  // to it in the description of the bookmark (background.js: pageScreenshot); the box of the form remembers it
  formScreenshot: false,
  // a new bookmark without tracking parameters (index-item.js: cleanUrl), at the web address the page says is its own
  // (rel=canonical) when that is on the same site (background.js: preferredUrl)
  cleanUrls: true,
  // what a new bookmark of a site gets in the form: [{site, tags, private, unread}], site as hostOf writes it (its
  // subdomains too), tags a list, private and unread true, false or null for as usual (form.js: applySiteRules)
  siteRules: [],

  // Bulk edit in the Swift Library (options/library-bulk.js: afterBulk): off once an action is done, and the filters away
  // when nothing is left to show
  bulkExitAfter: true,
  bulkClearFilters: true,
  // To do on Start (options/library-home.js: todoBlock): some of them at random, with Other, instead of the oldest
  todoRandom: false,
  // the screenshots of pages (images with the tag screenshot) out of the Swift Library, as with a hidden tag
  // (isHiddenTag): Show hidden or a search for screenshot shows them; they are at their bookmark (screenshotThumbs)
  hideScreenshots: true,
  // a bookmark with a screenshot of its page: that as a small picture before it in the list (options/library-list.js)
  screenshotThumbs: true,
  // Start of the Swift Library (options/library-home.js: homeLayout), as you made it with Customize Start: its blocks
  // in this order, shown: false leaves one out; and blocks of your own, {id: 'own-…', title, field, value, sort,
  // count, shown}: what a search (field and value, as the search box has them) finds, newest, oldest, last changed or
  // at random (sort), count of them
  homeLayout: HOME_BLOCKS.map(id => ({id, shown: true})),
  // Delete in the Swift Library without asking, but only after 30 seconds, with Undo (options/library-delete.js)
  deleteDelay: true,


  // bookmarks of the browser to Diigo, see background/sync.js
  syncFolders: [],       // ids of the folders to sync, with their subfolders
  syncAuto: false,       // new bookmarks in them right away, and all of them every 6 hours
  syncFolderTags: true,  // the names of the folders as tags
  syncPrivate: true,
};

// Where the settings are kept: with the account of the browser (storage.sync: Firefox Sync, the Google or Microsoft
// account), so another computer gets the same, and a copy in this browser (storage.local), which counts when the
// browser doesn't sync (signed out, Firefox for Android without Sync, or storage.sync failing). Kept in this browser
// only: what is about this browser itself (its bookmark folders, by ids of their own: background/sync.js) and what the
// add-on finds from the index of this browser (alsoHiddenTags).
const LOCAL_SETTINGS = ['alsoHiddenTags', 'syncFolders', 'syncAuto', 'syncFolderTags', 'syncPrivate'];
const SYNCED_SETTINGS = Object.keys(DEFAULT_SETTINGS).filter(key => !LOCAL_SETTINGS.includes(key));
// What you said in the pages, kept in the same way (loadKept, saveSettings): links that are not dead
// (library-links.js), groups of similar tags that are not the same (library-tags.js) and Not interested in Swift
// Discover. Only while one fits in storage.sync (8 kB): a long list stays in this browser only.
const SYNCED_LISTS = ['ignoredLinks', 'ignoredTagGroups', 'discoverDismissed'];
const syncedKey = key => SYNCED_SETTINGS.includes(key) || SYNCED_LISTS.includes(key);

const syncedStorage = () => browser.storage.sync?.get(SYNCED_SETTINGS).catch(() => ({})) ?? Promise.resolve({});

// The name of a page of the add-on in the menu at the top of its own pages: without Swift, which they all have, so the
// menu doesn't say Swift five times, and in the language of the browser (Library, Discover and Tools are names in
// English in their full names); in the menu of the toolbar button too, which is the add-on's. On diigo.com
// (diigo-site/header.js) the full name stays, as there it tells the add-on's items from Diigo's.
const MENU_NAMES = {libraryMenu: 'menuLibrary', discoverMenu: 'menuDiscover', toolsMenu: 'menuTools'};
const menuName = key => MENU_NAMES[key] ? browser.i18n.getMessage(MENU_NAMES[key])
  : browser.i18n.getMessage(key).replace(/^Swift\s+/, '');

// what is synced wins over the copy here: another computer may have changed it since
async function loadSettings() {
  const [local, synced] = await Promise.all([browser.storage.local.get(Object.keys(DEFAULT_SETTINGS)), syncedStorage()]);
  return {...DEFAULT_SETTINGS, ...local, ...synced};
}

// keys of SYNCED_LISTS as loadSettings reads the settings: synced, else as kept here
async function loadKept(keys) {
  const synced = browser.storage.sync?.get(keys).catch(() => ({})) ?? Promise.resolve({});
  const [local, fromSync] = await Promise.all([browser.storage.local.get(keys).catch(() => ({})), synced]);
  return {...local, ...fromSync};
}

// Settings (and SYNCED_LISTS) saved: all of them here, those of SYNCED_SETTINGS and SYNCED_LISTS also with the
// account, each on its own, as one that is too large for storage.sync (8 kB a setting: a long list of site rules)
// stays here only: taken out of storage.sync then, so an older one there doesn't win over it (loadSettings).
async function saveSettings(values) {
  await browser.storage.local.set(values);
  if (!browser.storage.sync) return;
  await Promise.all(Object.entries(values).filter(([key]) => syncedKey(key)).map(([key, value]) =>
    browser.storage.sync.set({[key]: value}).catch(() => browser.storage.sync.remove(key).catch(() => {}))));
}

// ?swift=false: your library on diigo.com as Diigo has it, also with myLibraryToSwift (background.js: libraryToSwift)
const DIIGO_OWN = '?swift=false';

// whether a change of storage (storage.onChanged) is one of settings: here or synced
const settingsArea = area => area == 'local' || area == 'sync';

// The menu at the top of the pages of the add-on (the Swift pages): all of them, with Swift Tools (tools.html)
const SWIFT_PAGES = ['fastLibrary', 'discover', 'options', 'tools', 'learnMore'];
const swiftNavItems = () => SWIFT_PAGES.map(id => ({id, shown: true}));

// whether a tag is in the hiddenTags of settings, or in alsoHiddenTags, or screenshot with hideScreenshots; tags are
// compared without case, like Diigo does
function isHiddenTag(settings, tag) {
  const name = tag.toLowerCase();
  return settings.hiddenTags.some(hidden => hidden.toLowerCase() == name) || !!settings.alsoHiddenTags?.includes(name) ||
    settings.hideScreenshots !== false && name == SCREENSHOT_TAG;
}

// ' machine learning ': the words of a text in lower case, between spaces, so a tag is found as whole words
const mentionWords = s => ' ' + s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).join(' ') + ' ';

// The user's tags (names) that are whole words in the title or the url: "Machine Learning" or machine_learning →
// machine-learning; only tags of 3 characters or more, 10 at most. The tags the bookmark form suggests (form/form.js),
// and those a bookmark of the browser gets when it goes to Diigo new (background/sync.js).
function tagsMentioned(title, url, names) {
  try {
    const u = new URL(url);
    // without www., .com and .html
    url = u.hostname.replace(/^www\./, '').replace(/\.[^.]+$/, '') + ' ' + decodeURIComponent(u.pathname).replace(/\.\w{1,5}$/, '');
  } catch (e) {
  }
  const text = mentionWords(title + ' ' + url);
  return names.filter(name => mentionWords(name).trim().length >= 3 && text.includes(mentionWords(name))).slice(0, 10);
}


// ---- how long a request may take ----

// A request to Diigo or a site that never ends would hold up what waits for it for good: a page busy with no end (the
// buttons of Bulk edit off), the queue of the sync. So each has a time limit: REQUEST_TIME, or longer for a file (an
// upload, a PDF); together with a signal of its own (Stop) when there is one. AbortSignal.any: Firefox 124, Chrome 116.
const REQUEST_TIME = 60 * 1000;
const FILE_TIME = 10 * 60 * 1000;

function timeLimit(signal, ms = REQUEST_TIME) {
  const limit = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, limit]) : limit;
}

// ---- the log of errors: the Log card of the options page (options/log.js) ----

// An error as text: its message, or what it is; details (a web address, what Diigo answered) too, short
const logText = value => {
  if (value instanceof Error) return value.message || String(value);
  if (typeof value == 'string') return value;
  try {
    return JSON.stringify(value);
  } catch (e) {
    return String(value);
  }
};

// What went wrong, where (the part of the add-on: 'Swift Library', 'Sync'…), in the console as before and in the log:
// the background script keeps it (background.js: addLogEntry), whichever part of the add-on it comes from. Never fails.
function logError(where, error, ...details) {
  try {
    console.error(`Swift Bookmarks for Diigo: ${where}`, error, ...details);
    const stack = error instanceof Error && error.stack ? error.stack.split('\n').slice(0, 6).join('\n') : '';
    const entry = {
      time: Date.now(), where, what: logText(error).slice(0, 500),
      details: [...details.map(logText), stack].filter(Boolean).join('\n').slice(0, 3000),
      // the page of the add-on, or the site, without what is after ? or #
      page: typeof location == 'object' ? (location.protocol.endsWith('extension:') ? location.pathname : location.host) : '',
    };
    if (typeof addLogEntry == 'function') addLogEntry(entry);
    else browser.runtime.sendMessage({type: 'logError', entry}).catch(() => {});
  } catch (e) {
    // the console has it
  }
}

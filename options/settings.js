// The settings of the options page. Used by options/options.js, form/form.js, the scripts of diigo-site/ and the
// background scripts.
// Loaded first in those pages, so it also gives Chrome and Edge, which only have chrome.*, the browser.* of Firefox.
globalThis.browser = globalThis.browser || globalThis.chrome;

const DEFAULT_SETTINGS = {
  // not suggested in the form unless typed in full, and their bookmarks hidden in the library unless such a tag is
  // searched for in full; hidden from the start (and added once to what was saved before: background.js:
  // addHiddenDefault)
  hiddenTags: ['hidden'],
  // not set on the options page but found by the add-on: the tags only on bookmarks with a hidden tag, which would give
  // those away, so they are hidden as well (options/index-item.js: alsoHiddenOf), in lower case
  alsoHiddenTags: [],

  // My Library in the menu at the top of diigo.com opens the Swift Library, in the same tab (diigo-site/header.js:
  // takeOverMyLibrary); Ctrl+click, Shift+click or a middle click still goes to Diigo's own, as does My Library in the
  // menu of the Swift Library
  myLibraryToSwift: true,
  // Tools there opens the Tools page of the add-on in the same way (options/tools.html: without Google Play and Import
  // kindle highlights, with this add-on). My Outliners stays Diigo's own: your outliners are in the Swift Library.
  toolsToSwift: true,
  // signed in on diigo.com, the page Diigo leads to after it (your library, /user/<name>) is the Swift Library instead
  // (background.js: signedInAt)
  signInToSwift: true,
  // the status code of the page of each bookmark in the Swift Library (options/library-links.js)
  deadLinks: true,
  // off by default: Share to outliner hidden, in the bookmark form and when adding in the Swift Library
  hideShareToOutliner: false,
  // the four add buttons at the top of the side bar of the Swift Library, in place of + and its menu
  splitAdd: true,
  // in the list of the Swift Library no Private next to each private item, as most are; Public next to a public one
  // instead (options/library-list.js: itemElement)
  hidePrivateFlag: true,

  // the bookmark form (form/form.js): without text selected on the page, the description the page gives of itself
  // (og:description, description) as the description of a new bookmark
  pageDescription: true,
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
  // Delete in the Swift Library without asking, but only after 30 seconds, with Undo (options/library-delete.js)
  deleteDelay: true,

  // the menu at the top of diigo.com, in this order (diigo-site/header.js): Diigo's own items, those of the add-on, and
  // links of your own ({id: 'link-…', label, url, shown}); shown: false hides one. Random bookmark is no longer one of
  // them: it is in the menu of the toolbar button and the side bar of the Swift Library; a saved one is dropped
  // (menuItemsOf)
  // My Library hidden: with myLibraryToSwift it opens the Swift Library too, which has an item of its own; My Groups
  // too, as groups are mostly old ones with little new in them (a menu saved before gets them hidden once:
  // background.js, hideMyLibrary and hideMyGroups)
  // Swift Options: the options page of the add-on (options.html), an item of the add-on as Swift Discover
  // My Outliners, Diigo's own page, hidden as My Library is: your outliners are in the Swift Library (Outliners in its
  // side bar); a menu saved before gets it hidden once (background.js, hideMyOutliners)
  // Go Premium, Diigo's own, hidden too: an advertisement of Diigo, also on /learn_more (a menu saved before gets it
  // hidden, as it didn't know it: menuItemsOf)
  menuItems: ['library', 'fastLibrary', 'outliners', 'groups', 'discover', 'options', 'tools', 'learnMore', 'premium']
    .map(id => ({id, shown: !['library', 'outliners', 'groups', 'premium'].includes(id)})),

  // bookmarks of the browser to Diigo, see background/sync.js
  syncFolders: [],       // ids of the folders to sync, with their subfolders
  syncAuto: false,       // new bookmarks in them right away, and all of them every 6 hours
  syncFolderTags: true,  // the names of the folders as tags
  syncPrivate: true,
};

async function loadSettings() {
  return {...DEFAULT_SETTINGS, ...await browser.storage.local.get(Object.keys(DEFAULT_SETTINGS))};
}

// the menuItems of settings, and at the end the items of the add-on that are newer than what was saved
function menuItemsOf(settings) {
  const known = id => DEFAULT_SETTINGS.menuItems.some(item => item.id == id);
  const items = settings.menuItems.filter(item => 'url' in item || known(item.id));
  return [...items, ...DEFAULT_SETTINGS.menuItems.filter(item => !items.some(saved => saved.id == item.id))];
}

// whether a tag is in the hiddenTags of settings, or in alsoHiddenTags; tags are compared without case, like Diigo does
function isHiddenTag(settings, tag) {
  const name = tag.toLowerCase();
  return settings.hiddenTags.some(hidden => hidden.toLowerCase() == name) || !!settings.alsoHiddenTags?.includes(name);
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

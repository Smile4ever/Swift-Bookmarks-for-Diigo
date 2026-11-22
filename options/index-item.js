// An item of the index of the Swift Library as it is made from what diigo.com gives, the tags hidden along with the
// hidden ones, and the file of an image or a PDF. Shared by options/library-index.js (the Swift Library) and
// background/background.js (refreshIndex, what is saved on diigo.com; the trash of Diigo's delete window), loaded
// before them.

// 2: the tags from t_name; 3: the text of notes; 4: the thumbnails of images; an index of before is built again
const INDEX_VERSION = 4;

// The database of the index (IndexedDB library-index), opened here for the Swift Library and the background script
// alike: all of them at the same version, as one at an older one can't open it once another has upgraded it.
// 2: the trash; 3: links, the status of the page of each web address (background.js: checkLink), {url, state, status,
// time}, kept apart from the items, as an update of the index or building it again would lose it there, and diigo.com
// shows links also without an index. 4: previews, the preview image of the page of each web address (background.js:
// pagePreview), {url, image, icon, time}, for the small picture of a bookmark in the Swift Library.
const INDEX_DB_VERSION = 4;

function openIndexDb() {
  const request = indexedDB.open('library-index', INDEX_DB_VERSION);
  request.onupgradeneeded = () => {
    const stores = request.result.objectStoreNames;
    if (!stores.contains('items')) request.result.createObjectStore('items', {keyPath: 'id'});
    if (!stores.contains('meta')) request.result.createObjectStore('meta');
    if (!stores.contains('trash')) request.result.createObjectStore('trash', {keyPath: 'id'});
    if (!stores.contains('links')) request.result.createObjectStore('links', {keyPath: 'url'});
    if (!stores.contains('previews')) request.result.createObjectStore('previews', {keyPath: 'url'});
  };
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      // another page or the background script upgrading it later: let it
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
  });
}

const yes = value => value === true || value == 1 || value === 'true';
// whatever Diigo or the index has: a text, a number of seconds
const text = value => typeof value == 'string' ? value : value == null ? '' : String(value);
const seconds = value => Number.isFinite(Number(value)) ? Number(value) : 0;

// An item as diigo.com has it (load_user_items, /item/save/bookmark): the tags in t_name, one string with commas
// (sometimes one before the first), as the library on diigo.com reads them; private as 0 or 1, or mode 2. Whatever is
// odd in it gives an empty field, not an error.
function indexItem(item) {
  item = item || {};
  return {
    id: text(item.link_id),
    url: text(item.url),
    title: text(item.title),
    description: text(item.description),
    tags: text(item.t_name ?? item.tags).split(',').map(tag => tag.trim()).filter(Boolean),
    type: text(item.type_name),
    private: item.private != null ? yes(item.private) : item.mode == 2,
    unread: item.readed == 0,
    // highlights or sticky notes; an index built before this has none
    annotated: Array.isArray(item.annotations) ? item.annotations.length > 0 : !!item.annotated,
    created: seconds(item.created_at),
    updated: seconds(item.updated_at),
    // a note: its text (HTML when rich), to put it back from the trash (options/library-index.js: restoreNote)
    ...text(item.type_name) == 'note' ? {content: text(item.note_content), rich: yes(item.is_rich_note)} : {},
    // an image (or another item Diigo has one of): its thumbnail, as Diigo's library shows it (since version 4)
    ...text(item.thumbnail_url) ? {thumb: text(item.thumbnail_url)} : {},
  };
}

// The tags only on bookmarks with a hidden tag: they would give those bookmarks away, so they are hidden as well
// (settings.js: alsoHiddenTags). In lower case, sorted; none without hidden tags.
function alsoHiddenOf(items, hiddenTags) {
  const hidden = new Set(hiddenTags.map(tag => tag.toLowerCase()));
  const elsewhere = new Set(), along = new Set();
  if (!hidden.size) return [];
  for (const item of items) {
    const tags = item.tags.map(tag => tag.toLowerCase());
    const withHidden = tags.some(tag => hidden.has(tag));
    tags.forEach(tag => (withHidden ? along : elsewhere).add(tag));
  }
  return [...along].filter(tag => !elsewhere.has(tag) && !hidden.has(tag)).sort();
}

// The same web address (Duplicates, library-trash.js; in your library already, discover.js; the bookmark form,
// background.js: similarBookmarks): http or https, with or without www., a slash at the end and tracking parameters
// (utm_…, fbclid and the like) left out, the other parameters in order. Diigo itself keeps one bookmark per web address
// as written, so these are the ones it lets through. #… counts: another one is often another page (#/inbox, a
// chapter), so not a duplicate; only an empty # is left out.
const TRACKING = /^(utm_\w+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|_hsenc|_hsmi|igshid|yclid|twclid|ttclid|li_fat_id|_ga|_gl|oly_anon_id|oly_enc_id|vero_id|wickedid|mkt_tok|ref_src|spm)$/i;

function urlKey(url) {
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) return url;
    const params = [...parsed.searchParams].filter(([name]) => !TRACKING.test(name))
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    const query = params.length ? '?' + new URLSearchParams(params) : '';
    return parsed.hostname.replace(/^www\./, '') + parsed.pathname.replace(/\/+$/, '') + query + parsed.hash;
  } catch (e) {
    return url;
  }
}

// A web address as the bookmark form saves it with cleanUrls (settings.js): without tracking parameters and an empty
// #, the rest as it is: the other parameters in their order and as they are written, as some sites need that
function cleanUrl(url) {
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) return url;
    const nameOf = part => {
      try {
        return decodeURIComponent(part.split('=')[0].replace(/\+/g, ' '));
      } catch (e) {
        return part;
      }
    };
    const parts = parsed.search.slice(1).split('&').filter(Boolean);
    const kept = parts.filter(part => !TRACKING.test(nameOf(part)));
    if (kept.length == parts.length && !url.endsWith('#')) return url;
    parsed.search = kept.length ? '?' + kept.join('&') : '';
    return parsed.href.replace(/#$/, '');
  } catch (e) {
    return url;
  }
}

// The items with a file of their own on Diigo, which the trash keeps (itemFile)
const WITH_FILE = ['image', 'pdf'];

// Whether a file of bytes still fits in what the browser lets the add-on keep (navigator.storage), with a fifth of it
// to spare for the index: a PDF can be 64 MB, and once IndexedDB is full nothing is saved in it any more, the index
// neither. Without the room, the item goes to the trash all the same, without its file (it can't be put back then, as one
// deleted before the trash kept files). When the browser doesn't say, it is kept.
const STORAGE_SPARE = 0.2;

async function roomFor(bytes) {
  const estimate = await globalThis.navigator?.storage?.estimate?.().catch(() => null);
  if (!estimate?.quota) return true;
  return (estimate.usage || 0) + bytes <= estimate.quota * (1 - STORAGE_SPARE);
}

// The file of an image or a PDF, for the trash before it is deleted, as the trash can't get it back from Diigo after:
// Diigo's link to it (batch_share_links, as its Share window asks it: {<link_id>: {item_url, file_url}}), then the
// file. {file, name}, or null when Diigo doesn't give it, or when it doesn't fit (roomFor).
// the web address of the file of an image or a PDF on Diigo (batch_share_links: file_url), or '' when Diigo gives none;
// also for showing an image in the Swift Library (library-edit.js: viewImage)
async function itemFileUrl(linkId, signal) {
  const params = new URLSearchParams({links: linkId});
  const response = await fetch(`https://www.diigo.com/interact_api/batch_share_links?${params}`, {
    credentials: 'include', headers: {'X-Requested-With': 'XMLHttpRequest'}, signal: timeLimit(signal),
  });
  return JSON.parse(await response.text())?.[linkId]?.file_url || '';
}

async function itemFile(linkId, signal) {
  try {
    const url = await itemFileUrl(linkId, signal);
    if (!url) return null;
    const file = await fetch(url, {credentials: 'include', signal: timeLimit(signal, FILE_TIME)})
      .then(answer => answer.ok ? answer.blob() : null);
    if (!file?.size || !await roomFor(file.size)) return null;
    const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || '') || 'file';
    return {file, name};
  } catch (e) {
    logError('Trash: the file of an item', e, linkId);
    return null;
  }
}

// ---- screenshots of a page (background.js: pageScreenshot) ----

// A screenshot is an image of your library with the tag screenshot and the title and web address of its page in its
// description; so the bookmark of that page knows its screenshots, also one in its description by a link (as before
// the description had the web address). Its tags are those of the bookmark, and screenshot (screenshotTags): hidden
// with it, found with it; kept so when the add-on changes the tags of the bookmark (background.js: syncScreenshots,
// options/library-index.js: editItems). SCREENSHOT_TAG: in settings.js.
function screenshotsOf(bookmark, items) {
  if (!bookmark?.url || bookmark.type == 'image') return [];
  const linked = screenshotLinks(bookmark);
  return items.filter(item => item?.type == 'image' && item.id != bookmark.id &&
    (item.tags || []).some(tag => tag.toLowerCase() == SCREENSHOT_TAG) &&
    (linked.ids.has(item.id) || linked.urls.has(item.url) ||
      String(item.description || '').split('\n').some(line => line.trim() == bookmark.url)));
}

// what the description of a bookmark links to: web addresses (an image's own on Diigo, as its upload answered it:
// background.js, pageScreenshot), and link_ids in those of the form diigo.com/item/image/<link_id>
function screenshotLinks(bookmark) {
  const urls = new Set(String(bookmark.description || '').match(/https?:\/\/[^\s<>"']+/g)?.map(url => url.replace(/[.,;)]+$/, '')) || []);
  const ids = new Set([...urls].map(url => url.match(/diigo\.com\/item\/image\/([\w-]+)/)?.[1]).filter(Boolean));
  return {urls, ids};
}

const screenshotTags = tags => [...new Set([...tags.filter(tag => tag.toLowerCase() != SCREENSHOT_TAG), SCREENSHOT_TAG])];

// the same tags, whatever their order and case
const sameTagSet = (a, b) => {
  const set = tags => [...new Set(tags.map(tag => tag.toLowerCase()))].sort().join('\n');
  return set(a) == set(b);
};

// tags as Diigo takes them in a form: separated by spaces, "between quotes" with a space in one
const quotedTags = tags => tags.map(tag => /\s/.test(tag) ? `"${tag}"` : tag).join(' ');

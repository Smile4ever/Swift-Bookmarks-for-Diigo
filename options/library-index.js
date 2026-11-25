// The index: a copy of your Diigo library in this browser (IndexedDB), for library.html. Loaded by it, after settings.js
// and index-item.js (indexItem, INDEX_VERSION). Built once by going through the library page by page, as diigo.com loads
// it itself (load_user_items, 96 at a time), and updated with only the pages changed since; what is saved on diigo.com
// itself, by background/background.js (refreshIndex). Bookmarks are deleted as diigo.com deletes them (delete_b,
// link_id: their ids with commas), 50 at a time, and taken out of the index too. Diigo's own search isn't used: it
// doesn't find them all. See docs/diigo-com.md.

const message = (key, substitutions) => browser.i18n.getMessage(key, substitutions);

const LIBRARY_URL = 'https://www.diigo.com/interact_api/load_user_items';
const DELETE_URL = 'https://www.diigo.com/ditem_mana2/delete_b';
const SAVE_URL = 'https://www.diigo.com/item/save/bookmark';
const NOTE_URL = 'https://www.diigo.com/item/save/note';
const IMAGE_URL = 'https://www.diigo.com/item/save/image';
const PDF_URL = 'https://www.diigo.com/item/save/pdf';
// a new PDF: its file, as the app uploads one (newPDF in its code)
const UPLOAD_URL = 'https://www.diigo.com/item/save';
const PAGE_SIZE = 96;
const PAGES_AT_ONCE = 3;
const DELETE_AT_ONCE = 50;

// {id, url, title, description, tags, type, private, unread, annotated, created, updated} per item
let index = new Map();  // id -> item
let meta = null;        // {user, built, updated, total, newest, version}: newest is the latest updated of an item

// the trash: a copy of each item deleted with the add-on (deleteItems), with deletedAt, as it is gone from Diigo at
// once; library.html can make a bookmark of it again. Kept TRASH_DAYS.
let trash = new Map();  // id -> item and deletedAt (milliseconds)
const TRASH_DAYS = 30;

// one more with each change of the index (saveIndex, openIndex), for what is worked out from all of it (duplicates)
let indexVersion = 0;

let indexProblem = null; // why the index can't be kept in this browser (IndexedDB): it's then only in this page

// an item as the index keeps it, made whole again when something in it is odd; null without an id
function repairItem(item) {
  if (!item || typeof item != 'object' || !text(item.id)) return null;
  return {
    ...item.deletedAt ? {deletedAt: seconds(item.deletedAt)} : {},
    id: text(item.id),
    url: text(item.url),
    title: text(item.title),
    description: text(item.description),
    tags: Array.isArray(item.tags) ? item.tags.map(text).filter(Boolean) : text(item.tags).split(',').filter(Boolean),
    type: text(item.type),
    private: !!item.private,
    unread: !!item.unread,
    annotated: !!item.annotated,
    created: seconds(item.created),
    updated: seconds(item.updated),
    ...'content' in item ? {content: text(item.content), rich: !!item.rich} : {},
    ...item.thumb ? {thumb: text(item.thumb)} : {},
    // in the trash: the file of an image or a PDF (itemFile)
    ...item.file instanceof Blob ? {file: item.file, fileName: text(item.fileName)} : {},
    // in the trash: not deleted with the add-on, but no longer in what Diigo gave when the index was built (buildIndex)
    ...item.goneFromDiigo ? {goneFromDiigo: true} : {},
  };
}


// ---- IndexedDB ----

const done = request => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
const finished = transaction => new Promise((resolve, reject) => {
  transaction.oncomplete = resolve;
  transaction.onerror = transaction.onabort = () => reject(transaction.error);
});

// Never fails: without IndexedDB (a private window, blocked, broken) the index is empty and lives in this page only,
// with indexProblem saying why; items it can't read are left out, odd ones made whole (repairItem).
let db = null;
async function openIndex() {
  try {
    // index-item.js: the same for the background script
    db = await openIndexDb();
    const transaction = db.transaction(['items', 'meta', 'trash']);
    const [items, saved, trashed] = await Promise.all([
      done(transaction.objectStore('items').getAll()),
      done(transaction.objectStore('meta').get('meta')),
      done(transaction.objectStore('trash').getAll()),
    ]);
    const byId = list => new Map((Array.isArray(list) ? list : []).map(repairItem).filter(Boolean)
      .map(item => [item.id, item]));
    index = byId(items);
    indexVersion++;
    meta = saved && typeof saved == 'object' ? saved : null;
    trash = byId(trashed);
    // what has been in the trash too long goes
    const old = [...trash.values()].filter(item => Date.now() - item.deletedAt > TRASH_DAYS * 24 * 60 * 60 * 1000);
    if (old.length) {
      old.forEach(item => trash.delete(item.id));
      await saveIndex({trashRemove: old.map(item => item.id)});
    }
  } catch (e) {
    logError('Index: open', e);
    indexProblem = e;
    db = null;
    index = new Map();
    meta = null;
    trash = new Map();
  }
}

// put: items to add or replace; remove: ids; all: the index is only these items from now on; trashPut and trashRemove
// the same for the trash. Never fails either: when it can't be saved, the index of this page stays as it is, and the
// answer is false.
async function saveIndex({put = [], remove = [], all = false, trashPut = [], trashRemove = []}) {
  indexVersion++;
  if (!db) return false;
  try {
    const transaction = db.transaction(['items', 'meta', 'trash'], 'readwrite');
    const items = transaction.objectStore('items');
    if (all) items.clear();
    put.forEach(item => items.put(item));
    remove.forEach(id => items.delete(id));
    const trashed = transaction.objectStore('trash');
    trashPut.forEach(item => trashed.put(item));
    trashRemove.forEach(id => trashed.delete(id));
    if (meta) transaction.objectStore('meta').put(meta, 'meta');
    await finished(transaction);
    return true;
  } catch (e) {
    logError('Index: save', e);
    indexProblem = e;
    return false;
  }
}

function newestOf(items) {
  return items.reduce((newest, item) => Math.max(newest, item.updated), 0);
}


// ---- the library from Diigo ----

// sort: created (oldest first: what's saved while it runs doesn't shift the pages) or updated (last changed first);
// tried again twice when Diigo doesn't answer
async function libraryPage(pageNum, sort, signal) {
  const params = new URLSearchParams({page_num: pageNum, sort, count: PAGE_SIZE});
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(`${LIBRARY_URL}?${params}`, {credentials: 'include', signal: timeLimit(signal)});
      const answer = await response.json();
      if (Array.isArray(answer.items)) return answer;
      throw new Error('no items');
    } catch (e) {
      if (signal.aborted || attempt == 2) throw e;
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
}

const pageFailed = (pageNum, signal) => e => {
  if (signal.aborted) throw e;
  throw new Error(message(pageNum ? 'cleanupPageFailed' : 'cleanupSignedOut', String(pageNum + 1)));
};

// The whole library, a few pages at a time, as the index of user; progress(pages done, pages, items in the library).
// One page that fails stops the others, and the index stays as it was. So does an answer of Diigo without any items
// while the index of user has some: Diigo that doesn't load (signed out, busy, broken) rather than a library emptied,
// so a library of thousands isn't thrown away for it; to empty an index, Diigo has to give at least one item. And far
// fewer items than the index has (less than SHRINK_LIMIT of it, from SHRINK_MIN on): Diigo that gave only a part, more
// likely than half of a library deleted elsewhere; only when allowShrink(count, before) says yes (a question to you,
// when you asked for it yourself), else the index stays.
// What the index of user had and Diigo no longer gives (deleted in Diigo's app or another browser, or lost by Diigo)
// goes to the trash (goneFromDiigo), for TRASH_DAYS, so it can be put back: the index may have been the only copy. The
// answer: how many went there.
const SHRINK_LIMIT = .5;
const SHRINK_MIN = 20;

async function buildIndex(user, signal, progress, {allowShrink = () => false} = {}) {
  const pagesSignal = new AbortController();
  signal.addEventListener('abort', () => pagesSignal.abort());
  // a usable index of this user to protect (not someone else's, not an empty one): build aside and swap at the end, so
  // the old one stays if Diigo gives too few or the build fails. Without one (the first build), there is nothing to
  // protect, so show the items straight away, into the live index, as they load (progress's `live`).
  const hadIndex = meta?.user == user && index.size > 0;
  const before = hadIndex ? index.size : 0;
  const first = await libraryPage(0, 'created', signal).catch(pageFailed(0, signal));
  const pages = Math.max(1, Math.ceil((first.total || 0) / PAGE_SIZE));
  const byId = new Map();
  const live = !hadIndex;
  if (live) {
    index = byId;
    meta = {user, built: Date.now(), updated: Date.now(), total: first.total || 0, newest: 0, version: INDEX_VERSION};
  }
  let pagesDone = 0;
  const take = page => {
    page.items.map(indexItem).filter(item => item.id).forEach(item => byId.set(item.id, item));
    if (live) meta.total = first.total || byId.size;
    progress(++pagesDone, pages, first.total || 0, live);
  };
  take(first);
  let next = 1;
  const worker = async () => {
    while (next < pages) {
      const pageNum = next++;
      take(await libraryPage(pageNum, 'created', pagesSignal.signal).catch(pageFailed(pageNum, pagesSignal.signal)));
    }
  };
  await Promise.all([...Array(PAGES_AT_ONCE)].map(() => worker().catch(e => {
    pagesSignal.abort();
    throw e;
  })));
  const items = [...byId.values()];
  if (!items.length && before) throw new Error(message('indexKeptEmpty', String(before)));
  if (before >= SHRINK_MIN && items.length < before * SHRINK_LIMIT && !await allowShrink(items.length, before)) {
    throw new Error(message('indexKeptShrunk', [String(items.length), String(before)]));
  }
  const gone = before ? [...index.values()].filter(item => !byId.has(item.id) && !trash.has(item.id))
    .map(item => ({...item, deletedAt: Date.now(), goneFromDiigo: true})) : [];
  meta = {
    user, built: Date.now(), updated: Date.now(), total: first.total || items.length, newest: newestOf(items),
    version: INDEX_VERSION,
  };
  index = byId;
  gone.forEach(item => trash.set(item.id, item));
  await saveIndex({put: items, all: true, trashPut: gone});
  return gone.length;
}

// Only what changed since: the library by last change, page by page, until a page reaches what the index has already
// (changed before its newest); progress(page). Bookmarks deleted elsewhere (on diigo.com) can't be seen this way: the
// answer is the number of items Diigo has, to compare with the index.
async function updateIndex(signal, progress) {
  const changed = [];
  let total = 0;
  for (let pageNum = 0; ; pageNum++) {
    progress(pageNum + 1);
    const page = await libraryPage(pageNum, 'updated', signal).catch(pageFailed(pageNum, signal));
    total = page.total || total;
    const items = page.items.map(indexItem).filter(item => item.id);
    changed.push(...items.filter(item => item.updated >= meta.newest));
    if (items.length < PAGE_SIZE || items.some(item => item.updated < meta.newest)) break;
  }
  changed.forEach(item => index.set(item.id, item));
  meta = {...meta, updated: Date.now(), total, newest: Math.max(meta.newest, newestOf(changed))};
  await saveIndex({put: changed});
  return total;
}

// an index of user, of this version: else it's built again
const indexReady = user => !!meta && meta.user == user && meta.version == INDEX_VERSION;

// the line about the index of user: none yet, of someone else, or how many items and since when
function indexStatusText(user) {
  if (!user) return message('cleanupSignedOut');
  if (!meta) return message('indexNone');
  if (meta.user != user) return message('indexOtherUser', meta.user);
  const when = new Date(meta.updated)
    .toLocaleString(browser.i18n.getUILanguage(), {dateStyle: 'medium', timeStyle: 'short'});
  return message('indexStatus', [String(index.size), when]);
}


// ---- another URL ----

// As Diigo's own edit window saves a bookmark (EditItem in its main.<hash>.js): its link_id and url, the new_url, and
// the rest as it should be; the toolbar API, which the bookmark form uses, can't change the URL of a bookmark. tags: as
// typed in Diigo, separated by spaces, "between quotes" with a space in one. The answer is the bookmark as Diigo has it
// now, also in the index; it can have another link_id. null when Diigo didn't save it.
async function saveWithNewUrl(item, {url, title, description, tags, private: isPrivate, unread}) {
  const body = new URLSearchParams({
    link_id: item.id, url: item.url, new_url: url, title, description, tags, private: isPrivate, unread,
  });
  try {
    const response = await fetch(SAVE_URL, {
      method: 'POST', credentials: 'include', headers: {'X-Requested-With': 'XMLHttpRequest'}, body, signal: timeLimit(),
    });
    const saved = JSON.parse(await response.text())?.items?.[0];
    if (!response.ok || !saved?.link_id) return null;
    const fresh = indexItem(saved);
    index.delete(item.id);
    index.set(fresh.id, fresh);
    await saveIndex({put: [fresh], remove: fresh.id == item.id ? [] : [item.id]});
    // its screenshots, found by the web address it had: its tags, and its new web address in their description
    await syncScreenshotsHere(item, fresh).catch(e => logError('Screenshot: tags', e));
    return fresh;
  } catch (e) {
    return null;
  }
}

// The screenshots of a bookmark changed here (index-item.js: screenshotsOf, by before: its web address and
// description as they were) with its tags as they are now, and screenshot, and its web address in their description
// when that changed; saved as Diigo's edit window saves an image (singleSave), in the index too
async function syncScreenshotsHere(before, after) {
  const tags = screenshotTags(after.tags);
  for (const shot of screenshotsOf(before, [...index.values()])) {
    const description = before.url == after.url ? shot.description
      : String(shot.description || '').split('\n').map(line => line.trim() == before.url ? after.url : line).join('\n');
    if (sameTagSet(shot.tags, tags) && description == shot.description) continue;
    const changed = {...shot, description};
    const edit = singleSave(changed, tags);
    if (!await postSave(edit.url, new URLSearchParams(edit.params)).catch(() => null)) continue;
    Object.assign(shot, {description, tags});
    await saveIndex({put: [shot]});
  }
}


// A note saved as Diigo's app saves one (newNote, from its note editor: doSaveNoteToServer): title, content,
// note_type (rich, or nothing for plain text), mode 2 (notes are private), tags with commas as its note editor sends
// them ("one","two"), and link_id: its own, or nothing for a new one. The answer is the note as Diigo has it now, also
// in the index in the place of the one it was (old: its id; it can get another link_id); null when Diigo didn't save it
// (diigoAnswer says why).
async function postNote({title, content, rich, tags}, old = '') {
  const body = new URLSearchParams({
    title, content, note_type: rich ? 'rich' : '', mode: 2, tags: tags.map(tag => `"${tag}"`).join(','), link_id: old,
  });
  try {
    const response = await fetch(NOTE_URL, {
      method: 'POST', credentials: 'include', headers: {'X-Requested-With': 'XMLHttpRequest'}, body, signal: timeLimit(),
    });
    const answer = await response.text();
    let saved = null;
    try {
      saved = JSON.parse(answer)?.items?.[0];
    } catch (e) {
    }
    if (!response.ok || !saved?.link_id) {
      diigoAnswer = `${response.status} ${/<html/i.test(answer) ? '(a web page)' : answer.trim().slice(0, 200)}`;
      logError('Swift Library: note', `Diigo did not save the note (${response.status})`, answer);
      return null;
    }
    const fresh = indexItem(saved);
    if (old && old != fresh.id) index.delete(old);
    index.set(fresh.id, fresh);
    await saveIndex({put: [fresh], remove: old && old != fresh.id ? [old] : []});
    return fresh;
  } catch (e) {
    diigoAnswer = e?.message || String(e);
    return null;
  }
}

// a note from the trash made again, as a new note
const restoreNote = item => postNote(item);

// a note of the index with another title, text or tags
const saveNote = (item, changes) => postNote({...item, ...changes}, item.id);


// What Diigo takes, as its Add Image and Add PDF windows check it (AddImage, AddPDF in its main.<hash>.js)
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/jpg'];
const PDF_LIMIT = 64 * 1024 * 1024;

// The answer of Diigo to a save: the item it saved, or null (diigoAnswer says why)
function savedItem(url, status, answer) {
  let saved = null;
  try {
    saved = JSON.parse(answer)?.items?.[0];
  } catch (e) {
  }
  if (status == 200 && saved?.link_id) return saved;
  diigoAnswer = `${status} ${/<html/i.test(answer) ? '(a web page)' : answer.trim().slice(0, 200)}`;
  logError('Swift Library: save', `Diigo did not save it (${status})`, url, answer);
  return null;
}

async function postSave(url, body) {
  const response = await fetch(url, {
    method: 'POST', credentials: 'include', headers: {'X-Requested-With': 'XMLHttpRequest'}, body, signal: timeLimit(),
  });
  return savedItem(url, response.status, await response.text());
}

// code -2: the upload limit of your plan, in what Diigo answered (diigoAnswer)
const uploadLimit = () => /"code"\s*:\s*-2\b/.test(diigoAnswer);

// An image or a PDF uploaded as Diigo's app uploads one: an image to /item/save/image (newImage in its code: qqfile,
// qqfilename, private, tags, lists, groups), a PDF to /item/save with dtype pdf, description and unread too (newPDF).
// Always private, as the app sends it (private=false made Diigo answer 500 for an image): what is to be public is
// saved so after (addFile, restoreFile). An image's qqfilename has _1 after its name, as the app sends it.
// With XMLHttpRequest, as the app does, for progress(fraction) while it goes: fetch can't tell. The answer is the item as
// Diigo has it, not yet in the index; null when Diigo didn't take it (diigoAnswer says why; uploadLimit).
function uploadFile(file, {type, name, tags, unread = false, description = '', outliner = '', group = ''}, progress) {
  const pdf = type == 'pdf';
  const url = pdf ? UPLOAD_URL : IMAGE_URL;
  const form = new FormData();
  form.append('qqfile', file, name);
  form.append('qqfilename', pdf ? name : name + '_1');
  form.append('private', true);
  form.append('tags', tagsText(tags));
  if (pdf) {
    form.append('dtype', 'pdf');
    form.append('description', description);
    form.append('unread', unread);
  }
  // as Diigo's Add PDF and Add Image send them: an outliner by its id, a group by its name
  form.append('lists', outliner);
  form.append('groups', group);
  return new Promise(resolve => {
    const request = new XMLHttpRequest();
    request.open('POST', url);
    request.withCredentials = true;
    request.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    request.upload.onprogress = e => e.lengthComputable && progress?.(e.loaded / e.total);
    request.onload = () => resolve(savedItem(url, request.status, request.responseText));
    request.onerror = () => {
      diigoAnswer = message('errorNoConnection');
      resolve(null);
    };
    // a file can be large: longer than another request, but not for ever (settings.js: FILE_TIME)
    request.timeout = FILE_TIME;
    request.ontimeout = request.onerror;
    request.send(form);
  });
}

// New images or PDFs, as Diigo's Add Image and Add PDF windows add them: with the tags, shared to an outliner or a
// group, a PDF also with a description and read later or not. Private or not: Diigo's own windows always make them
// private; when one is not to be, and Diigo made it private all the same, it is saved as public after, as its edit
// window does (singleSave). The answer is the new item, also in the index; null when Diigo didn't take it (diigoAnswer, uploadLimit).
async function addFile(file, {type, tags, unread, description, outliner, group, private: isPrivate = true}, progress) {
  const saved = await uploadFile(file, {type, name: file.name, tags, unread, description, outliner, group}, progress);
  if (!saved) return null;
  let fresh = indexItem(saved);
  // Made public after, as Diigo's own windows do; and the description of an image, which its upload doesn't take
  // (Diigo's Add Image has none), saved after as its edit window saves one
  const describe = !!description && fresh.description != description;
  if (!isPrivate && fresh.private || describe) {
    const edit = singleSave({...fresh, private: isPrivate ? fresh.private : false,
      description: describe ? description : fresh.description}, fresh.tags);
    const made = await postSave(edit.url, new URLSearchParams(edit.params)).catch(() => null);
    if (made) fresh = indexItem(made);
  }
  index.set(fresh.id, fresh);
  await saveIndex({put: [fresh]});
  return fresh;
}

// An image or a PDF from the trash made again from its file (uploadFile), then with its title and description, as its
// edit window saves one (singleSave). The answer is the new item, also in the index (with another link_id); null when
// Diigo didn't take it (diigoAnswer says why; uploadLimit).
async function restoreFile(item) {
  const name = item.fileName || (item.type == 'pdf' ? 'document.pdf' : 'image');
  try {
    let saved = await uploadFile(item.file, {...item, name});
    if (!saved) return null;
    // its title and description: when that fails, it is back all the same, with the name of its file
    const edit = singleSave({...item, id: text(saved.link_id)}, item.tags);
    saved = await postSave(edit.url, new URLSearchParams(edit.params)) || saved;
    const fresh = indexItem(saved);
    index.set(fresh.id, fresh);
    await saveIndex({put: [fresh]});
    return fresh;
  } catch (e) {
    diigoAnswer = e?.message || String(e);
    return null;
  }
}


// ---- deleting ----

// JSON with code 1 when it worked, as the other requests of the site; a web page (the sign-in page) when not
async function deleteBatch(ids, signal) {
  return diigoPost(DELETE_URL, {link_id: ids.join(',')}, signal);
}

// What Diigo answered the last request that failed, for the status line: the requests of Bulk edit are only known from
// the site's code, which doesn't look at the answer, so this shows what it is.
let diigoAnswer = '';

async function diigoPost(url, params, signal) {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: {'X-Requested-With': 'XMLHttpRequest'},
    body: new URLSearchParams(params),
    signal: timeLimit(signal),
  });
  const text = await response.text();
  let code;
  try {
    code = JSON.parse(text).code;
  } catch (e) {
  }
  const ok = response.ok && (code === undefined ? !/<html/i.test(text) : code == 1);
  if (!ok) {
    diigoAnswer = `${response.status} ${/<html/i.test(text) ? '(a web page)' : text.trim().slice(0, 200)}`;
    logError('Swift Library: Diigo', `Diigo did not do it (${response.status})`, url, text.slice(0, 500));
  }
  return ok;
}

// in Diigo and in the index, DELETE_AT_ONCE at a time, with a copy of each in the trash, with the file of an image or
// a PDF (got before, as it's gone after); progress(ids of the batch, deleted or not). The answer is {deleted, failed},
// how many. keepFiles false: deleted for good (Empty trash: library-delete.js, deleteNow), so the trash won't keep
// them and their file isn't asked for: that would only give the item a link of its own on Diigo (itemFileUrl).
async function deleteItems(ids, signal, progress, {keepFiles = true} = {}) {
  let deleted = 0, failed = 0;
  for (let i = 0; i < ids.length && !signal.aborted; i += DELETE_AT_ONCE) {
    const batch = ids.slice(i, i + DELETE_AT_ONCE);
    const files = {};
    for (const id of keepFiles ? batch.filter(id => WITH_FILE.includes(index.get(id)?.type)) : []) {
      const kept = await itemFile(id, signal);
      if (kept) files[id] = {file: kept.file, fileName: kept.name};
    }
    if (signal.aborted) break;
    const ok = await deleteBatch(batch, signal).catch(() => false);
    if (signal.aborted) break;
    if (ok) {
      deleted += batch.length;
      const copies = batch.map(id => index.get(id)).filter(Boolean)
        .map(item => ({...item, ...files[item.id], deletedAt: Date.now()}));
      copies.forEach(item => trash.set(item.id, item));
      batch.forEach(id => index.delete(id));
      meta = {...meta, total: meta.total - batch.length};
      await saveIndex({remove: batch, trashPut: copies});
      // a screenshot gone: the link to it out of the description of its bookmark
      await dropScreenshotLinks(copies).catch(e => logError('Screenshot: description', e));
    } else {
      failed += batch.length;
    }
    progress(batch, ok);
  }
  return {deleted, failed};
}

// Screenshots deleted (by Delete screenshot, or Delete of the image itself): the link to each out of the description
// of the bookmarks that link to it (index-item.js: screenshotLinks), saved as Diigo's edit window saves a bookmark
// (singleSave), in the index too. A line that is only the link, with or without a label before it (Screenshot: …),
// goes; elsewhere only the link. Put back finds the screenshot again by the web address in its own description.
async function dropScreenshotLinks(deleted) {
  const shots = deleted.filter(item => item.type == 'image' &&
    (item.tags || []).some(tag => tag.toLowerCase() == SCREENSHOT_TAG));
  if (!shots.length) return;
  const isShotLink = url => shots.some(shot => (shot.url && url == shot.url) ||
    url.match(/diigo\.com\/item\/image\/([\w-]+)/)?.[1] == shot.id);
  for (const bookmark of [...index.values()].filter(item => (item.type || 'bookmark') == 'bookmark')) {
    const linked = screenshotLinks(bookmark);
    if (![...linked.urls].some(isShotLink)) continue;
    const description = withoutScreenshotLinks(bookmark.description, isShotLink);
    if (description == bookmark.description) continue;
    const edit = singleSave({...bookmark, description}, bookmark.tags);
    if (!await postSave(edit.url, new URLSearchParams(edit.params)).catch(() => null)) continue;
    bookmark.description = description;
    await saveIndex({put: [bookmark]});
  }
}

// a description without the links isShotLink(url) says, as dropScreenshotLinks says it
function withoutScreenshotLinks(text, isShotLink) {
  const link = /https?:\/\/[^\s<>"']+/g;
  const clean = url => url.replace(/[.,;)]+$/, '');
  const lines = [];
  for (const line of String(text || '').split('\n')) {
    const links = (line.match(link) || []).map(clean);
    if (!links.some(isShotLink)) {
      lines.push(line);
      continue;
    }
    // the punctuation after a link stays: (link) leaves ()
    const rest = line.replace(link, url => isShotLink(clean(url)) ? url.slice(clean(url).length) : url);
    // only a label left (Screenshot:, Schermafbeelding :, 屏幕截图：): the whole line
    if (/^[^\n]{0,40}[:：]\s*[.,;)]*\s*$/.test(rest.trim()) || !rest.replace(/[\s.,;:：)]/g, '')) continue;
    lines.push(rest.replace(/\s+$/, ''));
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}


// ---- changing several at once, as Bulk Edit of diigo.com does it (MultiActionMoreDropDown in its code) ----

// read: mark_readed, readed 1 or 0; privacy: convert_mode, mode 0 (public) or 2 (private); tags: batch_edit_tags,
// editTags as typed in Diigo (separated by spaces, "between quotes" with a space in one), editTagOption 1 (add them)
// or 0 (replace all tags by them), infos {link_id_a: [ids]}. Diigo can't take tags away from several at once: those
// with the same tags left get them in place of all of theirs, together. batch_edit_tags can answer 500 (a web page) for
// a request just like the site's own (October 2026): then each item is saved on its own with its new tags, as Diigo's
// edit window does (singleSave), and so is one left without tags.
const READ_URL = 'https://www.diigo.com/ditem_mana2/mark_readed';
const PRIVACY_URL = 'https://www.diigo.com/ditem_mana2/convert_mode';
const TAGS_URL = 'https://www.diigo.com/ditem_mana2/batch_edit_tags';

const tagsText = tags => tags.map(tag => /\s/.test(tag) ? `"${tag}"` : tag).join(' ');
const hasTag = (item, tag) => item.tags.some(other => other.toLowerCase() == tag.toLowerCase());

function inBatches(items) {
  const batches = [];
  for (let i = 0; i < items.length; i += DELETE_AT_ONCE) batches.push(items.slice(i, i + DELETE_AT_ONCE));
  return batches;
}

// One item saved on its own with other tags, as Diigo's edit window saves each kind (EditItem in its code): a bookmark
// with its URL, read later and private; an image with private; a PDF with private and read later. Not a note: that
// would save its text as the index has it, maybe not as it is now. null for those.
function singleSave(item, tags) {
  const fields = {link_id: item.id, title: item.title, description: item.description, tags: tagsText(tags)};
  switch (item.type || 'bookmark') {
    case 'bookmark':
      return {url: SAVE_URL, params: {...fields, url: item.url, private: item.private, unread: item.unread}};
    case 'image':
      return {url: IMAGE_URL, params: {...fields, private: item.private}};
    case 'pdf':
      return {url: PDF_URL, params: {...fields, private: item.private, unread: item.unread}};
    default:
      return null;
  }
}

// the requests a change takes, each with its items and what it does to each of them in the index; only for the items
// it changes. single: the request for one of them on its own, when the one for all of them fails (or has no tags).
function bulkRequests(change, items) {
  const ids = batch => batch.map(item => item.id).join(',');
  // after: the tags of an item once changed
  const tagRequest = (batch, tags, option, after) => ({
    url: tags.length ? TAGS_URL : '', batch, apply: item => item.tags = after(item),
    params: {
      editTags: tagsText(tags), editTagOption: option,
      infos: JSON.stringify({link_id_a: batch.map(item => item.id)}),
    },
    single: item => singleSave(item, after(item)),
  });
  switch (change.type) {
    case 'read':
    case 'unread': {
      const unread = change.type == 'unread';
      // images and notes can't be unread again, as on diigo.com
      const can = item => !unread || !['image', 'note'].includes(item.type);
      return inBatches(items.filter(item => item.unread != unread && can(item))).map(batch => ({
        url: READ_URL, batch, params: {link_id: ids(batch), readed: unread ? 0 : 1},
        apply: item => item.unread = unread,
      }));
    }
    case 'public':
    case 'private': {
      const isPrivate = change.type == 'private';
      return inBatches(items.filter(item => item.private != isPrivate)).map(batch => ({
        url: PRIVACY_URL, batch, params: {link_id: ids(batch), mode: isPrivate ? 2 : 0},
        apply: item => item.private = isPrivate,
      }));
    }
    case 'addTags': {
      const missing = items.filter(item => change.tags.some(tag => !hasTag(item, tag)));
      return inBatches(missing).map(batch => tagRequest(batch, change.tags, 1,
        item => [...item.tags, ...change.tags.filter(tag => !hasTag(item, tag))]));
    }
    case 'removeTags': {
      const left = item => item.tags.filter(tag => !change.tags.some(other => hasTag({tags: [tag]}, other)));
      const groups = new Map();
      for (const item of items.filter(item => left(item).length < item.tags.length)) {
        const key = JSON.stringify(left(item));
        groups.set(key, [...groups.get(key) || [], item]);
      }
      return [...groups].flatMap(([key, group]) => inBatches(group).map(batch =>
        tagRequest(batch, JSON.parse(key), 0, () => JSON.parse(key))));
    }
    case 'mergeTags': {
      // the tags of change.tags replaced by change.into, in one request for those with the same tags after, as removeTags
      const after = item => {
        const left = item.tags.filter(tag => !change.tags.some(other => hasTag({tags: [tag]}, other)));
        return hasTag({tags: left}, change.into) ? left : [...left, change.into];
      };
      const groups = new Map();
      for (const item of items.filter(item => change.tags.some(tag => hasTag(item, tag)))) {
        const key = JSON.stringify(after(item));
        groups.set(key, [...groups.get(key) || [], item]);
      }
      return [...groups].flatMap(([key, group]) => inBatches(group).map(batch =>
        tagRequest(batch, JSON.parse(key), 0, () => JSON.parse(key))));
    }
    default:
      return [];
  }
}

// change: {type: read, unread, public, private, addTags, removeTags or mergeTags, tags; into for mergeTags}. In Diigo and in the index;
// progress(done, total): how many of those that change are done (changed or not), also one by one. The answer is
// {changed, failed, untouched, ids, failedIds}: untouched were so already, ids those changed, failedIds those Diigo
// didn't.
const failing = new Set();  // the requests for all at once that failed, not tried again in this page

async function editItems(ids, change, signal, progress) {
  const items = ids.map(id => index.get(id)).filter(Boolean);
  const requests = bulkRequests(change, items);
  let changed = 0, failed = 0;
  const changedIds = [], failedIds = [];
  const total = requests.reduce((count, request) => count + request.batch.length, 0);
  progress(0, total);
  for (const {url, params, batch, apply, single} of requests) {
    if (signal.aborted) break;
    // all at once; one by one when that fails (or there is no request for all at once), and from then on in this page
    const ok = !!url && !failing.has(url) && await diigoPost(url, params, signal).catch(() => false);
    if (signal.aborted) break;
    if (!ok && single && url) failing.add(url);
    const done = ok ? batch : [];
    if (!ok && single) {
      for (const item of batch) {
        if (signal.aborted) break;
        const one = single(item);
        if (one && await diigoPost(one.url, one.params, signal).catch(() => false)) done.push(item);
        progress(changed + failed + batch.indexOf(item) + 1, total);
      }
    }
    failedIds.push(...batch.filter(item => !done.includes(item)).map(item => item.id));
    done.forEach(apply);
    changed += done.length;
    failed += batch.length - done.length;
    changedIds.push(...done.map(item => item.id));
    if (done.length) await saveIndex({put: done});
    progress(changed + failed, total);
  }
  // the same change of tags for the screenshots of those changed (index-item.js: screenshotsOf), so they have the
  // tags of their bookmark: hidden with it, and so on; screenshot stays
  if (['addTags', 'removeTags'].includes(change.type) && !signal.aborted) {
    const all = [...index.values()];
    const shots = [...new Set(changedIds.flatMap(id => screenshotsOf(index.get(id), all).map(shot => shot.id)))]
      .filter(id => !ids.includes(id));
    const tags = change.type == 'removeTags' ? change.tags.filter(tag => tag.toLowerCase() != SCREENSHOT_TAG) : change.tags;
    if (shots.length && tags.length) await editItems(shots, {...change, tags}, signal, () => {}).catch(() => {});
  }
  return {changed, failed, untouched: items.length - total, ids: changedIds, failedIds};
}


// ---- sites ----

// what was typed for a site: a site, or a web address on it; with or without www. the same
function siteOf(text) {
  text = text.trim().toLowerCase();
  try {
    return new URL(/^[a-z]+:\/\//.test(text) ? text : 'https://' + text).hostname.replace(/^www\./, '');
  } catch (e) {
    return '';
  }
}

// the site of a bookmark, without www.
function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch (e) {
    return '';
  }
}

// that site and its subdomains
function onSite(url, site) {
  const host = hostOf(url);
  return !!site && !!host && (host == site || host.endsWith('.' + site));
}

// The same web address (Duplicates, library-trash.js; in your library already, discover.js): urlKey, in index-item.js.

// the tags of items, with how many each has; the same without case, as in Diigo: [{name, count}], most used first
function tagCounts(items) {
  const counts = new Map();
  for (const item of items) {
    for (const name of item.tags) {
      const key = name.toLowerCase();
      if (!counts.has(key)) counts.set(key, {name, count: 0});
      counts.get(key).count++;
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count);
}

// Tags that are nearly the same, for Similar tags (library-tags.js): written with or without - _ . ' or a space between
// the words, with or without accents (e-mail, email; café, cafe), or one the plural of the other in English (recipe,
// recipes; library, libraries); tags that differ only in case are one tag already, as in Diigo (tagCounts). counts:
// [{name, count}]; the answer a list of groups of them, each the most used first, the groups with the most bookmarks
// first.
const tagBase = name => name.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[\s\-_.'’]+/g, '');

function similarTagGroups(counts) {
  const byBase = new Map();
  for (const tag of counts) {
    const base = tagBase(tag.name);
    if (base) byBase.set(base, [...byBase.get(base) || [], tag]);
  }
  // the plurals of each, when they are tags too: one group of them
  const parent = new Map([...byBase.keys()].map(base => [base, base]));
  const root = base => parent.get(base) == base ? base : root(parent.get(base));
  for (const base of byBase.keys()) {
    if (base.length < 3) continue;
    for (const plural of [base + 's', base + 'es', base.replace(/y$/, 'ies')]) {
      if (plural != base && byBase.has(plural)) parent.set(root(plural), root(base));
    }
  }
  const groups = new Map();
  for (const [base, tags] of byBase) groups.set(root(base), [...groups.get(root(base)) || [], ...tags]);
  const total = group => group.reduce((sum, tag) => sum + tag.count, 0);
  return [...groups.values()].filter(group => group.length > 1)
    .map(group => group.sort((a, b) => b.count - a.count))
    .sort((a, b) => total(b) - total(a));
}

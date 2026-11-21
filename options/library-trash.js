// A part of the Swift Library (library.html); library.js has what they share, library-page.js puts them to work.

// ---- the trash: what was deleted with the add-on, a copy of it (library-index.js: deleteItems) ----

// Put back makes a bookmark of it again, as the bookmark form saves one, so with the date of today and without its
// highlights; a note as Diigo makes a new note, with its text from the index (not those that went to the trash before
// the index kept it); an image or a PDF from its file, kept in the trash when it was deleted (not those of before).
// Diigo can't make a Kindle item but by importing it from Kindle: for those a link to its import page instead.
function trashActions(item, li) {
  let restore = element('button', '', message('libraryRestore'));
  restore.type = 'button';
  if (item.type == 'kindle') {
    restore = element('a', '', message('libraryReimportKindle'));
    restore.href = 'https://www.diigo.com/import_all/kindle';
    restore.target = '_blank';
    restore.rel = 'noopener';
    restore.title = message('libraryCantRestore');
  } else if (item.type == 'note' && !('content' in item)) {
    restore.disabled = true;
    restore.title = message('libraryNoNoteText');
  } else if (WITH_FILE.includes(item.type) && !item.file) {
    restore.disabled = true;
    restore.title = message('libraryNoFile');
  } else if (item.type && !['bookmark', 'note', 'outliner', ...WITH_FILE].includes(item.type)) {
    restore.disabled = true;
  }
  if (restore.tagName == 'BUTTON') restore.addEventListener('click', () => restoreItem(item, li));
  const forget = element('button', 'delete', message('libraryForget'));
  forget.type = 'button';
  forget.addEventListener('click', async () => {
    trash.delete(item.id);
    await saveIndex({trashRemove: [item.id]});
    leaveList(item, li);
  });
  return [restore, forget];
}

// How much room the trash takes: the files of images and PDFs, and roughly the copies of the items. And what the
// add-on keeps in this browser in all (the index too) next to what the browser lets it keep (navigator.storage), when
// the browser says so.
const sizeFormat = bytes => {
  const units = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte'];
  const power = Math.min(units.length - 1, Math.floor(Math.log(Math.max(bytes, 1)) / Math.log(1024)));
  return new Intl.NumberFormat(browser.i18n.getUILanguage(), {
    style: 'unit', unit: units[power], unitDisplay: 'short', maximumFractionDigits: power > 1 ? 1 : 0,
  }).format(bytes / 1024 ** power);
};

async function showTrashSize() {
  if (!trash.size) {
    $('trashSize').textContent = message('libraryTrashEmpty');
    return;
  }
  let bytes = 0;
  for (const {file, ...item} of trash.values()) bytes += (file?.size || 0) + JSON.stringify(item).length;
  let text = message('libraryTrashSize', [String(trash.size), sizeFormat(bytes)]);
  const estimate = await navigator.storage?.estimate?.().catch(() => null);
  if (estimate?.quota) {
    text += ' ' + message('libraryStorage', [sizeFormat(estimate.usage || 0), sizeFormat(estimate.quota)]);
  }
  $('trashSize').textContent = text;
}

// a bookmark out of the list; in Duplicates its group too, once none of it is left
function removeItem(li) {
  const group = li.closest('.dup-group');
  li.remove();
  if (group && !group.querySelector('.item')) group.remove();
}

function leaveList(item, li) {
  // on Start (library-home.js): its blocks again
  if (state.view == 'home') return show({keepScroll: true});
  removeItem(li);
  shown = shown.filter(other => other != item);
  listed--;
  showCount();
  showTags();
  if (state.view == 'trash') safely('trash size', showTrashSize);
}

async function restoreItem(item, li) {
  if (controller) return;
  if (item.type == 'note' || item.type == 'outliner' || WITH_FILE.includes(item.type)) {
    // with its new link_id in the index at once; an outliner made again on Diigo (library-outliners.js)
    const made = await (item.type == 'note' ? restoreNote(item) : item.type == 'outliner' ? outlinerPart.restore(item)
      : restoreFile(item));
    if (!made) return showStatus(message('libraryRestoreFailed', diigoAnswer), true);
    trash.delete(item.id);
    await saveIndex({trashRemove: [item.id]});
    leaveList(item, li);
    return;
  }
  const bm = {
    url: item.url, title: item.title || item.url, description: item.description, tags: item.tags,
    private: item.private, unread: item.unread,
  };
  const result = await browser.runtime.sendMessage({type: 'save', ...bm, urlId: ''}).catch(() => null);
  if (!result?.ok) return showStatus(message('libraryRestoreFailed', saveError(result)), true);
  trash.delete(item.id);
  await saveIndex({trashRemove: [item.id]});
  leaveList(item, li);
  // back in the index with the update, with its new id from Diigo
  update();
}

// all of it, also what Diigo hasn't deleted yet (library-delete.js): Diigo deletes those now, and they don't stay.
// With many in it that takes a while (the files of images and PDFs out of the browser, Diigo a batch at a time): the
// bar below the blue one says how far, and Empty can't be chosen again till it's done (trashBlock, library-home.js).
let emptying = false;

function showEmptying(done, count) {
  $('emptyTrash').disabled = emptying;
  if (emptying) showStatus(message('libraryEmptying', [String(done), String(count)]));
}

async function emptyTrash() {
  const count = totalOf('trash');
  if (emptying || !count || !confirm(message('libraryEmptyConfirm', String(count)))) return;
  emptying = true;
  // what Diigo didn't delete (or Stop left) is in the list again, so not counted as gone
  let gone = 0, failed = 0;
  try {
    const ids = [...trash.keys()];
    showEmptying(0, count);
    const diigo = pending.size ? deleteNow(done => showEmptying(ids.length + done, count)) : null;
    // outliners waiting to be deleted: by Diigo now, and not kept (library-outliners.js)
    const outlinersGone = (await outlinerPart.deleteNow()).deleted;
    trash.clear();
    await saveIndex({trashRemove: ids});
    gone = ids.length + outlinersGone;
    showEmptying(gone, count);
    show({keepScroll: true});
    const result = await diigo;
    gone += result?.deleted || 0;
    failed = result?.failed || 0;
  } finally {
    emptying = false;
    showEmptying(gone, count);
    show({keepScroll: true});
    const text = message('libraryEmptied', String(gone));
    showStatus(failed ? text + ' ' + message('cleanupFailed', String(failed)) : text, !!failed);
  }
}


// ---- duplicates: bookmarks with the same web address but for how it is written ----

// Which web addresses are the same: urlKey, in library-index.js.

// id -> its web address as urlKey writes it, for each bookmark with another one like it; worked out again only when
// the index changed (indexVersion)
let duplicates = {version: -1, keys: new Map()};

function duplicateKeys() {
  // again when the index changed, or what waits to be deleted (library-delete.js), which isn't one any more
  const version = indexVersion + ':' + pendingVersion;
  if (duplicates.version == version) return duplicates.keys;
  const byKey = new Map();
  for (const item of liveItems()) {
    if (!item.url) continue;
    const key = urlKey(item.url);
    byKey.set(key, [...byKey.get(key) || [], item.id]);
  }
  const keys = new Map();
  for (const [key, ids] of byKey) if (ids.length > 1) ids.forEach(id => keys.set(id, key));
  duplicates = {version, keys};
  return keys;
}

const sameKey = (a, b) => {
  const keys = duplicateKeys();
  const [x, y] = [keys.get(a.id) || '', keys.get(b.id) || ''];
  return x < y ? -1 : x > y ? 1 : 0;
};

// Bulk edit on, with all but the newest of each web address ticked: ready to delete
function tickDuplicates() {
  const keys = duplicateKeys();
  const newest = new Map();
  for (const item of shown) {
    const key = keys.get(item.id);
    if (key && (!newest.has(key) || item.created > newest.get(key).created)) newest.set(key, item);
  }
  const older = shown.filter(item => keys.has(item.id) && newest.get(keys.get(item.id)) != item);
  chosen = new Set(older.map(item => item.id));
  state.bulk = true;
  show({keepScroll: true});
}

// A part of the Swift Library (library.html); library.js has what they share, library-page.js puts them to work.

// ---- deleting after a while: time to think it over, in the trash ----

// With deleteDelay (pages/settings.js), Delete (of one bookmark, or with Bulk edit) asks nothing: the bookmarks go to
// the trash at once, with a short message that they can be put back there, but Diigo only deletes them after
// DELETE_DELAY. Till then the trash shows them as not deleted yet (pendingTrash), and Put back only takes them out of
// pending: Diigo never knew. Once Diigo deleted them they are in the trash as any other (library-index.js:
// deleteItems). One wait for all of them: another Delete in the meantime starts it over. Busy with the index then,
// they wait for that. Those waiting are kept in the browser too (keepPending), so leaving the page loses nothing and
// asks nothing: the next time the Swift Library opens, it goes on with them (resumePending).
// Without deleteDelay: a question first, and deleted at once, as Diigo does.
const DELETE_DELAY = 30 * 1000;
const pending = new Map();  // id -> when Delete was chosen (milliseconds)
let pendingVersion = 0;     // one more with each change of it (library-trash.js: duplicateKeys)
let pendingTimer = 0;

// Those waiting, kept in the browser (storage.local) with whose library they are of, after each change of pending
const PENDING_KEY = 'pendingDeletes';

function keepPending() {
  const kept = pending.size ? browser.storage.local.set({[PENDING_KEY]: {user, items: Object.fromEntries(pending)}})
    : browser.storage.local.remove(PENDING_KEY);
  kept.catch(e => logError('Trash: waiting to be deleted', e));
}

// The Swift Library opened (library-page.js: openFor): those that waited when a page of it was left are waiting again,
// for what is left of their DELETE_DELAY (none: deleted now); only of who is signed in, and still in the index
async function resumePending() {
  const kept = (await browser.storage.local.get(PENDING_KEY).catch(() => ({})))[PENDING_KEY];
  if (!kept || kept.user != user) return;
  for (const [id, time] of Object.entries(kept.items || {})) {
    if (index.has(id) && !pending.has(id)) pending.set(id, Number(time) || Date.now());
  }
  keepPending();
  if (!pending.size) return;
  pendingVersion++;
  clearTimeout(pendingTimer);
  pendingTimer = setTimeout(deletePending, Math.max(0, Math.max(...pending.values()) + DELETE_DELAY - Date.now()));
  show({keepScroll: true});
}

function deleteLater(ids) {
  for (const id of ids) {
    pending.set(id, Date.now());
    chosen.delete(id);
  }
  keepPending();
  pendingVersion++;
  clearTimeout(pendingTimer);
  pendingTimer = setTimeout(deletePending, DELETE_DELAY);
  toastIds = ids;
  showToast(message('libraryMovedToTrash', String(ids.length)));
}

// Undo in the bar of showToast: those of that Delete back, while it shows (TOAST_TIME, well within DELETE_DELAY, so
// Diigo never knew)
let toastIds = [];

function undoDelete() {
  $('toast').hidden = true;
  // an outliner of that Delete (library-outliners.js)
  if (outlinerPart.undo()) return show({keepScroll: true});
  for (const id of toastIds) pending.delete(id);
  keepPending();
  toastIds = [];
  pendingVersion++;
  if (!pending.size) clearTimeout(pendingTimer);
  show({keepScroll: true});
}

// Put back of one in the trash that Diigo hasn't deleted yet
function cancelDelete(item, li) {
  if (item.type == 'outliner') return outlinerPart.cancel(item, li);
  pending.delete(item.id);
  keepPending();
  pendingVersion++;
  if (!pending.size) clearTimeout(pendingTimer);
  leaveList(item, li);
  safely('side bar', showTags);
}

// That they are in the trash: a dark bar floating at the bottom for TOAST_TIME, with Undo, and Trash, which opens it
const TOAST_TIME = 7000;
let toastTimer = 0;

function showToast(text) {
  $('toastText').textContent = text;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').hidden = true, TOAST_TIME);
}

// those waiting, as the trash shows them: from the index, with when Delete was chosen; not those Diigo is deleting
// right now and the trash has already
const pendingTrash = () => [...pending].filter(([id]) => index.has(id) && !trash.has(id))
  .map(([id, time]) => ({...index.get(id), deletedAt: time, pendingDelete: true}))
  // and outliners (library-outliners.js)
  .concat(outlinerPart.pendingCopies());

// Empty trash: those waiting deleted by Diigo now, and not kept in the trash after (forgetPending), as all of it
// goes; busy with the index, as soon as it isn't
let forgetPending = false;

// done: how many Diigo has done so far, for Empty trash (library-trash.js: emptyTrash); the answer comes once it's all done
function deleteNow(done) {
  forgetPending = true;
  clearTimeout(pendingTimer);
  return deletePending(done);
}

// While Diigo deletes those that waited (after DELETE_DELAY): the bar below the blue one says how far, with a bar
// (showPendingProgress), as with many of them it takes a while; Empty trash says it itself (done).
let deletingPending = false;

function showPendingProgress(done, total) {
  showStatus(message('libraryDeletingPending', [String(done), String(total)]));
  showNoticeProgress(done, total);
}

async function deletePending(done) {
  if (controller) {
    return new Promise(resolve => pendingTimer = setTimeout(() => resolve(deletePending(done)), 2000));
  }
  const ids = [...pending.keys()].filter(id => index.has(id));
  const forget = forgetPending;
  const signal = start();
  let result = {deleted: 0, failed: 0};
  const deletedIds = [];
  deletingPending = !done && ids.length > 0;
  if (deletingPending) showPendingProgress(0, ids.length);
  try {
    let count = 0;
    result = await deleteItems(ids, signal, (batch, ok) => {
      if (ok) deletedIds.push(...batch);
      count += batch.length;
      done?.(count);
      if (deletingPending) showPendingProgress(count, ids.length);
    }, {keepFiles: !forget});
    if (forget && deletedIds.length) {
      deletedIds.forEach(id => trash.delete(id));
      await saveIndex({trashRemove: deletedIds});
    }
  } catch (e) {
    reportProblem(e, 'delete');
  } finally {
    if (deletingPending) {
      deletingPending = false;
      showNoticeProgress(0, null);
      showStatus('');
    }
    stop();
    forgetPending = false;
    // what Diigo didn't delete is in the list again
    pending.clear();
    keepPending();
    pendingVersion++;
    show({keepScroll: true});
    // what worked was said at Delete already; only what didn't
    if (result.failed) showStatus(message('cleanupFailed', String(result.failed)), true);
  }
  return result;
}

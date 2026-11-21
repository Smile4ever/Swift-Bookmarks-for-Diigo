// A part of the Swift Library (library.html); library.js has what they share, library-page.js puts them to work.

// ---- Bulk edit: a box at the left of each bookmark, and what to do with those ticked ----

// As Bulk Edit on diigo.com: tags added or taken away, public or private, read or unread, or deleted (to the trash), in
// Diigo and in the index (library-index.js: editItems, deleteItems). All ticks what is shown, also what isn't in the
// list yet as it grows while scrolling. What is ticked stays so while you search, but only what is shown counts.
let chosen = new Set();  // their ids

const picking = () => state.bulk && state.view != 'trash' && state.view != 'home';
const pickedItems = () => shown.filter(item => chosen.has(item.id));

// ---- the selection: from where it starts (anchor) to its other end (focus), as in a list of files ----

// As in a list of files. Ticking one yourself starts a selection there. Shift+↓ and Shift+↑ move
// its other end: away from the start they tick one more, back towards it one less. Shift+End ticks from the start to
// the last one shown, Shift+Home to the first, Shift+click to the one clicked.
// Without a start kept here (none ticked, or it was unticked since) the first and last ticked one are the ends; with
// nothing ticked, the first press ticks the first bookmark in view (the last one in view for Shift+↑ and Shift+Home).
let anchor = '';  // ids
let focus = '';

const showChecks = () => {
  $('items').querySelectorAll('.pick').forEach(box => box.checked = chosen.has(box.dataset.id));
  showPicked();
};

// [anchor, focus] as places in shown, or null when nothing is ticked
function selectionEnds() {
  const at = id => shown.findIndex(item => item.id == id);
  if ([anchor, focus].every(id => chosen.has(id) && at(id) >= 0)) return [at(anchor), at(focus)];
  const first = shown.findIndex(item => chosen.has(item.id));
  return first < 0 ? null : [first, shown.findLastIndex(item => chosen.has(item.id))];
}

// the other end to t: from a to t ticked, and what was ticked from a to f but is past t no longer
function moveFocus(a, f, t) {
  const [from, to] = [Math.min(a, t), Math.max(a, t)];
  for (let i = Math.min(a, f); i <= Math.max(a, f); i++) {
    if (i < from || i > to) chosen.delete(shown[i].id);
  }
  for (let i = from; i <= to; i++) chosen.add(shown[i].id);
  [anchor, focus] = [shown[a].id, shown[t].id];
}

// one ticked or unticked; Shift+click while some are ticked: from the start of the selection to it
function pick(item, on, shift) {
  const ends = shift && selectionEnds();
  const t = shown.indexOf(item);
  if (ends && t >= 0) {
    moveFocus(...ends, t);
  } else {
    on ? chosen.add(item.id) : chosen.delete(item.id);
    anchor = focus = on ? item.id : '';
  }
  if (!leaveBulkWhenEmpty()) showChecks();
}

// none of those shown ticked any more, as the last one was unticked: Bulk edit off, as a click on a bookmark turned it
// on (bulkOnClick); true when it did. Not for All unticked in the bar: Bulk edit stays then, to tick others.
function leaveBulkWhenEmpty() {
  if (pickedItems().length) return false;
  state.bulk = false;
  chosen.clear();
  anchor = focus = '';
  show({push: true, keepScroll: true});
  return true;
}

// The page scrolls as little as it can: only once the bookmark past the end of the selection, the way you're going,
// isn't wholly in view, and then far enough for AHEAD of them at once, so the next presses don't scroll. The end of
// the selection itself stays in view all the same. In view is below the bar of Bulk edit, with 16px to spare.
const VIEW_MARGIN = 16;
const AHEAD = 6;

const itemAt = i => $('items').querySelector(`.pick[data-id="${CSS.escape(String(shown[i]?.id))}"]`)?.closest('.item');

function viewEdges() {
  const bar = $('bulkBar').getBoundingClientRect();
  return {top: Math.max(0, bar.bottom) + VIEW_MARGIN, bottom: innerHeight - VIEW_MARGIN};
}

// i: the end of the selection that just moved, down or up. Not in the list yet (it grows while scrolling): listed
// first, as far as AHEAD past it.
function scrollAlong(i, down) {
  while (listed < shown.length && listed <= Math.min(i + AHEAD, shown.length - 1)) listMore();
  const {top, bottom} = viewEdges();
  // the first and last of the list stand in for those past them
  const rect = n => itemAt(Math.max(0, Math.min(shown.length - 1, n)))?.getBoundingClientRect();
  const item = rect(i);
  if (!item) return;
  const ahead = rect(down ? i + AHEAD : i - AHEAD) || item;
  let by = 0;
  if (down && ((rect(i + 1) || item).bottom > bottom || item.top < top)) by = Math.min(ahead.bottom - bottom, item.top - top);
  if (!down && ((rect(i - 1) || item).top < top || item.bottom > bottom)) by = Math.max(ahead.top - top, item.bottom - bottom);
  if (by) scrollBy({top: by, behavior: 'smooth'});
}

function firstInView(last) {
  const {top, bottom} = viewEdges();
  const rects = [...Array(listed).keys()].map(i => [i, itemAt(i)?.getBoundingClientRect()]).filter(([, rect]) => rect);
  const wholly = rects.filter(([, rect]) => rect.top >= top && rect.bottom <= bottom);
  const partly = rects.filter(([, rect]) => rect.bottom > top && rect.top < bottom);
  const inView = wholly.length ? wholly : partly;
  return (last ? inView.at(-1) : inView[0])?.[0] ?? 0;
}

// not while typing (a box of a bookmark is no field) or in a popup
const typingOrPopup = e =>
  !!e.target.closest?.('textarea, select, [contenteditable], input:not([type=checkbox])') || $('popup').open;

// Delete: what is ticked, as the button Delete of the bar (deletePicked)
function deleteKey(e) {
  if (e.key != 'Delete' || !picking() || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || typingOrPopup(e)) return;
  if (!pickedItems().length) return;
  e.preventDefault();
  deletePicked();
}

// Shift+↓, Shift+↑, Shift+End, Shift+Home
const SHIFT_KEYS = ['ArrowDown', 'ArrowUp', 'End', 'Home'];

function shiftKey(e) {
  if (!picking() || !e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || !SHIFT_KEYS.includes(e.key)) return;
  if (typingOrPopup(e)) return;
  if (!shown.length) return;
  e.preventDefault();
  const down = e.key == 'ArrowDown' || e.key == 'End';
  let ends = selectionEnds();
  if (!ends) {
    const start = firstInView(!down);
    chosen.add(shown[start].id);
    anchor = focus = shown[start].id;
    ends = [start, start];
    if (e.key == 'ArrowDown' || e.key == 'ArrowUp') {
      showChecks();
      return scrollAlong(start, down);
    }
  }
  const [a, f] = ends;
  const t = e.key == 'End' ? shown.length - 1 : e.key == 'Home' ? 0
    : Math.max(0, Math.min(shown.length - 1, f + (down ? 1 : -1)));
  moveFocus(a, f, t);
  showChecks();
  if (e.key == 'Home') return scrollTo({top: 0, behavior: 'smooth'});
  // all of them ticked, also what isn't in the list yet; the list itself grows as you scroll, not all of it at once
  if (e.key == 'End') return scrollTo({top: document.documentElement.scrollHeight, behavior: 'smooth'});
  scrollAlong(t, down);
}

function pickBox(item) {
  const box = element('input', 'pick');
  box.type = 'checkbox';
  box.dataset.id = item.id;
  box.checked = chosen.has(item.id);
  box.setAttribute('aria-label', item.title || item.url);
  // click, not change: that doesn't say if Shift was down
  box.addEventListener('click', e => pick(item, box.checked, e.shiftKey));
  return box;
}

// Bulk edit: a click on the bookmark where nothing else takes it (not a link, button or field, nor text you
// selected) ticks or unticks it, as its box
const TAKES_CLICK = 'a, button, input, select, textarea, label, form, [contenteditable]';

function pickOnClick(li, item) {
  // Shift+click would select the text between the clicks
  li.addEventListener('mousedown', e => {
    if (e.shiftKey && !e.target.closest(TAKES_CLICK)) e.preventDefault();
  });
  li.addEventListener('click', e => {
    if (e.target.closest(TAKES_CLICK)) return;
    if (!e.shiftKey && !getSelection().isCollapsed) return;
    pick(item, !chosen.has(item.id), e.shiftKey);
  });
}

// Without Bulk edit, a click at the front of a bookmark, where its box comes (the padding at the left of .item, which
// shows an empty box on hover, library.css), turns it on, with that bookmark ticked as the start of the selection; not
// a click elsewhere on it. Not in the trash, which has no Bulk edit.
function bulkOnClick(li, item) {
  li.addEventListener('click', e => {
    if (picking() || state.view == 'trash' || e.target != li) return;
    if (e.clientX - li.getBoundingClientRect().left >= parseFloat(getComputedStyle(li).paddingLeft)) return;
    state.bulk = true;
    chosen.add(item.id);
    anchor = focus = item.id;
    show({push: true, keepScroll: true});
  });
}

// the bar floating at the top of the window (sticky at -1px, so not all of it is in view then): with a shadow
function watchBulkBar() {
  const bar = $('bulkBar');
  new IntersectionObserver(([entry]) => {
    bar.classList.toggle('stuck', entry.intersectionRatio < 1 && entry.boundingClientRect.top < 0);
  }, {threshold: 1}).observe(bar);
}

// called by show(), before the list is drawn
function showBulk() {
  $('bulkBar').hidden = !picking();
  $('bulkToggle').setAttribute('aria-pressed', String(state.bulk));
  $('bulkToggle').classList.toggle('on', state.bulk);
  showPicked();
}

// what Bulk edit does with the tags typed: "tag" adds it, "-tag" takes it away, both at once; "between quotes" with a
// space in one
function bulkTags() {
  const tags = {add: [], remove: []};
  for (const word of $('bulkTags').value.match(/-?"[^"]*"?|[^\s,"]+/g) || []) {
    const remove = word.startsWith('-');
    const tag = word.slice(remove ? 1 : 0).replace(/"/g, '').trim();
    if (tag) tags[remove ? 'remove' : 'add'].push(tag);
  }
  return tags;
}

// the buttons that do one of two, after what is ticked: read unless all are read already, then unread; private unless
// all are private already, then public
function toggles(picked) {
  const all = test => picked.length > 0 && picked.every(test);
  return {
    read: all(item => !item.unread) ? 'unread' : 'read',
    privacy: all(item => item.private) ? 'public' : 'private',
  };
}

function showPicked() {
  const picked = pickedItems();
  const count = picked.length;
  $('bulkCount').textContent = message('bulkSelected', String(count));
  $('bulkAll').checked = count > 0 && count == shown.length;
  $('bulkAll').indeterminate = count > 0 && count < shown.length;
  const {read, privacy} = toggles(picked);
  $('bulkRead').textContent = message(read == 'read' ? 'bulkRead' : 'bulkUnread');
  $('bulkPrivacy').textContent = message(privacy == 'private' ? 'bulkPrivate' : 'bulkPublic');
  for (const button of $('bulkBar').querySelectorAll('button')) button.disabled = !count || !!controller;
  const {add, remove} = bulkTags();
  if (!add.length && !remove.length) $('bulkApplyTags').disabled = true;
}

// While Bulk edit is busy its bar shows only that: what it does (the name of its button), a bar of how far and Stop
function showProgress(label, done, total) {
  $('bulkBar').classList.add('busy');
  $('bulkProgressBar').max = Math.max(total, 1);
  $('bulkProgressBar').value = done;
  $('bulkProgressText').textContent = `${label} · ${message('bulkProgress', [String(done), String(total)])}`;
}

// done: back to the buttons, and what worked no longer ticked (what didn't stays so, to try again)
function endProgress(doneIds) {
  $('bulkBar').classList.remove('busy');
  doneIds.forEach(id => chosen.delete(id));
}

// the list again after an action of Bulk edit. With bulkExitAfter, Bulk edit off when all of it worked (else it stays
// on, with what failed ticked); with bulkClearFilters, the search and the filters above the list away when nothing
// is left to show, so you see your library again.
function afterBulk(allDone) {
  if (allDone && settings.bulkExitAfter) {
    state.bulk = false;
    chosen.clear();
    anchor = focus = '';
  }
  show({keepScroll: true});
  const filtered = state.query || state.tags.length || state.site || state.conditions.length;
  if (shown.length || !filtered || !settings.bulkClearFilters) return;
  Object.assign(state, {field: 'all', query: '', tags: [], site: '', conditions: []});
  showSearchBox();
  show({push: true});
}

// changes of all those ticked, one after the other: Diigo's answer in the status line, and the list again; the answer
// is how many Diigo didn't change. label: the name of the button, for the progress.
async function editPicked(label, ...changes) {
  const ids = pickedItems().map(item => item.id);
  if (!ids.length || controller) return;
  const signal = start();
  const changedIds = new Set();
  const failedIds = new Set();
  let failed = 0;
  try {
    for (const change of changes) {
      if (signal.aborted) break;
      const result = await editItems(ids, change, signal, (done, total) => showProgress(label, done, total));
      result.ids.forEach(id => changedIds.add(id));
      result.failedIds.forEach(id => failedIds.add(id));
      failed += result.failed;
    }
  } catch (e) {
    reportProblem(e, 'bulk edit');
  } finally {
    stop();
    // done: changed, or so already
    endProgress(stopped ? changedIds : ids.filter(id => !failedIds.has(id)));
    afterBulk(!stopped && !failed && !failedIds.size);
    const text = message('bulkDone', String(changedIds.size));
    // with what Diigo answered (library-index.js: diigoAnswer)
    const why = message('bulkFailed', String(failed)) + (diigoAnswer ? ' ' + diigoAnswer : '');
    showStatus(failed ? text + ' ' + why : text, !!failed);
  }
  return failed;
}

function editTags() {
  const {add, remove} = bulkTags();
  if (!add.length && !remove.length) return $('bulkTags').focus();
  const changes = [
    ...add.length ? [{type: 'addTags', tags: add}] : [],
    ...remove.length ? [{type: 'removeTags', tags: remove}] : [],
  ];
  // what is typed stays when Diigo didn't do it, to try again
  editPicked($('bulkApplyTags').textContent, ...changes).then(failed => {
    if (!failed) $('bulkTags').value = '';
    showPicked();
  });
}

async function deletePicked() {
  const ids = pickedItems().map(item => item.id);
  if (!ids.length) return;
  // with deleteDelay: to the trash at once, deleted by Diigo after a while (library-delete.js); done for Bulk edit
  if (settings.deleteDelay) {
    deleteLater(ids);
    return afterBulk(true);
  }
  if (controller || !confirm(message('cleanupConfirm', String(ids.length)))) return;
  const signal = start();
  let result = {deleted: 0, failed: 0};
  const deletedIds = [];
  try {
    let done = 0;
    showProgress($('bulkDelete').textContent, 0, ids.length);
    result = await deleteItems(ids, signal, (batch, ok) => {
      done += batch.length;
      if (ok) deletedIds.push(...batch);
      showProgress($('bulkDelete').textContent, done, ids.length);
    });
  } catch (e) {
    reportProblem(e, 'delete');
  } finally {
    stop();
    endProgress(deletedIds);
    afterBulk(!stopped && !result.failed && deletedIds.length == ids.length);
    const text = message('cleanupDeleted', String(result.deleted));
    showStatus(result.failed ? text + ' ' + message('cleanupFailed', String(result.failed)) : text, !!result.failed);
  }
}


// ---- Share to outliner: all ticked to an outliner, as links at its end (library-outliners.js: addItems) ----

// The menu in the bar of Bulk edit, drawn once the list of outliners is there; choosing one shares them at once and
// says how it went. Hidden without outliners, or with the option hideShareToOutliner.
function showBulkShare() {
  const select = outlinerPart.shareSelect();
  select.addEventListener('change', () => shareTicked(select));
  $('bulkShare').replaceChildren(select);
}

async function shareTicked(select) {
  const items = pickedItems();
  const outliner = select.selectedOptions[0]?.textContent || '';
  if (!select.value || !items.length) return;
  select.disabled = true;
  showStatus(message('outlinersSaving'));
  const ok = await outlinerPart.addItems(select.value, items);
  select.disabled = false;
  select.value = '';
  if (ok) showStatus(message('bulkSharedToOutliner', [String(items.length), outliner]));
}

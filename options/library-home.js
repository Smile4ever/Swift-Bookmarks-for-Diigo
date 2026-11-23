// A part of the Swift Library (library.html); library.js has what they share, library-page.js puts them to work.

// ---- the start page: blocks instead of one long list ----

// Start (state.view home, the first of the side bar, and where the page opens) shows #home instead of the list:
// Recent (the newest), Recently shared (public), To read (unread), To read for a while (staleBlock), Random (with
// Other), On this day (saved on this day in years before, only when there are some; Yesterday and Tomorrow for
// another day), the trash (with Empty) and Clean
// up (dead links, sites that don't answer, duplicates, untagged, similar tags: how many, a click shows them). More of a block shows its whole list. A search, a tag, a site or Random goes from Start to the list
// (show). Never a bookmark with a hidden tag, nor what Diigo deletes in a moment (liveItems).
const HOME_ITEMS = 5;
const ON_THIS_DAY = 10;
let homeRandom = [];  // the ids Random shows here, kept while the page is open, till Other

// asked for a list: a search, filters above the list, Random
const listAsked = () => !!(state.random || state.query.trim() || state.tags.length || state.site || state.conditions.length);

const homeItems = () => liveItems().filter(item => !item.tags.some(hiddenTag));
const newestFirst = (a, b) => b.created - a.created;

// stale: a row of To read for a while (staleBlock), with Read; todo: one of To do (todoBlock), with its todo tags and
// Done; pinned: one of Pinned (pinnedBlock), with Unpin
function homeRow(item, {stale = false, todo = false, pinned = false} = {}) {
  const li = element('li', 'home-item');
  // to draw it anew in its place (library-list.js: redrawItems)
  li.dataset.id = item.id;
  li.redraw = changed => homeRow(changed, {stale, todo, pinned});
  const title = element('a', 'title', item.title || item.url);
  title.href = titleUrl(item);
  title.target = '_blank';
  title.rel = 'noopener noreferrer';
  if (item.unread) title.classList.add('unread');
  const icon = typeIcon(item);
  if (icon) title.prepend(icon);
  noteTitle(title, item, li);
  const meta = element('div', 'meta');
  const host = hostOf(item.url);
  if (host) meta.append(element('span', 'host', host));
  if (item.created) meta.append(element('span', 'date', dateFormat.format(item.created * 1000)));
  if (todo) meta.append(...todoTags(item).map(tag => element('span', 'todo-tag', tag)));
  meta.append(homeActions(item, li, {stale, todo, pinned}));
  // with deadLinks: the status code before the title, as in the list (library-links.js)
  if (checksLink(item)) {
    const line = element('div', 'title-line');
    line.append(linkStatus(item, title), title);
    li.append(line);
  } else {
    li.append(title);
  }
  // Pinned: a note with its text, its first lines as in the list (library-list.js: notePreview)
  const preview = pinned && isNoteWithText(item) ? safely('note', () => notePreview(item), null) : null;
  if (preview) li.append(preview);
  li.append(meta);
  return li;
}

// a note whose text is long: Pinned as wide as Start (pinnedBlock), so it isn't a narrow column
const NOTE_LONG_LINES = 3;
const NOTE_LONG_CHARACTERS = 300;
function longNote(item) {
  if (!isNoteWithText(item)) return false;
  const text = (item.rich || looksLikeHtml(item.content) ? noteCode(item.content) : String(item.content || '')).trim();
  return text.split('\n').length > NOTE_LONG_LINES || text.length > NOTE_LONG_CHARACTERS;
}

// Edit and Delete, as a bookmark of the list has them (itemElement), at the right when the row is pointed at; Start
// is drawn again after them (showEdited, deleteOne). In To read for a while (staleBlock) Read before them.
function homeActions(item, li, {stale = false, todo = false, pinned = false} = {}) {
  const actions = element('span', 'home-actions');
  if (stale) {
    const read = element('button', '', message('homeMarkRead'));
    read.type = 'button';
    read.addEventListener('click', () => markRead([item.id]));
    actions.append(read);
  }
  // To do: its todo tags away, so it's off the list
  if (todo) {
    const done = element('button', '', message('homeTodoDone'));
    done.type = 'button';
    done.title = message('homeTodoDoneTitle', todoTags(item).join(', '));
    done.addEventListener('click', () => homeEdit([item.id], {type: 'removeTags', tags: todoTags(item)}));
    actions.append(done);
  }
  // Pinned: the tag pinned away, so it's off Start
  if (pinned) {
    const unpin = element('button', '', message('homeUnpin'));
    unpin.type = 'button';
    unpin.title = message('homeUnpinTitle');
    unpin.addEventListener('click', () => homeEdit([item.id], {type: 'removeTags', tags: pinnedTags(item)}));
    actions.append(unpin);
  }
  // the same as in the list (library-list.js: editable, editButton, itemMenuButton)
  if (editable(item)) actions.append(editButton(item, li));
  actions.append(itemMenuButton(item));
  const remove = element('button', 'delete', message('libraryDelete'));
  remove.type = 'button';
  remove.addEventListener('click', () => deleteOne(item, li));
  actions.append(remove);
  return actions;
}

// a block: its name (and how many, when it says so), its rows or what else, and More
// (extra: a button of the block itself, before More, such as Empty for the trash)
function homeBlock(className, name, count, content, more, extra) {
  const block = element('section', 'home-block ' + className);
  const head = element('header');
  const h2 = element('h2', '', name);
  if (count != null) h2.append(element('span', 'count', String(count)));
  head.append(h2);
  if (extra) head.append(extra);
  if (more) {
    const link = element('button', 'more', message(more.label || 'homeMore'));
    link.type = 'button';
    link.addEventListener('click', more.click);
    head.append(link);
  }
  block.append(head, content);
  return block;
}

// More of a block: the list of view with the same ones at the top as in the block, and more after them; so as the
// block, newest first, and without the filters next to the order, which Start doesn't use
// (filters: those of the block itself, such as only public for Recently shared)
function moreOf(view, filters = {}) {
  Object.assign(state, {sort: 'newest', privacy: 'all', saved: 'any', links: 'any'}, filters);
  for (const id of ['sort', 'privacy', 'saved']) $(id).value = state[id];
  setView(view);
}

const rows = (items, options) => {
  const list = element('ul', 'home-items');
  list.append(...items.map(item => homeRow(item, options)));
  return list;
};

// To read for a while: unread for more than STALE_DAYS, so maybe never; some of them at random (homeStale, kept as
// Random's while the page is open), Read for each, All read for all of them (asks first), More the list of Unread
// with the oldest first
const STALE_DAYS = 90;
let homeStale = [];

function staleBlock(stale) {
  const known = new Set(stale.map(item => item.id));
  homeStale = homeStale.filter(id => known.has(id));
  if (homeStale.length < HOME_ITEMS) {
    const shownNow = new Set(homeStale);
    homeStale.push(...pickRandom(stale.filter(item => !shownNow.has(item.id)), HOME_ITEMS - homeStale.length)
      .map(item => item.id));
  }
  const content = rows(homeStale.map(id => index.get(id)).filter(Boolean), {stale: true});
  const all = element('button', 'all-read', message('homeAllRead'));
  all.type = 'button';
  all.addEventListener('click', () => {
    if (confirm(message('homeAllReadConfirm', String(stale.length)))) markRead(stale.map(item => item.id));
  });
  return homeBlock('stale', message('homeStale'), stale.length, content,
    {click: () => moreOf('unread', {sort: 'oldest'})}, all);
}

// To do: what has a tag that starts with todo (todo, todo-work, todo:read…), the oldest first, as those wait longest;
// Done for each, which takes those tags away (homeEdit); More the list of them all (the tag todo*, any tag that starts
// so: library-search.js: matches), the oldest first too. Its own block on Start, only when there are some.
// With todoRandom (options/settings.js), some of them at random instead, kept while the page is open (homeTodo, as
// Random's), one done replaced by another, and Others for others: with many, not always the same ones.
const TODO = 'todo';
const todoTags = item => item.tags.filter(tag => lower(tag).startsWith(TODO));
let homeTodo = [];  // the ids shown at random

function todoBlock(todo) {
  const more = {click: () => moreOf('all', {sort: 'oldest', conditions: [{field: 'tag', value: TODO + '*'}]})};
  if (!settings.todoRandom || todo.length <= HOME_ITEMS) {
    return homeBlock('todo', message('homeTodo'), todo.length, rows(todo.slice(0, HOME_ITEMS), {todo: true}), more);
  }
  const known = new Set(todo.map(item => item.id));
  homeTodo = homeTodo.filter(id => known.has(id));
  if (homeTodo.length < HOME_ITEMS) {
    const shownNow = new Set(homeTodo);
    homeTodo.push(...pickRandom(todo.filter(item => !shownNow.has(item.id)), HOME_ITEMS - homeTodo.length)
      .map(item => item.id));
  }
  const block = homeBlock('todo', message('homeTodo'), todo.length,
    rows(homeTodo.map(id => index.get(id)).filter(Boolean), {todo: true}), more);
  // Others: others at random, none of those shown while there are enough
  const other = element('button', 'more', message('homeOtherRandom'));
  other.type = 'button';
  other.addEventListener('click', () => {
    const shownNow = new Set(homeTodo);
    const others = todo.filter(item => !shownNow.has(item.id));
    homeTodo = pickRandom(others.length >= HOME_ITEMS ? others : [...todo], HOME_ITEMS).map(item => item.id);
    safely('start page', showHome);
  });
  block.querySelector('header').insertBefore(other, block.querySelector('header .more'));
  return block;
}

// The menu ⋯ of an item (in the list and on Start): Pin to Start or Unpin (the tag pinned), and Hide or Show (the first
// of your hidden tags, settings.js: hiddenTags; showing takes all of them away), in Diigo and in the index (homeEdit),
// so there is no need to type the tag. In the place of the menu of the archives (library-links.js: archiveMenu), as
// one menu at a time, closed the same way.
function itemMenuButton(item) {
  const button = element('button', 'item-menu', '⋯');
  button.type = 'button';
  button.title = message('itemMenu');
  button.setAttribute('aria-label', message('itemMenu'));
  button.setAttribute('aria-haspopup', 'true');
  button.addEventListener('click', e => {
    e.stopPropagation();
    if (archiveMenu?.owner == button) return closeArchiveMenu();
    closeArchiveMenu();
    archiveMenu = element('div', 'archive-menu');
    archiveMenu.owner = button;
    const choice = (key, change) => {
      const b = element('button', '', message(key));
      b.type = 'button';
      b.addEventListener('click', () => {
        closeArchiveMenu();
        homeEdit([item.id], change);
      });
      archiveMenu.append(b);
    };
    const pinned = pinnedTags(item);
    if (pinned.length) choice('homeUnpin', {type: 'removeTags', tags: pinned});
    else choice('itemPin', {type: 'addTags', tags: [PINNED]});
    const hidden = item.tags.filter(tag => settings.hiddenTags.some(other => lower(other) == lower(tag)));
    if (hidden.length) choice('itemUnhide', {type: 'removeTags', tags: hidden});
    else if (settings.hiddenTags.length) choice('itemHide', {type: 'addTags', tags: [settings.hiddenTags[0]]});
    // Delete screenshot: the screenshots of a bookmark (index-item.js: screenshotsOf), as Delete does it (to the trash,
    // so Put back brings them back); once they are gone, the link to them out of its description (library-index.js:
    // dropScreenshotLinks)
    const shots = item.type == 'bookmark' && !item.deletedAt
      ? screenshotsOf(item, liveItems()) : [];
    if (shots.length) {
      const b = element('button', 'danger', message('itemDeleteScreenshot'));
      b.type = 'button';
      b.addEventListener('click', () => {
        closeArchiveMenu();
        deleteScreenshots(item, shots);
      });
      archiveMenu.append(b);
    }
    const box = button.getBoundingClientRect();
    archiveMenu.style.left = Math.max(8, box.right + scrollX - 220) + 'px';
    archiveMenu.style.top = box.bottom + scrollY + 4 + 'px';
    document.body.append(archiveMenu);
  });
  return button;
}

// Pinned: what has the tag pinned, at the top of Start by default, the newest first, PINNED_ITEMS of them, each with
// Unpin, which takes the tag away; More the list of them all
const PINNED = 'pinned';
const PINNED_ITEMS = 10;
const pinnedTags = item => item.tags.filter(tag => lower(tag) == PINNED);

// with a long note in it, as wide as Start (longNote)
function pinnedBlock(pinned) {
  const shown = pinned.slice(0, PINNED_ITEMS);
  const block = homeBlock('pinned', message('homePinned'), pinned.length, rows(shown, {pinned: true}),
    {click: () => moreOf('all', {tags: [PINNED]})});
  block.classList.toggle('wide', shown.some(longNote));
  return block;
}

// A block of your own (homeLayout, own-…): what a search finds, as the search box (library-search.js: searchTest), the
// newest, oldest or last changed first, or some at random with Others (kept while the page is open, as Random's);
// More the list of them all. Only when it finds some, but while Start is customized.
const ownBlock = entry => typeof entry?.id == 'string' && entry.id.startsWith('own-');
const OWN_SORTS = ['newest', 'oldest', 'updated', 'random'];
const OWN_COUNTS = [3, 5, 10, 20];
const ownRandom = new Map();  // id -> the ids shown at random

const ownTitle = entry => entry.title?.trim() || conditionText({field: entry.field, value: entry.value});

// as the list does it (library-search.js: shownItems): one with a hidden tag only when that tag is asked for in full
function ownHomeBlock(entry, items) {
  const condition = {field: FIELDS.includes(entry.field) ? entry.field : 'all', value: String(entry.value || '')};
  if (!complete(condition)) return null;
  const asked = new Set(condition.field == 'all' || condition.field == 'tag'
    ? words(condition.value).filter(({not, word}) => !not && hiddenTag(word)).map(({word}) => word) : []);
  const pool = asked.size ? liveItems().filter(item => !item.tags.some(hiddenTag) ||
    item.tags.some(tag => asked.has(lower(tag)))) : items;
  const found = pool.filter(searchTest(condition));
  if (!found.length) return null;
  const count = OWN_COUNTS.includes(entry.count) ? entry.count : HOME_ITEMS;
  const random = entry.sort == 'random' && found.length > count;
  let picked;
  if (random) {
    const known = new Set(found.map(item => item.id));
    const kept = (ownRandom.get(entry.id) || []).filter(id => known.has(id));
    const shownNow = new Set(kept);
    kept.push(...pickRandom(found.filter(item => !shownNow.has(item.id)), count - kept.length).map(item => item.id));
    ownRandom.set(entry.id, kept.slice(0, count));
    picked = ownRandom.get(entry.id).map(id => index.get(id)).filter(Boolean);
  } else {
    picked = [...found].sort(SORTS[entry.sort] || SORTS.newest).slice(0, count);
  }
  const sort = entry.sort in SORTS ? entry.sort : 'newest';
  const block = homeBlock('own', ownTitle(entry), found.length, rows(picked),
    {click: () => moreOf('all', {sort, conditions: [condition]})});
  if (random) {
    const other = element('button', 'more', message('homeOtherRandom'));
    other.type = 'button';
    other.addEventListener('click', () => {
      const shownNow = new Set(ownRandom.get(entry.id));
      const others = found.filter(item => !shownNow.has(item.id));
      ownRandom.set(entry.id, pickRandom(others.length >= count ? others : [...found], count).map(item => item.id));
      safely('start page', showHome);
    });
    block.querySelector('header').insertBefore(other, block.querySelector('header .more'));
  }
  return block;
}

// a change of Start (read, or todo tags away), in Diigo and in the index, as Bulk edit does it; Start again after
const markRead = ids => homeEdit(ids, {type: 'read'});

async function homeEdit(ids, change) {
  if (controller || !ids.length) return;
  const signal = start();
  let result = {changed: 0, failed: 0};
  try {
    result = await editItems(ids, change, signal,
      (done, total) => total > 1 && showStatus(message('bulkProgress', [String(done), String(total)])));
  } catch (e) {
    reportProblem(e, 'start');
  } finally {
    stop();
    const why = message('bulkFailed', String(result.failed)) + (diigoAnswer ? ' ' + diigoAnswer : '');
    showStatus(result.failed ? why : ids.length > 1 ? message('bulkDone', String(result.changed)) : '', !!result.failed);
    show({keepScroll: true});
  }
}

function randomBlock(items) {
  // one that is gone (deleted) replaced by another, the others where they are
  const known = new Set(items.map(item => item.id));
  homeRandom = homeRandom.filter(id => known.has(id));
  if (homeRandom.length < HOME_ITEMS) {
    const shownNow = new Set(homeRandom);
    const others = randomPool().filter(item => !shownNow.has(item.id));
    homeRandom.push(...pickRandom(others, HOME_ITEMS - homeRandom.length).map(item => item.id));
  }
  const content = rows(homeRandom.map(id => index.get(id)).filter(Boolean));
  // More: Random with these at the top, and others after them to RANDOM_COUNT
  const more = () => {
    state.random = homeRandom.join(',');
    state.view = 'all';
    show({push: true});
  };
  const block = homeBlock('random', message('libraryRandom'), null, content, {click: more});
  const other = element('button', 'more', message('homeOtherRandom'));
  other.type = 'button';
  other.addEventListener('click', () => {
    const shownNow = new Set(homeRandom);
    const others = randomPool().filter(item => !shownNow.has(item.id));
    homeRandom = pickRandom(others.length >= HOME_ITEMS ? others : randomPool(), HOME_ITEMS).map(item => item.id);
    safely('start page', showHome);
  });
  block.querySelector('header').insertBefore(other, block.querySelector('header .more'));
  return block;
}

// On this day: the day it shows, as days from today (Yesterday -1, Tomorrow +1), kept while the page is open
let homeDay = 0;

const dayShown = () => {
  const day = new Date();
  day.setDate(day.getDate() + homeDay);
  return day;
};

// saved on that day (month and day) in a year before the year of that day, the most recent first
function onThisDay(items) {
  const day = dayShown();
  return items.filter(item => {
    const saved = new Date(item.created * 1000);
    return item.created && saved.getDate() == day.getDate() && saved.getMonth() == day.getMonth() &&
      saved.getFullYear() < day.getFullYear();
  }).sort(newestFirst);
}

// the block: On this day for today, else On (the day and month); Yesterday and Tomorrow (Previous day and Next day
// when it shows another day) go a day back and forward from the day it shows, Today back to today
function dayBlock(day) {
  const name = homeDay ? message('homeOnDay', new Intl.DateTimeFormat(undefined, {day: 'numeric', month: 'long'})
    .format(dayShown())) : message('homeOnThisDay');
  const content = rows(day.slice(0, ON_THIS_DAY));
  if (!day.length) content.append(element('li', 'nothing', message('homeNothingOnDay')));
  const go = (label, change) => {
    const button = element('button', 'more', message(label));
    button.type = 'button';
    button.addEventListener('click', () => {
      homeDay = change(homeDay);
      safely('start page', showHome);
    });
    return button;
  };
  const block = homeBlock('day', name, day.length || null, content);
  const head = block.querySelector('header');
  // from today Yesterday and Tomorrow; from another day they would say the wrong day, so Previous day and Next day
  head.append(go(homeDay ? 'homePreviousDay' : 'homeYesterday', n => n - 1));
  if (homeDay) head.append(go('homeToday', () => 0));
  head.append(go(homeDay ? 'homeNextDay' : 'homeTomorrow', n => n + 1));
  return block;
}

// Clean up: a row for each kind of which there are some, with how many; a click shows them
function cleanupBlock(items) {
  const list = element('ul', 'home-cleanup');
  // extra: a button of the row itself, after it (All to the new address for Moved)
  const row = (label, count, click, className = '', extra = null) => {
    if (!count) return;
    const li = element('li');
    const button = element('button', className, label);
    button.type = 'button';
    button.append(element('span', 'count', String(count)));
    button.addEventListener('click', click);
    li.append(button);
    if (extra) {
      li.classList.add('with-extra');
      li.append(extra);
    }
    list.append(li);
  };
  // a filter above the list (showFilters), with what the background script found since the page started too
  const byLinks = links => async () => {
    state.links = links;
    await loadLinkStates();
    setView('all');
  };
  if (settings.deadLinks) {
    // Dead links in one row, as in the side bar: the pages that are gone and the sites that don't answer; a click is
    // that view itself (library-side.js: setView, VIEWS.dead)
    row(VIEWS.dead.label, items.filter(VIEWS.dead.test).length, () => setView('dead'), 'dead');
    // moved for good: the list of them, with their new web address under each, to give it to those you choose
    // (library-links.js: useNewUrls; Bulk edit, or the menu of the code of one); not all at once from here, as a new
    // address can be a page of another kind (a sign-in, a home page in another language)
    const moved = items.filter(item => linkCategory(item) == 'moved');
    row(message('libraryLinksMoved'), moved.length, byLinks('moved'), 'moved');
  }
  row(message('libraryDuplicates'), items.filter(item => duplicateKeys().has(item.id)).length, () => setView('duplicates'));
  row(VIEWS.untagged.label, items.filter(item => !item.tags.length).length, () => setView('untagged'));
  // without a real title (library-edit.js: untitled), with Fetch titles for all of them
  const notitle = items.filter(untitled);
  const fetch = element('button', 'all-moved', message('libraryFetchTitles'));
  fetch.type = 'button';
  fetch.addEventListener('click', () => fetchTitles(notitle));
  row(message('libraryNoTitle'), notitle.length, () => setView('notitle'), '', fetch);
  // groups of tags that are nearly the same (library-tags.js)
  row(message('similarTags'), similarTags().length, showSimilarTags);
  if (!list.children.length) list.append(element('li', 'nothing', message('homeNothingToClean')));
  return homeBlock('cleanup', message('homeCleanup'), null, list);
}

// The trash: those deleted last, what Diigo hasn't deleted yet first (pendingTrash, library-delete.js), when they
// were deleted, and Put back as in the trash itself (trashActions; cancelDelete for one not deleted yet); Empty in the
// header (emptyTrash, which asks first). Start is drawn again after (leaveList, show).
function trashRow(item) {
  const li = element('li', 'home-item');
  const title = element('a', 'title', item.title || item.url);
  if (item.url) title.href = item.url;
  title.target = '_blank';
  title.rel = 'noopener noreferrer';
  const meta = element('div', 'meta');
  if (item.pendingDelete) meta.append(element('span', 'flag pending', message('libraryNotDeletedYet')));
  else meta.append(element('span', 'date', message(item.goneFromDiigo ? 'libraryGoneOn' : 'libraryDeletedOn',
    dateFormat.format(item.deletedAt))));
  const actions = element('span', 'home-actions');
  if (item.pendingDelete) {
    const restore = element('button', '', message('libraryRestore'));
    restore.type = 'button';
    restore.addEventListener('click', () => cancelDelete(item, li));
    actions.append(restore);
  } else {
    actions.append(trashActions(item, li)[0]);
  }
  meta.append(actions);
  li.append(title, meta);
  return li;
}

function trashBlock() {
  const items = [...pendingTrash(), ...[...trash.values()].sort((a, b) => b.deletedAt - a.deletedAt)];
  const list = element('ul', 'home-items');
  list.append(...items.slice(0, HOME_ITEMS).map(trashRow));
  const empty = element('button', 'empty', message('homeEmptyTrash'));
  empty.type = 'button';
  empty.disabled = emptying;
  empty.addEventListener('click', emptyTrash);
  return homeBlock('trash', message('libraryTrash'), items.length, list, {click: () => setView('trash')}, empty);
}

// Start as you made it (settings.js: homeLayout): the blocks you keep, in your order; one that has nothing now isn't
// there (but while customizing). A block of the add-on that is newer than what you saved comes at the end.
function homeLayout() {
  const saved = (Array.isArray(settings.homeLayout) ? settings.homeLayout : [])
    .filter(entry => HOME_BLOCKS.includes(entry?.id) || ownBlock(entry));
  return [...saved, ...HOME_BLOCKS.filter(id => !saved.some(entry => entry.id == id)).map(id => ({id, shown: true}))];
}

// the names of the blocks of the add-on, for customizing (a block that has nothing now shows by its name only)
const HOME_BLOCK_NAMES = {pinned: 'homePinned', recent: 'homeRecent', changed: 'homeChanged', shared: 'homeShared', unread: 'homeUnread',
  stale: 'homeStale', todo: 'homeTodo', random: 'libraryRandom', day: 'homeOnThisDay', trash: 'libraryTrash',
  cleanup: 'homeCleanup'};

function showHome() {
  const items = homeItems();
  const unread = items.filter(item => item.unread).sort(newestFirst);
  // each block of the add-on, or null when it has nothing now
  const blocks = {
    pinned: () => {
      const pinned = items.filter(item => pinnedTags(item).length).sort(newestFirst);
      return pinned.length ? pinnedBlock(pinned) : null;
    },
    recent: () => homeBlock('recent', message('homeRecent'), null, rows([...items].sort(newestFirst).slice(0, HOME_ITEMS)),
      {click: () => moreOf('all')}),
    // Recently changed: changed after it was saved (its title, web address, tags…), here or elsewhere, the last
    // changed first; a minute after saving doesn't count, as Diigo may change it once itself then
    changed: () => {
      const changed = items.filter(item => item.updated > item.created + 60).sort((a, b) => b.updated - a.updated);
      return changed.length ? homeBlock('changed', message('homeChanged'), null, rows(changed.slice(0, HOME_ITEMS)),
        {click: () => moreOf('all', {sort: 'updated'})}) : null;
    },
    // Recently shared: public ones, which others can see on Diigo (not to which group or outliner: the index doesn't
    // know)
    shared: () => {
      const shared = items.filter(item => !item.private).sort(newestFirst);
      return shared.length ? homeBlock('shared', message('homeShared'), null, rows(shared.slice(0, HOME_ITEMS)),
        {click: () => moreOf('all', {privacy: 'public'})}) : null;
    },
    unread: () => unread.length ? homeBlock('unread', message('homeUnread'), unread.length,
      rows(unread.slice(0, HOME_ITEMS)), {click: () => moreOf('unread')}) : null,
    stale: () => {
      const stale = unread.filter(item => item.created && age(item) > STALE_DAYS);
      return stale.length ? staleBlock(stale) : null;
    },
    todo: () => {
      const todo = items.filter(item => todoTags(item).length).sort((a, b) => a.created - b.created);
      return todo.length ? todoBlock(todo) : null;
    },
    random: () => randomPool().length ? randomBlock(items) : null,
    // only when there are some, or when it shows another day than today (Yesterday, Tomorrow)
    day: () => {
      const day = onThisDay(items);
      return day.length || homeDay ? dayBlock(day) : null;
    },
    trash: () => totalOf('trash') ? trashBlock() : null,
    cleanup: () => cleanupBlock(items),
  };
  const shown = [];
  homeLayout().forEach((entry, i, layout) => {
    if (!homeEditing && !entry.shown) return;
    const build = ownBlock(entry) ? () => ownHomeBlock(entry, items) : blocks[entry.id];
    const block = safely('start: ' + entry.id, build, null);
    if (homeEditing) shown.push(editableBlock(entry, block, i, layout));
    else if (block) shown.push(block);
  });
  // how many items the Diigo library has: in the bar below the blue one (library.js: showTotal), not here
  $('home').replaceChildren(homeToolbar(), ...shown);
}


// ---- customizing Start: the blocks moved, hidden or shown, blocks of your own added, changed or removed ----

let homeEditing = false;

// Customize Start, or while customizing: Add a block, Default blocks (after asking) and Done
function homeToolbar() {
  const bar = element('div', 'home-toolbar');
  const button = (key, run, className = '') => {
    const b = element('button', className, message(key));
    b.type = 'button';
    b.addEventListener('click', run);
    return b;
  };
  if (!homeEditing) {
    bar.append(button('homeEditStart', () => {
      homeEditing = true;
      showHome();
    }, 'edit-start'));
    return bar;
  }
  bar.classList.add('editing');
  bar.append(element('span', 'home-editing-intro', message('homeEditIntro')),
    button('homeAddBlock', () => editOwnBlock()),
    button('homeResetLayout', () => {
      if (confirm(message('homeResetConfirm'))) saveLayout(HOME_BLOCKS.map(id => ({id, shown: true})));
    }),
    button('homeTodoDone', () => {
      homeEditing = false;
      showHome();
    }, 'primary'));
  return bar;
}

// Start as it is now, kept (and synced, settings.js) and drawn again
function saveLayout(layout) {
  settings = {...settings, homeLayout: layout};
  saveSettings({homeLayout: layout}).catch(e => reportProblem(e, 'start'));
  safely('start page', showHome);
}

// a block while customizing: up, down, hide or show, and for one of your own edit and remove; one that has nothing now
// by its name; a hidden one faint
function editableBlock(entry, block, i, layout) {
  const name = ownBlock(entry) ? ownTitle(entry) : message(HOME_BLOCK_NAMES[entry.id]);
  block ||= homeBlock('placeholder', name, null, element('p', 'home-empty', message('homeBlockEmpty')));
  block.classList.add('customizing');
  block.classList.toggle('left-out', !entry.shown);
  const tools = element('span', 'block-tools');
  const tool = (text, key, run, disabled = false) => {
    const b = element('button', '', text);
    b.type = 'button';
    b.title = message(key);
    b.setAttribute('aria-label', message(key) + ': ' + name);
    b.disabled = disabled;
    b.addEventListener('click', run);
    tools.append(b);
  };
  const move = by => {
    const moved = [...layout];
    moved.splice(i + by, 0, ...moved.splice(i, 1));
    saveLayout(moved);
  };
  tool('↑', 'homeBlockUp', () => move(-1), i == 0);
  tool('↓', 'homeBlockDown', () => move(1), i == layout.length - 1);
  tool(entry.shown ? '◉' : '○', entry.shown ? 'homeBlockHide' : 'homeBlockShow',
    () => saveLayout(layout.map(other => other == entry ? {...other, shown: !other.shown} : other)));
  if (ownBlock(entry)) {
    tool('✎', 'libraryEdit', () => editOwnBlock(entry));
    tool('✕', 'libraryDelete', () => {
      if (confirm(message('homeBlockRemoveConfirm', name))) saveLayout(layout.filter(other => other != entry));
    });
  }
  block.querySelector('header').prepend(tools);
  return block;
}

// A block of your own, new or changed, in the popup: its name, what it shows (a search as in the search box, in a
// field), in which order and how many
function editOwnBlock(entry = null) {
  const {card, fields, error, shut} = popupCard(entry ? 'homeBlockChange' : 'homeAddBlock', entry ? 'save' : 'libraryAdd');
  const title = Object.assign(element('input'), {type: 'text', value: entry?.title || '', spellcheck: false});
  const value = Object.assign(element('input'), {type: 'text', value: entry?.value || '', spellcheck: false});
  const select = (label, options, chosen) => {
    const s = element('select');
    s.setAttribute('aria-label', message(label));
    s.append(...options.map(([value, text]) => new Option(text, value)));
    s.value = String(chosen);
    return s;
  };
  const field = select('homeBlockSearch', FIELDS.map(field =>
    [field, field == 'all' ? message('libraryAllFields') : message('searchField' + capitalized(field))]), entry?.field || 'tag');
  const sort = select('librarySort', OWN_SORTS.map(sort =>
    [sort, sort == 'random' ? message('libraryRandom') : message('librarySort' + capitalized(sort))]), entry?.sort || 'newest');
  const count = select('homeBlockCount', OWN_COUNTS.map(n => [n, message('homeBlockCountOf', String(n))]),
    entry?.count || HOME_ITEMS);
  const choices = element('div', 'share');
  choices.append(field, sort, count);
  fields.append(cardField('homeBlockName', title), cardField('homeBlockSearch', value),
    element('p', 'card-hint', message('homeBlockSearchHint')), choices);
  card.addEventListener('submit', e => {
    e.preventDefault();
    const condition = {field: field.value, value: value.value.trim()};
    if (!complete(condition)) {
      error.textContent = message('homeBlockNeedsSearch');
      error.hidden = false;
      return value.focus();
    }
    const changed = {id: entry?.id || 'own-' + Date.now(), title: title.value.trim(), ...condition,
      sort: sort.value, count: Number(count.value), shown: entry?.shown ?? true};
    const layout = homeLayout();
    saveLayout(entry ? layout.map(other => other.id == entry.id ? changed : other) : [changed, ...layout]);
    shut();
  });
  (entry ? value : title).focus();
}

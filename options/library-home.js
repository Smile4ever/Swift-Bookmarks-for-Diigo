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

// stale: a row of To read for a while (staleBlock), with Read
function homeRow(item, {stale = false} = {}) {
  const li = element('li', 'home-item');
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
  meta.append(homeActions(item, li, stale));
  // with deadLinks: the status code before the title, as in the list (library-links.js)
  if (checksLink(item)) {
    const line = element('div', 'title-line');
    line.append(linkStatus(item, title), title);
    li.append(line, meta);
  } else {
    li.append(title, meta);
  }
  return li;
}

// Edit and Delete, as a bookmark of the list has them (itemElement), at the right when the row is pointed at; Start
// is drawn again after them (showEdited, deleteOne). In To read for a while (staleBlock) Read before them.
function homeActions(item, li, stale) {
  const actions = element('span', 'home-actions');
  if (stale) {
    const read = element('button', '', message('homeMarkRead'));
    read.type = 'button';
    read.addEventListener('click', () => markRead([item.id]));
    actions.append(read);
  }
  // the same as in the list (library-list.js: editable, editButton)
  if (editable(item)) actions.append(editButton(item, li));
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

// read, in Diigo and in the index, as Bulk edit does it; Start again after
async function markRead(ids) {
  if (controller || !ids.length) return;
  const signal = start();
  let result = {changed: 0, failed: 0};
  try {
    result = await editItems(ids, {type: 'read'}, signal,
      (done, total) => total > 1 && showStatus(message('bulkProgress', [String(done), String(total)])));
  } catch (e) {
    reportProblem(e, 'read');
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
    state.hunt = false;
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
    // moved for good (library-links.js: useNewUrls), all of them at once after asking
    const moved = items.filter(item => linkCategory(item) == 'moved');
    const all = element('button', 'all-moved', message('linkUseNewUrlAll'));
    all.type = 'button';
    all.addEventListener('click', () => confirm(message('linkUseNewUrlConfirm', String(moved.length))) && useNewUrls(moved));
    row(message('libraryLinksMoved'), moved.length, byLinks('moved'), 'moved', all);
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
  else meta.append(element('span', 'date', message('libraryDeletedOn', dateFormat.format(item.deletedAt))));
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

function showHome() {
  const items = homeItems();
  const blocks = [];
  blocks.push(homeBlock('recent', message('homeRecent'), null, rows([...items].sort(newestFirst).slice(0, HOME_ITEMS)),
    {click: () => moreOf('all')}));
  // Recently shared: public ones, which others can see on Diigo (not to which group or outliner: the index doesn't know)
  const shared = items.filter(item => !item.private).sort(newestFirst);
  if (shared.length) {
    blocks.push(homeBlock('shared', message('homeShared'), null, rows(shared.slice(0, HOME_ITEMS)),
      {click: () => moreOf('all', {privacy: 'public'})}));
  }
  const unread = items.filter(item => item.unread).sort(newestFirst);
  if (unread.length) {
    blocks.push(homeBlock('unread', message('homeUnread'), unread.length, rows(unread.slice(0, HOME_ITEMS)),
      {click: () => moreOf('unread')}));
  }
  const stale = unread.filter(item => item.created && age(item) > STALE_DAYS);
  if (stale.length) blocks.push(staleBlock(stale));
  if (randomPool().length) blocks.push(randomBlock(items));
  // only when there are some, or when it shows another day than today (Yesterday, Tomorrow)
  const day = onThisDay(items);
  if (day.length || homeDay) blocks.push(dayBlock(day));
  if (totalOf('trash')) blocks.push(trashBlock());
  blocks.push(cleanupBlock(items));
  // how many items the Diigo library has: in the bar below the blue one (library.js: showTotal), not here
  $('home').replaceChildren(...blocks);
}

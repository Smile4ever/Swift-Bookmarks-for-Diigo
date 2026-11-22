// A part of the Swift Library (library.html); library.js has what they share, library-page.js puts them to work.

// ---- the list ----

let shown = [];   // what matches, in order
let listed = 0;   // how many of them are in the list

// the index as the page shows it: without what Diigo deletes in a moment (library-delete.js), which is in the trash
// already; for the list, the counts, the side bar, Duplicates and Random alike
const liveItems = () => pending.size ? [...index.values()].filter(item => !pending.has(item.id)) : [...index.values()];

// the trash (with what Diigo deletes in a moment), or the index
const itemsOf = view => view == 'trash' ? [...pendingTrash(), ...trash.values()] : liveItems();
const totalOf = view => view == 'trash' ? pendingTrash().length + trash.size : liveItems().length;

// how many are shown, of how many; with nothing there at all (an empty trash) only that: 0 items, not that nothing
// matches
function showCount() {
  const total = totalOf(state.view);
  $('count').textContent = !total ? message('libraryNoItems')
    : message(shown.length ? 'libraryCount' : 'searchNone', [String(shown.length), String(total)]);
  // after Show hidden: how many with a hidden tag match (library-search.js: shownItems), shown or not
  $('hiddenCount').hidden = !hiddenCount;
  $('hiddenCount').textContent = String(hiddenCount);
}

// the tags hidden along with the hidden ones (settings.js: alsoHiddenTags), from the index as it is now, kept for the
// form, diigo.com and the background script when they changed
function updateAlsoHidden() {
  if (meta?.user != user) return;
  const found = alsoHiddenOf(index.values(), settings.hiddenTags);
  if (JSON.stringify(found) == JSON.stringify(settings.alsoHiddenTags || [])) return;
  settings = {...settings, alsoHiddenTags: found};
  browser.storage.local.set({alsoHiddenTags: found}).catch(() => {});
}

function show({keepScroll = false, push = false} = {}) {
  // from Start to the list when one is asked for (library-home.js)
  if (state.view == 'home' && listAsked()) state.view = 'all';
  const home = state.view == 'home';
  // Outliners: theirs in the place of the list (library-outliners.js), as Start has its blocks
  const outlining = state.view == 'outliners';
  // Random: again as many as it shows, when one was deleted (library-search.js)
  safely('random', fillRandom);
  safely('address', () => saveState(push));
  safely('hidden tags', updateAlsoHidden);
  // when the search itself fails, all of the index, as it is
  // Start: no list, its blocks instead
  // Start and Outliners: no list, so none hidden in it either (showCount)
  if (home || outlining) hiddenCount = 0;
  shown = home || outlining ? [] : safely('search', shownItems, null) ?? itemsOf(state.view);
  $('list').classList.toggle('home-mode', home);
  $('list').classList.toggle('outliners-mode', outlining);
  if (home) safely('start page', showHome);
  if (outlining) safely('outliners', outlinerPart.render);
  // what is about to be deleted is in the trash already (library-delete.js)
  if (pending.size && state.view != 'trash') shown = shown.filter(item => !pending.has(item.id));
  safely('search box', showPin);
  safely('bulk edit', showBulk);
  safely('trash', () => $('trashBar').hidden = state.view != 'trash');
  // privacy, when saved and the status of links: not for the trash
  safely('filters', () => {
    $('privacy').hidden = $('saved').hidden = state.view == 'trash' || home || outlining;
    // the search box finds outliners by their name: no field, order or + for them
    $('field').hidden = $('sort').hidden = $('pin').hidden = outlining;
  });
  safely('duplicates', () => $('duplicatesBar').hidden = state.view != 'duplicates');
  safely('titles', () => $('notitleBar').hidden = state.view != 'notitle');
  safely('dead links', showDeadBar);
  safely('random', () => {
    $('randomBar').hidden = !state.random;
  });
  if (state.view == 'trash') safely('trash size', showTrashSize);
  // out of the trash: the message of Empty closed (library-trash.js)
  safely('trash', leftTrash);
  // keepScroll: drawn again as far as it was, not only the first LIST_STEP, else the page gets shorter under where you
  // are and the browser jumps to another place (after a delete, Undo, Bulk edit, a change from elsewhere)
  const keep = keepScroll ? listed : 0;
  listed = 0;
  closeArchiveMenu();
  safely('list', () => {
    $('items').replaceChildren();
    do listMore(); while (listed < keep && listed < shown.length);
  });
  if (!keepScroll) safely('scroll', () => scrollTo(0, 0));
  safely('count', showCount);
  safely('total', showTotal);
  safely('filters', showFilters);
  safely('side bar', showTags);
  safely('title', showTitle);
}

// The title of the tab: what is open (the view, Random, and what is searched for before it), and the name of the
// add-on, so tabs of the Swift Library tell apart
function showTitle() {
  if (state.view == 'outliners') return document.title = outlinerPart.title() + TITLE_SUFFIX;
  const view = state.random ? message('libraryRandom') : VIEWS[state.view].label;
  const asked = state.random ? [] : [searched(), ...state.conditions].filter(complete).map(conditionText)
    .concat(state.tags, state.site ? [state.site] : []);
  document.title = (asked.length ? asked.join(', ') + ' · ' : '') + view + TITLE_SUFFIX;
}

// a bookmark that can't be drawn as it should: its title (or URL) as a link, so it's still there
// The rows of these items drawn anew, each in its place (in the list and on Start, where one can be in several
// blocks), the rest of the page as it is; not one being edited in the row itself. id: the id they had, when it changed
// (another web address can give another link_id).
function redrawItems(items, id = '') {
  for (const item of items) {
    const ids = new Set([item.id, id].filter(Boolean));
    for (const old of ids) {
      for (const li of $('list').querySelectorAll(`li[data-id="${CSS.escape(String(old))}"]`)) {
        if (li.redraw && !li.querySelector('form.edit')) li.replaceWith(li.redraw(item));
      }
    }
  }
}

// whether an item is in the same blocks of Start after a change (library-home.js): read, private, its tags (hidden
// ones), when it was saved and what kind it is
const sameBlocks = (a, b) => !!a && !!b && ['unread', 'private', 'created', 'type'].every(key => a[key] == b[key]) &&
  JSON.stringify(a.tags) == JSON.stringify(b.tags);

// The index read again (library-page.js: readIndexAgain); before and trashBefore as they were. What didn't change stays
// the same object, so the rows drawn keep theirs, and only the rows of what did change are drawn anew, in their place:
// after an edit (here, on diigo.com, with the bookmark form) the list doesn't jump. The answer is whether that was
// enough; else (items added or gone, the trash changed, a change that moves one to other blocks on Start, Outliners)
// show() draws it all again.
function redrawChanged(before, trashBefore) {
  const sameIds = (a, b) => a.size == b.size && [...a.keys()].every(id => b.has(id));
  const changed = [];
  for (const [id, item] of index) {
    const old = before.get(id);
    if (old && JSON.stringify(old) == JSON.stringify(item)) index.set(id, old);
    else changed.push(item);
  }
  if (!sameIds(index, before) || state.view == 'outliners') return false;
  const trashSame = sameIds(trash, trashBefore) &&
    [...trash].every(([id, item]) => JSON.stringify(item) == JSON.stringify(trashBefore.get(id)));
  if (!trashSame) return false;
  trash = trashBefore;
  if (state.view == 'home' && changed.some(item => !sameBlocks(item, before.get(item.id)))) return false;
  if (!changed.length) return true;
  shown = shown.map(item => index.get(item.id) || item);
  redrawItems(changed);
  safely('count', showCount);
  safely('side bar', showTags);
  return true;
}

// One more that matches what is shown (a dead link found in Dead links, library-links.js: checkLinks): at
// the end of the list, without drawing it again, so what you point at or click on stays where it is. Only when the
// list is drawn to its end; else it comes when you scroll there (listMore).
function appendShown(item) {
  // one with a hidden tag isn't shown, but counted after Show hidden (showCount)
  if (shown.includes(item) || !shownItems().includes(item) || pending.has(item.id)) return showCount();
  shown.push(item);
  if (listed == shown.length - 1) {
    $('items').append(itemElement(item));
    listed++;
  }
  showCount();
}

function plainItem(item) {
  const li = element('li', 'item');
  const link = element('a', 'title', text(item?.title) || text(item?.url) || text(item?.id));
  link.href = text(item?.url);
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  li.append(link);
  return li;
}

function listMore() {
  const items = shown.slice(listed, listed + LIST_STEP)
    .map(item => [item, safely('bookmark ' + text(item?.id), () => itemElement(item), null) ?? plainItem(item)]);
  if (state.view == 'duplicates') appendDuplicates(items);
  else $('items').append(...items.map(([, li]) => li));
  listed = Math.min(shown.length, listed + LIST_STEP);
}

// Duplicates: those of one web address side by side, as a row of their own (.dup-group), two in a row; a group the
// step before ended in goes on
function appendDuplicates(items) {
  const keys = duplicateKeys();
  for (const [item, li] of items) {
    const key = keys.get(item?.id) || String(item?.id);
    let group = $('items').lastElementChild;
    if (group?.dataset.key != key) {
      group = element('li', 'dup-group');
      group.dataset.key = key;
      group.append(element('ol', 'dup-items'));
      $('items').append(group);
    }
    group.firstChild.append(li);
  }
}

// the next ones once the end of the list comes into view
new IntersectionObserver(entries => {
  if (entries.some(entry => entry.isIntersecting) && listed < shown.length) listMore();
}, {rootMargin: '600px'}).observe($('more'));

const dateFormat = new Intl.DateTimeFormat(browser.i18n.getUILanguage(), {dateStyle: 'medium'});

function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}

// The item on Diigo, as Diigo's own library opens every item (/user/<name>/b/<link_id>)
const diigoItemUrl = item => `https://www.diigo.com/user/${encodeURIComponent(user)}/b/${item.id}`;

// Where the title leads: a bookmark to its page; a note, image, PDF or Kindle item to itself on Diigo, as its url is
// not where you read it (for a note it can be a link of Diigo's own, /item/note/…). One in the trash to its url, as it
// is gone from Diigo.
const titleUrl = item => item.deletedAt || item.pendingDelete || (!item.type || item.type == 'bookmark') && item.url
  ? item.url : diigoItemUrl(item);

// A note whose text the index has opens here, to read (library-edit.js: viewNote), and so does an image (viewImage),
// also from the trash; with Ctrl, Shift, Alt or Cmd, or the middle button, the link as it is: on Diigo.
function noteTitle(title, item, li) {
  const view = item.type == 'note' && 'content' in item ? viewNote : item.type == 'image' ? viewImage : null;
  if (!view) return;
  title.addEventListener('click', e => {
    if (e.button || e.ctrlKey || e.shiftKey || e.altKey || e.metaKey || $('popup').open) return;
    e.preventDefault();
    view(item, li);
  });
}

// The thumbnail of an image, as Diigo's library shows one (thumbnail_url, at the size of its list: image_size=160),
// at the left of the item, before its title; a click shows the image here (viewImage). Where Diigo wants your sign-in
// for it, fetched with it, as the image itself is.
const THUMB_SIZE = 160;

// The screenshot of a bookmark with a picture (thumb), the newest; as index-item.js: screenshotsOf finds them, but from
// a map worked out again only when the index changed (indexVersion), as the list asks it for each bookmark it draws
let screenshotMap = {version: -1, byUrl: new Map()};

function screenshotFor(item) {
  // not one deleted in a moment (library-delete.js: pending)
  const version = indexVersion + '/' + pendingVersion;
  if (screenshotMap.version != version) {
    const byUrl = new Map();
    for (const shot of liveItems()) {
      if (shot.type != 'image' || !shot.thumb || !shot.tags.some(tag => lower(tag) == SCREENSHOT_TAG)) continue;
      for (const line of String(shot.description || '').split('\n').map(line => line.trim())) {
        if (/^https?:\/\//.test(line) && !(byUrl.get(line)?.created > shot.created)) byUrl.set(line, shot);
      }
    }
    screenshotMap = {version, byUrl};
  }
  // or one its description links to (index-item.js: screenshotLinks): by its own web address on Diigo, or its link_id
  if (screenshotMap.byUrl.has(item.url)) return screenshotMap.byUrl.get(item.url);
  if (!/https?:\/\//.test(item.description || '')) return null;
  const {urls, ids} = screenshotLinks(item);
  return [...ids].filter(id => !pending.has(id)).map(id => index.get(id)).find(shot => shot?.thumb) ||
    screenshotsOf(item, liveItems()).filter(shot => shot.thumb && urls.has(shot.url))
      .sort((a, b) => b.created - a.created)[0] || null;
}

// The preview image of the page of a bookmark (previewThumbs), as social sites show it when you share a link (og:image),
// or its icon when it has none: as found before (previews, the store previews of the database of the index), else
// asked of the background script (background.js: pagePreview), which reads it from the page once, with the check of
// its link, and keeps it; put before the bookmark once it comes, when it is still in the list. A click opens the page.
let previews = new Map();  // url -> {image, icon}

async function loadPreviews() {
  try {
    const kept = db ? await done(db.transaction('previews').objectStore('previews').getAll()) : [];
    previews = new Map(kept.map(entry => [entry.url, {image: entry.image, icon: entry.icon}]));
  } catch (e) {
    // an index of before the store previews: none yet
  }
}

// the picture, or its room while it comes, which it takes when it does (in the list still); none: the room stays
function previewThumb(item) {
  const picture = found => found.image || found.icon ? previewElement(item, found) : null;
  const known = previews.get(item.url);
  if (known) return picture(known) || placeholderElement(item);
  const room = placeholderElement(item);
  browser.runtime.sendMessage({type: 'preview', url: item.url}).then(found => {
    if (!found) return;
    previews.set(item.url, found);
    const shown = picture(found);
    if (shown && room.isConnected) room.replaceWith(shown);
  }).catch(() => {});
  return room;
}

// The room of a small picture, so each item of the list starts at the same place, also without one (none found, not
// loaded, a note): as large as a picture, with the first letter of its site (or of its title) in it. Only while the
// list has small pictures (previewThumbs, screenshotThumbs).
const thumbRoom = () => settings.previewThumbs !== false || settings.screenshotThumbs !== false;

function placeholderElement(item) {
  const site = isWebPage(item) ? hostOf(item.url) : '';
  const room = element('div', 'item-thumb placeholder', (site || item.title || '').trim().charAt(0).toUpperCase());
  room.setAttribute('aria-hidden', 'true');
  return room;
}

// a picture that doesn't load: its room instead, with small pictures; else nothing
const thumbFailed = (picture, item) => thumbRoom() ? picture.replaceWith(placeholderElement(item)) : picture.remove();

// the image, else (none, or it doesn't load) the icon, smaller in the same place; neither: the room (thumbFailed)
function previewElement(item, {image, icon}) {
  const picture = element('img', 'item-thumb preview' + (image ? '' : ' icon'));
  picture.alt = '';
  picture.loading = 'lazy';
  picture.referrerPolicy = 'no-referrer';
  picture.src = image || icon;
  picture.addEventListener('error', () => {
    if (!image || !icon || picture.classList.contains('icon')) return thumbFailed(picture, item);
    picture.classList.add('icon');
    picture.src = icon;
  });
  picture.title = item.url;
  picture.addEventListener('click', e => {
    e.stopPropagation();
    window.open(titleUrl(item), '_blank', 'noopener,noreferrer');
  });
  return picture;
}

// owner: the item it is shown at (a bookmark, for its screenshot), for its room when it doesn't load
function thumbElement(item, owner = item) {
  const image = element('img', 'item-thumb');
  image.alt = '';
  image.loading = 'lazy';
  image.src = item.thumb.replace(/([?&]image_size=)[^&#;]*/i, '$1' + THUMB_SIZE);
  image.addEventListener('error', async () => {
    if (image.dataset.fetched) return thumbFailed(image, owner);
    image.dataset.fetched = '1';
    const file = await fetch(image.src, {credentials: 'include', signal: timeLimit(null, FILE_TIME)})
      .then(answer => answer.ok ? answer.blob() : null)
      .catch(() => null);
    if (!file?.size) return thumbFailed(image, owner);
    image.src = URL.createObjectURL(file);
    image.addEventListener('load', () => URL.revokeObjectURL(image.src), {once: true});
  });
  if (item.type == 'image') {
    image.title = message('libraryImageView');
    image.addEventListener('click', e => {
      e.stopPropagation();
      if (!$('popup').open) viewImage(item);
    });
  }
  return image;
}

// Edit, in the list and on Start (library-home.js: homeActions). Diigo's toolbar API, which the add-on saves bookmarks
// with, is about bookmarks; a note as Diigo's note editor saves it, once the index has its text (editNote); an image or
// a PDF in the popup of a bookmark, as Diigo's edit window saves them (editBookmark); Kindle items are edited on Diigo.
const isNoteWithText = item => item.type == 'note' && 'content' in item;
const editable = item => !item.type || ['bookmark', 'image', 'pdf'].includes(item.type) || isNoteWithText(item);

function editButton(item, li) {
  const edit = element('button', '', message('libraryEdit'));
  edit.type = 'button';
  // in the popup, one at a time (addItem)
  edit.addEventListener('click', () =>
    !$('popup').open && (isNoteWithText(item) ? editNote(item, li) : editBookmark(item, li)));
  return edit;
}

// What kind of item it is, when not a bookmark: Diigo's icon of that kind, as in the side bar (VIEWS), at the start
// of its title, with the name of the kind as tooltip; in the list and on Start (library-home.js: homeRow)
function typeIcon(item) {
  // an outliner in the trash (library-outliners.js)
  if (item.type == 'outliner') return outlinerPart.icon();
  const view = item.type && item.type != 'bookmark' && VIEWS[item.type];
  if (!view?.sub) return null;
  const icon = element('i', 'c-icon item-type ' + view.icon);
  icon.title = view.label;
  icon.setAttribute('role', 'img');
  icon.setAttribute('aria-label', view.label);
  return icon;
}

function itemElement(item) {
  const li = element('li', 'item');
  // to draw it anew in its place (redrawItems)
  li.dataset.id = item.id;
  li.redraw = itemElement;
  if (item.thumb && item.type && item.type != 'bookmark') li.append(thumbElement(item));
  // a bookmark with a screenshot of its page (screenshotThumbs): that, a click opens it as an image; else the preview
  // image of its page (previewThumbs); else, with small pictures, the room of one (placeholderElement)
  else if ((!item.type || item.type == 'bookmark') && settings.screenshotThumbs !== false && screenshotFor(item)) {
    li.append(thumbElement(screenshotFor(item), item));
  } else if (settings.previewThumbs !== false && isWebPage(item)) {
    li.append(previewThumb(item));
  } else if (thumbRoom()) {
    li.append(placeholderElement(item));
  }
  if (picking()) {
    li.append(pickBox(item));
    pickOnClick(li, item);
  } else {
    bulkOnClick(li, item);
  }
  const title = element('a', 'title', item.title || item.url);
  title.href = titleUrl(item);
  title.target = '_blank';
  title.rel = 'noopener noreferrer';
  if (item.unread) title.classList.add('unread');
  const icon = typeIcon(item);
  if (icon) title.prepend(icon);
  noteTitle(title, item, li);
  // with deadLinks: the status code of its page before it (library-links.js)
  if (checksLink(item)) {
    const line = element('div', 'title-line');
    line.append(linkStatus(item, title), title);
    li.append(line);
  } else {
    li.append(title);
  }
  // Duplicates: the web address as it is, as that is where they differ (urlKey)
  if (state.view == 'duplicates' && item.url) li.append(element('div', 'full-url', item.url));
  // Moved (the filter of the status of links, from Clean up on Start): where it moved to, to judge it before giving
  // it that address (Bulk edit: bulkNewUrl, or the menu of its code)
  const movedTo = state.links == 'moved' && linkStates.get(item.url)?.to;
  if (movedTo) li.append(element('div', 'full-url moved-to', '→ ' + movedTo));

  const meta = element('div', 'meta');
  const host = hostOf(item.url);
  if (host) {
    const site = element('button', 'host', host);
    site.type = 'button';
    site.title = message('searchFieldSite') + ': ' + host;
    site.addEventListener('click', () => setSite(host));
    meta.append(site);
  }
  // a date Diigo gave wrongly (none, or past the year 5000): none
  if (item.created > 0 && item.created < 1e11) {
    safely('date', () => meta.append(element('span', 'date', dateFormat.format(item.created * 1000))));
  }
  // with hidePrivateFlag only what is public says so, as private is what most are
  if (settings.hidePrivateFlag) {
    if (!item.private) meta.append(element('span', 'flag public', message('libraryPublicFlag')));
  } else if (item.private) {
    meta.append(element('span', 'flag', message('searchFieldPrivate')));
  }
  if (item.unread) meta.append(element('span', 'flag', message('searchFieldUnread')));
  li.append(meta);

  if (item.description) li.append(element('p', 'description', item.description));
  // a note: the first lines of its text, so you see what it is without opening it; an outliner in the trash its
  // first items
  if (isNoteWithText(item)) safely('note', () => {
    const preview = notePreview(item);
    if (preview) li.append(preview);
  });
  if (item.type == 'outliner') safely('outliner', () => {
    const preview = outlinerPart.previewElement(item.preview);
    if (preview) li.append(preview);
  });

  const line = element('div', 'line');
  const tags = element('div', 'item-tags');
  for (const name of item.tags) {
    const tag = element('button', 'tag', name);
    tag.type = 'button';
    tag.addEventListener('click', () => addTag(name));
    tags.append(tag);
  }
  const actions = element('div', 'actions');
  if (editable(item)) actions.append(editButton(item, li));
  // ⋯: pin to Start, hide (library-home.js: itemMenuButton)
  actions.append(itemMenuButton(item));
  // no On Diigo here: the title of a PDF or a Kindle item leads there already (titleUrl), a note or an image opens in
  // the Swift Library with On Diigo in it (library-edit.js: viewNote, viewImage)
  const remove = element('button', 'delete', message('libraryDelete'));
  remove.type = 'button';
  remove.addEventListener('click', () => deleteOne(item, li));
  actions.append(remove);
  // in the trash: when it was deleted, Put back and Remove for good instead; not deleted by Diigo yet (library-delete.js):
  // that it isn't, and Put back only
  if (item.pendingDelete) {
    meta.append(element('span', 'flag pending', message('libraryNotDeletedYet')));
    const restore = element('button', '', message('libraryRestore'));
    restore.type = 'button';
    restore.addEventListener('click', () => cancelDelete(item, li));
    actions.replaceChildren(restore);
  } else if (item.deletedAt) {
    // or no longer on Diigo, found when the index was built (library-index.js: buildIndex)
    meta.append(element('span', 'date', message(item.goneFromDiigo ? 'libraryGoneOn' : 'libraryDeletedOn',
      dateFormat.format(item.deletedAt))));
    actions.replaceChildren(...trashActions(item, li));
  }
  line.append(tags, actions);
  li.append(line);
  return li;
}

// The first NOTE_LINES lines of the text of a note, as plain text (a rich one as the lines it shows: library-code.js:
// noteCode), without the empty lines at the end; … when there is more. Code (by the end of its title) in a font for
// code, with its indents.
const NOTE_LINES = 10;

function notePreview(item) {
  const html = item.rich || looksLikeHtml(item.content);
  const lines = (html ? noteCode(item.content) : String(item.content || '')).replace(/\s+$/, '').split('\n');
  if (!lines.join('').trim()) return null;
  const shown = lines.slice(0, NOTE_LINES);
  const preview = element('p', 'note-preview' + (codeLanguage(item.title) ? ' code' : ''), shown.join('\n'));
  if (lines.length > NOTE_LINES) preview.append(element('span', 'note-more', '\n…'));
  return preview;
}

// Delete screenshot in the menu of a bookmark (library-home.js: itemMenuButton): its screenshots, as Delete does it
// (with deleteDelay to the trash at once, with Undo), the bookmark drawn again without its small picture
async function deleteScreenshots(item, shots) {
  const ids = shots.map(shot => shot.id);
  if (settings.deleteDelay) {
    deleteLater(ids);
    return show({keepScroll: true});
  }
  if (controller || !confirm(message('screenshotDeleteConfirm', item.title || item.url))) return;
  const signal = start();
  try {
    const {deleted} = await deleteItems(ids, signal, () => {});
    if (deleted < ids.length) showStatus(message('libraryDeleteFailed'), true);
  } catch (e) {
    reportProblem(e, 'delete');
  } finally {
    stop();
    show({keepScroll: true});
  }
}

async function deleteOne(item, li) {
  // with deleteDelay: to the trash at once, deleted by Diigo after a while (library-delete.js)
  // only this one out of the list, where it is, without drawing it again (leaveList)
  if (settings.deleteDelay) {
    deleteLater([item.id]);
    leaveList(item, li);
    return safely('bulk edit', showPicked);
  }
  if (controller || !confirm(message('libraryConfirm', item.title || item.url))) return;
  const signal = start();
  try {
    const {deleted} = await deleteItems([item.id], signal, () => {});
    if (!deleted) return showStatus(message('libraryDeleteFailed'), true);
    // on Start (library-home.js): its blocks again
    if (state.view == 'home') return show({keepScroll: true});
    removeItem(li);
    shown = shown.filter(other => other != item);
    listed--;
    showCount();
    showTags();
    showPicked();
  } finally {
    stop();
  }
}

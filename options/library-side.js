// A part of the Swift Library (library.html); library.js has what they share, library-page.js puts them to work.

// ---- the side bar, as Diigo's (SideBar in its main.<hash>.js): what kind of items, and the tags ----

// The names are Diigo's, in English like the site, but for Annotated and Unread, and those only when some bookmarks are
// so. All opens to the types. Diigo's More (Public, Private, Untagged) isn't here: public and private are the privacy
// filter next to the order, Untagged the first of the tags. Random bookmark below them, not Diigo's either.
// Without a search: the tags of what kind of items is chosen, the 10 most used (Top) or the 9 last used (Recent), with
// All tags (all of them, with a box to find one) and Top 300 (a cloud). With a search or a filter: Related Tags, the
// chosen ones (× takes one away) and the tags of what is shown, 10 at a time. No hidden tags, unless typed in full in
// the box of All tags.
const VIEWS = {
  // not Diigo's: the start page (library-home.js), a text of the add-on
  home: {label: message('libraryHome'), icon: 'home', test: () => true},
  all: {label: 'All', icon: 'all', test: () => true},
  bookmark: {label: 'Bookmarks', icon: 'webpage', sub: true, test: item => item.type == 'bookmark'},
  pdf: {label: 'PDFs', icon: 'pdf', sub: true, test: item => item.type == 'pdf'},
  image: {label: 'Images', icon: 'image', sub: true, test: item => item.type == 'image'},
  note: {label: 'Notes', icon: 'note', sub: true, test: item => item.type == 'note'},
  kindle: {label: 'Kindle', icon: 'kindle', sub: true, test: item => item.type == 'kindle'},
  // your outliners of Diigo, a kind under All as the others, though not items of the index: in the place of the list
  // (library-outliners.js)
  outliners: {label: 'Outliners', icon: 'outliners', sub: true, test: () => false},
  ann: {label: message('libraryAnnotated'), icon: 'annotated', test: item => item.annotated},
  // not Diigo's: a text of the add-on
  trash: {label: message('libraryTrash'), icon: 'trash', test: () => true},
  unread: {label: message('libraryUnread'), icon: 'unread', test: item => item.unread},
  // not Diigo's: with deadLinks, the bookmarks whose page is gone (404, 410) or whose site doesn't answer, as found
  // before (library-links.js: linkCategory)
  dead: {label: message('libraryDeadLinks'), icon: 'dead', test: item => ['dead', 'unreachable'].includes(linkCategory(item))},
  // not Diigo's: a text of the add-on (duplicateKeys)
  duplicates: {label: message('libraryDuplicates'), icon: 'duplicates', test: item => duplicateKeys().has(item.id)},
  untagged: {label: 'Untagged', icon: '', test: item => !item.tags.length},
  // not Diigo's: bookmarks without a real title (library-edit.js: untitled), from Clean up on Start
  notitle: {label: message('libraryNoTitle'), icon: '', test: item => untitled(item)},
};
const TOP_TAGS = 10;
const RECENT_TAGS = 9;
const RELATED_TAGS = 10;
const CLOUD_TAGS = 300;

const side = {types: false, sort: 'top', related: 0};

// The tags chosen in the library don't follow into the trash, where they would leave out most of it: they are set
// aside going there, and back again leaving it, unless other tags were chosen in the trash meanwhile.
let tagsBeforeTrash = null;

function setView(view) {
  if (view == 'trash' && state.view != 'trash') {
    tagsBeforeTrash = state.tags;
    state.tags = [];
  } else if (view != 'trash' && state.view == 'trash' && tagsBeforeTrash) {
    if (!state.tags.length) state.tags = tagsBeforeTrash;
    tagsBeforeTrash = null;
  }
  state.random = '';
  // Outliners: the list of them, not the one open before
  state.outliner = '';
  // what was mended in Dead links stays there only while it is shown (library-links.js: mended)
  if (view != state.view || view != 'dead') mended.clear();
  state.view = view;
  // Dead links is a filter on the status of links itself: the one above the list (state.links, from Clean up on
  // Start) left as it was would show fewer than the count in the side bar says (only those whose site doesn't
  // answer, say)
  // and what the background script found since the page started, so the list is what the count said; none dead
  // known: some whose link isn't checked yet, to look for them (showHunt)
  if (view == 'dead') {
    const before = state.random;
    state.links = 'any';
    side.related = 0;
    return loadLinkStates().then(() => {
      if (liveItems().some(item => VIEWS.dead.test(item) && sideVisible(item))) return show({push: true});
      state.random = before;
      showHunt();
    });
  }
  side.related = 0;
  show({push: true});
}

// the bookmarks counted in the side bar: those with a hidden tag only with Show hidden
const sideVisible = item => state.showHidden || !item.tags.some(hiddenTag);

// a view is chosen, unless a random bookmark is shown in its place; Dead links also while looking for them (showHunt)
const chosenView = view => view == 'dead' && hunting() || state.view == view && !state.random;

function sideLink(view) {
  const {label, icon} = VIEWS[view];
  const a = element('a', chosenView(view) ? 'selected' : '');
  a.href = '#';
  a.append(element('i', icon + ' c-icon'));
  if (['unread', 'trash', 'duplicates', 'dead'].includes(view)) {
    const visible = sideVisible;
    const count = view == 'trash' ? totalOf('trash')
      : view == 'duplicates' ? [...duplicateKeys().keys()].filter(id => visible(index.get(id))).length
        : liveItems().filter(item => VIEWS[view].test(item) && visible(item)).length;
    const text = element('span', 'UnreadLabel' + (view == 'dead' ? ' dead-label' : ''), label);
    if (count) text.append(element('span', 'count', String(count)));
    a.append(text);
  } else {
    a.append(label);
  }
  a.addEventListener('click', e => {
    e.preventDefault();
    setView(view);
  });
  return a;
}

function toggle(className, open, onClick) {
  const caret = element('span', className, open ? '▴' : '▾');
  caret.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
    showTags();
  });
  return caret;
}

function navigation() {
  const ul = element('ul', 'sideBarNavigate');
  const li = (view, className = 'child') => {
    const item = element('li', className + (chosenView(view) ? ' selected' : ''));
    item.append(sideLink(view));
    return item;
  };
  const views = Object.keys(VIEWS);
  const types = side.types || VIEWS[state.view].sub;
  ul.append(li('home'));
  const all = element('li', 'child' + (chosenView('all') ? ' selected' : ''));
  const allLink = sideLink('all');
  allLink.prepend(toggle('expand', types, () => side.types = !types));
  all.append(allLink);
  ul.append(all);
  if (types) {
    const sub = element('li', 'sub');
    // only the kinds the library has, and the one chosen (so it can be left)
    sub.append(...views.filter(view => VIEWS[view].sub && (state.view == view ||
      (view == 'outliners' ? outlinerPart.count() > 0 : liveItems().some(item => VIEWS[view].test(item))))).map(sideLink));
    ul.append(sub);
  }

  // Annotated, Unread and Duplicates only when some are, or when it is chosen (so it can be left); Dead links (with
  // deadLinks) always, as without any it looks for them
  const some = view => view == 'dead' || state.view == view ||
    liveItems().some(item => VIEWS[view].test(item) && sideVisible(item));
  const lines = ['ann', 'unread', ...settings.deadLinks ? ['dead'] : [], 'duplicates'];
  ul.append(...lines.filter(some).map(view => li(view)), li('trash'), randomLine());
  return ul;
}

// Random: some from the index, shown on their own (showRandom); chosen while they are shown
function randomLine() {
  const chosen = !!state.random && !hunting();
  const item = element('li', 'child' + (chosen ? ' selected' : ''));
  const a = element('a', 'random-line' + (chosen ? ' selected' : ''));
  a.href = '#';
  a.append(element('i', 'random c-icon'), element('span', '', message('libraryRandom')));
  a.addEventListener('click', e => {
    e.preventDefault();
    showRandom();
  });
  item.append(a);
  return item;
}

// a tag as Diigo's TagLine: its name, how many at the right, and × for a chosen one, with ✎ to rename it (renameTag)
function tagLine(tag, {selected = false, onClick, onRemove, onRename} = {}) {
  const line = element('div', 'tagLine' + (selected ? ' selected' : ''));
  const area = element('div', 'tagArea');
  area.title = tag.name;
  area.append(element('div', 'tagName', tag.name));
  if (tag.count) area.append(element('span', 'tagCount', String(tag.count)));
  if (onClick) area.addEventListener('click', onClick);
  if (onRename) {
    const rename = element('span', 'renameTag', '✎');
    rename.title = message('tagRename');
    rename.addEventListener('click', e => {
      e.stopPropagation();
      onRename();
    });
    area.append(rename);
  }
  if (onRemove) {
    const remove = element('span', 'removeTag', 'x');
    remove.addEventListener('click', e => {
      e.stopPropagation();
      onRemove();
    });
    area.append(remove);
  }
  line.append(area);
  return line;
}

function sideTitle(text, ...rest) {
  const title = element('div', 'sideBarTitle');
  title.append(element('span', '', text), ...rest);
  return title;
}

// the items of the chosen kind, without a search: what the tags at the side are about
// in the trash: all bookmarks, as with All, so the tags of the side bar stay those of the whole library
const viewItems = () => state.view == 'trash' ? itemsOf('all') : itemsOf(state.view).filter(VIEWS[state.view].test);
const visibleTags = tags => tags.filter(tag => !hiddenTag(tag.name));

// the tags of the last saved bookmarks, with how many bookmarks each has, as the Top ones
function recentTags(items) {
  const counts = new Map(tagCounts(items).map(tag => [lower(tag.name), tag.count]));
  const seen = new Map();
  for (const item of [...items].sort((a, b) => b.created - a.created)) {
    for (const name of item.tags) {
      if (!hiddenTag(name) && !seen.has(lower(name))) seen.set(lower(name), {name, count: counts.get(lower(name))});
    }
    if (seen.size >= RECENT_TAGS) break;
  }
  return [...seen.values()].slice(0, RECENT_TAGS);
}

function topTags() {
  const box = element('div', 'topTags');
  const sort = element('select', 'tagSort');
  sort.append(new Option('Top', 'top'), new Option('Recent', 'recent'));
  sort.value = side.sort;
  sort.setAttribute('aria-label', 'Top / Recent');
  sort.addEventListener('change', () => {
    side.sort = sort.value;
    showTags();
  });
  box.append(sideTitle('Tags', sort));
  const items = viewItems();
  const untagged = items.filter(item => !item.tags.length).length;
  // chosen: with × to go back to all
  if (state.view == 'untagged') {
    box.append(tagLine({name: 'Untagged', count: untagged}, {selected: true, onRemove: () => setView('all')}));
  } else if (untagged) {
    box.append(tagLine({name: 'Untagged', count: untagged}, {onClick: () => setView('untagged')}));
  }
  const tags = side.sort == 'top' ? visibleTags(tagCounts(items)).slice(0, TOP_TAGS) : recentTags(items);
  // a click: the bookmarks with that tag, as Diigo searches for it
  box.append(...tags.map(tag => tagLine(tag, {onClick: () => {
    state.random = '';
    state.tags = [tag.name];
    // from the trash: to the bookmarks with that tag, as those are the tags shown
    if (state.view == 'trash') state.view = 'all';
    show({push: true});
  }})));
  const moreTags = element('div', 'moreTagsLine');
  const all = element('a', 'allTag', 'All tags');
  all.href = '#';
  all.addEventListener('click', e => {
    e.preventDefault();
    showCloud();
  });
  moreTags.append(all);
  box.append(moreTags);
  return box;
}

function relatedTags() {
  const box = element('div', 'relatedTagsWrapper');
  box.append(sideTitle('Related Tags'));
  const chosen = state.tags.map(lower);
  box.append(...state.tags.map(name => tagLine({name}, {selected: true, onRename: () => renameTag(name), onRemove: () => {
    state.tags = state.tags.filter(tag => tag != name);
    show({push: true});
  }})));
  const related = visibleTags(tagCounts(shown)).filter(tag => !chosen.includes(lower(tag.name)));
  const pages = Math.ceil(related.length / RELATED_TAGS);
  side.related = Math.min(side.related, Math.max(0, pages - 1));
  box.append(...related.slice(side.related * RELATED_TAGS, (side.related + 1) * RELATED_TAGS)
    .map(tag => tagLine(tag, {onClick: () => addTag(tag.name)})));
  if (pages > 1) {
    const pager = element('div', 'pageCtrl');
    for (const [className, by] of [['prev', -1], ['next', 1]]) {
      const button = element('span', `ctrlBtn ${className}`);
      const page = side.related + by;
      button.classList.toggle('disabled', page < 0 || page >= pages);
      button.addEventListener('click', () => {
        if (page < 0 || page >= pages) return;
        side.related = page;
        showTags();
      });
      pager.append(button);
    }
    box.append(pager);
  }
  return box;
}

// the whole side bar again; called showTags as it follows what is shown
function showTags() {
  const searching = !!(state.query || state.tags.length || state.site || conditionTests().length);
  const wrapper = element('div', 'sideBarWrapper');
  // no tags beside the outliners, which have none
  wrapper.append(navigation(), ...state.view == 'outliners' ? [] : [searching ? relatedTags() : topTags()]);
  $('side').replaceChildren(wrapper);
  placeAddTypes();
}

// All tags: a cloud of the CLOUD_TAGS most used ones (Diigo's Top 300), in the order of the alphabet, the more
// bookmarks the larger. With something in the box above it: all tags with that in their name, the least used too, as
// large as they are in the cloud. Hidden tags only when typed in full.
function showCloud() {
  $('cloudFind').value = '';
  fillCloud();
  $('cloudDialog').showModal();
  $('cloudFind').focus();
}

function fillCloud() {
  const find = lower($('cloudFind').value.trim());
  const all = tagCounts(liveItems());
  const tags = (find
    ? all.filter(tag => lower(tag.name).includes(find) && (!hiddenTag(tag.name) || lower(tag.name) == find))
    : visibleTags(all).slice(0, CLOUD_TAGS)
  ).sort((a, b) => a.name.localeCompare(b.name, undefined, {sensitivity: 'base'}));
  // the sizes of the whole library: a tag is as large when searched for as in the cloud
  const counts = all.map(tag => tag.count);
  const [least, most] = [Math.log(counts.length ? counts.at(-1) : 1), Math.log(Math.max(1, counts[0] || 1))];
  $('cloudNone').hidden = tags.length > 0;
  $('cloud').replaceChildren(...tags.map(tag => {
    const button = element('button', 'cloudTag', tag.name);
    button.type = 'button';
    button.title = message('cloudCount', String(tag.count));
    button.style.fontSize = 12 + 14 * (most > least ? (Math.log(tag.count) - least) / (most - least) : 0) + 'px';
    button.addEventListener('click', () => {
      $('cloudDialog').close();
      state.random = '';
      state.tags = [tag.name];
      if (state.view == 'trash') state.view = 'all';
      show({push: true});
    });
    return button;
  }));
}


// ---- the menu at the top, as on diigo.com (diigo-site/header.js): the items of the options page, in their order ----
// (the same in Swift Discover, discover.js)

// where Diigo's own items and those of the add-on lead; their names are those on diigo.com, in English like the site
const MENU_LINKS = {
  library: () => ({label: 'My Library', url: `https://www.diigo.com/user/${encodeURIComponent(user)}`}),
  // Diigo's own outliners (yours are in the Swift Library, Outliners in its side bar)
  outliners: () => ({label: 'My Outliners', url: 'https://www.diigo.com/outliner'}),
  groups: () => ({label: 'My Groups', url: 'https://groups.diigo.com'}),
  // Diigo's Tools as a page of the add-on (tools.html)
  tools: () => ({label: 'Tools', url: 'tools.html'}),
  learnMore: () => ({label: 'Learn more', url: 'https://www.diigo.com/learn_more'}),
  premium: () => ({label: 'Go Premium', url: 'https://www.diigo.com/premium'}),
  discover: () => ({label: message('discoverMenu'), url: 'discover.html'}),
  options: () => ({label: message('optionsMenu'), url: 'options.html'}),
  // this page itself
  fastLibrary: () => ({label: message('libraryMenu'), url: location.pathname, here: true}),
};

function showMainNav() {
  $('mainNav').replaceChildren(...menuItemsOf(settings).filter(item => item.shown).map(item => {
    // a link of your own, once it has a web address
    const link = MENU_LINKS[item.id]?.() ||
      (/^https?:\/\/./i.test(item.url || '') && {label: item.label.trim() || hostOf(item.url), url: item.url});
    if (!link) return null;
    const li = element('li', link.here ? 'active' : '');
    const a = element('a', '', link.label);
    a.href = link.url;
    if (link.click) a.addEventListener('click', link.click);
    li.append(a);
    return li;
  }).filter(Boolean));
  // your name and its menu, as on diigo.com (user-menu.js)
  showUserMenu(user);
}

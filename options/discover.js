// Swift Discover (discover.html): the Hot Bookmarks of the Diigo community (diigo.com/buzz/hot), smarter than on
// diigo.com. Diigo draws that page on its server, BUZZ_COUNT at a time (count, and page_num from 0); it is read here as
// HTML (parseBuzz), a page at a time with More from Diigo, and kept for a while in storage.local (discoverCache), so
// opening this page again doesn't ask Diigo. diigo.com is behind Cloudflare, which wants a browser that asks a lot to
// show it is one: then the page says so, with a way to Discover on diigo.com and Try again.
// What it adds to Diigo's page:
// - what is in your library already, from the index of the Swift Library (urlKey, as Duplicates there): marked, and left
//   out unless you ask for it (SHOWS)
// - For you: in the order of how many of your own tags are in it, as the bookmark form suggests tags (tagsIn), and
//   those tags under it, and at the side
// - a search box, the tags and sites of what is shown at the side, and filters from a click on them, as in the fast
//   library; what is shown stays in the address (#…)
// - Not interested: left out from then on (discoverDismissed), with Show dismissed to see them again
// - bookmarks with one of your hidden tags left out, unless that tag is asked for in full, as everywhere
// - Save, with the bookmark form of the toolbar button, as Add Bookmark in the Swift Library
// Without Preview: diigo.com shows the page in a frame, which most sites refuse.

const $ = id => document.getElementById(id);

document.documentElement.lang = browser.i18n.getUILanguage();
for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = message(el.dataset.i18n);
for (const el of document.querySelectorAll('[data-i18n-label]')) {
  el.setAttribute('aria-label', message(el.dataset.i18nLabel));
}

const TITLE_SUFFIX = ' - Swift Bookmarks for Diigo';
document.title += TITLE_SUFFIX;

const BUZZ_URL = 'https://www.diigo.com/buzz/hot';
const BUZZ_COUNT = 100;
// how long what was loaded is used again without asking Diigo
const CACHE_KEEP = 60 * 60 * 1000;
// how many Not interested are kept, the last ones
const DISMISSED_KEEP = 2000;
const SIDE_TAGS = 15;
const SIDE_SITES = 10;
// how many of your tags are shown under a bookmark
const MATCHES_SHOWN = 5;
// how many pages of Diigo are loaded at once, so there is more to choose from: BUZZ_PAGES_AT_ONCE, and more till
// SHOWN_TARGET of them are shown (with what is in your library and Not interested left out, often few of a page are
// new), but not more than BUZZ_PAGES_MAX at once
const BUZZ_PAGES_AT_ONCE = 3;
const BUZZ_PAGES_MAX = 10;
const SHOWN_TARGET = 500;
// Interesting for you: a bookmark with one of your INTERESTING_TAGS most used tags in it, or with two of your tags
const INTERESTING_TAGS = 30;
// titles that are a web address: how many pages are asked for their own title at once (fixTitles)
const TITLES_AT_ONCE = 4;

let user = '';                   // signed in on diigo.com
let settings = DEFAULT_SETTINGS;  // see options/settings.js: hiddenTags
let found = [];                  // what was loaded, in Diigo's order (rank); see parseBuzz
let nextPage = 0;                // the page of Diigo to load next; -1 when there is none
let loadedAt = 0;
let loading = false;
let dismissed = new Set();       // urlKey of each Not interested, the oldest first
let savedNow = new Set();        // urlKey of what was saved here, until the index has it
let yours = new Map();           // urlKey -> the bookmark of your library, from the index
let yourTags = [];               // your tags, without the hidden ones
let noIndex = false;             // signed in, but without an index of the Swift Library

const hiddenTag = tag => isHiddenTag(settings, tag);
const lower = text => text.toLowerCase();

function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}


// ---- what is shown: a search, filters, the order, and which ----

// shows: which, see SHOWS; tags: Diigo's tags of the community; site; mine: one of your tags (tagsIn)
const state = {query: '', sort: 'hot', shows: 'new', tags: [], site: '', mine: '', showDismissed: false};

const inLibrary = item => yours.has(item.key) || savedNow.has(item.key);
const SHOWS = {new: item => !inLibrary(item), all: () => true, saved: inLibrary};
const SHOW_TEXTS = {new: 'discoverShowNew', all: 'discoverShowAll', saved: 'discoverShowSaved'};

const SORTS = {
  hot: (a, b) => a.rank - b.rank,
  forYou: (a, b) => b.matches.length - a.matches.length || b.people - a.people || a.rank - b.rank,
  people: (a, b) => b.people - a.people || a.rank - b.rank,
  newest: (a, b) => b.saved - a.saved || a.rank - b.rank,
};
const SORT_TEXTS = {hot: 'discoverSortHot', forYou: 'discoverSortForYou', people: 'discoverSortPeople',
  newest: 'discoverSortNewest'};

$('sort').append(...Object.keys(SORTS).map(sort => new Option(message(SORT_TEXTS[sort]), sort)));
$('shows').append(...Object.keys(SHOWS).map(shows => new Option(message(SHOW_TEXTS[shows]), shows)));
$('query').placeholder = message('discoverQuery');

// the words of the search box: "between quotes" is one, -word what may not be there
function words(query) {
  return [...query.matchAll(/(-?)(?:"([^"]*)"|(\S+))/g)]
    .map(match => ({not: !!match[1], word: lower(match[2] ?? match[3])})).filter(({word}) => word);
}

// each word in its title, web address, description, tags, site or who saved it first
function searchTest(query) {
  const parts = words(query);
  return item => {
    const text = lower([item.title, item.url, item.description, item.by, ...item.tags].join(' '));
    return parts.every(({not, word}) => text.includes(word) != not);
  };
}

// a hidden tag only when it is asked for in full: a filter, or a word in the search box
function askedHiddenTags() {
  const typed = words(state.query).filter(({not}) => !not).map(({word}) => word);
  return new Set([...state.tags, ...typed].map(lower).filter(hiddenTag));
}

// what fits all but which (SHOWS) and Show dismissed: what those two count from
function fitting() {
  const tags = state.tags.map(lower);
  const test = searchTest(state.query);
  const asked = askedHiddenTags();
  return found.filter(item =>
    test(item) &&
    tags.every(tag => item.tags.some(other => lower(other) == tag)) &&
    (!state.site || onSite(item.url, state.site)) &&
    (!state.mine || item.matches.some(tag => lower(tag) == lower(state.mine))) &&
    (!item.tags.some(hiddenTag) || item.tags.some(tag => asked.has(lower(tag)))));
}

function shownItems(items) {
  return items.filter(item => SHOWS[state.shows](item) && (state.showDismissed || !dismissed.has(item.key)))
    .sort(SORTS[state.sort]);
}

function saveState(push) {
  const params = new URLSearchParams();
  if (state.query) params.set('q', state.query);
  if (state.sort != 'hot') params.set('sort', state.sort);
  if (state.shows != 'new') params.set('shows', state.shows);
  state.tags.forEach(tag => params.append('tag', tag));
  if (state.site) params.set('site', state.site);
  if (state.mine) params.set('mine', state.mine);
  if (state.showDismissed) params.set('dismissed', '1');
  const hash = params.toString();
  if (hash == location.hash.slice(1)) return;
  history[push ? 'pushState' : 'replaceState'](null, '', hash ? '#' + hash : location.pathname);
}

function loadState() {
  const params = new URLSearchParams(location.hash.slice(1));
  state.query = params.get('q') || '';
  state.sort = params.get('sort') in SORTS ? params.get('sort') : 'hot';
  state.shows = params.get('shows') in SHOWS ? params.get('shows') : 'new';
  state.tags = params.getAll('tag');
  state.site = params.get('site') || '';
  state.mine = params.get('mine') || '';
  state.showDismissed = params.has('dismissed');
  $('query').value = state.query;
  $('sort').value = state.sort;
  $('shows').value = state.shows;
  $('showDismissed').checked = state.showDismissed;
}

function addTag(name) {
  if (!state.tags.some(tag => lower(tag) == lower(name))) state.tags.push(name);
  show({push: true});
}

function setSite(site) {
  state.site = site;
  show({push: true});
}

function setMine(tag) {
  state.mine = tag;
  show({push: true});
}


// ---- your library: what you have, and your tags ----

// The bookmarks of the index of the Swift Library, by urlKey, and your tags; only an index of who is signed in. Without
// one, nothing is marked and For you has nothing to go by: the page says to open the Swift Library once.
function loadYours() {
  const ready = !!meta && meta.user == user && !!user;
  const items = ready ? [...index.values()] : [];
  yours = new Map(items.filter(item => item.url).map(item => [urlKey(item.url), item]));
  yourTags = tagCounts(items).map(tag => tag.name).filter(name => !hiddenTag(name));
  // what was saved here and is in the index now
  savedNow = new Set([...savedNow].filter(key => !yours.has(key)));
  found.forEach(match);
  // what the line says stays, unless it was about the index
  const said = $('status').textContent;
  const error = $('status').classList.contains('error');
  noIndex = !ready && !!user;
  showStatus(said == message('discoverNoIndex') ? '' : said, error);
}

// the text of a bookmark as words between spaces: "Machine Learning" or machine_learning → machine learning
const wordText = text => ' ' + lower(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean).join(' ') + ' ';

// the part of a web address that says what it is about: the site without www. and .com, the path without .html
function urlWords(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '').replace(/\.[^.]+$/, '') + ' ' +
      decodeURIComponent(parsed.pathname).replace(/\.\w{1,5}$/, '');
  } catch (e) {
    return '';
  }
}

// Your tags that are whole words in its title, web address or tags, as the bookmark form suggests them
// (form/form.js: tagsMentioned); only tags of 3 characters or more, the most used first.
let tagWords = {tags: null, words: []};

function tagsIn(item) {
  if (tagWords.tags != yourTags) {
    tagWords = {tags: yourTags, words: yourTags.map(name => [name, wordText(name)]).filter(([, w]) => w.trim().length >= 3)};
  }
  const text = wordText([item.title, urlWords(item.url), ...item.tags].join(' '));
  return tagWords.words.filter(([, w]) => text.includes(w)).map(([name]) => name);
}

function match(item) {
  item.key = urlKey(item.url);
  item.matches = tagsIn(item);
}

// with your most used tags in it (yourTags, the most used first), or with two of yours: marked, as the ones to look at
function interesting(item) {
  const top = new Set(yourTags.slice(0, INTERESTING_TAGS).map(lower));
  return item.matches.length >= 2 || item.matches.some(tag => top.has(lower(tag)));
}

// Diigo gives a bookmark without a title its web address as title: the title of the page itself instead, asked once
// for each (titleAsked), TITLES_AT_ONCE at a time, kept with what was loaded (saveCache)
const titleAsked = new Set();
const bareUrl = url => url.trim().replace(/^https?:\/\/(www\.)?/i, '').replace(/\/+$/, '').toLowerCase();
const urlTitle = item => /^https?:\/\/\S+$/i.test(item.title.trim()) || bareUrl(item.title) == bareUrl(item.url);

async function fixTitles() {
  const todo = found.filter(item => urlTitle(item) && !titleAsked.has(item.url));
  todo.forEach(item => titleAsked.add(item.url));
  for (let i = 0; i < todo.length; i += TITLES_AT_ONCE) {
    const titled = await Promise.all(todo.slice(i, i + TITLES_AT_ONCE).map(async item => {
      const info = await browser.runtime.sendMessage({type: 'pageInfo', url: item.url}).catch(() => null);
      const title = (info?.title || '').replace(/\s+/g, ' ').trim();
      if (!title || urlTitle({...item, title})) return false;
      item.title = title;
      match(item);
      return true;
    }));
    if (titled.some(Boolean)) {
      saveCache();
      show({keepScroll: true});
    }
  }
}


// ---- Diigo's Hot Bookmarks ----

// A page of /buzz/hot, as Diigo draws it (October 2026): a .ditemItem per bookmark, with how many people saved it
// (.savePeopleCount), its title and web address (a.titleLink), a description (.desc .content, mostly empty), its tags
// (span#tags_<n>, a link each) and who saved it first and when (.nothers: "first saved by <a>name</a> on Nov 12, 26",
// or "Saved by" when only one did). rank: its place in Diigo's order.
// The tags of a bookmark from its links: Diigo writes a tag of more words between quotes, and can give each word a
// link of its own ("machine and learning"): those are one tag again, without the quotes.
function joinQuoted(names) {
  const tags = [];
  let open = null;
  for (const name of names) {
    if (open != null) {
      open += ' ' + name;
      if (/"$/.test(name)) {
        tags.push(open);
        open = null;
      }
    } else if (/^"/.test(name) && !/^".*"$/s.test(name)) {
      open = name;
    } else {
      tags.push(name);
    }
  }
  if (open != null) tags.push(open);
  return [...new Set(tags.map(tag => tag.replace(/^"+|"+$/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean))];
}

function parseBuzz(html, pageNum) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const items = [...doc.querySelectorAll('.ditemItem')].map((el, i) => {
    const link = el.querySelector('a.titleLink');
    const url = link?.getAttribute('href')?.trim() || '';
    const others = el.querySelector('.nothers');
    const when = others?.textContent.match(/\bon ([A-Z][a-z]{2}) (\d{1,2}), (\d{2,4})\b/);
    const year = when && (when[3].length == 2 ? '20' + when[3] : when[3]);
    return {
      url,
      title: link?.textContent.replace(/\s+/g, ' ').trim() || url,
      description: el.querySelector('.desc .content')?.textContent.trim() || '',
      tags: joinQuoted([...el.querySelectorAll('span[id^="tags_"] a')].map(a => a.textContent.trim()).filter(Boolean)),
      people: Number(el.querySelector('.savePeopleCount strong')?.textContent) || 1,
      by: others?.querySelector('a[href^="/user/"]')?.textContent.trim() || '',
      saved: when ? Date.parse(`${when[1]} ${when[2]}, ${year}`) || 0 : 0,
      rank: pageNum * BUZZ_COUNT + i,
    };
  }).filter(item => /^https?:\/\//i.test(item.url));
  const more = [...doc.querySelectorAll('.pagination a')].some(a => /next/i.test(a.textContent));
  // Cloudflare's "Just a moment...", in place of Diigo's page
  const challenged = !items.length && /just a moment|challenge-platform|cf-chl/i.test(html);
  return {items, more, challenged};
}

async function buzzPage(pageNum) {
  const params = new URLSearchParams({page_num: pageNum, count: BUZZ_COUNT});
  const response = await fetch(`${BUZZ_URL}?${params}`, {credentials: 'include', signal: timeLimit()});
  const page = parseBuzz(await response.text(), pageNum);
  if (page.challenged || response.status == 403) throw Object.assign(new Error(message('discoverChallenge')), {challenge: true});
  if (!response.ok) throw new Error(message('discoverFailed', String(response.status)));
  return page;
}

// what was loaded, for opening this page again (CACHE_KEEP); without key and matches, which follow your library
function saveCache() {
  const items = found.map(({key, matches, ...item}) => item);
  browser.storage.local.set({discoverCache: {time: loadedAt, nextPage, items}}).catch(() => {});
}

// pageNum 0: anew, in place of what was there; BUZZ_PAGES_AT_ONCE pages from there, or more till SHOWN_TARGET are
// shown, each shown as it comes
async function load(pageNum) {
  if (loading) return;
  loading = true;
  $('loadMore').disabled = $('refresh').disabled = true;
  $('openBuzz').hidden = $('retry').hidden = true;
  showStatus(message('discoverLoading'));
  const first = pageNum;
  try {
    const enough = () => pageNum + 1 >= first + BUZZ_PAGES_MAX ||
      pageNum + 1 >= first + BUZZ_PAGES_AT_ONCE && shownItems(fitting()).length >= SHOWN_TARGET;
    for (; ; pageNum++) {
      const page = await buzzPage(pageNum);
      const have = new Set(pageNum ? found.map(item => item.key) : []);
      page.items.forEach(match);
      const added = page.items.filter(item => !have.has(item.key) && have.add(item.key));
      found = pageNum ? [...found, ...added] : added;
      nextPage = page.more ? pageNum + 1 : -1;
      loadedAt = pageNum ? loadedAt : Date.now();
      saveCache();
      show({keepScroll: pageNum > 0});
      if (nextPage < 0 || enough()) break;
    }
    showStatus('');
    fixTitles();
  } catch (e) {
    showStatus(e?.message || String(e), true);
    $('openBuzz').hidden = !e?.challenge;
    $('retry').hidden = false;
    $('retry').onclick = () => load(pageNum);
  } finally {
    loading = false;
    $('loadMore').disabled = $('refresh').disabled = false;
    showLoadMore();
  }
}

// with nothing else to say: that there is no index, with the way to the Swift Library
function showStatus(text, error) {
  // what goes wrong, as said to you, in the log too (settings.js: logError)
  if (text && error) logError('Swift Discover', text);
  $('status').textContent = text || (noIndex ? message('discoverNoIndex') : '');
  $('status').classList.toggle('error', !!text && !!error);
  $('openLibrary').hidden = !!text || !noIndex;
  $('notice').hidden = !$('status').textContent;
}

function showLoadMore() {
  $('loadMore').hidden = nextPage < 0 || !found.length;
}


// ---- Not interested ----

function dismiss(item, gone) {
  dismissed.delete(item.key);
  if (gone) dismissed.add(item.key);
  dismissed = new Set([...dismissed].slice(-DISMISSED_KEEP));
  // with the account of the browser too, while it fits (settings.js: SYNCED_LISTS)
  saveSettings({discoverDismissed: [...dismissed]}).catch(() => {});
  show({keepScroll: true});
}


// ---- saving one: the bookmark form of the toolbar button, with its web address and title ----

let saving = null;  // the bookmark the form is open for

function save(item) {
  const dialog = $('popup');
  const frame = element('iframe');
  // with its description and the tags of the community, as the keywords of the page (form.js: tagsInKeywords suggests
  // yours among them); the form asks the page itself for more (fetch: background.js, pageInfo)
  frame.src = browser.runtime.getURL('form/form.html') + '?' + new URLSearchParams({
    url: item.url, title: item.title, description: item.description || '', keywords: item.tags.join('\n'), fetch: '1',
  });
  saving = item;
  dialog.onclick = e => {
    if (e.target == dialog) dialog.close();
  };
  dialog.replaceChildren(frame);
  dialog.showModal();
  frame.addEventListener('load', () => frame.focus());
}

// from form/form.js in that iframe; once saved, it is in your library here at once, and in the index a moment later
// (the background script: refreshIndex, indexChanged)
addEventListener('message', e => {
  const frame = $('popup').querySelector('iframe');
  if (!frame || e.source != frame.contentWindow) return;
  if (e.data?.type == 'close') $('popup').close();
  if (e.data?.type == 'saved' && saving) {
    savedNow.add(saving.key);
    show({keepScroll: true});
    showStatus(message('discoverSaved', saving.title));
  }
  if (e.data?.type == 'height') frame.style.height = Math.min(e.data.height, innerHeight - 32) + 'px';
});


// ---- the list ----

const dateFormat = new Intl.DateTimeFormat(browser.i18n.getUILanguage(), {dateStyle: 'medium'});

function tagButton(name, className, onClick) {
  const button = element('button', className, name);
  button.type = 'button';
  button.addEventListener('click', onClick);
  return button;
}

function itemElement(item) {
  const li = element('li', 'item discover-item');
  const gone = dismissed.has(item.key);
  li.classList.toggle('dismissed', gone);
  li.classList.toggle('interesting', !inLibrary(item) && interesting(item));

  // how many people saved it, at the left, as on diigo.com
  const people = element('span', 'people', String(item.people));
  people.title = message('discoverPeople', String(item.people));
  li.append(people);

  const title = element('a', 'title', item.title);
  title.href = item.url;
  title.target = '_blank';
  title.rel = 'noopener noreferrer';
  li.append(title);

  const meta = element('div', 'meta');
  const host = hostOf(item.url);
  if (host) {
    const site = tagButton(host, 'host', () => setSite(host));
    site.title = message('searchFieldSite') + ': ' + host;
    meta.append(site);
  }
  if (item.saved) meta.append(element('span', 'date', dateFormat.format(item.saved)));
  if (item.by) {
    const by = element('span', 'by', message(item.people > 1 ? 'discoverFirstSavedBy' : 'discoverSavedBy') + ' ');
    const link = element('a', '', item.by);
    link.href = `https://www.diigo.com/user/${encodeURIComponent(item.by)}`;
    link.target = '_blank';
    link.rel = 'noopener';
    by.append(link);
    meta.append(by);
  }
  if (inLibrary(item)) meta.append(element('span', 'flag in-library', message('discoverInLibrary')));
  else if (interesting(item)) meta.append(element('span', 'flag interesting', message('discoverInteresting')));
  li.append(meta);

  if (item.description) li.append(element('p', 'description', item.description));

  // your tags in it (For you): a click shows the others with that tag
  const matches = item.matches.slice(0, MATCHES_SHOWN);
  if (matches.length) {
    const yoursLine = element('div', 'for-you');
    yoursLine.append(element('span', '', message('discoverYourTags')));
    yoursLine.append(...matches.map(name => tagButton(name, 'tag mine', () => setMine(name))));
    li.append(yoursLine);
  }

  const line = element('div', 'line');
  const tags = element('div', 'item-tags');
  tags.append(...item.tags.map(name => tagButton(name, 'tag', () => addTag(name))));
  const actions = element('div', 'actions');
  const own = yours.get(item.key);
  if (own) {
    // yours: to it in your library on diigo.com
    const onDiigo = element('a', '', message('libraryOpenDiigo'));
    onDiigo.href = `https://www.diigo.com/user/${encodeURIComponent(user)}/b/${own.id}`;
    onDiigo.target = '_blank';
    onDiigo.rel = 'noopener';
    actions.append(onDiigo);
  } else {
    actions.append(tagButton(message(savedNow.has(item.key) ? 'libraryEdit' : 'discoverSave'), 'save', () => save(item)));
  }
  const notInterested = tagButton(message(gone ? 'libraryUndo' : 'discoverDismiss'), 'dismiss', () => dismiss(item, !gone));
  actions.append(notInterested);
  line.append(tags, actions);
  li.append(line);
  return li;
}

function show({keepScroll = false, push = false} = {}) {
  saveState(push);
  const items = fitting();
  const shown = shownItems(items);
  $('items').replaceChildren(...shown.map(itemElement));
  if (!keepScroll) scrollTo(0, 0);
  showCount(items, shown);
  showFilters();
  showSide(shown);
  showLoadMore();
  showTitle();
}

// how many are shown, and what is left out: in your library, Not interested
function showCount(items, shown) {
  if (!found.length) return $('count').textContent = loading ? '' : message('libraryNoItems');
  const saved = items.filter(item => inLibrary(item) && (state.showDismissed || !dismissed.has(item.key))).length;
  const gone = items.filter(item => dismissed.has(item.key) && SHOWS[state.shows](item)).length;
  const parts = [message(shown.length ? 'libraryCount' : 'searchNone', [String(shown.length), String(found.length)])];
  if (state.shows == 'new' && saved) parts.push(message('discoverLeftOutSaved', String(saved)));
  if (!state.showDismissed && gone) parts.push(message('discoverLeftOutDismissed', String(gone)));
  $('count').textContent = parts.join(' · ');
}

function showFilters() {
  const filters = [
    ...state.mine ? [{text: state.mine, className: 'tag mine', remove: () => state.mine = ''}] : [],
    ...state.tags.map(tag => ({text: tag, className: 'tag', remove: () => {
      state.tags = state.tags.filter(other => other != tag);
    }})),
    ...state.site ? [{text: state.site, className: 'host', remove: () => state.site = ''}] : [],
    ...state.query.trim() ? [{text: state.query.trim(), className: 'typed', remove: () => {
      state.query = $('query').value = '';
    }}] : [],
  ];
  $('filters').replaceChildren(...filters.map(({text, className, remove}) => {
    const button = tagButton(text, 'filter ' + className, () => {
      remove();
      show({push: true});
    });
    button.title = message('libraryRemoveFilter');
    return button;
  }));
}

// a tag or a site as Diigo's TagLine in the side bar, as in the Swift Library: its name, how many at the right
function sideLine({name, count}, onClick, selected) {
  const line = element('div', 'tagLine' + (selected ? ' selected' : ''));
  const area = element('div', 'tagArea');
  area.title = name;
  area.append(element('div', 'tagName', name), element('span', 'tagCount', String(count)));
  area.addEventListener('click', onClick);
  line.append(area);
  return line;
}

function sideTitle(text) {
  const title = element('div', 'sideBarTitle');
  title.append(element('span', '', text));
  return title;
}

// At the side, of what is shown: your tags in them (For you), Diigo's tags, and the sites
function showSide(shown) {
  const wrapper = element('div', 'sideBarWrapper');
  const mine = tagCounts(shown.map(item => ({tags: item.matches}))).slice(0, SIDE_TAGS);
  if (mine.length) {
    wrapper.append(sideTitle(message('discoverYourTagsHere')),
      ...mine.map(tag => sideLine(tag, () => setMine(state.mine == tag.name ? '' : tag.name), state.mine == tag.name)));
  }
  const chosen = state.tags.map(lower);
  const tags = tagCounts(shown).filter(tag => !hiddenTag(tag.name) && !chosen.includes(lower(tag.name)))
    .slice(0, SIDE_TAGS);
  if (tags.length) wrapper.append(sideTitle(message('sideTags')), ...tags.map(tag => sideLine(tag, () => addTag(tag.name))));
  const sites = new Map();
  shown.forEach(item => {
    const host = hostOf(item.url);
    if (host) sites.set(host, (sites.get(host) || 0) + 1);
  });
  const top = [...sites].sort((a, b) => b[1] - a[1]).slice(0, SIDE_SITES).map(([name, count]) => ({name, count}));
  if (top.length) {
    wrapper.append(sideTitle(message('discoverSites')),
      ...top.map(site => sideLine(site, () => setSite(state.site == site.name ? '' : site.name), state.site == site.name)));
  }
  $('side').replaceChildren(wrapper);
}

function showTitle() {
  const asked = [state.query.trim(), state.mine, ...state.tags, state.site].filter(Boolean);
  document.title = (asked.length ? asked.join(', ') + ' · ' : '') + message('discoverMenu') + TITLE_SUFFIX;
}


// ---- the menu at the top, as in the Swift Library (library-side.js: showMainNav) ----

const MENU_LINKS = {
  // Diigo's own, also with myLibraryToSwift (settings.js: DIIGO_OWN)
  library: () => ({label: message('diigoMyLibrary'), url: `https://www.diigo.com/user/${encodeURIComponent(user)}${DIIGO_OWN}`}),
  // Diigo's own outliners (yours are in the Swift Library, Outliners in its side bar)
  outliners: () => ({label: message('diigoMyOutliners'), url: 'https://www.diigo.com/outliner'}),
  groups: () => ({label: message('diigoMyGroups'), url: 'https://groups.diigo.com'}),
  // Diigo's Tools as a page of the add-on (tools.html)
  tools: () => ({label: menuName('toolsMenu'), url: 'tools.html'}),
  // Swift Guide, the guide of the add-on, in the place of Diigo's Learn more (guide.html)
  learnMore: () => ({label: menuName('guideMenu'), url: 'guide.html'}),
  premium: () => ({label: message('diigoPremium'), url: 'https://www.diigo.com/premium'}),
  fastLibrary: () => ({label: menuName('libraryMenu'), url: 'library.html'}),
  // this page itself
  discover: () => ({label: menuName('discoverMenu'), url: location.pathname, here: true}),
  options: () => ({label: menuName('optionsMenu'), url: 'options.html'}),
};

function showMainNav() {
  $('mainNav').replaceChildren(...swiftNavItems().map(item => {
    // a link of your own, once it has a web address
    const link = MENU_LINKS[item.id]?.() ||
      (/^https?:\/\/./i.test(item.url || '') && {label: item.label.trim() || hostOf(item.url), url: item.url});
    if (!link) return null;
    const li = element('li', link.here ? 'active' : '');
    const a = element('a', '', link.label);
    a.href = link.url;
    li.append(a);
    return li;
  }).filter(Boolean));
  // your name and its menu, as on diigo.com (user-menu.js)
  showUserMenu(user);
}


// ---- the page ----

let typing = 0;
$('query').addEventListener('input', () => {
  clearTimeout(typing);
  typing = setTimeout(() => {
    state.query = $('query').value.trim();
    show();
  }, 150);
});
$('searchForm').addEventListener('submit', e => {
  e.preventDefault();
  clearTimeout(typing);
  state.query = $('query').value.trim();
  show();
});
$('sort').addEventListener('change', () => {
  state.sort = $('sort').value;
  show();
});
$('shows').addEventListener('change', () => {
  state.shows = $('shows').value;
  show();
});
$('showDismissed').addEventListener('change', () => {
  state.showDismissed = $('showDismissed').checked;
  show({keepScroll: true});
});
$('refresh').addEventListener('click', () => load(0));
$('loadMore').addEventListener('click', () => nextPage >= 0 && load(nextPage));
// Ctrl+F (Cmd+F on a Mac): the search box, as in the Swift Library (library-page.js: findKey); again there, or with the
// bookmark form open, the find bar of the browser
document.addEventListener('keydown', e => {
  if (e.key.toLowerCase() != 'f' || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
  if (document.activeElement == $('query') || document.querySelector('dialog[open]')) return;
  e.preventDefault();
  $('query').focus();
  $('query').select();
});
addEventListener('popstate', () => {
  loadState();
  show();
});

// A bookmark saved elsewhere (diigo.com, the bookmark form, the Swift Library) is in the index a moment later. Not an
// async listener: Firefox takes the Promise it gives for any message as the answer, also for the messages the bookmark
// form in #popup sends to the background script (open), which then got undefined from this page instead.
browser.runtime.onMessage.addListener(request => {
  if (request?.type != 'indexChanged') return;
  db?.close();
  openIndex().then(() => {
    loadYours();
    show({keepScroll: true});
  });
});

// signed out, in or as someone else on diigo.com meanwhile (background.js: setUser): what is yours follows, and the
// menu at the top with your name; signed out, the Hot Bookmarks stay, as they are there for everyone
browser.runtime.onMessage.addListener(request => {
  if (request?.type != 'userChanged' || request.user == user) return;
  user = request.user || '';
  $('popup').open && $('popup').close();
  showMainNav();
  loadYours();
  show({keepScroll: true});
});

// hidden tags or the menu changed on the options page
browser.storage.onChanged.addListener(async (changes, area) => {
  if (!settingsArea(area) || !changes.hiddenTags && !changes.alsoHiddenTags) return;
  settings = await loadSettings().catch(() => settings);
  showMainNav();
  loadYours();
  show({keepScroll: true});
});

// Who is signed in, the settings and the index first; then what was loaded before when it is recent enough, or the
// first page of Diigo. The Hot Bookmarks are there for everyone: signed out, the page works, but marks nothing.
Promise.allSettled([
  openIndex(), browser.runtime.sendMessage({type: 'user'}), loadSettings(),
  browser.storage.local.get('discoverCache').then(async kept => ({...kept, ...await loadKept(['discoverDismissed'])})),
]).then(([, name, loaded, kept]) => {
  user = name.value || '';
  settings = loaded.value || DEFAULT_SETTINGS;
  const {discoverCache: cache, discoverDismissed} = kept.value || {};
  dismissed = new Set(Array.isArray(discoverDismissed) ? discoverDismissed : []);
  showMainNav();
  loadState();
  loadYours();
  if (cache && Array.isArray(cache.items) && Date.now() - cache.time < CACHE_KEEP) {
    found = cache.items;
    found.forEach(match);
    nextPage = Number.isInteger(cache.nextPage) ? cache.nextPage : -1;
    loadedAt = cache.time;
    show();
    fixTitles();
  } else {
    show();
    load(0);
  }
});

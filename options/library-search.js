// A part of the Swift Library (library.html); library.js has what they share, library-page.js puts them to work.

// ---- what is shown: a search, filters and the order ----

// The search box is a field (all of them, or one of FIELDS) and what to search there (query, searchTest). + next to it
// keeps it as a filter above the list (conditions) and empties the box for the next one.
// view: what kind of items, as in the side bar (VIEWS); home: the start page instead of a list (library-home.js)
// privacy: all, public or private, the filter next to the order
// saved: when, the filter next to it (SAVED)
// links: the status of its page, the filter after that, with deadLinks (library-links.js: LINKS)
// random: the ids of the random bookmarks, shown on their own (showRandom)
// conditions: those kept with +, [{field, value}]
// bulk: Bulk edit is on, with a box at each bookmark
const state = {
  field: 'all', query: '', tags: [], site: '', sort: 'newest', view: 'home', privacy: 'all', saved: 'any',
  links: 'any', random: '', conditions: [], bulk: false, showHidden: false, outliner: '',
};
const PRIVACY = {all: () => true, public: item => !item.private, private: item => item.private};
// how long ago it was saved, in days
const DAY = 24 * 60 * 60 * 1000;
const age = item => (Date.now() - item.created * 1000) / DAY;
const SAVED = {
  any: () => true,
  week: item => age(item) <= 7,
  month: item => age(item) <= 31,
  year: item => age(item) <= 365,
  overYear: item => age(item) > 365,
  over5Years: item => age(item) > 5 * 365,
};

const SORTS = {
  newest: (a, b) => b.created - a.created,
  oldest: (a, b) => a.created - b.created,
  updated: (a, b) => b.updated - a.updated,
  title: (a, b) => (a.title || a.url).localeCompare(b.title || b.url, undefined, {sensitivity: 'base'}),
  // the other way round
  titleDesc: (a, b) => (b.title || b.url).localeCompare(a.title || a.url, undefined, {sensitivity: 'base'}),
};

const capitalized = text => text[0].toUpperCase() + text.slice(1);
const lower = text => text.toLowerCase();

// the fields to search in; all: in any of them. What kind of item, private, unread and when are filters of their own:
// the side bar, and the two next to the order.
// content: the text of a note (index-item.js: noteText), in all fields too
const FIELDS = ['all', 'title', 'url', 'description', 'content', 'tag', 'site'];

// the words of a search: "between quotes" is one, -word what is not there, and "" an empty field
function words(query) {
  return [...query.matchAll(/(-?)(?:"([^"]*)"|(\S+))/g)]
    .map(match => ({not: !!match[1], word: lower(match[2] ?? match[3])}));
}

// each word somewhere in the field: in its text, the site (without www.) or a whole tag; tag* any tag that starts so.
// Part of a tag (in all fields, or tag*) never finds a hidden one: that only in full, as everywhere else.
function matches(item, field, word) {
  const part = test => tag => lower(tag) == word || !hiddenTag(tag) && test(lower(tag));
  switch (field) {
    case 'title': return lower(item.title).includes(word);
    case 'url': return lower(item.url).includes(word);
    case 'description': return lower(item.description).includes(word);
    case 'content': return noteText(item).includes(word);
    case 'tag': return item.tags.some(word.endsWith('*')
      ? part(tag => tag.startsWith(word.slice(0, -1)))
      : tag => lower(tag) == word);
    case 'site': return hostOf(item.url).includes(word);
    default: return ['title', 'url', 'description', 'content'].some(other => matches(item, other, word)) ||
      item.tags.some(part(tag => tag.includes(word)));
  }
}

// "": nothing in the field (no tags for tag); for all fields it doesn't count
function empty(item, field) {
  switch (field) {
    case 'tag': return !item.tags.length;
    case 'site': return !hostOf(item.url);
    case 'content': return !noteText(item).trim();
    case 'all': return true;
    default: return !text(item[field]).trim();
  }
}

// each word in the field, and none of the -words
const searchTest = ({field, value}) => {
  const parts = words(value);
  return item => parts.every(({not, word}) => (word ? matches(item, field, word) : empty(item, field)) != not);
};

const complete = ({field, value}) => FIELDS.includes(field) && !!value.trim();

// the search box, as a condition
const searched = () => ({field: state.field, value: state.query});

// the search box and the conditions kept, as tests of an item
const conditionTests = () => [searched(), ...state.conditions].filter(complete).map(searchTest);

$('field').append(...FIELDS.map(field =>
  new Option(field == 'all' ? message('libraryAllFields') : message('searchField' + capitalized(field)), field)));
$('sort').append(...Object.keys(SORTS).map(sort => new Option(message('librarySort' + capitalized(sort)), sort)));
// in English when the add-on is not loaded again since these texts came
const PRIVACY_TEXTS = {all: 'Public and private', public: 'Only public', private: 'Only private'};
$('privacy').append(...Object.keys(PRIVACY)
  .map(privacy => new Option(message('libraryPrivacy' + capitalized(privacy)) || PRIVACY_TEXTS[privacy], privacy)));
$('saved').append(...Object.keys(SAVED).map(saved => new Option(message('librarySaved' + capitalized(saved)), saved)));

// the hidden tags asked for in full: a tag filter, or a word (not a -word) in the search box or a filter kept with +,
// in all fields or Tag
function askedHiddenTags() {
  const typed = [searched(), ...state.conditions].filter(({field}) => field == 'all' || field == 'tag')
    .flatMap(({value}) => words(value).filter(({not}) => !not).map(({word}) => word));
  return new Set([...state.tags, ...typed].map(lower).filter(hiddenTag));
}

// Bookmarks with a hidden tag only when one of their hidden tags is asked for in full (askedHiddenTags), not for any
// search that happens to match them, or with Show hidden ticked. hiddenCount: how many of what matches are such
// bookmarks, left out or (with Show hidden) shown, for the count after Show hidden (library-list.js: showCount).
let hiddenCount = 0;

function shownItems() {
  hiddenCount = 0;
  // Random: only those, in the order they were picked (showRandom)
  if (state.random) return state.random.split(',').map(id => index.get(id)).filter(Boolean);
  const site = state.site;
  const tags = state.tags.map(lower);
  const inTrash = state.view == 'trash';
  const tests = conditionTests();
  const asked = askedHiddenTags();
  const shownHidden = item => {
    if (!item.tags.some(hiddenTag) || item.tags.some(tag => asked.has(lower(tag)))) return true;
    hiddenCount++;
    return state.showHidden;
  };
  // what was mended here (a new web address, the latest copy in the Wayback Machine, Not dead: library-links.js:
  // mended) stays while this list is shown, though it may no longer match it (the filter of moved links, say)
  return itemsOf(state.view).filter(item => mended.has(item.id) && !inTrash ||
    tests.every(test => test(item)) &&
    (!site || onSite(item.url, site)) &&
    tags.every(tag => item.tags.some(other => lower(other) == tag)) &&
    // Dead links: also what was mended there meanwhile (library-links.js: mended)
    (VIEWS[state.view].test(item) || state.view == 'dead' && mended.has(item.id)) &&
    // the filters next to the order: not in the trash, where show() hides them; kept for after it
    (inTrash || PRIVACY[state.privacy](item) && SAVED[state.saved](item) &&
      (!settings.deadLinks || LINKS[state.links](item))) &&
    shownHidden(item)
  ).sort(state.view == 'trash' && state.sort == 'newest' ? (a, b) => b.deletedAt - a.deletedAt
    // duplicates: those of one web address together, in the order chosen
    : state.view == 'duplicates' ? (a, b) => sameKey(a, b) || SORTS[state.sort](a, b)
      : SORTS[state.sort]);
}

// in the address, for reloading; push: as a step of its own, for going back (a click on a tag, a site or a filter)
function saveState(push) {
  const params = new URLSearchParams();
  if (state.query) params.set('q', state.query);
  if (state.field != 'all') params.set('field', state.field);
  state.tags.forEach(tag => params.append('tag', tag));
  if (state.site) params.set('site', state.site);
  if (state.sort != 'newest') params.set('sort', state.sort);
  // Start (library-home.js) is where the page opens
  if (state.view != 'home') params.set('view', state.view);
  // the outliner open (library-outliners.js)
  if (state.view == 'outliners' && state.outliner) params.set('outliner', state.outliner);
  if (state.privacy != 'all') params.set('privacy', state.privacy);
  if (state.saved != 'any') params.set('saved', state.saved);
  if (state.links != 'any') params.set('links', state.links);
  if (state.showHidden) params.set('hidden', '1');
  if (state.random) params.set('random', state.random);
  state.conditions.forEach(({field, value}) => params.append('if', JSON.stringify([field, value])));
  if (state.bulk) params.set('bulk', '1');
  const hash = params.toString();
  if (hash == location.hash.slice(1)) return;
  history[push ? 'pushState' : 'replaceState'](null, '', hash ? '#' + hash : location.pathname);
}

function loadState() {
  const params = new URLSearchParams(location.hash.slice(1));
  state.query = params.get('q') || '';
  state.field = FIELDS.includes(params.get('field')) ? params.get('field') : 'all';
  state.tags = params.getAll('tag');
  state.site = params.get('site') || '';
  state.sort = params.get('sort') in SORTS ? params.get('sort') : 'newest';
  state.view = params.get('view') in VIEWS ? params.get('view') : 'home';
  state.outliner = state.view == 'outliners' ? params.get('outliner') || '' : '';
  state.privacy = params.get('privacy') in PRIVACY ? params.get('privacy') : 'all';
  state.saved = params.get('saved') in SAVED ? params.get('saved') : 'any';
  state.links = params.get('links') in LINKS ? params.get('links') : 'any';
  state.showHidden = params.has('hidden');
  state.random = params.get('random') || '';
  state.bulk = params.has('bulk');
  state.conditions = params.getAll('if').map(condition => {
    try {
      const [field, value = ''] = JSON.parse(condition);
      return {field, value: String(value)};
    } catch (e) {
      return null;
    }
  }).filter(condition => condition && complete(condition));
  $('privacy').value = state.privacy;
  $('saved').value = state.saved;
  $('showHidden').checked = state.showHidden;
  $('sort').value = state.sort;
  showSearchBox();
}

function addTag(name) {
  state.random = '';
  if (!state.tags.some(tag => lower(tag) == lower(name))) state.tags.push(name);
  show({push: true});
}

function setSite(site) {
  state.random = '';
  state.site = site;
  show({push: true});
}


// ---- the search box: a field, how and what, and + to keep it as a filter ----

// what a field suggests as you type (also for the tags of Bulk edit): your tags without the hidden ones, or your
// sites, with how many bookmarks each; the most used first. Counted when the field gets the focus, so it's what the
// index has then.
const SUGGESTIONS = {
  tag: () => visibleTags(tagCounts(liveItems())),
  site: () => {
    const counts = new Map();
    for (const item of liveItems()) {
      const host = hostOf(item.url);
      if (host) counts.set(host, (counts.get(host) || 0) + 1);
    }
    return [...counts].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({name, count}));
  },
};
const SUGGESTED = 10;

// The suggestions below a field (#suggest, one for the page): for the word at the cursor only, not all that is typed,
// so the second tag gets them too. Those that start with it first, then those that have it somewhere; no word that is
// typed already. ↑ ↓ choose one, Enter or a click takes it, Tab the first (or the one chosen), Esc closes them. Enter
// without one chosen is the field's own (search, or Apply tags), so a new tag is never swapped for an existing one.
// The word taken keeps its - (what is not there) and gets quotes when it has a space.
// key: which SUGGESTIONS, or a function that says it (the search box: after its field)
function autocomplete(input, key) {
  const list = $('suggest');
  let names = [];
  let choice = -1;
  const keyOf = () => typeof key == 'function' ? key() : key;

  // the word at the cursor: where it starts and ends, without its - and quote
  const current = () => {
    const before = input.value.slice(0, input.selectionStart);
    const start = before.search(/\S*$/);
    const end = input.selectionStart + input.value.slice(input.selectionStart).search(/\s|$/);
    const prefix = /^-?"?/.exec(input.value.slice(start, end))[0];
    return {start, end, prefix, word: lower(input.value.slice(start + prefix.length, end).replace(/"$/, ''))};
  };

  const close = () => {
    if (list.owner == input) list.hidden = true;
    choice = -1;
  };

  const place = () => {
    // in a popup (library-edit.js: tagSuggestions) inside it, else it is under the popup and its backdrop
    const host = input.closest('dialog') || document.body;
    if (list.parentNode != host) host.append(list);
    const box = input.getBoundingClientRect();
    list.style.left = box.left + 'px';
    list.style.top = box.bottom + 2 + 'px';
    list.style.minWidth = Math.max(box.width, 220) + 'px';
  };

  const showChoice = () => [...list.children].forEach((li, i) => {
    li.classList.toggle('chosen', i == choice);
    if (i == choice) li.scrollIntoView({block: 'nearest'});
  });

  const take = name => {
    const {start, end, prefix} = current();
    const word = /\s/.test(name) ? `"${name}"` : name;
    const rest = input.value.slice(end).replace(/^\s*/, '');
    input.value = input.value.slice(0, start) + prefix.replace('"', '') + word + ' ' + rest;
    const at = start + prefix.replace('"', '').length + word.length + 1;
    input.setSelectionRange(at, at);
    input.dispatchEvent(new Event('input', {bubbles: true}));
    close();
  };

  const open = () => {
    if (!keyOf() || document.activeElement != input) return close();
    const {word} = current();
    if (!word) return close();
    const typed = new Set(words(input.value).map(part => part.word));
    const fitting = names.filter(({name}) => !typed.has(lower(name)) || lower(name) == word);
    const starts = fitting.filter(({name}) => lower(name).startsWith(word));
    const inside = fitting.filter(({name}) => !lower(name).startsWith(word) && lower(name).includes(word));
    const found = [...starts, ...inside].slice(0, SUGGESTED);
    if (!found.length || found.length == 1 && lower(found[0].name) == word) return close();
    choice = -1;
    list.owner = input;
    list.replaceChildren(...found.map(({name, count}) => {
      const li = element('li', '', name);
      li.append(element('span', 'count', String(count)));
      // mousedown: before the field loses the focus
      li.addEventListener('mousedown', e => {
        e.preventDefault();
        take(name);
      });
      return li;
    }));
    place();
    list.hidden = false;
  };

  input.addEventListener('focus', () => {
    names = keyOf() ? safely('suggestions', SUGGESTIONS[keyOf()], []) : [];
  });
  input.addEventListener('input', open);
  input.addEventListener('blur', close);
  input.addEventListener('keydown', e => {
    if (list.hidden || list.owner != input) return;
    const count = list.children.length;
    if (e.key == 'ArrowDown' || e.key == 'ArrowUp') {
      e.preventDefault();
      // -1: none chosen, what is typed; past the last one back to that, and so on
      const next = choice + (e.key == 'ArrowDown' ? 1 : -1);
      choice = next >= count ? -1 : next < -1 ? count - 1 : next;
      showChoice();
    } else if (e.key == 'Enter' && choice >= 0 || e.key == 'Tab' && !e.shiftKey) {
      e.preventDefault();
      take(list.children[Math.max(choice, 0)].firstChild.textContent);
    } else if (e.key == 'Escape') {
      e.preventDefault();
      close();
    }
  });
  addEventListener('scroll', () => list.owner == input && !list.hidden && place(), {passive: true});
  addEventListener('resize', close);
}

// how a filter reads above the list: what was typed, after its field (Title: news -sport)
function conditionText({field, value}) {
  return field == 'all' ? value : message('searchField' + capitalized(field)) + ': ' + value;
}

// the search box after state
function showSearchBox() {
  $('field').value = state.field;
  const query = $('query');
  query.placeholder = message('libraryQuery');
  if (query.value != state.query) query.value = state.query;
  showPin();
}

function showPin() {
  $('pin').disabled = !complete(searched());
}

// another field: what is typed stays
function chooseField(field) {
  state.field = field;
  state.random = '';
  showSearchBox();
  $('query').focus();
  show();
}

// + : what the box says as a filter above the list, and the box empty again
function pinSearch() {
  if (!complete(searched())) return $('query').focus();
  state.conditions.push(searched());
  state.field = 'all';
  state.query = '';
  state.random = '';
  showSearchBox();
  $('query').focus();
  show({push: true});
}


// ---- the filters, above the list: a click on one takes it away ----

// Random (the side bar): RANDOM_COUNT of your bookmarks from the index, none with a hidden tag, and only those in the
// list (state.random: their ids, with commas); a click on it in the side bar again picks others, none of those shown
// while there are enough (above the list, #randomBar says so). One deleted is replaced by another (fillRandom), so
// there are always RANDOM_COUNT while the library has them. Without asking Diigo.
const RANDOM_COUNT = 10;

// those Random can show: bookmarks of the library as the page shows it, none with a hidden tag
const randomPool = () => liveItems().filter(item => (item.type == 'bookmark' || !item.type) && !item.tags.some(hiddenTag));

// count of pool at random: the first of a shuffle (Fisher–Yates), without shuffling all of them
function pickRandom(pool, count) {
  count = Math.min(count, pool.length);
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(Math.random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

// state.random while none could be picked (no bookmarks, or the index not loaded yet): Random all the same, empty,
// with No bookmarks yet above it (showRandomBar), and picked by fillRandom once there are
const RANDOM_NONE = 'new';

function showRandom() {
  const shownNow = new Set(state.random.split(','));
  const bookmarks = randomPool();
  const others = bookmarks.filter(item => !shownNow.has(item.id));
  const pool = others.length >= Math.min(RANDOM_COUNT, bookmarks.length) ? others : bookmarks;
  state.random = pickRandom(pool, RANDOM_COUNT).map(item => item.id).join(',') || RANDOM_NONE;
  // from the trash: those are bookmarks of the library, not of the trash (as a tag of the side bar does)
  if (state.view == 'trash') state.view = 'all';
  show({push: true});
}

// Random again RANDOM_COUNT: those that are gone (deleted, or waiting for that, library-delete.js) out, and others at
// random, none of those shown, at the end; the rest stay where they are. Called by show(), before the list is drawn.
function fillRandom() {
  if (!state.random) return;
  const kept = state.random.split(',').filter(id => index.has(id) && !pending.has(id));
  if (kept.length >= RANDOM_COUNT) return;
  const shownNow = new Set(kept);
  const added = pickRandom(randomPool().filter(item => !shownNow.has(item.id)), RANDOM_COUNT - kept.length);
  // none (yet): still Random, not the library (RANDOM_NONE)
  state.random = [...kept, ...added.map(item => item.id)].join(',') || RANDOM_NONE;
}

// above Random: what it is, or No bookmarks yet when there are none to pick
function showRandomBar() {
  $('randomBar').hidden = !state.random;
  if (state.random) $('randomIntro').textContent = message(randomPool().length ? 'libraryRandomIntro' : 'libraryRandomNone');
}

function showFilters() {
  if (state.random) {
    const chip = element('button', 'filter random', message('libraryRandom'));
    chip.type = 'button';
    chip.title = message('libraryRemoveFilter');
    chip.addEventListener('click', () => {
      state.random = '';
      show({push: true});
    });
    return $('filters').replaceChildren(chip);
  }
  const filters = [
    ...state.tags.map(tag => ({text: tag, className: 'tag', remove: () => {
      state.tags = state.tags.filter(other => other != tag);
    }})),
    ...state.site ? [{text: state.site, className: 'host', remove: () => {
      state.site = '';
    }}] : [],
    // the status of links, from Clean up on Start (library-home.js), only with deadLinks as it only counts then
    ...settings.deadLinks && state.links != 'any' ? [{text: linksText(state.links), className: 'links', remove: () => {
      state.links = 'any';
    }}] : [],
    ...state.conditions.filter(complete).map(condition => ({text: conditionText(condition), className: 'condition',
      remove: () => {
        state.conditions = state.conditions.filter(other => other != condition);
      }})),
    // what is typed in the search box, as long as something is: a click empties the box
    ...complete(searched()) ? [{text: conditionText(searched()), className: 'typed', remove: () => {
      state.query = '';
      showSearchBox();
    }}] : [],
  ];
  const chips = filters.map(({text, className, remove}) => {
    const button = element('button', 'filter ' + className, text);
    button.type = 'button';
    button.title = message('libraryRemoveFilter');
    button.addEventListener('click', () => {
      remove();
      show({push: true});
    });
    return button;
  });
  $('filters').replaceChildren(...chips);
}

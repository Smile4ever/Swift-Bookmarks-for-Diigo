// The bookmark form, shown in an iframe on the page by content/content.js. background/background.js loads, saves and deletes the bookmark.

const $ = id => document.getElementById(id);
const t = (key, substitutions) => browser.i18n.getMessage(key, substitutions) || key;
const lang = browser.i18n.getUILanguage();
const query = new URLSearchParams(location.search);
const tagInput = $('tags');

let data = null;   // the bookmark and the user's tags, see openBookmark in background/background.js
let allTags = [];  // the names of the user's tags, most used first
let settings = DEFAULT_SETTINGS;  // see options/settings.js
// what the page says of itself (content/content.js: pageInfo; background.js: pageInfo for a link): its description, its
// keywords and the web address it calls its own
let page = {
  description: query.get('description') || '',
  keywords: (query.get('keywords') || '').split('\n').filter(Boolean),
  canonical: query.get('canonical') || '',
};


// ---- texts in the language of the browser ----

document.documentElement.lang = lang;
for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
for (const el of document.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);

// Diigo says when in English ("5 minutes ago", "on Mar 12, 2024"); say it in the language of the browser
function savedWhen(text) {
  if (/^yesterday$/i.test(text)) text = '1 day ago';
  const ago = text.match(/^(\d+|an?|one) (second|minute|hour|day|week|month|year)s? ago$/i);
  if (ago) {
    const n = parseInt(ago[1]) || 1;
    return t('savedAgo', new Intl.RelativeTimeFormat(lang, {numeric: 'auto'}).format(-n, ago[2].toLowerCase()));
  }
  const date = new Date(text.replace(/^on /i, ''));
  if (/^on /i.test(text) && !isNaN(date)) return t('savedOn', date.toLocaleDateString(lang, {dateStyle: 'long'}));
  return t('savedAgo', text);
}


// ---- the page around the iframe ----

const toPage = msg => parent.postMessage(msg, '*');
const close = () => toPage({type: 'close'});

// the iframe is only as high as the form
new ResizeObserver(() => {
  toPage({type: 'height', height: Math.ceil($('card').getBoundingClientRect().bottom + scrollY) + 16});
}).observe($('card'));


// ---- fields ----

// sets a value like typing does, so a textarea grows and the label moves up
function fill(field, value) {
  field.value = value;
  field.dispatchEvent(new Event('input'));
}

function autoGrow(textarea, maxHeight) {
  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    const height = textarea.scrollHeight + textarea.offsetHeight - textarea.clientHeight;
    textarea.style.height = Math.min(height, maxHeight) + 'px';
    textarea.style.overflowY = height > maxHeight ? 'auto' : 'hidden';
  });
}

autoGrow($('title'), 88);
autoGrow($('description'), 160);

// a field marked red by save() is fine again once it's edited
for (const field of document.querySelectorAll('.field')) {
  field.addEventListener('input', () => field.classList.remove('invalid'));
}

// Tab into a field puts the cursor at the end instead of selecting all text (a click keeps the cursor where you click)
let tabbing = false;
document.addEventListener('keydown', e => tabbing = e.key == 'Tab', true);
document.addEventListener('mousedown', () => tabbing = false, true);
document.addEventListener('focusin', e => {
  const field = e.target;
  if (!tabbing || !field.matches('.field input, .field textarea')) return;
  const toEnd = () => {
    field.setSelectionRange(field.value.length, field.value.length);
    field.scrollTop = field.scrollHeight;
  };
  // also right after, in case Firefox selects the text after this event
  toEnd();
  setTimeout(toEnd);
});

for (const box of document.querySelectorAll('input[type=checkbox]')) {
  box.addEventListener('keydown', e => e.key == 'Enter' && box.click());
}


// ---- tags ----

// 'a b,"c d"' → ['a', 'b', 'c d']
function splitTags(text) {
  const tags = (text.match(/"[^"]*"?|[^\s,"]+/g) || []).map(s => s.replace(/"/g, '').trim());
  return [...new Set(tags.filter(Boolean))];
}

// ['a', 'c d'] → 'a "c d" '
function joinTags(tags) {
  return tags.map(tag => {
    tag = tag.replace(/"/g, "'").trim();
    return (/[\s,]/.test(tag) ? `"${tag}"` : tag) + ' ';
  }).join('');
}

const chosenTags = () => splitTags(tagInput.value);

// a screenshot along of a bookmark with a hidden tag: a warning under the boxes (settings.js: screenshotOfHidden)
function showScreenshotWarning() {
  $('screenshotWarning').hidden = $('screenshotOption').hidden || !$('screenshot').checked ||
    !screenshotOfHidden(settings, chosenTags());
}

function setTagText(text) {
  tagInput.value = text;
  showScreenshotWarning();
  tagInput.focus();
  tagInput.setSelectionRange(text.length, text.length);
  markChosenTags();
}

function toggleTag(tag) {
  const tags = chosenTags();
  setTagText(joinTags(tags.includes(tag) ? tags.filter(x => x != tag) : [...tags, tag]));
}

// the tags already in the field are marked in the cloud, and not suggested
function markChosenTags() {
  const tags = chosenTags();
  for (const el of document.querySelectorAll('#cloud .tag')) el.classList.toggle('chosen', tags.includes(el.textContent));
  const suggested = [...document.querySelectorAll('#suggested .tag')];
  for (const el of suggested) el.hidden = tags.includes(el.textContent);
  $('suggested').hidden = suggested.every(el => el.hidden);
  showRelated();
}

// Often with these: the tags you use most together with those in the field, from the index (background.js:
// relatedTagsOf), the more often with more of them the sooner; not those in the field or suggested already, nor hidden ones
const RELATED_SHOWN = 6;

function showRelated() {
  if (!data?.relatedTags) return;
  const chosen = chosenTags().map(tag => tag.toLowerCase());
  const suggested = [...document.querySelectorAll('#suggested .tag:not([hidden])')].map(el => el.textContent.toLowerCase());
  const scores = new Map();
  for (const tag of chosen) {
    // own ones only: a tag can be called constructor
    for (const [name, count] of Object.hasOwn(data.relatedTags, tag) ? data.relatedTags[tag] : []) {
      const key = name.toLowerCase();
      if (chosen.includes(key) || suggested.includes(key) || isHiddenTag(settings, name)) continue;
      scores.set(key, {name, score: (scores.get(key)?.score || 0) + count});
    }
  }
  const top = [...scores.values()].sort((a, b) => b.score - a.score).slice(0, RELATED_SHOWN);
  $('related-tags').replaceChildren(...top.map(({name}) => tagButton(name)));
  $('related').hidden = !top.length;
}

function tagButton(name) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tag';
  button.textContent = name;
  button.addEventListener('click', () => toggleTag(name));
  return button;
}

// the user's tags that are whole words in the title or the url: tagsMentioned, in options/settings.js (also for the
// sync of bookmarks of the browser, background/sync.js)

// The user's tags among the keywords of the page (page.keywords): a keyword that is one ("Machine learning" for
// machine-learning) or has one as whole words ("JavaScript tutorial" for javascript); not across two keywords. Only
// tags you have: the keywords themselves are often too many, or too general.
function tagsInKeywords(keywords, names) {
  // two spaces between keywords, so no tag of two words reaches across them
  const text = keywords.map(mentionWords).join('');
  return names.filter(name => mentionWords(name).trim().length >= 2 && text.includes(mentionWords(name))).slice(0, 10);
}

function showSuggestions() {
  const bm = data.bookmark;
  const tags = [...new Set([...data.lastTags, ...tagsMentioned(bm.title, bm.url, allTags),
    ...tagsInKeywords(page.keywords, allTags)])].filter(tag => !isHiddenTag(settings, tag));
  $('suggested').append(...tags.map(tagButton));
  $('add-all').addEventListener('click', e => {
    e.preventDefault();
    setTagText(joinTags([...new Set([...chosenTags(), ...tags])]));
  });
}

// the 100 most used tags in alphabetical order, the more used the larger
function showCloud() {
  const box = $('cloud-tags');
  $('edit-tags').href = 'https://www.diigo.com/cloud/' + encodeURIComponent(data.user);
  if (!data.userTags.length) {
    box.textContent = t('noTags');
    return;
  }
  const top = data.userTags.filter(tag => !isHiddenTag(settings, tag.name)).sort((a, b) => b.count - a.count).slice(0, 100);
  const counts = [...new Set(top.map(tag => tag.count))];
  top.sort((a, b) => a.name.localeCompare(b.name));
  for (const {name, count} of top) {
    const rank = counts.indexOf(count) / counts.length; // 0 for the most used
    const button = tagButton(name);
    button.style.fontSize = (20 - 7 * rank).toFixed(1) + 'px';
    if (rank < 0.2) button.style.fontWeight = 'bold';
    box.append(button);
  }
}

$('cloud-button').addEventListener('click', () => $('cloud').hidden = !$('cloud').hidden);


// ---- share to group and to outliner: outliners only shown when you have them, groups always, as on diigo.com ----

// the page Diigo's old add-on opened for "Create a Group..."
const CREATE_GROUP_URL = 'https://groups.diigo.com/create';
const CREATE_GROUP = '-create';

function fillSelect(select, items) {
  select.append(...items.map(([value, text]) => new Option(text, value)));
  select.hidden = !items.length;
}

function showSharing() {
  fillSelect($('group'), data.userGroups.map(group => [group.name, group.displayName]));
  $('group').append(new Option(t('createGroup'), CREATE_GROUP));
  $('group').hidden = false;
  fillSelect($('outliner'), data.userOutliners.map(outliner => [outliner.id, outliner.title]));
  // the option hideShareToOutliner (options/settings.js)
  if (settings.hideShareToOutliner) $('outliner').hidden = true;
}

// in a new tab, and back to no group here: it's not a group to share to
$('group').addEventListener('change', () => {
  if ($('group').value != CREATE_GROUP) return;
  $('group').value = '';
  browser.tabs.create({url: CREATE_GROUP_URL});
});


// ---- autocomplete of the tag being typed ----

const matchList = $('matches');
let active = -1;

function showMatches() {
  const typed = tagInput.value.split(/[\s,]/).pop().replace(/"/g, '').toLowerCase();
  const position = tag => tag.toLowerCase().indexOf(typed);
  // a hidden tag only when it's typed in full
  const shown = tag => position(tag) >= 0 && (!isHiddenTag(settings, tag) || tag.toLowerCase() == typed);
  const matches = typed ? allTags.filter(shown).sort((a, b) => position(a) - position(b)).slice(0, 7) : [];

  matchList.replaceChildren(...matches.map((tag, i) => {
    const li = document.createElement('li');
    li.textContent = tag;
    li.addEventListener('mouseover', () => highlight(i));
    li.addEventListener('mousedown', e => {
      e.preventDefault();
      pick(tag);
    });
    return li;
  }));
  matchList.hidden = !matches.length;
  active = -1;
}

function highlight(i) {
  const items = [...matchList.children];
  active = i < 0 ? items.length - 1 : i >= items.length ? 0 : i;
  items.forEach((li, k) => li.classList.toggle('active', k == active));
}

function pick(tag) {
  matchList.hidden = true;
  setTagText(tagInput.value.replace(/[^\s,]*$/, joinTags([tag])));
}

tagInput.addEventListener('input', () => {
  showMatches();
  markChosenTags();
  showScreenshotWarning();
});
tagInput.addEventListener('blur', () => matchList.hidden = true);
tagInput.addEventListener('keydown', e => {
  if (matchList.hidden) return;
  if (e.key == 'ArrowDown') highlight(active + 1);
  else if (e.key == 'ArrowUp') highlight(active - 1);
  else if (e.key == 'Enter' || e.key == 'Tab') active < 0 ? highlight(0) : pick(matchList.children[active].textContent);
  else if (e.key == 'Escape') matchList.hidden = true;
  else return;
  // Enter and Escape mean something else for the form when the list is closed
  e.preventDefault();
  e.stopPropagation();
});


// ---- saving and deleting ----

// move: Move instead of Save, which removes the bookmarks of the browser of this page once Diigo saved it
async function save({move = false} = {}) {
  const title = $('title'), url = $('url');
  title.parentNode.classList.toggle('invalid', !title.value.trim());
  url.parentNode.classList.toggle('invalid', !/^(https?|ftp):\/\/\S/.test(url.value));
  const wrong = document.querySelector('.invalid input, .invalid textarea');
  if (wrong) return wrong.focus();

  const button = $(move ? 'move' : 'save'), error = $('error');
  if (!data || $('save').disabled || $('move').disabled) return;
  const label = button.textContent;
  $('save').disabled = $('move').disabled = true;
  button.textContent = t('saving');
  error.hidden = true;

  const result = await browser.runtime.sendMessage({
    type: 'save',
    urlId: data.bookmark.urlId,
    // one Diigo's toolbar API didn't find: by its link_id, at the web address it had (background.js: saveByLinkId)
    linkId: data.bookmark.linkId || '',
    oldUrl: data.bookmark.url,
    url: url.value,
    title: title.value,
    description: $('description').value,
    tags: chosenTags(),
    private: $('private').checked,
    unread: $('unread').checked,
    screenshot: !$('screenshotOption').hidden && $('screenshot').checked,
    // Share to group is hidden for a private bookmark, so what was chosen in it before doesn't count; an outliner does
    group: $('private').checked ? '' : $('group').value,
    outliner: $('outliner').value,
  }).catch(e => ({message: e.message}));

  // close only when Diigo has saved it; otherwise say why and keep what was typed
  if (result?.ok) {
    if (move) await browser.runtime.sendMessage({type: 'removeBrowserBookmarks', ids: data.browserBookmarks}).catch(() => {});
    toPage({type: 'saved'});
    return close();
  }
  $('save').disabled = $('move').disabled = false;
  button.textContent = label;
  if (!result) error.textContent = t('errorNoAnswer');
  else if (!result.status) error.textContent = result.message || t('errorNoConnection');
  else if (result.code == -1) error.textContent = t('errorNotSignedIn');
  else error.textContent = t('errorNotSaved', [String(result.status), String(result.code)]) + (result.message ? ': ' + result.message : '.');
  error.hidden = false;
  logError('Bookmark form', error.textContent, $('url')?.value || '');
}

// the box not remembered: each screenshot one you choose, as Diigo keeps only so many images (a free account few)
$('screenshot').addEventListener('change', () => {
  showScreenshotWarning();
});
$('save').addEventListener('click', () => asking ? askUrl() : save());
$('move').addEventListener('click', () => save({move: true}));
$('close').addEventListener('click', close);

$('delete').addEventListener('click', () => {
  if (data.annotated && !confirm(t('confirmDelete'))) return;
  browser.runtime.sendMessage({type: 'delete', url: data.bookmark.url, urlId: data.bookmark.urlId});
  close();
});

// Enter in the tag field or Alt+S saves, Esc closes
document.addEventListener('keydown', e => {
  if (e.key == 'Escape') {
    close();
  } else if (asking) {
    if (e.key == 'Enter') askUrl();
  } else if (e.key == 'Enter' && e.target == tagInput) {
    save();
  } else if (e.code == 'KeyS' && (e.altKey || e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    save();
  }
});


// ---- start ----

// Without a page (url), from the Swift Library (options/library.js: addBookmark): first only the URL, with Next, as
// Diigo's Add Bookmark window asks it; then the title of that page, and the rest of the form as for a page.
let asking = !query.get('url');

async function askUrl() {
  const url = $('url');
  const wrong = !/^(https?|ftp):\/\/\S/.test(url.value.trim());
  url.parentNode.classList.toggle('invalid', wrong);
  if (wrong || $('save').disabled) return url.focus();
  $('save').disabled = true;
  $('spinner').hidden = false;
  const info = await browser.runtime.sendMessage({type: 'pageInfo', url: url.value.trim()}).catch(() => null);
  if (info) page = {description: info.description, keywords: info.keywords, canonical: info.canonical};
  asking = false;
  document.body.classList.remove('asking');
  $('save').disabled = false;
  $('save').textContent = t('add');
  start(url.value.trim(), info?.title || '');
}

function start(url, title) {
  tagInput.focus();
  return Promise.all([
    browser.runtime.sendMessage({type: 'open', url, title, canonical: page.canonical}),
    loadSettings(),
  ]).then(([answer, loaded]) => show(answer, loaded), () => show(null, settings));
}

// The bookmarks at nearly the same web address (background.js: similarBookmarks), above the fields: Edit opens that one
// in the form instead, as the form opens for a page. Opened as one of those already (otherAddress): nothing to say,
// it is just that bookmark, at its own web address in the field.
function showSimilar() {
  const list = $('similar-list');
  list.replaceChildren(...data.similar.map(other => {
    const li = document.createElement('li');
    const url = document.createElement('span');
    url.className = 'similar-url';
    url.textContent = other.url;
    url.title = other.title ? `${other.title}\n${other.url}` : other.url;
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.textContent = t('similarEdit');
    edit.addEventListener('click', () => {
      location.search = '?' + new URLSearchParams({url: other.url, title: other.title || ''});
    });
    li.append(url, edit);
    return li;
  }));
  $('similar').hidden = !data.similar.length;
}

// What the rules of the options page say for a new bookmark of this site (settings.js: siteRules): their tags in the
// field, and private or read later as they say; a later rule for the same site over an earlier one
function siteRulesFor(url) {
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch (e) {
  }
  const fits = rule => {
    const site = (rule.site || '').trim().toLowerCase().replace(/^www\./, '');
    return !!site && !!host && (host == site || host.endsWith('.' + site));
  };
  const rules = (settings.siteRules || []).filter(fits);
  const last = key => rules.map(rule => rule[key]).filter(value => typeof value == 'boolean').at(-1);
  return {tags: [...new Set(rules.flatMap(rule => rule.tags || []))], private: last('private'), unread: last('unread')};
}

if (asking) {
  document.body.classList.add('asking');
  $('spinner').hidden = true;
  $('save').textContent = t('libraryNext');
  $('url').focus();
} else if (query.get('fetch')) {
  // from Swift Discover (options/discover.js: save): what the page says of itself too, as for a link (background.js:
  // pageInfo), along with the description and the tags Discover gave
  browser.runtime.sendMessage({type: 'pageInfo', url: query.get('url')}).catch(() => null).then(info => {
    if (info) {
      page = {
        description: page.description || info.description,
        keywords: [...new Set([...page.keywords, ...info.keywords])],
        canonical: info.canonical,
      };
    }
    start(query.get('url'), query.get('title') || info?.title || '');
  });
} else {
  start(query.get('url'), query.get('title'));
}

// the bookmark as Diigo has it (background.js: openBookmark), in the form
function show(answer, loaded) {
  // no answer from the background script: say so, rather than wait for ever with empty fields
  if (!answer?.bookmark) {
    $('spinner').hidden = true;
    $('error').textContent = t('errorNoAnswer');
    $('error').hidden = false;
    return;
  }
  data = answer;
  settings = loaded;
  // a screenshot of the page you're on along: only for the page itself, not a link or from the Swift Library; off
  // each time
  $('screenshotOption').hidden = query.get('page') != '1';
  $('screenshot').checked = false;
  showScreenshotWarning();
  const bm = data.bookmark;
  allTags = [...data.userTags].sort((a, b) => b.count - a.count).map(tag => tag.name);
  $('spinner').hidden = true;

  if (bm.saved) {
    $('heading').textContent = t('formTitleEdit');
    $('save').textContent = t('save');
    $('delete').hidden = false;
    if (bm.date) {
      $('when').textContent = savedWhen(bm.date);
      $('delete').title = t('clickToRemove', $('when').textContent);
    }
  }

  fill($('title'), bm.title);
  fill($('url'), bm.url);
  // a new one: the text selected on the page, or with pageDescription what the page says of itself
  const selection = query.get('selection');
  const pageText = !bm.saved && settings.pageDescription ? page.description : '';
  fill($('description'), bm.description || (selection ? `"${selection}"` : pageText));
  $('private').checked = bm.private;
  $('unread').checked = bm.unread;

  // a new one: what the rules of its site say
  const rules = bm.saved ? {tags: []} : siteRulesFor(bm.url);
  if (typeof rules.private == 'boolean') $('private').checked = rules.private;
  if (typeof rules.unread == 'boolean') $('unread').checked = rules.unread;

  // Move, when the page is a bookmark of the browser too
  $('move').hidden = !data.browserBookmarks?.length;

  showSuggestions();
  showCloud();
  showSharing();
  showSimilar();
  // the cursor after the tags of the bookmark, where the next tag goes
  const tags = [...bm.tags, ...rules.tags.filter(tag => !bm.tags.some(other => other.toLowerCase() == tag.toLowerCase()))];
  if (tags.length) setTagText(joinTags(tags));
  else markChosenTags();
}

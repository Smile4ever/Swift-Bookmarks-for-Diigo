// A part of the Swift Library (library.html); library.js has what they share, library-page.js puts them to work.

// ---- dead links: the status code before the title, and the archives from it ----

// With deadLinks (options/settings.js): the status code of the page of
// each bookmark (200, 404...) before its title, ERR when the site doesn't answer, ? when it took too long; a dead one
// (404, 410) red, its title struck through. The background script checks them (checkLink), a few at a time, each web
// address once while it runs, so drawing the list again asks nothing new. A click on the code: where to look the
// page up in the Wayback Machine and archive.is. Here the code is a button of its own, as this page draws its list
// itself; on diigo.com it has to be a ::before of Diigo's title.

const isWebPage = item => (item.type == 'bookmark' || !item.type) && /^https?:/i.test(item.url);
const checksLink = item => !!settings.deadLinks && isWebPage(item);

// ---- the filter on them (state.links, a filter above the list: Clean up on Start, library-home.js): from what the
// background script found and kept ----

// The status of each web address as the background script kept it (the store links of the database of the index,
// openIndexDb), read when the page starts and when the filter is chosen, so no page is asked for it; and what this
// page hears from checkLink meanwhile. Not checked yet: not kept (yet), or it took too long. Only for web pages: a
// note, image, PDF or Kindle item has none.
let linkStates = new Map();  // url -> {state, status}

async function loadLinkStates() {
  try {
    const kept = db ? await done(db.transaction('links').objectStore('links').getAll()) : [];
    linkStates = new Map(kept.map(entry => [entry.url, entry]));
  } catch (e) {
    // an index of before the store links: none yet
  }
}

// ---- dead links that aren't: ignored, by you ----

// A link can be found dead wrongly: a site that refuses requests that don't come from a browser tab, wants you signed
// in, or answers 404 to the add-on but not to you. Not dead: this link (its web address) or all links of its site (and
// its subdomains) are then ignored: no longer in Dead links, Clean up on Start or the filters of the status, their code
// grey instead of red (ignored). Kept in this browser (storage.local, IGNORED_LINKS_KEY: {urls, sites}), apart from the
// status the background script keeps, which is checked again after a while. Count as dead again undoes it.
const IGNORED_LINKS_KEY = 'ignoredLinks';
let ignoredLinks = {urls: new Set(), sites: new Set()};

async function loadIgnoredLinks() {
  const saved = (await browser.storage.local.get(IGNORED_LINKS_KEY).catch(() => ({})))[IGNORED_LINKS_KEY];
  ignoredLinks = {
    urls: new Set(Array.isArray(saved?.urls) ? saved.urls : []),
    sites: new Set(Array.isArray(saved?.sites) ? saved.sites : []),
  };
}

function saveIgnoredLinks() {
  const saved = {urls: [...ignoredLinks.urls], sites: [...ignoredLinks.sites]};
  return browser.storage.local.set({[IGNORED_LINKS_KEY]: saved}).catch(() => {});
}

// the site of a link that is ignored for all of its site, or ''
const ignoredSiteOf = item => [...ignoredLinks.sites].find(site => onSite(item.url, site)) || '';
const linkIgnored = item => ignoredLinks.urls.has(item.url) || !!ignoredSiteOf(item);

// raw: as the background script found it, also when you said it's not dead
function linkCategory(item, raw = false) {
  if (!isWebPage(item)) return '';
  const entry = linkStates.get(item.url);
  if (!entry || entry.state == 'unknown') return 'unchecked';
  if (entry.state == 'ok') return entry.status >= 400 ? 'warn' : 'ok';
  return !raw && linkIgnored(item) ? 'ignored' : entry.state;
}

// Mended while Dead links is shown (the latest copy in the Wayback Machine, the new web address, Not dead): those stay
// in that list, with their new status code, till you choose another view (setView), instead of going away under your
// mouse. Their ids, as the index has them after (a new web address can give another link_id).
const mended = new Set();

// not dead (one link, or all of its site), or dead again; the list, Start and the side bar after it
async function ignoreLink(item, how) {
  if (how != 'none') mended.add(item.id);
  const site = hostOf(item.url);
  if (how == 'url') ignoredLinks.urls.add(item.url);
  if (how == 'site' && site) ignoredLinks.sites.add(site);
  if (how == 'none') {
    ignoredLinks.urls.delete(item.url);
    ignoredLinks.sites.delete(ignoredSiteOf(item));
  }
  await saveIgnoredLinks();
  show({keepScroll: true});
}

// the choices of the filter, in their order: also moved (redirected for good) and blocked (by a bot protection,
// background.js: classifyLink)
const LINKS = Object.fromEntries(['any', 'dead', 'unreachable', 'moved', 'blocked', 'warn', 'ok', 'unchecked']
  .map(key => [key, key == 'any' ? () => true : item => linkCategory(item) == key]));
const linksText = links => message('libraryLinks' + capitalized(links));

function linkStatus(item, title) {
  const button = element('button', 'link-status', '…');
  button.type = 'button';
  button.dataset.state = 'pending';
  const mark = (state, label, tip) => {
    button.dataset.state = state;
    button.textContent = label;
    button.title = tip || message('linkArchives');
    title.classList.toggle('dead', state == 'dead');
  };
  browser.runtime.sendMessage({type: 'checkLink', url: item.url}).then(({state, status, why, to}) => {
    // for the filter, the next time the list is drawn; and Dead links in the side bar counts it at once, when it is
    // dead now and wasn't, or the other way round
    const before = linkCategory(item);
    linkStates.set(item.url, {state, status, why, to});
    if (['dead', 'unreachable'].includes(before) != ['dead', 'unreachable'].includes(linkCategory(item))) sideSoon();
    // gone though it answers 200 (why: home, notfound, parked): GONE or PARKED, not 200
    const code = state == 'dead' && why == 'parked' ? 'PARKED' : state == 'dead' && why && why != 'status' ? 'GONE'
      : state == 'unreachable' ? 'ERR' : String(status);
    const ignored = (state == 'dead' || state == 'unreachable') && linkIgnored(item);
    if (ignored) mark('ignored', code, message('linkIgnoredTitle'));
    else if (state == 'dead' && why == 'home') mark('dead', code, message('linkGoneHomeTitle'));
    else if (state == 'dead' && why == 'notfound') mark('dead', code, message('linkGoneNotFoundTitle'));
    else if (state == 'dead' && why == 'parked') mark('dead', code, message('linkParkedTitle'));
    else if (state == 'dead') mark('dead', code, message('linkDeadTitle', code));
    else if (state == 'unreachable') mark('unreachable', code, message('linkUnreachableTitle'));
    else if (state == 'moved') mark('moved', '→', message('linkMovedTitle', to));
    else if (state == 'blocked') mark('blocked', 'BOT', message('linkBlockedTitle', String(status)));
    // 429: the site asked to slow down, after waiting too; not an error, asked again the next time
    else if (state == 'unknown' && status == 429) mark('unknown', '429', message('linkBusyTitle'));
    else if (state == 'unknown') mark('unknown', '?');
    else mark(status >= 400 ? 'warn' : 'ok', String(status));
  }).catch(() => mark('unknown', '?'));
  button.addEventListener('click', e => {
    e.stopPropagation();
    archiveMenu?.owner == button ? closeArchiveMenu() : showArchiveMenu(button, item);
  });
  return button;
}

// ---- all links checked at once (Dead links: Check all links) ----

// Those of your library not checked yet, or not lately (the background script forgets what it found after some days:
// background.js, LINK_KEEP): all of them asked of the background script (checkLink), as the list asks each one it
// draws, CHECK_ALL_AT_ONCE at a time (it checks LINK_CHECKS_AT_ONCE at once itself), so even without scrolling through
// the library each dead one is found. How far, and how many dead so far, in the status line, with Stop (start, stop);
// Dead links counts them at once (sideSoon). In this page: closing it stops it, and what was checked is kept.
const CHECK_ALL_AT_ONCE = 4;

const uncheckedLinks = () => liveItems().filter(item => checksLink(item) && linkCategory(item) == 'unchecked');

// Checking all links has a Stop of its own (the button of Check all links, while it runs), not the controller of the
// page: it only reads the pages of the links, so Bulk edit, Edit and the rest go on meanwhile, also for thousands.
let linkCheck = null;  // an AbortController while all links are checked

function showDeadBar() {
  const shown = state.view == 'dead' && !!settings.deadLinks;
  $('deadBar').hidden = !shown;
  if (!shown) return;
  const count = uncheckedLinks().length;
  $('deadIntro').textContent = count ? message('linksCheckAllIntro', String(count)) : message('linksAllChecked');
  $('checkAllLinks').hidden = !count && !linkCheck;
  $('checkAllLinks').textContent = message(linkCheck ? 'cleanupStop' : 'linksCheckAll');
}

async function checkAllLinks() {
  // a second click: Stop
  if (linkCheck) return linkCheck.abort();
  await loadLinkStates();
  const todo = uncheckedLinks();
  if (!todo.length) return showDeadBar();
  linkCheck = new AbortController();
  const signal = linkCheck.signal;
  showDeadBar();
  let done = 0, dead = 0, next = 0;
  const say = () => showStatus(message('linksChecking', [String(done), String(todo.length), String(dead)]));
  say();
  const worker = async () => {
    while (next < todo.length && !signal.aborted) {
      const item = todo[next++];
      const result = await browser.runtime.sendMessage({type: 'checkLink', url: item.url}).catch(() => null);
      if (signal.aborted) break;
      if (result) {
        linkStates.set(item.url, result);
        if (['dead', 'unreachable'].includes(linkCategory(item))) {
          dead++;
          sideSoon();
        }
      }
      done++;
      say();
    }
  };
  try {
    await Promise.all([...Array(CHECK_ALL_AT_ONCE)].map(worker));
  } finally {
    const wasStopped = signal.aborted;
    linkCheck = null;
    showStatus(message(wasStopped ? 'linksCheckStopped' : 'linksChecked', [String(done), String(dead)]));
    // not while Bulk edit or the like runs, which draws the list itself once it's done
    if (!controller) show({keepScroll: true});
    else showDeadBar();
  }
}


// the side bar again in a moment, once for many answers at once
let sideTimer = 0;
function sideSoon() {
  clearTimeout(sideTimer);
  sideTimer = setTimeout(() => safely('side bar', showTags), 300);
}

// ---- a dead link mended: its last copy in the Wayback Machine in its place, or a tag that says it's dead ----

const DEAD_TAG = 'dead-link';

// The last copy of a page in the Wayback Machine that worked (its availability API: archived_snapshots.closest), over
// https; '' when it has none, null when it doesn't answer
async function waybackCopy(url) {
  try {
    const response = await fetch('https://archive.org/wayback/available?' + new URLSearchParams({url}),
      {credentials: 'omit', signal: AbortSignal.timeout(20000)});
    const closest = (await response.json())?.archived_snapshots?.closest;
    return closest?.available && closest.url && /^2/.test(String(closest.status || '200'))
      ? closest.url.replace(/^http:/, 'https:') : '';
  } catch (e) {
    return null;
  }
}

// the bookmark at the web address of that copy, as Diigo's own edit window changes a web address (saveWithNewUrl)
// ---- a link that moved: its new web address in its place ----

// The bookmarks that moved (background.js: classifyLink, moved, to) at their new web address, as Diigo's own edit window
// changes one (saveWithNewUrl), one after the other: from the menu of the code of one, or all of them (Clean up on
// Start: All to the new address, which asks first). How far in the status line; what Diigo didn't take stays as it was.
async function useNewUrls(items) {
  const moved = items.filter(item => linkStates.get(item.url)?.state == 'moved' && linkStates.get(item.url).to);
  if (controller || !moved.length) return;
  start();
  let done = 0, failed = 0;
  try {
    for (const item of moved) {
      if (stopped) break;
      if (moved.length > 1) showStatus(message('bulkProgress', [String(done + failed), String(moved.length)]));
      const saved = await saveWithNewUrl(item, {
        url: linkStates.get(item.url).to, title: item.title, description: item.description,
        tags: joinTags(item.tags).trim(), private: item.private, unread: item.unread,
      });
      if (saved) mended.add(saved.id);
      saved ? done++ : failed++;
    }
  } finally {
    stop();
    const text = message('linkNewUrlUsed', String(done));
    showStatus(failed ? text + ' ' + message('bulkFailed', String(failed)) : text, !!failed);
    show({keepScroll: true});
  }
}

// which bookmark a message is about: its title (or web address), cut short when long
const namedInStatus = item => {
  const name = (item.title || item.url || '').trim();
  return name.length > 70 ? name.slice(0, 69) + '…' : name;
};

async function useWaybackCopy(item) {
  if (controller) return;
  const name = namedInStatus(item);
  showStatus(message('linkWaybackLooking', name));
  const copy = await waybackCopy(item.url);
  if (copy == null) return showStatus(message('linkWaybackNoAnswer', name), true);
  if (!copy) return showStatus(message('linkWaybackNone', name), true);
  const saved = await saveWithNewUrl(item, {
    url: copy, title: item.title, description: item.description, tags: joinTags(item.tags).trim(),
    private: item.private, unread: item.unread,
  });
  if (!saved) return showStatus(message('libraryUrlNotSaved'), true);
  mended.add(saved.id);
  showStatus(message('linkWaybackUsed', name));
  show({keepScroll: true});
}

async function tagDead(item) {
  if (controller) return;
  const signal = start();
  let result = {failed: 1};
  try {
    result = await editItems([item.id], {type: 'addTags', tags: [DEAD_TAG]}, signal, () => {});
  } finally {
    stop();
  }
  if (result.failed) showStatus(message('bulkFailed', String(result.failed)) + (diigoAnswer ? ' ' + diigoAnswer : ''), true);
  show({keepScroll: true});
}

// where to look up a page; {url} is the page, as is (both sites take it unencoded after their own path)
const ARCHIVES = [
  {message: 'archiveWaybackLatest', url: 'https://web.archive.org/web/{url}'},
  {message: 'archiveWaybackAll', url: 'https://web.archive.org/web/*/{url}'},
  {message: 'archiveTodayLatest', url: 'https://archive.is/newest/{url}'},
  {message: 'archiveTodayAll', url: 'https://archive.is/{url}'},
];

let archiveMenu = null;

// for a bookmark of the library that is dead or whose site doesn't answer, also what mends it (useWaybackCopy, tagDead),
// and Not dead (ignoreLink); for one you said is not dead, Count as dead again
function showArchiveMenu(button, item) {
  closeArchiveMenu();
  archiveMenu = element('div', 'archive-menu');
  archiveMenu.owner = button;
  for (const archive of ARCHIVES) {
    const link = element('a', '', message(archive.message));
    link.href = archive.url.replace('{url}', item.url);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.addEventListener('click', closeArchiveMenu);
    archiveMenu.append(link);
  }
  const action = (text, run) => {
    const choice = element('button', '', text);
    choice.type = 'button';
    choice.addEventListener('click', () => {
      closeArchiveMenu();
      run(item);
    });
    return choice;
  };
  const broken = ['dead', 'unreachable'].includes(button.dataset.state);
  // the page gone: its title searched on Google, to find where it went (between quotes, as a whole)
  const title = (item.title || '').trim();
  if (broken && title && title != item.url) {
    const search = element('a', '', message('linkSearchTitle'));
    search.href = 'https://www.google.com/search?' + new URLSearchParams({q: `"${title}"`});
    search.target = '_blank';
    search.rel = 'noopener noreferrer';
    search.addEventListener('click', closeArchiveMenu);
    archiveMenu.append(element('hr'), search);
  }
  const live = index.has(item.id) && !item.deletedAt && !item.pendingDelete;
  if (broken && live) {
    archiveMenu.append(element('hr'), action(message('linkUseWayback'), useWaybackCopy));
    if (!hasTag(item, DEAD_TAG)) archiveMenu.append(action(message('linkTagDead'), tagDead));
  }
  // moved: its new web address in its place (useNewUrl), or the latest copy in the Wayback Machine of the page as it
  // was, when the new address isn't the same page any more (a redirect to the home page of a site, say)
  const to = linkStates.get(item.url)?.to;
  if (button.dataset.state == 'moved' && live) {
    archiveMenu.append(element('hr'));
    if (to) archiveMenu.append(action(message('linkUseNewUrl'), () => useNewUrls([item])));
    archiveMenu.append(action(message('linkUseWayback'), useWaybackCopy));
  }
  const site = hostOf(item.url);
  if (broken) {
    archiveMenu.append(element('hr'), action(message('linkIgnore'), () => ignoreLink(item, 'url')));
    if (site) archiveMenu.append(action(message('linkIgnoreSite', site), () => ignoreLink(item, 'site')));
  } else if (button.dataset.state == 'ignored') {
    const text = ignoredLinks.urls.has(item.url) ? message('linkUnignore') : message('linkUnignoreSite', ignoredSiteOf(item));
    archiveMenu.append(element('hr'), action(text, () => ignoreLink(item, 'none')));
  }
  const box = button.getBoundingClientRect();
  archiveMenu.style.left = box.left + scrollX + 'px';
  archiveMenu.style.top = box.bottom + scrollY + 4 + 'px';
  document.body.append(archiveMenu);
}

function closeArchiveMenu() {
  archiveMenu?.remove();
  archiveMenu = null;
}

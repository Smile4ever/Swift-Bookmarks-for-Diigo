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
  // with the account of the browser too (settings.js: SYNCED_LISTS)
  const saved = (await loadKept([IGNORED_LINKS_KEY]).catch(() => ({})))[IGNORED_LINKS_KEY];
  ignoredLinks = {
    urls: new Set(Array.isArray(saved?.urls) ? saved.urls : []),
    sites: new Set(Array.isArray(saved?.sites) ? saved.sites : []),
  };
}

function saveIgnoredLinks() {
  const saved = {urls: [...ignoredLinks.urls], sites: [...ignoredLinks.sites]};
  return saveSettings({[IGNORED_LINKS_KEY]: saved}).catch(() => {});
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

// Mended while a list is shown (the latest copy in the Wayback Machine, the new web address, Not dead): those stay in
// that list, with their new status code, till you choose another view (setView), instead of going away under your
// mouse; also in a list they no longer match (the filter of moved links, Dead links). Their ids, as the index has them after (a new web address can give another link_id).
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

// With autoCheckLinks off (a choice of privacy on the options page): no request of its own, only what was found
// before (linkStates); a link not checked yet shows · and is checked with a click on it. Looking for dead links
// (huntDeadLinks) and Check all links are asking for it: they check by themselves.
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
  const ask = () => {
    mark('pending', '…');
    browser.runtime.sendMessage({type: 'checkLink', url: item.url}).then(showFound).catch(() => mark('unknown', '?'));
  };
  const known = linkStates.get(item.url);
  if (settings.autoCheckLinks) ask();
  // one that took too long before (unknown): as not checked, so a click asks again
  else if (known?.state && known.state != 'unknown') showFound(known);
  else mark('unchecked', '·', message('linkNotCheckedTitle'));
  button.addEventListener('click', e => {
    e.stopPropagation();
    if (button.dataset.state == 'unchecked') return ask();
    archiveMenu?.owner == button ? closeArchiveMenu() : showArchiveMenu(button, item);
  });
  return button;

  function showFound({state, status, why, to}) {
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
  }
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

// Find the first dead links, the other choice in the bar of Dead links next to Check all links: checked as that does, a
// few at a time, but among the links not checked yet in a random order, and only until HUNT_FOUND dead ones (or sites
// that don't answer) are found; each one found shows in the list at once. It stops too once all are checked, with
// Stop, or when another view is chosen. None with a hidden tag, which the list leaves out.
const HUNT_FOUND = 10;
let hunt = false;  // looking for dead links (checkLinks), not checking all

// how far checking or looking is, while it runs (checkLinks): {text, value, max}
let checkProgress = null;

// The bar above Dead links: how many links aren't checked, with Check all links; while checking or looking, what it
// does and how far, with a bar and Stop, here where it was started (and in the status bar, also elsewhere)
function showDeadBar() {
  const shown = state.view == 'dead' && !!settings.deadLinks;
  $('deadBar').hidden = !shown;
  if (!shown) return;
  const progress = $('deadProgress');
  progress.hidden = !linkCheck;
  const count = linkCheck ? 0 : uncheckedLinks().length;
  if (linkCheck) {
    $('deadIntro').textContent = (hunt ? message('linksHuntIntro', String(HUNT_FOUND)) + ' ' : '') +
      (checkProgress?.text || '');
    progress.max = checkProgress?.max || 1;
    progress.value = checkProgress?.value || 0;
  } else {
    $('deadIntro').textContent = count ? message('linksCheckChoice', [String(count), String(HUNT_FOUND)])
      : message('linksAllChecked');
  }
  // the choice, or Stop (the first button) while one of them runs
  $('checkAllLinks').hidden = !linkCheck && !count;
  $('checkAllLinks').textContent = message(linkCheck ? 'cleanupStop' : 'linksCheckAll');
  $('huntDeadLinks').hidden = !!linkCheck || !count;
  $('huntDeadLinks').textContent = message('linksHuntButton', String(HUNT_FOUND));
}

// the button of Dead links: Check all links, or Stop while it (or looking for dead links) runs
async function checkAllLinks() {
  if (linkCheck) return linkCheck.abort();
  await loadLinkStates();
  return checkLinks(uncheckedLinks());
}

async function huntDeadLinks() {
  if (linkCheck) return;
  await loadLinkStates();
  const todo = uncheckedLinks().filter(item => !item.tags.some(hiddenTag));
  if (!todo.length) return showStatus(message('libraryHuntNone'));
  return checkLinks(pickRandom(todo, todo.length), {until: HUNT_FOUND});
}

// until: stop once that many dead ones are found (looking for them, huntDeadLinks); else all of todo
async function checkLinks(todo, {until = 0} = {}) {
  if (!todo.length) return showDeadBar();
  linkCheck = new AbortController();
  hunt = !!until;
  const signal = linkCheck.signal;
  showDeadBar();
  let done = 0, dead = 0, next = 0;
  // how far: in the bar of Dead links and the status bar. Looking: found of HUNT_FOUND, else checked of all.
  const say = () => {
    const text = hunt ? message('linksHunting', [String(done), String(dead)])
      : message('linksChecking', [String(done), String(todo.length), String(dead)]);
    checkProgress = hunt ? {text, value: dead, max: until} : {text, value: done, max: todo.length};
    showStatus(text);
    safely('dead links', showDeadBar);
  };
  const enough = () => hunt && (dead >= until || state.view != 'dead');
  say();
  const worker = async () => {
    while (next < todo.length && !signal.aborted && !enough()) {
      const item = todo[next++];
      const result = await browser.runtime.sendMessage({type: 'checkLink', url: item.url}).catch(() => null);
      if (signal.aborted) break;
      if (result) {
        linkStates.set(item.url, result);
        if (['dead', 'unreachable'].includes(linkCategory(item))) {
          dead++;
          sideSoon();
          // in Dead links (looking for them, or checking all there): at the end of the list at once, the rest of it as
          // it is, so nothing moves under the mouse
          if (state.view == 'dead') safely('dead links', () => appendShown(item));
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
    const wasHunt = hunt;
    linkCheck = null;
    hunt = false;
    checkProgress = null;
    showStatus(wasHunt ? dead ? message('linksHunted', [String(done), String(dead)]) : message('linksHuntedNone', String(done))
      : message(wasStopped ? 'linksCheckStopped' : 'linksChecked', [String(done), String(dead)]));
    // in Dead links: the list as it is, with what was found added (appendShown); elsewhere drawn again, with the status
    // of each link, not while Bulk edit or the like runs, which draws the list itself once it's done
    if (state.view != 'dead' && !controller) show({keepScroll: true});
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
// changes one (saveWithNewUrl), one after the other: from the menu of the code of one, or those ticked in Bulk edit
// (library-bulk.js: bulkNewUrl, which asks first). How far in the status line; what Diigo didn't take stays as it was.
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

// The same archives for every link of the library (and the latest copy in its place, useWaybackCopy); for one that is
// dead or whose site doesn't answer also its title searched, a tag that says so (tagDead) and Not dead (ignoreLink); for
// one you said is not dead, Count as dead again
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
  // The archives are the same for every link, whatever its status: the copies above, and the latest copy in the
  // Wayback Machine in its place (useWaybackCopy), also for one that works (a page that changed into something else
  // answers 200 too). Moved: also its new web address in its place (useNewUrl).
  const to = linkStates.get(item.url)?.to;
  if (live) {
    archiveMenu.append(element('hr'));
    if (button.dataset.state == 'moved' && to) archiveMenu.append(action(message('linkUseNewUrl'), () => useNewUrls([item])));
    archiveMenu.append(action(message('linkUseWayback'), useWaybackCopy));
  }
  // only for one that is gone: a tag that says so
  if (broken && live && !hasTag(item, DEAD_TAG)) archiveMenu.append(action(message('linkTagDead'), tagDead));
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

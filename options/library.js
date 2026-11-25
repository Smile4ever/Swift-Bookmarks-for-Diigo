// Your library, as on diigo.com, but from the index of library-index.js (a copy of your library in this browser),
// so searching, sorting and the tags work at once, also with thousands of bookmarks. A search on a field you choose (or
// all of them), filters by tag and site from a click on them, and the tags of what is shown at the side. The list grows
// as you scroll, LIST_STEP at a time. What is shown is kept in the address (#…), so reloading or going back keeps it.
// The search box takes -word for what is not in it, and + keeps it as a filter. Bulk edit: changing or deleting
// several bookmarks at once.

const $ = id => document.getElementById(id);

document.documentElement.lang = browser.i18n.getUILanguage();
for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = message(el.dataset.i18n);
for (const el of document.querySelectorAll('[data-i18n-label]')) {
  el.setAttribute('aria-label', message(el.dataset.i18nLabel));
}
for (const el of document.querySelectorAll('[data-i18n-title]')) el.title = message(el.dataset.i18nTitle);

// the name of the add-on after what the tab shows (library-list.js: showTitle), also before the index is there
const TITLE_SUFFIX = ' - Swift Bookmarks for Diigo';
document.title += TITLE_SUFFIX;

const LIST_STEP = 50;

let controller = null;  // while building, updating or deleting
let indexStale = false; // the background script changed the index meanwhile: read again after (library-page.js)
let stopped = false;    // by you, with Stop
let user = '';          // signed in on diigo.com
let settings = DEFAULT_SETTINGS;  // see options/settings.js: hiddenTags

const hiddenTag = tag => isHiddenTag(settings, tag);


// ---- whatever goes wrong: shown in #problem, and the rest of the page goes on ----

// Each part of the page (the list, a bookmark in it, the filters, the side bar, the menu, the count) is drawn on its
// own (safely): one that fails leaves the others as they are. The problem shows in a bar at the top, with what Diigo
// or the browser said, and in the console.
const problems = new Set();

function reportProblem(error, where) {
  logError('Swift Library' + (where ? ': ' + where : ''), error);
  const what = error?.message || String(error ?? '');
  problems.add(what);
  try {
    $('problem').textContent = message('libraryProblem', [...problems].slice(-3).join(' · ')) || what;
    $('problem').hidden = false;
  } catch (e) {
    // the page itself is gone: the console has it
  }
}

function safely(where, fn, fallback) {
  try {
    return fn();
  } catch (e) {
    reportProblem(e, where);
    return fallback;
  }
}

addEventListener('error', e => reportProblem(e.error || e.message, 'error'));
addEventListener('unhandledrejection', e => reportProblem(e.reason, 'promise'));


// ---- the index ----

function start() {
  controller = new AbortController();
  stopped = false;
  $('indexBuildNow').hidden = true;
  $('stop').hidden = false;
  showNotice();
  safely('bulk edit', showPicked);
  return controller.signal;
}

function stop() {
  controller = null;
  $('stop').hidden = true;
  showIndex();
  safely('bulk edit', showPicked);
  if (indexStale) setTimeout(readIndexAgain);
}

// what was done goes by itself after a while; what went wrong stays until × (or the next message)
const STATUS_TIME = 6000;
let statusTimer = 0;

function showStatus(text, error) {
  // what goes wrong, as said to you, in the log too (settings.js: logError)
  if (text && error) logError('Swift Library', text);
  $('status').textContent = text;
  $('status').classList.toggle('error', !!error);
  clearTimeout(statusTimer);
  // not while the trash is emptied (library-trash.js: emptyTrash) or links are checked (library-links.js: linkCheck),
  // which say how far: one link can take longer than STATUS_TIME
  if (text && !error) {
    statusTimer = setTimeout(() => !controller && !emptying && !deletingPending && !linkCheck && showStatus(''), STATUS_TIME);
  }
  showNotice();
}

// a bar of how far after the message, while Diigo deletes what waited in the trash (library-delete.js: deletePending)
// or the trash is emptied (library-trash.js: showEmptying); total null: gone
function showNoticeProgress(done, total) {
  const bar = $('noticeProgress');
  bar.hidden = total == null;
  if (total == null) return;
  bar.max = Math.max(total, 1);
  bar.value = Math.min(done, total);
}

// the bar below the blue one, only when there is something to say: no index (yet), the index busy, or a message; not
// while #setup says it in the place of the library
// With the library shown it is always there, with how many items it has (showTotal), so the page doesn't jump when a
// message comes or goes; a message takes the place of that number while it is there.
function showNotice() {
  $('noticeClose').hidden = !$('status').textContent || !!controller;
  const saying = !!($('indexStatus').textContent || $('status').textContent);
  $('libraryTotal').hidden = saying || !$('libraryTotal').textContent;
  $('notice').hidden = !$('setup').hidden || !saying && $('libraryTotal').hidden &&
    $('indexBuildNow').hidden && $('stop').hidden;
}

// how many items the Diigo library has: all of them, those with a hidden tag too, but not what Diigo deletes in a
// moment (liveItems); only with the library shown
function showTotal() {
  const shown = indexReady(user) && !$('main').hidden;
  // with Outliners shown: how many outliners (library-outliners.js)
  $('libraryTotal').textContent = !shown ? '' : state.view == 'outliners' ? outlinerPart.totalText()
    : message('homeTotal', new Intl.NumberFormat(browser.i18n.getUILanguage()).format(liveItems().length));
  showNotice();
}


// ---- the first time: the index built by itself, in the place of the library ----

// While there is no index to show (none yet, of an older version or of someone else), the page builds it by itself
// (library-page.js) and #setup says so in the place of the library: how many items it has, how long it still takes, and
// Stop. Else why there is none: signed out (Sign in on diigo.com), it failed (what Diigo or the browser said, Try
// again) or it was stopped (Build index).
const setup = {state: 'building', done: 0, total: 0, pages: 0, of: 0, started: 0, error: ''};
// how often the list is drawn again while the first index is being built (build): often enough to see it fill, not so
// often that a large library redraws it on every page
const BUILD_REDRAW = 600;
const lang = browser.i18n.getUILanguage();

// 40 seconds, 3 minutes
function duration(ms) {
  const seconds = Math.max(1, Math.round(ms / 1000));
  const [value, unit] = seconds < 90 ? [seconds, 'second'] : [Math.round(seconds / 60), 'minute'];
  return new Intl.NumberFormat(lang, {style: 'unit', unit, unitDisplay: 'long'}).format(value);
}

function showSetup() {
  const shown = !indexReady(user);
  $('setup').hidden = !shown;
  if (!shown) return showNotice();
  const state = !user ? 'signedOut' : controller ? 'building' : setup.state;
  const texts = {
    signedOut: ['setupSignedOutTitle', 'setupSignedOutText'],
    building: ['setupBuildingTitle', 'setupBuildingText'],
    failed: ['setupFailedTitle', 'setupBuildingText'],
    stopped: ['setupStoppedTitle', 'indexStopped'],
  }[state];
  $('setupTitle').textContent = message(texts[0]);
  $('setupText').textContent = message(texts[1]);
  $('setup').dataset.state = state;

  const building = state == 'building';
  $('setupProgressBox').hidden = !building;
  if (building) {
    const progress = $('setupProgress');
    // before the first page: no bar of how far, only that it goes
    if (setup.of) progress.value = setup.pages / setup.of;
    else progress.removeAttribute('value');
    const number = new Intl.NumberFormat(lang);
    const count = setup.total ? message('setupProgress', [number.format(setup.done), number.format(setup.total)])
      : message('setupStarting');
    // how long still, from how long the pages so far took; once there are a few
    const left = setup.pages >= 3 && setup.pages < setup.of
      ? ' · ' + message('setupTimeLeft', duration((Date.now() - setup.started) / setup.pages * (setup.of - setup.pages)))
      : '';
    $('setupCount').textContent = count + left;
  }
  $('setupError').hidden = state != 'failed';
  $('setupError').textContent = state == 'failed' ? setup.error : '';
  $('setupBuild').hidden = state != 'failed' && state != 'stopped';
  $('setupBuild').textContent = message(state == 'failed' ? 'setupRetry' : 'indexBuild');
  $('setupSignIn').hidden = state != 'signedOut';
  $('setupStop').hidden = !building || !controller;
  showNotice();
}

function showIndex() {
  const ready = indexReady(user);
  $('main').hidden = !ready;
  safely('setup', showSetup);
  placeAddTypes();
  $('indexBuildNow').hidden = ready || !!controller;
  $('indexBuildNow').disabled = !user;
  const text = indexStatusText(user) +
    (indexProblem ? ' ' + message('indexUnavailable', indexProblem.message || String(indexProblem)) : '');
  // in the bar only when there is no index to use, or it couldn't be kept (Swift Options says it always)
  $('indexStatus').textContent = !ready || indexProblem ? text : '';
  // also when the library shows only now, after building the index the first time
  safely('total', showTotal);
}

// keepScroll: built again by itself (checkCount), so the list stays where you are; then also the count asked again
async function build({keepScroll = false} = {}) {
  Object.assign(setup, {state: 'building', done: 0, total: 0, pages: 0, of: 0, started: Date.now(), error: ''});
  const signal = start();
  safely('setup', showSetup);
  // the first build (live): the list shows the items as they load (buildIndex sets the index straight away), not a
  // longer wait on the setup screen; drawn again at most every BUILD_REDRAW ms, so a large library doesn't redraw it
  // on every page
  let lastDrawn = 0;
  try {
    const gone = await buildIndex(user, signal, (pages, of, total, live) => {
      showStatus(message('indexBuilding', [String(pages), String(of)]));
      Object.assign(setup, {pages, of, total, done: Math.min(total, pages * PAGE_SIZE)});
      safely('setup', showSetup);
      if (live && (pages == 1 || pages == of || Date.now() - lastDrawn > BUILD_REDRAW)) {
        lastDrawn = Date.now();
        // the index is ready to show now (buildIndex set meta): un-hide the list in the place of the setup screen
        safely('building list', () => {
          showIndex();
          show({keepScroll: true});
        });
      }
      // far fewer than before (library-index.js: SHRINK_LIMIT): asked, unless built by itself (checkCount), when
      // the index stays as it was
    }, {allowShrink: (count, before) => !keepScroll && confirm(message('indexShrinkConfirm', [String(count), String(before)]))});
    // what Diigo no longer has: in the trash, and said so
    showStatus(gone ? message('indexGoneToTrash', String(gone)) : '');
    show({keepScroll});
    if (keepScroll && meta.total != index.size) checkCount();
  } catch (e) {
    showStatus(stopped ? message('indexStopped') : e?.message || String(e), !stopped);
    Object.assign(setup, {state: stopped ? 'stopped' : 'failed', error: e?.message || String(e)});
  } finally {
    stop();
  }
}

// when Diigo has another number of items than the index after it, it is built again (checkCount)
async function update() {
  if (!meta?.newest || !indexReady(user)) return build();
  const signal = start();
  try {
    const total = await updateIndex(signal, page => showStatus(message('indexUpdating', String(page))));
    showStatus('');
    show({keepScroll: true});
    if (total != index.size) checkCount();
  } catch (e) {
    showStatus(stopped ? message('indexStopped') : e?.message || String(e), !stopped);
  } finally {
    stop();
  }
}

// Diigo counts a bookmark just saved a moment later than it lists it (its total lags behind), so another number than
// the index is asked again after a while; only what still differs then was changed on diigo.com itself, out of sight of
// the add-on (deleted there, mostly). The index is then built again by itself, once while the page is open: you
// wouldn't do that yourself. Only when it still differs after that, a message says so.
let countCheck = 0;
let rebuiltForCount = false;
function checkCount() {
  clearTimeout(countCheck);
  countCheck = setTimeout(async () => {
    const page = await libraryPage(0, 'updated', new AbortController().signal).catch(() => null);
    const total = page?.total;
    if (!total || controller || total == index.size) return;
    if (!rebuiltForCount) {
      rebuiltForCount = true;
      return build({keepScroll: true});
    }
    showStatus(message('indexDiffers', [String(total), String(index.size)]), true);
  }, 10000);
}

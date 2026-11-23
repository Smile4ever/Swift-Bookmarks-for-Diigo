// The Log card of the options page: the errors of the add-on that background.js keeps in storage.session (addLogEntry),
// as Neat URL keeps what it cleaned: the last LOG_MAX, in memory only, so the log is empty after the browser restarts.
// A filter on what is shown, Clear log, and Save log for a bug report: a file with the errors shown and what helps to
// find them (version, browser, platform, language, settings without your own lists), to attach to an issue on GitHub.
// Loaded after options.js, whose $ and message it uses.

const ERROR_LOG = 'errorLog';
const ERROR_LOG_SINCE = 'errorLogSince';
let logEntries = [];
let logSince = null;

function logTime(time) {
  const date = new Date(time);
  return new Date().toDateString() == date.toDateString() ? date.toLocaleTimeString() : date.toLocaleString();
}

function shownLogEntries() {
  const filter = $('logFilter').value.trim().toLowerCase();
  return logEntries.filter(entry => !filter ||
    [entry.where, entry.what, entry.details, entry.page].some(text => String(text || '').toLowerCase().includes(filter)));
}

function logElement(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}

// the newest first: when, where (the part of the add-on, and the page), what, and the details
function showLog() {
  const shown = shownLogEntries();
  $('logList').replaceChildren(...shown.slice().reverse().map(entry => {
    const li = logElement('li');
    const meta = logElement('div', 'log-meta');
    meta.append(logElement('span', 'log-time', logTime(entry.time)), logElement('span', 'log-where', entry.where));
    if (entry.page) meta.append(logElement('span', 'log-page', entry.page));
    li.append(meta, logElement('div', 'log-what', entry.what));
    if (entry.details) li.append(logElement('pre', 'log-details', entry.details));
    return li;
  }));
  $('logList').hidden = !shown.length;
  $('logClear').disabled = !logEntries.length;
  $('logEmpty').hidden = shown.length > 0;
  $('logEmpty').textContent = logEntries.length ? message('logNoMatch')
    : logSince ? message('logEmptySince', logTime(logSince)) : message('logEmpty');
  $('logCount').textContent = logEntries.length ? `(${logEntries.length})` : '';
}

async function loadLog() {
  const saved = await browser.storage.session.get([ERROR_LOG, ERROR_LOG_SINCE]).catch(() => ({}));
  logEntries = saved[ERROR_LOG] || [];
  logSince = saved[ERROR_LOG_SINCE] || null;
  showLog();
}

// What helps with a bug report; your own lists (hidden tags, folders) stay out
const PRIVATE_SETTINGS = ['hiddenTags', 'alsoHiddenTags', 'syncFolders'];

async function technicalDetails() {
  const settings = await loadSettings().catch(() => ({}));
  for (const key of PRIVATE_SETTINGS) delete settings[key];
  return {
    version: browser.runtime.getManifest().version,
    browser: await browser.runtime.getBrowserInfo?.().catch(() => null) || null,
    platform: await browser.runtime.getPlatformInfo().catch(() => null),
    userAgent: navigator.userAgent,
    language: browser.i18n.getUILanguage(),
    settings,
  };
}

// a file with the errors shown (the filter applies) and the details above; not translated: it is for GitHub
async function saveLog() {
  const saved = new Date().toISOString();
  const data = {
    format: 'swift-bookmarks-for-diigo-log', saved, ...await technicalDetails(),
    since: logSince ? new Date(logSince).toISOString() : null, filter: $('logFilter').value.trim(),
    entries: shownLogEntries().map(entry => ({...entry, time: new Date(entry.time).toISOString()})),
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'}));
  const link = Object.assign(document.createElement('a'), {
    href: url, download: `swift-bookmarks-for-diigo-log-${saved.slice(0, 19).replace(/[T:]/g, '-')}.json`,
  });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function clearLog() {
  if (logEntries.length && !confirm(message('logClearConfirm', String(logEntries.length)))) return;
  browser.storage.session.remove(ERROR_LOG).catch(() => {});
  browser.storage.session.set({[ERROR_LOG_SINCE]: Date.now()}).catch(() => {});
}

$('logFilter').placeholder = message('logFilter');
$('logFilter').addEventListener('input', showLog);
$('logSave').addEventListener('click', () => saveLog().catch(e => logError('Log', e)));
$('logClear').addEventListener('click', clearLog);
// new errors show as they come
browser.storage.onChanged.addListener((changes, area) => {
  if (area != 'session' || !(ERROR_LOG in changes || ERROR_LOG_SINCE in changes)) return;
  if (ERROR_LOG in changes) logEntries = changes[ERROR_LOG].newValue || [];
  if (ERROR_LOG_SINCE in changes) logSince = changes[ERROR_LOG_SINCE].newValue || null;
  showLog();
});
loadLog();

// The limit test of Swift Tools (tools.html: #limitTest), only in a development install (loaded as a temporary add-on in
// Firefox, unpacked in Chrome): count bookmarks saved one after the other to the account you're signed in with, as the
// bookmark form saves them (background.js: testSave), to see where Diigo stops a free account and what it answers then
// (TODO.md: the free limit). Private, at LIMIT_TEST_URL/<n>, with LIMIT_TEST_TAG, so they are easy to find and delete
// in the Swift Library afterwards. The numbers go on where the last run stopped: the next one is kept per account in
// this browser (LIMIT_TEST_NEXT), as the same web address again would change that bookmark instead of adding one.

const LIMIT_TEST_TAG = 'swift-limit-test';
const LIMIT_TEST_URL = 'https://example.com/swift-limit-test';
const LIMIT_TEST_NEXT = 'limitTestNext';  // storage.local: {<user>: the next number}

let limitStop = false;

async function limitNext() {
  const {[LIMIT_TEST_NEXT]: next = {}} = await browser.storage.local.get(LIMIT_TEST_NEXT).catch(() => ({}));
  return next;
}

async function keepLimitNext(n) {
  const next = await limitNext();
  await browser.storage.local.set({[LIMIT_TEST_NEXT]: {...next, [user]: n}}).catch(() => {});
}

// the box Start at: where the last run of this account stopped
async function showLimitFrom() {
  if (!user) return;
  $('limitFrom').value = (await limitNext())[user] || 1;
}

async function runLimitTest() {
  const from = Math.max(1, parseInt($('limitFrom').value, 10) || 1);
  const count = Math.min(5000, Math.max(1, parseInt($('limitCount').value, 10) || 0));
  const pause = Math.min(10000, Math.max(0, parseInt($('limitPause').value, 10) || 0));
  if (!user) return showLimitStatus('Sign in on diigo.com first.');
  const last = from + count - 1;
  if (!confirm(`Save ${count} test bookmarks (#${from} to #${last}) to the Diigo account ${user}?`)) return;
  limitStop = false;
  $('limitStart').hidden = true;
  $('limitStop').hidden = false;
  $('limitAnswer').hidden = true;
  const started = Date.now();
  let saved = 0;
  try {
    for (let n = from; n <= last && !limitStop; n++) {
      const bm = {url: `${LIMIT_TEST_URL}/${n}`, title: `Swift limit test #${n}`, description: '',
        tags: [LIMIT_TEST_TAG], private: true, unread: false};
      const result = await browser.runtime.sendMessage({type: 'testSave', bm}).catch(e => ({error: String(e)}));
      if (!result?.ok) {
        showLimitStatus(`Stopped at #${n}: ${saved} saved in this run. Diigo answered:`);
        $('limitAnswer').textContent = JSON.stringify(result ?? 'no answer (not a development install?)', null, 2);
        $('limitAnswer').hidden = false;
        return;
      }
      saved++;
      // kept after each one, so a closed tab or Stop goes on from here too
      await keepLimitNext(n + 1);
      $('limitFrom').value = n + 1;
      showLimitStatus(`#${n} saved: ${saved} / ${count} in this run (${Math.round((Date.now() - started) / 1000)} s)`);
      if (pause && n < last) await new Promise(resolve => setTimeout(resolve, pause));
    }
    showLimitStatus(`${limitStop ? 'Stopped' : 'Done'}: ${saved} of ${count} saved, up to #${from + saved - 1}; next #${from + saved}.`);
  } finally {
    $('limitStart').hidden = false;
    $('limitStop').hidden = true;
  }
}

function showLimitStatus(text) {
  $('limitStatus').textContent = text;
}

browser.management.getSelf().then(self => {
  if (self.installType != 'development') return;
  $('limitTest').hidden = false;
  $('limitStart').addEventListener('click', runLimitTest);
  $('limitStop').addEventListener('click', () => limitStop = true);
  // once tools.js knows who you are, and when that changes
  let tries = 0;
  const shown = setInterval(() => {
    if (!user && ++tries < 50) return;
    clearInterval(shown);
    showLimitFrom();
  }, 200);
  browser.runtime.onMessage.addListener(request => {
    if (request?.type == 'userChanged') setTimeout(showLimitFrom);
  });
}).catch(() => {});

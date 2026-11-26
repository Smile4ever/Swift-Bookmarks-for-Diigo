// A PDF opened from the Swift Library (pages/library-edit.js: viewPdf adds #swift-pdf to its address): shown with
// the browser's own PDF viewer instead of Diigo's reader. Runs in the page itself (manifest.json: world MAIN, at
// document_start) on all of www.diigo.com, as Diigo sends /item/pdf/… on to the item's page (/user/<you>/b/<id>) and
// the flag goes along; without the flag it does nothing, so Download on diigo.com itself still downloads.
// At once an overlay "Loading PDF…" over the page. When Diigo's page shows the PDF in a frame from a blob: address,
// the tab opens that blob URL itself. Otherwise Diigo's Download Original PDF button (#download, or #secondaryDownload
// of pdf.js; in the page or in its reader frame when that is of diigo.com too) is clicked, and the download it starts
// is caught before it is saved: its file (a blob, or fetched here with your sign-in when it is a web address) is opened
// in the tab the same way. Comes no download, the file the reader frame opens (its ?file=) is.

// The file of a PDF for the trash or Recreate (background.js: readerPdfUrl opens its page with #swift-pdf-file in a tab
// in the background): the signed address Diigo's reader loads the PDF from, caught as the reader asks it (fetch,
// XMLHttpRequest), or seen in the list of what the page loaded or in the address of a frame, whichever comes first; sent
// to diigo-site.js (postMessage), which gives it to background.js (pdfFound). Nothing is shown or clicked.
(() => {
  const FLAG = '#swift-pdf-file';
  if (location.hash != FLAG) return;
  history.replaceState(history.state, '', location.href.slice(0, -FLAG.length));
  const LINK = /https:\/\/s3\.amazonaws\.com\/diigo\/[^"'<>\s)]+/;
  let sent = false;
  const found = value => {
    const url = String(value || '').match(LINK)?.[0];
    if (sent || !url) return;
    sent = true;
    window.postMessage({swiftPdfFile: url}, location.origin);
  };
  const fetchBefore = window.fetch;
  window.fetch = function (input, init) {
    found(typeof input == 'string' ? input : input?.url || String(input));
    return fetchBefore.call(this, input, init);
  };
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    found(url);
    return open.call(this, method, url, ...rest);
  };
  const started = Date.now();
  const timer = setInterval(() => {
    for (const entry of performance.getEntriesByType('resource')) found(entry.name);
    for (const frame of document.querySelectorAll('iframe, embed, object')) {
      const src = frame.src || frame.data || '';
      found(src);
      try {
        found(decodeURIComponent(new URL(src, location.href).searchParams.get('file') || ''));
      } catch (e) {
      }
    }
    if (sent || Date.now() - started > 30000) clearInterval(timer);
  }, 250);
})();

(() => {
  const FLAG = '#swift-pdf';
  if (location.hash != FLAG) return;
  // the flag out of the address, so Diigo doesn't see it
  history.replaceState(history.state, '', location.href.slice(0, -FLAG.length));

  const WAIT = 30000;     // how long it may take altogether, ms
  const NO_CLICK = 6000;  // after the click this long without a download: the reader's ?file= instead
  const TOP = 'position:fixed;z-index:2147483647;';
  // the words, from diigo-site.js (this page has no browser.i18n); read when needed, as it may come later
  const word = (key, fallback) => document.documentElement.dataset[key] || fallback;

  let caught = false;  // the one download that is turned into showing
  let done = false;

  // ---- the overlay while it loads ----
  const overlay = document.createElement('div');
  overlay.style.cssText = TOP + 'inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;' +
    'gap:12px;background:#fff;color:#333;font:16px system-ui,sans-serif';
  const status = document.createElement('div');
  const close = document.createElement('a');
  close.href = '#';
  close.style.display = 'none';
  close.addEventListener('click', e => {
    e.preventDefault();
    overlay.remove();
  });
  overlay.append(status, close);
  const loadingText = () => {
    if (!done) status.textContent = word('swiftPdfLoading', 'Loading PDF…');
  };
  loadingText();
  document.documentElement.append(overlay);

  function failed() {
    if (done) return;
    done = true;
    status.textContent = word('swiftPdfFailed', "The PDF couldn't be loaded here.");
    close.textContent = word('swiftPdfReader', "Diigo's reader");
    close.style.display = '';
  }

  // ---- the file shown ----
  async function show(href, name) {
    let url = href;
    if (!/^blob:/i.test(href)) {
      const answer = await fetch(href, {credentials: 'include'});
      if (!answer.ok) throw new Error(answer.status);
      url = URL.createObjectURL(new Blob([await answer.arrayBuffer()], {type: 'application/pdf'}));
    }
    done = true;
    // only the PDF: the tab opens the blob URL itself, in the browser's own PDF viewer (with its download button)
    location.replace(url);
  }

  // the blob of a PDF that Diigo's page already shows in a frame (iframe, embed or object with a blob: address), in
  // this page or in a frame of diigo.com in it
  function shownBlob() {
    for (const win of windows()) {
      for (const frame of win.document.querySelectorAll('iframe, embed, object')) {
        const src = frame.src || frame.data || '';
        if (/^blob:/i.test(src)) return src;
      }
    }
    return '';
  }

  // ---- the download caught: in this page and in a reader frame of diigo.com ----
  function catchDownload(a, win) {
    if (caught || !(a instanceof win.HTMLAnchorElement) || !a.href) return false;
    if (!a.hasAttribute('download') && !/^blob:/i.test(a.href)) return false;
    caught = true;
    show(a.href, a.getAttribute('download')).catch(() => {
      // not shown after all: then saved, as the button meant
      caught = 'failed';
      failed();
      a.click();
    });
    return true;
  }
  function watch(win) {
    if (win.swiftPdfWatched) return;
    win.swiftPdfWatched = true;
    const click = win.HTMLAnchorElement.prototype.click;
    win.HTMLAnchorElement.prototype.click = function () {
      if (catchDownload(this, win)) return;
      return click.call(this);
    };
    const dispatch = win.EventTarget.prototype.dispatchEvent;
    win.EventTarget.prototype.dispatchEvent = function (event) {
      if (event?.type == 'click' && catchDownload(this, win)) return false;
      return dispatch.call(this, event);
    };
    win.document.addEventListener('click', e => {
      const a = e.target?.closest?.('a');
      if (a && catchDownload(a, win)) e.preventDefault();
    }, true);
    const open = win.open;
    win.open = function (url, ...rest) {
      if (!caught && url && /^blob:|\.pdf([?#]|$)/i.test(String(url))) {
        caught = true;
        show(new URL(String(url), win.location.href).href, '').catch(() => {
          caught = 'failed';
          failed();
          open.call(win, url, ...rest);
        });
        return null;
      }
      return open.call(this, url, ...rest);
    };
  }
  watch(window);

  // this page and the frames of diigo.com in it (others can't be reached)
  function windows() {
    const found = [window];
    for (const frame of document.querySelectorAll('iframe, frame')) {
      try {
        if (frame.contentWindow?.document) found.push(frame.contentWindow);
      } catch (e) {
        // a frame of another site
      }
    }
    return found;
  }
  // the PDF a reader frame opens (pdf.js: viewer.html?file=…)
  function readerFile() {
    for (const frame of document.querySelectorAll('iframe, embed, object')) {
      const src = frame.src || frame.data || '';
      try {
        const file = new URL(src, location.href).searchParams.get('file');
        if (file) return new URL(file, src).href;
      } catch (e) {
      }
      if (/\.pdf([?#]|$)/i.test(src)) return new URL(src, location.href).href;
    }
    return '';
  }

  // ---- the button, clicked once it is there ----
  const started = Date.now();
  let clickedAt = 0;
  const timer = setInterval(() => {
    loadingText();
    if (done || caught) return clearInterval(timer);
    const now = Date.now();
    // Diigo shows the PDF from a blob already: that one opened, no button needed
    const blob = shownBlob();
    if (blob) {
      caught = true;
      clearInterval(timer);
      show(blob, '');
      return;
    }
    if (!clickedAt) {
      for (const win of windows()) {
        watch(win);
        const button = win.document.getElementById('download') || win.document.getElementById('secondaryDownload');
        if (button && !button.disabled) {
          clickedAt = now;
          button.click();
          return;
        }
      }
    }
    // no button, or one that started no download that could be caught: the file of the reader frame itself
    if (clickedAt && now - clickedAt > NO_CLICK || !clickedAt && now - started > NO_CLICK) {
      const file = readerFile();
      if (file) {
        caught = true;
        clearInterval(timer);
        show(file, '').catch(failed);
        return;
      }
    }
    if (now - started > WAIT) {
      clearInterval(timer);
      failed();
    }
  }, 250);
})();

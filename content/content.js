// Put in the page by background/background.js when the form opens: shows form/form.html in an iframe in the top right corner.
// It can be put in the same page more than once, so it only sets itself up the first time.
globalThis.browser = globalThis.browser || globalThis.chrome;

(() => {
  if (window.diigoForm) return;
  window.diigoForm = true;

  // not new URL(...).origin: that is "null" for moz-extension:// in some Firefox versions
  const formOrigin = browser.runtime.getURL('').replace(/\/$/, '');
  const frameStyle = {
    position: 'fixed', top: '0', right: '0', width: '460px', 'max-width': '100vw', height: '520px',
    border: 'none', margin: '0', padding: '0', background: 'transparent',
    // otherwise Firefox paints the iframe opaque on dark pages
    'color-scheme': 'light',
    'z-index': '2147483644',
  };
  let frame = null;
  let frameUrl = '';  // the url the form is about

  // What the page says of itself, for the form: its description (as search engines and social sites show it), its
  // keywords (meta keywords, article:tag, the keywords of JSON-LD) and the web address it calls its own (rel=canonical).
  // A link (the right-click menu) has these from background.js: pageInfo, from its HTML.
  const KEYWORDS_MAX = 40;

  function pageInfo() {
    const meta = selector => document.querySelector(selector)?.content?.trim() || '';
    const description = meta('meta[property="og:description"]') || meta('meta[name="description" i]') ||
      meta('meta[name="twitter:description" i]');
    const keywords = [];
    for (const el of document.querySelectorAll('meta[name="keywords" i], meta[name="news_keywords" i]')) {
      keywords.push(...(el.content || '').split(','));
    }
    for (const el of document.querySelectorAll('meta[property="article:tag"], meta[property="video:tag"], meta[property="book:tag"]')) {
      keywords.push(el.content || '');
    }
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const found = [JSON.parse(script.textContent)].flat(2).flatMap(data => [data, ...data?.['@graph'] || []]);
        for (const data of found) {
          const words = data?.keywords;
          keywords.push(...Array.isArray(words) ? words.map(String) : typeof words == 'string' ? words.split(',') : []);
        }
      } catch (e) {
        // not JSON after all
      }
    }
    const canonical = document.querySelector('link[rel="canonical" i]')?.href || '';
    return {
      description,
      keywords: [...new Set(keywords.map(word => word.trim()).filter(Boolean))].slice(0, KEYWORDS_MAX),
      canonical,
    };
  }

  function open(link) {
    const url = link ? link.url : location.href;
    // the form was hidden: show it again as it was
    if (isHidden() && url == frameUrl) return show();

    // Save page to Diigo of the right-click menu is a link to this page itself
    const info = link && link.url != location.href ? link : pageInfo();
    const query = new URLSearchParams({
      url,
      title: (link ? link.title : document.title) || '',
      selection: String(getSelection()),
      description: (info.description || '').slice(0, 1000),
      keywords: (info.keywords || []).join('\n'),
      canonical: info.canonical || '',
    });
    if (!frame) {
      frame = document.createElement('iframe');
      for (const [name, value] of Object.entries(frameStyle)) frame.style.setProperty(name, value, 'important');
      frame.addEventListener('load', () => frame.focus());
      (document.body || document.documentElement).append(frame);
    }
    frame.style.removeProperty('display');
    frame.src = browser.runtime.getURL('form/form.html') + '?' + query;
    frameUrl = url;
    guardCount = 0;
    guardFocus();
  }

  function close() {
    frame?.remove();
    frame = null;
  }

  // hidden keeps what was typed in the form, close doesn't
  const isHidden = () => frame?.style.getPropertyValue('display') == 'none';

  function hide() {
    frame.style.setProperty('display', 'none', 'important');
  }

  function show() {
    frame.style.removeProperty('display');
    frame.focus();
  }

  // going to another tab hides the form
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && frame) hide();
  });

  // A page that is still loading may focus a field of its own and take the keyboard away from the form.
  // For 3 seconds (again after the page has loaded) the focus goes back to the form, unless the user clicks on the page.
  let guardUntil = 0, guardCount = 0;
  const guardFocus = () => guardUntil = Date.now() + 3000;

  addEventListener('load', () => frame && guardFocus());
  document.addEventListener('mousedown', () => guardUntil = 0, true);
  document.addEventListener('focusin', e => {
    if (frame && e.target != frame && Date.now() < guardUntil && guardCount++ < 20) frame.focus();
  }, true);

  browser.runtime.onMessage.addListener(msg => {
    if (msg.type != 'toggle') return;
    if (frame && !msg.link && !isHidden()) close();
    else open(msg.link);
  });

  // from form/form.js
  addEventListener('message', e => {
    if (!frame || e.source != frame.contentWindow || e.origin != formOrigin) return;
    if (e.data.type == 'close') close();
    if (e.data.type == 'height') frame.style.setProperty('height', Math.min(e.data.height, innerHeight) + 'px', 'important');
  });
})();

// Hidden tags on diigo.com (hideOnDiigo): runs in the page itself (manifest.json: world MAIN, at document_start), so it
// sees the answers of the requests Diigo's library makes, before the library does. Out of them: the items with a
// hidden tag (load_user_items, search_user_items: their tags in t_name) and the hidden tags themselves
// (load_user_tags); so they are not in the page at all, also not for Select all of Bulk Edit. Unless the request asks
// for such a tag (a search for it), as the Swift Library shows them then. Only in your own library: /user/<you>,
// /profile/<you>.
// What is hidden comes from diigo-site/hide.js, which has the settings: kept in localStorage of diigo.com, so it is
// known at once when the page loads, and a swift-hidden-tags event when it changes. An answer is changed when the
// library reads it, not when it arrives, so a list that comes just after it still counts.
(() => {
  const KEY = 'swiftHiddenTags';
  const ITEMS = /\/interact_api\/(load_user_items|search_user_items)\b/;
  const TAGS = /\/interact_api\/load_user_tags\b/;

  let hidden = null;  // {user, tags: [lower case]}, or null: nothing hidden
  const read = text => {
    try {
      const value = JSON.parse(text);
      hidden = value?.tags?.length ? {user: String(value.user || ''), tags: value.tags.map(String)} : null;
    } catch (e) {
      hidden = null;
    }
  };
  try {
    read(localStorage.getItem(KEY));
  } catch (e) {
  }
  document.addEventListener('swift-hidden-tags', e => read(e.detail));

  // in your own library only (unknown who you are: in any library)
  const ownLibrary = () => {
    const name = location.pathname.match(/^\/(?:user|profile)\/([^/?#]+)/)?.[1];
    return !!name && (!hidden.user || decodeURIComponent(name).toLowerCase() == hidden.user.toLowerCase());
  };
  const isHidden = tag => hidden.tags.includes(String(tag).trim().toLowerCase());
  // the tags of an item: t_name, one string separated by commas (docs/diigo-com.md), or tags, a list or a string
  const tagsOf = item => {
    const value = item?.t_name ?? item?.tags ?? '';
    return Array.isArray(value) ? value : String(value).split(',').map(tag => tag.trim()).filter(Boolean);
  };
  // a request that asks for a hidden tag: one of its values is one, or has one as a word (tag:secret, "secret")
  const asksHidden = url => {
    try {
      const params = new URL(url, location.href).searchParams;
      return [...params.values()].some(value => value.toLowerCase().split(/[\s,"':]+/).some(word => word && isHidden(word)));
    } catch (e) {
      return false;
    }
  };
  // the tags of load_user_tags, whatever form they have: a list of names, of objects with a name, or an object by name
  const NAME_KEYS = ['name', 'tag', 'tag_name', 't_name', 'title'];
  const withoutTags = value => {
    if (Array.isArray(value)) {
      return value.filter(entry => typeof entry == 'string' ? !isHidden(entry)
        : !(entry && typeof entry == 'object' && NAME_KEYS.some(key => typeof entry[key] == 'string' && isHidden(entry[key]))))
        .map(withoutTags);
    }
    if (value && typeof value == 'object') {
      return Object.fromEntries(Object.entries(value).filter(([key]) => !isHidden(key))
        .map(([key, entry]) => [key, withoutTags(entry)]));
    }
    return value;
  };

  // the answer to url as the library should see it: text in, text out
  function filtered(url, text) {
    if (!hidden || typeof text != 'string' || !ownLibrary()) return text;
    const items = ITEMS.test(url), tags = TAGS.test(url);
    if (!items && !tags || items && asksHidden(url)) return text;
    let answer;
    try {
      answer = JSON.parse(text);
    } catch (e) {
      return text;
    }
    if (items && Array.isArray(answer?.items)) {
      answer.items = answer.items.filter(item => !tagsOf(item).some(isHidden));
    } else if (tags) {
      answer = withoutTags(answer);
    } else {
      return text;
    }
    return JSON.stringify(answer);
  }

  // XMLHttpRequest (jQuery reads responseText): its URL kept by open, its answer changed when read
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.swiftUrl = String(url);
    return open.call(this, method, url, ...rest);
  };
  for (const property of ['responseText', 'response']) {
    const getter = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, property)?.get;
    if (!getter) continue;
    Object.defineProperty(XMLHttpRequest.prototype, property, {
      configurable: true,
      get() {
        const value = getter.call(this);
        if (this.readyState != 4 || !this.swiftUrl || !value) return value;
        if (typeof value == 'string') return filtered(this.swiftUrl, value);
        // responseType json: the object, filtered as its text
        if (property == 'response' && this.responseType == 'json' && hidden) {
          const text = JSON.stringify(value), changed = filtered(this.swiftUrl, text);
          return changed == text ? value : JSON.parse(changed);
        }
        return value;
      },
    });
  }

  // fetch: the answer read once, given as a new answer
  const originalFetch = window.fetch;
  window.fetch = async function (input, init) {
    const response = await originalFetch.call(this, input, init);
    const url = typeof input == 'string' ? input : input?.url || String(input);
    if (!hidden || !ITEMS.test(url) && !TAGS.test(url)) return response;
    const original = await response.clone().text();
    const text = filtered(url, original);
    if (text == original) return response;
    return new Response(text,{status: response.status, statusText: response.statusText, headers: response.headers});
  };
})();

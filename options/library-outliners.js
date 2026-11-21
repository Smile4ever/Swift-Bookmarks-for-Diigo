// A part of the Swift Library (library.html); library.js has what they share, library-page.js puts them to work.

// ---- Outliners: your outliners of Diigo, in the Swift Library itself ----

// Outliners in the side bar (library-side.js: VIEWS.outliners) shows them in the place of the list (library-list.js:
// show, .outliners-mode): the last changed first, each with its first lines, Edit (which opens it) and Delete; the
// search box finds them by their name. One opened (state.outliner, in the address) is its name and its items as a
// tree, written in the page. Add → Outliner makes a new one (library-add.js). Delete goes to the trash of the Swift
// Library, as a bookmark does (library-delete.js): Diigo deletes it after DELETE_DELAY, and Put back makes it again
// from the copy the trash keeps (its name and items).
// Diigo's outliner (www.diigo.com/outliner/…) is an app of its own, which its library shows in a frame; this part
// talks to its server as that app does (wp.<hash>.js of diigo.com, see docs/diigo-com.md: Outliners):
// - GET /outliner/list: your outliners; /outliner/new, /<id>/edit and /<id>/delete make, rename and delete one
// - GET /outliner/<id>: one outliner, its items (bulletpoints: id, parent, position, content, description, expand)
//   and the changes not worked into them yet (actions)
// - POST /outliner/<id>/actions: what changed (create, edit, move, delete), with the MD5 of it (md5.js); the answer
//   has the changes since the last one this page knows, also those made elsewhere meanwhile (another tab, diigo.com),
//   and then the outliner is loaded again. Asked every 30 seconds too while one is shown, as Diigo's app does.
// - a new item gets an id from a prefix the server gives (bullet_client_id_prefix) and a number of this page
// The text of an item is HTML as Diigo keeps it: an item of your library in it is a span.diigoItemFlag with what Diigo
// knows of it as JSON, shown here as a link (renderContent) and written back as it was (readContent).
// Keys while writing, as in Diigo's outliner: Enter a new item, Tab and Shift+Tab in and out, Shift+Enter its note,
// Alt+Shift+↑↓ moves it, Backspace on an empty item deletes it, ↑↓ at the first or last line to the item above or below.
// Ctrl+Shift+Backspace, or × at the right of an item, deletes an item with its text (and those under it, asked first).
// All of it in one closure (outlinerPart), so its names don't meet those of the rest of the Swift Library.

const outlinerPart = (() => {
  const OUTLINER_URL = 'https://www.diigo.com/outliner';
  // how long after the last key a change is sent, and how often changes made elsewhere are asked for
  const SEND_AFTER = 1000;
  const PULL_EVERY = 30000;
  const LIBRARY_SHOWN = 40;

  let outliners = [];      // [{id, title, updated, preview}], the last changed first
  let listed = false;      // outliners is your list as Diigo gave it (loadList)
  let listing = null;      // while loadList runs
  let current = null;      // the outliner shown: see loadOutliner
  let opening = '';        // the id of the one being loaded
  let lastFocus = '';      // the id of the item last written in: where new ones and those of the library go

  const say = (text, error = false) => showStatus(text, error);
  const shownHere = () => state.view == 'outliners';

  // ---- Diigo's outliner server ----

  // JSON or form fields (form) as Diigo's outliner app sends them, with your sign-in of diigo.com; the answer as JSON
  async function ask(path, {json, form} = {}) {
    const init = {credentials: 'include', headers: {'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json'}};
    if (json !== undefined) {
      init.method = 'POST';
      init.body = json;
      init.headers['Content-Type'] = 'application/json; charset=UTF-8';
    } else if (form) {
      init.method = 'POST';
      init.body = new URLSearchParams(form);
    }
    const response = await fetch(OUTLINER_URL + path, {...init, signal: timeLimit()});
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`.trim());
    const body = await response.text();
    try {
      return JSON.parse(body);
    } catch (e) {
      // a page instead: Cloudflare, or signed out
      throw new Error(message('outlinersNoJson'));
    }
  }

  const failed = answer => new Error(answer?.reason || answer?.message || message('outlinersNoJson'));

  // ---- your outliners ----

  async function loadList() {
    const answer = await ask('/list');
    if (answer.code != 1) throw failed(answer);
    const before = new Map(outliners.map(outliner => [outliner.id, outliner]));
    outliners = (answer.data?.outliners || []).map(outliner => ({
      id: String(outliner.outliner_id), title: String(outliner.title ?? ''), updated: Number(outliner.updated_at) || 0,
    })).map(outliner => ({...outliner, preview: before.get(outliner.id)?.updated == outliner.updated
      ? before.get(outliner.id).preview : undefined}))
      // those waiting to be deleted (deleteOutliner) are in the trash already
      .filter(outliner => !waiting.has(outliner.id))
      .sort((a, b) => b.updated - a.updated);
    listed = true;
    // the menus of Share to outliner that are there already (shareSelect)
    for (const select of document.querySelectorAll('select.share-outliner')) select.fill?.();
  }

  // once, as the page opens (for how many there are, in the side bar) or the view does; again with loadList after a
  // new one. What it does is said only with Outliners shown.
  function ensureList() {
    if (listed || listing || !user) return listing;
    const here = shownHere();
    if (here) say(message('outlinersLoading'));
    listing = loadList().then(() => here && say(''), e => shownHere() && say(message('outlinersFailed', e.message), true))
      .finally(() => {
        listing = null;
        if (shownHere()) render();
        safely('side bar', showTags);
        safely('total', showTotal);
      });
    return listing;
  }

  // by their name, from the search box of the Swift Library: each word in it
  const shownOutliners = () => {
    const words = lower(state.query).split(/\s+/).filter(Boolean);
    return outliners.filter(outliner => words.every(word => lower(outliner.title).includes(word)));
  };

  // how many outliners you have, once Diigo gave the list (library.js: showTotal, in the bar below the blue one)
  function totalText() {
    if (!user || !listed) return '';
    const count = new Intl.NumberFormat(browser.i18n.getUILanguage()).format(outliners.length);
    return outliners.length == 1 ? message('outlinersTotalOne') : message('outlinersTotal', count);
  }

  // the green icon of an outliner, as the icons of the kinds of items of the Swift Library (library-list.js: typeIcon)
  function icon() {
    const el = element('i', 'c-icon item-type outliner');
    el.setAttribute('aria-hidden', 'true');
    return el;
  }

  // the address of the view, of one outliner or of all of them, for a link that can be opened in a new tab too
  function hrefOf(id) {
    const params = new URLSearchParams({view: 'outliners'});
    if (id) params.set('outliner', id);
    return '#' + params;
  }

  // a link to one: in this tab without reloading the page; with Ctrl or the middle button as a link is
  function openLink(link, id) {
    link.href = hrefOf(id);
    link.addEventListener('click', e => {
      if (e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      state.outliner = id;
      show({push: true});
    });
    return link;
  }

  // without one chosen: your outliners as the bookmarks of the Swift Library are, the last changed first, with when,
  // their first lines, and Edit (which opens it) and Delete always there
  function showAll() {
    const shown = shownOutliners();
    $('outlinerNone').hidden = !listed || outliners.length > 0;
    $('outlinerList').replaceChildren(...shown.map(outliner => {
      const li = element('li', 'item');
      const title = openLink(element('a', 'title', outliner.title || '—'), outliner.id);
      title.prepend(icon());
      li.append(title);
      const meta = element('div', 'meta');
      if (outliner.updated > 0) {
        meta.append(element('span', 'date', message('outlinersChangedOn', dateFormat.format(outliner.updated * 1000))));
      }
      li.append(meta);
      const preview = previewElement(outliner.preview);
      if (preview) li.append(preview);
      const line = element('div', 'line');
      const actions = element('div', 'actions');
      const edit = openLink(element('a', '', message('libraryEdit')), outliner.id);
      const remove = element('button', 'delete', message('libraryDelete'));
      remove.type = 'button';
      remove.addEventListener('click', () => deleteOutliner(outliner));
      actions.append(edit, remove);
      line.append(element('div', 'item-tags'), actions);
      li.append(line);
      return li;
    }));
    askPreviews();
  }

  // ---- the first lines of each outliner, as the first lines of a note ----
  // /list gives no items, so each outliner is asked for them on its own (/<id>), PREVIEW_AT_ONCE at a time, and what
  // it gave is kept in this browser (localStorage) with when the outliner was last changed: asked again only once it
  // changed. One opened here gives its lines from its tree when you go back to the list.
  const PREVIEW_LINES = 10;
  const PREVIEW_AT_ONCE = 2;
  const previewKey = id => 'outlinerPreview:' + id;
  let previewsAsked = 0;

  // the text of an item as it shows: an item of your library by its title
  function plainContent(html) {
    const doc = new DOMParser().parseFromString(`<body>${html || ''}</body>`, 'text/html');
    for (const flag of doc.body.querySelectorAll('.diigoItemFlag')) {
      let title = '';
      try {
        const item = JSON.parse(flag.textContent);
        title = String(item.title || item.url || '');
      } catch (e) {}
      flag.replaceWith(title.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
    }
    return doc.body.textContent.replace(/\s+/g, ' ').trim();
  }

  // the first lines of a tree (roots: items with content and children), each with its indent, all items, also those
  // under a closed one; and whether there are more
  function treeLines(roots) {
    const lines = [];
    let more = false;
    const walk = (items, depth) => {
      for (const item of items) {
        if (lines.length == PREVIEW_LINES) return more = true;
        lines.push('  '.repeat(depth) + '• ' + (plainContent(item.content) || '…'));
        walk(item.children, depth + 1);
        if (more) return;
      }
    };
    walk(roots, 0);
    return {lines, more};
  }

  // the tree of an outliner as Diigo gives it: its items ({content, expand, children}), with the changes not worked
  // into them yet (as loadOutliner)
  function treeOf(data) {
    const byId = new Map();
    const node = (id, content = '', expand = true) => ({id: String(id), content, expand, parent: '0', position: 0});
    for (const point of data.bulletpoints || []) {
      const item = node(point.bullet_client_id, point.content || '', Number(point.expand) != 0);
      item.parent = String(point.parent_client_id ?? '0');
      item.position = Number(point.position) || 0;
      byId.set(item.id, item);
    }
    // the order under each parent, then the changes in theirs: the index of a change is a place among the others
    const children = new Map();
    const list = parent => children.get(parent) || children.set(parent, []).get(parent);
    for (const item of [...byId.values()].sort((a, b) => a.position - b.position)) list(item.parent).push(item);
    const detachNode = item => {
      const siblings = list(item.parent);
      const at = siblings.indexOf(item);
      if (at >= 0) siblings.splice(at, 1);
    };
    const changes = [...data.actions || []].sort((a, b) => a.action_id - b.action_id)
      .flatMap(action => action.data || []);
    for (const {type, data: change = {}} of changes) {
      const id = String(change.bullet_client_id ?? change.itemId ?? '');
      const parent = String(change.parent_client_id ?? change.parentId ?? '0').replace('null', '0');
      let item = byId.get(id);
      if (type == 'create' && !item) {
        item = node(id, change.content || '', change.expand === undefined || !!Number(change.expand));
        item.parent = parent;
        byId.set(id, item);
        list(parent).splice(change.index ?? list(parent).length, 0, item);
      } else if (type == 'edit' && item) {
        if (change.content !== undefined) item.content = change.content;
        if (change.expand !== undefined) item.expand = !!Number(change.expand);
      } else if (type == 'move' && item) {
        detachNode(item);
        item.parent = parent;
        list(parent).splice(change.index ?? list(parent).length, 0, item);
      } else if (type == 'delete' && item) {
        detachNode(item);
        byId.delete(id);
      }
    }
    const build = (parent, depth = 0) => depth > 50 ? [] : list(parent).filter(item => byId.has(item.id))
      .map(item => ({content: item.content, expand: item.expand, children: build(item.id, depth + 1)}));
    return build('0');
  }

  // a tree of the page (current.roots) as treeOf gives one
  const plainTree = items => items.map(item => ({content: item.content, expand: item.expand,
    children: plainTree(item.children)}));

  function keepPreview(outliner) {
    try {
      localStorage.setItem(previewKey(outliner.id), JSON.stringify({updated: outliner.updated, preview: outliner.preview}));
    } catch (e) {}
  }

  function keptPreview(outliner) {
    try {
      const kept = JSON.parse(localStorage.getItem(previewKey(outliner.id)) || 'null');
      if (kept && kept.updated == outliner.updated && kept.preview) outliner.preview = kept.preview;
    } catch (e) {}
  }

  // those shown without their lines yet asked of Diigo, PREVIEW_AT_ONCE at a time; the list drawn again as they come
  function askPreviews() {
    for (const outliner of shownOutliners()) {
      if (previewsAsked >= PREVIEW_AT_ONCE) return;
      if (outliner.preview || outliner.previewAsked) continue;
      keptPreview(outliner);
      if (outliner.preview) continue;
      outliner.previewAsked = true;
      previewsAsked++;
      ask('/' + encodeURIComponent(outliner.id)).then(answer => {
        if (answer.code != 1) throw failed(answer);
        outliner.preview = treeLines(treeOf(answer.data || {}));
        keepPreview(outliner);
      }).catch(() => {}).finally(() => {
        previewsAsked--;
        if (shownHere() && !current && outliners.includes(outliner)) showAll();
      });
    }
  }

  // the lines of an outliner, below its title in the list (and in the trash)
  function previewElement(preview) {
    const {lines = [], more = false} = preview || {};
    if (!lines.length) return null;
    const el = element('p', 'note-preview outliner-preview', lines.join('\n'));
    if (more) el.append(element('span', 'note-more', '\n…'));
    return el;
  }

  // ---- one outliner: its items as a tree ----

  // current: {id, title, readOnly, userId (for the items of your library), maxActionId, versionId (what the server
  // knows this page has), prefix and seq (for new ids), roots, byId}; an item: {id, parent (an item, or null), content,
  // description, expand, children}
  const childrenOf = parent => parent ? parent.children : current.roots;

  function newItem({id, content = '', description = '', expand = true}) {
    return {id: String(id), parent: null, content, description, expand: !!expand, children: []};
  }

  function insert(item, parent, at) {
    const list = childrenOf(parent);
    item.parent = parent;
    list.splice(Math.max(0, Math.min(at ?? list.length, list.length)), 0, item);
    current.byId.set(item.id, item);
  }

  function detach(item) {
    const list = childrenOf(item.parent);
    const at = list.indexOf(item);
    if (at >= 0) list.splice(at, 1);
    return at;
  }

  const descendants = item => item.children.flatMap(child => [child, ...descendants(child)]);

  // a change as the server sends it (bullet_client_id, parent_client_id "0" for the top) worked into the tree
  function applyAction({type, data}) {
    const id = String(data.bullet_client_id ?? data.itemId ?? '');
    const parentId = String(data.parent_client_id ?? data.parentId ?? '0');
    const parent = parentId == '0' || parentId == 'null' ? null : current.byId.get(parentId) || null;
    const item = current.byId.get(id);
    if (type == 'create' && !item) {
      insert(newItem({id, content: data.content || '', description: data.description || '', expand: data.expand ?? 1}),
        parent, data.index);
    } else if (type == 'edit' && item) {
      if (data.content !== undefined) item.content = data.content;
      if (data.description !== undefined) item.description = data.description;
      if (data.expand !== undefined) item.expand = !!Number(data.expand);
    } else if (type == 'move' && item) {
      detach(item);
      insert(item, parent, data.index);
    } else if (type == 'delete' && item) {
      detach(item);
      [item, ...descendants(item)].forEach(gone => current.byId.delete(gone.id));
    }
  }

  async function loadOutliner(id, {keepFocus = false} = {}) {
    const focus = keepFocus ? focusedField() : null;
    const answer = await ask('/' + encodeURIComponent(id));
    if (answer.code != 1) throw failed(answer);
    const {bulletpoints = [], actions = [], meta: about = {}, user: you = {}} = answer.data || {};
    // Read only: only one shared with you to read. One of your own (in your list, /list) is always yours to change,
    // as Diigo gives ["read"] for those too; else one Diigo gives no right to change (write, edit, owner…)
    const permission = (Array.isArray(you.permission) ? you.permission : []).map(right => String(right).toLowerCase());
    const yours = outliners.some(outliner => outliner.id == String(id));
    const mayChange = permission.some(right => ['write', 'edit', 'owner', 'admin', 'all'].includes(right));
    current = {
      id: String(id), title: String(about.title ?? ''),
      readOnly: !yours && !mayChange && permission.includes('read'),
      userId: String(you.user_id ?? ''), maxActionId: about.max_action_id ?? null, versionId: about.version_id ?? null,
      prefix: current?.id == id ? current.prefix : '', seq: current?.id == id ? current.seq : 0,
      roots: [], byId: new Map(),
    };
    // the items in the order of position under each parent, parents first
    const byParent = new Map();
    for (const point of bulletpoints) {
      const item = newItem({id: point.bullet_client_id, content: point.content || '',
        description: point.description || '', expand: Number(point.expand) != 0});
      current.byId.set(item.id, item);
      const parent = String(point.parent_client_id ?? '0');
      if (!byParent.has(parent)) byParent.set(parent, []);
      byParent.get(parent).push({item, position: Number(point.position) || 0});
    }
    for (const [parentId, list] of byParent) {
      const parent = parentId == '0' ? null : current.byId.get(parentId);
      // an item whose parent is gone: at the top, so it isn't lost
      list.sort((a, b) => a.position - b.position).forEach(({item}) => {
        item.parent = parent || null;
        childrenOf(item.parent).push(item);
      });
    }
    // then the changes the server has not worked in yet, in their order
    [...actions].sort((a, b) => a.action_id - b.action_id).forEach(action => (action.data || []).forEach(applyAction));
    // and what was changed here and is still to send (loaded again for changes made elsewhere meanwhile)
    queue.forEach(applyAction);
    if (shownHere()) showOutliner();
    if (focus) focusField(focus.id, focus.field, 'end');
  }

  // a new id: the prefix of the server and a number, as Diigo's app makes them (initNewBulletPointIdWithServerPrefix)
  async function newPrefix() {
    const answer = await ask('/bullet_client_id_prefix?t=' + Date.now());
    if (answer.code != 1 || !answer.prefix) throw failed(answer);
    return String(answer.prefix);
  }

  async function getPrefix() {
    if (current.prefix) return;
    current.prefix = await newPrefix();
    current.seq = 0;
  }

  const nextId = () => current.prefix + String(++current.seq).padStart(10, '0');

  // ---- the text of an item ----

  // What may stay of the HTML of an item: Diigo's own marks (span.text-bold and the like), links, and a few tags of
  // rich text; the rest is left out with its text kept. An item of your library becomes a link (diigoLink).
  const KEPT_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'CODE', 'BR', 'SPAN', 'A', 'SUB', 'SUP']);

  function diigoLink(flag) {
    let item;
    try {
      item = JSON.parse(flag);
    } catch (e) {
      return document.createTextNode(flag);
    }
    const link = element('a', 'diigo-item ' + (/^[a-z]+$/.test(item.type || '') ? item.type : 'bookmark'),
      String(item.title || item.url || '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
    link.contentEditable = 'false';
    link.dataset.flag = flag;
    // a bookmark to its page, the rest to the item on Diigo, as Diigo's outliner does (getDiigoItemRedirctURL)
    link.href = item.type == 'bookmark' && /^https?:/i.test(item.url || '') ? String(item.url).replace(/&amp;/g, '&')
      : `${OUTLINER_URL}/diigo_items/${current.id}/${encodeURIComponent(item.userId)}/${encodeURIComponent(item.linkId)}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.title = link.href;
    return link;
  }

  function cleanNodes(from, into) {
    for (const node of [...from.childNodes]) {
      if (node.nodeType == Node.TEXT_NODE) {
        into.append(node.textContent);
      } else if (node.nodeType == Node.ELEMENT_NODE && node.classList.contains('diigoItemFlag')) {
        into.append(diigoLink(node.textContent));
      } else if (node.nodeType == Node.ELEMENT_NODE && KEPT_TAGS.has(node.tagName)) {
        const kept = document.createElement(node.tagName);
        if (node.tagName == 'SPAN') {
          const marks = [...node.classList].filter(name => /^text-[a-z-]+$/.test(name));
          if (marks.length) kept.className = marks.join(' ');
        }
        if (node.tagName == 'A' && /^https?:/i.test(node.getAttribute('href') || '')) {
          kept.href = node.getAttribute('href');
          kept.target = '_blank';
          kept.rel = 'noopener noreferrer';
          kept.title = kept.href;
        }
        cleanNodes(node, kept);
        into.append(kept);
      } else if (node.nodeType == Node.ELEMENT_NODE) {
        cleanNodes(node, into);
      }
    }
  }

  function renderContent(html, into) {
    const parsed = new DOMParser().parseFromString(`<body>${html || ''}</body>`, 'text/html');
    into.replaceChildren();
    cleanNodes(parsed.body, into);
  }

  // the HTML of an item as Diigo keeps it: an item of your library as its span.diigoItemFlag again
  function readContent(field) {
    const copy = field.cloneNode(true);
    copy.querySelectorAll('a.diigo-item').forEach(link => {
      const flag = document.createElement('span');
      flag.className = 'diigoItemFlag';
      flag.textContent = link.dataset.flag;
      link.replaceWith(flag);
    });
    // what the browser leaves in an emptied field
    const html = copy.innerHTML.replace(/^(<br>)+$/, '');
    return html.trim() ? html : '';
  }

  // the content of an item of your library (the index of the Swift Library), as Diigo's outliner makes it
  // (diigoItemToFlag)
  function flagOf(item) {
    return flagFor(item, current.userId);
  }

  function flagFor(item, userId) {
    const flag = {title: item.title || item.url, type: item.type || 'bookmark', url: item.url, linkId: item.id,
      userId, annotCount: '0', isConvert: false};
    const span = document.createElement('span');
    span.className = 'diigoItemFlag';
    span.textContent = JSON.stringify(flag);
    return span.outerHTML;
  }

  // ---- the tree on the page ----

  function bulletElement(item) {
    const li = element('li', 'bullet' + (item.expand ? '' : ' collapsed') + (item.children.length ? ' parent' : ''));
    li.dataset.id = item.id;
    const row = element('div', 'bullet-row');
    const toggle = element('button', 'bullet-toggle', item.children.length ? (item.expand ? '▾' : '▸') : '');
    toggle.type = 'button';
    toggle.tabIndex = -1;
    toggle.disabled = !item.children.length;
    toggle.setAttribute('aria-label', message(item.expand ? 'outlinersCollapse' : 'outlinersExpand'));
    toggle.addEventListener('click', () => setExpand(item, !item.expand));
    const dot = element('span', 'bullet-dot');
    const content = element('div', 'bullet-content');
    renderContent(item.content, content);
    const description = element('div', 'bullet-description');
    renderContent(item.description, description);
    description.hidden = !item.description;
    description.dataset.placeholder = message('outlinersDescription');
    if (!current.readOnly) {
      content.contentEditable = description.contentEditable = 'true';
      content.spellcheck = description.spellcheck = true;
      for (const [field, name] of [[content, 'content'], [description, 'description']]) {
        field.addEventListener('input', () => edited(item, name, field));
        field.addEventListener('keydown', e => onKey(e, item, name, field));
        field.addEventListener('focus', () => lastFocus = item.id);
        field.addEventListener('blur', () => {
          commit(item, name, field);
          if (name == 'description' && !item.description) field.hidden = true;
        });
        field.addEventListener('paste', e => {
          e.preventDefault();
          document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
        });
      }
    }
    row.append(toggle, dot, content);
    if (!current.readOnly) {
      const remove = element('button', 'bullet-remove', '×');
      remove.type = 'button';
      remove.tabIndex = -1;
      remove.title = message('outlinersItemDelete');
      remove.setAttribute('aria-label', message('outlinersItemDelete'));
      remove.addEventListener('click', () => removeBullet(item, {ask: true}));
      row.append(remove);
    }
    li.append(row, description);
    if (item.children.length && item.expand) {
      const children = element('ul', 'bullet-children');
      children.append(...item.children.map(bulletElement));
      li.append(children);
    }
    return li;
  }

  function showTree() {
    $('outlinerTree').replaceChildren(...current.roots.map(bulletElement));
    $('outlinerEmpty').hidden = current.roots.length > 0;
  }

  // the one chosen, or the list of all of them
  function showOutliner() {
    const open = !!current && current.id == state.outliner;
    $('outlinerAll').hidden = open;
    $('outlinerOpen').hidden = !open;
    if (open) {
      showMeta();
      const editable = !current.readOnly;
      $('outlinerTitle').contentEditable = editable ? 'plaintext-only' : 'false';
      $('outlinerTitle').classList.toggle('editable', editable);
      $('outlinerReadOnly').hidden = !current.readOnly;
      $('outlinerKeys').hidden = current.readOnly;
      for (const id of ['outlinerDelete', 'outlinerAddItem', 'outlinerFromLibrary']) $(id).hidden = current.readOnly;
      showTree();
    } else {
      showAll();
    }
    safely('title', showTitle);
  }

  const fieldOf = (id, name) => $('outlinerTree').querySelector(`li[data-id="${CSS.escape(id)}"] > ` +
    (name == 'description' ? '.bullet-description' : '.bullet-row > .bullet-content'));

  function focusedField() {
    const field = document.activeElement?.closest?.('.bullet-content, .bullet-description');
    const li = field?.closest('li.bullet');
    return li ? {id: li.dataset.id, field: field.classList.contains('bullet-description') ? 'description' : 'content'}
      : null;
  }

  // the cursor in a field of an item: at its start or end
  function focusField(id, name = 'content', where = 'end') {
    const field = fieldOf(id, name);
    if (!field) return;
    field.hidden = false;
    field.focus();
    const range = document.createRange();
    range.selectNodeContents(field);
    range.collapse(where == 'start');
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  // the items as they are shown, top to bottom: for ↑ and ↓
  function visibleItems(list = current.roots) {
    return list.flatMap(item => [item, ...item.expand ? visibleItems(item.children) : []]);
  }

  // the cursor on the first or the last line of a field
  function onEdgeLine(field, up) {
    const selection = getSelection();
    if (!selection.rangeCount) return true;
    const range = selection.getRangeAt(0).cloneRange();
    range.collapse(!up);
    const caret = range.getClientRects()[0];
    if (!caret) return true;
    const box = field.getBoundingClientRect();
    const line = parseFloat(getComputedStyle(field).lineHeight) || 20;
    return up ? caret.top - box.top < line * .8 : box.bottom - caret.bottom < line * .8;
  }

  function atStart(field) {
    const selection = getSelection();
    if (!selection.rangeCount || !selection.isCollapsed) return false;
    const range = document.createRange();
    range.selectNodeContents(field);
    range.setEnd(selection.getRangeAt(0).startContainer, selection.getRangeAt(0).startOffset);
    return !range.toString().length;
  }

  // ---- changes: in the tree at once, to Diigo a moment later ----

  let queue = [];          // what changed and is not sent yet, as the server wants it
  let sending = false;
  let sendTimer = 0;
  let lastKey = 0;
  const clientKey = md5(String(Date.now()) + Math.random());
  let actionIndex = 0;

  // a change in Diigo's words: bullet_client_id and parent_client_id ("0": at the top), expand as 0 or 1
  function change(type, item, data = {}, prevData) {
    const out = {type, data: {itemId: item.id, bullet_client_id: item.id, ...data}, timeStamp: Date.now()};
    if ('parent' in data) {
      delete out.data.parent;
      out.data.parentId = data.parent ? data.parent.id : null;
      out.data.parent_client_id = data.parent ? data.parent.id : '0';
    }
    if ('expand' in data) out.data.expand = data.expand ? 1 : 0;
    if (prevData) out.prevData = prevData;
    return out;
  }

  function push(...changes) {
    // the text of an item as it is typed: only the last one of a row of them
    for (const next of changes) {
      const last = queue.at(-1);
      const field = next.type == 'edit' && ['content', 'description'].find(name => name in next.data);
      if (field && last?.type == 'edit' && last.data.itemId == next.data.itemId && field in last.data &&
        Object.keys(last.data).length == Object.keys(next.data).length) {
        next.prevData = last.prevData;
        queue[queue.length - 1] = next;
      } else {
        queue.push(next);
      }
    }
    clearTimeout(sendTimer);
    sendTimer = setTimeout(send, SEND_AFTER);
  }

  // changes to an outliner, as one action, as Diigo's app sends them; the answer of the server
  async function postActions(outliner, changes) {
    const actions = [{data: changes, c_key: clientKey, timeStamp: Date.now(), __actionIndex: actionIndex++}];
    const body = {client_max_action_id: outliner.maxActionId, client_version_id: outliner.versionId, actions,
      s_key: md5(JSON.stringify(actions))};
    const answer = await ask(`/${encodeURIComponent(outliner.id)}/actions`, {json: JSON.stringify(body)});
    if (answer.code != 1) throw failed(answer);
    return answer;
  }

  // A row of changes to Diigo, or none (pull) to hear what changed elsewhere. Changes made elsewhere meanwhile (an
  // action of another c_key in the answer): the outliner is loaded again. What Diigo didn't take stays to send again.
  let failedSend = false;

  async function send({pull = false} = {}) {
    clearTimeout(sendTimer);
    if (sending || !current || current.readOnly || (!queue.length && !pull)) return;
    const outliner = current;
    const changes = queue.splice(0);
    sending = true;
    if (changes.length) say(message('outlinersSaving'));
    try {
      if (changes.some(next => next.type == 'create')) await getPrefix();
      const answer = await postActions(outliner, changes);
      failedSend = false;
      const returned = [...answer.data?.actions || []].sort((a, b) => a.action_id - b.action_id);
      if (returned.length) outliner.maxActionId = returned.at(-1).action_id;
      if (answer.data?.server_version_id !== undefined) outliner.versionId = answer.data.server_version_id;
      const entry = outliners.find(other => other.id == outliner.id);
      if (entry && changes.length) entry.updated = Date.now() / 1000;
      if (current == outliner && returned.some(action => action.c_key != clientKey)) {
        sending = false;
        await loadOutliner(outliner.id, {keepFocus: true});
        say(message('outlinersChanged'));
      } else if (changes.length) {
        say(message('outlinersSaved'));
      }
    } catch (e) {
      failedSend = true;
      if (current == outliner) queue.unshift(...changes);
      say(message('outlinersNotSaved', e.message), true);
    } finally {
      sending = false;
      // tried again a while later, not at once, when it failed
      if (queue.length && current == outliner) sendTimer = setTimeout(send, failedSend ? PULL_EVERY : SEND_AFTER);
    }
  }

  // typed in a field: the tree has it at once, Diigo a moment later
  function edited(item, name, field) {
    lastKey = Date.now();
    commit(item, name, field);
  }

  function commit(item, name, field) {
    const html = readContent(field);
    if (html == item[name]) return;
    const before = item[name];
    item[name] = html;
    push(change('edit', item, {[name]: html},
      name == 'content' ? {previousContent: before} : {previousDescription: before}));
  }

  function setExpand(item, expand) {
    if (item.expand == expand) return;
    const focus = focusedField();
    item.expand = expand;
    if (!current.readOnly) push(change('edit', item, {expand}, {previousExpand: !expand}));
    showTree();
    if (focus) focusField(focus.id, focus.field);
  }

  // a new item: after (or before) one, as its first child, or at the end
  function addBullet({after, before, inside, content = ''} = {}) {
    const parent = inside || (after || before)?.parent || null;
    const list = childrenOf(parent);
    const at = inside ? 0 : after ? list.indexOf(after) + 1 : before ? list.indexOf(before) : list.length;
    const item = newItem({id: 'new'});
    // the id from the server's prefix: without one yet, asked first
    const make = () => {
      item.id = nextId();
      item.content = content;
      insert(item, parent, at);
      push(change('create', item, {parent, index: at, content, description: '', expand: true}));
      showTree();
      focusField(item.id, 'content', 'end');
      return item;
    };
    if (current.prefix) return make();
    return getPrefix().then(make, e => say(message('outlinersNotSaved', e.message), true));
  }

  function moveItem(item, parent, at) {
    const from = item.parent;
    const fromAt = detach(item);
    insert(item, parent, at);
    push(change('move', item, {parent, index: childrenOf(parent).indexOf(item)},
      {previousParentId: from ? from.id : null, previousIndex: fromAt}));
    if (parent && !parent.expand) {
      parent.expand = true;
      push(change('edit', parent, {expand: true}, {previousExpand: false}));
    }
    showTree();
  }

  // the items under it first, so none is left without its parent
  function removeBullet(item, {ask: asking = false, focus = true} = {}) {
    const under = descendants(item);
    if (asking && under.length && !confirm(message('outlinersItemDeleteAsk', String(under.length)))) return;
    const shown = visibleItems();
    const above = shown[shown.indexOf(item) - 1];
    for (const gone of [...under].reverse().concat(item)) {
      const parent = gone.parent;
      const at = childrenOf(parent).indexOf(gone);
      push(change('delete', gone, {}, {previousParentId: parent ? parent.id : null, previousIndex: at,
        previousContent: gone.content}));
      detach(gone);
      current.byId.delete(gone.id);
    }
    showTree();
    if (focus && above && current.byId.has(above.id)) focusField(above.id, 'content', 'end');
  }

  function onKey(e, item, name, field) {
    lastKey = Date.now();
    const list = childrenOf(item.parent);
    const at = list.indexOf(item);
    const plain = !e.ctrlKey && !e.metaKey && !e.altKey;
    if (e.key == 'Enter' && plain && !e.shiftKey && name == 'content') {
      e.preventDefault();
      commit(item, name, field);
      if (item.content && atStart(field)) addBullet({before: item});
      else if (item.children.length && item.expand) addBullet({inside: item});
      else addBullet({after: item});
    } else if (e.key == 'Enter' && plain && e.shiftKey) {
      // the note of the item, and back
      e.preventDefault();
      commit(item, name, field);
      focusField(item.id, name == 'content' ? 'description' : 'content', 'end');
    } else if (e.key == 'Escape' && name == 'description') {
      e.preventDefault();
      focusField(item.id, 'content', 'end');
    } else if (e.key == 'Tab' && plain) {
      e.preventDefault();
      commit(item, name, field);
      if (!e.shiftKey && at > 0) {
        moveItem(item, list[at - 1], list[at - 1].children.length);
      } else if (e.shiftKey && item.parent) {
        const parent = item.parent;
        moveItem(item, parent.parent, childrenOf(parent.parent).indexOf(parent) + 1);
      } else {
        return;
      }
      focusField(item.id, name, 'end');
    } else if ((e.key == 'ArrowUp' || e.key == 'ArrowDown') && e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      commit(item, name, field);
      const to = at + (e.key == 'ArrowUp' ? -1 : 1);
      if (to < 0 || to >= list.length) return;
      moveItem(item, item.parent, to);
      focusField(item.id, name, 'end');
    } else if ((e.key == 'ArrowUp' || e.key == 'ArrowDown') && plain && !e.shiftKey && name == 'content' &&
      onEdgeLine(field, e.key == 'ArrowUp')) {
      const shown = visibleItems();
      const next = shown[shown.indexOf(item) + (e.key == 'ArrowUp' ? -1 : 1)];
      if (!next) return;
      e.preventDefault();
      commit(item, name, field);
      focusField(next.id, 'content', e.key == 'ArrowUp' ? 'end' : 'start');
    } else if (e.key == 'Backspace' && plain && name == 'content' && !readContent(field) && !item.children.length) {
      e.preventDefault();
      removeBullet(item);
    } else if (e.key == 'Backspace' && (e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey) {
      // the item with its text, and those under it (asks first then), as × does
      e.preventDefault();
      removeBullet(item, {ask: true});
    }
  }

  // ---- the outliner itself: new, renamed ----

  async function createOutliner(title) {
    const answer = await ask('/new', {form: {title}});
    const made = answer.outliner || answer.data?.outliner;
    if (!made?.outliner_id) throw failed(answer);
    await loadList();
    return String(made.outliner_id);
  }

  // Add → Outliner (library-add.js): a new one, with the name asked for, opened at once
  async function addOutliner() {
    const title = prompt(message('outlinersNewTitle'))?.trim();
    if (!title || !user) return;
    try {
      const id = await createOutliner(title);
      state.view = 'outliners';
      state.outliner = id;
      show({push: true});
    } catch (e) {
      say(message('outlinersNotSaved', e.message), true);
    }
  }

  // The name of the one shown, written in the page itself, as its items: Enter (or leaving it) saves it as Diigo's
  // library renames one (/<id>/edit; an outliner has no description of its own, the field is sent empty as the
  // library sends it), Esc puts back what was there. An empty name stays what it was. Not for one shared to read.
  async function saveMeta() {
    if (!current || current.readOnly) return;
    const outliner = current;
    const title = $('outlinerTitle').textContent.replace(/\s+/g, ' ').trim() || outliner.title;
    if (title == outliner.title) return showMeta();
    try {
      const answer = await ask(`/${encodeURIComponent(outliner.id)}/edit`, {form: {title, description: ''}});
      if (answer.code !== undefined && answer.code != 1) throw failed(answer);
      for (const same of [outliner, ...outliners]) if (same.id == outliner.id) same.title = title;
      if (current == outliner && shownHere()) showOutliner();
    } catch (e) {
      say(message('outlinersNotSaved', e.message), true);
    }
  }

  // the name as it is, in its field (not while it's being written)
  function showMeta() {
    if (current && document.activeElement != $('outlinerTitle')) $('outlinerTitle').textContent = current.title;
  }

  // ---- deleting: to the trash of the Swift Library, as a bookmark goes (library-delete.js) ----

  // An outliner deleted goes to the trash at once, with its name and items (fetched first when it isn't the one
  // shown), and leaves the list; Diigo deletes it after DELETE_DELAY, and only then the trash keeps it as one that is
  // gone (an item of the trash: type outliner, outline: its tree). Till then Undo, or Put back in the trash, simply
  // cancels it. Leaving the page before, the browser asks first (library-page.js), as it isn't deleted then.
  const waiting = new Map();  // outliner id -> its copy for the trash
  let waitTimer = 0;
  let toastOutliners = [];

  const copyId = id => 'outliner-' + id;

  async function deleteOutliner(outliner = current) {
    if (!outliner || outliner.readOnly) return;
    let tree;
    try {
      if (current?.id == outliner.id) {
        await send();
        tree = plainTree(current.roots);
      } else {
        const answer = await ask('/' + encodeURIComponent(outliner.id));
        if (answer.code != 1) throw failed(answer);
        tree = treeOf(answer.data || {});
      }
    } catch (e) {
      return say(message('outlinersNotSaved', e.message), true);
    }
    const now = Date.now();
    waiting.set(outliner.id, {
      id: copyId(outliner.id), outlinerId: outliner.id, type: 'outliner', title: outliner.title, url: '',
      description: '', tags: [], private: true, unread: false, created: outliner.updated || now / 1000,
      updated: outliner.updated || now / 1000, outline: tree, preview: treeLines(tree),
    });
    outliners = outliners.filter(other => other.id != outliner.id);
    if (current?.id == outliner.id) {
      queue = [];
      current = null;
      state.outliner = '';
    }
    clearTimeout(waitTimer);
    waitTimer = setTimeout(deleteWaiting, DELETE_DELAY);
    // the toast is of this Delete: Undo puts back this one (undo), not bookmarks of a Delete before
    toastIds = [];
    toastOutliners = [outliner.id];
    showToast(message('libraryMovedToTrash', '1'));
    show({keepScroll: true});
  }

  // back in the list, as Diigo never knew
  function putBack(id) {
    const copy = waiting.get(id);
    if (!copy) return;
    waiting.delete(id);
    if (!waiting.size) clearTimeout(waitTimer);
    outliners.push({id, title: copy.title, updated: copy.updated, preview: copy.preview});
    outliners.sort((a, b) => b.updated - a.updated);
  }

  // Undo in the toast (library-delete.js: undoDelete)
  function undo() {
    const ids = toastOutliners;
    toastOutliners = [];
    ids.forEach(putBack);
    return ids.length > 0;
  }

  // Put back of one in the trash that Diigo hasn't deleted yet (library-delete.js: cancelDelete)
  function cancel(item, li) {
    putBack(item.outlinerId);
    leaveList(item, li);
    safely('side bar', showTags);
  }

  // Diigo deletes those waiting; then the trash keeps them (keep), or not (Empty trash); how many went
  async function deleteWaiting({keep = true} = {}) {
    clearTimeout(waitTimer);
    let deleted = 0, failedCount = 0;
    for (const [id, copy] of [...waiting]) {
      try {
        const answer = await ask(`/${encodeURIComponent(id)}/delete`, {form: {}});
        if (answer.code !== undefined && answer.code != 1) throw failed(answer);
        waiting.delete(id);
        deleted++;
        if (keep) {
          const gone = {...copy, deletedAt: Date.now()};
          trash.set(gone.id, gone);
          await saveIndex({trashPut: [gone]});
        }
      } catch (e) {
        failedCount++;
        putBack(id);
      }
    }
    show({keepScroll: true});
    if (failedCount) say(message('cleanupFailed', String(failedCount)), true);
    return {deleted, failed: failedCount};
  }

  // those waiting, as the trash shows them (library-delete.js: pendingTrash)
  const pendingCopies = () => [...waiting.values()].map(copy => ({...copy, deletedAt: Date.now(),
    pendingDelete: true}));

  // Put back from the trash: the outliner made again, with its name, and its items in their order and places, as
  // new items of it (one action, as Diigo's app sends what is pasted); a new outliner for Diigo, so with a new id
  async function restore(item) {
    try {
      const id = await createOutliner(item.title || '—');
      const changes = [];
      const outline = item.outline || [];
      if (outline.length) {
        const prefix = await newPrefix();
        let seq = 0;
        const add = (items, parentId) => items.forEach((node, index) => {
          const nodeId = prefix + String(++seq).padStart(10, '0');
          changes.push({type: 'create', timeStamp: Date.now(), data: {
            itemId: nodeId, bullet_client_id: nodeId, parentId: parentId || null, parent_client_id: parentId || '0',
            index, content: node.content || '', description: '', expand: node.expand === false ? 0 : 1,
          }});
          add(node.children || [], nodeId);
        });
        add(outline, '');
        const answer = await ask('/' + encodeURIComponent(id));
        if (answer.code != 1) throw failed(answer);
        const about = answer.data?.meta || {};
        await postActions({id, maxActionId: about.max_action_id ?? null, versionId: about.version_id ?? null}, changes);
      }
      await loadList();
      safely('side bar', showTags);
      return true;
    } catch (e) {
      diigoAnswer = e.message;
      return false;
    }
  }

  // ---- Share to outliner: items of your library added to an outliner, from wherever they are edited ----

  // The items as links at the end of the outliner, as From your library adds them in the outliner itself (flagOf), so
  // in one action of the outliner as Diigo's app sends it; any kind of item. The one open here follows at once.
  // Whether it worked; when not, the bar below the blue one says why.
  async function addItems(outlinerId, items) {
    if (!outlinerId || !items.length) return true;
    try {
      const answer = await ask('/' + encodeURIComponent(outlinerId));
      if (answer.code != 1) throw failed(answer);
      const about = answer.data?.meta || {};
      const userId = String(answer.data?.user?.user_id ?? '');
      const at = treeOf(answer.data || {}).length;
      const prefix = await newPrefix();
      const changes = items.map((item, i) => {
        const id = prefix + String(i + 1).padStart(10, '0');
        return {type: 'create', timeStamp: Date.now(), data: {
          itemId: id, bullet_client_id: id, parentId: null, parent_client_id: '0', index: at + i,
          content: flagFor(item, userId), description: '', expand: 1,
        }};
      });
      await postActions({id: outlinerId, maxActionId: about.max_action_id ?? null,
        versionId: about.version_id ?? null}, changes);
      const entry = outliners.find(outliner => outliner.id == outlinerId);
      if (entry) {
        entry.updated = Date.now() / 1000;
        entry.preview = undefined;
        entry.previewAsked = false;
      }
      if (current?.id == outlinerId) await loadOutliner(outlinerId, {keepFocus: true});
      return true;
    } catch (e) {
      say(message('outlinersNotSaved', e.message), true);
      return false;
    }
  }

  // A menu of your outliners, "Share to outliner" first (nothing chosen), as the bookmark form has it: hidden without
  // any, or with the option hideShareToOutliner (options/settings.js); filled once Diigo gave the list.
  function shareSelect() {
    const select = element('select', 'share-outliner');
    select.setAttribute('aria-label', message('shareToOutliner'));
    const fill = () => {
      const chosen = select.value;
      select.replaceChildren(new Option(message('shareToOutliner'), ''),
        ...outliners.map(outliner => new Option(outliner.title || '—', outliner.id)));
      select.value = chosen;
      select.hidden = !outliners.length || !!settings.hideShareToOutliner;
    };
    select.fill = fill;
    fill();
    if (!listed) ensureList();
    return select;
  }

  // ---- From your library: the index of the Swift Library ----

  function showLibraryItems() {
    const ready = meta?.user == user;
    $('outlinerLibraryNote').hidden = ready && index.size > 0;
    $('outlinerLibraryNote').textContent = message('outlinersNoIndex');
    if (!ready) return $('outlinerLibraryItems').replaceChildren();
    const words = lower($('outlinerLibraryFind').value.trim()).split(/\s+/).filter(Boolean);
    // a hidden tag only when it is typed in full, as everywhere
    const fits = item => {
      const haystack = lower([item.title, item.url, item.description, ...item.tags].join(' '));
      return words.every(word => haystack.includes(word)) &&
        (!item.tags.some(hiddenTag) || item.tags.some(tag => words.includes(lower(tag))));
    };
    const items = liveItems().filter(fits).sort((a, b) => b.created - a.created).slice(0, LIBRARY_SHOWN);
    $('outlinerLibraryItems').replaceChildren(...items.map(item => {
      const li = element('li', 'outliner-library-item');
      // as in the list of the Swift Library: its kind, title, web address, description (two lines at most) and tags;
      // the hidden ones only when typed in full, as the item itself
      const what = element('span', 'outliner-library-text');
      const title = element('span', 'outliner-library-title', item.title || item.url);
      const kind = typeIcon(item);
      if (kind) title.prepend(kind);
      what.append(title, element('span', 'outliner-library-url', item.url || item.type));
      if (item.description) what.append(element('span', 'outliner-library-description', item.description));
      if (item.tags.length) {
        const tags = element('span', 'outliner-library-tags');
        tags.append(...item.tags.map(tag => element('span', 'tag', tag)));
        what.append(tags);
      }
      const add = element('button', 'outliner-library-add', message('outlinersAdd'));
      add.type = 'button';
      // the item itself as the content of a new item after the one last written in, or at the end
      add.onclick = async () => {
        const after = current.byId.get(lastFocus) || null;
        const made = await addBullet({...after ? {after} : {}, content: flagOf(item)});
        if (!made) return;
        lastFocus = made.id;
        add.textContent = message('outlinersAdded');
        add.disabled = true;
      };
      li.append(what, add);
      return li;
    }));
  }

  function openLibraryDialog() {
    if (!current || current.readOnly) return;
    $('outlinerLibraryFind').value = '';
    showLibraryItems();
    $('outlinerLibraryDialog').showModal();
    $('outlinerLibraryFind').focus();
  }

  // all items with items under them open or closed, and drawn once
  function expandAll(expand) {
    if (!current) return;
    for (const item of current.byId.values()) {
      if (!item.children.length || item.expand == expand) continue;
      item.expand = expand;
      if (!current.readOnly) push(change('edit', item, {expand}, {previousExpand: !expand}));
    }
    showTree();
  }

  // ---- the view ----

  // Drawn by show() (library-list.js) while Outliners is the view: the list of them, or the one of the address
  // (state.outliner), loaded first when it isn't the one loaded. Leaving one, what is still to send goes first, and
  // its first lines are kept for the list.
  async function render() {
    if (!user) return;
    if (!listed) {
      ensureList();
      return showAll();
    }
    const id = state.outliner;
    if (current && current.id != id) {
      const leaving = current;
      await send();
      queue = [];
      const entry = outliners.find(outliner => outliner.id == leaving.id);
      if (entry) {
        entry.preview = treeLines(leaving.roots);
        keepPreview(entry);
      }
      if (current == leaving) current = null;
    }
    if (!id || current?.id == id) return showOutliner();
    if (opening == id) return;
    opening = id;
    say(message('outlinersLoading'));
    try {
      await loadOutliner(id);
      say('');
      if (!current.readOnly) getPrefix().catch(() => {});
    } catch (e) {
      current = null;
      state.outliner = '';
      say(message('outlinersFailed', e.message), true);
      if (shownHere()) showOutliner();
    } finally {
      opening = '';
    }
  }

  // the title of the tab (library-list.js: showTitle): the one open, and Outliners
  const title = () => (current && current.id == state.outliner && current.title ? current.title + ' · ' : '') +
    VIEWS.outliners.label;

  // signed out, in or as someone else (library-page.js): all of it from the start
  function reset() {
    outliners = [];
    listed = false;
    current = null;
    queue = [];
    if (shownHere()) render();
  }

  // the outliners, and the page
  $('outlinerTitle').addEventListener('keydown', e => {
    if (e.key == 'Enter') {
      e.preventDefault();
      $('outlinerTitle').blur();
    } else if (e.key == 'Escape') {
      e.preventDefault();
      $('outlinerTitle').textContent = current?.title || '';
      $('outlinerTitle').blur();
    }
  });
  $('outlinerTitle').addEventListener('blur', saveMeta);
  // pasted as text, as in the items
  $('outlinerTitle').addEventListener('paste', e => {
    e.preventDefault();
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
  });
  $('outlinerAddItem').addEventListener('click', () => {
    const after = current?.byId.get(lastFocus);
    addBullet(after ? {after} : {});
  });
  $('outlinerFromLibrary').addEventListener('click', openLibraryDialog);
  $('outlinerLibraryFind').placeholder = message('outlinersLibraryFind');
  $('outlinerLibraryFind').addEventListener('input', showLibraryItems);
  $('outlinerExpandAll').addEventListener('click', () => expandAll(true));
  $('outlinerCollapseAll').addEventListener('click', () => expandAll(false));
  $('outlinerDelete').addEventListener('click', () => deleteOutliner());

  // what changed elsewhere, while one is shown and you aren't typing
  setInterval(() => {
    if (shownHere() && document.visibilityState == 'visible' && Date.now() - lastKey > 5000) send({pull: true});
  }, PULL_EVERY);
  document.addEventListener('visibilitychange', () => shownHere() && document.visibilityState == 'visible' &&
    send({pull: true}));

  // changes not on Diigo yet, or outliners not deleted yet, when the page goes: the browser asks first
  const unsaved = () => {
    if (queue.length) send();
    return queue.length > 0 || sending || waiting.size > 0;
  };

  return {
    render, title, totalText, addOutliner, reset, undo, cancel, restore, pendingCopies, unsaved,
    deleteNow: () => deleteWaiting({keep: false}), count: () => listed ? outliners.length : 0, ensureList,
    previewElement, icon, addItems, shareSelect,
  };
})();

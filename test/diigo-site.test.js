// Hidden tags on diigo.com (diigo-site/hide-page.js): the answers of Diigo's requests without what has a hidden tag,
// in a sandbox with a made-up XMLHttpRequest and page.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

// a page at pathname, with what hide.js kept in its localStorage; xhr(url, text) the answer as the library reads it
function page(pathname, kept) {
  class XMLHttpRequest {
    open(method, url) {
      this.url = url;
    }
  }
  Object.defineProperty(XMLHttpRequest.prototype, 'responseText', {configurable: true, get() {
    return this.text;
  }});
  const listeners = {};
  const context = vm.createContext({
    XMLHttpRequest, URL, JSON, Response: class {}, fetch: async () => null,
    location: {pathname, href: 'https://www.diigo.com' + pathname},
    localStorage: {getItem: () => kept == null ? null : JSON.stringify(kept)},
    document: {addEventListener: (type, listener) => listeners[type] = listener},
  });
  context.window = context;
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'diigo-site/hide-page.js'), 'utf8'), context);
  const xhr = (url, answer) => {
    const request = new XMLHttpRequest();
    request.open('GET', url);
    request.readyState = 4;
    request.text = JSON.stringify(answer);
    return JSON.parse(request.responseText);
  };
  const tell = value => listeners['swift-hidden-tags']({detail: value ? JSON.stringify(value) : ''});
  return {xhr, tell};
}

const ITEMS = {total: 3, items: [
  {link_id: 1, t_name: 'work,secret'},
  {link_id: 2, t_name: ',work'},
  {link_id: 3, t_name: 'Screenshot'},
]};
const ids = answer => answer.items.map(item => item.link_id);

test('diigo.com: your library without the items with a hidden tag, unless you search for one', () => {
  const {xhr, tell} = page('/user/me', {user: 'me', tags: ['secret', 'screenshot']});
  assert.deepStrictEqual(ids(xhr('/interact_api/load_user_items?page_num=1&count=96', ITEMS)), [2]);
  assert.deepStrictEqual(ids(xhr('/interact_api/search_user_items?what=tag:secret', ITEMS)), [1, 2, 3]);
  // another request: as it is
  assert.deepStrictEqual(xhr('/interact_api/load_user_item?link_id=1', ITEMS), ITEMS);
  // hideOnDiigo off: nothing hidden
  tell(null);
  assert.deepStrictEqual(ids(xhr('/interact_api/load_user_items', ITEMS)), [1, 2, 3]);
});

test('diigo.com: the hidden tags out of the list of tags, whatever its form', () => {
  const {xhr} = page('/user/me', {user: 'me', tags: ['secret']});
  assert.deepStrictEqual(xhr('/interact_api/load_user_tags?type=all', {code: 1, tags: [{name: 'work', count: 3}, {name: 'Secret', count: 1}]}),
    {code: 1, tags: [{name: 'work', count: 3}]});
  assert.deepStrictEqual(xhr('/interact_api/load_user_tags', ['work', 'secret']), ['work']);
  assert.deepStrictEqual(xhr('/interact_api/load_user_tags', {data: {work: 3, secret: 1}}), {data: {work: 3}});
});

test('diigo.com: not in the library of someone else, nor without hidden tags', () => {
  assert.deepStrictEqual(ids(page('/profile/other', {user: 'me', tags: ['secret']}).xhr('/interact_api/load_user_items', ITEMS)),
    [1, 2, 3]);
  assert.deepStrictEqual(ids(page('/user/me', null).xhr('/interact_api/load_user_items', ITEMS)), [1, 2, 3]);
});

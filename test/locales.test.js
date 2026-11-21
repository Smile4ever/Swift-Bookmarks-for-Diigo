// Every language has every text, with its placeholders, and every text the add-on asks for exists
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LOCALES = path.join(ROOT, '_locales');
const read = locale => JSON.parse(fs.readFileSync(path.join(LOCALES, locale, 'messages.json'), 'utf8'));
const english = read('en');

test('every language has the texts of English, and no others', () => {
  for (const locale of fs.readdirSync(LOCALES)) {
    const keys = Object.keys(read(locale));
    assert.deepStrictEqual(Object.keys(english).filter(key => !keys.includes(key)), [], `missing in ${locale}`);
    assert.deepStrictEqual(keys.filter(key => !(key in english)), [], `extra in ${locale}`);
  }
});

test('every language has the placeholders of English', () => {
  for (const locale of fs.readdirSync(LOCALES)) {
    const messages = read(locale);
    for (const [key, {placeholders}] of Object.entries(english)) {
      for (const name of Object.keys(placeholders ?? {})) {
        assert.ok(messages[key].placeholders?.[name], `${locale}.${key} has no placeholder ${name}`);
        assert.ok(messages[key].message.includes('$' + name.toUpperCase() + '$'), `${locale}.${key} doesn't use $${name.toUpperCase()}$`);
      }
    }
  }
});

test('the description of the add-on fits in the Chrome Web Store (132 characters)', () => {
  for (const locale of fs.readdirSync(LOCALES)) {
    const description = read(locale).extDesc.message;
    assert.ok(description.length <= 132, `${locale}: ${description.length} characters`);
  }
});

test('every text of the pages and the manifest exists', () => {
  const sources = {
    'form/form.html': /data-i18n(?:-title)?="([^"]+)"/g,
    'options/options.html': /data-i18n="([^"]+)"/g,
    'options/library.html': /data-i18n(?:-label|-title)?="([^"]+)"/g,
    'options/discover.html': /data-i18n(?:-label|-title)?="([^"]+)"/g,
    'manifest.json': /__MSG_(\w+)__/g,
  };
  for (const [file, pattern] of Object.entries(sources)) {
    const ids = [...fs.readFileSync(path.join(ROOT, file), 'utf8').matchAll(pattern)].map(match => match[1]);
    assert.ok(ids.length, file);
    assert.deepStrictEqual(ids.filter(id => !(id in english)), [], file);
  }
});

test('every text the scripts ask for exists', () => {
  // getMessage('id'), t('id') and message('id'), and the ids in the lists of options.js and diigo-site/
  const pattern = /(?:getMessage|\bt|\bmessage)\('(\w+)'[,)]|\b(?:message|text|click): '(\w+)'|'(hint\w+)'/g;
  const idsIn = file => [...fs.readFileSync(path.join(ROOT, file), 'utf8').matchAll(pattern)].map(match => match[1] || match[2] || match[3]);
  const scripts = ['background/background.js', 'background/sync.js', 'form/form.js', 'options/options.js',
    'options/library-index.js', 'options/discover.js'];
  for (const file of scripts) {
    const ids = idsIn(file);
    assert.ok(ids.length, file);
    assert.deepStrictEqual(ids.filter(id => !(id in english)), [], file);
  }
  // the parts of the Swift Library (options/library*.js but its index) together: some have no texts
  const libraryScripts = fs.readdirSync(path.join(ROOT, 'options'))
    .filter(file => /^library(-(?!index\b)[\w-]+)?\.js$/.test(file)).map(file => 'options/' + file);
  assert.ok(libraryScripts.length > 1, 'options/library*.js');
  const libraryIds = libraryScripts.flatMap(idsIn);
  assert.ok(libraryIds.length, 'options/library*.js');
  assert.deepStrictEqual(libraryIds.filter(id => !(id in english)), [], 'options/library*.js');
  // the scripts of diigo-site/ together: some have no texts
  const siteScripts = fs.readdirSync(path.join(ROOT, 'diigo-site')).filter(file => file.endsWith('.js')).map(file => 'diigo-site/' + file);
  const siteIds = siteScripts.flatMap(idsIn);
  assert.ok(siteIds.length, 'diigo-site/');
  assert.deepStrictEqual(siteIds.filter(id => !(id in english)), [], 'diigo-site/');
});

test('the texts of the menus of Swift Discover exist', () => {
  // in lists of discover.js, by name: SORT_TEXTS and SHOW_TEXTS
  const source = fs.readFileSync(path.join(ROOT, 'options/discover.js'), 'utf8');
  const ids = [...source.matchAll(/^const (?:SORT|SHOW)_TEXTS = \{([^}]*)\}/gm)]
    .flatMap(match => [...match[1].matchAll(/'(\w+)'/g)].map(id => id[1]));
  assert.strictEqual(ids.length, 7);
  assert.deepStrictEqual(ids.filter(id => !(id in english)), []);
});

test('every text is used: in a script, a page or the manifest', () => {
  // the scripts and pages of the add-on (not its builds, tests, texts or docs), and the manifest
  const files = [];
  const walk = dir => {
    for (const name of fs.readdirSync(path.join(ROOT, dir))) {
      if (['dist', 'node_modules', 'test', '_locales', 'web-ext-artifacts', 'docs', 'scripts'].includes(name) ||
        name.startsWith('.')) continue;
      const file = dir ? dir + '/' + name : name;
      if (fs.statSync(path.join(ROOT, file)).isDirectory()) walk(file);
      else if (/\.(js|html)$/.test(name) || name == 'manifest.json') files.push(file);
    }
  };
  walk('');
  const text = files.map(file => fs.readFileSync(path.join(ROOT, file), 'utf8')).join('\n');
  // texts asked for by a name made of a start and what is chosen: message('librarySort' + capitalized(sort)) and the like
  const MADE = ['libraryLinks', 'searchField', 'librarySort', 'libraryPrivacy', 'librarySaved'];
  const unused = Object.keys(english).filter(id => !MADE.some(start => id.startsWith(start)) &&
    !text.includes(`'${id}'`) && !text.includes(`"${id}"`) && !text.includes('`' + id + '`') &&
    !text.includes(`__MSG_${id}__`));
  assert.deepStrictEqual(unused, [], 'texts no script, page or the manifest uses: take them out of _locales');
});


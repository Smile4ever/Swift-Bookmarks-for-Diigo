// The manifest of each build, and the files it points to
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const {TARGETS, COMMON_FILES, targetManifest} = require('../scripts/build.js');

const ROOT = path.join(__dirname, '..');

// the files a manifest points to
function manifestFiles(manifest) {
  return [
    ...manifest.background.scripts ?? [],
    ...manifest.background.service_worker ? [manifest.background.service_worker] : [],
    ...manifest.content_scripts.flatMap(script => [...script.js, ...script.css ?? []]),
    manifest.options_ui.page,
    ...typeof manifest.action.default_icon == 'string' ? [manifest.action.default_icon] : Object.values(manifest.action.default_icon),
    ...Object.values(manifest.icons),
    ...manifest.web_accessible_resources.flatMap(resource => resource.resources),
  ];
}

const inBuild = (target, file) => [...COMMON_FILES, ...TARGETS[target].files].some(part => file == part || file.startsWith(part + '/'));

test('the Firefox build has an event page and Firefox settings only', () => {
  const manifest = targetManifest('firefox');
  assert.deepStrictEqual(manifest.background, {scripts: ['options/settings.js', 'options/index-item.js', 'background/background.js', 'background/sync.js']});
  assert.ok(manifest.browser_specific_settings.gecko.id);
  assert.strictEqual(manifest.minimum_chrome_version, undefined);
});

test('the Chrome build has a service worker, no Firefox settings and no Ctrl+Alt shortcut', () => {
  const manifest = targetManifest('chrome');
  assert.deepStrictEqual(manifest.background, {service_worker: 'background/chrome-sw.js'});
  assert.strictEqual(manifest.browser_specific_settings, undefined);
  assert.ok(!/Ctrl\+Alt/.test(JSON.stringify(manifest.commands)));
});

test('every file of a manifest is in its build and exists', () => {
  for (const target of Object.keys(TARGETS)) {
    for (const file of manifestFiles(targetManifest(target))) {
      assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} doesn't exist`);
      assert.ok(inBuild(target, file), `${file} is not in the ${target} build`);
    }
  }
});

test('diigo.com gets every script of diigo-site/, common.js first and diigo-site.js, which runs them, last', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  // hide-page.js on its own, in the page itself (world MAIN), as early as it can be, on www.diigo.com only
  const inPage = manifest.content_scripts.filter(script => script.world == 'MAIN');
  assert.deepStrictEqual(inPage.map(script => [script.js, script.matches, script.run_at]),
    [[['diigo-site/hide-page.js'], ['https://www.diigo.com/*'], 'document_start']]);
  const scripts = manifest.content_scripts.find(script => script.world != 'MAIN' && script.matches.includes('https://www.diigo.com/*')).js;
  const site = scripts.filter(file => file.startsWith('diigo-site/'));
  const onDisk = fs.readdirSync(path.join(ROOT, 'diigo-site')).filter(file => file.endsWith('.js') && file != 'hide-page.js')
    .map(file => 'diigo-site/' + file);
  assert.deepStrictEqual([...site].sort(), onDisk.sort());
  // Discover on diigo.com is left as Diigo made it: Swift Discover is a page of the add-on
  assert.strictEqual(manifest.content_scripts.length, 2);
  assert.strictEqual(scripts[0], 'options/settings.js');
  assert.strictEqual(site[0], 'diigo-site/common.js');
  assert.strictEqual(site.at(-1), 'diigo-site/diigo-site.js');
});

test('the service worker loads the scripts of the Firefox event page, in the same order', () => {
  const worker = fs.readFileSync(path.join(ROOT, 'background/chrome-sw.js'), 'utf8');
  const imported = worker.match(/importScripts\(([^)]*)\)/)[1].match(/'[^']*'/g).map(s => path.posix.join('background', s.slice(1, -1)));
  assert.deepStrictEqual(imported, targetManifest('firefox').background.scripts);
});

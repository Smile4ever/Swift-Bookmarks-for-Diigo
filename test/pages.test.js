// The scripts of each page of the add-on share one global scope: a name declared twice (const, let, class) stops the
// script that declares it again, and with it the page
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const OPTIONS = path.join(__dirname, '..', 'options');

for (const page of fs.readdirSync(OPTIONS).filter(file => file.endsWith('.html'))) {
  test(`${page}: its scripts declare no name twice`, () => {
    const html = fs.readFileSync(path.join(OPTIONS, page), 'utf8');
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(match => match[1]);
    const context = vm.createContext({});
    for (const script of scripts) {
      try {
        new vm.Script(fs.readFileSync(path.join(OPTIONS, script), 'utf8'), {filename: script}).runInContext(context);
      } catch (e) {
        // only what goes wrong before it runs: without a browser, running it fails on browser.* and the page itself
        assert.ok(!(e instanceof SyntaxError) && !/already been declared/.test(e.message), `${script}: ${e.message}`);
      }
    }
  });
}

// Swift Options draws a switch for each setting that is on or off (options.js); one set elsewhere has none
test('options.html has a switch for each setting that is on or off, but those set elsewhere', () => {
  const context = vm.createContext({});
  new vm.Script(fs.readFileSync(path.join(OPTIONS, 'settings.js'), 'utf8')).runInContext(context);
  const html = fs.readFileSync(path.join(OPTIONS, 'options.html'), 'utf8');
  const elsewhere = ['formScreenshot'];
  const booleans = new vm.Script('Object.entries(DEFAULT_SETTINGS).filter(([, value]) => typeof value == "boolean")' +
    '.map(([key]) => key)').runInContext(context);
  const missing = [...booleans].filter(key => !elsewhere.includes(key) && !html.includes(`id="${key}"`));
  assert.deepStrictEqual(missing, []);
});

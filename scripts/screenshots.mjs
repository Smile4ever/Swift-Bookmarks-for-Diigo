// The screenshots of the add-on stores (docs/store-listing.md: Screenshots), made with the Chrome build in Chrome for
// Testing (Puppeteer), 1280×800, in English. Diigo is played by this script: every request to diigo.com (and to the
// pages of the bookmarks) is answered with made-up data (DEMO below), so no account is needed and nothing of yours
// shows. Diigo's own images (its logo, its icons, the avatar) can't be asked for by a script (diigo.com answers 403):
// they come from scripts/screenshot-assets/ when they are there (saved from a browser; not in the repository).
// Usage: npm run build && npm run screenshots   → images/store/*.png
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'images', 'store');
const ASSETS = path.join(ROOT, 'scripts', 'screenshot-assets');
const WIDTH = 1280, HEIGHT = 800;
const USER = 'swiftdemo';
const DAY = 24 * 60 * 60;
const NOW = Math.floor(Date.now() / 1000);

// ---- the made-up library ----

// [title, web address, tags, days ago, {private, unread, type, status of its page, ...}]
const BOOKMARKS = [
  ['Classic Spaghetti Carbonara', 'https://www.cooking.example/italian/spaghetti-carbonara', 'recipes italian pasta', 2],
  ['A Gentle Introduction to Machine Learning', 'https://learn.example/ml/introduction', 'machine-learning tutorial', 3, {unread: true}],
  ['The 20 Best Hiking Trails in the Alps', 'https://travel.example/alps/hiking-trails', 'travel hiking alps', 4],
  ['Modern JavaScript: async and await explained', 'https://dev.example/js/async-await', 'javascript tutorial', 5],
  ['Sourdough Bread for Beginners', 'https://www.cooking.example/bread/sourdough', 'recipes baking bread', 6, {unread: true}],
  ['Designing Better Forms', 'https://design.example/articles/better-forms', 'design ux', 8],
  ['Notes from the team meeting', 'https://www.diigo.com/item/note/demo1', 'work', 9, {type: 'note'}],
  ['How Photographers Use the Golden Hour', 'https://photo.example/golden-hour', 'photography light', 10],
  ['CSS Grid: A Complete Guide', 'https://dev.example/css/grid-guide', 'css design reference', 12],
  ['Ten Minute Vegetable Curry', 'https://www.cooking.example/curry/vegetable', 'recipes vegetarian', 14],
  ['Reading List 2026', 'https://books.example/reading-list-2026', 'reading books', 15, {status: 404}],
  ['Getting Started with Python', 'https://learn.example/python/start', 'python tutorial', 17],
  ['Kyoto in Autumn', 'https://travel.example/japan/kyoto-autumn', 'travel japan', 20],
  ['Neural Networks Visualised', 'https://learn.example/ml/neural-networks', 'machine-learning visualization', 22, {unread: true}],
  ['Old Conference Schedule', 'https://events.example/conf-2019/schedule', 'conference', 25, {status: 404}],
  ['Homemade Pizza Dough', 'https://www.cooking.example/italian/pizza-dough', 'recipes italian baking', 27],
  ['A Field Guide to Typography', 'https://design.example/typography/guide', 'design typography', 30],
  ['Productivity: The Two Minute Rule', 'https://blog.example/two-minute-rule', 'productivity', 33],
  ['Mountain Panorama', 'https://www.diigo.com/item/image/demo2', 'photography alps', 36, {type: 'image'}],
  ['Regular Expressions Cheat Sheet', 'https://dev.example/regex/cheat-sheet', 'reference javascript', 40],
  ['Tapas: Small Plates from Spain', 'https://www.cooking.example/spanish/tapas', 'recipes spanish', 45],
  ['Annual Report 2025', 'https://www.diigo.com/item/pdf/demo3', 'work reports', 50, {type: 'pdf'}],
  ['Lisbon on Foot', 'https://travel.example/portugal/lisbon-walks', 'travel', 55, {status: 301}],
  ['Deep Learning Book, Chapter 1', 'https://learn.example/dl/chapter-1', 'machine-learning reading', 60],
  ['Accessible Colour Palettes', 'https://design.example/colour/accessible', 'design accessibility', 70],
  ['Git Branching, Visually', 'https://dev.example/git/branching', 'git reference', 80],
  ['The Art of the Omelette', 'https://www.cooking.example/eggs/omelette', 'recipes', 90],
  ['Night Photography Basics', 'https://photo.example/night-basics', 'photography tutorial', 100],
  ['Iceland Ring Road Itinerary', 'https://travel.example/iceland/ring-road', 'travel iceland', 120],
  ['Writing Clear Documentation', 'https://blog.example/clear-docs', 'writing productivity', 140],
];
// more of the same, older, so the library and its tags look lived in
const MORE_TOPICS = [['recipes', 'cooking', ['dinner', 'baking', 'vegetarian', 'italian']],
  ['travel', 'travel', ['europe', 'hiking', 'japan', 'city-trips']], ['javascript', 'dev', ['tutorial', 'reference', 'css']],
  ['design', 'design', ['ux', 'typography', 'inspiration']], ['photography', 'photo', ['tutorial', 'light', 'gear']],
  ['machine-learning', 'learn', ['python', 'tutorial', 'visualization']], ['reading', 'books', ['books', 'fiction']],
  ['productivity', 'blog', ['writing', 'tools', 'habits']]];
for (let i = 0; i < 90; i++) {
  const [tag, site, others] = MORE_TOPICS[i % MORE_TOPICS.length];
  const other = others[Math.floor(i / MORE_TOPICS.length) % others.length];
  BOOKMARKS.push([`${tag[0].toUpperCase() + tag.slice(1).replace('-', ' ')}: ${other.replace('-', ' ')} ${i + 1}`,
    `https://${site}.example/${other}/${tag}-${i + 1}`, `${tag} ${other}`, 150 + i * 9]);
}

const items = BOOKMARKS.map(([title, url, tags, days, extra = {}], i) => ({
  link_id: String(1000 + i), url, title, description: i % 3 == 0 ? `About ${title.toLowerCase()}.` : '',
  t_name: tags.split(' ').join(','), type_name: extra.type || 'bookmark', private: extra.private ?? i % 4 != 0 ? 1 : 0,
  readed: extra.unread ? 0 : 1, annotations: [], created_at: NOW - days * DAY, updated_at: NOW - days * DAY,
  ...extra.type == 'note' ? {note_content: '<p>Agenda: the new release, the store screenshots, and the docs.</p><ul><li>Release on Friday</li><li>Screenshots in English</li><li>Docs for Outliners</li></ul>', is_rich_note: 1} : {},
  ...extra.type == 'image' ? {thumbnail_url: 'https://images.example/panorama.svg'} : {},
}));
const statusOf = url => BOOKMARKS.find(b => b[1] == url)?.[4]?.status || 200;

const tagCounts = new Map();
for (const item of items) for (const tag of item.t_name.split(',')) tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
const myTags = [...tagCounts].map(([name, count]) => ({name, count})).sort((a, b) => b.count - a.count);

// ---- the made-up Hot Bookmarks of Diigo (/buzz/hot) ----

const HOT = [
  ['The Unreasonable Effectiveness of Plain Text', 'https://blog.example/plain-text', 'productivity writing', 42],
  ['Interactive Guide to Flexbox', 'https://dev.example/css/flexbox-interactive', 'css design tutorial', 37],
  ['Why We Sleep: A Summary', 'https://books.example/why-we-sleep', 'reading health', 31],
  ['Machine Learning for Kids', 'https://learn.example/ml/kids', 'machine-learning education', 28],
  ['The Best Ramen in Tokyo', 'https://travel.example/japan/tokyo-ramen', 'travel japan food', 25],
  ['Color Theory for Designers', 'https://design.example/colour/theory', 'design colour', 22],
  ['A Beginner\'s Guide to Film Photography', 'https://photo.example/film-guide', 'photography film', 19],
  ['Bread Baking: Hydration Explained', 'https://www.cooking.example/bread/hydration', 'recipes baking', 17],
  ['TypeScript in 10 Minutes', 'https://dev.example/ts/ten-minutes', 'javascript typescript', 15],
  ['Minimalist Travel Packing List', 'https://travel.example/packing-list', 'travel minimalism', 12],
  ['Data Visualization Principles', 'https://learn.example/dataviz/principles', 'visualization design', 11],
  ['Slow Cooker Chili', 'https://www.cooking.example/chili/slow-cooker', 'recipes', 9],
];
const buzzHtml = () => `<html><body>${HOT.map(([title, url, tags, people], i) => `
  <div class="ditemItem">
    <div class="savePeopleCount"><strong>${people}</strong></div>
    <a class="titleLink" href="${url}">${title}</a>
    <div class="desc"><span class="content"></span></div>
    <span id="tags_${i}">${tags.split(' ').map(tag => `<a href="/tag/${tag}">${tag}</a>`).join(' ')}</span>
    <div class="nothers">first saved by <a href="/user/reader${i}">reader${i}</a> on Nov ${(i % 20) + 1}, 26</div>
  </div>`).join('')}</body></html>`;

// ---- the pages of the bookmarks: a page for the form, the rest only as far as checking links needs ----

const NEW_PAGE = 'https://www.cooking.example/italian/tagliatelle-with-mushrooms';
const SAVED_PAGE = 'https://www.cooking.example/italian/spaghetti-carbonara';
const demoPage = (title, description) => `<!doctype html><html><head><meta charset="utf-8">
<title>${title}</title>
<meta name="description" content="${description}">
<meta name="keywords" content="recipes, italian, pasta, dinner">
<style>
  body { margin: 0; font: 17px/1.6 Georgia, serif; color: #2b2b2b; background: #fbf8f3; }
  header { padding: 18px 48px; background: #7a2e1f; color: #fff; font: 600 22px system-ui, sans-serif; }
  main { max-width: 680px; margin: 40px 48px; }
  h1 { font-size: 40px; margin: 0 0 8px; }
  .meta { color: #8a7a6a; font: 14px system-ui, sans-serif; margin-bottom: 24px; }
  .photo { height: 260px; border-radius: 8px; background: linear-gradient(135deg, #f3d9a4, #e0a458 55%, #b5651d); margin-bottom: 24px; }
  li { margin: 4px 0; }
</style></head><body>
<header>The Cooking Example</header>
<main>
  <h1>${title}</h1>
  <div class="meta">Italian · 25 minutes · serves 4</div>
  <div class="photo"></div>
  <p>${description}</p>
  <h2>Ingredients</h2>
  <ul><li>400 g fresh pasta</li><li>300 g mushrooms</li><li>2 cloves of garlic</li><li>80 g parmigiano</li></ul>
</main></body></html>`;
const PAGES = {
  [NEW_PAGE]: demoPage('Fresh Tagliatelle with Mushrooms', 'Fresh egg pasta with a creamy mushroom sauce, ready in 25 minutes.'),
  [SAVED_PAGE]: demoPage('Classic Spaghetti Carbonara', 'A classic Roman pasta with eggs, pecorino, guanciale and black pepper.'),
};

const PANORAMA = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240">
<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8ec5fc"/><stop offset="1" stop-color="#e0c3fc"/></linearGradient></defs>
<rect width="320" height="240" fill="url(#s)"/><path d="M0 200 L70 110 L120 160 L190 70 L260 150 L320 100 L320 240 L0 240Z" fill="#4a6572"/>
<path d="M170 95 L190 70 L210 95Z" fill="#fff"/></svg>`;

// ---- Diigo, as the add-on asks it ----

function toolbarAnswer(cmd, body) {
  const data = JSON.parse(new URLSearchParams(body).get('json') || '{}');
  if (cmd == 'user_loadMyStuff') {
    return {code: 1, user: USER, result: {myTagsWithCount: myTags, myGroups: [{name: 'cooking-club', displayName: 'Cooking Club'}],
      outliners: [{id: 501, title: 'Trip to Japan'}, {id: 502, title: 'Release checklist'}], myList: []}};
  }
  if (cmd == 'bm_loadBookmark') {
    const item = items.find(other => other.url == data.url);
    if (!item) return {code: 1, user: USER, result: {saved: false}};
    return {code: 1, user: USER, result: {saved: true, url: item.url, urlId: 'u' + item.link_id, bookmarkInfo: {
      title: item.title, description: item.description, tags: item.t_name.split(','), mode: item.private ? 2 : 0,
      unread: item.readed == 0, datetime: '2 days ago'}}};
  }
  return {code: 1, user: USER, result: {}};
}

function libraryAnswer(params) {
  const sort = params.get('sort');
  const sorted = [...items].sort(sort == 'created' ? (a, b) => a.created_at - b.created_at : (a, b) => b.updated_at - a.updated_at);
  const count = Number(params.get('count')) || 96;
  const page = Number(params.get('page_num')) || 0;
  return {items: sorted.slice(page * count, (page + 1) * count), total: items.length};
}

const OUTLINERS = {
  501: {title: 'Trip to Japan', points: ['Kyoto: temples in the morning', 'Tokyo: Shibuya, Asakusa, Ueno', 'Book the ryokan', 'Rail pass']},
  502: {title: 'Release checklist', points: ['Tests pass', 'Screenshots in English', 'Changelog', 'Upload to the stores']},
};

function outlinerAnswer(pathname) {
  if (pathname == '/outliner/list') {
    return {code: 1, data: {outliners: Object.entries(OUTLINERS).map(([id, o], i) => ({outliner_id: Number(id), title: o.title,
      created_at: NOW - (40 + i) * DAY, updated_at: NOW - (3 + i * 5) * DAY}))}};
  }
  const id = pathname.split('/')[2];
  const outliner = OUTLINERS[id];
  if (!outliner) return {code: 1, data: {}};
  return {code: 1, data: {meta: {title: outliner.title, max_action_id: 1, version_id: 1}, user: {user_id: 7, permission: ['read', 'write']},
    bulletpoints: outliner.points.map((content, i) => ({bullet_client_id: `p${id}${i}`, parent_client_id: 0, position: i,
      content, description: '', expand: 1})), actions: []}};
}

// What to answer a request with: {status, headers, body}, or null to let it go to the network (Diigo's own images)
function answerFor(url, method, postData) {
  const u = new URL(url);
  const json = value => ({status: 200, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(value)});
  if (u.host == 'toolbar3.diigo.com') return json(toolbarAnswer(u.pathname.match(/cmd=(\w+)/)?.[1], postData || ''));
  if (u.host == 'www.diigo.com') {
    if (u.pathname.startsWith('/asset/') || u.pathname.startsWith('/images/')) {
      const file = path.join(ASSETS, path.basename(u.pathname));
      if (!fs.existsSync(file)) return null;
      const type = file.endsWith('.png') ? 'image/png' : file.endsWith('.svg') ? 'image/svg+xml' : 'image/jpeg';
      return {status: 200, headers: {'Content-Type': type}, body: fs.readFileSync(file)};
    }
    if (u.pathname == '/interact_api/load_user_items') return json(libraryAnswer(u.searchParams));
    if (u.pathname.startsWith('/buzz/hot')) return {status: 200, headers: {'Content-Type': 'text/html'}, body: buzzHtml()};
    if (u.pathname.startsWith('/outliner')) return json(outlinerAnswer(u.pathname));
    return json({code: 1});
  }
  if (u.host == 'images.example') return {status: 200, headers: {'Content-Type': 'image/svg+xml'}, body: PANORAMA};
  if (u.hostname.endsWith('.example')) {
    if (PAGES[u.href]) return {status: 200, headers: {'Content-Type': 'text/html; charset=utf-8'}, body: PAGES[u.href]};
    const status = statusOf(u.href.replace(/\/$/, '')) || 200;
    if (status == 301) return {status: 301, headers: {Location: 'https://travel.example/lisbon/walking-tours'}, body: ''};
    const title = u.pathname.split('/').pop().replace(/-/g, ' ');
    return {status, headers: {'Content-Type': 'text/html'}, body: status == 404 ? '<title>Not found</title>' : `<title>${title}</title>`};
  }
  return null;
}

// every request of a target (a page, the service worker) through answerFor, with the Fetch domain of DevTools
async function playDiigo(target) {
  const session = await target.createCDPSession();
  session.on('Fetch.requestPaused', async ({requestId, request}) => {
    const answer = (() => {
      try {
        return answerFor(request.url, request.method, request.postData);
      } catch (e) {
        console.error('screenshots: no answer for', request.url, e);
        return null;
      }
    })();
    try {
      if (!answer) return await session.send('Fetch.continueRequest', {requestId});
      await session.send('Fetch.fulfillRequest', {requestId, responseCode: answer.status,
        responseHeaders: Object.entries(answer.headers).map(([name, value]) => ({name, value})),
        body: Buffer.from(answer.body).toString('base64')});
    } catch (e) {
      // the target is gone
    }
  });
  await session.send('Fetch.enable', {patterns: [{urlPattern: '*'}]});
  return session;
}

// ---- Chrome with the add-on ----

async function launch() {
  const browser = await puppeteer.launch({browser: 'chrome', headless: true, pipe: true, enableExtensions: true,
    defaultViewport: {width: WIDTH, height: HEIGHT}, args: [`--window-size=${WIDTH},${HEIGHT}`, '--lang=en-US'],
    env: {...process.env, LANG: 'en_US.UTF-8'}});
  const id = await browser.installExtension(path.join(ROOT, 'dist', 'chrome'));
  const workerTarget = await browser.waitForTarget(t => t.type() == 'service_worker' && t.url().includes(id));
  await playDiigo(workerTarget);
  // every new page through Diigo of this script too, before it asks anything
  browser.on('targetcreated', target => {
    if (target.type() == 'page' || target.type() == 'other') playDiigo(target).catch(() => {});
  });
  const page = await browser.newPage();
  // signed in on diigo.com: the cookie the add-on reads (background.js: readCookie)
  await browser.setCookie({name: 'diigoandlogincookie', value: `demo-.-${USER}`, domain: '.diigo.com', path: '/',
    secure: true});
  const worker = await workerTarget.worker();
  await worker.evaluate(() => readCookie());
  return {browser, page, worker, base: `chrome-extension://${id}/`};
}

async function newPage(browser) {
  const page = await browser.newPage();
  await playDiigo(page.target());
  await page.setViewport({width: WIDTH, height: HEIGHT});
  return page;
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function shot(page, name) {
  await page.screenshot({path: path.join(OUT, name)});
  console.log(name);
}

// a page with the bookmark form on it, as the toolbar button opens it (background.js: showForm); the frame of the form
async function pageWithForm(browser, worker, url) {
  const page = await newPage(browser);
  await page.goto(url);
  await worker.evaluate(async url => {
    const [tab] = await chrome.tabs.query({url});
    await showForm(tab);
  }, url);
  let frame = null;
  for (let i = 0; i < 50 && !frame; i++) {
    frame = page.frames().find(f => f.url().includes('form/form.html'));
    if (!frame) await wait(200);
  }
  await frame.waitForSelector('#suggested .tag, #tags', {timeout: 15000});
  await wait(2500);
  return {page, frame};
}

// ---- the screenshots ----

async function main() {
  fs.mkdirSync(OUT, {recursive: true});
  const {browser, worker, base} = await launch();
  try {
    // the Swift Library first: it builds the index, which the form and Swift Discover use too
    const library = await newPage(browser);
    await library.goto(base + 'options/library.html#view=all');
    await library.waitForSelector('#items .item', {timeout: 30000});
    await wait(4000);
    await shot(library, '4-library.png');

    // 6: the menu of a dead link, in Dead links
    await library.goto(base + 'options/library.html#view=dead');
    await library.reload();
    await library.waitForSelector('#items .link-status[data-state="dead"]', {timeout: 30000});
    await wait(1000);
    await library.click('#items .link-status[data-state="dead"]');
    await wait(800);
    await shot(library, '6-archive.png');

    // 1: the form on a page that isn't saved yet, its tags suggested
    const fresh = await pageWithForm(browser, worker, NEW_PAGE);
    await shot(fresh.page, '1-form.png');
    // 3: the same, with the cloud of your tags
    await fresh.frame.click('#cloud-button');
    await wait(800);
    await shot(fresh.page, '3-tag-cloud.png');

    // 2: a page that is saved already
    const saved = await pageWithForm(browser, worker, SAVED_PAGE);
    await shot(saved.page, '2-saved.png');

    // 5: Swift Discover
    const discover = await newPage(browser);
    await discover.goto(base + 'options/discover.html');
    await discover.waitForSelector('#items li', {timeout: 30000});
    await wait(3000);
    await shot(discover, '5-discover.png');
  } finally {
    await browser.close();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

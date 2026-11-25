// Builds Swift Bookmarks for Diigo for Firefox and for Chrome (also used for Edge), like Neat URL does.
// Usage: node scripts/build.js [firefox] [chrome]
// Output: web-ext-artifacts/swift_bookmarks_for_diigo-<version>.<target>.zip, made from dist/<target>/ (also used by web-ext lint)
//
// manifest.json in the repository works in both browsers, so the folder can be loaded without a build.
// A build only keeps the files and manifest keys that one browser needs.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const {execSync} = require('child_process');

const ROOT = path.join(__dirname, '..');

// Only what git tracks is built: a file that is ignored (.gitignore) or untracked isn't shipped, so local-only files
// in a folder that is copied whole (such as options) stay out of the add-on. Empty when git isn't there: then all is
// copied, as before.
const ignored = (() => {
  try {
    return new Set(execSync('git ls-files --others --ignored --exclude-standard -z', {cwd: ROOT})
      .toString('utf8').split('\0').filter(Boolean));
  } catch (e) {
    return new Set();
  }
})();
const shipped = src => !ignored.has(path.relative(ROOT, src).split(path.sep).join('/'));

// images/store: the pictures of the add-on stores, also in Swift Guide (options/guide.html); images/guide: those of
// Swift Guide only
const COMMON_FILES = ['_locales', 'icons', 'images/store', 'images/guide', 'background/background.js', 'background/sync.js', 'content', 'diigo-site', 'form', 'options'];

const TARGETS = {
  firefox: {
    files: [],
    manifest: manifest => {
      delete manifest.background.service_worker;
      delete manifest.minimum_chrome_version;
    },
  },
  chrome: {
    files: ['background/chrome-sw.js'],
    manifest: manifest => {
      delete manifest.background.scripts;
      delete manifest.browser_specific_settings;
      // Chrome and Edge don't allow Ctrl+Alt shortcuts (they clash with AltGr)
      manifest.commands['show-bookmark-form'].suggested_key = {default: 'Alt+Shift+D'};
    },
  },
};

function copy(relative, outDir) {
  const target = path.join(outDir, relative);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.cpSync(path.join(ROOT, relative), target, {recursive: true, filter: shipped});
}

function listFiles(dir, prefix = '') {
  let result = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix ? prefix + '/' + entry.name : entry.name;
    if (entry.isDirectory()) result = result.concat(listFiles(path.join(dir, entry.name), relative));
    else result.push(relative);
  }
  return result;
}

let crcTable = null;
function crc32(buffer) {
  if (!crcTable) {
    crcTable = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xFFFFFFFF;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// a small ZIP writer (deflate), so no other tools are needed
function writeZip(dir, zipFile) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const name of listFiles(dir)) {
    const data = fs.readFileSync(path.join(dir, name));
    const compressed = zlib.deflateRawSync(data, {level: 9});
    const nameBuffer = Buffer.from(name, 'utf8');
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(0, 10); // time and date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBuffer, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuffer);

    offset += local.length + nameBuffer.length + compressed.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(centralParts.length / 2, 8);
  end.writeUInt16LE(centralParts.length / 2, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);

  fs.mkdirSync(path.dirname(zipFile), {recursive: true});
  fs.writeFileSync(zipFile, Buffer.concat([...localParts, ...centralParts, end]));
}

// the manifest of a target, also used by test/build.test.js
function targetManifest(target) {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  TARGETS[target].manifest(manifest);
  return manifest;
}

function build(target) {
  const outDir = path.join(ROOT, 'dist', target);
  // retries: sync tools like Dropbox can lock files for a moment
  fs.rmSync(outDir, {recursive: true, force: true, maxRetries: 10, retryDelay: 200});
  fs.mkdirSync(outDir, {recursive: true});

  for (const file of [...COMMON_FILES, ...TARGETS[target].files]) copy(file, outDir);
  const manifest = targetManifest(target);
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Built Swift Bookmarks for Diigo ${manifest.version} for ${target}: ${path.relative(ROOT, outDir)}`);

  const zipFile = path.join(ROOT, 'web-ext-artifacts', `swift_bookmarks_for_diigo-${manifest.version}.${target}.zip`);
  writeZip(outDir, zipFile);
  console.log('  ' + path.relative(ROOT, zipFile));
}

if (require.main == module) {
  const targets = process.argv.slice(2).filter(arg => TARGETS[arg]);
  for (const target of targets.length ? targets : Object.keys(TARGETS)) build(target);
}

module.exports = {TARGETS, COMMON_FILES, targetManifest};

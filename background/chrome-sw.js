// Service worker entry point for Chrome and Edge; Firefox loads the same scripts itself (manifest.json, background.scripts)
importScripts('../options/settings.js', '../options/index-item.js', 'background.js', 'sync.js');

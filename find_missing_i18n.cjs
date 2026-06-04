const fs = require('fs');
const path = require('path');

const i18nContent = fs.readFileSync('src/lib/i18n.ts', 'utf8');
const enMatches = i18nContent.match(/en:\s*\{([^}]*)\}/s)[1];
const viMatches = i18nContent.match(/vi:\s*\{([^}]*)\}/s)[1];

const getKeys = (text) => {
  const keys = [];
  const regex = /^\s*([a-zA-Z0-9_]+):/gm;
  let match;
  while ((match = regex.exec(text)) !== null) {
    keys.push(match[1]);
  }
  return new Set(keys);
};

const enKeys = getKeys(enMatches);
const viKeys = getKeys(viMatches);

// Find all data-i18n attributes in HTML
let htmlKeys = new Set();
const htmlFiles = ['src/popup/popup.html', 'src/options/options.html'];
htmlFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const regex = /data-i18n="([^"]+)"/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    htmlKeys.add(match[1]);
  }
});

// Find all t('key') calls in TS files
let tsKeys = new Set();
const walkSync = function(dir, filelist) {
  let files = fs.readdirSync(dir);
  filelist = filelist || [];
  files.forEach(function(file) {
    if (fs.statSync(dir + '/' + file).isDirectory()) {
      filelist = walkSync(dir + '/' + file, filelist);
    }
    else if (file.endsWith('.ts')) {
      filelist.push(dir + '/' + file);
    }
  });
  return filelist;
};

const tsFiles = walkSync('src', []);
tsFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  // Handle window.i18n?.t('...') and t('...')
  const regex = /t\('([^']+)'\)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    tsKeys.add(match[1]);
  }
});

console.log('--- Missing in EN ---');
htmlKeys.forEach(k => { if (!enKeys.has(k)) console.log('HTML: ' + k); });
tsKeys.forEach(k => { if (!enKeys.has(k)) console.log('TS: ' + k); });

console.log('--- Missing in VI ---');
htmlKeys.forEach(k => { if (!viKeys.has(k)) console.log('HTML: ' + k); });
tsKeys.forEach(k => { if (!viKeys.has(k)) console.log('TS: ' + k); });

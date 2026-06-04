const fs = require('fs');

let content = fs.readFileSync('src/options/options.ts', 'utf8');

// Imports
if (!content.includes("import { Options } from '../types.ts';")) {
  content = "import { Options } from '../types.ts';\n" + content;
}

// Global window types
if (!content.includes('interface Window')) {
  content = `
declare global {
  interface Window {
    i18n?: any;
  }
}
` + content;
}

// Replace `.value`, `.checked`, `.disabled`
content = content.replace(/document\.getElementById\('([^']+)'\)\.(value|checked|disabled)/g, "(document.getElementById('$1') as HTMLInputElement).$2");

// Some elements might be explicitly assigned to variables like `const langSelect = document.getElementById('opt-language');`
// `langSelect.value = ...`
content = content.replace(/langSelect\.value/g, "(langSelect as HTMLSelectElement).value");
content = content.replace(/adaptiveToggle\.checked/g, "(adaptiveToggle as HTMLInputElement).checked");
content = content.replace(/delaySlider\.disabled/g, "(delaySlider as HTMLInputElement).disabled");

// Event targets
content = content.replace(/e\.target\.value/g, "(e.target as HTMLInputElement).value");
content = content.replace(/e\.target\.files/g, "(e.target as HTMLInputElement).files");
content = content.replace(/e\.matches/g, "(e as MediaQueryListEvent).matches");
content = content.replace(/event\.target\.files/g, "(event.target as HTMLInputElement).files");
content = content.replace(/event\.target\.value = ''/g, "(event.target as HTMLInputElement).value = ''");

// Other specific fixes
content = content.replace(/const stored = await chrome\.storage\.sync\.get\('options'\)\.catch\(\(\) => \(\{\}\)\);/g, "const stored = await chrome.storage.sync.get('options').catch(() => ({ options: {} }));");
content = content.replace(/const stored = await chrome\.storage\.local\.get\('theme'\)\.catch\(\(\) => \(\{\}\)\);/g, "const stored = await chrome.storage.local.get('theme').catch(() => ({ theme: 'dark' }));");

content = content.replace(/const opts = \{ \.\.\.DEFAULT_OPTIONS, \.\.\.\(stored\.options \|\| \{\}\) \};/g, "const opts = { ...DEFAULT_OPTIONS, ...(stored.options as Options || {}) };");
content = content.replace(/const opts = \{\n    saveFolder/g, "const opts: Options = {\n    saveFolder");

// innerHTML, textContent, classList for `document.getElementById`
content = content.replace(/document\.getElementById\('([^']+)'\)\.innerHTML/g, "(document.getElementById('$1') as HTMLElement).innerHTML");
content = content.replace(/document\.getElementById\('([^']+)'\)\.textContent/g, "(document.getElementById('$1') as HTMLElement).textContent");
content = content.replace(/const el = document\.getElementById\('save-status'\);/g, "const el = document.getElementById('save-status') as HTMLElement;");
content = content.replace(/const themeSelect = document\.getElementById\('opt-theme-select'\);/g, "const themeSelect = document.getElementById('opt-theme-select') as HTMLSelectElement;");

content = content.replace(/function updateScrollLabel\(val\)/g, "function updateScrollLabel(val: any)");
content = content.replace(/function updateConcurrencyLabel\(val\)/g, "function updateConcurrencyLabel(val: any)");
content = content.replace(/function sanitizeFolder\(str\)/g, "function sanitizeFolder(str: string)");
content = content.replace(/function setTheme\(next\)/g, "function setTheme(next: string)");
content = content.replace(/async function importSettings\(event\)/g, "async function importSettings(event: Event)");
content = content.replace(/function showSaveStatus\(msg = '✓ Saved successfully'\)/g, "function showSaveStatus(msg: string = '✓ Saved successfully')");
content = content.replace(/const isFlat = \(document\.getElementById\('opt-flat-username'\) as HTMLInputElement\)\.checked;/g, "const isFlat = (document.getElementById('opt-flat-username') as HTMLInputElement).checked;");
content = content.replace(/const preview = document\.getElementById\('folder-preview'\);/g, "const preview = document.getElementById('folder-preview') as HTMLElement;");

// catch(err) -> catch(err: any)
content = content.replace(/catch \(err\)/g, "catch (err: any)");
// e in lambda
content = content.replace(/\(e\) => \{/g, "(e: any) => {");

fs.writeFileSync('src/options/options.ts', content);
console.log('Fixed options.ts again');

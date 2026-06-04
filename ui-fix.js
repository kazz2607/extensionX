const fs = require('fs');

function applyHelper(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Add $ helper
  const helper = `\nfunction $(id: string): any { return document.getElementById(id); }\n`;
  if (!content.includes('function $(id')) {
    content = content.replace(/(import .*;\n|^\/\*[\s\S]*?\*\/)/m, `$1\n${helper}\n`);
  }
  
  // Replace document.getElementById('...') with $('...')
  content = content.replace(/document\.getElementById\('([^']+)'\)/g, "$('$1')");
  
  // Add global window i18n
  if (!content.includes('interface Window')) {
    content = `\ndeclare global { interface Window { i18n?: any; } }\n` + content;
  }
  
  // Fix specific elements manually assigned like `e.target`
  content = content.replace(/e\.target\.value/g, "(e.target as any).value");
  content = content.replace(/e\.target\.files/g, "(e.target as any).files");
  content = content.replace(/e\.matches/g, "(e as any).matches");
  content = content.replace(/event\.target\.files/g, "(event.target as any).files");
  content = content.replace(/event\.target\.value/g, "(event.target as any).value");
  
  // Catch errors
  content = content.replace(/catch \(err\)/g, "catch (err: any)");
  
  // Implicit any parameters
  content = content.replace(/\(e\) =>/g, "(e: any) =>");
  content = content.replace(/\(event\) =>/g, "(event: any) =>");

  // Fix specific options.ts duplicate
  if (filePath.includes('options.ts')) {
    let replacedSetTheme = false;
    content = content.replace(/function setTheme\(next/g, () => {
      if (!replacedSetTheme) { replacedSetTheme = true; return "function setTheme(next: any"; }
      return "function setTheme2(next: any"; // Fix duplicate
    });
    content = content.replace(/function sanitizeFolder\(str/g, "function sanitizeFolder(str: any");
    content = content.replace(/function updateScrollLabel\(val/g, "function updateScrollLabel(val: any");
    content = content.replace(/function updateConcurrencyLabel\(val/g, "function updateConcurrencyLabel(val: any");
    content = content.replace(/async function importSettings\(event/g, "async function importSettings(event: any");
    content = content.replace(/function showSaveStatus\(msg =/g, "function showSaveStatus(msg: string =");
  }

  // Fix popup.ts explicit errors
  if (filePath.includes('popup.ts')) {
    content = content.replace(/let els = \{/g, "let els: any = {");
    content = content.replace(/let stats = \{/g, "let stats: any = {");
    content = content.replace(/let downloadQueue = \[\];/g, "let downloadQueue: any[] = [];");
    content = content.replace(/let downloadHistory = \[\];/g, "let downloadHistory: any[] = [];");
    content = content.replace(/function getSelectedProfile\(\)/g, "function getSelectedProfile(): any");
    content = content.replace(/function updateStats\(newStats/g, "function updateStats(newStats: any");
    content = content.replace(/function updateQueueUI\(queue/g, "function updateQueueUI(queue: any");
    content = content.replace(/function updateHistoryUI\(\)/g, "function updateHistoryUI()");
    content = content.replace(/function formatTime\(ms/g, "function formatTime(ms: any");
    content = content.replace(/function addHistoryEntry\(entry/g, "function addHistoryEntry(entry: any");
    content = content.replace(/function showToast\(msg/g, "function showToast(msg: any");
    content = content.replace(/function setProgress\(show, count/g, "function setProgress(show: any, count?: any");
    content = content.replace(/function setStatus\(state, text/g, "function setStatus(state: any, text?: any");
    content = content.replace(/function broadcastToSW\(type, payload\)/g, "function broadcastToSW(type: any, payload?: any)");
    content = content.replace(/function restoreSession\(username/g, "function restoreSession(username: any");
    content = content.replace(/function renderQueueItem\(item/g, "function renderQueueItem(item: any");
    content = content.replace(/function renderHistoryItem\(item/g, "function renderHistoryItem(item: any");
    content = content.replace(/function formatBytes\(bytes/g, "function formatBytes(bytes: any");
  }

  fs.writeFileSync(filePath, content);
}

applyHelper('src/options/options.ts');
applyHelper('src/popup/popup.ts');
console.log('Fixed UI types');

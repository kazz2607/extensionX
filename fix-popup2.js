const fs = require('fs');

let content = fs.readFileSync('src/popup/popup.ts', 'utf8');

if (!content.includes('const $ = (id: string): any')) {
  content = content.replace(/export \{\};\n/, "export {};\nconst $ = (id: string): any => document.getElementById(id);\n");
}

// Any missing currentUsername
content = content.replace(/let currentUsername = null;/g, "let currentUsername: any = null;");
content = content.replace(/let downloadHistory = \[\];/g, "let downloadHistory: any[] = [];");
content = content.replace(/let downloadQueue = \[\];/g, "let downloadQueue: any[] = [];");
content = content.replace(/let _debounceTimer;/g, "let _debounceTimer: any = null;");
content = content.replace(/let _countTimer;/g, "let _countTimer: any = null;");
content = content.replace(/let toastTimer;/g, "let toastTimer: any = null;");

content = content.replace(/function updateStats\(newStats\)/g, "function updateStats(newStats: any)");
content = content.replace(/function getFilteredCount\(\)/g, "function getFilteredCount(): any");
content = content.replace(/function formatTime\(ms\)/g, "function formatTime(ms: any)");
content = content.replace(/function addHistoryEntry\(entry\)/g, "function addHistoryEntry(entry: any)");
content = content.replace(/function showToast\(msg, type = 'info'\)/g, "function showToast(msg: any, type: any = 'info')");
content = content.replace(/function setProgress\(show, count = 0, total = 0\)/g, "function setProgress(show: any, count: any = 0, total: any = 0)");
content = content.replace(/function setStatus\(state, text = ''\)/g, "function setStatus(state: any, text: any = '')");
content = content.replace(/function broadcastToSW\(type, payload = \{\}\)/g, "function broadcastToSW(type: any, payload: any = {})");
content = content.replace(/function restoreSession\(username\)/g, "function restoreSession(username: any)");

// Fix any implicitly parameter
content = content.replace(/\(item\) =>/g, "(item: any) =>");
content = content.replace(/\(entry\) =>/g, "(entry: any) =>");
content = content.replace(/\(e\) =>/g, "(e: any) =>");
content = content.replace(/\(tab\) =>/g, "(tab: any) =>");

// Fix `res` type implicitly any
content = content.replace(/\(res\) =>/g, "(res: any) =>");

// Fix remaining dataset issues
content = content.replace(/\.dataset\.filter/g, " as HTMLElement).dataset.filter");

fs.writeFileSync('src/popup/popup.ts', content);
console.log('Fixed popup.ts pass 2');

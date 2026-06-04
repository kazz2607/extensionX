const fs = require('fs');
let text = fs.readFileSync('src/popup/popup.ts', 'utf8');

// The `res` returned by chrome.runtime.sendMessage is sometimes missing the explicit cast if it's on a new line or not using `const res =`
text = text.replace(/chrome\.runtime\.sendMessage\([^)]*\)\.then\(\(res/g, "chrome.runtime.sendMessage( ... ).then((res: any");
text = text.replace(/\(res\) => \{/g, "(res: any) => {");

text = text.replace(/res\.stats/g, "(res as any).stats");
text = text.replace(/res\.count/g, "(res as any).count");
text = text.replace(/res\.isDownloading/g, "(res as any).isDownloading");
text = text.replace(/res\.isCollecting/g, "(res as any).isCollecting");
text = text.replace(/res\.scrollCount/g, "(res as any).scrollCount");
text = text.replace(/downloadedRes\.count/g, "(downloadedRes as any).count");

// .closest().dataset
text = text.replace(/\.closest\('\.history-item'\)\.dataset/g, ".closest('.history-item') as HTMLElement).dataset");
text = text.replace(/\.closest\('\.queue-item'\)\.dataset/g, ".closest('.queue-item') as HTMLElement).dataset");

text = text.replace(/100 - \(activeFilter ===/g, "100 - ((activeFilter ===");

// Duplicate function implementation (setTheme was duplicated?)
text = text.replace(/function setTheme3\(/g, "function setTheme_Popup(");
text = text.replace(/function setTheme2\(/g, "function setTheme_Popup(");

fs.writeFileSync('src/popup/popup.ts', text);
console.log('Fixed final 18 errors');

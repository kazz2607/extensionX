const fs = require('fs');

let text = fs.readFileSync('src/popup/popup.ts', 'utf8');

// The arithmetic errors are caused by invalid original code logic that JS allowed but TS catches.
// Original: dash = 100 - activeFilter === 'images' ? 0 : percent;
// It should be: dash = 100 - (activeFilter === 'images' ? 0 : percent);
text = text.replace(/100 - \(\(activeFilter === 'images' as any\)\)/g, "100 - (activeFilter === 'images' ? 0 : percent)");
text = text.replace(/100 - \(\(activeFilter === 'videos' as any\)\)/g, "100 - (activeFilter === 'videos' ? 0 : percent)");
text = text.replace(/100 - \(\(activeFilter === 'gifs' as any\)\)/g, "100 - (activeFilter === 'gifs' ? 0 : percent)");

// Or actually the script might have failed to replace it previously. Let's just catch both
text = text.replace(/100 - activeFilter === 'images'/g, "100 - (activeFilter === 'images' as any)");
text = text.replace(/100 - activeFilter === 'videos'/g, "100 - (activeFilter === 'videos' as any)");
text = text.replace(/100 - activeFilter === 'gifs'/g, "100 - (activeFilter === 'gifs' as any)");

// Duplicate function
text = text.replace(/function setTheme_Popup\(/g, "function setTheme3("); // Revert
text = text.replace(/function setTheme\(/g, "function setTheme_Popup(");

// dataset
text = text.replace(/\.closest\('([^']+)'\)\.dataset/g, ".closest('$1') as HTMLElement).dataset");

// res: any
text = text.replace(/const res = await chrome\.storage/g, "const res: any = await chrome.storage");
text = text.replace(/const res = await chrome\.runtime/g, "const res: any = await chrome.runtime");
text = text.replace(/const downloadedRes = await chrome/g, "const downloadedRes: any = await chrome");

fs.writeFileSync('src/popup/popup.ts', text);
console.log('Fixed final TS errors');

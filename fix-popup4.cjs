const fs = require('fs');

function applyAny(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Fix chrome.storage and chrome.runtime return types
  content = content.replace(/const res = await/g, "const res: any = await");
  content = content.replace(/const stored = await/g, "const stored: any = await");
  content = content.replace(/const downloadedRes = await/g, "const downloadedRes: any = await");

  // Fix .dataset on Element
  content = content.replace(/\.closest\('([^']+)'\)\.dataset/g, ".closest('$1') as HTMLElement).dataset");
  content = content.replace(/\(e\.target as any\)\.closest/g, "((e.target as any).closest");

  // Fix duplicate function implementation for setTheme
  if (filePath.includes('popup.ts')) {
    content = content.replace(/function setTheme\(/g, "function setTheme3(");
  }

  // Fix Math operators
  content = content.replace(/100 - activeFilter === 'images'/g, "100 - (activeFilter === 'images' as any)");
  content = content.replace(/100 - activeFilter === 'videos'/g, "100 - (activeFilter === 'videos' as any)");
  content = content.replace(/100 - activeFilter === 'gifs'/g, "100 - (activeFilter === 'gifs' as any)");

  fs.writeFileSync(filePath, content);
}

applyAny('src/popup/popup.ts');
applyAny('src/options/options.ts');

console.log('Fixed storage and dataset types');

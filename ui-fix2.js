const fs = require('fs');

function applyHelper(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  if (filePath.includes('popup.ts')) {
    content = content.replace(/const \$ = id => document.getElementById\(id\);/g, "const $ = (id: string): any => document.getElementById(id);");
    // Also, some functions need their arguments typed as `any` because `noImplicitAny` is true
    content = content.replace(/function getFilteredCount\(\)/g, "function getFilteredCount(): any");
    content = content.replace(/function renderActiveDownload\(item/g, "function renderActiveDownload(item: any");
    content = content.replace(/item =>/g, "(item: any) =>");
    content = content.replace(/let els = \{/g, "let els: any = {");
  }

  if (filePath.includes('options.ts')) {
    content = content.replace(/const \$ = \(id: string\): any => document.getElementById\(id\);/g, ""); // remove old if exists
    content = content.replace(/function \$\(id: string\): any \{ return document\.getElementById\(id\); \}/g, ""); // remove old
    content = content.replace(/function loadOptions\(\)/g, "const $ = (id: string): any => document.getElementById(id);\nasync function loadOptions()");
    
    // Ensure all `document.getElementById` are replaced by `$`
    content = content.replace(/document\.getElementById\('([^']+)'\)/g, "$('$1')");
  }

  fs.writeFileSync(filePath, content);
}

applyHelper('src/options/options.ts');
applyHelper('src/popup/popup.ts');
console.log('Fixed UI any types');

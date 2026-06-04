const fs = require('fs');

let text = fs.readFileSync('src/popup/popup.ts', 'utf8');

// Add $
if (!text.includes('const $ = (id: string)')) text = 'const $ = (id: string): any => document.getElementById(id);\n' + text;

// Fix lets
text = text.replace(/let currentUsername(?!:).*/g, "let currentUsername: any = null;");
text = text.replace(/let downloadHistory(?!:).*/g, "let downloadHistory: any[] = [];");
text = text.replace(/let downloadQueue(?!:).*/g, "let downloadQueue: any[] = [];");
text = text.replace(/let _debounceTimer(?!:).*/g, "let _debounceTimer: any = null;");
text = text.replace(/let _countTimer(?!:).*/g, "let _countTimer: any = null;");
text = text.replace(/let toastTimer(?!:).*/g, "let toastTimer: any = null;");
text = text.replace(/let activeFilter = 'all';/g, "let activeFilter: any = 'all';");

// Fix functions to add :any to args
text = text.replace(/function ([a-zA-Z0-9_]+)\(([^)]*)\)/g, (match, p1, p2) => {
  if (p2.trim() === '') return match;
  const newArgs = p2.split(',').map(arg => {
    let a = arg.trim();
    if (!a.includes(':') && a !== '') {
      if (a.includes('=')) return a.replace('=', ': any =');
      return a + ': any';
    }
    return a;
  }).join(', ');
  return `function ${p1}(${newArgs})`;
});

// Arrow functions
text = text.replace(/\((item|res|entry|e|tab|newCount)\) =>/g, "($1: any) =>");
text = text.replace(/item =>/g, "(item: any) =>");

// Fix Objects
text = text.replace(/const els = \{/g, "const els: any = {");
text = text.replace(/let stats = \{/g, "let stats: any = {");
text = text.replace(/let els: any = \{/g, "const els: any = {"); // If it was let

// Remove duplicates
text = text.replace(/function setTheme\(next/g, "function setTheme2(next");
text = text.replace(/export \{\};\n/g, ""); // Remove previous exports
text = 'export {};\n' + text; // Add at top

fs.writeFileSync('src/popup/popup.ts', text);
console.log('Fixed popup.ts completely');

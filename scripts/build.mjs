import {mkdir,copyFile,writeFile} from 'node:fs/promises';
await mkdir('public',{recursive:true});
for(const name of ['index.html','style.css','app.js','backend.js']) await copyFile(name,`public/${name}`);
await writeFile('public/robots.txt','User-agent: *\nAllow: /\n');
console.log('Public site assets built.');

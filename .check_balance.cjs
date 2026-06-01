const fs=require('fs');
const path='D:/Projects/VaultNotes/src/pages/Chat.jsx';
const s=fs.readFileSync(path,'utf8');
console.log('length',s.length);
console.log('{', (s.match(/\{/g)||[]).length, '}', (s.match(/\}/g)||[]).length);
console.log('(', (s.match(/\(/g)||[]).length, ')', (s.match(/\)/g)||[]).length);

const lines=s.split(/\r?\n/);
let brace=0;
for(let i=0;i<lines.length;i++){
 const l=lines[i];
 for(let ch of l){
   if(ch==='{') brace++;
   if(ch==='}') brace--;
 }
 if(brace<0){
   console.log('brace negative at line',i+1);
   console.log(lines[i-3]||'');
   console.log(lines[i-2]||'');
   console.log(lines[i-1]||'');
   console.log(lines[i]||'');
   process.exit(0);
 }
}
console.log('brace final',brace);

let paren=0;
for(let i=0;i<lines.length;i++){
 const l=lines[i];
 for(let ch of l){
   if(ch==='(') paren++;
   if(ch===')') paren--;
 }
 if(paren<0){
   console.log('paren negative at line',i+1);
   console.log(lines[i-3]||'');
   console.log(lines[i-2]||'');
   console.log(lines[i-1]||'');
   console.log(lines[i]||'');
   process.exit(0);
 }
}
console.log('paren final',paren);

// show context at reported error line 6862
const reportLine=6862;
for(let i=reportLine-5;i<=reportLine+3;i++){
  if(i>0 && i<=lines.length) console.log((i)+': '+lines[i-1]);
}

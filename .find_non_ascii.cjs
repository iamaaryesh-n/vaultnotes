const fs=require('fs');
const s=fs.readFileSync('D:/Projects/VaultNotes/src/pages/Chat.jsx','utf8');
const lines=s.split(/\r?\n/);
for(let i=0;i<lines.length;i++){
 const codes=[];
 for(let ch of lines[i]){
   const code=ch.charCodeAt(0);
   if(code>127) codes.push(code);
 }
 if(codes.length>0){
   console.log('line',i+1,'non-ascii codes',codes.slice(0,20).join(','));
 }
}

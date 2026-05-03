const fs=require('fs');
const path='D:/Projects/VaultNotes/src/pages/Chat.jsx';
const lines=fs.readFileSync(path,'utf8').split(/\r?\n/);
for(let i=6840;i<=6876;i++){
  const line=lines[i-1]||'';
  const codes=line.split('').map(c=>c.charCodeAt(0));
  console.log(String(i).padStart(6)+': '+line);
  console.log('      codes:', codes.slice(0,200).join(' '));
}

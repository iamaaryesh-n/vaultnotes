const fs=require('fs');
const parser=require('@babel/parser');
const code=fs.readFileSync('D:/Projects/VaultNotes/src/pages/Chat.jsx','utf8');
try{
  parser.parse(code,{sourceType:'module',plugins:['jsx','classProperties','optionalChaining','nullishCoalescingOperator']});
  console.log('parse ok');
}catch(e){
  console.error('parse error', e.message);
  console.error(e.loc);
}

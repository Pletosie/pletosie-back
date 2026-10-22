// Generate VAPID credentials once without printing private material.
const fs=require('fs');const path=require('path');const dotenv=require('dotenv');const webPush=require('web-push');
const file=path.resolve(__dirname,'../.env');let text=fs.existsSync(file)?fs.readFileSync(file,'utf8'):'';const values=dotenv.parse(text);
if(Boolean(values.VAPID_PUBLIC_KEY)!==Boolean(values.VAPID_PRIVATE_KEY))throw Error('La paire VAPID est incomplète. Complétez-la sans remplacer une clé isolée.');
if(!values.VAPID_PUBLIC_KEY){const pair=webPush.generateVAPIDKeys();for(const [name,value]of Object.entries({VAPID_PUBLIC_KEY:pair.publicKey,VAPID_PRIVATE_KEY:pair.privateKey})){text=text.replace(new RegExp('^'+name+'=.*$','m'),'');text+='\n'+name+'='+value;}}
if(!values.VAPID_SUBJECT){text=text.replace(/^VAPID_SUBJECT=.*$/m,'');text+='\nVAPID_SUBJECT=mailto:'+(values.GOOGLE_ADMIN_EMAIL||'notifications@pletosie.invalid');}
fs.writeFileSync(file,text+'\n');console.log('Configuration push prête dans .env ; aucune clé privée affichée.');

// One-time script for OLD users who may never open the app again.
// 1) gives every Firebase user the role:"authenticated" claim  2) upserts a row for each into public.users.
// Run on your laptop (never put the service-role key in the frontend):
//   cd backend && npm i
//   FIREBASE_SERVICE_ACCOUNT_FILE=./service-account.json SUPABASE_URL=https://wbwnhcbzuswdgkmukshl.supabase.co SUPABASE_SERVICE_ROLE_KEY=xxxx node backfill-users.mjs
// Their saved workflows/ledger etc. live in their own browsers, so those upload when each user next opens the app.
import fs from "node:fs";
import fa from "firebase-admin";
const {FIREBASE_SERVICE_ACCOUNT_FILE,FIREBASE_SERVICE_ACCOUNT,SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY}=process.env;
const raw=FIREBASE_SERVICE_ACCOUNT_FILE?fs.readFileSync(FIREBASE_SERVICE_ACCOUNT_FILE,"utf8"):FIREBASE_SERVICE_ACCOUNT;
if(!raw){console.error("Set FIREBASE_SERVICE_ACCOUNT_FILE (or FIREBASE_SERVICE_ACCOUNT)");process.exit(1)}
const sa=JSON.parse(raw);sa.private_key=sa.private_key.replace(/\\n/g,"\n");
fa.initializeApp({credential:fa.credential.cert(sa)});
const sb=!!(SUPABASE_URL&&SUPABASE_SERVICE_ROLE_KEY);
if(!sb)console.warn("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set: only the claim will be added, no users rows.");
const prov=p=>({"google.com":"google","password":"email"}[p]||p||"email");
const iso=t=>{const d=t?new Date(t):null;return d&&!isNaN(d)?d.toISOString():null};
let claimed=0,rows=0,failed=0,token;
do{
  const page=await fa.auth().listUsers(1000,token);token=page.pageToken;
  const batch=[];
  for(const u of page.users){
    if(u.customClaims?.role!=="authenticated"){await fa.auth().setCustomUserClaims(u.uid,{...(u.customClaims||{}),role:"authenticated"});claimed++}
    batch.push({user_id:u.uid,email:u.email||null,display_name:u.displayName||null,auth_provider:prov(u.providerData?.[0]?.providerId),created_at:iso(u.metadata.creationTime),last_login_at:iso(u.metadata.lastSignInTime)});
  }
  if(sb&&batch.length){
    const r=await fetch(SUPABASE_URL+"/rest/v1/users?on_conflict=user_id",{method:"POST",headers:{apikey:SUPABASE_SERVICE_ROLE_KEY,Authorization:"Bearer "+SUPABASE_SERVICE_ROLE_KEY,"Content-Type":"application/json",Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(batch)});
    if(r.ok)rows+=batch.length;else{failed+=batch.length;console.error("users upsert failed",r.status,(await r.text()).slice(0,300))}
  }
}while(token);
console.log({claimsAdded:claimed,usersRowsSaved:rows,usersRowsFailed:failed});

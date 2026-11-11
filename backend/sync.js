// Supabase <-> Firebase glue.
// Supabase (Third-Party Auth) only accepts Firebase ID tokens that carry the custom claim role:"authenticated".
// POST /api/auth/claim  (Authorization: Bearer <Firebase ID token>)  adds that claim to the signed-in user.
// The app calls it automatically (old and new users, no re-login needed), then force-refreshes its token.
// Needs env FIREBASE_SERVICE_ACCOUNT = the service account JSON (raw JSON or base64 of it) of Firebase project cyintel-cb4c9.
let _admin=null;
async function admin(){
  if(_admin)return _admin;
  const raw=process.env.FIREBASE_SERVICE_ACCOUNT;
  if(!raw){const e=new Error("FIREBASE_SERVICE_ACCOUNT env missing on server");e.code=503;throw e}
  let sa;try{sa=JSON.parse(raw.trim().startsWith("{")?raw:Buffer.from(raw,"base64").toString("utf8"))}
  catch{const e=new Error("FIREBASE_SERVICE_ACCOUNT is not valid JSON (paste the whole service account file, or its base64)");e.code=503;throw e}
  if(sa.private_key)sa.private_key=sa.private_key.replace(/\\n/g,"\n");
  const m=await import("firebase-admin");const fa=m.default||m;
  if(!fa.apps.length)fa.initializeApp({credential:fa.credential.cert(sa)});
  return(_admin=fa);
}
/* Best-effort: uid from a verified Firebase ID token, or null. Never throws. */
export async function verifyUid(req){
  try{const tok=String(req.headers.authorization||"").replace(/^Bearer\s+/i,"");if(!tok)return null;
    const fa=await admin();return(await fa.auth().verifyIdToken(tok)).uid||null}catch{return null}
}
export function mountSync(app){
  app.post("/api/auth/claim",async(req,res)=>{
    try{
      const tok=String(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
      if(!tok)return res.status(401).json({error:"missing Firebase ID token"});
      const fa=await admin();
      let dec;try{dec=await fa.auth().verifyIdToken(tok)}catch(e){return res.status(401).json({error:"invalid Firebase token: "+e.message})}
      if(dec.role==="authenticated")return res.json({ok:true,already:true});
      const u=await fa.auth().getUser(dec.uid);
      await fa.auth().setCustomUserClaims(dec.uid,{...(u.customClaims||{}),role:"authenticated"});
      res.json({ok:true});
    }catch(e){console.error("claim failed:",e.message);res.status(e.code===503?503:500).json({error:e.message})}
  });
  app.get("/api/auth/claim",(_,r)=>r.json({ok:true,configured:!!process.env.FIREBASE_SERVICE_ACCOUNT}));
}

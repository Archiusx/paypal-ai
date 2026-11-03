import express from "express";
import cors from "cors";
const {CHANNEL3_API_KEY,PAYPAL_CLIENT_ID,PAYPAL_CLIENT_SECRET,GROQ_API_KEY,ZAPIER_WEBHOOK_URL,ALLOWED_ORIGIN="*",INR_PER_USD="84",PORT=3000}=process.env;
const PP="https://api-m.sandbox.paypal.com",clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const app=express();const ORIGIN=((ALLOWED_ORIGIN||"*").split(/[\s#]/)[0]||"*").replace(/\/+$/,"");app.use(cors({origin:ORIGIN==="*"?true:ORIGIN}));app.use((q,r,n)=>{console.log(q.method,q.url,q.headers.origin);n()});app.use(express.json());
const bad=(res,m,c=400)=>res.status(c).json({error:m});
const toUsd=(n,c)=>c==="INR"?n/+INR_PER_USD:n;

// Channel3: product details from any product URL
async function lookup(url){
  const r=await fetch("https://api.trychannel3.com/v1/lookup",{method:"POST",headers:{"x-api-key":CHANNEL3_API_KEY,"Content-Type":"application/json"},body:JSON.stringify({url})});
  if(!r.ok)throw new Error("Channel3 "+r.status+" "+(await r.text()).slice(0,120));
  const p=(await r.json()).product;if(!p)throw new Error("Product not found");
  const o=p.offers?.[0]||{},pr=o.price?.price??o.price,cur=o.price?.currency||"USD";
  if(!(pr>0))throw new Error("Price not available for this product");
  let rate=o.max_commission_rate??0;if(rate<=1)rate*=100;
  return{title:p.title,price:+pr,currency:cur,commissionPct:clamp(rate||2,1,10)};
}
// AI: Groq (Llama) decides a realistic target discount (falls back to 10%)
async function aiTarget(t,price,cur){
  let pct=10,reason="Target set 10% below the current price.";
  if(GROQ_API_KEY)try{
    const r=await fetch("https://api.groq.com/openai/v1/chat/completions",{method:"POST",headers:{Authorization:"Bearer "+GROQ_API_KEY,"Content-Type":"application/json"},
      body:JSON.stringify({model:process.env.GROQ_MODEL||"llama-3.3-70b-versatile",temperature:0.2,max_tokens:200,messages:[{role:"user",content:`Product: ${t}. Price: ${price} ${cur}. Pick a realistic price-drop alert threshold (5-30 percent below current). Reply ONLY JSON: {"discountPct":number,"reason":"one short sentence"}`}]})});
    if(!r.ok)throw new Error("Groq "+r.status);
    const j=JSON.parse((await r.json()).choices[0].message.content.replace(/```json|```/g,"").trim());pct=clamp(+j.discountPct||10,5,30);reason=j.reason||reason;
  }catch(e){console.warn("AI fallback:",e.message)}
  return{target:Math.round(price*(1-pct/100)),reason};
}
app.post(["/api/watch","/watch"],async(req,res)=>{try{
  const p=await lookup(req.body.url);const a=await aiTarget(p.title,p.price,p.currency);res.json({...p,...a});
}catch(e){bad(res,e.message,502)}});

async function ppToken(){
  const r=await fetch(PP+"/v1/oauth2/token",{method:"POST",headers:{Authorization:"Basic "+Buffer.from(PAYPAL_CLIENT_ID+":"+PAYPAL_CLIENT_SECRET).toString("base64"),"Content-Type":"application/x-www-form-urlencoded"},body:"grant_type=client_credentials"});
  if(!r.ok)throw new Error("PayPal auth failed");return(await r.json()).access_token;
}
app.post(["/api/payout","/payout"],async(req,res)=>{try{
  const{url,to,target,currency="USD",commissionPct,name}=req.body;if(!to||!target)return bad(res,"to and target required");
  // demo: simulate the drop by pricing slightly under target; production: call lookup(url) from a cron job
  const price=req.body.simulate?target-Math.round(Math.random()*500):(await lookup(url)).price;
  if(price>target)return bad(res,"Price has not dropped yet",409);
  const commission=+(toUsd(price,currency)*commissionPct/100).toFixed(2),payout=+(commission*0.5).toFixed(2); // user gets 50% of commission
  const tok=await ppToken(),id="B"+Date.now();
  const r=await fetch(PP+"/v1/payments/payouts",{method:"POST",headers:{Authorization:"Bearer "+tok,"Content-Type":"application/json"},body:JSON.stringify({
    sender_batch_header:{sender_batch_id:id,email_subject:"Your price-drop cashback",email_message:"The price dropped. Here is your cashback."},
    items:[{recipient_type:"EMAIL",amount:{value:payout.toFixed(2),currency:"USD"},receiver:to,note:"Price drop: "+(name||url),sender_item_id:id+"-1"}]})});
  const j=await r.json();if(!r.ok)throw new Error(j.message||"PayPal payout failed");
  if(ZAPIER_WEBHOOK_URL)fetch(ZAPIER_WEBHOOK_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:to,product:name,price,currency,payout})}).catch(()=>{});
  res.json({price,commission,payout,batchId:j.batch_header.payout_batch_id});
}catch(e){bad(res,e.message,502)}});
app.get("/",(_,r)=>r.send("ok"));app.get("/api/health",(_,r)=>r.json({ok:true,version:3,routes:["POST /api/watch","POST /api/payout"]}));app.use((q,r)=>r.status(404).json({error:"No route "+q.method+" "+q.path+" on this server (version 3). Redeploy the latest server.js."}));app.listen(PORT,()=>console.log("listening",PORT));

import express from "express";
import cors from "cors";
import {mountFlow} from "./flow.js";
import {mountStore} from "./store.js";
import {mountSync} from "./sync.js";
const {CHANNEL3_API_KEY,PAYPAL_CLIENT_ID,PAYPAL_CLIENT_SECRET,GROQ_API_KEY,ZAPIER_WEBHOOK_URL,ALLOWED_ORIGIN="*",INR_PER_USD="84",PORT=3000}=process.env;
const PP="https://api-m.sandbox.paypal.com",clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const app=express();const ORIGIN=((ALLOWED_ORIGIN||"*").split(/[\s#]/)[0]||"*").replace(/\/+$/,"");app.use(cors({origin:ORIGIN==="*"?true:ORIGIN}));app.use((q,r,n)=>{console.log(q.method,q.url,q.headers.origin);n()});app.use((q,r,n)=>{q.url=q.url.replace(/\/{2,}/g,"/");n()});app.use(express.json({limit:"20mb",verify:(q,_,b)=>{q.raw=b.toString("utf8")}}));
const bad=(res,m,c=400)=>res.status(c).json({error:m});
const toUsd=(n,c)=>c==="INR"?n/+INR_PER_USD:n;

// Channel3: product details from any product URL
async function lookupC3(url){
  const r=await fetch("https://api.trychannel3.com/v1/lookup",{method:"POST",headers:{"x-api-key":CHANNEL3_API_KEY,"Content-Type":"application/json"},body:JSON.stringify({url})});
  if(!r.ok)throw new Error("Channel3 "+r.status+" "+(await r.text()).slice(0,120));
  const p=(await r.json()).product;if(!p)throw new Error("Product not found");
  const o=p.offers?.[0]||{},pr=o.price?.price??o.price,cur=o.price?.currency||"USD";
  if(!(pr>0))throw new Error("Price not available for this product");
  let rate=o.max_commission_rate??0;if(rate<=1)rate*=100;
  return{title:p.title,price:+pr,currency:cur,commissionPct:clamp(rate||2,1,10)};
}
const UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const num=v=>{if(v&&typeof v=="object")v=v.value??v.price??v.amount;return parseFloat(String(v??"").replace(/[^\d.]/g,""))||0};
// Fallback 1: read the product page directly (JSON-LD / og tags)
async function scrape(url){
  const r=await fetch(url,{headers:{"User-Agent":UA,"Accept-Language":"en-IN,en;q=0.9",Accept:"text/html"},redirect:"follow"});
  if(!r.ok)throw new Error("store blocked the server ("+r.status+")");
  const h=await r.text();let title="",price=0,cur="";
  const walk=n=>{if(Array.isArray(n))return n.forEach(walk);if(n&&typeof n=="object"){
    if(/Product/.test(String(n["@type"]))){title=title||n.name;const o=Array.isArray(n.offers)?n.offers[0]:n.offers;if(o){price=price||num(o.price??o.lowPrice);cur=cur||o.priceCurrency}}
    Object.values(n).forEach(walk)}};
  for(const m of h.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi))try{walk(JSON.parse(m[1]))}catch{}
  const meta=p=>(h.match(new RegExp("<meta[^>]+(?:property|name)=[\"']"+p+"[\"'][^>]*content=[\"']([^\"']*)[\"']","i"))||[])[1];
  title=title||meta("og:title")||(h.match(/<title>([^<]*)/i)||[])[1]||"";
  price=price||num(meta("product:price:amount")||meta("og:price:amount"));
  cur=cur||meta("product:price:currency")||meta("og:price:currency")||(/flipkart|\.in\b/i.test(url)?"INR":"USD");
  if(!(price>0))throw new Error("no price found in page");
  return{title:title.trim(),price,currency:cur,commissionPct:2};
}
// Fallback 2: Apify. Token comes from APIFY_API_TOKEN (APIFY_TOKEN also accepted).
// Amazon -> Amazon scraper, Flipkart -> Flipkart scraper, any other store -> generic e-commerce scraper.
// Actor ids can be swapped from env without touching code: APIFY_AMAZON_ACTOR, APIFY_FLIPKART_ACTOR, APIFY_GENERIC_ACTOR.
const APIFY=()=>process.env.APIFY_API_TOKEN||process.env.APIFY_TOKEN||"";
const ACT={
  amazon:{id:process.env.APIFY_AMAZON_ACTOR||"junglee/free-amazon-product-scraper",input:u=>({categoryOrProductUrls:[{url:u}],maxItemsPerStartUrl:1})},
  flipkart:{id:process.env.APIFY_FLIPKART_ACTOR||"khadinakbar/flipkart-product-scraper",input:u=>({productUrls:[u]})},
  generic:{id:process.env.APIFY_GENERIC_ACTOR||"apify/e-commerce-scraping-tool",input:u=>({detailsUrls:[{url:u}],maxProductResults:1})}
};
const SYM={"$":"USD","₹":"INR","Rs.":"INR","£":"GBP","€":"EUR"};
async function runActor(a,url){
  const r=await fetch(`https://api.apify.com/v2/acts/${a.id.replace("/","~")}/run-sync-get-dataset-items?timeout=100&format=json&clean=true`,{method:"POST",headers:{Authorization:"Bearer "+APIFY(),"Content-Type":"application/json"},body:JSON.stringify(a.input(url)),signal:AbortSignal.timeout(110000)});
  if(!r.ok)throw new Error(a.id+" "+r.status+" "+(await r.text()).slice(0,100));
  const items=await r.json();const it=Array.isArray(items)?items.find(x=>x&&!x.error)||items[0]:null;if(!it)throw new Error(a.id+" returned nothing");
  const o=Array.isArray(it.offers)?it.offers[0]:it.offers;
  const price=num(it.price)||num(it.currentPrice)||num(it.sellingPrice)||num(it.salePrice)||num(o?.price)||num(it.priceValue);
  if(!(price>0))throw new Error(a.id+" found no price");
  let cur=it.price?.currency||it.currency||it.priceCurrency||o?.priceCurrency||"";cur=SYM[cur]||cur;
  if(!/^[A-Z]{3}$/.test(cur))cur=/flipkart|amazon\.in|\.in\b/i.test(url)?"INR":"USD";
  return{title:String(it.title||it.name||it.productName||"Product").trim(),price,currency:cur,commissionPct:2};
}
async function viaApify(url){
  if(!APIFY())throw new Error("APIFY_API_TOKEN not set");
  const chain=/amazon\./i.test(url)?[ACT.amazon,ACT.generic]:/flipkart\./i.test(url)?[ACT.flipkart,ACT.generic]:[ACT.generic],errs=[];
  for(const a of chain)try{return await runActor(a,url)}catch(e){errs.push(e.message);console.warn("Apify actor failed:",e.message)}
  throw new Error(errs.join(" | ").slice(0,300));
}
// Short cache so repeated checks/payouts don't burn Apify credits (APIFY_CACHE_MIN, default 4 minutes)
const CACHE=new Map(),TTL=(+process.env.APIFY_CACHE_MIN||4)*60000;
async function lookup(url){
  const hit=CACHE.get(url);if(hit&&Date.now()-hit.t<TTL)return hit.v;
  const errs=[],marketplace=/amazon\.|flipkart\./i.test(url);
  // Amazon/Flipkart block plain server requests, so Apify goes first for them
  const order=marketplace&&APIFY()?[viaApify,lookupC3,scrape]:[lookupC3,scrape,...(APIFY()?[viaApify]:[])];
  for(const f of order)try{const v=await f(url);CACHE.set(url,{t:Date.now(),v});return v}catch(e){errs.push(f.name+": "+e.message)}
  throw new Error("Could not read this product. "+errs.join(" | ").slice(0,350));
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

// Live price check used by the continuous watcher in the Payouts page
app.post(["/api/check","/check"],async(req,res)=>{try{
  const{url,target}=req.body;if(!url)return bad(res,"url required");
  const p=await lookup(url);res.json({title:p.title,price:p.price,currency:p.currency,dropped:target>0&&p.price<=+target,checkedAt:Date.now()});
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
mountFlow(app);mountStore(app);try{mountSync(app)}catch(e){console.error("sync routes not mounted:",e.message)}app.get("/",(_,r)=>r.send("ok"));app.get("/api/health",(_,r)=>r.json({ok:true,version:4,apify:!!APIFY(),routes:["POST /api/watch","POST /api/check","POST /api/payout"]}));app.use((q,r)=>r.status(404).json({error:"No route "+q.method+" "+q.path+" on this server (version 4). Redeploy the latest server.js."}));app.listen(PORT,()=>console.log("listening",PORT));

(function(){
'use strict';

/* ================= util ================= */
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const nf=(n,d=0)=>Number(n).toLocaleString('id-ID',{minimumFractionDigits:d,maximumFractionDigits:d});
const rp=n=>(n<0?'-Rp ':'Rp ')+nf(Math.abs(Math.round(n)));
function rpShort(n){const a=Math.abs(n);if(a>=1e9)return nf(n/1e9,1)+' M';if(a>=1e6)return nf(n/1e6,1)+' jt';if(a>=1e3)return nf(n/1e3)+' rb';return nf(n)}
const kgFmt=n=>n>=1000?nf(n/1000,2)+' ton':nf(n)+' kg';
const pct=(a,b)=>b>0?Math.round(a/b*100):0;
function niceMax(v){const p=Math.pow(10,Math.floor(Math.log10(v)));const n=v/p;const m=n<=1?1:n<=2?2:n<=2.5?2.5:n<=5?5:10;return m*p}

const MONTHS=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
const NOW=new Date();
const ymd=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const TODAY=ymd(NOW), CUR=TODAY.slice(0,7);
function lastMonths(n,end){end=end||CUR;const p=end.split('-').map(Number);const out=[];for(let i=n-1;i>=0;i--){const d=new Date(p[0],p[1]-1-i,1);out.push(d.getFullYear()+'-'+pad(d.getMonth()+1))}return out}
const mLabel=k=>{const p=k.split('-');return MONTHS[+p[1]-1]+' '+p[0]};
const mShort=k=>MONTHS[+k.split('-')[1]-1];
const fmtDate=s=>{const p=s.split('-');return +p[2]+' '+MONTHS[+p[1]-1]+' '+p[0]};

/* ================= data & faktor ================= */
const IN_CATS=['Penjualan','Pesanan online','Jasa','Lainnya'];
const OUT_CATS=['Bahan baku','Gaji & upah','Sewa tempat','Listrik & air','BBM & transport','Kemasan','Pemasaran','Lainnya'];
const FACTORS=window.EF_FACTORS;
const EF_STATUS=window.EF_STATUS;
const F=id=>FACTORS.find(f=>f.id===id);
const efOf=e=>e.f!=null?e.f:F(e.src).f;
const TARIF_KWH=1445;

const CFG=window.ECOFINANCE_CONFIG||{};
const CLOUD=!!(CFG.SUPABASE_URL&&CFG.SUPABASE_ANON_KEY&&window.supabase&&window.supabase.createClient);
const sb=CLOUD?window.supabase.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_ANON_KEY):null;
const KEY='ecofinance.local.v1';
function loadLocal(){try{const r=localStorage.getItem(KEY);if(r){const s=JSON.parse(r);if(s&&Array.isArray(s.tx)){s.co2=(s.co2||[]).filter(e=>F(e.src));return s}}}catch(e){}return null}
let S=(!CLOUD&&loadLocal())||{user:null,biz:{name:CLOUD?'Usaha Saya':'Kedai Kopi Nusantara',sector:CLOUD?'Usaha kecil':'Makanan & minuman'},tx:[],co2:[],demo:false,nid:1};
S.ready=!CLOUD;S.busy=false;
function save(){if(CLOUD)return;try{localStorage.setItem(KEY,JSON.stringify({user:S.user,biz:S.biz,tx:S.tx,co2:S.co2,demo:S.demo,nid:S.nid}))}catch(e){}}
const UI={authMode:'in',view:'beranda',month:CUR,period:'6m',txMonth:CUR,coMonth:CUR,tbl:{},confirm:null};

function genDemo(){
  let seed=7;const r=()=>(seed=(seed*16807)%2147483647)/2147483647;
  const tx=[],co2=[];let id=1;const maxDay=+TODAY.slice(8);
  lastMonths(6).forEach((k,idx)=>{
    const g=1+idx*0.035, cur=k===CUR;
    const add=(day,type,cat,note,amt)=>{if(cur&&day>maxDay)return;tx.push({id:id++,date:k+'-'+pad(day),type,cat,note,amount:Math.round(amt/1e4)*1e4})};
    [7,14,21,28].forEach((d,w)=>add(d,'in','Penjualan','Penjualan minggu ke-'+(w+1),(7.2e6+r()*1.6e6)*g));
    add(18,'in','Pesanan online','Pesanan aplikasi antar',(2.1e6+r()*8e5)*g);
    add(1,'out','Sewa tempat','Sewa kios',3.5e6);
    add(5,'out','Bahan baku','Biji kopi, susu, gula',6.2e6+r()*5e5);
    add(19,'out','Bahan baku','Belanja bahan pasar',5.6e6+r()*5e5);
    add(8,'out','Kemasan','Gelas dan sedotan kertas',1.5e6+r()*2e5);
    add(10,'out','Listrik & air','Tagihan listrik dan air',1.4e6+r()*1e5);
    add(12,'out','BBM & transport','Bensin motor antar',8.5e5+r()*1e5);
    add(15,'out','Pemasaran','Iklan media sosial',6e5);
    add(25,'out','Gaji & upah','Gaji 3 karyawan',8.5e6);
    const c=(day,src,note,qty)=>{if(cur&&day>maxDay)return;co2.push({id:id++,date:k+'-'+pad(day),src,note,qty:Math.round(qty*10)/10,f:F(src).f})};
    c(10,'listrik','Tagihan listrik',1450+r()*150);
    c(6,'lpg','3 tabung 12 kg',36);
    c(12,'bensin','Motor antar pesanan',36+r()*6);
    c(27,'sampah','Sampah harian dikumpulkan',110+r()*20);
  });
  return{tx:tx,co2:co2,nid:id};
}

/* ================= penyimpanan (Supabase atau lokal) ================= */
function fail(err){toast('Gagal: '+((err&&err.message)||err));return false}
async function loadCloud(){
  const uid=S.user.id;
  let b=await sb.from('businesses').select('*').eq('user_id',uid).maybeSingle();
  if(!b.data){b=await sb.from('businesses').upsert({user_id:uid}).select().single()}
  if(b.data)S.biz={name:b.data.name,sector:b.data.sector};
  const r=await Promise.all([sb.from('transactions').select('*').order('date',{ascending:false}).limit(5000),sb.from('emissions').select('*').order('date',{ascending:false}).limit(5000)]);
  if(r[0].error)throw r[0].error;if(r[1].error)throw r[1].error;
  S.tx=r[0].data.map(x=>({id:x.id,date:x.date,type:x.type,cat:x.category,note:x.note||'',amount:Number(x.amount)}));
  S.co2=r[1].data.filter(x=>F(x.source)).map(x=>({id:x.id,date:x.date,src:x.source,note:x.note||'',qty:Number(x.qty),f:Number(x.factor)}));
}
async function opAddTx(x){
  if(CLOUD){const r=await sb.from('transactions').insert({date:x.date,type:x.type,category:x.cat,note:x.note,amount:x.amount}).select().single();if(r.error)return fail(r.error);x=Object.assign({},x,{id:r.data.id})}
  else x=Object.assign({},x,{id:S.nid++});
  S.tx.push(x);save();return true}
async function opAddCo2(x){
  const f=F(x.src).f;
  if(CLOUD){const r=await sb.from('emissions').insert({date:x.date,source:x.src,note:x.note,qty:x.qty,factor:f}).select().single();if(r.error)return fail(r.error);x=Object.assign({},x,{id:r.data.id,f:f})}
  else x=Object.assign({},x,{id:S.nid++,f:f});
  S.co2.push(x);save();return true}
async function opDel(table,list,id){
  if(CLOUD){const r=await sb.from(table).delete().eq('id',id);if(r.error)return fail(r.error)}
  S[list]=S[list].filter(x=>x.id!==id);save();return true}
async function opSaveBiz(){
  if(CLOUD){const r=await sb.from('businesses').upsert({user_id:S.user.id,name:S.biz.name,sector:S.biz.sector});if(r.error)return fail(r.error)}
  save();return true}
async function opWipe(){
  if(CLOUD){const a=await sb.from('transactions').delete().eq('user_id',S.user.id);if(a.error)return fail(a.error);const b=await sb.from('emissions').delete().eq('user_id',S.user.id);if(b.error)return fail(b.error)}
  S.tx=[];S.co2=[];S.demo=false;save();return true}
async function opSeedDemo(){
  const d=genDemo();
  if(CLOUD){
    const a=await sb.from('transactions').insert(d.tx.map(t=>({date:t.date,type:t.type,category:t.cat,note:t.note,amount:t.amount})));if(a.error)return fail(a.error);
    const b=await sb.from('emissions').insert(d.co2.map(e=>({date:e.date,source:e.src,note:e.note,qty:e.qty,factor:F(e.src).f})));if(b.error)return fail(b.error);
    try{await loadCloud()}catch(e){return fail(e)}return true}
  S.tx=d.tx;S.co2=d.co2;S.nid=d.nid;S.demo=true;save();return true}

/* ================= agregasi ================= */
const inKeys=(date,keys)=>keys.indexOf(date.slice(0,7))>-1;
function totals(keys){let i=0,o=0;S.tx.forEach(t=>{if(inKeys(t.date,keys)){if(t.type==='in')i+=t.amount;else o+=t.amount}});return{i:i,o:o,net:i-o}}
function catTotals(keys,type){const m={};S.tx.forEach(t=>{if(t.type===type&&inKeys(t.date,keys))m[t.cat]=(m[t.cat]||0)+t.amount});return Object.keys(m).map(c=>({cat:c,v:m[c]})).sort((a,b)=>b.v-a.v)}
const co2Total=keys=>S.co2.reduce((a,e)=>inKeys(e.date,keys)?a+e.qty*efOf(e):a,0);
function co2Src(keys){const m={};S.co2.forEach(e=>{if(inKeys(e.date,keys)){const x=m[e.src]||(m[e.src]={src:e.src,qty:0,kg:0});x.qty+=e.qty;x.kg+=e.qty*efOf(e)}});return Object.keys(m).map(k=>m[k]).sort((a,b)=>b.kg-a.kg)}
function intensity(keys){const kg=co2Total(keys),inc=totals(keys).i;const per=inc>0?kg/(inc/1e6):null;let lv=null;if(per!==null&&kg>0)lv=per<=30?'low':per<=70?'mid':'high';return{kg:kg,per:per,lv:lv}}
const LV={low:{t:'Rendah',c:'good',i:'check'},mid:{t:'Sedang',c:'warn',i:'minus'},high:{t:'Tinggi',c:'serious',i:'alert'}};
const pill=lv=>lv?'<span class="pill '+LV[lv].c+'">'+icon(LV[lv].i,14)+LV[lv].t+'</span>':'';
function periodInfo(p){const keys=p==='3m'?lastMonths(3):p==='6m'?lastMonths(6):[p];return{keys:keys,label:keys.length>1?mLabel(keys[0])+' – '+mLabel(keys[keys.length-1]):mLabel(keys[0])}}
const chartKeys=keys=>keys.length>=3?keys:lastMonths(6,keys[keys.length-1]);

function recs(keys){
  const src=co2Src(keys),tot=src.reduce((a,x)=>a+x.kg,0),out=[];
  if(!src.length)return ['Catat pemakaian listrik, gas, dan BBM agar emisi usaha bisa dihitung.'];
  const top=src[0];
  out.push(F(top.src).name+' menyumbang '+pct(top.kg,tot)+'% emisi pada periode ini ('+kgFmt(top.kg)+' CO₂e).');
  const li=src.find(x=>x.src==='listrik');
  if(li){const k=li.qty*0.1;out.push('Memangkas pemakaian listrik 10% (±'+nf(k)+' kWh) menghemat sekitar '+rp(k*TARIF_KWH)+' dan '+nf(k*0.87)+' kg CO₂e. Hitungan memakai tarif ±Rp'+nf(TARIF_KWH)+'/kWh.')}
  const tips={lpg:'Gas LPG: tutup panci saat memasak dan matikan api saat tidak dipakai.',bensin:'BBM: gabungkan jadwal belanja bahan dan antar pesanan agar perjalanan berkurang.',solar:'Solar: rawat mesin dan atur rute agar konsumsi lebih irit.',sampah:'Sampah: pisahkan sisa organik untuk kompos agar volume ke TPA turun.'};
  src.filter(x=>tips[x.src]).slice(0,2).forEach(x=>out.push(tips[x.src]));
  return out.slice(0,4);
}

/* ================= ikon & logo ================= */
const ICONS={
  home:'<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  book:'<path d="M5 4h12a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2z"/><path d="M9 8h6M9 12h6"/>',
  leaf:'<path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15"/><path d="M5 19c3-5 6-8 10-10"/>',
  doc:'<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  down:'<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  check:'<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  minus:'<path d="M6 12h12"/>',
  alert:'<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/>',
  chart:'<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
  out:'<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h10"/>'
};
const icon=(n,s)=>'<svg class="ico" width="'+(s||20)+'" height="'+(s||20)+'" viewBox="0 0 24 24" aria-hidden="true">'+ICONS[n]+'</svg>';
const logo=s=>'<svg width="'+s+'" height="'+s+'" viewBox="0 0 64 64" role="img" aria-label="Logo EcoFinance"><rect width="64" height="64" rx="16" fill="var(--logo-bg)"/><rect x="16" y="36" width="9" height="14" rx="3" fill="#fff" opacity=".5"/><rect x="28" y="28" width="9" height="22" rx="3" fill="#fff" opacity=".78"/><rect x="40" y="18" width="9" height="32" rx="3" fill="#fff"/><path d="M44.5 15C44.5 8.5 49 5 56 5C56 11.5 52 15 44.5 15Z" fill="#7fe3b0"/></svg>';
const wordmark='<span class="wm">Eco<b>Finance</b></span>';
const PROV={
  Google:'<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"/></svg>',
  Apple:'<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/></svg>',
  Facebook:'<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="#1877F2"><path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z"/></svg>'
};

/* ================= grafik ================= */
const CH={};
function gridSVG(w,H,ml,mr,mt,ph,maxV,fmt){let s='';for(let t=0;t<=4;t++){const v=maxV*t/4,y=mt+ph-v/maxV*ph;s+='<line class="'+(t===0?'axis':'grid')+'" x1="'+ml+'" x2="'+(w-mr)+'" y1="'+y+'" y2="'+y+'"/><text class="tick" x="'+(ml-8)+'" y="'+(y+4)+'" text-anchor="end">'+fmt(v)+'</text>'}return s}
function barPath(x,y,w,h){const r=Math.min(4,h,w/2);return 'M'+x+','+(y+h)+'V'+(y+r)+'Q'+x+','+y+' '+(x+r)+','+y+'H'+(x+w-r)+'Q'+(x+w)+','+y+' '+(x+w)+','+(y+r)+'V'+(y+h)+'Z'}
CH.cash=function(w,keys){
  const H=w<480?220:260,ml=46,mr=8,mt=12,mb=30,pw=w-ml-mr,ph=H-mt-mb,gw=pw/keys.length,bw=Math.min(26,gw*0.3);
  const data=keys.map(k=>totals([k])),maxV=niceMax(Math.max(1,...data.map(d=>Math.max(d.i,d.o))));
  let s='<svg width="'+w+'" height="'+H+'" viewBox="0 0 '+w+' '+H+'" role="img" aria-label="Grafik pemasukan dan pengeluaran per bulan">'+gridSVG(w,H,ml,mr,mt,ph,maxV,rpShort);
  keys.forEach((k,i)=>{
    const cx=ml+gw*i+gw/2,d=data[i],hi=d.i/maxV*ph,ho=d.o/maxV*ph;
    if(hi>0)s+='<path class="b1" d="'+barPath(cx-bw-1,mt+ph-hi,bw,hi)+'"/>';
    if(ho>0)s+='<path class="b2" d="'+barPath(cx+1,mt+ph-ho,bw,ho)+'"/>';
    s+='<text class="xl" x="'+cx+'" y="'+(H-9)+'" text-anchor="middle">'+mShort(k)+'</text>';
    const tip='<b>'+mLabel(k)+'</b><br><i style="background:var(--s1)"></i>Pemasukan '+rp(d.i)+'<br><i style="background:var(--s2)"></i>Pengeluaran '+rp(d.o)+'<br>Laba '+rp(d.net);
    s+='<rect class="hit" x="'+(ml+gw*i)+'" y="'+mt+'" width="'+gw+'" height="'+(ph+mb)+'" data-tip="'+esc(tip)+'"/>';
  });
  return s+'</svg>';
};
CH.co2=function(w,keys){
  const H=w<480?200:230,ml=44,mr=18,mt=22,mb=28,pw=w-ml-mr,ph=H-mt-mb,n=keys.length;
  const vals=keys.map(k=>co2Total([k])),maxV=niceMax(Math.max(1,...vals));
  const X=i=>ml+(n===1?pw/2:pw*i/(n-1)),Y=v=>mt+ph-v/maxV*ph;
  let s='<svg width="'+w+'" height="'+H+'" viewBox="0 0 '+w+' '+H+'" role="img" aria-label="Grafik jejak karbon per bulan">'+gridSVG(w,H,ml,mr,mt,ph,maxV,v=>nf(v));
  const pts=vals.map((v,i)=>X(i)+','+Y(v)).join(' ');
  if(n>1){s+='<path class="ar" d="M'+X(0)+','+Y(0)+' L'+pts.replace(/ /g,' L')+' L'+X(n-1)+','+Y(0)+'Z"/><polyline class="ln" points="'+pts+'"/>'}
  vals.forEach((v,i)=>{
    s+='<circle class="pt" cx="'+X(i)+'" cy="'+Y(v)+'" r="'+(i===n-1?5:4)+'"/><text class="xl" x="'+X(i)+'" y="'+(H-9)+'" text-anchor="middle">'+mShort(keys[i])+'</text>';
    const bw=n>1?pw/(n-1):pw,tip='<b>'+mLabel(keys[i])+'</b><br><i style="background:var(--s3)"></i>'+nf(v)+' kg CO₂e';
    s+='<rect class="hit" x="'+(X(i)-bw/2)+'" y="'+mt+'" width="'+bw+'" height="'+(ph+mb)+'" data-tip="'+esc(tip)+'"/>';
  });
  s+='<text class="vlabel" x="'+X(n-1)+'" y="'+(Y(vals[n-1])-12)+'" text-anchor="end">'+nf(vals[n-1])+' kg</text>';
  return s+'</svg>';
};
function drawCharts(){document.querySelectorAll('[data-chart]').forEach(el=>{const w=Math.floor(el.clientWidth);if(w<40)return;el.innerHTML=CH[el.dataset.chart](w,el.dataset.keys.split(','))})}
let rz;window.addEventListener('resize',()=>{clearTimeout(rz);rz=setTimeout(drawCharts,120)});
const tipEl=document.createElement('div');tipEl.className='tip';tipEl.hidden=true;document.body.appendChild(tipEl);
function moveTip(e){const h=e.target.closest&&e.target.closest('[data-tip]');if(!h){tipEl.hidden=true;return}
  tipEl.innerHTML=h.dataset.tip;tipEl.hidden=false;
  const x=Math.min(e.clientX+14,window.innerWidth-tipEl.offsetWidth-8),y=Math.max(8,e.clientY-tipEl.offsetHeight-12);
  tipEl.style.left=Math.max(8,x)+'px';tipEl.style.top=y+'px'}
document.addEventListener('pointermove',moveTip);document.addEventListener('pointerdown',moveTip);
document.addEventListener('scroll',()=>{tipEl.hidden=true},true);

function hbars(src){const tot=src.reduce((a,x)=>a+x.kg,0),mx=src.length?src[0].kg:1;
  if(!src.length)return '<div class="empty">Belum ada catatan emisi pada periode ini.</div>';
  return '<div class="hbars">'+src.map(x=>'<div class="hb"><div class="top"><b>'+esc(F(x.src).name)+'</b><span class="num">'+nf(x.kg)+' kg · '+pct(x.kg,tot)+'%</span></div><div class="track"><div class="fill" style="width:'+Math.max(2,x.kg/mx*100)+'%"></div></div></div>').join('')+'</div>'}
function cashTable(keys){return '<div class="tbl-wrap"><table><thead><tr><th>Bulan</th><th class="r">Pemasukan</th><th class="r">Pengeluaran</th><th class="r">Laba</th></tr></thead><tbody>'+keys.map(k=>{const t=totals([k]);return '<tr><td>'+mLabel(k)+'</td><td class="r">'+rp(t.i)+'</td><td class="r">'+rp(t.o)+'</td><td class="r">'+rp(t.net)+'</td></tr>'}).join('')+'</tbody></table></div>'}
function co2Table(keys){return '<div class="tbl-wrap"><table><thead><tr><th>Bulan</th><th class="r">Emisi (kg CO₂e)</th></tr></thead><tbody>'+keys.map(k=>'<tr><td>'+mLabel(k)+'</td><td class="r">'+nf(co2Total([k]))+'</td></tr>').join('')+'</tbody></table></div>'}
const tblBtn=id=>'<button class="btn ghost sm" data-act="tbl" data-k="'+id+'" aria-pressed="'+(!!UI.tbl[id])+'">'+(UI.tbl[id]?'Lihat grafik':'Lihat tabel')+'</button>';
const legendCash='<div class="legend"><span><i style="background:var(--s1)"></i>Pemasukan</span><span><i style="background:var(--s2)"></i>Pengeluaran</span></div>';

/* ================= tampilan ================= */
function monthOpts(sel,n){return lastMonths(n||12).reverse().map(k=>'<option value="'+k+'"'+(k===sel?' selected':'')+'>'+mLabel(k)+(k===CUR?' (berjalan)':'')+'</option>').join('')}
function head(t,sub,extra){return '<div class="pagehead"><div><h1>'+t+'</h1><p class="sub">'+sub+'</p></div>'+(extra||'')+'</div>'}
function demoBanner(){return S.demo&&!CLOUD?'<div class="banner"><span>Ini data contoh untuk '+esc(S.biz.name)+'. Hapus lalu catat usaha Anda sendiri.</span><button class="btn sm" data-act="cleardemo">Hapus data contoh</button></div>':''}

function authView(){
 const up=UI.authMode==='up';
 return '<div class="auth"><section class="auth-brand"><div class="brand-row">'+logo(48)+wordmark+'</div>'+
 '<h1>Pembukuan sederhana, jejak karbon terhitung.</h1><p>Catat pemasukan dan pengeluaran, hitung emisi dari listrik, gas, dan BBM, lalu unduh satu laporan PDF yang menyatukan keduanya.</p>'+
 '<ul class="feat"><li><span class="dot">'+icon('book',18)+'</span>Buku kas harian untuk warung, kios, dan usaha rumahan</li><li><span class="dot">'+icon('leaf',18)+'</span>Emisi karbon dihitung otomatis dalam kg CO₂e</li><li><span class="dot">'+icon('doc',18)+'</span>Laporan laba rugi dan karbon dalam satu PDF</li></ul>'+
 '<svg class="rings" viewBox="0 0 340 340" fill="none" stroke="#7fe3b0" stroke-width="1.5" aria-hidden="true"><circle cx="170" cy="170" r="60"/><circle cx="170" cy="170" r="110"/><circle cx="170" cy="170" r="160"/></svg></section>'+
 '<section class="auth-form card"><div><h2>'+(up?'Buat akun EcoFinance':'Masuk ke EcoFinance')+'</h2><p class="sub">Pilih akun yang paling mudah Anda pakai.</p></div>'+
 ['Google','Apple','Facebook'].map(p=>'<button class="sbtn" data-act="login" data-p="'+p+'">'+PROV[p]+'<span>Lanjutkan dengan '+(p==='Apple'?'Apple (iCloud)':p)+'</span></button>').join('')+
 '<div class="or"><span>atau dengan email</span></div>'+
 '<form data-form="login" style="display:grid;gap:12px">'+(up?'<div class="field"><label for="nm">Nama</label><input id="nm" name="name" autocomplete="name" placeholder="Nama Anda" maxlength="60"></div>':'')+
 '<div class="field"><label for="em">Email</label><input id="em" name="email" type="email" autocomplete="email" placeholder="nama@usaha.com" required></div>'+
 '<div class="field"><label for="pw">Kata sandi</label><input id="pw" name="password" type="password" autocomplete="'+(up?'new-password':'current-password')+'" minlength="'+(CLOUD?8:4)+'" required></div>'+
 '<button class="btn" type="submit">'+(up?'Daftar':'Masuk')+'</button></form>'+
 '<p class="note">'+(up?'Sudah punya akun? <button class="link" data-act="authmode" data-m="in">Masuk</button>':'Belum punya akun? <button class="link" data-act="authmode" data-m="up">Daftar</button>'+(CLOUD?' · <button class="link" data-act="forgot">Lupa kata sandi?</button>':''))+'</p>'+
 (CLOUD?'':'<p class="note">Mode demo: Supabase belum diatur di config.js, jadi masuk dengan akun apa pun berhasil dan data tersimpan di peramban ini.</p>')+'</section></div>'}

const NAV=[['beranda','Beranda','home'],['transaksi','Kas','book'],['karbon','Karbon','leaf'],['laporan','Laporan','doc'],['akun','Akun','user']];
function shell(content){
  const ini=esc((S.user.name||'U').trim().charAt(0).toUpperCase());
  return '<div class="shell"><aside class="side"><div class="brand-row">'+logo(40)+wordmark+'</div><nav class="nav" aria-label="Menu utama">'+
    NAV.map(n=>'<button data-act="nav" data-v="'+n[0]+'"'+(UI.view===n[0]?' aria-current="page"':'')+'>'+icon(n[2])+(n[0]==='transaksi'?'Buku kas':n[1])+'</button>').join('')+'</nav>'+
    '<div class="userbox"><div class="avatar">'+ini+'</div><div class="who"><b>'+esc(S.user.name)+'</b><span class="muted small">'+esc(S.user.provider)+'</span></div></div></aside>'+
    '<div style="min-width:0"><header class="topbar"><div class="brand-row">'+logo(34)+wordmark+'</div><div class="avatar">'+ini+'</div></header><main id="main">'+content+'</main></div></div>'+
    '<nav class="tabbar" aria-label="Menu utama">'+NAV.map(n=>'<button data-act="nav" data-v="'+n[0]+'"'+(UI.view===n[0]?' aria-current="page"':'')+'>'+icon(n[2],22)+'<span>'+n[1]+'</span></button>').join('')+'</nav>'}

function berandaView(){
  const k=UI.month,t=totals([k]),it=intensity([k]),six=lastMonths(6),src=co2Src([k]),running=k===CUR;
  const margin=t.i>0?Math.round(t.net/t.i*100):0;
  const sub=running?'Bulan berjalan, sampai '+fmtDate(TODAY):'Ringkasan satu bulan penuh';
  return head('Halo, '+esc(S.biz.name),sub+'.','<div class="field" style="min-width:180px"><label for="mb" class="lbl">Bulan</label><select id="mb" data-bind="month">'+monthOpts(k,6)+'</select></div>')+demoBanner()+(!S.tx.length&&!S.co2.length?onboard():'')+
  '<div class="kpis">'+
   '<div class="card kpi"><span class="eyebrow">Pemasukan</span><span class="v num">'+rp(t.i)+'</span><span class="muted small">'+mLabel(k)+'</span></div>'+
   '<div class="card kpi"><span class="eyebrow">Pengeluaran</span><span class="v num">'+rp(t.o)+'</span><span class="muted small">'+pct(t.o,t.i)+'% dari pemasukan</span></div>'+
   '<div class="card kpi hero"><span class="eyebrow">Laba bersih</span><span class="v num">'+rp(t.net)+'</span><span><span class="pill">Margin '+margin+'%</span></span></div>'+
   '<div class="card kpi"><span class="eyebrow">Jejak karbon</span><span class="v num">'+kgFmt(it.kg)+' <span style="font-size:.55em;font-weight:600" class="muted">CO₂e</span></span><span>'+(it.per!==null&&it.lv?pill(it.lv)+' <span class="muted small num">'+nf(it.per)+' kg / Rp1 jt</span>':'<span class="muted small">Belum ada catatan</span>')+'</span></div>'+
  '</div>'+
  '<div class="row2"><section class="card"><div class="card-h"><h2>Arus kas 6 bulan</h2><div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">'+legendCash+tblBtn('cash')+'</div></div>'+
    (UI.tbl.cash?cashTable(six):'<div class="chart" data-chart="cash" data-keys="'+six.join(',')+'"></div>')+'</section>'+
   '<section class="card"><div class="card-h"><h2>Emisi per sumber</h2><span class="muted small">'+mLabel(k)+'</span></div>'+hbars(src)+'</section></div>'+
  '<div class="row2"><section class="card"><div class="card-h"><h2>Jejak karbon per bulan</h2>'+tblBtn('co2')+'</div>'+(UI.tbl.co2?co2Table(six):'<div class="chart" data-chart="co2" data-keys="'+six.join(',')+'"></div>')+'</section>'+
   '<section class="card insight"><div class="card-h" style="margin:0"><h2>Peluang hemat</h2></div><ul>'+recs([k]).map(r=>'<li>'+esc(r)+'</li>').join('')+'</ul><p class="muted small">Angka bersifat perkiraan.</p></section></div>'}

function onboard(){return '<section class="card" style="display:grid;gap:12px"><h2 style="font-size:18px">Mulai dari sini</h2><p class="sub">Belum ada catatan. Tambahkan transaksi pertama atau coba dulu dengan data contoh.</p><div class="actions"><button class="btn" data-act="nav" data-v="transaksi">'+icon('plus',18)+'Catat transaksi</button><button class="btn ghost" data-act="nav" data-v="karbon">Catat emisi</button><button class="btn ghost" data-act="demo">Muat data contoh</button></div></section>'}
function txFormCats(type){return (type==='in'?IN_CATS:OUT_CATS).map(c=>'<option>'+esc(c)+'</option>').join('')}
function transaksiView(){
  const k=UI.txMonth,list=S.tx.filter(t=>k==='all'||t.date.slice(0,7)===k).sort((a,b)=>b.date.localeCompare(a.date)||b.id-a.id),keys=k==='all'?null:[k];
  const t=keys?totals(keys):{i:S.tx.filter(x=>x.type==='in').reduce((a,x)=>a+x.amount,0),o:S.tx.filter(x=>x.type==='out').reduce((a,x)=>a+x.amount,0)};
  return head('Buku kas','Catat setiap uang masuk dan keluar usaha Anda.')+demoBanner()+
  '<section class="card"><form data-form="tx" class="formgrid"><div class="field c2"><span class="lbl">Jenis</span><div class="seg"><label><input type="radio" name="type" value="in" checked><span>Pemasukan</span></label><label><input type="radio" name="type" value="out"><span>Pengeluaran</span></label></div></div>'+
   '<div class="field c2"><label for="tdate">Tanggal</label><input id="tdate" name="date" type="date" value="'+TODAY+'" required></div>'+
   '<div class="field c2"><label for="tcat">Kategori</label><select id="tcat" name="cat">'+txFormCats('in')+'</select></div>'+
   '<div class="field c3"><label for="tnote">Keterangan</label><input id="tnote" name="note" type="text" maxlength="80" placeholder="Contoh: Penjualan hari ini"></div>'+
   '<div class="field c2"><label for="tamt">Jumlah (Rp)</label><input id="tamt" name="amount" type="text" inputmode="numeric" placeholder="0" required></div>'+
   '<div class="field"><button class="btn" type="submit">'+icon('plus',18)+'Simpan</button></div></form></section>'+
  '<section class="card"><div class="card-h"><h2>Riwayat transaksi</h2><div class="field" style="min-width:170px"><label class="lbl" for="tm">Bulan</label><select id="tm" data-bind="txMonth"><option value="all"'+(k==='all'?' selected':'')+'>Semua bulan</option>'+monthOpts(k==='all'?CUR:k).replace(/ selected/,k==='all'?'':' selected')+'</select></div></div>'+
   '<p class="small sub num" style="margin-bottom:6px">Masuk <b>'+rp(t.i)+'</b> · Keluar <b>'+rp(t.o)+'</b> · Selisih <b>'+rp(t.i-t.o)+'</b></p>'+
   (list.length?'<div class="list">'+list.slice(0,80).map(x=>'<div class="item"><span class="d">'+fmtDate(x.date)+'</span><div class="t"><b>'+esc(x.note||x.cat)+'</b><span>'+esc(x.cat)+'</span></div><span class="a '+x.type+'">'+(x.type==='in'?'+':'-')+rp(x.amount).replace('-','')+'</span>'+
     (UI.confirm==='t'+x.id?'<button class="iconbtn sure" data-act="del" data-id="'+x.id+'">Yakin?</button>':'<button class="iconbtn" data-act="del" data-id="'+x.id+'" aria-label="Hapus transaksi">'+icon('trash',18)+'</button>')+'</div>').join('')+'</div>':'<div class="empty">Belum ada transaksi pada bulan ini.</div>')+'</section>'}

function karbonView(){
  const k=UI.coMonth,list=S.co2.filter(e=>e.date.slice(0,7)===k).sort((a,b)=>b.date.localeCompare(a.date)||b.id-a.id),it=intensity([k]),six=lastMonths(6,k),src=co2Src([k]);
  return head('Jejak karbon','Hitung emisi dari energi dan sampah usaha Anda.')+demoBanner()+
  '<section class="card"><form data-form="co2" class="formgrid"><div class="field c2"><label for="cdate">Tanggal</label><input id="cdate" name="date" type="date" value="'+TODAY+'" required></div>'+
   '<div class="field c2"><label for="csrc">Sumber emisi</label><select id="csrc" name="src">'+FACTORS.map(f=>'<option value="'+f.id+'">'+esc(f.name)+'</option>').join('')+'</select></div>'+
   '<div class="field c2"><label for="cqty">Jumlah <span id="cunit" class="muted">(kWh)</span></label><input id="cqty" name="qty" type="text" inputmode="decimal" placeholder="0" required></div>'+
   '<div class="field c3"><label for="cnote">Keterangan</label><input id="cnote" name="note" type="text" maxlength="80" placeholder="Contoh: Tagihan listrik bulan ini"></div>'+
   '<div class="field c3"><div class="preview" id="cprev">'+icon('leaf',18)+'<span>Perkiraan emisi: 0 kg CO₂e</span></div></div>'+
   '<div class="field c6"><button class="btn" type="submit">'+icon('plus',18)+'Simpan catatan emisi</button></div></form></section>'+
  '<div class="kpis k3"><div class="card kpi"><span class="eyebrow">Total emisi</span><span class="v num">'+kgFmt(it.kg)+'</span><span class="muted small">CO₂e, '+mLabel(k)+'</span></div>'+
   '<div class="card kpi"><span class="eyebrow">Intensitas</span><span class="v num">'+(it.per!==null?nf(it.per):'–')+'</span><span class="muted small">kg CO₂e per Rp1 juta pemasukan</span></div>'+
   '<div class="card kpi"><span class="eyebrow">Kategori</span><span class="v">'+(it.lv?pill(it.lv):'–')+'</span><span class="muted small">Indikatif, bukan sertifikasi</span></div></div>'+
  '<div class="row2"><section class="card"><div class="card-h"><h2>Tren emisi</h2><div class="field" style="min-width:170px"><label class="lbl" for="cm">Bulan</label><select id="cm" data-bind="coMonth">'+monthOpts(k)+'</select></div></div><div class="chart" data-chart="co2" data-keys="'+six.join(',')+'"></div></section>'+
   '<section class="card"><div class="card-h"><h2>Per sumber</h2></div>'+hbars(src)+'</section></div>'+
  '<section class="card"><div class="card-h"><h2>Catatan emisi</h2><span class="muted small">'+mLabel(k)+'</span></div>'+
   (list.length?'<div class="list">'+list.map(e=>{const f=F(e.src);return '<div class="item"><span class="d">'+fmtDate(e.date)+'</span><div class="t"><b>'+esc(e.note||f.name)+'</b><span>'+esc(f.name)+' · '+nf(e.qty,1)+' '+esc(f.unit)+'</span></div><span class="a num">'+nf(e.qty*efOf(e))+' kg</span>'+
     (UI.confirm==='c'+e.id?'<button class="iconbtn sure" data-act="delco" data-id="'+e.id+'">Yakin?</button>':'<button class="iconbtn" data-act="delco" data-id="'+e.id+'" aria-label="Hapus catatan emisi">'+icon('trash',18)+'</button>')+'</div>'}).join('')+'</div>':'<div class="empty">Belum ada catatan emisi pada bulan ini.</div>')+'</section>'+
  factorsHTML()}
function factorsHTML(){return '<section class="card"><details><summary>Faktor emisi dan sumbernya</summary><div class="tbl-wrap" style="margin-top:12px"><table><thead><tr><th>Sumber</th><th class="r">kg CO₂e / satuan</th><th>Status</th><th>Dasar perhitungan</th></tr></thead><tbody>'+FACTORS.map(f=>'<tr><td>'+esc(f.name)+'<br><span class="muted small">per '+esc(f.unit)+'</span></td><td class="r">'+nf(f.f,2)+'</td><td><span class="pill '+(f.status==='official'?'good':f.status==='unverified'?'warn':'neutral')+'">'+esc(EF_STATUS[f.status])+'</span></td><td class="small">'+esc(f.basis)+(f.ref?'<br><span class="muted">'+esc(f.ref)+'</span>':'')+'</td></tr>').join('')+'</tbody></table></div><p class="muted small" style="margin-top:10px">Faktor dapat diganti di berkas emission-factors.js. Catatan lama tetap memakai faktor saat dicatat.</p></details></section>'}

function laporanView(){
  const P=periodInfo(UI.period),keys=P.keys,t=totals(keys),it=intensity(keys),ck=chartKeys(keys),src=co2Src(keys),tot=src.reduce((a,x)=>a+x.kg,0);
  const inC=catTotals(keys,'in'),outC=catTotals(keys,'out');
  const energy=outC.filter(c=>c.cat==='Listrik & air'||c.cat==='BBM & transport').reduce((a,c)=>a+c.v,0);
  const periodOpts='<option value="3m"'+(UI.period==='3m'?' selected':'')+'>3 bulan terakhir</option><option value="6m"'+(UI.period==='6m'?' selected':'')+'>6 bulan terakhir</option>'+lastMonths(6).reverse().map(k=>'<option value="'+k+'"'+(UI.period===k?' selected':'')+'>'+mLabel(k)+'</option>').join('');
  const rows=(arr,tot2)=>arr.map(c=>'<tr><td>'+esc(c.cat)+'</td><td class="r">'+rp(c.v)+'</td><td class="r">'+pct(c.v,tot2)+'%</td></tr>').join('')||'<tr><td colspan="3" class="muted">Tidak ada data</td></tr>';
  return head('Laporan terpadu','Keuangan dan jejak karbon dalam satu dokumen.','<div class="actions"><button class="btn" data-act="pdf">'+icon('down',18)+'Unduh PDF</button><button class="btn ghost" data-act="csv">'+icon('down',18)+'Unduh CSV</button></div>')+demoBanner()+
  '<div class="controls"><div class="field"><label class="lbl" for="pr">Periode laporan</label><select id="pr" data-bind="period">'+periodOpts+'</select></div></div>'+
  '<article class="card paper"><div class="paper-head"><div class="brand-row">'+logo(44)+'<div><div style="font-weight:800;font-size:18px;letter-spacing:-.01em">'+esc(S.biz.name)+'</div><div class="muted small">Laporan keuangan dan jejak karbon</div></div></div><div style="text-align:right"><div class="eyebrow">Periode</div><b>'+P.label+'</b></div></div>'+
   '<section><h3>Ringkasan</h3><div class="sum4"><div><span class="eyebrow">Pemasukan</span><b class="num">'+rp(t.i)+'</b></div><div><span class="eyebrow">Pengeluaran</span><b class="num">'+rp(t.o)+'</b></div><div><span class="eyebrow">Laba bersih</span><b class="num">'+rp(t.net)+'</b></div><div><span class="eyebrow">Emisi karbon</span><b class="num">'+kgFmt(it.kg)+' CO₂e</b></div></div></section>'+
   '<section><h3>Laba rugi sederhana</h3><div class="tbl-wrap"><table><thead><tr><th>Uraian</th><th class="r">Jumlah</th><th class="r">Porsi</th></tr></thead><tbody><tr class="sec"><td colspan="3">Pemasukan</td></tr>'+rows(inC,t.i)+'<tr class="tot"><td>Total pemasukan</td><td class="r">'+rp(t.i)+'</td><td class="r"></td></tr><tr class="sec"><td colspan="3">Pengeluaran</td></tr>'+rows(outC,t.o)+'<tr class="tot"><td>Total pengeluaran</td><td class="r">'+rp(t.o)+'</td><td class="r"></td></tr><tr class="tot"><td>Laba bersih</td><td class="r">'+rp(t.net)+'</td><td class="r">'+pct(t.net,t.i)+'%</td></tr></tbody></table></div></section>'+
   '<section><div class="card-h" style="margin-bottom:8px"><h3 style="margin:0">Arus kas</h3>'+legendCash+'</div><div class="chart" data-chart="cash" data-keys="'+ck.join(',')+'"></div></section>'+
   '<section><h3>Jejak karbon per sumber</h3><div class="tbl-wrap"><table><thead><tr><th>Sumber</th><th class="r">Jumlah</th><th class="r">Emisi (kg CO₂e)</th><th class="r">Porsi</th></tr></thead><tbody>'+(src.map(x=>'<tr><td>'+esc(F(x.src).name)+'</td><td class="r">'+nf(x.qty,1)+' '+esc(F(x.src).unit)+'</td><td class="r">'+nf(x.kg)+'</td><td class="r">'+pct(x.kg,tot)+'%</td></tr>').join('')||'<tr><td colspan="4" class="muted">Tidak ada data</td></tr>')+'<tr class="tot"><td>Total</td><td class="r"></td><td class="r">'+nf(tot)+'</td><td class="r"></td></tr></tbody></table></div></section>'+
   '<section><div class="chart" data-chart="co2" data-keys="'+ck.join(',')+'"></div></section>'+
   '<section><h3>Keuangan dan karbon, dibaca bersama</h3><div class="sum4"><div><span class="eyebrow">Intensitas karbon</span><b class="num">'+(it.per!==null?nf(it.per):'–')+'</b><span class="muted small">kg CO₂e per Rp1 juta omzet</span></div><div><span class="eyebrow">Kategori</span><b>'+(it.lv?pill(it.lv):'–')+'</b></div><div><span class="eyebrow">Biaya energi</span><b class="num">'+rp(energy)+'</b><span class="muted small">'+pct(energy,t.o)+'% dari pengeluaran</span></div><div><span class="eyebrow">Laba per ton CO₂e</span><b class="num">'+(it.kg>0?rp(t.net/(it.kg/1000)):'–')+'</b></div></div>'+
    '<ul class="insight" style="margin:14px 0 0;padding-left:18px">'+recs(keys).map(r=>'<li>'+esc(r)+'</li>').join('')+'</ul></section>'+
   '<p class="muted small">Faktor emisi mengacu pada tabel di menu Karbon. Faktor berstatus "Perlu verifikasi" belum dicocokkan dengan dokumen resmi. Kategori intensitas bersifat indikatif, bukan sertifikasi.</p></article>'}

function akunView(){
  const empty=!S.tx.length&&!S.co2.length;
  return head('Akun','Atur profil usaha dan data Anda.')+demoBanner()+
  '<section class="card" style="display:grid;gap:14px;max-width:560px"><div class="field"><label for="bn">Nama usaha</label><input id="bn" data-bind="bizname" value="'+esc(S.biz.name)+'" maxlength="60"></div><div class="field"><label for="bs">Jenis usaha</label><input id="bs" data-bind="bizsector" value="'+esc(S.biz.sector)+'" maxlength="60"></div>'+
   '<div class="preview">'+icon('user',18)+'<span>'+esc(S.user.name)+(S.user.email?' · '+esc(S.user.email):'')+' · via '+esc(S.user.provider)+'</span></div><p class="muted small">'+(CLOUD?'Data tersimpan di akun Anda dan bisa dibuka dari perangkat mana pun.':'Mode demo: data tersimpan di peramban ini saja.')+'</p></section>'+
  (CLOUD&&S.user.provider==='Email'?'<section class="card" style="display:grid;gap:12px;max-width:560px"><h2 style="font-size:17px">Kata sandi</h2><div class="field"><label for="npw">Kata sandi baru</label><input id="npw" type="password" autocomplete="new-password" minlength="8"></div><div><button class="btn ghost" data-act="setpw">Simpan kata sandi</button></div></section>':'')+
  '<section class="card" style="display:grid;gap:12px;max-width:560px"><h2 style="font-size:17px">Data</h2><div class="actions">'+(empty?'<button class="btn ghost" data-act="demo">Muat data contoh</button>':'')+
   (UI.confirm==='wipe'?'<button class="btn danger" data-act="wipe">Yakin hapus semua?</button>':'<button class="btn danger" data-act="wipe">Hapus semua data</button>')+'<button class="btn ghost" data-act="logout">'+icon('out',18)+'Keluar</button></div></section>'}

const VIEWS={beranda:berandaView,transaksi:transaksiView,karbon:karbonView,laporan:laporanView,akun:akunView};
const app=document.getElementById('app');
function render(){
  if(S.user&&!S.ready){app.innerHTML='<p style="padding:64px 0;text-align:center;color:var(--muted)">Memuat data Anda…</p>';return}
  app.innerHTML=S.user?shell(VIEWS[UI.view]()):authView();drawCharts()}

/* ================= ekspor ================= */
let toastT;function toast(m,ms){let t=document.querySelector('.toast');if(!t){t=document.createElement('div');t.className='toast';t.setAttribute('role','status');document.body.appendChild(t)}t.textContent=m;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>{t.hidden=true},ms||3200)}
function saveFile(name,data,mime){
  try{const b=new Blob([data],{type:mime}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);toast('Mengunduh '+name)}catch(e){toast('Unduhan gagal')}
}
function buildCSV(keys){
  const q=v=>'"'+String(v).replace(/"/g,'""')+'"',rows=[['Jenis','Tanggal','Kategori / Sumber','Keterangan','Jumlah','Satuan','Emisi (kg CO2e)']];
  S.tx.filter(t=>inKeys(t.date,keys)).sort((a,b)=>a.date.localeCompare(b.date)).forEach(t=>rows.push([t.type==='in'?'Pemasukan':'Pengeluaran',t.date,t.cat,t.note||'',t.amount,'Rp','']));
  S.co2.filter(e=>inKeys(e.date,keys)).sort((a,b)=>a.date.localeCompare(b.date)).forEach(e=>{const f=F(e.src);rows.push(['Emisi',e.date,f.name,e.note||'',e.qty,f.unit,Math.round(e.qty*efOf(e)*10)/10])});
  return '﻿'+rows.map(r=>r.map(q).join(',')).join('\r\n');
}
function buildPDF(P){
  const J=window.jspdf.jsPDF,doc=new J({unit:'pt',format:'a4'}),W=595.28,M=40,keys=P.keys;
  const C={brand:[11,107,80],ink:[16,36,31],ink2:[71,96,90],line:[221,231,226],s1:[42,120,214],s2:[235,104,52],s3:[27,175,122]};
  const t=totals(keys),it=intensity(keys),src=co2Src(keys),tot=src.reduce((a,x)=>a+x.kg,0),ck=chartKeys(keys);
  const R=n=>'Rp '+nf(Math.round(n));
  let y=0;
  function band(){doc.setFillColor(...C.brand);doc.rect(0,0,W,92,'F');
    doc.setFillColor(6,74,56);doc.roundedRect(M,24,44,44,11,11,'F');
    doc.setFillColor(150,215,185);doc.rect(M+11,24+34.4-9.6,6.2,9.6,'F');doc.setFillColor(205,240,225);doc.rect(M+19.3,24+34.4-15.1,6.2,15.1,'F');doc.setFillColor(255,255,255);doc.rect(M+27.5,24+34.4-22,6.2,22,'F');
    doc.setFillColor(127,227,176);doc.ellipse(M+34.5,24+7.5,4.6,2.7,'F');
    doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(20);doc.text('EcoFinance',M+58,44);
    doc.setFont('helvetica','normal');doc.setFontSize(10);doc.text('Laporan keuangan & jejak karbon',M+58,60);
    doc.setFontSize(9);doc.text('Periode',W-M,40,{align:'right'});doc.setFont('helvetica','bold');doc.setFontSize(12);doc.text(P.label,W-M,56,{align:'right'});}
  function need(h){if(y+h>790){doc.addPage();y=50}}
  function h2(txt){need(40);doc.setFont('helvetica','bold');doc.setFontSize(12);doc.setTextColor(...C.brand);doc.text(txt,M,y);doc.setDrawColor(...C.line);doc.line(M,y+6,W-M,y+6);y+=24}
  function row(cols,opt){opt=opt||{};need(18);doc.setFont('helvetica',opt.bold?'bold':'normal');doc.setFontSize(9.5);doc.setTextColor(...(opt.color||C.ink));
    cols.forEach(c=>doc.text(String(c.t),c.x,y,{align:c.a||'left'}));
    if(opt.line){doc.setDrawColor(...C.line);doc.line(M,y+5,W-M,y+5)}y+=16}
  band();y=120;
  doc.setTextColor(...C.ink);doc.setFont('helvetica','bold');doc.setFontSize(15);doc.text(S.biz.name,M,y);
  doc.setFont('helvetica','normal');doc.setFontSize(9.5);doc.setTextColor(...C.ink2);doc.text(S.biz.sector+'  ·  Dibuat '+fmtDate(TODAY),M,y+16);y+=40;
  const bw=(W-2*M-30)/4,boxes=[['Pemasukan',R(t.i)],['Pengeluaran',R(t.o)],['Laba bersih',R(t.net)],['Emisi karbon',kgFmt(it.kg)+' CO2e']];
  boxes.forEach((b,i)=>{const x=M+i*(bw+10),hero=i===2;if(hero){doc.setFillColor(...C.brand);doc.roundedRect(x,y,bw,52,8,8,'F')}else{doc.setDrawColor(...C.line);doc.roundedRect(x,y,bw,52,8,8,'S')}
    doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(...(hero?[200,240,222]:C.ink2));doc.text(b[0].toUpperCase(),x+10,y+17);
    doc.setFont('helvetica','bold');doc.setFontSize(b[1].length>16?10.5:12.5);doc.setTextColor(...(hero?[255,255,255]:C.ink));doc.text(b[1],x+10,y+37)});
  y+=82;
  h2('Laba rugi sederhana');
  const X1=M+4,X2=W-M-70,X3=W-M;
  function block(title,arr,total,label){row([{t:title,x:X1}],{bold:true,color:C.brand});arr.forEach(c=>row([{t:c.cat,x:X1+8},{t:R(c.v),x:X2,a:'right'},{t:pct(c.v,total)+'%',x:X3,a:'right'}]));row([{t:label,x:X1},{t:R(total),x:X2,a:'right'}],{bold:true,line:true})}
  block('Pemasukan',catTotals(keys,'in'),t.i,'Total pemasukan');y+=4;
  block('Pengeluaran',catTotals(keys,'out'),t.o,'Total pengeluaran');y+=4;
  row([{t:'Laba bersih',x:X1},{t:R(t.net),x:X2,a:'right'},{t:pct(t.net,t.i)+'%',x:X3,a:'right'}],{bold:true});y+=14;
  /* grafik arus kas */
  h2('Arus kas bulanan');need(170);
  const cx0=M+44,cw=W-2*M-44,ch=120,maxV=niceMax(Math.max(1,...ck.map(k=>{const d=totals([k]);return Math.max(d.i,d.o)}))),by=y+ch;
  doc.setFontSize(8);doc.setFont('helvetica','normal');
  for(let i=0;i<=4;i++){const v=maxV*i/4,yy=by-ch*i/4;doc.setDrawColor(...C.line);doc.line(cx0,yy,cx0+cw,yy);doc.setTextColor(...C.ink2);doc.text(rpShort(v),cx0-6,yy+3,{align:'right'})}
  const gw=cw/ck.length,gb=Math.min(22,gw*0.3);
  ck.forEach((k,i)=>{const d=totals([k]),cx=cx0+gw*i+gw/2;
    doc.setFillColor(...C.s1);doc.rect(cx-gb-1,by-d.i/maxV*ch,gb,d.i/maxV*ch,'F');doc.setFillColor(...C.s2);doc.rect(cx+1,by-d.o/maxV*ch,gb,d.o/maxV*ch,'F');
    doc.setTextColor(...C.ink2);doc.text(mShort(k),cx,by+13,{align:'center'})});
  doc.setFillColor(...C.s1);doc.rect(cx0,by+24,8,8,'F');doc.setTextColor(...C.ink);doc.text('Pemasukan',cx0+13,by+31);doc.setFillColor(...C.s2);doc.rect(cx0+80,by+24,8,8,'F');doc.text('Pengeluaran',cx0+93,by+31);
  y=by+54;
  /* karbon */
  h2('Jejak karbon per sumber');
  const Y1=M+4,Y2=M+190,Y3=W-M-70,Y4=W-M;
  row([{t:'SUMBER',x:Y1},{t:'JUMLAH',x:Y2,a:'right'},{t:'EMISI (KG CO2E)',x:Y3,a:'right'},{t:'PORSI',x:Y4,a:'right'}],{bold:true,color:C.ink2,line:true});
  if(!src.length)row([{t:'Belum ada catatan emisi pada periode ini.',x:Y1}]);
  src.forEach(x=>row([{t:F(x.src).name,x:Y1},{t:nf(x.qty,1)+' '+F(x.src).unit.replace('₂','2'),x:Y2,a:'right'},{t:nf(x.kg),x:Y3,a:'right'},{t:pct(x.kg,tot)+'%',x:Y4,a:'right'}]));
  row([{t:'Total',x:Y1},{t:nf(tot),x:Y3,a:'right'}],{bold:true,line:true});y+=6;
  if(src.length){need(src.length*20+10);const mx=src[0].kg,bx=M+4,bwid=W-2*M-8;
    src.forEach(x=>{doc.setFont('helvetica','normal');doc.setFontSize(8.5);doc.setTextColor(...C.ink2);doc.text(F(x.src).name,bx,y+8);
      doc.setFillColor(...C.line);doc.roundedRect(bx+120,y,bwid-190,9,4,4,'F');doc.setFillColor(...C.s3);doc.roundedRect(bx+120,y,Math.max(4,(bwid-190)*x.kg/mx),9,4,4,'F');
      doc.setTextColor(...C.ink);doc.text(nf(x.kg)+' kg',bx+bwid,y+8,{align:'right'});y+=19});y+=6}
  /* terpadu */
  h2('Keuangan dan karbon, dibaca bersama');
  const energy=catTotals(keys,'out').filter(c=>c.cat==='Listrik & air'||c.cat==='BBM & transport').reduce((a,c)=>a+c.v,0);
  row([{t:'Intensitas karbon',x:X1},{t:it.per!==null?nf(it.per)+' kg CO2e per Rp1 juta omzet ('+(it.lv?LV[it.lv].t:'-')+')':'-',x:X3,a:'right'}]);
  row([{t:'Biaya energi (listrik, air, BBM)',x:X1},{t:R(energy)+' ('+pct(energy,t.o)+'% pengeluaran)',x:X3,a:'right'}]);
  row([{t:'Laba per ton CO2e',x:X1},{t:it.kg>0?R(t.net/(it.kg/1000)):'-',x:X3,a:'right'}],{line:true});y+=8;
  doc.setFont('helvetica','bold');doc.setFontSize(10);doc.setTextColor(...C.ink);need(30);doc.text('Peluang hemat',M,y);y+=15;
  recs(keys).forEach(r=>{const lines=doc.splitTextToSize(r.replace(/₂/g,'2'),W-2*M-14);need(lines.length*13+4);doc.setFont('helvetica','normal');doc.setFontSize(9.5);doc.setTextColor(...C.ink2);doc.text('•',M+2,y);doc.text(lines,M+14,y);y+=lines.length*13+3});
  if(src.length){h2('Faktor emisi yang dipakai');
    src.forEach(x=>{const f=F(x.src);row([{t:f.name+': '+nf(f.f,2)+' kg CO2e per '+f.unit.replace('₂','2')+' ('+EF_STATUS[f.status]+')',x:X1}])});
    if(src.some(x=>F(x.src).status==='unverified'))row([{t:'Catatan: faktor "Perlu verifikasi" belum dicocokkan dengan dokumen resmi.',x:X1}],{color:C.ink2})}
  const pages=doc.getNumberOfPages();
  for(let i=1;i<=pages;i++){doc.setPage(i);doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(...C.ink2);doc.text('EcoFinance · Faktor emisi bersifat perkiraan, bukan sertifikasi.',M,822);doc.text('Halaman '+i+' / '+pages,W-M,822,{align:'right'})}
  return doc.output('arraybuffer');
}

/* ================= aksi ================= */
const PROVNAME={google:'Google',apple:'Apple',facebook:'Facebook',email:'Email'};
function sessionUser(u){const m=u.user_metadata||{};return{id:u.id,email:u.email||'',name:m.full_name||m.name||(u.email||'').split('@')[0]||'Pemilik Usaha',provider:PROVNAME[(u.app_metadata&&u.app_metadata.provider)||'email']||'Email'}}
let loadingId=null;
async function onSession(session){
  if(!session){S.user=null;S.tx=[];S.co2=[];S.ready=false;render();return}
  const u=sessionUser(session.user);
  if(loadingId===u.id)return;
  if(S.user&&S.user.id===u.id&&S.ready){S.user=u;return}
  loadingId=u.id;S.user=u;S.ready=false;render();
  try{await loadCloud()}catch(e){toast('Gagal memuat data: '+((e&&e.message)||e),6000)}
  S.ready=true;loadingId=null;render()
}
async function initAuth(){
  render();
  if(!CLOUD)return;
  try{const r=await sb.auth.getSession();await onSession(r.data.session)}catch(e){render()}
  sb.auth.onAuthStateChange((ev,session)=>{setTimeout(()=>{if(ev==='PASSWORD_RECOVERY'){UI.view='akun';toast('Atur kata sandi baru di bawah ini.',6000)}onSession(session)},0)});
}
function setLocalUser(name,provider){S.user={name:name,provider:provider};if(!S.tx.length&&!S.co2.length&&!S.demo){const d=genDemo();S.tx=d.tx;S.co2=d.co2;S.nid=d.nid;S.demo=true}save();UI.view='beranda';render()}
async function doOAuth(p){
  if(!CLOUD){setLocalUser('Pemilik Usaha',p);return}
  const r=await sb.auth.signInWithOAuth({provider:p.toLowerCase(),options:{redirectTo:location.origin+location.pathname}});
  if(r.error)toast('Masuk gagal: '+r.error.message,6000)}
async function doEmail(mode,email,pw,name){
  if(!CLOUD){setLocalUser(name||email.split('@')[0]||'Pemilik Usaha','Email');return}
  toast('Memproses…');
  if(mode==='up'){
    const r=await sb.auth.signUp({email:email,password:pw,options:{data:{full_name:name||email.split('@')[0]},emailRedirectTo:location.origin+location.pathname}});
    if(r.error){toast('Daftar gagal: '+r.error.message,6000);return}
    if(!r.data.session)toast('Cek email Anda untuk konfirmasi, lalu masuk.',7000)
  }else{
    const r=await sb.auth.signInWithPassword({email:email,password:pw});
    if(r.error)toast(r.error.message==='Invalid login credentials'?'Email atau kata sandi salah.':'Masuk gagal: '+r.error.message,6000)
  }
}
app.addEventListener('click',async e=>{
  const el=e.target.closest('[data-act]'),act=el&&el.dataset.act;
  if(UI.confirm&&act!=='del'&&act!=='delco'&&act!=='wipe'){UI.confirm=null;if(!act){render();return}}
  if(!act||(S.busy&&(act==='del'||act==='delco')))return;
  if(act==='nav'){UI.view=el.dataset.v;render();window.scrollTo(0,0)}
  else if(act==='login'){await doOAuth(el.dataset.p)}
  else if(act==='authmode'){UI.authMode=el.dataset.m;render()}
  else if(act==='forgot'){const em=(document.getElementById('em').value||'').trim();if(!em){toast('Isi email Anda dulu, lalu tekan Lupa kata sandi.');return}
    const r=await sb.auth.resetPasswordForEmail(em,{redirectTo:location.origin+location.pathname});toast(r.error?'Gagal: '+r.error.message:'Tautan reset dikirim ke email Anda.',6000)}
  else if(act==='setpw'){const v=document.getElementById('npw').value;if(v.length<8){toast('Kata sandi minimal 8 karakter.');return}
    const r=await sb.auth.updateUser({password:v});toast(r.error?'Gagal: '+r.error.message:'Kata sandi diperbarui.');if(!r.error)document.getElementById('npw').value=''}
  else if(act==='logout'){if(CLOUD){await sb.auth.signOut()}else{S.user=null;save();render()}window.scrollTo(0,0)}
  else if(act==='tbl'){UI.tbl[el.dataset.k]=!UI.tbl[el.dataset.k];render()}
  else if(act==='del'||act==='delco'){const id=+el.dataset.id,tag=(act==='del'?'t':'c')+id;
    if(UI.confirm===tag){S.busy=true;const ok=await opDel(act==='del'?'transactions':'emissions',act==='del'?'tx':'co2',id);S.busy=false;UI.confirm=null;if(ok)toast('Catatan dihapus')}else UI.confirm=tag;render()}
  else if(act==='cleardemo'||(act==='wipe'&&UI.confirm==='wipe')){UI.confirm=null;if(await opWipe())toast('Data dihapus. Silakan mulai mencatat.');render()}
  else if(act==='wipe'){UI.confirm='wipe';render()}
  else if(act==='demo'){if(await opSeedDemo()){UI.view='beranda';toast('Data contoh dimuat')}render()}
  else if(act==='pdf'){const P=periodInfo(UI.period);if(!window.jspdf){toast('Pustaka PDF belum termuat. Periksa koneksi lalu coba lagi.');return}
    try{saveFile('Laporan-EcoFinance-'+P.label.replace(/[^\w]+/g,'-')+'.pdf',buildPDF(P),'application/pdf')}catch(err){toast('PDF gagal dibuat')}}
  else if(act==='csv'){const P=periodInfo(UI.period);saveFile('EcoFinance-'+P.label.replace(/[^\w]+/g,'-')+'.csv',buildCSV(P.keys),'text/csv')}
});
app.addEventListener('change',async e=>{
  const b=e.target.dataset&&e.target.dataset.bind;
  if(b){const v=e.target.value;
    if(b==='month')UI.month=v;else if(b==='period')UI.period=v;else if(b==='txMonth')UI.txMonth=v;else if(b==='coMonth')UI.coMonth=v;
    else if(b==='bizname'){S.biz.name=v.trim()||'Usaha Saya';if(await opSaveBiz())toast('Nama usaha disimpan');return}
    else if(b==='bizsector'){S.biz.sector=v.trim()||'Usaha kecil';await opSaveBiz();return}
    render();return}
  if(e.target.name==='type'){const sel=document.getElementById('tcat');if(sel)sel.innerHTML=txFormCats(e.target.value)}
  if(e.target.name==='src')updatePrev();
});
function updatePrev(){const s=document.getElementById('csrc');if(!s)return;const f=F(s.value),q=parseFloat((document.getElementById('cqty').value||'0').replace(',','.'))||0;
  document.getElementById('cunit').textContent='('+f.unit+')';document.querySelector('#cprev span').textContent='Perkiraan emisi: '+nf(q*f.f,1)+' kg CO₂e'}
app.addEventListener('input',e=>{
  if(e.target.id==='tamt'){const d=e.target.value.replace(/\D/g,'');e.target.value=d?nf(+d):''}
  if(e.target.id==='cqty')updatePrev();
});
app.addEventListener('submit',async e=>{
  e.preventDefault();const f=e.target,k=f.dataset.form,fd=new FormData(f);
  if(S.busy)return;
  if(k==='login'){S.busy=true;try{await doEmail(UI.authMode,String(fd.get('email')||'').trim(),String(fd.get('password')||''),String(fd.get('name')||'').trim())}finally{S.busy=false}}
  else if(k==='tx'){const amt=+String(fd.get('amount')).replace(/\D/g,'');if(!amt){toast('Isi jumlah lebih dari nol');return}
    S.busy=true;const ok=await opAddTx({date:String(fd.get('date')),type:String(fd.get('type')),cat:String(fd.get('cat')),note:String(fd.get('note')||'').trim(),amount:amt});S.busy=false;
    if(ok){UI.txMonth=String(fd.get('date')).slice(0,7);render();toast('Transaksi disimpan')}}
  else if(k==='co2'){const q=parseFloat(String(fd.get('qty')).replace(',','.'));if(!(q>0)){toast('Isi jumlah lebih dari nol');return}
    S.busy=true;const ok=await opAddCo2({date:String(fd.get('date')),src:String(fd.get('src')),note:String(fd.get('note')||'').trim(),qty:q});S.busy=false;
    if(ok){UI.coMonth=String(fd.get('date')).slice(0,7);render();toast('Catatan emisi disimpan')}}
});
initAuth();
})();

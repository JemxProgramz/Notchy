/* Today view is built from local calendar and reminder data below. */
/* clipboard */
Object.assign(P,{pin:'<path d="M12 17v5M9 3h6l-1 6 3 3H7l3-3z"/>',txt:'<path d="M4 6h16M4 12h16M4 18h10"/>',lnk:'<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',cod:'<path d="m8 8-4 4 4 4M16 8l4 4-4 4"/>',img:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m4 17 5-5 4 4 3-3 4 4"/>',sr:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',gr:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>'});
const F=['All','Text','Images','Links'],CB={q:'',f:'All',sel:new Set(),cur:null,pc:0,nid:1,items:[]};
const ago=t=>t<1?'now':t<60?t+'m':t<1440?Math.floor(t/60)+'h':Math.floor(t/1440)+'d';
function chips(){$('#cbf').innerHTML=F.map(f=>`<button class="fc ${f==CB.f?'on':''}" data-f="${f}">${f}</button>`).join('')}
function cbPrev(a){const p=$('#cbp'),i=CB.items.find(i=>i.id==CB.cur),m=CB.sel.size>1;if(!i){p.innerHTML='<div class="pt" style="margin:auto;color:var(--mut)">Nothing selected</div>';return}
const d=new Date(Date.now()-i.t*60000),w=i.x.trim().split(/\s+/).length,l=i.x.split('\n').length,day=i.t<1440?'Today':i.t<2880?'Yesterday':d.toLocaleDateString([],{day:'numeric',month:'short'}),ty=i.k=='link'?'Link':i.k=='code'?'Code':i.k=='image'?'Image':'Text',sz=i.k=='image'?'2.1 MB • 1920×1080':`${i.x.length} characters • ${w} words • ${l} line${l>1?'s':''}`;
p.innerHTML=(i.k=='image'&&!m?'<div class="img"></div>':'')+'<div class="pt"></div><div class="pd"><b>Type</b><span>'+(m?'Multiple':ty)+'</span><b>Size</b><span>'+(m?CB.sel.size+' items':sz)+'</span><b>Copied</b><span>'+day+', '+d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})+'</span></div>';
p.querySelector('.pt').textContent=m?CB.sel.size+' items selected':i.x;if(a){p.classList.remove('sw');void p.offsetWidth;p.classList.add('sw')}}
function cbRender(stag){const q=CB.q.toLowerCase(),L=CB.items.filter(i=>(CB.f=='All'||(CB.f=='Text'?i.k=='text'||i.k=='code':CB.f=='Images'?i.k=='image':i.k=='link'))&&i.x.toLowerCase().includes(q)).sort((a,b)=>(b.pin||0)-(a.pin||0)||a.t-b.t);
CB.vis=L;if(!L.find(i=>i.id==CB.cur))CB.cur=L[0]?.id;$('#cbq').placeholder='Search '+CB.items.length+' items…';
let last,n=0;$('#cbl').innerHTML=L.map(i=>{const g=i.pin?'Pinned':i.t<1440?'Today':i.t<2880?'Yesterday':'Earlier',h=g!=last?`<h6>${g}</h6>`:'';last=g;return h+`<div class="cr ${i.id==CB.cur?'cur':''} ${CB.sel.has(i.id)?'sel':''} ${i.id==CB.fresh?'new':stag?'st':''}" style="--i:${n++}" data-id="${i.id}"><span class="ci">${ic(i.pin?'pin':{image:'img',link:'lnk',code:'cod'}[i.k]||'txt')}</span><span class="ct"></span><em>${ago(i.t)}</em></div>`}).join('')||'<p class="emp">No matches. Try another search or filter.</p>';
$$('#cbl .cr').forEach(r=>r.querySelector('.ct').textContent=CB.items.find(i=>i.id==r.dataset.id).x);CB.fresh=null;const ch=CB.pc!=CB.cur;CB.pc=CB.cur;cbPrev(ch||stag);$('#cbl .cur')?.scrollIntoView({block:'nearest'});fit()}
const cp=t=>{try{navigator.clipboard.writeText(t)}catch(_){}};
function cbDo(a){const ids=CB.sel.size>1?[...CB.sel]:[CB.cur],its=CB.items.filter(i=>ids.includes(i.id));if(!its.length)return;const tx=its.map(i=>i.x).join('\n');
if(a=='copy'){cp(tx);toast(its.length>1?'Copied '+its.length+' items':'Copied')}
if(a=='paste'){cp(tx);its.forEach(i=>i.t=0);CB.fresh=its[0].id;toast('Pasted');cbRender()}
if(a=='pin'){const v=!its[0].pin;its.forEach(i=>i.pin=v?1:0);CB.fresh=its[0].id;toast(v?'Pinned':'Unpinned');cbRender()}
if(a=='del'){const v=CB.vis.map(i=>i.id),k=v.indexOf(CB.cur),nx=v[k+1]??v[k-1];$$('#cbl .cr').forEach(r=>ids.includes(+r.dataset.id)&&r.classList.add('rm'));setTimeout(()=>{CB.items=CB.items.filter(i=>!ids.includes(i.id));CB.sel.clear();CB.cur=nx;cbRender()},240)}}
$('#cbsi').innerHTML=ic('sr');$('#cbg').innerHTML=ic('gr');chips();
$('#cbf').onclick=e=>{const f=e.target.dataset.f;if(f){CB.f=f;chips();cbRender(1)}};$('#cbq').oninput=e=>{CB.q=e.target.value;cbRender(1)};
$('#cbl').onclick=e=>{const r=e.target.closest('.cr');if(!r)return;const id=+r.dataset.id;if(e.ctrlKey||e.metaKey){CB.sel.add(CB.cur);CB.sel.has(id)?CB.sel.delete(id):CB.sel.add(id);CB.cur=id}else if(e.shiftKey){const v=CB.vis.map(i=>i.id),a=v.indexOf(CB.cur),b=v.indexOf(id);v.slice(Math.min(a,b),Math.max(a,b)+1).forEach(x=>CB.sel.add(x));CB.cur=id}else{CB.sel.clear();CB.cur=id}cbRender()};
$('#cbl').ondblclick=e=>{if(e.target.closest('.cr'))cbDo('paste')};
document.addEventListener('keydown',e=>{if(!isl.classList.contains('open')||!$('#v-clipboard').classList.contains('on'))return;const k=e.key,inp=e.target.id=='cbq',v=CB.vis.map(i=>i.id),ix=v.indexOf(CB.cur),mod=e.ctrlKey||e.metaKey;
if(k=='ArrowDown'||k=='ArrowUp'){e.preventDefault();const n=v[Math.max(0,Math.min(v.length-1,ix+(k=='ArrowDown'?1:-1)))];if(e.shiftKey){CB.sel.add(CB.cur);CB.sel.add(n)}else CB.sel.clear();CB.cur=n;cbRender()}
else if(k=='Enter'){e.preventDefault();cbDo('paste')}else if(mod&&k=='c'&&!getSelection().toString()){e.preventDefault();cbDo('copy')}else if(mod&&k=='p'){e.preventDefault();cbDo('pin')}
else if(k=='Delete'&&(!inp||!$('#cbq').value)){e.preventDefault();cbDo('del')}else if(k=='Tab'){e.preventDefault();CB.f=F[(F.indexOf(CB.f)+(e.shiftKey?3:1))%4];chips();cbRender(1)}});
cbRender();

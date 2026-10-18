/* Wallpaper tab */
{const V=$('#v-wallpaper');
Object.assign(P,{fold:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'});
const sv=b=>`center/cover url("data:image/svg+xml,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 90' preserveAspectRatio='xMidYMid slice'>"+b+'</svg>')}")`,G=(...c)=>"<defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'>"+c.map((x,i)=>`<stop offset='${i/(c.length-1)}' stop-color='${x}'/>`).join('')+"</linearGradient></defs><rect width='160' height='90' fill='url(#g)'/>";
const WP=[{n:'Dusk',a:'#f08a5d',b:sv(G('#1d2b53','#7e4a8b','#f08a5d')+`<circle cx='80' cy='58' r='13' fill='#ffd9a0'/><path d='M0 66Q30 52 60 64T120 60T160 66V90H0Z' fill='#2a1a3a'/>`)},
{n:'Forest',a:'#8fc79a',b:sv(G('#2d4a3e','#6f9a78','#d3dba5')+`<path d='M0 90V58l8-14 8 14 8-18 9 18 8-12 8 12 9-20 9 20 8-14 8 14 9-16 9 16 8-12 8 12 9-18 9 18V90Z' fill='#1d3a2f'/><path d='M0 90V72l10-12 10 12 12-16 12 16 11-12 11 12 12-14 12 14 11-12 12 12 12-14 12 14V90Z' fill='#12281f'/>`)},
{n:'Golden terraces',a:'#d9b568',b:sv(G('#6f8fc0','#e3c98c','#c9a258')+`<circle cx='118' cy='30' r='20' fill='#fff6d6' opacity='.45'/><path d='M0 58Q40 50 80 56T160 46V90H0Z' fill='#d9b568'/><path d='M0 68Q45 58 90 66T160 56' fill='none' stroke='#6b5326' stroke-width='.7'/><path d='M0 74Q50 64 100 72T160 63' fill='none' stroke='#6b5326' stroke-width='.8'/><path d='M0 80Q52 70 105 78T160 70' fill='none' stroke='#5a4520' stroke-width='.9'/><path d='M0 86Q55 76 110 84T160 77' fill='none' stroke='#5a4520' stroke-width='1'/><path d='M0 70Q45 60 90 68T160 58V74Q100 76 0 76Z' fill='#fff6d6' opacity='.16'/><path d='M128 46v-8M123 38c0-6 11-6 11 0' stroke='#3a2d14' fill='#3a2d14' stroke-width='1.4'/>`)},
{n:'Misty lake',a:'#6cb4ee',b:sv(G('#6f98c9','#a9c4de','#dbe7f0')+`<path d='M0 52L20 34 32 42 56 18 80 44 98 30 122 46 142 26 160 40V64H0Z' fill='#8fb0d2'/><path d='M0 58L18 46 40 56 66 36 92 56 114 44 140 58 160 48V66H0Z' fill='#6a92bd'/><rect y='62' width='160' height='28' fill='#5b88b8'/><rect y='62' width='160' height='9' fill='#9bbad6' opacity='.55'/><path d='M0 76h160M0 82h160' stroke='#8fb3d3' stroke-width='.5' opacity='.6'/>`)},
{n:'Midnight',a:'#8aa8ff',b:sv(G('#080c1a','#141c3a','#1d2b53')+`<g fill='#fff' opacity='.8'><circle cx='12' cy='10' r='.6'/><circle cx='40' cy='22' r='.5'/><circle cx='70' cy='8' r='.7'/><circle cx='102' cy='18' r='.5'/><circle cx='134' cy='9' r='.6'/><circle cx='150' cy='28' r='.5'/><circle cx='26' cy='38' r='.4'/><circle cx='88' cy='32' r='.4'/></g><ellipse cx='90' cy='56' rx='70' ry='14' fill='#4cc9a0' opacity='.2'/><ellipse cx='100' cy='52' rx='45' ry='8' fill='#7aa2ff' opacity='.25'/><circle cx='130' cy='20' r='7' fill='#e9eefc'/><path d='M0 72Q40 62 80 70T160 66V90H0Z' fill='#050812'/>`)},
{n:'Dunes',a:'#e0a85a',b:sv(G('#f6dca4','#eab46c','#c98a46')+`<circle cx='122' cy='22' r='10' fill='#fff4d6' opacity='.7'/><path d='M0 60Q40 44 80 58T160 50V90H0Z' fill='#dca05a'/><path d='M0 74Q50 56 100 72T160 64V90H0Z' fill='#c4813f'/>`)}];
WP.forEach((wallpaper,index)=>wallpaper.id=`built:${index}`);
$('.screen svg.t').style.display='none';
const USER_KEY='notch.userWallpapers',SELECTED_KEY='notch.selectedWallpaper';
const fromStored=()=>{try{const items=JSON.parse(localStorage.getItem(USER_KEY)||'[]');return Array.isArray(items)?items.filter(x=>x&&typeof x.dataUrl=='string').slice(-8).map((x,index)=>({id:x.id||`imported-${index}`,n:x.name||'Imported wallpaper',a:/^#[0-9a-f]{6}$/i.test(x.accent||'')?x.accent:'#c9a85c',dataUrl:x.dataUrl,b:`center/cover url("${x.dataUrl}")` })):[]}catch(error){console.error('Could not load imported wallpapers',error);return[]}};
let UP=fromStored(),tm='Recent',ci=0;
const selected=localStorage.getItem(SELECTED_KEY);
const selectedIndex=UP.findIndex(w=>`user:${w.id}`===selected);
if(selectedIndex>=0)ci=selectedIndex;
else if(UP.length)localStorage.setItem(SELECTED_KEY,`user:${UP[0].id}`);
else localStorage.removeItem(SELECTED_KEY);
const cur=()=>UP;
const selectionKey=w=>w.id.startsWith('built:')?w.id:`user:${w.id}`;
const accentFromImage=async dataUrl=>{const image=new Image();image.src=dataUrl;await image.decode();const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw new Error('Could not sample wallpaper color');context.fillStyle='#171717';context.fillRect(0,0,1,1);context.drawImage(image,0,0,1,1);const pixel=context.getImageData(0,0,1,1).data;return'#'+[0,1,2].map(i=>Math.round(pixel[i]+(255-pixel[i])*.45).toString(16).padStart(2,'0')).join('')};
const saveUsers=()=>localStorage.setItem(USER_KEY,JSON.stringify(UP.map(({id,n,a,dataUrl})=>({id,name:n,accent:a,dataUrl}))));
if(UP.some(w=>w.id.startsWith('imported-')))saveUsers();
const selectWallpaper=(index)=>{const L=cur();if(!L[index])return;ci=index;wr();localStorage.setItem(SELECTED_KEY,selectionKey(L[ci]))};
const addUserWallpaper=async image=>{if(!image||typeof image.dataUrl!='string'||!image.dataUrl.startsWith('data:image/'))throw new Error('The selected file is not a supported image');const accent=await accentFromImage(image.dataUrl);UP.push({id:image.id||crypto.randomUUID(),n:(image.name||'Imported wallpaper').replace(/\.[^.]+$/,''),a:accent,dataUrl:image.dataUrl,b:`center/cover url("${image.dataUrl}")`});UP=UP.slice(-8);saveUsers();tm='My folder';$$('.wc').forEach(b=>b.classList.toggle('is',b.dataset.t==tm));selectWallpaper(UP.length-1);return true};
window.notchWallpaperUI={add:addUserWallpaper,builtIns:WP.map(({n,a,b})=>({name:n,accent:a,css:b}))};
UP.forEach(async wallpaper=>{if(wallpaper.a==='#c9a85c'){try{wallpaper.a=await accentFromImage(wallpaper.dataUrl);saveUsers()}catch(error){console.error(`Could not sample color for wallpaper "${wallpaper.n}"`,error)}}});
V.innerHTML=`<div class="wb"><div class="wch"><button class="wc is" data-t="Recent">Recent</button><button class="wc" data-t="My folder">My folder</button><span id="wn"></span></div><button class="wfb" id="wfb" aria-label="Add pictures">${ic('fold')}</button></div><div class="wr" id="wr"></div>`;
$$('.wc').forEach(button=>button.classList.toggle('is',button.dataset.t==tm));
const wr=rb=>{const L=cur(),R=$('#wr');$('#wn').textContent=L.length+' pictures';if(!L.length){R.innerHTML='<p class="wemp">No pictures yet. Use the folder button to add some.</p>';return}
if(rb||R.children.length!=L.length||!R.querySelector('.wi')){R.innerHTML=L.map((w,i)=>`<button class="wi" data-i="${i}"><i></i><b></b></button>`).join('');$$('#wr .wi').forEach((e,i)=>{e.querySelector('i').style.background=L[i].b;e.querySelector('b').textContent=L[i].n;e.setAttribute('aria-label',L[i].n)});void R.offsetWidth}
$$('#wr .wi').forEach((e,i)=>{e.className='wi d'+Math.min(3,Math.abs(i-ci))})};
const step=d=>{const L=cur(),n=Math.max(0,Math.min(L.length-1,ci+d));if(!L.length||n==ci)return;selectWallpaper(n)};
$('#wr').onclick=e=>{const b=e.target.closest('.wi');if(b)selectWallpaper(+b.dataset.i)};
$('#wr').addEventListener('wheel',e=>{e.preventDefault();step(Math.sign(e.deltaY||e.deltaX))},{passive:false});
$('.wch').onclick=e=>{const t=e.target.dataset.t;if(!t||t==tm)return;tm=t;$$('.wc').forEach(b=>b.classList.toggle('is',b.dataset.t==t));const L=cur(),selectedIndex=L.findIndex(w=>selectionKey(w)===localStorage.getItem(SELECTED_KEY));ci=selectedIndex>=0?selectedIndex:0;wr(1);if(cur()[ci])localStorage.setItem(SELECTED_KEY,selectionKey(cur()[ci]))};
addEventListener('keydown',e=>{if(!isl.classList.contains('open')||!$('#v-wallpaper').classList.contains('on'))return;if(e.key=='ArrowRight'){e.preventDefault();step(1)}else if(e.key=='ArrowLeft'){e.preventDefault();step(-1)}});
$('#nav').addEventListener('click',e=>{if(e.target.dataset.t=='Wallpaper'){$$('#wr .wi').forEach(x=>x.className='wi');void $('#wr').offsetWidth;wr()}});
wr()}

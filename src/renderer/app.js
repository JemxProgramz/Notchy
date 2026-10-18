const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const P={wifi:'<path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 20h.01M2 9a15 15 0 0 1 20 0"/>',bt:'<path d="m7 7 10 10-5 5V2l5 5L7 17"/>',vol:'<path d="M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7"/>',moon:'<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',dark:'<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/>',lock:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',rs:'<path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5"/>',pw:'<path d="M12 2v10M18.4 6.6a9 9 0 1 1-12.8 0"/>',ch:'<path d="m6 9 6 6 6-6"/>',pv:'<path d="M19 5v14L8 12zM5 5v14"/>',nx:'<path d="M5 5v14l11-7zM19 5v14"/>',pl:'<path d="M7 4v16l13-8z" fill="currentColor"/>',pa:'<path d="M8 5v14M16 5v14"/>'};
const ic=n=>`<svg class="i" viewBox="0 0 24 24">${P[n]}</svg>`;
const S={wifi:1,wn:0,bt:0,au:0,night:0,dark:1,play:0,pos:0};
const WN=['Home 5G','Home 2.4G','Office'],AU=['Speakers','Headphones','HDMI'],NL=['Off','Warm','Warmer'];
const isl=$('#isl'),T=['Controls','Today','Stats','Clipboard','Apps','Wallpaper','Power','Settings'];
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('on');clearTimeout(toast.k);toast.k=setTimeout(()=>t.classList.remove('on'),1800)}
/* JavaScript-driven motion (Web Animations API) must honor the same reduced-motion
   preferences and animation settings as the CSS transitions. */
const anim=(el,frames,opts)=>{if(document.body.classList.contains('no-motion')||matchMedia('(prefers-reduced-motion:reduce)').matches)return null;return el.animate(frames,opts)};
let windowSceneKey='',geometryPaused=false;
function fit(){
 if(geometryPaused)return;
 const mode=isl.classList.contains('open')?'expanded':isl.classList.contains('peek')?'peek':isl.classList.contains('playing')?'playing':'idle';
 const height=Math.ceil(mode==='expanded'?$('#in').getBoundingClientRect().height:isl.getBoundingClientRect().height);
 const wide=isl.classList.contains('wide');
 if(mode==='expanded')isl.style.setProperty('--h',height+'px');
 const key=[mode,height,wide].join(':');if(key===windowSceneKey)return;windowSceneKey=key;
 window.notch?.setScene?.({mode,height,wide})?.catch?.(()=>{if(windowSceneKey===key)windowSceneKey=''});
}
function tab(n){$$('#nav button').forEach(b=>b.classList.toggle('on',b.dataset.t==n));$$('.v').forEach(v=>v.classList.toggle('on',v.id=='v-'+n.toLowerCase()));isl.classList.toggle('wide',n=='Clipboard'||n=='Today'||n=='Stats'||n=='Wallpaper'||n=='Settings');mclose();rise();if(n=='Clipboard')cbRender(1);fit();setTimeout(fit,380)}
$('#nav').innerHTML=T.map((t,i)=>`<button data-t="${t}" class="${i?'':'on'}">${t}</button>`).join('');
$('#nav').onclick=e=>{if(e.target.dataset.t)tab(e.target.dataset.t)};
let ct;const expand=()=>{
 clearTimeout(ct);if(isl.classList.contains('open')){fit();return}
 geometryPaused=true;isl.classList.remove('peek');
 const request=window.notch?.setScene?.({mode:'expanded',height:520,wide:isl.classList.contains('wide')});
 const reveal=()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{isl.classList.add('open');rise();geometryPaused=false;fit()}));
 if(request?.then)request.then(reveal,reveal);else{isl.classList.add('open');rise();geometryPaused=false;fit()}
},show=()=>{clearTimeout(ct);if(isl.classList.contains('open'))return;if(S.play){isl.classList.add('peek');fit()}else expand()},shut=()=>{ct=setTimeout(()=>{const ddOpen=$('#dd').classList.contains('on'),wirelessPanelOpen=document.getElementById('wireless-popover')?.classList.contains('on');if(ddOpen||wirelessPanelOpen||document.querySelector('.vol.dr'))return;const focused=document.activeElement;if(focused&&isl.contains(focused)&&focused.tagName=='INPUT'&&focused.type!='range')return;isl.classList.remove('open','peek');mclose();fit()},350)};
window.notch?.onOpen?.(action=>{geometryPaused=true;const target=T.find(name=>name.toLowerCase()===String(action).toLowerCase());if(target)tab(target);geometryPaused=false;expand()});
window.notch?.onToggle?.(()=>{if(isl.classList.contains('open')||isl.classList.contains('peek')){clearTimeout(ct);isl.classList.remove('open','peek');mclose();fit()}else expand()});
new ResizeObserver(fit).observe($('#in'));
isl.onmouseenter=show;isl.onmouseleave=shut;isl.onclick=e=>{if(e.target.closest('.media-seek'))return;isl.classList.contains('peek')&&!e.target.closest('.ctl button')?expand():show()};isl.onfocusin=e=>{if(!e.target.closest('.media-seek'))expand()};isl.onwheel=e=>{if(e.deltaY>0&&isl.classList.contains('peek'))expand()};
document.addEventListener('keydown',e=>{if(e.key=='ArrowDown'&&isl.classList.contains('peek'))expand()});
/* controls */
function tiles(){const t=(k,i,a,b,on,cs,sp)=>`<div style="grid-column:span ${sp}"><div class="tg ${on?'on':''}" data-k="${k}" role="button" tabindex="0"><span class="ic">${ic(i)}</span><span class="tx">${a}<small>${b}</small></span>${cs?`<span class="ch" data-c="${k}">${ic('ch')}</span>`:''}</div></div>`;
$('#tiles').innerHTML=t('wifi','wifi','Wi-Fi',S.wifi?(navigator.onLine?WN[S.wn]:'Offline'):'Off',S.wifi,1,3)+t('bt','bt','Bluetooth',S.bt?(BTN||'On'):'Off',S.bt,1,3)+t('night','moon','Night Light',NL[S.night],S.night,1,3)+t('dark','dark','Notch theme',S.dark?'On':'Off',S.dark,0,3);
$('#spk').innerHTML=ic('vol').replace('class="i"','class="i" style="width:12px;height:12px"')+' '+(AUN||AU[S.au]);
$('#night').style.opacity=[0,.16,.3][S.night];isl.classList.toggle('light',!S.dark);$$('#tiles .tg').forEach(e=>e.dataset.k==LK&&e.classList.add('pop'));LK=null;fit()}
$('#tiles').onclick=e=>{const c=e.target.closest('[data-c]'),k=(c||e.target.closest('[data-k]'))?.dataset;if(!k)return;
if(c){const x=c.dataset.c;return menu(x,c);if(x=='night')S.night=(S.night+1)%3}
else{const x=k.k;LK=x;if(x=='bt')return btc();if(x=='night')S.night=S.night?0:1;else if(x!='au')S[x]=S[x]?0:1}tiles()};
$('#tiles').onkeydown=e=>{if((e.key=='Enter'||e.key==' ')&&e.target.tagName!='BUTTON'){e.preventDefault();e.target.click()}};
const vol=$('#vol'),vs=()=>{const v=vol.value;vol.style.setProperty('--p',v+'%');$('#vp').textContent=v+'%'};vol.oninput=vs;$('#vic').innerHTML=ic('vol');
$('#prev').innerHTML=$('#pkprev').innerHTML=ic('pv');$('#next').innerHTML=$('#pknext').innerHTML=ic('nx');$('#pkx').innerHTML=ic('ch');$('#pkx').onclick=e=>{e.stopPropagation();expand()};
$('#pkpp').onclick=toggle;$('#pkprev').onclick=()=>skip(-1);$('#pknext').onclick=()=>skip(1);
const mm=s=>Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
function pl(){const w=(S.pos/3735*100)+'%',i=ic(S.play?'pa':'pl'),wasPlaying=isl.classList.contains('playing');$('#pp').innerHTML=i;$('#pkpp').innerHTML=i;$('#ps').textContent=$('#pkt').textContent=mm(S.pos);$('#pd').textContent=$('#pkd').textContent=mm(3735);$('#pb').style.width=$('#pkb').style.width=w;$('#eq').classList.toggle('on',!!S.play);isl.classList.toggle('playing',!!S.play);if(wasPlaying!==!!S.play)fit()}
$('#pp').onclick=toggle;$('#prev').onclick=()=>skip(-1);$('#next').onclick=()=>skip(1);
setInterval(()=>{if(S.play&&!window.__notchExternalMedia?.active){S.pos++;pl()}},1000);
/* real synthesized lofi (Web Audio) */
const ST=[{n:'lofi beats to study and relax',a:'lofi radio',bpm:72,ch:[[53,57,60,64],[52,55,59,62],[50,53,57,60],[48,52,55,59]]},{n:'rainy night keys',a:'midnight radio',bpm:64,ch:[[57,60,64,67],[53,57,60,64],[55,59,62,65],[52,55,59,62]]},{n:'sunset drive',a:'golden hour fm',bpm:80,ch:[[50,53,57,60],[55,58,62,65],[48,52,55,59],[53,57,60,64]]}],GR=['linear-gradient(135deg,#8a5a9a,#3d2a4f)','linear-gradient(135deg,#3a6ea5,#1b2a41)','linear-gradient(135deg,#e09f3e,#9e2a2b)'];
let ac,mg,an,nb,si=0,nt=0,sd=0,tm,lv=0,LK=null,AUN=null,BTN=null,OUT=0;
const hz=m=>440*2**((m-69)/12),setVol=()=>{if(mg)mg.gain.setTargetAtTime((vol.value/100)**1.6*.9,ac.currentTime,.03)};vol.addEventListener('input',setVol);
function init(){if(ac)return;ac=new(window.AudioContext||window.webkitAudioContext)();nb=ac.createBuffer(1,ac.sampleRate,ac.sampleRate);const d=nb.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;mg=ac.createGain();an=ac.createAnalyser();an.fftSize=128;mg.connect(an);an.connect(ac.destination);setVol();const r=ac.createBufferSource(),f=ac.createBiquadFilter(),g=ac.createGain();r.buffer=nb;r.loop=true;f.type='highpass';f.frequency.value=3000;g.gain.value=.012;r.connect(f);f.connect(g);g.connect(mg);r.start()}
function note(m,t,len,type,g,fc){const o=ac.createOscillator(),f=ac.createBiquadFilter(),e=ac.createGain();o.type=type;o.frequency.value=hz(m);f.type='lowpass';f.frequency.value=fc;e.gain.setValueAtTime(0,t);e.gain.linearRampToValueAtTime(g,t+.02);e.gain.exponentialRampToValueAtTime(.0001,t+len);o.connect(f);f.connect(e);e.connect(mg);o.start(t);o.stop(t+len+.05)}
function drum(k,t){if(k=='k'){const o=ac.createOscillator(),e=ac.createGain();o.frequency.setValueAtTime(130,t);o.frequency.exponentialRampToValueAtTime(42,t+.12);e.gain.setValueAtTime(.8,t);e.gain.exponentialRampToValueAtTime(.001,t+.25);o.connect(e);e.connect(mg);o.start(t);o.stop(t+.3)}else{const s=ac.createBufferSource(),f=ac.createBiquadFilter(),e=ac.createGain(),sn=k=='s';s.buffer=nb;f.type=sn?'bandpass':'highpass';f.frequency.value=sn?1800:7000;e.gain.setValueAtTime(sn?.35:.1,t);e.gain.exponentialRampToValueAtTime(.001,t+(sn?.16:.04));s.connect(f);f.connect(e);e.connect(mg);s.start(t);s.stop(t+.2)}}
function sched(){const s=ST[si],q=60/s.bpm/4;while(nt<ac.currentTime+.25){const st=sd%16,c=s.ch[Math.floor(sd/16)%4],t=nt+(st%4==2?q*.28:0);if(st==0){c.forEach((m,i)=>note(m,t+i*.012,q*14,'triangle',.07,1400));note(c[0]-24,t,q*7,'sine',.45,400)}if(st==6)c.slice(1).forEach(m=>note(m,t,q*4,'triangle',.045,1200));if(st==8)note(c[0]-24,t,q*5,'sine',.35,400);if(st==0||st==10)drum('k',t);if(st==4||st==12)drum('s',t);if(st%2==0)drum('h',t);if(st%2==0&&Math.random()<.22)note(c[Math.floor(Math.random()*4)]+12*(1+(Math.random()<.5?1:0)),t,q*3,'sine',.05,2200);nt+=q;sd++}}
function toggle(){S.play^=1;if(S.play){init();ac.resume();nt=ac.currentTime+.06;clearInterval(tm);tm=setInterval(sched,60);try{const m=navigator.mediaSession;m.metadata=new MediaMetadata({title:ST[si].n,artist:ST[si].a});m.setActionHandler('play',toggle);m.setActionHandler('pause',toggle);m.setActionHandler('nexttrack',()=>skip(1));m.setActionHandler('previoustrack',()=>skip(-1))}catch(_){}}else{clearInterval(tm);ac&&ac.suspend()}pl()}
function skip(d){if(d<0&&S.pos>4)S.pos=0;else{si=(si+d+ST.length)%ST.length;S.pos=0;$$('.mt h4').forEach(e=>e.textContent=ST[si].n);$$('.mt p').forEach(e=>e.textContent=ST[si].a);$$('.art,.ca').forEach(e=>e.style.background=GR[si]);toast(ST[si].n)}sd=0;if(ac)nt=ac.currentTime+.05;pl()}
async function cycleOut(){try{const d=(await navigator.mediaDevices.enumerateDevices()).filter(x=>x.kind=='audiooutput');if(d.length>1&&ac&&ac.setSinkId){OUT=(OUT+1)%d.length;await ac.setSinkId(d[OUT].deviceId);AUN=d[OUT].label||'Output '+(OUT+1)}else throw 0}catch(_){S.au=(S.au+1)%3;AUN=null;toast('Real output switching needs Chrome with music playing')}tiles()}
async function btc(){if(S.bt){S.bt=0;BTN=null;return tiles()}try{const d=await navigator.bluetooth.requestDevice({acceptAllDevices:true});S.bt=1;BTN=d.name||'Device';toast('Selected '+BTN)}catch(e){if(!e||e.name!='NotFoundError')toast('Bluetooth needs Chrome or Edge over HTTPS')}tiles()}
const netl=()=>{const c=navigator.connection;return c?(c.effectiveType||'online').toUpperCase()+' • '+c.downlink+' Mbps':'Online'};
function clearWave(){const c=$('#vz'),x=c?.getContext('2d');if(x)x.clearRect(0,0,c.width,c.height)}
function drawWave(levels){const c=$('#vz'),x=c?.getContext('2d');if(!x||!levels?.length)return;const w=c.width,h=c.height,n=26;x.clearRect(0,0,w,h);x.fillStyle='#c9a85c';for(let i=0;i<n;i++){const level=Math.max(0,Math.min(1,Number(levels[Math.floor(i*levels.length/n)])||0));const bh=Math.max(1,level*h);x.fillRect(i*(w/n)+1,h-bh,w/n-3,bh)}}
function setExternalEq(levels,bars){let peak=0;bars.forEach((bar,i)=>{const at=Math.round(i*(levels.length-1)/(bars.length-1));const level=Math.max(0,Math.min(1,Number(levels[at])||0));peak=Math.max(peak,level);bar.style.height=(3+level*9).toFixed(1)+'px'});lv=peak;isl.style.setProperty('--b',peak.toFixed(3))}
function vzf(){requestAnimationFrame(vzf);const u=$$('#eq u'),ext=window.__notchExternalMedia;if(ext?.active){if(!ext.playing){u.forEach(e=>e.style.height='3px');lv*=.7;isl.style.setProperty('--b',lv.toFixed(3));clearWave();return}const levels=window.__notchExternalAudioLevels;if(Array.isArray(levels)&&levels.length){setExternalEq(levels,u);drawWave(levels)}else{u.forEach(e=>e.style.height='3px');lv=0;isl.style.setProperty('--b','0');clearWave()}return}if(!an||!S.play){u.forEach(e=>e.style.height='3px');if(lv>.01){lv*=.85;isl.style.setProperty('--b',lv.toFixed(3))}clearWave();return}const d=new Uint8Array(an.frequencyBinCount);an.getByteFrequencyData(d);lv=(d[1]+d[2]+d[3])/765;isl.style.setProperty('--b',lv.toFixed(3));u.forEach((e,i)=>e.style.height=Math.max(2,Math.min(12,d[i*3+1]/255*15*(.3+.7*i/(u.length-1))))+'px');drawWave(Array.from({length:26},(_,i)=>d[i+1]/255))}
function rise(){const v=$('.v.on');v.classList.remove('rise');void v.offsetWidth;v.classList.add('rise')}
vzf();

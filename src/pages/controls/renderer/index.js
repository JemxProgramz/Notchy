Object.assign(P,{sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'});
$('#bic').innerHTML=ic('sun');
let MI=[];
function mclose(){$('#dd').classList.remove('on');$$('.ch.open').forEach(x=>x.classList.remove('open'))}
async function menu(k,c){const d=$('#dd');if(d.classList.contains('on')&&d.dataset.k==k)return mclose();let it=[],ft='';
if(k=='wifi'){it=WN.map((n,i)=>({t:n,s:S.wifi&&S.wn==i,f:()=>{S.wn=i;S.wifi=1;toast('Joined '+n)}}));ft=navigator.onLine?'Connection: '+netl():'No internet connection'}
else if(k=='night')it=NL.map((n,i)=>({t:n,s:S.night==i,f:()=>{S.night=i}}));
else if(k=='bt'){if(BTN)it.push({t:BTN,s:1,f:()=>{}},{t:'Turn off',f:()=>{S.bt=0;BTN=null}});it.push({t:'Pair new device…',f:()=>{S.bt=0;btc()}});ft='Pairing needs Chrome or Edge'}
else if(k=='au'){let L=AU.map(n=>({label:n}));try{const v=(await navigator.mediaDevices.enumerateDevices()).filter(x=>x.kind=='audiooutput'&&x.label);if(v.length)L=v}catch(_){}it=L.map(o=>({t:o.label,s:(AUN||AU[S.au])==o.label,f:async()=>{try{if(ac&&ac.setSinkId&&o.deviceId)await ac.setSinkId(o.deviceId)}catch(_){}AUN=o.label;toast('Output: '+o.label)}}))}
MI=it.map(x=>x.f);d.dataset.k=k;d.innerHTML=it.map((x,i)=>`<button role="menuitem" data-i="${i}"><i>${x.s?'✓':''}</i><span></span></button>`).join('')+(ft?'<p></p>':'');
$$('#dd button span').forEach((s,i)=>s.textContent=it[i].t);if(ft)d.querySelector('p').textContent=ft;
const r=c.closest('.tg').getBoundingClientRect(),p=$('#in').getBoundingClientRect();d.style.left=(r.left-p.left)+'px';d.style.top=(r.bottom-p.top+6)+'px';d.style.minWidth=Math.max(210,r.width)+'px';
mclose();void d.offsetWidth;c.classList.add('open');d.classList.add('on')}
$('#dd').onclick=e=>{const b=e.target.closest('button');if(!b)return;const f=MI[b.dataset.i];LK=$('#dd').dataset.k;mclose();Promise.resolve(f&&f()).then(()=>tiles())};
document.addEventListener('click',e=>{if(!e.target.closest('#dd,.ch'))mclose()});addEventListener('keydown',e=>{if(e.key=='Escape')mclose()});
$$('.vol').forEach(p=>{const i=p.querySelector('input'),f=()=>{const v=+i.value;p.style.setProperty('--p',v+'%');p.classList.toggle('g1',v>8);p.classList.toggle('g2',v>90)},set=v=>{if(i.disabled)return;i.value=Math.max(0,Math.min(100,Math.round(v)));i.dispatchEvent(new Event('input'))},fx=e=>{const r=p.getBoundingClientRect();set((e.clientX-r.left)/r.width*100)};i.addEventListener('input',f);f();
p.addEventListener('pointerdown',e=>{if(i.disabled)return;p.setPointerCapture(e.pointerId);p.classList.add('dr');fx(e)});p.addEventListener('pointermove',e=>{if(p.classList.contains('dr')&&!i.disabled)fx(e)});['pointerup','pointercancel'].forEach(t=>p.addEventListener(t,()=>p.classList.remove('dr')));p.addEventListener('wheel',e=>{if(i.disabled)return;e.preventDefault();set(+i.value-Math.sign(e.deltaY)*3)},{passive:false})});
$$('.vol input').forEach(i=>i.addEventListener('wheel',e=>{if(i.disabled)return;e.preventDefault();i.value=+i.value-Math.sign(e.deltaY)*3;i.dispatchEvent(new Event('input'))},{passive:false}));

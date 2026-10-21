(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const stage = $('fireStage'), canvas = $('dragonCanvas'), scene = $('dragonExperience');
  const display = $('dragonDisplay'), art = $('dragonArt'), entrance = $('enterGame'), guide = $('playInstructions');
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) {
    $('canvasFallback').hidden = false;
    ['startGame', 'pauseGame'].forEach(id => $(id).disabled = true);
    entrance.disabled = true;
    entrance.textContent = '当前浏览器不支持小游戏';
    return;
  }
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  let calm = motionQuery.matches, visible = true, raf = 0, previous = 0, clock = 0;
  let width = 1, height = 1, dpr = 1, mobile = false, pointerDown = false, lastPointer = -10;
  let head = {x: 0, y: 0}, target = {x: 0, y: 0}, trail = [], sparks = [];
  let state = 'idle', timeLeft = 60, count = 0;
  let seed = null, seedBursts = [], flash = 0, pulse = 0, toastTimer = 0;
  const dance = window.PuzhaiDance;
  let chooseDance = dance.createBag(), mission = null, nextMissionAt = dance.seedInterval(), completedDances = 0;
  const textures = {};
  for (const name of ['scales','head','tail']) {
    const img = new Image(); textures[name] = img;
    img.onload = () => {render();schedule()};
    img.src = name==='head'?'assets/dragon-head-v3.png':'assets/dragon-' + name + '.svg';
  }
  let heading = -.15;
  let controlPointer = null;
  const keys = new Set();
  const rand = (a,b) => a + Math.random() * (b-a);
  const clamp = (v,a,b) => Math.max(a, Math.min(b,v));
  const palette = ['#ff5423','#ff742b','#ff9e3d','#ffca72','#ffe4ac'];
  const seedDust = Array.from({length:96},()=>({u:Math.random(),lane:rand(-1,1),phase:rand(0,Math.PI*2),speed:rand(.25,.6),size:rand(.55,1.2)}));

  // A sprite atlas avoids thousands of expensive shadowBlur calls per frame.
  const atlas = document.createElement('canvas'); atlas.width = 320; atlas.height = 64;
  const ac = atlas.getContext('2d');
  palette.forEach((color,i) => {
    const g = ac.createRadialGradient(i*64+32,32,0,i*64+32,32,30);
    g.addColorStop(0,'#fff1cd'); g.addColorStop(.12,color); g.addColorStop(.3,color+'aa'); g.addColorStop(1,color+'00');
    ac.fillStyle=g; ac.fillRect(i*64,0,64,64);
  });
  function glow(x,y,size,color=2,alpha=1) {
    ctx.globalAlpha=alpha;
    ctx.drawImage(atlas,color*64,0,64,64,x-size,y-size,size*2,size*2);
  }
  function initializeTrail() {
    trail=[];
    for(let i=0;i<150;i++) trail.push({x:width*(.82-i/149*.7),y:height*(.53+Math.sin(i*.054)*.14)});
    head={...trail[0]}; target={...head};
    heading=Math.atan2(trail[0].y-trail[3].y,trail[0].x-trail[3].x);
  }
  function resize() {
    const rect=stage.getBoundingClientRect();
    if(!rect.width||!rect.height)return;
    const oldW=width,oldH=height;
    width=Math.max(1,rect.width); height=Math.max(1,rect.height); mobile=width<650;
    dpr=Math.min(devicePixelRatio || 1,mobile?1.5:2);
    canvas.width=Math.round(width*dpr); canvas.height=Math.round(height*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    if(trail.length) {
      trail.forEach(p=>{p.x*=width/oldW;p.y*=height/oldH});
      head.x*=width/oldW;head.y*=height/oldH;target.x*=width/oldW;target.y*=height/oldH;
      if(seed){
        const pad=mobile?38:65;
        seed.x=clamp(seed.x*width/oldW,pad,width-pad);
        seed.y=clamp(seed.y*height/oldH,65,Math.max(66,height-60));
        positionSeed();
      }
      seedBursts.forEach(p=>{p.x*=width/oldW;p.y*=height/oldH});
      if(mission){
        mission.trace.resize(width/oldW,height/oldH);
        mission.trace.tolerance=dance.toleranceFor(width,height);
        mission.input=[];
        if(mission.phase==='celebrate')mission.fireworks=window.PuzhaiFireworks.create(width,height,mobile);
      }
    } else initializeTrail();
    if(state==='playing')controlHint();
    render();
  }
  function point(u) {
    const index=clamp(u,0,.999)* (trail.length-1), i=Math.floor(index), f=index-i;
    const a=trail[Math.max(0,i-1)],p=trail[i],q=trail[Math.min(i+1,trail.length-1)],b=trail[Math.min(trail.length-1,i+2)];
    const curve=(v0,v1,v2,v3)=>.5*((2*v1)+(-v0+v2)*f+(2*v0-5*v1+4*v2-v3)*f*f+(-v0+3*v1-3*v2+v3)*f*f*f);
    const angle=Math.atan2(a.y-b.y,a.x-b.x);
    return {x:curve(a.x,p.x,q.x,b.x),y:curve(a.y,p.y,q.y,b.y),angle};
  }
  function toast(message) {
    $('gameToast').textContent=message; $('gameToast').classList.add('show');
    clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('gameToast').classList.remove('show'),2200);
  }
  function controlHint(kind=mobile?'touch':'mouse') {
    const hint=mission?'沿宽光带顺势舞动 · 轻微偏离也可识别':kind==='touch'?'单指引龙 · 下滑静观玩法':'移动引龙 · 空格或 P 暂停';
    if($('stageInstruction').textContent!==hint)$('stageInstruction').textContent=hint;
  }
  function resetPointers() {
    controlPointer=null;pointerDown=false;
    if(mission){mission.input=[];mission.trace.suspend()}
  }
  function paintTimer() {
    $('gameTime').textContent=Math.ceil(timeLeft).toString().padStart(2,'0');
    $('gameTimeRing').style.setProperty('--time-left',String(clamp(timeLeft/60,0,1)));
  }
  function hud() {
    paintTimer();$('caughtSeeds').textContent=count;$('completedDances').textContent=completedDances;
    $('pauseGame').disabled=state==='idle'||state==='ended';
    $('pauseGame').textContent=state==='paused'?'继续舞龙':'暂停舞龙';
    $('startGame').textContent=state==='ended'?'再舞一回 ↻':'重新起舞 ↻';
    scene.dataset.state=state;
  }
  function positionSeed() {
    $('fireSeed').hidden=!seed;
    if(seed){$('fireSeed').style.left=seed.x+'px';$('fireSeed').style.top=seed.y+'px'}
  }
  function placeSeed() {
    const pad=mobile?38:65;
    const body=Array.from({length:25},(_,i)=>({...bodyPoint(i/24),radius:bodyRadius(i/24)}));
    const stageBox=stage.getBoundingClientRect(),toastBox=$('gameToast').getBoundingClientRect();
    const toastLeft=toastBox.left-stageBox.left,toastTop=toastBox.top-stageBox.top;
    let choice=null,bestClearance=-Infinity;
    for(let i=0;i<20;i++) {
      const candidate={x:rand(pad,width-pad),y:rand(65,Math.max(66,height-60))};
      const headGap=Math.hypot(candidate.x-head.x,candidate.y-head.y)-Math.min(width,height)*.32;
      const bodyGap=Math.min(...body.map(p=>Math.hypot(candidate.x-p.x,candidate.y-p.y)-p.radius))-(mobile?32:42);
      const toastGap=Math.hypot(candidate.x-clamp(candidate.x,toastLeft,toastLeft+toastBox.width),candidate.y-clamp(candidate.y,toastTop,toastTop+toastBox.height))-(mobile?30:36);
      const clearance=Math.min(headGap,bodyGap)-(toastGap<0?1000:0);
      if(clearance>bestClearance){choice=candidate;bestClearance=clearance}
      if(clearance>=0)break;
    }
    seed={...choice,born:clock,phase:rand(0,Math.PI*2)};
    positionSeed();
  }
  function emit(x,y,amount=50,power=1) {
    const budget=mobile?200:400;
    for(let i=0;i<amount;i++) {
      const a=rand(0,Math.PI*2),v=rand(30,150)*power;
      sparks.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-20,life:rand(.5,1.4),max:1.4,size:rand(1,3),color:Math.floor(rand(1,5))});
    }
    if(sparks.length>budget)sparks.splice(0,sparks.length-budget);
  }
  function start() {
    $('play').scrollTo({top:0,behavior:'auto'});
    clearMission();chooseDance=dance.createBag();nextMissionAt=dance.seedInterval();completedDances=0;$('completedDances').textContent='0';
    initializeTrail();
    count=0;timeLeft=60;flash=0;pulse=0;sparks=[];seedBursts=[];
    state='playing';keys.clear();resetPointers();lastPointer=clock-10;
    $('pauseGame').textContent='暂停';
    $('gameOverlay').hidden=true;
    $('stageState').textContent='静夜舞龙 · 让火光随你流转';
    controlHint();
    toast('引龙追火 · 收集 '+nextMissionAt+' 颗火种唤起随机龙舞');
    placeSeed();hud();stage.focus({preventScroll:true});previous=0;schedule();
  }
  function pause(reason='paused') {
    if(state!=='playing')return;
    state='paused';keys.clear();resetPointers();
    $('overlayKicker').textContent='A MOMENT OF STILLNESS';$('overlayTitle').textContent='让火光稍作停留';
    $('overlayDescription').textContent=reason==='instructions'?'阅读玩法时，舞龙与计时已暂停。回到舞台后，可以接着这一舞。':reason==='hidden'?'火光已为你留住。准备好了，继续这一舞。':'余时与招式都已暂停，准备好了就继续。';
    $('resumeGame').textContent='继续这一舞 →';$('gameOverlay').hidden=false;hud();
    if(reason!=='instructions')$('resumeGame').focus({preventScroll:true});
  }
  function resume() {
    if(state!=='paused')return;
    $('play').scrollTo({top:0,behavior:'auto'});
    state='playing';$('gameOverlay').hidden=true;
    lastPointer=clock-10;previous=0;hud();stage.focus({preventScroll:true});schedule();
  }
  function end() {
    clearMission();state='ended';seed=null;positionSeed();keys.clear();resetPointers();
    $('overlayKicker').textContent='THE LIGHT STAYS WITH YOU';$('overlayTitle').textContent='一舞终了，火种不息';
    $('overlayDescription').textContent='六十秒的火光，留在今夜。沿光走过的舞步，都化作山河间的星火。';
    $('resumeGame').textContent='再舞一回 →';$('gameOverlay').hidden=false;
    $('stageState').textContent='一舞终了 · 火种不息';hud();$('resumeGame').focus({preventScroll:true});
  }
  function collect() {
    if(!seed)return;
    count++;pulse=1;emit(seed.x,seed.y,mobile?30:50,1);
    seedBursts.push({x:seed.x,y:seed.y,born:clock,phase:seed.phase,power:1});
    if(seedBursts.length>(mobile?4:6))seedBursts.shift();
    toast('火种相随 · 光沿龙身流转');
    if(count>=nextMissionAt)beginMission();else placeSeed();hud();
  }
  function move(event) {
    const rect=stage.getBoundingClientRect();
    target={x:clamp(event.clientX-rect.left,24,width-24),y:clamp(event.clientY-rect.top,40,height-30)};
    lastPointer=clock;
    if(state==='playing'&&mission?.phase==='trace'){
      const samples=event.getCoalescedEvents?.()||[];
      for(const p of [...samples,event])mission.input.push({x:clamp(p.clientX-rect.left,24,width-24),y:clamp(p.clientY-rect.top,40,height-30)});
      if(mission.input.length>160)mission.input.splice(0,mission.input.length-160);
    }
  }
  stage.addEventListener('pointerdown',e=>{
    if(e.target.closest('button')&&e.target!==$('fireSeed'))return;
    if(e.button!==0&&e.pointerType==='mouse')return;
    if(state!=='playing'||(controlPointer!==null&&controlPointer!==e.pointerId))return;
    e.preventDefault();stage.focus({preventScroll:true});
    stage.setPointerCapture(e.pointerId);controlPointer=e.pointerId;pointerDown=true;
    controlHint(e.pointerType==='touch'?'touch':'mouse');move(e);
  });
  stage.addEventListener('pointermove',e=>{
    if(state!=='playing')return;
    if(e.pointerType==='mouse'||(pointerDown&&controlPointer===e.pointerId)){
      if(e.pointerType==='touch')e.preventDefault();move(e);
    }
  });
  function release(e){if(controlPointer===e.pointerId){controlPointer=null;pointerDown=false}}
  stage.addEventListener('pointerup',release);stage.addEventListener('pointercancel',release);stage.addEventListener('lostpointercapture',release);
  stage.addEventListener('keydown',e=>{
    if(e.target!==stage)return;
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d','W','A','S','D'].includes(e.key)){
      e.preventDefault();keys.add(e.key.toLowerCase());lastPointer=clock;
    } else if(e.code==='Space'){e.preventDefault();if(!e.repeat){if(state==='idle'||state==='ended')start();else state==='paused'?resume():pause()}}
    else if(e.key.toLowerCase()==='p'){e.preventDefault();state==='playing'?pause():resume()}
  });
  addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
  scene.addEventListener('keydown',e=>{
    if(e.target!==stage&&e.key.toLowerCase()==='p'&&!e.ctrlKey&&!e.metaKey&&!e.altKey){
      e.preventDefault();if(!e.repeat)state==='playing'?pause():resume();
    }
  });
  addEventListener('blur',()=>{keys.clear();resetPointers();pause('hidden')});
  $('startGame').addEventListener('click',start);
  $('pauseGame').addEventListener('click',()=>state==='paused'?resume():pause());
  $('resumeGame').addEventListener('click',()=>state==='paused'?resume():start());
  function openGame() {
    scene.hidden=false;guide.hidden=false;
    display.classList.add('is-playing');art.inert=true;
    entrance.setAttribute('aria-expanded','true');
    visible=true;resize();previous=0;
    if(state==='paused')resume();
    else if(state==='idle'||state==='ended')start();
    else{stage.focus({preventScroll:true});schedule()}
  }
  function returnToArt() {
    pause();
    scene.hidden=true;guide.hidden=true;art.inert=false;
    display.classList.remove('is-playing');
    entrance.setAttribute('aria-expanded','false');
    entrance.textContent=state==='paused'?'继续指尖舞龙 →':'进入指尖舞龙 →';
    if(raf)cancelAnimationFrame(raf);raf=0;previous=0;
    entrance.focus({preventScroll:true});
  }
  entrance.addEventListener('click',openGame);
  $('returnToArt').addEventListener('click',returnToArt);
  $('enterGameNav').addEventListener('click',e=>{
    e.preventDefault();openGame();
  });
  $('fireSeed').addEventListener('click',e=>{
    // Pointer input is handled by the stage; keep keyboard activation accessible.
    if(e.detail>0)return;
    if(state!=='playing'||!seed)return;
    target={x:seed.x,y:seed.y};lastPointer=clock;
    stage.focus({preventScroll:true});
  });
  motionQuery.addEventListener('change',e=>{
    if(e.matches&&state==='playing')pause();calm=e.matches;render();schedule();
  });
  $('showGameHelp').addEventListener('click',()=>{
    pause('instructions');$('gameHelp').open=true;
    $('gameHelp').scrollIntoView({block:'start',behavior:motionQuery.matches?'auto':'smooth'});
    $('gameHelp').querySelector('summary').focus({preventScroll:true});
  });
  $('backToDance').addEventListener('click',()=>{
    $('play').scrollTo({top:0,behavior:'auto'});
    if(state==='paused')resume();else stage.focus({preventScroll:true});
  });
  $('play').addEventListener('scroll',()=>{
    if(state==='playing'&&!scene.hidden&&$('gameHelp').getBoundingClientRect().top<innerHeight-24)pause('instructions');
  },{passive:true});
  function update(dt) {
    clock+=dt;flash=Math.max(0,flash-dt*1.5);pulse=Math.max(0,pulse-dt*.85);
    const keyboard=keys.size>0;
    if(keyboard && state!=='paused'&&state!=='ended') {
      const speed=Math.min(width,height)*.8;
      let x=(keys.has('arrowright')||keys.has('d')?1:0)-(keys.has('arrowleft')||keys.has('a')?1:0);
      let y=(keys.has('arrowdown')||keys.has('s')?1:0)-(keys.has('arrowup')||keys.has('w')?1:0);
      if(x||y){const scale=speed*dt/Math.hypot(x,y);target.x=clamp(target.x+x*scale,24,width-24);target.y=clamp(target.y+y*scale,40,height-30)}
      lastPointer=clock;
    }
    if(state==='paused')return;
    const controlled=pointerDown||keyboard||clock-lastPointer<3;
    if(!controlled) {
      if(state==='playing') {target.x=head.x;target.y=head.y}
      else {
        for(let i=0;i<trail.length;i++) {
          const u=i/(trail.length-1);
          trail[i].x=width*(.86-u*.74);
          trail[i].y=height*(.51+Math.sin(u*9-clock*.65)*.12+Math.sin(u*20+clock*.4)*.045);
        }
        head={...trail[0]};target={...head};
      }
    }
    const easing=1-Math.exp(-dt*8);
    head.x+=(target.x-head.x)*easing;head.y+=(target.y-head.y)*easing;
    // Only add a sample after traveling its full spacing: slow motion keeps a long body.
    const anchor=trail[0],distance=Math.hypot(head.x-anchor.x,head.y-anchor.y);
    const spacing=clamp(width*.64/149,1.4,6);
    if(distance>=spacing) {
      const steps=Math.floor(distance/spacing);
      for(let s=1;s<=steps;s++)trail.unshift({x:anchor.x+(head.x-anchor.x)*s*spacing/distance,y:anchor.y+(head.y-anchor.y)*s*spacing/distance});
      trail.length=Math.min(trail.length,150);
    }
    const facing=point(.015).angle;
    heading+=Math.atan2(Math.sin(facing-heading),Math.cos(facing-heading))*(1-Math.exp(-dt*9));
    if(state==='playing'&&mission)updateMission(dt);
    else if(state==='playing') {
      timeLeft=Math.max(0,timeLeft-dt);
      if(seed && Math.hypot(head.x-seed.x,head.y-seed.y)<(mobile?31:35))collect();
      paintTimer();
      if(timeLeft<=0)end();
    }
    for(let i=sparks.length-1;i>=0;i--){const p=sparks[i];p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=Math.exp(-dt*1.3);p.vy-=dt*15;if(p.life<=0)sparks.splice(i,1)}
    for(let i=seedBursts.length-1;i>=0;i--)if(clock-seedBursts[i].born>1.1)seedBursts.splice(i,1);
  }

  const headScale=()=>Math.min(mobile?.62:.96,height/400);
  const bodyRadius=u=>Math.min(mobile?12:20,height*.055)*Math.pow(1-u,.6)+1.2;
  function bodyPoint(u) {
    const p=point(u),neck=48*headScale()*Math.pow(1-u,12);
    return {x:p.x-Math.cos(p.angle)*neck,y:p.y-Math.sin(p.angle)*neck,angle:p.angle};
  }
  function loaded(img){return img.complete&&img.naturalWidth>0}
  // Each scale tile is mapped onto two triangles between consecutive body joints.
  // UV positions belong to the skeleton: the paper never slides along the dragon.
  function tileTriangle(img,sourceX,a,b,c,second) {
    ctx.save();ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.lineTo(c.x,c.y);ctx.closePath();ctx.clip();
    if(!second)ctx.transform((b.x-a.x)/24,(b.y-a.y)/24,(c.x-a.x)/80,(c.y-a.y)/80,a.x,a.y);
    else {const ax=(b.x-c.x)/24,ay=(b.y-c.y)/24,cx=(b.x-a.x)/80,cy=(b.y-a.y)/80;ctx.transform(ax,ay,cx,cy,a.x-24*ax,a.y-24*ay)}
    ctx.drawImage(img,sourceX,0,24,80,0,0,24,80);ctx.restore();
  }
  function drawBody() {
    const n=64,samples=Array.from({length:n+1},(_,i)=>{const p=bodyPoint(i/n),r=bodyRadius(i/n);return {...p,r,top:{x:p.x+Math.sin(p.angle)*r,y:p.y-Math.cos(p.angle)*r},bottom:{x:p.x-Math.sin(p.angle)*r,y:p.y+Math.cos(p.angle)*r}}});
    ctx.save();ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
    const tail=samples[n];
    if(loaded(textures.tail)){ctx.save();ctx.translate(tail.x,tail.y);ctx.rotate(tail.angle);const z=mobile?.48:.7;ctx.scale(z,z);ctx.drawImage(textures.tail,-135,-55,150,110);ctx.restore()}
    for(let i=n-1;i>=0;i--){
      const a=samples[i],b=samples[i+1];
      ctx.beginPath();ctx.moveTo(a.top.x,a.top.y);ctx.lineTo(b.top.x,b.top.y);ctx.lineTo(b.bottom.x,b.bottom.y);ctx.lineTo(a.bottom.x,a.bottom.y);ctx.closePath();ctx.fillStyle='#9b3b2a';ctx.fill();
      if(loaded(textures.scales)){tileTriangle(textures.scales,i%4*24,a.top,b.top,a.bottom,false);tileTriangle(textures.scales,i%4*24,b.top,b.bottom,a.bottom,true)}
      ctx.strokeStyle='#e6b768';ctx.lineWidth=mobile?.6:.9;
      ctx.beginPath();ctx.moveTo(a.top.x,a.top.y);ctx.lineTo(b.top.x,b.top.y);ctx.moveTo(a.bottom.x,a.bottom.y);ctx.lineTo(b.bottom.x,b.bottom.y);ctx.stroke();
      if(i%4===0&&i<57){
        ctx.save();ctx.translate(a.x,a.y);ctx.rotate(a.angle);ctx.beginPath();ctx.moveTo(-5,-a.r+1);ctx.quadraticCurveTo(-8,-a.r-10,-2,-a.r-14);ctx.quadraticCurveTo(3,-a.r-9,7,-a.r+1);ctx.fillStyle='#386d55';ctx.fill();ctx.strokeStyle='#e0ba78';ctx.lineWidth=.8;ctx.stroke();ctx.restore();
      }
    }
    for(const u of [.21,.57]){
      const p=bodyPoint(u),r=bodyRadius(u);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);
      ctx.strokeStyle='#d6aa64';ctx.lineWidth=mobile?2:3;ctx.beginPath();ctx.moveTo(-2,r*.6);ctx.lineTo(-12,r+12);ctx.lineTo(-3,r+20);ctx.moveTo(-3,r+20);ctx.lineTo(4,r+19);ctx.moveTo(-3,r+20);ctx.lineTo(0,r+26);ctx.stroke();ctx.restore();
    }
    // A restrained edge glow replaces the old particle cloud.
    if(pulse>0||mission?.phase==='celebrate'){
      ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.18*(pulse+.4);ctx.strokeStyle='#e4b56a';ctx.lineWidth=4;ctx.beginPath();samples.forEach((p,i)=>i?ctx.lineTo(p.top.x,p.top.y):ctx.moveTo(p.top.x,p.top.y));ctx.stroke();
    }
    ctx.restore();
  }
  function dragonHead() {
    ctx.save();ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.translate(head.x,head.y);ctx.rotate(heading);
    if(Math.cos(heading)<0)ctx.scale(1,-1);
    ctx.scale(headScale(),headScale());
    if(loaded(textures.head)){
      const w=216,h=w*textures.head.naturalHeight/textures.head.naturalWidth;
      // The visible nose (91% across / 55% down) owns the steering anchor.
      // Long horns and whiskers are decoration, not the hit target.
      ctx.drawImage(textures.head,-w*.91,-h*.55,w,h);
    }
    else {ctx.fillStyle='#c8653b';ctx.beginPath();ctx.ellipse(-15,0,40,23,0,0,Math.PI*2);ctx.fill()}
    ctx.restore();
    if(mission?.phase==='trace'){
      ctx.save();ctx.globalCompositeOperation='lighter';glow(head.x,head.y,5,3,.8);ctx.restore();
    }
  }

  function clearMission() {
    mission=null;stage.classList.remove('has-dance');$('danceMission').hidden=true;$('nextDancePoint').hidden=true;
    stage.removeAttribute('data-dance');stage.removeAttribute('data-dance-phase');
  }
  function beginMission() {
    const pattern=chooseDance(),trace=new dance.Trace(dance.makePath(pattern,width,height,Math.random()<.5));
    mission={pattern,trace,phase:'trace',age:0,lastPercent:-1,lastSeconds:-1,input:[],fireworks:null};
    seed=null;seedBursts=[];sparks=[];positionSeed();stage.classList.add('has-dance');stage.dataset.dance=pattern.id;stage.dataset.dancePhase='trace';
    $('danceMission').hidden=false;$('danceMission').dataset.phase='trace';$('nextDancePoint').hidden=false;
    $('missionKicker').textContent='龙舞忽至 · 随机招式';$('missionTitle').textContent=pattern.name;$('missionVerse').textContent=pattern.verse;
    $('missionAnnouncement').textContent='随机龙舞：'+pattern.name+'。先抵达起点，沿宽光带顺势行进。可以轻微偏离或快速划过，普通倒计时已暂停。';
    $('stageState').textContent='先到「起」，用龙吻光珠循光 · 普通计时暂停';controlHint();paintMissionHud();
  }
  function paintMissionHud() {
    if(!mission)return;
    const percent=Math.round(mission.trace.progress*100),seconds=Math.max(0,Math.ceil(mission.trace.duration-mission.trace.elapsed));
    if(percent!==mission.lastPercent){
      mission.lastPercent=percent;$('missionProgress').setAttribute('aria-valuenow',percent);$('missionProgress').firstElementChild.style.width=percent+'%';
      $('missionProgressText').textContent=percent?percent+'% · 循光而行':'从「起」入阵';
    }
    if(seconds!==mission.lastSeconds){mission.lastSeconds=seconds;$('missionSeconds').textContent=seconds+'秒'}
  }
  function finishMission(success) {
    if(!mission||mission.phase!=='trace')return;
    if(success){
      mission.returnFocus=document.activeElement===$('nextDancePoint');
      completedDances++;$('completedDances').textContent=completedDances;flash=calm?0:.7;pulse=1;
      mission.phase='celebrate';mission.age=0;mission.fireworks=window.PuzhaiFireworks.create(width,height,mobile);stage.dataset.dancePhase='celebrate';$('danceMission').dataset.phase='celebrate';
      $('missionKicker').textContent='一舞成势 · 火树银花';$('missionTitle').textContent=mission.pattern.name+' · 成';$('missionVerse').textContent='这一式已成 · 看花火升起';$('missionSeconds').textContent='';
      $('missionAnnouncement').textContent=mission.pattern.name+'完成，火树银花为你盛放。';
      $('stageState').textContent='花火为你盛放 · 即将归于静夜';$('nextDancePoint').hidden=true;
      if(!calm)mission.trace.points.filter((_,i)=>i%6===0).forEach(p=>emit(p.x,p.y,mobile?8:12,.9));hud();
    }else leaveMission('光轨轻收 · 继续随心舞龙');
  }
  function leaveMission(message) {
    const hadFocus=mission?.returnFocus||$('nextDancePoint')===document.activeElement||$('skipMission')===document.activeElement;
    clearMission();nextMissionAt=count+dance.seedInterval();controlHint();
    $('stageState').textContent='静夜舞龙 · 再遇 '+(nextMissionAt-count)+' 颗火种唤起新招式';
    $('missionAnnouncement').textContent=message;toast(message);placeSeed();hud();if(hadFocus)stage.focus({preventScroll:true});
  }
  function updateMission(dt) {
    mission.age+=dt;
    if(mission.phase==='celebrate'){if(mission.age>(calm?3.2:window.PuzhaiFireworks.duration))leaveMission('一舞已成 · 火光归于静夜');return}
    const result=mission.trace.update(head,dt,mission.input.splice(0));paintMissionHud();
    if(result==='complete')finishMission(true);else if(result==='expired')finishMission(false);
  }
  $('skipMission').addEventListener('click',()=>{if(state==='playing'&&mission?.phase==='trace')leaveMission('暂收此式 · 继续随心舞龙')});
  $('nextDancePoint').addEventListener('click',()=>{
    if(state!=='playing'||mission?.phase!=='trace')return;
    // Keyboard alternative, matching the existing accessible fire-seed control.
    target={...mission.trace.next};lastPointer=clock;
  });
  function drawDance() {
    if(!mission)return;
    const {trace,phase,age}=mission,pts=trace.points,celebrating=phase==='celebrate';
    const pathTo=(end)=>{ctx.beginPath();pts.slice(0,end).forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y))};
    ctx.save();ctx.globalCompositeOperation='source-over';ctx.lineJoin='round';ctx.lineCap='round';
    ctx.globalAlpha=celebrating?Math.min(1,(window.PuzhaiFireworks.duration-age)*1.2):.55;ctx.strokeStyle='#829b83';ctx.lineWidth=1;ctx.setLineDash([3,8]);pathTo(pts.length);ctx.stroke();ctx.setLineDash([]);
    ctx.globalAlpha=celebrating?.85:.82;ctx.strokeStyle='#efc987';ctx.lineWidth=celebrating?3:2;pathTo(Math.max(1,trace.index));ctx.stroke();
    if(celebrating){
      ctx.globalCompositeOperation='lighter';
      const fade=Math.max(0,1-age/window.PuzhaiFireworks.duration);
      ctx.strokeStyle='#f1cf88';ctx.lineWidth=12;ctx.globalAlpha=fade*.09;pathTo(pts.length);ctx.stroke();
      ctx.strokeStyle='#fff0bc';ctx.lineWidth=2.5;ctx.globalAlpha=fade*.8;pathTo(pts.length);ctx.stroke();
      for(let i=0;i<pts.length;i+=2){const p=pts[i];glow(p.x,p.y,calm?3:9+Math.sin(i+clock*3)*3,3,fade*.5)}
      if(!calm)window.PuzhaiFireworks.draw(ctx,mission.fireworks,age,glow);
    }else{
      const next=trace.next,start=pts[0];
      // The visible band describes the actual forgiving hit corridor.
      ctx.globalAlpha=.065;ctx.strokeStyle='#d2b777';ctx.lineWidth=trace.tolerance*2;
      ctx.beginPath();pts.slice(Math.max(0,trace.index-1),Math.min(pts.length,trace.index+9)).forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();
      ctx.globalAlpha=.14;ctx.strokeStyle='#f0d39e';ctx.lineWidth=1.2;pathTo(pts.length);ctx.stroke();
      ctx.globalAlpha=.65;ctx.strokeStyle='#efcf91';ctx.lineWidth=1;
      for(let i=trace.index;i<pts.length;i+=Math.max(4,Math.round(pts.length/10))){const p=pts[i];ctx.beginPath();ctx.arc(p.x,p.y,2,0,Math.PI*2);ctx.stroke()}
      ctx.globalAlpha=.95;ctx.fillStyle='#f3d49c';ctx.beginPath();ctx.arc(next.x,next.y,calm?6:6+Math.sin(clock*5)*1.5,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#cfb47c';ctx.lineWidth=1;ctx.beginPath();ctx.arc(next.x,next.y,trace.tolerance,0,Math.PI*2);ctx.stroke();
      const goal=pts[Math.min(trace.index+4,pts.length-1)],angle=Math.atan2(goal.y-next.y,goal.x-next.x);
      ctx.save();ctx.translate(next.x,next.y);ctx.rotate(angle);ctx.beginPath();ctx.moveTo(25,-4);ctx.lineTo(31,0);ctx.lineTo(25,4);ctx.stroke();ctx.restore();
      if(trace.index<3){ctx.font=(mobile?'11':'12')+'px "Microsoft YaHei",sans-serif';ctx.textAlign='center';ctx.fillText('起',start.x,start.y-22)}
      // The small moving bead demonstrates direction without moving the player's dragon.
      if(!calm){const ghost=pts[Math.floor((age*.15%1)*(pts.length-1))];glow(ghost.x,ghost.y,5,3,.45)}
    }
    ctx.restore();
  }
  function drawFireSeed() {
    const age=clamp((clock-seed.born)/.4,0,1),appear=1-Math.pow(1-age,3);
    const time=calm?0:clock,phase=seed.phase;
    const near=1-clamp(Math.hypot(head.x-seed.x,head.y-seed.y)/(mobile?110:180),0,1);
    const breathe=1+(calm?0:Math.sin(time*3.2+phase)*.045);
    const scale=(mobile?.86:1.08)*(.72+.28*appear)*breathe;
    const light=appear*(calm?.65:1);
    ctx.save();ctx.translate(seed.x,seed.y);ctx.scale(scale,scale);
    ctx.globalCompositeOperation='lighter';
    // A warm halo stays soft; the flame core provides a clear collection target.
    glow(0,3,63,0,.13*light);glow(0,3,34,1,(.22+near*.12)*light);
    // Two inclined ember orbits, with bright moving tips and fading trails.
    for(let ring=0;ring<2;ring++) {
      const tilt=ring===0?-.52:.92,rx=ring===0?31:28,ry=ring===0?13:11;
      const angle=phase+time*(ring===0?.85:-.65)+ring*2.1;
      ctx.save();ctx.rotate(tilt);
      ctx.globalAlpha=.27*light;ctx.strokeStyle=ring===0?'#f5ab55':'#fc7130';ctx.lineWidth=.65;
      ctx.beginPath();ctx.ellipse(0,3,rx,ry,0,angle-.9,angle+3.7);ctx.stroke();
      for(let i=0;i<20;i++) {
        const a=angle-i*.065,x=Math.cos(a)*rx,y=3+Math.sin(a)*ry;
        glow(x,y,2.6-i*.09,ring===0?3:1,(1-i/20)*.8*light);
      }
      for(let i=0;i<(mobile?14:22);i++) {
        const a=i*2.399+angle;
        glow(Math.cos(a)*(rx+Math.sin(i*7)*2),3+Math.sin(a)*ry,.85,2,(.25+.22*Math.sin(a+i))*light);
      }
      ctx.restore();
    }
    // A curved, translucent flame holds a denser flow of gold particles.
    const sway=calm?0:Math.sin(time*2.6+phase)*2.5;
    const flame=ctx.createLinearGradient(0,-26,0,18);
    flame.addColorStop(0,'#ffd17f00');flame.addColorStop(.28,'#ffa82c');flame.addColorStop(.67,'#ff773b');flame.addColorStop(1,'#d7341700');
    ctx.globalAlpha=.55*light;ctx.fillStyle=flame;
    ctx.beginPath();ctx.moveTo(sway+2,-26);
    ctx.bezierCurveTo(sway-1,-12,-12,-7,-10,3);
    ctx.bezierCurveTo(-13,17,7,22,11,9);
    ctx.bezierCurveTo(15,-1,4,-7,sway+2,-26);ctx.fill();
    const amount=mobile?64:96;
    for(let i=0;i<amount;i++) {
      const p=seedDust[i],u=(p.u+time*p.speed)%1;
      const y=15-u*40,spread=Math.sin(Math.PI*u)*8+.6;
      const x=p.lane*spread+Math.sin(u*5+time*2+phase)*(1+u*2);
      const alpha=(.35+.5*Math.sin(Math.PI*u))*(.8+.2*Math.sin(p.phase+time*4));
      glow(x,y,p.size*(i%5===0?2.3:1.7),u<.28?1:i%3===0?4:3,alpha*light);
    }
    // Fine spiral filaments keep the seed luminous without a solid white blob.
    for(let strand=0;strand<3;strand++)for(let i=0;i<22;i++) {
      const u=i/21,a=u*7-time*2+strand*2.1+phase,r=Math.sin(Math.PI*u)*5;
      glow(Math.cos(a)*r,12-u*32,.9,strand===0?4:2,Math.sin(Math.PI*u)*.65*light);
    }
    glow(0,5,10,2,(.65+near*.15)*light);glow(0,5,3.2,4,.92*light);
    // A restrained anamorphic glint marks the hot center of the ember.
    ctx.save();ctx.translate(0,5);ctx.scale(1,.075);glow(0,0,26,3,.6*light);ctx.restore();
    ctx.save();ctx.translate(0,5);ctx.scale(.08,1);glow(0,0,19,3,.35*light);ctx.restore();
    ctx.globalCompositeOperation='source-over';ctx.globalAlpha=.82*light;
    ctx.fillStyle='#e9b980';ctx.font='10px "Microsoft YaHei",sans-serif';ctx.textAlign='center';
    ctx.fillText('火 种',0,44);ctx.restore();
  }
  function drawSeedBursts() {
    for(const p of seedBursts) {
      const age=clock-p.born,t=clamp(age/1.1,0,1),fade=Math.pow(1-t,2);
      const radius=(mobile?22:28)+(calm?16:62)*(1-Math.pow(1-t,3));
      const light=fade*p.power*(calm?.5:1);
      ctx.save();ctx.globalCompositeOperation='lighter';
      glow(p.x,p.y,(mobile?52:72)*(1+t),1,light*.3);
      for(let ring=0;ring<2;ring++) {
        ctx.globalAlpha=light*(ring===0?.65:.24);ctx.strokeStyle=ring===0?'#ffd891':'#ff7734';ctx.lineWidth=ring===0?1.2:.7;
        ctx.beginPath();ctx.arc(p.x,p.y,radius*(ring===0?1:.7),0,Math.PI*2);ctx.stroke();
      }
      for(let i=0;i<10;i++) {
        const a=p.phase+i*Math.PI/5,r=radius*(.85+.12*Math.sin(i*7));
        glow(p.x+Math.cos(a)*r,p.y+Math.sin(a)*r,2.4,3,light*.8);
      }
      ctx.restore();
    }
  }
  function render() {
    if(!trail.length)return;
    ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;ctx.clearRect(0,0,width,height);
    const halo=ctx.createRadialGradient(width*.5,height*.53,10,width*.5,height*.53,width*.6);
    halo.addColorStop(0,'#39120b28');halo.addColorStop(1,'#03030400');ctx.fillStyle=halo;ctx.fillRect(0,0,width,height);
    ctx.globalCompositeOperation='lighter';
    // Quiet ambience; sparks are reserved for collected fire and completed dance phrases.
    for(let i=0;i<18;i++) {const x=(i*127.7)%width,y=((i*61.1-clock*(i%3+1)*3)%height+height)%height;glow(x,y,1,i%3,.15)}
    drawDance();
    drawBody();
    dragonHead();
    ctx.globalCompositeOperation='lighter';
    for(const p of sparks)glow(p.x,p.y,p.size*2,p.color,Math.min(1,p.life/p.max));
    drawSeedBursts();
    if(seed)drawFireSeed();
    if(flash>0){glow(head.x,head.y,Math.min(width,height)*.65,1,flash*.24)}
    ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
  }
  function frame(timestamp) {
    raf=0;if(!visible||document.hidden)return;
    const dt=previous?Math.min((timestamp-previous)/1000,.05):1/60;previous=timestamp;
    if(!calm||state==='playing')update(dt);
    if(state!=='paused')render();
    schedule();
  }
  function schedule() {
    if(!raf&&!scene.hidden&&visible&&!document.hidden&&state!=='paused'&&(!calm||state==='playing'))raf=requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){pause('hidden');if(raf)cancelAnimationFrame(raf);raf=0;previous=0}
    else{previous=0;schedule()}
  });
  new ResizeObserver(resize).observe(stage);
  if('IntersectionObserver' in window)new IntersectionObserver(entries=>{
    visible=entries[0].isIntersecting&&entries[0].intersectionRatio>=.25;
    // The entrance's circular clip begins at zero area. That is an animation
    // state, not the player leaving the game; do not open a pause dialog for it.
    if(!visible){if(!scene.classList.contains('game-arriving'))pause('instructions');if(raf)cancelAnimationFrame(raf);raf=0;previous=0}
    else{previous=0;schedule()}
  },{threshold:[0,.25]}).observe(stage);
  scene.addEventListener('animationend',e=>{
    if(e.animationName==='gameIgnites'&&!visible&&!scene.hidden)pause('hidden');
  });
  resize();hud();
  schedule();
})();

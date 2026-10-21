/* Traditional dragon-dance inspired paths, adapted for a single pointer.
   Names describe general dragon-dance vocabulary, not a Puzhai routine. */
(() => {
  'use strict';
  const TAU = Math.PI * 2;
  const patterns = [
    {id:'eight', name:'横八字花', verse:'左右穿花，首尾相随', at:t=>({x:.5+.44*Math.sin(TAU*t), y:.5+.39*Math.sin(TAU*2*t)})},
    {id:'circle', name:'圆场游龙', verse:'循圆而行，一气相连', at:t=>({x:.5-.44*Math.cos(TAU*t), y:.5+.42*Math.sin(TAU*t)})},
    {id:'wave', name:'起伏游龙', verse:'起伏相接，如浪前行', at:t=>({x:.06+.88*t, y:.5-.34*Math.sin(TAU*1.5*t)})},
    {id:'spiral', name:'盘龙回旋', verse:'由外而内，盘旋聚势', at:t=>({x:.5+(.44-.29*t)*Math.cos(-Math.PI/2+TAU*1.15*t), y:.5+(.44-.29*t)*Math.sin(-Math.PI/2+TAU*1.15*t)})}
  ];
  const seedInterval=(random=Math.random)=>4+Math.min(11,Math.floor(random()*12));
  const toleranceFor=(width,height)=>Math.max(36,Math.min(64,Math.min(width,height)*.13));
  function makePath(pattern,width,height,mirror=false) {
    const left=Math.min(75,width*.13), top=Math.min(112,height*.25), bottom=Math.min(68,height*.19);
    const w=width-left*2,h=Math.max(30,height-top-bottom);
    const raw=Array.from({length:401},(_,i)=>{const p=pattern.at(i/400);return {x:left+(mirror?1-p.x:p.x)*w,y:top+p.y*h}});
    // Resample by distance so slow and fast sections have equal trace tolerance.
    const lengths=[0];for(let i=1;i<raw.length;i++)lengths.push(lengths[i-1]+Math.hypot(raw[i].x-raw[i-1].x,raw[i].y-raw[i-1].y));
    const total=lengths.at(-1), steps=Math.max(24,Math.ceil(total/24)), points=[];
    let j=1;
    for(let i=0;i<=steps;i++){
      const d=total*i/steps;while(j<raw.length-1&&lengths[j]<d)j++;
      const t=(d-lengths[j-1])/(lengths[j]-lengths[j-1]||1),a=raw[j-1],b=raw[j];
      points.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
    }
    return {points,length:total,tolerance:toleranceFor(width,height),duration:Math.max(40,Math.min(65,total/Math.max(90,Math.min(w,h)*.6)+32))};
  }
  function createBag(random=Math.random) {
    let bag=[],last;
    return () => {
      if(!bag.length){bag=patterns.slice();for(let i=bag.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]]}if(bag.at(-1)===last)[bag[0],bag[bag.length-1]]=[bag.at(-1),bag[0]]}
      last=bag.pop();return last;
    };
  }
  class Trace {
    constructor(path){Object.assign(this,path);this.index=0;this.elapsed=0;this.finished=false;this.previousHead=null;this.previousInput=null}
    update(head,dt,inputPoints=[]){
      this.elapsed+=dt;
      // Test continuous strokes rather than one sampled point per frame. Both the
      // rendered snout and the player's un-smoothed gesture can enter the corridor.
      // This catches fast crossings and corners rounded by the dragon's inertia.
      const segments=[[this.previousHead||head,head]];
      for(const p of inputPoints){segments.push([this.previousInput||p,p]);this.previousInput={...p}}
      const distance=(p,a,b)=>{
        const x=b.x-a.x,y=b.y-a.y,len=x*x+y*y;
        const t=len?Math.max(0,Math.min(1,((p.x-a.x)*x+(p.y-a.y)*y)/len)):0;
        return Math.hypot(p.x-a.x-t*x,p.y-a.y-t*y);
      };
      // Consume every crossed checkpoint in order, including multiple checkpoints
      // crossed within a single frame. Never search across a later loop or crossing.
      for(const [a,b] of segments){
        const travel=Math.hypot(b.x-a.x,b.y-a.y);
        const radius=this.tolerance+Math.min(this.tolerance*.6,travel*.2);
        while(this.index<this.points.length&&distance(this.points[this.index],a,b)<=radius)this.index++;
      }
      this.previousHead={...head};
      this.finished=this.index===this.points.length;
      return this.finished?'complete':this.elapsed>=this.duration?'expired':'tracing';
    }
    get progress(){return this.index/this.points.length}
    get next(){return this.points[Math.min(this.index,this.points.length-1)]}
    suspend(){this.previousHead=null;this.previousInput=null}
    resize(sx,sy){this.points.forEach(p=>{p.x*=sx;p.y*=sy});this.suspend()}
  }
  const api={patterns,makePath,createBag,seedInterval,toleranceFor,Trace};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else window.PuzhaiDance=api;
})();

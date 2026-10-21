/* Layered, bounded firework choreography. All particles are prepared once. */
(() => {
  'use strict';
  const TAU=Math.PI*2;
  const colors=['#fff3bc','#ffd079','#f69d58','#d7e7b1','#efb376'];
  function create(width,height,mobile=false,random=Math.random){
    const unit=Math.min(width,height),density=mobile?.58:1;
    const layout=[
      [.50,.42,.16,.48,170],
      [.22,.36,.72,.36,125],[.78,.34,.92,.38,125],
      [.12,.56,1.55,.30,100],[.52,.28,1.78,.43,150],[.88,.55,1.96,.31,100],
      [.17,.30,2.70,.29,95],[.39,.43,2.90,.35,110],[.65,.34,3.08,.36,115],[.88,.29,3.30,.28,95]
    ];
    return layout.map(([x,y,delay,radius,amount],i)=>({
      x:x*width,y:y*height,delay,radius:unit*radius,life:2.45+i%3*.12,
      rays:Array.from({length:Math.round(amount*density)},(_,j)=>({angle:j*TAU/Math.round(amount*density)+(random()-.5)*.028,speed:.55+random()*.52,bend:(random()-.5)*.13,color:colors[(j+i)%colors.length],fork:j%5===0,glow:j%3===0}))
    }));
  }
  function draw(ctx,bursts,age,glow){
    ctx.save();ctx.globalCompositeOperation='lighter';ctx.lineCap='round';
    for(const burst of bursts){
      const t=age-burst.delay;
      if(t<-.45||t>burst.life)continue;
      if(t<0){
        const u=(t+.45)/.45,sy=burst.y+burst.radius*1.4,y=sy+(burst.y-sy)*u;
        ctx.globalAlpha=u*.7;ctx.strokeStyle='#f2bd73';ctx.lineWidth=1.4;
        ctx.beginPath();ctx.moveTo(burst.x,y+30*(1-u));ctx.lineTo(burst.x,y);ctx.stroke();glow(burst.x,y,6,3,u*.8);continue;
      }
      const fade=Math.pow(Math.max(0,1-t/burst.life),.68),spread=1-Math.exp(-t*2.7),fall=t*t*burst.radius*.10;
      glow(burst.x,burst.y,burst.radius*.70,1,Math.max(0,1-t/.65)*.15);
      glow(burst.x,burst.y,burst.radius*.19,4,Math.max(0,1-t/.4)*.65);
      if(t<.65){ctx.globalAlpha=(1-t/.65)*.42;ctx.strokeStyle='#ffe0a0';ctx.lineWidth=1.4;ctx.beginPath();ctx.ellipse(burst.x,burst.y,Math.max(1,burst.radius*spread),Math.max(1,burst.radius*spread*.92),0,0,TAU);ctx.stroke()}
      for(const ray of burst.rays){
        const a=ray.angle+ray.bend*t,r=burst.radius*spread*ray.speed,c=Math.cos(a),s=Math.sin(a);
        const x=burst.x+c*r,y=burst.y+s*r+fall;
        const earlier=Math.max(0,t-.10-t*.08),oldR=burst.radius*(1-Math.exp(-earlier*2.7))*ray.speed;
        const ox=burst.x+Math.cos(ray.angle+ray.bend*earlier)*oldR,oy=burst.y+Math.sin(ray.angle+ray.bend*earlier)*oldR+earlier*earlier*burst.radius*.10;
        ctx.globalAlpha=fade*.95;ctx.strokeStyle=ray.color;ctx.lineWidth=t<.28?1.8:1.1;
        ctx.beginPath();ctx.moveTo(ox,oy);ctx.quadraticCurveTo((ox+x)/2-s*3,(oy+y)/2+c*3,x,y);ctx.stroke();
        if(ray.glow)glow(x,y,3.4+fade*2.7,3,fade*.85);
        if(ray.fork&&t>.7){
          ctx.globalAlpha=fade*.6;ctx.lineWidth=.7;
          for(const sign of [-1,1]){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-c*(8+t*8)+s*sign*8,y-s*(8+t*8)+c*sign*8+t*7);ctx.stroke()}
        }
      }
    }
    ctx.restore();
  }
  window.PuzhaiFireworks={create,draw,duration:6.1};
})();

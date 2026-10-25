/* ============================================================
   МЛД-1 · объёмный тренажёр. Пилот по зоне 6 (череп).
   Всё происходит на одном холсте: выбрали зону — камера уходит
   в неё, тело гаснет, на его месте разворачивается сама зона.
   ============================================================ */
(function(){
"use strict";

var AUTHOR={
  name:"Николай Карушкин",
  channel:"https://t.me/mldosteo",      /* канал */
  me:"https://t.me/nikolay_1903"        /* личные сообщения */
};

var TEST_WINDOW = 6000;     // окно: тест должен попасть в 6 секунд после провокации

/* метки стоят прямо на костях своей зоны и чередуются по сторонам,
   чтобы не налезать друг на друга на маленьком экране */
var ZONES = [
  {id:1, name:"Нога: от большого вертела и ниже",  area:"Нога",        p:[ 0.135, 0.875, 0.000]}, /* правый большой вертел */
  {id:2, name:"Малый таз: крестец S1–S5, симфиз",  area:"Малый таз",   p:[-0.100, 0.985,-0.020]}, /* левое крыло таза */
  {id:3, name:"Висцералка, Th8–Th12, L1–L5",       area:"Живот",       p:[ 0.090, 1.140, 0.010]}, /* правое нижнее ребро */
  {id:4, name:"Лёгкие, сердце, перикард, Th1–Th7", area:"Грудь",       p:[-0.095, 1.330, 0.020]}, /* левое верхнее ребро */
  {id:5, name:"Плечи и шея: C1–C7",                area:"Плечи и шея", p:[ 0.000, 1.445, 0.020]}, /* яремная вырезка, переход к шее */
  {id:6, name:"Голова: череп и его содержимое",    area:"Голова",      p:[ 0.000, 1.615, 0.020]}  /* череп */
];
var ZBY={}; ZONES.forEach(function(z){ ZBY[z.id]=z; });

var TECHNIQUES=[
  {id:"myofascial", name:"Миофасциальный релиз"},
  {id:"joint",      name:"Суставная мобилизация"},
  {id:"isometric",  name:"Изометрическое расслабление"},
  {id:"osteo",      name:"Остеопатическая коррекция"},
  {id:"trigger",    name:"Триггерная точка", only:"muscle"}
];
/* техники под найденную ткань: триггерная точка — только для мышц */
function techniques(){
  return TECHNIQUES.filter(function(t){ return !t.only || t.only===S.structure; });
}
var STRUCTURES=[
  {id:"muscle",  label:"Мышцы"},
  {id:"ligament",label:"Связки"},
  {id:"vessel",  label:"Сосуды"},
  {id:"nerve",   label:"Нервы"},
  {id:"adhesion",label:"Спайки"}
];

function structLevel(kind){
  var extra={
    joint:[{id:"disc",label:"Суставной диск"},{id:"capsule",label:"Капсула и связки"}],
    visc :[{id:"serosa",label:"Брюшина"},{id:"mucosa",label:"Слизистая"},{id:"mesentery",label:"Брыжейка"}],
    heart:[{id:"pericard",label:"Перикард"},{id:"myocard",label:"Миокард"}],
    neuro:[{id:"meninges",label:"Оболочки мозга"},{id:"liquor",label:"Ликвор"}]
  };
  var list = (extra[kind]||[]).concat(STRUCTURES);
  return {title:"Тип структуры", options: list.map(function(x){
    return {id:x.id, label:x.label, parts:[], ctx:[]};
  })};
}
/* каскад нужной зоны */
function cascadeFor(id){
  var f={1:casc1,2:casc2,3:casc3,4:casc4,5:casc5,6:casc6}[id];
  return f(structLevel);
}

var VAULT=["sk_frontal","sk_parietalL","sk_parietalR","sk_occipital","sk_temporalR","sk_temporalL"];
var FOCUS=null;   // выбранная кость: остальное гаснет
var BONE_COLOR={
  sk_frontal:[0.94,0.68,0.30], sk_parietalR:[0.36,0.72,0.56], sk_parietalL:[0.34,0.58,0.82],
  sk_occipital:[0.82,0.44,0.60], sk_sphenoid:[0.95,0.82,0.30],
  sk_temporalR:[0.84,0.45,0.32], sk_temporalL:[0.56,0.46,0.84],
  sk_mandible:[0.66,0.71,0.79], sk_face:[0.60,0.68,0.76],
  sk_ethmoid:[0.74,0.56,0.74], sk_ossicles:[0.88,0.86,0.80]
};


/* ---------------- сцена ---------------- */
window.SKULL = window.SKULL || {};
window.INSIDE = window.INSIDE || {};
var R, gl, MARKERS={}, pickMap={}, pickSeq=1;
var JOINT_COLOR=[0.20,0.78,0.74];
var els={};

function b64(s,T){ var b=atob(s),u=new Uint8Array(b.length);
  for(var i=0;i<b.length;i++) u[i]=b.charCodeAt(i); return new T(u.buffer); }

function upload(rec){
  if(!R.bigIndex) throw new Error("WebGL без 32-битных индексов");
  var m={pos:gl.createBuffer(),nrm:gl.createBuffer(),idx:gl.createBuffer(),
         count:rec.n,type:gl.UNSIGNED_INT};
  var P,N;
  if(rec.qs){                       /* сжатая запись: целые числа плюс масштаб */
    P=b64(rec.pos,Uint16Array); N=b64(rec.nrm,Int8Array);
    m.posType=gl.UNSIGNED_SHORT; m.nrmType=gl.BYTE; m.nrmNorm=true;
    m.q={o:rec.qo, s:rec.qs};
  } else {
    P=b64(rec.pos,Float32Array); N=b64(rec.nrm,Float32Array);
  }
  var I=b64(rec.idx,Uint32Array);
  gl.bindBuffer(gl.ARRAY_BUFFER,m.pos); gl.bufferData(gl.ARRAY_BUFFER,P,gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER,m.nrm); gl.bufferData(gl.ARRAY_BUFFER,N,gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,m.idx); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,I,gl.STATIC_DRAW);
  if(rec.rs){
    var og=b64(rec.ro,Float32Array);
    for(var i=0;i<og.length;i+=3){ og[i]-=CTR[0]; og[i+1]-=CTR[1]; og[i+2]-=CTR[2]; }
    var bb=rec.rb ? b64(rec.rb,Float32Array) : null;
    if(bb) for(var j=0;j<bb.length;j+=3){ bb[j]-=CTR[0]; bb[j+1]-=CTR[1]; bb[j+2]-=CTR[2]; }
    m.ranges={start:b64(rec.rs,Uint32Array), count:b64(rec.rc,Uint32Array), org:og, box:bb};
  }
  /* Текст в base64 больше не нужен: геометрия уже в видеопамяти.
     Если его не отпустить, скелет, череп и ткани висят в памяти
     страницы десятками мегабайт — на телефоне это и добивает Safari. */
  rec.pos=null; rec.nrm=null; rec.idx=null; rec.rs=null; rec.rc=null; rec.ro=null; rec.rb=null;
  return m;
}
/* матрица объекта с учётом распаковки координат */
function meshModel(mesh, T){
  if(!mesh.q) return T;
  var q=mesh.q;
  return M4.mul(T, M4.mul(M4.translate(q.o[0],q.o[1],q.o[2]), M4.scale(q.s,q.s,q.s)));
}

var CTR, PARTS={}, BODYKEYS=[], SKULLKEYS=[], SOFTKEYS=[], JOINTKEYS=[];
var ADD_T;
function addPart(key, rec, kind){
  var mesh=upload(rec);
  var ob={mesh:mesh, model:meshModel(mesh,ADD_T), color:[0.86,0.835,0.78], base:[0.86,0.835,0.78],
          alpha:0, hidden:true, name:key, kind:kind, pickId:pickSeq++};
  pickMap[ob.pickId]=key; PARTS[key]=ob; R.objects.push(ob); return ob;
}
/* Череп и мягкие ткани весят пять мегабайт и нужны не в каждом случае,
   поэтому при старте их не грузим — подтягиваем на входе в зону. */
function registerSkull(){
  if(SKULLKEYS.length || !window.SKULL) return;
  Object.keys(SKULL).forEach(function(k){ if(k[0]==="_") return;
    addPart("sk_"+k, SKULL[k], "skull"); SKULLKEYS.push("sk_"+k); });
}
function registerInside(){
  if(SOFTKEYS.length || !window.INSIDE) return;
  Object.keys(INSIDE).forEach(function(k){ if(k[0]==="_") return;
    var ob=addPart(k, INSIDE[k], "soft");
    ob.color=ob.base=SOFT_COLOR[k]||[0.80,0.66,0.62]; SOFTKEYS.push(k); });
}
var FILE_WAIT={};
function loadFile(name, cb){
  if(FILE_WAIT[name]==="done") return cb();
  if(FILE_WAIT[name]){ FILE_WAIT[name].push(cb); return; }
  FILE_WAIT[name]=[cb];
  var sc=document.createElement("script"); sc.src=name;
  sc.onload=sc.onerror=function(){
    var q=FILE_WAIT[name]; FILE_WAIT[name]="done";
    (q||[]).forEach(function(f){ f(); });
  };
  document.head.appendChild(sc);
}
/* что нужно зоне: шестой — череп и его содержимое, третьей и четвёртой — органы */
function ensureZoneData(id, cb){
  var v=ZONE_VIEW[id], need=[];
  if(v.skull) need.push("skull.js");
  if(v.skull || v.inside || (v.parts||[]).some(function(k){ return SOFT_COLOR[k]; })) need.push("inside.js");
  var left=need.length;
  if(!left) return cb();
  need.forEach(function(f){
    loadFile(f, function(){
      if(f==="skull.js") registerSkull(); else registerInside();
      if(--left===0) cb();
    });
  });
}

function buildScene(){
  CTR = BONES._meta.center;
  ADD_T = M4.translate(-CTR[0],-CTR[1],-CTR[2]);
  var T = ADD_T;
  Object.keys(BONES).forEach(function(k){ if(k[0]==="_") return;
    addPart(k, BONES[k], "body"); BODYKEYS.push(k); });
  Object.keys(JOINTS).forEach(function(k){
    var j=JOINTS[k], g=ellipsoid(j.r[0],j.r[1],j.r[2],22,15);
    var ob={mesh:R.upload(g), model:M4.translate(j.p[0]-CTR[0], j.p[1]-CTR[1], j.p[2]-CTR[2]),
            color:JOINT_COLOR, base:JOINT_COLOR, alpha:0, hidden:true,
            name:k, kind:"joint", marker:true, pickId:pickSeq++};
    pickMap[ob.pickId]=k; PARTS[k]=ob; R.objects.push(ob); JOINTKEYS.push(k);
  });
}
function partRec(k){
  if(PARTS[k] && PARTS[k].kind==="joint"){ var j=JOINTS[k];
    return {center:j.p, size:[j.r[0]*2,j.r[1]*2,j.r[2]*2]}; }
  if(k.indexOf("sk_")===0) return SKULL[k.slice(3)];
  return BONES[k] || INSIDE[k];
}
function world(p){ return [p[0]-CTR[0], p[1]-CTR[1], p[2]-CTR[2]]; }

/* ---------------- слои тканей ----------------
   Мышцы, связки, сосуды и нервы лежат отдельными файлами по зонам
   и подгружаются только тогда, когда каскад до них дошёл. */
var TISSUE_COLOR={
  muscle:[0.74,0.28,0.25], ligament:[0.88,0.84,0.68],
  vessel:[0.58,0.14,0.30], nerve:[0.86,0.66,0.10]
};
var TISSUE_RU={muscle:"Мышцы", ligament:"Связки", vessel:"Сосуды", nerve:"Нервы"};
var TIS_DATA={}, TIS_WAIT={}, TIS_OBJ={};
window.TISSUE=function(key, rec){
  TIS_DATA[key]=rec;
  (TIS_WAIT[key]||[]).forEach(function(f){ f(rec); });
  TIS_WAIT[key]=null;
};
function loadTissue(key, cb){
  if(TIS_DATA[key]!==undefined) return cb(TIS_DATA[key]);
  if(TIS_WAIT[key]){ TIS_WAIT[key].push(cb); return; }
  TIS_WAIT[key]=[cb];
  var sc=document.createElement("script");
  sc.src="tissue/"+key+".js";
  sc.onerror=function(){ window.TISSUE(key,null); };
  document.head.appendChild(sc);
}
/* каждая мышца получает свой оттенок — иначе они сливаются в один кусок мяса */
function shadeRanges(n, base){
  var t=new Float32Array(n*3);
  for(var i=0;i<n;i++){
    var h=Math.sin(i*12.9898)*43758.5453; h=h-Math.floor(h);      // псевдослучайно, но стабильно
    var g=Math.sin(i*78.233)*24634.6345;  g=g-Math.floor(g);
    var k=0.62+0.72*h;                     // от тёмно-бордовой до светлой
    var w=g*0.55;                          // часть мышц уходит в розовато-охристый
    var hi=[0.88,0.56,0.44];
    t[i*3]  =Math.min(1,(base[0]*(1-w)+hi[0]*w)*k);
    t[i*3+1]=Math.min(1,(base[1]*(1-w)+hi[1]*w)*k);
    t[i*3+2]=Math.min(1,(base[2]*(1-w)+hi[2]*w)*k);
  }
  return t;
}
function tissueObj(key, tis){
  if(TIS_OBJ[key]!==undefined) return TIS_OBJ[key];
  var rec=TIS_DATA[key];
  if(!rec){ TIS_OBJ[key]=null; return null; }
  var mesh=upload(rec);
  var ob={mesh:mesh, model:meshModel(mesh, M4.translate(-CTR[0],-CTR[1],-CTR[2])),
          color:TISSUE_COLOR[tis], base:TISSUE_COLOR[tis], center:rec.center,
          alpha:0, hidden:true, kind:"tissue", twoSided:true, name:key};
  if(mesh.ranges) mesh.ranges.tint = shadeRanges(mesh.ranges.start.length, TISSUE_COLOR[tis]);
  TIS_OBJ[key]=ob; R.objects.push(ob);
  return ob;
}
/* рамка по видимым структурам слоя */
function tissueFrame(ob){
  var rg=ob.mesh.ranges, cl=ob.clip;
  if(!rg || !rg.box || !cl) return null;
  var lo=[1e9,1e9,1e9], hi=[-1e9,-1e9,-1e9], any=false;
  for(var r=0;r<rg.start.length;r++){
    var j=r*3, o=rg.org;
    if(o[j]<cl.lo[0]||o[j]>cl.hi[0]||o[j+1]<cl.lo[1]||o[j+1]>cl.hi[1]||
       o[j+2]<cl.lo[2]||o[j+2]>cl.hi[2]) continue;
    var k=r*6, b=rg.box;
    for(var i=0;i<3;i++){
      lo[i]=Math.min(lo[i], b[k+i]); hi[i]=Math.max(hi[i], b[k+3+i]);
    }
    any=true;
  }
  if(!any) return null;
  var rad=Math.max(hi[0]-lo[0],hi[1]-lo[1],hi[2]-lo[2])/2;
  var c=[(lo[0]+hi[0])/2,(lo[1]+hi[1])/2,(lo[2]+hi[2])/2];
  var half=Math.tan(0.36), d;
  if(isNarrow()){
    var f=freeBand();
    var rx=0.5*Math.sqrt(Math.pow(hi[0]-lo[0],2)+Math.pow(hi[2]-lo[2],2));
    var ry=0.5*(hi[1]-lo[1]);
    d=Math.max(ry/(half*(f.h/f.H)), rx/(half*(f.W/f.H)*(f.w/f.W)))/1.12;
  } else {
    var W=R.canvas.width||1280, H=R.canvas.height||860;
    d=Math.max(rad/half, rad/(half*(W/H)*0.55));
  }
  d=Math.max(0.20, d*1.12);
  return {target:bandTarget(c,d), dist:d};
}
function hideTissue(){
  Object.keys(TIS_OBJ).forEach(function(k){
    if(TIS_OBJ[k]){ TIS_OBJ[k].hidden=true; TIS_OBJ[k].alpha=0; } });
}
/* показать ткань выбранного типа в границах текущего отдела */
function showTissue(tis, on){
  hideTissue();
  if(!on || !TISSUE_COLOR[tis]) { paintLegend(); return; }
  var key="z"+S.priority+"-"+tis;
  loadTissue(key, function(rec){
    if(!rec) return;
    var ob=tissueObj(key, tis); if(!ob) return;
    if(S.tissueType!==tis) return;            /* пока грузили, выбор сменился */
    ob.hidden=false; ob.alpha=1;
    ob.clip = S.regionBox ? {lo:new Float32Array(S.regionBox.lo),
                             hi:new Float32Array(S.regionBox.hi)} : null;
    /* кости приглушаем, чтобы ткань читалась поверх них */
    VIEWKEYS.forEach(function(k){ var b=PARTS[k]; if(!b) return;
      if(b.kind==="joint") return;
      b.alpha=Math.min(b.alpha, 0.20); });
    /* камера отходит ровно настолько, чтобы влезли показанные структуры */
    if(!S.tissueFramed){
      S.tissueFramed=true;
      var fr=tissueFrame(ob);
      if(fr) R.flyTo({az:R.cam.az, el:R.cam.el, dist:fr.dist,
                      target:bandTarget(fr.target, fr.dist)}, 750);
      else if(S.regionKeys && S.regionKeys.length){
        var c=bonesCenter(S.regionKeys), dd=fitDist(S.regionKeys)*1.55;
        if(c) R.flyTo({az:R.cam.az, el:R.cam.el, dist:dd, target:bandTarget(c,dd)}, 750);
      }
    }
    paintLegend();
  });
}
/* коробка отдела, в которой показываем ткань */
function setRegionBox(keys){
  S.regionKeys=keys.slice(); S.tissueFramed=false;
  var b=bonesBox(keys);
  if(!b){ S.regionBox=null; return; }
  /* режем поперёк длинной оси отдела, вдоль коротких — отпускаем,
     иначе ткань выглядит распиленной коробкой */
  var sz=[b.hi[0]-b.lo[0], b.hi[1]-b.lo[1], b.hi[2]-b.lo[2]];
  var mx=Math.max(sz[0],sz[1],sz[2]), lo=[], hi=[];
  for(var i=0;i<3;i++){
    var pad=0.035 + 0.75*(mx-sz[i]);
    lo.push(b.lo[i]-pad-CTR[i]); hi.push(b.hi[i]+pad-CTR[i]);
  }
  /* односторонний отдел не должен перетягивать ткань с другой ноги или руки */
  if(b.lo[0] > 0.012)      lo[0]=Math.max(lo[0], 0.006-CTR[0]);
  else if(b.hi[0] < -0.012) hi[0]=Math.min(hi[0], -0.006-CTR[0]);
  S.regionBox={lo:lo, hi:hi};
}
function bonesBox(keys){
  var lo=[1e9,1e9,1e9], hi=[-1e9,-1e9,-1e9], any=false;
  keys.forEach(function(k){
    var r=partRec(k); if(!r||!r.center) return;
    var c=r.center, sz=r.size||[0.02,0.02,0.02];
    for(var i=0;i<3;i++){ lo[i]=Math.min(lo[i],c[i]-sz[i]/2); hi[i]=Math.max(hi[i],c[i]+sz[i]/2); }
    any=true; });
  if(!any) return null;
  return {c:[(lo[0]+hi[0])/2,(lo[1]+hi[1])/2,(lo[2]+hi[2])/2], lo:lo, hi:hi,
          r:Math.max(hi[0]-lo[0],hi[1]-lo[1],hi[2]-lo[2])/2};
}
function bonesCenter(keys){ var b=bonesBox(keys); return b?world(b.c):null; }
/* дистанция камеры, чтобы кости заняли кадр целиком.
   По бокам панели, поэтому по горизонтали считаем на суженный кадр. */
/* ---- кадр на узком экране ----------------------------------------------
   На широком панели стоят по бокам, и всё остаётся как было.
   На узком они занимают верх, поэтому свободную область меряем по DOM. */
function isNarrow(){ return (R.canvas.clientWidth||1280) <= 900; }
function freeBand(){
  var W=R.canvas.clientWidth||1280, H=R.canvas.clientHeight||860;
  var top=8, bot=H-8, left=8, right=W-8;
  function rc(el){ if(!el||el.hidden) return null;
    var q=el.getBoundingClientRect(); return (q.width&&q.height)?q:null; }
  var hd=rc(els.head), lg=rc(els.legend), pn=rc(els.panel),
      sd=rc(document.getElementById("side"));
  if(isNarrow()){
    /* панели занимают верх — свободна нижняя полоса во всю ширину.
       Верхнюю границу не нарушаем никогда: модель не должна уходить под панель. */
    if(hd) top=Math.max(top, hd.bottom+8);
    if(lg && lg.top<H*0.5) top=Math.max(top, lg.bottom+8);
    /* место под панель теста заранее не резервируем: пока её нет, модель
       должна быть крупной — по меткам зон надо попадать пальцем.
       Когда панель открыта, она закрывает низ модели, и это нормально:
       в этот момент человек работает с панелью, а не с картинкой. */
    if(pn) bot=Math.min(bot, pn.top-8);
    else bot=Math.min(bot, H-Math.max(26, H*0.07));  /* запас под нижнюю панель браузера */
    if(bot-top < H*0.20) bot=H-10;      /* совсем тесно — забираем низ, верх не трогаем */
  }else{
    /* панели стоят колоннами по бокам — свободен проём между ними */
    if(hd) left=Math.max(left, hd.right+12);
    if(sd) right=Math.min(right, sd.left-12);
    if(pn) bot=Math.min(bot, pn.top-10);
    else bot=Math.min(bot, S.screen==="intro" ? H-14 : H-60);
    if(right-left < W*0.30){ left=8; right=W-8; }
    if(bot-top < H*0.35){ top=8; bot=H-8; }
  }
  return {top:top, bot:bot, left:left, right:right,
          w:right-left, h:bot-top, W:W, H:H};
}
function fitDist(keys, margin){
  var b=bonesBox(keys); if(!b) return 0.34;
  var half=Math.tan(0.36), f=freeBand();
  var sx=b.hi[0]-b.lo[0], sy=b.hi[1]-b.lo[1], sz=b.hi[2]-b.lo[2];
  var rx=0.5*Math.sqrt(sx*sx+sz*sz), ry=0.5*sy;   /* худший случай по азимуту */
  var asp=(R.canvas.width/R.canvas.height)||(f.W/f.H);
  var dy=ry/(half*(f.h/f.H));
  var dx=rx/(half*asp*(f.w/f.W));
  return Math.max(0.20, Math.max(dy,dx)*(margin||1.06));
}
/* сдвигаем цель так, чтобы модель встала по центру свободного проёма */
function bandTarget(t, dist){
  if(!t) return t;
  var f=freeBand();
  var wantPx=(f.top+f.bot)/2 - f.H/2;            /* насколько ниже центра экрана */
  var worldPerPx=(dist*Math.tan(0.36))/(f.H/2);
  return [t[0], t[1] + wantPx*worldPerPx, t[2]];
}
/* куда и с какого расстояния смотреть на зону */
function fitCam(keys, az, el){
  var b=bonesBox(keys), d=fitDist(keys,1.08);
  return {az:az, el:el, dist:d, target:bandTarget(b?world(b.c):[0,0,0], d)};
}

/* ---------------- состояние ---------------- */
var S={
  screen:"intro", weakZones:[], priority:null, tested:{}, tapped:{},
  casc:null, depth:0, trail:[], truePath:[], results:{}, structure:null,
  regionBox:null, regionKeys:null, tissueFramed:false, tissueType:null, framedFor:null,
  spread:0, treatRound:0, plan:[], techTried:{}, techAttempts:0,
  winHit:0, winTotal:0, t0:0
};

function shuffle(a){ a=a.slice();
  for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1)),t=a[i];a[i]=a[j];a[j]=t;} return a; }

/* Приоритетная зона идёт «мешком»: пока не выпадут все шесть,
   ни одна не повторится. Мешок переживает перезагрузку страницы. */
var BAG_KEY="mld1-zone-bag";
function loadBag(){
  try{ var v=JSON.parse(localStorage.getItem(BAG_KEY)); 
       if(v && v.bag instanceof Array) return v; }catch(e){}
  return {bag:[], last:0};
}
function saveBag(v){ try{ localStorage.setItem(BAG_KEY, JSON.stringify(v)); }catch(e){} }
function nextPriority(){
  var st=loadBag();
  if(!st.bag.length){
    st.bag=shuffle([1,2,3,4,5,6]);
    /* не даём двум одинаковым зонам встретиться на стыке мешков */
    if(st.bag[0]===st.last){ var t=st.bag[0]; st.bag[0]=st.bag[st.bag.length-1]; st.bag[st.bag.length-1]=t; }
  }
  var z=st.bag.shift(); st.last=z; saveBag(st);
  return z;
}

function newCase(){
  var n=[1,2,2,3,3][Math.floor(Math.random()*5)];
  S.priority = nextPriority();
  var rest = shuffle([1,2,3,4,5,6].filter(function(z){ return z!==S.priority; })).slice(0,n-1);
  S.weakZones = rest.concat([S.priority]).sort(function(a,b){return a-b;});
  S.tested={}; S.tapped={}; S.casc=null; S.depth=0; S.trail=[]; S.results={};
  S.framedFor=null;
  S.structure=null; S.regionBox=null; S.regionKeys=null; S.tissueFramed=false;
  S.tissueType=null; hideTissue();
  // истинный путь
  var path=[], node=cascadeFor(S.priority);
  while(node){
    var o=node.options[Math.floor(Math.random()*node.options.length)];
    path.push(o.id); node=o.next;
  }
  S.truePath=path;
  S.structure=path[path.length-1];      /* последний шаг каскада — тип ткани */
  S.plan = shuffle(techniques().map(function(t){return t.id;})).slice(0,[1,1,2,2,3][Math.floor(Math.random()*5)]);
  S.treatRound=0; S.techTried={}; S.techAttempts=0; S.spread=0; S.zoneFramed=null;
  S.winHit=0; S.winTotal=0; S.t0=Date.now();
}

/* ---------------- журнал ---------------- */
function log(text, badge, tone){
  var li=document.createElement("li");
  li.innerHTML='<span></span><b class="'+(tone||"info")+'">'+badge+'</b>';
  li.firstChild.textContent=text;
  els.log.insertBefore(li, els.log.firstChild);
}

/* ---------------- панель теста ---------------- */
var unit=null;
function TestPanel(cfg){
  // cfg: {title, hint, steps:[{label,tone}], resolve():"strong"|"weak", onResult, onMiss, strongText, weakText}
  var idx=0, t0=null, raf=null, done=false;
  var host=els.panel;
  host.hidden=false;
  host.dataset.state="idle";
  host.innerHTML=
    '<div class="ph"><span class="pt"></span><span class="pc num">—</span></div>'+
    (cfg.hint?'<div class="phint">'+cfg.hint+'</div>':'')+
    '<div class="pbar"><i></i></div>'+
    '<div class="pst"></div>'+
    '<div class="pbtns"></div>';
  host.querySelector(".pt").textContent=cfg.title;
  document.body.dataset.testing="1";   /* на телефоне шапка сжимается до заголовка */
  refitForPanel();
  var bar=host.querySelector(".pbar i"), clock=host.querySelector(".pc"),
      st=host.querySelector(".pst"), btns=host.querySelector(".pbtns");

  cfg.steps.forEach(function(s,i){
    var b=document.createElement("button");
    b.type="button"; b.className="sb"; b.dataset.tone=s.tone||"";
    b.textContent=s.label; b.disabled=i!==0;
    b.dataset.current = i===0?"true":"false";
    b.addEventListener("click", function(){ step(i); });
    btns.appendChild(b);
  });
  st.textContent = cfg.steps.length>1
    ? "Начните с провокации — после неё пойдёт отсчёт 6 секунд."
    : "Нажмите, чтобы провести тест.";

  function arr(){ return Array.prototype.slice.call(btns.children); }
  function paint(){ arr().forEach(function(b,i){
    b.disabled = i!==idx; b.dataset.current = i===idx?"true":"false";
    b.dataset.done = i<idx?"true":"false"; }); }

  function tick(ts){
    if(t0===null) t0=ts;
    var left=TEST_WINDOW-(ts-t0);
    if(left<=0){ expire(); return; }
    bar.style.width=(left/TEST_WINDOW*100).toFixed(1)+"%";
    var w=left<2000;
    bar.dataset.warn=w?"true":"false"; clock.dataset.warn=w?"true":"false";
    clock.textContent=(left/1000).toFixed(1)+" с";
    raf=requestAnimationFrame(tick);
  }
  function stop(){ if(raf) cancelAnimationFrame(raf); raf=null; }

  function expire(){
    if(done) return; done=true; stop();
    bar.style.width="0%"; clock.textContent="0.0 с";
    host.dataset.state="miss"; st.dataset.tone="miss";
    st.textContent="Окно 6 секунд закрыто — результат недостоверен. Провоцируйте заново.";
    arr().forEach(function(b){ b.disabled=true; b.dataset.current="false"; });
    S.winTotal++;
    var again=document.createElement("button");
    again.type="button"; again.className="sb"; again.textContent="Провоцировать заново";
    again.addEventListener("click", function(){ unit=TestPanel(cfg); });
    btns.appendChild(again);
    if(cfg.onMiss) cfg.onMiss();
  }

  function step(i){
    if(done||i!==idx) return;
    var last = idx===cfg.steps.length-1;
    if(idx===0 && cfg.steps.length>1){ host.dataset.state="open"; raf=requestAnimationFrame(tick); }
    if(last){
      done=true; stop(); idx++; paint();
      if(cfg.steps.length>1){ S.winTotal++; S.winHit++; }
      var res=cfg.resolve();
      host.dataset.state=res; st.dataset.tone=res;
      st.textContent = res==="strong" ? (cfg.strongText||"Тест сильный.") : (cfg.weakText||"Тест слабый.");
      clock.dataset.warn="false"; clock.textContent = cfg.steps.length>1?"в окне ✓":"";
      bar.style.width="100%"; bar.dataset.warn="false";
      if(cfg.onResult) cfg.onResult(res);
      return;
    }
    idx++; paint();
    if(idx===cfg.steps.length-1){ st.dataset.tone=""; st.textContent="Окно открыто — успейте провести тест."; }
  }
  return {close:function(){ stop(); host.hidden=true; }};
}
function closePanel(){
  if(unit) unit.close(); unit=null; els.panel.hidden=true;
  document.body.dataset.testing="";
  /* сам кадр здесь НЕ пересчитываем: за закрытием панели может идти
     перелёт в зону, и лишний полёт камеры его перебивал. Просто сбрасываем
     метки — экран пересчитает кадр, когда отрисует себя. */
  S.framedFor=null; S.zoneFramed=null;
  if(R) R.invalidate(600);
}
/* панель теста меняет высоту свободного места — на телефоне пересчитываем кадр,
   чтобы модель осталась видна целиком и во время провокации */
function refitForPanel(){
  if(!isNarrow()) return;
  if(S.screen==="stage2" || S.screen==="stage3"){ S.framedFor=null; refitBody(); return; }
  if(S.screen==="zone" || S.screen==="treat") reframeZone(420, true);
}

/* ---------------- вывод в компьютер ---------------- */
function computerStep(caption, onDone){
  var host=els.panel; host.hidden=false; host.dataset.state="computer";
  document.body.dataset.testing="1";
  host.innerHTML='<div class="ph"><span class="pt">Вывод в компьютер</span><span class="pc num">—</span></div>'+
    '<div class="phint">'+caption+'</div>'+
    '<div class="pbar"><i></i></div><div class="pst"></div><div class="pbtns"></div>';
  var bar=host.querySelector(".pbar i"), clock=host.querySelector(".pc"),
      st=host.querySelector(".pst"), btns=host.querySelector(".pbtns");
  var b=document.createElement("button");
  b.type="button"; b.className="sb"; b.dataset.tone="test"; b.dataset.current="true";
  b.textContent="Вывести в компьютер"; btns.appendChild(b);
  refitForPanel();
  var raf=null,t0=null,done=false;
  st.textContent="Окно открыто — нажмите «Вывести в компьютер»."; 
  function tick(ts){ if(t0===null)t0=ts;
    var left=TEST_WINDOW-(ts-t0);
    if(left<=0){ miss(); return; }
    bar.style.width=(left/TEST_WINDOW*100).toFixed(1)+"%";
    var w=left<2000; bar.dataset.warn=w?"true":"false"; clock.dataset.warn=w?"true":"false";
    clock.textContent=(left/1000).toFixed(1)+" с"; raf=requestAnimationFrame(tick); }
  function miss(){ if(done)return; if(raf)cancelAnimationFrame(raf); raf=null;
    bar.style.width="0%"; clock.textContent="0.0 с";
    st.dataset.tone="miss";
    st.textContent="Шесть секунд вышли. Нажмите «Начать отсчёт заново» — и успейте вывести в компьютер.";
    b.disabled=true; b.dataset.current="false";
    if(!btns.querySelector(".again")){
      var again=document.createElement("button");
      again.type="button"; again.className="sb again"; again.dataset.current="true";
      again.textContent="Начать отсчёт заново";
      again.addEventListener("click", function(){
        if(again.parentNode) again.parentNode.removeChild(again);
        t0=null; done=false;
        st.dataset.tone=""; st.textContent="Окно открыто — нажмите «Вывести в компьютер».";
        b.disabled=false; b.dataset.current="true"; b.onclick=fin;
        raf=requestAnimationFrame(tick);
      });
      btns.appendChild(again);
    }
    log("Вывод в компьютер — опоздание","мимо","weak"); }
  function fin(){ if(done)return; done=true; if(raf)cancelAnimationFrame(raf);
    bar.style.width="100%"; bar.dataset.warn="false"; clock.dataset.warn="false";
    b.disabled=true; b.dataset.done="true"; b.dataset.current="false";
    S.spread++; st.dataset.tone="strong"; st.textContent="Фокус сужен · шаг "+S.spread;
    log("Вывод в компьютер · шаг "+S.spread,"позиция","info");
    setTimeout(onDone,600); }
  b.onclick=fin; raf=requestAnimationFrame(tick);
}

/* ---------------- маркеры зон ---------------- */
function buildMarkers(){
  ZONES.forEach(function(z){
    var d=document.createElement("button");
    d.type="button"; d.className="mk"; d.textContent=z.id;
    d.title="Зона "+z.id+" · "+z.name;
    d.addEventListener("click", function(e){ e.stopPropagation(); onZone(z.id); });
    els.markers.appendChild(d);
    MARKERS[z.id]={el:d, zone:z};
  });
}
/* Метки стоят там, где им положено анатомически. На маленьком экране
   соседи по высоте могут сойтись — тогда чуть раздвигаем их, но только
   внутри одной стороны тела, и держим всех в видимой полосе. */
function spreadMarks(list, gap){
  if(!list.length) return;
  var f=freeBand(), r=gap/2+2, W=R.canvas.clientWidth||360, pass, i, j;
  /* мягкое расталкивание: если два кружка сошлись, обоих чуть разводим
     в стороны друг от друга — смещение минимальное, привязка к кости цела */
  for(pass=0; pass<4; pass++){
    var moved=false;
    for(i=0;i<list.length;i++) for(j=i+1;j<list.length;j++){
      var a=list[i], b=list[j];
      var dx=b.x-a.x, dy=b.y-a.y, d=Math.sqrt(dx*dx+dy*dy);
      if(d>=gap) continue;
      if(d<0.01){ dx=0; dy=1; d=1; }
      var push=(gap-d)/2/d;
      a.x-=dx*push; a.y-=dy*push; b.x+=dx*push; b.y+=dy*push;
      moved=true;
    }
    if(!moved) break;
  }
  list.forEach(function(it){
    it.y=Math.max(f.top+r, Math.min(f.bot-r, it.y));
    it.x=Math.max(r+4, Math.min((f.W||W)-r-4, it.x));
  });
}
function paintMarkers(){
  var shown=[];
  ZONES.forEach(function(z){
    var m=MARKERS[z.id], pr=R.project(world(z.p));
    if(!pr || (S.screen!=="stage2" && S.screen!=="stage3")){ m.el.style.display="none"; return; }
    m.el.style.display="";
    shown.push({el:m.el, id:z.id, zp:z.p, x:pr.x, y:pr.y});
    var res=S.screen==="stage3" ? S.tapped[z.id] : S.tested[z.id];
    m.el.dataset.result = res||"";
    var active = S.screen==="stage3" ? (S.weakZones.indexOf(z.id)>=0) : true;
    var lock = S.screen==="stage3" && priorityFound()!==null;
    m.el.dataset.dim = (active && !lock) ? "false" : "true";
    m.el.disabled = !active || lock || (S.screen==="stage3" ? !!S.tapped[z.id] : !!S.tested[z.id]);
  });
  if(isNarrow()) spreadMarks(shown, 34);
  shown.forEach(function(it){
    it.el.style.left=it.x+"px"; it.el.style.top=it.y+"px";
  });
}

/* ---------------- экраны ---------------- */
function setHead(eyebrow, title, text){
  els.eyebrow.textContent=eyebrow; els.title.textContent=title;
  els.text.innerHTML=text||"";
  if(R) R.invalidate(500);     /* высота панели изменилась — метки пересчитать */
}
var VIEWKEYS=[];          // что сейчас на крупном плане
function hideAll(){ Object.keys(PARTS).forEach(function(k){
  var ob=PARTS[k]; ob.hidden=true; ob.alpha=0; ob.highlight=0; }); }
function showSkeleton(){
  hideAll(); VIEWKEYS=[];
  BODYKEYS.forEach(function(k){ var ob=PARTS[k];
    ob.hidden=false; ob.alpha=1; ob.color=ob.base=[0.87,0.845,0.78]; });
}
/* крупный план зоны: только её кости, каждая своим цветом */
function showZone(id){
  var v=ZONE_VIEW[id]; hideAll();
  var keys = v.skull ? SKULLKEYS.slice() : (v.parts||[]).slice();
  if(v.inside) keys=keys.concat(v.inside);
  if(v.joints) keys=keys.concat(v.joints);
  VIEWKEYS=keys;
  keys.forEach(function(k,i){
    var ob=PARTS[k]; if(!ob) return;
    ob.hidden=false; ob.highlight=0;
    if(ob.kind==="joint"){ ob.alpha=0.62; ob.color=ob.base=JOINT_COLOR; }
    else { ob.color=ob.base=colorFor(k,i);
           ob.alpha = ob.kind==="soft" ? 0.30 : 1;
           if(ob.kind==="soft" && v.skull) ob.hidden=true; }
  });
  paintLegend();
}
function colorFor(k,i){
  if(SOFT_COLOR[k]) return SOFT_COLOR[k];
  if(BONE_COLOR[k]) return BONE_COLOR[k];
  return PALETTE[i%PALETTE.length];
}
function labelFor(k){
  if(PARTS[k]&&PARTS[k].kind==="joint") return JOINTS[k].label;
  var r=partRec(k); return (r&&r.label)||k;
}
function go(s){ S.screen=s; render(); }
function render(){
  if(els.head) els.head.dataset.screen=S.screen;
  if(R) R.invalidate(900);     /* панели перестраиваются — дорисуем несколько кадров */
  requestAnimationFrame(function(){ requestAnimationFrame(placeSide); });
  els.steps.querySelectorAll("li").forEach(function(li,i){
    var idx={intro:0,stage1:0,stage2:1,stage3:2,zone:3,treat:4,done:4}[S.screen]||0;
    li.dataset.active=i===idx?"true":"false"; li.dataset.done=i<idx?"true":"false";
  });
  if(S.screen==="intro")  return rIntro();
  if(S.screen==="stage1") return rStage1();
  if(S.screen==="stage2") return rStage2();
  if(S.screen==="stage3") return rStage3();
  if(S.screen==="zone")   return rZone();
  if(S.screen==="treat")  return rTreat();
  if(S.screen==="done")   return rDone();
}

var GUIDE=[
 {n:"1", t:"Эталонная мышца",
  d:"Находим нормотоничную мышцу — ту, что держит позицию. Дальше весь сеанс она работает "+
    "индикатором: отвечает на каждую провокацию и показывает, попали мы или нет."},
 {n:"2", t:"Шесть зон тела",
  d:"Тело условно делим на шесть зон: нога, малый таз, живот, грудь, плечи и шея, голова. "+
    "Провоцируем каждую и тестируем эталонную мышцу. Где тест просел — зона гипотоничная, "+
    "её берём в работу. Где держит — не трогаем."},
 {n:"3", t:"Первопричина",
  d:"Гипотоничных зон обычно несколько, но лечить надо не все. Среди них одна первичная, "+
    "остальные тянутся за ней. Ищем её постукиванием по левому виску: на какой зоне тест "+
    "после постукивания станет сильным — та и есть первопричина. Нашли — останавливаемся "+
    "и сразу выводим в компьютер. Проверять оставшиеся зоны не нужно: вывод должен идти "+
    "за сильным тестом, а не за слабым."},
 {n:"4", t:"Сужение до конкретного",
  d:"Найденную зону делим дальше: сторона — правая или левая, затем отдел, затем тип ткани: "+
    "мышцы, связки, сосуды, нервы или спайки. На каждом шаге спрашиваем тело и идём туда, "+
    "где тест сильный. В конце получаем не «болит нога», а конкретную структуру."},
 {n:"5", t:"Коррекция и проверка",
  d:"Подбираем технику и проверяем тестом. Подошла — проверяем постукиванием, всё ли пролечено. "+
    "Сел тест — значит не всё, берём следующую технику. И так, пока постукивание не оставит "+
    "тест сильным."}
];
function rGuide(){
  var h='<div class="gw"><div class="gh">Что это и как устроено</div>'+
    '<p class="gp">Тренажёр отрабатывает методику поиска первопричины: как от общего «что-то не так» '+
    'дойти до конкретной структуры в конкретном месте. Руки он не заменяет — ощущение слабого теста '+
    'под пальцами берётся только на семинаре. А вот сам алгоритм здесь можно прогнать сколько угодно раз.</p>';
  GUIDE.forEach(function(g){
    h+='<div class="gs"><div class="gn">'+g.n+'</div><div><div class="gt">'+g.t+'</div>'+
       '<div class="gd">'+g.d+'</div></div></div>';
  });
  h+='<p class="gp"><b>Про шесть секунд.</b> Тест должен уложиться в шесть секунд после провокации — '+
     'позже организм отвечает уже на другое. Тренажёр считает, сколько раз вы попали в окно; '+
     'это и есть мера того, насколько вы владеете темпом.</p>'+
     '<p class="gp"><b>Про вывод в компьютер.</b> После каждого сужения разводим ноги шире — '+
     'так организм подтверждает, что принял новый уровень вопроса.</p>'+
     '<div class="pbtns"><button class="sb" data-current="true" id="gstart">Понятно, начать</button>'+
     '<button class="sb" id="gclose">Закрыть</button></div></div>';
  els.guide.innerHTML=h;
  els.guide.hidden=false;
  document.getElementById("gclose").onclick=function(){ els.guide.hidden=true; };
  document.getElementById("gstart").onclick=function(){
    els.guide.hidden=true;
    newCase(); els.log.innerHTML=""; log("Новый случай","старт","info"); go("stage1");
  };
}

function rIntro(){
  closePanel(); FOCUS=null; showSkeleton(); els.legend.hidden=true; VIEWKEYS=[];
  setHead("Методика поиска первопричины","Шесть зон, один экран",
    "Провокация — тест в течение шести секунд — вывод в компьютер. "+
    "Приоритетная зона раскроется прямо на месте тела: кости, суставы, ткани.");
  els.actions.innerHTML='<button class="btn primary" id="go">Начать случай</button>'+
    '<button class="btn" id="gd">Как это устроено</button>';
  document.getElementById("go").onclick=function(){ newCase(); els.log.innerHTML="";
    log("Новый случай","старт","info"); go("stage1"); };
  document.getElementById("gd").onclick=rGuide;
  frameBody(0.45, 0.10, 900);
}

function rStage1(){
  showSkeleton();
  setHead("Этап 1","Эталонная мышца",
    "Найдите нормотоничную мышцу — она будет индикатором на весь сеанс.");
  els.actions.innerHTML="";
  unit=TestPanel({title:"Дельтовидная мышца — базовый тест",
    hint:"Провокации нет, окно не запускается.",
    steps:[{label:"Провести тест",tone:"test"}],
    resolve:function(){ return "strong"; },
    strongText:"Мышца держит позицию — годится как эталон.",
    onResult:function(){ log("Этап 1 · эталон подтверждён","сильный","strong");
      setTimeout(function(){ closePanel(); go("stage2"); },900); }});
}

function rStage2(){
  showSkeleton();
  setHead("Этап 2","Шесть зон тела",
    "Нажимайте зоны прямо на скелете. Слабый тест — зону лечим, сильный — не трогаем.");
  var n=Object.keys(S.tested).length;
  els.actions.innerHTML = n>=6
    ? '<button class="btn primary" id="nx">Далее · приоритетная зона</button>'
    : '<span class="hint">Проверено '+n+' из 6</span>';
  if(n>=6) document.getElementById("nx").onclick=function(){ closePanel(); go("stage3"); };
  refitBody();
}

function onZone(id){
  if(S.screen==="stage2"){
    if(S.tested[id]) return;
    var z=ZBY[id];
    focusOn(z.p);
    unit=TestPanel({title:"Зона "+id+" · "+z.name,
      hint:"Провокация зоны, затем тест эталонной мышцы.",
      steps:[{label:"Провокация зоны",tone:"prov"},{label:"Тест мышцы",tone:"test"}],
      resolve:function(){ return S.weakZones.indexOf(id)>=0?"weak":"strong"; },
      strongText:"Тест сильный — зона в норме, не трогаем.",
      weakText:"Тест слабый — зона дисфункциональна.",
      onResult:function(r){ S.tested[id]=r; paintMarkers();
        log("Этап 2 · зона "+id+" ("+z.area+")", r==="weak"?"слабый":"сильный", r);
        setTimeout(function(){ closePanel(); rStage2(); },1100); },
      onMiss:function(){ log("Этап 2 · зона "+id+" — не успели","мимо","weak"); }});
  } else if(S.screen==="stage3"){
    if(S.tapped[id] || priorityFound()!==null) return;
    var z2=ZBY[id];
    focusOn(z2.p);
    unit=TestPanel({title:"Зона "+id+" · "+z2.name,
      hint:"Провокация → постукивание по левому виску → тест. Всё внутри окна.",
      steps:[{label:"Провокация зоны",tone:"prov"},
             {label:"Постукивание по левому виску",tone:"tap"},
             {label:"Тест мышцы",tone:"test"}],
      resolve:function(){ return id===S.priority?"strong":"weak"; },
      strongText:"Тест стал сильным — зона приоритетная.",
      weakText:"Тест остался слабым — не приоритетная.",
      onResult:function(r){ S.tapped[id]=r; paintMarkers();
        log("Этап 3 · зона "+id+" (постукивание)", r==="strong"?"сильный":"слабый", r);
        setTimeout(function(){ closePanel(); rStage3(); },1100); },
      onMiss:function(){ log("Этап 3 · зона "+id+" — не успели","мимо","weak"); }});
  }
}

/* камера на всю фигуру: считаем по реальному кадру, поэтому и на телефоне влезает */
function bodyCam(az, el){ return fitCam(BODYKEYS, az, el); }
/* один раз на этап подгоняем фигуру под свободную полосу */
/* кадр берём на следующем кадре отрисовки: к этому моменту панель уже
   получила свой текст и её настоящую высоту можно измерить */
function frameBody(az, el, ms){
  var a=(az==null?R.cam.az:az), e=(el==null?R.cam.el:el);
  requestAnimationFrame(function(){ R.flyTo(bodyCam(a, e), ms||600); });
}
function refitBody(){
  if(S.framedFor===S.screen) return;
  S.framedFor=S.screen;
  frameBody(null, null, 500);
}
function focusOn(p){
  var cm=bodyCam(R.cam.az, R.cam.el), w=world(p), c=cm.target;
  /* цель — между центром тела и зоной: фигура целиком остаётся в кадре */
  cm.target=[c[0]+(w[0]-c[0])*0.34, c[1]+(w[1]-c[1])*0.34, c[2]+(w[2]-c[2])*0.34];
  R.flyTo(cm, 700);
}

function priorityFound(){
  for(var i=0;i<S.weakZones.length;i++){
    if(S.tapped[S.weakZones[i]]==="strong") return S.weakZones[i];
  }
  return null;
}
function rStage3(){
  showSkeleton();
  var weak=S.weakZones;
  setHead("Этап 3","Приоритетная зона",
    "Слабых зон "+weak.length+": "+weak.join(", ")+". Провокация, постукивание по <b>левому виску</b>, тест. "+
    "Где тест сильный — там первопричина.");
  var found = priorityFound();
  if(found===null){ els.actions.innerHTML='<span class="hint">Проверяйте зоны по одной</span>';
    refitBody(); return; }
  refitBody();
  S.priority=found;
  els.actions.innerHTML='<span class="hint">Приоритетная — зона '+found+'</span>';
  log("Этап 3 · приоритетная зона — "+found,"приоритет","strong");
  computerStep("Зона найдена. В течение шести секунд разведите ноги — организм сузит ответ.",
    function(){ closePanel(); diveToZone(found); });
}

function diveToZone(id){
  var v=ZONE_VIEW[id], z=ZBY[id];
  setHead("Переход","Ныряем в зону "+id,"Тело уходит, на его месте — "+z.area.toLowerCase()+".");
  els.actions.innerHTML="";
  var sync=true, arrived=false;
  function fly(ms){
    var keys = v.fit || (v.skull?SKULLKEYS:(v.parts||[])).concat(v.joints||[]);
    R.flyTo(fitCam(keys, v.az, v.el), ms, function(){
      showZone(id); S.casc=cascadeFor(id); S.depth=0; go("zone");
      /* легенда и шапка появились только сейчас — меряем кадр заново */
      S.zoneFramed=null; reframeZone(420);
    });
  }
  ensureZoneData(id, function(){ arrived=true; if(!sync) fly(700); });
  sync=false;
  if(arrived) fly(1400);
  else {
    /* данные ещё качаются — подлетаем вслепую, чтобы экран не стоял */
    els.text.innerHTML += '<br><i>Загружаю анатомию зоны…</i>';
    R.flyTo({az:v.az, el:v.el, dist:R.cam.dist*0.8, target:R.cam.target.slice()}, 1400);
  }
  /* тело плавно гаснет, пока камера подходит */
  var fade=function(a){ BODYKEYS.forEach(function(k){ PARTS[k].alpha=a; }); };
  setTimeout(function(){ fade(0.28); }, 500);
  setTimeout(function(){ fade(0.07); }, 950);
}

/* ---------------- каскад по черепу ---------------- */
function rZone(){
  var node=S.casc, z=ZBY[S.priority];
  paintLegend();
  var trail = S.trail.map(function(t){ return '<span class="tr">'+t+'</span>'; }).join('<i>→</i>');
  setHead("Этап 4 · зона "+S.priority+" — "+z.area.toLowerCase(), node.title,
    (trail?trail+'<i class="ar">→</i><b>'+node.title+'</b><br>':'')+
    "Провоцируем вариант и тестируем: верный отзовётся сильным тестом.");
  /* сброс подсветки: всё, что в текущем виде, — на полную */
  VIEWKEYS.forEach(function(k){ var ob=PARTS[k]; if(!ob) return;
    ob.highlight=0;
    ob.hidden = (ob.kind==="joint") || (ob.kind==="soft" && ZONE_VIEW[S.priority].skull);
    ob.alpha  = (ob.kind==="joint") ? 0.62 : (ob.kind==="soft" ? 0.30 : 1); });
  /* метки суставов показываем, только если они есть среди вариантов уровня */
  node.options.forEach(function(op){ (op.parts||[]).concat(op.ctx||[]).forEach(function(k){
    if(PARTS[k]&&PARTS[k].kind==="joint") PARTS[k].hidden=false; }); });
  applyFocus();
  var res=S.results[S.depth]||{}; S.results[S.depth]=res;
  var html="";
  node.options.forEach(function(o,i){
    var r=res[o.id];
    html+='<button class="btn opt" data-i="'+i+'" data-res="'+(r||"")+'">'+o.label+
          (r?(r==="strong"?" · сильный":" · слабый"):"")+'</button>';
  });
  els.actions.innerHTML=html;
  Array.prototype.forEach.call(els.actions.children, function(b){
    b.onclick=function(){ tryOption(node, node.options[+b.dataset.i]); };
    b.onmouseenter=function(){ hoverOption(node.options[+b.dataset.i], true); };
    b.onmouseleave=function(){ hoverOption(node.options[+b.dataset.i], false); };
  });
  var win=node.options.filter(function(o){ return res[o.id]==="strong"; })[0];
  if(win) afterWin(node, win);
  else reframeZone(400);
}
/* кадр в зоне считаем заново, когда панели изменили высоту.
   Меряем на следующем кадре отрисовки: к этому моменту панель уже перерисована. */
function reframeZone(ms, force){
  /* нужно только на узком экране: там панель стоит сверху и меняет высоту.
     На широком панели — колонки по бокам, кадр от их содержимого не зависит. */
  if(!isNarrow()) return;
  if(S.screen!=="zone" && S.screen!=="treat") return;
  var key=S.priority+":"+S.depth+":"+(FOCUS?"f":"-");
  if(!force && S.zoneFramed===key) return;
  S.zoneFramed=key;
  requestAnimationFrame(function(){
    if(S.screen!=="zone" && S.screen!=="treat") return;
    if(FOCUS && FOCUS.main && FOCUS.main.length){
      var keysF=FOCUS.main.concat(FOCUS.ctx||[]);
      var d=fitDist(keysF), w=bonesCenter(FOCUS.main);
      if(w) R.flyTo({az:R.cam.az, el:R.cam.el, dist:d, target:bandTarget(w,d)}, ms||600);
      return;
    }
    var v=ZONE_VIEW[S.priority]; if(!v) return;
    var keys = v.fit || (v.skull?SKULLKEYS:(v.parts||[])).concat(v.joints||[]);
    R.flyTo(fitCam(keys, R.cam.az, R.cam.el), ms||400);
  });
}
function applyFocus(){
  if(!FOCUS) return;
  var main=FOCUS.main||[], ctx=FOCUS.ctx||[];
  VIEWKEYS.forEach(function(k){
    var ob=PARTS[k]; if(!ob) return;
    var inM=main.indexOf(k)>=0, inC=ctx.indexOf(k)>=0;
    if(ob.kind==="joint"){ ob.hidden=!(inM||inC); ob.alpha=inM?0.78:0.30; return; }
    if(ob.kind==="soft" && ZONE_VIEW[S.priority].skull && !(inM||inC)){ ob.hidden=true; return; }
    ob.hidden=false; ob.alpha = inM ? 1 : (inC ? 0.58 : 0.07);
  });
}
function hoverOption(o, on){
  if(S.casc && S.casc.title==="Тип структуры" && TISSUE_COLOR[o.id] && !S.tissueType){
    S.tissueType = on ? o.id : null;
    showTissue(o.id, on);
  }
  (o.parts||[]).forEach(function(k){ var ob=PARTS[k]; if(!ob) return;
    ob.highlight = on?0.55:0;
    if(ob.kind==="soft"){ ob.hidden = on?false:(ZONE_VIEW[S.priority]&&ZONE_VIEW[S.priority].skull); } });
  /* глубокая кость — на время показа приоткрываем свод */
  (o.ctx||[]).forEach(function(k){ if(PARTS[k]) PARTS[k].highlight = on?0.25:0; });
  if(o.deep && !FOCUS) VIEWKEYS.forEach(function(k){
    var ob=PARTS[k]; if(!ob||ob.kind==="joint") return;
    var keep=(o.parts||[]).indexOf(k)>=0 || (o.ctx||[]).indexOf(k)>=0;
    if(!keep) ob.alpha = on?0.12:1; });
}
function tryOption(node, o){
  var res=S.results[S.depth];
  if(res[o.id]) return;
  if(o.deep && !FOCUS) hoverOption(o,true);
  if(node.title==="Тип структуры"){ S.tissueType=o.id; showTissue(o.id, true); }
  hoverOption(o,true);
  unit=TestPanel({title:o.label,
    hint:"Провокация → тест эталонной мышцы.",
    steps:[{label:"Провокация",tone:"prov"},{label:"Тест мышцы",tone:"test"}],
    resolve:function(){ return o.id===S.truePath[S.depth]?"strong":"weak"; },
    strongText:"Тест сильный — верное направление.",
    weakText:"Тест слабый — не тот вариант.",
    onResult:function(r){ res[o.id]=r; hoverOption(o,false);
      if(node.title==="Тип структуры" && r!=="strong"){ S.tissueType=null; showTissue(null,false); }
      log("Этап 4 · "+o.label, r==="strong"?"сильный":"слабый", r);
      setTimeout(function(){ closePanel(); rZone(); },1000); },
    onMiss:function(){ hoverOption(o,false); log("Этап 4 · "+o.label+" — не успели","мимо","weak"); }});
}
function afterWin(node, win){
  var leaf=!win.next;
  els.actions.innerHTML += '<div class="hint">Выбрано: «'+win.label+'»</div>';
  computerStep(leaf
    ? "Структура найдена. Последний вывод в компьютер — и к коррекции."
    : "Разведите ноги шире — теперь организм отвечает только за «"+win.label+"».",
    function(){
      closePanel();
      S.trail.push(win.label);
      if(node.title!=="Тип структуры" && (win.parts||[]).length) setRegionBox(win.parts.concat(win.ctx||[]));
      if(S.depth>=1 && node.title!=="Тип структуры" && (win.parts||[]).length){
        FOCUS={main:win.parts.slice(), ctx:(win.ctx||[]).slice()};
      }
      (win.parts||[]).forEach(function(k){ if(PARTS[k]) PARTS[k].highlight=0.35; });
      applyFocus();
      if(leaf){ log("Этап 4 · первопричина — "+S.trail.join(" → "),"источник","strong"); go("treat"); }
      else { S.casc=win.next; S.depth++; rZone(); reframeZone(900, true); }
    });
}
function placeSide(){
  if(!els.side || !els.head) return;
  if((R.canvas.clientWidth||1280) > 900){ els.side.style.top=""; return; }
  var q=els.head.getBoundingClientRect();
  els.side.style.top=(q.bottom+8)+"px";
  if(R) R.invalidate(300);
}
function paintLegend(){
  var h="", seen={};
  if(S.tissueType && TISSUE_COLOR[S.tissueType]){
    var tc=TISSUE_COLOR[S.tissueType];
    h+='<div><i style="background:rgb('+tc.map(function(x){return Math.round(x*255)}).join(',')+')"></i><b>'+
       TISSUE_RU[S.tissueType]+' отдела</b></div>';
  }
  VIEWKEYS.forEach(function(k){
    var ob=PARTS[k]; if(!ob) return;
    var lab=labelFor(k); if(seen[lab]) return; seen[lab]=1;
    var c=ob.base||ob.color;
    h+='<div><i style="background:rgb('+c.map(function(x){return Math.round(x*255)}).join(',')+')"></i>'+lab+'</div>';
  });
  els.legend.innerHTML=h;
  els.legend.hidden = !h;
  placeSide();
}

/* ---------------- коррекция ---------------- */
function rTreat(){
  applyFocus();
  if(TISSUE_COLOR[S.structure]){ S.tissueType=S.structure; showTissue(S.structure, true); }
  paintLegend();
  var round=S.treatRound+1;
  setHead("Этап 5 · круг "+round,"Коррекция и проверка постукиванием",
    S.trail.join(" → ")+"<br>Техника → тест. Сильный — подошла. Затем постукивание: сел тест — пролечено не всё.");
  var h="";
  techniques().forEach(function(t){
    h+='<button class="btn opt" data-t="'+t.id+'"'+(S.techTried[t.id]?" disabled":"")+'>'+t.name+'</button>';
  });
  els.actions.innerHTML=h;
  Array.prototype.forEach.call(els.actions.children, function(b){
    b.onclick=function(){ tryTech(b.dataset.t); };
  });
  reframeZone(500, true);
}
function tryTech(id){
  var t=TECHNIQUES.filter(function(x){return x.id===id;})[0];
  S.techAttempts++;
  Array.prototype.forEach.call(els.actions.children,function(b){ b.disabled=true; });
  unit=TestPanel({title:"Контрольный тест — "+t.name,
    hint:"Применили технику, провоцируем и тестируем.",
    steps:[{label:"Провокация зоны",tone:"prov"},{label:"Тест мышцы",tone:"test"}],
    resolve:function(){ return id===S.plan[S.treatRound]?"strong":"weak"; },
    strongText:"Тест сильный — техника подошла. Проверяем постукиванием.",
    weakText:"Тест слабый — не подошла, выберите другую.",
    onResult:function(r){
      log("Этап 5 · «"+t.name+"»", r==="strong"?"сильный":"слабый", r);
      if(r==="weak"){ S.techTried[id]=true; setTimeout(function(){ closePanel(); rTreat(); },1000); return; }
      setTimeout(function(){ confirmTap(); },900);
    },
    onMiss:function(){ setTimeout(function(){ closePanel(); rTreat(); },600); }});
}
function confirmTap(){
  var last = S.treatRound >= S.plan.length-1;
  unit=TestPanel({title:"Проверка: всё ли пролечено",
    hint:"Постукивание по левому виску, затем тест.",
    steps:[{label:"Постукивание по левому виску",tone:"tap"},{label:"Тест мышцы",tone:"test"}],
    resolve:function(){ return last?"strong":"weak"; },
    strongText:"Тест остался сильным — пролечено всё.",
    weakText:"Тест сел — пролечено не всё, ищем следующую технику.",
    onResult:function(r){
      if(r==="strong"){ log("Этап 5 · пролечено всё","готово","strong");
        setTimeout(function(){ closePanel(); go("done"); },900); return; }
      log("Этап 5 · осталась дисфункция","ещё","weak");
      setTimeout(function(){ computerStep("Пролечено не всё — выводим в компьютер заново.",
        function(){ closePanel(); S.treatRound++; S.techTried={}; rTreat(); }); },800);
    }});
}
/* ---------------- итог случая и код для бота ---------------- */
var BOT="KarushkinSeminarBot";
/* ближайший семинар — правится в одном месте */
var SEMINAR={
  dates:"25–29 ноября",
  place:"пгт. Симеиз, ул. Васильченко 9",
  price:"45 000 ₽, до 10 ноября — 35 000 ₽"
};
function codeFor(zone, mins, acc, name){
  /* контрольная сумма — от опечаток, а не от подделки */
  var str=zone+"|"+mins+"|"+acc+"|"+(name||"")+"|mld1";
  var h=0;
  for(var i=0;i<str.length;i++){ h=((h<<5)-h+str.charCodeAt(i))|0; }
  h=Math.abs(h)%1679616;                    /* четыре знака в 36-ричной */
  return ("000"+h.toString(36).toUpperCase()).slice(-4);
}
function savedName(){
  try{ return localStorage.getItem("mld1-name")||""; }catch(e){ return ""; }
}
function saveName(v){ try{ localStorage.setItem("mld1-name", v); }catch(e){} }

function rDone(){
  closePanel();
  var acc = S.winTotal? Math.round(100*S.winHit/S.winTotal):100;
  var secs=Math.round((Date.now()-S.t0)/1000);
  var mins=Math.max(1, Math.round(secs/60));
  setHead("Случай завершён","Первопричина устранена",
    S.trail.join(" → ")+"<br>Дисфункциональные зоны: "+S.weakZones.join(", ")+". Техник понадобилось: "+S.plan.length+".");

  function line(){
    var nm=(document.getElementById("nm")||{}).value||"";
    nm=nm.trim().slice(0,40);
    return "МЛД-1 ✓ зона "+S.priority+" · "+mins+" мин · "+acc+"% тестов в окне"+
           (nm? " · "+nm : "")+" · код "+codeFor(S.priority,mins,acc,nm);
  }
  els.actions.innerHTML=
    '<div class="stats"><div><b>'+Math.floor(secs/60)+":"+("0"+secs%60).slice(-2)+'</b><span>время</span></div>'+
    '<div><b>'+acc+'%</b><span>тестов в окне</span></div>'+
    '<div><b>'+S.spread+'</b><span>выводов в компьютер</span></div></div>'+
    '<div class="cta">'+
      '<b>Алгоритм вы прошли, а тестировать и устранять причины боли учу на семинаре</b>'+
      '<div class="when"><b>МЛД-1 · '+SEMINAR.dates+'</b><br>'+SEMINAR.place+'<br>'+SEMINAR.price+'</div>'+
      '<a class="go" id="tgme" href="'+AUTHOR.me+'" target="_blank" rel="noopener">Написать Николаю</a>'+
      '<p>То, что вы сейчас прошли, — первый день из пяти. Дальше кранио-сакральная '+
        'терапия: слушание ритма, череп, таз, позвоночник. Затем малый таз как причина '+
        'падения энергетики тела. В конце висцеральная работа — толстый кишечник, спайки. '+
        'Бонусом работа с женской грудью. Группа до 30 человек, работаем в парах на моделях.</p>'+
    '</div>'+
    '<div class="rep">'+
      '<label for="nm">Как вас зовут — впишу в результат</label>'+
      '<input id="nm" type="text" maxlength="40" placeholder="Имя и фамилия" value="'+
        savedName().replace(/"/g,"&quot;")+'">'+
      '<div class="code" id="rl"></div>'+
      '<div class="pbtns">'+
        '<button class="sb" id="cp">Скопировать результат</button>'+
      '</div>'+
    '</div>'+
    '<button class="btn primary" id="again">Новый случай</button>';

  var rl=document.getElementById("rl"), nm=document.getElementById("nm");
  var tgme=document.getElementById("tgme");
  function refresh(){
    rl.textContent=line();
    var who=(nm.value||"").trim().slice(0,40);
    var msg="Здравствуйте! Прошёл тренажёр МЛД-1"+(who? ", меня зовут "+who : "")+
            ". Расскажите, пожалуйста, про семинар "+SEMINAR.dates+".";
    tgme.href=AUTHOR.me+"?text="+encodeURIComponent(msg);
  }
  refresh();
  nm.oninput=function(){ saveName(nm.value); refresh(); };
  document.getElementById("cp").onclick=function(){
    var btn=this, txt=line();
    function ok(){ btn.textContent="Скопировано"; setTimeout(function(){ btn.textContent="Скопировать результат"; },1800); }
    try{
      navigator.clipboard.writeText(txt).then(ok, select);
    }catch(e){ select(); }
    function select(){
      var r=document.createRange(); r.selectNodeContents(rl);
      var sel=window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
      btn.textContent="Выделено — скопируйте";
      setTimeout(function(){ btn.textContent="Скопировать результат"; },2600);
    }
  };
  document.getElementById("again").onclick=function(){ go("intro"); };
}

/* ---------------- запуск ---------------- */
function authorStrip(){
  if(!els.by) return;
  var h='<div class="who"><b>Тренажёр МЛД-1</b> · '+AUTHOR.name+'</div><div class="lk">';
  if(AUTHOR.channel) h+='<a href="'+AUTHOR.channel+'" target="_blank" rel="noopener">мой канал</a>';
  if(AUTHOR.me)      h+='<a href="'+AUTHOR.me+'" target="_blank" rel="noopener">написать мне</a>';
  els.by.innerHTML=h+'</div>';
}
function init(){
  ["eyebrow","title","text","actions","panel","markers","log","legend","steps","guide","by","head","side"].forEach(function(id){
    els[id]=document.getElementById(id);
  });
  R=new Renderer(document.getElementById("c")); gl=R.gl;
  buildScene(); buildMarkers(); authorStrip();
  window.addEventListener("resize", function(){ placeSide(); R.invalidate(700); });
  window.addEventListener("orientationchange", function(){ R.invalidate(1200); });
  R.attachOrbit(R.canvas, function(){});
  R.onClick=function(e){
    if(S.screen!=="skull") return;
    var r=R.canvas.getBoundingClientRect();
    var id=R.pick(e.clientX-r.left, e.clientY-r.top);
    var key=pickMap[id]; if(!key) return;
    var node=S.casc;
    var opt=node.options.filter(function(o){ return (o.parts||[]).indexOf(key)>=0; })[0];
    if(opt) tryOption(node, opt);
  };
  window.__DBG={
    region:function(keys){ setRegionBox(keys); },
    focusKeys:function(m,c){ FOCUS={main:m,ctx:c||[]}; applyFocus();
      var w=bonesCenter(m), dd=fitDist(m.concat(c||[]));
      if(w) R.flyTo({az:R.cam.az,el:R.cam.el,dist:dd,target:bandTarget(w,dd)},600); },
    tissue:function(t){ S.tissueType=t; showTissue(t,true); },
    newcase:function(){ newCase(); return S.priority; },
    zone:function(id,depth){ id=id||6; var v=ZONE_VIEW[id];
      S.weakZones=[id]; S.priority=id; S.results={}; S.trail=[]; FOCUS=null;
      ensureZoneData(id, function(){});
      showZone(id); S.casc=cascadeFor(id); S.depth=0;
      if(depth){ S.casc=S.casc.options[0].next; S.depth=1; }
      go("zone");
      R.flyTo(fitCam(v.fit||VIEWKEYS, v.az, v.el),600); },
    focus:function(k,c){ FOCUS={main:k,ctx:c||[]}; applyFocus();
      var w=bonesCenter(k), d=fitDist(k.concat(c||[]));
      if(w) R.flyTo({az:R.cam.az,el:R.cam.el,dist:d,target:bandTarget(w,d)},800); }
  };
  /* Safari на телефоне может отобрать графику при перегрузе. Молча замирать
     нельзя: показываем честное сообщение с кнопкой перезагрузки. */
  R.onLost=function(){
    var d=document.getElementById("dead"); if(d) d.hidden=false;
  };
  R.onRestored=function(){ location.reload(); };
  var ov=document.getElementById("boot"); if(ov) ov.hidden=true;
  /* Раньше кадр рисовался всегда, 60 раз в секунду, даже когда на экране
     ничего не менялось: 87 вызовов отрисовки и 177 тысяч треугольников
     в каждом. Телефон от такой постоянной нагрузки грелся и Safari отбирал
     графический контекст — страница намертво застывала. Теперь кадр
     считается только когда он действительно изменился. */
  function frame(t){
    if(R.needsDraw(t)){
      R.stepCamera(t);
      R.watchSpeed(t);
      R.render();
      paintMarkers();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  go("intro");
  window.__S=S; window.__R=R; window.__go=go; window.__onZone=onZone;
}
/* Если запуск сорвался (нет трёхмерной графики, старый браузер), человек должен
   увидеть внятное объяснение, а не вечную заставку. */
function startup(){
  try{ init(); }
  catch(e){
    var ov=document.getElementById("boot");
    if(!ov) return;
    ov.hidden=false;
    ov.innerHTML='<div class="bt">Тренажёр не запустился</div>'+
      '<div style="font-size:13px;max-width:330px;line-height:1.55;opacity:.75">'+
      'Браузер не дал доступ к трёхмерной графике. Откройте эту ссылку в Safari '+
      'или Chrome \u2014 во встроенных браузерах мессенджеров она работает не всегда.</div>'+
      '<div style="font-size:11px;opacity:.5;margin-top:8px">'+
      ((e&&e.message)?String(e.message).slice(0,140).replace(/[<>]/g,""):"")+'</div>';
  }
}
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",startup); else startup();
})();

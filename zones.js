/* Зоны МЛД-1 по протоколу Николая.
   Кости — BONES, тонкий череп — SKULL, мягкие структуры — INSIDE,
   суставы — метками JOINTS. */
var JOINTS={
  jHipR :{label:"Тазобедренный сустав", p:[ 0.0937,0.8439,-0.0198], r:[0.026,0.024,0.026]},
  jHipL :{label:"Тазобедренный сустав", p:[-0.0938,0.8437,-0.0198], r:[0.026,0.024,0.026]},
  jKneeR:{label:"Коленный сустав",      p:[ 0.0761,0.4460,-0.0313], r:[0.030,0.022,0.030]},
  jKneeL:{label:"Коленный сустав",      p:[-0.0763,0.4460,-0.0313], r:[0.030,0.022,0.030]},
  jAnkR :{label:"Голеностопный сустав", p:[ 0.0730,0.1496,-0.0319], r:[0.024,0.018,0.026]},
  jAnkL :{label:"Голеностопный сустав", p:[-0.0731,0.1496,-0.0319], r:[0.024,0.018,0.026]},
  jSiR  :{label:"Крестцово-подвздошный",p:[ 0.0487,0.9383,-0.0449], r:[0.016,0.030,0.018]},
  jSiL  :{label:"Крестцово-подвздошный",p:[-0.0486,0.9382,-0.0447], r:[0.016,0.030,0.018]},
  jPubis:{label:"Лобковый симфиз",      p:[ 0.0023,0.8362, 0.0313], r:[0.016,0.020,0.016]},
  jScR  :{label:"Грудино-ключичный",    p:[ 0.0403,1.4006, 0.0320], r:[0.015,0.014,0.015]},
  jScL  :{label:"Грудино-ключичный",    p:[-0.0404,1.4006, 0.0320], r:[0.015,0.014,0.015]},
  jAcR  :{label:"Акромиально-ключичный",p:[ 0.1223,1.4103,-0.0267], r:[0.015,0.013,0.015]},
  jAcL  :{label:"Акромиально-ключичный",p:[-0.1223,1.4103,-0.0267], r:[0.015,0.013,0.015]},
  jGhR  :{label:"Плечевой сустав",      p:[ 0.1620,1.3823,-0.0285], r:[0.022,0.022,0.022]},
  jGhL  :{label:"Плечевой сустав",      p:[-0.1620,1.3823,-0.0285], r:[0.022,0.022,0.022]},
  jTmjR :{label:"ВНЧС",                 p:[ 0.0432,1.5710, 0.0205], r:[0.016,0.013,0.015]},
  jTmjL :{label:"ВНЧС",                 p:[-0.0432,1.5710, 0.0205], r:[0.016,0.013,0.015]}
};

var PALETTE=[
  [0.94,0.68,0.30],[0.36,0.72,0.56],[0.34,0.58,0.82],[0.82,0.44,0.60],
  [0.95,0.82,0.30],[0.84,0.45,0.32],[0.56,0.46,0.84],[0.30,0.76,0.72],
  [0.70,0.74,0.40],[0.86,0.60,0.44],[0.50,0.66,0.86],[0.78,0.52,0.74]
];

function S_(id,label,parts,ctx,next,opts){
  var o={id:id,label:label,parts:parts||[],ctx:ctx||[],next:next};
  if(opts) for(var k in opts) o[k]=opts[k];
  return o;
}
function vert(list, ctxf, ST){           // ряд позвонков одним махом
  return list.map(function(v){ return S_(v.k, v.l, [v.k], ctxf(v.k), ST()); });
}

/* ===== зона 1: нога от большого вертела и ниже ======================== */
function casc1(ST){ return {title:"Сторона", options:[
  S_("right","Правая",["femR","tibR","fibR"],[],lvl1("R",ST)),
  S_("left", "Левая", ["femL","tibL","fibL"],[],lvl1("L",ST))
]};}
function lvl1(s,ST){ return {title:"Отдел", options:[
  S_("hipj", "Тазобедренный сустав",["jHip"+s],["hip"+s,"fem"+s],ST("joint"),{deep:true}),
  S_("femur","Бедро",      ["fem"+s],["hip"+s,"pat"+s],ST()),
  S_("knee", "Колено",     ["jKnee"+s,"pat"+s],["fem"+s,"tib"+s],ST("joint"),{deep:true}),
  S_("shin", "Голень",     ["tib"+s,"fib"+s],["fem"+s,"talus"+s],ST()),
  S_("ankle","Голеностоп", ["jAnk"+s],["tib"+s,"fib"+s,"talus"+s],ST("joint"),{deep:true}),
  S_("foot", "Стопа",      ["talus"+s,"calc"+s,"tars"+s,"meta"+s,"phal"+s],["tib"+s],ST())
]};}

/* ===== зона 2: малый таз ============================================== */
function casc2(ST){ return {title:"Сторона", options:[
  S_("right","Правая",["hipR"],["s1","s2","s3"],lvl2("R",ST)),
  S_("left", "Левая", ["hipL"],["s1","s2","s3"],lvl2("L",ST))
]};}
function lvl2(s,ST){ var o=vert(
  [{k:"s1",l:"S1"},{k:"s2",l:"S2"},{k:"s3",l:"S3"},{k:"s4",l:"S4"},{k:"s5",l:"S5"}],
  function(){ return ["hip"+s]; }, ST);
  o.push(S_("coccyx","Копчик",["coccyx"],["s5"],ST()));
  o.push(S_("si","Крестцово-подвздошный",["jSi"+s],["hip"+s,"s1","s2"],ST("joint"),{deep:true}));
  o.push(S_("pubis","Лобковый симфиз",["jPubis"],["hipR","hipL"],ST("joint"),{deep:true}));
  o.push(S_("hip","Тазовая кость",["hip"+s],["s1","s2","s3"],ST()));
  return {title:"Отдел", options:o};
}

/* ===== зона 3: висцералка, L1–L5 и Th8–Th12 =========================== */
function casc3(ST){ return {title:"Сторона", options:[
  S_("right","Правая",["ribR8","ribR9","ribR10","ribR11","ribR12"],["gut","viscera"],lvl3("R",ST)),
  S_("left", "Левая", ["ribL8","ribL9","ribL10","ribL11","ribL12"],["gut","viscera"],lvl3("L",ST))
]};}
function lvl3(s,ST){
  var o=vert([{k:"t8",l:"Th8"},{k:"t9",l:"Th9"},{k:"t10",l:"Th10"},{k:"t11",l:"Th11"},{k:"t12",l:"Th12"},
              {k:"l1",l:"L1"},{k:"l2",l:"L2"},{k:"l3",l:"L3"},{k:"l4",l:"L4"},{k:"l5",l:"L5"}],
             function(){ return ["rib"+s+"10"]; }, ST);
  o.push(S_("ribs","Нижние рёбра",["rib"+s+"8","rib"+s+"9","rib"+s+"10","rib"+s+"11","rib"+s+"12"],
            ["t10","t11","t12"], ribLevel(s,[8,9,10,11,12],ST)));
  o.push(S_("visc","Внутренние органы",["gut","viscera","gland"],["l1","l2","l3"], viscLevel(ST)));
  return {title:"Отдел", options:o};
}
function ribLevel(s,nums,ST){ return {title:"Ребро", options: nums.map(function(n){
  return S_("rib"+n,"Ребро "+n,["rib"+s+n],["t"+(n<=7?n:n)],ST());
})};}
function viscLevel(ST){ return {title:"Орган", options:[
  S_("gut","Кишечник",["gut"],["viscera"],ST("visc")),
  S_("viscera","Органы брюшной полости",["viscera"],["gut"],ST("visc")),
  S_("gland","Железы",["gland"],["viscera"],ST("visc"))
]};}

/* ===== зона 4: лёгкие, сердце, перикард, Th1–Th7 ====================== */
function casc4(ST){ return {title:"Сторона", options:[
  S_("right","Правая",["ribR1","ribR2","ribR3","ribR4"],["lung","heart"],lvl4("R",ST)),
  S_("left", "Левая", ["ribL1","ribL2","ribL3","ribL4"],["lung","heart"],lvl4("L",ST))
]};}
function lvl4(s,ST){
  var o=vert([{k:"t1",l:"Th1"},{k:"t2",l:"Th2"},{k:"t3",l:"Th3"},{k:"t4",l:"Th4"},
              {k:"t5",l:"Th5"},{k:"t6",l:"Th6"},{k:"t7",l:"Th7"}],
             function(){ return ["rib"+s+"4"]; }, ST);
  o.push(S_("lung","Лёгкие",["lung","bronchi"],["rib"+s+"4"],ST("visc")));
  o.push(S_("heart","Сердце",["heart"],["lung","bronchi"],ST("heart")));
  o.push(S_("peri","Перикард",["heart"],["lung","bronchi"],ST("heart"),{deep:true}));
  o.push(S_("ribs","Верхние рёбра",["ribR1","ribR2","ribR3","ribR4","ribR5","ribR6","ribR7"].map(
            function(k){ return k.replace("ribR","rib"+s); }),["t3","t4"],
            ribLevel(s,[1,2,3,4,5,6,7],ST)));
  o.push(S_("sternum","Грудина",["manubrium","sternbody"],["rib"+s+"1"],ST()));
  return {title:"Отдел", options:o};
}

/* ===== зона 5: плечи и шея, C1–C7 ===================================== */
function casc5(ST){ return {title:"Сторона", options:[
  S_("right","Правая",["clavR","scapR","humR"],["c4","c5","c6"],lvl5("R",ST)),
  S_("left", "Левая", ["clavL","scapL","humL"],["c4","c5","c6"],lvl5("L",ST))
]};}
function lvl5(s,ST){
  var o=vert([{k:"c1",l:"C1 — атлант"},{k:"c2",l:"C2 — аксис"},{k:"c3",l:"C3"},{k:"c4",l:"C4"},
              {k:"c5",l:"C5"},{k:"c6",l:"C6"},{k:"c7",l:"C7"}],
             function(){ return ["clav"+s]; }, ST);
  o.push(S_("clav","Ключица",["clav"+s],["scap"+s,"manubrium"],ST()));
  o.push(S_("scap","Лопатка",["scap"+s],["clav"+s,"hum"+s],ST()));
  o.push(S_("hum", "Плечевая кость",["hum"+s],["scap"+s],ST()));
  o.push(S_("ac",  "Акромиально-ключичный",["jAc"+s],["clav"+s,"scap"+s],ST("joint"),{deep:true}));
  o.push(S_("sc",  "Грудино-ключичный",    ["jSc"+s],["clav"+s,"manubrium"],ST("joint"),{deep:true}));
  o.push(S_("gh",  "Плечевой сустав",      ["jGh"+s],["scap"+s,"hum"+s],ST("joint"),{deep:true}));
  return {title:"Отдел", options:o};
}

/* ===== зона 6: голова — череп и его содержимое ======================== */
function casc6(ST){ return {title:"Сторона", options:[
  S_("right","Правая",["sk_parietalR","sk_temporalR"],[],lvl6("R",ST)),
  S_("left", "Левая", ["sk_parietalL","sk_temporalL"],[],lvl6("L",ST))
]};}
function lvl6(s,ST){ return {title:"Кость или структура", options:[
  S_("frontal",  "Лобная",     ["sk_frontal"],       [],ST()),
  S_("parietal", "Теменная",   ["sk_parietal"+s],    [],ST()),
  S_("temporal", "Височная",   ["sk_temporal"+s],    [],ST()),
  S_("occipital","Затылочная", ["sk_occipital"],     [],ST()),
  S_("sphenoid", "Клиновидная",["sk_sphenoid"],      [],ST(),{deep:true}),
  S_("tmj",      "ВНЧС",       ["jTmj"+s],["sk_mandible","sk_temporal"+s],ST("joint"),{deep:true}),
  S_("mandible", "Нижняя челюсть",["sk_mandible"],["jTmj"+s],ST()),
  S_("brain",    "Головной мозг",["brain","whitematter","nuclei"],["sk_parietal"+s],ST("neuro"),{deep:true}),
  S_("cerebellum","Мозжечок",  ["cerebellum"],["brain","sk_occipital"],ST("neuro"),{deep:true}),
  S_("ventricles","Желудочки и ликвор",["ventricles"],["brain"],ST("neuro"),{deep:true}),
  S_("nerves",   "Черепные нервы",["cranialnerves"],["sk_sphenoid"],ST("neuro"),{deep:true}),
  S_("eyes",     "Глазные яблоки",["eyes"],["sk_face"],ST("neuro"))
]};}

/* ===== что показываем на крупном плане каждой зоны =================== */
var ZONE_VIEW={
  1:{parts:["hipR","hipL","femR","femL","patR","patL","tibR","tibL","fibR","fibL",
            "talusR","talusL","calcR","calcL","tarsR","tarsL","metaR","metaL","phalR","phalL"],
     joints:["jHipR","jHipL","jKneeR","jKneeL","jAnkR","jAnkL"], az:0.45, el:0.06},
  2:{parts:["hipR","hipL","s1","s2","s3","s4","s5","coccyx","l5"],
     joints:["jSiR","jSiL","jPubis","jHipR","jHipL"],
     fit:["hipR","hipL","s1","s2","s3","s4","s5","coccyx"], az:3.14, el:0.20},
  3:{parts:["t8","t9","t10","t11","t12","l1","l2","l3","l4","l5",
            "ribR8","ribR9","ribR10","ribR11","ribR12",
            "ribL8","ribL9","ribL10","ribL11","ribL12",
            "gut","viscera","gland"], joints:[],
     fit:["t8","t9","t10","t11","t12","l1","l2","l3","l4","l5",
          "ribR8","ribR9","ribR10","ribR11","ribR12","ribL8","ribL12"],
     az:2.55, el:0.16},
  4:{parts:["t1","t2","t3","t4","t5","t6","t7",
            "ribR1","ribR2","ribR3","ribR4","ribR5","ribR6","ribR7",
            "ribL1","ribL2","ribL3","ribL4","ribL5","ribL6","ribL7",
            "manubrium","sternbody","lung","bronchi","heart"], joints:[],
     fit:["t1","t7","ribR1","ribR7","ribL1","ribL7","manubrium","sternbody"],
     az:0.50, el:0.14},
  5:{parts:["c1","c2","c3","c4","c5","c6","c7",
            "clavR","clavL","scapR","scapL","humR","humL","manubrium",
            "ribR1","ribR2","ribL1","ribL2","t1","t2"],
     joints:["jAcR","jAcL","jScR","jScL","jGhR","jGhL"],
     fit:["c1","c2","c3","c4","c5","c6","c7","clavR","clavL","scapR","scapL","manubrium"],
     az:0.62, el:0.16},
  6:{skull:true, inside:["brain","cerebellum","whitematter","nuclei","ventricles",
                         "cranialnerves","eyes"], az:1.15, el:0.10}
};

/* цвета мягких структур — по типу ткани, не по палитре */
var SOFT_COLOR={
  brain:[0.90,0.74,0.72], whitematter:[0.94,0.92,0.88], nuclei:[0.74,0.56,0.66],
  cerebellum:[0.82,0.62,0.56], ventricles:[0.42,0.72,0.88], cranialnerves:[0.96,0.86,0.42],
  eyes:[0.92,0.94,0.96], nervesbody:[0.96,0.86,0.42],
  lung:[0.86,0.66,0.68], bronchi:[0.72,0.78,0.84], heart:[0.78,0.30,0.30],
  gut:[0.88,0.74,0.56], viscera:[0.72,0.46,0.40],
  gland:[0.80,0.80,0.56]
};

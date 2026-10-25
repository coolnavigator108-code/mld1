/* ============================================================
   Рендерер: шейдеры, сцена, орбитальная камера, пикинг цветом.
   ============================================================ */
var VS = [
"attribute vec3 aPos; attribute vec3 aNrm;",
"uniform mat4 uProj, uView, uModel; uniform mat3 uNrmMat;",
"varying vec3 vN; varying vec3 vW;",
"void main(){",
"  vec4 w = uModel * vec4(aPos,1.0);",
"  vW = w.xyz;",
"  vN = normalize(uNrmMat * aNrm);",
"  gl_Position = uProj * uView * w;",
"}"].join("\n");

/* Шейдер собирается в двух видах: с обрезкой по коробке (в нём есть discard)
   и без неё. У «плиточной» графики Apple любой discard в шейдере отключает
   отбрасывание невидимых пикселей для всей отрисовки — телефон начинает
   считать освещение даже для перекрытых треугольников. Поэтому на экранах,
   где обрезка не нужна, берём вариант без discard. */
function makeFS(clip){
  return [
  "precision highp float;",
  "varying vec3 vN; varying vec3 vW;",
  "uniform vec3 uColor; uniform vec3 uCam; uniform float uAlpha;",
  clip ? "uniform vec3 uClipLo, uClipHi; uniform float uClipOn;" : "",
  "uniform float uFaceCam;",
  "uniform float uHighlight; uniform vec3 uHiColor;",
  "void main(){",
  clip ? "  if(uClipOn > 0.5 && (any(lessThan(vW,uClipLo)) || any(greaterThan(vW,uClipHi)))) discard;" : "",
  "  vec3 N = normalize(vN);",
  "  vec3 V = normalize(uCam - vW);",
  "  if(!gl_FrontFacing) N = -N;",
  "  if(uFaceCam > 0.5 && dot(N, V) < 0.0) N = -N;",
  "  vec3 key  = normalize(vec3(-0.40, 0.92, 0.62));",
  "  vec3 fill = normalize(vec3( 0.85, 0.30, 0.35));",
  "  vec3 back = normalize(vec3( 0.05,-0.30,-0.95));",
  "  float dK = max(dot(N,key),0.0);",
  "  float dF = max(dot(N,fill),0.0);",
  "  float dB = max(dot(N,back),0.0);",
  "  vec3 base = mix(uColor, uHiColor, uHighlight*0.75);",
  "  float sky = 0.5 + 0.5*N.y;",
  "  vec3 amb = base * (0.30 + 0.16*sky);",
  "  vec3 lit = amb + base * (0.68*dK + 0.20*dF);",
  "  lit += base * vec3(0.62,0.70,0.80) * 0.16 * dB;",
  "  vec3 H = normalize(key + V);",
  "  lit += vec3(1.0) * pow(max(dot(N,H),0.0), 34.0) * 0.13;",
  "  float rim = pow(1.0 - max(dot(N,V),0.0), 3.0);",
  "  lit += mix(vec3(0.62,0.70,0.78)*0.13, uHiColor*0.9, uHighlight) * rim;",
  "  gl_FragColor = vec4(clamp(lit,0.0,1.0), uAlpha);",
  "}"].join("\n");
}
function makePickFS(clip){
  return [
  "precision highp float;",
  "varying vec3 vN; varying vec3 vW;",
  "uniform vec3 uPickColor;",
  clip ? "uniform vec3 uClipLo, uClipHi; uniform float uClipOn;" : "",
  "uniform float uFaceCam;",
  "void main(){",
  clip ? "  if(uClipOn > 0.5 && (any(lessThan(vW,uClipLo)) || any(greaterThan(vW,uClipHi)))) discard;" : "",
  "  gl_FragColor = vec4(uPickColor,1.0);",
  "}"].join("\n");
}
var FS = makeFS(true), FS_PLAIN = makeFS(false);
var PICK_FS = makePickFS(true), PICK_FS_PLAIN = makePickFS(false);

function Renderer(canvas){
  var gl = canvas.getContext("webgl2", {antialias:true, alpha:true}) ||
           canvas.getContext("webgl", {antialias:true, alpha:true});
  if(!gl) throw new Error("WebGL недоступен");
  this.gl = gl; this.canvas = canvas;
  this.webgl2 = (typeof WebGL2RenderingContext !== "undefined") &&
                (gl instanceof WebGL2RenderingContext);
  /* 32-битные индексы: в WebGL 2 они штатные, в WebGL 1 нужно расширение */
  this.bigIndex = this.webgl2 || !!gl.getExtension("OES_element_index_uint");
  this.progClip     = this.buildProg(VS, FS);
  this.prog         = this.buildProg(VS, FS_PLAIN);
  this.pickProgClip = this.buildProg(VS, PICK_FS);
  this.pickProg     = this.buildProg(VS, PICK_FS_PLAIN);
  this.objects = [];
  this.cam = {az: 0, el: 0.62, dist: 5.6, target:[0,0,0]};
  this.camTween = null;

  /* --- экономия: кадр рисуется только когда он изменился --- */
  this.lastKey = null;      // отпечаток сцены на прошлом нарисованном кадре
  this.dirtyTill = 0;       // «ещё немного порисовать» после изменения
  this.drawn = 0;           // сколько кадров реально нарисовано
  /* --- запас по разрешению: на телефоне начинаем ниже и можем опуститься --- */
  this.dprSteps = [2, 1.5, 1.25, 1];
  this.dprStep = (canvas.clientWidth && canvas.clientWidth <= 900) ? 1 : 0;
  this.slow = 0; this.seen = 0; this.lastDraw = 0;

  /* --- потеря контекста: без этого страница просто застывает намертво --- */
  var self = this;
  canvas.addEventListener("webglcontextlost", function(e){
    e.preventDefault();          // без preventDefault восстановление невозможно
    self.lost = true;
    if(self.onLost) self.onLost();
  }, false);
  canvas.addEventListener("webglcontextrestored", function(){
    if(self.onRestored) self.onRestored();
  }, false);

  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  this.initPickBuffer();
}

Renderer.prototype.buildProg = function(vs, fs){
  var gl = this.gl;
  function sh(type, src){
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  var p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if(!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  var u = {};
  ["uProj","uView","uModel","uNrmMat","uColor","uCam","uAlpha","uHighlight","uHiColor","uPickColor","uClipLo","uClipHi","uClipOn","uFaceCam"]
    .forEach(function(n){ u[n] = gl.getUniformLocation(p, n); });
  return {p:p, u:u, aPos: gl.getAttribLocation(p,"aPos"), aNrm: gl.getAttribLocation(p,"aNrm")};
};

Renderer.prototype.upload = function(geo){
  var gl = this.gl;
  var m = {
    pos: gl.createBuffer(), nrm: gl.createBuffer(), idx: gl.createBuffer(),
    count: geo.idx.length
  };
  gl.bindBuffer(gl.ARRAY_BUFFER, m.pos);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geo.pos), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, m.nrm);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geo.nrm), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.idx);
  var big = geo.pos.length/3 > 65535;
  m.type = big ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
  if(big && !this.bigIndex) throw new Error("слишком много вершин");
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,
    big ? new Uint32Array(geo.idx) : new Uint16Array(geo.idx), gl.STATIC_DRAW);
  return m;
};

Renderer.prototype.initPickBuffer = function(){
  var gl = this.gl;
  this.pickFb = gl.createFramebuffer();
  this.pickTex = gl.createTexture();
  this.pickRb = gl.createRenderbuffer();
  this.pickSize = [1,1];
};

Renderer.prototype.resizePick = function(w,h){
  var gl = this.gl;
  if(this.pickSize[0]===w && this.pickSize[1]===h) return;
  this.pickSize=[w,h];
  gl.bindTexture(gl.TEXTURE_2D, this.pickTex);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.bindRenderbuffer(gl.RENDERBUFFER, this.pickRb);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
  gl.bindFramebuffer(gl.FRAMEBUFFER, this.pickFb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.pickTex, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.pickRb);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
};

Renderer.prototype.camEye = function(){
  var c=this.cam;
  return [
    c.target[0] + c.dist*Math.cos(c.el)*Math.sin(c.az),
    c.target[1] + c.dist*Math.sin(c.el),
    c.target[2] + c.dist*Math.cos(c.el)*Math.cos(c.az)
  ];
};

Renderer.prototype.matrices = function(w,h){
  var eye = this.camEye();
  return {
    proj: M4.perspective(0.72, w/h, 0.12, 80),
    view: M4.lookAt(eye, this.cam.target, [0,1,0]),
    eye: eye
  };
};

/* Нужен ли шейдер с обрезкой. Обрезка коробкой делается в шейдере только для
   объектов без ranges — у остальных лишние структуры отсекаются на процессоре. */
Renderer.prototype.needClip = function(){
  var o=this.objects;
  for(var i=0;i<o.length;i++){
    var b=o[i];
    if(b.hidden || b.alpha<=0.003) continue;
    if(b.clip && !(b.mesh && b.mesh.ranges)) return true;
  }
  return false;
};

/* Дешёвый отпечаток состояния сцены: если он не изменился и камера стоит,
   кадр рисовать не нужно. Считается за десятые доли миллисекунды. */
Renderer.prototype.key = function(){
  var c=this.cam;
  var s = c.az*10007 + c.el*1009 + c.dist*101 +
          c.target[0]*7.13 + c.target[1]*11.17 + c.target[2]*13.19 +
          (this.canvas.clientWidth||0)*1.7 + (this.canvas.clientHeight||0)*2.3;
  var o=this.objects;
  s += o.length*0.577;
  for(var i=0;i<o.length;i++){
    var b=o[i];
    if(b.hidden || b.alpha<=0.003){ s += (i+1)*0.013; continue; }
    s += (i+1)*(b.alpha*3.7 + (b.highlight||0)*5.1 +
                b.color[0]*1.3 + b.color[1]*2.1 + b.color[2]*3.3);
    if(b.clip) s += (i+1)*(b.clip.lo[0]*0.7 + b.clip.lo[1]*0.9 + b.clip.lo[2]*1.1 +
                           b.clip.hi[0]*1.3 + b.clip.hi[1]*1.5 + b.clip.hi[2]*1.7);
  }
  return s;
};

/* «Ещё порисуй немного»: вызывается после любого изменения на экране —
   панели и подписи меняют высоту с задержкой, кадр надо пересчитать. */
Renderer.prototype.invalidate = function(ms){
  var till = performance.now() + (ms===undefined ? 400 : ms);
  if(till > this.dirtyTill) this.dirtyTill = till;
};

Renderer.prototype.needsDraw = function(now){
  if(this.lost) return false;
  if(this.camTween) return true;
  if(now < this.dirtyTill) return true;
  return this.key() !== this.lastKey;
};

Renderer.prototype.drawScene = function(prog, mats, picking){
  var gl = this.gl;
  gl.useProgram(prog.p);
  gl.uniformMatrix4fv(prog.u.uProj, false, mats.proj);
  gl.uniformMatrix4fv(prog.u.uView, false, mats.view);
  if(prog.u.uCam) gl.uniform3fv(prog.u.uCam, mats.eye);

  var list = this.objects.filter(function(o){ return !o.hidden && o.alpha > 0.003; });
  if(!picking){
    var clear = true;
    for(var q=0;q<list.length;q++) if(list[q].alpha < 0.999){ clear=false; break; }
    if(!clear){
      // непрозрачные сперва, прозрачные — потом, по глубине
      var eye = mats.eye;
      list.sort(function(a,b){
        var ao = a.alpha >= 0.999 ? 0 : 1, bo = b.alpha >= 0.999 ? 0 : 1;
        if(ao !== bo) return ao - bo;
        if(ao === 0) return 0;
        function d(o){
          var p = o.center || [o.model[12],o.model[13],o.model[14]];
          return (p[0]-eye[0])*(p[0]-eye[0])+(p[1]-eye[1])*(p[1]-eye[1])+(p[2]-eye[2])*(p[2]-eye[2]);
        }
        return d(b) - d(a);
      });
    }
  }

  for(var i=0;i<list.length;i++){
    var o = list[i];
    if(picking && !o.pickId) continue;
    gl.uniformMatrix4fv(prog.u.uModel, false, o.model);
    if(prog.u.uFaceCam) gl.uniform1f(prog.u.uFaceCam, o.twoSided ? 1 : 0);
    if(prog.u.uClipOn){
      if(o.clip && !o.mesh.ranges){
        gl.uniform1f(prog.u.uClipOn, 1);
        gl.uniform3fv(prog.u.uClipLo, o.clip.lo);
        gl.uniform3fv(prog.u.uClipHi, o.clip.hi);
      } else gl.uniform1f(prog.u.uClipOn, 0);
    }
    if(prog.u.uNrmMat){
      /* матрица нормалей зависит только от модели, а она у объекта не меняется —
         считаем один раз и держим рядом с объектом */
      if(o._nmFor !== o.model){ o._nm = M4.normalMat(o.model); o._nmFor = o.model; }
      gl.uniformMatrix3fv(prog.u.uNrmMat, false, o._nm);
    }
    if(picking){
      var id=o.pickId;
      gl.uniform3f(prog.u.uPickColor, ((id>>16)&255)/255, ((id>>8)&255)/255, (id&255)/255);
    } else {
      gl.uniform3fv(prog.u.uColor, o.color);
      gl.uniform1f(prog.u.uAlpha, o.alpha);
      gl.uniform1f(prog.u.uHighlight, o.highlight || 0);
      gl.uniform3fv(prog.u.uHiColor, o.hiColor || [1,0.8,0.4]);
    }
    var m=o.mesh;
    gl.bindBuffer(gl.ARRAY_BUFFER, m.pos);
    gl.enableVertexAttribArray(prog.aPos);
    gl.vertexAttribPointer(prog.aPos, 3, m.posType||gl.FLOAT, !!m.posNorm, 0, 0);
    if(prog.aNrm >= 0){
      gl.bindBuffer(gl.ARRAY_BUFFER, m.nrm);
      gl.enableVertexAttribArray(prog.aNrm);
      gl.vertexAttribPointer(prog.aNrm, 3, m.nrmType||gl.FLOAT, !!m.nrmNorm, 0, 0);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.idx);
    if(o.alpha < 0.999 && !picking) gl.depthMask(false);
    if(o.twoSided) gl.disable(gl.CULL_FACE);     /* тонкие плёнки нельзя резать по нормали */
    if(m.ranges && o.clip){
      /* каждая мышца рисуется целиком или не рисуется вовсе */
      var st=m.ranges.start, ct=m.ranges.count, og=m.ranges.org, lo=o.clip.lo, hi=o.clip.hi;
      var bytes = m.type===gl.UNSIGNED_INT ? 4 : 2;
      var tint=m.ranges.tint;
      for(var r=0;r<st.length;r++){
        var j=r*3;
        if(og[j]<lo[0]||og[j]>hi[0]||og[j+1]<lo[1]||og[j+1]>hi[1]||og[j+2]<lo[2]||og[j+2]>hi[2]) continue;
        if(tint && !picking) gl.uniform3f(prog.u.uColor, tint[j], tint[j+1], tint[j+2]);
        gl.drawElements(gl.TRIANGLES, ct[r], m.type, st[r]*bytes);
      }
    } else {
      gl.drawElements(gl.TRIANGLES, m.count, m.type, 0);
    }
    if(o.twoSided) gl.enable(gl.CULL_FACE);
    gl.depthMask(true);
  }
};

Renderer.prototype.dpr = function(){
  return Math.min(window.devicePixelRatio||1, this.dprSteps[this.dprStep]);
};

/* Если кадры стабильно не влезают в 32 мс — опускаем разрешение на ступень.
   Обратно не поднимаем: лучше ровно и чуть мягче, чем рывками. */
Renderer.prototype.watchSpeed = function(now){
  if(this.lastDraw){
    var dt = now - this.lastDraw;
    if(dt < 500){                     // пауза между сериями кадров не считается
      this.seen++;
      if(dt > 32) this.slow++;
      if(this.seen >= 40){
        if(this.slow >= 22 && this.dprStep < this.dprSteps.length-1){
          this.dprStep++;
          this.canvas.width = 0;      // заставим пересчитать размер на этом же кадре
        }
        this.seen = 0; this.slow = 0;
      }
    }
  }
  this.lastDraw = now;
};

Renderer.prototype.render = function(){
  var gl=this.gl, c=this.canvas;
  if(this.lost) return;
  var dpr = this.dpr();
  var w = Math.max(1, Math.round(c.clientWidth*dpr)), h = Math.max(1, Math.round(c.clientHeight*dpr));
  if(c.width!==w || c.height!==h){ c.width=w; c.height=h; }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0,0,w,h);
  gl.clearColor(0,0,0,0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  this.drawScene(this.needClip() ? this.progClip : this.prog, this.matrices(w,h), false);
  this.lastKey = this.key();
  this.drawn++;
};

Renderer.prototype.pick = function(px, py){
  var gl=this.gl, c=this.canvas;
  if(this.lost) return 0;
  /* попадание ищем на половинном разрешении: по косточке палец всё равно
     попадает с запасом, а полный кадр + readPixels на телефоне — стоп графики */
  var scale = 0.5;
  var w=Math.max(1, Math.round(c.width*scale)), h=Math.max(1, Math.round(c.height*scale));
  this.resizePick(w,h);
  gl.bindFramebuffer(gl.FRAMEBUFFER, this.pickFb);
  gl.viewport(0,0,w,h);
  gl.clearColor(0,0,0,1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.disable(gl.BLEND);
  this.drawScene(this.needClip() ? this.pickProgClip : this.pickProg, this.matrices(w,h), true);
  gl.enable(gl.BLEND);
  var buf = new Uint8Array(4);
  var kx = c.width / (c.clientWidth||1) * scale, ky = c.height / (c.clientHeight||1) * scale;
  var x = Math.round(px*kx), y = Math.round(h - py*ky);
  x = Math.max(0, Math.min(w-1, x)); y = Math.max(0, Math.min(h-1, y));
  gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return (buf[0]<<16) | (buf[1]<<8) | buf[2];
};

/* Проекция мировой точки в координаты страницы (для HTML-подписей) */
Renderer.prototype.project = function(p){
  var c=this.canvas;
  var mats = this.matrices(c.width, c.height);
  var vp = M4.mul(mats.proj, mats.view);
  var x = vp[0]*p[0]+vp[4]*p[1]+vp[8]*p[2]+vp[12];
  var y = vp[1]*p[0]+vp[5]*p[1]+vp[9]*p[2]+vp[13];
  var z = vp[2]*p[0]+vp[6]*p[1]+vp[10]*p[2]+vp[14];
  var w = vp[3]*p[0]+vp[7]*p[1]+vp[11]*p[2]+vp[15];
  if(w<=0.0001) return null;
  return {
    x: (x/w*0.5+0.5)*c.clientWidth,
    y: (-y/w*0.5+0.5)*c.clientHeight,
    depth: z/w
  };
};

/* Плавный перелёт камеры */
Renderer.prototype.flyTo = function(to, ms, done){
  var from = {az:this.cam.az, el:this.cam.el, dist:this.cam.dist, target:this.cam.target.slice()};
  // кратчайший путь по азимуту
  var dAz = to.az === undefined ? 0 : (to.az - from.az);
  while(dAz > Math.PI) dAz -= Math.PI*2;
  while(dAz < -Math.PI) dAz += Math.PI*2;
  this.camTween = {
    from: from, to: to, dAz: dAz, t0: performance.now(), ms: ms||900, done: done
  };
};

Renderer.prototype.stepCamera = function(now){
  var tw = this.camTween;
  if(!tw) return false;
  var k = Math.min(1, (now - tw.t0)/tw.ms);
  var e = k<0.5 ? 4*k*k*k : 1-Math.pow(-2*k+2,3)/2;
  var f=tw.from, t=tw.to;
  this.cam.az = f.az + tw.dAz*e;
  if(t.el !== undefined) this.cam.el = f.el + (t.el-f.el)*e;
  if(t.dist !== undefined) this.cam.dist = f.dist + (t.dist-f.dist)*e;
  if(t.target) for(var i=0;i<3;i++) this.cam.target[i] = f.target[i] + (t.target[i]-f.target[i])*e;
  if(k>=1){ this.camTween=null; this.invalidate(300); if(tw.done) tw.done(); }
  return true;
};

/* Вращение мышью и колесом */
Renderer.prototype.attachOrbit = function(el, onChange){
  var self=this, drag=null;
  el.addEventListener("pointerdown", function(e){
    if(e.button!==0) return;
    drag={x:e.clientX, y:e.clientY, az:self.cam.az, el:self.cam.el, moved:0};
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener("pointermove", function(e){
    if(!drag) return;
    var dx=e.clientX-drag.x, dy=e.clientY-drag.y;
    drag.moved = Math.max(drag.moved, Math.hypot(dx,dy));
    self.camTween=null;
    self.cam.az = drag.az - dx*0.008;
    self.cam.el = Math.max(-1.35, Math.min(1.35, drag.el + dy*0.006));
    self.invalidate(120);
    if(onChange) onChange();
  });
  function end(e){
    if(drag && drag.moved < 4 && self.onClick) self.onClick(e);
    drag=null; self.invalidate(200);
  }
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", function(){ drag=null; self.invalidate(200); });
  el.addEventListener("wheel", function(e){
    e.preventDefault();
    self.camTween=null;
    self.cam.dist = Math.max(1.1, Math.min(14, self.cam.dist * (1 + Math.sign(e.deltaY)*0.09)));
    self.invalidate(200);
    if(onChange) onChange();
  }, {passive:false});
};

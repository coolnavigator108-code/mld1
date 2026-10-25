/* ============================================================
   Минимальный 3D-движок: матрицы, шейдеры, геометрия, пикинг.
   Без внешних зависимостей — весь рендер свой.
   ============================================================ */
var M4 = {
  ident: function(){ return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); },
  mul: function(a,b,out){
    out = out || new Float32Array(16);
    for(var c=0;c<4;c++){
      for(var r=0;r<4;r++){
        var s=0;
        for(var k=0;k<4;k++) s += a[k*4+r]*b[c*4+k];
        out[c*4+r]=s;
      }
    }
    return out;
  },
  translate: function(x,y,z){
    var m=M4.ident(); m[12]=x; m[13]=y; m[14]=z; return m;
  },
  scale: function(x,y,z){
    var m=M4.ident(); m[0]=x; m[5]=y; m[10]=z; return m;
  },
  rotX: function(a){
    var m=M4.ident(), c=Math.cos(a), s=Math.sin(a);
    m[5]=c; m[6]=s; m[9]=-s; m[10]=c; return m;
  },
  rotY: function(a){
    var m=M4.ident(), c=Math.cos(a), s=Math.sin(a);
    m[0]=c; m[2]=-s; m[8]=s; m[10]=c; return m;
  },
  rotZ: function(a){
    var m=M4.ident(), c=Math.cos(a), s=Math.sin(a);
    m[0]=c; m[1]=s; m[4]=-s; m[5]=c; return m;
  },
  perspective: function(fovy, aspect, near, far){
    var f = 1/Math.tan(fovy/2), nf = 1/(near-far);
    var m = new Float32Array(16);
    m[0]=f/aspect; m[5]=f; m[10]=(far+near)*nf; m[11]=-1; m[14]=2*far*near*nf;
    return m;
  },
  lookAt: function(eye, center, up){
    var zx=eye[0]-center[0], zy=eye[1]-center[1], zz=eye[2]-center[2];
    var zl=Math.hypot(zx,zy,zz)||1; zx/=zl; zy/=zl; zz/=zl;
    var xx=up[1]*zz-up[2]*zy, xy=up[2]*zx-up[0]*zz, xz=up[0]*zy-up[1]*zx;
    var xl=Math.hypot(xx,xy,xz)||1; xx/=xl; xy/=xl; xz/=xl;
    var yx=zy*xz-zz*xy, yy=zz*xx-zx*xz, yz=zx*xy-zy*xx;
    return new Float32Array([
      xx,yx,zx,0,
      xy,yy,zy,0,
      xz,yz,zz,0,
      -(xx*eye[0]+xy*eye[1]+xz*eye[2]),
      -(yx*eye[0]+yy*eye[1]+yz*eye[2]),
      -(zx*eye[0]+zy*eye[1]+zz*eye[2]), 1
    ]);
  },
  // обратная транспонированная 3x3 часть — для нормалей
  normalMat: function(m){
    var a00=m[0],a01=m[1],a02=m[2],
        a10=m[4],a11=m[5],a12=m[6],
        a20=m[8],a21=m[9],a22=m[10];
    var b01= a22*a11-a12*a21, b11=-a22*a10+a12*a20, b21= a21*a10-a11*a20;
    var det= a00*b01 + a01*b11 + a02*b21;
    if(!det) return new Float32Array([1,0,0, 0,1,0, 0,0,1]);
    det = 1/det;
    return new Float32Array([
      b01*det, (-a22*a01+a02*a21)*det, ( a12*a01-a02*a11)*det,
      b11*det, ( a22*a00-a02*a20)*det, (-a12*a00+a02*a10)*det,
      b21*det, (-a21*a00+a01*a20)*det, ( a11*a00-a01*a10)*det
    ]);
  },
  xform: function(m, p){
    return [
      m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],
      m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],
      m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]
    ];
  }
};

/* ---------------- Построение геометрии ---------------- */
function Geo(){ this.pos=[]; this.nrm=[]; this.idx=[]; }
Geo.prototype.push = function(g, mat){
  var base = this.pos.length/3;
  var nm = mat ? M4.normalMat(mat) : null;
  for(var i=0;i<g.pos.length;i+=3){
    var p=[g.pos[i],g.pos[i+1],g.pos[i+2]];
    var n=[g.nrm[i],g.nrm[i+1],g.nrm[i+2]];
    if(mat){
      p = M4.xform(mat,p);
      n = [nm[0]*n[0]+nm[3]*n[1]+nm[6]*n[2],
           nm[1]*n[0]+nm[4]*n[1]+nm[7]*n[2],
           nm[2]*n[0]+nm[5]*n[1]+nm[8]*n[2]];
      var l=Math.hypot(n[0],n[1],n[2])||1; n[0]/=l; n[1]/=l; n[2]/=l;
    }
    this.pos.push(p[0],p[1],p[2]);
    this.nrm.push(n[0],n[1],n[2]);
  }
  for(var j=0;j<g.idx.length;j++) this.idx.push(g.idx[j]+base);
  return this;
};

/* Тело вращения вокруг оси Y.
   profile: [[radius, y], ...] снизу вверх. */
function lathe(profile, seg, capBottom, capTop){
  var g = new Geo();
  var rows = profile.length;
  for(var i=0;i<rows;i++){
    for(var s=0;s<=seg;s++){
      var a = s/seg*Math.PI*2;
      var ca=Math.cos(a), sa=Math.sin(a);
      var r=profile[i][0], y=profile[i][1];
      g.pos.push(r*ca, y, r*sa);
      // нормаль из наклона профиля
      var i0=Math.max(0,i-1), i1=Math.min(rows-1,i+1);
      var dr=profile[i1][0]-profile[i0][0], dy=profile[i1][1]-profile[i0][1];
      var nl=Math.hypot(dr,dy)||1;
      var nr=dy/nl, ny=-dr/nl;
      g.nrm.push(nr*ca, ny, nr*sa);
    }
  }
  for(var i2=0;i2<rows-1;i2++){
    for(var s2=0;s2<seg;s2++){
      var a0=i2*(seg+1)+s2, b0=a0+1, c0=a0+seg+1, d0=c0+1;
      g.idx.push(a0,c0,b0, b0,c0,d0);
    }
  }
  function cap(rowIdx, y, r, dir){
    var ci = g.pos.length/3;
    g.pos.push(0,y,0); g.nrm.push(0,dir,0);
    var start = g.pos.length/3;
    for(var s=0;s<=seg;s++){
      var a=s/seg*Math.PI*2;
      g.pos.push(r*Math.cos(a), y, r*Math.sin(a));
      g.nrm.push(0,dir,0);
    }
    for(var s3=0;s3<seg;s3++){
      if(dir>0) g.idx.push(ci, start+s3, start+s3+1);
      else g.idx.push(ci, start+s3+1, start+s3);
    }
  }
  if(capBottom) cap(0, profile[0][1], profile[0][0], -1);
  if(capTop) cap(rows-1, profile[rows-1][1], profile[rows-1][0], 1);
  return g;
}

/* Сфера/эллипсоид */
function ellipsoid(rx, ry, rz, seg, rings){
  var g=new Geo();
  for(var i=0;i<=rings;i++){
    var v=i/rings*Math.PI, sv=Math.sin(v), cv=Math.cos(v);
    for(var s=0;s<=seg;s++){
      var u=s/seg*Math.PI*2, su=Math.sin(u), cu=Math.cos(u);
      g.pos.push(rx*sv*cu, ry*cv, rz*sv*su);
      var nx=sv*cu/rx, ny=cv/ry, nz=sv*su/rz;
      var l=Math.hypot(nx,ny,nz)||1;
      g.nrm.push(nx/l, ny/l, nz/l);
    }
  }
  for(var i2=0;i2<rings;i2++)
    for(var s2=0;s2<seg;s2++){
      var a=i2*(seg+1)+s2, b=a+1, c=a+seg+1, d=c+1;
      g.idx.push(a,b,c, b,d,c);
    }
  return g;
}

/* Капсула вдоль Y: радиус r, длина тела len (без полусфер) */
function capsule(r1, r2, len, seg){
  var prof=[], steps=6;
  for(var i=steps;i>=0;i--){
    var a=i/steps*Math.PI/2;
    prof.push([r1*Math.cos(a), -Math.sin(a)*r1]);
  }
  prof.push([r1,0]);
  prof.push([r2,len]);
  for(var j=0;j<=steps;j++){
    var a2=j/steps*Math.PI/2;
    prof.push([r2*Math.cos(a2), len+Math.sin(a2)*r2]);
  }
  return lathe(prof, seg, false, false);
}

/* Коробка со скруглением по краям (упрощённо — просто коробка) */
function box(w,h,d){
  var g=new Geo();
  var x=w/2, y=h/2, z=d/2;
  var faces=[
    [[-x,-y, z],[ x,-y, z],[ x, y, z],[-x, y, z],[0,0,1]],
    [[ x,-y,-z],[-x,-y,-z],[-x, y,-z],[ x, y,-z],[0,0,-1]],
    [[-x,-y,-z],[-x,-y, z],[-x, y, z],[-x, y,-z],[-1,0,0]],
    [[ x,-y, z],[ x,-y,-z],[ x, y,-z],[ x, y, z],[1,0,0]],
    [[-x, y, z],[ x, y, z],[ x, y,-z],[-x, y,-z],[0,1,0]],
    [[-x,-y,-z],[ x,-y,-z],[ x,-y, z],[-x,-y, z],[0,-1,0]]
  ];
  faces.forEach(function(f){
    var b=g.pos.length/3;
    for(var i=0;i<4;i++){ g.pos.push(f[i][0],f[i][1],f[i][2]); g.nrm.push(f[4][0],f[4][1],f[4][2]); }
    g.idx.push(b,b+1,b+2, b,b+2,b+3);
  });
  return g;
}

/* Трубка по ломаной (сосуды, нервы) */
function tube(points, r, seg){
  var g=new Geo();
  var rings=points.length;
  for(var i=0;i<rings;i++){
    var p=points[i];
    var pPrev=points[Math.max(0,i-1)], pNext=points[Math.min(rings-1,i+1)];
    var t=[pNext[0]-pPrev[0], pNext[1]-pPrev[1], pNext[2]-pPrev[2]];
    var tl=Math.hypot(t[0],t[1],t[2])||1; t=[t[0]/tl,t[1]/tl,t[2]/tl];
    var up = Math.abs(t[1])>0.9 ? [1,0,0] : [0,1,0];
    var n1=[up[1]*t[2]-up[2]*t[1], up[2]*t[0]-up[0]*t[2], up[0]*t[1]-up[1]*t[0]];
    var l1=Math.hypot(n1[0],n1[1],n1[2])||1; n1=[n1[0]/l1,n1[1]/l1,n1[2]/l1];
    var n2=[t[1]*n1[2]-t[2]*n1[1], t[2]*n1[0]-t[0]*n1[2], t[0]*n1[1]-t[1]*n1[0]];
    for(var s=0;s<=seg;s++){
      var a=s/seg*Math.PI*2, ca=Math.cos(a), sa=Math.sin(a);
      var nx=n1[0]*ca+n2[0]*sa, ny=n1[1]*ca+n2[1]*sa, nz=n1[2]*ca+n2[2]*sa;
      g.pos.push(p[0]+nx*r, p[1]+ny*r, p[2]+nz*r);
      g.nrm.push(nx,ny,nz);
    }
  }
  for(var i2=0;i2<rings-1;i2++)
    for(var s2=0;s2<seg;s2++){
      var a2=i2*(seg+1)+s2, b2=a2+1, c2=a2+seg+1, d2=c2+1;
      g.idx.push(a2,c2,b2, b2,c2,d2);
    }
  return g;
}

/* Тор — кольцевые маркеры */
function torus(R, r, seg, ring){
  var g=new Geo();
  for(var i=0;i<=ring;i++){
    var u=i/ring*Math.PI*2, cu=Math.cos(u), su=Math.sin(u);
    for(var s=0;s<=seg;s++){
      var v=s/seg*Math.PI*2, cv=Math.cos(v), sv=Math.sin(v);
      g.pos.push((R+r*cv)*cu, r*sv, (R+r*cv)*su);
      g.nrm.push(cv*cu, sv, cv*su);
    }
  }
  for(var i2=0;i2<ring;i2++)
    for(var s2=0;s2<seg;s2++){
      var a=i2*(seg+1)+s2, b=a+1, c=a+seg+1, d=c+1;
      g.idx.push(a,c,b, b,c,d);
    }
  return g;
}

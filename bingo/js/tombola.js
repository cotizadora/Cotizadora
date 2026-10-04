/* Tómbola de aire: simulación física 3D de las bolas dentro de una esfera transparente,
   proyectada en perspectiva sobre un canvas 2D. El número a extraer lo decide Game;
   aquí solo se representa visualmente ese resultado. */
(function (Bingo) {
  'use strict';

  var CAM = 3.4;           // distancia de la cámara al centro de la esfera (radio = 1)
  var BALL_R = 0.118;      // radio de cada bola
  var WALL = 1 - BALL_R;
  var GRAVITY = 22;
  var TUBE_R = 0.135;
  var INTAKE = { x: 0, y: 0.86, z: 0 };
  var TRAY = { x: 1.24, y: 0.36 };

  var COLORS = [
    { base: '#2f6fd6', light: '#7fb0ff', dark: '#173c86' },  // B
    { base: '#d3392f', light: '#ff8a7a', dark: '#7c1611' },  // I
    { base: '#e7e0cf', light: '#ffffff', dark: '#9c9278' },  // N
    { base: '#2b9a5a', light: '#79dca0', dark: '#145530' },  // G
    { base: '#f1a51c', light: '#ffd67a', dark: '#94590a' }   // O
  ];
  var LABEL_BG = '#fbf8f1';
  var LABEL_INK = '#16130f';
  var FONT = '"Barlow Condensed", "Arial Narrow", "Roboto Condensed", sans-serif';

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function easeOutBack(t) { var c = 1.4; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rand(a, b) { return a + Math.random() * (b - a); }

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
    return c;
  }

  /* Recorrido del tubo de salida (coordenadas del mundo, plano z = 0). */
  function buildTubePath() {
    var pts = [], i, a;
    var segs = [];
    segs.push(function (t) { return { x: 0, y: lerp(INTAKE.y, 1.14, t) }; });
    segs.push(function (t) { a = Math.PI - t * Math.PI / 2; return { x: 0.22 + 0.22 * Math.cos(a), y: 1.14 + 0.22 * Math.sin(a) }; });
    segs.push(function (t) { return { x: lerp(0.22, 1.02, t), y: 1.36 }; });
    segs.push(function (t) { a = Math.PI / 2 - t * Math.PI / 2; return { x: 1.02 + 0.22 * Math.cos(a), y: 1.14 + 0.22 * Math.sin(a) }; });
    segs.push(function (t) { return { x: 1.24, y: lerp(1.14, TRAY.y, t) }; });
    var steps = [8, 14, 16, 14, 18];
    for (var s = 0; s < segs.length; s++) {
      for (i = (s === 0 ? 0 : 1); i <= steps[s]; i++) pts.push(segs[s](i / steps[s]));
    }
    var len = 0;
    pts[0].d = 0;
    for (i = 1; i < pts.length; i++) {
      len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      pts[i].d = len;
    }
    return { pts: pts, length: len };
  }

  function pointOnPath(path, d) {
    var p = path.pts;
    if (d <= 0) return { x: p[0].x, y: p[0].y };
    for (var i = 1; i < p.length; i++) {
      if (p[i].d >= d) {
        var t = (d - p[i - 1].d) / (p[i].d - p[i - 1].d);
        return { x: lerp(p[i - 1].x, p[i].x, t), y: lerp(p[i - 1].y, p[i].y, t) };
      }
    }
    var last = p[p.length - 1];
    return { x: last.x, y: last.y };
  }

  function Ball(num) {
    this.num = num;
    this.color = Bingo.columnFor(num);
    this.x = 0; this.y = 0; this.z = 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    var a = rand(0, Math.PI * 2), b = rand(-1, 1), s = Math.sqrt(1 - b * b);
    this.nx = Math.cos(a) * s; this.ny = b; this.nz = Math.sin(a) * s;
    this.wx = rand(-3, 3); this.wy = rand(-3, 3); this.wz = rand(-3, 3);
    this.kinematic = false;
  }

  function Tombola(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onSound = opts.onSound || function () {};
    this._airReported = -1;
    this.reducedMotion = !!opts.reducedMotion;
    this.balls = [];
    this.air = 0.08;            // nivel actual del soplador (0..1)
    this.airTarget = 0.08;
    this.time = 0;
    this.tweens = [];
    this.selected = null;       // bola viajando por el tubo / presentándose
    this.trayBall = null;       // última bola en la bandeja
    this.dropping = null;       // bola anterior saliendo de la bandeja
    this.present = null;        // estado de la presentación en primer plano
    this.path = buildTubePath();
    this.dpr = 1;
    this.quality = 1;
    this._slow = 0; this._frames = 0;
    this._order = [];
    this.W = 0; this.H = 0;
    this._lastFrame = 0;
    this._running = false;
    this._impacts = [];
    this._loop = this._loop.bind(this);
    this.resize();
  }

  /* ---------- Configuración y tamaño ---------- */

  Tombola.prototype.setReducedMotion = function (on) { this.reducedMotion = on; };

  Tombola.prototype.resize = function () {
    var rect = this.canvas.getBoundingClientRect();
    var w = Math.max(200, rect.width), h = Math.max(200, rect.height);
    // Resolución limitada por presupuesto de píxeles (y rebajada si el equipo va lento).
    var budget = 1100000 * this.quality;
    this.dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(budget / (w * h))));
    this.W = w; this.H = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    // Composición: esfera + tubo a la derecha + pedestal debajo.
    var S = Math.min(h * 0.94 / 3.02, w * 0.93 / 2.55);
    this.S = S * this.dpr;
    this.cx = (w / 2 - 0.2 * S) * this.dpr;
    this.cy = ((h - 3.02 * S) / 2 + 1.52 * S) * this.dpr;
    this._buildSprites();
    this._buildStatic();
    this._render();
  };

  Tombola.prototype.project = function (x, y, z) {
    var k = CAM / (CAM - z);
    return { x: this.cx + x * k * this.S, y: this.cy - y * k * this.S, k: k };
  };

  /* ---------- Sprites de las bolas ---------- */

  Tombola.prototype._buildSprites = function () {
    var maxPx = BALL_R * this.S * (CAM / (CAM - 1)) * 1.15;
    var r = Math.max(8, Math.ceil(maxPx));
    this.spriteR = r;
    var size = r * 2 + 2, c, g, i;

    this.baseSprites = COLORS.map(function (col) {
      c = makeCanvas(size, size); g = c.getContext('2d');
      var grad = g.createRadialGradient(size / 2 - r * 0.35, size / 2 - r * 0.4, r * 0.1, size / 2, size / 2, r);
      grad.addColorStop(0, col.light); grad.addColorStop(0.45, col.base); grad.addColorStop(1, col.dark);
      g.fillStyle = grad; g.beginPath(); g.arc(size / 2, size / 2, r, 0, Math.PI * 2); g.fill();
      return c;
    });

    c = makeCanvas(size, size); g = c.getContext('2d');
    var rim = g.createRadialGradient(size / 2 - r * 0.2, size / 2 - r * 0.25, r * 0.45, size / 2, size / 2, r);
    rim.addColorStop(0, 'rgba(0,0,0,0)'); rim.addColorStop(0.75, 'rgba(0,0,0,0.12)'); rim.addColorStop(1, 'rgba(0,0,0,0.5)');
    g.fillStyle = rim; g.beginPath(); g.arc(size / 2, size / 2, r, 0, Math.PI * 2); g.fill();
    var hx = size / 2 - r * 0.38, hy = size / 2 - r * 0.42;
    var spec = g.createRadialGradient(hx, hy, 0, hx, hy, r * 0.42);
    spec.addColorStop(0, 'rgba(255,255,255,0.9)'); spec.addColorStop(0.35, 'rgba(255,255,255,0.35)'); spec.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = spec; g.beginPath(); g.arc(hx, hy, r * 0.42, 0, Math.PI * 2); g.fill();
    this.shadeSprite = c;

    c = makeCanvas(size, size); g = c.getContext('2d');
    g.fillStyle = '#0a1411'; g.beginPath(); g.arc(size / 2, size / 2, r, 0, Math.PI * 2); g.fill();
    this.fogSprite = c;

    var lr = Math.ceil(r * 0.52), ls = lr * 2 + 2;
    this.labelR = lr;
    this.labels = [null];
    for (i = 1; i <= Bingo.TOTAL; i++) {
      c = makeCanvas(ls, ls); g = c.getContext('2d');
      g.fillStyle = LABEL_BG; g.beginPath(); g.arc(ls / 2, ls / 2, lr, 0, Math.PI * 2); g.fill();
      g.fillStyle = LABEL_INK;
      g.font = '700 ' + Math.round(lr * 1.18) + 'px ' + FONT;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(i), ls / 2, ls / 2 + lr * 0.06, lr * 1.7);
      this.labels.push(c);
    }
  };

  /* ---------- Capas estáticas: pedestal, vidrio y tubo ---------- */

  Tombola.prototype._worldPath = function (g, pts, ox, oy) {
    g.beginPath();
    for (var i = 0; i < pts.length; i++) {
      var p = this.project(pts[i].x, pts[i].y, 0);
      if (i === 0) g.moveTo(p.x - ox, p.y - oy); else g.lineTo(p.x - ox, p.y - oy);
    }
  };

  Tombola.prototype._buildStatic = function () {
    var cw = this.canvas.width, ch = this.canvas.height;
    var S = this.S, cx = this.cx, cy = this.cy;
    var Rs = S * CAM / Math.sqrt(CAM * CAM - 1);   // radio aparente de la esfera
    this.Rs = Rs;
    var self = this;
    function P(x, y) { return self.project(x, y, 0); }

    /* --- Capa trasera --- */
    var back = makeCanvas(cw, ch), g = back.getContext('2d');

    // Varilla soporte de la bandeja.
    var rodTop = P(TRAY.x, TRAY.y - 0.16), rodBot = P(TRAY.x, -1.37);
    g.strokeStyle = '#8c6b2a'; g.lineWidth = Math.max(2, S * 0.028); g.lineCap = 'round';
    g.beginPath(); g.moveTo(rodTop.x, rodTop.y); g.lineTo(rodBot.x, rodBot.y); g.stroke();
    var armA = P(0.66, -1.37);
    g.beginPath(); g.moveTo(armA.x, armA.y); g.lineTo(rodBot.x, rodBot.y); g.stroke();

    // Pedestal.
    var colTopY = P(0, -0.93).y, colBotY = P(0, -1.36).y;
    var body = g.createLinearGradient(cx - S * 0.6, 0, cx + S * 0.6, 0);
    body.addColorStop(0, '#0f1a17'); body.addColorStop(0.35, '#2a3b35'); body.addColorStop(0.55, '#1c2a26'); body.addColorStop(1, '#0b1311');
    g.fillStyle = body;
    g.beginPath();
    g.moveTo(cx - S * 0.30, colTopY); g.lineTo(cx + S * 0.30, colTopY);
    g.lineTo(cx + S * 0.6, colBotY); g.lineTo(cx - S * 0.6, colBotY); g.closePath(); g.fill();
    // Rejilla de ventilación del soplador.
    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = Math.max(1, S * 0.012);
    for (var v = -3; v <= 3; v++) {
      var vx = cx + v * S * 0.075;
      g.beginPath(); g.moveTo(vx, lerp(colTopY, colBotY, 0.38)); g.lineTo(vx + v * S * 0.012, lerp(colTopY, colBotY, 0.78)); g.stroke();
    }
    // Base.
    var baseY = colBotY, baseH = S * 0.11;
    var brass = g.createLinearGradient(0, baseY, 0, baseY + baseH);
    brass.addColorStop(0, '#e6c374'); brass.addColorStop(0.5, '#b88a2e'); brass.addColorStop(1, '#6e5016');
    g.fillStyle = brass;
    roundRect(g, cx - S * 0.74, baseY, S * 1.48 + (rodBot.x - cx - S * 0.7) + S * 0.08, baseH, baseH * 0.35); g.fill();
    // Contacto en el suelo.
    var fl = g.createRadialGradient(cx + S * 0.2, baseY + baseH * 1.1, 0, cx + S * 0.2, baseY + baseH * 1.1, S * 1.2);
    fl.addColorStop(0, 'rgba(0,0,0,0.35)'); fl.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = fl; g.fillRect(cx - S * 1.4, baseY + baseH * 0.6, S * 2.8, baseH * 1.5);

    // Interior de la esfera.
    var inner = g.createRadialGradient(cx, cy, Rs * 0.2, cx, cy, Rs);
    inner.addColorStop(0, 'rgba(210,235,225,0.035)'); inner.addColorStop(0.8, 'rgba(210,235,225,0.06)'); inner.addColorStop(1, 'rgba(210,235,225,0.13)');
    g.fillStyle = inner; g.beginPath(); g.arc(cx, cy, Rs, 0, Math.PI * 2); g.fill();
    // Borde trasero (curvatura interior).
    g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = Math.max(1, S * 0.012);
    g.beginPath(); g.ellipse(cx, cy + Rs * 0.62, Rs * 0.78, Rs * 0.16, 0, Math.PI, Math.PI * 2); g.stroke();

    // Cuerpo trasero del tubo.
    var tubeW = TUBE_R * 2 * S;
    g.lineJoin = 'round'; g.lineCap = 'butt';
    this._worldPath(g, this.path.pts, 0, 0);
    g.strokeStyle = 'rgba(200,230,220,0.07)'; g.lineWidth = tubeW; g.stroke();

    // Copa trasera de la bandeja.
    var tp = P(TRAY.x, TRAY.y), tr = BALL_R * S * 1.25;
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath(); g.ellipse(tp.x, tp.y + tr * 0.55, tr * 1.05, tr * 0.32, 0, 0, Math.PI * 2); g.fill();
    this.backLayer = back;

    /* --- Capa delantera --- */
    var front = makeCanvas(cw, ch); g = front.getContext('2d');
    // Fresnel del borde de la esfera.
    var fres = g.createRadialGradient(cx, cy, Rs * 0.82, cx, cy, Rs);
    fres.addColorStop(0, 'rgba(255,255,255,0)'); fres.addColorStop(1, 'rgba(225,245,238,0.16)');
    g.fillStyle = fres; g.beginPath(); g.arc(cx, cy, Rs, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(235,250,245,0.38)'; g.lineWidth = Math.max(1.2, S * 0.008);
    g.beginPath(); g.arc(cx, cy, Rs, 0, Math.PI * 2); g.stroke();
    // Reflejo de ventana arriba a la izquierda.
    g.save();
    g.beginPath(); g.arc(cx, cy, Rs * 0.93, Math.PI * 1.08, Math.PI * 1.42); g.arc(cx, cy, Rs * 0.8, Math.PI * 1.40, Math.PI * 1.10, true); g.closePath();
    var refl = g.createLinearGradient(cx - Rs, cy - Rs, cx, cy);
    refl.addColorStop(0, 'rgba(255,255,255,0.30)'); refl.addColorStop(1, 'rgba(255,255,255,0.04)');
    g.fillStyle = refl; g.fill();
    g.restore();
    var hs = g.createRadialGradient(cx - Rs * 0.48, cy - Rs * 0.55, 0, cx - Rs * 0.48, cy - Rs * 0.55, Rs * 0.12);
    hs.addColorStop(0, 'rgba(255,255,255,0.55)'); hs.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hs; g.beginPath(); g.arc(cx - Rs * 0.48, cy - Rs * 0.55, Rs * 0.12, 0, Math.PI * 2); g.fill();
    // Reflejo secundario abajo a la derecha.
    g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = Math.max(2, S * 0.03); g.lineCap = 'round';
    g.beginPath(); g.arc(cx, cy, Rs * 0.88, Math.PI * 0.12, Math.PI * 0.32); g.stroke();

    // Collarines metálicos (arriba: toma del tubo; abajo: unión con el pedestal).
    drawCollar(g, P(0, 0.985), S * 0.17, S * 0.05);
    drawCollar(g, P(0, -0.965), S * 0.33, S * 0.07);

    // Paredes del tubo (por delante de la bola que sube), en la misma capa.
    this._worldPath(g, this.path.pts, 0, 0);
    g.lineJoin = 'round';
    var walls = makeCanvas(cw, ch), wg = walls.getContext('2d');
    wg.lineJoin = 'round';
    this._worldPath(wg, this.path.pts, 0, 0);
    wg.strokeStyle = 'rgba(225,245,238,0.30)'; wg.lineWidth = tubeW; wg.stroke();
    wg.globalCompositeOperation = 'destination-out';
    this._worldPath(wg, this.path.pts, 0, 0);
    wg.strokeStyle = 'rgba(0,0,0,0.88)'; wg.lineWidth = tubeW - Math.max(2.5, S * 0.016); wg.stroke();
    g.drawImage(walls, 0, 0);
    this._worldPath(g, this.path.pts, tubeW * 0.22, tubeW * 0.22);
    g.strokeStyle = 'rgba(255,255,255,0.13)'; g.lineWidth = tubeW * 0.14; g.stroke();

    // Labio delantero de la bandeja.
    g.save();
    var lipG = g.createLinearGradient(0, tp.y, 0, tp.y + tr * 1.2);
    lipG.addColorStop(0, '#f0d189'); lipG.addColorStop(0.5, '#b88a2e'); lipG.addColorStop(1, '#5e4310');
    g.fillStyle = lipG;
    g.beginPath();
    g.ellipse(tp.x, tp.y + tr * 0.35, tr * 1.08, tr * 0.32, 0, 0, Math.PI);
    g.lineTo(tp.x - tr * 0.85, tp.y + tr * 0.9);
    g.ellipse(tp.x, tp.y + tr * 0.9, tr * 0.85, tr * 0.28, 0, Math.PI, 0, true);
    g.closePath(); g.fill();
    g.restore();
    this.frontLayer = front;
  };

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
  }

  function drawCollar(g, p, hw, hh) {
    var grad = g.createLinearGradient(p.x - hw, 0, p.x + hw, 0);
    grad.addColorStop(0, '#6e5016'); grad.addColorStop(0.3, '#f0d189'); grad.addColorStop(0.6, '#b88a2e'); grad.addColorStop(1, '#5e4310');
    g.fillStyle = grad;
    g.beginPath(); g.ellipse(p.x, p.y, hw, hh, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1;
    g.beginPath(); g.ellipse(p.x, p.y, hw * 0.7, hh * 0.45, 0, 0, Math.PI * 2); g.stroke();
  }

  /* ---------- Estado de las bolas ---------- */

  /* Carga las bolas disponibles. fromTop: entran cayendo (nueva partida). */
  Tombola.prototype.load = function (numbers, lastNumber, fromTop) {
    this._flushTweens();
    this.selected = null; this.present = null; this.dropping = null;
    this.trayBall = lastNumber ? { num: lastNumber, alpha: 1 } : null;
    this.balls = [];
    this._order.length = 0;
    for (var i = 0; i < numbers.length; i++) {
      var b = new Ball(numbers[i]), tries = 0, ok;
      do {
        ok = true;
        var a = rand(0, Math.PI * 2), rr = Math.sqrt(Math.random()) * 0.78;
        b.x = Math.cos(a) * rr; b.z = Math.sin(a) * rr;
        b.y = fromTop ? rand(0.0, 0.78) : rand(-0.85, 0.2);
        if (b.x * b.x + b.y * b.y + b.z * b.z > WALL * WALL) { ok = false; }
        for (var j = 0; ok && j < this.balls.length; j++) {
          var o = this.balls[j], dx = o.x - b.x, dy = o.y - b.y, dz = o.z - b.z;
          if (dx * dx + dy * dy + dz * dz < 4 * BALL_R * BALL_R * 0.9) ok = false;
        }
      } while (!ok && ++tries < 60);
      this.balls.push(b);
    }
    if (!fromTop) for (var s = 0; s < 240; s++) this._step(1 / 120, true);
    this.air = this.airTarget = 0.08;
  };

  Tombola.prototype.setAir = function (level) { this.airTarget = level; };

  /* ---------- Física ---------- */

  /* Bolas macizas tipo billar: gravedad real a escala de la esfera (radio ≈ 20 cm),
     choques duros y el soplador como ráfagas impulsivas desde la boquilla inferior. */
  Tombola.prototype._step = function (dt, silent) {
    var balls = this.balls, n = balls.length, i, j, it, b, o;
    var A = this.air;
    var drag = Math.exp(-0.08 * dt);
    var rate = 0.1 + 9 * A;             // ráfagas por segundo para cada bola en la corriente de aire
    var kick = 1.8 + 9.5 * A;           // velocidad que entrega cada ráfaga

    for (i = 0; i < n; i++) {
      b = balls[i];
      if (b.kinematic) continue;
      b.vy -= GRAVITY * dt;
      if (b.y < -0.15) {
        var h2 = b.x * b.x + b.z * b.z;
        // La corriente es más fuerte junto a la boquilla y se abre hacia arriba.
        var reach = h2 < 0.55 ? (1 - h2 / 0.55) * (b.y < -0.5 ? 1 : 0.45) : 0;
        if (reach > 0 && Math.random() < rate * dt * reach) {
          var s = kick * (0.55 + 0.45 * Math.random());
          b.vy += s;
          b.vx += (Math.random() - 0.5) * s * 0.7;
          b.vz += (Math.random() - 0.5) * s * 0.7;
          b.wx += (Math.random() - 0.5) * 40; b.wz += (Math.random() - 0.5) * 40;
        }
      }
      b.vx *= drag; b.vy *= drag; b.vz *= drag;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    }

    var D = BALL_R * 2, D2 = D * D;
    for (it = 0; it < 2; it++) {
      for (i = 0; i < n; i++) {
        b = balls[i];
        for (j = i + 1; j < n; j++) {
          o = balls[j];
          var dx = b.x - o.x, dy = b.y - o.y, dz = b.z - o.z;
          var d2 = dx * dx + dy * dy + dz * dz;
          if (d2 >= D2 || d2 < 1e-9) continue;
          var d = Math.sqrt(d2), nx = dx / d, ny = dy / d, nz = dz / d, ov = D - d;
          var wb = b.kinematic ? 0 : (o.kinematic ? 1 : 0.5), wo = o.kinematic ? 0 : (b.kinematic ? 1 : 0.5);
          b.x += nx * ov * wb; b.y += ny * ov * wb; b.z += nz * ov * wb;
          o.x -= nx * ov * wo; o.y -= ny * ov * wo; o.z -= nz * ov * wo;
          var rvx = b.vx - o.vx, rvy = b.vy - o.vy, rvz = b.vz - o.vz;
          var vn = rvx * nx + rvy * ny + rvz * nz;
          if (vn < 0) {
            // Rebote duro en choques rápidos; contacto quieto en la pila (sin temblor).
            var e = -vn > 0.9 ? 0.88 : 0.05;
            var imp = -(1 + e) * vn;
            b.vx += nx * imp * wb; b.vy += ny * imp * wb; b.vz += nz * imp * wb;
            o.vx -= nx * imp * wo; o.vy -= ny * imp * wo; o.vz -= nz * imp * wo;
            // Fricción tangencial y giro.
            var tx = rvx - vn * nx, ty = rvy - vn * ny, tz = rvz - vn * nz, f = 0.1;
            b.vx -= tx * f * wb; b.vy -= ty * f * wb; b.vz -= tz * f * wb;
            o.vx += tx * f * wo; o.vy += ty * f * wo; o.vz += tz * f * wo;
            var k = 0.35 / BALL_R;
            b.wx += (ny * tz - nz * ty) * k * wb; b.wy += (nz * tx - nx * tz) * k * wb; b.wz += (nx * ty - ny * tx) * k * wb;
            o.wx += (ny * tz - nz * ty) * k * wo; o.wy += (nz * tx - nx * tz) * k * wo; o.wz += (nx * ty - ny * tx) * k * wo;
            if (!silent && it === 0 && -vn > 1.0) this._impacts.push(-vn, b.x, 0);
          }
        }
      }

      for (i = 0; i < n; i++) {
        b = balls[i];
        if (b.kinematic) continue;
        var dist = Math.sqrt(b.x * b.x + b.y * b.y + b.z * b.z);
        if (dist <= WALL) continue;
        var mx = b.x / dist, my = b.y / dist, mz = b.z / dist;
        b.x = mx * WALL; b.y = my * WALL; b.z = mz * WALL;
        var wn = b.vx * mx + b.vy * my + b.vz * mz;
        if (wn > 0) {
          var ew = wn > 1.2 ? 0.62 : 0;
          b.vx -= (1 + ew) * wn * mx; b.vy -= (1 + ew) * wn * my; b.vz -= (1 + ew) * wn * mz;
          if (!silent && it === 0 && wn > 1.4) this._impacts.push(wn, b.x, 1);
        }
        // Rodadura sobre la esfera: ω = (−n × v) / r, con resistencia a rodar.
        var rr = Math.exp(-1.6 * dt);
        b.vx *= rr; b.vy *= rr; b.vz *= rr;
        var rx = (-my * b.vz + mz * b.vy) / BALL_R, ry = (-mz * b.vx + mx * b.vz) / BALL_R, rz = (-mx * b.vy + my * b.vx) / BALL_R;
        b.wx = lerp(b.wx, rx, 0.3); b.wy = lerp(b.wy, ry, 0.3); b.wz = lerp(b.wz, rz, 0.3);
      }
    }

    var wd = Math.exp(-1.5 * dt);
    for (i = 0; i < n; i++) {
      b = balls[i];
      var ax = b.wy * b.nz - b.wz * b.ny, ay = b.wz * b.nx - b.wx * b.nz, az = b.wx * b.ny - b.wy * b.nx;
      b.nx += ax * dt; b.ny += ay * dt; b.nz += az * dt;
      var nl = Math.sqrt(b.nx * b.nx + b.ny * b.ny + b.nz * b.nz) || 1;
      b.nx /= nl; b.ny /= nl; b.nz /= nl;
      b.wx *= wd; b.wy *= wd; b.wz *= wd;
    }
  };

  /* ---------- Animaciones (reloj propio: se congela con la pestaña oculta) ---------- */

  Tombola.prototype._tween = function (dur, update) {
    var self = this;
    return new Promise(function (resolve) {
      self.tweens.push({ start: self.time, dur: Math.max(0.001, dur), update: update, resolve: resolve });
      self._kick();
    });
  };

  Tombola.prototype._flushTweens = function () {
    var list = this.tweens;
    this.tweens = [];
    for (var i = 0; i < list.length; i++) list[i].resolve(false);
  };

  Tombola.prototype._runTweens = function () {
    var keep = [];
    var list = this.tweens;
    this.tweens = [];
    for (var i = 0; i < list.length; i++) {
      var tw = list[i], p = clamp((this.time - tw.start) / tw.dur, 0, 1);
      tw.update(p);
      if (p >= 1) tw.resolve(true); else keep.push(tw);
    }
    this.tweens = keep.concat(this.tweens);
  };

  Tombola.prototype.wait = function (seconds) { return this._tween(seconds, function () {}); };

  /* Fase 1: mezcla con intensidad creciente. La bola anterior abandona la bandeja. */
  Tombola.prototype.mix = function (seconds) {
    var self = this;
    var peak = this.reducedMotion ? 0.45 : 1;
    var from = this.air;
    if (this.trayBall) {
      this.dropping = { num: this.trayBall.num, t: 0 };
      this.trayBall = null;
      this._tween(0.45, function (p) { self.dropping.t = p; if (p >= 1) self.dropping = null; });
    }
    return this._tween(seconds, function (p) { self.airTarget = lerp(from, peak, easeOut(Math.min(1, p * 2.5))); });
  };

  /* Fases 2–3: la bola elegida se separa, sube a la toma y recorre el tubo hasta la bandeja. */
  Tombola.prototype.extract = function (num) {
    var self = this, ball = null, i;
    for (i = 0; i < this.balls.length; i++) if (this.balls[i].num === num) { ball = this.balls[i]; break; }
    if (!ball) { ball = new Ball(num); ball.x = 0; ball.y = 0.5; ball.z = 0; this.balls.push(ball); }
    ball.kinematic = true;
    var p0 = { x: ball.x, y: ball.y, z: ball.z };
    var n0 = { x: ball.nx, y: ball.ny, z: ball.nz };
    var capture = this.reducedMotion ? 0.4 : 0.75;
    var travel = this.reducedMotion ? 0.55 : 0.95;
    var wob = rand(0, 6.28);

    return this._tween(capture, function (p) {
      var e = easeInOut(p);
      ball.x = lerp(p0.x, INTAKE.x, e) + Math.sin(p * 9 + wob) * 0.04 * (1 - p);
      ball.y = lerp(p0.y, INTAKE.y, e);
      ball.z = lerp(p0.z, INTAKE.z, e) + Math.cos(p * 7 + wob) * 0.04 * (1 - p);
      // La etiqueta gira hacia atrás: el número no se revela antes de tiempo.
      var hx = lerp(n0.x, 0.15, e), hy = lerp(n0.y, 0.35, e), hz = lerp(n0.z, -1, Math.min(1, e * 2.2));
      var l = Math.sqrt(hx * hx + hy * hy + hz * hz) || 1;
      ball.nx = hx / l; ball.ny = hy / l; ball.nz = hz / l;
      ball.wx = ball.wy = ball.wz = 0;
      ball.vx = ball.vy = ball.vz = 0;
    }).then(function (ok) {
      if (!ok) return false;
      var idx = self.balls.indexOf(ball);
      if (idx !== -1) self.balls.splice(idx, 1);
      self._order.length = 0;
      self.selected = { num: num, x: INTAKE.x, y: INTAKE.y, spin: 0 };
      self.airTarget = 0.3;
      self.onSound('tube', travel);
      return self._tween(travel, function (p) {
        var e = p < 0.25 ? 2 * p * p / 0.25 * 0.5 : 0.125 + (p - 0.25) / 0.75 * 0.875;
        var pt = pointOnPath(self.path, e * self.path.length);
        self.selected.x = pt.x; self.selected.y = pt.y;
        self.selected.spin = p * 14;
      });
    }).then(function (ok) {
      if (!ok) return false;
      self.airTarget = 0.08;
      self.onSound('land');
      return true;
    });
  };

  /* Fases 4–6: la bola sale hacia el frente, gira y muestra el número. */
  Tombola.prototype.presentBall = function (num) {
    var self = this;
    var dur = this.reducedMotion ? 0.35 : 0.85;
    var from = this.project(TRAY.x, TRAY.y, 0);
    this.selected = null;
    this.present = { num: num, x: from.x, y: from.y, r: BALL_R * this.S, back: 0, angle: Math.PI, fromX: from.x, fromY: from.y };
    var pr = this.present;
    return this._tween(dur, function (p) {
      var to = self._presentTarget();
      var e = self.reducedMotion ? easeOut(p) : easeOutBack(p);
      var m = easeOut(p);
      pr.x = lerp(pr.fromX, to.x, m);
      pr.y = lerp(pr.fromY, to.y, m) - Math.sin(m * Math.PI) * to.r * (self.reducedMotion ? 0 : 0.9);
      pr.r = lerp(BALL_R * self.S, to.r, Math.max(0, e));
      pr.back = m;
      pr.angle = self.reducedMotion ? 0 : Math.PI * (1 - easeInOut(clamp((p - 0.15) / 0.85, 0, 1)));
    });
  };

  Tombola.prototype._presentTarget = function () {
    var W = this.canvas.width, H = this.canvas.height;
    return { x: W * 0.5, y: H * 0.47, r: Math.min(W, H) * 0.25 };
  };

  /* Fase final: la bola vuelve a la bandeja y queda como “última”. */
  Tombola.prototype.dismiss = function () {
    var self = this, pr = this.present;
    if (!pr) return Promise.resolve(true);
    var dur = this.reducedMotion ? 0.25 : 0.5;
    var sx = pr.x, sy = pr.y, sr = pr.r;
    return this._tween(dur, function (p) {
      var e = easeInOut(p), to = self.project(TRAY.x, TRAY.y, 0);
      pr.x = lerp(sx, to.x, e); pr.y = lerp(sy, to.y, e); pr.r = lerp(sr, BALL_R * self.S, e);
      pr.back = 1 - e; pr.angle = 0;
    }).then(function (ok) {
      if (!ok) return false;
      self.trayBall = { num: pr.num };
      self.present = null;
      return true;
    });
  };

  /* ---------- Bucle de animación ---------- */

  Tombola.prototype.start = function () { this._running = true; this._kick(); };
  Tombola.prototype.stop = function () { this._running = false; };
  Tombola.prototype._kick = function () {
    if (!this._raf && this._running) { this._lastFrame = 0; this._raf = requestAnimationFrame(this._loop); }
  };

  Tombola.prototype._loop = function (now) {
    this._raf = 0;
    if (!this._running) return;
    var raw = this._lastFrame ? now - this._lastFrame : 16.7;
    var dt = Math.min(0.05, raw / 1000);
    this._lastFrame = now;
    this._adapt(raw);
    this.time += dt;
    this.air += (this.airTarget - this.air) * (1 - Math.exp(-dt * 5));
    if (Math.abs(this.air - this._airReported) > 0.03) { this._airReported = this.air; this.onSound('air', this.air); }
    var steps = Math.min(4, Math.ceil(dt / (1 / 120)));
    for (var i = 0; i < steps; i++) this._step(dt / steps, false);
    this._emitImpacts();
    this._runTweens();
    this._render();
    this._raf = requestAnimationFrame(this._loop);
  };

  /* Si el equipo no sostiene la animación, baja la resolución del lienzo (hasta 2 veces). */
  Tombola.prototype._adapt = function (frameMs) {
    if (frameMs > 200) return;
    this._frames++;
    if (frameMs > 24) this._slow++;
    if (this._frames < 40) return;
    if (this._slow > 24 && this.quality > 0.3) {
      this.quality *= 0.62;
      this.resize();
    }
    this._frames = 0; this._slow = 0;
  };

  Tombola.prototype._emitImpacts = function () {
    var list = this._impacts, count = list.length / 3;
    if (!count) return;
    // Hasta 4 choques por cuadro, los más fuertes (lista plana v, x, tipo: sin crear objetos).
    for (var k = 0; k < Math.min(4, count); k++) {
      var best = -1, bv = 0;
      for (var i = 0; i < list.length; i += 3) if (list[i] > bv) { bv = list[i]; best = i; }
      if (best < 0) break;
      this.onSound(list[best + 2] ? 'wall' : 'ball', clamp(bv / 7, 0.05, 1), clamp(list[best + 1], -1, 1) * 0.6);
      list[best] = 0;
    }
    list.length = 0;
  };

  /* ---------- Dibujo ---------- */

  Tombola.prototype._drawBall = function (b, x, y, rpx, nx, ny, nz, fog) {
    var ctx = this.ctx, s = rpx / this.spriteR, half = this.baseSprites[0].width / 2;
    ctx.setTransform(s, 0, 0, s, x, y);
    ctx.drawImage(this.baseSprites[b.color], -half, -half);
    if (nz > 0.06) {
      var label = this.labels[b.num], lh = label.width / 2;
      var ox = nx * rpx * 0.56, oy = -ny * rpx * 0.56;
      var len = Math.sqrt(nx * nx + ny * ny);
      var c = len > 1e-4 ? nx / len : 1, sn = len > 1e-4 ? -ny / len : 0;
      var a = c * c * nz + sn * sn, bb = c * sn * (nz - 1), d = sn * sn * nz + c * c;
      ctx.setTransform(a * s, bb * s, bb * s, d * s, x + ox, y + oy);
      ctx.drawImage(label, -lh, -lh);
      ctx.setTransform(s, 0, 0, s, x, y);
    }
    ctx.drawImage(this.shadeSprite, -half, -half);
    if (fog > 0.01) {
      ctx.globalAlpha = fog;
      ctx.drawImage(this.fogSprite, -half, -half);
      ctx.globalAlpha = 1;
    }
  };

  Tombola.prototype._render = function () {
    var ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    if (!this.backLayer) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(this.backLayer, 0, 0);

    // Luz cálida del soplador, más intensa cuanto más aire.
    var cx = this.cx, cy = this.cy, Rs = this.Rs;
    var gy = cy + Rs * 0.82;
    var glow = ctx.createRadialGradient(cx, gy, 0, cx, gy, Rs * 0.9);
    glow.addColorStop(0, 'rgba(255,196,110,' + (0.05 + 0.2 * this.air).toFixed(3) + ')');
    glow.addColorStop(1, 'rgba(255,196,110,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(cx, cy, Rs, 0, Math.PI * 2); ctx.fill();

    // Orden por profundidad: inserción sobre la lista del cuadro anterior (casi ordenada, sin basura).
    var order = this._order, i, j, b;
    if (order.length !== this.balls.length) { order.length = 0; for (i = 0; i < this.balls.length; i++) order.push(this.balls[i]); }
    for (i = 1; i < order.length; i++) {
      b = order[i]; j = i - 1;
      while (j >= 0 && order[j].z > b.z) { order[j + 1] = order[j]; j--; }
      order[j + 1] = b;
    }
    var S = this.S;
    for (i = 0; i < order.length; i++) {
      b = order[i];
      var k = CAM / (CAM - b.z);
      this._drawBall(b, cx + b.x * k * S, cy - b.y * k * S, BALL_R * k * S, b.nx, b.ny, b.nz, b.z < 0 ? Math.min(0.32, -b.z * 0.3) : 0);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    var rS = BALL_R * this.S;
    if (this.dropping) {
      var dp = this.project(TRAY.x, TRAY.y - easeInOut(this.dropping.t) * 0.5, 0);
      ctx.globalAlpha = 1 - this.dropping.t;
      this._drawBall({ num: this.dropping.num, color: Bingo.columnFor(this.dropping.num) }, dp.x, dp.y, rS, 0, 0, 1, 0);
      ctx.globalAlpha = 1;
    }
    if (this.trayBall) {
      var tp = this.project(TRAY.x, TRAY.y, 0);
      this._drawBall({ num: this.trayBall.num, color: Bingo.columnFor(this.trayBall.num) }, tp.x, tp.y, rS, 0, 0, 1, 0);
    }
    if (this.selected) {
      var sp = this.project(this.selected.x, this.selected.y, 0), sa = this.selected.spin;
      // Gira de espaldas dentro del tubo: la etiqueta queda oculta.
      this._drawBall({ num: this.selected.num, color: Bingo.columnFor(this.selected.num) }, sp.x, sp.y, rS, Math.cos(sa), Math.sin(sa), -0.6, 0);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.frontLayer, 0, 0);
    if (this.present) this._renderPresent();
  };

  Tombola.prototype._renderPresent = function () {
    var ctx = this.ctx, pr = this.present, W = this.canvas.width, H = this.canvas.height;
    if (pr.back > 0.01) {
      ctx.fillStyle = 'rgba(6,14,12,' + (0.55 * pr.back).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }
    var x = pr.x, y = pr.y, R = pr.r, col = COLORS[Bingo.columnFor(pr.num)];
    // Sombra proyectada.
    var sh = ctx.createRadialGradient(x, y + R * 1.12, 0, x, y + R * 1.12, R);
    sh.addColorStop(0, 'rgba(0,0,0,' + (0.45 * pr.back).toFixed(3) + ')'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh;
    ctx.beginPath(); ctx.ellipse(x, y + R * 1.12, R, R * 0.22, 0, 0, Math.PI * 2); ctx.fill();

    var g = ctx.createRadialGradient(x - R * 0.35, y - R * 0.4, R * 0.1, x, y, R);
    g.addColorStop(0, col.light); g.addColorStop(0.45, col.base); g.addColorStop(1, col.dark);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill();

    var nx = Math.sin(pr.angle), nz = Math.cos(pr.angle);
    if (nz > 0.04) {
      var lr = R * 0.6;
      ctx.save();
      ctx.translate(x + nx * R * 0.56, y);
      ctx.scale(nz, 1);
      ctx.fillStyle = LABEL_BG;
      ctx.beginPath(); ctx.arc(0, 0, lr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = LABEL_INK;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '700 ' + Math.round(lr * 0.36) + 'px ' + FONT;
      ctx.fillText(Bingo.letterFor(pr.num), 0, -lr * 0.56);
      ctx.font = '700 ' + Math.round(lr * 1.02) + 'px ' + FONT;
      ctx.fillText(String(pr.num), 0, lr * 0.14, lr * 1.6);
      ctx.restore();
    }
    var rim = ctx.createRadialGradient(x - R * 0.2, y - R * 0.25, R * 0.45, x, y, R);
    rim.addColorStop(0, 'rgba(0,0,0,0)'); rim.addColorStop(0.75, 'rgba(0,0,0,0.1)'); rim.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = rim; ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill();
    var hx = x - R * 0.4, hy = y - R * 0.45;
    var spec = ctx.createRadialGradient(hx, hy, 0, hx, hy, R * 0.38);
    spec.addColorStop(0, 'rgba(255,255,255,0.85)'); spec.addColorStop(0.4, 'rgba(255,255,255,0.25)'); spec.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = spec; ctx.beginPath(); ctx.arc(hx, hy, R * 0.38, 0, Math.PI * 2); ctx.fill();
  };

  Tombola.prototype.refreshSprites = function () { this._buildSprites(); this._render(); };

  Bingo.Tombola = Tombola;
})(window.Bingo = window.Bingo || {});

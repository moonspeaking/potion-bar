// ===== MG2 «Врата» (пазл) — порт PotionBarPuzzle (PotionBar.swf) =====
// Кусочки двери лежат на стартовых позициях; их нужно перетащить на свои места.
// Управление как в оригинале: зажать и тащить (отпустить после 0.2с — кусочек встаёт),
// либо клик-клик (кликнул — кусочек «приклеился» к курсору, второй клик — положил).
'use strict';

// ---------- свечение силуэта (аналог GlowFilter) ----------
const PUZ_PAD = 30;

// внешнее свечение: картинка + ореол цвета color; strength — число проходов
function puzGlowOuter(img, color, blur, passes) {
  const w = img.width, h = img.height, P = PUZ_PAD;
  const cv = document.createElement('canvas'); cv.width = w + P * 2; cv.height = h + P * 2;
  const c = cv.getContext('2d');
  const OFF = 5000;
  c.shadowColor = color; c.shadowBlur = blur; c.shadowOffsetX = OFF;
  for (let i = 0; i < passes; i++) c.drawImage(img, P - OFF, P);
  c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetX = 0;
  c.drawImage(img, P, P);
  return cv;
}

// внутреннее свечение (по краю силуэта, внутри него)
function puzGlowInner(img, color, blur, passes) {
  const w = img.width, h = img.height, P = PUZ_PAD;
  const inv = document.createElement('canvas'); inv.width = w + P * 2; inv.height = h + P * 2;
  const ic = inv.getContext('2d');
  ic.fillStyle = '#000'; ic.fillRect(0, 0, inv.width, inv.height);
  ic.globalCompositeOperation = 'destination-out';
  ic.drawImage(img, P, P);
  const out = document.createElement('canvas'); out.width = inv.width; out.height = inv.height;
  const c = out.getContext('2d');
  const OFF = 5000;
  c.shadowColor = color; c.shadowBlur = blur; c.shadowOffsetX = OFF;
  for (let i = 0; i < passes; i++) c.drawImage(inv, -OFF, 0);
  c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetX = 0;
  c.globalCompositeOperation = 'destination-in';
  c.drawImage(img, P, P);
  return out;
}

// градиентная полоса-маска: alpha 0→0.6→0 на 80px (две полосы по 40px)
function puzBand(c, x, y, w) {
  const g = c.createLinearGradient(0, y, 0, y + 80);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.5, 'rgba(0,0,0,0.6)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g;
  c.fillRect(x, y, w, 80);
}

class PuzzleScene {
  constructor(app, scenarioIdx) {
    this.app = app;
    this.scenarioIdx = scenarioIdx;
    this.isMG1 = true;                          // те же клавиши Esc/N, что у MG1 (подтверждение выхода)
    this.level = SCENARIO[scenarioIdx].id;      // 1..4
    this.over = null;
    this.state = 'dialog';                      // dialog | play | win | done
    this.t = 0;
    this.confirm = false;
    this.dialog = null;
    this.timers = new TimerQ();

    this.deltaPos = 10;
    this.backVelocity = 0.002;
    this.hintTimeout = 7;
    this.hintLight = 1;

    // состояние эффектов
    this.blur = 0;            // blur фона (px)
    this.gatesAlpha = 0;      // gatesback + врата
    this.objAlpha = 0;        // слой кусочков
    this.showGates = true;    // собранная картинка «Gates0N»
    this.fin = null;          // финальные эффекты {…}
    this.raysT0 = 0;

    // ввод
    this.carried = null;
    this.phase = null;        // held | sticky
    this.offX = 0; this.offY = 0;
    this.moved = false; this.moveT = -1;
    this.prevDown = false;
    this.blockPick = false;
    this.lastMx = 0; this.lastMy = 0;
    this.hintAt = -1;
    this.firstHint = this.level === 1;
    this.placed = 0;

    this.buildLevel();

    // фон: сцена MG1 «level 7» (без кипения), размытая во время игры
    this.bgCv = document.createElement('canvas'); this.bgCv.width = W; this.bgCv.height = H;
    this.flameFrames = MG1.flIng.map((_, i) => MG1.flIng[i] === -1 ? MG1Scene.prototype.makeFlameFrames(i) : null);

    this.rays = [mg1Tinted('MG1_RAYS1', 0, 0, -120), mg1Tinted('MG1_RAYS2', 0, 0, -120)];

    // эффекты финала: свечение двери и белая маска
    const gm = Assets.spr('PUZ_GATESMASK');
    this.doorGlow = gm ? puzGlowOuter(gm.img, '#ff0000', 5, 4) : null;
    const wm = Assets.spr('PUZ_WHITEMASK');
    this.whiteGlow = wm ? puzGlowOuter(wm.img, '#ffffff', 25, 2) : null;

    Music.play('Brewery', 0.4);

    // вступительная реплика кота: через 1с, затем начало игры
    this.startCatDialog([PUZ.texts[this.level - 1]], () => this.internalStart(), 1.0);
  }

  sfx(name, vol) { Sfx.play(name, vol === undefined ? 1 : vol); }

  // ---------- сборка уровня ----------
  buildLevel() {
    const L = this.level - 1;
    this.pieces = [];
    const n = PUZ.start[L].length;
    for (let i = 0; i < n; i++) {
      const s = Assets.spr('PUZ_P' + this.level + '_' + (i + 1));
      this.pieces.push({
        id: i, spr: s, w: s ? s.w : 0, h: s ? s.h : 0,
        x: F(PUZ.start[L][i][0]), y: F(PUZ.start[L][i][1]),
        sx: F(PUZ.start[L][i][0]), sy: F(PUZ.start[L][i][1]),
        active: true, layer: 'obj', back: null, glow: null, hint: null, hintCv: null, alpha: null,
      });
    }
    this.order = this.pieces.slice();           // порядок отрисовки (последний — сверху)
    this.homeTaken = PUZ.home[L].map(() => -1); // какой кусочек стоит в слоте
    this.gates = Assets.spr('PUZ_GATES' + this.level);
  }

  home(idx) { const h = PUZ.home[this.level - 1][idx]; return { x: F(h[0]), y: F(h[1]) }; }

  // индекс «парного» кусочка (одинаковые объекты), -1 если пары нет
  partner(id) {
    const groups = PUZ.same[this.level - 1];
    let res = -1;
    for (const g of groups) {
      const k = g.indexOf(id + 1);
      if (k !== -1) res = g[k === 0 ? 1 : 0] - 1;
    }
    return res;
  }

  // ---------- диалог кота (общий код с MG1) ----------
  startCatDialog(phrases, onDone, startAt) { return MG1Scene.prototype.startCatDialog.call(this, phrases, onDone, startAt); }
  updateDialog(dt) { return MG1Scene.prototype.updateDialog.call(this, dt); }
  drawBubble(ctx) { return MG1Scene.prototype.drawBubble.call(this, ctx); }
  draw9(ctx, id, x, y, w, h) { return MG1Scene.prototype.draw9.call(this, ctx, id, x, y, w, h); }
  drawConfirm(ctx) { return MG1Scene.prototype.drawConfirm.call(this, ctx); }
  openConfirm() { if (this.state !== 'done') this.confirm = true; }

  // ---------- старт игры (internal_startLevel) ----------
  internalStart() {
    this.state = 'play';
    this.anim = [
      { o: this, p: 'blur', to: 2.5, dur: 1, delay: 0 },
      { o: this, p: 'gatesAlpha', to: 1, dur: 1, delay: 0 },
      { o: this, p: 'objAlpha', to: 1, dur: 1, delay: 0.5 },
    ];
    for (const a of this.anim) { a.from = a.o[a.p]; a.t = -a.delay; }
    this.timers.after(0.5, () => this.sfx('MG2Gates'));
  }

  updateAnim(dt) {
    if (!this.anim) return;
    for (let i = this.anim.length - 1; i >= 0; i--) {
      const a = this.anim[i];
      a.t += dt;
      if (a.t < 0) continue;
      const k = clamp(a.t / a.dur, 0, 1);
      a.o[a.p] = a.from + (a.to - a.from) * k;
      if (k >= 1) this.anim.splice(i, 1);
    }
  }

  // ---------- попадание по кусочку (альфа-порог 20, верхний по глубине) ----------
  alphaOf(p) {
    if (p.alpha) return p.alpha;
    const cv = document.createElement('canvas'); cv.width = p.w; cv.height = p.h;
    const c = cv.getContext('2d');
    c.drawImage(p.spr.img, 0, 0);
    const d = c.getImageData(0, 0, p.w, p.h).data;
    const a = new Uint8Array(p.w * p.h);
    for (let i = 0, q = 3; i < a.length; i++, q += 4) a[i] = d[q];
    p.alpha = a;
    return a;
  }

  hitTest(mx, my) {
    for (let i = this.order.length - 1; i >= 0; i--) {
      const p = this.order[i];
      if (!p.active || p.layer !== 'obj' || !p.spr) continue;
      const lx = Math.floor(mx - p.x), ly = Math.floor(my - p.y);
      if (lx < 0 || ly < 0 || lx >= p.w || ly >= p.h) continue;
      if (this.alphaOf(p)[ly * p.w + lx] > 20) return p;
    }
    return null;
  }

  toTop(p) {
    const i = this.order.indexOf(p);
    if (i !== -1) this.order.splice(i, 1);
    this.order.push(p);
  }

  // ---------- ввод ----------
  menuRect() { return { x: F(1), y: F(443), w: 157, h: 58 }; }

  handleInput(dt) {
    const down = Input.down;
    const downEdge = down && !this.prevDown;
    const upEdge = !down && this.prevDown;
    this.prevDown = down;
    if (!down) this.blockPick = false;

    if (downEdge && inRect(this.menuRect(), Input.x, Input.y)) {
      this.sfx('UIClick'); this.confirm = true; return;
    }
    if (this.state !== 'play') return;

    const mx = Input.x, my = Input.y;
    if (!this.carried) {
      if (downEdge && !this.blockPick) {
        const p = this.hitTest(mx, my);
        if (p) this.pick(p, mx, my);
      }
      return;
    }

    const p = this.carried;
    // кусочек следует за курсором с сохранением смещения (startDrag без lockCenter)
    p.x = mx - this.offX; p.y = my - this.offY;
    if (!this.moved && (mx !== this.lastMx || my !== this.lastMy)) { this.moved = true; this.moveT = this.t; }
    this.lastMx = mx; this.lastMy = my;

    if (this.phase === 'held') {
      if (upEdge) {
        if (this.moved && this.t - this.moveT >= 0.2) this.drop();
        else this.phase = 'sticky';
      }
    } else if (this.phase === 'sticky') {
      if (downEdge) { this.blockPick = true; this.drop(); }
    }
  }

  pick(p, mx, my) {
    this.carried = p;
    this.phase = 'held';
    this.offX = mx - p.x; this.offY = my - p.y;
    this.moved = false; this.moveT = -1;
    this.lastMx = mx; this.lastMy = my;
    p.layer = 'move';
    this.toTop(p);
    // первая подсказка на 1-м уровне — сразу, дальше через 7с удержания
    this.hintAt = this.t + ((this.level === 1 && this.placed === 0 && this.firstHint) ? 0.001 : this.hintTimeout);
    this.sfx('UIClick');
  }

  // проверка «дом» (check_home_place) → индекс слота или -1
  checkHome(p) {
    const d = this.deltaPos;
    const near = (idx) => {
      const h = this.home(idx);
      return Math.abs(h.x - p.x) < d && Math.abs(h.y - p.y) < d;
    };
    const free = (idx) => this.homeTaken[idx] === -1;
    if (near(p.id) && free(p.id)) return p.id;
    const q = this.partner(p.id);
    if (q !== -1 && near(q) && free(q)) return q;
    return -1;
  }

  drop() {
    const p = this.carried;
    this.carried = null; this.phase = null;
    this.hintAt = -1;
    const slot = this.checkHome(p);
    if (slot !== -1) {
      this.sfx(PUZ.crystals[this.level - 1].includes(slot + 1) ? 'MG2PutRight01' : 'MG2PutRight02');
      const h = this.home(slot);
      p.x = h.x; p.y = h.y;
      p.active = false; p.layer = 'obj';
      this.homeTaken[slot] = p.id;
      this.toTop(p);
      this.startGlow(p);
      this.firstHint = false;
      this.placed++;
      if (this.placed === this.pieces.length) this.win();
    } else {
      this.sfx('MG2PutWrong');
      p.active = false;
      // возврат на старт по квадратичной кривой (контрольная точка: x кусочка, y старта)
      const dist = Math.hypot(p.x - p.sx, p.y - p.sy);
      p.back = { x0: p.x, y0: p.y, cx: p.x, cy: p.sy, t: 0, dur: Math.max(0.05, dist * this.backVelocity) };
    }
  }

  // ---------- подсказка ----------
  showHint() {
    const p = this.carried; if (!p) return;
    this.hintAt = this.t + this.hintTimeout + 2 * this.hintLight;
    if (!p.hintCv) p.hintCv = mg1Tinted('PUZ_P' + this.level + '_' + (p.id + 1), 0, 0, -255);
    const q = this.partner(p.id);
    let pos = this.home(p.id);
    if (q !== -1 && Math.abs(this.pieces[q].x - this.home(p.id).x) < 1) pos = this.home(q);
    p.hint = { t: 0, x: pos.x, y: pos.y };
  }

  hintAlpha(t) {
    if (t < 1) return t;
    if (t < 1.1) return 1;
    if (t < 2.1) return 1 - (t - 1.1);
    return 0;
  }

  // ---------- свечение при установке ----------
  startGlow(p) {
    if (!p.glowCv) {
      p.glowCv = {
        outer: puzGlowOuter(p.spr.img, '#fb713b', 10, 3),
        inner: puzGlowInner(p.spr.img, '#ffffc4', 8, 2),
      };
    }
    p.glow = { t: 0, dur: 1.9 };
  }

  // ---------- победа ----------
  win() {
    this.state = 'win';
    this.fin = { t: 0, raysA: 0, whiteScale: 0, doorFires: [], effectOn: false, effT: 0 };
    this.timers.after(0.8, () => { this.fin.doorTimer = 1.8; });
    this.timers.after(1.2, () => this.sfx('MG2Finish'));
    this.timers.after(1.8, () => {
      this.fin.effectOn = true; this.fin.effT = 0;
      this.showGates = false;
    });
    this.timers.after(10, () => this.finish(true));
  }

  finish(won) {
    if (this.state === 'done') return;
    this.state = 'done';
    this.over = { won, expert: false };
    this.cleanup();
    this.app.onLevelEnd(this.scenarioIdx, won, false);
  }

  // отладочный пропуск (клавиша N)
  levelEnd() { this.finish(true); }

  cleanup() {
    Music.stop();
    this.timers.clear();
    this.anim = null;
  }

  // ---------- обновление ----------
  update(dt) {
    if (this.confirm) { this.prevDown = Input.down; return; }   // пока открыто подтверждение — мир стоит; клики обрабатывает drawConfirm
    this.t += dt;
    this.timers.update(dt);
    if (this.dialog) this.updateDialog(dt);
    this.updateAnim(dt);

    // возврат неудачных кусочков
    for (const p of this.pieces) {
      if (!p.back) continue;
      const b = p.back;
      b.t += dt;
      const k = clamp(b.t / b.dur, 0, 1);
      const u = 1 - k;
      p.x = u * u * b.x0 + 2 * u * k * b.cx + k * k * p.sx;
      p.y = u * u * b.y0 + 2 * u * k * b.cy + k * k * p.sy;
      if (k >= 1) {
        p.back = null; p.active = true; p.layer = 'obj';
        this.toTop(p);
      }
    }
    // свечение / подсказки
    for (const p of this.pieces) {
      if (p.glow) { p.glow.t += dt; if (p.glow.t >= p.glow.dur) p.glow = null; }
      if (p.hint) { p.hint.t += dt; if (p.hint.t >= 2.1) p.hint = null; }
    }
    if (this.carried && this.hintAt >= 0 && this.t >= this.hintAt) this.showHint();

    // финальные эффекты
    if (this.fin) {
      const f = this.fin;
      f.t += dt;
      if (f.doorTimer !== undefined) {
        f.doorTimer -= dt;
        if (f.doorTimer <= 0) { f.doorTimer += 1.8; f.doorFires.push({ t: 0 }); }
      }
      for (const d of f.doorFires) d.t += dt;
      f.doorFires = f.doorFires.filter((d) => d.t < 1.7);
      if (f.effectOn) {
        f.effT += dt;
        const k = clamp(f.effT / 1.3, 0, 1);
        f.raysA = k; f.whiteScale = 0.8 * k;
      }
    }

    this.handleInput(dt);
  }

  // ---------- отрисовка ----------
  drawBackground(ctx) {
    const c = this.bgCv.getContext('2d');
    const bg = Assets.spr('MG1_BG');
    if (bg) c.drawImage(bg.img, 0, 0, W, H); else { c.fillStyle = '#140a20'; c.fillRect(0, 0, W, H); }
    const cat = Assets.spr('MG1_CAT');
    if (cat) c.drawImage(cat.img, F(73.75), F(106.25));
    const wl = Assets.spr('MG1_WINDOWLIGHT');
    if (wl) c.drawImage(wl.img, F(370), 0);
    for (let i = 0; i < MG1.flIng.length; i++) {
      const frames = this.flameFrames[i]; if (!frames) continue;
      const fr = frames[Math.floor(this.t * 14) % 2];
      c.drawImage(fr, F(MG1.flPos[i][0]) - fr.width / 2, F(MG1.flPos[i][1]) - fr.height / 2);
    }
    ctx.save();
    if (this.blur > 0.05) ctx.filter = 'blur(' + this.blur.toFixed(2) + 'px)';
    ctx.drawImage(this.bgCv, 0, 0);
    ctx.restore();
  }

  drawPiece(ctx, p) {
    if (!p.spr) return;
    const g = p.glow;
    let band = 0;
    if (g) band = -80 + (p.h + 80) * (g.t / g.dur);
    if (g) this.drawGlowLayer(ctx, p, p.glowCv.outer, band);
    ctx.drawImage(p.spr.img, p.x, p.y);
    if (g) this.drawGlowLayer(ctx, p, p.glowCv.inner, band);
  }

  // слой свечения, обрезанный движущейся полосой (по ширине — только в пределах кусочка)
  drawGlowLayer(ctx, p, glowCv, band) {
    if (!this.tmpCv) { this.tmpCv = document.createElement('canvas'); }
    const P = PUZ_PAD;
    const w = glowCv.width, h = glowCv.height;
    if (this.tmpCv.width < w || this.tmpCv.height < h) { this.tmpCv.width = Math.max(this.tmpCv.width, w); this.tmpCv.height = Math.max(this.tmpCv.height, h); }
    const t = this.tmpCv.getContext('2d');
    t.clearRect(0, 0, this.tmpCv.width, this.tmpCv.height);
    t.globalCompositeOperation = 'source-over';
    t.drawImage(glowCv, 0, 0);
    t.globalCompositeOperation = 'destination-in';
    // полоса в координатах кусочка: смещение P; ширина = ширина кусочка
    const gr = t.createLinearGradient(0, P + band, 0, P + band + 80);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(0.5, 'rgba(0,0,0,0.6)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    t.fillStyle = gr;
    t.fillRect(P, 0, p.w, h);
    t.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.tmpCv, 0, 0, w, h, p.x - P, p.y - P, w, h);
  }

  drawRays(ctx) {
    const f = this.fin; if (!f || f.raysA <= 0.01) return;
    const et = f.effT;
    const tri = (t) => { const m = t % 6; return 5 + 4 * (m < 3 ? m / 3 : 2 - m / 3); };
    const rot = 500 * Math.min(et, 20) / 20;
    ctx.save();
    ctx.translate(F(320), F(240));
    ctx.globalAlpha = 0.5 * f.raysA;
    for (let i = 0; i < 2; i++) {
      const cv = this.rays[i]; if (!cv) continue;
      ctx.save();
      ctx.rotate((i === 0 ? rot : -rot) * Math.PI / 180);
      const s = tri(et);
      ctx.scale(s, s);
      ctx.drawImage(cv, -cv.width / 2, -cv.height / 2);
      ctx.restore();
    }
    ctx.restore();
  }

  drawMenuButton(ctx) {
    const mr = this.menuRect();
    const mh = inRect(mr, Input.x, Input.y);
    const mid = (Input.down && mh) ? 'BTN_MENU_D' : (mh ? 'BTN_MENU_O' : 'BTN_MENU_N');
    drawFrame(ctx, mid, 0, mr.x, mr.y);
    text(ctx, TEXTS.menu, mr.x + mr.w / 2, mr.y + mr.h / 2 + 1, { size: F(12), color: '#ffe9b0', stroke: 'rgba(40,16,4,0.9)', strokeW: 3 });
  }

  draw(ctx) {
    // фон (размытый)
    this.drawBackground(ctx);

    // GatesBack + собранная картинка врат
    const back = Assets.spr('MG1_GATESBACK');
    if (back && this.gatesAlpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = this.gatesAlpha;
      ctx.drawImage(back.img, F(312.5) - back.w / 2, F(240) - back.h / 2);
      if (this.gates && this.showGates) ctx.drawImage(this.gates.img, F(146), F(39));
      ctx.restore();
    }

    this.drawMenuButton(ctx);

    // кусочки (слой объектов с общей прозрачностью) + подсказки
    if (this.objAlpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = this.objAlpha;
      for (const p of this.order) if (p.layer === 'obj') this.drawPiece(ctx, p);
      for (const p of this.pieces) {
        if (p.hint && p.hintCv) {
          ctx.globalAlpha = this.objAlpha * this.hintAlpha(p.hint.t);
          ctx.drawImage(p.hintCv, p.hint.x, p.hint.y);
        }
      }
      ctx.restore();
    }

    // передний план: лучи, свечение двери, белая маска, маска двери
    const f = this.fin;
    if (f && f.effectOn) {
      this.drawRays(ctx);
      const gm = Assets.spr('PUZ_GATESMASK');
      // красное свечение двери — полосами, периодически пробегающими сверху вниз
      if (this.doorGlow && gm) {
        for (const d of f.doorFires) {
          const bandY = -gm.h + (gm.h + gm.h) * (d.t / 1.7);
          if (!this.tmpCv) this.tmpCv = document.createElement('canvas');
          const P = PUZ_PAD, w = this.doorGlow.width, h = this.doorGlow.height;
          if (this.tmpCv.width < w || this.tmpCv.height < h) { this.tmpCv.width = Math.max(this.tmpCv.width, w); this.tmpCv.height = Math.max(this.tmpCv.height, h); }
          const t = this.tmpCv.getContext('2d');
          t.clearRect(0, 0, this.tmpCv.width, this.tmpCv.height);
          t.drawImage(this.doorGlow, 0, 0);
          t.globalCompositeOperation = 'destination-in';
          const gr = t.createLinearGradient(0, P + bandY, 0, P + bandY + 80);
          gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
          t.fillStyle = gr; t.fillRect(P, 0, gm.w, h);
          t.globalCompositeOperation = 'source-over';
          ctx.drawImage(this.tmpCv, 0, 0, w, h, F(202) - P, F(55) - P, w, h);
        }
      }
      // белая маска (растёт по X от центра)
      const wm = Assets.spr('PUZ_WHITEMASK');
      if (wm && this.whiteGlow && f.whiteScale > 0.001) {
        const cx = wm.w / 2 + F(54), y0 = F(240) - wm.h / 2;
        ctx.save();
        ctx.translate(cx, y0);
        ctx.scale(f.whiteScale, 1);
        ctx.drawImage(this.whiteGlow, -wm.w / 2 - PUZ_PAD, -PUZ_PAD);
        ctx.restore();
      }
      if (gm) ctx.drawImage(gm.img, F(202), F(55));
    }

    // переносимый / возвращающийся кусочек — поверх всего
    for (const p of this.order) if (p.layer === 'move') this.drawPiece(ctx, p);

    if (this.dialog && this.dialog.alpha > 0.01) this.drawBubble(ctx);
    if (this.confirm) this.drawConfirm(ctx);
  }
}

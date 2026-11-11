// ===== MG1 «Скрытые предметы» — порт PotionBarHiddenObject (PotionBar.swf) =====
'use strict';

// ---------- локальные easing'и (как в Tweener) ----------
const MG1EASE = {
  linear: (t) => t,
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  outSine: (t) => Math.sin(t * Math.PI / 2),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inOutQuint: (t) => (t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 5),
};

// ---------- мини-tween'ы сцены (аналог Tweener) ----------
class MG1Tweens {
  constructor() { this.list = []; }
  add(obj, props, dur, opts = {}) {
    const tw = {
      obj, props, dur, t: -(opts.delay || 0),
      ease: MG1EASE[opts.ease || 'linear'],
      onDone: opts.onDone || null, onUpdate: opts.onUpdate || null, from: null,
    };
    this.list.push(tw);
    return tw;
  }
  remove(obj) { this.list = this.list.filter((t) => t.obj !== obj); }
  removeAll() { this.list.length = 0; }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const tw = this.list[i];
      tw.t += dt;
      if (tw.t < 0) continue;
      if (!tw.from) {
        tw.from = {};
        for (const p in tw.props) tw.from[p] = tw.obj[p];
      }
      const k = clamp(tw.t / tw.dur, 0, 1), e = tw.ease(k);
      for (const p in tw.props) tw.obj[p] = tw.from[p] + (tw.props[p] - tw.from[p]) * e;
      if (tw.onUpdate) tw.onUpdate();
      if (k >= 1) { this.list.splice(i, 1); if (tw.onDone) tw.onDone(); }
    }
  }
}

// кривая Безье по опорным точкам (de Casteljau), pts включает старт и конец
function mg1Bezier(pts, t) {
  let p = pts.map((q) => [q[0], q[1]]);
  while (p.length > 1) {
    const n = [];
    for (let i = 0; i < p.length - 1; i++) {
      n.push([p[i][0] + (p[i + 1][0] - p[i][0]) * t, p[i][1] + (p[i + 1][1] - p[i][1]) * t]);
    }
    p = n;
  }
  return p[0];
}

// зацикленный звук (второй «музыкальный» канал, как в SoundManager)
const MG1Loop = {
  start(name, vol) {
    const base = Assets.sounds[name]; if (!base) return null;
    try {
      const a = base.cloneNode(); a.loop = true; a.volume = clamp(vol * Music.volume, 0, 1);
      a.play().catch(() => {});
      return a;
    } catch (e) { return null; }
  },
  stop(a) { if (a) { try { a.pause(); } catch (e) {} } },
};

// ---------- составные канвасы объектов (тень + маски ERASE) и альфа-маски ----------
const MG1Obj = {
  cache: {}, masks: {}, alphaCache: {},
  maskAlpha(i) {
    if (this.masks[i]) return this.masks[i];
    const s = Assets.spr('MG1_MASK' + i); if (!s) return null;
    const cv = document.createElement('canvas'); cv.width = s.w; cv.height = s.h;
    const c = cv.getContext('2d');
    c.drawImage(s.img, 0, 0);
    const d = c.getImageData(0, 0, s.w, s.h), px = d.data;
    for (let p = 0; p < px.length; p += 4) {
      const lum = (px[p] + px[p + 1] + px[p + 2]) / 3;
      px[p] = 0; px[p + 1] = 0; px[p + 2] = 0;
      px[p + 3] = 255 * (1 - lum / 255);
    }
    c.putImageData(d, 0, 0);
    this.masks[i] = cv;
    return cv;
  },
  canvas(idx) {
    if (this.cache[idx]) return this.cache[idx];
    const main = Assets.spr('OBJ' + (idx + 1)); if (!main) return null;
    const cv = document.createElement('canvas'); cv.width = main.w; cv.height = main.h;
    const c = cv.getContext('2d');
    if (MG1.shadow.includes(idx)) {
      const sh = Assets.spr('OBJS' + (idx + 1));
      if (sh) c.drawImage(sh.img, 0, 0);
    }
    c.drawImage(main.img, 0, 0);
    for (let i = 0; i < MG1.masksImpact.length; i++) {
      if (MG1.masksImpact[i].includes(idx + 1)) {
        const m = this.maskAlpha(i);
        if (m) {
          c.globalCompositeOperation = 'destination-out';
          c.drawImage(m, F(MG1.masks[i][0]) - F(MG1.coord[idx][0]), F(MG1.masks[i][1]) - F(MG1.coord[idx][1]));
          c.globalCompositeOperation = 'source-over';
        }
        break;
      }
    }
    this.cache[idx] = cv;
    return cv;
  },
  // альфа основного битмапа для hitTest (порог 20, как в SmartHitTest.addObject)
  alphaData(idx) {
    if (this.alphaCache[idx]) return this.alphaCache[idx];
    const s = Assets.spr('OBJ' + (idx + 1)); if (!s) return null;
    const cv = document.createElement('canvas'); cv.width = s.w; cv.height = s.h;
    const c = cv.getContext('2d');
    c.drawImage(s.img, 0, 0);
    const d = c.getImageData(0, 0, s.w, s.h).data;
    const a = new Uint8Array(s.w * s.h);
    for (let p = 0, q = 3; p < a.length; p++, q += 4) a[p] = d[q];
    this.alphaCache[idx] = { w: s.w, h: s.h, a };
    return this.alphaCache[idx];
  },
  // границы спрайта с учётом детей-масок (как .width/.height во Flash)
  bounds(idx) {
    const main = Assets.spr('OBJ' + (idx + 1));
    let minX = 0, minY = 0, maxX = main.w, maxY = main.h;
    for (let i = 0; i < MG1.masksImpact.length; i++) {
      if (MG1.masksImpact[i].includes(idx + 1)) {
        const m = Assets.spr('MG1_MASK' + i);
        if (m) {
          const mx = F(MG1.masks[i][0]) - F(MG1.coord[idx][0]);
          const my = F(MG1.masks[i][1]) - F(MG1.coord[idx][1]);
          minX = Math.min(minX, mx); minY = Math.min(minY, my);
          maxX = Math.max(maxX, mx + m.w); maxY = Math.max(maxY, my + m.h);
        }
        break;
      }
    }
    return { w: maxX - minX, h: maxY - minY };
  },
};

// тонированная копия картинки (ColorTransform: смещения каналов)
function mg1Tinted(id, dr, dg, db) {
  const s = Assets.spr(id); if (!s) return null;
  const cv = document.createElement('canvas'); cv.width = s.w; cv.height = s.h;
  const c = cv.getContext('2d');
  c.drawImage(s.img, 0, 0);
  const d = c.getImageData(0, 0, s.w, s.h), px = d.data;
  for (let p = 0; p < px.length; p += 4) {
    px[p] = clamp(px[p] + dr, 0, 255);
    px[p + 1] = clamp(px[p + 1] + dg, 0, 255);
    px[p + 2] = clamp(px[p + 2] + db, 0, 255);
  }
  c.putImageData(d, 0, 0);
  return cv;
}

// серая копия кнопки (ColorMatrixFilter из оригинала)
function mg1Gray(id) {
  const s = Assets.spr(id); if (!s) return null;
  const cv = document.createElement('canvas'); cv.width = s.w; cv.height = s.h;
  const c = cv.getContext('2d');
  try { c.filter = 'grayscale(1)'; } catch (e) {}
  c.drawImage(s.img, 0, 0);
  return cv;
}

function mg1Wrap(ctx, str, maxW) {
  const words = str.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; }
    else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

// ============================================================
//  Сцена MG1
// ============================================================
class MG1Scene {
  constructor(app, scenarioIdx) {
    this.app = app;
    this.scenarioIdx = scenarioIdx;
    this.isMG1 = true;
    this.level = SCENARIO[scenarioIdx].id;      // 1..6
    this.over = null;
    this.state = 'dialog';                      // dialog | play | win | done
    this.t = 0;
    this.confirm = false;

    // константы конструктора PotionBarHiddenObject
    this.radius = F(120);
    this.startPoint = { x: F(320), y: F(260) };
    this.finishWinY = F(250);
    this.worldStartWidth = F(115);
    this.worldPosY = { a: F(292), b: F(266) };
    this.finishPoint = { x: F(317), y: F(301) };
    this.hintStarsNum = 25;
    this.hintStarsRadius = F(37);
    this.hintTimeout = 19;
    this.cauldronArea = { x: F(193), y: F(203), w: F(245), h: F(197) };
    this.cauldronMask = { x: F(265), y: F(287), w: F(105), h: F(20) };
    this.rimY = this.cauldronMask.y;

    this.tweens = new MG1Tweens();
    this.timers = new TimerQ();
    this.clicksEnable = false;
    this.changeFlag = true;
    this.odd = true;
    this.needIndex = -1;
    this.hintReady = true;
    this.hintCd = 0;
    this.exceptionWin = [];
    this.fly = null;
    this.potion = null;
    this.gates = null;
    this.dialog = null;
    this.letters = [];
    this.lettersGroup = null;
    this.scoreText = '';
    this.hintState = null;

    // контекст для измерения букв
    this.measureCv = document.createElement('canvas');
    this.measureCtx = this.measureCv.getContext('2d');
    this.measureCtx.font = 'italic ' + F(22) + 'px Georgia, serif';

    // «стерка» котла — общий канвас
    this.scratch = document.createElement('canvas');
    this.scratch.width = 768; this.scratch.height = 768;
    this.scratchCtx = this.scratch.getContext('2d');

    // пламя
    this.flameOn = MG1.flIng.map(() => false);
    this.flameFrames = MG1.flIng.map((_, i) => this.makeFlameFrames(i));

    // лучи (за зельем) — синий сдвинут на -120, как ColorTransform
    this.rays = [mg1Tinted('MG1_RAYS1', 0, 0, -120), mg1Tinted('MG1_RAYS2', 0, 0, -120)];
    this.raysT = 0;

    // звёзды подсказки со случайным оттенком
    this.stars = [];
    for (let i = 0; i < this.hintStarsNum; i++) {
      const r = Math.random();
      this.stars.push({ cv: mg1Tinted('MG1_STAR', -100 * r, 0, -200 * r) });
    }

    // серая кнопка подсказки
    this.grayBtn = mg1Gray('BTN_MENU_N');

    // пул доступных ингредиентов
    this.pool = this.getPool();

    this.buildLevel();

    // музыка: кипение + фон (два канала, как в оригинале)
    Music.play('Brewery', 0.4);
    this.boilSound = MG1Loop.start('MG1Boiling', 0.5);

    if (this.level < 6) {
      // вступительный диалог — без последней фразы (она звучит при победе)
      const ph = MG1.dialogs[this.level];
      this.startCatDialog(ph.slice(0, ph.length - 1), () => this.internalStartLevel(), 1.0);
    } else {
      this.internalStartLevel();
    }
  }

  sfx(name, vol) { Sfx.play(name, vol === undefined ? 1 : vol); }

  getPool() {
    try {
      const p = Save.getJSON(Save.K_POOL, null);
      if (Array.isArray(p)) return p;
    } catch (e) {}
    const p = [];
    for (let i = 0; i < 103; i++) {
      if (!MG1.lastday.includes(i) && !MG1.elixir.includes(i) && !MG1.blocked.includes(i)) p.push(i);
    }
    return p;
  }
  savePool() { Save.setJSON(Save.K_POOL, this.pool); }

  // ---------- сборка уровня (порт init) ----------
  buildLevel() {
    const level = this.level;
    this.levelObjects = [];
    this.levelNames = [];
    const targets = [];

    if (level === 6) {
      // «последний день»: 8 финальных ингредиентов
      for (const idx of MG1.lastday) { this.levelObjects.push(idx); targets.push(idx); }
      for (let i = 0; i < this.levelObjects.length; i++) this.levelNames[i] = MG1.names[this.levelObjects[i]];
    } else {
      // случайные цели из пула
      for (let i = 0; i < MG1.lvlSearch[level - 1]; i++) {
        targets.push(this.pool.splice(Math.floor(Math.random() * this.pool.length), 1)[0]);
      }
      this.exceptionWin = targets.slice();
      if (level === 5) for (const e of MG1.elixir) targets.push(e);
      // одинаковые по группе — подряд
      const lo = [];
      const q = targets.slice();
      let pos = 0;
      while (pos < targets.length) {
        const cur = q.shift();
        lo[pos++] = cur;
        for (let j = 0; j < q.length;) {
          if (MG1.groups[cur] === MG1.groups[q[j]]) lo[pos++] = q.splice(j, 1)[0];
          else j++;
        }
      }
      this.levelObjects = lo;
      for (let i = 0; i < lo.length; i++) {
        let nm = MG1.names[lo[i]];
        if (!nm) {
          for (let g = 0; g < MG1.groups.length; g++) {
            if (g !== lo[i] && MG1.groups[lo[i]] === MG1.groups[g] && MG1.names[g]) nm = MG1.names[g];
          }
        }
        this.levelNames[i] = nm || '';
      }
    }

    // наполнители (количество — из таблиц оригинала)
    const excl = (i) => MG1.lastday.includes(i) || MG1.elixir.includes(i) || targets.includes(i) ||
      (this.levelObjects.length > 0 && this.levelObjects.some((t) => MG1.groups[t] === MG1.groups[i]));
    const pool5 = [];
    for (let i = 0; i < 103; i++) if (!excl(i)) pool5.push(i);
    const needFill = MG1.lvlIng[level - 1] - MG1.lvlSearch[level - 1];
    const fillers = [];
    for (let i = 0; i < needFill && pool5.length; i++) {
      fillers.push(pool5.splice(Math.floor(Math.random() * pool5.length), 1)[0]);
    }

    const placed = targets.concat(fillers).sort((a, b) => a - b);
    this.objects = placed.map((idx) => ({
      idx,
      id: this.levelObjects.includes(idx) ? idx : -1,
      group: this.levelObjects.includes(idx) ? MG1.groups[idx] : -1,
      x: F(MG1.coord[idx][0]),
      y: F(MG1.coord[idx][1]),
      found: false,
    }));

    // пламя над размещёнными объектами
    for (const o of this.objects) {
      if (o.id !== -1 && MG1.flIng.includes(o.idx + 1)) {
        for (let j = 0; j < MG1.flIng.length; j++) if (MG1.flIng[j] === o.idx + 1) this.flameOn[j] = true;
      }
    }

    // цели возвращаются в пул (изымаются только после победы)
    if (this.exceptionWin.length) { this.pool = this.pool.concat(this.exceptionWin); this.savePool(); }
  }

  makeFlameFrames(i) {
    const over = Assets.spr(MG1.flBig.includes(i) ? 'MG1_FLAME_OVERBIG' : 'MG1_FLAME_OVER');
    const flame = Assets.spr('MG1_FLAME');
    if (!over || !flame) return null;
    const out = [];
    for (let f = 0; f < 2; f++) {
      const cv = document.createElement('canvas'); cv.width = over.w; cv.height = over.h;
      const c = cv.getContext('2d');
      c.globalAlpha = f === 0 ? 0.6 : 0.65;
      c.drawImage(over.img, 0, 0);
      c.globalAlpha = 1;
      const fw = flame.fw * MG1.flScales[i][0], fh = flame.fh * MG1.flScales[i][1];
      c.drawImage(flame.img, 0, f * flame.fh, flame.fw, flame.fh,
        (over.w - fw) / 2, (over.h - fh) / 2, fw, fh);
      out.push(cv);
    }
    return out;
  }

  // ---------- диалог кота ----------
  startCatDialog(phrases, onDone, startAt) {
    const evs = [];
    let t = startAt === undefined ? 1.0 : startAt;
    for (let i = 0; i < phrases.length; i++) {
      evs.push({ at: t + 0.2, text: phrases[i] });
      t += (i === 0 ? phrases[0].length * 0.08 + 1.0 : phrases[i].length * 0.08 * 1.3);
    }
    this.dialog = { events: evs, endAt: t, onDone, shown: -1, alpha: 0, text: '' };
  }

  updateDialog(dt) {
    const d = this.dialog;
    if (!d) return;
    while (d.shown + 1 < d.events.length && this.t >= d.events[d.shown + 1].at) {
      d.shown++;
      d.text = d.events[d.shown].text;
    }
    let target = (d.shown >= 0 && this.t < d.endAt) ? 1 : 0;
    const next = d.events[d.shown + 1];
    if (next && this.t >= next.at - 0.2) target = 0;   // пауза между фразами
    d.alpha += (target - d.alpha) * Math.min(1, dt / 0.15);
    if (this.t >= d.endAt) {
      const cb = d.onDone;
      this.dialog = null;
      if (cb) cb();
    }
  }

  internalStartLevel() {
    this.state = 'play';
    this.clicksEnable = true;
    this.scoreText = MG1.finded + '  0/' + this.levelObjects.length;
    this.startNewWorld();
  }

  // ---------- задачи (порт start_new_world / set_new_task) ----------
  getSameCount() {
    let count = Infinity, flag = false;
    let k = 1;
    if (this.needIndex < this.levelNames.length - 1) {
      while (this.levelNames[this.needIndex] === this.levelNames[this.needIndex + k]) {
        if (this.needIndex + k >= this.levelNames.length - 1) break;
        count = k + 1;
        k++;
        if (this.changeFlag) { flag = true; this.changeFlag = false; }
      }
    }
    if (count === Infinity) {
      if (this.needIndex > 0 && this.levelNames[this.needIndex] === this.levelNames[this.needIndex - 1]) count = 0;
      this.changeFlag = true;
    }
    return [count, flag];
  }

  startNewWorld() {
    this.needIndex++;
    if (this.needIndex < this.levelNames.length) {
      const [count, flag] = this.getSameCount();
      this.setNewTask(this.levelNames[this.needIndex], count, flag);
    } else {
      this.showWinPotion();
      this.win();
    }
  }

  setNewTask(name, count, flag) {
    if (count === Infinity || flag) {
      if (flag && count !== Infinity) name += ' (' + count + ')';
      this.rebuildLetters(name);
    } else if (count === 0) {
      // убрать « (N)» — последние 4 буквы
      let removed = 0;
      for (let r = 0; r < 4 && this.letters.length; r++) removed += this.letters.pop().w;
      this.lettersGroup.w -= removed;
      this.tweens.add(this.lettersGroup, { offX: (this.lettersGroup.fullW - this.lettersGroup.w) / 2 }, 0.5, { ease: 'inOutQuint' });
    } else if (this.letters.length === 0) {
      this.setNewTask(name, count, true);
    } else {
      this.letters[this.letters.length - 2].ch = String(count);
    }
  }

  rebuildLetters(name) {
    this.tweens.remove(this.lettersGroup);
    this.letters = [];
    let x = 0;
    for (let i = 0; i < name.length; i++) {
      const w = this.measureCtx.measureText(name[i]).width;
      this.letters.push({ ch: name[i], w, lx: x + w / 2, y: 0, rot: 0, alpha: 1, bt: -(i * 0.05), fly: null });
      x += w;
    }
    const k = x > this.worldStartWidth ? this.worldStartWidth / x : 1;
    this.lettersGroup = { x: this.finishPoint.x, y: this.worldPosY.a, scale: k, alpha: 0, offX: 0, w: x, fullW: x };
    this.tweens.add(this.lettersGroup, { alpha: 1 }, 0.1, { ease: 'linear' });
    this.tweens.add(this.lettersGroup, { y: this.worldPosY.b, scale: 1 }, 0.5, { ease: 'inOutQuad' });
  }

  breakLetters() {
    const g = this.lettersGroup;
    if (!g) return;
    this.tweens.remove(g);
    const gx = this.finishPoint.x - g.fullW / 2 + g.offX;   // левый край строки (scale=1)
    const gy = g.y;
    const step = (170 / this.letters.length) * 2;            // hemisphere_angle = 170
    for (let i = 0; i < this.letters.length; i++) {
      const L = this.letters[i];
      let angle;
      if (this.odd) { angle = 275 + Math.ceil(i / 2) * step; this.odd = false; }
      else { angle = 265 - Math.ceil(i / 2) * step; this.odd = true; }
      const ar = angle * Math.PI / 180;
      L.fly = {
        sx: L.lx, sy: L.y,
        tx: this.startPoint.x + Math.sin(ar) * this.radius - gx,
        ty: this.startPoint.y + Math.cos(ar) * this.radius * 0.8 - gy,
        t: 0, dur: 1.2 - 0.5 * Math.random(), fadeT: -(0.6 - 0.6 * Math.random()),
      };
    }
  }

  changeScore() {
    this.scoreText = MG1.finded + '  ' + (this.needIndex + 1) + '/' + this.levelObjects.length;
  }

  // ---------- клики (порт global_mouse_click + SmartHitTest) ----------
  hitTest(px, py) {
    for (let i = this.objects.length - 1; i >= 0; i--) {
      const o = this.objects[i];
      if (o.found) continue;
      const a = MG1Obj.alphaData(o.idx); if (!a) continue;
      const lx = Math.floor(px - o.x), ly = Math.floor(py - o.y);
      if (lx < 0 || ly < 0 || lx >= a.w || ly >= a.h) continue;
      if (a.a[ly * a.w + lx] > 20) return i;
    }
    return -1;
  }

  handleClick() {
    if (!this.clicksEnable) return;
    const sel = this.hitTest(Input.x, Input.y);
    if (sel === -1) return;
    const obj = this.objects[sel];
    if (!this.levelObjects.includes(obj.group) && !this.levelObjects.includes(obj.id)) return;
    if (obj.id === this.levelObjects[this.needIndex] || obj.group === MG1.groups[this.levelObjects[this.needIndex]]) {
      this.foundObject(obj);
    }
  }

  foundObject(obj) {
    this.sfx('MG1Finding');
    this.clicksEnable = false;
    if (this.changeFlag) this.breakLetters();
    this.changeScore();
    this.hintReady = false;
    for (let j = 0; j < MG1.flIng.length; j++) if (MG1.flIng[j] === obj.idx + 1) this.flameOn[j] = false;
    obj.found = true;

    const main = Assets.spr('OBJ' + (obj.idx + 1));
    const b = MG1Obj.bounds(obj.idx);
    const cx = obj.x + b.w / 2, cy = obj.y + b.h / 2;
    this.fly = {
      img: main.img, w: main.w, h: main.h,
      cx, cy, rot: 0, oscT: 0, osc: true, erase: true, t: 0,
    };
    // проверка «стирания» на старте (как в оригинале)
    if (cy + main.h / 2 > this.rimY &&
        cx < this.cauldronMask.x + this.cauldronMask.w && cx + main.w > this.cauldronMask.x) {
      this.fly.erase = false;
    }
    const pts = [[cx, cy], ...this.getBezierPoints(cx, cy),
      [this.finishPoint.x, this.finishPoint.y + main.h]];
    const flyObj = this.fly;
    this.tweens.add(flyObj, { t: 1 }, MG1.flyTime, {
      ease: 'linear',
      onUpdate: () => {
        const p = mg1Bezier(pts, flyObj.t);
        flyObj.cx = p[0]; flyObj.cy = p[1];
        if (!flyObj.erase && flyObj.cy + main.h / 2 < this.rimY) flyObj.erase = true;
      },
      onDone: () => this.completeTask(),
    });
  }

  completeTask() {
    this.sfx('MG1Bulk');
    this.hintReady = true;
    if (this.fly) this.fly.osc = false;
    this.startNewWorld();
    this.clicksEnable = true;
  }

  // маршрут полёта в котёл (порт get_bezier_points)
  getBezierPoints(px, py) {
    const r = this.cauldronArea, fp = this.finishPoint;
    const up = py <= r.y, down = py > r.y + r.h;
    const left = px <= r.x, right = px > r.x + r.w;
    const pts = [];
    if ((left || right) && (up || down)) {
      if (up) pts.push([fp.x, py]);
      else { pts.push([px, r.y]); pts.push([fp.x, r.y]); }
    } else if (left || right || up || down) {
      if (left || right) { pts.push([px, r.y]); pts.push([fp.x, r.y]); }
      else if (up) pts.push([fp.x, py]);
      else {
        if (px < fp.x) { pts.push([r.x, py]); pts.push([r.x, r.y]); }
        else { pts.push([r.x + r.w, py]); pts.push([r.x + r.w, r.y]); }
        pts.push([fp.x, r.y]);
      }
    } else {
      if (px < fp.x) { pts.push([r.x, py]); pts.push([r.x, r.y]); }
      else { pts.push([r.x + r.w, py]); pts.push([r.x + r.w, r.y]); }
      pts.push([fp.x, r.y]);
    }
    return pts;
  }

  // ---------- подсказка ----------
  showHint() {
    if (!this.hintReady || this.needIndex === -1 || this.needIndex >= this.levelNames.length) return;
    this.sfx('MG1Hint');
    this.hintCd = this.hintTimeout + 1;
    const wantId = this.levelObjects[this.needIndex];
    const wantGroup = MG1.groups[wantId];
    for (const o of this.objects) {
      if (o.found) continue;
      if (o.id === wantId || o.group === wantGroup) {
        const main = Assets.spr('OBJ' + (o.idx + 1));
        this.hintState = { x: o.x + main.w / 2, y: o.y + main.h / 2, t: 0 };
        break;
      }
    }
  }

  starAlpha(i, t) {
    const a = i / this.hintStarsNum;
    if (t < a) return 0;
    if (t < a + 0.3) return (t - a) / 0.3;
    if (t < a + 1.4) return 1;
    if (t < a + 1.7) return 1 - (t - a - 1.4) / 0.3;
    return 0;
  }

  // ---------- победа ----------
  showWinPotion() {
    const erase = this.fly ? this.fly.erase : true;
    this.fly = null;
    if (this.level < 6) {
      this.timers.after(1.6, () => this.sfx('MG1Finish'));
      const id = MG1.wins[this.level - 1];
      const spr = Assets.spr(id); if (!spr) return;
      const cv = document.createElement('canvas');
      cv.width = Math.round(spr.fw * 0.75); cv.height = Math.round(spr.fh * 0.75);
      cv.getContext('2d').drawImage(spr.img, 0, 0, spr.fw, spr.fh, 0, 0, cv.width, cv.height);
      this.potion = {
        cv, w: cv.width, h: cv.height, erase,
        cx: this.finishPoint.x, cy: this.finishPoint.y + cv.height,
        rot: 0, oscT: 0, bob: false, bobT: 0, raysA: 1,
      };
      this.tweens.add(this.potion, { cy: this.finishWinY }, 5.6, {
        ease: 'inOutCubic',
        onDone: () => { this.potion.bob = true; },
      });
    } else {
      // эффект от MG2: врата проявляются с лучами
      this.gates = { alpha: 0, raysA: 0 };
      this.tweens.add(this.gates, { alpha: 1 }, 0.5, { ease: 'linear' });
      this.tweens.add(this.gates, { raysA: 1 }, 0.8, { delay: 0.1, ease: 'linear' });
    }
  }

  win() {
    if (this.level < 6) {
      const dlg = MG1.dialogs[this.level];
      this.startCatDialog([dlg[dlg.length - 1]], () => {}, 0);
    }
    this.timers.after(10, () => this.finish(true));
  }
  finish(won) {
    if (this.state === 'done') return;
    this.state = 'done';
    this.over = { won, expert: false };
    if (won && this.exceptionWin.length) {
      for (const idx of this.exceptionWin) {
        const i = this.pool.indexOf(idx);
        if (i !== -1) this.pool.splice(i, 1);
      }
      this.savePool();
    }
    this.cleanup();
    this.app.onLevelEnd(this.scenarioIdx, won, false);
  }

  // отладочный пропуск уровня (клавиша N, как в bar.js)
  levelEnd() { this.finish(true); }

  openConfirm() { if (this.state !== 'done') this.confirm = true; }

  cleanup() {
    MG1Loop.stop(this.boilSound); this.boilSound = null;
    Music.stop();
    this.tweens.removeAll();
    this.timers.clear();
  }

  // ---------- обновление ----------
  update(dt) {
    this.t += dt;
    this.tweens.update(dt);
    this.timers.update(dt);
    if (this.dialog) this.updateDialog(dt);

    // буквы
    for (const L of this.letters) {
      if (L.fly) {
        L.fly.t += dt;
        const e = MG1EASE.outSine(clamp(L.fly.t / L.fly.dur, 0, 1));
        L.lx = L.fly.sx + (L.fly.tx - L.fly.sx) * e;
        L.y = L.fly.sy + (L.fly.ty - L.fly.sy) * e;
        L.rot = 1000 * e;
        L.fadeT += dt;
        if (L.fadeT > 0) L.alpha = clamp(1 - L.fadeT / 0.3, 0, 1);
      } else {
        L.bt += dt;
      }
    }

    // полёт: колебание
    if (this.fly && this.fly.osc) this.fly.oscT += dt;
    if (this.fly) this.fly.rot = 10 * Math.sin(Math.PI * this.fly.oscT / 0.6);

    // зелье
    if (this.potion) {
      const p = this.potion;
      p.oscT += dt;
      p.rot = 10 * Math.sin(Math.PI * p.oscT / 1.4);
      if (p.bob) p.bobT += dt;
    }
    this.raysT += dt;

    // врата (уровень 6)
    if (this.hintState) {
      this.hintState.t += dt;
      if (this.hintState.t > 3.4) this.hintState = null;
    }
    if (this.hintCd > 0) {
      const was = this.hintCd;
      this.hintCd = Math.max(0, this.hintCd - dt);
      if (was > 0 && this.hintCd === 0) this.sfx('MG1HintEnable');
    }

    // ввод
    if (this.confirm) return;                   // клики обрабатывает drawConfirm (Да/Нет)
    if (Input.clicked) {
      Input.clicked = false;
      if (inRect(this.menuRect(), Input.x, Input.y)) { this.sfx('UIClick'); this.confirm = true; return; }
      if (inRect(this.hintRect(), Input.x, Input.y)) { this.sfx('UIClick'); this.showHint(); return; }
      this.handleClick();
    }
  }

  // ---------- отрисовка ----------
  draw(ctx) {
    const bg = Assets.spr('MG1_BG');
    if (bg) ctx.drawImage(bg.img, 0, 0, W, H);

    // кипение котла
    drawFrame(ctx, 'MG1_BOILING', Math.floor(this.t * 14) % 19, F(233), F(268));

    // кот (кроме последнего дня)
    if (this.level < 6) {
      const cat = Assets.spr('MG1_CAT');
      if (cat) ctx.drawImage(cat.img, F(73.75), F(106.25));
    }

    // объекты
    for (const o of this.objects) {
      if (o.found) continue;
      const cv = MG1Obj.canvas(o.idx);
      if (cv) ctx.drawImage(cv, o.x, o.y);
    }

    // свет из окна
    const wl = Assets.spr('MG1_WINDOWLIGHT');
    if (wl) ctx.drawImage(wl.img, F(370), 0);

    // буквы задачи
    this.drawLetters(ctx);

    // пламя
    for (let i = 0; i < MG1.flIng.length; i++) {
      if (MG1.flIng[i] !== -1 && !this.flameOn[i]) continue;
      const frames = this.flameFrames[i]; if (!frames) continue;
      const fr = frames[Math.floor(this.t * 14) % 2];
      ctx.drawImage(fr, F(MG1.flPos[i][0]) - fr.width / 2, F(MG1.flPos[i][1]) - fr.height / 2);
    }

    // звёзды подсказки
    this.drawHint(ctx);

    // пузырь кота
    if (this.dialog && this.dialog.alpha > 0.01) this.drawBubble(ctx);

    // летящий объект / зелье / врата
    if (this.fly) this.drawErasable(ctx, this.fly.cx, this.fly.cy, this.fly.rot, this.fly.erase, (c) => {
      c.drawImage(this.fly.img, -this.fly.w / 2, -this.fly.h / 2, this.fly.w, this.fly.h);
    });
    if (this.potion) this.drawPotion(ctx);
    if (this.gates) this.drawGates(ctx);

    // счёт (правый нижний угол, как align_score_textfield)
    if (this.scoreText) {
      text(ctx, this.scoreText, W - 8, F(453) + F(11), { size: F(18), align: 'right', color: '#fff', stroke: 'rgba(30,10,40,0.55)', strokeW: 3 });
    }

    this.drawButtons(ctx);
    if (this.confirm) this.drawConfirm(ctx);
  }

  drawLetters(ctx) {
    const g = this.lettersGroup;
    if (!g || g.alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = g.alpha;
    ctx.font = 'italic ' + F(22) + 'px Georgia, serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgba(10,4,20,0.7)';
    ctx.shadowBlur = 6;
    for (const L of this.letters) {
      if (L.alpha <= 0.01) continue;
      const bounce = L.fly ? 0 : (L.bt < 0 ? 0 : 2 * Math.sin(Math.PI * L.bt / 0.6));
      const rot = L.fly ? L.rot : (L.bt < 0 ? 0 : 3 * Math.sin(Math.PI * L.bt / 0.6));
      const sx = g.x - g.fullW * g.scale / 2 + g.offX + L.lx * g.scale;
      const sy = g.y + L.y + bounce;
      ctx.save();
      ctx.globalAlpha = g.alpha * L.alpha;
      ctx.translate(sx, sy);
      ctx.rotate(rot * Math.PI / 180);
      ctx.fillText(L.ch, 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }

  drawHint(ctx) {
    const h = this.hintState; if (!h) return;
    const t = h.t;
    const rot = 90 + (t / 3) * 990;
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.rotate(rot * Math.PI / 180);
    for (let i = 0; i < this.hintStarsNum; i++) {
      const a = this.starAlpha(i, t);
      if (a <= 0.01) continue;
      const ang = i * 360 / this.hintStarsNum;
      const sx = Math.sin(ang * Math.PI / 180) * this.hintStarsRadius;
      const sy = Math.cos(ang * Math.PI / 180) * this.hintStarsRadius;
      const st = this.stars[i];
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(-ang * Math.PI / 180);
      ctx.globalAlpha = a;
      if (st.cv) {
        ctx.drawImage(st.cv, -st.cv.width * 0.35, -st.cv.height * 0.35, st.cv.width * 0.7, st.cv.height * 0.7);
        ctx.rotate(Math.PI / 4);
        ctx.drawImage(st.cv, -st.cv.width / 2, -st.cv.height / 2);
      }
      ctx.restore();
    }
    ctx.restore();
  }

  // объект/зелье с «стиранием» о край котла
  drawErasable(ctx, cx, cy, rot, erase, drawFn) {
    const c = this.scratchCtx, Sz = 768, Hf = Sz / 2;
    c.clearRect(0, 0, Sz, Sz);
    c.save();
    c.translate(Hf, Hf);
    c.rotate(rot * Math.PI / 180);
    drawFn(c);
    c.restore();
    if (erase) {
      const ox = cx - Hf, oy = cy - Hf;
      const gx = this.cauldronMask.x - ox, gy = this.cauldronMask.y - oy;
      c.globalCompositeOperation = 'destination-out';
      const g = c.createLinearGradient(0, gy, 0, gy + this.cauldronMask.h);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,1)');
      c.fillStyle = g;
      c.fillRect(gx, gy, this.cauldronMask.w, this.cauldronMask.h);
      c.fillRect(gx, gy + this.cauldronMask.h, this.cauldronMask.w, 900);
      c.globalCompositeOperation = 'source-over';
    }
    ctx.drawImage(this.scratch, cx - Hf, cy - Hf);
  }

  drawPotion(ctx) {
    const p = this.potion;
    const s1 = 1.2 - 0.2 * Math.cos(2 * Math.PI * this.raysT / 6);
    const r1 = (500 / 20) * this.raysT, r2 = -r1;
    this.drawErasable(ctx, p.cx, p.cy + (p.bob ? 8 * Math.sin(Math.PI * p.bobT / 1.2) : 0), p.rot, p.erase, (c) => {
      // лучи за зельем
      c.save();
      c.translate(8, 16);
      c.globalAlpha = 0.5 * p.raysA;
      c.save(); c.rotate(r1 * Math.PI / 180); c.scale(s1, s1);
      if (this.rays[0]) c.drawImage(this.rays[0], -this.rays[0].width / 2, -this.rays[0].height / 2);
      c.restore();
      c.save(); c.rotate(r2 * Math.PI / 180); c.scale(s1, s1);
      if (this.rays[1]) c.drawImage(this.rays[1], -this.rays[1].width / 2, -this.rays[1].height / 2);
      c.restore();
      c.restore();
      c.globalAlpha = 1;
      c.drawImage(p.cv, -p.w / 2, -p.h / 2);
    });
  }

  drawGates(ctx) {
    const g = this.gates;
    const back = Assets.spr('MG1_GATESBACK');
    if (back && g.alpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = g.alpha;
      ctx.drawImage(back.img, F(312.5) - back.w / 2, F(240) - back.h / 2);
      ctx.restore();
    }
    if (g.raysA > 0.01) {
      const s1 = 1.2 - 0.2 * Math.cos(2 * Math.PI * this.raysT / 6);
      const r1 = (500 / 20) * this.raysT, r2 = -r1;
      ctx.save();
      ctx.translate(F(320), F(240));
      ctx.globalAlpha = 0.5 * g.raysA;
      ctx.save(); ctx.rotate(r1 * Math.PI / 180); ctx.scale(s1, s1);
      if (this.rays[0]) ctx.drawImage(this.rays[0], -this.rays[0].width / 2, -this.rays[0].height / 2);
      ctx.restore();
      ctx.save(); ctx.rotate(r2 * Math.PI / 180); ctx.scale(s1, s1);
      if (this.rays[1]) ctx.drawImage(this.rays[1], -this.rays[1].width / 2, -this.rays[1].height / 2);
      ctx.restore();
      ctx.restore();
    }
  }

  // ---------- кнопки ----------
  menuRect() { return { x: F(1), y: F(443), w: 157, h: 58 }; }
  hintRect() { return { x: F(1), y: F(415), w: 157, h: 58 }; }

  drawButtons(ctx) {
    // меню
    const mr = this.menuRect();
    const mh = inRect(mr, Input.x, Input.y);
    const mid = (Input.down && mh) ? 'BTN_MENU_D' : (mh ? 'BTN_MENU_O' : 'BTN_MENU_N');
    drawFrame(ctx, mid, 0, mr.x, mr.y);
    text(ctx, TEXTS.menu, mr.x + mr.w / 2, mr.y + mr.h / 2 + 1, { size: F(12), color: '#ffe9b0', stroke: 'rgba(40,16,4,0.9)', strokeW: 3 });
    // подсказка
    const hr = this.hintRect();
    const hh = inRect(hr, Input.x, Input.y) && this.hintCd <= 0;
    const hid = (Input.down && hh) ? 'BTN_MENU_D' : (hh ? 'BTN_MENU_O' : 'BTN_MENU_N');
    drawFrame(ctx, hid, 0, hr.x, hr.y);
    if (this.hintCd > 0 && this.grayBtn) {
      const gray = this.hintCd >= this.hintTimeout ? 1 : clamp(this.hintCd / this.hintTimeout, 0, 1);
      const gw = Math.round(157 * gray);
      if (gw > 0) {
        ctx.save();
        ctx.beginPath(); ctx.rect(hr.x, hr.y, gw, hr.h); ctx.clip();
        ctx.drawImage(this.grayBtn, hr.x, hr.y);
        ctx.restore();
      }
    }
    text(ctx, MG1.hint, hr.x + hr.w / 2, hr.y + hr.h / 2 + 1, { size: F(12), color: '#ffe9b0', stroke: 'rgba(40,16,4,0.9)', strokeW: 3 });
  }

  // ---------- пузырь кота (9-slice Box.png) ----------
  drawBubble(ctx) {
    const d = this.dialog;
    const size = F(15);
    ctx.save();
    ctx.font = 'bold ' + size + 'px Georgia, serif';
    const lines = mg1Wrap(ctx, d.text, F(118));
    const lineH = size * 1.25;
    const th = lines.length * lineH;
    const bw = F(124), bh = th * (1 + 1 / lines.length) + F(8);
    const bx = F(193), by = F(147) - bh;
    ctx.globalAlpha = d.alpha;
    this.draw9(ctx, 'BUBBLE_BOX', bx, by, bw, bh);
    const corner = Assets.spr('BUBBLE_CORNER');
    if (corner) {
      ctx.save();
      ctx.translate(bx + F(8) + corner.w, by + bh - corner.h);
      ctx.scale(-1, 1);
      ctx.drawImage(corner.img, 0, 0);
      ctx.restore();
    }
    ctx.fillStyle = '#330f01';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], bx + bw / 2, by + F(8) + (i + 0.5) * lineH);
    }
    ctx.restore();
  }

  draw9(ctx, id, x, y, w, h) {
    const s = Assets.spr(id); if (!s) return;
    const img = s.img;
    // Box.png — скруглённая рамка 90×90 с радиусом ≈ 24: углы не растягиваем, середину тянем
    const ins = Math.min(24, Math.floor(Math.min(s.w, s.h) / 2));
    const dw = Math.min(ins, Math.floor(w / 2)), dh = Math.min(ins, Math.floor(h / 2));
    const sw = s.w - 2 * ins, sh = s.h - 2 * ins;
    const mw = w - 2 * dw, mh = h - 2 * dh;
    // углы
    ctx.drawImage(img, 0, 0, ins, ins, x, y, dw, dh);
    ctx.drawImage(img, s.w - ins, 0, ins, ins, x + w - dw, y, dw, dh);
    ctx.drawImage(img, 0, s.h - ins, ins, ins, x, y + h - dh, dw, dh);
    ctx.drawImage(img, s.w - ins, s.h - ins, ins, ins, x + w - dw, y + h - dh, dw, dh);
    // края
    if (mw > 0) {
      ctx.drawImage(img, ins, 0, sw, ins, x + dw, y, mw, dh);
      ctx.drawImage(img, ins, s.h - ins, sw, ins, x + dw, y + h - dh, mw, dh);
    }
    if (mh > 0) {
      ctx.drawImage(img, 0, ins, ins, sh, x, y + dh, dw, mh);
      ctx.drawImage(img, s.w - ins, ins, ins, sh, x + w - dw, y + dh, dw, mh);
    }
    // центр
    if (mw > 0 && mh > 0) ctx.drawImage(img, ins, ins, sw, sh, x + dw, y + dh, mw, mh);
  }

  // ---------- выход в меню (подтверждение) ----------
  drawConfirm(ctx) {
    const r = drawYesNoBox(ctx, 'Вы действительно хотите выйти в меню?');
    if (r === 'yes') {
      this.confirm = false;
      this.cleanup();
      this.app.showTitle();
    } else if (r === 'no') {
      this.confirm = false;
    }
  }
}

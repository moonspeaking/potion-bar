// ===== Мини-движок: загрузка ресурсов, спрайты, ввод, звук =====
'use strict';

const W = 1024, H = 768;

// ---------- Загрузчик ----------
// Ресурсы разбиты на «ядро» (титул, карта, интерфейс, звуки) и группы, которые подгружаются
// перед нужной сценой (с экраном загрузки) или тихо заранее. Музыка не грузится заранее вовсе.
const GROUP_DIRS = {
  'Images/Comics': 'comics',
  'Images/Bar': 'bar', 'Images/Drinks': 'bar', 'Images/Clients': 'bar',
  'Images/characters': 'bar', 'Images/Episodes': 'bar',
  'Images/MiniGame1': 'mg1',
  'Images/MiniGame2': 'puzzle',
};

const Assets = {
  images: {}, sounds: {}, pending: {}, warned: {},

  groupOf(id) {
    const p = SPRITES[id][0];
    for (const k in GROUP_DIRS) if (p.startsWith(k)) return GROUP_DIRS[k];
    return 'core';
  },
  ids(groups) { return Object.keys(SPRITES).filter((id) => groups.includes(this.groupOf(id))); },
  has(groups) { return this.ids(groups).every((id) => this.images[id] !== undefined); },

  loadImg(id, cb) {
    if (this.images[id] !== undefined) { cb(); return; }
    if (this.pending[id]) { this.pending[id].push(cb); return; }
    this.pending[id] = [cb];
    const done = () => { const w = this.pending[id]; delete this.pending[id]; for (const f of w) f(); };
    const im = new Image();
    im.onload = () => {
      const [, cols, rows] = SPRITES[id];
      this.images[id] = { img: im, cols, rows, fw: im.width / cols, fh: im.height / rows, w: im.width, h: im.height };
      done();
    };
    im.onerror = () => { console.warn(' нет картинки:', SPRITES[id][0]); this.images[id] = null; done(); };
    im.src = 'assets/' + SPRITES[id][0];
  },

  // догрузить группы (onProgress 0..1, onDone — когда всё готово; если уже загружено — сразу)
  ensure(groups, onProgress, onDone) {
    const ids = this.ids(groups).filter((id) => this.images[id] === undefined);
    if (!ids.length) { if (onDone) onDone(); return; }
    let n = 0;
    for (const id of ids) {
      this.loadImg(id, () => {
        n++;
        if (onProgress) onProgress(n / ids.length);
        if (n === ids.length && onDone) onDone();
      });
    }
  },

  // стартовая загрузка: ядро + короткие звуки
  load(onProgress, onDone) {
    const ids = this.ids(['core']);
    const total = ids.length + SOUND_FILES.length;
    let loaded = 0;
    const tick = () => { loaded++; if (onProgress) onProgress(loaded / total); if (loaded >= total && onDone) onDone(); };
    for (const id of ids) this.loadImg(id, tick);
    for (const f of SOUND_FILES) {
      const a = new Audio();
      a.preload = 'auto';
      let fired = false;
      const fin = () => { if (!fired) { fired = true; tick(); } };
      a.oncanplaythrough = fin;
      a.onerror = () => { console.warn(' нет звука:', f); fin(); };
      a.src = 'assets/sounds/' + f + '.mp3';
      this.sounds[f] = a;
    }
  },

  spr(id) {
    const s = this.images[id];
    if (s === undefined && SPRITES[id] && !this.warned[id]) {
      this.warned[id] = 1;
      console.warn(' спрайт не загружен вовремя:', id, '(группа ' + this.groupOf(id) + ')');
    }
    return s;
  },
};

// ---------- Отрисовка спрайтов ----------
// anchor: 'bc' — низ по центру (по умолчанию), 'cc' — центр, 'tl' — левый верх
function drawSpr(ctx, id, x, y, opts = {}) {
  const s = Assets.spr(id); if (!s) return;
  const { frame = 0, scale = 1, anchor = 'bc', alpha = 1, flip = false } = opts;
  const fw = s.fw, fh = s.fh;
  const col = frame % s.cols, row = Math.floor(frame / s.cols) % s.rows;
  let dx = x, dy = y;
  if (anchor === 'bc') { dx -= fw * scale / 2; dy -= fh * scale; }
  else if (anchor === 'cc') { dx -= fw * scale / 2; dy -= fh * scale / 2; }
  ctx.save();
  if (alpha < 1) ctx.globalAlpha = alpha;
  if (flip) { ctx.translate(dx + fw * scale, dy); ctx.scale(-scale, scale); ctx.drawImage(s.img, col * fw, row * fh, fw, fh, 0, 0, fw, fh); }
  else ctx.drawImage(s.img, col * fw, row * fh, fw, fh, dx, dy, fw * scale, fh * scale);
  ctx.restore();
  return { w: fw * scale, h: fh * scale };
}

function sprRect(id, x, y, opts = {}) {
  const s = Assets.spr(id); if (!s) return { x, y, w: 0, h: 0 };
  const { scale = 1, anchor = 'bc' } = opts;
  const fw = s.fw * scale, fh = s.fh * scale;
  if (anchor === 'bc') return { x: x - fw / 2, y: y - fh, w: fw, h: fh };
  if (anchor === 'cc') return { x: x - fw / 2, y: y - fh / 2, w: fw, h: fh };
  return { x, y, w: fw, h: fh };
}

function inRect(r, px, py) { return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h; }

// ---------- Звук ----------
const Sfx = {
  enabled: true,
  volume: Save.settings.sound,           // общий множитель громкости звуков (опции)
  play(name, vol = 1) {
    if (!this.enabled) return;
    const base = Assets.sounds[name]; if (!base) return;
    try {
      const a = base.cloneNode();
      a.volume = clamp(vol * this.volume, 0, 1);
      a.play().catch(() => {});
    } catch (e) {}
  },
};

const Music = {
  cur: null, base: 0.45,
  volume: Save.settings.music,           // общий множитель громкости музыки (опции)
  setVolume(v) {
    this.volume = clamp(v, 0, 1);
    if (this.cur) this.cur.volume = clamp(this.base * this.volume, 0, 1);
  },
  play(name, vol = 0.45) {
    if (this.cur && this.curName === name) return;
    this.stop();
    try {
      const m = new Audio('assets/music/' + name + '.mp3'); m.loop = true; m.volume = clamp(vol * this.volume, 0, 1); this.base = vol;
      m.play().catch(() => {});
      this.cur = m; this.curName = name;
    } catch (e) {}
  },
  stop() { if (this.cur) { try { this.cur.pause(); } catch (e) {} this.cur = null; this.curName = null; } },
  // пауза/возврат (скрытая вкладка) и запуск после блокировки автоплея
  pause() { if (this.cur) { try { this.cur.pause(); } catch (e) {} } },
  resume() { if (this.cur && this.cur.paused) { this.cur.play().catch(() => {}); } },
};

// ---------- Ввод ----------
const Input = {
  x: 0, y: 0, down: false, clicked: false,
  init(canvas) {
    const toGame = (e) => {
      const r = canvas.getBoundingClientRect();
      this.x = (e.clientX - r.left) * (W / r.width);
      this.y = (e.clientY - r.top) * (H / r.height);
    };
    canvas.addEventListener('mousemove', (e) => { toGame(e); });
    canvas.addEventListener('mousedown', (e) => { toGame(e); this.down = true; this.clicked = true; });
    // отпускание ловим на окне: кнопка могла быть отпущена за пределами канваса
    window.addEventListener('mouseup', () => { this.down = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); const t = e.changedTouches[0]; toGame(t); this.down = true; this.clicked = true; }, { passive: false });
    canvas.addEventListener('touchmove', (e) => { e.preventDefault(); toGame(e.changedTouches[0]); }, { passive: false });
    canvas.addEventListener('touchend', (e) => { e.preventDefault(); this.down = false; }, { passive: false });
    canvas.addEventListener('touchcancel', () => { this.down = false; });
    // клавиатура — на окне (канвас не получает фокус)
    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (this.onKey) this.onKey(e.key);
    });
    // первый жест пользователя снимает запрет автозапуска звука
    const unlock = () => { Music.resume(); };
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
  },
  endFrame() { this.clicked = false; },
};

// ---------- Курсор (опция «Игровой курсор»: золотая стрелка и часы из оригинала) ----------
const Cursor = {
  on: true, kind: 'default',
  set(kind) { this.kind = kind; this.apply(); },
  apply() {
    const c = document.getElementById('game'); if (!c) return;
    const k = this.kind;
    if (this.on) {
      c.style.cursor = k === 'watch'
        ? "url('assets/Images/Interface/PointerWatch.png') 11 11, wait"
        : "url('assets/Images/Interface/PointerGame.png') 1 1, " + (k === 'pointer' ? 'pointer' : 'default');
    } else {
      c.style.cursor = k === 'pointer' ? 'pointer' : (k === 'watch' ? 'wait' : 'default');
    }
  },
};

// ---------- Утилиты ----------
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);
const rndi = (a, b) => Math.floor(rnd(a, b + 1));
const easeOut = t => 1 - (1 - t) * (1 - t);

// Текст с обводкой
function text(ctx, str, x, y, opts = {}) {
  const { size = 24, color = '#fff', stroke = 'rgba(20,8,30,0.9)', strokeW = 4, align = 'center', bold = true, font = 'Georgia, serif' } = opts;
  ctx.save();
  ctx.font = (bold ? 'bold ' : '') + size + 'px ' + font;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  if (stroke) { ctx.lineWidth = strokeW; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.strokeText(str, x, y); }
  ctx.fillStyle = color; ctx.fillText(str, x, y);
  ctx.restore();
}

// Простой список анимаций-тween'ов
const Tweens = {
  list: [],
  add(obj, prop, from, to, dur, onDone, ease = easeOut) {
    this.list.push({ obj, prop, from, to, dur, t: 0, onDone, ease });
  },
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const tw = this.list[i];
      tw.t += dt;
      const k = clamp(tw.t / tw.dur, 0, 1);
      tw.obj[tw.prop] = lerp(tw.from, tw.to, tw.ease(k));
      if (k >= 1) { this.list.splice(i, 1); if (tw.onDone) tw.onDone(); }
    }
  },
  clear() { this.list.length = 0; },
};

// Кнопка-картинка
class ImgButton {
  constructor(idNormal, idOver, idDown, x, y, opts = {}) {
    this.n = idNormal; this.o = idOver || idNormal; this.d = idDown || idOver || idNormal;
    this.x = x; this.y = y; this.scale = opts.scale || 1; this.anchor = opts.anchor || 'cc';
    this.onClick = opts.onClick || null; this.visible = true; this.enabled = true;
  }
  rect() { return sprRect(this.n, this.x, this.y, { scale: this.scale, anchor: this.anchor }); }
  update() {
    if (!this.visible || !this.enabled) return;
    if (Input.clicked && inRect(this.rect(), Input.x, Input.y)) {
      Sfx.play('UIClick', 0.8);
      if (this.onClick) this.onClick();
    }
  }
  draw(ctx) {
    if (!this.visible) return;
    const hov = inRect(this.rect(), Input.x, Input.y) && this.enabled;
    const id = (Input.down && hov) ? this.d : (hov ? this.o : this.n);
    drawSpr(ctx, id, this.x, this.y, { scale: this.scale, anchor: this.anchor });
  }
}

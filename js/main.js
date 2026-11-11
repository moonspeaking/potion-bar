// ===== Главный модуль: загрузка, меню, цикл =====
'use strict';

const DEBUG = /debug|mg[12]/.test(location.hash);   // читы только по #debug / #mg1 / #mg2
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// Масштабирование под окно
function fitCanvas() {
  const vv = window.visualViewport;
  const ww = vv ? vv.width : window.innerWidth, wh = vv ? vv.height : window.innerHeight;
  const k = Math.min(ww / W, wh / H);
  canvas.style.width = Math.floor(W * k) + 'px';
  canvas.style.height = Math.floor(H * k) + 'px';
  // портретная ориентация на телефоне — просим повернуть устройство
  const hint = document.getElementById('rotate');
  if (hint) hint.style.display = (ww < wh && ww < 700 && window.matchMedia('(pointer: coarse)').matches) ? 'flex' : 'none';   // только на сенсорных устройствах
}
window.addEventListener('resize', fitCanvas);
window.addEventListener('orientationchange', () => setTimeout(fitCanvas, 200));
if (window.visualViewport) window.visualViewport.addEventListener('resize', fitCanvas);
fitCanvas();

// полный экран (где поддерживается)
const FS = {
  supported: !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen),
  active() { return !!(document.fullscreenElement || document.webkitFullscreenElement); },
  toggle() {
    const d = document, el = d.documentElement;
    try {
      if (this.active()) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
      else (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
    } catch (e) {}
  },
};
(function initFsButton() {
  const b = document.getElementById('fs');
  if (!b) return;
  if (!FS.supported) { b.style.display = 'none'; return; }
  b.addEventListener('click', () => FS.toggle());
  b.addEventListener('touchend', (e) => e.stopPropagation());
  const upd = () => { b.textContent = FS.active() ? '⤡' : '⤢'; setTimeout(fitCanvas, 100); };
  document.addEventListener('fullscreenchange', upd);
  document.addEventListener('webkitfullscreenchange', upd);
})();

// скрытая вкладка: тишина и пауза бара; возврат — продолжение
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    Music.pause();
    const sc = (typeof App !== 'undefined') ? App.bar : null;
    if (sc && App.scene === 'bar' && sc.paused === false && !sc.over) sc.paused = true;
  } else {
    Music.resume();
  }
});

// Заглушка мини-игр (появится позже: MG1 «скрытые предметы», MG2 «врата»)
class MiniGameStub {
  constructor(app, scenarioIdx) {
    this.app = app;
    this.scenarioIdx = scenarioIdx;
    this.entry = SCENARIO[scenarioIdx];
    this.t = 0;
    Music.play('Menu', 0.4);
  }
  update(dt) {
    this.t += dt;
    if (Input.clicked) {
      Input.clicked = false;
      Sfx.play('UIClick');
      this.app.onLevelEnd(this.scenarioIdx, true, false);
    }
  }
  draw(c) {
    c.fillStyle = '#140a20';
    c.fillRect(0, 0, W, H);
    drawSpr(c, 'CAT1', W / 2, H / 2 - 40, { frame: Math.floor(this.t * 2) % 6, scale: 1, anchor: 'cc' });
    text(c, 'Мини-игра пока в разработке', W / 2, H / 2 + 170, { size: 30, color: '#f0e6ff' });
    text(c, 'Нажмите, чтобы продолжить', W / 2, H / 2 + 215, { size: 22, color: '#c9b8e8' });
  }
}

// ===== Титульный экран: композиция PotionBarGameMenu (координаты 640→×1.6) =====
const S6 = (v) => v * 1.6;                                    // 640-пространство → 1024
const lin = (t) => t;
const easeIO = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
// лампы вывески (оригинальный lamps_array)
const LAMPS = [[438,248],[462,233],[483,218],[505,223.5],[529.5,226],[554.5,226],[579.5,226],[604.5,223.5],[628,218.5],[621,251],[628,284],[605.5,279.5],[580.5,277],[555.5,276],[530.5,276.5],[506,277.5],[482,280.5],[460,265.5]].map(p => [S6(p[0]), S6(p[1])]);

// поканальная тонировка (аналог flash ColorTransform с offset)
function tintImg(img, dr, dg, db) {
  const cv = document.createElement('canvas');
  cv.width = img.width; cv.height = img.height;
  const g = cv.getContext('2d');
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, cv.width, cv.height), p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    p[i] = clamp(p[i] + dr, 0, 255); p[i + 1] = clamp(p[i + 1] + dg, 0, 255); p[i + 2] = clamp(p[i + 2] + db, 0, 255);
  }
  g.putImageData(d, 0, 0);
  return cv;
}
let TINT_STAR_R = null, TINT_STAR_Y = null, TINT_STAR_G = null, TINT_SHINE = null, SHINE_C = null;
function buildTitleTints() {
  if (TINT_STAR_R) return;
  const star = Assets.spr('EFF_STAR').img;
  TINT_STAR_R = tintImg(star, 0, -255, -255);      // ColorTransform(1,1,1,1,0,-255,-255)
  TINT_STAR_Y = tintImg(star, 0, 0, -255);         // (1,1,1,1,0,0,-255)
  TINT_STAR_G = tintImg(star, -255, 0, -255);      // (1,1,1,1,-255,0,-255)
  TINT_SHINE = tintImg(Assets.spr('PLAY_EFF').img, 0, 0, -150);   // (1,1,1,1,0,0,-150)
  SHINE_C = document.createElement('canvas');
  SHINE_C.width = 205; SHINE_C.height = 82;
}

// мини-tween'ы титула (аналог Tweener + IntervalsManager из оригинала)
const TitleFX = {
  tw: [], tm: [],
  to(o, p, target, dur, ease = easeIO, done = null) {
    this.tw = this.tw.filter(t => t.o !== o || t.p !== p);
    this.tw.push({ o, p, from: o[p], to: target, dur, t: 0, ease, done });
  },
  blink(o, p, time, peak, rest) {                 // точная копия blink(): подъём за time/4, спад за time/4 после time*3/4
    this.to(o, p, peak, time / 4, lin);
    this.after(time * 3 / 4, () => this.to(o, p, rest, time / 4, lin));
  },
  after(d, fn) { this.tm.push({ t: d, fn }); },
  loop(dFn, fn) {                                 // setInterval (первое срабатывание через интервал)
    const arm = () => this.after(dFn(), () => { fn(); arm(); });
    arm();
  },
  update(dt) {
    for (let i = this.tw.length - 1; i >= 0; i--) {
      const t = this.tw[i];
      t.t += dt;
      const k = clamp(t.t / t.dur, 0, 1);
      t.o[t.p] = t.from + (t.to - t.from) * t.ease(k);
      if (k >= 1) { this.tw.splice(i, 1); if (t.done) t.done(); }
    }
    for (let i = this.tm.length - 1; i >= 0; i--) {
      const m = this.tm[i];
      m.t -= dt;
      if (m.t <= 0) { this.tm.splice(i, 1); m.fn(); }
    }
  },
  clear() { this.tw.length = 0; this.tm.length = 0; },
};

// состояние анимаций титула
const T = {
  tail: 0, bag: 0,                 // углы поворота (град)
  logo: 1, lamp: 0.4,              // альфы логотипа и фонаря
  girlEye: 0, catA: 0, catB: 0,    // альфы глаз
  stars: new Array(18).fill(0.5),  // альфы звёзд ламп
  shine: S6(-50),                  // смещение блика по кнопке Play
};

function startTitleFX() {          // аналог startEffects()
  TitleFX.clear();
  T.stars.fill(0.5); T.logo = 1; T.lamp = 0.4; T.girlEye = T.catA = T.catB = 0; T.shine = S6(-50);
  // две бегущие цепочки вспышек ламп (blink_lamp(0) и blink_lamp(8), шаг 130мс)
  let c1 = 0, c2 = 8;
  TitleFX.loop(() => 0.13, () => { TitleFX.blink(T.stars, c1, 0.6, 0, 0.5); c1 = (c1 + 1) % LAMPS.length; });
  TitleFX.loop(() => 0.13, () => { TitleFX.blink(T.stars, c2, 0.6, 0, 0.5); c2 = (c2 + 1) % LAMPS.length; });
  // мерцание логотипа
  TitleFX.loop(() => 4.5, () => TitleFX.after(4 * Math.random(), () => {
    TitleFX.blink(T, 'logo', 0.1 * Math.random(), 0.5 * Math.random(), 1);
    TitleFX.after(0.02 + 0.09 * Math.random(), () =>
      TitleFX.blink(T, 'logo', 0.05 + 0.1 * Math.random(), 0.5 * Math.random(), 1));
  }));
  // дрожание уличного фонаря
  TitleFX.loop(() => 0.1, () => TitleFX.after(0.01 * Math.random(), () =>
    TitleFX.blink(T, 'lamp', 0.2 * Math.random(), 0.1 + 0.2 * Math.random(), 0.4)));
  // глаза девушки и кошки
  TitleFX.loop(() => 5 + 2 * Math.random(), () => TitleFX.blink(T, 'girlEye', 0.1, 1, 0));
  TitleFX.loop(() => 4 + 3 * Math.random(), () => {
    TitleFX.blink(T, 'catA', 0.1, 1, 0);
    TitleFX.after(0.05, () => TitleFX.blink(T, 'catB', 0.1, 1, 0));
  });
  // качание сумки (последовательность амплитуд 3/2 → 2/1.3 → 1.3/0)
  const bagSeq = (a, b) => { TitleFX.to(T, 'bag', a, 1.4); TitleFX.after(1.4, () => TitleFX.to(T, 'bag', -b, 1.4)); };
  const bagRun = () => { bagSeq(3, 2); TitleFX.after(2.8, () => bagSeq(2, 1.3)); TitleFX.after(5.6, () => bagSeq(1.3, 0)); };
  TitleFX.after(3 * Math.random(), () => { bagRun(); TitleFX.loop(() => 9 + 6 * Math.random(), bagRun); });
  // пробегающий блик по кнопке Play (каждые 4с, 1.2с линейно)
  TitleFX.loop(() => 4, () => { T.shine = S6(-50); TitleFX.to(T, 'shine', S6(120), 1.2, lin); });
}

const App = {
  scene: 'loading',      // loading | title | bar
  bar: null,
  progress: 0,
  titleBtns: [],
  titleT: 0,

  init() {
    this.progress = Save.getProgress(SCENARIO.length);
    Cursor.on = Save.settings.cursor; Cursor.set('watch');
    this.options = new OptionsPanel(this);
    this.profilePanel = new ProfilePanel(this);
    this.credits = new CreditsPanel();
    this.exitConfirm = new ConfirmPanel();
    this.refreshSummary();
    if (location.hash === '#mg1') this.progress = 3;   // отладка: сразу первый hidden-уровень
    if (location.hash === '#mg2') this.progress = 8;   // отладка: сразу первая головоломка «врата»
    Input.init(canvas);
    Input.onKey = (key) => {
      if (this.scene === 'map' && this.map) { this.map.onKey(key); return; }
      if (this.exitConfirm.isOpen) { this.exitConfirm.onKey(key); return; }
      if (this.profilePanel.isOpen) { this.profilePanel.onKey(key); return; }
      if (this.credits.isOpen) { this.credits.onKey(key); return; }
      if (this.options.isOpen) { if (key === 'Escape') this.options.close(); return; }
      if (this.scene === 'bar' && this.bar && this.bar.noteOpen) {          // записка открыта
        if (key === 'Escape' || key === 'Enter' || key === ' ') this.bar.closeNote();
        return;
      }
      if (key === 'Escape' || key === 'p' || key === 'P') {
        if (this.scene === 'bar' && this.bar && this.bar.isComics) {
          if (key === 'Escape') this.bar.skipAll();
          return;
        }
        if (this.scene === 'bar' && this.bar && this.bar.isMG1) {
          if (key === 'Escape') this.bar.openConfirm();
          return;
        }
        if (this.scene === 'bar' && this.bar && this.bar.paused !== undefined && !this.bar.over) {
          this.bar.paused = true;
        }
      }
      if ((key === 'n' || key === 'N') && DEBUG) { // отладка (#debug): пропустить уровень
        if (this.scene === 'bar' && this.bar && this.bar.over === null) this.bar.levelEnd();
      }
    };
    for (const id of ['LOADING_BG', 'LS_GLASS', 'LS_SUB0', 'LS_SUB1']) Assets.loadImg(id, () => {});   // экран загрузки — первым
    Assets.load(
      (p) => { this.progress0 = p; },
      () => { this.loadDone = true; Cursor.set('default'); }       // как в оригинале: «Нажмите для продолжения»
    );
    // 4 кнопки меню (buttons_coordinats: x=545, y=323.75/359.375/393.75/428.125 в 640-пространстве)
    const bx = S6(545);
    this.titleBtns = [
      new ImgButton('PLAY_N', 'PLAY_O', 'PLAY_D', bx, S6(323.75), { onClick: () => this.play() }),
      new ImgButton('MBTN_N', 'MBTN_O', 'MBTN_D', bx, S6(359.375), { onClick: () => this.options.show() }),
      new ImgButton('MBTN_N', 'MBTN_O', 'MBTN_D', bx, S6(393.75), { onClick: () => this.credits.show() }),
      new ImgButton('MBTN_N', 'MBTN_O', 'MBTN_D', bx, S6(428.125), { onClick: () => this.askExit() }),
    ];
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  },

  // выход с загрузочного экрана на титул (по клику — это же и жест для разблокировки звука)
  enterTitle() {
    this.loadDone = false;
    this.scene = 'title'; Music.play('Menu', 0.4); startTitleFX();
    if (!Save.current()) this.profilePanel.show('name', true);     // имени ещё нет — просим представиться
    // пока игрок смотрит на меню — тихо подгружаем бар
    setTimeout(() => this.prefetch(this.groupsFor(this.progress)), 1200);
  },

  // какие группы ресурсов нужны для шага сценария
  groupsFor(idx) {
    const e = SCENARIO[idx];
    if (!e || e.type === 'end') return ['comics'];
    if (idx === 0 && !Save.get(Save.K_INTRO)) return ['comics'];
    if (e.type === 'base') return ['bar'];
    if (e.type === 'hidden') return ['mg1'];
    if (e.type === 'puzzle') return ['puzzle', 'mg1'];
    return [];
  },

  // выполнить fn, когда нужные группы загружены (иначе — экран загрузки)
  loadThen(groups, fn) {
    if (Assets.has(groups)) { fn(); return; }
    const prev = this.scene;
    this.progress0 = 0;
    this.scene = 'loading';
    Music.pause();
    Cursor.set('watch');
    Assets.ensure(groups, (p) => { this.progress0 = p; }, () => {
      Cursor.set('default');
      Music.resume();
      if (this.scene === 'loading') fn();
      else if (prev) this.scene = prev;
    });
  },

  // тихая подзагрузка того, что понадобится дальше
  prefetch(groups) { if (!Assets.has(groups)) Assets.ensure(groups); },

  startLevel(idx) {
    this.loadThen(this.groupsFor(idx), () => this.enterLevel(idx));
  },

  enterLevel(idx) {
    GuestVoice.stop();
    const entry = SCENARIO[idx];
    if (!entry || entry.type === 'end') {
      // последний уровень пройден → финальный комикс у магического дерева
      this.bar = new ComicsScene(this, 'end');
      this.scene = 'bar';
      return;
    }
    if (idx === 0 && !Save.get(Save.K_INTRO)) {
      // новая игра → вступительные комиксы (трамвай → вход в бар)
      Save.remove(Save.K_POOL);   // сброс пула ингредиентов MG1
      this.bar = new ComicsScene(this, 'intro');
      this.scene = 'bar';
      return;
    }
    Music.stop();
    if (entry.type === 'base') {
      this.bar = new BarScene(this, idx);
    } else if (entry.type === 'hidden') {
      this.bar = new MG1Scene(this, idx);
    } else if (entry.type === 'puzzle') {
      this.bar = new PuzzleScene(this, idx);
    } else {
      this.bar = new MiniGameStub(this, idx);
    }
    this.scene = 'bar';
  },

  comicsDone(kind) {
    if (kind === 'intro') {
      Save.set(Save.K_INTRO, '1');
      this.startLevel(this.progress || 0);
    } else {
      // игра пройдена целиком — сбрасываем прогресс
      Save.remove(Save.K_SCENARIO);
      this.progress = 0;
      this.showTitle();
    }
  },

  // вызывается сценой после итога уровня
  // конец уровня: результат пишется в сохранение, затем возврат на карту (как в оригинале)
  onLevelEnd(scenarioIdx, won, expert, money) {
    Save.recordResult(scenarioIdx, won, expert, money);
    if (!won) {
      if (this.progress > 0) this.showMap(); else this.showTitle();
      return;
    }
    let fly = null;
    const next = scenarioIdx + 1;
    if (scenarioIdx >= this.progress && next < SCENARIO.length) {   // новый шаг (а не переигровка)
      this.progress = next;
      Save.setProgress(next);
      const e = SCENARIO[scenarioIdx];
      const st = mapStateFor(next);
      if (e.type === 'base') fly = { kind: 'star', index: st.stars - 1 };
      else if (e.type === 'hidden' && e.id < 6) fly = { kind: 'bottle', index: st.bottles - 1 };
    }
    this.showMap(fly);
  },

  showMap(fly, fromTitle) {
    this.bar = null;
    GuestVoice.stop();
    this.map = new MapScene(this, fly || null);
    this.scene = 'map';
    this.prefetch(this.groupsFor(this.progress));      // следующий шаг загружается, пока смотрим карту
    Music.play('Menu', 0.4);
    if (fromTitle) Sfx.play('UIMapEntry');
  },

  refreshSummary() { this.sum = Save.summary(); },

  // «ИГРАТЬ»: с прогрессом — карта, без него — первый уровень
  play() {
    if (!Save.current()) { this.profilePanel.show('name', true); return; }
    if (this.progress > 0) this.showMap(null, true);
    else this.startLevel(0);
  },

  // профиль выбран/создан/удалён — перечитать прогресс
  onProfileChanged() {
    this.progress = Save.getProgress(SCENARIO.length);
    this.refreshSummary();
    this.prefetch(this.groupsFor(this.progress));
    if (!Save.current()) this.profilePanel.show('name', true);
  },

  askExit() {
    this.exitConfirm.show('Вы действительно хотите прервать игру?', () => {
      try { window.close(); } catch (e) {}
      this.scene = 'exit'; Music.stop();
    }, null);
  },

  modalOpen() {
    return this.options.isOpen || this.profilePanel.isOpen || this.credits.isOpen || this.exitConfirm.isOpen;
  },

  showTitle() {
    this.refreshSummary();
    GuestVoice.stop();
    this.bar = null;
    this.map = null;
    Cursor.set('default');
    this.scene = 'title';
    Music.play('Menu', 0.4);
    startTitleFX();
  },

  loop(t) {
    const dt = Math.min((t - this.last) / 1000, 0.05);
    this.last = t;

    try { this.frame(dt); } catch (e) { console.error(e); }   // ошибка кадра не должна останавливать игру
    Input.endFrame();
    requestAnimationFrame((tt) => this.loop(tt));
  },

  frame(dt) {
    if (this.scene === 'exit') {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      text(ctx, 'Игра завершена. Можно закрыть вкладку.', W / 2, H / 2, { size: 26, color: '#c9b8e8' });
      text(ctx, 'Нажмите, чтобы вернуться', W / 2, H / 2 + 44, { size: 18, color: '#8a7aa8' });
      if (Input.clicked) this.showTitle();
    } else if (this.scene === 'loading') {
      this.drawLoading(ctx);
      if (this.loadDone && Input.clicked) { Input.clicked = false; this.enterTitle(); }
    }
    else if (this.scene === 'title') {
      this.updateTitle(dt); this.drawTitle(ctx);
      for (const m of [this.options, this.credits, this.profilePanel, this.exitConfirm]) { m.update(dt); m.draw(ctx); }
    }
    else if (this.scene === 'map' && this.map) {
      const m = this.map; m.update(dt);
      if (this.map === m) m.draw(ctx);          // update мог сменить сцену (Назад / Играть)
    } else if (this.scene === 'bar' && this.bar) {
      const b = this.bar; b.update(dt);
      if (this.bar === b) b.draw(ctx);
    }
  },

  updateTitle(dt) {
    this.titleT += dt;
    // хвост: ±2° вокруг левого верхнего угла, период 2.8с (1.4с в каждую сторону)
    const ph = (this.titleT % 2.8) / 1.4;
    T.tail = ph < 1 ? lerp(2, -2, easeIO(ph)) : lerp(-2, 2, easeIO(ph - 1));
    const modal = this.modalOpen();
    if (!modal) for (const b of this.titleBtns) b.update();
    // «Нажмите, чтобы изменить» (смена профиля)
    const lr = this.greetLinkRect();
    const over = !modal && inRect(lr, Input.x, Input.y);
    Cursor.set(over ? 'pointer' : 'default');
    if (over && Input.clicked) { Input.clicked = false; Sfx.play('UIClick'); this.profilePanel.show('list'); }
    TitleFX.update(dt);
  },

  // ----- приветствие на вывеске (по оригиналу: «Добро пожаловать, <имя>» / «Нажмите, чтобы изменить») -----
  greetLinkRect() { return { x: S6(545) - 120, y: 404, w: 240, h: 26 }; },

  drawGreeting(c) {
    const cur = Save.current();
    const name = cur ? cur.name : '';
    const cx = S6(545) - 4;
    c.save();
    c.font = '21px Georgia, serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.shadowColor = 'rgba(60,20,0,0.6)'; c.shadowBlur = 3; c.shadowOffsetY = 1;
    c.fillStyle = '#fff6e6';
    c.fillText('Добро пожаловать, ' + name, cx, 388, 236);
    const lr = this.greetLinkRect();
    const hov = !this.modalOpen() && inRect(lr, Input.x, Input.y);
    c.fillStyle = hov ? '#fff29a' : '#ffd21c';
    const label = 'Нажмите, чтобы изменить';
    c.fillText(label, cx, 417, 236);
    const w = Math.min(236, c.measureText(label).width);
    c.fillRect(cx - w / 2, 428, w, 2);
    c.restore();
  },

  drawLoading(c) {
    const bg = Assets.images.LOADING_BG;          // без предупреждения: первые кадры идут до загрузки фона
    if (bg) c.drawImage(bg.img, 0, 0, W, H);
    else { c.fillStyle = '#140a20'; c.fillRect(0, 0, W, H); }
    const p = this.loadDone ? 1 : clamp(this.progress0 || 0, 0, 1);
    // колба из оригинала (LS_*) стоит на линии свечения; зелье поднимается по мере загрузки
    const gl = Assets.images.LS_GLASS, sb = Assets.images.LS_SUB0, ss = Assets.images.LS_SUB1;
    const cx = 516, bottom = 565;                 // положение измерено по скриншоту оригинала (совмещение с LoadingBG)
    if (gl && sb) {
      const fx = cx - gl.fw / 2, fy = bottom - gl.fh;
      c.drawImage(gl.img, 0, gl.fh, gl.fw, gl.fh, fx, fy, gl.fw, gl.fh);           // пустая колба (задний слой)
      const hh = sb.h * p;
      c.save();
      c.beginPath(); c.rect(fx, fy + gl.fh - hh, gl.fw, hh); c.clip();
      c.drawImage(sb.img, fx, fy + gl.fh - sb.h);
      c.restore();
      if (ss && p > 0.02 && p < 0.98) c.drawImage(ss.img, fx, fy + gl.fh - hh - ss.h / 2);   // поверхность зелья
      c.drawImage(gl.img, 0, 0, gl.fw, gl.fh, fx, fy, gl.fw, gl.fh);               // стекло
    }
    // подпись: во время загрузки «Загрузка», по окончании — приглашение продолжить (мигает)
    const msg = this.loadDone ? 'Нажмите для продолжения' : 'Загрузка…';
    const a = this.loadDone ? 0.65 + 0.35 * Math.sin(performance.now() / 450) : 0.75;
    c.save();
    c.globalAlpha = a;
    text(c, msg, cx, 691, { size: 23, color: '#b49aaa', stroke: null, bold: false });
    c.restore();
  },

  drawTitle(c) {
    buildTitleTints();
    const bg = Assets.spr('MAIN_BG');
    if (bg) c.drawImage(bg.img, 0, 0, W, H);
    // логотип: нижний слой + мерцающий верхний (mm_logo02 под mm_logo01), x=193.125, y=0
    drawSpr(c, 'MM_LOGO_B', S6(193.125), 0, { anchor: 'tl' });
    drawSpr(c, 'MM_LOGO_A', S6(193.125), 0, { anchor: 'tl', alpha: T.logo });
    // свечение уличного фонаря (центр 140, 42)
    drawSpr(c, 'FLAME_BIG', S6(140) - 186, S6(42) - 186, { anchor: 'tl', alpha: T.lamp });
    // вывеска: 18 ламп, поворот 45°, лампочки 0.7, звёзды с блеском 0.5
    const starTint = [TINT_STAR_R, TINT_STAR_Y, TINT_STAR_G];
    const bulbId = ['MM_RED', 'MM_YELLOW', 'MM_GREEN'];
    for (let i = 0; i < LAMPS.length; i++) {
      c.save();
      c.translate(LAMPS[i][0], LAMPS[i][1]);
      c.rotate(Math.PI / 4);
      drawSpr(c, bulbId[i % 3], 0, 0, { anchor: 'cc', scale: 0.7, alpha: 0.7 });
      c.globalAlpha = T.stars[i];
      const st = starTint[i % 3];
      c.drawImage(st, -st.width / 2, -st.height / 2);
      if (i % 3 === 0) drawSpr(c, 'MM_REDGLOW', 0, 0, { anchor: 'cc' });
      else if (i % 3 === 2) drawSpr(c, 'MM_GREENGLOW', 0, 0, { anchor: 'cc' });
      c.restore();
    }
    // кнопки (столбец x=545) с подписями AGPresquire 12→19, цвет 0x330F01
    const labels = ['ИГРАТЬ', 'ОПЦИИ', 'СОЗДАТЕЛИ', 'ВЫХОД'];
    for (let i = 0; i < this.titleBtns.length; i++) {
      const b = this.titleBtns[i];
      const hov = b.enabled && inRect(b.rect(), Input.x, Input.y);
      const id = (Input.down && hov) ? b.d : (hov ? b.o : b.n);
      c.save();
      if (!b.enabled) c.filter = 'grayscale(1)';
      drawSpr(c, id, b.x, b.y, { anchor: 'cc' });
      text(c, labels[i], b.x, b.y + 2, { size: 19, color: '#330f01', stroke: null });
      c.restore();
    }
    // приветствие на вывеске: имя игрока и ссылка для смены профиля
    this.drawGreeting(c);
    // бармен: mm_girl (центр 53.125, 296.875), хвост, нашивка, сумка, глаза
    const girl = Assets.spr('MM_GIRL');
    drawSpr(c, 'MM_GIRL', S6(53.125) - girl.fw / 2, S6(296.875) - girl.fh / 2, { anchor: 'tl' });
    const tail = Assets.spr('MM_TAIL');
    c.save();
    c.translate(S6(87.5) - tail.fw / 2, S6(240.625) - tail.fh / 2);
    c.rotate(T.tail * Math.PI / 180);
    c.drawImage(tail.img, 0, 0);
    c.restore();
    drawSpr(c, 'MM_ZAD', S6(71.125), S6(209.875), { anchor: 'tl' });
    const bag = Assets.spr('GG_BAG');
    c.save();
    c.translate(S6(19) + bag.fw / 2, S6(238));
    c.rotate(T.bag * Math.PI / 180);
    c.drawImage(bag.img, -bag.fw / 2, 0);
    c.restore();
    const ce = Assets.spr('MM_CATEYES');
    const cex = S6(48.125) - ce.fw / 2, cey = S6(200) - ce.fh / 2;
    drawSpr(c, 'MM_CATEYES', cex, cey, { anchor: 'tl', frame: 0, alpha: T.catA });
    drawSpr(c, 'MM_CATEYES', cex, cey, { anchor: 'tl', frame: 1, alpha: T.catB });
    const ge = Assets.spr('GG_EYE');
    drawSpr(c, 'GG_EYE', S6(65.625) - ge.fw / 2, S6(150) - ge.fh / 2, { anchor: 'tl', alpha: T.girlEye });
    // блик на кнопке Play: shine ×2 под маской-силуэтом кнопки (scaleY 0.7, y=7)
    const b0 = this.titleBtns[0], r0 = b0.rect();
    const sg = SHINE_C.getContext('2d');
    sg.clearRect(0, 0, SHINE_C.width, SHINE_C.height);
    sg.drawImage(TINT_SHINE, T.shine, 0, 410, 164);
    sg.globalCompositeOperation = 'destination-in';
    const pn = Assets.spr('PLAY_N');
    sg.drawImage(pn.img, 0, 0, pn.fw, pn.fh, 0, S6(7), pn.fw, pn.fh * 0.7);
    sg.globalCompositeOperation = 'source-over';
    c.save();
    c.globalAlpha = 0.7;
    c.drawImage(SHINE_C, r0.x, r0.y);
    c.restore();
  },
};

App.init();

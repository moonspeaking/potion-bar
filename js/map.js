// ===== Карта уровней (порт PotionBarGameMap) =====
// Экран-хаб между уровнями: фото пяти эпизодов, шар с текущей локацией, звёзды (пройденные
// уровни бара), бутылки (пройденные «скрытые предметы»), кнопки «ИГРАТЬ» и «НАЗАД».
// Расширение к оригиналу: по клику на пройденную звезду уровень можно переиграть.
'use strict';

const MAP_PHOTOS = [[12, 9], [126, 8], [261, 10], [380, 7], [516, 9]];
const MAP_STARS = [[8.75,110],[20.625,108.125],[33.75,107.5],[59.375,108.125],[73.125,108.75],[86.875,109.375],[100,110.625],[136.25,118.125],[148.75,115],[162.5,112.5],[188.125,110],[201.25,107.5],[215,106.25],[227.5,105.625],[256.25,110],[270,110],[283.125,110.625],[309.375,114.375],[322.5,116.25],[335,118.75],[346.25,122.5],[380,113.125],[391.875,111.25],[403.75,109.375],[431.875,108.75],[445.625,107.5],[458.75,106.25],[471.875,105],[509.375,106.875],[522.5,108.75],[535.625,111.25],[563.125,113.75],[576.25,116.25],[588.125,118.125],[600,120]];
const MAP_STAR_ANG = [-0.4325,0.4525,0.8435,0.3135,0.5625,-0.124,0.2915,0.0052,0.4555,0.002,-0.231,0.149,-0.27,0.421,-0.4535,0.1465,0.4205,-0.005,0.38,-0.4925,0.1715,-0.439,0.1915,0.586,-0.18,0.282,-0.423,0.1925,-0.1835,0.4275,0.129,-0.202,0.323,-0.351,0.0695];
const MAP_BOTTLES = [[43.75,106.25],[172.5,111.25],[293.125,111.875],[415.625,108.125],[547.5,112.5]];
const MAP_BOTTLE_ANG = [-0.0501,0.0867,0.092,0.0436,-0.0376];

Object.assign(SPRITES, {
  MAP_BG: ['Images/Map/MapBG.jpg', 1, 1],
  MAP_PHOTO1: ['Images/Map/PhotoEP01.png', 1, 1], MAP_PHOTO2: ['Images/Map/PhotoEP02.png', 1, 1],
  MAP_PHOTO3: ['Images/Map/PhotoEP03.png', 1, 1], MAP_PHOTO4: ['Images/Map/PhotoEP04.png', 1, 1],
  MAP_PHOTO5: ['Images/Map/PhotoEP05.png', 1, 1],
  MAP_PORTAL: ['Images/Map/PhotoPortal.png', 1, 1],
  MAP_PHOTOMASK: ['Images/Map/MapPhotoMask.png', 1, 1],
  MAP_SPHERE: ['Images/Map/MapSphere.png', 1, 1],
  MAP_SPHEREBG1: ['Images/Map/SphereBG_01.png', 1, 1], MAP_SPHEREBG2: ['Images/Map/SphereBG_02.png', 1, 1],
  MAP_SPHEREBG3: ['Images/Map/SphereBG_03.png', 1, 1], MAP_SPHEREBG4: ['Images/Map/SphereBG_04.png', 1, 1],
  MAP_SPHEREBG5: ['Images/Map/SphereBG_05.png', 1, 1],
  MAP_FLAME: ['Images/Map/FlameMap.png', 1, 2],
  MAP_PLAY_N: ['Images/Map/MapPlayButton_Normal.png', 1, 1],
  MAP_PLAY_O: ['Images/Map/MapPlayButton_Over.png', 1, 1],
  MAP_PLAY_D: ['Images/Map/MapPlayButton_Down.png', 1, 1],
  MAP_BACK: ['Images/Map/MapBackButton_Scroll.png', 1, 1],
  MAP_STAR: ['Images/Map/Star.png', 1, 1],
  MAP_BOTTLE: ['Images/Map/Botle.png', 1, 1],
});

// состояние карты по индексу сценария p (следующий невыполненный шаг)
function mapStateFor(p) {
  let stars = 0, bottles = 0, puzzles = 0;
  for (let i = 0; i < SCENARIO.length; i++) {
    const e = SCENARIO[i];
    if (i < p) {
      if (e.type === 'base') stars++;
      else if (e.type === 'hidden' && e.id < 6) bottles++;
    }
    if (i <= p && e.type === 'puzzle') puzzles++;
  }
  const ep = Math.min(puzzles, 4);
  return { stars, bottles, ep, ballLoc: Math.max(1, ep) };
}

// индексы сценария, соответствующие звёздам (уровни бара по порядку)
function mapStarScenario() {
  const out = [];
  for (let i = 0; i < SCENARIO.length; i++) if (SCENARIO[i].type === 'base') out.push(i);
  return out;
}

const mapEaseInOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

class MapScene {
  // fly: { kind: 'star'|'bottle', index } — только что полученная награда (анимация прилёта)
  constructor(app, fly) {
    this.app = app;
    this.t = 0;
    this.st = mapStateFor(app.progress);
    this.starScn = mapStarScenario();
    this.hover = -1;
    this.fly = null;

    // награды, которые уже на карте (без текущей прилетающей)
    this.nStars = this.st.stars;
    this.nBottles = this.st.bottles;
    if (fly) {
      if (fly.kind === 'star' && fly.index === this.nStars - 1) {
        this.nStars--;
        this.fly = this.makeFly('star', fly.index);
      } else if (fly.kind === 'bottle' && fly.index === this.nBottles - 1) {
        this.nBottles--;
        this.fly = this.makeFly('bottle', fly.index);
      }
    }

    // серые фото эпизодов (ColorMatrixFilter с яркостной матрицей)
    this.gray = [];
    for (let i = 0; i < 5; i++) {
      const s = Assets.spr('MAP_PHOTO' + (i + 1)); if (!s) { this.gray.push(null); continue; }
      const cv = document.createElement('canvas'); cv.width = s.w; cv.height = s.h;
      const c = cv.getContext('2d');
      try { c.filter = 'grayscale(1)'; } catch (e) {}
      c.drawImage(s.img, 0, 0);
      this.gray.push(cv);
    }

    this.playRect = { x: F(259), y: F(414), w: 215, h: 106 };
    this.backRect = { x: 0, y: F(402), w: 226, h: 125 };
    this.downIn = null;       // какая кнопка нажата
    this.done = false;
  }

  makeFly(kind, index) {
    const pos = kind === 'star' ? MAP_STARS[index] : MAP_BOTTLES[index];
    const ang = (kind === 'star' ? MAP_STAR_ANG[index] : MAP_BOTTLE_ANG[index]) * 180 / Math.PI;
    const s = Assets.spr(kind === 'star' ? 'MAP_STAR' : 'MAP_BOTTLE');
    return {
      kind, index, t: 0, ang, soundDone: false,
      x0: F(320), y0: F(250),
      x1: F(pos[0]) + (s ? s.w / 2 : 0), y1: F(pos[1]) + (s ? s.h / 2 : 0),
    };
  }

  flyState(f) {
    // alpha/scale: 0.8с линейно; позиция/поворот: 2.5с easeInOutQuad по кривой Безье (контроль: x0, y1)
    const a = clamp(f.t / 0.8, 0, 1);
    const k = mapEaseInOutQuad(clamp(f.t / 2.5, 0, 1));
    const u = 1 - k;
    return {
      alpha: a, scale: 0.1 + 0.9 * a,
      x: u * u * f.x0 + 2 * u * k * f.x0 + k * k * f.x1,
      y: u * u * f.y0 + 2 * u * k * f.y1 + k * k * f.y1,
      rot: (f.ang + 360) * k,
      done: f.t >= 2.5,
    };
  }

  update(dt) {
    this.t += dt;
    if (this.fly) {
      this.fly.t += dt;
      if (this.fly.t >= 2.5 && !this.fly.soundDone) { this.fly.soundDone = true; Sfx.play('UINewLevel'); }
      if (this.fly.t >= 2.5) {                    // прилёт завершён — награда встаёт на место
        if (this.fly.kind === 'star') this.nStars++; else this.nBottles++;
        this.fly = null;
      }
    }

    // наведение на звёзды (для переигровки)
    this.hover = -1;
    const mx = Input.x, my = Input.y;
    const st = Assets.spr('MAP_STAR');
    for (let i = 0; i < this.nStars; i++) {
      const cx = F(MAP_STARS[i][0]) + st.w / 2, cy = F(MAP_STARS[i][1]) + st.h / 2;
      if (Math.hypot(mx - cx, my - cy) < 20) this.hover = i;
    }
    if (typeof canvas !== 'undefined') {
      const overBtn = inRect(this.playRect, mx, my) || inRect(this.backRect, mx, my);
      Cursor.set((this.hover >= 0 || overBtn) ? 'pointer' : 'default');
    }

    if (Input.clicked) {
      Input.clicked = false;
      if (inRect(this.backRect, mx, my)) { Sfx.play('UIClick'); this.leave(); this.app.showTitle(); return; }
      if (inRect(this.playRect, mx, my)) { Sfx.play('UIClick'); this.leave(); this.app.startLevel(this.app.progress); return; }
      if (this.hover >= 0) {
        Sfx.play('UIClick');
        const idx = this.starScn[this.hover];
        this.leave();
        this.app.startLevel(idx);
      }
    }
  }

  onKey(key) {
    if (key === 'Escape') { this.leave(); this.app.showTitle(); }
  }

  leave() { Cursor.set('default'); }

  // мерцание свечи (аналог flame_iteration): 3 слоя, цикл 0.29с
  flameAlpha() {
    const tri = (t, dur, low) => (t < 0 || t >= dur) ? 1 : (t < dur / 2 ? 1 - (1 - low) * (t / (dur / 2)) : low + (1 - low) * ((t - dur / 2) / (dur / 2)));
    const m = this.t % 0.29;
    return {
      a0: tri(m, 0.16, 0.3),
      a2: m < 0.16 ? tri(m, 0.16, 0.8) : tri(m - 0.16, 0.13, 0.8),
      a1: tri(m - 0.16, 0.13, 0.3),
    };
  }

  draw(ctx) {
    const bg = Assets.spr('MAP_BG');
    if (bg) ctx.drawImage(bg.img, 0, 0, W, H);

    // шар с локацией
    const sb = Assets.spr('MAP_SPHEREBG' + this.st.ballLoc);
    if (sb) ctx.drawImage(sb.img, F(123), F(151));
    const sp = Assets.spr('MAP_SPHERE');
    if (sp) ctx.drawImage(sp.img, F(123), F(151));

    // фото эпизодов: пройденные — цветные, будущие — серые, текущий — вихрь портала
    for (let i = 0; i < 5; i++) {
      const x = F(MAP_PHOTOS[i][0]), y = F(MAP_PHOTOS[i][1]);
      if (i === this.st.ep) {
        const po = Assets.spr('MAP_PORTAL'); if (po) ctx.drawImage(po.img, x, y);
        continue;
      }
      if (i < this.st.ep) { const s = Assets.spr('MAP_PHOTO' + (i + 1)); if (s) ctx.drawImage(s.img, x, y); }
      else if (this.gray[i]) ctx.drawImage(this.gray[i], x, y);
    }
    const pm = Assets.spr('MAP_PHOTOMASK');
    if (pm) ctx.drawImage(pm.img, 0, 0);

    // свеча
    const fl = Assets.spr('MAP_FLAME'), fo = Assets.spr('FLAME_BIG');
    if (fl) {
      const fa = this.flameAlpha();
      const cx = F(550), cy = F(176.25);
      ctx.save();
      ctx.globalAlpha = fa.a0;
      ctx.drawImage(fl.img, 0, 0, fl.fw, fl.fh, cx - fl.fw / 2, cy - fl.fh / 2, fl.fw, fl.fh);
      ctx.globalAlpha = fa.a1;
      ctx.drawImage(fl.img, 0, fl.fh, fl.fw, fl.fh, cx - fl.fw / 2, cy - fl.fh / 2, fl.fw, fl.fh);
      ctx.globalAlpha = fa.a2;
      if (fo) ctx.drawImage(fo.img, cx - fo.w / 2, cy - fo.h / 2);
      ctx.restore();
    }

    // кнопки
    this.drawPlay(ctx);
    this.drawBack(ctx);

    // звёзды и бутылки
    const st = Assets.spr('MAP_STAR'), bt = Assets.spr('MAP_BOTTLE');
    for (let i = 0; i < this.nStars; i++) {
      this.drawItem(ctx, st, F(MAP_STARS[i][0]) + st.w / 2, F(MAP_STARS[i][1]) + st.h / 2, MAP_STAR_ANG[i] * 180 / Math.PI, 1, 1, i === this.hover);
    }
    for (let i = 0; i < this.nBottles; i++) {
      this.drawItem(ctx, bt, F(MAP_BOTTLES[i][0]) + bt.w / 2, F(MAP_BOTTLES[i][1]) + bt.h / 2, MAP_BOTTLE_ANG[i] * 180 / Math.PI, 1, 1, false);
    }
    if (this.fly) {
      const s = this.flyState(this.fly);
      this.drawItem(ctx, this.fly.kind === 'star' ? st : bt, s.x, s.y, s.rot, s.scale, s.alpha, false);
    }

    // подсказка по звезде
    if (this.hover >= 0) {
      const n = this.starScn[this.hover];
      const num = this.hover + 1;
      const done = Save.results()[n];
      const label = 'Уровень ' + num + (done && done.expert ? '  ★' : '') + '  — переиграть';
      const tx = clamp(Input.x, 150, W - 150), ty = Input.y + 36;
      ctx.save();
      ctx.font = 'bold 17px Georgia, serif';
      const w = ctx.measureText(label).width + 24;
      ctx.fillStyle = 'rgba(24,12,38,0.88)';
      roundRect(ctx, tx - w / 2, ty - 16, w, 32, 8); ctx.fill();
      ctx.strokeStyle = 'rgba(230,200,255,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.restore();
      text(ctx, label, tx, ty + 1, { size: 17, color: '#f0e6ff', stroke: null });
    }
  }

  drawItem(ctx, s, cx, cy, rotDeg, scale, alpha, glow) {
    if (!s) return;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotDeg * Math.PI / 180);
    ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;
    if (glow) { ctx.shadowColor = '#fff4a0'; ctx.shadowBlur = 18; }
    ctx.drawImage(s.img, -s.w / 2, -s.h / 2);
    ctx.restore();
  }

  drawPlay(ctx) {
    const r = this.playRect, hov = inRect(r, Input.x, Input.y);
    const id = (Input.down && hov) ? 'MAP_PLAY_D' : (hov ? 'MAP_PLAY_O' : 'MAP_PLAY_N');
    drawSpr(ctx, id, r.x, r.y, { anchor: 'tl' });
    text(ctx, 'ИГРАТЬ', r.x + r.w / 2 - F(3), r.y + r.h / 2 + F(14) - 6, { size: 26, color: '#f0e863', stroke: 'rgba(40,16,4,0.9)', strokeW: 4 });
  }

  drawBack(ctx) {
    const r = this.backRect, hov = inRect(r, Input.x, Input.y);
    drawSpr(ctx, 'MAP_BACK', r.x, r.y, { anchor: 'tl' });
    // свиток — треугольный угол: тело пергамента внизу слева, верхний край со свёрнутой кромкой идёт по диагонали;
    // подпись ставим в нижнюю часть тела (центр ≈ x+66, y+100), иначе она наезжает на кромку
    text(ctx, 'НАЗАД', r.x + 66, r.y + 100, { size: 24, color: hov ? '#f0e863' : '#300f00', stroke: hov ? 'rgba(40,16,4,0.9)' : null, strokeW: 3 });
  }
}

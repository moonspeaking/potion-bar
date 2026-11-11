// ===== Сцена бара — портированная оригинальная Flash-механика =====
// Восстановлено по декомпилированному PotionBar.swf:
// PotionBarBaseGame / PotionBarBottle / PotionBarClient / PotionBarBurner /
// PotionBarScene / PotionBarTimeIndicator / PotionBarDataBase.
// Координаты — Flash-единицы (640×480) через F() = ×1.6.
'use strict';

function fpt(p) { return { x: p[0] * S, y: p[1] * S }; }

// Кадровый спрайт (нарезка по вертикали), якорь — левый верх
function drawFrame(ctx, id, frame, x, y, opts = {}) {
  const s = Assets.spr(id); if (!s) return;
  const w = opts.w !== undefined ? opts.w : s.fw;
  const h = opts.h !== undefined ? opts.h : s.fh;
  const row = Math.floor(frame / s.cols) % s.rows;
  const col = frame % s.cols;
  ctx.save();
  if (opts.alpha !== undefined) ctx.globalAlpha *= opts.alpha;
  ctx.drawImage(s.img, col * s.fw, row * s.fh, s.fw, s.fh, x, y, w, h);
  ctx.restore();
}

// буфер для обрезки поверхности жидкости по силуэту (один на все бутылки)
const LiquidMask = {
  c: null, g: null,
  get(w, h) {
    if (!this.c) { this.c = document.createElement('canvas'); this.g = this.c.getContext('2d'); }
    if (this.c.width !== w || this.c.height !== h) { this.c.width = w; this.c.height = h; }
    return this;
  },
};

// Тонированная копия спрайта (кэш) — лампочки, поверхность жидкости
const TintCache = {};
function tintedSprite(id, color) {
  const key = id + '|' + color;
  if (TintCache[key]) return TintCache[key];
  const s = Assets.spr(id); if (!s) return null;
  const c = document.createElement('canvas');
  c.width = s.img.width; c.height = s.img.height;
  const g = c.getContext('2d');
  g.drawImage(s.img, 0, 0);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(s.img, 0, 0);
  TintCache[key] = c;
  return c;
}

// Паузируемые таймеры сцены
class TimerQ {
  constructor() { this.list = []; }
  after(t, fn) { this.list.push({ t, fn }); }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const tm = this.list[i];
      tm.t -= dt;
      if (tm.t <= 0) { this.list.splice(i, 1); tm.fn(); }
    }
  }
  clear() { this.list.length = 0; }
}

// Плавные перемещения (возврат бутылки в подставку)
class MoveQ {
  constructor() { this.list = []; }
  to(obj, tx, ty, dur, done) {
    this.list.push({ obj, sx: obj.x, sy: obj.y, tx, ty, t: 0, dur, done });
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const m = this.list[i];
      m.t += dt;
      const k = clamp(m.t / m.dur, 0, 1);
      m.obj.x = lerp(m.sx, m.tx, k);
      m.obj.y = lerp(m.sy, m.ty, k);
      if (k >= 1) { this.list.splice(i, 1); if (m.done) m.done(); }
    }
  }
  clear() { this.list.length = 0; }
}

// ---------- Картинки специй (в бутылке и облаке заказа) ----------
function spiceImages(spiceID) {
  const d = SPICE_IMAGES[spiceID - 1];
  if (d[0] === 'POWDERS') {
    const row = spiceID === 4 ? 0 : (spiceID === 9 ? 1 : 2);
    return [{ kind: 'grpowder', row }];
  }
  if (d[0] === 'SM_POWDER') {
    const grp = spiceID === 5 ? 1 : (spiceID === 10 ? 2 : 3);
    const parts = SM_POWDER_PARTS.filter(p => p[0] === grp).map((p, i) => ({ spr: 'ING_SM' + grp + (i + 1), x: p[1], y: p[2] }));
    return [{ kind: 'parts', parts }];
  }
  return [{ kind: 'frame', spr: d[0], frame: d[1] }];
}

function drawSpiceImages(ctx, sid, x, y) {
  for (const im of spiceImages(sid)) {
    if (im.kind === 'frame') {
      drawFrame(ctx, im.spr, im.frame, x, y);
    } else if (im.kind === 'parts') {
      for (const p of im.parts) drawFrame(ctx, p.spr, 0, x + F(p.x), y + F(p.y));
    } else { // grpowder — вырезки из общего листа
      const s = Assets.spr('ING_POWD'); if (!s) continue;
      for (const r of GR_POWDER_PARTS) {
        ctx.drawImage(s.img, F(r[0]), s.fh * im.row + F(r[1]), F(r[2]), F(r[3]),
          x + F(r[0]), y + F(r[1]), F(r[2]), F(r[3]));
      }
    }
  }
}

// ============================================================
//  Бутылка (PotionBarBottle)
//  step: 0 в подставке, 1 в руке, 2 залита, 3 кипячёная,
//        4 со специями, 5 кипячёная со специями, 6 испорчена, 7 деньги
// ============================================================
class PBBottle {
  constructor(scene, rackIndex) {
    this.scene = scene;
    this.rackIndex = rackIndex;
    this.type = 1;
    this.step = 0;
    this.ingredientID = -1;
    this.spicies = [];
    this.decor = -1;
    this.burner = null;
    this.client = null;
    this.progress = 0;        // «часы» перегрева, юниты
    this.startPoint = 0;
    this.boiled = false;
    this.burnStarted = false;
    this.corkRock = 0;        // >0 — дрожит
    this.corkFlying = 0;      // 0..1 — вылет пробки
    this.strawAlpha = 0;
    this.drinkT = 0;          // 0..1 выпивание
    this.spiceDrift = null;   // {sid:{tx,ty,cx}}
    this.hovered = false;
    this.hitActive = true;
    this.visible = true;
    this.alpha = 1;
    this.fadeT = 1;
    this.home = fpt(POS.bottles[rackIndex]);
    this.x = this.home.x; this.y = this.home.y;
  }

  contentRect() {
    return { x: this.x + F(28), y: this.y + F(28), w: F(95), h: F(110) };
  }
  // для «умного» хит-теста перетаскивания — вся ячейка спрайта (alpha bounds)
  dropRect() {
    const s = Assets.spr('GLASS0');
    return { x: this.x, y: this.y, w: s ? s.fw : F(140), h: s ? s.fh : F(160) };
  }

  fill(ingID) {
    this.ingredientID = ingID;
    this.step = 2;
  }
  addSpice(spiceID) {
    this.spicies.push(spiceID);
    this.boiled = false;
    this.step = 4;
    this.corkRock = 0;
    this.corkFlying = 0;   // пробка возвращается (addSpicies в оригинале)
    if (!this.spiceDrift) this.spiceDrift = {};
  }
  putOnBurner(b) {
    this.burner = b;
    this.tickAcc = 0;
    b.bottle = this;
    b.burningOn = true;
    if (this.step === 2 || this.step === 4) {
      if (!this.burnStarted) this.startPoint = this.progress;
    } else {
      this.startPoint = this.progress;
    }
  }
  takeOffBurner() {
    if (this.burner) {
      this.tickAcc = 0;
      this.burner.bottle = null;
      this.burner.burningOn = false;
      this.burner.setProgress(0);
      this.burner = null;
    }
  }
  clearAll() {
    this.step = 0;
    this.ingredientID = -1;
    this.spicies = [];
    this.decor = -1;
    this.progress = 0;
    this.startPoint = 0;
    this.boiled = false;
    this.burnStarted = false;
    this.corkRock = 0;
    this.corkFlying = 0;
    this.strawAlpha = 0;
    this.drinkT = 0;
    this.spiceDrift = null;
    this.client = null;
    this.takeOffBurner();
    this.visible = true;
    this.hitActive = true;
  }

  // boil_step оригинала: тик 500 мс, step_value = 200
  boilStep() {
    const SV = TIMING.progressRate * 0.5;
    if (this.step === 4) this.startPoint -= SV;     // со специями часы перегрева стоят, греется «прогрев»
    else this.progress += SV;
    this.burner.setProgress(this.progress / TIMING.overheatUnits);
    if (this.step === 2 || this.step === 4) {
      this.burnStarted = true;
      if (this.corkRock === 0 && this.corkFlying === 0 && this.progress >= TIMING.rockUnits + this.startPoint) {
        this.corkRock = 0.0001;
      }
      if (!this.boiled && this.progress >= TIMING.boilUnits + this.startPoint) {
        this.boiled = true;
        this.burnStarted = false;
        this.step = (this.step === 2) ? 3 : 5;
        this.corkFlying = 0.0001;
        this.corkRock = 0;
        this.scene.sfx('GamePotionReady');
      }
    }
    if (this.progress >= TIMING.overheatUnits) {
      if (this.scene.tutorialActive) this.progress -= SV;      // в обучении зелье не портится
      else {
        this.scene.sfx('GamePotionGoBad');
        this.step = 6;     // бутылка остаётся на горелке, пока игрок её не снимет
      }
    }
  }

  // cool_step оригинала: только step > 2, пол — boil_time; при burn_started startPoint уменьшается синхронно
  coolStep() {
    if (!(this.step > 2 && this.step < 6)) return;
    const SV = TIMING.coolRate * 0.5;
    if (this.progress > TIMING.boilUnits) {
      if (this.burnStarted) this.startPoint -= SV;
      this.progress -= SV;
    } else {
      if (this.burnStarted) this.startPoint += TIMING.boilUnits - this.progress;
      this.progress = TIMING.boilUnits;
    }
  }

  update(dt) {
    if (this.fadeT < 1) this.fadeT = Math.min(1, this.fadeT + dt / 0.2);
    // выпивание
    if (this.drinkT > 0 && this.drinkT < 1) {
      this.drinkT = Math.min(1, this.drinkT + dt / TIMING.drinkPoseTime);
      if (this.spiceDrift) {
        for (const sid in this.spiceDrift) {
          const d = this.spiceDrift[sid];
          d.cx = Math.min(1, (d.cx || 0) + dt / 1.5);
        }
      }
    }
    // кипячение и остывание — дискретными тиками по 500 мс, как setInterval в оригинале
    // (boil_step / cool_step; таймер перезапускается при постановке/снятии с горелки)
    this.tickAcc = (this.tickAcc || 0) + dt;
    while (this.tickAcc >= 0.5) {
      this.tickAcc -= 0.5;
      if (this.burner) { if (this.step >= 2 && this.step <= 5) this.boilStep(); }
      else this.coolStep();
    }
    // пробка
    if (this.corkRock > 0 && this.corkFlying === 0) this.corkRock += dt;
    if (this.corkFlying > 0 && this.corkFlying < 1) {
      this.corkFlying = Math.min(1, this.corkFlying + dt / 0.15);
      if (this.corkFlying >= 1) this.corkRock = 0;
    }
    // трубочка гаснет после выпивания
    if (this.strawAlpha > 0 && this.drinkT >= 1) {
      this.strawAlpha = Math.max(0, this.strawAlpha - dt / 4);
    }
  }

  draw(ctx) {
    if (!this.visible) return;
    const x = this.x, y = this.y;
    ctx.save();
    ctx.globalAlpha *= this.alpha * this.fadeT;
    const glass = 'GLASS0';

    if (this.step === 0) {
      drawFrame(ctx, glass, 0, x, y);
      if (this.hovered) drawFrame(ctx, 'GLOW_RACK0', 0, x, y);
    } else {
      drawFrame(ctx, glass, 2, x, y);                       // задняя половина
      if (this.ingredientID >= 0) this.drawLiquid(ctx, x, y);
      if (this.hovered) drawFrame(ctx, 'GLOW_IN0', 0, x, y);
      this.drawCork(ctx, x, y);
      if (this.spicies.length) {
        ctx.save();
        ctx.globalAlpha *= 0.85;
        for (const sid of this.spicies) {
          const d = this.spiceDrift && this.spiceDrift[sid];
          const off = d ? { x: F(d.tx) * (d.cx || 0), y: F(d.ty) * (d.cx || 0) } : { x: 0, y: 0 };
          drawSpiceImages(ctx, sid, x + off.x, y + off.y);
        }
        ctx.restore();
      }
      drawFrame(ctx, glass, 1, x, y);                       // передняя половина
      if (this.decor !== -1) drawFrame(ctx, 'DECOR_GLASS', this.decor - 1, x + F(3), y - F(11));
      if (this.step === 7) {
        drawFrame(ctx, 'MONEY', 0, x + F(9), y + F(62));
        if (this.hovered) drawFrame(ctx, 'HLTMONEY', 0, x + F(9), y + F(62));
      }
    }
    ctx.restore();
  }

  drawLiquid(ctx, x, y) {
    const lx = x + F(POS.liquidCorrect[0]), ly = y + F(POS.liquidCorrect[1]);
    const fw = F(96), fh = F(120);
    if (this.step === 6) {
      ctx.save();
      ctx.globalAlpha *= 0.95;
      drawFrame(ctx, 'MASK_SUBSTANCE', 0, lx, ly);
      ctx.restore();
      return;
    }
    let topF = F(30);
    if (this.drinkT > 0) topF = F(30 + 41 * clamp(this.drinkT, 0, 1));
    ctx.save();
    ctx.beginPath();
    ctx.rect(lx, ly + topF, fw, fh - topF);
    ctx.clip();
    drawFrame(ctx, 'SUBSTANCES', this.ingredientID, lx, ly);
    ctx.restore();
    const surf = tintedSprite('SUBSTANCE_UP', LIQUID_COLORS[this.ingredientID]);
    if (surf && topF < F(70)) {
      // поверхность жидкости — эллипс; он шире горлышка колбы, поэтому обрезаем его по силуэту жидкости,
      // иначе «круг» торчит рядом с бутылкой
      const sw = F(83), sh = sw * (50 / 90);
      const m = LiquidMask.get(Math.ceil(fw), Math.ceil(fh));
      m.g.globalCompositeOperation = 'source-over';
      m.g.clearRect(0, 0, m.c.width, m.c.height);
      m.g.drawImage(surf, (fw - sw) / 2, topF - sh / 2, sw, sh);
      m.g.globalCompositeOperation = 'destination-in';
      drawFrame(m.g, 'SUBSTANCES', this.ingredientID, 0, 0);
      m.g.globalCompositeOperation = 'source-over';
      ctx.save();
      ctx.globalAlpha *= 0.9;
      ctx.drawImage(m.c, lx, ly);
      ctx.restore();
    }
  }

  drawCork(ctx, x, y) {
    const px = F(68.8), py = F(30.4);
    ctx.save();
    ctx.translate(x + px, y + py);
    if (this.corkRock > 0 && this.corkFlying === 0) ctx.rotate(Math.sin(this.corkRock * 14) * 0.17);
    let lift = 0, a = 1;
    if (this.corkFlying > 0) { lift = -F(10) * this.corkFlying; a = 1 - this.corkFlying; }
    ctx.globalAlpha *= a;
    if (this.strawAlpha > 0 && this.client) {
      ctx.globalAlpha *= this.strawAlpha;
      const sp = fpt(POS.strawChar[this.client.clientID - 1]);
      drawFrame(ctx, 'STRAW' + String(this.client.clientID).padStart(2, '0'), 0, sp.x - px, sp.y - py);
    } else if (this.step >= 2 && this.step <= 5) {
      drawFrame(ctx, 'CORK', 0, -px, -py + lift);
    }
    ctx.restore();
  }
}

// ============================================================
//  Горелка (PotionBarBurner)
// ============================================================
class Burner {
  constructor(scene, burnerID, loc) {
    this.scene = scene;
    this.burnerID = burnerID;
    this.type = 3;
    const st = BURNER_SETTINGS[loc - 1].slice(burnerID * 4, burnerID * 4 + 4);
    this.hit = { x: F(st[0][0]), y: F(st[0][1]), w: F(st[0][2]), h: F(st[0][3]) };
    this.glowPos = fpt(st[1]);
    this.flamePos = fpt(st[2]);
    this.bottlePos = fpt(st[3]);
    this.indPos = fpt(BURNER_INDICATOR[loc - 1][burnerID]);
    this.closedPos = fpt(BURNER_CLOSED_POS[loc - 1][burnerID]);
    this.closed = false;
    this.bottle = null;
    this.burningOn = false;
    this.indProgress = 0;
    this.hovered = false;
  }
  setProgress(p) { this.indProgress = clamp(p, 0, 1); }
  contentRect() { return this.hit; }
  draw(ctx) {
    if (this.closed) {
      drawFrame(ctx, 'BURNER_CLOSED', 0, this.closedPos.x, this.closedPos.y);
      return;
    }
    if (this.hovered) drawFrame(ctx, 'BURNER_GLOW', 0, this.glowPos.x, this.glowPos.y);
    if (this.burningOn) {
      const fr = Math.floor(performance.now() / 1000 * 12) % 7;
      drawFrame(ctx, 'FLAME', fr, this.flamePos.x, this.flamePos.y);
    }
    // индикатор: панель с лампочками видна всегда (indicator_layer в оригинале)
    const ix = this.indPos.x, iy = this.indPos.y;
    drawFrame(ctx, 'IND_BG', 0, ix, iy);
    drawFrame(ctx, 'IND_GREEN', 0, ix + F(8), iy + F(4));
    drawFrame(ctx, 'IND_RED', 0, ix + F(29), iy + F(4));
    const p = this.indProgress;
    if (p > 0) {
      const alerting = p >= 0.7 && p < 1;
      const blink = alerting ? (Math.floor(performance.now() / 300) % 2 === 0) : true;
      if (p >= 0.2) drawFrame(ctx, 'IND_GREEN_L', 0, ix + F(8), iy + F(3));
      if (p >= 0.7 && blink) drawFrame(ctx, 'IND_RED_L', 0, ix + F(27), iy + F(2));
      if (blink) {  // при предупреждении бар мигает вместе с лампочкой (alert)
        ctx.save();
        ctx.beginPath();
        ctx.rect(ix + F(10), iy, F(47) * p, F(45));
        ctx.clip();
        drawFrame(ctx, 'IND', 0, ix + F(10), iy);
        ctx.restore();
      }
    }
  }
}

// ============================================================
//  Специи / амулеты / декор / бутылки ингредиентов / раковина
// ============================================================
class SpiceItem {
  constructor(scene, positionID, spiceID) {
    this.scene = scene; this.type = 4;
    this.positionID = positionID; this.spiciesID = spiceID;
    const p = fpt(POS.spices[positionID]);
    this.x = p.x; this.y = p.y;
    this.home = { x: p.x, y: p.y };
    this.hovered = false;
    this.visible = spiceID !== -1;
    this.alpha = 1;
  }
  contentRect() {
    return { x: this.x + F(24), y: this.y + F(54), w: F(73), h: F(89) };
  }
  draw(ctx) {
    if (!this.visible) return;
    ctx.save();
    ctx.globalAlpha *= this.alpha;
    drawFrame(ctx, 'ROPE' + (this.positionID + 1), 0, this.x, this.y);
    drawFrame(ctx, 'SPICE' + String(this.spiciesID).padStart(2, '0'), 0, this.x, this.y);
    if (this.hovered) drawFrame(ctx, 'SPICE' + String(this.spiciesID).padStart(2, '0'), 1, this.x, this.y);
    ctx.restore();
  }
}

class AmuletItem {
  constructor(scene, positionID, amuletID) {
    this.scene = scene; this.type = 6;
    this.positionID = positionID; this.amuletID = amuletID;
    const p = fpt(POS.amulets[positionID]);
    this.x = p.x; this.y = p.y;
    this.home = { x: p.x, y: p.y };
    this.hovered = false;
    this.visible = true;
    this.alpha = 1;
  }
  contentRect() {
    return { x: this.x + F(11), y: this.y + F(35), w: F(65), h: F(77) };
  }
  draw(ctx) {
    if (!this.visible) return;
    ctx.save();
    ctx.globalAlpha *= this.alpha;
    drawFrame(ctx, 'AMULET_ROPE' + (this.positionID + 1), 0, this.x, this.y);
    drawFrame(ctx, 'AMULET' + this.amuletID, 0, this.x, this.y);
    if (this.hovered) drawFrame(ctx, 'AMULET' + this.amuletID, 1, this.x, this.y);
    ctx.restore();
  }
}

class DecorItem {
  constructor(scene, positionID, decorID) {
    this.scene = scene; this.type = 5;
    this.positionID = positionID; this.decorID = decorID;
    const p = fpt(POS.decors[positionID]);
    this.x = p.x; this.y = p.y;
    this.hovered = false;
  }
  contentRect() {
    return { x: this.x + F(13), y: this.y + F(29), w: F(87), h: F(55) };
  }
  draw(ctx) {
    drawFrame(ctx, 'DECOR' + this.decorID, 0, this.x, this.y);
    if (this.hovered) drawFrame(ctx, 'DECOR' + this.decorID, 1, this.x, this.y);
  }
}

class IngBottle {
  constructor(scene, positionID, slotID) {
    this.scene = scene; this.type = 2;
    this.positionID = positionID; this.ingredientID = slotID;
    const p = fpt([POS.ingredientBottles[positionID][1], POS.ingredientBottles[positionID][2]]);
    this.x = p.x; this.y = p.y;
    this.hovered = false;
    this.spr = 'IBOTTLE' + (6 - slotID);
  }
  contentRect() {
    return { x: this.x + F(25), y: this.y + F(23), w: F(131), h: F(142) };
  }
  draw(ctx) {
    drawFrame(ctx, this.spr, 0, this.x, this.y);
    if (this.hovered) drawFrame(ctx, this.spr, 1, this.x, this.y);
  }
}

class SinkObj {
  constructor(scene, loc) {
    this.scene = scene; this.type = 0;
    const p = fpt(POS.sink[loc - 1]);
    this.x = p.x; this.y = p.y;
    this.hovered = false;
    this.spr = 'SINK' + loc;
  }
  contentRect() {
    return { x: this.x + F(22), y: this.y + F(10), w: F(106), h: F(73) };
  }
  draw(ctx) {
    // раковина «вшита» в фон; показываем только подсветку
    if (this.hovered && ((this.scene.dragObj && this.scene.dragObj.type === 1) || (this.scene.tutorialActive && this.scene.tutBlink && this.scene.tutBlink.has(this)))) {
      drawFrame(ctx, this.spr, 0, this.x, this.y);
    }
  }
}

// ============================================================
//  Клиент (PotionBarClient)
// ============================================================
class ClientObj {
  constructor(scene) {
    this.scene = scene;
    this.type = 7;
    this.clientID = -1;
    this.positionID = 0;
    this.orders = null;
    this.tip = 0;
    this.step = 0;            // 0 обычный, 1 ждёт амулет
    this.script = null;
    this.scriptIndex = 0;
    this.scriptT = -1;
    this.pose = 0; this.posePrev = 0; this.poseFade = 1;
    this.smileFrame = 0; this.smileScale = 1; this.smileVisible = false;
    this.cloudAlpha = 0;
    this.bottleVisible = true;
    this.amuletShown = false;
    this.charAlpha = 0;
    this.hidden = false;
    this.x = 0; this.y = 0;
    this.active = false;
    this.hitActive = false;
    this.hovered = false;
  }

  init(positionID, clientID, orders) {
    this.positionID = positionID;
    this.clientID = clientID;
    this.orders = orders;
    this.active = true;
    this.hitActive = true;
    this.hidden = false;
    this.step = 0;
    this.pose = 0; this.posePrev = 0; this.poseFade = 1;
    this.smileFrame = 0; this.smileVisible = true; this.smileScale = 1;
    this.cloudAlpha = 1; this.bottleVisible = true; this.amuletShown = false;
    this.script = 'main';
    this.scriptIndex = 0;
    this.scriptT = 0;
    // терпение этого гостя: случайное из таблицы уровня (как в exe: rand(мин, макс) × 100 тактов), этапы сценария растягиваются пропорционально
    const row = PATIENCE_TABLE[Math.min(PATIENCE_TABLE.length, Math.max(1, this.scene.storyLevel())) - 1];
    const total = (row[0] + Math.random() * (row[1] - row[0])) * 100 / LOGIC_FPS;
    this.patienceK = total / TIMING.clientScript.reduce((a, b) => a + b, 0);
    const p = fpt(POS.clients[positionID]);
    this.x = p.x; this.y = p.y;
    this.charAlpha = 0;
    this.scene.timers.after(0.9, () => { if (this.active && this.clientID === clientID) this.scene.guestSay(this, 'hello'); });
  }

  contentRect() {
    if (!this.active || this.clientID === -1) return null;
    const off = fpt(POS.clientChar[this.clientID - 1]);
    const cx = this.x + off.x + F(15), cy = this.y + off.y + F(25);
    const cloud = fpt(POS.bubble);
    const x0 = Math.min(cx, this.x + cloud.x), y0 = Math.min(cy, this.y + cloud.y);
    const x1 = Math.max(cx + F(99), this.x + cloud.x + F(115));
    const y1 = Math.max(cy + F(135), this.y + cloud.y + F(160));
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  stepDuration() {
    const k = this.patienceK || 1;
    if (this.script === 'main') return TIMING.clientScript[this.scriptIndex] * k;
    if (this.script === 'drink') return [0.001, 0.001, TIMING.drinkPoseTime, 0.001][this.scriptIndex] || 0.001;
    if (this.script === 'amulet') return TIMING.amuletScript[this.scriptIndex] * k;
    if (this.script === 'amuletGot') return [0.001, 0.001, TIMING.amuletGotTime][this.scriptIndex] || 0.001;
    return 1;
  }

  update(dt) {
    if (!this.active) return;
    if (this.charAlpha < 1) this.charAlpha = Math.min(1, this.charAlpha + dt / 0.2);
    if (this.poseFade < 1) this.poseFade = Math.min(1, this.poseFade + dt / 0.6);
    if (this.smileScale < 1) this.smileScale = Math.min(1, this.smileScale + dt / 0.2);
    const frozen = this.scene.tutorialActive && (this.script === 'main' || this.script === 'amulet');   // обучение: терпение не тратится
    if (this.script && this.scriptT >= 0 && !frozen) {
      this.scriptT += dt;
      if (this.scriptT >= this.stepDuration()) {
        this.scriptT = 0;
        this.runScriptStep();
      }
    }
  }

  runScriptStep() {
    const i = this.scriptIndex;
    if (this.script === 'main') {
      const acts = [
        () => this.setSmile(1), () => this.setPose(1),
        () => this.setSmile(2), () => this.setPose(0),
        () => { this.setSmile(3); this.scene.guestSay(this, 'changed'); }, () => this.setPose(2),
        () => this.setPose(0),  () => this.setSmile(4),
        () => this.setPose(2),  () => this.scene.clientLeftUnserved(this),
      ];
      if (acts[i]) acts[i]();
      this.scriptIndex++;
      if (this.scriptIndex >= TIMING.clientScript.length) this.scriptT = -1;
    } else if (this.script === 'drink') {
      if (i === 0) { this.setPose(4); this.scriptIndex++; }
      else if (i === 1) { this.smileVisible = false; this.scriptIndex++; }
      else if (i === 2) { this.setPose(3); this.scriptIndex++; }
      else if (i === 3) {
        this.scriptT = -1;
        const bottle = this.scene.bottleOfClient(this);
        if (this.orders.amuletID) this.scene.clientWantsAmulet(this, bottle);
        else this.scene.bottleToMoney(bottle);
      }
    } else if (this.script === 'amulet') {
      const acts = [
        () => this.setSmile(0), () => this.setPose(0),
        () => this.setSmile(1), () => this.setPose(1),
        () => this.setSmile(2), () => this.setPose(0),
        () => this.setSmile(3), () => this.setPose(2),
        () => this.setPose(0),  () => this.setSmile(4),
        () => this.setPose(2),  () => this.scene.clientLeftAngry(this),
      ];
      if (acts[i]) acts[i]();
      this.scriptIndex++;
      if (this.scriptIndex >= TIMING.amuletScript.length) this.scriptT = -1;
    } else if (this.script === 'amuletGot') {
      if (i === 0) { this.smileVisible = false; this.scriptIndex++; }
      else if (i === 1) { this.setPose(3); this.scriptIndex++; }
      else if (i === 2) {
        this.scriptT = -1;
        this.scene.clientAmuletServed(this);
      }
    }
  }

  setPose(f) { if (this.pose !== f) { this.posePrev = this.pose; this.pose = f; this.poseFade = 0; } }
  setSmile(f) { if (this.smileFrame !== f) { this.smileFrame = f; this.smileScale = 0.2; this.smileVisible = true; } }

  drink() {
    this.tip = (TIMING.clientScript.length - this.scriptIndex) / TIMING.clientScript.length;
    this.script = 'drink';
    this.scriptIndex = 0;
    this.scriptT = 0;
    this.cloudAlpha = 0;
    this.bottleVisible = false;
    this.scene.sfx('ClientDrink');
    this.scene.guestSay(this, 'succeed');
  }

  showAmulet() {
    this.scene.guestSay(this, 'amulet');
    this.step = 1;
    this.amuletShown = true;
    this.cloudAlpha = 1;
    this.bottleVisible = false;
    this.script = 'amulet';
    this.scriptIndex = 0;
    this.scriptT = 0;
  }
  amuletGot() {
    this.step = 0;
    this.amuletShown = false;
    this.cloudAlpha = 0;
    this.script = 'amuletGot';
    this.scriptIndex = 0;
    this.scriptT = 0;
  }
  clearClient() {
    this.active = false;
    this.hitActive = false;
    this.clientID = -1;
    this.orders = null;
    this.script = null;
    this.scriptT = -1;
    this.charAlpha = 0;
    this.smileVisible = false;
    this.cloudAlpha = 0;
    this.amuletShown = false;
    this.hidden = true;
    this.step = 0;
  }

  draw(ctx) {
    if (!this.active || this.clientID === -1 || this.hidden) return;
    const off = fpt(POS.clientChar[this.clientID - 1]);
    ctx.save();
    ctx.globalAlpha *= this.charAlpha;
    if (this.poseFade < 1) {
      ctx.globalAlpha = this.charAlpha * (1 - this.poseFade);
      drawFrame(ctx, 'CHAR' + String(this.clientID).padStart(2, '0'), this.posePrev, this.x + off.x, this.y + off.y);
      ctx.globalAlpha = this.charAlpha * this.poseFade;
    }
    drawFrame(ctx, 'CHAR' + String(this.clientID).padStart(2, '0'), this.pose, this.x + off.x, this.y + off.y);
    ctx.restore();
    if (this.hovered && this.hitActive) {
      drawFrame(ctx, 'HLTCLOUD', 0, this.x + F(POS.bubble[0]), this.y + F(POS.bubble[1]));
    }
    if (this.smileVisible) {
      const cx = this.x + F(66.5), cy = this.y + F(31.5);
      const sz = F(69) * this.smileScale;
      ctx.save();
      ctx.globalAlpha *= this.charAlpha;
      drawFrame(ctx, 'SMILE', this.smileFrame, cx - sz / 2, cy - sz / 2, { w: sz, h: sz });
      ctx.restore();
    }
    if (this.cloudAlpha > 0 && this.orders) {
      ctx.save();
      ctx.globalAlpha *= this.cloudAlpha * this.charAlpha;
      drawFrame(ctx, 'CLOUD', 0, this.x + F(POS.bubble[0]), this.y + F(POS.bubble[1]));
      if (this.bottleVisible) {
        const bx = this.x + F(POS.bottleOnClient[0]), by = this.y + F(POS.bottleOnClient[1]);
        drawFrame(ctx, 'GLASS4', 2, bx, by);
        const lx = bx + F(POS.liquidCorrect[0]), ly = by + F(POS.liquidCorrect[1]);
        ctx.save();
        ctx.beginPath();
        ctx.rect(lx, ly + F(30), F(96), F(90));
        ctx.clip();
        drawFrame(ctx, 'SUBSTANCES', this.orders.ingredientID, lx, ly);
        ctx.restore();
        for (const sid of this.orders.spiciesID) drawSpiceImages(ctx, sid, bx, by);
        drawFrame(ctx, 'GLASS4', 1, bx, by);
        if (this.orders.decorID !== -1) drawFrame(ctx, 'DECOR_GLASS', this.orders.decorID - 1, bx + F(3), by - F(11));
      }
      ctx.restore();
    }
    if (this.amuletShown && this.orders && this.orders.amuletID) {
      const p = fpt(POS.amuletOnClient[this.orders.amuletID - 1]);
      drawFrame(ctx, 'AMULET' + this.orders.amuletID, 0, this.x + p.x, this.y + p.y);
    }
  }
}

// ============================================================
//  Сцена бара
// ============================================================
class BarScene {
  constructor(app, scenarioIdx) {
    this.app = app;
    this.scenarioIdx = scenarioIdx;
    const entry = SCENARIO[scenarioIdx];
    this.entry = entry;
    this.levelId = entry.id;
    this.loc = entry.loc;
    const li = this.levelId - 1;
    this.level = {
      time: LVL_TIME[li], goal: LVL_GOAL[li], goalExpert: LVL_GOAL_EXPERT[li],
      clients: LVL_CLIENTS[li],
    };

    this.timers = new TimerQ();
    this.moves = new MoveQ();
    this.dragObj = null;
    this.dragOffset = { x: 0, y: 0 };
    this.money = 0;
    this.moneyPending = 0;
    this.moneyTick = 0;
    this.coins = [];
    this.masterHit = false;
    this.expertHit = false;
    this.state = 'intro';        // intro | playing | ending | result
    this.timeOff = false;
    this.time = this.level.time;
    this.arrowAngle = -30;
    this.lampsLit = 0;
    this.timeRedPlayed = false;
    this.spawnGate = true;
    this.spawnIntervalT = 0;
    this.paused = false;
    this.endText = '';
    this.catFrame = 0;
    this.doorFrame = 0;
    this.padAlpha = 0;
    this.over = null;

    this.clients = [];
    for (let i = 0; i < 4; i++) this.clients.push(new ClientObj(this));
    this.bottles = [];
    for (let i = 0; i < 4; i++) this.bottles.push(new PBBottle(this, i));
    this.ingBottles = [];
    this.burners = [];
    this.spices = [];
    this.decors = [];
    this.amulets = [];
    this.sink = new SinkObj(this, this.loc);
    this.applyLevelObjects();
    // z-порядок как в оригинале
    this.common = [
      ...this.bottles, ...this.ingBottles, ...this.burners,
      ...this.spices, ...this.decors, ...this.amulets,
      ...this.clients, this.sink,
    ];
    this.hoveredObj = null;

    this.sfx('UILevelBegin');
    Music.play(LOCATION_MUSIC[this.loc - 1] || 'Episode01');
    this.initNote();
    if (!this.noteWait) this.timers.after(2.0, () => this.beginPlay());
  }

  sfx(name, vol) { Sfx.play(name, vol === undefined ? 1 : vol); }

  applyLevelObjects() {
    const li = this.levelId - 1;
    for (let pos = 0; pos < 6; pos++) {
      const slot = POS.ingredientBottles[pos][0];
      if (LVL_ACT_INGREDIENTS[li][slot] === 1) this.ingBottles.push(new IngBottle(this, pos, slot));
    }
    for (let i = 0; i < 4; i++) {
      const b = new Burner(this, i, this.loc);
      b.closed = LVL_ACT_BURNERS[li][i] === 0;
      this.burners.push(b);
    }
    for (let i = 0; i < 5; i++) this.spices.push(new SpiceItem(this, i, LVL_ACT_SPICES[li][i]));
    for (let i = 0; i < 4; i++) {
      if (LVL_ACT_DECORS[li][i] === 1) this.decors.push(new DecorItem(this, i, i + 1));
    }
    for (let i = 0; i < 4; i++) {
      if (LVL_ACT_AMULETS[li][i] === 1) this.amulets.push(new AmuletItem(this, i, i + 1));
    }
  }

  startLevel() {
    if (this.state !== 'intro') return;
    this.state = 'playing';
    this.timers.after(TIMING.spawnFirst, () => this.addClient());
    this.spawnIntervalT = TIMING.spawnInterval;
    this.catRandom();
  }

  // ---------- обновление ----------
  update(dt) {
    if (this.paused) return;
    this.timers.update(dt);
    if (this.updateNote(dt)) return;               // записка открыта — игра стоит
    this.moves.update(dt);
    if (this.state === 'result') return;

    if (this.state === 'playing' && !this.timeOff && !this.tutorialActive) {
      this.time -= dt;
      const frac = 1 - clamp(this.time / this.level.time, 0, 1);
      this.arrowAngle = -30 + frac * 217;
      this.lampsLit = Math.floor(frac * 12);
      this.padAlpha = Math.min(1, this.padAlpha + dt / 0.3);
      if (this.time <= 10 && !this.timeRedPlayed) { this.timeRedPlayed = true; this.sfx('UILevelTimeRed'); }
      if (this.time <= 0) {
        this.time = 0;
        this.timeOff = true;
        this.sfx('UILevelTimeEnd');
      }
      this.spawnIntervalT -= dt;
      if (this.spawnIntervalT <= 0) {
        this.spawnIntervalT = TIMING.spawnInterval;
        this.addClient();
      }
    }

    for (const b of this.bottles) b.update(dt);
    for (const c of this.clients) c.update(dt);

    if (this.dragObj) {
      this.dragObj.x = Input.x + this.dragOffset.x;
      this.dragObj.y = Input.y + this.dragOffset.y;
    }

    // счётчик денег — монета за 12 мс, как в оригинале
    if (this.moneyPending > 0) {
      this.moneyTick -= dt;
      while (this.moneyPending > 0 && this.moneyTick <= 0) {
        this.moneyPending--;
        this.money++;
        this.moneyTick += 0.012;
        const want = Math.ceil(this.money / this.level.goalExpert * 21);
        if (want > this.coins.length && this.coins.length < 21) {
          this.coins.push(this.money < this.level.goal ? 'IP_SILVER' : 'IP_GOLD');
        }
        if (!this.masterHit && this.money >= this.level.goal) { this.masterHit = true; this.sfx('GameGoalMasterReached'); }
        if (!this.expertHit && this.money >= this.level.goalExpert) { this.expertHit = true; this.sfx('GameGoalExpertReached'); }
      }
    } else this.moneyTick = 0;

    this.updateTutorial(dt);
    this.updateHover();
    if (this.state === 'playing') this.handleInput();

    // конец уровня: бар закрыт и все клиенты ушли
    if (this.state === 'playing' && this.timeOff && !this.clients.some(c => c.active)) {
      this.state = 'ending';
      this.timers.after(1.5, () => this.levelEnd());
    }
  }

  updateHover() {
    let sel = null;
    if (this.state === 'playing') {
      sel = this.dragObj ? this.dropHitTest(this.dragObj) : this.hitTest(Input.x, Input.y, null);
    }
    const blinkOn = this.tutorialActive && this.tutBlink && Math.sin(performance.now() / 140) > -0.2;
    for (const o of this.common) o.hovered = (o === sel) || !!(blinkOn && this.tutBlink.has(o));
    this.hoveredObj = sel;
  }

  // ---------- заказы ----------
  createOrder() {
    let pool = this.ingBottles.map(b => b.ingredientID);
    for (const c of this.clients) {
      if (c.active && c.orders) {
        const i = pool.indexOf(c.orders.ingredientID);
        if (i !== -1) pool.splice(i, 1);
      }
    }
    if (!pool.length) pool = this.ingBottles.map(b => b.ingredientID);
    const ingredientID = pool[Math.floor(Math.random() * pool.length)];

    const li = this.levelId - 1;
    const visibleSpices = this.spices.filter(s => s.visible).map(s => s.spiciesID);
    let spicesCount = 1;
    if (LVL_SPICES_COUNT[li] > 1 && Math.random() < LVL_SPICES_PROB[li]) {
      spicesCount += Math.round((LVL_SPICES_COUNT[li] - 1) * Math.random());
    }
    if (LVL_SPICES_COUNT[li] > visibleSpices.length) spicesCount = visibleSpices.length;
    const list = visibleSpices.slice();
    const spiciesID = [];
    for (let i = 0; i < spicesCount && list.length; i++) {
      const k = Math.floor(Math.random() * list.length);
      spiciesID.push(list[k]);
      list.splice(k, 1);
    }

    let decorID = -1;
    if (Math.random() > 0.5 && this.decors.length) {
      decorID = this.decors[Math.floor(Math.random() * this.decors.length)].decorID;
    }
    let amuletID = 0;
    if (Math.random() > 0.5 && this.amulets.length) {
      amuletID = this.amulets[Math.floor(Math.random() * this.amulets.length)].amuletID;
    }
    return { ingredientID, spiciesID, decorID, amuletID };
  }

  // ---------- появление клиентов ----------
  addClient() {
    if (this.state !== 'playing' || this.timeOff || !this.spawnGate) return;
    const freePositions = [], freeIDs = [];
    for (let i = 0; i < 4; i++) freePositions.push(i);
    const types = guestPool(this.storyLevel());
    for (const t of types) freeIDs.push(t);
    let current = 0, freeVar = -1;
    for (let i = 0; i < this.clients.length; i++) {
      const c = this.clients[i];
      if (c.active) {
        current++;
        const pi = freePositions.indexOf(c.positionID);
        if (pi !== -1) freePositions.splice(pi, 1);
        const ci = freeIDs.indexOf(c.clientID);
        if (ci !== -1) freeIDs.splice(ci, 1);
      } else freeVar = i;
    }
    if (freeVar === -1) return;
    if (this.level.clients - current <= 0) return;

    this.sfx('GameClientComing');
    this.openDoor();
    this.spawnGate = false;
    this.timers.after(TIMING.spawnBlock + Math.random() * TIMING.spawnBlockJitter, () => { this.spawnGate = true; });
    this.timers.after(0.14, () => {
      const posID = freePositions[Math.floor(Math.random() * freePositions.length)];
      const clientID = pickGuest(freeIDs.length ? freeIDs : types, this.loc);
      this.clients[freeVar].init(posID, clientID, this.createOrder());
      this.sortClientInCommon(this.clients[freeVar]);
    });
  }

  smallPauseAndAddClient() {
    if (this.spawnGate) {
      this.spawnGate = false;
      this.timers.after(TIMING.servePause + Math.random() * TIMING.servePauseJitter, () => {
        this.spawnGate = true;
        this.addClient();
      });
    } else {
      this.timers.after(TIMING.servePauseAlt + Math.random() * TIMING.servePauseJitter, () => this.addClient());
    }
  }

  // ---------- попадание курсора ----------
  hitTest(x, y, exclude) {
    let best = null, bestD = Infinity;
    for (const o of this.common) {
      if (o === exclude) continue;
      if (o.hitActive === false) continue;
      if (this.tutorialActive && !this.tutAllows(o)) continue;     // обучение: доступны только мигающие
      if (o.type === 3 && (o.closed || o.bottle)) continue;
      if (o.type === 0 && !(this.dragObj && this.dragObj.type === 1)) continue;
      const r = o.contentRect();
      if (!r) continue;
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        const dx = x - (r.x + r.w / 2), dy = y - (r.y + r.h / 2);
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = o; }
      }
    }
    return best;
  }

  // ---------- цель под перетаскиваемым предметом (SmartHitTest.smartHitTest) ----------
  // В оригинале цель броска — объект, с которым ПЕРЕСЕКАЮТСЯ пиксели тащимого
  // предмета (а не курсор); при нескольких — ближайший по центру.
  dropHitTest(drag) {
    // цель под курсором приоритетнее пересечения: у большой «сборки» (бутылки) пересечений несколько,
    // и игрок ожидает то, на что указывает курсор
    const under = this.hitTest(Input.x, Input.y, drag);
    if (under) return under;
    const dr = drag.dropRect ? drag.dropRect() : drag.contentRect();
    const dcx = dr.x + dr.w / 2, dcy = dr.y + dr.h / 2;
    let best = null, bestD = Infinity;
    for (const o of this.common) {
      if (o === drag || o.hitActive === false) continue;
      if (this.tutorialActive && !this.tutAllows(o)) continue;
      if (o.type === 3 && (o.closed || o.bottle)) continue;
      if (o.type === 0 && drag.type !== 1) continue;
      const r = o.contentRect();
      if (!r) continue;
      if (Math.max(dr.x, r.x) < Math.min(dr.x + dr.w, r.x + r.w) &&
          Math.max(dr.y, r.y) < Math.min(dr.y + dr.h, r.y + r.h)) {
        const dx = dcx - (r.x + r.w / 2), dy = dcy - (r.y + r.h / 2);
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = o; }
      }
    }
    return best;
  }

  // ---------- ввод (клик-взял / клик-положил, как в оригинале) ----------
  handleInput() {
    if (!Input.clicked) return;
    // как в оригинале: с предметом в руке цель ищется по пересечению пикселей,
    // без предмета — по позиции курсора (mouseHitTest)
    const sel = this.dragObj ? this.dropHitTest(this.dragObj) : this.hitTest(Input.x, Input.y, null);
    const t = sel ? sel.type : -1;
    const d = this.dragObj;

    switch (t) {
      case -1: // пустое место — вернуть предмет
        if (d) {
          if (d.type === 1) {
            if (d.step === 1) this.returnBottleToHolder(d);
            else this.sfx('UICantUse');
          } else if (d.type === 4) this.moveSpiceToHolder(d);
          else if (d.type === 6) this.moveAmuletToHolder(d);
        }
        break;

      case 0: // раковина
        if (d && d.type === 1 && d.step > 1) {
          this.sfx('GamePotionGoToSink');
          this.washBottle(d);
        } else this.sfx('UICantUse');
        break;

      case 1: // бутылка
        if (sel.step === 7) {
          this.collectMoney(sel);
        } else if (d) {
          if (d.type === 1) {
            if (d.step === 1) this.returnBottleToHolder(d);
            else if (sel.burner) {
              this.sfx('GamePutGlass');
              // как в оригинале: сначала ближайшая СВОБОДНАЯ конфорка,
              // обмен — только если свободных нет
              const free = this.nearestFreeBurner();
              if (free) this.putBottleOnBurner(free, d);
              else this.swapBottlesAtBurner(sel, d);
            } else this.sfx('UICantUse');
          } else if (d.type === 4) {
            if (this.addSpiceToBottle(sel, d)) {
              this.sfx('GamePuff');
              this.moveSpiceToHolder(d);
            } else this.sfx('UICantUse');
          } else if (d.type === 6) {
            if (sel.step === 0) {
              this.sfx('GameTakeGlass');
              this.moveAmuletToHolder(d);
              this.pickUpBottle(sel);
            } else this.sfx('UICantUse');
          }
        } else {
          this.pickUpBottle(sel);
        }
        break;

      case 2: // бутылка ингредиента
        if (d && d.type === 1) {
          if (d.step === 1) {
            d.fill(sel.ingredientID);
            this.sfx('GameAddWater');
          } else this.sfx('UICantUse');
        } else this.sfx('UICantUse');
        break;

      case 3: // горелка
        if (d && d.type === 1) {
          if (d.step >= 2) {
            if (sel.bottle) {
              const free = this.nearestFreeBurner();
              if (free) {
                this.sfx('GamePutGlass');
                this.putBottleOnBurner(free, d);
              }
            } else {
              this.sfx('GamePutGlass');
              this.putBottleOnBurner(sel, d);
            }
          } else this.sfx('UICantUse');
        } else this.sfx('UICantUse');
        break;

      case 4: // специя
        if (d) {
          if (d.type === 1) {
            if (!this.addSpiceToBottle(d, sel)) this.sfx('UICantUse');
            else this.sfx('GamePuff');
          } else if (d.type === 4) {
            this.sfx('GameTakeIngredient');
            this.moveSpiceToHolder(d);
            this.pickUpSpice(sel);
          } else if (d.type === 6) {
            this.sfx('GameTakeIngredient');
            this.moveAmuletToHolder(d);
            this.pickUpSpice(sel);
          } else this.sfx('UICantUse');
        } else {
          this.sfx('GameTakeIngredient');
          this.pickUpSpice(sel);
        }
        break;

      case 5: // декор
        if (d && d.type === 1 && d.step !== 6) {
          this.sfx('GameTakeDecor');
          this.setDecor(sel, d);
        } else this.sfx('UICantUse');
        break;

      case 6: // амулет
        if (d) {
          if (d.type === 4) {
            this.sfx('GameTakeAmulet');
            this.moveSpiceToHolder(d);
            this.pickUpAmulet(sel);
          } else if (d.type === 6) {
            this.sfx('GameTakeAmulet');
            this.moveAmuletToHolder(d);
            this.pickUpAmulet(sel);
          } else this.sfx('UICantUse');
        } else {
          this.sfx('GameTakeAmulet');
          this.pickUpAmulet(sel);
        }
        break;

      case 7: // клиент
        if (d) {
          if (d.type === 1) {
            if (sel.step === 0) {
              if (d.step === 3 || d.step === 5) this.tryServe(sel, d);
              else this.sfx('UICantUse');
            } else this.sfx('UICantUse');
          } else if (d.type === 6) {
            if (sel.step === 1 && sel.orders.amuletID === d.amuletID) this.giveAmulet(sel, d);
          }
        }
        break;
    }
  }

  // ---------- действия ----------
  pickUpBottle(b) {
    this.dragObj = b;
    this.dragOffset = { x: -F(43), y: -F(30) };
    if (b.burner) {
      // снятие с горелки (get_bottle_from_burner): step 3/5 сохраняется
      b.takeOffBurner();
    } else {
      // взятие с полки (get_bottle_from_holders → bottleDrag): step = 1
      b.step = 1;
    }
    b.hitActive = false;
    this.sfx('GameTakeGlass');
  }

  returnBottleToHolder(b) {
    this.dragObj = null;
    b.hitActive = false;
    this.moves.to(b, b.home.x, b.home.y, 0.3, () => {
      b.clearAll();
    });
  }

  washBottle(b) {
    this.dragObj = null;
    b.clearAll();
    b.x = b.home.x; b.y = b.home.y;
    b.fadeT = 0;
  }

  nearestFreeBurner() {
    for (const b of this.burners) {
      if (!b.closed && !b.bottle) return b;
    }
    return null;
  }

  putBottleOnBurner(burner, bottle) {
    // задние горелки (1,3) — бутылка уходит под всё
    if (burner.burnerID === 1 || burner.burnerID === 3) {
      const idx = this.common.indexOf(bottle);
      if (idx !== -1) { this.common.splice(idx, 1); this.common.unshift(bottle); }
    } else {
      const idx = this.common.indexOf(bottle);
      if (idx !== -1) { this.common.splice(idx, 1); this.common.push(bottle); }
    }
    bottle.x = burner.bottlePos.x;
    bottle.y = burner.bottlePos.y;
    bottle.putOnBurner(burner);
    this.dragObj = null;
    bottle.hitActive = true;
  }

  swapBottlesAtBurner(targetBottle, heldBottle) {
    const burner = targetBottle.burner;
    if (!burner) return;
    // цель — в руку, держимая — на горелку
    targetBottle.takeOffBurner();
    this.dragObj = targetBottle;
    this.dragOffset = { x: -F(43), y: -F(30) };
    targetBottle.hitActive = false;
    this.putBottleOnBurner(burner, heldBottle);
  }

  addSpiceToBottle(bottle, spice) {
    if (bottle.type !== 1 || spice.type !== 4) return false;
    if (bottle.step !== 3 && bottle.step !== 5) return false;
    if (bottle.spicies.includes(spice.spiciesID)) return false;
    bottle.addSpice(spice.spiciesID);
    if (bottle.burner) {
      // bottleBoil(): перезапуск цикла кипячения после добавления специй
      // (start_point = burner_indicator_progress, т.к. burn_started сброшен)
      if (!bottle.burnStarted) bottle.startPoint = bottle.progress;
    }
    return true;
  }

  pickUpSpice(s) {
    this.dragObj = s;
    this.dragOffset = { x: -F(37), y: -F(46) };
  }

  moveSpiceToHolder(s) {
    this.dragObj = null;
    this.moves.to(s, s.home.x, s.home.y, 0.3);
  }

  pickUpAmulet(a) {
    this.dragObj = a;
    this.dragOffset = { x: -F(25), y: -F(38) };
  }

  moveAmuletToHolder(a) {
    this.dragObj = null;
    this.moves.to(a, a.home.x, a.home.y, 0.3);
  }

  setDecor(decorItem, bottle) {
    if (bottle.decor === -1) {
      bottle.decor = decorItem.decorID;
    } else if (bottle.decor === decorItem.decorID) {
      bottle.decor = -1;
    } else {
      bottle.decor = decorItem.decorID;
    }
  }

  tryServe(client, bottle) {
    const o = client.orders;
    if (o.ingredientID !== bottle.ingredientID) { this.sfx('UICantUse'); return; }
    if (o.spiciesID.length !== bottle.spicies.length) { this.sfx('UICantUse'); return; }
    for (const s of bottle.spicies) {
      if (!o.spiciesID.includes(s)) { this.sfx('UICantUse'); return; }
    }
    if (bottle.decor !== o.decorID) { this.sfx('UICantUse'); return; }

    // подача: бутылка к клиенту, поверх всех объектов
    const idx = this.common.indexOf(bottle);
    if (idx !== -1) { this.common.splice(idx, 1); this.common.push(bottle); }
    bottle.takeOffBurner();
    const cp = fpt(POS.clients[client.positionID]);
    bottle.x = cp.x + F(POS.bottleOnClient[0]);
    bottle.y = cp.y + F(POS.bottleOnClient[1]);
    bottle.client = client;
    bottle.hitActive = false;
    bottle.strawAlpha = 1;
    bottle.drinkT = 0.0001;
    if (bottle.spicies.length) {
      bottle.spiceDrift = {};
      for (const sid of bottle.spicies) {
        const corr = SPICE_SINK_CORR[sid - 1][0];
        bottle.spiceDrift[sid] = { tx: corr[0], ty: corr[1], cx: 0 };
      }
    }
    this.dragObj = null;
    client.hitActive = false;
    client.drink();
  }

  bottleOfClient(client) {
    for (const b of this.bottles) if (b.client === client) return b;
    return null;
  }

  bottleToMoney(bottle) {
    this.sfx('GameClientOutHappy');
    this.openDoor();
    bottle.step = 7;
    bottle.strawAlpha = 0;
    bottle.hitActive = true;
    if (bottle.client) bottle.client.hidden = true;
  }

  collectMoney(bottle) {
    this.sfx('GameMoneyClick');
    const profit = this.calcProfit(bottle);
    this.moneyPending += profit;
    if (bottle.client) bottle.client.clearClient();
    bottle.client = null;
    bottle.clearAll();
    bottle.x = bottle.home.x; bottle.y = bottle.home.y;
    bottle.fadeT = 0;
    this.smallPauseAndAddClient();
  }

  calcProfit(bottle) {
    let sum = COST_DRINKS[bottle.ingredientID];
    for (const s of bottle.spicies) sum += COST_SPICE[s - 1];
    if (bottle.decor !== -1) sum += COST_DECOR[bottle.decor - 1];
    if (bottle.client && bottle.client.orders.amuletID) {
      sum += COST_AMULET[bottle.client.orders.amuletID - 1];
    }
    if (bottle.client) sum += bottle.client.tip * sum;
    return Math.round(sum);
  }

  clientWantsAmulet(client, bottle) {
    if (bottle) bottle.visible = false;
    client.showAmulet();
    client.hitActive = true;
  }

  giveAmulet(client, amulet) {
    client.amuletGot();
    client.hitActive = false;
    this.moveAmuletToHolder(amulet);
  }

  clientAmuletServed(client) {
    this.openDoor();
    const bottle = this.bottleOfClient(client);
    if (bottle) {
      bottle.visible = true;
      this.bottleToMoney(bottle);
    }
    client.hidden = true;
  }

  clientLeftAngry(client) {
    // амулет не принесли — напиток пропал
    this.guestSay(client, 'leave');
    const bottle = this.bottleOfClient(client);
    if (bottle) {
      bottle.visible = true;
      bottle.clearAll();
      bottle.x = bottle.home.x; bottle.y = bottle.home.y;
      bottle.fadeT = 0;
    }
    client.clearClient();
    this.smallPauseAndAddClient();
  }

  clientLeftUnserved(client) {
    this.guestSay(client, 'leave');
    this.sfx('GameClientOutHappy');
    this.openDoor();
    client.clearClient();
    this.smallPauseAndAddClient();
  }

  // ---------- уровень ----------
  levelEnd() {
    Music.stop();
    const won = this.money >= this.level.goal;
    const expert = this.money >= this.level.goalExpert;
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    this.endText = won ? (expert ? pick(TEXTS.winExpert) : pick(TEXTS.winMaster)) : pick(TEXTS.loose);
    this.sfx(won ? 'UILevelWon' : 'UILevelFailed');
    this.state = 'result';
    this.over = { won, expert };
    this.timers.after(won ? 3.5 : 3.0, () => {
      const finish = () => this.app.onLevelEnd(this.scenarioIdx, won, expert, this.money);
      if (won) { this.state = 'dialog'; this.postStory(finish); } else finish();   // после победы — разговор героини и кота
    });
  }

  // ---------- декорации ----------
  openDoor() {
    if (this.doorT !== -1) return;
    const seq = TIMING.doorSeq;
    this.doorT = 0;
    const frames = [1, 2, 1, 0];
    const step = (i) => {
      if (i >= seq.length) { this.doorFrame = 0; this.doorT = -1; return; }
      this.timers.after(seq[i], () => {
        this.doorFrame = frames[i];
        step(i + 1);
      });
    };
    step(0);
  }

  // клиент вставляется в z-порядок по позиции (как addChildAt в оригинале)
  sortClientInCommon(c) {
    const idx = this.common.indexOf(c);
    if (idx === -1) return;
    this.common.splice(idx, 1);
    let insertAt = this.common.indexOf(this.sink);
    for (let i = 0; i < this.common.length; i++) {
      const o = this.common[i];
      if (o.type === 0) { insertAt = i; break; }
      if (o.type === 7 && o.active && o.positionID > c.positionID) { insertAt = i; break; }
    }
    this.common.splice(insertAt, 0, c);
  }

  catRandom() {
    const change = () => {
      const f = 1 + Math.round(4 * Math.random());
      this.catFrame = f;
      if (f !== 5) {
        this.timers.after(2 + Math.round(2 * Math.random()), () => { this.catFrame = 0; });
      }
    };
    const loop = () => {
      this.timers.after(12 + Math.round(6 * Math.random()), () => { change(); loop(); });
    };
    loop();
  }
}

// ============================================================
//  Отрисовка сцены (продолжение BarScene)
// ============================================================
Object.assign(BarScene.prototype, {

  draw(ctx) {
    // фон
    const bg = Assets.spr('BG' + this.loc);
    if (bg) ctx.drawImage(bg.img, 0, 0, W, H);

    // дверь
    const dp = fpt(POS.door[this.loc - 1]);
    drawFrame(ctx, 'DOOR' + this.loc, this.doorFrame, dp.x, dp.y);

    // кот
    // (в начале игры подушка пуста: кот оживает из статуэтки в вводной сцене)
    const pc = this.pillowCat === undefined ? 1 : this.pillowCat;
    if (pc > 0.01) {
      ctx.save(); ctx.globalAlpha = pc;
      drawFrame(ctx, 'CAT' + this.loc, this.catFrame, F(POS.catX), 0);
      ctx.restore();
    }

    // записка и статуэтка кота на стойке
    this.drawNoteItems(ctx);

    this.drawDlgGuest(ctx);                           // гость сюжетного диалога
    // объекты сцены в z-порядке
    for (const o of this.common) o.draw(ctx);

    // подставки бутылок (поверх)
    for (let i = 0; i < 4; i++) {
      const hp = fpt(POS.bottleHolders[i]);
      drawFrame(ctx, 'HOLDER' + this.loc, 0, hp.x, hp.y);
    }

    // объект в руке — поверх сцены
    if (this.dragObj) this.dragObj.draw(ctx);

    // HUD
    this.drawTimeIndicator(ctx);
    this.drawMenuButton(ctx);

    // оверлеи
    this.drawNoteOverlay(ctx);
    if (this.paused) this.drawPause(ctx);
    if (this.state === 'result') this.drawResult(ctx);
  },

  drawTimeIndicator(ctx) {
    drawFrame(ctx, 'IP_BACK', 0, F(-1), F(1));
    // монетки
    const coinShift = F(53) / 21;
    for (let i = 0; i < this.coins.length; i++) {
      drawFrame(ctx, this.coins[i], 0, F(74) + i * coinShift, F(40));
    }
    // разделитель цели мастера
    const sepX = F(69) + Math.ceil(this.level.goal / this.level.goalExpert * 21) * coinShift;
    drawFrame(ctx, 'IP_SEP', 0, sepX, F(38));
    // лампочки
    for (let i = 0; i < TIMER_DOTS.length; i++) {
      const d = TIMER_DOTS[i];
      const x = F(d[0]), y = F(d[1]);
      if (i < this.lampsLit) {
        const col = 'rgb(' + d[2] + ',' + d[3] + ',' + d[4] + ')';
        const t = tintedSprite('IP_WHITE', col);
        if (t) {
          ctx.save();
          ctx.shadowColor = col;
          ctx.shadowBlur = 8;
          ctx.drawImage(t, x, y, F(15), F(15));
          ctx.restore();
        }
      } else {
        drawFrame(ctx, 'IP_WHITE', 0, x, y, { alpha: 0.25 });
      }
    }
    // стрелка
    ctx.save();
    ctx.translate(F(38), F(37));
    ctx.rotate(this.arrowAngle * Math.PI / 180);
    drawFrame(ctx, 'IP_ARROW', 0, -F(25), -F(25));
    ctx.restore();
    drawFrame(ctx, 'IP_FRONT', 0, F(-1), F(1));
    // деньги
    text(ctx, String(this.money), F(107), F(15) + F(11), { size: F(16), align: 'left', color: '#f5d98a', stroke: 'rgba(40,16,4,0.9)', strokeW: 3 });
    // табличка «Открыто/Закрыто»
    if (this.padAlpha > 0) {
      drawFrame(ctx, 'IP_PAD', 0, F(-1), F(81.6), { alpha: this.padAlpha });
      ctx.save();
      ctx.globalAlpha = this.padAlpha;
      text(ctx, this.timeOff ? TEXTS.closed : TEXTS.open, F(47), F(88.5), { size: F(11), color: '#ffe9b0', stroke: 'rgba(40,16,4,0.9)', strokeW: 3 });
      ctx.restore();
    }
  },

  menuBtnRect() {
    return { x: F(1), y: F(443), w: 157, h: 58 };
  },

  drawMenuButton(ctx) {
    const r = this.menuBtnRect();
    const hov = inRect(r, Input.x, Input.y);
    const id = (Input.down && hov) ? 'BTN_MENU_D' : (hov ? 'BTN_MENU_O' : 'BTN_MENU_N');
    drawFrame(ctx, id, 0, r.x, r.y);
    text(ctx, TEXTS.menu, r.x + r.w / 2, r.y + r.h / 2 + 1, { size: F(12), color: '#ffe9b0', stroke: 'rgba(40,16,4,0.9)', strokeW: 3 });
  },

  // ---------- пауза / выход ----------
  drawPause(ctx) {
    const r = drawYesNoBox(ctx, 'Вы действительно хотите выйти в меню? Прогресс будет потерян.');
    if (r === 'yes') {
      this.paused = false;
      Music.stop();
      this.app.showTitle();
    } else if (r === 'no') {
      this.paused = false;
    }
  },

  // ---------- итог уровня ----------
  drawResult(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(8,4,16,0.78)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    const won = this.over.won;
    text(ctx, won ? 'Уровень пройден!' : 'Уровень провален', W / 2, 250, { size: 46, color: won ? '#9fe870' : '#ff6060' });
    text(ctx, this.endText, W / 2, 330, { size: 26, color: '#f0e6ff' });
    text(ctx, 'Заработано: ' + this.money + '  •  Цель: ' + this.level.goal +
      (this.over.expert ? '  ★ Эксперт!' : ''), W / 2, 385, { size: 24, color: '#ffe9a8' });
    text(ctx, 'Нажмите, чтобы продолжить', W / 2, H - 90, { size: 20, color: 'rgba(230,215,255,0.8)' });
    if (Input.clicked && !this.resultSent) {
      this.resultSent = true;
      Input.clicked = false;
      this.app.onLevelEnd(this.scenarioIdx, this.over.won, this.over.expert, this.money);
    }
  },
});

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

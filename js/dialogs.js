// ===== Сюжетные диалоги уровней (по таблицам оригинала: говорящий + фаза у каждой реплики) =====
// Перед уровнем идут фазы -4…-1, после победы — фаза 1. Диалоги показываются при первом
// прохождении уровня (при переигровке со звезды карты — пропускаются).
'use strict';

const DLG_WHO = { 0: 'cat', 1: 'npc', 2: 'girl', 3: 'merchant', 4: 'guest' };

Object.assign(BarScene.prototype, {

  // номер уровня 1..35 среди уровней бара (как в таблицах оригинала)
  storyLevel() {
    let n = 0;
    for (let i = 0; i <= this.scenarioIdx; i++) if (SCENARIO[i].type === 'base') n++;
    return n;
  },

  // диалоги показываем только при первом прохождении
  storyFresh() { return this.scenarioIdx >= this.app.progress; },

  // запустить реплики заданных фаз; по окончании — done()
  dlgStart(phases, done) {
    const L = this.storyLevel();
    const lines = (this.storyFresh() && STORY[L]) ? STORY[L].filter((l) => phases.includes(l[1])) : [];
    if (!lines.length) { done(); return; }
    // гость (говорящий 1 «посетитель» и 4 «гость») должен быть виден за стойкой, пока идёт его реплика
    const gi = lines.findIndex((l) => l[0] === 1 || l[0] === 4);
    const types = guestPool(L);
    this.dlgGuest = gi >= 0 && types.length ? { id: types[types.length - 1], from: gi, a: 0 } : null;
    this.dlg = { lines, i: 0, t: 0, done };
    this.bub = null;
  },

  // перед уровнем: ночные/утренние сцены, торговец, разговор в баре
  preStory(done) { this.dlgStart([-4, -3, -2, -1], done); },

  // после победы
  postStory(done) { this.dlgStart([1, 0], done); },

  // вызывается из updateNote: true — игра стоит
  updateDlg(dt) {
    const d = this.dlg;
    d.t += dt;
    const g = this.dlgGuest;
    if (g) g.a = Math.min(1, g.a + (d.i >= g.from ? dt / 0.35 : 0));
    if (!this.bub && d.t > 0.45) {
      const l = d.lines[d.i];
      this.bub = { who: DLG_WHO[l[0]] || 'cat', text: l[2], t: 0, dur: 1.8 + l[2].length * 0.06 };
    }
    if (this.bub) {
      this.bub.t += dt;
      const click = Input.clicked && this.bub.t > 0.35 && !inRect(this.menuBtnRect(), Input.x, Input.y);
      if (click) Input.clicked = false;
      if (click || this.bub.t > this.bub.dur) {
        this.bub = null; d.i++; d.t = 0;
        if (d.i >= d.lines.length) { const f = d.done; this.dlg = null; this.dlgGuest = null; f(); }
      }
    }
    return true;
  },
});

Object.assign(BarScene.prototype, {
  // гость на своём месте за стойкой во время сюжетного диалога (кадр «стоит», без облачка заказа)
  drawDlgGuest(ctx) {
    const g = this.dlgGuest;
    if (!g || g.a <= 0.01) return;
    const p = fpt(POS.clients[1]), off = fpt(POS.clientChar[g.id - 1]);
    ctx.save();
    ctx.globalAlpha *= g.a;
    drawFrame(ctx, 'CHAR' + String(g.id).padStart(2, '0'), 0, p.x + off.x, p.y + off.y);
    ctx.restore();
  },
});

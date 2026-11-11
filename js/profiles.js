// ===== Профили игроков и диалоги (список профилей, ввод имени, подтверждение) =====
// Макеты — на деревянных табличках оригинала: DialogBox (список), DialogBoxName / DialogBoxRestart.
'use strict';

// кнопка на основе MainBtn (205×81), масштаб по ширине
function uiButton(ctx, r, label, opts = {}) {
  const hov = opts.enabled !== false && inRect(r, Input.x, Input.y);
  const id = (Input.down && hov) ? 'MBTN_D' : (hov ? 'MBTN_O' : 'MBTN_N');
  const sc = r.w / 205;
  ctx.save();
  if (opts.enabled === false) ctx.filter = 'grayscale(1) opacity(0.6)';
  drawSpr(ctx, id, r.x, r.y, { anchor: 'tl', scale: sc });
  ctx.restore();
  text(ctx, label, r.x + r.w / 2, r.y + r.h / 2 + 1, { size: opts.size || 20, color: '#330f01', stroke: null });
  return hov;
}

function uiWrap(ctx, str, maxW) {
  const words = str.split(' '), lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

// широкая кнопка как в оригинале (≈4:1): спрайт MainBtn режется на три части, края не искажаются
function uiWideButton(ctx, r, label) {
  const hov = inRect(r, Input.x, Input.y);
  const sp = Assets.spr((Input.down && hov) ? 'MBTN_D' : (hov ? 'MBTN_O' : 'MBTN_N'));
  if (sp) {
    // видимая часть спрайта MainBtn — рамка (21,16)–(193,68), вокруг прозрачные поля: режем по ней
    const X0 = 21, Y0 = 16, SW = 172, SH = 52, sc = 18;
    const k = r.h / SH, cap = Math.round(sc * k);
    ctx.drawImage(sp.img, X0, Y0, sc, SH, r.x, r.y, cap, r.h);
    ctx.drawImage(sp.img, X0 + sc, Y0, SW - 2 * sc, SH, r.x + cap, r.y, r.w - 2 * cap, r.h);
    ctx.drawImage(sp.img, X0 + SW - sc, Y0, sc, SH, r.x + r.w - cap, r.y, cap, r.h);
  }
  uiNarrowText(ctx, label, r.x + r.w / 2, r.y + r.h / 2 + 1, 20, '#300808');
  return hov;
}

// текст чуть сужен по ширине (у оригинального шрифта узкие буквы, Georgia шире)
function uiNarrowText(ctx, str, x, y, size, color) {
  ctx.save(); ctx.translate(x, y); ctx.scale(0.86, 1);
  text(ctx, str, 0, 0, { size, color, stroke: null });
  ctx.restore();
}

// сообщение на табличке: абзацы через '\n', каждая строка по центру панели
function uiBoxMessage(ctx, L, msg) {
  ctx.save(); ctx.font = 'bold 18px Georgia, serif';
  const lines = [];
  for (const para of msg.split('\n')) lines.push(...uiWrap(ctx, para, 366));
  ctx.restore();
  const lh = 22, top = L.y0 + 124 - (lines.length * lh) / 2 + lh / 2;
  lines.forEach((ln, i) => uiNarrowText(ctx, ln, W / 2, top + i * lh, 18, '#582010'));
}

// ---------- подтверждение (Да / Нет) ----------
class ConfirmPanel {
  constructor() { this.isOpen = false; this.msg = ''; this.onYes = null; this.onNo = null; this.single = false; }
  show(msg, onYes, onNo, single) { this.isOpen = true; this.msg = msg; this.onYes = onYes; this.onNo = onNo; this.single = !!single; }
  close() { this.isOpen = false; }
  layout() {
    // размеры сняты со скриншота оригинала (пересчёт в координаты спрайта DialogBoxRestart 460×265):
    // кнопки ≈131×36, левая x+87, правая x+236, y+162; текст — две строки по центру панели (y≈112 и 134)
    const x0 = Math.round((W - 460) / 2), y0 = Math.round((H - 265) / 2) - 6;     // по скриншоту оригинала рамка окна стоит на 14 px ниже прежнего
    const bw = 131, bh = 34, by = y0 + 170;   // как в оригинале: центр кнопок на нижней линии выемки таблички (она на y0+187 у краёв)
    return {
      x0, y0,
      yes: this.single ? { x: W / 2 - bw / 2, y: by, w: bw, h: bh } : { x: x0 + 87, y: by, w: bw, h: bh },
      no: { x: x0 + 236, y: by, w: bw, h: bh },
    };
  }
  update() {
    if (!this.isOpen) return;
    if (!Input.clicked) return;
    Input.clicked = false;
    const L = this.layout();
    if (inRect(L.yes, Input.x, Input.y)) { Sfx.play('UIClick'); const f = this.onYes; this.close(); if (f) f(); }
    else if (!this.single && inRect(L.no, Input.x, Input.y)) { Sfx.play('UIClick'); const f = this.onNo; this.close(); if (f) f(); }
  }
  onKey(key) {
    if (!this.isOpen) return false;
    if (key === 'Escape') { const f = this.single ? this.onYes : this.onNo; this.close(); if (f) f(); }
    else if (key === 'Enter') { const f = this.onYes; this.close(); if (f) f(); }
    return true;
  }
  draw(ctx) {
    if (!this.isOpen) return;
    ctx.save(); ctx.fillStyle = 'rgba(8,4,16,0.62)'; ctx.fillRect(0, 0, W, H); ctx.restore();
    const L = this.layout();
    const box = Assets.spr('DIALOG_BOX_RESTART');
    if (box) ctx.drawImage(box.img, L.x0, L.y0);
    uiBoxMessage(ctx, L, this.msg);
    uiWideButton(ctx, L.yes, this.single ? 'Ok' : 'Да');
    if (!this.single) uiWideButton(ctx, L.no, 'Нет');
  }
}

// ---------- общая деревянная табличка «Да / Нет» для сцен (выход в меню): как ConfirmPanel, но без панели-состояния ----------
// msg — абзацы через '\n'; возвращает 'yes' | 'no' | null (клик обрабатывается здесь)
function drawYesNoBox(ctx, msg) {
  const cp = drawYesNoBox.cp || (drawYesNoBox.cp = new ConfirmPanel());
  const L = cp.layout();
  ctx.save(); ctx.fillStyle = 'rgba(8,4,16,0.62)'; ctx.fillRect(0, 0, W, H); ctx.restore();
  const box = Assets.spr('DIALOG_BOX_RESTART');
  if (box) ctx.drawImage(box.img, L.x0, L.y0);
  uiBoxMessage(ctx, L, msg);
  uiWideButton(ctx, L.yes, 'Да');
  uiWideButton(ctx, L.no, 'Нет');
  if (Input.clicked) {
    const r = inRect(L.yes, Input.x, Input.y) ? 'yes' : inRect(L.no, Input.x, Input.y) ? 'no' : null;
    if (r) { Sfx.play('UIClick'); Input.clicked = false; return r; }
  }
  return null;
}

// ---------- профили: список + ввод имени ----------
class ProfilePanel {
  constructor(app) {
    this.app = app;
    this.isOpen = false;
    this.mode = 'list';        // list | name
    this.sel = 0;              // выбранная строка списка
    this.scroll = 0;           // индекс первой видимой строки
    this.firstRun = false;     // имени ещё нет: отмена недоступна
    this.err = '';
    this.confirm = new ConfirmPanel();
    this.drag = null;
    this.visible = 4;
    this.lastClick = { t: 0, i: -1 };

    // настоящее поле ввода поверх канваса (виртуальная клавиатура на телефонах)
    const inp = document.createElement('input');
    inp.type = 'text'; inp.maxLength = 14; inp.autocomplete = 'off'; inp.spellcheck = false;
    inp.setAttribute('aria-label', 'Введите Ваше имя');
    Object.assign(inp.style, {
      position: 'fixed', display: 'none', zIndex: 6, background: 'transparent', border: '0', outline: '0',
      textAlign: 'center', color: '#330f01', fontFamily: 'Georgia, serif', fontWeight: 'bold', padding: '0', margin: '0',
    });
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); this.submitName(); }
      else if (e.key === 'Escape') { e.preventDefault(); this.cancelName(); }
    });
    inp.addEventListener('input', () => { this.err = ''; });
    document.body.appendChild(inp);
    this.input = inp;

    window.addEventListener('wheel', (e) => {
      if (this.isOpen && this.mode === 'list' && !this.confirm.isOpen) this.scrollBy(e.deltaY > 0 ? 1 : -1);
    }, { passive: true });
  }

  rowsCount() { return Save.profiles.list.length + 1; }       // + «Новый игрок»
  scrollBy(d) { this.scroll = clamp(this.scroll + d, 0, Math.max(0, this.rowsCount() - this.visible)); }

  show(mode, firstRun) {
    this.isOpen = true; this.firstRun = !!firstRun; this.err = ''; this.drag = null;
    if (mode === 'name') this.openName();
    else this.openList();
  }
  close() { this.isOpen = false; this.input.style.display = 'none'; this.input.blur(); this.confirm.close(); }

  openList() {
    this.mode = 'list';
    this.input.style.display = 'none';
    const idx = Save.profiles.list.findIndex((p) => p.id === Save.profiles.cur);
    this.sel = idx >= 0 ? idx : 0;
    this.scroll = clamp(this.sel - this.visible + 1, 0, Math.max(0, this.rowsCount() - this.visible));
  }
  openName() {
    this.mode = 'name'; this.err = '';
    this.input.value = '';
    this.input.style.display = 'block';
    setTimeout(() => { try { this.input.focus(); } catch (e) {} }, 0);
  }

  submitName() {
    const name = this.input.value.replace(/\s+/g, ' ').trim();
    if (!name) { this.err = 'Введите имя!'; return; }
    if (Save.nameTaken(name)) { this.err = 'Такое имя уже существует.'; return; }
    Sfx.play('UIClick');
    Save.createProfile(name);
    this.app.onProfileChanged();
    this.close();
  }
  cancelName() {
    if (this.firstRun) return;
    Sfx.play('UIClick');
    this.openList();
  }

  // ---------- макеты ----------
  listLayout() {
    const x0 = Math.round((W - 386) / 2), y0 = Math.round((H - 448) / 2);
    const rowH = 44, rx = x0 + 62, rw = 252, ry = y0 + 138;
    return {
      x0, y0, rx, rw, ry, rowH,
      choose: { x: x0 + 56, y: y0 + 335, w: 132, h: 52 },
      del: { x: x0 + 198, y: y0 + 335, w: 132, h: 52 },
      list: { x: rx, y: ry, w: rw + 24, h: rowH * this.visible },
      dlg: { x: x0, y: y0, w: 386, h: 448 },
    };
  }
  nameLayout() {
    const x0 = Math.round((W - 460) / 2), y0 = Math.round((H - 265) / 2) - 20;
    const bw = 118, bh = 46, by = y0 + 156;   // кнопки целиком внутри деревянной таблички (её нижний край ≈ y0+225)
    return {
      x0, y0, fx: W / 2, fy: y0 + 152,
      ok: this.firstRun ? { x: W / 2 - bw / 2, y: by, w: bw, h: bh } : { x: W / 2 - bw - 14, y: by, w: bw, h: bh },
      cancel: { x: W / 2 + 12, y: by, w: bw, h: bh },
    };
  }

  // ---------- обновление ----------
  update(dt) {
    if (!this.isOpen) return;
    if (this.confirm.isOpen) { this.confirm.update(); return; }

    if (this.mode === 'name') {
      const L = this.nameLayout();
      // позиция настоящего поля ввода над канвасом
      const r = canvas.getBoundingClientRect(), k = r.width / W;
      const st = this.input.style;
      st.left = (r.left + (L.fx - 125) * k) + 'px';
      st.top = (r.top + (L.fy - 20) * k) + 'px';
      st.width = (250 * k) + 'px'; st.height = (40 * k) + 'px';
      st.fontSize = (24 * k) + 'px'; st.lineHeight = (40 * k) + 'px';
      if (Input.clicked) {
        Input.clicked = false;
        if (inRect(L.ok, Input.x, Input.y)) this.submitName();
        else if (!this.firstRun && inRect(L.cancel, Input.x, Input.y)) this.cancelName();
      }
      return;
    }

    // список
    const L = this.listLayout();
    if (this.drag) {
      if (Input.down) {
        const dy = Input.y - this.drag.y0;
        if (Math.abs(dy) > 8) this.drag.moved = true;
        if (this.drag.moved) this.scroll = clamp(Math.round(this.drag.s0 - dy / L.rowH), 0, Math.max(0, this.rowsCount() - this.visible));
      } else {
        if (!this.drag.moved && this.drag.row >= 0) this.clickRow(this.drag.row);
        this.drag = null;
      }
    }
    if (Input.clicked) {
      Input.clicked = false;
      const mx = Input.x, my = Input.y;
      if (inRect(L.choose, mx, my)) { this.choose(); return; }
      if (inRect(L.del, mx, my)) { this.askDelete(); return; }
      if (inRect(L.list, mx, my)) {
        const row = this.scroll + Math.floor((my - L.ry) / L.rowH);
        this.drag = { y0: my, s0: this.scroll, moved: false, row: row < this.rowsCount() ? row : -1 };
        return;
      }
      if (!inRect(L.dlg, mx, my) && !this.firstRun) { Sfx.play('UIClick'); this.close(); }
    }
  }

  clickRow(i) {
    const now = performance.now();
    const dbl = this.lastClick.i === i && now - this.lastClick.t < 400;
    this.lastClick = { t: now, i };
    this.sel = i;
    Sfx.play('UIClick', 0.7);
    if (dbl) this.choose();
  }

  choose() {
    Sfx.play('UIClick');
    if (this.sel >= Save.profiles.list.length) { this.openName(); return; }     // «Новый игрок»
    Save.selectProfile(Save.profiles.list[this.sel].id);
    this.app.onProfileChanged();
    this.close();
  }

  askDelete() {
    Sfx.play('UIClick');
    if (this.sel >= Save.profiles.list.length) return;
    if (Save.profiles.list.length <= 1) {
      this.confirm.show('Вы не можете удалить последний профиль.', null, null, true);
      return;
    }
    const p = Save.profiles.list[this.sel];
    this.confirm.show('Вы действительно хотите удалить этот профиль? Операция необратима.', () => {
      const wasCur = p.id === Save.profiles.cur;
      Save.deleteProfile(p.id);
      this.sel = clamp(this.sel, 0, Save.profiles.list.length);
      this.scrollBy(0);
      if (wasCur) this.app.onProfileChanged();
    }, null);
  }

  onKey(key) {
    if (!this.isOpen) return false;
    if (this.confirm.isOpen) return this.confirm.onKey(key);
    if (this.mode === 'name') return true;          // клавиши обрабатывает поле ввода
    if (key === 'Escape') { if (!this.firstRun) this.close(); }
    else if (key === 'Enter') this.choose();
    else if (key === 'ArrowDown') { this.sel = clamp(this.sel + 1, 0, this.rowsCount() - 1); this.keepVisible(); }
    else if (key === 'ArrowUp') { this.sel = clamp(this.sel - 1, 0, this.rowsCount() - 1); this.keepVisible(); }
    return true;
  }
  keepVisible() {
    if (this.sel < this.scroll) this.scroll = this.sel;
    else if (this.sel >= this.scroll + this.visible) this.scroll = this.sel - this.visible + 1;
  }

  // ---------- отрисовка ----------
  draw(ctx) {
    if (!this.isOpen) return;
    ctx.save(); ctx.fillStyle = 'rgba(8,4,16,0.62)'; ctx.fillRect(0, 0, W, H); ctx.restore();
    const tcol = '#330f01';

    if (this.mode === 'name') {
      const L = this.nameLayout();
      const box = Assets.spr('DIALOG_BOX_NAME');
      if (box) ctx.drawImage(box.img, L.x0, L.y0);
      text(ctx, 'Введите Ваше имя', W / 2, L.y0 + 112, { size: 24, color: tcol, stroke: null });
      const f = Assets.spr('EDIT_NAME');
      if (f) ctx.drawImage(f.img, L.fx - f.w / 2, L.fy - f.h / 2);
      if (this.firstRun) text(ctx, 'Создайте новый профиль для начала новой игры.', W / 2, L.y0 + 184, { size: 14, color: '#5a3a20', stroke: null, bold: false });
      if (this.err) text(ctx, this.err, W / 2, L.y0 + 184, { size: 16, color: '#b01010', stroke: null });
      uiButton(ctx, L.ok, 'Да');
      if (!this.firstRun) uiButton(ctx, L.cancel, 'Отмена');
      return;
    }

    const L = this.listLayout();
    const box = Assets.spr('DIALOG_BOX');
    if (box) ctx.drawImage(box.img, L.x0, L.y0);
    text(ctx, 'Профили', L.x0 + 193, L.y0 + 64, { size: 28, color: tcol, stroke: null });

    // строки списка
    const n = this.rowsCount();
    ctx.save();
    ctx.beginPath(); ctx.rect(L.rx - 4, L.ry, L.rw + 8, L.rowH * this.visible); ctx.clip();
    for (let i = this.scroll; i < Math.min(n, this.scroll + this.visible); i++) {
      const y = L.ry + (i - this.scroll) * L.rowH;
      const isNew = i >= Save.profiles.list.length;
      if (i === this.sel) {
        const b = Assets.spr('SELECTNAME_BACK');
        if (b) ctx.drawImage(b.img, L.rx, y + 1, L.rw, L.rowH - 2);
        else { ctx.fillStyle = 'rgba(120,80,40,0.35)'; ctx.fillRect(L.rx, y + 1, L.rw, L.rowH - 2); }
      }
      const p = isNew ? null : Save.profiles.list[i];
      const cur = p && p.id === Save.profiles.cur;
      text(ctx, isNew ? '+  Новый игрок' : p.name, L.rx + 16, y + L.rowH / 2 + 1, {
        size: 21, color: isNew ? '#6a4a20' : tcol, stroke: null, align: 'left', bold: !!cur,
      });
      if (cur) text(ctx, '✔', L.rx + L.rw - 14, y + L.rowH / 2, { size: 18, color: '#2d6a14', stroke: null });
    }
    ctx.restore();

    // полоса прокрутки
    if (n > this.visible) {
      const sc = Assets.spr('SELECTNAME_SCROLL');
      const trackH = L.rowH * this.visible, th = Math.max(26, trackH * this.visible / n);
      const ty = L.ry + (trackH - th) * (this.scroll / (n - this.visible));
      if (sc) ctx.drawImage(sc.img, L.rx + L.rw + 4, ty, 14, th);
    }

    const canDel = this.sel < Save.profiles.list.length;
    uiButton(ctx, L.choose, 'Выбор', { size: 19 });
    uiButton(ctx, L.del, 'Удалить', { size: 19, enabled: canDel });
    this.confirm.draw(ctx);
  }

  drawOverlay(ctx) { if (this.mode === 'list') this.confirm.draw(ctx); }
}

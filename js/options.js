// ===== Окно «Настройки» (по оригиналу): музыка, звук, «На весь экран», «Игровой курсор» =====
'use strict';

class OptionsPanel {
  constructor(app) {
    this.app = app;
    this.isOpen = false;
    this.drag = null;          // 'music' | 'sound' | null
    // табличка DialogBox 386×448 по центру; координаты элементов измерены по скриншоту оригинала
    this.w = 386; this.h = 448;
    this.x = Math.round((W - this.w) / 2);
    this.y = Math.round((H - this.h) / 2);
    // геометрия снята со скриншота оригинала (нормировано по видимой рамке спрайта DialogBox: x 17..361, y 7..431)
    this.trackX = this.x + 75; this.trackW = 220; this.trackLen = this.trackW - 28;      // ход ползунка (центр бегунка)
    this.rows = {
      music: { label: 'Музыка', ly: this.y + 167, ty: this.y + 193 },
      sound: { label: 'Звук', ly: this.y + 220, ty: this.y + 246 },
    };
    this.checks = {
      fullscreen: { label: 'На весь экран', cx: this.x + 87, cy: this.y + 287 },
      cursor: { label: 'Игровой курсор', cx: this.x + 87, cy: this.y + 335 },
    };
    this.okRect = { x: this.x + 190 - 68, y: this.y + 373, w: 136, h: 34 };
  }

  show() { this.isOpen = true; this.drag = null; }
  close() {
    if (!this.isOpen) return;
    this.isOpen = false; this.drag = null;
    Save.saveSettings();
  }

  value(k) { return k === 'music' ? Save.settings.music : Save.settings.sound; }
  setValue(k, v) {
    v = clamp(v, 0, 1);
    if (k === 'music') { Save.settings.music = v; Music.setVolume(v); }
    else { Save.settings.sound = v; Sfx.volume = v; }
  }
  sliderValueAt(px) { return (px - (this.trackX + 14)) / this.trackLen; }

  checkRect(k) { const c = this.checks[k]; return { x: c.cx - 17, y: c.cy - 17, w: 240, h: 34 }; }
  checked(k) { return k === 'cursor' ? Cursor.on : FS.active(); }

  update(dt) {
    if (!this.isOpen) return;
    if (this.drag) {
      if (Input.down) {
        this.setValue(this.drag, this.sliderValueAt(Input.x));
      } else {
        if (this.drag === 'sound') Sfx.play('UIClick');
        this.drag = null;
        Save.saveSettings();
      }
    }

    if (Input.clicked) {
      Input.clicked = false;
      const mx = Input.x, my = Input.y;
      for (const k in this.rows) {
        const r = { x: this.trackX - 10, y: this.rows[k].ty - 18, w: this.trackW + 20, h: 36 };
        if (inRect(r, mx, my)) {
          this.drag = k;
          this.setValue(k, this.sliderValueAt(mx));
          return;
        }
      }
      for (const k in this.checks) {
        if (inRect(this.checkRect(k), mx, my)) {
          if (k === 'fullscreen' && !FS.supported) return;
          Sfx.play('UIClick');
          if (k === 'cursor') {
            Cursor.on = !Cursor.on; Save.settings.cursor = Cursor.on; Cursor.apply(); Save.saveSettings();
          } else {
            FS.toggle();
          }
          return;
        }
      }
      if (inRect(this.okRect, mx, my)) { Sfx.play('UIClick'); this.close(); return; }
    }
  }

  // подписи у оригинала узкие (Georgia шире): сжимаем по горизонтали, выравнивание по левому краю
  narrow(ctx, str, x, y, size, color) {
    ctx.save(); ctx.translate(x, y); ctx.scale(0.8, 1);
    text(ctx, str, 0, 0, { size, color, stroke: null, align: 'left' });
    ctx.restore();
  }

  draw(ctx) {
    if (!this.isOpen) return;
    ctx.save();
    ctx.fillStyle = 'rgba(8,4,16,0.62)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    const box = Assets.spr('DIALOG_BOX');
    if (box) ctx.drawImage(box.img, this.x, this.y); else {
      ctx.fillStyle = 'rgba(24,12,38,0.95)'; ctx.fillRect(this.x, this.y, this.w, this.h);
    }
    const dark = '#4d1409';
    ctx.save();
    ctx.shadowColor = 'rgba(80,30,0,0.55)'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1;
    text(ctx, 'Настройки', this.x + this.w / 2, this.y + 58, { size: 31, color: '#fff3e2', stroke: null });
    ctx.restore();

    const track = Assets.spr('SLIDER_TRACK'), thumb = Assets.spr('SLIDER_THUMB');
    for (const k in this.rows) {
      const row = this.rows[k], v = this.value(k);
      this.narrow(ctx, row.label, this.x + 80, row.ly, 23, dark);
      if (track) ctx.drawImage(track.img, this.trackX, row.ty - track.h / 2 - 1, this.trackW, track.h + 2);
      else { ctx.fillStyle = '#5a3a20'; ctx.fillRect(this.trackX, row.ty - 5, this.trackW, 10); }
      const tx = this.trackX + 14 + this.trackLen * v;
      if (thumb) ctx.drawImage(thumb.img, tx - thumb.w / 2, row.ty - thumb.h / 2);
      else { ctx.fillStyle = '#3aa02a'; ctx.beginPath(); ctx.arc(tx, row.ty, 11, 0, 6.3); ctx.fill(); }
    }

    // флажки
    const cb = Assets.spr('CHECKBOX');
    for (const k in this.checks) {
      const c = this.checks[k];
      const disabled = k === 'fullscreen' && !FS.supported;
      ctx.save();
      if (disabled) ctx.filter = 'grayscale(1) opacity(0.55)';
      if (cb) ctx.drawImage(cb.img, this.checked(k) ? 0 : cb.fw, 0, cb.fw, cb.fh, c.cx - cb.fw / 2, c.cy - cb.fh / 2, cb.fw, cb.fh);
      this.narrow(ctx, c.label, this.x + 112, c.cy, 22, dark);
      ctx.restore();
    }

    // Ok
    uiWideButton(ctx, this.okRect, 'Ok');
  }
}

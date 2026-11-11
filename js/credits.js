// ===== «Создатели»: прокручивающийся список на деревянной табличке =====
'use strict';

const CREDITS = [
  ['h', 'Разработчики:'],
  ['s', ''],
  ['g', 'Компания Shiny Tales:'],
  ['s', ''],
  ['r', 'Продюсер'], ['n', 'Михаил Ларионов'],
  ['r', 'Гейм-дизайнер'], ['n', 'Елена Качанова'],
  ['r', 'Ведущий программист'], ['n', 'Александр Арбатский'],
  ['r', 'Программист игровой логики'], ['n', 'Антон Тимченко'],
  ['r', 'Программист спец-эффектов'], ['n', 'Наталья Шержукова'],
  ['r', 'Арт-директор'], ['n', 'Алексей Роменский'],
  ['r', 'Сценарий'], ['n', 'Михаил Ларионов'],
  ['r', 'Локализация'], ['n', 'Дарья Сколозубова'], ['n', 'Ирина Аветисова'],
  ['s', ''],
  ['g', 'Атмосфера от Strategic Music:'],
  ['s', ''],
  ['r', 'Продюсер'], ['n', 'Дмитрий Кузьменко'],
  ['r', 'Музыка'], ['n', 'Сергей Ейбог'], ['n', 'Захар Антонов'],
  ['r', 'Звуковой дизайн'], ['n', 'Станислав Полеско'],
  ['r', 'Голосовое озвучание'], ['n', 'Дмитрий Кузьменко'], ['n', 'Наталья Торопова'],
  ['r', 'Тексты реплик'], ['n', 'Дмитрий Кузьменко'], ['n', 'Андрей Бурмистров'],
  ['r', 'Актеры'], ['n', 'Анна Слынько'], ['n', 'Радик Галлиулин'], ['n', 'Василий Каземиров'],
  ['n', 'Василий Шелех'], ['n', 'Наталья Таррыничева'], ['n', 'Наталья Виноградова'],
  ['n', 'Михаил Хрусталев'], ['n', 'Екатерина Монастырская'], ['n', 'Павел Гапонов'],
  ['s', ''],
  ['h', 'Спасибо!'],
  ['g', 'Команда Shiny Tales.'],
];

class CreditsPanel {
  constructor() {
    this.isOpen = false;
    this.y = 0;               // смещение текста
    this.drag = null;
    this.lh = 30;
    this.total = CREDITS.length * this.lh;
    window.addEventListener('wheel', (e) => {
      if (this.isOpen) { this.y += e.deltaY * 0.6; this.clampY(); }
    }, { passive: true });
  }

  layout() {
    const x0 = Math.round((W - 386) / 2), y0 = Math.round((H - 448) / 2) - 24;
    return {
      x0, y0,
      view: { x: x0 + 56, y: y0 + 128, w: 274, h: 262 },
      back: { x: W / 2 - 80, y: y0 + 448 - 8, w: 160, h: 62 },
    };
  }
  clampY() { const L = this.layout(); this.y = clamp(this.y, -L.view.h * 0.2, this.total + L.view.h); }

  show() { this.isOpen = true; this.y = -this.layout().view.h * 0.2; this.drag = null; }
  close() { this.isOpen = false; }

  onKey(key) {
    if (!this.isOpen) return false;
    if (key === 'Escape' || key === 'Enter') this.close();
    else if (key === 'ArrowDown') { this.y += 30; this.clampY(); }
    else if (key === 'ArrowUp') { this.y -= 30; this.clampY(); }
    return true;
  }

  update(dt) {
    if (!this.isOpen) return;
    const L = this.layout();
    if (this.drag) {
      if (Input.down) { this.y = this.drag.y0 - (Input.y - this.drag.my); this.clampY(); }
      else this.drag = null;
    } else {
      this.y += 38 * dt;                 // медленная автопрокрутка
      if (this.y > this.total + L.view.h) this.y = -L.view.h * 0.2;
    }
    if (Input.clicked) {
      Input.clicked = false;
      if (inRect(L.back, Input.x, Input.y)) { Sfx.play('UIClick'); this.close(); return; }
      if (inRect(L.view, Input.x, Input.y)) this.drag = { my: Input.y, y0: this.y };
    }
  }

  draw(ctx) {
    if (!this.isOpen) return;
    ctx.save(); ctx.fillStyle = 'rgba(8,4,16,0.62)'; ctx.fillRect(0, 0, W, H); ctx.restore();
    const L = this.layout();
    const box = Assets.spr('DIALOG_BOX');
    if (box) ctx.drawImage(box.img, L.x0, L.y0);
    text(ctx, 'Создатели', L.x0 + 193, L.y0 + 64, { size: 28, color: '#330f01', stroke: null });

    ctx.save();
    ctx.beginPath(); ctx.rect(L.view.x, L.view.y, L.view.w, L.view.h); ctx.clip();
    const cx = L.view.x + L.view.w / 2;
    for (let i = 0; i < CREDITS.length; i++) {
      const [k, t] = CREDITS[i];
      const yy = L.view.y + L.view.h + i * this.lh - this.y;          // строки выезжают снизу вверх
      if (!t || yy < L.view.y - 30 || yy > L.view.y + L.view.h + 30) continue;
      const st = { h: { size: 25, c: '#330f01', b: true }, g: { size: 19, c: '#7a3a08', b: true },
        r: { size: 17, c: '#5a3a20', b: false }, n: { size: 19, c: '#330f01', b: true } }[k];
      text(ctx, t, cx, yy, { size: st.size, color: st.c, stroke: null, bold: st.b });
    }
    ctx.restore();
    uiButton(ctx, L.back, 'Назад');
  }
}

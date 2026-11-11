// ===== Начало игры: записка, статуэтка кота и вводный диалог (по оригиналу) =====
// Новая игра, первый уровень: героиня замечает записку на стойке → игрок открывает её →
// рядом появляется статуэтка кота → её нужно «согреть» (потереть мышью) → кот оживает и говорит →
// начинается уровень. Дальше записку можно перечитать, а статуэтка отзывается на клик.
// Тексты — из Project_ru.met оригинала.
'use strict';

const NOTE_TEXT = [
  'Дорогой гость!',
  'Надеюсь, ты придешь вовремя. Сейчас лето, полнолуние. В отличие от оборотней, в эти ночи я становлюсь слишком человечным. И сейчас оставляю этот бар, чтобы вернуться, наконец, к нормальной жизни. Объяснять подробности уже нет сил, свобода манит. Удачи на новом месте!',
  'Джек.',
  'PS: Чуть не забыл! Рядом с запиской я оставил фигурку Кота. Согрей ее в ладонях, потри, а затем подуй.',
];

const STORY_PRE = [
  ['girl', 'Здесь так заброшено и... пугающе тихо. Но я не могла ошибиться с баром!'],
  ['girl', 'А что это за записка на стойке?'],
];
const STORY_TALK = [
  ['cat', 'Кто же гладит против шерсти, Джек...'],
  ['cat', 'Стоп. Ты - не Джек. О мой хвост, неужели этот пройдоха опять сбежал!'],
  ['girl', 'Какой Джек? И почему кот разговаривает со мной? Что здесь происходит?'],
  ['cat', 'Слушай, объясняю один раз. Это Призрачный Бар, созданный одной могущественной Колдуньей.'],
  ['cat', 'Джек был назначен барменом, но в последнее время он все чаще пытался сбежать.'],
  ['cat', 'И на этот раз он здорово рассчитал время. Я уже чувствую первого клиента, приготовься!'],
  ['girl', 'Но что мне делать?'],
];

Object.assign(BarScene.prototype, {

  // положение предметов на стойке (измерено по кадру оригинала)
  NOTE_POS: { x: 208, y: 495, s: 1.0 },       // левый верх кадра записки (165×187)
  CAT_POS: { x: 327, y: 511, s: 1.15 },       // левый верх кадра статуэтки (168×133)

  initNote() {
    this.noteOpen = false;
    this.noteT = 0;
    this.noteHover = false;
    this.catHover = false;
    this.catBump = 0;          // «подпрыгивание» статуэтки по клику
    this.catAppear = 1;        // 0..1 — появление статуэтки
    this.rubGlow = 0;          // 0..1 — насколько «согрета» статуэтка
    this.bub = null;           // текущая реплика
    this.cursorSet = false;
    this.noteHintT = 0;
    const read = !!Save.get(Save.K_NOTE);
    // первый уровень новой игры — вводная сцена; позже статуэтка просто стоит на стойке
    this.story = (this.scenarioIdx === 0 && !read) ? { stage: 'pre', i: 0, t: 0 } : null;
    this.catVisible = !!this.story;            // статуэтка лежит на стойке вместе с запиской с самого начала вводной сцены; после оживления кота её нет
    this.catGone = false;
    this.noteAlpha = this.story ? 1 : 0;       // записка лежит на стойке только во вводной сцене; после оживления кота исчезает вместе со статуэткой
    this.pillowCat = this.story ? 0 : 1;       // живой кот на подушке: в начале игры его нет, появляется после «оживления» статуэтки
    this.pillowTarget = this.story ? 0 : 1;
    if (this.story) { this.catAppear = 1; this.bub = null; this.sayT = -0.8; }
    this.noteWait = !!this.story;      // true — уровень пока не стартует
  },

  noteRect() { const p = this.NOTE_POS; return { x: p.x + 18 * p.s, y: p.y + 80 * p.s, w: 130 * p.s, h: 68 * p.s }; },
  catRect() { const p = this.CAT_POS; return { x: p.x + 10 * p.s, y: p.y + 18 * p.s, w: 118 * p.s, h: 80 * p.s }; },

  openNote() { this.noteOpen = true; this.noteT = 0; this.sfx('GameClickNote'); },

  closeNote() {
    if (!this.noteOpen) return;
    this.noteOpen = false;
    this.sfx('GameClickNote');
    const st = this.story;
    if (st && st.stage === 'wait') {
      // записка прочитана — дальше нужно потереть статуэтку (она уже лежит рядом с запиской)
      st.stage = 'rub'; st.t = 0; st.rub = 0; st.lx = null;
    }
  },

  // ---------- реплики ----------
  say(who, textStr) { this.bub = { who, text: textStr, t: 0, dur: 1.6 + textStr.length * 0.055 }; },

  // вся логика вводной сцены; true — игра стоит
  updateStory(dt) {
    const st = this.story;
    st.t += dt;
    const lines = st.stage === 'pre' ? STORY_PRE : st.stage === 'talk' ? STORY_TALK : null;
    if (lines) {
      if (!this.bub && st.t > 0.9 + (st.i === 0 ? 0.6 : 0.0)) this.say(...lines[st.i]);
      if (this.bub) {
        this.bub.t += dt;
        const click = Input.clicked && this.bub.t > 0.35 && !inRect(this.menuBtnRect(), Input.x, Input.y);
        if (click) Input.clicked = false;
        if (click || this.bub.t > this.bub.dur) {
          this.bub = null; st.i++; st.t = 0;
          if (st.i >= lines.length) {
            if (st.stage === 'pre') { st.stage = 'wait'; st.i = 0; st.t = 0; }
            else {
              // вводная сцена пройдена целиком: только теперь она считается увиденной (если выйти раньше — начнётся заново)
              Save.set(Save.K_NOTE, '1');
              this.story = null; this.noteWait = false; this.timers.after(0.6, () => this.beginPlay());
            }
          }
        }
      }
      return;
    }
    if (st.stage === 'wait') {
      this.noteHintT += dt;
      return;
    }
    if (st.stage === 'rub') {
      // «согрей в ладонях, потри»: водим мышью по статуэтке
      if (this.catAppear >= 1) {
        const over = inRect(this.catRect(), Input.x, Input.y) && Input.y !== undefined;
        if (over && st.lx !== null) st.rub += Math.hypot(Input.x - st.lx, Input.y - st.ly);
        st.lx = over ? Input.x : null; st.ly = Input.y;
        this.rubGlow = Math.min(1, st.rub / 900);
        this.catHover = over;
        if (st.rub >= 900) {
          this.sfx('GameClickStatuette');
          this.catBump = 0.4;
          st.stage = 'talk'; st.i = 0; st.t = -0.2; this.bub = null;
          this.pillowTarget = 1;                       // кот оживает и появляется на подушке
          this.catGone = true;                         // а статуэтка исчезает (в оригинале она не остаётся)
        }
        // подсказка, если игрок не догадался
        if (st.t > 5) this.noteHintT = st.t;
      }
    }
  },

  // вызывается из update: true — игра стоит, ввод израсходован
  updateNote(dt) {
    if (this.noteOpen) {
      this.noteT += dt;
      if (Input.clicked && this.noteT > 0.15) { Input.clicked = false; this.closeNote(); }
      return true;
    }
    if (this.catGone && this.noteAlpha > 0) this.noteAlpha = Math.max(0, this.noteAlpha - dt / 0.8);
    if (this.catGone) {                                  // статуэтка исчезает, когда кот оживает
      this.catAppear = Math.max(0, this.catAppear - dt / 0.8);
      if (this.catAppear <= 0) this.catVisible = false;
    } else if (this.catVisible && this.catAppear < 1) this.catAppear = Math.min(1, this.catAppear + dt / 0.7);
    if (this.catBump > 0) this.catBump = Math.max(0, this.catBump - dt);
    if (this.pillowCat < this.pillowTarget) this.pillowCat = Math.min(this.pillowTarget, this.pillowCat + dt / 0.8);

    const live = (this.state === 'intro' || this.state === 'playing') && !this.dragObj;
    // кнопка «Меню» (раньше реагировала только клавиша Esc)
    if (live && Input.clicked && inRect(this.menuBtnRect(), Input.x, Input.y)) {
      Input.clicked = false; this.sfx('UIClick'); this.paused = true; return true;
    }

    if (this.dlg) {                                   // сюжетный диалог уровня
      if (live) this.noteHover = this.catHover = false;
      return this.updateDlg(dt);
    }

    const st = this.story;
    if (st) {
      const stage = st.stage;
      this.updateStory(dt);
      // записку можно открыть только на нужном шаге
      this.noteHover = stage === 'wait' && inRect(this.noteRect(), Input.x, Input.y);
      Cursor.set(this.noteHover ? 'pointer' : 'default');
      if (this.noteHover && Input.clicked) { Input.clicked = false; this.openNote(); }
      return true;                                    // пока идёт сцена, бар не живёт
    }

    this.noteHover = live && this.noteAlpha > 0.5 && inRect(this.noteRect(), Input.x, Input.y);
    this.catHover = live && this.catVisible && this.catAppear >= 1 && inRect(this.catRect(), Input.x, Input.y);
    const over = this.noteHover || this.catHover;
    if (over) Cursor.set('pointer'); else if (this.cursorSet) Cursor.set('default');
    this.cursorSet = over;

    if (Input.clicked && live) {
      if (this.noteHover) { Input.clicked = false; this.openNote(); }
      else if (this.catHover) { Input.clicked = false; this.sfx('GameClickStatuette'); this.catBump = 0.4; }
    }
    return false;
  },

  // ---------- отрисовка ----------
  // записка и статуэтка — сразу за фоном, до бутылок и клиентов
  drawNoteItems(ctx) {
    const n = this.NOTE_POS, c = this.CAT_POS;
    const st = this.story;
    if (this.noteAlpha > 0.01) drawFrame(ctx, 'NOTE', 0, n.x, n.y, { alpha: this.noteAlpha });
    let glow = 0;
    if (st && st.stage === 'wait') glow = 0.35 + 0.65 * Math.pow(Math.sin(this.noteHintT * 3), 2);   // пульс: «открой меня»
    if (this.noteHover) glow = 1;
    if (glow > 0.01 && this.noteAlpha > 0.01) drawFrame(ctx, 'NOTE', 1, n.x, n.y, { alpha: glow * this.noteAlpha });

    if (this.catVisible && this.catAppear > 0) {
      const a = this.catAppear, drop = (1 - a) * -40;
      const bump = this.catBump > 0 ? Math.sin(this.catBump / 0.4 * Math.PI) * -8 : 0;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(c.x, c.y + drop);
      ctx.scale(c.s, c.s);
      drawFrame(ctx, 'STATUETTE_SHADOW', 0, 0, 0);                     // тень остаётся на месте
      drawFrame(ctx, 'STATUETTE', 0, 0, bump / c.s);                   // кот подпрыгивает
      const g = (st && st.stage === 'rub') ? this.rubGlow : (this.catHover ? 1 : 0);
      if (g > 0.01) drawFrame(ctx, 'STATUETTE', 1, 0, bump / c.s, { alpha: g });
      ctx.restore();
    }

    // подсказки
    if (st && st.stage === 'wait' && this.noteHintT > 4) {
      ctx.save(); ctx.globalAlpha = clamp((this.noteHintT - 4) / 1.0, 0, 1);
      text(ctx, 'Откройте записку', n.x + 92, n.y + 40, { size: 20, color: '#fff3d0' });
      ctx.restore();
    }
    if (st && st.stage === 'rub' && this.catAppear >= 1 && st.t > 3) {
      ctx.save(); ctx.globalAlpha = clamp((st.t - 3) / 1.0, 0, 1);
      text(ctx, 'Потрите статуэтку мышью', c.x + 96, c.y - 10, { size: 20, color: '#fff3d0' });
      ctx.restore();
    }
  },

  // реплика героини/кота в облачке
  // реплика в облачке с «хвостиком», указывающим на говорящего (кот — справа от облачка, на подушке)
  drawStoryBubble(ctx) {
    const b = this.bub || this.tutBub; if (!b) return;
    const a = Math.min(1, b.t / 0.2) * Math.min(1, (b.dur - b.t) / 0.2 + 0.0001);
    const cat = b.who === 'cat';
    const size = cat ? 21 : 19;
    ctx.save();
    ctx.font = 'bold ' + size + 'px Georgia, serif';
    const maxW = cat ? 178 : 300;
    const lines = mg1Wrap(ctx, b.text, maxW);
    const lh = size * 1.28;
    const bw = Math.ceil(Math.max(...lines.map((l) => ctx.measureText(l).width))) + 34;
    const bh = Math.ceil(lines.length * lh + 30);
    let bx, by, tail;                        // tail: [основание слева, основание справа, острие]
    if (cat) {
      // положение измерено по кадру оригинала: облачко слева от кота, хвостик острием вправо-вверх к коту
      bx = 735 - bw; by = 179;
      tail = [[bx + bw - 10, by + 46], [bx + bw - 10, by + 14], [bx + bw + 30, by + 12]];
    } else {
      // остальные говорящие: облачко над сценой, хвостик вниз к месту, откуда звучит голос
      const POS = { girl: [250, 360], npc: [334, 200], merchant: [650, 330], guest: [334, 200] };
      const pp = POS[b.who] || POS.guest;
      bx = pp[0] - bw / 2; by = pp[1];
      tail = [[bx + bw / 2 - 16, by + bh - 6], [bx + bw / 2 + 8, by + bh - 6], [bx + bw / 2 + 14, by + bh + 30]];
    }
    ctx.globalAlpha = clamp(a, 0, 1);
    // хвостик под рамкой: основание скрыто за облачком, наружу выходит острие
    ctx.fillStyle = '#fbe7b4'; ctx.strokeStyle = '#d6aa55'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(tail[0][0], tail[0][1]);
    ctx.quadraticCurveTo((tail[0][0] + tail[2][0]) / 2 + (cat ? 0 : -3), (tail[0][1] + tail[2][1]) / 2 + (cat ? 6 : 0), tail[2][0], tail[2][1]);
    ctx.quadraticCurveTo((tail[1][0] + tail[2][0]) / 2 + (cat ? 0 : 3), (tail[1][1] + tail[2][1]) / 2 - (cat ? 2 : 0), tail[1][0], tail[1][1]);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    MG1Scene.prototype.draw9.call(this, ctx, 'BUBBLE_BOX', bx, by, bw, bh);
    ctx.fillStyle = '#3a1608';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    lines.forEach((l, i) => ctx.fillText(l, bx + bw / 2, by + 15 + (i + 0.5) * lh));
    ctx.restore();
  },

  drawNoteOverlay(ctx) {
    this.drawStoryBubble(ctx);
    if (!this.noteOpen) return;
    const k = Math.min(1, this.noteT / 0.2);
    ctx.save();
    ctx.fillStyle = 'rgba(8,4,16,' + (0.7 * k) + ')';
    ctx.fillRect(0, 0, W, H);
    const s = Assets.spr('NOTEFULL');
    const sc = (0.85 + 0.15 * k) * Math.min(1, (H - 40) / (s ? s.h : 600));
    ctx.globalAlpha = k;
    ctx.translate(W / 2, H / 2);
    ctx.scale(sc, sc);
    const w = s ? s.w : 580, h = s ? s.h : 670;
    if (s) ctx.drawImage(s.img, -w / 2, -h / 2);
    // текст записки «от руки» на пергаменте
    ctx.fillStyle = '#4a2c12';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    let y = -h / 2 + 92;
    const x0 = -w / 2 + 88, mw = w - 176;
    NOTE_TEXT.forEach((para, i) => {
      const font = i === 0 ? 'italic bold 32px ' : i === 2 ? 'italic bold 32px ' : i === 3 ? 'italic 20px ' : 'italic 23px ';
      ctx.font = font + 'Georgia, serif';
      const lines = mg1Wrap(ctx, para, mw);
      const lh = (i === 0 || i === 2) ? 42 : i === 3 ? 26 : 30;
      lines.forEach((ln) => {
        const dx = i === 2 ? mw - ctx.measureText(ln).width - 16 : 0;       // подпись справа
        ctx.fillText(ln, x0 + dx, y); y += lh;
      });
      y += i === 0 ? 8 : (i === 1 ? 6 : 18);
    });
    ctx.restore();
  },
});

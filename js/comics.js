// ===== Комиксы и озвучка: трамвай → вход в бар (интро), магическое дерево (финал) =====
'use strict';

// Последовательный проигрыватель озвучки pb_story_N (mp3 по требованию, из assets/voices/)
class VoicePlayer {
  constructor() { this.audio = null; this.idx = -1; }

  busy() { return !!this.audio; }

  play(i, onDone) {
    this.stop();
    const a = new Audio('assets/voices/pb_story_' + i + '.mp3');
    a.volume = clamp(Sfx.volume, 0, 1);
    this.audio = a; this.idx = i;
    const finish = () => {
      if (this.audio !== a) return;
      this.audio = null; this.idx = -1;
      if (onDone) onDone();
    };
    a.onended = finish;
    // если браузер запретит автозапуск — считаем фразу проигранной (комикс не зависнет)
    a.play().catch(finish);
  }

  stop() {
    const a = this.audio;
    if (a) { this.audio = null; this.idx = -1; a.onended = null; a.onpause = null; try { a.pause(); } catch (e) {} }
  }
}

// ============================================================
//  Сцена комиксов
// ============================================================
// тексты озвучки (из Project_ru.met): показываются внизу, как в оригинале
const COMICS_SUBS = {
  1: 'Это было последнее дело на сегодня. Обыкновенное интервью.',
  2: 'Мы договорились о встрече в уютном баре, из тех что прячутся в подворотнях старого города.',
  3: 'Смотря на улицы через окна трамвая, я перебирала в голове список вопросов.',
  4: 'Погрузившись в свои мысли, я не сразу обратила внимание на происходящее.',
  5: 'Вместо радостно светящихся окон меня встретила кромешная темнота.',
  6: 'Но профессиональное любопытство победило. И обуздав страх, я вошла внутрь.',
  7: 'Героиня: Что это... Где это?',
  8: 'Кот: Раз ты попала сюда вместе с нами, узнаешь!',
  9: 'Хозяйка: Не переживай, крошка, просто очередной цикл завершен.',
  10: 'Джек: Да, ради этого зрелища я готов прожить барменом еще пару сотен лет.',
  11: 'Кот: Ну ладно, пора ей домой, так?',
  12: 'Хозяйка: Отправляй, Джек. Это по твоей части.',
  13: 'Джек: Извини, но тебе и правда пора. Не грусти!',
};

class ComicsScene {
  constructor(app, kind) {
    this.app = app;
    this.kind = kind;                       // 'intro' | 'end'
    this.isComics = true;
    this.t = 0;                             // время текущей под-сцены
    this.state = 'in';                      // in | run | out
    this.fade = 0;                          // 0 чёрный → 1 открыто
    this.si = 0;                            // индекс под-сцены
    this.scenes = (kind === 'intro')
      ? [ { type: 'tram', voices: [1, 2, 3] }, { type: 'enter', voices: [4, 5, 6] } ]
      : [ { type: 'tree', voices: [7, 8, 9, 10, 11, 12, 13] } ];
    this.player = new VoicePlayer();
    this.sub = '';                          // текущий субтитр
    this.voiceQueue = [];
    this.gapT = 0;
    this.finishing = false;
    this.endT = 0;
    Music.play('Storyline', 0.3);
    this.startScene();
  }

  get cur() { return this.scenes[this.si]; }

  startScene() {
    this.t = 0;
    this.state = 'in';
    this.fade = 0;
    this.voiceQueue = this.cur.voices.slice();
    this.sub = '';
    this.gapT = 0.9;                        // пауза перед первой фразой
    this.finishing = false;
    this.endT = 0;
  }

  // -------- управление --------
  clickAdvance() {
    if (this.state !== 'run') return;
    if (this.player.busy()) {
      this.player.stop();
      this.gapT = Math.min(this.gapT, 0.35);   // фраза прервана — короткая пауза
    } else {
      this.gapT = 0;                          // пауза пропускается
    }
  }

  skipAll() {
    Cursor.set('default');
    this.player.stop();
    this.app.comicsDone(this.kind);
  }

  nextVoice() {
    if (!this.voiceQueue.length) return false;
    const v = this.voiceQueue.shift();
    this.sub = COMICS_SUBS[v] || '';
    // звук «толчка»/перехода не нужен — озвучка задаёт темп
    this.player.play(v, () => { this.gapT = 0.7; });
    return true;
  }

  update(dt) {
    const s = this.t = this.t + dt;

    if (this.state === 'in') {
      this.fade = Math.min(1, this.fade + dt / 0.8);
      if (this.fade >= 1) { this.state = 'run'; this.nextVoice(); }
      return;
    }

    if (this.state === 'out') {
      this.fade = Math.max(0, this.fade - dt / 0.7);
      if (this.fade <= 0) {
        this.si++;
        if (this.si >= this.scenes.length) { this.app.comicsDone(this.kind); return; }
        this.startScene();
      }
      return;
    }

    // run
    if (Input.clicked) {
      // ссылка «Пропустить» обрабатывается в drawCommon — весь прочий клик ускоряет
      if (!inRect(this.skipRect(), Input.x, Input.y)) { Input.clicked = false; this.clickAdvance(); }
    }

    if (this.finishing) {
      this.endT -= dt;
      if (this.endT <= 0) { this.state = 'out'; }
      return;
    }

    if (!this.player.busy()) {
      this.gapT -= dt;
      if (this.gapT <= 0) {
        if (!this.nextVoice()) {
          if (this.voiceQueue.length === 0 && !this.player.busy() && this.gapT <= 0) {
            this.finishing = true;
            this.endT = 1.6;              // хвост после последней фразы
          }
        }
      }
    }
  }

  skipRect() {
    const w = 170, h = 34;
    return { x: W - w - 24, y: 708, w, h };
  }

  // -------- отрисовка --------
  draw(ctx) {
    if (!this.cur) return;                   // комикс закончился, идёт переход к игре
    const type = this.cur.type;
    if (type === 'tram') this.drawTram(ctx);
    else if (type === 'enter') this.drawEnter(ctx);
    else this.drawTree(ctx);
    this.drawCommon(ctx);
  }

  drawCommon(ctx) {
    // затемнение при переходах
    if (this.fade < 1) {
      ctx.save(); ctx.globalAlpha = 1 - this.fade;
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.restore();
    }
    // под сценами без «киноленты» — тёмная подложка под субтитры
    if (this.cur.type !== 'tram' && this.sub) {
      const g = ctx.createLinearGradient(0, 600, 0, H);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.35, 'rgba(0,0,0,0.75)'); g.addColorStop(1, 'rgba(0,0,0,0.85)');
      ctx.fillStyle = g; ctx.fillRect(0, 600, W, H - 600);
    }
    // субтитры под картинкой (светлый шрифт на чёрном)
    if (this.sub) {
      ctx.save();
      ctx.font = '19px Georgia, serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#f3eee6';
      ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 4;
      ctx.fillText(this.sub, W / 2, 686, W - 60);
      ctx.restore();
    }
    // «Пропустить» — подчёркнутая ссылка справа внизу
    const r = this.skipRect();
    const hov = inRect(r, Input.x, Input.y);
    ctx.save();
    ctx.font = '25px Georgia, serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillStyle = hov ? '#d9e6c8' : '#a3b394';
    const lbl = 'Пропустить', tw = ctx.measureText(lbl).width;
    ctx.fillText(lbl, W - 26, 728);
    ctx.fillRect(W - 26 - tw, 741, tw, 2);
    ctx.restore();
    Cursor.set(hov ? 'pointer' : 'default');
    if (Input.clicked && hov) {
      Input.clicked = false;
      Sfx.play('UIClick');
      this.skipAll();
    }
  }

  // ===== Под-сцена 1: трамвай =====
  // проёмы (абсолютные координаты) в слое middle = [x, 127+34, w, 384]

  drawTram(ctx) {
    const t = this.t;
    // два кадра салона (разный свет) плавно перетекают друг в друга, а не переключаются рывком
    const fa = (1 - Math.cos(2 * Math.PI * t / 2.2)) / 2;
    const SHIFT = 67;                        // видна полоса арта y=35..603; текст и «Пропустить» — у нижнего края, как в оригинале

    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 35, W, 568); ctx.clip();

    ctx.save();
    ctx.translate(0, -SHIFT);
    const layer = (id, y) => {                 // кадр 0 + кадр 1 с плавной прозрачностью
      drawSpr(ctx, id, W / 2, y, { frame: 0, anchor: 'bc' });
      drawSpr(ctx, id, W / 2, y, { frame: 1, anchor: 'bc', alpha: fa });
    };
    layer('COMICS_UP', 127);
    layer('COMICS_DOWN', H);

    // город за окнами: улица едет с постоянной скоростью, позиция округлена до пикселя (без дрожи)
    const openings = ComicsScene.TRAM_OPENINGS;
    const SPEED = 150, PERIOD = 1331;
    const scroll = Math.round((t * SPEED) % PERIOD);
    for (const o of openings) {
      ctx.save();
      ctx.beginPath(); ctx.rect(o[0], o[1], o[2], o[3]); ctx.clip();
      const yOff = o[1] - 48;
      for (let x = -scroll; x < W; x += PERIOD) drawSpr(ctx, 'CSTREET', x, yOff, { anchor: 'tl', scale: 1 });
      ctx.restore();
    }

    // фонарь привязан к улице: плывёт за стёклами дверей с той же скоростью, что и город.
    // Два кадра фонаря смещены друг относительно друга (столб на x=280 и x=308) — совмещаем по столбу
    // и плавно перетекаем, иначе столб «дёргается» на каждом переключении.
    const lampWorld = 900, LS = 0.85;
    const la = (1 - Math.cos(2 * Math.PI * t / 1.6)) / 2;
    for (let k = -1; k <= 1; k++) {
      const px = Math.round(lampWorld - scroll + k * PERIOD);            // x столба на экране
      if (px < -250 || px > W + 250) continue;
      // фонарь стоит на улице → виден во всех проёмах (окна и стёкла дверей), как и сама улица;
      // за стенами между проёмами он честно скрыт слоем middle
      for (let di = 0; di < openings.length; di++) {
        const o = openings[di];
        ctx.save();
        ctx.beginPath(); ctx.rect(o[0], o[1], o[2], o[3]); ctx.clip();
        const y0 = o[1] + 60;
        drawSpr(ctx, 'CLAMP1', Math.round(px - 280 * LS), y0, { anchor: 'tl', scale: LS });
        drawSpr(ctx, 'CLAMP2', Math.round(px - 308 * LS), Math.round(y0 - 3 * LS), { anchor: 'tl', scale: LS, alpha: la });
        ctx.restore();
      }
    }
    layer('COMICS_MID', 565);                                   // сиденья и рамы закрывают улицу

    // персонажи: координаты левого верхнего угла в системе арта (совмещены по кадру оригинала, масштаб 1:1)
    const bob = Math.round(Math.sin(t * 1.4) * 2);                       // лёгкое покачивание героини, по целым пикселям
    drawSpr(ctx, 'CCH2', 0, 234, { anchor: 'tl' });                       // мужчина в шляпе (прижат к левому краю)
    drawSpr(ctx, 'CCH3', 40, 254, { anchor: 'tl' });                      // парень с телефоном
    drawSpr(ctx, 'CGIRLSH', 366, 678, { anchor: 'bc', alpha: 0.8 });
    drawSpr(ctx, 'CGIRL', 246, 164 + bob, { anchor: 'tl' });              // героиня у поручня
    drawSpr(ctx, 'CBAG', 804, 365, { anchor: 'tl' });                     // чемодан
    drawSpr(ctx, 'CCH1', 835, 158, { anchor: 'tl' });                     // мужчина справа (спиной)
    ctx.restore();                                                        // конец сдвига арта
    ctx.restore();                                                        // конец клипа
  }

  // ===== Под-сцена 2: вход в бар =====
  drawEnter(ctx) {
    const t = this.t;
    const bgw = 1450;
    // камера медленно едет от окна справа к двери; героиня проходит немного и ОСТАНАВЛИВАЕТСЯ У ОКНА
    // (витрина в арте занимает x≈600..1080), дальше стоит неподвижно, как в оригинале
    const camP = Math.min(1, t / 14);
    const camX = -(bgw - W) * (1 - camP);

    ctx.save();
    ctx.translate(camX, 0);
    drawSpr(ctx, 'CENTER', 0, 0, { anchor: 'tl' });

    const WALK = 7;                                         // секунд ходьбы
    const lin = Math.min(1, t / WALK);
    const p = 1 - (1 - lin) * (1 - lin);                    // замедление к остановке
    const gx = 1250 - (1250 - 840) * p;                     // остановка напротив окна
    const gbob = lin >= 1 ? 0 : Math.abs(Math.sin(t * 5)) * 4 * Math.min(1, (1 - lin) * 4);
    drawSpr(ctx, 'CENTERG', gx, H - 4 + gbob, { anchor: 'bc', scale: 1 });
    ctx.restore();
  }

  // ===== Под-сцена 3: магическое дерево (финал) =====
  drawTree(ctx) {
    const t = this.t;
    // камера поднимается от людей к кроне и луне
    const dur = 34;
    const p = Math.min(1, t / dur);
    const camY = -332 + 332 * p;            // -332 → 0
    ctx.save();
    ctx.translate(0, camY);
    drawSpr(ctx, 'CTREE', 0, 0, { anchor: 'tl' });
    // светлячки (аддитивно: тёмный фон оверлея не мешает)
    const la = 0.5 + 0.3 * Math.sin(t * 1.15);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    drawSpr(ctx, 'CTREEL', 512, 430, { anchor: 'cc', alpha: la });
    ctx.restore();
    ctx.restore();
  }
}

// [x, y, w, h] проёмов в слое middle (окна и стёкла дверей)
ComicsScene.TRAM_OPENINGS = [
  [0, 161, 295, 384],    // левое окно
  [419, 161, 114, 384],  // левое стекло двери
  [613, 161, 115, 384],  // правое стекло двери
  [855, 161, 129, 384],  // правое окно
  [986, 161, 38, 384],   // правый край
];

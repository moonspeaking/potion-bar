// ===== Обучение первого уровня (порт run_tutorial / tutorialBlink из PotionBarBaseGame) =====
// После вводной сцены в бар входит авантюрист с заказом; кот подсказывает каждый шаг, нужные предметы
// мигают, лишние недоступны. Таймер уровня и терпение клиента стоят. Тексты — из Project_ru.met оригинала.
// Условия шагов определяются по состоянию бара (а не по колбэкам, как в оригинале).
'use strict';

const TUT_COLOR = { 0: 'красной', 1: 'фиолетовой', 2: 'голубой', 3: 'зелёной', 4: 'белой', 5: 'жёлтой' };

Object.assign(BarScene.prototype, {

  needTutorial() { return this.scenarioIdx === 0 && !Save.get(Save.K_TUT); },

  // конец вводной части: обучение (если ещё не пройдено) или сразу уровень
  beginPlay() {
    if (this.needTutorial()) this.startTutorial();
    else this.preStory(() => this.startLevel());
  },

  // реальный старт таймера уровня (из startLevel без смены состояния)
  beginClock() {
    this.timers.after(TIMING.spawnFirst, () => this.addClient());
    this.spawnIntervalT = TIMING.spawnInterval;
    this.catRandom();
  },

  startTutorial() {
    this.state = 'playing';
    this.tutorialActive = true;
    this.tutBlink = new Set();
    this.tutAllow = null;
    this.tutBottle = null;
    this.tutIng = this.ingBottles.length ? this.ingBottles[0].ingredientID : 2;
    this.tutStep = -1;
    this.tutT = 0;
    this.tutBub = null;
    this.timers.after(0.4, () => {
      // дверь открывается, входит авантюрист с заказом: жидкость + клевер + лотос + амулет
      this.sfx('GameClientComing');
      this.openDoor();
      this.timers.after(0.14, () => {
        this.clients[0].init(2, 1, { ingredientID: this.tutIng, spiciesID: [7], decorID: 1, amuletID: 1 });
        this.sortClientInCommon(this.clients[0]);
      });
    });
    this.timers.after(1.4, () => this.tutNext());
  },

  // ---------- сценарий шагов ----------
  tutSteps() {
    const col = TUT_COLOR[this.tutIng] || '';
    const bottlesRack = () => this.bottles.filter((b) => b.step === 0 && b.hitActive);
    const ing = () => this.ingBottles.filter((b) => b.ingredientID === this.tutIng);
    const burners = () => this.burners.filter((b) => !b.closed && !b.bottle);
    const spice = () => this.spices.filter((s) => s.spiciesID === 7);
    const decor = () => this.decors.filter((d) => d.decorID === 1);
    const amulet = () => this.amulets.filter((a) => a.amuletID === 1);
    const cl = () => this.clients[0];
    const held = () => this.dragObj === this.tutBottle;
    return [
      { text: 'Этот авантюрист хочет ' + (col ? col + ' ' : '') + 'жидкости с клевером. Я тебе покажу, как сварить ее.', wait: 4.5 },
      { text: 'Возьми стакан, висящий над барной стойкой.', blink: bottlesRack,
        done: () => { const b = this.bottles.find((x) => x.step === 1); if (b) this.tutBottle = b; return !!b; } },
      { text: 'Теперь наполни его жидкостью. Бутылки под барной стойкой, нам нужна ' + (col ? col.replace(/ой$/, 'ая') : 'нужная') + '.', blink: ing,
        done: () => this.tutBottle.step >= 2 },
      { text: 'Теперь магическую жидкость нужно подогреть. Поставь стакан на конфорку.', blink: burners,
        done: () => !!this.tutBottle.burner },
      { text: 'Когда жидкость нагреется, вылетит пробка. Подождем...', blink: () => [],
        done: () => this.tutBottle.step === 3 },
      { text: 'Теперь добавим ингредиенты. Положи в стакан лепесток клевера.', blink: spice, allow: () => [this.tutBottle],
        done: () => this.tutBottle.spicies.includes(7) },
      { text: 'Пока зелье варится, оно снова ненадолго затыкается пробкой...', blink: () => [],
        done: () => this.tutBottle.step === 5 },
      { text: 'Наконец, украшения. Подставь стакан к цветку лотоса.',
        blink: () => (held() ? decor() : [this.tutBottle]),
        done: () => this.tutBottle.decor === 1 },
      { text: 'Чудесно! Твой первый магический напиток готов, отдай его нашему парню.',
        blink: () => (held() ? [cl()] : [this.tutBottle]),
        done: () => cl().script === 'drink' || cl().step === 1 || cl().amuletShown || this.tutBottle.client === cl() },
      { text: 'Подождем, пока он пьет. Возможно, клиент захочет что-то еще.', blink: () => [],
        done: () => cl().step === 1 },
      { text: 'Иногда мы приторговываем амулетами, зачем отказываться от лишних денег? Отдай его покупателю.',
        blink: () => (this.dragObj && this.dragObj.type === 6 ? [cl()] : amulet()),
        done: () => cl().script === 'amuletGot' || cl().step === 0 || !cl().active || this.tutBottle.step === 7 },
      { text: 'Не забудь забрать деньги. Это лунное серебро и оно еще пригодится нам в будущем.',
        blink: () => (this.tutBottle.step === 7 ? [this.tutBottle] : []),
        done: () => this.tutBottle.step === 0 && this.tutBottle.client === null },
      { text: 'Если ты не успеешь снять зелье с плиты, оно испортится. Тогда его можно только вылить в раковину.',
        blink: () => [this.sink], wait: 6.5 },
      { text: 'У тебя отлично получается! Посетители будут довольны.', blink: () => [], wait: 3.5, last: true },
    ];
  },

  tutNext() {
    if (!this.tutorialActive) return;
    if (!this.tutList) this.tutList = this.tutSteps();
    this.tutStep++;
    this.tutT = 0;
    const s = this.tutList[this.tutStep];
    if (!s) { this.endTutorial(); return; }
    this.tutBub = { who: 'cat', text: s.text, t: 0, dur: Infinity };
    // новая реплика: короткий щелчок «появления»
    if (this.tutStep > 0) this.sfx('GameRemark', 0.6);
  },

  // вызывается из update каждый кадр
  updateTutorial(dt) {
    if (!this.tutorialActive) return;
    if (this.tutBub) this.tutBub.t += dt;
    const s = this.tutList && this.tutList[this.tutStep];
    if (!s) { this.tutBlink = new Set(); this.tutAllow = null; return; }
    this.tutT += dt;

    // игрок взял стакан «не по сценарию» (раньше подсказки или другой) — подстраиваем обучение под него
    const hd = this.dragObj;
    if (hd && hd.type === 1 && hd.step >= 1 && hd !== this.tutBottle && this.tutStep <= 8 && !hd.client) {
      this.tutBottle = hd;
      if (this.tutStep < 2) { this.tutStep = 1; this.tutNext(); return; }     // сразу к шагу «наполни жидкостью»
    }
    // стакан вылили в раковину — возвращаемся к шагу «возьми стакан»
    if (this.tutBottle && this.tutBottle.step === 0 && !hd && this.tutStep >= 2 && this.tutStep <= 8) {
      this.tutBottle = null; this.tutStep = 0; this.tutNext(); return;
    }

    // мигающие (и единственно доступные) предметы текущего шага
    const set = new Set(s.blink ? s.blink() : []);
    this.tutBlink = set;
    // доступны мигающие предметы и (если шаг требует) ещё «цели» — например бутылка под специю
    this.tutAllow = s.blink ? new Set([...set, ...(s.allow ? s.allow() : [])]) : new Set();
    // испорченную/ненужную смесь в руках всегда можно вылить в раковину
    if (hd && hd.type === 1 && hd.step > 1 && this.sink) this.tutAllow.add(this.sink);

    if (s.wait) {
      // реплика-пауза: идёт по времени или по клику
      if (this.tutT > s.wait || (Input.clicked && this.tutT > 1.0)) {
        if (Input.clicked) Input.clicked = false;
        if (s.last) this.endTutorial(); else this.tutNext();
      }
    } else if (s.done && this.tutT > 0.6 && s.done()) {
      this.tutNext();
    }
  },

  endTutorial() {
    this.tutorialActive = false;
    this.tutBlink = new Set(); this.tutAllow = null; this.tutBub = null;
    Save.set(Save.K_TUT, '1');
    // реплики перед уровнем (у 1-го уровня — «Уже идут новые клиенты…»), затем обычный старт
    this.preStory(() => this.beginClock());
  },

  // фильтр доступности предметов (hitTest / dropHitTest)
  tutAllows(o) {
    if (!this.tutorialActive || !this.tutAllow) return true;
    if (o === this.dragObj) return true;
    return this.tutAllow.has(o);
  },
});

// ===== Магазин улучшений (CSuitcase оригинала) =====
// Восстановлено по game.exe (research/trader-notes.md): 28 предметов, выбор 3 предложений по весам уровня,
// цены от накопленного кошелька, одна покупка за визит; магазин открывается в начале 3-го, 5-го и 7-го уровня
// каждого эпизода. Купленное определяет содержимое бара (вместо открытия по уровням, как во Flash).
// Эффекты трёх особых стаканов в exe не найдены — сделаны по описаниям из игры (см. SHOP_GLASS).
'use strict';

// ---------- Данные ----------
// Предметы: 0..2 стаканы (денежный, неперекипающий, самовар), 3..4 конфорки, 5..8 амулеты, 9..12 украшения, 13..27 специи
// (группа = (id-13)/5, позиция = (id-13)%5). Веса — кусочно-линейные строки [от, до, знач.от, знач.до] по номеру уровня L=1..35.
const SHOP_W = [
  [[12,12,5,5],[14,14,5,5],[19,19,0,0],[21,21,60,60],[24,24,50,50],[26,36,6,6]],
  [[24,24,2,2],[26,26,70,70],[28,28,60,60],[31,31,50,50],[33,36,20,20]],
  [[5,5,5,5],[7,7,5,5],[12,12,70,70],[14,14,60,60],[19,19,0,0],[21,36,11,11]],
  [[1,7,0,0],[10,10,100,100]],
  [[1,16,0,0],[17,17,100,100]],
  [[1,1,0,0],[2,2,0,0]],
  [[3,3,80,80],[5,5,70,70],[7,7,60,60],[19,19,0,0],[12,18,15,15],[20,35,15,15]],
  [[12,12,80,80],[14,14,70,70],[19,19,0,0],[21,35,10,10]],
  [[19,19,0,0],[21,21,70,70],[24,24,50,50],[26,36,5,5]],
  [[1,1,0,0],[2,2,0,0]],
  [[3,3,70,70],[5,5,60,60],[7,7,50,50],[19,19,0,0],[10,18,13,13],[20,35,13,13]],
  [[7,7,4,4],[12,12,70,70],[14,14,60,60],[19,19,0,0],[21,35,8,8]],
  [[14,14,4,4],[19,19,0,0],[21,21,60,60],[24,24,50,50],[26,36,3,3]],
  [[0,0,0,0],[0,0,0,0]],
  [[0,0,0,0],[0,0,0,0]],
  [[3,3,90,90],[5,5,80,80],[7,7,70,70],[12,12,14,14],[14,14,13,13],[19,19,0,0],[21,21,11,11],[24,24,0,0],[25,35,2,2]],
  [[7,12,2,10],[14,14,5,5],[19,19,20,20],[21,21,15,15],[24,24,0,0],[26,26,30,30],[28,28,20,20],[31,31,10,10],[33,33,7,7],[35,35,6,6]],
  [[12,12,70,70],[7,7,7,7],[14,14,7,7],[19,19,70,70],[21,21,7,7],[24,24,0,0],[26,26,30,30],[28,28,20,20],[31,31,10,10],[33,33,7,7],[35,35,6,6]],
  [[12,12,90,90],[14,14,80,80],[19,19,0,0],[21,21,14,14],[24,24,0,0],[26,26,12,12],[28,28,11,11],[31,35,2,2]],
  [[0,0,0,0],[0,0,0,0]],
  [[12,12,90,90],[14,14,80,80],[19,19,0,0],[21,21,14,14],[24,24,0,0],[26,26,12,12],[28,28,11,11],[31,35,2,2]],
  [[12,12,70,70],[19,19,20,20],[14,18,7,7],[20,23,7,7],[24,24,0,0],[26,26,30,30],[28,28,20,20],[31,31,10,10],[33,33,7,7],[35,35,6,6]],
  [[12,18,7,7],[19,19,20,20],[20,23,7,7],[24,24,0,0],[26,26,30,30],[28,28,20,20],[31,31,10,10],[33,33,7,7],[35,35,6,6]],
  [[19,19,0,0],[21,21,80,80],[24,24,0,0],[26,26,14,14],[28,28,13,13],[31,31,12,12],[33,33,11,11],[35,35,2,2]],
  [[19,19,0,0],[21,21,80,80],[24,24,0,0],[26,26,14,14],[28,28,13,13],[31,31,12,12],[33,33,11,11],[35,35,2,2]],
  [[19,19,0,0],[21,21,80,80],[24,24,0,0],[26,26,14,14],[28,28,13,13],[31,31,12,12],[33,33,11,11],[35,35,2,2]],
  [[19,19,20,20],[21,23,7,7],[24,24,0,0],[26,26,30,30],[28,28,11,11],[31,31,10,10],[33,33,7,7],[35,35,6,6]],
  [[19,19,20,20],[21,23,7,7],[24,24,0,0],[26,26,30,30],[28,28,11,11],[31,31,10,10],[33,33,7,7],[35,35,6,6]]
];

const SHOP_TEXT = {
  glass: ['Клиент заплатит больше, если сварить зелье в Денежном стакане.',
    'Зелье никогда не испортится, если варить его в Неперекипающем стакане!',
    'Бокал-Самовар сделает всю работу за Вас, расслабьтесь и наслаждайтесь!'],
  burner: 'Не успеваете варить несколько зелий сразу? Купите дополнительную магическую конфорку!',
  amulet: ['Амулет с чесноком, помогает от злых духов.', 'Амулет в виде подковы приносит клиенту удачу, а Вам - дополнительный доход!',
    'Пополните ассортимент амулетов веером и получите немалый доход!', 'Амулет ключника - самый дорогой и таинственный, пополните им свою коллекцию.'],
  decor: ['Украшение бокала цветком дикого лотоса.', 'Украсьте бокал диковинной бабочкой, и клиент будет щедр на чаевые!',
    'Клиент выложит кругленькую сумму за бокал с паутинкой.', 'Птенец Феникса - изысканное украшение бокала для богатых клиентов.'],
  spice: ['Мухомор, вызывает потусторонние видения.', 'Корень мандрагоры, очень редкий ингредиент.',
    'Сварите зелье с Пером Феникса, и неожиданный эффект не заставит себя ждать!', 'Разнообразьте заказы новой специей - Клыками Вампира!',
    'Насыпьте в зелье Солнечного Порошка, и оно заблестит цветами радуги.', 'Поганка - незаменимое составляющее любого вкусного зелья.',
    'Четырехлистник клевера, помогает в беде.', 'Зелье со Следом Вурдалака заставит клиента вывернуть карманы.',
    'Морские раковины - уникальная и на удивление доходная специя.', 'Этот бар всегда славился зельями с Теневым Перцем - держи марку!',
    'Призрачные Грибы приносят реальные деньги!', 'Вы знали, что цветы кусаются? Добавьте в зелье Хищное Растение.',
    'Рог Единорога сделает зелье незабываемым, клиенты оценят!', 'Осколки Звезд в зелье - хит сезона! Добавьте его в зелье.',
    'Радужная Пыль - выгодное приобретение! Добавьте красок в зелье!'],
  ask: ' Желаете купить?',
  poor: ' У Вас не хватает на это денег!',
  samovar: 'Ты купила бокал-самовар! Используй его, когда не успеваешь обслужить клиента. И он сделает всю работу за тебя!',
};

// Типы стекла: 0 обычное, 1 денежное, 2 неперекипающее (Cold), 3 самовар (Auto)
// Базовые веса выбора типа на уровне (обычное, денежное, холодное, самовар) — prop 0x3c, строка = номер уровня − 1
const SHOP_GLASS_BASE = (() => {
  const r = [];
  const add = (n, a, b, c, d) => { for (let i = 0; i < n; i++) r.push([a, b, c, d]); };
  add(4, 55, 20, 10, 5); add(4, 55, 20, 10, 2); r.push([54, 20, 10, 2]); add(4, 54, 20, 10, 3); add(4, 53, 20, 10, 3);
  add(3, 53, 20, 10, 4); r.push([52, 20, 10, 4]); add(2, 52, 20, 10, 5); add(2, 52, 20, 12, 5); add(3, 51, 20, 12, 6);
  add(2, 51, 20, 15, 7); r.push([50, 20, 15, 8]); r.push([50, 20, 15, 9]); r.push([50, 20, 15, 10]); add(2, 50, 20, 20, 10);
  r.push([49, 20, 20, 11]); r.push([48, 20, 20, 12]); r.push([46, 20, 20, 14]); r.push([30, 30, 20, 20]);
  return r;
})();
// сколько самоваров максимум за уровень (prop 0x3d, индекс = номер уровня − 1)
const SHOP_AUTO_MAX = [0,0,0,0,1,1,1,1,2,2,2,2,2,2,3,3,3,3,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4,0];
// денежное стекло: надбавка к оплате (в exe float 0x31 = 0.5; к какому именно предмету привязана — не подтверждено)
const SHOP_MONEY_BONUS = 0.5;

// ---------- Спрайты окна магазина ----------
SPRITES.TB_BACK = ['Images/Bar/TraderBox_Back.png', 1, 1];
SPRITES.TB_CLOSED = ['Images/Bar/TraderBox_Closed.png', 1, 1];
SPRITES.TB_SLIDE = ['Images/Bar/TraderBox_Slide.png', 1, 1];
SPRITES.TB_PRICE = ['Images/Bar/TraderBox_Prise.png', 1, 1];
SPRITES.TB_BTN_N = ['Images/Bar/TraderBox_BuyButton_Normal.png', 1, 1];
SPRITES.TB_BTN_O = ['Images/Bar/TraderBox_BuyButton_Over.png', 1, 1];
SPRITES.TB_BTN_D = ['Images/Bar/TraderBox_BuyButton_Can_T_Buy_Pushed.png', 1, 1];
SPRITES.TB_CAN = ['Images/Bar/TraderBox_BuyButton_Can_Buy.png', 1, 1];
SPRITES.TB_CANT = ['Images/Bar/TraderBox_BuyButton_Can_T_Buy.png', 1, 1];
['Amulet_01', 'Amulet_02', 'Amulet_03', 'Amulet_04', 'Burner_03', 'Burner_04', 'Decor_01', 'Decor_02', 'Decor_03', 'Decor_04',
  'GlassMoney_03', 'GlassCold_04', 'GlassAuto_02'].forEach((n) => { SPRITES['UP_' + n] = ['Images/Upgrade/' + n + '.png', 1, 2]; });
for (let i = 1; i <= 15; i++) SPRITES['UP_SPICE' + i] = ['Images/Upgrade/SrcSpicies' + String(i).padStart(2, '0') + '.png', 1, 2];
// свечение стаканов особых типов (как у обычного: ClearGlow/BubbleGlow)
SPRITES.GLOW_RACK1 = ['Images/Drinks/MoneyGlow_45.png', 1, 1];
SPRITES.GLOW_RACK2 = ['Images/Drinks/ColdGlow_45.png', 1, 1];
SPRITES.GLOW_RACK3 = ['Images/Drinks/FireGlow_45.png', 1, 1];
SPRITES.GLOW_IN1 = ['Images/Drinks/MoneyGlow.png', 1, 1];
SPRITES.GLOW_IN2 = ['Images/Drinks/ColdGlow.png', 1, 1];
SPRITES.GLOW_IN3 = ['Images/Drinks/FireGlow.png', 1, 1];
GROUP_DIRS['Images/Upgrade'] = 'bar';
['UpgradeOpen', 'UpgradeClose', 'UpgradeUpSlot', 'UpgradeBuy', 'GamePotionAuto'].forEach((n) => SOUND_FILES.push(n));

// спрайт на «обычный» стакан по типу (в файлах: 02 — Auto, 03 — Money, 04 — Cold)
const SHOP_GLASS_SPR = ['GLASS0', 'GLASS2', 'GLASS3', 'GLASS1'];

function shopItemInfo(id) {
  if (id <= 2) return { cat: 0, idx: id + 1, spr: ['UP_GlassMoney_03', 'UP_GlassCold_04', 'UP_GlassAuto_02'][id], text: SHOP_TEXT.glass[id] };
  if (id <= 4) return { cat: 1, idx: id - 1, spr: 'UP_Burner_0' + (id), text: SHOP_TEXT.burner };
  if (id <= 8) return { cat: 2, idx: id - 5, spr: 'UP_Amulet_0' + (id - 4), text: SHOP_TEXT.amulet[id - 5] };
  if (id <= 12) return { cat: 3, idx: id - 9, spr: 'UP_Decor_0' + (id - 8), text: SHOP_TEXT.decor[id - 9] };
  const i = id - 13;
  return { cat: 4, idx: i % 5, group: Math.floor(i / 5), spr: 'UP_SPICE' + (i + 1), text: SHOP_TEXT.spice[i] };
}

// ---------- Состояние и правила ----------
const Shop = {
  K: 'pb_shop',
  s: null,

  // номер уровня бара → { ep, lvl, L } (L = (ep−1)·7 + lvl, как в exe); null — не уровень бара
  levelInfo(scenarioIdx) {
    if (!SCENARIO[scenarioIdx] || SCENARIO[scenarioIdx].type !== 'base') return null;
    let k = 0;
    for (let i = 0; i < scenarioIdx; i++) if (SCENARIO[i].type === 'base') k++;
    return { ep: Math.floor(k / 7) + 1, lvl: (k % 7) + 1, L: k + 1 };
  },
  isShopLevel(info) { return !!info && (info.lvl === 3 || info.lvl === 5 || info.lvl === 7); },

  fresh() {
    return {
      wallet: 0,
      glass: [1, 0, 0, 0], burner: [1, 1, 0, 0], amulet: [1, 0, 0, 0], decor: [1, 0, 0, 0],
      spice: [0, 1, -1, -1, -1],
      sflag: [0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1],     // специя ещё не куплена (0 — уже стоит с начала)
      offers: {}, done: {},
    };
  },

  // загрузить состояние профиля; если сохранений магазина нет, а прогресс есть — перенести то, что открывалось по уровням
  get() {
    if (this.s && this.s._p === Save.profiles.cur) return this.s;
    let s = Save.getJSON(this.K, null);
    if (!s || !Array.isArray(s.glass)) {
      s = this.fresh();
      const prog = Save.getProgress(SCENARIO.length);
      if (prog > 0) this.migrate(s, prog);
      Save.setJSON(this.K, s);
    }
    s._p = Save.profiles.cur;
    this.s = s;
    return s;
  },
  save() { if (this.s) { const c = Object.assign({}, this.s); delete c._p; Save.setJSON(this.K, c); } },

  migrate(s, prog) {
    let i = Math.min(prog, SCENARIO.length - 1);
    while (i > 0 && SCENARIO[i].type !== 'base') i--;
    const li = (SCENARIO[i].id || 1) - 1;
    s.amulet = LVL_ACT_AMULETS[li].slice();
    s.decor = LVL_ACT_DECORS[li].slice();
    const b = LVL_ACT_BURNERS[li];
    s.burner = [b[0], b[2], b[1], b[3]];                 // позиции на стойке → индексы покупок (порядок 0,2,1,3)
    s.spice = LVL_ACT_SPICES[li].map((id, pos) => (id > 0 ? Math.floor((id - 1) / 5) : -1));
    s.sflag = s.sflag.map((_, k) => (s.spice[k % 5] !== -1 ? 0 : 1));
    let w = 0; const res = Save.results();
    for (let k = 0; k < prog; k++) if (res[k] && res[k].won) w += res[k].best || 0;
    s.wallet = w;
    for (let k = 0; k <= i; k++) { const inf = this.levelInfo(k); if (inf && this.isShopLevel(inf)) s.done[inf.L] = 1; }
  },

  addMoney(n) { const s = this.get(); s.wallet += Math.max(0, Math.round(n)); this.save(); },
  wallet() { return this.get().wallet; },

  // ---- веса предметов на уровне L ----
  weight(id, L) {
    let v = 0;
    for (const r of SHOP_W[id]) {
      if (r[0] <= L && L <= r[1]) {
        v = r[2];
        if (r[2] !== r[3]) v = Math.trunc(((r[3] - r[2]) * (L - r[0])) / (r[1] - r[0])) + r[2];
      }
    }
    return v;
  },
  weights(L) {
    const s = this.get();
    const w = [];
    for (let id = 0; id < 28; id++) {
      const inf = shopItemInfo(id);
      let owned = false;
      if (inf.cat === 0) owned = !!s.glass[inf.idx];
      else if (inf.cat === 1) owned = !!s.burner[inf.idx];
      else if (inf.cat === 2) owned = !!s.amulet[inf.idx];
      else if (inf.cat === 3) owned = !!s.decor[inf.idx];
      else {
        const i = id - 13;
        owned = s.spice[inf.idx] !== -1 || !s.sflag[i];     // позиция занята любым вариантом или вариант уже стоял
      }
      w.push(owned ? 0 : this.weight(id, L));
    }
    return w;
  },

  // взвешенный выбор как FUN_004b2bf0: rand() % сумма, границы включительно; −1 — выбирать нечего
  pick(w) {
    let sum = 0;
    for (const x of w) sum += x;
    if (sum <= 0) return -1;
    const rand = () => Math.floor(Math.random() * 32768);
    let r = rand() % sum;
    if (sum === 1 && r !== 1) r = 1;
    if (w[0] === 0) while (r === 0) r = rand() % sum;
    let cum = 0;
    for (let i = 0; i < w.length; i++) {
      if (cum <= r && r <= cum + w[i]) return w[i] > 0 ? i : -1;
      cum += w[i];
    }
    return -1;
  },

  // три предложения (FUN_0049ff70): категория по среднему весу, затем предмет внутри неё
  generate(L) {
    const w = this.weights(L);
    const sumR = (a, b) => { let t = 0; for (let i = a; i < b; i++) t += w[i]; return t; };
    const cw = [Math.trunc(sumR(0, 3) / 3), Math.trunc(sumR(3, 5) * 0.5), Math.trunc(sumR(5, 9) * 0.25),
      Math.trunc(sumR(9, 13) * 0.25), Math.trunc(sumR(13, 28) / 15)];
    const range = [[0, 3], [3, 5], [5, 9], [9, 13], [13, 28]];
    const items = [];
    for (let slot = 0; slot < 3; slot++) {
      const c = this.pick(cw);
      if (c < 0) break;
      cw[c] = 0;
      const [a, b] = range[c];
      const ci = this.pick(w.slice(a, b));
      if (ci < 0) continue;
      const id = a + ci;
      items.push({ id, w: w[id] });
      w[id] = 0;
    }
    items.sort((p, q) => p.w - q.w);                     // по возрастанию веса (редкое — «первым»)
    return items.map((x) => x.id);
  },

  // цены (FUN_00476260): от кошелька M; до «цели» дороже, после — со скидкой; затем кратно 50
  prices(M, info, items) {
    const { ep, lvl, L } = info;
    const q = L - 1;
    const f5 = (i) => LVL_GOAL[Math.max(0, i)], f6 = (i) => LVL_GOAL_EXPERT[Math.max(0, i)];
    const T = (lvl === 3 && ep >= 2) ? f6(q - 3) + f5(q - 1) + f6(q - 2) : f5(q - 1) + f6(q - 2);
    const M100 = Math.floor(M / 100) * 100;
    let r0, r1, r2;
    if (M < T) { r1 = M100 - M100 / 10; r2 = M100; r0 = M + M100 / 10; }
    else { r1 = M100 - M100 / 5; r2 = M100 - M100 / 10; r0 = M100; }
    const rank = [r0, r1, r2].map((p) => { p = Math.floor(p); return p - (p % 50); });
    return items.map((id, k) => (id === 3 || id === 4) ? M - (M % 500) : rank[Math.min(k, 2)]);
  },

  // предложения на уровне (сохраняются, чтобы выход/перезапуск не менял набор)
  offersFor(info) {
    const s = this.get();
    let o = s.offers[info.L];
    if (!o) {
      const items = this.generate(info.L);
      o = { items, prices: this.prices(s.wallet, info, items) };
      s.offers[info.L] = o;
      this.save();
    }
    return o;
  },
  visited(L) { return !!this.get().done[L]; },
  markVisited(L) { const s = this.get(); s.done[L] = 1; delete s.offers[L]; this.save(); },

  // покупка: флаги, кошелёк
  buy(id, price) {
    const s = this.get();
    if (s.wallet < price) return false;
    const inf = shopItemInfo(id);
    if (inf.cat === 0) s.glass[inf.idx] = 1;
    else if (inf.cat === 1) s.burner[inf.idx] = 1;
    else if (inf.cat === 2) s.amulet[inf.idx] = 1;
    else if (inf.cat === 3) s.decor[inf.idx] = 1;
    else { s.spice[inf.idx] = inf.group; s.sflag[id - 13] = 0; }
    s.wallet -= price;
    this.save();
    return true;
  },

  // ---- содержимое бара по покупкам ----
  burnerOpen(pos) { const s = this.get(); return !!s.burner[[0, 2, 1, 3][pos]]; },   // позиции на стойке: 0,2 — стартовые
  spiceId(pos) { const g = this.get().spice[pos]; return g >= 0 ? pos + 1 + g * 5 : -1; },
  has(cat, idx) { return !!this.get()[['glass', 'burner', 'amulet', 'decor'][cat]][idx]; },

  // тип нового стакана в держателе (FUN_004650e0): веса по купленным типам; самовар — по расписанию
  pickGlass(L, rack, scene, shopRule) {
    const s = this.get();
    const base = SHOP_GLASS_BASE[Math.min(L, 36) - 1] || SHOP_GLASS_BASE[0];
    if (shopRule && s.glass[rack]) return rack;                      // сразу после покупки: в держателе i — купленный тип i
    if (s.glass[3] && scene) {
      const max = SHOP_AUTO_MAX[Math.min(L, 36) - 1] || 0;
      const used = scene.autoUsed || 0;
      if (max > 0 && used < max && scene.time > 0 && scene.time < (max - used) * (scene.level.time / max)) {
        scene.autoUsed = used + 1;
        return 3;
      }
    }
    const w = [base[0], s.glass[1] ? base[1] : 0, s.glass[2] ? base[2] : 0, 0];
    const k = this.pick(w);
    return k < 0 ? 0 : k;
  },
};

// ---------- Окно магазина в сцене бара ----------
Object.assign(BarScene.prototype, {

  // перед стартом уровня: если это уровень магазина и визит ещё не был — открыть окно, затем done()
  shopThen(done) {
    const info = Shop.levelInfo(this.scenarioIdx);
    if (!info || !Shop.isShopLevel(info) || Shop.visited(info.L) || !this.storyFresh()) { done(); return; }
    const offers = Shop.offersFor(info);
    if (!offers.items.length) { Shop.markVisited(info.L); done(); return; }
    this.shop = { info, offers, sel: -1, t: 0, msg: '', msgT: 0, bought: -1, closeT: -1, done };
    this.sfx('UpgradeOpen');
  },

  // номер уровня бара L (1..35), по которому считаются веса и цены
  shopL() { const i = Shop.levelInfo(this.scenarioIdx); return i ? i.L : this.levelId; },

  shopItemRect(k) {
    const n = this.shop.offers.items.length;
    const cx = W / 2 + (k - (n - 1) / 2) * 235, sc = 1.8, top = 150;
    // предмет нарисован в центре кадра 144×159: сам предмет — примерно x 40..105, y 85..140
    return { x: cx - 36 * sc, y: top + 80 * sc, w: 72 * sc, h: 66 * sc, cx, top, sc };
  },
  shopBuyRect() { return { x: W / 2 - 150, y: 690, w: 140, h: 40 }; },
  shopSkipRect() { return { x: W / 2 + 10, y: 690, w: 140, h: 40 }; },

  updateShop(dt) {
    const sh = this.shop;
    sh.t += dt;
    if (sh.msgT > 0) sh.msgT -= dt;
    if (sh.closeT >= 0) {                       // покупка сделана — недолгая пауза и закрытие
      sh.closeT -= dt;
      if (sh.closeT < 0) this.closeShop();
      return;
    }
    const items = sh.offers.items;
    let over = false;
    for (let k = 0; k < items.length; k++) {
      const r = this.shopItemRect(k);
      const hit = inRect(r, Input.x, Input.y);
      if (hit) over = true;
      if (hit && Input.clicked) { Input.clicked = false; if (sh.sel !== k) { sh.sel = k; sh.msg = ''; this.sfx('UpgradeUpSlot'); } }
    }
    const br = this.shopBuyRect(), sr = this.shopSkipRect();
    if (sh.sel >= 0 && inRect(br, Input.x, Input.y)) {
      over = true;
      if (Input.clicked) {
        Input.clicked = false;
        const price = sh.offers.prices[sh.sel];
        if (Shop.wallet() < price) { sh.msg = SHOP_TEXT.poor; sh.msgT = 2.5; this.sfx('UICantUse'); }
        else if (Shop.buy(items[sh.sel], price)) {
          sh.bought = sh.sel; sh.closeT = 1.2; this.sfx('UpgradeBuy');
        }
      }
    }
    if (inRect(sr, Input.x, Input.y)) { over = true; if (Input.clicked) { Input.clicked = false; this.sfx('UpgradeClose'); this.closeShop(); } }
    Cursor.set(over ? 'pointer' : 'default');
  },

  closeShop() {
    const sh = this.shop;
    if (!sh) return;
    this.shop = null;
    Shop.markVisited(sh.info.L);
    // новое содержимое бара: пересобрать предметы и показать купленные стаканы в держателях
    this.rebuildObjects();
    this.assignGlass(true);
    const boughtId = sh.bought >= 0 ? sh.offers.items[sh.bought] : -1;
    if (boughtId === 2) {                      // «Ты купила бокал-самовар!…» — реплика кота
      this.dlgGuest = null; this.bub = null;
      this.dlg = { lines: [[0, 0, SHOP_TEXT.samovar]], i: 0, t: 0, done: sh.done };
    } else sh.done();
  },

  drawShop(ctx) {
    const sh = this.shop;
    const k = Math.min(1, sh.t / 0.35);
    ctx.save();
    ctx.fillStyle = 'rgba(10,4,18,' + (0.62 * k) + ')'; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = k;
    text(ctx, 'Магазин улучшений', W / 2, 60, { size: 38, color: '#ffe9a8' });
    text(ctx, 'У вас: ' + Shop.wallet(), W / 2, 108, { size: 26, color: '#f4d27a' });
    // полка
    const slide = Assets.spr('TB_SLIDE');
    if (slide) ctx.drawImage(slide.img, W / 2 - slide.w * 0.78, 340, slide.w * 1.56, slide.h * 1.3);
    const items = sh.offers.items;
    const TAGS = [[29, 74], [131, 86], [243, 89]];
    for (let i = 0; i < items.length; i++) {
      const r = this.shopItemRect(i);
      const hov = inRect(r, Input.x, Input.y);
      const sel = sh.sel === i;
      const inf = shopItemInfo(items[i]);
      const gone = sh.bought === i && sh.closeT >= 0 ? Math.max(0, sh.closeT / 1.2) : 1;
      const afford = Shop.wallet() >= sh.offers.prices[i];
      // подсветка выбранного предмета
      if (sel) { ctx.save(); ctx.globalAlpha *= 0.35; ctx.fillStyle = afford ? '#8fe27a' : '#e36a5a'; ctx.beginPath(); ctx.ellipse(r.cx, 398, 120, 18, 0, 0, 7); ctx.fill(); ctx.restore(); }
      const lift = (sel || hov) ? -8 : 0;
      ctx.save(); ctx.globalAlpha *= gone;
      drawFrame(ctx, inf.spr, (sel || hov) ? 1 : 0, r.cx - 72 * r.sc, r.top + lift, { w: 144 * r.sc, h: 159 * r.sc });
      ctx.restore();
      // ценник (три бирки из TraderBox_Prise)
      const tag = Assets.spr('TB_PRICE');
      const ty = 508;
      const T = TAGS[i % 3];
      if (tag) ctx.drawImage(tag.img, T[0], 14, T[1], 30, r.cx - T[1] * 0.85, ty - 22, T[1] * 1.7, 44);
      text(ctx, String(sh.offers.prices[i]), r.cx, ty, { size: 24, color: '#3a1a08', stroke: null });
    }
    // описание выбранного и кнопки
    if (sh.sel >= 0) {
      const inf = shopItemInfo(items[sh.sel]);
      ctx.font = 'bold 22px Georgia, serif';
      const msg = sh.msgT > 0 ? sh.msg.trim() : inf.text + SHOP_TEXT.ask;
      const lines = mg1Wrap(ctx, msg, 640);
      lines.forEach((ln, i) => text(ctx, ln, W / 2, 584 + i * 30, { size: 22, color: sh.msgT > 0 ? '#ff9a8a' : '#fff3d0' }));
      const br = this.shopBuyRect();
      const can = Shop.wallet() >= sh.offers.prices[sh.sel];
      this.shopButton(ctx, br, 'Купить', can);
    } else {
      text(ctx, 'Выберите, что купить. Покупка — одна за визит.', W / 2, 590, { size: 22, color: '#d9c7a0' });
    }
    this.shopButton(ctx, this.shopSkipRect(), 'Пропустить', true);
    ctx.restore();
  },

  shopButton(ctx, r, label, enabled) {
    const hov = inRect(r, Input.x, Input.y);
    const id = !enabled ? 'TB_BTN_D' : (Input.down && hov ? 'TB_BTN_D' : (hov ? 'TB_BTN_O' : 'TB_BTN_N'));
    const s = Assets.spr(id);
    if (s) ctx.drawImage(s.img, r.x, r.y, r.w, r.h);
    text(ctx, label, r.x + r.w / 2, r.y + r.h / 2 + 1, { size: 20, color: enabled ? '#fff3d0' : '#b9a58a', strokeW: 3 });
  },

  // деньги на улучшения (кошелёк) в панели времени
  drawWallet(ctx) {
    const s = Assets.spr('IP_UP');
    const x = F(67) + 14, y = F(4) + F(58);
    if (s) ctx.drawImage(s.img, x, y);
    text(ctx, String(Shop.wallet()), x + 92, y + 26, { size: 20, color: '#ffe9a8', strokeW: 3 });
  },

  // самовар: пустой стакан, поднесённый к клиенту, сам собирает и доваривает его заказ
  samovarFill(b, client) {
    const o = client.orders;
    b.ingredientID = o.ingredientID;
    b.spicies = o.spiciesID.slice();
    b.decor = o.decorID;
    b.boiled = true;
    b.progress = TIMING.boilUnits; b.startPoint = 0;
    b.step = b.spicies.length ? 5 : 3;
    this.sfx('GamePotionAuto');
  },

  // пересобрать предметы бара по купленному
  rebuildObjects() {
    this.ingBottles.length = 0; this.burners.length = 0; this.spices.length = 0; this.decors.length = 0; this.amulets.length = 0;
    this.applyLevelObjects();
    this.common = [
      ...this.bottles, ...this.ingBottles, ...this.burners,
      ...this.spices, ...this.decors, ...this.amulets,
      ...this.clients, this.sink,
    ];
  },

  // типы стекла в 4 держателях (при старте уровня и сразу после покупки)
  assignGlass(shopRule) {
    const L = this.shopL();
    this.autoUsed = this.autoUsed || 0;
    for (const b of this.bottles) if (b.step === 0 && !b.client) b.kind = Shop.pickGlass(L, b.rackIndex, this, !!shopRule);
  },
});

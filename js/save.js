// ===== Сохранение: настройки, прогресс, результаты уровней =====
// Всё хранится в localStorage; каждое обращение защищено try/catch (приватный режим, запрет сайта и т.п.).
'use strict';

const Save = {
  K_SETTINGS: 'pb_settings',     // { music: 0..1, sound: 0..1 }
  K_RESULTS: 'pb_results',       // { [индекс сценария]: { won, expert, best } }
  K_SCENARIO: 'pb_scenario',     // индекс текущего уровня (прогресс)
  K_INTRO: 'pb_intro_seen',      // вступительный комикс уже показан
  K_POOL: 'pb_mg1_pool',         // пул ингредиентов MG1
  K_NOTE: 'pb_note_read',        // записка на стойке прочитана
  K_TUT: 'pb_tutorial_done',     // обучение первого уровня пройдено

  K_PROFILES: 'pb_profiles',     // { list: [{id, name}], cur: id, next: n }

  // ключи, которые хранятся отдельно для каждого профиля
  PROFILE_KEYS: ['pb_scenario', 'pb_intro_seen', 'pb_mg1_pool', 'pb_results', 'pb_note_read', 'pb_tutorial_done'],
  _k(key) {
    const c = this.profiles && this.profiles.cur;
    return (c && this.PROFILE_KEYS.includes(key)) ? 'pb_u' + c + '_' + key : key;
  },

  get(key) { try { return localStorage.getItem(this._k(key)); } catch (e) { return null; } },
  set(key, val) { try { localStorage.setItem(this._k(key), String(val)); } catch (e) {} },
  remove(key) { try { localStorage.removeItem(this._k(key)); } catch (e) {} },
  getJSON(key, def) {
    try { const v = JSON.parse(localStorage.getItem(this._k(key))); return v === null || v === undefined ? def : v; } catch (e) { return def; }
  },
  setJSON(key, val) { try { localStorage.setItem(this._k(key), JSON.stringify(val)); } catch (e) {} },

  // ---------- профили игроков ----------
  profiles: { list: [], cur: null, next: 1 },
  loadProfiles() {
    const p = this.getJSON(this.K_PROFILES, null);
    if (p && Array.isArray(p.list)) {
      this.profiles = { list: p.list, cur: p.cur || null, next: p.next || p.list.length + 1 };
      if (!this.profiles.list.some((x) => x.id === this.profiles.cur)) this.profiles.cur = this.profiles.list.length ? this.profiles.list[0].id : null;
      return;
    }
    // миграция старых сохранений (без профилей) в первый профиль «Игрок»
    this.profiles = { list: [], cur: null, next: 1 };
    let legacy = false;
    try { legacy = this.PROFILE_KEYS.some((k) => localStorage.getItem(k) !== null); } catch (e) {}
    if (legacy) {
      this.createProfile('Игрок');
      try {
        for (const k of this.PROFILE_KEYS) {
          const v = localStorage.getItem(k);
          if (v !== null) { localStorage.setItem(this._k(k), v); localStorage.removeItem(k); }
        }
      } catch (e) {}
    }
  },
  saveProfiles() { this.setJSON(this.K_PROFILES, this.profiles); },
  current() { return this.profiles.list.find((x) => x.id === this.profiles.cur) || null; },
  nameTaken(name) { const n = name.trim().toLowerCase(); return this.profiles.list.some((x) => x.name.toLowerCase() === n); },
  createProfile(name) {
    const id = String(this.profiles.next++);
    this.profiles.list.push({ id, name: name.trim() });
    this.profiles.cur = id;
    this.saveProfiles();
    return id;
  },
  selectProfile(id) {
    if (this.profiles.list.some((x) => x.id === id)) { this.profiles.cur = id; this.saveProfiles(); }
  },
  deleteProfile(id) {
    try { for (const k of this.PROFILE_KEYS) localStorage.removeItem('pb_u' + id + '_' + k); } catch (e) {}
    this.profiles.list = this.profiles.list.filter((x) => x.id !== id);
    if (this.profiles.cur === id) this.profiles.cur = this.profiles.list.length ? this.profiles.list[0].id : null;
    this.saveProfiles();
  },

  // ---------- настройки ----------
  settings: { music: 1, sound: 1, cursor: true },
  loadSettings() {
    const s = this.getJSON(this.K_SETTINGS, {});
    const ok = (v) => typeof v === 'number' && isFinite(v);
    this.settings.music = ok(s.music) ? Math.min(1, Math.max(0, s.music)) : 1;
    this.settings.sound = ok(s.sound) ? Math.min(1, Math.max(0, s.sound)) : 1;
    this.settings.cursor = s.cursor !== false;      // по умолчанию игровой курсор включён
    return this.settings;
  },
  saveSettings() { this.setJSON(this.K_SETTINGS, this.settings); },

  // ---------- прогресс ----------
  getProgress(total) {
    const n = parseInt(this.get(this.K_SCENARIO) || '0', 10);
    return (n >= 0 && n < total) ? n : 0;
  },
  setProgress(n) { this.set(this.K_SCENARIO, n); },

  // ---------- результаты уровней ----------
  results() { return this.getJSON(this.K_RESULTS, {}); },
  recordResult(idx, won, expert, money) {
    const all = this.results();
    const r = all[idx] || { won: false, expert: false, best: 0 };
    if (won) r.won = true;
    if (expert) r.expert = true;
    if (typeof money === 'number' && money > r.best) r.best = Math.round(money);
    all[idx] = r;
    this.setJSON(this.K_RESULTS, all);
  },
  // сводка для титульного экрана: пройдено уровней, из них с «Экспертом»
  summary() {
    const all = this.results();
    let won = 0, expert = 0;
    for (const k in all) { if (all[k].won) won++; if (all[k].expert) expert++; }
    return { won, expert };
  },
};

Save.loadProfiles();
Save.loadSettings();

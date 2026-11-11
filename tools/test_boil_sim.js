// Сверка таймингов плиты: оригинал (тики 500мс) против порта (кадры 1/60с)
'use strict';

// ---------- Оригинал: PotionBarBottle.boil_step / cool_step / bottleBoil ----------
function originalSim(steps) {
  // steps: [{t, act}] act: 'put'|'take'|'spice'; время в секундах
  let step = 2, BIP = 0, SP = 0, burnStarted = false, boiled = false;
  let rocking = false, running = false, cooling = false, spoiled = false;
  const events = [];
  let onBurner = false;
  const TICK = 0.5, V = 200;
  let t = 0, next = steps.length ? steps[0].t : Infinity, si = 0;
  const doAct = (act) => {
    if (act === 'put') {
      onBurner = true; cooling = false;
      if (step === 2 || step === 4) { if (!burnStarted) SP = BIP; } else SP = BIP;
      if (step !== 6) running = true;
    } else if (act === 'take') {
      onBurner = false;
      if (running) { running = false; cooling = true; }
    } else if (act === 'spice') {
      step = 4; boiled = false; rocking = false;
      // bottlePrepareBoil + bottleBoil (как при клике бутылка+специя)
      running = false;
      if (step === 2 || step === 4) { if (!burnStarted) SP = BIP; } else SP = BIP;
      if (step !== 6 && onBurner) running = true;
    }
  };
  let guard = 0;
  while (guard++ < 100000) {
    // действия до ближайшего тика
    if (si < steps.length && steps[si].t <= t + TICK) {
      // действие происходит в момент t+delta — для простоты в начале тика, если попало
      if (steps[si].t < t + TICK) { doAct(steps[si].act); si++; continue; }
    }
    if (!running && !cooling) {
      if (si < steps.length) { t = Math.max(t, steps[si].t); doAct(steps[si].act); si++; continue; }
      break;
    }
    t += TICK;
    while (si < steps.length && steps[si].t <= t) { doAct(steps[si].act); si++; }
    if (running) {
      if (step === 4) SP -= V; else BIP += V;
      if (step === 2 || step === 4) {
        burnStarted = true;
        if (BIP >= 1400 + SP && !rocking) { rocking = true; events.push(['rock', t]); }
        if (BIP >= 2000 + SP && !boiled) {
          step = (step === 2) ? 3 : 5; burnStarted = false; boiled = true;
          events.push(['boil', t]);
        }
      }
      if (BIP >= 10000 && !spoiled) { spoiled = true; step = 6; running = false; events.push(['spoil', t]); }
    } else if (cooling && step > 2) {
      if (BIP > 2000) {
        if (burnStarted) SP -= V;
        BIP -= V;
      } else {
        if (burnStarted) SP += 2000 - BIP;
        BIP = 2000; cooling = false;
      }
    }
  }
  return events;
}

// ---------- Порт: PBBottle.update (кадры) ----------
function portSim(steps) {
  let step = 2, progress = 0, startPoint = 0, burnStarted = false, boiled = false;
  let corkRock = 0, corkFlying = 0, spoiled = false, onBurner = false;
  const events = [];
  const DT = 1 / 60, RATE = 400;
  let t = 0, si = 0;
  const doAct = (act) => {
    if (act === 'put') {
      onBurner = true;
      if (step === 2 || step === 4) { if (!burnStarted) startPoint = progress; }
      else startPoint = progress;
    } else if (act === 'take') {
      onBurner = false;
    } else if (act === 'spice') {
      step = 4; boiled = false; corkRock = 0; corkFlying = 0;
      if (onBurner && !burnStarted) startPoint = progress; // bottleBoil
    }
  };
  while (t < 200) {
    while (si < steps.length && steps[si].t <= t) { doAct(steps[si].act); si++; }
    t += DT;
    if (onBurner && step >= 2 && step <= 5) {
      if (step === 2 || step === 4) {
        burnStarted = true;
        if (step === 4) startPoint -= RATE * DT;
        else progress += RATE * DT;
      } else {
        progress += RATE * DT;
      }
      if ((step === 2 || step === 4) && corkRock === 0 && corkFlying === 0 &&
          progress >= 1400 + startPoint) { corkRock = 1e-4; events.push(['rock', t]); }
      if ((step === 2 || step === 4) && !boiled && progress >= 2000 + startPoint) {
        boiled = true; burnStarted = false;
        step = (step === 2) ? 3 : 5;
        corkFlying = 1e-4; corkRock = 0;
        events.push(['boil', t]);
      }
      if (progress >= 10000 && !spoiled) { spoiled = true; step = 6; events.push(['spoil', t]); }
    }
    if (!onBurner && step > 2 && step < 6 && progress > 2000) {
      const cool = RATE * DT;
      if (burnStarted) startPoint -= cool;
      progress -= cool;
      if (progress <= 2000) {
        if (burnStarted) startPoint += 2000 - progress;
        progress = 2000;
      }
    }
  }
  return events;
}

function cmp(name, steps) {
  const a = originalSim(steps), b = portSim(steps);
  console.log('== ' + name);
  console.log('   оригинал: ' + a.map(e => e[0] + '@' + e[1].toFixed(2)).join('  '));
  console.log('   порт:     ' + b.map(e => e[0] + '@' + e[1].toFixed(2)).join('  '));
  const ok = a.length === b.length && a.every((e, i) => e[0] === b[i][0] && Math.abs(e[1] - b[i][1]) < 0.55);
  console.log('   ' + (ok ? 'OK' : 'РАСХОЖДЕНИЕ!'));
}

cmp('A: свежая бутылка на огне, не трогаем', [{ t: 0.01, act: 'put' }]);
cmp('B: кипячение -> снятие -> специи -> обратно', [
  { t: 0.01, act: 'put' }, { t: 6.0, act: 'take' }, { t: 8.0, act: 'spice' }, { t: 9.0, act: 'put' },
]);
cmp('C: кипячение, оставили на огне, специи на огне', [
  { t: 0.01, act: 'put' }, { t: 15.0, act: 'spice' },
]);
cmp('D: специи посреди нагрева step2', [
  { t: 0.01, act: 'put' }, { t: 2.0, act: 'spice' },
]);
cmp('E: специи ДО огня (fill->spice->put)', [
  { t: 0.01, act: 'spice' }, { t: 1.0, act: 'put' },
]);
cmp('F: снятие посреди повторного нагрева (step4, burn_started)', [
  { t: 0.01, act: 'put' }, { t: 6.0, act: 'take' }, { t: 8.0, act: 'spice' },
  { t: 9.0, act: 'put' }, { t: 11.0, act: 'take' }, { t: 14.0, act: 'put' },
]);

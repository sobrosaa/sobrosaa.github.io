/* =====================================================================
   Portfólio estilo editor de motion design
   ---------------------------------------------------------------------
   Ideia central: existe um único relógio, `time` (em segundos).
   Tudo na tela (cenas, letras, barras, painel de propriedades,
   timeline) é desenhado a partir dele pela função render(time).
   Tocar, arrastar a timeline ou navegar só muda esse número.

   Seções deste arquivo:
     1. Configuração e easing
     2. Curvas Bézier (usadas pelo Editor de gráficos)
     3. Preparação das cenas
     4. Montagem da interface
     5. Render
     6. Reprodução
     7. Laboratório de expressões
     8. Editor de gráficos
     9. Interações e atalhos
   ===================================================================== */

/* ---------- 1. Configuração e easing ---------- */
const FPS = 24;
const COMP_W = 1920; // tamanho "virtual" da composição, para o painel de propriedades

// Cada cena é uma camada na timeline.
// start/end: quando a camada existe. hold: onde a navegação para (o "marcador").
const SCENES = [
  { id: "intro",       name: "Intro",       color: "var(--l-yellow)", start: 0,    end: 4,    hold: 3.0 },
  { id: "sobre",       name: "Sobre",       color: "var(--l-aqua)",   start: 4,    end: 9,    hold: 6.2 },
  { id: "projetos",    name: "Projetos",    color: "var(--l-pink)",   start: 9,    end: 14,   hold: 11 },
  { id: "pordentro",   name: "Por dentro",  color: "var(--l-peach)",  start: 14,   end: 20,   hold: 16.6 },
  { id: "lab",         name: "Expressões",  color: "var(--l-blue)",   start: 20,   end: 25,   hold: 21.4 },
  { id: "experiencia", name: "Experiência", color: "var(--l-sea)",    start: 25,   end: 29.5, hold: 27 },
  { id: "contato",     name: "Contato",     color: "var(--l-lav)",    start: 29.5, end: 33,   hold: 31.2 },
];
const DURATION = SCENES[SCENES.length - 1].end;
const TOTAL_FRAMES = Math.round(DURATION * FPS);

const OUT_TIME = 0.35;     // duração da saída de cada cena
const LETTER_STAGGER = 0.045;
const LETTER_DUR = 0.5;

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

// Easing: transforma um progresso linear (0 a 1) em movimento com "peso"
const ease = {
  easeOutBack: (x) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  },
  easeOutCubic: (x) => 1 - Math.pow(1 - x, 3),
  easeOutExpo: (x) => (x === 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  linear: (x) => x,
};

// Cada tipo de animação: qual curva usa e como transforma o elemento.
// Os deslocamentos estão em "u" (1% da largura da composição).
const ANIMS = {
  up:    { curve: "easeOutBack",  dur: 0.6, fn: (e) => ({ y: (1 - e) * 4 }) },
  left:  { curve: "easeOutExpo",  dur: 0.7, fn: (e) => ({ x: (1 - e) * -8 }) },
  scale: { curve: "easeOutBack",  dur: 0.6, fn: (e) => ({ s: 0.7 + 0.3 * e }) },
  bar:   { curve: "easeOutCubic", dur: 0.7, fn: (e) => ({ sx: e }) },
  fade:  { curve: "linear",       dur: 0.5, fn: () => ({}) },
};

/* ---------- 2. Curvas Bézier ----------
   Uma curva cubic-bezier(x1, y1, x2, y2) vai de (0,0) a (1,1).
   Para um tempo x, precisamos achar o parâmetro t da curva cujo X é x,
   e então devolver o Y. Fazemos isso com o método de Newton,
   com bisseção como plano B quando a derivada fica perto de zero. */
function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sampleX = (t) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t) => (3 * ax * t + 2 * bx) * t + cx;

  function solveT(x) {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-6) return t;
      const d = slopeX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0, hi = 1;
    t = x;
    while (hi - lo > 1e-6) {
      if (sampleX(t) < x) lo = t; else hi = t;
      t = (lo + hi) / 2;
    }
    return t;
  }

  const fn = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : sampleY(solveT(x)));
  fn.point = (t) => [sampleX(t), sampleY(t)];
  return fn;
}

// Curva usada nas letras do nome. O Editor de gráficos pode trocar.
let letterEase = ease.easeOutBack;
let letterEaseName = "easeOutBack";

/* ---------- Referências do DOM ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const stage = $("#stage");
const tracks = $("#tracks");
const playhead = $("#playhead");
const playBtn = $("#playBtn");
const ui = {
  tc: $("#tc"), viewerTc: $("#viewerTc"), frames: $("#frameCount"),
  viewerName: $("#viewerName"), propsLayer: $("#propsLayer"),
  pX: $("#pX"), pY: $("#pY"), pS: $("#pS"), pR: $("#pR"), pO: $("#pO"),
  iFrame: $("#iFrame"), iState: $("#iState"), iEase: $("#iEase"),
  fps: $("#perfFps"), ms: $("#perfMs"), writes: $("#perfWrites"),
};

/* ---------- 3. Prepara as cenas: lê os atributos data-* do HTML ---------- */
SCENES.forEach((scene) => {
  scene.el = $(`.scene[data-scene="${scene.id}"]`, stage);

  scene.items = $$("[data-a]", scene.el).map((el) => {
    const type = ANIMS[el.dataset.a];
    return {
      el,
      type: el.dataset.a,
      delay: parseFloat(el.dataset.d || 0),
      dur: parseFloat(el.dataset.dur || type.dur),
      main: el.hasAttribute("data-main"),
    };
  });

  // Letras: cada palavra marcada com data-letters vira um <span> por letra
  scene.letters = [];
  $$("[data-letters]", scene.el).forEach((word) => {
    const delay = parseFloat(word.dataset.letters);
    const text = word.textContent.trim();
    word.textContent = "";
    word.setAttribute("aria-hidden", "true");
    [...text].forEach((char, i) => {
      const span = document.createElement("span");
      span.className = "ch";
      span.textContent = char;
      word.appendChild(span);
      scene.letters.push({ el: span, delay: delay + i * LETTER_STAGGER });
    });
  });

  // Keyframes: início e fim de cada animação, sem repetir o mesmo quadro
  const frames = new Set();
  scene.items.forEach((it) => {
    frames.add(Math.round((scene.start + it.delay) * FPS));
    frames.add(Math.round((scene.start + it.delay + it.dur) * FPS));
  });
  scene.keys = [...frames].sort((a, b) => a - b).map((f) => f / FPS);
});

/* ---------- 4. Monta a interface a partir da lista de cenas ---------- */
const pct = (t) => `${(t / DURATION) * 100}%`;

function buildUI() {
  const tabs = $("#compTabs");
  const list = $("#compList");
  const names = $("#layerNames");
  const rows = $("#layerRows");
  const ruler = $("#ruler");

  SCENES.forEach((scene, i) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.innerHTML = `<i style="--c:${scene.color}"></i>${scene.name}`;
    tab.addEventListener("click", () => goToScene(i));
    tabs.appendChild(tab);

    const item = document.createElement("li");
    item.innerHTML = `<button type="button"><i style="--c:${scene.color}"></i>${scene.name}<span>Composição</span></button>`;
    item.firstChild.addEventListener("click", () => goToScene(i));
    list.appendChild(item);

    const name = document.createElement("li");
    name.innerHTML = `<button type="button"><i style="--c:${scene.color}"></i><span class="num">${i + 1}</span>${scene.name}</button>`;
    name.firstChild.addEventListener("click", () => goToScene(i));
    names.appendChild(name);

    const row = document.createElement("li");
    row.style.setProperty("--c", scene.color);
    row.innerHTML =
      `<span class="bar" style="left:${pct(scene.start)};width:${pct(scene.end - scene.start)}"></span>` +
      scene.keys.map((k) => `<span class="key" data-t="${k}" style="left:${pct(k)}"></span>`).join("");
    rows.appendChild(row);

    const marker = document.createElement("span");
    marker.className = "marker";
    marker.style.left = pct(scene.hold);
    marker.style.setProperty("--c", scene.color);
    ruler.appendChild(marker);

    scene.ui = {
      tab, listBtn: item.firstChild, nameBtn: name.firstChild, row,
      keys: $$(".key", row).map((el) => ({ el, t: parseFloat(el.dataset.t), passed: null })),
    };
  });

  for (let s = 0; s <= DURATION; s++) {
    const tick = document.createElement("span");
    tick.className = "tick" + (s % 2 === 0 ? " major" : "") + (s % 4 === 0 ? " every4" : "");
    tick.style.left = pct(s);
    if (s % 2 === 0 && s < DURATION) tick.innerHTML = `<span>${String(s).padStart(2, "0")}s</span>`;
    ruler.appendChild(tick);
  }

  $("#compDur").textContent = timecode(DURATION);
  tracks.setAttribute("aria-valuemax", TOTAL_FRAMES);
}

/* ---------- 5. Render: desenha um quadro para o tempo t ---------- */
let time = 0;
let currentIndex = -1;
let styleWrites = 0;

const sceneAt = (t) => {
  const i = SCENES.findIndex((s) => t >= s.start && t < s.end);
  return i === -1 ? SCENES.length - 1 : i;
};

function timecode(t) {
  const f = Math.round(t * FPS);
  const sec = Math.floor(f / FPS);
  const fr = f % FPS;
  return `0:00:${String(sec).padStart(2, "0")}:${String(fr).padStart(2, "0")}`;
}

const fmt = (n, d = 1) => n.toFixed(d).replace(".", ",");

function render(t) {
  const t0 = performance.now();
  styleWrites = 0;
  time = clamp(t, 0, DURATION);
  const index = sceneAt(time);
  const scene = SCENES[index];
  const local = time - scene.start;
  let mainState = null;

  // Saída: a cena some e sobe um pouco no fim (menos a última)
  const isLast = index === SCENES.length - 1;
  const out = isLast ? 1 : clamp((scene.end - time) / OUT_TIME);
  const outE = ease.easeOutCubic(out);
  scene.el.style.opacity = outE;
  scene.el.style.transform = `translateY(calc(${(1 - outE) * -3} * var(--u)))`;
  styleWrites += 2;

  // Animações de cada elemento
  scene.items.forEach((it) => {
    const anim = ANIMS[it.type];
    const p = clamp((local - it.delay) / it.dur);
    const v = anim.fn(ease[anim.curve](p));
    const x = v.x || 0, y = v.y || 0, s = v.s ?? 1;
    it.el.style.opacity = it.type === "bar" ? 1 : p;
    it.el.style.transform =
      it.type === "bar" ? `scaleX(${v.sx})`
      : it.type === "fade" ? ""
      : `translate(calc(${x} * var(--u)), calc(${y} * var(--u))) scale(${s})`;
    styleWrites += 2;
    if (it.main) mainState = { x, y, s, o: p, curve: anim.curve };
  });

  // Letras do nome (usam a curva escolhida no Editor de gráficos)
  scene.letters.forEach((l) => {
    const p = clamp((local - l.delay) / LETTER_DUR);
    const e = letterEase(p);
    l.el.style.opacity = p;
    l.el.style.transform = `translateY(${(1 - e) * 70}%) rotate(${(1 - e) * 14}deg)`;
    styleWrites += 2;
  });
  if (scene.letters.length && mainState) mainState.curve = letterEaseName;

  // Timecode e contadores
  const frame = Math.round(time * FPS);
  ui.tc.textContent = timecode(time);
  ui.viewerTc.textContent = timecode(time);
  ui.frames.textContent = `${String(frame).padStart(5, "0")} (24,00 qps)`;
  ui.iFrame.textContent = `${frame} / ${TOTAL_FRAMES}`;
  playhead.style.left = pct(time);
  tracks.setAttribute("aria-valuenow", frame);
  tracks.setAttribute("aria-valuetext", `${timecode(time)}, cena ${scene.name}`);

  // Painel de propriedades: valores ao vivo da camada principal, em pixels da composição
  if (mainState) {
    const px = COMP_W / 100; // 1u em pixels de uma composição de 1920 px
    ui.pX.textContent = fmt(960 + mainState.x * px);
    ui.pY.textContent = fmt(540 + mainState.y * px);
    ui.pS.textContent = fmt(mainState.s * 100);
    ui.pR.textContent = "+0,0";
    ui.pO.textContent = Math.round(mainState.o * outE * 100);
    ui.iEase.textContent = mainState.curve;
  }

  // Keyframes que o cursor já passou ficam azuis (só mexe no DOM quando muda)
  SCENES.forEach((s) => s.ui.keys.forEach((k) => {
    const passed = k.t <= time + 1e-6;
    if (passed !== k.passed) { k.passed = passed; k.el.classList.toggle("passed", passed); }
  }));

  // Troca de cena: atualiza destaques e liga/desliga o laboratório
  if (index !== currentIndex) {
    currentIndex = index;
    SCENES.forEach((s, i) => s.el.classList.toggle("active", i === index));
    ui.viewerName.textContent = scene.name;
    ui.propsLayer.textContent = scene.name;
    SCENES.forEach((s, i) => {
      const on = String(i === index);
      s.ui.tab.setAttribute("aria-current", on);
      s.ui.listBtn.setAttribute("aria-current", on);
      s.ui.nameBtn.setAttribute("aria-current", on);
      s.ui.row.classList.toggle("current", i === index);
    });
    scene.id === "lab" ? lab.start() : lab.stop();
  }

  perf.renderMs = performance.now() - t0;
}

/* ---------- Medição de desempenho ---------- */
const perf = {
  renderMs: 0,
  fps: 0,
  last: 0,
  tick(now) {
    if (this.last) {
      const inst = 1000 / (now - this.last);
      this.fps = this.fps ? this.fps * 0.9 + inst * 0.1 : inst; // média móvel
    }
    this.last = now;
  },
  reset() { this.last = 0; this.fps = 0; },
  show(active) {
    ui.fps.textContent = active && this.fps ? Math.round(this.fps) : "—";
    ui.ms.textContent = `${fmt(this.renderMs, 2)} ms`;
    ui.writes.textContent = styleWrites;
  },
};

/* ---------- 6. Reprodução ---------- */
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let rafId = null;
let playing = false;

function setPlaying(on) {
  playing = on;
  playBtn.textContent = on ? "❚❚" : "▶";
  playBtn.setAttribute("aria-label", on ? "Pausar" : "Reproduzir");
  ui.iState.textContent = on ? "Reproduzindo" : "Pausado";
  if (!on) { perf.reset(); perf.show(false); }
}

// Toca em velocidade real de `from` até `to`
function playRange(from, to) {
  cancelAnimationFrame(rafId);
  render(from);
  setPlaying(true);
  const startClock = performance.now();
  const step = (now) => {
    perf.tick(now);
    const t = from + (now - startClock) / 1000;
    if (t >= to) {
      render(to);
      setPlaying(false);
      return;
    }
    render(t);
    perf.show(true);
    rafId = requestAnimationFrame(step);
  };
  rafId = requestAnimationFrame(step);
}

function pause() {
  cancelAnimationFrame(rafId);
  if (playing) setPlaying(false);
}

function togglePlay() {
  if (playing) return pause();
  playRange(time >= DURATION - 0.01 ? 0 : time, DURATION);
}

// Navegar até uma cena: pula para o início dela e toca até o marcador
function goToScene(i) {
  const scene = SCENES[clamp(i, 0, SCENES.length - 1)];
  if (reduceMotion) {
    pause();
    render(scene.hold);
    perf.show(false);
  } else {
    playRange(scene.start, scene.hold);
  }
}

const step = (dir) => goToScene(sceneAt(time) + dir);

function stepFrames(n) {
  pause();
  render(Math.round(time * FPS + n) / FPS);
  perf.show(false);
}

/* ---------- 7. Laboratório de expressões ----------
   Cada campo vira uma função com `new Function`. Ela recebe `time` e alguns
   ajudantes, igual às expressões do After Effects. O laboratório tem o próprio
   relógio, então continua animando mesmo com a timeline pausada. */
const lab = (() => {
  const shape = $("#labShape");
  const readout = $("#labReadout");
  const errorEl = $("#exprError");
  const fields = { y: $("#exprY"), r: $("#exprR"), s: $("#exprS") };
  const compiled = {};
  let raf = null;
  let t0 = 0;

  // wiggle: ruído suave feito com senos de frequências e fases "aleatórias" fixas
  const seeds = [0.13, 0.71, 0.37, 0.89, 0.52, 0.26];
  const wiggleAt = (time, freq, amp, salt) => {
    let v = 0;
    for (let i = 0; i < 3; i++) {
      const f = freq * (1 + seeds[i] * 1.7);
      v += Math.sin(time * f * Math.PI * 2 * 0.5 + seeds[i + 3] * 10 + salt) / 3;
    }
    return v * amp;
  };

  function compile(key) {
    const input = fields[key];
    try {
      const fn = new Function("time", "wiggle", "bounce", "ease",
        `"use strict"; return (${input.value || "0"});`);
      // testa uma vez para pegar erros como variáveis inexistentes
      const test = fn(0, () => 0, () => 0, ease.easeOutCubic);
      if (typeof test !== "number" || Number.isNaN(test)) throw new Error("a expressão precisa resultar em um número");
      compiled[key] = fn;
      input.classList.remove("invalid");
      input.removeAttribute("aria-invalid");
    } catch (err) {
      compiled[key] = null;
      input.classList.add("invalid");
      input.setAttribute("aria-invalid", "true");
      errorEl.textContent = `${input.closest(".expr").firstElementChild.textContent}: ${err.message}`;
      return;
    }
    if (!$$(".expr input.invalid").length) errorEl.textContent = "";
  }

  function value(key, t, salt, fallback) {
    const fn = compiled[key];
    if (!fn) return fallback;
    try {
      const v = fn(t, (f, a) => wiggleAt(t, f, a, salt), (f, a) => -Math.abs(Math.sin(t * f * Math.PI)) * a, ease.easeOutCubic);
      return Number.isFinite(v) ? v : fallback;
    } catch {
      return fallback;
    }
  }

  function frame(now) {
    const t = (now - t0) / 1000;
    const y = value("y", t, 1, 0);
    const r = value("r", t, 2, 0);
    const s = value("s", t, 3, 100);
    // a posição usa "u" para escalar junto com a composição
    shape.style.transform = `translateY(calc(${clamp(y, -200, 200) / 10} * var(--u))) rotate(${r}deg) scale(${clamp(s, 0, 400) / 100})`;
    readout.textContent = `y ${Math.round(y)} · ${Math.round(((r % 360) + 360) % 360)}° · ${Math.round(s)}%`;
    if (!playing) { perf.tick(now); perf.show(true); }
    raf = requestAnimationFrame(frame);
  }

  Object.keys(fields).forEach((key) => {
    compile(key);
    fields[key].addEventListener("input", () => {
      compile(key);
      $$("#labPresets button").forEach((b) => b.removeAttribute("aria-pressed"));
    });
  });

  $$("#labPresets button").forEach((btn) => {
    btn.addEventListener("click", () => {
      fields.y.value = btn.dataset.y;
      fields.r.value = btn.dataset.r;
      fields.s.value = btn.dataset.s;
      Object.keys(fields).forEach(compile);
      $$("#labPresets button").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
      t0 = performance.now();
    });
  });

  return {
    start() {
      if (raf || reduceMotion) return;
      t0 = performance.now();
      perf.reset();
      raf = requestAnimationFrame(frame);
    },
    stop() {
      cancelAnimationFrame(raf);
      raf = null;
    },
  };
})();

/* ---------- 8. Editor de gráficos ---------- */
const graph = (() => {
  const svg = $("#geSvg");
  const PRESETS = [
    { name: "linear",        p: [0, 0, 1, 1] },
    { name: "ease",          p: [0.25, 0.1, 0.25, 1] },
    { name: "easeInOutCubic", p: [0.65, 0, 0.35, 1] },
    { name: "easeOutCubic",  p: [0.33, 1, 0.68, 1] },
    { name: "easeOutExpo",   p: [0.16, 1, 0.3, 1] },
    { name: "easeOutBack",   p: [0.34, 1.56, 0.64, 1] },
    { name: "antecipação",   p: [0.36, -0.45, 0.4, 1.35] },
  ];
  let pts = [...PRESETS[5].p];
  let currentName = "easeOutBack";
  let fn = cubicBezier(...pts);
  let raf = null;
  let previewStart = 0;

  // Mapeamento entre a curva (0 a 1) e o desenho em SVG
  const X0 = 30, W = 260, Y0 = 290, H = 180;
  const sx = (x) => X0 + x * W;
  const sy = (y) => Y0 - y * H;
  const ix = (px) => (px - X0) / W;
  const iy = (py) => (Y0 - py) / H;

  // Grade
  const grid = $("#geGrid");
  let g = "";
  for (let i = 0; i <= 4; i++) {
    const v = i / 4;
    g += `<line x1="${sx(v)}" y1="${sy(-0.4)}" x2="${sx(v)}" y2="${sy(1.5)}"/>`;
    g += `<line x1="${sx(0)}" y1="${sy(v)}" x2="${sx(1)}" y2="${sy(v)}"${v === 0 || v === 1 ? ' class="axis"' : ""}/>`;
  }
  g += `<text x="${sx(1) - 4}" y="${sy(-0.4) + 14}" text-anchor="end">tempo</text>`;
  g += `<text x="${sx(0) - 6}" y="${sy(1) + 4}" text-anchor="end">1</text>`;
  g += `<text x="${sx(0) - 6}" y="${sy(0) + 4}" text-anchor="end">0</text>`;
  grid.innerHTML = g;

  const r2 = (n) => Math.round(n * 100) / 100;

  function draw() {
    fn = cubicBezier(...pts);
    let d = "";
    for (let i = 0; i <= 64; i++) {
      const [x, y] = fn.point(i / 64);
      d += `${i ? "L" : "M"}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`;
    }
    $("#geCurve").setAttribute("d", d);
    const [x1, y1, x2, y2] = pts;
    setLine("#geL1", 0, 0, x1, y1);
    setLine("#geL2", 1, 1, x2, y2);
    setPos("#geH1", x1, y1);
    setPos("#geH2", x2, y2);
    $("#geCss").textContent = `cubic-bezier(${pts.map(r2).join(", ")})`;
  }
  function setLine(sel, ax, ay, bx, by) {
    const l = $(sel);
    l.setAttribute("x1", sx(ax)); l.setAttribute("y1", sy(ay));
    l.setAttribute("x2", sx(bx)); l.setAttribute("y2", sy(by));
  }
  function setPos(sel, x, y) {
    const c = $(sel);
    c.setAttribute("cx", sx(x)); c.setAttribute("cy", sy(y));
  }

  // Prévia: um ponto percorre a curva e um quadrado anda com o valor dela
  function preview(now) {
    const cycle = 1.6;
    const k = ((now - previewStart) / 1000) % cycle;
    const x = clamp(k / 1.2);
    const y = fn(x);
    setPos("#geDot", x, y);
    // 0 fica a 8% da trilha e 1 a 72%, sobrando espaço para o "passar do ponto"
    $("#geBox").style.left = `calc(${8 + y * 64}% - 10px)`;
    raf = requestAnimationFrame(preview);
  }

  // Arrastar as alças (convertendo coordenadas da tela para as do SVG)
  function toCurve(e) {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse());
    return [clamp(ix(p.x)), clamp(iy(p.y), -0.4, 1.5)];
  }
  [["#geH1", 0], ["#geH2", 2]].forEach(([sel, idx]) => {
    const h = $(sel);
    h.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      h.setPointerCapture(e.pointerId);
      h.classList.add("dragging");
      const move = (ev) => {
        const [x, y] = toCurve(ev);
        pts[idx] = x; pts[idx + 1] = y;
        markCustom();
        draw();
      };
      const up = () => {
        h.classList.remove("dragging");
        h.removeEventListener("pointermove", move);
        h.removeEventListener("pointerup", up);
      };
      h.addEventListener("pointermove", move);
      h.addEventListener("pointerup", up);
    });
    // Teclado: setas movem a alça em passos de 0,05
    h.addEventListener("keydown", (e) => {
      const dx = { ArrowLeft: -0.05, ArrowRight: 0.05 }[e.key] || 0;
      const dy = { ArrowDown: -0.05, ArrowUp: 0.05 }[e.key] || 0;
      if (!dx && !dy) return;
      e.preventDefault();
      e.stopPropagation();
      pts[idx] = clamp(pts[idx] + dx);
      pts[idx + 1] = clamp(pts[idx + 1] + dy, -0.4, 1.5);
      markCustom();
      draw();
    });
  });

  // Curvas prontas
  const presetBox = $("#gePresets");
  PRESETS.forEach((p) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = p.name;
    b.addEventListener("click", () => {
      pts = [...p.p];
      currentName = p.name;
      $$("button", presetBox).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      draw();
    });
    if (p.name === currentName) b.setAttribute("aria-pressed", "true");
    presetBox.appendChild(b);
  });
  function markCustom() {
    currentName = "personalizada";
    $$("button", presetBox).forEach((x) => x.setAttribute("aria-pressed", "false"));
  }

  $("#geApply").addEventListener("click", () => {
    letterEase = cubicBezier(...pts);
    letterEaseName = currentName === "personalizada" ? $("#geCss").textContent : currentName;
    goToScene(0);
  });

  $("#geCopy").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    try {
      await navigator.clipboard.writeText($("#geCss").textContent);
      btn.textContent = "Copiado";
    } catch {
      getSelection().selectAllChildren($("#geCss"));
      btn.textContent = "Selecionado";
    }
    setTimeout(() => (btn.textContent = "Copiar CSS"), 1500);
  });

  draw();
  return {
    show() {
      previewStart = performance.now();
      if (!raf) raf = requestAnimationFrame(preview);
    },
    hide() {
      cancelAnimationFrame(raf);
      raf = null;
    },
  };
})();

// Abas do painel inferior
const tabTimeline = $("#tabTimeline");
const tabGraph = $("#tabGraph");
function showTab(which) {
  const graphOn = which === "graph";
  tabTimeline.setAttribute("aria-selected", String(!graphOn));
  tabGraph.setAttribute("aria-selected", String(graphOn));
  $("#viewTimeline").hidden = graphOn;
  $("#viewGraph").hidden = !graphOn;
  graphOn ? graph.show() : graph.hide();
}
tabTimeline.addEventListener("click", () => showTab("timeline"));
tabGraph.addEventListener("click", () => showTab("graph"));

/* ---------- 9. Interações ---------- */
playBtn.addEventListener("click", togglePlay);
$("#prevBtn").addEventListener("click", () => step(-1));
$("#nextBtn").addEventListener("click", () => step(1));

const guidesBtn = $("#guidesBtn");
guidesBtn.addEventListener("click", () => {
  const on = stage.classList.toggle("show-guides");
  guidesBtn.setAttribute("aria-pressed", String(on));
});

// Arrastar na timeline
function timeFromPointer(e) {
  const r = tracks.getBoundingClientRect();
  return clamp((e.clientX - r.left) / r.width) * DURATION;
}
tracks.addEventListener("pointerdown", (e) => {
  pause();
  tracks.setPointerCapture(e.pointerId);
  render(Math.round(timeFromPointer(e) * FPS) / FPS);
  perf.show(false);
  const move = (ev) => { render(Math.round(timeFromPointer(ev) * FPS) / FPS); perf.show(false); };
  const up = () => {
    tracks.removeEventListener("pointermove", move);
    tracks.removeEventListener("pointerup", up);
    tracks.removeEventListener("pointercancel", up);
  };
  tracks.addEventListener("pointermove", move);
  tracks.addEventListener("pointerup", up);
  tracks.addEventListener("pointercancel", up);
});

// Rolar o mouse sobre o viewer troca de cena
let wheelLock = 0;
$("#viewerArea").addEventListener("wheel", (e) => {
  e.preventDefault();
  const now = performance.now();
  if (now < wheelLock || Math.abs(e.deltaY) < 8) return;
  wheelLock = now + 900;
  step(e.deltaY > 0 ? 1 : -1);
}, { passive: false });

// Deslizar o dedo no viewer (celular)
let touchStart = null;
stage.addEventListener("touchstart", (e) => {
  if (e.target.closest("input, button, a")) return;
  touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
}, { passive: true });
stage.addEventListener("touchend", (e) => {
  if (!touchStart) return;
  const dx = e.changedTouches[0].clientX - touchStart.x;
  const dy = e.changedTouches[0].clientY - touchStart.y;
  touchStart = null;
  if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1);
});

// Atalhos de teclado, como no editor
const isTyping = (el) => el.closest("input, textarea, [contenteditable]");
document.addEventListener("keydown", (e) => {
  if (isTyping(e.target)) return;
  switch (e.key) {
    case " ":
      e.preventDefault();
      togglePlay();
      break;
    case "ArrowRight":
      e.preventDefault();
      e.shiftKey ? step(1) : stepFrames(1);
      break;
    case "ArrowLeft":
      e.preventDefault();
      e.shiftKey ? step(-1) : stepFrames(-1);
      break;
    case "PageDown": e.preventDefault(); step(1); break;
    case "PageUp": e.preventDefault(); step(-1); break;
    case "Home": e.preventDefault(); pause(); render(0); break;
    case "End": e.preventDefault(); pause(); render(DURATION); break;
  }
});
// Evita que o espaço também "clique" no botão que estiver focado
document.addEventListener("keyup", (e) => {
  if (e.key === " " && !isTyping(e.target)) e.preventDefault();
});

/* ---------- Início ---------- */
buildUI();
render(SCENES[0].hold);   // estado de repouso: o nome completo já aparece
setPlaying(false);
if (!reduceMotion) goToScene(0); // e então toca a abertura

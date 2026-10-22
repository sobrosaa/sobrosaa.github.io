/* =====================================================================
   Portfólio estilo editor de motion design
   ---------------------------------------------------------------------
   Ideia central: existe um único relógio, `time` (em segundos).
   Tudo na tela (cenas, letras, barras, painel de propriedades,
   timeline) é desenhado a partir dele pela função render(time).
   Tocar, arrastar a timeline ou navegar só muda esse número.
   ===================================================================== */

const FPS = 24;
const DURATION = 22; // duração total da composição, em segundos
const TOTAL_FRAMES = DURATION * FPS;
const COMP_W = 1920; // tamanho "virtual" da composição, para o painel de propriedades

// Cada cena é uma camada na timeline.
// start/end: quando a camada existe. hold: onde a navegação para (o "marcador").
const SCENES = [
  { id: "intro",       name: "Intro",       color: "var(--l-yellow)", start: 0,    end: 4,    hold: 3.0 },
  { id: "sobre",       name: "Sobre",       color: "var(--l-aqua)",   start: 4,    end: 9,    hold: 6.2 },
  { id: "projetos",    name: "Projetos",    color: "var(--l-pink)",   start: 9,    end: 14,   hold: 11 },
  { id: "experiencia", name: "Experiência", color: "var(--l-sea)",    start: 14,   end: 18.5, hold: 16 },
  { id: "contato",     name: "Contato",     color: "var(--l-lav)",    start: 18.5, end: 22,   hold: 20.2 },
];

const OUT_TIME = 0.35;     // duração da saída de cada cena
const LETTER_STAGGER = 0.045;
const LETTER_DUR = 0.5;

/* ---------- Easing: as mesmas curvas que você ajusta no editor de gráficos ---------- */
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
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
// Os deslocamentos estão em cqw (1% da largura da composição).
const ANIMS = {
  up:    { curve: "easeOutBack",  dur: 0.6, fn: (e) => ({ y: (1 - e) * 4 }) },
  left:  { curve: "easeOutExpo",  dur: 0.7, fn: (e) => ({ x: (1 - e) * -8 }) },
  scale: { curve: "easeOutBack",  dur: 0.6, fn: (e) => ({ s: 0.7 + 0.3 * e }) },
  bar:   { curve: "easeOutCubic", dur: 0.7, fn: (e) => ({ sx: e }) },
  fade:  { curve: "linear",       dur: 0.5, fn: () => ({}) },
};

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
};

/* ---------- 1. Prepara as cenas: lê os atributos data-* do HTML ---------- */
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

/* ---------- 2. Monta a interface a partir da lista de cenas ---------- */
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
      keys: $$(".key", row),
    };
  });

  for (let s = 0; s <= DURATION; s++) {
    const tick = document.createElement("span");
    tick.className = "tick" + (s % 2 === 0 ? " major" : "") + (s % 4 === 0 ? " every4" : "");
    tick.style.left = pct(s);
    if (s % 2 === 0 && s < DURATION) tick.innerHTML = `<span>${String(s).padStart(2, "0")}s</span>`;
    ruler.appendChild(tick);
  }
}

/* ---------- 3. Render: desenha um quadro para o tempo t ---------- */
let time = 0;
let currentIndex = -1;

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
  time = clamp(t, 0, DURATION);
  const index = sceneAt(time);
  const scene = SCENES[index];
  const local = time - scene.start;
  let mainState = null;

  // Mostra só a cena ativa
  SCENES.forEach((s, i) => s.el.classList.toggle("active", i === index));

  // Saída: a cena some e sobe um pouco no fim (menos a última)
  const isLast = index === SCENES.length - 1;
  const out = isLast ? 1 : clamp((scene.end - time) / OUT_TIME);
  const outE = ease.easeOutCubic(out);
  scene.el.style.opacity = outE;
  scene.el.style.transform = `translateY(calc(${(1 - outE) * -3} * var(--u)))`;

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
    if (it.main) mainState = { x, y, s, o: p, curve: anim.curve };
  });

  // Letras do nome
  scene.letters.forEach((l) => {
    const p = clamp((local - l.delay) / LETTER_DUR);
    const e = ease.easeOutBack(p);
    l.el.style.opacity = p;
    l.el.style.transform = `translateY(${(1 - e) * 70}%) rotate(${(1 - e) * 14}deg)`;
  });

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
    const px = COMP_W / 100; // 1cqw em pixels de uma composição 1920 px
    ui.pX.textContent = fmt(960 + mainState.x * px);
    ui.pY.textContent = fmt(540 + mainState.y * px);
    ui.pS.textContent = fmt(mainState.s * 100);
    ui.pR.textContent = "+0,0";
    ui.pO.textContent = Math.round(mainState.o * outE * 100);
    ui.iEase.textContent = mainState.curve;
  }

  // Keyframes que o cursor já passou ficam azuis
  SCENES.forEach((s) => s.ui.keys.forEach((k) => k.classList.toggle("passed", parseFloat(k.dataset.t) <= time + 1e-6)));

  // Destaques de cena atual (só quando muda, para não mexer no DOM à toa)
  if (index !== currentIndex) {
    currentIndex = index;
    ui.viewerName.textContent = scene.name;
    ui.propsLayer.textContent = scene.name;
    SCENES.forEach((s, i) => {
      const on = String(i === index);
      s.ui.tab.setAttribute("aria-current", on);
      s.ui.listBtn.setAttribute("aria-current", on);
      s.ui.nameBtn.setAttribute("aria-current", on);
      s.ui.row.classList.toggle("current", i === index);
    });
  }
}

/* ---------- 4. Reprodução ---------- */
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let rafId = null;
let playing = false;

function setPlaying(on) {
  playing = on;
  playBtn.textContent = on ? "❚❚" : "▶";
  playBtn.setAttribute("aria-label", on ? "Pausar" : "Reproduzir");
  ui.iState.textContent = on ? "Reproduzindo" : "Pausado";
}

// Toca em velocidade real de `from` até `to`
function playRange(from, to) {
  cancelAnimationFrame(rafId);
  render(from);
  setPlaying(true);
  const startClock = performance.now();
  const step = (now) => {
    const t = from + (now - startClock) / 1000;
    if (t >= to) {
      render(to);
      setPlaying(false);
      return;
    }
    render(t);
    rafId = requestAnimationFrame(step);
  };
  rafId = requestAnimationFrame(step);
}

function pause() {
  cancelAnimationFrame(rafId);
  setPlaying(false);
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
  } else {
    playRange(scene.start, scene.hold);
  }
}

const step = (dir) => goToScene(sceneAt(time) + dir);

function stepFrames(n) {
  pause();
  render(Math.round(time * FPS + n) / FPS);
}

/* ---------- 5. Interações ---------- */
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
  const move = (ev) => render(Math.round(timeFromPointer(ev) * FPS) / FPS);
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
document.addEventListener("keydown", (e) => {
  if (e.target.closest("input, textarea")) return;
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
  if (e.key === " " && !e.target.closest("input, textarea")) e.preventDefault();
});

/* ---------- 6. Início ---------- */
buildUI();
render(SCENES[0].hold);   // estado de repouso: o nome completo já aparece
setPlaying(false);
if (!reduceMotion) goToScene(0); // e então toca a abertura

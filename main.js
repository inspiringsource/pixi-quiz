// main.js
import { Application, Text, TextStyle, Container, Graphics } from 'pixi.js';

(async () => {
  // boot marker (helps debugging)
  console.log('Teitelbaum-quiz boot');

  const app = new Application();
  await app.init({ background: '#0f141a', resizeTo: window, antialias: true });
  document.body.appendChild(app.canvas);

// --- Sound effects ---
const sfxRight = new Audio('./yay-soundeffect.mp3');
const sfxWrong = new Audio('./oh-soundeffect.mp3');
[sfxRight, sfxWrong].forEach(a => { a.preload = 'auto'; a.volume = 0.7; });
function playSfx(a) { try { a.currentTime = 0; a.play(); } catch (_) { /* ignore autoplay errors */ } }

/* --- Einfache Java-Fragen (Deutsch) --- */
const QUESTION_BANK = [
  { q: "Wofür steht JVM?", opts: ["Java Virtual Machine","Java Version Manager","Java Vendor Module","Just Virtual Mode"], ans: 0 },
  { q: "Welches Schlüsselwort zeigt Vererbung an?", opts: ["with","extends","inherits","include"], ans: 1 },
  { q: "Welcher Datentyp speichert ganze Zahlen?", opts: ["float","int","boolean","char"], ans: 1 },
  { q: "Welche Sammlung ist geordnet und erlaubt Duplikate?", opts: ["Set","List","Map","Enum"], ans: 1 },
  { q: "Welche Sichtbarkeit erlaubt Zugriff aus überall?", opts: ["private","protected","package-private","public"], ans: 3 },
  { q: "Standardwert eines int-Felds (nicht initialisiert)?", opts: ["null","0","NaN","undefined"], ans: 1 },
  { q: "Welches Schlüsselwort verbietet Überschreiben einer Methode?", opts: ["abstract","final","static","default"], ans: 1 },
  { q: "Welche Schnittstelle wird typischerweise zum Sortieren benutzt?", opts: ["Cloneable","Serializable","Comparable","Runnable"], ans: 2 }
];

// Fisher–Yates shuffle (in-place)
function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }
  return arr;
}

// Build a randomized quiz (random question order and randomized answers per question)
function buildQuiz(bank) {
  // copy and shuffle question order
  const order = bank.map(q => ({ q: q.q, opts: q.opts.slice(), ans: q.ans }));
  shuffleInPlace(order);
  // for each question, shuffle answers and recompute answer index
  return order.map(q => {
    const indices = q.opts.map((_, i) => i);
    shuffleInPlace(indices);
    const shuffledOpts = indices.map(i => q.opts[i]);
    const newAns = indices.indexOf(q.ans);
    return { q: q.q, opts: shuffledOpts, ans: newAns };
  });
}

// This will hold the active randomized quiz
let questions = buildQuiz(QUESTION_BANK);

let idx = 0, score = 0, finished = false;

// const app = new Application();
// await app.init({ background: "#0f141a", resizeTo: window, antialias: true });
// document.body.appendChild(app.canvas);

/* --- Styles --- */
const titleStyle  = new TextStyle({ fill: "#fff",    fontFamily: "ui-sans-serif, system-ui", fontSize: 28, fontWeight: "700" });
const qStyle      = new TextStyle({ fill: "#e8f0fe", fontFamily: "ui-sans-serif, system-ui", fontSize: 22, wordWrap: true, wordWrapWidth: 800 });
const btnText     = new TextStyle({ fill: "#0f141a", fontFamily: "ui-sans-serif, system-ui", fontSize: 18, fontWeight: "600" });
const smallStyle  = new TextStyle({ fill: "#b9c0cb", fontFamily: "ui-sans-serif, system-ui", fontSize: 14 });
const resultStyle = new TextStyle({ fill: "#0f141a", fontFamily: "ui-sans-serif, system-ui", fontSize: 18, fontWeight: "600" });
const resultBig   = new TextStyle({ fill: "#0f141a", fontFamily: "ui-sans-serif, system-ui", fontSize: 22, fontWeight: "700" });

/* --- Layers --- */
const root = new Container();      app.stage.addChild(root);
const effects = new Container();   app.stage.addChild(effects);  // confetti layer
const overlay = new Container();   app.stage.addChild(overlay);  // results screen
overlay.visible = false;

/* --- Title / Question / Status --- */
const title = new Text({ text: "Teitelbaum Java Quiz", style: titleStyle }); root.addChild(title);
const questionText = new Text({ text: "", style: qStyle });       root.addChild(questionText);
const scoreText = new Text({ text: "Punkte: 0", style: smallStyle });
const progressText = new Text({ text: "Frage 1 / 8", style: smallStyle });
root.addChild(scoreText, progressText);

/* --- Buttons (A–D) --- */
const buttons = [];
for (let i = 0; i < 4; i++) {
  const btn = makeButton((btnRef) => onPick(i, btnRef));
  buttons.push(btn);
  root.addChild(btn);
}

/* --- Results screen --- */
const resultCard  = new Graphics();
const resultTitle = new Text({ text: "Ergebnis", style: resultBig });
const resultStats = new Text({ text: "", style: resultStyle });
const restartBtn  = makeButton(() => restart());
restartBtn.setLabel("Restart");

overlay.addChild(resultCard, resultTitle, resultStats, restartBtn);

// Pie chart for results
const pieChart = new Graphics();
overlay.addChild(pieChart);

// Legend container (labels + color boxes)
const legend = new Container();
overlay.addChild(legend);

function renderPie(correct, wrong) {
  const total = Math.max(1, correct + wrong);
  const start = -Math.PI / 2; // start at 12 o'clock
  const angleRight = (correct / total) * Math.PI * 2;
  const angleWrong = (wrong   / total) * Math.PI * 2;

  const pad = 16;
  const cx = Math.round(resultCard.x + cardW / 2);

  // Responsive gap under stats
  const gapBelowStats = Math.max(40, Math.round(app.renderer.height * 0.05));
  let cy = Math.round(resultStats.y + resultStats.height + gapBelowStats);

  // Radius that safely fits within the card
  const maxRByWidth  = Math.floor(Math.min(90, Math.max(60, Math.min(cardW * 0.35, (cardW - pad * 2) / 2 - 10))));
  const maxRByHeight = Math.floor((resultCard.y + cardH - 16 - 48 /*restart btn*/ - 16 - cy - 18 /*legend gap*/ - 16 /*legend size budget*/) / 2);
  const radius = Math.max(40, Math.min(maxRByWidth, maxRByHeight));

  // If height is still too tight, push the pie down a bit
  const minTop = resultStats.y + resultStats.height + 40;
  if (cy - radius < minTop) cy = minTop + radius;

  pieChart.clear();
  legend.removeChildren();

  if (angleRight > 0) {
    pieChart.moveTo(cx, cy)
      .arc(cx, cy, radius, start, start + angleRight)
      .lineTo(cx, cy)
      .fill(0x22c55e);
  }
  if (angleWrong > 0) {
    pieChart.moveTo(cx, cy)
      .arc(cx, cy, radius, start + angleRight, start + angleRight + angleWrong)
      .lineTo(cx, cy)
      .fill(0xef4444);
  }
  pieChart.circle(cx, cy, radius).stroke({ width: 1, color: 0xd9dde5 });

  // Legend below the chart
  const legendY = Math.round(cy + radius + 18);
  const gap = Math.max(70, Math.min(120, Math.round(cardW * 0.18)));
  const boxSize = 12;

  const rightBox = new Graphics();
  rightBox.rect(0, 0, boxSize, boxSize).fill(0x22c55e);
  const rightLabel = new Text({ text: " Richtig", style: new TextStyle({ fill: "#0f141a", fontFamily: "ui-sans-serif, system-ui", fontSize: 14 }) });
  const right = new Container();
  right.addChild(rightBox, rightLabel);
  rightLabel.x = boxSize + 6; rightLabel.y = -2;

  const wrongBox = new Graphics();
  wrongBox.rect(0, 0, boxSize, boxSize).fill(0xef4444);
  const wrongLabel = new Text({ text: " Falsch", style: new TextStyle({ fill: "#0f141a", fontFamily: "ui-sans-serif, system-ui", fontSize: 14 }) });
  const wrongC = new Container();
  wrongC.addChild(wrongBox, wrongLabel);
  wrongLabel.x = boxSize + 6; wrongLabel.y = -2;

  right.x = Math.round(cx - gap / 2 - (boxSize + 6 + rightLabel.width) / 2);
  wrongC.x = Math.round(cx + gap / 2 - (boxSize + 6 + wrongLabel.width) / 2);
  right.y = wrongC.y = legendY;

  legend.addChild(right, wrongC);
}

/* --- Layout --- */
let cardW = 0, cardH = 0; // used by renderPie

const layout = () => {
  const pad = 16;
  const w = app.renderer.width;
  const h = app.renderer.height;

  // Content width and responsive heights
  cardW = Math.min(520, w - 2 * pad);
  const safeTop = 40; // leave space for notches / status bar

  // Title
  title.x = pad; title.y = pad;

  // Question width and button metrics
  questionText.style.wordWrapWidth = cardW;
  questionText.x = pad; questionText.y = Math.round(title.y + title.height + 10);

  const btnW = cardW;
  const btnH = Math.max(52, Math.round(h * 0.065));
  const gap = Math.max(8, Math.round(h * 0.012));

  for (let i = 0; i < buttons.length; i++) {
    const b = buttons[i];
    b.position.set(pad, Math.round(questionText.y + questionText.height + 16 + i * (btnH + gap)));
    b.resize(btnW, btnH);
  }
  const lastBtn = buttons[buttons.length - 1];
  scoreText.x = pad; scoreText.y = Math.round(lastBtn.y + btnH + 14);
  progressText.y = scoreText.y; progressText.x = Math.round(pad + cardW - progressText.width);

  // --- Results overlay (center) ---
  // Compute a dynamic card height based on content we plan to show
  const titleH = resultTitle.height;
  const statsH = resultStats.height;
  const gapBelowStats = Math.max(40, Math.round(h * 0.05));
  const estRadius = Math.floor(Math.min(90, Math.max(60, Math.min(cardW * 0.35, (cardW - 32) / 2 - 10))));
  const legendH = 20; // approx
  const restartH = 48;
  const desired = 16 + titleH + 8 + statsH + gapBelowStats + estRadius * 2 + 18 + legendH + 16 + restartH + 16;
  cardH = Math.max(360, Math.min(h - safeTop * 2, Math.round(desired)));

  resultCard.clear();
  resultCard.roundRect(0, 0, cardW, cardH, 16).fill(0xffffff).stroke({ width:1, color:0xd9dde5 });
  resultCard.x = Math.round((w - cardW) / 2);
  resultCard.y = Math.max(Math.round((h - cardH) / 2), safeTop);

  resultTitle.x = resultCard.x + 16;
  resultTitle.y = resultCard.y + 14;

  resultStats.x = resultCard.x + 16;
  resultStats.y = Math.round(resultTitle.y + resultTitle.height + 8);

  restartBtn.position.set(resultCard.x + 16, Math.round(resultCard.y + cardH - 16 - restartH));
  restartBtn.resize(cardW - 32, restartH);
};
window.addEventListener("resize", layout);

/* --- State/UI --- */
function setUI() {
  if (idx >= questions.length) {
    finished = true;
    buttons.forEach(b => b.setEnabled(false));
    scoreText.text = `Punkte: ${score}`;
    progressText.text = "Fertig";
    // Results
    const total = questions.length;
    const wrong = total - score;
    resultStats.text = `Richtig: ${score}   |   Falsch: ${wrong}   |   Gesamt: ${total}` + "\n\n";
    overlay.visible = true;
    layout();
    renderPie(score, wrong);
    return;
  }
  const q = questions[idx];
  questionText.text = q.q;
  for (let i = 0; i < buttons.length; i++) {
    const label = `${String.fromCharCode(65 + i)}) ${q.opts[i]}`;
    buttons[i].setLabel(label);
    buttons[i].setFill(0xffffff); // reset to white each question
  }
  scoreText.text = `Punkte: ${score}`;
  progressText.text = `Frage ${idx + 1} / ${questions.length}`;
  overlay.visible = false;
  layout();
}

function onPick(i, btnRef) {
  if (finished) return;
  const correct = questions[idx].ans === i;

  if (correct) {
    playSfx(sfxRight);
    score++;
    // button = green + confetti
    btnRef.setFill(0x22c55e);
    const b = btnRef.getBounds();
    confettiBurst(b.x + b.width / 2, b.y + b.height / 2);
  } else {
    playSfx(sfxWrong);
    // button = red + shake + score flash red
    btnRef.setFill(0xef4444);
    shake(btnRef, 350);            // 350ms shake
    flashText(scoreText, "#ef4444", 220);
  }

  idx++;
  // Slight delay so player sees the color/animation (esp. shake) before next question
  setTimeout(setUI, correct ? 150 : 360);
}

function restart() {
  idx = 0; score = 0; finished = false;
  questions = buildQuiz(QUESTION_BANK); // new random order & shuffled answers
  buttons.forEach(b => b.setEnabled(true));
  overlay.visible = false;
  pieChart.clear();
  legend.removeChildren();
  setUI();
}

setUI();

/* ------------------------------------------------------------------ */
/*                           Confetti effect                           */
/* ------------------------------------------------------------------ */
const rng = (a, b) => a + Math.random() * (b - a);
const COLORS = [0xff7aa2, 0x7dd3fc, 0x34d399, 0xf59e0b, 0x93c5fd, 0xfda4af, 0xf472b6, 0xa78bfa];
const particles = new Set();

function confettiBurst(x, y, count = 80) {
  for (let i = 0; i < count; i++) {
    const g = new Graphics();
    const w = rng(4, 8), h = rng(6, 12);
    g.rect(-w / 2, -h / 2, w, h);
    g.fill(COLORS[(Math.random() * COLORS.length) | 0]);
    g.x = x; g.y = y;
    g.rotation = rng(0, Math.PI * 2);
    g.vx = Math.cos(rng(0, Math.PI * 2)) * rng(2, 6);
    g.vy = Math.sin(rng(0, Math.PI * 2)) * rng(2, 6) - rng(2, 5);
    g.omega = rng(-0.2, 0.2);
    g.life = rng(45, 70);
    g.alpha = 1;
    effects.addChild(g);
    particles.add(g);
  }
}

app.ticker.add(() => {
  if (!particles.size) return;
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.15;     // gravity
    p.rotation += p.omega;
    p.life -= 1;
    if (p.life < 20) p.alpha = Math.max(0, p.life / 20);
    if (p.life <= 0) { particles.delete(p); p.destroy(); }
  }
});

/* ------------------------------------------------------------------ */
/*                         Tiny tween utilities                        */
/* ------------------------------------------------------------------ */
function shake(container, durationMs = 350, amplitude = 7, freq = 32) {
  const start = performance.now();
  const baseX = container.x, baseY = container.y;
  let done = false;

  const step = () => {
    if (done) return;
    const t = performance.now() - start;
    const p = Math.min(1, t / durationMs);
    const angle = (t / 1000) * freq * Math.PI * 2;
    const damp = 1 - p; // ease out
    container.x = baseX + Math.sin(angle) * amplitude * damp;
    container.y = baseY + Math.cos(angle * 0.9) * (amplitude * 0.5) * damp;
    if (p >= 1) {
      container.x = baseX; container.y = baseY;
      done = true;
    } else {
      requestAnimationFrame(step);
    }
  };
  requestAnimationFrame(step);
}

function flashText(textObj, hex, ms = 200) {
  const prev = textObj.style.fill;
  textObj.style.fill = hex;
  setTimeout(() => { textObj.style.fill = prev; }, ms);
}

/* ------------------------------------------------------------------ */
/*                        Minimal button component                      */
/* ------------------------------------------------------------------ */
function makeButton(onClick) {
  const bg = new Graphics();
  const t = new Text({ text: "Option", style: btnText });
  const hit = new Graphics();
  const c = new Container();
  c.addChild(bg, t, hit);

  let w = 300, h = 56, enabled = true, fill = 0xffffff, stroke = 0xd9dde5;

  const draw = () => {
    bg.clear();
    bg.roundRect(0, 0, w, h, 12).fill(fill).stroke({ width: 1, color: stroke });
    t.x = 14; t.y = (h - t.height) / 2;
    hit.clear(); hit.rect(0, 0, w, h).fill(0xffffff, 0.0001);
  };

  c.eventMode = "static";
  c.cursor = "pointer";
  c.on("pointertap", () => { if (enabled) onClick(c); });
  c.on("pointerover", () => { if (!enabled) return; bg.tint = 0xf2f4f8; });
  c.on("pointerout",  () => { bg.tint = 0xffffff; });

  c.resize   = (nw, nh) => { w = nw; h = nh; draw(); };
  c.setLabel = (s)      => { t.text = s; draw(); };
  c.setEnabled = (e)    => { enabled = e; c.alpha = e ? 1.0 : 0.5; c.eventMode = e ? "static" : "none"; };
  c.setFill    = (hex)  => { fill = hex; draw(); };

  draw();
  return c;
}
})();
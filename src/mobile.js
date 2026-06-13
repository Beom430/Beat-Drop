import { songs, categories, playHitSound } from './songs.js';

// --- 설정 ---
const LANE_COLORS_4 = ['#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3'];
const LANE_COLORS_6 = ['#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3', '#00ff88', '#ff9f43'];
const HIT_ZONE_Y = 0.88;
const NOTE_SPEED = 0.7;
const JUDGE_PERFECT = 60;
const JUDGE_GREAT = 120;
const JUDGE_GOOD = 180;
const JUDGE_MISS = 240;
const MAX_LIVES = 5;

const app = document.getElementById('app');
let state = 'menu';
let selectedSong = 0;
let selectedCategory = 'ncs4k';

function getSongList() { return songs[selectedCategory]; }
function getSelectedSong() { return getSongList()[selectedSong]; }
function getLanes() { return getSelectedSong().lanes; }
function getColors() { return getLanes() === 6 ? LANE_COLORS_6 : LANE_COLORS_4; }

// 게임 상태
let audioElement = null;
let audioCtx = null;
let gameStartTime = 0;
let notes = [];
let score = 0;
let combo = 0;
let maxCombo = 0;
let lives = MAX_LIVES;
let cleared = false;
let paused = false;
let pauseStartTime = 0;
let totalPausedTime = 0;
let judgeCounts = { perfect: 0, great: 0, good: 0, miss: 0 };
let lastJudge = '';
let lastJudgeTimer = 0;
let laneFlash = [];
let particles = [];
let animFrame = null;
let holdingLanes = {};
let syncOffset = JSON.parse(localStorage.getItem('beatdrop_sync') || '0');

let gameCanvas = null;
let gameCtx = null;

// --- 렌더 ---
function render() {
  if (state === 'menu') renderMenu();
  else if (state === 'playing') renderGame();
  else if (state === 'result') renderResult();
}

function renderMenu() {
  const songList = getSongList();
  app.innerHTML = `
    <div class="m-menu">
      <h1 class="m-logo">Beat Drop</h1>

      <div class="m-category-tabs">
        ${categories.map((cat) => `
          <button class="m-cat-tab ${selectedCategory === cat.id ? 'active' : ''}" data-cat="${cat.id}">
            ${cat.icon} ${cat.name}
          </button>
        `).join('')}
      </div>

      <div class="m-song-list">
        ${songList.map((song, i) => `
          <button class="m-song-btn ${i === selectedSong ? 'selected' : ''}" data-idx="${i}">
            <div>
              <div class="m-song-title">${song.title}</div>
              <div class="m-song-meta">${song.artist} · BPM ${song.bpm}</div>
            </div>
            <span class="m-song-diff">${song.difficulty}</span>
          </button>
        `).join('')}
      </div>

      <button class="m-start-btn" id="start-btn">START</button>
    </div>
  `;

  document.querySelectorAll('.m-cat-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      selectedCategory = tab.dataset.cat;
      selectedSong = 0;
      render();
    });
  });

  document.querySelectorAll('.m-song-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedSong = parseInt(btn.dataset.idx);
      render();
    });
  });

  document.getElementById('start-btn').addEventListener('click', startGame);
}

function renderGame() {
  const lanes = getLanes();
  app.innerHTML = `
    <div class="m-game">
      <canvas id="m-canvas"></canvas>

      <div class="m-hearts" id="hearts">
        ${Array.from({ length: MAX_LIVES }).map((_, i) => `<span class="m-heart" id="heart-${i}">&#10084;&#65039;</span>`).join('')}
      </div>

      <button class="m-pause-btn" id="pause-btn">||</button>

      <div class="m-touch-zones" id="touch-zones">
        ${Array.from({ length: lanes }).map((_, i) => `
          <div class="m-touch-zone" data-lane="${i}"></div>
        `).join('')}
      </div>
    </div>
  `;

  gameCanvas = document.getElementById('m-canvas');
  gameCtx = gameCanvas.getContext('2d');
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // 터치 이벤트
  const zones = document.getElementById('touch-zones');
  zones.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (paused) return;
    for (const touch of e.changedTouches) {
      const lane = getLaneFromTouch(touch);
      if (lane >= 0) hitLane(lane);
    }
  });

  zones.addEventListener('touchend', (e) => {
    e.preventDefault();
    for (const touch of e.changedTouches) {
      const lane = getLaneFromTouch(touch);
      if (lane >= 0) releaseLane(lane);
    }
  });

  document.getElementById('pause-btn').addEventListener('click', () => {
    if (!paused) pauseGame();
    else resumeGame();
  });

  gameLoop();
}

function getLaneFromTouch(touch) {
  const x = touch.clientX;
  const w = window.innerWidth;
  const lanes = getLanes();
  const lane = Math.floor(x / (w / lanes));
  return Math.max(0, Math.min(lanes - 1, lane));
}

function resizeCanvas() {
  if (!gameCanvas) return;
  gameCanvas.width = window.innerWidth;
  gameCanvas.height = window.innerHeight;
}

function renderResult() {
  const song = getSelectedSong();
  const totalNotes = judgeCounts.perfect + judgeCounts.great + judgeCounts.good + judgeCounts.miss;
  const accuracy = totalNotes > 0
    ? Math.round(((judgeCounts.perfect * 100 + judgeCounts.great * 70 + judgeCounts.good * 40) / (totalNotes * 100)) * 100)
    : 0;
  let rank = 'F';
  if (accuracy >= 95) rank = 'S';
  else if (accuracy >= 90) rank = 'A';
  else if (accuracy >= 80) rank = 'B';
  else if (accuracy >= 70) rank = 'C';
  else if (accuracy >= 60) rank = 'D';
  const rankColors = { S: '#ffd700', A: '#00ff88', B: '#48dbfb', C: '#feca57', D: '#ff9ff3', F: '#ff6b6b' };

  app.innerHTML = `
    <div class="m-result">
      <div class="m-result-status">${cleared ? 'CLEARED!' : 'FAILED...'}</div>
      <div class="m-result-rank" style="color:${rankColors[rank]}">${rank}</div>
      <div class="m-result-score">${score.toLocaleString()}</div>
      <div class="m-result-judges">
        <div class="m-judge-item"><span class="m-judge-count" style="color:#ffd700">${judgeCounts.perfect}</span><br><span class="m-judge-label">PERFECT</span></div>
        <div class="m-judge-item"><span class="m-judge-count" style="color:#48dbfb">${judgeCounts.great}</span><br><span class="m-judge-label">GREAT</span></div>
        <div class="m-judge-item"><span class="m-judge-count" style="color:#2ecc71">${judgeCounts.good}</span><br><span class="m-judge-label">GOOD</span></div>
        <div class="m-judge-item"><span class="m-judge-count" style="color:#ff6b6b">${judgeCounts.miss}</span><br><span class="m-judge-label">MISS</span></div>
      </div>
      <div style="color:#888;font-size:0.8rem;">Max Combo: ${maxCombo} | Accuracy: ${accuracy}%</div>
      <button class="m-back-btn" id="back-btn">Menu</button>
    </div>
  `;
  document.getElementById('back-btn').addEventListener('click', () => { state = 'menu'; render(); });
}

// --- 게임 로직 ---
function startGame() {
  const song = getSelectedSong();
  const lanes = getLanes();
  notes = song.notes.map((n) => ({
    ...n,
    lane: n.hold ? n.lane : Math.floor(Math.random() * lanes),
    hit: false,
    missed: false,
  }));
  score = 0; combo = 0; maxCombo = 0; lives = MAX_LIVES; cleared = false;
  paused = false; pauseStartTime = 0; totalPausedTime = 0;
  judgeCounts = { perfect: 0, great: 0, good: 0, miss: 0 };
  lastJudge = ''; lastJudgeTimer = 0;
  laneFlash = new Array(lanes).fill(0);
  particles = []; holdingLanes = {};

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  if (song.audioSrc) {
    audioElement = new Audio(song.audioSrc);
    audioElement.volume = 0.8;
    audioElement.addEventListener('playing', () => {
      gameStartTime = performance.now() + syncOffset;
    }, { once: true });
    audioElement.play().catch(() => {});
    audioElement.addEventListener('ended', () => {
      if (state === 'playing') { cleared = true; state = 'result'; render(); }
    });
  }

  gameStartTime = song.audioSrc ? performance.now() + 999999 : performance.now() + 1000;
  state = 'playing';
  render();
}

function pauseGame() {
  paused = true;
  pauseStartTime = performance.now();
  if (audioElement) audioElement.pause();
  const overlay = document.createElement('div');
  overlay.id = 'pause-overlay';
  overlay.innerHTML = `
    <div class="pause-card">
      <div class="pause-title">PAUSED</div>
      <div class="pause-btns">
        <button class="btn-resume" id="resume-btn">Resume</button>
        <button class="btn-exit" id="exit-btn">Exit</button>
      </div>
    </div>
  `;
  document.querySelector('.m-game').appendChild(overlay);
  document.getElementById('resume-btn').addEventListener('click', resumeGame);
  document.getElementById('exit-btn').addEventListener('click', exitGame);
}

function resumeGame() {
  totalPausedTime += performance.now() - pauseStartTime;
  paused = false;
  const overlay = document.getElementById('pause-overlay');
  if (overlay) overlay.remove();
  if (audioElement) audioElement.play().catch(() => {});
  gameLoop();
}

function exitGame() {
  paused = false;
  if (animFrame) cancelAnimationFrame(animFrame);
  if (audioCtx) { audioCtx.close(); audioCtx = null; }
  if (audioElement) { audioElement.pause(); audioElement = null; }
  state = 'menu'; render();
}

function endGame() {
  if (animFrame) cancelAnimationFrame(animFrame);
  if (audioCtx) { audioCtx.close(); audioCtx = null; }
  if (audioElement) { audioElement.pause(); audioElement = null; }
  state = 'result'; render();
}

function loseLife() {
  lives--;
  const el = document.getElementById(`heart-${lives}`);
  if (el) el.classList.add('lost');
}

function gameLoop() {
  if (state !== 'playing' || paused) return;
  const now = performance.now();
  const elapsed = now - gameStartTime - totalPausedTime;
  const song = getSelectedSong();

  if (elapsed > (song.duration) + 2000) {
    cleared = true; state = 'result'; render(); return;
  }

  for (const note of notes) {
    if (!note.hit && !note.missed && elapsed - note.time > JUDGE_MISS) {
      if (note.hold) {
        if (elapsed - (note.time + note.hold) > JUDGE_MISS) {
          note.missed = true; judgeCounts.miss++; combo = 0;
          lastJudge = 'MISS'; lastJudgeTimer = 30;
          loseLife(); if (lives <= 0) { endGame(); return; }
        }
      } else {
        note.missed = true; judgeCounts.miss++; combo = 0;
        lastJudge = 'MISS'; lastJudgeTimer = 30;
        loseLife(); if (lives <= 0) { endGame(); return; }
      }
    }
  }

  // 홀딩 틱
  for (const lane in holdingLanes) {
    const h = holdingLanes[lane];
    if (now - h.lastTick >= 200) {
      score += 50; combo++; if (combo > maxCombo) maxCombo = combo;
      h.lastTick = now;
    }
  }

  particles = particles.filter((p) => p.life > 0);
  particles.forEach((p) => { p.x += p.vx; p.y += p.vy; p.vy += 0.2; p.life--; });
  laneFlash = laneFlash.map((v) => Math.max(0, v - 0.05));
  if (lastJudgeTimer > 0) lastJudgeTimer--;

  drawFrame(elapsed);
  animFrame = requestAnimationFrame(gameLoop);
}

function drawFrame(elapsed) {
  const w = gameCanvas.width;
  const h = gameCanvas.height;
  const ctx = gameCtx;
  const lanes = getLanes();
  const colors = getColors();
  const laneWidth = w / lanes;
  const hitY = h * HIT_ZONE_Y;

  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(0, 0, w, h);

  // 레인 구분
  for (let i = 1; i < lanes; i++) {
    ctx.strokeStyle = '#ffffff08';
    ctx.beginPath();
    ctx.moveTo(i * laneWidth, 0);
    ctx.lineTo(i * laneWidth, h);
    ctx.stroke();
  }

  // 레인 플래시
  for (let i = 0; i < lanes; i++) {
    if (laneFlash[i] > 0) {
      const g = ctx.createLinearGradient(0, hitY - 80, 0, hitY + 30);
      g.addColorStop(0, 'transparent');
      g.addColorStop(0.5, colors[i] + Math.floor(laneFlash[i] * 50).toString(16).padStart(2, '0'));
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.fillRect(i * laneWidth, hitY - 80, laneWidth, 110);
    }
  }

  // 홀딩 이펙트
  for (const lane in holdingLanes) {
    const li = parseInt(lane);
    const note = holdingLanes[li];
    if (elapsed < note.time + note.hold) {
      const g = ctx.createLinearGradient(0, 0, 0, hitY);
      g.addColorStop(0, colors[li] + '08');
      g.addColorStop(1, colors[li] + '30');
      ctx.fillStyle = g;
      ctx.fillRect(li * laneWidth, 0, laneWidth, hitY);
    }
  }

  // 판정선
  ctx.fillStyle = '#ffffff22';
  ctx.fillRect(0, hitY - 1, w, 2);

  // 노트
  for (const note of notes) {
    if (note.hit) continue;
    if (note.missed && !note.hold) continue;
    if (note.missed && note.hold && elapsed > note.time + note.hold) continue;

    const timeDiff = note.time - elapsed;
    const noteY = hitY - (timeDiff / 1000) * h * NOTE_SPEED;

    if (note.hold) {
      const tailTimeDiff = (note.time + note.hold) - elapsed;
      const tailY = hitY - (tailTimeDiff / 1000) * h * NOTE_SPEED;
      const topY = Math.min(noteY, tailY);
      const botY = Math.max(noteY, tailY);
      if (botY < -30 || topY > h + 30) continue;

      ctx.fillStyle = colors[note.lane] + '33';
      ctx.fillRect(note.lane * laneWidth + 6, topY, laneWidth - 12, botY - topY);
      ctx.fillStyle = colors[note.lane] + 'aa';
      ctx.beginPath();
      ctx.roundRect(note.lane * laneWidth + 4, noteY - 8, laneWidth - 8, 16, 4);
      ctx.fill();
      ctx.fillStyle = colors[note.lane] + '88';
      ctx.beginPath();
      ctx.roundRect(note.lane * laneWidth + 6, tailY - 5, laneWidth - 12, 10, 4);
      ctx.fill();
    } else {
      if (noteY < -30 || noteY > h + 30) continue;
      ctx.fillStyle = colors[note.lane];
      ctx.shadowColor = colors[note.lane];
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.roundRect(note.lane * laneWidth + 4, noteY - 8, laneWidth - 8, 16, 4);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  // 파티클
  for (const p of particles) {
    ctx.fillStyle = p.color + Math.floor((p.life / p.maxLife) * 255).toString(16).padStart(2, '0');
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }

  // 판정 텍스트
  if (lastJudgeTimer > 0 && lastJudge) {
    const jc = { PERFECT: '#ffd700', GREAT: '#48dbfb', GOOD: '#2ecc71', MISS: '#ff6b6b', HOLD: '#ff9ff3' };
    ctx.fillStyle = jc[lastJudge] || '#fff';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(lastJudge, w / 2, hitY - 40);
  }

  // 콤보
  if (combo > 2) {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(combo.toString(), w / 2, h * 0.2);
    ctx.fillStyle = '#555';
    ctx.font = '9px monospace';
    ctx.fillText('COMBO', w / 2, h * 0.2 + 14);
  }

  // 스코어
  ctx.fillStyle = '#eee';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(score.toLocaleString(), 10, 28);
}

// --- 입력 ---
function hitLane(lane) {
  if (state !== 'playing' || paused) return;
  const elapsed = performance.now() - gameStartTime - totalPausedTime;
  const colors = getColors();
  laneFlash[lane] = 1;

  let closest = null;
  let closestDiff = Infinity;
  for (const note of notes) {
    if (note.hit || note.missed || note.lane !== lane) continue;
    const diff = Math.abs(elapsed - note.time);
    if (diff < closestDiff) { closestDiff = diff; closest = note; }
  }

  if (!closest || closestDiff > JUDGE_MISS) {
    // 진행 중 롱노트 중간 잡기
    for (const note of notes) {
      if (note.hit || note.lane !== lane || !note.hold) continue;
      if (elapsed > note.time && elapsed < note.time + note.hold) {
        note.hit = true; note.missed = false;
        holdingLanes[lane] = { ...note, lastTick: performance.now() };
        combo++; if (combo > maxCombo) maxCombo = combo;
        score += 50; lastJudge = 'GOOD'; lastJudgeTimer = 20; judgeCounts.good++;
        return;
      }
    }
    return;
  }

  closest.hit = true;

  if (closest.hold) {
    let j; if (closestDiff <= JUDGE_PERFECT) { j = 'PERFECT'; score += 300; judgeCounts.perfect++; }
    else if (closestDiff <= JUDGE_GREAT) { j = 'GREAT'; score += 200; judgeCounts.great++; }
    else { j = 'GOOD'; score += 100; judgeCounts.good++; }
    holdingLanes[lane] = { ...closest, lastTick: performance.now() };
    combo++; if (combo > maxCombo) maxCombo = combo;
    lastJudge = j; lastJudgeTimer = 20;
    spawnParticles(lane);
    return;
  }

  let judge, points;
  if (closestDiff <= JUDGE_PERFECT) { judge = 'PERFECT'; points = 300; judgeCounts.perfect++; }
  else if (closestDiff <= JUDGE_GREAT) { judge = 'GREAT'; points = 200; judgeCounts.great++; }
  else if (closestDiff <= JUDGE_GOOD) { judge = 'GOOD'; points = 100; judgeCounts.good++; }
  else { judgeCounts.miss++; combo = 0; lastJudge = 'MISS'; lastJudgeTimer = 30; loseLife(); if (lives <= 0) endGame(); return; }

  combo++; if (combo > maxCombo) maxCombo = combo;
  score += points * (1 + Math.floor(combo / 10) * 0.1);
  score = Math.round(score);
  lastJudge = judge; lastJudgeTimer = 30;
  spawnParticles(lane);
}

function releaseLane(lane) {
  if (holdingLanes[lane]) {
    const note = holdingLanes[lane];
    const elapsed = performance.now() - gameStartTime - totalPausedTime;
    const diff = Math.abs(elapsed - (note.time + note.hold));
    if (diff < JUDGE_GOOD) { score += 200; judgeCounts.perfect++; }
    else { score += 50; judgeCounts.good++; }
    delete holdingLanes[lane];
  }
}

function spawnParticles(lane) {
  const w = window.innerWidth;
  const lanes = getLanes();
  const colors = getColors();
  const laneWidth = w / lanes;
  const hitY = window.innerHeight * HIT_ZONE_Y;
  const px = (lane + 0.5) * laneWidth;
  for (let i = 0; i < 8; i++) {
    particles.push({
      x: px + (Math.random() - 0.5) * 20,
      y: hitY,
      vx: (Math.random() - 0.5) * 6,
      vy: (Math.random() - 1) * 5,
      size: Math.random() * 3 + 1,
      color: colors[lane],
      life: 25, maxLife: 25,
    });
  }
}

render();

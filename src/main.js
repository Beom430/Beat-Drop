import { songs, categories, createAudioTrack, playHitSound } from './songs.js';

// --- 설정 ---
const DEFAULT_KEYS_4 = ['d', 'f', 'j', 'k'];
const DEFAULT_KEYS_6 = ['s', 'd', 'f', 'j', 'k', 'l'];
let LANE_KEYS_4 = JSON.parse(localStorage.getItem('beatdrop_keys4') || JSON.stringify(DEFAULT_KEYS_4));
let LANE_KEYS_6 = JSON.parse(localStorage.getItem('beatdrop_keys6') || JSON.stringify(DEFAULT_KEYS_6));

const LANE_COLORS_4 = ['#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3'];
const LANE_COLORS_6 = ['#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3', '#00ff88', '#ff9f43'];

const HIT_ZONE_Y = 0.85;
const JUDGE_PERFECT = 50;
const JUDGE_GREAT = 100;
const JUDGE_GOOD = 150;
const JUDGE_MISS = 200;
const GAME_WIDTH = 340;
const NOTE_SPEEDS = [0.4, 0.6, 0.8, 1.0, 1.3];
const SPEED_LABELS = ['x0.4', 'x0.6', 'x0.8', 'x1.0', 'x1.3'];
let noteSpeedIdx = JSON.parse(localStorage.getItem('beatdrop_speed') || '2'); // 기본 x0.8
let syncOffset = JSON.parse(localStorage.getItem('beatdrop_sync') || '0'); // ms 단위 싱크 오프셋
function getNoteSpeed() { return NOTE_SPEEDS[noteSpeedIdx]; }

function getCurrentKeys() {
  const song = getSelectedSong();
  return song.lanes === 6 ? LANE_KEYS_6 : LANE_KEYS_4;
}
function getCurrentLabels() {
  return getCurrentKeys().map((k) => k.toUpperCase());
}
function getCurrentColors() {
  const song = getSelectedSong();
  return song.lanes === 6 ? LANE_COLORS_6 : LANE_COLORS_4;
}
function getCurrentLanes() {
  return getSelectedSong().lanes;
}

const app = document.getElementById('app');
let state = 'menu';
let selectedSong = 0;
let selectedCategory = 'ncs4k';

function getSongList() {
  return songs[selectedCategory];
}
function getSelectedSong() {
  return getSongList()[selectedSong];
}

// 게임 상태
let audioCtx = null;
let gameStartTime = 0;
let notes = [];
let score = 0;
let combo = 0;
let maxCombo = 0;
let lives = 5;
const MAX_LIVES = 5;
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
let holdingLanes = {}; // { lane: noteObj } 현재 누르고 있는 롱노트

// 배경 파티클
let bgParticles = [];
function initBgParticles() {
  bgParticles = [];
  for (let i = 0; i < 40; i++) {
    bgParticles.push({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      size: Math.random() * 2 + 0.5,
      speed: Math.random() * 0.4 + 0.1,
      color: LANE_COLORS_4[Math.floor(Math.random() * 4)],
      opacity: Math.random() * 0.2 + 0.05,
    });
  }
}
initBgParticles();

// 설정 상태
let settingKeyIndex = -1;
let settingMode = 4;

function saveKeys() {
  localStorage.setItem('beatdrop_keys4', JSON.stringify(LANE_KEYS_4));
  localStorage.setItem('beatdrop_keys6', JSON.stringify(LANE_KEYS_6));
}

function scrollToSelected() {
  const btn = document.querySelector('.song-btn.selected');
  if (btn) btn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// --- 렌더 ---
function render() {
  if (state === 'menu') renderMenu();
  else if (state === 'settings') renderSettings();
  else if (state === 'playing') renderGame();
  else if (state === 'result') renderResult();
}

function renderMenu() {
  const songList = getSongList();
  
  // 메뉴 배경음악
  if (!menuAudio) {
    menuAudio = new Audio('/music/Dropouts, Aloma Steele - Unity (feat. Aloma Steele) [NCS Release].mp3');
    menuAudio.volume = 0.3;
    menuAudio.loop = true;
  }
  if (!menuMuted) {
    menuAudio.play().catch(() => {});
  } else {
    menuAudio.pause();
  }

  app.innerHTML = `
    <div class="menu-screen">
      <canvas id="bg-canvas"></canvas>
      <div class="menu-content">

        <div class="logo-area">
          <div class="logo-glow"></div>
          <h1 class="logo">Beat Drop</h1>
          <p class="logo-sub">rhythm game</p>
        </div>

        <div class="category-tabs">
          ${categories.map((cat) => `
            <button class="category-tab ${selectedCategory === cat.id ? 'active' : ''}" data-cat="${cat.id}">
              ${cat.icon} ${cat.name}
            </button>
          `).join('')}
        </div>

        <div class="song-list">
          ${songList.map((song, i) => `
            <button class="song-btn ${i === selectedSong ? 'selected' : ''}" data-idx="${i}">
              <div class="song-info">
                <span class="song-title">${song.title}</span>
                <span class="song-meta">${song.artist} · BPM ${song.bpm}${song.lanes === 6 ? ' · 6KEY' : ''}</span>
              </div>
              <div class="song-right">
                <span class="song-diff-label">${song.diffLabel}</span>
                <span class="song-diff">${song.difficulty}</span>
              </div>
              <div class="song-accent" style="background:${(song.lanes === 6 ? LANE_COLORS_6 : LANE_COLORS_4)[i % 4]};"></div>
            </button>
          `).join('')}
        </div>

        <div class="menu-buttons">
          <button id="start-btn" class="btn-primary">
            <span class="btn-icon">&#9654;</span> START
          </button>
          <button id="settings-btn" class="btn-secondary">&#9881; Settings</button>
          <button id="speed-btn" class="btn-secondary">${SPEED_LABELS[noteSpeedIdx]}</button>
          <button id="mute-btn" class="btn-secondary">${menuMuted ? '&#128263;' : '&#128266;'}</button>
        </div>

        <div class="menu-hint">ESC to quit | Mobile: tap bottom</div>
      </div>

      <div class="deco-text left">Beat Drop</div>
      <div class="deco-text right">Beat Drop</div>
    </div>
  `;

  const bgCanvas = document.getElementById('bg-canvas');
  const bgCtx = bgCanvas.getContext('2d');
  bgCanvas.width = window.innerWidth;
  bgCanvas.height = window.innerHeight;
  animateBg(bgCanvas, bgCtx);

  document.querySelectorAll('.category-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      selectedCategory = tab.dataset.cat;
      selectedSong = 0;
      render();
    });
  });

  document.querySelectorAll('.song-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedSong = parseInt(btn.dataset.idx);
      render();
    });
  });
  document.getElementById('start-btn').addEventListener('click', startGame);
  document.getElementById('settings-btn').addEventListener('click', () => {
    state = 'settings';
    settingMode = 4;
    render();
  });
  document.getElementById('mute-btn').addEventListener('click', () => {
    menuMuted = !menuMuted;
    localStorage.setItem('beatdrop_muted', JSON.stringify(menuMuted));
    if (menuMuted) {
      menuAudio.pause();
    } else {
      menuAudio.play().catch(() => {});
    }
    render();
  });
  document.getElementById('speed-btn').addEventListener('click', () => {
    noteSpeedIdx = (noteSpeedIdx + 1) % NOTE_SPEEDS.length;
    localStorage.setItem('beatdrop_speed', JSON.stringify(noteSpeedIdx));
    render();
  });
}

function animateBg(canvas, ctx) {
  if (state !== 'menu') return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const grad = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 0, canvas.width / 2, canvas.height / 2, canvas.width * 0.7);
  grad.addColorStop(0, '#12122a');
  grad.addColorStop(1, '#0a0a1a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (const p of bgParticles) {
    p.y -= p.speed;
    if (p.y < -10) { p.y = canvas.height + 10; p.x = Math.random() * canvas.width; }
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fillStyle = p.color + Math.floor(p.opacity * 255).toString(16).padStart(2, '0');
    ctx.fill();
  }

  requestAnimationFrame(() => animateBg(canvas, ctx));
}

function renderSettings() {
  const keys = settingMode === 6 ? LANE_KEYS_6 : LANE_KEYS_4;
  const colors = settingMode === 6 ? LANE_COLORS_6 : LANE_COLORS_4;

  app.innerHTML = `
    <div class="settings-screen">
      <div class="settings-card">
        <h2 class="settings-title">&#9881; Key Settings</h2>
        <p class="settings-desc">Click a button then press the key you want to assign.</p>

        <div class="settings-mode-tabs">
          <button class="mode-tab ${settingMode === 4 ? 'active' : ''}" data-mode="4">4KEY</button>
          <button class="mode-tab ${settingMode === 6 ? 'active' : ''}" data-mode="6">6KEY</button>
        </div>

        <div class="key-grid ${settingMode === 6 ? 'six' : ''}">
          ${keys.map((key, i) => `
            <div class="key-item">
              <div class="key-lane" style="color:${colors[i]};">Lane ${i + 1}</div>
              <button class="key-btn ${settingKeyIndex === i ? 'listening' : ''}" data-idx="${i}" style="border-color:${colors[i]};">
                ${settingKeyIndex === i ? '...' : key.toUpperCase()}
              </button>
            </div>
          `).join('')}
        </div>

        <div class="settings-presets">
          <p class="preset-label">Presets:</p>
          ${settingMode === 4 ? `
            <button class="preset-btn" data-keys="d,f,j,k">D F J K</button>
            <button class="preset-btn" data-keys="a,s,k,l">A S K L</button>
          ` : `
            <button class="preset-btn" data-keys="s,d,f,j,k,l">S D F J K L</button>
            <button class="preset-btn" data-keys="a,s,d,j,k,l">A S D J K L</button>
          `}
        </div>

        <div class="sync-section">
          <p class="preset-label">Sync Offset: <span id="sync-value">${syncOffset}ms</span></p>
          <p class="settings-desc">+ = notes earlier, - = notes later</p>
          <div class="sync-btns">
            <button class="preset-btn" id="sync-down-10">-10</button>
            <button class="preset-btn" id="sync-down-5">-5</button>
            <button class="preset-btn" id="sync-reset">0</button>
            <button class="preset-btn" id="sync-up-5">+5</button>
            <button class="preset-btn" id="sync-up-10">+10</button>
          </div>
        </div>

        <div class="settings-actions">
          <button id="back-menu" class="btn-secondary">&#8592; Back</button>
        </div>
      </div>
    </div>
  `;

  document.querySelectorAll('.mode-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      settingMode = parseInt(tab.dataset.mode);
      settingKeyIndex = -1;
      render();
    });
  });

  document.querySelectorAll('.key-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      settingKeyIndex = parseInt(btn.dataset.idx);
      render();
    });
  });

  document.querySelectorAll('.preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const newKeys = btn.dataset.keys.split(',');
      if (settingMode === 6) LANE_KEYS_6 = newKeys;
      else LANE_KEYS_4 = newKeys;
      saveKeys();
      settingKeyIndex = -1;
      render();
    });
  });

  document.getElementById('back-menu').addEventListener('click', () => {
    settingKeyIndex = -1;
    state = 'menu';
    render();
  });

  // 싱크 조절
  const syncBtns = [
    { id: 'sync-down-10', val: -10 },
    { id: 'sync-down-5', val: -5 },
    { id: 'sync-reset', val: null },
    { id: 'sync-up-5', val: 5 },
    { id: 'sync-up-10', val: 10 },
  ];
  syncBtns.forEach(({ id, val }) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', () => {
      syncOffset = val === null ? 0 : syncOffset + val;
      localStorage.setItem('beatdrop_sync', JSON.stringify(syncOffset));
      render();
    });
  });
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
    <div class="result-screen">
      <div class="result-card">
        <div class="result-status">${cleared ? 'CLEARED!' : 'FAILED...'}</div>
        <div class="result-song">${song.title}</div>
        <div class="result-rank" style="color:${rankColors[rank]};text-shadow:0 0 40px ${rankColors[rank]}66;">${rank}</div>
        <div class="result-score">${score.toLocaleString()}</div>
        <div class="result-judges">
          <div class="judge-item"><span class="judge-count" style="color:#ffd700;">${judgeCounts.perfect}</span><span class="judge-label">PERFECT</span></div>
          <div class="judge-item"><span class="judge-count" style="color:#48dbfb;">${judgeCounts.great}</span><span class="judge-label">GREAT</span></div>
          <div class="judge-item"><span class="judge-count" style="color:#2ecc71;">${judgeCounts.good}</span><span class="judge-label">GOOD</span></div>
          <div class="judge-item"><span class="judge-count" style="color:#ff6b6b;">${judgeCounts.miss}</span><span class="judge-label">MISS</span></div>
        </div>
        <div class="result-stats">Max Combo: ${maxCombo} | Accuracy: ${accuracy}%</div>
        <button id="back-btn" class="btn-secondary">&#8592; Menu</button>
      </div>
    </div>
  `;

  document.getElementById('back-btn').addEventListener('click', () => {
    state = 'menu';
    render();
  });
}

// --- 게임 플레이 ---
let gameCanvas = null;
let gameCtx = null;

function renderGame() {
  const song = getSelectedSong();
  const labels = getCurrentLabels();
  const colors = getCurrentColors();
  const lanes = getCurrentLanes();
  const gameW = lanes === 6 ? 420 : GAME_WIDTH;

  app.innerHTML = `
    <div class="game-screen">
      <div class="deco-text left">Beat Drop</div>
      <div class="deco-text right">Beat Drop</div>

      <div class="hearts" id="hearts">
        ${Array.from({ length: MAX_LIVES }).map((_, i) => `<span class="heart" id="heart-${i}">&#10084;&#65039;</span>`).join('')}
      </div>

      <div class="game-area" style="width:${gameW}px;">
        <canvas id="game-canvas"></canvas>
      </div>

      <div class="mobile-btns" style="width:${gameW}px;">
        ${labels.map((l, i) => `
          <button class="mobile-lane" data-lane="${i}" style="
            border-top-color:${colors[i]};
            color:${colors[i]};
          ">${l}</button>
        `).join('')}
      </div>
    </div>
  `;

  gameCanvas = document.getElementById('game-canvas');
  gameCtx = gameCanvas.getContext('2d');
  resizeCanvas();

  document.querySelectorAll('.mobile-lane').forEach((btn) => {
    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      hitLane(parseInt(btn.dataset.lane));
    });
  });

  window.addEventListener('resize', resizeCanvas);
  gameLoop();
}

function resizeCanvas() {
  if (!gameCanvas) return;
  const rect = gameCanvas.parentElement.getBoundingClientRect();
  gameCanvas.width = rect.width;
  gameCanvas.height = rect.height;
}

let audioElement = null;
let menuAudio = null;
let menuMuted = JSON.parse(localStorage.getItem('beatdrop_muted') || 'false');

function loseLife() {
  lives--;
  updateHearts();
}

function updateHearts() {
  for (let i = 0; i < MAX_LIVES; i++) {
    const el = document.getElementById(`heart-${i}`);
    if (el) {
      if (i < lives) el.classList.remove('lost');
      else el.classList.add('lost');
    }
  }
}

function pauseGame() {
  paused = true;
  pauseStartTime = performance.now();
  if (audioElement) audioElement.pause();

  // 일시정지 오버레이 표시
  const overlay = document.createElement('div');
  overlay.id = 'pause-overlay';
  overlay.innerHTML = `
    <div class="pause-card">
      <h2 class="pause-title">PAUSED</h2>
      <div class="pause-btns">
        <button id="resume-btn" class="btn-primary">&#9654; Resume</button>
        <button id="exit-btn" class="btn-secondary">&#10005; Exit</button>
      </div>
    </div>
  `;
  document.querySelector('.game-screen').appendChild(overlay);

  document.getElementById('resume-btn').addEventListener('click', resumeGame);
  document.getElementById('exit-btn').addEventListener('click', exitGame);
}

function resumeGame() {
  const pauseDuration = performance.now() - pauseStartTime;
  totalPausedTime += pauseDuration;
  paused = false;

  // 오버레이 제거
  const overlay = document.getElementById('pause-overlay');
  if (overlay) overlay.remove();

  // 음악 재개
  if (audioElement) {
    audioElement.playbackRate = getNoteSpeed() / 0.8;
    audioElement.play().catch(() => {});
  }

  // 게임루프 재시작
  gameLoop();
}

function exitGame() {
  paused = false;
  if (animFrame) cancelAnimationFrame(animFrame);
  if (audioCtx) { audioCtx.close(); audioCtx = null; }
  if (audioElement) { audioElement.pause(); audioElement = null; }
  state = 'menu';
  render();
}

function endGame() {
  if (animFrame) cancelAnimationFrame(animFrame);
  if (audioCtx) { audioCtx.close(); audioCtx = null; }
  if (audioElement) { audioElement.pause(); audioElement = null; }
  state = 'result';
  render();
}

function startGame() {
  // 메뉴 음악 정지
  if (menuAudio) { menuAudio.pause(); menuAudio.currentTime = 0; }

  const song = getSelectedSong();
  const baseNotes = song.notes;
  // 음악 배속 비율 (0.8이 기본)
  const speedRatio = getNoteSpeed() / 0.8;
  // 레인만 랜덤 셔플 + 배속에 맞게 타이밍 조정
  const lanes = song.lanes;
  notes = baseNotes.map((n) => ({
    ...n,
    time: n.time / speedRatio, // 배속에 맞게 타이밍 조정
    hold: n.hold ? n.hold / speedRatio : undefined,
    lane: n.hold ? n.lane : Math.floor(Math.random() * lanes),
    hit: false,
    missed: false,
  }));
  score = 0;
  combo = 0;
  maxCombo = 0;
  lives = MAX_LIVES;
  cleared = false;
  paused = false;
  pauseStartTime = 0;
  totalPausedTime = 0;
  judgeCounts = { perfect: 0, great: 0, good: 0, miss: 0 };
  lastJudge = '';
  lastJudgeTimer = 0;
  laneFlash = new Array(song.lanes).fill(0);
  particles = [];
  holdingLanes = {};

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  if (song.audioSrc) {
    audioElement = new Audio(song.audioSrc);
    audioElement.volume = 0.7;
    // 음악이 실제로 재생 시작되면 게임 타이머 시작 (싱크 오프셋 보정)
    audioElement.addEventListener('playing', () => {
      gameStartTime = performance.now() + syncOffset - 50;
    }, { once: true });
    audioElement.playbackRate = getNoteSpeed() / 0.8; // 0.8배속이 기본, 그 기준으로 비율 조정
    audioElement.play().catch(() => {});
    audioElement.addEventListener('ended', () => {
      if (state === 'playing') {
        cleared = true;
        state = 'result';
        render();
      }
    });
  }

  // 음원 없는 곡은 1초 후 시작, 음원 있는 곡은 playing 이벤트에서 시작
  if (!song.audioSrc) {
    gameStartTime = performance.now() + 1000;
  } else {
    // playing 이벤트 전까지 노트 안 떨어지도록 미래 시간 설정
    gameStartTime = performance.now() + 999999;
  }
  state = 'playing';
  render();
}

function gameLoop() {
  if (state !== 'playing') return;
  if (paused) return;

  const now = performance.now();
  const elapsed = now - gameStartTime - totalPausedTime;
  const song = getSelectedSong();

  if (elapsed > (song.duration / (getNoteSpeed() / 0.8)) + 2000) {
    cleared = true;
    state = 'result';
    render();
    return;
  }

  for (const note of notes) {
    if (!note.hit && !note.missed && elapsed - note.time > JUDGE_MISS) {
      // 롱노트는 hold 끝 시간 기준으로 미스 판정
      if (note.hold) {
        if (elapsed - (note.time + note.hold) > JUDGE_MISS) {
          note.missed = true;
          judgeCounts.miss++;
          combo = 0;
          lastJudge = 'MISS';
          lastJudgeTimer = 30;
          loseLife();
          if (lives <= 0) { endGame(); return; }
        }
      } else {
        note.missed = true;
        judgeCounts.miss++;
        combo = 0;
        lastJudge = 'MISS';
        lastJudgeTimer = 30;
        loseLife();
        if (lives <= 0) { endGame(); return; }
      }
    }
  }

  particles = particles.filter((p) => p.life > 0);
  particles.forEach((p) => {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.2;
    p.life--;
  });

  laneFlash = laneFlash.map((v) => Math.max(0, v - 0.05));
  if (lastJudgeTimer > 0) lastJudgeTimer--;

  // 롱노트 홀딩 중 틱 점수 (200ms마다 50점)
  const now2 = performance.now();
  for (const lane in holdingLanes) {
    const h = holdingLanes[lane];
    if (now2 - h.lastTick >= 200) {
      score += 50;
      combo++;
      if (combo > maxCombo) maxCombo = combo;
      h.lastTick = now2;
    }
  }

  drawGameFrame(elapsed);
  animFrame = requestAnimationFrame(gameLoop);
}

function drawGameFrame(elapsed) {
  const w = gameCanvas.width;
  const h = gameCanvas.height;
  const ctx = gameCtx;
  const lanes = getCurrentLanes();
  const colors = getCurrentColors();
  const labels = getCurrentLabels();

  const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
  bgGrad.addColorStop(0, '#06061a');
  bgGrad.addColorStop(1, '#0f0f2a');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  const laneWidth = w / lanes;
  const hitY = h * HIT_ZONE_Y;

  for (let i = 0; i < lanes; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#ffffff02' : '#ffffff01';
    ctx.fillRect(i * laneWidth, 0, laneWidth, h);
  }

  for (let i = 1; i < lanes; i++) {
    ctx.strokeStyle = '#ffffff08';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(i * laneWidth, 0);
    ctx.lineTo(i * laneWidth, h);
    ctx.stroke();
  }

  for (let i = 0; i < lanes; i++) {
    if (laneFlash[i] > 0) {
      const flashGrad = ctx.createLinearGradient(0, hitY - 100, 0, hitY + 50);
      flashGrad.addColorStop(0, 'transparent');
      flashGrad.addColorStop(0.5, colors[i] + Math.floor(laneFlash[i] * 40).toString(16).padStart(2, '0'));
      flashGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = flashGrad;
      ctx.fillRect(i * laneWidth, hitY - 100, laneWidth, 150);
    }
  }

  // 롱노트 홀딩 이펙트 — 누르고 있는 동안 레인 전체가 빛남
  for (const lane in holdingLanes) {
    const li = parseInt(lane);
    const holdNote = holdingLanes[li];
    const endTime = holdNote.time + holdNote.hold;
    if (elapsed < endTime) {
      // 레인 전체 글로우
      const holdGrad = ctx.createLinearGradient(0, 0, 0, hitY);
      holdGrad.addColorStop(0, colors[li] + '08');
      holdGrad.addColorStop(0.7, colors[li] + '20');
      holdGrad.addColorStop(1, colors[li] + '40');
      ctx.fillStyle = holdGrad;
      ctx.fillRect(li * laneWidth, 0, laneWidth, hitY);

      // 판정선 위에 빛나는 원
      ctx.shadowColor = colors[li];
      ctx.shadowBlur = 15;
      ctx.fillStyle = colors[li] + '88';
      ctx.beginPath();
      ctx.arc((li + 0.5) * laneWidth, hitY, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // 파티클 스파크 (매 프레임 소량)
      if (Math.random() < 0.4) {
        particles.push({
          x: (li + 0.5) * laneWidth + (Math.random() - 0.5) * 20,
          y: hitY - Math.random() * 30,
          vx: (Math.random() - 0.5) * 3,
          vy: -Math.random() * 2,
          size: Math.random() * 2 + 0.5,
          color: colors[li],
          life: 20,
          maxLife: 20,
        });
      }
    }
  }

  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = 6;
  ctx.fillStyle = '#ffffff33';
  ctx.fillRect(0, hitY - 1, w, 2);
  ctx.shadowBlur = 0;

  for (let i = 0; i < lanes; i++) {
    ctx.strokeStyle = colors[i] + '44';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(i * laneWidth + 3, hitY - 16, laneWidth - 6, 32, 5);
    ctx.stroke();

    ctx.fillStyle = colors[i] + '55';
    ctx.font = `bold ${lanes === 6 ? 10 : 12}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(labels[i], (i + 0.5) * laneWidth, hitY + 32);
  }

  for (const note of notes) {
    if (note.hit) continue;
    // 일반 노트는 missed면 스킵, 롱노트는 아직 진행 중이면 보여줌
    if (note.missed && !note.hold) continue;
    if (note.missed && note.hold && elapsed > note.time + note.hold) continue;
    const timeDiff = note.time - elapsed;
    const noteY = hitY - (timeDiff / 1000) * h * getNoteSpeed();

    // 롱노트인 경우 꼬리 그리기
    if (note.hold) {
      const tailTimeDiff = (note.time + note.hold) - elapsed;
      const tailY = hitY - (tailTimeDiff / 1000) * h * getNoteSpeed();
      const topY = Math.min(noteY, tailY);
      const botY = Math.max(noteY, tailY);

      if (botY < -30 || topY > h + 30) continue;

      const noteX = note.lane * laneWidth;
      const noteW = laneWidth - 6;

      // 롱노트 몸체
      ctx.fillStyle = colors[note.lane] + '44';
      ctx.beginPath();
      ctx.roundRect(noteX + 8, topY, noteW - 10, botY - topY, 3);
      ctx.fill();

      // 롱노트 테두리
      ctx.strokeStyle = colors[note.lane] + '88';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(noteX + 8, topY, noteW - 10, botY - topY, 3);
      ctx.stroke();

      // 끝 표시 (꼬리 바)
      ctx.fillStyle = colors[note.lane] + 'cc';
      ctx.beginPath();
      ctx.roundRect(noteX + 5, tailY - 5, noteW - 4, 10, 4);
      ctx.fill();
      ctx.strokeStyle = '#ffffff44';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(noteX + 5, tailY - 5, noteW - 4, 10, 4);
      ctx.stroke();

      // 머리 노트
      const grad = ctx.createLinearGradient(noteX + 3, noteY, noteX + 3 + noteW, noteY);
      grad.addColorStop(0, colors[note.lane]);
      grad.addColorStop(1, colors[note.lane] + 'cc');
      ctx.fillStyle = grad;
      ctx.shadowColor = colors[note.lane];
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.roundRect(noteX + 3, noteY - 7, noteW, 14, 3);
      ctx.fill();
      ctx.shadowBlur = 0;
    } else {
      // 일반 노트
      if (noteY < -30 || noteY > h + 30) continue;

      const noteX = note.lane * laneWidth;
      const noteW = laneWidth - 6;
      const noteH = lanes === 6 ? 12 : 14;

      const grad = ctx.createLinearGradient(noteX + 3, noteY, noteX + 3 + noteW, noteY);
      grad.addColorStop(0, colors[note.lane]);
      grad.addColorStop(1, colors[note.lane] + 'cc');
      ctx.fillStyle = grad;
      ctx.shadowColor = colors[note.lane];
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.roundRect(noteX + 3, noteY - noteH / 2, noteW, noteH, 3);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#ffffff22';
      ctx.beginPath();
      ctx.roundRect(noteX + 5, noteY - noteH / 2 + 1, noteW - 4, noteH / 3, 2);
      ctx.fill();
    }
  }

  for (const p of particles) {
    const alpha = Math.floor((p.life / p.maxLife) * 255).toString(16).padStart(2, '0');
    ctx.fillStyle = p.color + alpha;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  if (lastJudgeTimer > 0 && lastJudge) {
    const judgeColors = { PERFECT: '#ffd700', GREAT: '#48dbfb', GOOD: '#2ecc71', MISS: '#ff6b6b', HOLD: '#ff9ff3' };
    const scale = 1 + (lastJudgeTimer / 30) * 0.2;
    ctx.save();
    ctx.translate(w / 2, hitY - 50);
    ctx.scale(scale, scale);
    ctx.fillStyle = judgeColors[lastJudge] || '#fff';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(lastJudge, 0, 0);
    ctx.restore();
  }

  if (combo > 2) {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 30px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(combo.toString(), w / 2, h * 0.22);
    ctx.fillStyle = '#555';
    ctx.font = '9px monospace';
    ctx.fillText('COMBO', w / 2, h * 0.22 + 15);
  }

  ctx.fillStyle = '#eee';
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(score.toLocaleString(), w - 10, 20);

  const song = getSelectedSong();
  const progress = Math.min(1, Math.max(0, elapsed / song.duration));
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, w, 3);
  const progGrad = ctx.createLinearGradient(0, 0, w * progress, 0);
  progGrad.addColorStop(0, colors[0]);
  progGrad.addColorStop(1, colors[colors.length - 1]);
  ctx.fillStyle = progGrad;
  ctx.fillRect(0, 0, w * progress, 3);
}

// --- 입력 ---
function hitLane(lane) {
  if (state !== 'playing' || paused) return;

  const now = performance.now();
  const elapsed = now - gameStartTime - totalPausedTime;
  const colors = getCurrentColors();

  laneFlash[lane] = 1;

  let closest = null;
  let closestDiff = Infinity;

  for (const note of notes) {
    if (note.hit || note.missed || note.lane !== lane) continue;
    const diff = Math.abs(elapsed - note.time);
    if (diff < closestDiff) {
      closestDiff = diff;
      closest = note;
    }
  }

  if (!closest || closestDiff > JUDGE_MISS) {
    // 시작점은 놓쳤지만 아직 진행 중인 롱노트가 있으면 중간에라도 잡기
    let midHold = null;
    for (const note of notes) {
      if (note.hit || note.lane !== lane || !note.hold) continue;
      if (elapsed > note.time && elapsed < note.time + note.hold) {
        midHold = note;
        break;
      }
    }
    if (midHold) {
      midHold.hit = true;
      midHold.missed = false;
      holdingLanes[lane] = { ...midHold, lastTick: performance.now() };
      combo++;
      if (combo > maxCombo) maxCombo = combo;
      score += 50;
      lastJudge = 'GOOD';
      lastJudgeTimer = 20;
      judgeCounts.good++;
      return;
    }
    return;
  }
  closest.hit = true;

  // 롱노트면 holding 시작 + 시작점 판정
  if (closest.hold) {
    let holdJudge;
    if (closestDiff <= JUDGE_PERFECT) {
      holdJudge = 'PERFECT'; score += 300; judgeCounts.perfect++;
    } else if (closestDiff <= JUDGE_GREAT) {
      holdJudge = 'GREAT'; score += 200; judgeCounts.great++;
    } else if (closestDiff <= JUDGE_GOOD) {
      holdJudge = 'GOOD'; score += 100; judgeCounts.good++;
    } else {
      holdJudge = 'GOOD'; score += 100; judgeCounts.good++;
    }
    holdingLanes[lane] = { ...closest, lastTick: performance.now() };
    combo++;
    if (combo > maxCombo) maxCombo = combo;
    lastJudge = holdJudge;
    lastJudgeTimer = 20;
    return;
  }

  let judge, points;
  if (closestDiff <= JUDGE_PERFECT) {
    judge = 'PERFECT'; points = 300; judgeCounts.perfect++;
  } else if (closestDiff <= JUDGE_GREAT) {
    judge = 'GREAT'; points = 200; judgeCounts.great++;
  } else if (closestDiff <= JUDGE_GOOD) {
    judge = 'GOOD'; points = 100; judgeCounts.good++;
  } else {
    judge = 'MISS'; points = 0; judgeCounts.miss++; combo = 0;
    lastJudge = judge; lastJudgeTimer = 30;
    loseLife();
    if (lives <= 0) { endGame(); }
    return;
  }

  combo++;
  if (combo > maxCombo) maxCombo = combo;
  score += points * (1 + Math.floor(combo / 10) * 0.1);
  score = Math.round(score);
  lastJudge = judge;
  lastJudgeTimer = 30;

  if (audioCtx) { /* hit sound removed */ }

  const w = gameCanvas.width;
  const h = gameCanvas.height;
  const lanes = getCurrentLanes();
  const laneWidth = w / lanes;
  const hitY = h * HIT_ZONE_Y;
  const px = (lane + 0.5) * laneWidth;

  for (let i = 0; i < 10; i++) {
    particles.push({
      x: px + (Math.random() - 0.5) * 16,
      y: hitY,
      vx: (Math.random() - 0.5) * 7,
      vy: (Math.random() - 1) * 5,
      size: Math.random() * 3 + 1,
      color: colors[lane],
      life: 30,
      maxLife: 30,
    });
  }
}

// 키보드
window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();

  if (state === 'settings' && settingKeyIndex >= 0) {
    if (key !== 'escape') {
      const newKey = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (settingMode === 6) LANE_KEYS_6[settingKeyIndex] = newKey;
      else LANE_KEYS_4[settingKeyIndex] = newKey;
      saveKeys();
    }
    settingKeyIndex = -1;
    render();
    return;
  }

  if (state === 'menu') {
    if (key === 'arrowup') { selectedSong = (selectedSong + getSongList().length - 1) % getSongList().length; render(); scrollToSelected(); }
    else if (key === 'arrowdown') { selectedSong = (selectedSong + 1) % getSongList().length; render(); scrollToSelected(); }
    else if (key === 'enter' || key === ' ') startGame();
    return;
  }

  if (state === 'playing') {
    const currentKeys = getCurrentKeys();
    const laneIdx = currentKeys.indexOf(key);
    if (laneIdx !== -1) {
      e.preventDefault();
      hitLane(laneIdx);
    }
  }

  if (key === 'escape') {
    if (state === 'playing' && !paused) {
      pauseGame();
    } else if (state === 'playing' && paused) {
      resumeGame();
    } else if (state === 'result') {
      state = 'menu';
      render();
    }
  }
});

// 키를 떼면 롱노트 완료 판정
window.addEventListener('keyup', (e) => {
  if (state !== 'playing') return;
  const key = e.key.toLowerCase();
  const currentKeys = getCurrentKeys();
  const laneIdx = currentKeys.indexOf(key);
  if (laneIdx !== -1 && holdingLanes[laneIdx]) {
    const note = holdingLanes[laneIdx];
    const elapsed = performance.now() - gameStartTime - totalPausedTime;
    const endTime = note.time + note.hold;
    const diff = Math.abs(elapsed - endTime);

    if (diff < JUDGE_GOOD) {
      score += 200;
      combo++;
      if (combo > maxCombo) maxCombo = combo;
      judgeCounts.perfect++;
      lastJudge = 'PERFECT';
    } else if (diff < JUDGE_MISS * 2) {
      score += 100;
      combo++;
      if (combo > maxCombo) maxCombo = combo;
      judgeCounts.great++;
      lastJudge = 'GREAT';
    } else {
      judgeCounts.good++;
      lastJudge = 'GOOD';
      score += 50;
    }
    lastJudgeTimer = 30;
    delete holdingLanes[laneIdx];
  }
});

render();

import { generateInvincibleChart } from './invincible-chart.js';

// 시드 기반 랜덤 (같은 시드 = 같은 패턴)
function seededRandom(seed) {
  let s = seed;
  return function () {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

// 시드 기반 비트맵 생성 — 비트 그리드에 정확히 맞춤
function generateBeatmap(bpm, duration, density, lanes = 4, seed = 12345, noHold = false) {
  const rand = seededRandom(seed);
  const notes = [];
  const beatInterval = 60000 / bpm;
  const totalBeats = Math.floor(duration / beatInterval);

  // 비트 그리드: 4분음표(1), 8분음표(0.5), 16분음표(0.25)
  const gridPositions = [0, 0.25, 0.5, 0.75]; // 16분음표 기준 4개 슬롯

  for (let i = 0; i < totalBeats; i++) {
    const beatTime = i * beatInterval + 3000;
    // 곡 진행에 따른 밀도 변화 (인트로 약하게, 드롭 강하게)
    const progress = i / totalBeats;
    let localDensity = density;
    if (progress < 0.05) localDensity *= 0.3; // 인트로
    else if (progress < 0.15) localDensity *= 0.6; // 빌드업
    else if (progress > 0.45 && progress < 0.55) localDensity *= 0.5; // 브릿지
    else if (progress > 0.75) localDensity *= 1.1; // 클라이맥스

    for (let g = 0; g < gridPositions.length; g++) {
      const gridTime = beatTime + gridPositions[g] * beatInterval;

      // 4분음표 (메인 비트) — 높은 확률
      if (g === 0 && rand() < localDensity * 1.2) {
        const lane = Math.floor(rand() * lanes);
        notes.push({ time: gridTime, lane });
      }
      // 8분음표 (반박) — 중간 확률
      else if (g === 2 && rand() < localDensity * 0.7) {
        const lane = Math.floor(rand() * lanes);
        notes.push({ time: gridTime, lane });
      }
      // 16분음표 (1/4, 3/4) — 고난도에서만
      else if ((g === 1 || g === 3) && density >= 0.6 && rand() < (localDensity - 0.4) * 0.5) {
        const lane = Math.floor(rand() * lanes);
        notes.push({ time: gridTime, lane });
      }
    }

    // 동시타 (메인 비트에서만, 고난도)
    if (density >= 0.65 && rand() < (localDensity - 0.55) * 0.25) {
      const lane = Math.floor(rand() * lanes);
      notes.push({ time: beatTime, lane });
    }

    // 롱노트 (정확히 비트 시작점에서, 비트 단위 길이)
    if (!noHold && rand() < density * 0.1 && i + 2 < totalBeats) {
      const lane = Math.floor(rand() * lanes);
      const holdBeats = 2 + Math.floor(rand() * 3);
      const holdDuration = holdBeats * beatInterval;
      notes.push({ time: beatTime, lane, hold: holdDuration });
    }
  }

  // 중복 제거
  const unique = [];
  const seen = new Set();
  for (const n of notes) {
    const key = `${Math.round(n.time)}-${n.lane}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(n);
    }
  }

  const sorted = unique.sort((a, b) => a.time - b.time);

  // 롱노트 구간에 같은 레인 노트 제거 (끝난 직후 2비트도 포함)
  const holdNotes = sorted.filter((n) => n.hold);
  const filtered = sorted.filter((n) => {
    if (n.hold) return true;
    for (const h of holdNotes) {
      const bufferTime = (60000 / bpm) * 2; // 2비트 여유
      if (n.lane === h.lane && n.time >= h.time && n.time < h.time + h.hold + bufferTime) {
        return false;
      }
    }
    return true;
  });

  return filtered;
}

// 오디오 합성
export function createAudioTrack(audioCtx, bpm, duration) {
  const beatInterval = 60 / bpm;
  const totalBeats = Math.floor(duration / 1000 / beatInterval);

  const scheduleBeats = (startTime) => {
    for (let i = 0; i < totalBeats; i++) {
      const t = startTime + i * beatInterval;

      if (i % 4 === 0) playKick(audioCtx, t);
      if (i % 4 === 2) playSnare(audioCtx, t);
      playHihat(audioCtx, t);

      if (i % 2 === 0) {
        playBass(audioCtx, t, [60, 63, 65, 67][i % 4]);
      }

      if (i % 8 < 4 && bpm >= 128) {
        const melodyNotes = [72, 74, 76, 79, 81];
        playMelody(audioCtx, t + beatInterval * 0.5, melodyNotes[i % 5]);
      }
    }
  };

  return scheduleBeats;
}

function playKick(ctx, time) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.setValueAtTime(150, time);
  osc.frequency.exponentialRampToValueAtTime(30, time + 0.1);
  gain.gain.setValueAtTime(0.8, time);
  gain.gain.exponentialRampToValueAtTime(0.01, time + 0.15);
  osc.start(time);
  osc.stop(time + 0.15);
}

function playSnare(ctx, time) {
  const bufferSize = ctx.sampleRate * 0.1;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  source.connect(gain);
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.4, time);
  gain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
  source.start(time);
}

function playHihat(ctx, time) {
  const bufferSize = ctx.sampleRate * 0.05;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize) * 0.3;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 7000;
  const gain = ctx.createGain();
  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.2, time);
  gain.gain.exponentialRampToValueAtTime(0.01, time + 0.05);
  source.start(time);
}

function playBass(ctx, time, note) {
  const freq = 440 * Math.pow(2, (note - 69) / 12);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.setValueAtTime(freq, time);
  gain.gain.setValueAtTime(0.15, time);
  gain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
  osc.start(time);
  osc.stop(time + 0.2);
}

function playMelody(ctx, time, note) {
  const freq = 440 * Math.pow(2, (note - 69) / 12);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.setValueAtTime(freq, time);
  gain.gain.setValueAtTime(0.08, time);
  gain.gain.exponentialRampToValueAtTime(0.01, time + 0.15);
  osc.start(time);
  osc.stop(time + 0.15);
}

export function playHitSound(audioCtx) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(800, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.05);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.1);
}

// 각 곡마다 고유 시드 → 항상 같은 패턴
export const categories = [
  { id: 'original', name: 'ORIGINAL', icon: '🎹' },
  { id: 'ncs4k', name: 'NCS 4K', icon: '🎧' },
  { id: 'ncs6k', name: 'NCS 6K', icon: '🎧' },
];

export const songs = {
  original: [
    {
      id: 'tutorial',
      title: 'First Step',
      artist: 'Beat Drop',
      bpm: 90,
      difficulty: '☆☆☆',
      diffLabel: 'EASY',
      duration: 25000,
      lanes: 4,
      seed: 10001,
      audioSrc: null,
      get notes() { return generateBeatmap(90, 25000, 0.3, 4, 10001); },
    },
    {
      id: 'easy',
      title: 'Neon Glow',
      artist: 'Beat Drop',
      bpm: 110,
      difficulty: '★☆☆',
      diffLabel: 'NORMAL',
      duration: 30000,
      lanes: 4,
      seed: 20002,
      audioSrc: null,
      get notes() { return generateBeatmap(110, 30000, 0.4, 4, 20002); },
    },
    {
      id: 'medium',
      title: 'Cyber Rush',
      artist: 'Beat Drop',
      bpm: 128,
      difficulty: '★★☆',
      diffLabel: 'HARD',
      duration: 35000,
      lanes: 4,
      seed: 30003,
      audioSrc: null,
      get notes() { return generateBeatmap(128, 35000, 0.55, 4, 30003); },
    },
    {
      id: 'hard',
      title: 'Chaos Engine',
      artist: 'Beat Drop',
      bpm: 145,
      difficulty: '★★★',
      diffLabel: 'EXPERT',
      duration: 35000,
      lanes: 4,
      seed: 40004,
      audioSrc: null,
      get notes() { return generateBeatmap(145, 35000, 0.65, 4, 40004); },
    },
    {
      id: 'insane',
      title: 'GRAVITON',
      artist: 'Beat Drop',
      bpm: 170,
      difficulty: '★★★+',
      diffLabel: 'INSANE · 6KEY',
      duration: 40000,
      lanes: 6,
      seed: 50005,
      audioSrc: null,
      get notes() { return generateBeatmap(170, 40000, 0.7, 6, 50005); },
    },
  ],
  ncs4k: [
    {
      id: 'unity-4k',
      title: 'Unity',
      artist: 'Dropouts, Aloma Steele',
      bpm: 128,
      difficulty: '★★☆',
      diffLabel: 'HARD',
      duration: 200000,
      lanes: 4,
      seed: 12800,
      audioSrc: '/music/Dropouts, Aloma Steele - Unity (feat. Aloma Steele) [NCS Release].mp3',
      get notes() { return generateBeatmap(128, 200000, 0.57, 4, 12800); },
    },
    {
      id: 'dreams-4k',
      title: 'Dreams',
      artist: 'Lost Sky',
      bpm: 145,
      difficulty: '★★★',
      diffLabel: 'EXPERT',
      duration: 200000,
      lanes: 4,
      seed: 14500,
      audioSrc: '/music/Lost Sky - Dreams [NCS Release].mp3',
      get notes() { return generateBeatmap(145, 200000, 0.72, 4, 14500); },
    },
    {
      id: 'nekozilla-4k',
      title: 'Nekozilla',
      artist: 'Different Heaven',
      bpm: 128,
      difficulty: '★★☆',
      diffLabel: 'HARD',
      duration: 200000,
      lanes: 4,
      seed: 12804,
      audioSrc: '/music/Different Heaven - Nekozilla [NCS Release].mp3',
      get notes() { return generateBeatmap(128, 200000, 0.57, 4, 12804); },
    },
    {
      id: 'lightitup-4k',
      title: 'Light It Up',
      artist: 'Robin Hustin, Tobimorrow',
      bpm: 128,
      difficulty: '★★☆',
      diffLabel: 'HARD',
      duration: 200000,
      lanes: 4,
      seed: 12810,
      audioSrc: '/music/Robin Hustin, Tobimorrow - Light It Up [NCS Release].mp3',
      get notes() { return generateBeatmap(128, 200000, 0.57, 4, 12810); },
    },
    {
      id: 'fearless-4k',
      title: 'Fearless (Sped Up)',
      artist: 'Lost Sky',
      bpm: 120,
      difficulty: '★☆☆',
      diffLabel: 'NORMAL',
      duration: 200000,
      lanes: 4,
      seed: 12010,
      audioSrc: '/music/Lost Sky - Fearless (Sped Up) [NCS Release].mp3',
      get notes() { return generateBeatmap(120, 200000, 0.47, 4, 12010); },
    },
    {
      id: 'myheart-4k',
      title: 'My Heart',
      artist: 'Different Heaven, EH!DE',
      bpm: 174,
      difficulty: '★★★',
      diffLabel: 'EXPERT',
      duration: 200000,
      lanes: 4,
      seed: 17410,
      audioSrc: '/music/Different Heaven, EH!DE - My Heart [NCS Release].mp3',
      get notes() { return generateBeatmap(174, 200000, 0.72, 4, 17410); },
    },
    {
      id: 'heroes-4k',
      title: 'Heroes Tonight',
      artist: 'Janji, Johnning',
      bpm: 128,
      difficulty: '★★☆',
      diffLabel: 'HARD',
      duration: 200000,
      lanes: 4,
      seed: 12820,
      audioSrc: '/music/Janji, Johnning - Heroes Tonight (feat. Johnning) [NCS Release].mp3',
      get notes() { return generateBeatmap(128, 200000, 0.57, 4, 12820); },
    },
    {
      id: 'onandon-4k',
      title: 'On & On',
      artist: 'Cartoon, Daniel Levi',
      bpm: 120,
      difficulty: '★★☆',
      diffLabel: 'HARD',
      duration: 200000,
      lanes: 4,
      seed: 12040,
      audioSrc: '/music/Cartoon, Daniel Levi, J\u00e9ja - On & On (feat. Daniel Levi) [NCS Release].mp3',
      get notes() { return generateBeatmap(120, 200000, 0.57, 4, 12040); },
    },
    {
      id: 'invincible-4k',
      title: 'Invincible',
      artist: 'DEAF KEV',
      bpm: 100,
      difficulty: '★★★+',
      diffLabel: 'INSANE',
      duration: 150000,
      lanes: 4,
      seed: 10040,
      audioSrc: '/music/DEAF KEV - Invincible [NCS Release].mp3',
      get notes() { return generateInvincibleChart(4); },
    },
    {
      id: 'mortals-4k',
      title: 'Mortals Funk Remix',
      artist: 'Warriyo, LXNGVX',
      bpm: 115,
      difficulty: '★★★+',
      diffLabel: 'INSANE',
      duration: 200000,
      lanes: 4,
      seed: 11540,
      audioSrc: '/music/Warriyo, LXNGVX - Mortals Funk Remix [NCS Release].mp3',
      noHold: true,
      get notes() {
        const rand = seededRandom(11540);
        const notes = [];
        const beatInterval = 60000 / 115;
        const totalBeats = Math.floor(200000 / beatInterval);
        let prevLane = -1;
        for (let i = 0; i < totalBeats; i++) {
          const baseTime = i * beatInterval + 3000;
          for (let sub = 0; sub < 5; sub++) {
            const noteTime = baseTime + sub * (beatInterval / 5);
            if (rand() < 0.62) {
              let lane = Math.floor(rand() * 4);
              if (lane === prevLane) lane = (lane + 1 + Math.floor(rand() * 3)) % 4;
              notes.push({ time: noteTime, lane });
              prevLane = lane;
            }
          }
        }
        return notes.sort((a, b) => a.time - b.time);
      },
    },
    {
      id: 'link-4k',
      title: 'Link',
      artist: 'Jim Yosef',
      bpm: 131,
      difficulty: '★★★+',
      diffLabel: 'INSANE',
      duration: 200000,
      lanes: 4,
      seed: 13140,
      audioSrc: '/music/Jim Yosef - Link [NCS Release].mp3',
      noHold: true,
      get notes() {
        const rand = seededRandom(13140);
        const notes = [];
        const beatInterval = 60000 / 131;
        const totalBeats = Math.floor(200000 / beatInterval);
        let prevLane = -1;
        for (let i = 0; i < totalBeats; i++) {
          const baseTime = i * beatInterval + 3000;
          for (let sub = 0; sub < 5; sub++) {
            const noteTime = baseTime + sub * (beatInterval / 5);
            if (rand() < 0.62) {
              let lane = Math.floor(rand() * 4);
              if (lane === prevLane) lane = (lane + 1 + Math.floor(rand() * 3)) % 4;
              notes.push({ time: noteTime, lane });
              prevLane = lane;
            }
          }
        }
        return notes.sort((a, b) => a.time - b.time);
      },
    },
    {
      id: 'superhero-4k',
      title: 'Superhero',
      artist: 'Unknown Brain, Chris Linton',
      bpm: 150,
      difficulty: '★★★+',
      diffLabel: 'INSANE',
      duration: 200000,
      lanes: 4,
      seed: 15040,
      audioSrc: '/music/Unknown Brain, Chris Linton - Superhero (feat. Chris Linton) [NCS Release].mp3',
      noHold: true,
      get notes() {
        const rand = seededRandom(15040);
        const notes = [];
        const beatInterval = 60000 / 150;
        const totalBeats = Math.floor(200000 / beatInterval);
        let prevLane = -1;
        for (let i = 0; i < totalBeats; i++) {
          const baseTime = i * beatInterval + 3000;
          for (let sub = 0; sub < 5; sub++) {
            const noteTime = baseTime + sub * (beatInterval / 5);
            if (rand() < 0.64) {
              let lane = Math.floor(rand() * 4);
              if (lane === prevLane) lane = (lane + 1 + Math.floor(rand() * 3)) % 4;
              notes.push({ time: noteTime, lane });
              prevLane = lane;
            }
          }
        }
        return notes.sort((a, b) => a.time - b.time);
      },
    },
    {
      id: 'boogie-4k',
      title: 'Boogie',
      artist: 'Joyful, Фрози, Zachz Winner',
      bpm: 130,
      difficulty: '★★★+',
      diffLabel: 'INSANE',
      duration: 200000,
      lanes: 4,
      seed: 13050,
      audioSrc: '/music/Joyful, \u0424\u0440\u043e\u0437\u0438, Zachz Winner - Boogie [NCS Release].mp3',
      noHold: true,
      get notes() {
        const rand = seededRandom(13050);
        const notes = [];
        const beatInterval = 60000 / 130;
        const totalBeats = Math.floor(200000 / beatInterval);
        let prevLane = -1;
        for (let i = 0; i < totalBeats; i++) {
          const baseTime = i * beatInterval + 3000;
          for (let sub = 0; sub < 5; sub++) {
            const noteTime = baseTime + sub * (beatInterval / 5);
            if (rand() < 0.65) {
              let lane = Math.floor(rand() * 4);
              if (lane === prevLane) lane = (lane + 1 + Math.floor(rand() * 3)) % 4;
              notes.push({ time: noteTime, lane });
              prevLane = lane;
            }
          }
        }
        return notes.sort((a, b) => a.time - b.time);
      },
    },
    {
      id: 'harinezumi-4k',
      title: 'harinezumi',
      artist: 'waera',
      bpm: 94,
      difficulty: '★★★',
      diffLabel: 'EXPERT',
      duration: 200000,
      lanes: 4,
      seed: 9440,
      audioSrc: '/music/waera - harinezumi [NCS Release].mp3',
      get notes() { return generateBeatmap(94, 200000, 0.72, 4, 9440); },
    },
    {
      id: 'skyline-4k',
      title: 'Skyline Pt. II',
      artist: 'Electro-Light, Kovan',
      bpm: 128,
      difficulty: '★★★+',
      diffLabel: 'INSANE',
      duration: 200000,
      lanes: 4,
      seed: 12850,
      audioSrc: '/music/Electro-Light, Kovan - Skyline Pt. II [NCS Release].mp3',
      noHold: true,
      get notes() {
        const rand = seededRandom(12850);
        const notes = [];
        const beatInterval = 60000 / 128;
        const totalBeats = Math.floor(200000 / beatInterval);
        let prevLane = -1;
        for (let i = 0; i < totalBeats; i++) {
          const baseTime = i * beatInterval + 3000;
          for (let sub = 0; sub < 5; sub++) {
            const noteTime = baseTime + sub * (beatInterval / 5);
            if (rand() < 0.65) {
              let lane = Math.floor(rand() * 4);
              if (lane === prevLane) lane = (lane + 1 + Math.floor(rand() * 3)) % 4;
              notes.push({ time: noteTime, lane });
              prevLane = lane;
            }
          }
        }
        return notes.sort((a, b) => a.time - b.time);
      },
    },
    {
      id: 'allornothing-4k',
      title: 'All Or Nothing',
      artist: 'No Hero, Tatsunoshin',
      bpm: 170,
      difficulty: '★★★+',
      diffLabel: 'INSANE',
      duration: 200000,
      lanes: 4,
      seed: 17050,
      audioSrc: '/music/No Hero, Tatsunoshin - All Or Nothing [NCS Release].mp3',
      noHold: true,
      get notes() {
        const rand = seededRandom(17050);
        const notes = [];
        const beatInterval = 60000 / 170;
        const totalBeats = Math.floor(200000 / beatInterval);
        let prevLane = -1;
        for (let i = 0; i < totalBeats; i++) {
          const baseTime = i * beatInterval + 3000;
          for (let sub = 0; sub < 5; sub++) {
            const noteTime = baseTime + sub * (beatInterval / 5);
            if (rand() < 0.65) {
              let lane = Math.floor(rand() * 4);
              if (lane === prevLane) lane = (lane + 1 + Math.floor(rand() * 3)) % 4;
              notes.push({ time: noteTime, lane });
              prevLane = lane;
            }
          }
        }
        return notes.sort((a, b) => a.time - b.time);
      },
    },
  ],
  ncs6k: [
    {
      id: 'unity-6k',
      title: 'Unity',
      artist: 'Dropouts, Aloma Steele',
      bpm: 128,
      difficulty: '★★★',
      diffLabel: 'EXPERT',
      duration: 200000,
      lanes: 6,
      seed: 12860,
      audioSrc: '/music/Dropouts, Aloma Steele - Unity (feat. Aloma Steele) [NCS Release].mp3',
      get notes() { return generateBeatmap(128, 200000, 0.62, 6, 12860); },
    },
    {
      id: 'dreams-6k',
      title: 'Dreams',
      artist: 'Lost Sky',
      bpm: 145,
      difficulty: '★★★+',
      diffLabel: 'INSANE',
      duration: 200000,
      lanes: 6,
      seed: 14560,
      audioSrc: '/music/Lost Sky - Dreams [NCS Release].mp3',
      get notes() { return generateBeatmap(145, 200000, 0.72, 6, 14560); },
    },
    {
      id: 'nekozilla-6k',
      title: 'Nekozilla',
      artist: 'Different Heaven',
      bpm: 128,
      difficulty: '★★★+',
      diffLabel: 'INSANE',
      duration: 200000,
      lanes: 6,
      seed: 12806,
      audioSrc: '/music/Different Heaven - Nekozilla [NCS Release].mp3',
      get notes() { return generateBeatmap(128, 200000, 0.72, 6, 12806); },
    },
    {
      id: 'lightitup-6k',
      title: 'Light It Up',
      artist: 'Robin Hustin, Tobimorrow',
      bpm: 128,
      difficulty: '★★★',
      diffLabel: 'EXPERT',
      duration: 200000,
      lanes: 6,
      seed: 12816,
      audioSrc: '/music/Robin Hustin, Tobimorrow - Light It Up [NCS Release].mp3',
      get notes() { return generateBeatmap(128, 200000, 0.62, 6, 12816); },
    },
    {
      id: 'fearless-6k',
      title: 'Fearless (Sped Up)',
      artist: 'Lost Sky',
      bpm: 120,
      difficulty: '★★☆',
      diffLabel: 'HARD',
      duration: 200000,
      lanes: 6,
      seed: 12016,
      audioSrc: '/music/Lost Sky - Fearless (Sped Up) [NCS Release].mp3',
      get notes() { return generateBeatmap(120, 200000, 0.57, 6, 12016); },
    },
    {
      id: 'myheart-6k',
      title: 'My Heart',
      artist: 'Different Heaven, EH!DE',
      bpm: 174,
      difficulty: '★★★+',
      diffLabel: 'INSANE',
      duration: 200000,
      lanes: 6,
      seed: 17416,
      audioSrc: '/music/Different Heaven, EH!DE - My Heart [NCS Release].mp3',
      get notes() { return generateBeatmap(174, 200000, 0.72, 6, 17416); },
    },
    {
      id: 'heroes-6k',
      title: 'Heroes Tonight',
      artist: 'Janji, Johnning',
      bpm: 128,
      difficulty: '★★★',
      diffLabel: 'EXPERT',
      duration: 200000,
      lanes: 6,
      seed: 12826,
      audioSrc: '/music/Janji, Johnning - Heroes Tonight (feat. Johnning) [NCS Release].mp3',
      get notes() { return generateBeatmap(128, 200000, 0.62, 6, 12826); },
    },
    {
      id: 'onandon-6k',
      title: 'On & On',
      artist: 'Cartoon, Daniel Levi',
      bpm: 120,
      difficulty: '★★★',
      diffLabel: 'EXPERT',
      duration: 200000,
      lanes: 6,
      seed: 12046,
      audioSrc: '/music/Cartoon, Daniel Levi, J\u00e9ja - On & On (feat. Daniel Levi) [NCS Release].mp3',
      get notes() { return generateBeatmap(120, 200000, 0.62, 6, 12046); },
    },
    {
      id: 'invincible-6k',
      title: 'Invincible',
      artist: 'DEAF KEV',
      bpm: 100,
      difficulty: '★★★+',
      diffLabel: 'INSANE',
      duration: 150000,
      lanes: 6,
      seed: 10046,
      audioSrc: '/music/DEAF KEV - Invincible [NCS Release].mp3',
      get notes() { return generateInvincibleChart(6); },
    },
    {
      id: 'mortals-6k',
      title: 'Mortals Funk Remix',
      artist: 'Warriyo, LXNGVX',
      bpm: 115,
      difficulty: '★★★+',
      diffLabel: 'INSANE',
      duration: 200000,
      lanes: 6,
      seed: 11546,
      audioSrc: '/music/Warriyo, LXNGVX - Mortals Funk Remix [NCS Release].mp3',
      noHold: true,
      get notes() {
        const rand = seededRandom(11546);
        const notes = [];
        const beatInterval = 60000 / 115;
        const totalBeats = Math.floor(200000 / beatInterval);
        let prevLane = -1;
        for (let i = 0; i < totalBeats; i++) {
          const baseTime = i * beatInterval + 3000;
          for (let sub = 0; sub < 5; sub++) {
            const noteTime = baseTime + sub * (beatInterval / 5);
            if (rand() < 0.61) {
              let lane = Math.floor(rand() * 6);
              if (lane === prevLane) lane = (lane + 1 + Math.floor(rand() * 5)) % 6;
              notes.push({ time: noteTime, lane });
              prevLane = lane;
            }
          }
        }
        return notes.sort((a, b) => a.time - b.time);
      },
    },
    {
      id: 'link-6k',
      title: 'Link',
      artist: 'Jim Yosef',
      bpm: 131,
      difficulty: '★★★+',
      diffLabel: 'INSANE',
      duration: 200000,
      lanes: 6,
      seed: 13146,
      audioSrc: '/music/Jim Yosef - Link [NCS Release].mp3',
      noHold: true,
      get notes() {
        const rand = seededRandom(13146);
        const notes = [];
        const beatInterval = 60000 / 131;
        const totalBeats = Math.floor(200000 / beatInterval);
        let prevLane = -1;
        for (let i = 0; i < totalBeats; i++) {
          const baseTime = i * beatInterval + 3000;
          for (let sub = 0; sub < 5; sub++) {
            const noteTime = baseTime + sub * (beatInterval / 5);
            if (rand() < 0.61) {
              let lane = Math.floor(rand() * 6);
              if (lane === prevLane) lane = (lane + 1 + Math.floor(rand() * 5)) % 6;
              notes.push({ time: noteTime, lane });
              prevLane = lane;
            }
          }
        }
        return notes.sort((a, b) => a.time - b.time);
      },
    },
    {
      id: 'superhero-6k',
      title: 'Superhero',
      artist: 'Unknown Brain, Chris Linton',
      bpm: 150,
      difficulty: '★★★+',
      diffLabel: 'INSANE',
      duration: 200000,
      lanes: 6,
      seed: 15046,
      audioSrc: '/music/Unknown Brain, Chris Linton - Superhero (feat. Chris Linton) [NCS Release].mp3',
      noHold: true,
      get notes() {
        const rand = seededRandom(15046);
        const notes = [];
        const beatInterval = 60000 / 150;
        const totalBeats = Math.floor(200000 / beatInterval);
        let prevLane = -1;
        for (let i = 0; i < totalBeats; i++) {
          const baseTime = i * beatInterval + 3000;
          for (let sub = 0; sub < 5; sub++) {
            const noteTime = baseTime + sub * (beatInterval / 5);
            if (rand() < 0.63) {
              let lane = Math.floor(rand() * 6);
              if (lane === prevLane) lane = (lane + 1 + Math.floor(rand() * 5)) % 6;
              notes.push({ time: noteTime, lane });
              prevLane = lane;
            }
          }
        }
        return notes.sort((a, b) => a.time - b.time);
      },
    },
    {
      id: 'boogie-6k',
      title: 'Boogie',
      artist: 'Joyful, Фрози, Zachz Winner',
      bpm: 130,
      difficulty: '★★★+',
      diffLabel: 'INSANE',
      duration: 200000,
      lanes: 6,
      seed: 13056,
      audioSrc: '/music/Joyful, \u0424\u0440\u043e\u0437\u0438, Zachz Winner - Boogie [NCS Release].mp3',
      noHold: true,
      get notes() {
        const rand = seededRandom(13056);
        const notes = [];
        const beatInterval = 60000 / 130;
        const totalBeats = Math.floor(200000 / beatInterval);
        let prevLane = -1;
        for (let i = 0; i < totalBeats; i++) {
          const baseTime = i * beatInterval + 3000;
          for (let sub = 0; sub < 5; sub++) {
            const noteTime = baseTime + sub * (beatInterval / 5);
            if (rand() < 0.65) {
              let lane = Math.floor(rand() * 6);
              if (lane === prevLane) lane = (lane + 1 + Math.floor(rand() * 5)) % 6;
              notes.push({ time: noteTime, lane });
              prevLane = lane;
            }
          }
        }
        return notes.sort((a, b) => a.time - b.time);
      },
    },
    {
      id: 'harinezumi-6k',
      title: 'harinezumi',
      artist: 'waera',
      bpm: 94,
      difficulty: '★★★+',
      diffLabel: 'INSANE',
      duration: 200000,
      lanes: 6,
      seed: 9446,
      audioSrc: '/music/waera - harinezumi [NCS Release].mp3',
      noHold: true,
      get notes() {
        const rand = seededRandom(9446);
        const notes = [];
        const beatInterval = 60000 / 94;
        const totalBeats = Math.floor(200000 / beatInterval);
        let prevLane = -1;
        for (let i = 0; i < totalBeats; i++) {
          const baseTime = i * beatInterval + 3000;
          for (let sub = 0; sub < 4; sub++) {
            const noteTime = baseTime + sub * (beatInterval / 4);
            if (rand() < 0.65) {
              let lane = Math.floor(rand() * 6);
              if (lane === prevLane) lane = (lane + 1 + Math.floor(rand() * 5)) % 6;
              notes.push({ time: noteTime, lane });
              prevLane = lane;
            }
          }
        }
        return notes.sort((a, b) => a.time - b.time);
      },
    },
    {
      id: 'skyline-6k',
      title: 'Skyline Pt. II',
      artist: 'Electro-Light, Kovan',
      bpm: 128,
      difficulty: '★★★+',
      diffLabel: 'INSANE',
      duration: 200000,
      lanes: 6,
      seed: 12856,
      audioSrc: '/music/Electro-Light, Kovan - Skyline Pt. II [NCS Release].mp3',
      noHold: true,
      get notes() {
        const rand = seededRandom(12856);
        const notes = [];
        const beatInterval = 60000 / 128;
        const totalBeats = Math.floor(200000 / beatInterval);
        let prevLane = -1;
        for (let i = 0; i < totalBeats; i++) {
          const baseTime = i * beatInterval + 3000;
          for (let sub = 0; sub < 5; sub++) {
            const noteTime = baseTime + sub * (beatInterval / 5);
            if (rand() < 0.65) {
              let lane = Math.floor(rand() * 6);
              if (lane === prevLane) lane = (lane + 1 + Math.floor(rand() * 5)) % 6;
              notes.push({ time: noteTime, lane });
              prevLane = lane;
            }
          }
        }
        return notes.sort((a, b) => a.time - b.time);
      },
    },
    {
      id: 'allornothing-6k',
      title: 'All Or Nothing',
      artist: 'No Hero, Tatsunoshin',
      bpm: 170,
      difficulty: '★★★+',
      diffLabel: 'INSANE',
      duration: 200000,
      lanes: 6,
      seed: 17056,
      audioSrc: '/music/No Hero, Tatsunoshin - All Or Nothing [NCS Release].mp3',
      noHold: true,
      get notes() {
        const rand = seededRandom(17056);
        const notes = [];
        const beatInterval = 60000 / 170;
        const totalBeats = Math.floor(200000 / beatInterval);
        let prevLane = -1;
        for (let i = 0; i < totalBeats; i++) {
          const baseTime = i * beatInterval + 3000;
          for (let sub = 0; sub < 5; sub++) {
            const noteTime = baseTime + sub * (beatInterval / 5);
            if (rand() < 0.65) {
              let lane = Math.floor(rand() * 6);
              if (lane === prevLane) lane = (lane + 1 + Math.floor(rand() * 5)) % 6;
              notes.push({ time: noteTime, lane });
              prevLane = lane;
            }
          }
        }
        return notes.sort((a, b) => a.time - b.time);
      },
    },
  ],
};

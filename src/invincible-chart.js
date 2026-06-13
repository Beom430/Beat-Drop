// Invincible (DEAF KEV) - 수작업 채보
// BPM: 100, 1비트 = 600ms
// 구조: 인트로(0~9s) → 빌드업(10~29s) → 드롭(30~57s) → 브레이크다운(57~86s) → 빌드업(86~105s) → 드롭(105~133s) → 아웃트로(133~150s)

const B = 600; // 1비트 (ms) at 100BPM

function t(sec) { return sec * 1000; } // 초를 ms로

// 패턴 헬퍼: 연속 노트 생성
function seq(startTime, count, interval, lanes) {
  const notes = [];
  for (let i = 0; i < count; i++) {
    notes.push({ time: startTime + i * interval, lane: lanes[i % lanes.length] });
  }
  return notes;
}

// 패턴 헬퍼: 특정 비트에 노트 배치
function beats(startTime, beatPattern, lane) {
  // beatPattern: [0, 1, 2, 3...] 비트 번호
  return beatPattern.map((b) => ({ time: startTime + b * B, lane }));
}

export function generateInvincibleChart(numLanes = 4) {
  const notes = [];

  // === 인트로 (0:00 ~ 0:09) — 피아노, 아주 적은 노트 ===
  // 4비트마다 하나씩 천천히
  notes.push({ time: t(2), lane: 1 });
  notes.push({ time: t(3.6), lane: 2 });
  notes.push({ time: t(5.4), lane: 0 });
  notes.push({ time: t(7.2), lane: 3 });
  notes.push({ time: t(8.4), lane: 1 });

  // === 빌드업 (0:10 ~ 0:29) — 점점 빨라지는 드럼 ===
  // 10~15s: 2비트마다
  notes.push(...seq(t(10), 4, B * 2, [0, 2, 1, 3]));
  // 15~20s: 1비트마다
  notes.push(...seq(t(15), 8, B, [0, 1, 2, 3, 2, 1, 0, 3]));
  // 20~25s: 반박 추가
  notes.push(...seq(t(20), 16, B / 2, [0, 2, 1, 3, 0, 3, 2, 1, 0, 1, 3, 2, 1, 0, 2, 3]));
  // 25~29s: 16분음표 연타 (빌드업 클라이맥스)
  notes.push(...seq(t(25), 24, B / 4, [0, 1, 2, 3, 2, 1, 0, 3, 1, 2, 0, 3, 2, 1, 3, 0, 1, 2, 3, 0, 2, 1, 3, 2]));

  // === 드롭 1 (0:30 ~ 0:57) — 메인 글리치합 멜로디, 강렬 ===
  // 킥 패턴 (4분음표 기반) + 스네어 (반박) + 글리치 멜로디
  for (let bar = 0; bar < 9; bar++) { // 9마디 (약 27초 / 3초 per 마디 at 100bpm 사실은 2.4초)
    const barStart = t(30) + bar * B * 4;

    // 킥: 1, 3박
    notes.push({ time: barStart, lane: 0 });
    notes.push({ time: barStart + B * 2, lane: 0 });

    // 스네어: 2, 4박
    notes.push({ time: barStart + B, lane: 2 });
    notes.push({ time: barStart + B * 3, lane: 2 });

    // 글리치 멜로디 (8분음표 기반, 바 마다 다른 패턴)
    const melodyPatterns = [
      [0.5, 1.5, 2.5, 3.5], // 반박만
      [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], // 풀 8분음표
      [0, 0.75, 1.5, 2.25, 3, 3.5], // 점음표 느낌
      [0.25, 0.75, 1.25, 1.75, 2.5, 3, 3.25, 3.75], // 16분 섞임
    ];
    const pattern = melodyPatterns[bar % melodyPatterns.length];
    const melodyLanes = [1, 3, 1, 3, 1, 3, 1, 3];
    pattern.forEach((beat, i) => {
      notes.push({ time: barStart + beat * B, lane: melodyLanes[i % melodyLanes.length] });
    });
  }

  // === 브레이크다운 (0:57 ~ 1:26) — 잔잔, 적은 노트 ===
  // 57~66s: 2비트마다 천천히
  notes.push(...seq(t(57), 8, B * 2, [1, 2, 0, 3, 2, 1, 3, 0]));
  // 66~76s: 1비트마다 + 약간의 롱노트
  notes.push(...seq(t(66), 16, B, [0, 2, 1, 3, 0, 1, 2, 3, 1, 0, 3, 2, 0, 1, 2, 3]));
  notes.push({ time: t(70), lane: 1, hold: B * 3 });
  notes.push({ time: t(76), lane: 2, hold: B * 4 });
  // 76~86s: 서서히 다시 빨라짐
  notes.push(...seq(t(76), 16, B / 2, [0, 3, 1, 2, 3, 0, 2, 1, 0, 3, 1, 2, 0, 1, 3, 2]));

  // === 빌드업 2 (1:26 ~ 1:45) ===
  // 86~91s: 1비트
  notes.push(...seq(t(86), 8, B, [0, 1, 2, 3, 0, 1, 2, 3]));
  // 91~98s: 반박
  notes.push(...seq(t(91), 20, B / 2, [0, 2, 1, 3, 0, 3, 1, 2, 0, 2, 3, 1, 0, 1, 2, 3, 0, 3, 2, 1]));
  // 98~105s: 16분 연타 빌드업
  notes.push(...seq(t(98), 40, B / 4, [
    0,1,2,3, 3,2,1,0, 0,2,1,3, 3,1,2,0,
    0,1,2,3, 2,0,3,1, 1,3,0,2, 0,1,2,3,
    3,2,1,0, 1,0,3,2, 2,3,0,1, 0,1,2,3
  ].slice(0, 40)));

  // === 드롭 2 (1:45 ~ 2:13) — 반복 + 더 강렬 ===
  for (let bar = 0; bar < 9; bar++) {
    const barStart = t(105) + bar * B * 4;

    // 킥
    notes.push({ time: barStart, lane: 0 });
    notes.push({ time: barStart + B * 2, lane: 0 });

    // 스네어
    notes.push({ time: barStart + B, lane: 2 });
    notes.push({ time: barStart + B * 3, lane: 2 });

    // 더 밀도 높은 멜로디 (16분음표 포함)
    const melodyPatterns2 = [
      [0, 0.25, 0.5, 1, 1.5, 2, 2.25, 2.5, 3, 3.5],
      [0, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 3.25, 3.5, 3.75],
      [0, 0.25, 0.75, 1, 1.25, 1.75, 2, 2.5, 3, 3.5],
      [0, 0.5, 1, 1.25, 1.5, 2, 2.25, 2.75, 3, 3.25, 3.5],
    ];
    const pattern = melodyPatterns2[bar % melodyPatterns2.length];
    const lanes2 = [1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1];
    pattern.forEach((beat, i) => {
      notes.push({ time: barStart + beat * B, lane: lanes2[i % lanes2.length] });
    });
  }

  // === 아웃트로 (2:13 ~ 2:30) — 페이드아웃 ===
  notes.push(...seq(t(133), 6, B * 2, [1, 2, 0, 3, 1, 2]));
  notes.push({ time: t(140), lane: 1, hold: B * 4 });
  notes.push({ time: t(145), lane: 2 });
  notes.push({ time: t(147), lane: 1 });

  // 6키 대응: lane 값을 6키로 확장
  if (numLanes === 6) {
    return notes.map((n) => ({
      ...n,
      lane: Math.floor(n.lane * 6 / 4), // 0~3 → 0~5로 매핑 확장
    }));
  }

  return notes;
}

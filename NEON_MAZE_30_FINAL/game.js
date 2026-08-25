'use strict';

const TILE = 16;
const COLS = 28;
const ROWS = 36;
const ROUND_TIME = 30;
const PLAYER_SPEED = 114; 
const PLAYER_RADIUS = 6.25;
const COLLISION_STEP = 1.5; 
const TURN_ASSIST = 5.0;    
const GHOST_SPEED = 80;  
const FRIGHTENED_SPEED = 54;
const FRIGHTENED_TIME = 5.5;
const SAVE_KEY = 'neonMaze30SaveV1';
const RUNS_KEY = 'neonMaze30RunsV1';
const NORMAL_PELLET_COUNT = 20;
const POWER_PELLET_COUNT = 4;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusText = document.getElementById('statusText');
const timeText = document.getElementById('timeText');
const scoreText = document.getElementById('scoreText');
const livesText = document.getElementById('livesText');
const modeText = document.getElementById('modeText');
const bestScoreText = document.getElementById('bestScoreText');
const playCountText = document.getElementById('playCountText');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlayMessage = document.getElementById('overlayMessage');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const reduceMotionInput = document.getElementById('reduceMotion');
const muteBtn = document.getElementById('muteBtn');
const totalPlayTimeText = document.getElementById('totalPlayTimeText');
const inputCountEl = document.getElementById('inputCount');
const intentCountEl = document.getElementById('intentCount');
const testOutput = document.getElementById('testOutput');
const saveTestStatus = document.getElementById('saveTestStatus');

const DIRS = {
  UP: { x: 0, y: -1 }, LEFT: { x: -1, y: 0 }, DOWN: { x: 0, y: 1 }, RIGHT: { x: 1, y: 0 }, NONE: { x: 0, y: 0 }
};
const PRIORITY = ['UP', 'LEFT', 'DOWN', 'RIGHT'];
const OPPOSITE = { UP:'DOWN', DOWN:'UP', LEFT:'RIGHT', RIGHT:'LEFT', NONE:'NONE' };

const images = {};
for (const name of ['player','blinky','pinky','inky','clyde','frightened']) {
  const img = new Image();
  img.src = `assets/${name}.png`;
  images[name] = img;
}

const defaultSave = { bestScore: 0, bestClearTime: null, reduceMotion: false, muted: false, totalPlays: 0, totalPlaySeconds: 0 };
function normalizeSave(v) {
  if (!v || typeof v !== 'object') return { ...defaultSave };
  const bestScore = Number.isFinite(v.bestScore) && v.bestScore >= 0 ? v.bestScore : 0;
  const bestClearTime = v.bestClearTime === null || v.bestClearTime === undefined
    ? null
    : (Number.isFinite(v.bestClearTime) && v.bestClearTime >= 0 && v.bestClearTime <= ROUND_TIME ? v.bestClearTime : null);
  const reduceMotion = typeof v.reduceMotion === 'boolean' ? v.reduceMotion : false;
  const muted = typeof v.muted === 'boolean' ? v.muted : false;
  const totalPlays = Number.isInteger(v.totalPlays) && v.totalPlays >= 0 ? v.totalPlays : 0;
  const totalPlaySeconds = Number.isFinite(v.totalPlaySeconds) && v.totalPlaySeconds >= 0 ? v.totalPlaySeconds : 0;
  return { bestScore, bestClearTime, reduceMotion, muted, totalPlays, totalPlaySeconds };
}
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return { ...defaultSave };
    return normalizeSave(JSON.parse(raw));
  } catch (_) { return { ...defaultSave }; }
}
let save = loadSave();
function persistSave() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (_) {}
}

const map = Array.from({ length: ROWS }, () => Array(COLS).fill(1));
function carveH(y, x1, x2) { for (let x=x1; x<=x2; x++) map[y][x]=0; }
function carveV(x, y1, y2) { for (let y=y1; y<=y2; y++) map[y][x]=0; }
carveH(3,2,25); carveH(8,2,25); carveH(13,2,25); carveH(18,0,27); carveH(23,2,25); carveH(28,2,25); carveH(33,2,25);
for (const x of [2,6,10,13,14,17,21,25]) carveV(x,3,33);
for (let y=4;y<8;y++){ if(y!==6){ map[y][10]=1; map[y][17]=1; }}
for (let y=9;y<13;y++){ if(y!==11){ map[y][6]=1; map[y][21]=1; }}
for (let y=14;y<18;y++){ if(y!==16){ map[y][10]=1; map[y][17]=1; }}
for (let y=19;y<23;y++){ if(y!==21){ map[y][6]=1; map[y][21]=1; }}
for (let y=24;y<28;y++){ if(y!==26){ map[y][10]=1; map[y][17]=1; }}
for (let y=29;y<33;y++){ if(y!==31){ map[y][6]=1; map[y][21]=1; }}
for (let y=15;y<=20;y++) for(let x=11;x<=16;x++) map[y][x]=0;
carveH(14,12,15); carveV(13,13,22); carveV(14,13,22);
carveH(18,0,27);

function getReachableTiles(startX, startY) {
  const queue = [[startX, startY]];
  const seen = new Set([`${startX},${startY}`]);
  while (queue.length) {
    const [x,y] = queue.shift();
    for (const d of PRIORITY.map(k=>DIRS[k])) {
      const nx=x+d.x, ny=y+d.y, key=`${nx},${ny}`;
      if (nx<0 || nx>=COLS || ny<0 || ny>=ROWS || isWall(nx,ny) || seen.has(key)) continue;
      seen.add(key); queue.push([nx,ny]);
    }
  }
  return seen;
}
function newRoundSeed() {
  if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
    const a = new Uint32Array(1);
    globalThis.crypto.getRandomValues(a);
    return a[0] || 1;
  }
  return Math.floor(Math.random() * 0xFFFFFFFF) || 1;
}
function mulberry32(seed) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function shuffled(list, rng) {
  const out=[...list];
  for (let i=out.length-1;i>0;i--) {
    const j=Math.floor(rng()*(i+1));
    [out[i],out[j]]=[out[j],out[i]];
  }
  return out;
}
const reachableTiles = getReachableTiles(14,26);
function buildPelletLayout(seed) {
  const blocked = new Set([
    `${PLAYER_START?.x ?? 14},${PLAYER_START?.y ?? 28}`,
    '13,13','13,17','14,17','14,18'
  ]);
  const candidates=[];
  for (const key of reachableTiles) {
    const [x,y]=key.split(',').map(Number);
    const ghostHouse = (x>=11 && x<=16 && y>=14 && y<=20);
    const nearStart = Math.abs(x-14)+Math.abs(y-28) <= 1;
    if (!ghostHouse && !nearStart && !blocked.has(key)) candidates.push(key);
  }
  const rng=mulberry32(seed);
  const picked=shuffled(candidates,rng).slice(0,NORMAL_PELLET_COUNT+POWER_PELLET_COUNT);
  const power = new Set(picked.slice(0,POWER_PELLET_COUNT));
  return { seeds:picked, power };
}
let pelletLayout = null;
let pelletSeeds = [];
let powerSeeds = new Set();

const scatterTargets = {
  BLINKY:{x:27,y:-3}, PINKY:{x:0,y:-3}, INKY:{x:27,y:38}, CLYDE:{x:0,y:38}
};

let state = 'READY';
let timeLeft = ROUND_TIME;
let score = 0;
let lives = 3;
let pellets = new Set();
let requestedDirection = 'LEFT';
let inputSerial = 0;
const heldKeys = new Set();
const keyPressOrder = [];
let lastTime = performance.now();
let pausedByVisibility = false;
let runStartedAt = 0;
let frightenedRemaining = 0;
let frightenedChain = 0;
let modeClock = 0;
let currentMode = 'SCATTER';
let inputCount = 0;
let intentCount = 0;
let flash = 0;
let fireworks = [];
let autosaveClock = 0;
let currentPelletSeed = 1;

const PLAYER_START = { x:14, y:28, dir:'LEFT' };
currentPelletSeed = newRoundSeed();
pelletLayout = buildPelletLayout(currentPelletSeed);
pelletSeeds = pelletLayout.seeds;
powerSeeds = pelletLayout.power;
const player = { x:centerCoord(PLAYER_START.x), y:centerCoord(PLAYER_START.y), dir:PLAYER_START.dir, radius:PLAYER_RADIUS, lastCenterKey:null };
const ghosts = [
  { type:'BLINKY', image:'blinky', x:centerCoord(13), y:centerCoord(13), dir:'LEFT', releaseAt:0, home:{x:13,y:13}, eaten:false, lastCenterKey:null },
  { type:'PINKY', image:'pinky', x:centerCoord(13), y:centerCoord(17), dir:'UP', releaseAt:1.2, home:{x:13,y:17}, eaten:false, lastCenterKey:null },
  { type:'INKY', image:'inky', x:centerCoord(14), y:centerCoord(17), dir:'UP', releaseAt:2.7, home:{x:14,y:17}, eaten:false, lastCenterKey:null },
  { type:'CLYDE', image:'clyde', x:centerCoord(14), y:centerCoord(18), dir:'UP', releaseAt:4.2, home:{x:14,y:18}, eaten:false, lastCenterKey:null }
];

function tileOf(entity) { return { x:Math.floor(entity.x/TILE), y:Math.floor(entity.y/TILE) }; }
function centerCoord(t) { return (t + 0.5) * TILE; }
function isWall(tx,ty) {
  if (ty < 0 || ty >= ROWS) return true;
  if (tx < 0 || tx >= COLS) return ty !== 18;
  return map[ty][tx] === 1;
}
function atTileCenter(entity, tolerance=2.2) {
  const t = tileOf(entity);
  return Math.abs(entity.x-centerCoord(t.x)) <= tolerance && Math.abs(entity.y-centerCoord(t.y)) <= tolerance;
}
function canMoveFrom(tx,ty,dir) {
  const d=DIRS[dir];
  if ((tx===0 && ty===18 && dir==='LEFT') || (tx===27 && ty===18 && dir==='RIGHT')) return true;
  return !isWall(tx+d.x, ty+d.y);
}
function clamp(v,min,max){ return Math.max(min,Math.min(max,v)); }
function circleHitsWall(cx,cy,radius) {
  const minTx=Math.floor((cx-radius)/TILE), maxTx=Math.floor((cx+radius)/TILE);
  const minTy=Math.floor((cy-radius)/TILE), maxTy=Math.floor((cy+radius)/TILE);
  for (let ty=minTy; ty<=maxTy; ty++) {
    for (let tx=minTx; tx<=maxTx; tx++) {
      if (!isWall(tx,ty)) continue;
      const left=tx*TILE, top=ty*TILE, right=left+TILE, bottom=top+TILE;
      const qx=clamp(cx,left,right), qy=clamp(cy,top,bottom);
      const dx=cx-qx, dy=cy-qy;
      if (dx*dx+dy*dy < radius*radius-0.0001) return true;
    }
  }
  return false;
}
function moveSwept(entity, dx, dy, radius=PLAYER_RADIUS) {
  const distance=Math.hypot(dx,dy);
  if (!distance) return true;
  const steps=Math.max(1,Math.ceil(distance/COLLISION_STEP));
  const sx=dx/steps, sy=dy/steps;
  let moved=false;
  for (let i=0;i<steps;i++) {
    const nx=entity.x+sx, ny=entity.y+sy;
    if (circleHitsWall(nx,ny,radius)) return moved;
    entity.x=nx; entity.y=ny; moved=true;
    wrapTunnel(entity);
  }
  return moved;
}
function inTunnelBand(entity) {
  return Math.abs(entity.y-centerCoord(18)) <= TILE*0.46;
}
function wrapTunnel(entity) {
  if (!inTunnelBand(entity)) return false;
  const radius=Number.isFinite(entity.radius) ? entity.radius : 6.0;
  let wrapped=false;
  // Never leave an entity on tile -1 / 28 where AI can get stuck.
  // Crossing an edge places it directly at the opposite valid tunnel tile center.
  if (entity.x < -radius) { entity.x=centerCoord(COLS-1); wrapped=true; }
  else if (entity.x > COLS*TILE + radius) { entity.x=centerCoord(0); wrapped=true; }
  if (wrapped) {
    entity.y=centerCoord(18);
    if ('lastCenterKey' in entity) entity.lastCenterKey=null;
  }
  return wrapped;
}
function openDirectionsAt(tx,ty) {
  return {
    UP:canMoveFrom(tx,ty,'UP'), LEFT:canMoveFrom(tx,ty,'LEFT'),
    DOWN:canMoveFrom(tx,ty,'DOWN'), RIGHT:canMoveFrom(tx,ty,'RIGHT')
  };
}
function straightCorridorAxis(tx,ty) {
  const o=openDirectionsAt(tx,ty);
  const h=o.LEFT||o.RIGHT, v=o.UP||o.DOWN;
  if (h && !v) return 'H';
  if (v && !h) return 'V';
  return null;
}
function dirMatchesAxis(dir,axis) {
  return axis==='H' ? (dir==='LEFT'||dir==='RIGHT') : axis==='V' ? (dir==='UP'||dir==='DOWN') : true;
}



// Original Web Audio BGM / SFX

let audioCtx = null;
let masterGain = null;
let musicTimer = null;
let musicStep = 0;
const BGM_PATTERN = [261.63, 329.63, 392.00, 329.63, 293.66, 349.23, 440.00, 349.23, 246.94, 293.66, 369.99, 293.66, 220.00, 277.18, 329.63, 277.18];

function ensureAudio() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return false;
    audioCtx = new AudioContext();
    masterGain = audioCtx.createGain();
    masterGain.connect(audioCtx.destination);
    applyMute();
    musicTimer = window.setInterval(bgmTick, 180);
  }
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(()=>{});
  return true;
}
function applyMute() {
  if (!masterGain || !audioCtx) return;
  const value = save.muted ? 0 : 0.24;
  masterGain.gain.cancelScheduledValues(audioCtx.currentTime);
  masterGain.gain.setTargetAtTime(value, audioCtx.currentTime, 0.015);
}
function tone(freq, duration=0.08, type='square', volume=0.12, when=null) {
  if (!audioCtx || !masterGain || save.muted || !freq) return;
  const start = when ?? audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain); gain.connect(masterGain);
  osc.start(start); osc.stop(start + duration + 0.02);
}
function bgmTick() {
  if (!audioCtx || state !== 'PLAYING' || save.muted) return;
  const note = BGM_PATTERN[musicStep % BGM_PATTERN.length];
  tone(note, 0.115, 'square', 0.045);
  if (musicStep % 4 === 0) tone(note/2, 0.14, 'triangle', 0.025);
  musicStep++;
}
function sfxCoin() { if (ensureAudio()) tone(880, 0.045, 'square', 0.075); }
function sfxPower() {
  if (!ensureAudio()) return;
  const t=audioCtx.currentTime; tone(330,0.08,'square',0.11,t); tone(440,0.08,'square',0.11,t+0.07); tone(660,0.11,'square',0.11,t+0.14);
}
function sfxGhost() { if (ensureAudio()) { const t=audioCtx.currentTime; tone(660,0.06,'square',0.1,t); tone(990,0.09,'square',0.1,t+0.05); } }
function sfxHit() { if (ensureAudio()) { const t=audioCtx.currentTime; tone(180,0.11,'sawtooth',0.1,t); tone(120,0.18,'sawtooth',0.08,t+0.09); } }
function sfxFail() { if (ensureAudio()) { const t=audioCtx.currentTime; [220,185,147,110].forEach((n,i)=>tone(n,0.14,'triangle',0.09,t+i*0.11)); } }
function sfxSuccess() { if (ensureAudio()) { const t=audioCtx.currentTime; [523.25,659.25,783.99,1046.5].forEach((n,i)=>tone(n,0.18,'square',0.105,t+i*0.12)); } }
function updateSoundButton() {
  muteBtn.textContent = `소리 끄기: ${save.muted ? 'ON' : 'OFF'}`;
  muteBtn.setAttribute('aria-pressed', save.muted ? 'true' : 'false');
}

function spawnFireworks() {
  if (save.reduceMotion) return;
  fireworks = [];
  const bursts = 5;
  for (let b=0;b<bursts;b++) {
    const ox = canvas.width * (0.15 + Math.random()*0.7);
    const oy = canvas.height * (0.12 + Math.random()*0.48);
    const hue = Math.floor(Math.random()*360);
    for (let i=0;i<26;i++) {
      const angle=Math.random()*Math.PI*2, speed=45+Math.random()*115;
      fireworks.push({x:ox,y:oy,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,life:0.75+Math.random()*0.65,max:1.4,hue:hue+Math.random()*35});
    }
  }
}
function updateFireworks(dt) {
  for (const p of fireworks) { p.life-=dt; p.vy+=70*dt; p.x+=p.vx*dt; p.y+=p.vy*dt; }
  fireworks=fireworks.filter(p=>p.life>0);
}
function drawFireworks() {
  if (save.reduceMotion) return;
  ctx.save();
  ctx.globalCompositeOperation='lighter';
  for (const p of fireworks) {
    ctx.globalAlpha=Math.max(0,Math.min(1,p.life/p.max));
    ctx.fillStyle=`hsl(${p.hue} 95% 65%)`;
    ctx.fillRect(p.x-2,p.y-2,4,4);
  }
  ctx.restore(); ctx.globalAlpha=1;
}
function formatDuration(seconds) {
  const total=Math.max(0,Math.floor(seconds));
  const h=String(Math.floor(total/3600)).padStart(2,'0');
  const m=String(Math.floor((total%3600)/60)).padStart(2,'0');
  const sec=String(total%60).padStart(2,'0');
  return `${h}:${m}:${sec}`;
}

function resetPositions() {
  player.x=centerCoord(PLAYER_START.x); player.y=centerCoord(PLAYER_START.y); player.dir=PLAYER_START.dir; player.lastCenterKey=null; requestedDirection='NONE'; inputSerial=0; heldKeys.clear(); keyPressOrder.length=0;
  const initial = [[13,13,'LEFT'],[13,17,'UP'],[14,17,'UP'],[14,18,'UP']];
  ghosts.forEach((g,i)=>{ g.x=centerCoord(initial[i][0]); g.y=centerCoord(initial[i][1]); g.dir=initial[i][2]; g.eaten=false; g.lastCenterKey=null; });
}
function resetRound() {
  currentPelletSeed=newRoundSeed();
  pelletLayout=buildPelletLayout(currentPelletSeed);
  pelletSeeds=pelletLayout.seeds; powerSeeds=pelletLayout.power;
  state='PLAYING'; timeLeft=ROUND_TIME; score=0; lives=3; pellets=new Set(pelletSeeds); frightenedRemaining=0; frightenedChain=0; modeClock=0; currentMode='SCATTER'; flash=0; fireworks=[]; autosaveClock=0;
  resetPositions();
  runStartedAt=performance.now(); lastTime=performance.now(); musicStep=0;
  overlay.classList.remove('visible','celebrate'); pauseBtn.disabled=false; pauseBtn.textContent='일시정지 (P)';
  ensureAudio();
  updateHud();
}
function endRound(result, cause) {
  if (!['PLAYING','PAUSED'].includes(state)) return;
  state=result;
  const elapsed = Math.max(0, ROUND_TIME-timeLeft);
  save.totalPlays += 1;
  if (score > save.bestScore) save.bestScore = score;
  if (result==='SUCCESS' && (save.bestClearTime===null || elapsed<save.bestClearTime)) save.bestClearTime=elapsed;
  persistSave();
  appendRun({ timestamp:new Date().toISOString(), ghostSpeed:GHOST_SPEED, pelletSeed:currentPelletSeed, result, score, survival:+elapsed.toFixed(2), cause });
  overlayTitle.textContent = result==='SUCCESS' ? 'SUCCESS!' : 'GAME OVER';
  overlayMessage.textContent = result==='SUCCESS' ? `모든 코인을 먹었습니다. ${elapsed.toFixed(1)}초 / ${score}점` : `${cause} · ${score}점`;
  startBtn.textContent='다시 시작'; overlay.classList.add('visible'); pauseBtn.disabled=true;
  if (result==='SUCCESS') { overlay.classList.add('celebrate'); spawnFireworks(); sfxSuccess(); }
  else { overlay.classList.remove('celebrate'); sfxFail(); }
  updateHud();
}
function loseLife() {
  lives--;
  if (!save.reduceMotion) flash=0.35;
  sfxHit();
  if (lives<=0) { endRound('FAIL','유령에게 잡혀 목숨을 모두 잃음'); return; }
  resetPositions();
  frightenedRemaining=0; frightenedChain=0;
}

function updateMode(dt) {
  if (frightenedRemaining>0) { frightenedRemaining-=dt; if (frightenedRemaining<=0) frightenedChain=0; return; }
  modeClock += dt;
  const schedule = [[5,'SCATTER'],[15,'CHASE'],[20,'SCATTER'],[Infinity,'CHASE']];
  const old=currentMode;
  currentMode = schedule.find(([limit])=>modeClock<limit)[1];
  if (old!==currentMode) ghosts.forEach(g=>g.dir=OPPOSITE[g.dir]);
}
function playerTileAhead(n) {
  const p=tileOf(player), d=DIRS[player.dir]; return {x:p.x+d.x*n, y:p.y+d.y*n};
}
function getTarget(g) {
  const p=tileOf(player);
  if (currentMode==='SCATTER') return scatterTargets[g.type];
  if (g.type==='BLINKY') return p;
  if (g.type==='PINKY') return playerTileAhead(4);
  if (g.type==='INKY') {
    const pivot=playerTileAhead(2); const b=tileOf(ghosts[0]);
    return {x:pivot.x+(pivot.x-b.x), y:pivot.y+(pivot.y-b.y)};
  }
  const gt=tileOf(g); const dx=p.x-gt.x,dy=p.y-gt.y;
  return Math.hypot(dx,dy)>8 ? p : scatterTargets.CLYDE;
}
function chooseGhostDirection(g) {
  const t=tileOf(g);
  const possible = PRIORITY.filter(dir=>dir!==OPPOSITE[g.dir] && canMoveFrom(t.x,t.y,dir));
  const candidates = possible.length ? possible : PRIORITY.filter(dir=>canMoveFrom(t.x,t.y,dir));
  if (!candidates.length) return OPPOSITE[g.dir];
  if (frightenedRemaining>0) return candidates[Math.floor(Math.random()*candidates.length)];
  const target=getTarget(g); let best=candidates[0], bestD=Infinity;
  for (const dir of candidates) {
    const d=DIRS[dir]; const nx=t.x+d.x, ny=t.y+d.y;
    const dist=(target.x-nx)**2+(target.y-ny)**2;
    if (dist<bestD) { bestD=dist; best=dir; }
  }
  return best;
}

function directionIsHeld(dir) {
  for (const key of heldKeys) if (KEY_TO_DIR[key] === dir) return true;
  return false;
}
function anyDirectionHeld() { return keyPressOrder.length > 0; }
function latestHeldDirection() {
  if (!keyPressOrder.length) return 'NONE';
  return KEY_TO_DIR[keyPressOrder[keyPressOrder.length-1]] || 'NONE';
}
function tryJunctionAssist(dir) {
  if (dir==='NONE') return false;
  const t=tileOf(player), d=DIRS[dir];
  if (!canMoveFrom(t.x,t.y,dir)) return false;
  const cx=centerCoord(t.x), cy=centerCoord(t.y);
  if (dir==='UP'||dir==='DOWN') {
    if (Math.abs(player.x-cx) <= TURN_ASSIST && !circleHitsWall(cx,player.y,player.radius)) {
      player.x=cx; return true;
    }
  } else {
    if (Math.abs(player.y-cy) <= TURN_ASSIST && !circleHitsWall(player.x,cy,player.radius)) {
      player.y=cy; return true;
    }
  }
  return false;
}
function updatePlayer(dt) {
  if (!anyDirectionHeld()) { collectPellet(); return; }

  let desired=latestHeldDirection();
  requestedDirection=desired;
  const t=tileOf(player);
  const axis=straightCorridorAxis(t.x,t.y);


  if (axis==='H') {
    const cy=centerCoord(t.y);
    if (!circleHitsWall(player.x,cy,player.radius)) player.y=cy;
  } else if (axis==='V') {
    const cx=centerCoord(t.x);
    if (!circleHitsWall(cx,player.y,player.radius)) player.x=cx;
  }

  let moveDir='NONE';
  if (axis) {
    if (desired!=='NONE' && directionIsHeld(desired) && dirMatchesAxis(desired,axis)) moveDir=desired;
    else if (directionIsHeld(player.dir) && dirMatchesAxis(player.dir,axis)) moveDir=player.dir;
  } else {

    if (desired!=='NONE' && directionIsHeld(desired)) {
      if (desired===player.dir || desired===OPPOSITE[player.dir]) {
        moveDir=desired;
      } else {
        const dd=DIRS[desired];
        const probe=PLAYER_SPEED*Math.min(dt,0.016);
        if (!circleHitsWall(player.x+dd.x*probe, player.y+dd.y*probe, player.radius) || tryJunctionAssist(desired)) moveDir=desired;
      }
    }
    if (moveDir==='NONE' && directionIsHeld(player.dir)) moveDir=player.dir;
  }

  if (moveDir==='NONE') { collectPellet(); return; }
  player.dir=moveDir;
  const d=DIRS[moveDir];
  moveSwept(player,d.x*PLAYER_SPEED*dt,d.y*PLAYER_SPEED*dt,player.radius);
  collectPellet();
}
function updateGhost(g,dt,elapsed) {
  if (elapsed < g.releaseAt) return;


  if (inTunnelBand(g) && (tileOf(g).x<=0 || tileOf(g).x>=COLS-1 || g.x<0 || g.x>COLS*TILE)) {
    g.y=centerCoord(18);
    if (g.dir!=='LEFT' && g.dir!=='RIGHT') g.dir = g.x < COLS*TILE/2 ? 'LEFT' : 'RIGHT';
  }

  if (atTileCenter(g)) {
    const t=tileOf(g);
    const centerKey=`${t.x},${t.y}`;
    if (g.lastCenterKey !== centerKey) {
      g.x=centerCoord(t.x); g.y=centerCoord(t.y);
      g.dir=chooseGhostDirection(g);
      g.lastCenterKey=centerKey;
    }
  }
  const speed = frightenedRemaining>0 ? FRIGHTENED_SPEED : GHOST_SPEED;
  const d=DIRS[g.dir];
  const moved=moveSwept(g,d.x*speed*dt,d.y*speed*dt,6.0);
  if (!moved) {
   
    const t=tileOf(g);
    if (t.x>=0 && t.x<COLS && t.y>=0 && t.y<ROWS && !isWall(t.x,t.y)) {
      g.x=centerCoord(t.x); g.y=centerCoord(t.y);
      g.lastCenterKey=null;
      g.dir=chooseGhostDirection(g);
    }
  }
}
function collectPellet() {
  const t=tileOf(player); const k=`${t.x},${t.y}`;
  if (!pellets.has(k)) return;
  pellets.delete(k);
  if (powerSeeds.has(k)) {
    score += 50; frightenedRemaining=FRIGHTENED_TIME; frightenedChain=0; sfxPower();
    ghosts.forEach(g=>{ if (g.dir!=='NONE') g.dir=OPPOSITE[g.dir]; });
  } else { score += 10; sfxCoin(); }
  if (pellets.size===0) endRound('SUCCESS','모든 펠릿 수집');
}
function checkGhostCollisions() {
  for (const g of ghosts) {
    const dx=player.x-g.x,dy=player.y-g.y;
    if (dx*dx+dy*dy < (10*TILE/16)**2) {
      if (frightenedRemaining>0) {
        const pts=[200,400,800,1600][Math.min(frightenedChain,3)]; score+=pts; frightenedChain++; sfxGhost();
        g.x=centerCoord(g.home.x);g.y=centerCoord(g.home.y);g.dir='UP';g.lastCenterKey=null;
      } else { loseLife(); }
      break;
    }
  }
}

function update(dt) {
  if (state!=='PLAYING') return;
  save.totalPlaySeconds += dt;
  autosaveClock += dt;
  if (autosaveClock >= 5) { autosaveClock=0; persistSave(); }
  timeLeft -= dt;
  if (timeLeft<=0) { timeLeft=0; endRound('FAIL','30초 제한시간 초과'); return; }
  updateMode(dt); updatePlayer(dt);
  const elapsed=ROUND_TIME-timeLeft;
  ghosts.forEach(g=>updateGhost(g,dt,elapsed));
  checkGhostCollisions();
  if (flash>0) flash=Math.max(0,flash-dt);
  updateHud();
}

function drawWall(x,y) {
  ctx.fillStyle='#0a1230'; ctx.fillRect(x*TILE,y*TILE,TILE,TILE);
  ctx.strokeStyle='#2456ff'; ctx.lineWidth=1.5; ctx.strokeRect(x*TILE+1,y*TILE+1,TILE-2,TILE-2);
}
function drawPellets() {
  for (const k of pellets) {
    const [x,y]=k.split(',').map(Number); const power=powerSeeds.has(k);
    ctx.fillStyle=power?'#ff91d2':'#ffe573'; ctx.beginPath(); ctx.arc(centerCoord(x),centerCoord(y),power?4:2,0,Math.PI*2); ctx.fill();
  }
}
function drawEntity(img, entity, size=22) {
  ctx.drawImage(img, entity.x-size/2, entity.y-size/2, size, size);
}
function draw() {
  ctx.clearRect(0,0,canvas.width,canvas.height); ctx.fillStyle='#02030a'; ctx.fillRect(0,0,canvas.width,canvas.height);
  for (let y=0;y<ROWS;y++) for(let x=0;x<COLS;x++) if(map[y][x]) drawWall(x,y);
  drawPellets();
  drawEntity(images.player,player,22);
  ghosts.forEach(g=>drawEntity(frightenedRemaining>0?images.frightened:images[g.image],g,22));
  if (flash>0 && !save.reduceMotion) { ctx.fillStyle=`rgba(255,70,100,${Math.min(.4,flash)})`; ctx.fillRect(0,0,canvas.width,canvas.height); }
  drawFireworks();
}
function loop(now) {
  let dt=(now-lastTime)/1000; lastTime=now; dt=Math.min(dt,0.05);
  update(dt); updateFireworks(dt); draw(); requestAnimationFrame(loop);
}

function updateHud() {
  const labels={READY:'준비',PLAYING:'진행 중',PAUSED:'일시정지',SUCCESS:'성공',FAIL:'실패'};
  statusText.textContent=labels[state]||state; timeText.textContent=timeLeft.toFixed(1); scoreText.textContent=score; livesText.textContent='● '.repeat(lives).trim() || '0';
  modeText.textContent=frightenedRemaining>0?'FRIGHTENED':currentMode; bestScoreText.textContent=save.bestScore; playCountText.textContent=save.totalPlays; totalPlayTimeText.textContent=formatDuration(save.totalPlaySeconds);
}
function setPaused(flag, fromVisibility=false) {
  if (flag && state==='PLAYING') { state='PAUSED'; pausedByVisibility=fromVisibility; pauseBtn.textContent='재개 (P)'; updateHud(); }
  else if (!flag && state==='PAUSED') { state='PLAYING'; pausedByVisibility=false; lastTime=performance.now(); pauseBtn.textContent='일시정지 (P)'; updateHud(); }
}
function togglePause() { if (state==='PLAYING') setPaused(true,false); else if (state==='PAUSED') setPaused(false,false); }

const KEY_TO_DIR={arrowup:'UP',w:'UP',arrowleft:'LEFT',a:'LEFT',arrowdown:'DOWN',s:'DOWN',arrowright:'RIGHT',d:'RIGHT'};
function handleDirectionEvent(dir) {
  inputCount++; inputCountEl.textContent=inputCount;
  intentCount++; intentCountEl.textContent=intentCount;
}
document.addEventListener('keydown',e=>{
  const key=e.key.toLowerCase();
  const dir=KEY_TO_DIR[key];
  if (dir) {
    e.preventDefault(); ensureAudio();
    handleDirectionEvent(dir); // exactly one counter reflection per key event
    if (!heldKeys.has(key)) {
      heldKeys.add(key);
      const oldIndex=keyPressOrder.indexOf(key);
      if (oldIndex>=0) keyPressOrder.splice(oldIndex,1);
      keyPressOrder.push(key);
      requestedDirection=dir;
      inputSerial++;
    }
  } else if (key==='p') { e.preventDefault(); ensureAudio(); togglePause(); }
});
document.addEventListener('keyup',e=>{
  const key=e.key.toLowerCase();
  if (!KEY_TO_DIR[key]) return;
  e.preventDefault();
  heldKeys.delete(key);
  const i=keyPressOrder.indexOf(key);
  if (i>=0) keyPressOrder.splice(i,1);
  requestedDirection=keyPressOrder.length ? KEY_TO_DIR[keyPressOrder[keyPressOrder.length-1]] : 'NONE';
  inputSerial++;
});
window.addEventListener('blur',()=>{ heldKeys.clear(); keyPressOrder.length=0; requestedDirection='NONE'; });
startBtn.addEventListener('click',()=>{ ensureAudio(); resetRound(); }); pauseBtn.addEventListener('click',()=>{ ensureAudio(); togglePause(); });
reduceMotionInput.checked=save.reduceMotion;
reduceMotionInput.addEventListener('change',()=>{ save.reduceMotion=reduceMotionInput.checked; if(save.reduceMotion){ fireworks=[]; flash=0; } persistSave(); });
updateSoundButton();
muteBtn.addEventListener('click',()=>{ ensureAudio(); save.muted=!save.muted; applyMute(); updateSoundButton(); persistSave(); });
window.addEventListener('blur',()=>{ if(state==='PLAYING') setPaused(true,true); });
window.addEventListener('focus',()=>{ if(state==='PAUSED' && pausedByVisibility) setPaused(false,true); });
document.addEventListener('visibilitychange',()=>{ if(document.hidden && state==='PLAYING') setPaused(true,true); else if(!document.hidden && state==='PAUSED' && pausedByVisibility) setPaused(false,true); });
window.addEventListener('resize',()=>{ /* canvas logical state intentionally untouched */ });
window.addEventListener('beforeunload',()=>{ persistSave(); });

function getRuns(){ try{const r=JSON.parse(localStorage.getItem(RUNS_KEY)||'[]'); return Array.isArray(r)?r:[];}catch(_){return[];} }
function appendRun(run){ const r=getRuns(); r.push(run); while(r.length>100)r.shift(); try{localStorage.setItem(RUNS_KEY,JSON.stringify(r));}catch(_){} renderRuns(); }
function renderRuns(){ const r=getRuns(); testOutput.textContent=r.length?JSON.stringify(r.slice(-20),null,2):'기록 없음'; }
document.getElementById('copyRunsBtn').addEventListener('click',async()=>{ const text=testOutput.textContent; try{await navigator.clipboard.writeText(text); alert('기록을 클립보드에 복사했습니다.');}catch(_){alert('복사 권한이 없어 아래 기록을 직접 복사해주세요.');} });
document.getElementById('clearRunsBtn').addEventListener('click',()=>{ localStorage.removeItem(RUNS_KEY); renderRuns(); });
document.getElementById('saveBtn').addEventListener('click',()=>{
  persistSave();
  saveTestStatus.textContent=`C23 확인: 저장 완료 — 최고점수 ${save.bestScore}, 총 플레이 ${save.totalPlays}회, 총 시간 ${formatDuration(save.totalPlaySeconds)}, 효과 줄이기 ${save.reduceMotion?'ON':'OFF'}, 소리 끄기 ${save.muted?'ON':'OFF'}. 새로고침 후 유지되면 통과.`;
});
document.getElementById('clearSaveBtn').addEventListener('click',()=>{
  localStorage.removeItem(SAVE_KEY);
  save={...defaultSave};
  reduceMotionInput.checked=save.reduceMotion; updateSoundButton(); applyMute();
  updateHud();
  saveTestStatus.textContent='C24 통과 확인: 저장값 없음 → 기본값(최고점수 0, 총 플레이 0회, 총 시간 00:00:00, 효과 줄이기 OFF, 소리 끄기 OFF)으로 정상 시작.';
});
document.getElementById('damageSaveBtn').addEventListener('click',()=>{
  localStorage.setItem(SAVE_KEY,'{broken-json');
  save=loadSave();
  persistSave(); // repair the broken value with safe defaults
  reduceMotionInput.checked=save.reduceMotion; updateSoundButton(); applyMute();
  updateHud();
  saveTestStatus.textContent='C25 통과 확인: 손상된 저장값 → 기본값으로 복구했고 게임이 중단되지 않음.';
});

updateHud(); renderRuns(); requestAnimationFrame(loop);

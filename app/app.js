'use strict';

/* ---------- Language config ---------- */
// Web Speech API recognition languages (free/legacy engine)
const SPEECH_LANGS = [
  { code: 'en-US', label: '英语' },
  { code: 'zh-CN', label: '中文' },
  { code: 'ja-JP', label: '日语' },
  { code: 'ko-KR', label: '韩语' },
  { code: 'fr-FR', label: '法语' },
  { code: 'de-DE', label: '德语' },
  { code: 'es-ES', label: '西班牙语' },
  { code: 'ru-RU', label: '俄语' },
];

// Translation target codes (used by both engines)
const TRANSLATE_LANGS = [
  { code: 'zh-CN', label: '中文' },
  { code: 'en', label: '英语' },
  { code: 'ja', label: '日语' },
  { code: 'ko', label: '韩语' },
  { code: 'fr', label: '法语' },
  { code: 'de', label: '德语' },
  { code: 'es', label: '西班牙语' },
  { code: 'ru', label: '俄语' },
];

function speechLangToShort(code) {
  if (code === 'zh-CN') return 'zh-CN';
  return code.split('-')[0];
}

const sourceLangSelect = document.getElementById('sourceLang');
const targetLangSelect = document.getElementById('targetLang');

SPEECH_LANGS.forEach((l) => {
  const opt = document.createElement('option');
  opt.value = l.code;
  opt.textContent = l.label;
  sourceLangSelect.appendChild(opt);
});
sourceLangSelect.value = 'en-US';

TRANSLATE_LANGS.forEach((l) => {
  const opt = document.createElement('option');
  opt.value = l.code;
  opt.textContent = l.label;
  targetLangSelect.appendChild(opt);
});
targetLangSelect.value = 'zh-CN';

function targetLangLabel() {
  const opt = TRANSLATE_LANGS.find((l) => l.code === targetLangSelect.value);
  return opt ? opt.label : targetLangSelect.value;
}

/* ---------- API key / settings ---------- */
const API_KEY_STORAGE = 'openai_api_key';
let apiKey = localStorage.getItem(API_KEY_STORAGE) || '';

const engineBadge = document.getElementById('engineBadge');
const settingsOverlay = document.getElementById('settingsOverlay');
const btnSettings = document.getElementById('btnSettings');
const btnCloseSettings = document.getElementById('btnCloseSettings');
const apiKeyInput = document.getElementById('apiKeyInput');
const btnSaveKey = document.getElementById('btnSaveKey');
const btnClearKey = document.getElementById('btnClearKey');
const keyStatus = document.getElementById('keyStatus');

function updateEngineBadge() {
  if (apiKey) {
    engineBadge.textContent = 'OpenAI 云端识别';
    engineBadge.classList.add('premium');
  } else {
    engineBadge.textContent = '免费识别(浏览器内置)';
    engineBadge.classList.remove('premium');
  }
}
updateEngineBadge();

function openSettings() {
  apiKeyInput.value = apiKey;
  keyStatus.textContent = '';
  settingsOverlay.hidden = false;
}
function closeSettings() {
  settingsOverlay.hidden = true;
}

btnSettings.addEventListener('click', openSettings);
btnCloseSettings.addEventListener('click', closeSettings);
settingsOverlay.addEventListener('click', (e) => {
  if (e.target === settingsOverlay) closeSettings();
});

btnSaveKey.addEventListener('click', () => {
  const val = apiKeyInput.value.trim();
  if (!val) {
    keyStatus.textContent = '请输入 Key,或点击"清除"改用免费方案。';
    return;
  }
  apiKey = val;
  localStorage.setItem(API_KEY_STORAGE, apiKey);
  updateEngineBadge();
  keyStatus.textContent = '已保存,下次录制将使用 OpenAI 云端识别。';
});

btnClearKey.addEventListener('click', () => {
  apiKey = '';
  localStorage.removeItem(API_KEY_STORAGE);
  apiKeyInput.value = '';
  updateEngineBadge();
  keyStatus.textContent = '已清除,将使用浏览器内置免费识别。';
});

/* ---------- Save location (File System Access API, Chrome/Edge only) ----------
   localStorage can't hold a directory handle, so the handle itself is kept in
   a tiny IndexedDB store; permission on it is re-checked (and re-requested)
   each time we actually write, since browsers can revoke it silently. */
const supportsDirPicker = 'showDirectoryPicker' in window;
let saveDirHandle = null;

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('xwx-fs', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('handles');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('handles', 'readonly');
    const req = tx.objectStore('handles').get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}
async function idbSet(key, value) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

const savePathDisplay = document.getElementById('savePathDisplay');
const btnChooseSaveDir = document.getElementById('btnChooseSaveDir');
const saveDirUnsupportedHint = document.getElementById('saveDirUnsupportedHint');

function updateSavePathDisplay() {
  savePathDisplay.textContent = saveDirHandle
    ? `已选择:${saveDirHandle.name}`
    : '未设置(默认下载到"下载"文件夹)';
  savePathDisplay.title = savePathDisplay.textContent;
}

if (!supportsDirPicker) {
  saveDirUnsupportedHint.hidden = false;
  btnChooseSaveDir.disabled = true;
} else {
  idbGet('saveDir').then((handle) => {
    if (handle) {
      saveDirHandle = handle;
      updateSavePathDisplay();
    }
  }).catch((err) => console.warn('load saved dir handle failed', err));
}

btnChooseSaveDir.addEventListener('click', async () => {
  try {
    const handle = await window.showDirectoryPicker();
    const perm = await handle.requestPermission({ mode: 'readwrite' });
    if (perm !== 'granted') {
      showToast('未获得该文件夹的写入权限。');
      return;
    }
    saveDirHandle = handle;
    await idbSet('saveDir', handle);
    updateSavePathDisplay();
  } catch (err) {
    if (err.name !== 'AbortError') console.error('choose save dir failed', err);
  }
});

/* ---------- Mic device list ---------- */
const micSelect = document.getElementById('micSelect');

async function populateMicList() {
  try {
    // Need a permission grant before device labels are populated.
    const tmp = await navigator.mediaDevices.getUserMedia({ audio: true });
    tmp.getTracks().forEach((t) => t.stop());
    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices.filter((d) => d.kind === 'audioinput');
    micSelect.innerHTML = '';
    mics.forEach((d, i) => {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || `麦克风 ${i + 1}`;
      micSelect.appendChild(opt);
    });
    if (!mics.length) {
      const opt = document.createElement('option');
      opt.textContent = '未检测到麦克风';
      micSelect.appendChild(opt);
    }
  } catch (err) {
    micSelect.innerHTML = '<option>无法访问麦克风</option>';
    console.error('mic enumeration failed', err);
  }
}

// Don't request mic permission until the user actually touches the picker
// (or starts recording) — asking on page load is unsolicited and, if denied,
// leaves the dropdown permanently stuck on an error with no way to retry.
let micListLoaded = false;
function ensureMicList() {
  if (micListLoaded) return;
  micListLoaded = true;
  populateMicList();
}
micSelect.addEventListener('mousedown', ensureMicList);
micSelect.addEventListener('focus', ensureMicList);

/* ---------- Header date/time ---------- */
function formatDateTime(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function formatDuration(ms) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

const sessionTitle = document.getElementById('sessionTitle');
const breadcrumbTime = document.getElementById('breadcrumbTime');
const sessionDate = document.getElementById('sessionDate');
const recordedLabel = document.getElementById('recordedLabel');
const timerLabel = document.getElementById('timerLabel');

const now = new Date();
sessionTitle.textContent = formatDateTime(now);
breadcrumbTime.textContent = formatDateTime(now);
sessionDate.textContent = formatDateTime(now);

/* ---------- State ---------- */
let isRecording = false;
let isPaused = false;
let activeEngine = null; // 'openai' | 'legacy'

// legacy (Web Speech API) state
let recognition = null;
// openai state
let segmentLoopActive = false;
let currentRecorder = null;

let mediaStream = null;
let audioCtx = null;
let analyser = null;
let waveRAF = null;
let recordStartTime = null;
let elapsedBeforePause = 0;
let timerInterval = null;
const transcriptEntries = []; // { time, original, translated }

const transcriptList = document.getElementById('transcriptList');
const transcriptEmpty = document.getElementById('transcriptEmpty');
const btnRecordToggle = document.getElementById('btnRecordToggle');
const btnPause = document.getElementById('btnPause');
const pauseLabel = document.getElementById('pauseLabel');
const btnEnd = document.getElementById('btnEnd');
const btnEndLabel = document.getElementById('btnEndLabel');

/* ---------- Waveform ---------- */
const canvas = document.getElementById('waveform');
const canvasCtx = canvas.getContext('2d');

function drawWaveform() {
  if (!analyser) return;
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyser.getByteTimeDomainData(dataArray);

  canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
  canvasCtx.lineWidth = 2;
  canvasCtx.strokeStyle = '#4f6bff';
  canvasCtx.beginPath();

  const sliceWidth = canvas.width / bufferLength;
  let x = 0;
  for (let i = 0; i < bufferLength; i++) {
    const v = dataArray[i] / 128.0;
    const y = (v * canvas.height) / 2;
    if (i === 0) canvasCtx.moveTo(x, y);
    else canvasCtx.lineTo(x, y);
    x += sliceWidth;
  }
  canvasCtx.stroke();
  waveRAF = requestAnimationFrame(drawWaveform);
}

function stopWaveform() {
  if (waveRAF) cancelAnimationFrame(waveRAF);
  waveRAF = null;
  canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
}

/* ---------- Timer ---------- */
function startTimer() {
  recordStartTime = Date.now();
  timerInterval = setInterval(() => {
    const elapsed = elapsedBeforePause + (Date.now() - recordStartTime);
    timerLabel.textContent = formatDuration(elapsed);
    recordedLabel.textContent = `已录制 ${formatDuration(elapsed)}`;
  }, 500);
}
function pauseTimer() {
  elapsedBeforePause += Date.now() - recordStartTime;
  clearInterval(timerInterval);
  timerInterval = null;
}
function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
}
function currentElapsedMs() {
  return elapsedBeforePause + (recordStartTime && !isPaused ? Date.now() - recordStartTime : 0);
}

/* ---------- Transcript rendering (shared) ---------- */
function showEmptyMessage(msg) {
  transcriptEmpty.textContent = msg;
  transcriptEmpty.style.display = 'block';
}

function renderInterim(text) {
  let row = document.getElementById('interimRow');
  if (!text) {
    if (row) row.remove();
    return;
  }
  if (!row) {
    row = document.createElement('div');
    row.id = 'interimRow';
    row.className = 'interim-row';
    row.innerHTML = '<span class="pulse-dot"></span><span id="interimText"></span>';
    transcriptList.appendChild(row);
  }
  row.querySelector('#interimText').textContent = text;
  transcriptList.scrollTop = transcriptList.scrollHeight;
}

function createTranscriptRow(entry) {
  transcriptEmpty.style.display = 'none';
  const row = document.createElement('div');
  row.className = 'transcript-entry';
  row.innerHTML = `
    <span class="entry-time">${entry.time}</span>
    <div class="entry-text">
      <div class="entry-original"></div>
      <div class="entry-translated"></div>
    </div>`;
  row.querySelector('.entry-original').textContent = entry.original;
  row.querySelector('.entry-translated').textContent = entry.translated;
  transcriptList.appendChild(row);

  const interimRow = document.getElementById('interimRow');
  if (interimRow) transcriptList.appendChild(interimRow); // keep interim row at bottom
  transcriptList.scrollTop = transcriptList.scrollHeight;
  return row;
}

/* =====================================================================
   LEGACY ENGINE: Web Speech API (free, browser-built-in) + MyMemory
   Running as a real website (not Electron), a real Chrome/Edge build
   ships the private Google key this needs, so it works reliably here.
   ===================================================================== */

const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;

let consecutiveNetworkErrors = 0;
let networkErrorResetTimer = null;

function createRecognition() {
  if (!SpeechRecognitionCtor) return null;
  const rec = new SpeechRecognitionCtor();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = sourceLangSelect.value;

  rec.onresult = (event) => {
    consecutiveNetworkErrors = 0;
    let interimText = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const text = result[0].transcript.trim();
      if (result.isFinal) {
        if (text) addLegacyTranscriptEntry(text);
      } else {
        interimText += text;
      }
    }
    renderInterim(interimText);
  };

  rec.onerror = (event) => {
    console.warn('speech recognition error', event.error);
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      showEmptyMessage('麦克风权限被拒绝,请在浏览器地址栏的站点设置中允许麦克风访问后重试。');
      stopRecording();
      return;
    }
    if (event.error === 'network') {
      consecutiveNetworkErrors += 1;
      clearTimeout(networkErrorResetTimer);
      networkErrorResetTimer = setTimeout(() => { consecutiveNetworkErrors = 0; }, 8000);
      if (consecutiveNetworkErrors >= 3) {
        showEmptyMessage(
          '语音识别服务连续返回网络错误,请检查网络连接。也可以在右上角"设置"里填入 ' +
          'OpenAI API Key 改用云端识别。'
        );
        stopRecording();
      }
    }
    // 'no-speech' etc are recovered by onend's auto-restart.
  };

  rec.onend = () => {
    if (isRecording && activeEngine === 'legacy' && !isPaused) {
      try { rec.start(); } catch (e) { /* already starting */ }
    }
  };

  return rec;
}

async function addLegacyTranscriptEntry(original) {
  const entry = { time: formatDuration(currentElapsedMs()), original, translated: '翻译中…' };
  transcriptEntries.push(entry);
  const row = createTranscriptRow(entry);
  scheduleAutoSummary();

  entry.translated = await translateWithMyMemory(original, speechLangToShort(sourceLangSelect.value), targetLangSelect.value);
  row.querySelector('.entry-translated').textContent = entry.translated;
}

let translateQueue = Promise.resolve();
function translateWithMyMemory(text, sourceLang, targetLang) {
  translateQueue = translateQueue.then(() => doMyMemoryTranslate(text, sourceLang, targetLang));
  return translateQueue;
}

async function doMyMemoryTranslate(text, sourceLang, targetLang) {
  if (!text) return '';
  if (sourceLang === targetLang) return text;
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const translated = data?.responseData?.translatedText;
    if (!translated || data.responseStatus >= 400) throw new Error('empty translation');
    return translated;
  } catch (err) {
    console.warn('translation failed', err);
    return '(翻译失败,已显示原文) ' + text;
  }
}

function startLegacyEngine() {
  if (!SpeechRecognitionCtor) {
    showEmptyMessage('当前浏览器不支持语音识别,请使用 Chrome 或 Edge 浏览器打开本页面,或在设置中填入 OpenAI API Key 改用云端识别。');
    return false;
  }
  recognition = createRecognition();
  recognition.lang = sourceLangSelect.value;
  recognition.start();
  return true;
}

function stopLegacyEngine() {
  if (recognition) {
    recognition.onend = null;
    try { recognition.stop(); } catch (e) { /* noop */ }
    recognition = null;
  }
}

function pauseLegacyEngine() {
  if (recognition) {
    try { recognition.stop(); } catch (e) { /* noop */ }
  }
}

function resumeLegacyEngine() {
  recognition = createRecognition();
  recognition.lang = sourceLangSelect.value;
  recognition.start();
}

/* =====================================================================
   OPENAI ENGINE: Whisper transcription + GPT-4o-mini translation/summary
   ===================================================================== */

const OPENAI_BASE = 'https://api.openai.com/v1';
const SEGMENT_MS = 3000;

function pickMimeType() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  for (const c of candidates) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(c)) return c;
  }
  return '';
}

function recordSegment(stream, ms, mimeType) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let recorder;
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch (err) {
      reject(err);
      return;
    }
    currentRecorder = recorder;
    recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType || 'audio/webm' }));
    recorder.onerror = (e) => reject(e.error || new Error('recorder error'));
    recorder.start();
    setTimeout(() => {
      if (recorder.state !== 'inactive') recorder.stop();
    }, ms);
  });
}

let openaiFatalError = false;

async function segmentLoop(stream, mimeType) {
  segmentLoopActive = true;
  let consecutiveFailures = 0;
  while (isRecording && activeEngine === 'openai' && !isPaused && !openaiFatalError) {
    let blob;
    try {
      blob = await recordSegment(stream, SEGMENT_MS, mimeType);
      consecutiveFailures = 0;
    } catch (err) {
      // MediaRecorder can transiently fail to start right after a pause/resume
      // (the previous recorder hasn't fully released the stream yet). A single
      // failure shouldn't permanently kill the rest of the session — retry with
      // a short backoff, and only give up after repeated failures.
      console.error('segment recording failed', err);
      consecutiveFailures++;
      if (consecutiveFailures >= 5) {
        showEmptyMessage('录音组件连续多次启动失败,已停止录制。请检查麦克风是否被其他程序占用后重试。');
        stopRecording();
        break;
      }
      await new Promise((r) => setTimeout(r, 400));
      continue;
    }
    if (!isRecording || activeEngine !== 'openai' || openaiFatalError) break;
    if (blob.size > 1000) {
      processSegment(blob).catch((err) => console.error('segment processing failed', err));
    }
  }
  segmentLoopActive = false;
}

// Fixed-length chunking cuts sentences mid-thought at segment boundaries, which
// made translations of isolated chunks read as choppy/inaccurate even though
// each chunk was translated "correctly" in isolation. Carrying a short window
// of recent original text as context — into both the Whisper prompt and the
// translation call — lets continuations read naturally without re-sending
// full transcript history on every request.
function recentOriginalContext(maxChars) {
  return transcriptEntries.map((e) => e.original).join(' ').slice(-maxChars);
}

async function processSegment(blob) {
  const langHint = speechLangToShort(sourceLangSelect.value);
  const context = recentOriginalContext(300);
  const text = await transcribeWithOpenAI(blob, langHint, context);
  if (!text || !text.trim()) return;
  const original = text.trim();
  const entry = { time: formatDuration(currentElapsedMs()), original, translated: '翻译中…' };
  transcriptEntries.push(entry);
  const row = createTranscriptRow(entry);
  scheduleAutoSummary();

  try {
    entry.translated = await translateWithOpenAI(original, targetLangLabel(), context);
  } catch (err) {
    console.warn('openai translate failed', err);
    entry.translated = '(翻译失败) ' + original;
  }
  row.querySelector('.entry-translated').textContent = entry.translated;
}

async function transcribeWithOpenAI(blob, langHint, context) {
  const form = new FormData();
  form.append('file', blob, 'segment.webm');
  form.append('model', 'whisper-1');
  if (langHint && langHint !== 'auto') form.append('language', langHint);
  if (context) form.append('prompt', context);

  const res = await fetch(`${OPENAI_BASE}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    await handleOpenAIError(res, '语音识别');
    return '';
  }
  const data = await res.json();
  return data.text || '';
}

async function translateWithOpenAI(text, targetLabel, context) {
  const userContent = context
    ? `上下文(之前说的内容,仅供你理解语意衔接,不要翻译这部分):\n${context}\n\n现在请翻译这一句(只输出这一句的译文):\n${text}`
    : text;
  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: `你是课堂同传翻译引擎,正在连续翻译一段课堂语音的分段文本。把"现在请翻译"部分的原文准确翻译成${targetLabel},` +
            '结合上下文让译文语意通顺、自然衔接,但只输出这一句对应的译文本身,不要输出上下文的翻译,不要添加任何解释、引号或多余内容。',
        },
        { role: 'user', content: userContent },
      ],
    }),
  });
  if (!res.ok) {
    await handleOpenAIError(res, '翻译');
    return text;
  }
  const data = await res.json();
  return (data.choices?.[0]?.message?.content || text).trim();
}

async function handleOpenAIError(res, stage) {
  let detail = '';
  try {
    const data = await res.json();
    detail = data?.error?.message || '';
  } catch (e) { /* noop */ }

  if (res.status === 401) {
    openaiFatalError = true;
    showEmptyMessage(`OpenAI API Key 无效或已过期(${stage}请求返回 401)。请在右上角"设置"中检查 Key。`);
    stopRecording();
  } else if (res.status === 429) {
    openaiFatalError = true;
    showEmptyMessage(`OpenAI 账户额度不足或触发限流(${stage}请求返回 429)。请检查 platform.openai.com 的账户余额/额度设置。`);
    stopRecording();
  } else {
    console.warn(`OpenAI ${stage} error ${res.status}: ${detail}`);
  }
}

function startOpenAIEngine(stream) {
  openaiFatalError = false;
  const mimeType = pickMimeType();
  segmentLoop(stream, mimeType);
  return true;
}

function stopOpenAIEngine() {
  if (currentRecorder && currentRecorder.state !== 'inactive') {
    try { currentRecorder.stop(); } catch (e) { /* noop */ }
  }
  currentRecorder = null;
}

/* =====================================================================
   Summary
   ===================================================================== */

const summaryBody = document.getElementById('summaryBody');
const btnSummarize = document.getElementById('btnSummarize');
const summaryUpdatedLabel = document.getElementById('summaryUpdated');
const summaryLivePulse = document.getElementById('summaryLivePulse');

let lastSummaryResult = null; // { overview, bullets: [{label, detail}] | [string] }

function markSummaryUpdated() {
  const pad = (n) => String(n).padStart(2, '0');
  const d = new Date();
  summaryUpdatedLabel.textContent = `最后更新 ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function normalizeForDedup(s) {
  return s.toLowerCase().replace(/[^a-z0-9一-鿿]/g, '');
}

function generateSummaryLegacy() {
  const sentences = transcriptEntries
    .map((e) => e.original.trim())
    .filter((s) => s.replace(/\s/g, '').length >= 6);

  if (!sentences.length) {
    summaryBody.innerHTML = '<div class="empty-state">暂无足够转写内容用于摘要。</div>';
    return;
  }

  const seen = new Set();
  const bullets = [];
  for (const s of sentences) {
    const key = normalizeForDedup(s);
    if (seen.has(key)) continue;
    seen.add(key);
    bullets.push(s);
  }
  const picked = bullets.slice(-8);
  const overview = `本次课堂已记录 ${transcriptEntries.length} 条转写内容,以下为近期要点摘录(规则摘要,未接入 AI 大模型)。`;
  lastSummaryResult = { overview, bullets: picked };
  markSummaryUpdated();

  summaryBody.innerHTML = `
    <div class="summary-overview">${escapeHtml(overview)}</div>
    <ul class="summary-bullets">
      ${picked.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}
    </ul>`;
}

let isSummarizing = false;
let summaryRerunPending = false;

async function generateSummaryOpenAI() {
  const fullText = transcriptEntries.map((e) => e.original).join(' ').slice(-8000);
  if (!fullText.trim()) {
    summaryBody.innerHTML = '<div class="empty-state">暂无足够转写内容用于摘要。</div>';
    return;
  }

  if (isSummarizing) {
    summaryRerunPending = true;
    return;
  }
  isSummarizing = true;
  summaryLivePulse.hidden = false;
  btnSummarize.disabled = true;
  btnSummarize.textContent = '生成中…';
  try {
    const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: '你是课堂笔记助手,根据老师的课堂转写内容生成结构化摘要。用中文输出严格的 JSON,' +
              '格式为 {"overview": "一句话总体概述", "bullets": [{"label": "要点标签(4-8字)", "detail": "要点具体描述,一句话"}]},' +
              '要点数量 4-8 个,不要输出 JSON 以外的任何文字。',
          },
          { role: 'user', content: fullText },
        ],
      }),
    });
    if (!res.ok) {
      await handleOpenAIError(res, 'AI 总结');
      return;
    }
    const data = await res.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
    renderStructuredSummary(parsed);
  } catch (err) {
    console.error('summary generation failed', err);
    summaryBody.innerHTML = '<div class="empty-state">生成总结失败,请稍后重试。</div>';
  } finally {
    btnSummarize.disabled = false;
    btnSummarize.textContent = '生成总结';
    isSummarizing = false;
    summaryLivePulse.hidden = true;
    if (summaryRerunPending) {
      summaryRerunPending = false;
      generateSummaryOpenAI();
    }
  }
}

function renderStructuredSummary(parsed) {
  const overview = parsed.overview || '';
  const bullets = Array.isArray(parsed.bullets) ? parsed.bullets : [];
  lastSummaryResult = { overview, bullets };
  markSummaryUpdated();
  summaryBody.innerHTML = `
    <div class="summary-overview">${escapeHtml(overview)}</div>
    <ul class="summary-bullets">
      ${bullets.map((b) => `<li><strong>${escapeHtml(b.label || '')}:</strong>&nbsp;${escapeHtml(b.detail || '')}</li>`).join('')}
    </ul>`;
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function generateSummary() {
  return apiKey ? generateSummaryOpenAI() : Promise.resolve(generateSummaryLegacy());
}

// Live-follow: refresh the summary on a fixed cadence while recording, instead
// of only after a pause in speech — a debounce-after-silence approach stalls
// indefinitely when someone talks continuously.
let summaryInterval = null;
let lastSummarizedCount = 0;
const SUMMARY_INTERVAL_MS = 6000;

function scheduleAutoSummary() {
  // New content landed; the running interval below picks it up on its next tick.
}

function startAutoSummaryLoop() {
  lastSummarizedCount = 0;
  clearInterval(summaryInterval);
  summaryInterval = setInterval(() => {
    if (!isRecording || isPaused) return;
    if (transcriptEntries.length === lastSummarizedCount) return;
    lastSummarizedCount = transcriptEntries.length;
    generateSummary();
  }, SUMMARY_INTERVAL_MS);
}

function stopAutoSummaryLoop() {
  clearInterval(summaryInterval);
  summaryInterval = null;
}

btnSummarize.addEventListener('click', generateSummary);

/* =====================================================================
   Recording control (dispatcher)
   ===================================================================== */

async function startRecording() {
  const useOpenAI = !!apiKey;
  ensureMicList(); // populate device labels now that a permission prompt is expected

  if (!useOpenAI && !SpeechRecognitionCtor) {
    showEmptyMessage('当前浏览器不支持语音识别,请使用 Chrome 或 Edge 打开本页面,或在设置中填入 OpenAI API Key 改用云端识别。');
    return;
  }
  if (useOpenAI && !window.MediaRecorder) {
    showEmptyMessage('当前浏览器不支持 MediaRecorder,无法使用 OpenAI 云端识别。请使用较新版本的 Chrome / Edge。');
    return;
  }

  try {
    const constraints = micSelect.value ? { audio: { deviceId: { exact: micSelect.value } } } : { audio: true };
    mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    showEmptyMessage('无法打开麦克风,请检查浏览器权限或设备连接。');
    console.error(err);
    return;
  }

  audioCtx = new AudioContext();
  const source = audioCtx.createMediaStreamSource(mediaStream);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  drawWaveform();

  activeEngine = useOpenAI ? 'openai' : 'legacy';
  isRecording = true;
  isPaused = false;
  elapsedBeforePause = 0;
  startTimer();
  startAutoSummaryLoop();

  if (useOpenAI) {
    startOpenAIEngine(mediaStream);
  } else {
    const ok = startLegacyEngine();
    if (!ok) {
      stopRecording();
      return;
    }
  }

  btnRecordToggle.classList.add('active');
  btnEnd.classList.add('recording');
  btnEndLabel.textContent = '结束录制';
  btnPause.disabled = false;
  sourceLangSelect.disabled = true;
  micSelect.disabled = true;
}

function stopRecording() {
  isRecording = false;
  isPaused = false;
  stopAutoSummaryLoop();

  if (activeEngine === 'legacy') stopLegacyEngine();
  if (activeEngine === 'openai') stopOpenAIEngine();
  activeEngine = null;

  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
  if (audioCtx) {
    audioCtx.close();
    audioCtx = null;
  }
  analyser = null;
  stopWaveform();
  stopTimer();
  renderInterim('');

  btnRecordToggle.classList.remove('active');
  btnEnd.classList.remove('recording');
  btnEndLabel.textContent = '开始录制';
  pauseLabel.textContent = '暂停';
  btnPause.classList.remove('active');
  btnPause.disabled = true;
  sourceLangSelect.disabled = false;
  micSelect.disabled = false;
}

btnRecordToggle.addEventListener('click', () => {
  if (isRecording) stopRecording();
  else startRecording();
});

btnPause.addEventListener('click', () => {
  if (!isRecording) return;
  if (!isPaused) {
    isPaused = true;
    pauseTimer();
    if (activeEngine === 'legacy') pauseLegacyEngine();
    if (activeEngine === 'openai') stopOpenAIEngine();
    stopWaveform();
    pauseLabel.textContent = '继续';
    btnPause.classList.add('active');
  } else {
    isPaused = false;
    startTimer();
    if (activeEngine === 'legacy') resumeLegacyEngine();
    if (activeEngine === 'openai') startOpenAIEngine(mediaStream);
    if (analyser) drawWaveform();
    pauseLabel.textContent = '暂停';
    btnPause.classList.remove('active');
  }
});

/* =====================================================================
   Toast + local save (browser downloads — no filesystem access on the web)
   ===================================================================== */

const toastEl = document.getElementById('toast');
let toastTimer = null;

function showToast(message, durationMs = 4000) {
  clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.hidden = false;
  toastEl.classList.remove('toast-hide');
  toastTimer = setTimeout(() => {
    toastEl.classList.add('toast-hide');
    setTimeout(() => { toastEl.hidden = true; }, 250);
  }, durationMs);
}

function buildSessionMarkdown() {
  const engineLabel = apiKey ? 'OpenAI 云端(Whisper + GPT-4o-mini)' : '浏览器内置免费识别';
  const srcLabel = SPEECH_LANGS.find((l) => l.code === sourceLangSelect.value)?.label || sourceLangSelect.value;
  const lines = [];
  lines.push(`# 课堂记录 ${sessionTitle.textContent}`);
  lines.push('');
  lines.push(`- 时长:${timerLabel.textContent}`);
  lines.push(`- 说话人语言 → 翻译语言:${srcLabel} → ${targetLangLabel()}`);
  lines.push(`- 识别引擎:${engineLabel}`);
  lines.push('');
  lines.push('## AI 总结');
  lines.push('');
  if (lastSummaryResult) {
    lines.push(lastSummaryResult.overview || '');
    lines.push('');
    for (const b of lastSummaryResult.bullets) {
      if (typeof b === 'string') lines.push(`- ${b}`);
      else lines.push(`- **${b.label || ''}**:${b.detail || ''}`);
    }
  } else {
    lines.push('(未生成总结)');
  }
  lines.push('');
  lines.push('## 转写与翻译');
  lines.push('');
  for (const e of transcriptEntries) {
    lines.push(`**[${e.time}]** ${e.original}`);
    lines.push(`> ${e.translated}`);
    lines.push('');
  }
  return lines.join('\n');
}

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function saveSessionToDisk() {
  if (!transcriptEntries.length) return;
  const fileBase = sessionTitle.textContent.replace(/[: ]/g, '-');
  const markdown = buildSessionMarkdown();
  const json = {
    title: sessionTitle.textContent,
    duration: timerLabel.textContent,
    sourceLang: sourceLangSelect.value,
    targetLang: targetLangSelect.value,
    engine: apiKey ? 'openai' : 'legacy',
    summary: lastSummaryResult,
    entries: transcriptEntries,
  };
  if (saveDirHandle) {
    try {
      let perm = await saveDirHandle.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') perm = await saveDirHandle.requestPermission({ mode: 'readwrite' });
      if (perm === 'granted') {
        await writeToDirHandle(`${fileBase}.md`, markdown);
        await writeToDirHandle(`${fileBase}.json`, JSON.stringify(json, null, 2));
        showToast(`已保存到 "${saveDirHandle.name}" 文件夹(.md 和 .json 各一份)`);
        return;
      }
      showToast('保存文件夹权限已失效,改为下载到默认"下载"文件夹。');
    } catch (err) {
      console.error('write to save dir failed, falling back to download', err);
    }
  }
  try {
    downloadFile(`${fileBase}.md`, markdown, 'text/markdown');
    downloadFile(`${fileBase}.json`, JSON.stringify(json, null, 2), 'application/json');
    showToast('已下载到本地"下载"文件夹(.md 和 .json 各一份)');
  } catch (err) {
    console.error('save session failed', err);
    showToast('下载失败,请检查浏览器下载权限设置。');
  }
}

async function writeToDirHandle(filename, content) {
  const fileHandle = await saveDirHandle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

/* ---------- Save confirmation (asks before downloading) ---------- */
const saveConfirmOverlay = document.getElementById('saveConfirmOverlay');
const saveConfirmSummary = document.getElementById('saveConfirmSummary');
const btnCloseSaveConfirm = document.getElementById('btnCloseSaveConfirm');
const btnSkipSave = document.getElementById('btnSkipSave');
const btnConfirmSave = document.getElementById('btnConfirmSave');

function openSaveConfirm() {
  const summaryNote = lastSummaryResult ? ',已生成 AI 总结' : '';
  saveConfirmSummary.textContent = `本次录制共 ${transcriptEntries.length} 条转写记录${summaryNote}。是否下载为 .md / .json 文件到本地?`;
  saveConfirmOverlay.hidden = false;
}
function closeSaveConfirm() {
  saveConfirmOverlay.hidden = true;
}

btnCloseSaveConfirm.addEventListener('click', closeSaveConfirm);
btnSkipSave.addEventListener('click', closeSaveConfirm);
saveConfirmOverlay.addEventListener('click', (e) => {
  if (e.target === saveConfirmOverlay) closeSaveConfirm();
});
btnConfirmSave.addEventListener('click', async () => {
  await saveSessionToDisk();
  closeSaveConfirm();
});

btnEnd.addEventListener('click', async () => {
  if (isRecording) {
    stopRecording();
    await generateSummary();
    if (transcriptEntries.length) openSaveConfirm();
  } else {
    startRecording();
  }
});

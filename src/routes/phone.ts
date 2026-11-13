import { Hono } from 'hono'
import { normalizeNigerianPhone } from '../lib/phone'
import { createSupabaseClient } from '../lib/supabase'
import type { Bindings } from '../types/env'
import { USSD_SERVICE_CODE } from './ussd'

const USSD_TBA_DIAL = `${USSD_SERVICE_CODE.slice(0, -1)}*101#`

export const phoneRoutes = new Hono<{ Bindings: Bindings }>()

phoneRoutes.get('/incoming', async (c) => {
  const raw = c.req.query('phone')?.trim() ?? ''
  if (!raw) return c.json({ call: null })

  let phone: string
  try {
    phone = normalizeNigerianPhone(raw)
  } catch {
    return c.json({ error: 'Invalid phone number' }, 400)
  }

  const supabase = createSupabaseClient(c.env)
  const { data, error } = await supabase
    .from('call_logs')
    .select('*')
    .eq('phone_number', phone)
    .in('status', ['queued', 'ringing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return c.json({ error: error.message }, 500)
  return c.json({ call: data })
})

export function phonePage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <title>CradleDial Handset</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Nunito:wght@700;800&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: { savannah: '#2E8B57', terracotta: '#CD5C5C', trust: '#1E3A8A' },
          fontFamily: { display: ['Nunito', 'sans-serif'], body: ['Inter', 'sans-serif'] }
        }
      }
    }
  </script>
</head>
<body class="min-h-screen bg-slate-950 font-body text-white">
  <div class="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 py-4">
    <label class="text-xs font-semibold tracking-wide text-emerald-200">Your Phone Number (SIM):
      <input id="sim" inputmode="tel" autocomplete="tel" class="mt-1 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-base text-white" placeholder="0803...">
    </label>

    <div class="mt-4 grid grid-cols-1 gap-2">
      <button id="pill-mother" type="button" class="rounded-full bg-savannah px-4 py-3 text-sm font-extrabold">${USSD_SERVICE_CODE} (Mother USSD)</button>
      <button id="pill-tba" type="button" class="rounded-full bg-trust px-4 py-3 text-sm font-extrabold">${USSD_TBA_DIAL} (TBA Agent 101)</button>
    </div>

    <p id="dial" class="mt-5 min-h-14 rounded-2xl bg-slate-900 px-4 py-3 text-center font-display text-2xl tracking-wide"> </p>
    <p id="dial-status" class="mt-2 min-h-5 text-center text-sm text-emerald-200"></p>
    <button id="receive-ivr" type="button" class="mt-3 w-full rounded-2xl bg-trust py-3 text-sm font-extrabold">Receive My Weekly IVR Call Now</button>

    <div id="keys" class="mt-4 grid grid-cols-3 gap-3">
      <button type="button" data-key="1" class="h-16 rounded-full bg-slate-800 text-2xl font-bold">1</button>
      <button type="button" data-key="2" class="h-16 rounded-full bg-slate-800 text-2xl font-bold">2</button>
      <button type="button" data-key="3" class="h-16 rounded-full bg-slate-800 text-2xl font-bold">3</button>
      <button type="button" data-key="4" class="h-16 rounded-full bg-slate-800 text-2xl font-bold">4</button>
      <button type="button" data-key="5" class="h-16 rounded-full bg-slate-800 text-2xl font-bold">5</button>
      <button type="button" data-key="6" class="h-16 rounded-full bg-slate-800 text-2xl font-bold">6</button>
      <button type="button" data-key="7" class="h-16 rounded-full bg-slate-800 text-2xl font-bold">7</button>
      <button type="button" data-key="8" class="h-16 rounded-full bg-slate-800 text-2xl font-bold">8</button>
      <button type="button" data-key="9" class="h-16 rounded-full bg-slate-800 text-2xl font-bold">9</button>
      <button type="button" data-key="*" class="h-16 rounded-full bg-slate-800 text-2xl font-bold">*</button>
      <button type="button" data-key="0" class="h-16 rounded-full bg-slate-800 text-2xl font-bold">0</button>
      <button type="button" data-key="#" class="h-16 rounded-full bg-slate-800 text-2xl font-bold">#</button>
    </div>
    <div class="mt-3 grid grid-cols-4 gap-3">
      <button id="back" type="button" class="col-span-1 h-14 rounded-full bg-slate-800 text-lg font-bold">⌫</button>
      <button id="dial-btn" type="button" class="col-span-3 h-14 rounded-full bg-savannah text-lg font-extrabold">CALL / DIAL</button>
    </div>
  </div>

  <div id="ussd" class="fixed inset-0 z-40 items-end bg-black/70 p-4 sm:items-center sm:justify-center" style="display:none">
    <div class="w-full max-w-md rounded-3xl bg-white p-5 text-slate-900 shadow-2xl">
      <p id="ussd-running" class="text-sm font-semibold text-slate-500">USSD code running...</p>
      <p id="ussd-text" class="mt-3 whitespace-pre-line font-display text-lg leading-snug"></p>
      <p id="ussd-note" class="mt-2 text-sm text-terracotta"></p>
      <input id="ussd-reply" class="mt-4 hidden w-full rounded-xl border border-slate-300 px-3 py-3 text-base" placeholder="Reply" autocomplete="off">
      <div class="mt-4 grid grid-cols-2 gap-3">
        <button id="ussd-cancel" type="button" class="hidden rounded-2xl bg-slate-200 py-3 font-bold text-slate-800">Cancel</button>
        <button id="ussd-send" type="button" class="hidden rounded-2xl bg-trust py-3 font-bold text-white">Send</button>
        <button id="ussd-ok" type="button" class="hidden rounded-2xl bg-slate-200 py-3 font-bold text-slate-800">OK</button>
        <button id="ussd-test" type="button" class="col-span-2 hidden rounded-2xl bg-savannah py-3 font-extrabold text-white">Test My Weekly IVR Voice Call Now</button>
      </div>
    </div>
  </div>

  <div id="call" class="fixed inset-0 z-50 flex-col items-center justify-between bg-slate-950 px-6 py-10" style="display:none">
    <div class="text-center">
      <p id="call-title" class="font-display text-2xl font-extrabold leading-tight">Incoming Call: CradleDial Maternal Health (${USSD_SERVICE_CODE})</p>
      <p id="call-kind" class="mt-4 text-lg text-emerald-200">Weekly Stage Lesson</p>
      <p id="call-phone" class="mt-3 text-xl font-semibold"></p>
      <p id="call-script" class="mt-3 text-sm text-emerald-100"></p>
      <div id="call-meter" class="mx-auto mt-4 hidden h-8 items-end justify-center gap-1">
        <span class="meter-bar"></span><span class="meter-bar"></span><span class="meter-bar"></span><span class="meter-bar"></span><span class="meter-bar"></span>
      </div>
      <p id="call-timer" class="mt-6 font-display text-6xl font-extrabold tracking-widest">00:00</p>
      <button id="call-replay" type="button" class="mt-4 rounded-full bg-white/10 px-4 py-3 text-sm font-bold">Tap to Unmute / Replay Audio</button>
    </div>
    <div class="grid w-full max-w-sm grid-cols-2 gap-4">
      <button id="call-decline" type="button" class="rounded-full bg-terracotta py-5 text-lg font-extrabold">Decline</button>
      <button id="call-answer" type="button" class="rounded-full bg-savannah py-5 text-lg font-extrabold">Answer</button>
      <button id="call-hangup" type="button" class="col-span-2 hidden rounded-full bg-terracotta py-5 text-lg font-extrabold">End Call</button>
    </div>
    <audio id="ivr-audio-player" preload="auto" class="hidden"></audio>
    <style>
      .meter-bar { display: inline-block; width: 6px; height: 10px; border-radius: 999px; background: #6ee7b7; animation: level 0.8s ease-in-out infinite; }
      .meter-bar:nth-child(2) { animation-delay: 0.1s; }
      .meter-bar:nth-child(3) { animation-delay: 0.2s; }
      .meter-bar:nth-child(4) { animation-delay: 0.3s; }
      .meter-bar:nth-child(5) { animation-delay: 0.4s; }
      @keyframes level { 50% { height: 28px; } }
    </style>
  </div>

  <script>
    const USSD_CODE = ${JSON.stringify(USSD_SERVICE_CODE)};
    const USSD_TBA = ${JSON.stringify(USSD_TBA_DIAL)};
    const SIM_KEY = 'cradledial-sim-phone';
    const seenCallIds = new Set();
    const finishedCallIds = new Set();
    let phoneState = 'idle';
    let ussdSessionId = '';
    let ussdText = '';
    let activeCall = null;
    let callSessionId = '';
    let callStartedAt = 0;
    let clipFinished = false;
    let timerHandle = 0;
    let audioCtx = null;
    let ringTimer = 0;

    const simInput = document.getElementById('sim');
    const dial = document.getElementById('dial');
    const fromQuery = new URLSearchParams(location.search).get('phone');
    if (fromQuery) {
      simInput.value = fromQuery;
      localStorage.setItem(SIM_KEY, fromQuery.trim());
    } else {
      simInput.value = localStorage.getItem(SIM_KEY) || '';
    }
    simInput.addEventListener('change', function () {
      localStorage.setItem(SIM_KEY, simInput.value.trim());
    });

    function normalizeSim(input) {
      const compact = String(input || '').trim().replace(/[\\s\\-()]/g, '');
      const digits = compact.charAt(0) === '+' ? compact.slice(1) : compact;
      let national = '';
      if (digits.indexOf('234') === 0 && digits.length === 13) national = digits.slice(3);
      else if (digits.charAt(0) === '0' && digits.length === 11) national = digits.slice(1);
      else if (digits.length === 10) national = digits;
      if (!/^[1-9]\\d{9}$/.test(national)) return '';
      return '+234' + national;
    }

    function simPhone() {
      const value = simInput.value.trim();
      if (value) localStorage.setItem(SIM_KEY, value);
      return normalizeSim(value);
    }

    function lessonPath(call) {
      const audioUrl = call && (call.audio_url || call.audioUrl);
      if (audioUrl) {
        try {
          const url = new URL(audioUrl, location.origin);
          if (url.origin === location.origin && url.pathname.indexOf('/audio/') === 0) return url.pathname;
        } catch (error) {}
      }
      const language = (call && call.language) || 'english';
      const week = (call && call.gestation_week) || 16;
      return '/audio/' + language + '/week_' + week + '.wav';
    }

    function lessonLabel(call) {
      const language = call && call.language ? call.language.charAt(0).toUpperCase() + call.language.slice(1) : 'Lesson';
      const week = call && call.gestation_week ? ' · Week ' + call.gestation_week : '';
      return language + week;
    }

    function ussdInputFromDial(dialString) {
      const trimmed = String(dialString || '').trim();
      const prefix = USSD_CODE.slice(0, -1);
      if (trimmed === USSD_CODE || trimmed === prefix) return '';
      if (trimmed.indexOf(prefix + '*') === 0) {
        const rest = trimmed.slice(prefix.length + 1);
        return rest.endsWith('#') ? rest.slice(0, -1) : rest;
      }
      return '';
    }

    function showUssd(mode, text) {
      const panel = document.getElementById('ussd');
      panel.style.display = 'flex';
      document.getElementById('ussd-text').textContent = text || '';
      document.getElementById('ussd-note').textContent = '';
      const reply = document.getElementById('ussd-reply');
      const running = document.getElementById('ussd-running');
      const pairs = {
        running: mode === 'running',
        reply: mode === 'con',
        send: mode === 'con',
        cancel: mode === 'con',
        ok: mode === 'end',
        test: mode === 'end'
      };
      running.classList.toggle('hidden', !pairs.running);
      reply.classList.toggle('hidden', !pairs.reply);
      document.getElementById('ussd-send').classList.toggle('hidden', !pairs.send);
      document.getElementById('ussd-cancel').classList.toggle('hidden', !pairs.cancel);
      document.getElementById('ussd-ok').classList.toggle('hidden', !pairs.ok);
      document.getElementById('ussd-test').classList.toggle('hidden', !pairs.test);
      if (mode === 'con') {
        reply.value = '';
        reply.focus();
      }
    }

    function hideUssd() {
      const panel = document.getElementById('ussd');
      panel.style.display = 'none';
      ussdSessionId = '';
      ussdText = '';
    }

    async function postUssd() {
      const body = new URLSearchParams({
        sessionId: ussdSessionId,
        phoneNumber: simPhone(),
        serviceCode: USSD_CODE,
        text: ussdText
      });
      const response = await fetch('/webhooks/ussd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body
      });
      const message = await response.text();
      const ended = message.indexOf('END ') === 0;
      const continued = message.indexOf('CON ') === 0;
      const display = ended || continued ? message.slice(4) : message;
      showUssd(ended ? 'end' : 'con', display);
    }

    async function startUssd(dialString) {
      const phone = simPhone();
      if (!phone) {
        document.getElementById('dial-status').textContent = 'Enter your SIM number first.';
        simInput.focus();
        return;
      }
      unlockAudio();
      const value = String(dialString || '').trim() || USSD_CODE;
      dial.textContent = value;
      ussdSessionId = 'ussd-' + crypto.randomUUID();
      ussdText = ussdInputFromDial(value);
      showUssd('running', '');
      try {
        await postUssd();
      } catch (error) {
        showUssd('end', error.message);
      }
    }

    document.getElementById('keys').addEventListener('click', function (event) {
      const key = event.target.getAttribute('data-key');
      if (!key) return;
      unlockAudio();
      const current = dial.textContent.trim();
      dial.textContent = current + key;
    });
    document.getElementById('back').addEventListener('click', function () {
      const current = dial.textContent.trim();
      dial.textContent = current.slice(0, -1);
    });
    document.getElementById('dial-btn').addEventListener('click', function () {
      startUssd(dial.textContent.trim());
    });
    document.getElementById('pill-mother').addEventListener('click', function () {
      startUssd(USSD_CODE);
    });
    document.getElementById('pill-tba').addEventListener('click', function () {
      startUssd(USSD_TBA);
    });
    document.getElementById('ussd-send').addEventListener('click', async function () {
      if (!ussdSessionId) return;
      const reply = document.getElementById('ussd-reply').value.trim();
      if (!reply) return;
      ussdText = ussdText ? ussdText + '*' + reply : reply;
      showUssd('running', '');
      try {
        await postUssd();
      } catch (error) {
        showUssd('end', error.message);
      }
    });
    document.getElementById('ussd-reply').addEventListener('keydown', function (event) {
      if (event.key === 'Enter') document.getElementById('ussd-send').click();
    });
    document.getElementById('ussd-cancel').addEventListener('click', hideUssd);
    document.getElementById('ussd-ok').addEventListener('click', hideUssd);
    document.getElementById('ussd-test').addEventListener('click', testWeeklyCall);
    document.getElementById('receive-ivr').addEventListener('click', testWeeklyCall);

    async function testWeeklyCall() {
      const phone = simPhone();
      const onUssd = document.getElementById('ussd').style.display === 'flex';
      const note = onUssd ? document.getElementById('ussd-note') : document.getElementById('dial-status');
      if (!phone) {
        note.textContent = 'Enter a valid SIM number like 0803...';
        simInput.focus();
        return;
      }
      note.textContent = 'Queuing your lesson...';
      try {
        const response = await fetch('/api/calls/trigger-weekly', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phoneNumber: phone })
        });
        const data = await response.json();
        if (!response.ok) {
          note.textContent = data.error || 'Could not queue the lesson.';
          return;
        }
        const item = data.calls && data.calls[0];
        const call = item && item.callLog;
        if (!call) {
          note.textContent = 'No enrolled mother for this SIM yet.';
          return;
        }
        if (item.callLogId) call.id = item.callLogId;
        if (item.audioUrl) call.audio_url = item.audioUrl;
        hideUssd();
        beginRing(call);
      } catch (error) {
        note.textContent = error.message;
      }
    }

    function clock(seconds) {
      const safe = Math.max(0, seconds);
      const minutes = String(Math.floor(safe / 60)).padStart(2, '0');
      const rest = String(safe % 60).padStart(2, '0');
      return minutes + ':' + rest;
    }

    function unlockAudio() {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtx) audioCtx = new Ctx();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }

    function startRing() {
      stopRing();
      if (navigator.vibrate) navigator.vibrate([400, 200, 400]);
      unlockAudio();
      function pulse() {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;
        [440, 480].forEach(function (frequency) {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.frequency.value = frequency;
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          gain.gain.setValueAtTime(0.0001, now);
          gain.gain.exponentialRampToValueAtTime(0.05, now + 0.05);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
          osc.start(now);
          osc.stop(now + 0.4);
        });
      }
      pulse();
      ringTimer = window.setInterval(function () {
        if (navigator.vibrate) navigator.vibrate([400, 200, 400]);
        pulse();
      }, 2000);
    }

    function stopRing() {
      window.clearInterval(ringTimer);
      ringTimer = 0;
      if (navigator.vibrate) navigator.vibrate(0);
    }

    function beginRing(call) {
      if (!call) return;
      if (phoneState === 'incoming' || phoneState === 'connected' || phoneState === 'ending') return;
      if (call.id && (seenCallIds.has(call.id) || finishedCallIds.has(call.id))) return;
      if (call.id) seenCallIds.add(call.id);
      activeCall = call;
      phoneState = 'incoming';
      callSessionId = '';
      document.getElementById('call-title').textContent = 'Incoming Call: CradleDial Maternal Health (' + USSD_CODE + ')';
      document.getElementById('call-kind').textContent = call.call_type === 'emergency_broadcast' ? 'Ward 4 Emergency Broadcast' : 'Weekly Stage Lesson';
      document.getElementById('call-script').textContent = lessonLabel(call);
      document.getElementById('call-phone').textContent = call.phone_number || simPhone();
      document.getElementById('call-meter').style.display = 'none';
      document.getElementById('call-replay').classList.add('hidden');
      document.getElementById('call-timer').textContent = '00:00';
      document.getElementById('call-answer').disabled = false;
      document.getElementById('call-answer').classList.remove('hidden');
      document.getElementById('call-decline').classList.remove('hidden');
      document.getElementById('call-hangup').classList.add('hidden');
      document.getElementById('call-hangup').disabled = true;
      const screen = document.getElementById('call');
      screen.style.display = 'flex';
      startRing();
    }

    function hideCall() {
      document.getElementById('call').style.display = 'none';
    }

    async function postVoice(fields) {
      const response = await fetch('/webhooks/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(fields)
      });
      return response.text();
    }

    function playLesson(src) {
      const player = document.getElementById('ivr-audio-player');
      player.src = src;
      const played = player.play();
      if (played && played.catch) {
        played.catch(function () {
          document.getElementById('call-replay').classList.remove('hidden');
        });
      }
      return player;
    }

    document.getElementById('call-answer').addEventListener('click', function () {
      if (phoneState !== 'incoming' || !activeCall) return;
      stopRing();
      const player = playLesson(lessonPath(activeCall));
      player.onerror = function () {
        if (player.getAttribute('data-fallback') === '1') return;
        player.setAttribute('data-fallback', '1');
        playLesson('/audio/english/week_16.wav');
      };
      player.onended = function () {
        finishCall();
      };
      phoneState = 'connected';
      document.getElementById('call-answer').classList.add('hidden');
      document.getElementById('call-decline').classList.add('hidden');
      document.getElementById('call-hangup').classList.remove('hidden');
      document.getElementById('call-replay').classList.remove('hidden');
      document.getElementById('call-meter').style.display = 'flex';
      document.getElementById('call-title').textContent = 'Connected';
      document.getElementById('call-script').textContent = lessonLabel(activeCall);
      callSessionId = 'phone-' + crypto.randomUUID();
      callStartedAt = Date.now();
      document.getElementById('call-timer').textContent = '00:01';
      timerHandle = window.setInterval(function () {
        const elapsed = Math.max(1, Math.floor((Date.now() - callStartedAt) / 1000));
        document.getElementById('call-timer').textContent = clock(elapsed);
      }, 250);
      const phone = simPhone();
      postVoice({
        isActive: '1',
        sessionId: callSessionId,
        destinationNumber: phone,
        callerNumber: phone,
        direction: 'Outbound'
      }).catch(function (error) {
        document.getElementById('call-kind').textContent = error.message;
      });
    });

    document.getElementById('call-replay').addEventListener('click', function () {
      const player = document.getElementById('ivr-audio-player');
      if (!player.src) playLesson(activeCall ? lessonPath(activeCall) : '/audio/english/week_16.wav');
      else player.play();
    });

    async function finishCall() {
      if (phoneState !== 'connected' || !activeCall) return;
      phoneState = 'ending';
      window.clearInterval(timerHandle);
      const player = document.getElementById('ivr-audio-player');
      player.onended = null;
      player.pause();
      const elapsed = Math.max(1, Math.round((Date.now() - callStartedAt) / 1000));
      const duration = Math.max(20, elapsed);
      const finishedId = activeCall.id;
      try {
        await postVoice({
          isActive: '0',
          sessionId: callSessionId,
          destinationNumber: simPhone(),
          callerNumber: simPhone(),
          direction: 'Outbound',
          durationInSeconds: String(duration)
        });
      } catch (error) {
        document.getElementById('dial-status').textContent = error.message;
      }
      if (finishedId) finishedCallIds.add(finishedId);
      activeCall = null;
      phoneState = 'idle';
      hideCall();
    }

    document.getElementById('call-hangup').addEventListener('click', function () {
      finishCall();
    });

    document.getElementById('call-decline').addEventListener('click', async function () {
      if (phoneState !== 'incoming' || !activeCall) return;
      stopRing();
      phoneState = 'ending';
      const finishedId = activeCall.id;
      try {
        await postVoice({
          isActive: '0',
          sessionId: 'phone-' + crypto.randomUUID(),
          destinationNumber: simPhone(),
          callerNumber: simPhone(),
          direction: 'Outbound',
          durationInSeconds: '1'
        });
      } catch (error) {
        document.getElementById('dial-status').textContent = error.message;
      }
      if (finishedId) finishedCallIds.add(finishedId);
      activeCall = null;
      phoneState = 'idle';
      hideCall();
    });

    window.setInterval(async function () {
      if (phoneState === 'incoming' || phoneState === 'connected' || phoneState === 'ending') return;
      const phone = simPhone();
      if (!phone) return;
      try {
        const response = await fetch('/api/phone/incoming?phone=' + encodeURIComponent(phone));
        if (!response.ok) return;
        const data = await response.json();
        const call = data.call;
        if (!call || !call.id || seenCallIds.has(call.id) || finishedCallIds.has(call.id)) return;
        beginRing(call);
      } catch (error) {
        return;
      }
    }, 2000);

    document.addEventListener('pointerdown', unlockAudio);
  </script>
</body>
</html>`
}

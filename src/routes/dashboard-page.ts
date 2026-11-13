import { USSD_SERVICE_CODE } from './ussd'

const USSD_TBA_DIAL = `${USSD_SERVICE_CODE.slice(0, -1)}*101#`

export function dashboardPage(audioUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CradleDial | Project 774 LGA Maternal Health Command Center</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Nunito:wght@700;800&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            savannah: '#2E8B57',
            terracotta: '#CD5C5C',
            trust: '#1E3A8A'
          },
          fontFamily: {
            display: ['Nunito', 'sans-serif'],
            body: ['Inter', 'sans-serif']
          }
        }
      }
    }
  </script>
</head>
<body class="bg-stone-50 font-body text-slate-800">
  <header class="bg-trust text-white border-b-8 border-savannah">
    <div class="max-w-7xl mx-auto px-6 py-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="font-display text-3xl md:text-4xl font-extrabold tracking-tight">CradleDial | Project 774 LGA Maternal Health Command Center</h1>
        <p class="mt-2 text-emerald-100 text-lg">"Dialing Life into the Last Mile" — Zero-Internet USSD (${USSD_SERVICE_CODE}) &amp; Automated Dialect IVR</p>
      </div>
      <div class="flex items-center gap-3 bg-white/10 rounded-full px-4 py-2">
        <span id="pulse" class="h-3 w-3 rounded-full bg-savannah animate-pulse"></span>
        <div>
          <p class="text-sm font-semibold">Live connection</p>
          <p id="refreshed" class="text-xs text-emerald-100">Auto-refreshing every 3s</p>
        </div>
      </div>
    </div>
  </header>

  <main class="max-w-7xl mx-auto px-6 py-8 space-y-8">
    <section class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
      <article class="bg-white rounded-2xl shadow-sm p-5 border-t-4 border-savannah">
        <p class="text-sm text-slate-500">Expectant Mothers Enrolled</p>
        <p id="kpi-mothers" class="font-display text-4xl text-savannah mt-2">–</p>
      </article>
      <article class="bg-white rounded-2xl shadow-sm p-5 border-t-4 border-trust">
        <p class="text-sm text-slate-500">Active TBA Onboarding Agents</p>
        <p id="kpi-tbas" class="font-display text-4xl text-trust mt-2">–</p>
      </article>
      <article class="bg-white rounded-2xl shadow-sm p-5 border-t-4 border-savannah">
        <p class="text-sm text-slate-500">Verified IVR Lessons Listened</p>
        <p id="kpi-calls" class="font-display text-4xl text-savannah mt-2">–</p>
      </article>
      <article class="bg-white rounded-2xl shadow-sm p-5 border-t-4 border-terracotta">
        <p class="text-sm text-slate-500">TBA Micro-Commissions Paid in ₦</p>
        <p id="kpi-airtime" class="font-display text-4xl text-terracotta mt-2">–</p>
      </article>
      <article class="bg-white rounded-2xl shadow-sm p-5 border-t-4 border-trust">
        <p class="text-sm text-slate-500">Emergency Ward Broadcasts Sent</p>
        <p id="kpi-broadcasts" class="font-display text-4xl text-trust mt-2">–</p>
      </article>
    </section>

    <section class="bg-white rounded-3xl shadow-sm border-4 border-terracotta p-6">
      <h2 class="font-display text-2xl text-terracotta">Emergency Broadcast Override</h2>
      <p class="text-slate-600 mt-1">Send the Ward 4 cholera warning to every active mother, or add the phone in your hand for the live stage ring.</p>
      <div class="grid md:grid-cols-3 gap-4 mt-5">
        <label class="block text-sm font-semibold">Ward
          <select id="ward" class="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3">
            <option>Ward 4 (Rural Cluster)</option>
            <option>All Wards</option>
          </select>
        </label>
        <label class="block text-sm font-semibold md:col-span-2">Alert preset
          <select id="alert" class="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3">
            <option>Cholera Outbreak — Boil Drinking Water (Audio: ward4_cholera.wav)</option>
          </select>
        </label>
        <label class="block text-sm font-semibold md:col-span-2">Live Stage Phone Number Override (+234...)
          <input id="stage-phone" class="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3" placeholder="+2348012345678">
        </label>
        <div class="flex items-end">
          <audio id="preview" controls class="w-full" src=${JSON.stringify(audioUrl)}></audio>
        </div>
      </div>
      <button id="broadcast-btn" class="mt-5 w-full md:w-auto bg-terracotta hover:bg-red-700 text-white font-display text-xl font-extrabold rounded-2xl px-8 py-4">TRIGGER EMERGENCY VOICE BROADCAST</button>
      <p id="broadcast-status" class="mt-3 text-sm text-slate-600"></p>
    </section>

    <section class="bg-white rounded-3xl shadow-sm p-6 flex flex-wrap gap-3 items-center">
      <h2 class="font-display text-xl mr-auto">Live Stage Controls</h2>
      <button id="weekly-btn" class="bg-savannah text-white font-semibold rounded-xl px-5 py-3">Trigger Tuesday Weekly IVR Call</button>
      <button id="simulate-btn" class="bg-trust text-white font-semibold rounded-xl px-5 py-3">Simulate +1 Completed Call (25s)</button>
      <p id="action-status" class="w-full text-sm text-slate-600"></p>
    </section>

    <section class="bg-white rounded-3xl shadow-sm overflow-hidden">
      <div class="px-6 py-4 border-b"><h2 class="font-display text-2xl">Enrolled Mothers &amp; Gestation Tracker</h2></div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-stone-100 text-left"><tr>
            <th class="px-4 py-3">Phone</th><th class="px-4 py-3">Dialect</th><th class="px-4 py-3">Month &amp; Week</th>
            <th class="px-4 py-3">Linked TBA</th><th class="px-4 py-3">IVR Progress</th><th class="px-4 py-3"></th>
          </tr></thead>
          <tbody id="mothers-body"></tbody>
        </table>
      </div>
    </section>

    <section class="bg-white rounded-3xl shadow-sm overflow-hidden">
      <div class="px-6 py-4 border-b"><h2 class="font-display text-2xl">TBA Agent Leaderboard &amp; Airtime Payout Ledger</h2></div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-stone-100 text-left"><tr>
            <th class="px-4 py-3">Agent</th><th class="px-4 py-3">Code</th><th class="px-4 py-3">Mothers onboarded</th>
            <th class="px-4 py-3">Naira earned</th><th class="px-4 py-3">Recent Africa's Talking IDs</th>
          </tr></thead>
          <tbody id="tbas-body"></tbody>
        </table>
      </div>
    </section>

    <section class="bg-white rounded-3xl shadow-sm overflow-hidden">
      <div class="px-6 py-4 border-b"><h2 class="font-display text-2xl">Live Telecom Activity Feed</h2></div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-stone-100 text-left"><tr>
            <th class="px-4 py-3">When</th><th class="px-4 py-3">Phone</th><th class="px-4 py-3">Type</th>
            <th class="px-4 py-3">Status</th><th class="px-4 py-3">Duration</th><th class="px-4 py-3">Language</th>
          </tr></thead>
          <tbody id="activity-body"></tbody>
        </table>
      </div>
    </section>
  </main>

  <aside id="nokia" class="fixed bottom-4 right-4 z-50 w-96 max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] overflow-y-auto rounded-[2.5rem] bg-slate-900 text-white shadow-2xl border-8 border-slate-700 p-4">
    <p class="text-center text-[11px] tracking-[0.25em] text-slate-400 font-semibold">NOKIA TOUCHLIGHT</p>
    <div class="mt-3 rounded-2xl bg-emerald-950 text-emerald-100 p-4 min-h-44 font-display">
      <p id="nokia-title" class="text-lg font-extrabold leading-tight">CradleDial</p>
      <p id="nokia-line" class="mt-2 text-sm whitespace-pre-line">Waiting for a call from the LGA command center.</p>
      <p id="nokia-phone" class="mt-3 font-semibold"></p>
      <p id="nokia-dialect" class="text-sm"></p>
      <p id="nokia-timer" class="mt-3 text-3xl font-extrabold tracking-widest">00:00</p>
    </div>
    <label class="mt-3 block text-[11px] font-semibold tracking-wide text-slate-400">USSD dial
      <input id="ussd-dial" value="${USSD_SERVICE_CODE}" class="mt-1 w-full rounded-xl bg-slate-800 px-3 py-2 text-sm text-white">
    </label>
    <div class="mt-2 grid grid-cols-1 gap-2">
      <button id="ussd-mother" type="button" class="rounded-xl bg-savannah px-2 py-2 text-xs font-extrabold text-white">Dial ${USSD_SERVICE_CODE} (Mother)</button>
      <button id="ussd-tba" type="button" class="rounded-xl bg-trust px-2 py-2 text-xs font-extrabold text-white">Dial ${USSD_TBA_DIAL} (TBA 101)</button>
    </div>
    <form id="ussd-reply-form" class="mt-2 flex gap-2">
      <input id="ussd-reply" class="min-w-0 flex-1 rounded-xl bg-slate-800 px-3 py-2 text-sm text-white" placeholder="Menu reply" autocomplete="off">
      <button type="submit" class="rounded-xl bg-slate-600 px-3 text-xs font-bold text-white">Send</button>
    </form>
    <div class="mt-4 grid grid-cols-2 gap-3">
      <button id="nokia-answer" class="rounded-2xl bg-savannah text-white font-extrabold py-3" disabled>Answer Call</button>
      <button id="nokia-end" class="rounded-2xl bg-terracotta text-white font-extrabold py-3" disabled>End Call</button>
    </div>
    <audio id="nokia-player" class="hidden"></audio>
  </aside>

  <script>
    const ADMIN_KEY = 'cradledial2026';
    const USSD_CODE = ${JSON.stringify(USSD_SERVICE_CODE)};
    const USSD_TBA_DIAL = ${JSON.stringify(USSD_TBA_DIAL)};
    let selectedPhone = '';
    let latestPayouts = [];

    function naira(value) {
      return '₦' + Number(value || 0).toLocaleString('en-NG');
    }

    function badge(language) {
      const label = language ? language.charAt(0).toUpperCase() + language.slice(1) : 'Unknown';
      return '<span class="inline-block rounded-full bg-emerald-50 text-savannah px-3 py-1 font-semibold">' + label + '</span>';
    }

    function progress(mother) {
      const listened = Math.min(3, Number(mother.completed_ivr_weeks) || 0);
      const paid = mother.tba_commission_paid === true;
      const label = paid ? '3/3 — ₦50 Paid!' : listened + '/3';
      const width = paid ? 100 : Math.round((listened / 3) * 100);
      const color = paid ? 'bg-terracotta' : 'bg-savannah';
      return '<div class="min-w-36"><div class="h-2 rounded-full bg-slate-200"><div class="' + color + ' h-2 rounded-full" style="width:' + width + '%"></div></div><p class="mt-1 font-semibold">' + label + '</p></div>';
    }

    function rowPhone(phone) {
      return '<button class="text-trust font-semibold underline" data-phone="' + phone + '">' + phone + '</button>';
    }

    function render(stats) {
      latestPayouts = stats.airtimePayouts || [];
      document.getElementById('kpi-mothers').textContent = stats.totalMothers;
      document.getElementById('kpi-tbas').textContent = stats.activeTbas;
      document.getElementById('kpi-calls').textContent = stats.completedIvrCalls;
      document.getElementById('kpi-airtime').textContent = naira(stats.totalAirtimeDisbursedNaira);
      document.getElementById('kpi-broadcasts').textContent = stats.totalEmergencyBroadcasts;
      document.getElementById('refreshed').textContent = 'Auto-refreshing every 3s · ' + new Date().toLocaleTimeString();

      document.getElementById('mothers-body').innerHTML = (stats.mothers || []).map(function (mother) {
        const tba = mother.tba_full_name ? mother.tba_full_name + ' (' + (mother.tba_agent_code || '') + ')' : 'Self-registered';
        const selected = mother.phone_number === selectedPhone ? ' bg-emerald-50' : '';
        return '<tr class="' + selected + ' border-t"><td class="px-4 py-3">' + rowPhone(mother.phone_number) + '</td><td class="px-4 py-3">' + badge(mother.language) + '</td><td class="px-4 py-3">Month ' + mother.pregnancy_month + ' · Week ' + mother.gestation_week + '</td><td class="px-4 py-3">' + tba + '</td><td class="px-4 py-3">' + progress(mother) + '</td><td class="px-4 py-3"><button class="select-mother rounded-lg bg-trust text-white px-3 py-2" data-phone="' + mother.phone_number + '">Use for stage</button></td></tr>';
      }).join('') || '<tr><td class="px-4 py-6 text-slate-500" colspan="6">No mothers enrolled yet.</td></tr>';

      document.getElementById('tbas-body').innerHTML = (stats.tbas || []).map(function (tba) {
        const ids = latestPayouts.filter(function (payout) { return payout.tba_id === tba.id && payout.at_transaction_id; }).map(function (payout) { return payout.at_transaction_id; });
        return '<tr class="border-t"><td class="px-4 py-3 font-semibold">' + tba.full_name + '</td><td class="px-4 py-3">Code: ' + tba.agent_code + '</td><td class="px-4 py-3">' + tba.total_onboarded + '</td><td class="px-4 py-3">' + naira(tba.total_commission_earned) + '</td><td class="px-4 py-3">' + (ids.join(', ') || '—') + '</td></tr>';
      }).join('') || '<tr><td class="px-4 py-6 text-slate-500" colspan="5">No TBA agents yet.</td></tr>';

      const calls = (stats.callLogs || []).map(function (log) {
        return '<tr class="border-t"><td class="px-4 py-3">' + new Date(log.created_at).toLocaleString() + '</td><td class="px-4 py-3">' + log.phone_number + '</td><td class="px-4 py-3">' + log.call_type + '</td><td class="px-4 py-3">' + log.status + '</td><td class="px-4 py-3">' + (log.duration_seconds || 0) + 's</td><td class="px-4 py-3">' + (log.language || '') + '</td></tr>';
      });
      const broadcasts = (stats.emergencyBroadcasts || []).map(function (item) {
        return '<tr class="border-t bg-red-50"><td class="px-4 py-3">' + new Date(item.created_at).toLocaleString() + '</td><td class="px-4 py-3">' + item.ward + '</td><td class="px-4 py-3">emergency broadcast</td><td class="px-4 py-3">' + item.recipients_count + ' recipients</td><td class="px-4 py-3">—</td><td class="px-4 py-3">' + item.alert_title + '</td></tr>';
      });
      document.getElementById('activity-body').innerHTML = calls.concat(broadcasts).join('') || '<tr><td class="px-4 py-6 text-slate-500" colspan="6">No calls yet.</td></tr>';
    }

    async function refresh() {
      const response = await fetch('/api/dashboard/stats');
      if (!response.ok) return;
      render(await response.json());
    }

    function chosenPhone() {
      const typed = document.getElementById('stage-phone').value.trim();
      if (typed) return typed;
      if (selectedPhone) return selectedPhone;
      const entered = window.prompt('Enter the mother\\'s phone number (+234...)');
      return entered ? entered.trim() : '';
    }

    async function postJson(path, payload) {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Request failed');
      return data;
    }

    document.body.addEventListener('click', function (event) {
      const button = event.target.closest('[data-phone]');
      if (!button) return;
      selectedPhone = button.getAttribute('data-phone') || '';
      document.getElementById('action-status').textContent = 'Selected ' + selectedPhone;
      refresh();
    });

    document.getElementById('weekly-btn').addEventListener('click', async function () {
      const phone = chosenPhone();
      if (!phone) return;
      document.getElementById('action-status').textContent = 'Calling Tuesday lesson for ' + phone + '...';
      try {
        const data = await postJson('/api/cron/run-weekly', { phoneNumber: phone, adminKey: ADMIN_KEY });
        document.getElementById('action-status').textContent = 'Weekly lesson queued for ' + ((data.lessons && data.lessons[0] && data.lessons[0].phoneNumber) || phone) + '.';
        refresh();
      } catch (error) {
        document.getElementById('action-status').textContent = error.message;
      }
    });

    document.getElementById('simulate-btn').addEventListener('click', async function () {
      const phone = chosenPhone();
      if (!phone) return;
      document.getElementById('action-status').textContent = 'Recording a 25-second lesson for ' + phone + '...';
      try {
        const data = await postJson('/api/dashboard/simulate-call-complete', { phoneNumber: phone, adminKey: ADMIN_KEY });
        const weeks = data.mother ? data.mother.completed_ivr_weeks : '';
        document.getElementById('action-status').textContent = 'Lesson counted. Progress is now ' + weeks + '/3.';
        refresh();
      } catch (error) {
        document.getElementById('action-status').textContent = error.message;
      }
    });

    document.getElementById('broadcast-btn').addEventListener('click', async function () {
      const status = document.getElementById('broadcast-status');
      status.textContent = 'Dispatching the Ward alert...';
      try {
        const data = await postJson('/api/dashboard/broadcast', {
          ward: document.getElementById('ward').value,
          alertTitle: 'Cholera Outbreak Alert - Boil Drinking Water',
          targetPhone: document.getElementById('stage-phone').value.trim(),
          adminKey: ADMIN_KEY
        });
        status.textContent = 'Broadcast sent to ' + data.dispatched + ' phone' + (data.dispatched === 1 ? '' : 's') + '.';
        refresh();
      } catch (error) {
        status.textContent = error.message;
      }
    });

    const pageOpenedAt = Date.now();
    const seenCallIds = new Set();
    const finishedCallIds = new Set();
    let callsPrimed = false;
    let ringingCall = null;
    let phoneState = 'idle';
    let callStartedAt = 0;
    let callSessionId = '';
    let clipFinished = false;
    let timerHandle = 0;

    function clock(seconds) {
      const safe = Math.max(0, seconds);
      const minutes = String(Math.floor(safe / 60)).padStart(2, '0');
      const rest = String(safe % 60).padStart(2, '0');
      return minutes + ':' + rest;
    }

    function setPhone(title, line, phone, dialect, timer) {
      document.getElementById('nokia-title').textContent = title;
      document.getElementById('nokia-line').textContent = line;
      document.getElementById('nokia-phone').textContent = phone || '';
      document.getElementById('nokia-dialect').textContent = dialect || '';
      document.getElementById('nokia-timer').textContent = timer;
    }

    function watchCalls(logs) {
      const open = (logs || []).filter(function (log) {
        return (log.status === 'queued' || log.status === 'ringing') && !finishedCallIds.has(log.id);
      });
      if (!callsPrimed) {
        open.forEach(function (log) {
          if (new Date(log.created_at).getTime() < pageOpenedAt - 2000) seenCallIds.add(log.id);
        });
        callsPrimed = true;
      }
      if (phoneState !== 'idle') return;
      const fresh = open.filter(function (log) { return !seenCallIds.has(log.id); });
      fresh.sort(function (a, b) { return String(a.created_at).localeCompare(String(b.created_at)); });
      if (!fresh.length) return;
      ringingCall = fresh[0];
      seenCallIds.add(ringingCall.id);
      phoneState = 'incoming';
      const dialect = ringingCall.language ? ringingCall.language.charAt(0).toUpperCase() + ringingCall.language.slice(1) : '';
      setPhone('Incoming Call', 'CradleDial Maternal Health', ringingCall.phone_number, dialect, '00:00');
      document.getElementById('nokia-answer').disabled = false;
      document.getElementById('nokia-end').disabled = true;
    }

    async function postVoice(fields) {
      const body = new URLSearchParams(fields);
      const response = await fetch('/webhooks/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
      });
      return response.text();
    }

    document.getElementById('nokia-answer').addEventListener('click', async function () {
      if (!ringingCall || phoneState !== 'incoming') return;
      document.getElementById('nokia-answer').disabled = true;
      callSessionId = 'nokia-' + crypto.randomUUID();
      try {
        const xml = await postVoice({
          isActive: '1',
          sessionId: callSessionId,
          destinationNumber: ringingCall.phone_number,
          callerNumber: ringingCall.phone_number,
          direction: 'Outbound'
        });
        const match = xml.match(/<Play url="([^"]+)"/);
        const playUrl = match ? match[1].replace(/&amp;/g, '&') : ringingCall.audio_url;
        const player = document.getElementById('nokia-player');
        clipFinished = false;
        callStartedAt = Date.now();
        phoneState = 'connected';
        setPhone('Connected', 'CradleDial Maternal Health', ringingCall.phone_number, document.getElementById('nokia-dialect').textContent, '00:00');
        document.getElementById('nokia-end').disabled = true;
        timerHandle = window.setInterval(function () {
          const elapsed = Math.floor((Date.now() - callStartedAt) / 1000);
          document.getElementById('nokia-timer').textContent = clock(elapsed);
          if (elapsed >= 15) document.getElementById('nokia-end').disabled = false;
        }, 250);
        player.onended = function () {
          clipFinished = true;
          finishPhoneCall();
        };
        player.pause();
        player.src = '';
        player.load();
        player.src = playUrl;
        await player.play();
      } catch (error) {
        document.getElementById('action-status').textContent = error.message;
        document.getElementById('nokia-answer').disabled = false;
      }
    });

    async function finishPhoneCall() {
      if (!ringingCall || phoneState !== 'connected') return;
      phoneState = 'ending';
      window.clearInterval(timerHandle);
      const player = document.getElementById('nokia-player');
      player.onended = null;
      player.pause();
      const elapsed = Math.max(1, Math.round((Date.now() - callStartedAt) / 1000));
      const duration = clipFinished ? Math.max(20, elapsed) : elapsed;
      const finishedId = ringingCall.id;
      try {
        await postVoice({
          isActive: '0',
          sessionId: callSessionId,
          destinationNumber: ringingCall.phone_number,
          callerNumber: ringingCall.phone_number,
          direction: 'Outbound',
          durationInSeconds: String(duration)
        });
        document.getElementById('action-status').textContent = 'Call ended after ' + duration + ' seconds.';
      } catch (error) {
        document.getElementById('action-status').textContent = error.message;
      }
      finishedCallIds.add(finishedId);
      ringingCall = null;
      phoneState = 'idle';
      setPhone('CradleDial', 'Call ended. Waiting for the next lesson.', '', '', clock(duration));
      document.getElementById('nokia-answer').disabled = true;
      document.getElementById('nokia-end').disabled = true;
      refresh();
    }

    document.getElementById('nokia-end').addEventListener('click', function () {
      finishPhoneCall();
    });

    let ussdSessionId = '';
    let ussdText = '';

    function ussdInputFromDial(dialString) {
      const trimmed = String(dialString || '').trim();
      const prefix = USSD_CODE.slice(0, -1);
      if (trimmed === USSD_CODE || trimmed === prefix) return '';
      if (trimmed.indexOf(prefix + '*') === 0) return trimmed.slice(prefix.length + 1).replace(/#$/, '');
      return '';
    }

    async function postUssd() {
      const stage = document.getElementById('stage-phone').value.trim();
      const body = new URLSearchParams({
        sessionId: ussdSessionId,
        phoneNumber: stage || '+2348030000101',
        serviceCode: USSD_CODE,
        text: ussdText
      });
      try {
        const response = await fetch('/webhooks/ussd', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body
        });
        const message = (await response.text()).replace(/\\r\\n/g, '\\n');
        const ended = message.indexOf('END ') === 0;
        const continued = message.indexOf('CON ') === 0;
        const display = ended || continued ? message.slice(4) : message;
        setPhone(ended ? 'USSD ended' : 'USSD', display, USSD_CODE, ussdText, ended ? 'END' : 'CON');
        if (ended) {
          phoneState = 'idle';
          ussdSessionId = '';
          ussdText = '';
        }
      } catch (error) {
        phoneState = 'idle';
        document.getElementById('action-status').textContent = error.message;
      }
    }

    async function startUssd(dialString) {
      if (phoneState === 'incoming' || phoneState === 'connected' || phoneState === 'ending') return;
      const dial = String(dialString || '').trim() || USSD_CODE;
      document.getElementById('ussd-dial').value = dial;
      ussdSessionId = 'ussd-' + crypto.randomUUID();
      ussdText = ussdInputFromDial(dial);
      phoneState = 'ussd';
      await postUssd();
    }

    document.getElementById('ussd-mother').addEventListener('click', function () {
      startUssd(USSD_CODE);
    });
    document.getElementById('ussd-tba').addEventListener('click', function () {
      startUssd(USSD_TBA_DIAL);
    });
    document.getElementById('ussd-dial').addEventListener('keydown', function (event) {
      if (event.key === 'Enter') startUssd(event.target.value);
    });
    document.getElementById('ussd-reply-form').addEventListener('submit', function (event) {
      event.preventDefault();
      if (phoneState !== 'ussd' || !ussdSessionId) return;
      const reply = document.getElementById('ussd-reply').value.trim();
      if (!reply) return;
      ussdText = ussdText ? ussdText + '*' + reply : reply;
      document.getElementById('ussd-reply').value = '';
      postUssd();
    });

    const originalRender = render;
    render = function (stats) {
      originalRender(stats);
      watchCalls(stats.callLogs);
    };

    refresh();
    setInterval(refresh, 3000);
  </script>
</body>
</html>`
}

import { Midi } from "https://esm.sh/@tonejs/midi@2.0.28";

const VALVE_VID = 0x28de;
const STEAM_CONTROLLER_2026 = 0x1302;
const STEAM_PUCK = 0x1304;
const NOTE_STOP = -1;
const TRITON_REPORT_ID = 0x83;

const midiFrequencyTr = [0, 9, 9, 10, 10, 11, 12, 12, 13, 14, 15, 15, 16, 17, 18, 19, 21, 22, 23, 24, 26, 28, 29, 31, 33, 35, 37, 39, 41, 44, 46, 49, 52, 55, 58, 62, 65, 69, 73, 78, 82, 87, 92, 98, 104, 110, 117, 123, 131, 139, 147, 156, 165, 175, 185, 196, 208, 220, 233, 247, 261, 276, 293, 310, 328, 349, 369, 391, 414, 439, 466, 493, 522, 552, 584, 621, 658, 696, 738, 781, 828, 877, 929, 985, 1043, 1105, 1171, 1240, 1314, 1392, 1475, 1562, 1655, 1754, 1858, 1969, 2085, 2209, 2340, 2480, 2627, 2784, 2949, 3124, 3311, 3507, 3716, 3938, 4173, 4422, 4686, 4965, 5261, 5575, 5907, 6259, 6632, 7027, 7446, 7889, 8359, 8857, 9384, 9943, 10535, 11162, 11827, 12531];
const midiFrequencyRb = [0, 10, 10, 11, 11, 12, 13, 13, 14, 15, 16, 16, 17, 18, 19, 20, 22, 23, 24, 25, 27, 29, 30, 32, 34, 36, 38, 40, 42, 45, 47, 50, 53, 56, 59, 63, 66, 70, 75, 80, 84, 89, 94, 100, 107, 113, 120, 126, 134, 142, 151, 160, 169, 179, 189, 200, 213, 226, 239, 253, 267, 283, 300, 318, 336, 357, 377, 399, 423, 449, 477, 505, 535, 566, 598, 636, 674, 713, 756, 800, 848, 898, 951, 1008, 1068, 1131, 1199, 1270, 1345, 1425, 1510, 1600, 1693, 1792, 1897, 2008, 2125, 2249, 2381, 2521, 2669, 2826, 2992, 3168, 3354, 3552, 3761, 3983, 4218, 4467, 4731, 5010, 5306, 5620, 5952, 6304, 6677, 7072, 7491, 7934, 8404, 8902, 9429, 9988, 10580, 11207, 11872, 12576];

const el = {
  midiFile: document.getElementById("midiFile"),
  playBtn: document.getElementById("playBtn"),
  stopBtn: document.getElementById("stopBtn"),
  connectBtn: document.getElementById("connectBtn"),
  disconnectBtn: document.getElementById("disconnectBtn"),
  midiInfo: document.getElementById("midiInfo"),
  deviceInfo: document.getElementById("deviceInfo"),
  log: document.getElementById("log"),
  intervalMs: document.getElementById("intervalMs"),
  repeatSong: document.getElementById("repeatSong"),
  directVelocity: document.getElementById("directVelocity"),
  tritonLimit: document.getElementById("tritonLimit"),
  tritonSwap: document.getElementById("tritonSwap"),
  noGainCurve: document.getElementById("noGainCurve"),
  gainL: document.getElementById("gainL"),
  gainR: document.getElementById("gainR"),
  gainN: document.getElementById("gainN"),
  gainM: document.getElementById("gainM"),
};

let hidDevice = null;
let outputReportIds = [0];
let playbackTimer = null;
let isPlaying = false;
let midiEvents = [];
let midiDurationSec = 0;
let startTimeSec = 0;
let nextEventIndex = 0;
let activeNoteByChannel = [NOTE_STOP, NOTE_STOP, NOTE_STOP, NOTE_STOP];

let gainCurveTr = new Array(128).fill(0);
let gainCurveRb = new Array(128).fill(0);

function logLine(message) {
  const stamp = new Date().toLocaleTimeString();
  el.log.textContent += `[${stamp}] ${message}\n`;
  el.log.scrollTop = el.log.scrollHeight;
}

function clampInt(value, min, max) {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function gainModifiers() {
  return {
    0: clampInt(Number(el.gainL.value) || 0, -64, 63),
    1: clampInt(Number(el.gainR.value) || 0, -64, 63),
    3: clampInt(Number(el.gainN.value) || 0, -64, 63),
    4: clampInt(Number(el.gainM.value) || 0, -64, 63),
  };
}

function mapTritonHaptic(channel) {
  let haptic = channel ^ 1;
  if (!el.tritonSwap.checked) {
    haptic ^= 2;
  }
  return haptic + (haptic >> 1);
}

function signedToByte(v) {
  return clampInt(v, -128, 127) & 0xff;
}

function collectOutputReportIds(device) {
  const ids = new Set();
  for (const collection of device.collections || []) {
    for (const report of collection.outputReports || []) {
      ids.add(report.reportId);
    }
  }
  // If reportId 0 exists or no report IDs are declared, default to 0.
  if (!ids.size || ids.has(0)) {
    return [0, ...[...ids].filter((id) => id !== 0)];
  }
  return [...ids];
}

function collectFeatureReportIds(device) {
  const ids = new Set();
  for (const collection of device.collections || []) {
    for (const report of collection.featureReports || []) {
      ids.add(report.reportId);
    }
  }
  return [...ids];
}

function logDeviceCollections(device) {
  const lines = [];
  for (const collection of device.collections || []) {
    const outIds = (collection.outputReports || []).map((r) => r.reportId).join(",") || "none";
    const featIds = (collection.featureReports || []).map((r) => r.reportId).join(",") || "none";
    lines.push(`collection usagePage=0x${collection.usagePage.toString(16)} usage=0x${collection.usage?.toString(16) ?? "?"} out=[${outIds}] feat=[${featIds}]`);
  }
  if (lines.length) {
    logLine("Collections HID:");
    for (const l of lines) logLine(`  ${l}`);
  }
}

async function writeOutputReport(data) {
  if (!hidDevice || !hidDevice.opened) return;

  let lastErr = null;
  for (const reportId of outputReportIds) {
    try {
      await hidDevice.sendReport(reportId, data);
      return;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("No usable output report ID");
}

async function loadGainCurves() {
  if (el.noGainCurve.checked) {
    gainCurveTr.fill(0);
    gainCurveRb.fill(0);
    return;
  }
  try {
    const [trText, rbText] = await Promise.all([
      fetch("../gaincurve/Triton_Trackpads.txt").then((r) => r.text()),
      fetch("../gaincurve/Triton_Rumble.txt").then((r) => r.text()),
    ]);
    gainCurveTr = trText.trim().split(/\s+/).slice(0, 128).map((n) => clampInt(Number(n) || 0, -128, 127));
    gainCurveRb = rbText.trim().split(/\s+/).slice(0, 128).map((n) => clampInt(Number(n) || 0, -128, 127));
    if (gainCurveTr.length < 128) gainCurveTr = gainCurveTr.concat(new Array(128 - gainCurveTr.length).fill(0));
    if (gainCurveRb.length < 128) gainCurveRb = gainCurveRb.concat(new Array(128 - gainCurveRb.length).fill(0));
    logLine("Gain curves chargees.");
  } catch (err) {
    gainCurveTr.fill(0);
    gainCurveRb.fill(0);
    logLine(`Gain curves indisponibles (${String(err)}), fallback a 0.`);
  }
}

function buildEventList(midi) {
  const all = [];
  midi.tracks.forEach((track) => {
    track.notes.forEach((note) => {
      const ch = note.channel ?? 0;
      all.push({ t: note.time, ch, type: "on", note: note.midi, vel: Math.round((note.velocity ?? 1) * 127) });
      all.push({ t: note.time + note.duration, ch, type: "off", note: note.midi, vel: 0 });
    });
  });
  all.sort((a, b) => {
    if (a.t !== b.t) return a.t - b.t;
    if (a.ch !== b.ch) return a.ch - b.ch;
    if (a.type === b.type) return 0;
    return a.type === "off" ? -1 : 1;
  });
  return all;
}

async function sendTritonNote(channel, note, velocity) {
  if (!hidDevice || !hidDevice.opened) return;
  const payload = new Uint8Array(63);
  const haptic = mapTritonHaptic(channel);
  if (note === NOTE_STOP) {
    payload[0] = haptic;
    payload[1] = 0x80;
    payload[5] = 0x80;
  } else {
    const freq = haptic > 2 ? midiFrequencyRb[note] : midiFrequencyTr[note];
    const modifiers = gainModifiers();
    const baseGain = haptic > 2 ? gainCurveRb[note] : gainCurveTr[note];
    const gain = el.directVelocity.checked ? Math.round((velocity * 255) / 127) - 128 : baseGain;
    payload[0] = haptic;
    payload[1] = signedToByte(gain + (modifiers[haptic] || 0));
    payload[2] = freq & 0xff;
    payload[3] = (freq >> 8) & 0xff;
    payload[4] = 0xff;
    payload[5] = 0x7f;
  }
  await hidDevice.sendReport(TRITON_REPORT_ID, payload);
}

async function stopAllChannels() {
  for (let ch = 0; ch < 4; ch += 1) {
    await sendTritonNote(ch, NOTE_STOP, 0);
    activeNoteByChannel[ch] = NOTE_STOP;
  }
}

function channelCount() {
  return el.tritonLimit.checked ? 2 : 4;
}

async function schedulerTick() {
  if (!isPlaying) return;
  const tNow = performance.now() / 1000 - startTimeSec;

  while (nextEventIndex < midiEvents.length && midiEvents[nextEventIndex].t <= tNow) {
    const evt = midiEvents[nextEventIndex];
    nextEventIndex += 1;

    if (evt.ch < 0 || evt.ch >= channelCount()) {
      continue;
    }

    if (evt.type === "off") {
      if (activeNoteByChannel[evt.ch] === evt.note) {
        await sendTritonNote(evt.ch, NOTE_STOP, 0);
        activeNoteByChannel[evt.ch] = NOTE_STOP;
      }
    } else {
      if (activeNoteByChannel[evt.ch] !== NOTE_STOP) {
        await sendTritonNote(evt.ch, NOTE_STOP, 0);
      }
      await sendTritonNote(evt.ch, evt.note, evt.vel);
      activeNoteByChannel[evt.ch] = evt.note;
    }
  }

  if (tNow >= midiDurationSec && nextEventIndex >= midiEvents.length) {
    if (el.repeatSong.checked) {
      startTimeSec = performance.now() / 1000;
      nextEventIndex = 0;
      await stopAllChannels();
      logLine("Repeat.");
      return;
    }
    await doStop();
    logLine("Playback termine.");
  }
}

async function doPlay() {
  if (!hidDevice || !hidDevice.opened) {
    logLine("Connecte un device d'abord.");
    return;
  }
  if (!outputReportIds.length || (outputReportIds.length === 1 && outputReportIds[0] === 0)) {
    logLine("Interface HID non ecrivable detectee. Reconnecte en selectionnant le Steam Controller (interface haptique). ");
    return;
  }
  if (!midiEvents.length) {
    logLine("Charge un MIDI d'abord.");
    return;
  }
  await loadGainCurves();
  await stopAllChannels();

  isPlaying = true;
  startTimeSec = performance.now() / 1000;
  nextEventIndex = 0;

  const interval = clampInt(Number(el.intervalMs.value) || 10, 1, 100);
  if (playbackTimer) clearInterval(playbackTimer);
  playbackTimer = setInterval(() => {
    schedulerTick().catch((err) => {
      logLine(`Erreur playback: ${String(err)}`);
      doStop().catch(() => {});
    });
  }, interval);

  el.playBtn.disabled = true;
  el.stopBtn.disabled = false;
  logLine("Playback start.");
}

async function doStop() {
  isPlaying = false;
  if (playbackTimer) {
    clearInterval(playbackTimer);
    playbackTimer = null;
  }
  await stopAllChannels();
  el.playBtn.disabled = !hidDevice || !hidDevice.opened || midiEvents.length === 0;
  el.stopBtn.disabled = true;
}

async function connectDevice() {
  if (!navigator.hid) {
    logLine("WebHID non supporte dans ce contexte.");
    return;
  }

  await navigator.hid.requestDevice({
    filters: [
      { vendorId: VALVE_VID, productId: STEAM_CONTROLLER_2026 },
      { vendorId: VALVE_VID, productId: STEAM_PUCK },
    ],
  });

  const allGranted = await navigator.hid.getDevices();
  const devices = allGranted.filter(
    (d) =>
      d.vendorId === VALVE_VID &&
      (d.productId === STEAM_CONTROLLER_2026 || d.productId === STEAM_PUCK)
  );

  if (!devices.length) {
    logLine("Aucun device selectionne.");
    return;
  }

  // Prefer an interface that exposes output reports in vendor page 0xFF00.
  const ranked = devices
    .map((d) => {
      const outIds = collectOutputReportIds(d);
      const hasVendorCollection = (d.collections || []).some((c) => c.usagePage === 0xff00);
      const has83 = outIds.includes(TRITON_REPORT_ID);
      return {
        device: d,
        outIds,
        hasVendorCollection,
        has83,
      };
    })
    .sort((a, b) => {
      if (a.has83 !== b.has83) return a.has83 ? -1 : 1;
      if (a.hasVendorCollection !== b.hasVendorCollection) return a.hasVendorCollection ? -1 : 1;
      return b.outIds.length - a.outIds.length;
    });

  hidDevice = ranked[0].device;
  await hidDevice.open();

  outputReportIds = collectOutputReportIds(hidDevice);
  const featureReportIds = collectFeatureReportIds(hidDevice);
  logDeviceCollections(hidDevice);
  logLine(`Report IDs sortie detectes: ${outputReportIds.join(", ")}`);
  logLine(`Report IDs feature detectes: ${featureReportIds.join(", ") || "none"}`);

  if (!outputReportIds.length || (outputReportIds.length === 1 && outputReportIds[0] === 0)) {
    logLine("Attention: cette interface n'expose pas de vrais output reports. Essaie de re-cliquer Connecter et selectionner le Steam Controller (pas le Puck). ");
  }

  el.deviceInfo.textContent = `Connecte: ${hidDevice.productName || "Steam device"}`;
  el.disconnectBtn.disabled = false;
  el.playBtn.disabled = midiEvents.length === 0;
  logLine(`Device connecte: ${hidDevice.productName || "Inconnu"}`);
}

async function disconnectDevice() {
  await doStop();
  if (hidDevice?.opened) {
    await hidDevice.close();
  }
  hidDevice = null;
  el.deviceInfo.textContent = "Aucun device connecte.";
  el.disconnectBtn.disabled = true;
  el.playBtn.disabled = true;
  logLine("Device deconnecte.");
}

async function handleMidiFile(file) {
  const arr = await file.arrayBuffer();
  const midi = new Midi(arr);
  midiEvents = buildEventList(midi);
  midiDurationSec = Math.max(0, midi.duration || 0);

  el.midiInfo.textContent = `${file.name} | tracks: ${midi.tracks.length} | events: ${midiEvents.length} | duree: ${midiDurationSec.toFixed(2)}s`;

  if (file.name.includes("_dv")) {
    el.directVelocity.checked = true;
  }

  el.playBtn.disabled = !hidDevice || !hidDevice.opened;
  logLine(`MIDI charge: ${file.name}`);
}

el.connectBtn.addEventListener("click", () => {
  connectDevice().catch((err) => logLine(`Erreur connect: ${String(err)}`));
});
el.disconnectBtn.addEventListener("click", () => {
  disconnectDevice().catch((err) => logLine(`Erreur disconnect: ${String(err)}`));
});
el.playBtn.addEventListener("click", () => {
  doPlay().catch((err) => logLine(`Erreur play: ${String(err)}`));
});
el.stopBtn.addEventListener("click", () => {
  doStop().catch((err) => logLine(`Erreur stop: ${String(err)}`));
});
el.midiFile.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  handleMidiFile(file).catch((err) => logLine(`Erreur MIDI: ${String(err)}`));
});

window.addEventListener("beforeunload", () => {
  if (isPlaying) {
    doStop().catch(() => {});
  }
});

logLine("Pret. Lance un serveur local HTTP/HTTPS pour utiliser WebHID (localhost recommandé).");

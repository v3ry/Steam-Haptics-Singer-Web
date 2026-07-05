import { Midi } from "https://esm.sh/@tonejs/midi@2.0.28";

const VALVE_VID = 0x28de;
const STEAM_CONTROLLER_2026 = 0x1302;
const STEAM_PUCK = 0x1304;
const NOTE_STOP = -1;
const TRITON_REPORT_ID = 0x83;
const APP_VERSION = "v0.3.0";

const midiFrequencyTr = [0, 9, 9, 10, 10, 11, 12, 12, 13, 14, 15, 15, 16, 17, 18, 19, 21, 22, 23, 24, 26, 28, 29, 31, 33, 35, 37, 39, 41, 44, 46, 49, 52, 55, 58, 62, 65, 69, 73, 78, 82, 87, 92, 98, 104, 110, 117, 123, 131, 139, 147, 156, 165, 175, 185, 196, 208, 220, 233, 247, 261, 276, 293, 310, 328, 349, 369, 391, 414, 439, 466, 493, 522, 552, 584, 621, 658, 696, 738, 781, 828, 877, 929, 985, 1043, 1105, 1171, 1240, 1314, 1392, 1475, 1562, 1655, 1754, 1858, 1969, 2085, 2209, 2340, 2480, 2627, 2784, 2949, 3124, 3311, 3507, 3716, 3938, 4173, 4422, 4686, 4965, 5261, 5575, 5907, 6259, 6632, 7027, 7446, 7889, 8359, 8857, 9384, 9943, 10535, 11162, 11827, 12531];
const midiFrequencyRb = [0, 10, 10, 11, 11, 12, 13, 13, 14, 15, 16, 16, 17, 18, 19, 20, 22, 23, 24, 25, 27, 29, 30, 32, 34, 36, 38, 40, 42, 45, 47, 50, 53, 56, 59, 63, 66, 70, 75, 80, 84, 89, 94, 100, 107, 113, 120, 126, 134, 142, 151, 160, 169, 179, 189, 200, 213, 226, 239, 253, 267, 283, 300, 318, 336, 357, 377, 399, 423, 449, 477, 505, 535, 566, 598, 636, 674, 713, 756, 800, 848, 898, 951, 1008, 1068, 1131, 1199, 1270, 1345, 1425, 1510, 1600, 1693, 1792, 1897, 2008, 2125, 2249, 2381, 2521, 2669, 2826, 2992, 3168, 3354, 3552, 3761, 3983, 4218, 4467, 4731, 5010, 5306, 5620, 5952, 6304, 6677, 7072, 7491, 7934, 8404, 8902, 9429, 9988, 10580, 11207, 11872, 12576];

const el = {
  chipConnection: document.getElementById("chipConnection"),
  chipPlayback: document.getElementById("chipPlayback"),
  chipProfile: document.getElementById("chipProfile"),
  presetButtons: Array.from(document.querySelectorAll(".preset-btn")),
  midiFile: document.getElementById("midiFile"),
  filePickBtn: document.getElementById("filePickBtn"),
  filePickName: document.getElementById("filePickName"),
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
  autoOptimizeMidi: document.getElementById("autoOptimizeMidi"),
  dynamicLimiter: document.getElementById("dynamicLimiter"),
  quantizeMs: document.getElementById("quantizeMs"),
  minNoteMs: document.getElementById("minNoteMs"),
  retriggerMs: document.getElementById("retriggerMs"),
  velocityCurve: document.getElementById("velocityCurve"),
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
let activeProfile = "balanced";

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

function setChipState(node, text, modeClass) {
  if (!node) return;
  node.textContent = text;
  node.classList.remove("offline", "online", "idle", "playing", "profile");
  node.classList.add("chip", modeClass);
}

function setProfile(profile) {
  activeProfile = profile;
  for (const btn of el.presetButtons) {
    btn.classList.toggle("active", btn.dataset.preset === profile);
  }
  setChipState(el.chipProfile, `Profile: ${profile[0].toUpperCase()}${profile.slice(1)}`, "profile");
}

function applyPreset(profile) {
  const presets = {
    balanced: { quantizeMs: 0, minNoteMs: 12, retriggerMs: 8, velocityCurve: 100, dynamicLimiter: true },
    clean: { quantizeMs: 2, minNoteMs: 16, retriggerMs: 12, velocityCurve: 90, dynamicLimiter: true },
    punch: { quantizeMs: 0, minNoteMs: 9, retriggerMs: 6, velocityCurve: 130, dynamicLimiter: true },
    smooth: { quantizeMs: 4, minNoteMs: 18, retriggerMs: 14, velocityCurve: 80, dynamicLimiter: true },
  };
  const p = presets[profile] || presets.balanced;
  el.quantizeMs.value = p.quantizeMs;
  el.minNoteMs.value = p.minNoteMs;
  el.retriggerMs.value = p.retriggerMs;
  el.velocityCurve.value = p.velocityCurve;
  el.dynamicLimiter.checked = p.dynamicLimiter;
  setProfile(profile);
  logLine(`Preset applied: ${profile}`);
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

function quantizeTime(seconds, quantizeMs) {
  if (quantizeMs <= 0) return seconds;
  const qSec = quantizeMs / 1000;
  return Math.round(seconds / qSec) * qSec;
}

function playbackOptions() {
  return {
    autoOptimize: !!el.autoOptimizeMidi.checked,
    quantizeMs: clampInt(Number(el.quantizeMs.value) || 0, 0, 100),
    minNoteMs: clampInt(Number(el.minNoteMs.value) || 0, 0, 200),
    retriggerMs: clampInt(Number(el.retriggerMs.value) || 0, 0, 100),
    dynamicLimiter: !!el.dynamicLimiter.checked,
    velocityCurvePct: clampInt(Number(el.velocityCurve.value) || 100, 50, 200),
  };
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
    logLine("HID collections:");
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
    logLine("Gain curves loaded.");
  } catch (err) {
    gainCurveTr.fill(0);
    gainCurveRb.fill(0);
    logLine(`Gain curves unavailable (${String(err)}), fallback to 0.`);
  }
}

function buildEventList(midi) {
  const opts = playbackOptions();
  const all = [];
  midi.tracks.forEach((track) => {
    track.notes.forEach((note) => {
      const ch = note.channel ?? 0;
      const start = quantizeTime(note.time, opts.quantizeMs);
      const minDurSec = opts.minNoteMs / 1000;
      let duration = Math.max(note.duration || 0, minDurSec);
      if (opts.quantizeMs > 0) {
        duration = Math.max(duration, opts.quantizeMs / 1000);
      }
      const end = start + duration;
      all.push({ t: start, ch, type: "on", note: note.midi, vel: Math.round((note.velocity ?? 1) * 127) });
      all.push({ t: end, ch, type: "off", note: note.midi, vel: 0 });
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

function autoOptimizeEventList(inputEvents) {
  const opts = playbackOptions();
  // Keep only channels supported by the app behavior (0..3).
  const events = inputEvents.filter((evt) => evt.ch >= 0 && evt.ch <= 3);
  const out = [];
  const activeByChannel = [NOTE_STOP, NOTE_STOP, NOTE_STOP, NOTE_STOP];
  const lastOnTimeByChannel = [-Infinity, -Infinity, -Infinity, -Infinity];
  const stats = {
    droppedChannels: inputEvents.length - events.length,
    overlapFixes: 0,
    retriggerDrops: 0,
  };

  for (const evt of events) {
    if (evt.type === "on") {
      if ((evt.t - lastOnTimeByChannel[evt.ch]) * 1000 < opts.retriggerMs) {
        stats.retriggerDrops += 1;
        continue;
      }

      const active = activeByChannel[evt.ch];
      // Enforce monophonic playback per channel by inserting a stop event.
      if (active !== NOTE_STOP && active !== evt.note) {
        out.push({ t: evt.t, ch: evt.ch, type: "off", note: active, vel: 0 });
        stats.overlapFixes += 1;
      }
      out.push(evt);
      activeByChannel[evt.ch] = evt.note;
      lastOnTimeByChannel[evt.ch] = evt.t;
      continue;
    }

    if (activeByChannel[evt.ch] === evt.note) {
      out.push(evt);
      activeByChannel[evt.ch] = NOTE_STOP;
    }
  }

  out.sort((a, b) => {
    if (a.t !== b.t) return a.t - b.t;
    if (a.ch !== b.ch) return a.ch - b.ch;
    if (a.type === b.type) return 0;
    return a.type === "off" ? -1 : 1;
  });

  return { events: out, stats };
}

function applyVelocityCurve(velocity, velocityCurvePct) {
  const n = clampInt(velocity, 0, 127) / 127;
  const exponent = 100 / velocityCurvePct;
  return clampInt(Math.round(Math.pow(n, exponent) * 127), 0, 127);
}

function applyDynamicLimiter(gain, freq, enabled) {
  if (!enabled) return clampInt(gain, -128, 127);

  let g = clampInt(gain, -100, 72);
  if (freq < 70) g -= 8;
  else if (freq < 120) g -= 4;
  if (freq > 6500) g -= 6;
  return clampInt(g, -128, 127);
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
    const opts = playbackOptions();
    const curvedVelocity = applyVelocityCurve(velocity, opts.velocityCurvePct);
    let gain = el.directVelocity.checked ? Math.round((curvedVelocity * 255) / 127) - 128 : baseGain;
    gain = applyDynamicLimiter(gain, freq, opts.dynamicLimiter);
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
    logLine("Playback finished.");
  }
}

async function doPlay() {
  if (!hidDevice || !hidDevice.opened) {
    logLine("Connect a device first.");
    return;
  }
  if (!outputReportIds.length || (outputReportIds.length === 1 && outputReportIds[0] === 0)) {
    logLine("Non-writable HID interface detected. Reconnect and select the Steam Controller haptics interface.");
    return;
  }
  if (!midiEvents.length) {
    logLine("Load a MIDI file first.");
    return;
  }
  await loadGainCurves();
  await stopAllChannels();

  isPlaying = true;
  startTimeSec = performance.now() / 1000;
  nextEventIndex = 0;

  const interval = clampInt(Number(el.intervalMs.value) || 10, 1, 100);
  if (playbackTimer) clearInterval(playbackTimer);
  const schedulerStepMs = Math.max(1, Math.min(8, interval));
  playbackTimer = setInterval(() => {
    schedulerTick().catch((err) => {
      logLine(`Play error: ${String(err)}`);
      doStop().catch(() => {});
    });
  }, schedulerStepMs);

  el.playBtn.disabled = true;
  el.stopBtn.disabled = false;
  setChipState(el.chipPlayback, "Playback: Playing", "playing");
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
  setChipState(el.chipPlayback, "Playback: Idle", "idle");
}

async function connectDevice() {
  if (!navigator.hid) {
    logLine("WebHID is not supported in this context.");
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
    logLine("No device selected.");
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
  logLine(`Detected output report IDs: ${outputReportIds.join(", ")}`);
  logLine(`Detected feature report IDs: ${featureReportIds.join(", ") || "none"}`);

  if (!outputReportIds.length || (outputReportIds.length === 1 && outputReportIds[0] === 0)) {
    logLine("Warning: this interface does not expose writable output reports. Click Connect again and pick Steam Controller (not Puck).");
  }

  el.deviceInfo.textContent = `Connected: ${hidDevice.productName || "Steam device"}`;
  el.disconnectBtn.disabled = false;
  el.playBtn.disabled = midiEvents.length === 0;
  setChipState(el.chipConnection, "Device: Online", "online");
  logLine(`Device connected: ${hidDevice.productName || "Unknown"}`);
}

async function disconnectDevice() {
  await doStop();
  if (hidDevice?.opened) {
    await hidDevice.close();
  }
  hidDevice = null;
  el.deviceInfo.textContent = "No device connected.";
  el.disconnectBtn.disabled = true;
  el.playBtn.disabled = true;
  setChipState(el.chipConnection, "Device: Offline", "offline");
  setChipState(el.chipPlayback, "Playback: Idle", "idle");
  logLine("Device disconnected.");
}

async function handleMidiFile(file) {
  const arr = await file.arrayBuffer();
  const midi = new Midi(arr);
  const rawEvents = buildEventList(midi);
  let optimizationStats = null;
  if (el.autoOptimizeMidi.checked) {
    const optimized = autoOptimizeEventList(rawEvents);
    midiEvents = optimized.events;
    optimizationStats = optimized.stats;
  } else {
    midiEvents = rawEvents;
  }
  midiDurationSec = Math.max(0, midi.duration || 0);

  el.midiInfo.textContent = `${file.name} | tracks: ${midi.tracks.length} | events: ${midiEvents.length} | duration: ${midiDurationSec.toFixed(2)}s`;
  el.filePickName.textContent = file.name;

  if (file.name.includes("_dv")) {
    el.directVelocity.checked = true;
  }

  el.playBtn.disabled = !hidDevice || !hidDevice.opened;
  if (el.autoOptimizeMidi.checked) {
    logLine(`MIDI loaded: ${file.name} (auto-optimized)`);
    if (optimizationStats) {
      logLine(
        `Optimization report: dropped-channel-events=${optimizationStats.droppedChannels}, overlap-fixes=${optimizationStats.overlapFixes}, retrigger-drops=${optimizationStats.retriggerDrops}`
      );
    }
  } else {
    logLine(`MIDI loaded: ${file.name}`);
  }
}

el.connectBtn.addEventListener("click", () => {
  connectDevice().catch((err) => logLine(`Connect error: ${String(err)}`));
});
el.filePickBtn.addEventListener("click", () => {
  el.midiFile.click();
});
for (const btn of el.presetButtons) {
  btn.addEventListener("click", () => {
    applyPreset(btn.dataset.preset);
  });
}
el.disconnectBtn.addEventListener("click", () => {
  disconnectDevice().catch((err) => logLine(`Disconnect error: ${String(err)}`));
});
el.playBtn.addEventListener("click", () => {
  doPlay().catch((err) => logLine(`Play error: ${String(err)}`));
});
el.stopBtn.addEventListener("click", () => {
  doStop().catch((err) => logLine(`Stop error: ${String(err)}`));
});
el.midiFile.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  handleMidiFile(file).catch((err) => logLine(`MIDI error: ${String(err)}`));
});

window.addEventListener("beforeunload", () => {
  if (isPlaying) {
    doStop().catch(() => {});
  }
});

setChipState(el.chipConnection, "Device: Offline", "offline");
setChipState(el.chipPlayback, "Playback: Idle", "idle");
setProfile("balanced");

logLine(`Ready. Steam Haptics Singer Web ${APP_VERSION}. Start a local HTTP/HTTPS server to use WebHID (localhost recommended). v3ry3D product build.`);

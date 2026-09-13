import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const root = new URL("..", import.meta.url).pathname;
const film = `${root}apps/web/public/demo/roadstar-demo.mp4`;
const captions = `${root}apps/web/public/demo/roadstar-demo.srt`;
const evidence = `${root}docs/evidence/demo-audio-qc-2026-09-13/verification.json`;

function run(program, args) {
  const result = spawnSync(program, args, { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr);
  return { stdout: result.stdout, stderr: result.stderr };
}

const hash = async (path) => createHash("sha256").update(await readFile(path)).digest("hex");
const probe = JSON.parse(
  run("/usr/bin/ffprobe", [
    "-v", "error",
    "-select_streams", "a:0",
    "-show_entries", "stream=codec_name,sample_rate,channels,channel_layout,duration,bit_rate:format=duration",
    "-of", "json",
    film,
  ]).stdout,
);
assert.equal(probe.streams.length, 1);
const audio = probe.streams[0];
const containerDuration = Number(probe.format.duration);
const audioDuration = Number(audio.duration);
assert.equal(audio.codec_name, "aac");
assert.equal(audio.sample_rate, "48000");
assert.equal(audio.channels, 1);
assert.equal(audio.channel_layout, "mono");
assert.ok(Math.abs(containerDuration - audioDuration) <= 0.05);

const loudnessLog = run("/usr/bin/ffmpeg", [
  "-hide_banner", "-nostats", "-vn", "-i", film,
  "-filter:a", "ebur128=peak=true:framelog=quiet",
  "-f", "null", "-",
]).stderr;
const integrated = Number(loudnessLog.match(/Integrated loudness:[\s\S]*?I:\s*(-?\d+(?:\.\d+)?) LUFS/)?.[1]);
const range = Number(loudnessLog.match(/Loudness range:[\s\S]*?LRA:\s*(\d+(?:\.\d+)?) LU/)?.[1]);
const truePeak = Number(loudnessLog.match(/True peak:[\s\S]*?Peak:\s*(-?\d+(?:\.\d+)?) dBFS/)?.[1]);
assert.ok(Number.isFinite(integrated));
assert.ok(Number.isFinite(range));
assert.ok(Number.isFinite(truePeak));
assert.ok(integrated >= -18 && integrated <= -14, `Integrated loudness ${integrated} LUFS is outside the speech target`);
assert.ok(range <= 8, `Loudness range ${range} LU is too wide for clear narration`);
assert.ok(truePeak <= -1, `True peak ${truePeak} dBFS leaves insufficient headroom`);

const silenceLog = run("/usr/bin/ffmpeg", [
  "-hide_banner", "-nostats", "-vn", "-i", film,
  "-af", "silencedetect=noise=-45dB:d=0.8",
  "-f", "null", "-",
]).stderr;
const silenceStarts = [...silenceLog.matchAll(/silence_start:\s*([\d.]+)/g)].map((match) => Number(match[1]));
const silenceEnds = [...silenceLog.matchAll(/silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/g)]
  .map((match) => ({ endSeconds: Number(match[1]), durationSeconds: Number(match[2]) }));
assert.equal(silenceStarts.length, silenceEnds.length);
assert.deepEqual(silenceEnds, [], "Unexpected narration gap at or above 0.8 seconds");

const audioPacketSha256 = run("/usr/bin/ffmpeg", [
  "-v", "error", "-i", film, "-map", "0:a:0", "-c", "copy",
  "-f", "hash", "-hash", "sha256", "-",
]).stdout.trim().replace("SHA256=", "");
const receipt = {
  verifiedAt: new Date().toISOString(),
  filmSha256: await hash(film),
  captionsSha256: await hash(captions),
  audioPacketSha256,
  probe: {
    codec: audio.codec_name,
    sampleRateHz: Number(audio.sample_rate),
    channels: audio.channels,
    channelLayout: audio.channel_layout,
    bitRate: Number(audio.bit_rate),
    audioDurationSeconds: audioDuration,
    containerDurationSeconds: containerDuration,
  },
  loudness: {
    integratedLufs: integrated,
    loudnessRangeLu: range,
    truePeakDbfs: truePeak,
    acceptedIntegratedRangeLufs: [-18, -14],
    maximumAcceptedRangeLu: 8,
    maximumAcceptedTruePeakDbfs: -1,
  },
  silence: {
    thresholdDbfs: -45,
    minimumReportedDurationSeconds: 0.8,
    intervals: silenceEnds,
  },
  checks: [
    "One AAC-LC mono 48 kHz stream spans the complete four-minute container",
    "Integrated loudness, loudness range and true peak stay inside the declared narration targets",
    "No silence interval at or above 0.8 seconds falls below -45 dBFS",
    "The accepted film, caption and copied AAC packet hashes are retained for release comparison",
  ],
  limits:
    "Signal-level verification cannot detect every pronunciation, pacing, semantic or subjective quality issue. One human end-to-end listen with captions remains required before submission.",
};
await writeFile(evidence, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({
  integratedLufs: integrated,
  loudnessRangeLu: range,
  truePeakDbfs: truePeak,
  silenceIntervals: silenceEnds.length,
  audioDurationSeconds: audioDuration,
}));

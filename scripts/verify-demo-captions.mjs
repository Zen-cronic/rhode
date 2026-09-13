import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const root = new URL("..", import.meta.url).pathname;
const captionsPath = `${root}apps/web/public/demo/roadstar-demo.srt`;
const filmPath = `${root}apps/web/public/demo/roadstar-demo.mp4`;
const evidencePath = `${root}docs/evidence/demo-caption-qc-2026-09-13/verification.json`;

function milliseconds(value) {
  const match = value.match(/^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/);
  assert.ok(match, `Invalid SRT timestamp: ${value}`);
  return (((Number(match[1]) * 60 + Number(match[2])) * 60 + Number(match[3])) * 1000) + Number(match[4]);
}

function parse(source) {
  return source.trim().split(/\r?\n\r?\n/).map((block, position) => {
    const [index, timing, ...lines] = block.split(/\r?\n/);
    assert.equal(Number(index), position + 1);
    const match = timing.match(/^(\S+) --> (\S+)$/);
    assert.ok(match, `Invalid timing for cue ${index}`);
    return { index: Number(index), start: milliseconds(match[1]), end: milliseconds(match[2]), lines };
  });
}

const source = await readFile(captionsPath, "utf8");
const cues = parse(source);
const probe = spawnSync("/usr/bin/ffprobe", [
  "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", filmPath,
], { encoding: "utf8" });
assert.equal(probe.status, 0, probe.stderr);
const filmDurationMilliseconds = Math.round(Number(probe.stdout.trim()) * 1000);
let maximumLineLength = 0;
let maximumCharactersPerSecond = 0;
let maximumGapMilliseconds = cues[0].start;
let captionedMilliseconds = 0;
for (const [position, cue] of cues.entries()) {
  assert.ok(cue.end > cue.start, `Cue ${cue.index} has no duration`);
  assert.ok(cue.lines.length >= 1 && cue.lines.length <= 2, `Cue ${cue.index} exceeds two lines`);
  for (const line of cue.lines) {
    assert.ok(line.trim().length > 0, `Cue ${cue.index} has an empty line`);
    maximumLineLength = Math.max(maximumLineLength, line.length);
    assert.ok(line.length <= 42, `Cue ${cue.index} line exceeds 42 characters`);
  }
  const durationSeconds = (cue.end - cue.start) / 1000;
  const visibleCharacters = cue.lines.join(" ").replace(/\s/g, "").length;
  const charactersPerSecond = visibleCharacters / durationSeconds;
  maximumCharactersPerSecond = Math.max(maximumCharactersPerSecond, charactersPerSecond);
  assert.ok(charactersPerSecond <= 22, `Cue ${cue.index} exceeds 22 characters per second`);
  if (position) {
    const gap = cue.start - cues[position - 1].end;
    assert.ok(gap >= 0, `Cue ${cue.index} overlaps the previous cue`);
    maximumGapMilliseconds = Math.max(maximumGapMilliseconds, gap);
  }
  captionedMilliseconds += cue.end - cue.start;
}
assert.ok(cues.at(-1).end <= filmDurationMilliseconds);
assert.ok(filmDurationMilliseconds - cues.at(-1).end <= 250);
assert.ok(maximumGapMilliseconds <= 250);
const normalizedText = cues.map((cue) => cue.lines.join(" ")).join(" ").replace(/\s+/g, " ").trim();
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const receipt = {
  verifiedAt: new Date().toISOString(),
  captionsSha256: sha256(source),
  normalizedTextSha256: sha256(normalizedText),
  filmDurationSeconds: filmDurationMilliseconds / 1000,
  cueCount: cues.length,
  maximumLinesPerCue: Math.max(...cues.map((cue) => cue.lines.length)),
  maximumLineCharacters: maximumLineLength,
  maximumCharactersPerSecond: Number(maximumCharactersPerSecond.toFixed(3)),
  maximumGapMilliseconds,
  captionCoveragePercent: Number((captionedMilliseconds / filmDurationMilliseconds * 100).toFixed(3)),
  checks: [
    "Cue indexes and timestamps are ordered and non-overlapping",
    "Every cue uses at most two lines and every line is at most 42 characters",
    "Every cue remains at or below 22 visible characters per second",
    "The final cue ends within 250 milliseconds of the film and no inter-cue gap exceeds 250 milliseconds",
    "Normalized caption text is hashed independently from line breaks and numbering",
  ],
  limits:
    "Structural readability verification does not prove word-level audio alignment, correct pronunciation or player-specific rendering. Human playback with captions remains required before submission.",
};
await writeFile(evidencePath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({
  cueCount: receipt.cueCount,
  maximumLineCharacters: receipt.maximumLineCharacters,
  maximumCharactersPerSecond: receipt.maximumCharactersPerSecond,
  maximumGapMilliseconds: receipt.maximumGapMilliseconds,
}));

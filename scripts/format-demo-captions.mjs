import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const root = new URL("..", import.meta.url).pathname;
const sourcePath = `${root}docs/design/demo-source/roadstar-demo-narrated-source.srt`;
const outputPath = `${root}apps/web/public/demo/roadstar-demo.srt`;
const evidencePath = `${root}docs/evidence/demo-caption-qc-2026-09-13/formatting.json`;
const maximumLineCharacters = 42;
const maximumCharactersPerSecond = 22;
const internalGapMilliseconds = 80;
const acceptedSourceSha256 = "f39241c893c0818500e4c498338bbf53002fe75b708a47c856ccfca605e7fedb";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function milliseconds(value) {
  const match = value.match(/^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/);
  assert.ok(match, `Invalid SRT timestamp: ${value}`);
  return (((Number(match[1]) * 60 + Number(match[2])) * 60 + Number(match[3])) * 1000) + Number(match[4]);
}

function timestamp(value) {
  const hours = Math.floor(value / 3_600_000);
  const minutes = Math.floor((value % 3_600_000) / 60_000);
  const seconds = Math.floor((value % 60_000) / 1000);
  const millis = value % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}

function parse(source) {
  return source.trim().split(/\r?\n\r?\n/).map((block) => {
    const [index, timing, ...lines] = block.split(/\r?\n/);
    const match = timing.match(/^(\S+) --> (\S+)$/);
    assert.ok(match, `Invalid timing for cue ${index}`);
    return {
      start: milliseconds(match[1]),
      end: milliseconds(match[2]),
      text: lines.join(" ").replace(/\s+/g, " ").trim(),
    };
  });
}

function wrap(text) {
  const lines = [];
  for (const word of text.split(" ")) {
    assert.ok(word.length <= maximumLineCharacters, `Word exceeds caption line limit: ${word}`);
    const last = lines.at(-1);
    if (!last || last.length + 1 + word.length > maximumLineCharacters) lines.push(word);
    else lines[lines.length - 1] = `${last} ${word}`;
  }
  return lines;
}

function balancedGroups(text) {
  const words = text.split(" ");
  const valid = (start, end) => wrap(words.slice(start, end).join(" ")).length <= 2;
  const minimumGroups = Array(words.length + 1).fill(Number.POSITIVE_INFINITY);
  minimumGroups[words.length] = 0;
  for (let start = words.length - 1; start >= 0; start -= 1) {
    for (let end = start + 1; end <= words.length && valid(start, end); end += 1) {
      minimumGroups[start] = Math.min(minimumGroups[start], 1 + minimumGroups[end]);
    }
  }
  const count = minimumGroups[0];
  assert.ok(Number.isFinite(count));
  const totalCharacters = words.join("").length;
  const target = totalCharacters / count;
  const memo = new Map();
  function solve(start, remaining) {
    if (start === words.length) return remaining === 0 ? { cost: 0, groups: [] } : null;
    if (remaining === 0) return null;
    const key = `${start}:${remaining}`;
    if (memo.has(key)) return memo.get(key);
    let best = null;
    for (let end = start + 1; end <= words.length && valid(start, end); end += 1) {
      if (minimumGroups[end] > remaining - 1) continue;
      const rest = solve(end, remaining - 1);
      if (!rest) continue;
      const groupText = words.slice(start, end).join(" ");
      const characters = groupText.replace(/\s/g, "").length;
      const candidate = {
        cost: (characters - target) ** 2 + rest.cost,
        groups: [wrap(groupText), ...rest.groups],
      };
      if (!best || candidate.cost < best.cost) best = candidate;
    }
    memo.set(key, best);
    return best;
  }
  const result = solve(0, count);
  assert.ok(result);
  return result.groups;
}

const source = await readFile(sourcePath, "utf8");
assert.equal(sha256(source), acceptedSourceSha256, "Caption source is not the accepted narrated sidecar");
const original = parse(source);
const formatted = [];
for (const cue of original) {
  const groups = balancedGroups(cue.text);
  if (groups.length === 1) {
    formatted.push({ start: cue.start, end: cue.end, lines: groups[0] });
    continue;
  }
  const available = cue.end - cue.start - internalGapMilliseconds * (groups.length - 1);
  const weights = groups.map((group) => group.join(" ").replace(/\s/g, "").length);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let contentUsed = 0;
  let weightUsed = 0;
  for (let index = 0; index < groups.length; index += 1) {
    const start = cue.start + contentUsed + internalGapMilliseconds * index;
    weightUsed += weights[index];
    const end = index === groups.length - 1
      ? cue.end
      : cue.start + Math.round(available * weightUsed / totalWeight) + internalGapMilliseconds * index;
    formatted.push({ start, end, lines: groups[index] });
    contentUsed = end - cue.start - internalGapMilliseconds * index;
  }
}
for (let index = 0; index < formatted.length; index += 1) {
  const cue = formatted[index];
  const visibleCharacters = cue.lines.join(" ").replace(/\s/g, "").length;
  const requiredDuration = Math.ceil(visibleCharacters / maximumCharactersPerSecond * 1000);
  if (cue.end - cue.start >= requiredDuration) continue;
  const nextStart = formatted[index + 1]?.start ?? original.at(-1).end;
  const availablePause = nextStart - cue.end;
  cue.end += Math.min(requiredDuration - (cue.end - cue.start), availablePause);
  if (cue.end - cue.start >= requiredDuration) continue;
  const previousEnd = formatted[index - 1]?.end ?? 0;
  const availableLead = cue.start - previousEnd;
  cue.start -= Math.min(requiredDuration - (cue.end - cue.start), availableLead);
}
const originalText = original.map((cue) => cue.text).join(" ").replace(/\s+/g, " ").trim();
const formattedText = formatted.map((cue) => cue.lines.join(" ")).join(" ").replace(/\s+/g, " ").trim();
assert.equal(formattedText, originalText);
const output = formatted.map((cue, index) => [
  String(index + 1),
  `${timestamp(cue.start)} --> ${timestamp(cue.end)}`,
  ...cue.lines,
].join("\n")).join("\n\n") + "\n";
await writeFile(outputPath, output);
const receipt = {
  formattedAt: new Date().toISOString(),
  sourceSha256: sha256(source),
  formattedSha256: sha256(output),
  sourceCueCount: original.length,
  formattedCueCount: formatted.length,
  sourceNormalizedTextSha256: sha256(originalText),
  formattedNormalizedTextSha256: sha256(formattedText),
  normalizedTextPreserved: formattedText === originalText,
  maximumLineCharacters,
  maximumCharactersPerSecond,
};
await writeFile(evidencePath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ originalCues: original.length, formattedCues: formatted.length, maximumLineCharacters, maximumCharactersPerSecond }));

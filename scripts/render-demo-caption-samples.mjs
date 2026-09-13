import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const filmPath = `${root}apps/web/public/demo/roadstar-demo.mp4`;
const captionsPath = `${root}apps/web/public/demo/roadstar-demo.srt`;
const evidenceRoot = `${root}docs/evidence/demo-caption-qc-2026-09-13`;
const contactPath = `${evidenceRoot}/caption-contact-sheet.png`;
const receiptPath = `${evidenceRoot}/visual-samples.json`;
const working = mkdtempSync(join(tmpdir(), "roadstar-caption-samples-"));
const samples = [
  { name: "recovery", seconds: 42 },
  { name: "offline", seconds: 104 },
  { name: "capacity", seconds: 177 },
  { name: "technical", seconds: 210.5 },
  { name: "load-test", seconds: 220.5 },
];
const renderStyle = "FontName=DejaVu Sans,FontSize=12,PrimaryColour=&H00F4F0E8,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=0,Alignment=2,MarginV=24";

function run(arguments_, label) {
  const result = spawnSync("/usr/bin/ffmpeg", arguments_, { encoding: "utf8" });
  assert.equal(result.status, 0, `${label} failed: ${result.stderr}`);
}

try {
  const images = samples.map(({ name, seconds }) => {
    const output = join(working, `${name}.png`);
    run([
      "-hide_banner", "-loglevel", "error", "-y",
      "-ss", String(seconds), "-copyts", "-i", filmPath,
      "-vf", `subtitles=${captionsPath}:force_style='${renderStyle}'`,
      "-frames:v", "1", output,
    ], `caption sample ${name}`);
    return output;
  });

  const inputs = images.flatMap((path) => ["-i", path]);
  run([
    "-hide_banner", "-loglevel", "error", "-y",
    ...inputs,
    "-filter_complex",
    "[0:v]scale=640:360[a];[1:v]scale=640:360[b];[2:v]scale=640:360[c];[3:v]scale=640:360[d];[4:v]scale=640:360[e];[a][b][c][d][e]xstack=inputs=5:layout=0_0|640_0|1280_0|0_360|640_360:fill=black[out]",
    "-map", "[out]", "-frames:v", "1", contactPath,
  ], "caption contact sheet");

  const sha256 = (value) => createHash("sha256").update(value).digest("hex");
  const receipt = {
    renderedAt: new Date().toISOString(),
    captionsSha256: sha256(readFileSync(captionsPath)),
    contactSheetSha256: sha256(readFileSync(contactPath)),
    contactSheetPixels: { width: 1920, height: 720 },
    samples,
    renderStyle,
    checks: [
      "Every sample is decoded from the promoted film with the promoted SRT sidecar",
      "Input seeking preserves media timestamps so the subtitle filter receives the requested absolute time",
      "The contact sheet supports manual checks for wrapping, clipping, contrast, and UI obstruction",
    ],
    limits:
      "Five sampled frames do not prove every cue or browser-native caption renderer. Human end-to-end playback remains required before submission.",
  };
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify({ contactPath, contactSheetSha256: receipt.contactSheetSha256, samples: samples.length }));
} finally {
  rmSync(working, { recursive: true, force: true });
}

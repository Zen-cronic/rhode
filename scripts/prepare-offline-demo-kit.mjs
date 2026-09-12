import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const productRoot = process.cwd();
const submissionRoot = path.resolve(productRoot, "../submission/roadstar");
const kitRoot = path.join(submissionRoot, "offline-demo-kit");
const artifactReceipt = JSON.parse(
  await readFile(path.join(submissionRoot, "current-artifact-verification.json"), "utf8"),
);
const productCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: productRoot,
  encoding: "utf8",
}).trim();
const expected = new Map(
  artifactReceipt.artifacts.map((artifact) => [artifact.name, artifact]),
);
const sources = [
  ["apps/web/public/demo/roadstar-demo.mp4", "roadstar-demo.mp4"],
  ["apps/web/public/demo/roadstar-demo.srt", "roadstar-demo.srt"],
  ["apps/web/public/demo/roadstar-pitch.pdf", "roadstar-pitch.pdf"],
  ["apps/web/public/demo/roadstar-pitch.pptx", "roadstar-pitch.pptx"],
  ["README.md", "PROJECT-README.md"],
  ["docs/scenario-acceptance.md", "SCENARIO-ACCEPTANCE.md"],
  ["docs/cloud-current-demo.md", "HOSTED-RECOVERY-EVIDENCE.md"],
  ["docs/3d-slowdown-comparison.md", "3d-slowdown-comparison.md"],
  ["docs/evidence/3d-slowdown-comparison-2026-09-12/verification.json", "evidence/3d-slowdown-comparison-2026-09-12/verification.json"],
  ["docs/evidence/3d-slowdown-comparison-2026-09-12/comparison-desktop.png", "evidence/3d-slowdown-comparison-2026-09-12/comparison-desktop.png"],
  ["docs/evidence/3d-slowdown-comparison-2026-09-12/slowdown-boundary-desktop.png", "evidence/3d-slowdown-comparison-2026-09-12/slowdown-boundary-desktop.png"],
  ["docs/evidence/3d-slowdown-comparison-2026-09-12/comparison-3d-narrow.png", "evidence/3d-slowdown-comparison-2026-09-12/comparison-3d-narrow.png"],
  ["docs/evidence/3d-slowdown-comparison-2026-09-12/comparison-diagram-narrow.png", "evidence/3d-slowdown-comparison-2026-09-12/comparison-diagram-narrow.png"],
  ["../submission/roadstar/live-presentation-plan.md", "LIVE-PRESENTATION-PLAN.md"],
  ["../submission/roadstar/demo-run-of-show.md", "VIDEO-RUN-OF-SHOW.md"],
];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
await mkdir(kitRoot, { recursive: true });
const files = [];

for (const [sourceName, outputName] of sources) {
  const source = path.resolve(productRoot, sourceName);
  const target = path.join(kitRoot, outputName);
  const bytes = await readFile(source);
  const digest = sha256(bytes);
  const published = expected.get(outputName);
  if (published) {
    assert.equal(bytes.length, published.bytes, `${outputName} byte count changed`);
    assert.equal(digest, published.sha256, `${outputName} hash changed`);
    assert.equal(published.matchesLocal, true, `${outputName} hosted equality is not verified`);
  }
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source, target);
  const copied = await readFile(target);
  assert.equal(sha256(copied), digest, `${outputName} copy hash changed`);
  files.push({
    name: outputName,
    bytes: copied.length,
    sha256: digest,
    hostedByteVerifiedAt: published ? artifactReceipt.verifiedAt : null,
  });
}

const generatedAt = new Date().toISOString();
const startHere = `# RoadStar offline demo kit

Generated ${generatedAt}. This folder contains no login credentials, Firebase configuration, customer workbooks, private simulator checkpoints or source documents.

## Fast fallback

1. Open \`roadstar-pitch.pdf\` for the presentation.
2. Play \`roadstar-demo.mp4\` if the hosted or local application is unavailable. The film is 240.096 seconds; \`roadstar-demo.srt\` contains captions.
3. Use \`LIVE-PRESENTATION-PLAN.md\` for the 10-minute core and five-minute expandable technical section.
4. Use \`SCENARIO-ACCEPTANCE.md\`, \`HOSTED-RECOVERY-EVIDENCE.md\` and \`3d-slowdown-comparison.md\` for judge questions about proof boundaries.

## Application endpoints

- Hosted dispatcher: https://roadstar-web-739889188415.us-central1.run.app
- Local dispatcher on the prepared development laptop: http://localhost:5174
- Private repository: https://github.com/Zen-cronic/roadstar

Judge credentials and private repository invitations must be delivered separately. Do not add credentials to this folder.

## Integrity

Check \`SHA256SUMS.txt\` after copying the folder to removable media or another laptop. The four public media artifacts match the hosted-byte receipt dated ${artifactReceipt.verifiedAt}. This is byte availability evidence; it does not replace human audio review or portal-host acceptance.
`;
await writeFile(path.join(kitRoot, "START-HERE.md"), startHere);
const startBytes = await readFile(path.join(kitRoot, "START-HERE.md"));
files.push({
  name: "START-HERE.md",
  bytes: startBytes.length,
  sha256: sha256(startBytes),
  hostedByteVerifiedAt: null,
});
files.sort((a, b) => a.name.localeCompare(b.name));
await writeFile(
  path.join(kitRoot, "SHA256SUMS.txt"),
  `${files.map((file) => `${file.sha256}  ${file.name}`).join("\n")}\n`,
);
const checksumBytes = await readFile(path.join(kitRoot, "SHA256SUMS.txt"));
files.push({
  name: "SHA256SUMS.txt",
  bytes: checksumBytes.length,
  sha256: sha256(checksumBytes),
  hostedByteVerifiedAt: null,
});
const manifest = {
  generatedAt,
  productCommit,
  artifactReceipt: path.join(submissionRoot, "current-artifact-verification.json"),
  files,
  checks: [
    "Every source file was copied byte-for-byte",
    "MP4, SRT, PDF and PPTX match the current hosted-artifact receipt",
    "No credential, private fixture, customer workbook or source document is included",
    "The kit includes a 10-minute live plan, video run-of-show, current S01-S20 evidence map and matched 3D slowdown proof",
  ],
  limits:
    "Local file preparation only. Copy-media integrity, human film listening, venue playback, portal acceptance and judge access remain separate checks.",
};
await writeFile(
  path.join(kitRoot, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(
  JSON.stringify({ kitRoot, files: files.length + 1, mediaBytes: files.reduce((sum, file) => sum + file.bytes, 0) }),
);

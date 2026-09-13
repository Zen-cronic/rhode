# RoadStar precision-transport deck source

Editable 13-slide PowerPoint, 1280 × 720 authoring canvas, with ten minutes of core narrative (slides 1–11) and five minutes of optional appendix (12–13). All foreground slide text, the five-sheet table and factual relationship diagrams are native editable objects. Screenshots and the original brand illustration are images. Source speaker notes retain the evidence citations and implementation limitations.

## Rebuild

Use the bundled Artifact Tool runtime only. No package installation is required. `run.sh` stages the source into a private build directory, links the existing bundled packages, registers the supplied Manrope fonts and exports a new revision. It also invokes the bundled headless LibreOffice with an isolated profile to make a PDF.

```
DECK_WORK=/tmp/roadstar-pitch-build DECK_REV=review-1 bash run.sh
```

The default runtime lives at `/home/zin-kg/.cache/codex-runtimes/codex-primary-runtime/dependencies`. `RUNTIME_ROOT` may point to another compatible **bundled** runtime. The Presentations skill must be available at the path declared in `deck.mjs`, or that constant must be updated for the host. This source uses `@oai/artifact-tool`; do not substitute a different PowerPoint package. Run the skill's operation-start marker once per new authoring session before rebuilding.

Fonts: Manrope Regular, Medium, SemiBold and Bold from the official Google Fonts family. Original licenses accompany the font files. Install Manrope when editing the PPTX in a desktop application to retain type metrics. The PDF preserves the rendered typography. PowerPoint and Google Slides native rendering were not inspected.

The source uses the sibling product's `apps/web/public/brand/road-sculpture.png` and `roadstar-mark.svg`. These are illustrative brand art and branding, respectively. They are not geographic evidence.

Set `ROADSTAR_ROOT` to the product repository if it differs from the authoring path. Override individual image paths with `DECK_RECOVERY`, `DECK_APPROVAL`, `DECK_MOBILE`, `DECK_BILLING`, `DECK_PLANNING`, and `DECK_COMPARISON`. Use actual captures and preserve meaningful state labels. The first five defaults come from `assets/`; the comparison default uses the verified matched-slowdown evidence capture in the product tree. Do not treat static screenshots as new functional verification.

## Finalization

The builder runs structural package, geometry, native-table and font-policy validation, plus Artifact Tool reimport. `build/validation-<revision>.json` is a private technical receipt. Before delivery inspect every exported slide and the PDF. A validation pass does not establish visual quality or native PowerPoint behavior. New output names preserve previous revisions.

The workbook counts sum to 15,197 (4,031 + 10,479 + 131 + 131 + 425). The native table remains complete and editable. Public captures use synthetic scenarios. Source customer data remains local.

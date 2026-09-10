# RoadStar platform

City dispatch for Southern Ontario: one connected load, assignment, driver and trip record.

Build in progress. This repository currently contains the persistent domain foundation. Dispatcher web, Expo driver clients, routing, separate simulator, workbook import, preview and demo artifacts are subsequent packets. Do not present the current repository as a finished platform.

## Run

Node 24 or newer. `npm install`, `npm test`, `npm run typecheck`, `npm run api`.
API defaults to http://127.0.0.1:4010. Data persists in `data/roadstar.sqlite`.
All initial operational records are explicitly synthetic demo fixtures. Organizer workbook import will remain separate from generated trips and will preserve provenance.

## Boundaries

The HOS screen checks declared planning budgets; it is not a certified ELD or comprehensive legal compliance calculation. Missing evidence blocks automated assignment. Trailer gross capacity is distinct from axle legality; truck/axle clearance must be supplied. Detention requires same-stop arrival and departure evidence; estimates never imply collected revenue. This build uses independent implementations of prior-project integrity concepts, with no carried source code.

## Architecture target

React + TypeScript dispatcher web; Expo/React Native driver Android/iOS with web access; shared TypeScript domain/contracts; Node API with SQLite persistence for a single always-on demo instance; independent simulation process. Road routing and licensed map/satellite access are separate implementation dependencies. Native compilation/device proof and stable preview remain required before completion.

## Event references

- Brief: ../hackathon-agent/hackathons/roadstar-2026/RoadStar_Hackathon_Project_Brief.pdf (resolve via suite workspace; source is not copied into public build).
- https://roadstarhackathon.com/judging — published weights total 95%; no normalization assumed.
- https://roadstarhackathon.devpost.com/rules — 3–5 minute recording, 10–15 minute live presentation.
- https://roadstarhackathon.com/portal/submissions — custom plain-text fields transcribed by operator; this is the submission destination.

# Judge access readiness

`scripts/verify-judge-access-readiness.mjs` opens three independent, storage-empty Chrome contexts against the hosted RoadStar preview. It signs in as the staged dispatcher and both staged drivers, waits for synchronized carrier state, verifies the role-specific navigation boundary at desktop/390px, signs out and confirms the login screen returns.

The verifier fails on any operational API POST, browser error, role-navigation leak or horizontal overflow. Its tracked receipt includes only stable synthetic identifiers, roles, viewport sizes and timings. It does not retain email addresses, passwords, Firebase tokens, browser storage or screenshots.

This establishes that the prepared app credentials work in clean browsers. It does not deliver those credentials, invite a judge to the private repository, inspect the organizer portal or submit the project. Those remain separate operator/external gates.

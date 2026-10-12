# Backend development instructions

Before planning, testing, or changing anything in this repository, read and follow all project rule files in `.agents/rules/nestjs-*.mdc` (paths relative to this file). Those files are the authoritative backend development standards; their stated scope also covers related migrations, generated contracts, and CI work.

The mandatory requirements include test-first red-green-refactor development, explicitly declared models, explicit parameter and return types on every function and callback, feature-owned NestJS modules, validated DTOs, repository boundaries, typed integration adapters, and documented intentional behavior changes. Existing behavior is not automatically a requirement.

These files intentionally live in the user-requested `.agents/rules/` directory. Read their contents as project instructions rather than assuming a tool automatically discovers their glob metadata.

This is an independently installable and deployable repository. Run npm commands here without workspace flags. Do not introduce runtime, build, test, or tooling dependencies on a sibling repository. Frontend browser tests may target an explicitly started backend test fixture; normal frontend checks must run without a backend checkout.

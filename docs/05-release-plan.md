# Release plan

## Stages
| Stage | Audience | Platforms |
|---|---|---|
| Alpha | owner only | CLI + engine on one host |
| Beta | owner + invited testers (no real money for testers) | desktop app, TestFlight, Android internal testing |
| 1.0 personal | owner | Windows, macOS, iOS, Android control apps |
| Public | other people | only after legal review (below) |

## Platform approach (single codebase)
- **Flutter** for Windows, macOS, iOS, Android (ADR-0003).
- Desktop installers: MSIX/MSI (Windows), signed + notarized DMG (macOS).
- Mobile: TestFlight (iOS), Play Console internal track (Android).
- Optional local engine bundled on desktop via PyInstaller sidecar; mobile always uses a remote engine.
- CI builds all targets from tags; version from `pyproject.toml` and `pubspec.yaml` kept in sync.

## Store and regulatory facts to check before public release
- Apple and Google require a developer account (Apple ~USD 99/yr, Google one-time ~USD 25).
- Finance/trading apps get extra review; apps that trade for users need clear risk disclosures.
- Running a bot for your own money is personal use. Offering "automated profit" to the public can
  fall under investment-advice, money-handling or securities rules that differ by country.
  Required before public release: legal opinion for target countries, terms of use, risk
  disclosure, no performance promises in marketing.
- Never present backtest or paper results as expected profit.

## Release checklist (each version)
- [ ] CI green (lint, tests); coverage target met
- [ ] Acceptance criteria for the stage gate documented with evidence
- [ ] CHANGELOG, version tag, release notes
- [ ] Secret scan clean; dependency audit run
- [ ] Rollback plan: previous build kept; engine can halt and flatten
- [ ] Owner sign-off on limits

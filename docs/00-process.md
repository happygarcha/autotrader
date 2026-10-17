# Development process

**Model: incremental Agile (2-week sprints) inside a V-model verification frame.**
Why: the trading logic needs the V-model's traceability (every requirement has a test and a
safety case); the product around it (apps, dashboards) needs Agile's short feedback loops.

## Lifecycle per increment
1. **Requirements** (`01-requirements.md`): numbered, testable (FR-/NFR-/SAF- IDs).
2. **Design** (`02-architecture.md`, ADRs for each major decision).
3. **Implementation**: small PRs, tests first for money-touching code.
4. **Verification** (`03-test-plan.md`): unit -> integration -> backtest validation -> paper.
5. **Release gate** (`05-release-plan.md`): checklist signed off before each stage.
6. **Operate and review**: weekly performance report; retrospective each sprint.

## Stage gates (nothing skips a gate)
| Gate | Entry condition |
|---|---|
| G1 Research | Phase 1 code complete, tests green |
| G2 Paper | A strategy passes the validation criteria in the test plan |
| G3 Live-small | 4-8 weeks paper results match backtest range; owner signs limits |
| G4 Scale | 8+ weeks live results within expected range |
| G5 Public release | Legal review done (see release plan); security audit done |

## Traceability
Each requirement ID appears in at least one test name or docstring and in the PR that
delivers it. The roadmap lists which IDs each sprint closes.

## Roles (solo for now)
Owner (decisions, limits, approvals), Developer/QA (Claude sessions + CI). A second human
reviewer is required before G3 for any change to `risk.py` or order execution.

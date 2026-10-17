# Working agreement
- Trunk-based with short branches; every change via pull request, CI green, one review.
- Tests first for anything touching money, risk limits or order logic.
- Conventional commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
- No secrets in git. `.env` is ignored; keys live in the host's secret store.
- Definition of Done: tests pass, ruff clean, docs and CHANGELOG updated, no new TODO in
  risk or execution code, requirement IDs referenced in the PR.

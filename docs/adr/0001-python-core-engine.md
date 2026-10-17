# ADR-0001: Python for the engine
Status: accepted. Context: research-heavy work (pandas/numpy), many exchange SDKs, fast iteration.
Decision: Python 3.11+ engine. Consequence: not shipped inside mobile apps; engine runs on a host.
Alternatives rejected: Rust/Go (slower research loop, no benefit at daily-bar frequency).

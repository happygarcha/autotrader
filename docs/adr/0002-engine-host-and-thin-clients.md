# ADR-0002: Engine runs on a host; apps are thin clients
Status: accepted. Context: iOS/Android suspend background apps and cannot run a 24/7 bot; storing
exchange keys on phones raises theft risk. Decision: engine on an always-on host; apps display,
control and hold only a revocable token. Consequence: needs a small server; much safer keys.

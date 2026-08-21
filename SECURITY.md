# Security policy

## Reporting a vulnerability

Please do not open a public issue for a security vulnerability. Use GitHub's private vulnerability reporting for this repository. Include the affected version, expected impact, and a minimal reproduction.

## Security model

Side Chat is designed as a read-only child agent. It combines a read-only sandbox, approval policy set to `never`, a model-visible tool allowlist, and an execution-time deny-by-default guard. Unknown tools are denied.

This is a capability boundary, not a data-retention guarantee. DeepSeek Harness 0.1.0-rc.7 does not expose a public API for physical deletion of a persisted session log. Closing a Side Chat removes its live runtime and archives it when the public archive service is available.

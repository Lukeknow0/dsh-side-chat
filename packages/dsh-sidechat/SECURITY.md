# Security policy

## Reporting a vulnerability

Do not open a public issue containing secrets or other users' data. Use GitHub private vulnerability reporting for this repository, and include the affected version, impact and a minimal redacted reproduction.

## v1 prerelease capability model

The v1 rewrite is **not an always-read-only child agent**. It uses the DSH `0.2.0-rc.2` Session Controller fork and Host-backed model, permission and approval services. The old v0.4 fixed tool allowlist and deny-by-default execution guard are not part of this implementation. Review the child's effective permissions and use an appropriately restricted parent/profile for testing. Full-access/automatic presets require explicit risk acknowledgement; the Host remains the policy enforcement authority.

The plugin validates its child ownership before routing prompts, cancellation, model/permission changes, questions and approvals. Upload receipts are scoped to that child. Images may be sent as native image content; do not attach confidential material unless that child's provider and policy are appropriate. An attachment-only send is still a real child prompt.

Choosing a child model does not rewrite the existing parent Session, but the Host may save a successful choice as the default for later unconfigured Sessions. This is not a guarantee that all other configuration defaults remain unchanged.

## Retention and compatibility

Closing a tab does not cancel, archive or delete the child Session. There is no v0.4-style automatic parked expiry and no physical-erasure guarantee. Durable chat history remains Host-managed. Pending uploads/files are memory-only and do not survive browser reloads.

Only exactly DSH `0.2.0-rc.2` is declared compatible. Never bypass its installer compatibility guard. Desktop cold-start and Better Sidebar coexistence are not verified for this prerelease; test in a disposable authenticated profile first, not in an active production profile. The old Side Chat metadata model is not automatically migrated. See the migration guide included with the release.

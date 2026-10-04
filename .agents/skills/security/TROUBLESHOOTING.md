# Security troubleshooting

- IDOR/BOLA: verify denied users/tenants before persistence and require the action
  permission, not merely an object ID.
- SQL/shell interpolation: use parameters or safe argument APIs. Schema checks
  alone do not repair command interpolation.
- SSRF: DNS prechecks followed by ambient fetch can resolve again; verify the
  connection-time transport policy, A/AAAA results, and redirects.
- Untrusted scripts: inspect/isolate without credentials; state actual controls.
- Authority: confirm targets/effects against existing permission instead of
  asking again merely because a phase changed.
- Green scan: inspect enabled flags, staged files, scope input, and exclusions.
  Results do not prove all security invariants or unstaged code.

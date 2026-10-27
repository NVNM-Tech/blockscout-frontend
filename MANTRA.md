# NVNM-Tech fork of blockscout/frontend

Upstream stopped publishing public images after v2.3.5. Releases since then go to the private
`ghcr.io/blockscout/frontend-private`, so `ghcr.io/blockscout/frontend:latest` no longer gets
fixes. This fork rebuilds upstream release tags with MANTRA patches and publishes
`ghcr.io/nvnm-tech/blockscout-frontend`.

## Branches and tags

| Ref | Meaning |
|---|---|
| `main` | Mirror of upstream `main`. Not built. |
| `vX.Y.Z-mantra` (branch) | Upstream tag `vX.Y.Z` + MANTRA patches. Protect it and change it only via PR. |
| `vX.Y.Z-mantra.N` (tag) | Release from that branch → `ghcr.io/nvnm-tech/blockscout-frontend:vX.Y.Z-mantra.N` |

`.github/workflows/mantra-release.yml` runs on `vX.Y.Z-mantra.N` tags. It refuses to build unless the tagged commit
contains upstream `vX.Y.Z` and is on branch `vX.Y.Z-mantra`. `mantra-checks.yml` runs on PRs to and pushes to the branch.

All upstream workflows are removed on `*-mantra` branches. Upstream `pre-release.yml` matches `v1.2.3-<word>*`
tags, so it would otherwise fire on `-mantra.N` tags and try to publish to blockscout's registry and deploy.

## MANTRA patches on v2.12.1

`/node-api/proxy` is already protected upstream in v2.12.1 (#3526, origin allow-list), so the patches here cover the media-type route and CI.

| File | Change |
|---|---|
| `src/server/utils/ssrfGuard.ts` | Blocks loopback, RFC1918, link-local/metadata, CGNAT, ULA and IPv4-mapped/NAT64 destinations, at URL-parse time and at DNS-lookup time |
| `src/server/utils/fetchMediaType.ts` | HEAD request through the guard, with redirects followed manually and every hop re-checked |
| `src/pages/api/tokens/[hash]/instances/[id]/media-type.ts` | Uses the above. The media URL comes from on-chain token metadata. |
| `src/server/utils/*.spec.ts` | Vitest specs |
| `.github/workflows/mantra-*.yml` | NVNM-Tech release and checks |

## Release

```bash
git switch v2.12.1-mantra
git tag -s v2.12.1-mantra.1 -m "v2.12.1-mantra.1"
git push origin refs/heads/v2.12.1-mantra refs/tags/v2.12.1-mantra.1
```

## Moving to a new upstream tag

```bash
git fetch --no-tags https://github.com/blockscout/frontend.git refs/tags/vA.B.C:refs/tags/vA.B.C
git switch -c vA.B.C-mantra vA.B.C
git cherry-pick <MANTRA commits from v2.12.1-mantra>
pnpm install --frozen-lockfile && pnpm lint:tsc && pnpm test:vitest src/server/utils
```

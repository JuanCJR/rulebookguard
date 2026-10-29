# Contributing

## Releasing

Releases are published to npm from GitHub Actions with [trusted publishing](https://docs.npmjs.com/trusted-publishers), so no npm token is stored and every version carries a provenance attestation. To release, bump `version` in `package.json` and in `plugin/.claude-plugin/plugin.json` (a test keeps them equal), merge it to `main`, then push a matching tag:

```sh
git tag v0.1.0
git push origin v0.1.0
```

The `Release` workflow fails without publishing when the tag does not match the package version, or when `vp check`, `vp test` or `vp pack` fails.

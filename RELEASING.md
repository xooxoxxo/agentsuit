# Releasing strongsuit

The pipeline is tag-driven: pushing `v<version>` builds, tests, publishes to npm with provenance, and creates the GitHub release from `RELEASE-NOTES.md`. The tag must match `package.json`'s version or the job refuses.

## One-time setup (before the first release)

1. **npm token** — create a granular automation token on npmjs.com (publish scope) and add it as the `NPM_TOKEN` repository secret. Without it the publish step fails; nothing else runs after it.
2. **Name check** — `npm view strongsuit` must 404. The name locks to the account at first publish.

## Per release

```bash
npm version <version> --no-git-tag-version   # or edit package.json
# update RELEASE-NOTES.md for the version
git commit -am "release: v<version>"
git tag v<version>
git push origin main --tags
```

## Post-publish verification (per XO-145 acceptance)

```bash
# Cold npx on a clean cache — macOS and Windows
npx --ignore-existing -y strongsuit@latest --version   # older npm: clear ~/.npm/_npx first
suit --version    # after npm install -g strongsuit
```

- Windows leg: run the same in a Windows shell (or a windows-latest workflow_dispatch job).
- **Brew tap** (same tap as collective): add a formula to `xooxoxxo/homebrew-tap` wrapping the npm tarball (`url` = registry tarball for the version, `depends_on "node"`, install via `std_npm_args` or `bin.install_symlink`). Then `brew install xooxoxxo/tap/strongsuit` and `suit --version`.

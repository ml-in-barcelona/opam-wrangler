# opam-wrangler

The opam package `wrangler`. It installs
[Wrangler](https://github.com/cloudflare/workers-sdk), the Cloudflare Workers
command line tool, without `npm install`.

## Install

```sh
opam install wrangler
wrangler --version
```

The package installs the `wrangler` command and its `node_modules` in
`lib/wrangler`. It depends on the opam package
[`workerd`](https://github.com/ml-in-barcelona/opam-workerd) in the exact
version that Wrangler pins, and on `conf-npm`.

Wrangler needs Node.js 22 or later. `conf-npm` does not check the Node.js
version, so the build fails with a message when Node.js is older than 22.

## What the package contains

The opam file lists the npm tarballs of the non-optional dependency tree of
Wrangler (about 31 files) and the four `@esbuild/<platform>` tarballs as
`extra-source`. opam downloads them and checks the SHA-512 sum of each one. The
build unpacks each tarball into `node_modules`. No `npm` command runs.

## Limits

- opam cannot select a download by platform, so opam downloads the `esbuild`
  binaries of all four platforms and installs the one for your system.
- The `workerd` binary comes from the `workerd` opam package. The install
  links it to the place where Wrangler looks for it.
- The package has no `sharp` binaries. The Images binding does not work in
  local development.
- Supported: Linux and macOS, x86_64 and arm64.
- The package version is the version of the npm package `wrangler`, for example
  `4.151.3`.

The opam file has the license of Wrangler (MIT OR Apache-2.0). The scripts in
this repository have the MIT license (see `LICENSE`).

## Releases

The workflow `sync.yml` runs every day. It does these steps:

1. `node scripts/update.ts` reads the npm registry. For a new `wrangler`
   version, it writes `wrangler.opam` and a section `## <version>` in
   `CHANGES.md`. It runs `npm install --package-lock-only` in a temporary
   directory to find the dependency tree. The script needs Node.js 22.18 or
   later.
2. It commits the change to `main`.
3. It releases the newest version in `CHANGES.md` when the repository has no tag
   with this version, `ocaml/opam-repository` has no
   `packages/wrangler/wrangler.<version>`, and `ocaml/opam-repository` has the
   workerd version that this Wrangler pins. Otherwise it waits, and a later run
   tries again. It pushes the commit and the tag together.
4. The tag starts `release.yml`. It runs
   [dune-release-action](https://github.com/davesnx/dune-release-action),
   which makes the GitHub release and opens the pull request on
   `ocaml/opam-repository`.

The secret `GH_TOKEN` must push to `main` and to tags, and must open pull
requests on `ocaml/opam-repository` from the fork of the token owner. A tag
pushed with the default `GITHUB_TOKEN` does not start workflows.

The CI installs `workerd` from the tag of
[opam-workerd](https://github.com/ml-in-barcelona/opam-workerd) that has the
pinned version, because that version may not be in `opam-repository` yet.

Check the scripts with `npm ci && npm run check` in `scripts/`.

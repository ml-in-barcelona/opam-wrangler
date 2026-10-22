# opam-wrangler

The opam package `wrangler`. It installs [Wrangler](https://github.com/cloudflare/workers-sdk), the Cloudflare Workers command line tool.

## Install

```sh
opam install wrangler
wrangler --version
```

The package installs the `wrangler` command and its `node_modules` in `lib/wrangler`. It depends on the opam package [`workerd`](https://github.com/ml-in-barcelona/opam-workerd) in the exact version that Wrangler pins, and on `conf-npm`. The package version is the version of the npm package `wrangler`, for example `4.151.3`.

The opam file has the license of Wrangler (MIT OR Apache-2.0). The scripts in this repository have the MIT license (see `LICENSE`).

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type LockEntry = {
  version: string;
  resolved: string;
  integrity: string;
  optional?: boolean;
  dependencies?: Record<string, string>;
};

type Lock = { packages: Record<string, LockEntry> };

type Platform = { os: "linux" | "macos"; arch: "x86_64" | "arm64"; workerd: string; esbuild: string };

type Source = { path: string; file: string; entry: LockEntry; platform?: Platform };

const platforms: Platform[] = [
  { os: "linux", arch: "x86_64", workerd: "linux-64", esbuild: "linux-x64" },
  { os: "linux", arch: "arm64", workerd: "linux-arm64", esbuild: "linux-arm64" },
  { os: "macos", arch: "x86_64", workerd: "darwin-64", esbuild: "darwin-x64" },
  { os: "macos", arch: "arm64", workerd: "darwin-arm64", esbuild: "darwin-arm64" },
];

const root = join(import.meta.dirname, "..");

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const isVersion = (value: string | undefined): value is string =>
  value !== undefined && /^\d+\.\d+\.\d+$/.test(value);

const latestVersion = async (): Promise<string> => {
  const url = "https://registry.npmjs.org/wrangler/latest";
  const response = await fetch(url);
  if (!response.ok) return fail(`${url}: HTTP ${response.status}`);
  const { version } = (await response.json()) as { version?: string };
  return isVersion(version) ? version : fail(`${url}: not a version: ${version}`);
};

const sha512Hex = (integrity: string): string => {
  const [algorithm, digest] = integrity.split("-");
  if (algorithm !== "sha512" || digest === undefined) {
    return fail(`Expected a sha512 integrity, got ${integrity}`);
  }
  return Buffer.from(digest, "base64").toString("hex");
};

const readLock = (version: string): Lock => {
  const dir = mkdtempSync(join(tmpdir(), "wrangler-lock-"));
  writeFileSync(join(dir, "package.json"), '{"name":"wrangler-lock","private":true}\n');
  execFileSync(
    "npm",
    ["install", "--package-lock-only", "--omit=optional", "--no-audit", "--no-fund", `wrangler@${version}`],
    { cwd: dir, stdio: ["ignore", "inherit", "inherit"] },
  );
  return JSON.parse(readFileSync(join(dir, "package-lock.json"), "utf8")) as Lock;
};

const fileName = (path: string, version: string): string =>
  `${path
    .replace(/^node_modules\//, "")
    .replaceAll("/node_modules/", "__")
    .replaceAll("@", "")
    .replaceAll("/", "-")}-${version}.tgz`;

const sources = (lock: Lock): Source[] => {
  const tree = Object.entries(lock.packages)
    .filter(([path, entry]) => path !== "" && entry.optional !== true)
    .map(([path, entry]) => ({ path, file: fileName(path, entry.version), entry }));
  const esbuild = platforms.map((platform) => {
    const path = `node_modules/@esbuild/${platform.esbuild}`;
    const entry = lock.packages[path];
    if (entry === undefined) return fail(`The lock file has no ${path}`);
    return { path, file: fileName(path, entry.version), entry, platform };
  });
  return [...tree, ...esbuild];
};

const nodeCheck =
  'if (parseInt(process.versions.node) < 22) { console.error(\\"wrangler needs Node.js 22 or later\\"); process.exit(1); }';

const unpack = 'mkdir -p \\"$0\\" && tar -xzf \\"$1\\" -C \\"$0\\" --strip-components=1';

const filter = (p: Platform): string => `{os = "${p.os}" & arch = "${p.arch}"}`;

const unpackCommand = (s: Source): string =>
  `  ["sh" "-c" "${unpack}" "${s.path}" "${s.file}"]${s.platform === undefined ? "" : ` ${filter(s.platform)}`}`;

const linkWorkerd = (p: Platform): string =>
  `  ["sh" "-c" "mkdir -p \\"$0/bin\\" && ln -sf \\"$1\\" \\"$0/bin/workerd\\"" "%{lib}%/wrangler/node_modules/@cloudflare/workerd-${p.workerd}" "%{bin}%/workerd"] ${filter(p)}`;

const extraSource = (s: Source): string => `extra-source "${s.file}" {
  src: "${s.entry.resolved}"
  checksum: "sha512=${sha512Hex(s.entry.integrity)}"
}`;

const opamFile = (version: string, workerd: string, list: Source[]): string => `opam-version: "2.0"
synopsis: "Wrangler, the Cloudflare Workers command line tool"
description:
  "Wrangler builds, runs and deploys Cloudflare Workers. This package installs Wrangler and its JavaScript dependencies from the npm registry tarballs, without running npm. It uses the workerd package as its runtime. It needs Node.js 22 or later."
maintainer: ["David Sancho <dsnxmoreno@gmail.com>"]
authors: ["Cloudflare, Inc."]
license: "MIT OR Apache-2.0"
homepage: "https://github.com/ml-in-barcelona/opam-wrangler"
bug-reports: "https://github.com/ml-in-barcelona/opam-wrangler/issues"
dev-repo: "git+https://github.com/ml-in-barcelona/opam-wrangler.git"
x-maintenance-intent: ["(latest)"]
version: "${version}"
available: [ (os = "linux" | os = "macos") & (arch = "x86_64" | arch = "arm64") ]
depends: [
  "conf-npm"
  "workerd" {= "${workerd}"}
]
build: [
  ["node" "-e" "${nodeCheck}"]
${list.map(unpackCommand).join("\n")}
]
install: [
  ["mkdir" "-p" "%{lib}%/wrangler"]
  ["cp" "-R" "node_modules" "%{lib}%/wrangler/"]
${platforms.map(linkWorkerd).join("\n")}
  ["ln" "-sf" "../lib/wrangler/node_modules/wrangler/bin/wrangler.js" "%{bin}%/wrangler"]
]
${list.map(extraSource).join("\n")}
`;

const addSection = (text: string, version: string, workerd: string): string => {
  const lines = text.split("\n");
  const first = lines.findIndex((line) => line.startsWith("## "));
  const section = [`## ${version}`, "", `- Update to wrangler ${version}. It needs workerd ${workerd}.`, ""];
  if (first === -1) return `${text.trimEnd()}\n\n${section.join("\n")}`;
  return [...lines.slice(0, first), ...section, ...lines.slice(first)].join("\n");
};

const main = async (): Promise<void> => {
  const requested = process.argv[2];
  if (requested !== undefined && !isVersion(requested)) return fail(`Not a version: ${requested}`);
  const version = requested ?? (await latestVersion());
  const changes = join(root, "CHANGES.md");
  const text = readFileSync(changes, "utf8");
  if (text.split("\n").includes(`## ${version}`)) return;
  const lock = readLock(version);
  const workerd = lock.packages["node_modules/wrangler"]?.dependencies?.["workerd"];
  if (!isVersion(workerd)) return fail(`wrangler ${version} pins workerd ${workerd}, not an exact version`);
  writeFileSync(join(root, "wrangler.opam"), opamFile(version, workerd, sources(lock)));
  writeFileSync(changes, addSection(text, version, workerd));
  console.log(`wrangler ${version}`);
};

await main();

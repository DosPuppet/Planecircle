/**
 * Arena of the 3D board (PLAN-W W5): downloads the CC0 assets listed in tools/arena-assets.json from Poly Haven (each
 * main file checked against its pinned md5), then builds data/arena/ (outside Git, served on /arena/):
 * - models as GLB: deduplicated, welded, simplified when asked, textures resized and compressed to KTX2 (ETC1S, UASTC
 *   for normal maps), geometry quantized and meshopt-compressed;
 * - the table's materials as KTX2 maps, the HDRI as it is, the basis transcoder of the installed three.js;
 * - manifest.json (what the client loads) and CREDITS.md.
 * Downloads are kept in data/arena-src/. An unchanged manifest rebuilds nothing.
 *
 * Usage: npx tsx tools/arena-assets.ts [--pin] [--check] [--force] [--quiet]
 *   --pin    writes into the manifest the md5 of the files Poly Haven serves now (a new asset, or one updated upstream)
 *   --check  compares data/arena/ with the manifest without downloading anything (exit 1 if missing or stale)
 *   --force  rebuilds even when nothing changed
 * Environment: MTGX_ARENA_DIR (default data/arena).
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, quantize, simplify, textureCompress, weld } from "@gltf-transform/functions";
import { encodeToKTX2 } from "ktx2-encoder";
import { ktx2 } from "ktx2-encoder/gltf-transform";
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MANIFEST = join(ROOT, "tools/arena-assets.json");
const OUT = process.env.MTGX_ARENA_DIR || join(ROOT, "data/arena");
const SRC = join(ROOT, "data/arena-src");
const API = "https://api.polyhaven.com";
const args = process.argv.slice(2);
const PIN = args.includes("--pin");
const CHECK = args.includes("--check");
const FORCE = args.includes("--force");
const QUIET = args.includes("--quiet");
const log = (...a: unknown[]) => QUIET || console.log(...a);

interface Material {
  slot: string;
  id: string;
  res: string;
  tile: number;
  maps: string[];
  md5: string;
}
interface Model {
  id: string;
  res: string;
  simplify?: number;
  md5: string;
}
interface Manifest {
  budgetBytes: number;
  hdri: { id: string; res: string; md5: string };
  materials: Material[];
  models: Model[];
  props: unknown[];
}
interface PolyFile {
  url: string;
  md5: string;
  size: number;
  include?: Record<string, { url: string; md5: string; size: number }>;
}

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as Manifest;
/** The manifest's own fingerprint: data/arena/ built from it records it, an unchanged manifest rebuilds nothing. */
const source = createHash("sha256")
  .update(readFileSync(MANIFEST))
  .update(readFileSync(fileURLToPath(import.meta.url)))
  .digest("hex");
const md5 = (b: Uint8Array) => createHash("md5").update(b).digest("hex");
const short = (b: Uint8Array) => createHash("sha256").update(b).digest("hex").slice(0, 8);

if (CHECK) {
  const built = join(OUT, "manifest.json");
  const ok = existsSync(built) && JSON.parse(readFileSync(built, "utf8")).source === source;
  console.log(ok ? `arena: up to date (${OUT})` : `arena: missing or stale (${OUT}): run npx tsx tools/arena-assets.ts`);
  process.exit(ok ? 0 : 1);
}
if (!FORCE && !PIN && existsSync(join(OUT, "manifest.json"))) {
  if (JSON.parse(readFileSync(join(OUT, "manifest.json"), "utf8")).source === source) {
    log(`arena: up to date (${OUT})`);
    process.exit(0);
  }
}

async function json<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`${API}${path}: ${res.status}`);
  return (await res.json()) as T;
}

/** A file of Poly Haven, from the cache or downloaded, checked against the md5 Poly Haven gives. */
async function download(file: { url: string; md5: string }, dest: string): Promise<Uint8Array> {
  if (existsSync(dest)) {
    const b = new Uint8Array(readFileSync(dest));
    if (md5(b) === file.md5) return b;
  }
  const res = await fetch(file.url);
  if (!res.ok) throw new Error(`${file.url}: ${res.status}`);
  const b = new Uint8Array(await res.arrayBuffer());
  if (md5(b) !== file.md5) throw new Error(`${file.url}: md5 ${md5(b)}, expected ${file.md5}`);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, b);
  return b;
}

/** The pinned md5 of an asset's main file: written by --pin, otherwise it must match what Poly Haven serves. */
function pinned(entry: { id: string; md5: string }, now: string) {
  if (PIN) entry.md5 = now;
  else if (!entry.md5) throw new Error(`${entry.id}: no md5 pinned (run with --pin)`);
  else if (entry.md5 !== now)
    throw new Error(`${entry.id}: changed upstream (md5 ${now}, pinned ${entry.md5}); check it, then --pin`);
}

const decode = async (buffer: Uint8Array) => {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
};
/** Normal maps: at most 1024 px (their detail is fine under a tiled color map). */
const decodeNormal = async (buffer: Uint8Array) => {
  const { data, info } = await sharp(buffer)
    .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
};
/** UASTC (normal maps) with Zstandard and rate-distortion optimization: about half the size; ETC1S for the rest. */
const UASTC = { isUASTC: true, isNormalMap: true, needSupercompression: true, enableRDO: true, rdoQualityLevel: 1.5 };
const ETC1S = { isUASTC: false, qualityLevel: 160 };

const credits: string[] = [];
async function credit(id: string, kind: string) {
  const info = await json<{ name: string; authors: Record<string, string> }>(`/info/${id}`);
  credits.push(`| ${info.name} | ${kind} | ${Object.keys(info.authors).join(", ")} | https://polyhaven.com/a/${id} |`);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "basis"), { recursive: true });
const out: Record<string, unknown> = { version: 1, source, props: manifest.props };

// HDRI: as it is (prefiltered by the client).
{
  const files = await json<{ hdri: Record<string, { hdr: PolyFile }> }>(`/files/${manifest.hdri.id}`);
  const f = files.hdri[manifest.hdri.res]?.hdr as PolyFile;
  pinned(manifest.hdri, f.md5);
  const b = await download(f, join(SRC, manifest.hdri.id, `${manifest.hdri.id}_${manifest.hdri.res}.hdr`));
  const name = `${manifest.hdri.id}.${short(b)}.hdr`;
  writeFileSync(join(OUT, name), b);
  out.hdri = name;
  await credit(manifest.hdri.id, "HDRI");
  log(`hdri ${manifest.hdri.id}: ${(b.length / 1024).toFixed(0)} KB`);
}

// Materials of the table: one KTX2 file per map (UASTC for the normal map, ETC1S for the others).
const MAP_KEY: Record<string, string> = { diff: "Diffuse", nor_gl: "nor_gl", arm: "arm" };
const materials: Record<string, unknown> = {};
for (const m of manifest.materials) {
  const files = await json<Record<string, Record<string, { jpg: PolyFile }>>>(`/files/${m.id}`);
  const first = files[MAP_KEY[m.maps[0] as string] as string]?.[m.res]?.jpg as PolyFile;
  pinned(m, first.md5);
  const maps: Record<string, string> = {};
  for (const map of m.maps) {
    const f = files[MAP_KEY[map] as string]?.[m.res]?.jpg as PolyFile;
    const jpg = await download(f, join(SRC, m.id, `${m.id}_${map}_${m.res}.jpg`));
    const normal = map === "nor_gl";
    const ktx = await encodeToKTX2(jpg, {
      ...(normal ? UASTC : ETC1S),
      imageDecoder: normal ? decodeNormal : decode,
      isPerceptual: map === "diff",
      generateMipmap: true,
      enableDebug: false,
    });
    const name = `${m.slot}.${map}.${short(ktx)}.ktx2`;
    writeFileSync(join(OUT, name), ktx);
    maps[map] = name;
    log(`material ${m.slot} ${map}: ${(ktx.length / 1024).toFixed(0)} KB`);
  }
  materials[m.slot] = { tile: m.tile, ...maps };
  await credit(m.id, "texture");
}
out.materials = materials;

// Models: GLB, optimized.
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
const models: Record<string, string> = {};
for (const m of manifest.models) {
  const files = await json<{ gltf: Record<string, { gltf: PolyFile }> }>(`/files/${m.id}`);
  const f = files.gltf[m.res]?.gltf as PolyFile;
  pinned(m, f.md5);
  const dir = join(SRC, m.id, m.res);
  await download(f, join(dir, `${m.id}.gltf`));
  for (const [path, inc] of Object.entries(f.include ?? {})) await download(inc, join(dir, path));
  const doc = await io.read(join(dir, `${m.id}.gltf`));
  await doc.transform(
    dedup(),
    prune(),
    weld(),
    ...(m.simplify && m.simplify < 1 ? [simplify({ simplifier: MeshoptSimplifier, ratio: m.simplify, error: 0.002 })] : []),
    // A prop takes a hundred or two pixels on the screen: 512 px textures are plenty.
    textureCompress({ encoder: sharp, targetFormat: "png", resize: [512, 512] }),
    ktx2({ ...UASTC, generateMipmap: true, enableDebug: false, imageDecoder: decode, slots: /^normalTexture$/ }),
    ktx2({ ...ETC1S, generateMipmap: true, enableDebug: false, imageDecoder: decode, slots: /^(?!normalTexture$)/ }),
    quantize(),
    meshopt({ encoder: MeshoptEncoder, level: "medium" }),
  );
  const glb = await io.writeBinary(doc);
  const name = `${m.id}.${short(glb)}.glb`;
  writeFileSync(join(OUT, name), glb);
  models[m.id] = name;
  await credit(m.id, "model");
  log(`model ${m.id}: ${(glb.length / 1024).toFixed(0)} KB`);
}
out.models = models;

// The basis transcoder of the installed three.js (the KTX2 loader runs it in workers).
const basis = join(ROOT, "node_modules/three/examples/jsm/libs/basis");
for (const f of ["basis_transcoder.js", "basis_transcoder.wasm"]) copyFileSync(join(basis, f), join(OUT, "basis", f));

writeFileSync(join(OUT, "manifest.json"), `${JSON.stringify(out, null, 1)}\n`);
writeFileSync(
  join(OUT, "CREDITS.md"),
  `# Arena of the 3D board\n\nAll assets from Poly Haven (https://polyhaven.com), CC0 1.0 (public domain).\n\n| Asset | Kind | Authors | Page |\n|---|---|---|---|\n${credits.join("\n")}\n`,
);
if (PIN) writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

const total = readdirSync(OUT, { recursive: true })
  .map((f) => join(OUT, String(f)))
  .filter((p) => statSync(p).isFile())
  .reduce((sum, p) => sum + statSync(p).size, 0);
console.log(
  `arena: ${(total / 1024 / 1024).toFixed(1)} MB in ${OUT} (budget ${(manifest.budgetBytes / 1024 / 1024).toFixed(0)} MB)`,
);
if (total > manifest.budgetBytes) {
  console.error("arena: over budget");
  process.exit(1);
}

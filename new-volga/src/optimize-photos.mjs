import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "img");
const srcDir = join(root, "photo-src");
mkdirSync(outDir, { recursive: true });

const fallback = {
  view: "/tmp/photos/view.jpg",
  "galaxy-435": "/tmp/photos/hero.jpg",
  "galaxy-219": "/tmp/photos/g219.jpg",
  "downtown-192": "/tmp/photos/d192.jpg",
  "downtown-93": "/tmp/photos/d93.jpg",
  "downtown-33": "/tmp/photos/d33.jpg",
  "center-41": "/tmp/photos/c41.jpg",
  "city-105": "/tmp/photos/c105.jpg",
  "city-239": "/tmp/photos/c239.jpg",
};

function sourceFor(id) {
  const local = join(srcDir, `${id}.jpg`);
  if (existsSync(local)) return local;
  const fb = fallback[id];
  if (fb && existsSync(fb)) return fb;
  throw new Error(`Нет исходника для ${id}: положите JPG в photo-src/${id}.jpg`);
}

function run(args) {
  const res = spawnSync("ffmpeg", args, { stdio: "inherit" });
  if (res.status !== 0) throw new Error("ffmpeg завершился с ошибкой");
}

function probe(file) {
  const res = spawnSync(
    "ffprobe",
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file],
    { encoding: "utf8" }
  );
  const [w, h] = res.stdout.trim().split(",").map(Number);
  return { width: w, height: h };
}

const manifest = {};
for (const id of Object.keys(fallback)) {
  const src = sourceFor(id);
  for (const width of [480, 960]) {
    const webp = join(outDir, `${id}-${width}.webp`);
    const avif = join(outDir, `${id}-${width}.avif`);
    const vf = `scale=${width}:-2:flags=lanczos`;
    run(["-y", "-i", src, "-vf", vf, "-c:v", "libwebp", "-quality", "62", "-compression_level", "6", webp]);
    run([
      "-y", "-i", src, "-vf", vf,
      "-c:v", "libaom-av1", "-still-picture", "1", "-cpu-used", "8", "-crf", "35", "-b:v", "0", "-an",
      avif,
    ]);
    if (width === 960) manifest[id] = probe(webp);
  }
  console.log(id, manifest[id]);
}

writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log("wrote", join(outDir, "manifest.json"));

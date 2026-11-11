// Snapshot ExpressLRS targets.json plus every layout file it references into
// public/elrs/targets.json, for the ELRS Target Identifier page.
//
//   node scripts/update-elrs-targets.mjs [ref]
//
// ref defaults to master of github.com/ExpressLRS/targets. Layouts are stored
// once each and merged with a target's overlay in the browser, the same way
// the ELRS build writes them into the firmware trailer.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ref = process.argv[2] ?? "master";
const base = `https://raw.githubusercontent.com/ExpressLRS/targets/${ref}`;
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "elrs", "targets.json");

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

const tree = await getJson(`${base}/targets.json`);

const targets = [];
(function walk(node, trail) {
  if (!node || typeof node !== "object") return;
  if (typeof node.product_name === "string") {
    const firmware = node.firmware ?? "";
    targets.push({
      target: trail.join("."),
      product_name: node.product_name,
      lua_name: node.lua_name,
      firmware,
      platform: node.platform,
      layout_file: node.layout_file ? `${firmware.includes("_TX") ? "TX" : "RX"}/${node.layout_file}` : undefined,
      overlay: node.overlay,
    });
    return;
  }
  for (const [key, value] of Object.entries(node)) walk(value, [...trail, key]);
})(tree, []);

const layouts = {};
for (const file of new Set(targets.map((t) => t.layout_file).filter(Boolean))) {
  try {
    layouts[file] = await getJson(`${base}/${file}`);
  } catch (error) {
    console.warn(`skipping ${file}: ${error.message}`);
  }
}

await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, JSON.stringify({ ref, fetched: new Date().toISOString(), targets, layouts }));
console.log(`${targets.length} targets, ${Object.keys(layouts).length} layouts -> ${out}`);

const fs = require("fs");
const path = require("path");

const esmDir = path.join(__dirname, "..", "node_modules", "html5-qrcode", "esm");

function walk(dir) {
  let files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(walk(full));
    } else if (entry.isFile() && full.endsWith(".js")) {
      files.push(full);
    }
  }
  return files;
}

function stripSourceMapComment(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const updated = text.replace(/\n\/\/\# sourceMappingURL=.*$/m, "");
  if (updated !== text) {
    fs.writeFileSync(filePath, updated, "utf8");
    return 1;
  }
  return 0;
}

try {
  if (!fs.existsSync(esmDir)) {
    process.exit(0);
  }

  const files = walk(esmDir);
  let changed = 0;
  for (const file of files) {
    changed += stripSourceMapComment(file);
  }

  if (changed > 0) {
    console.log(`[postinstall] Stripped sourceMappingURL comments from ${changed} html5-qrcode files.`);
  }
} catch (err) {
  console.warn("[postinstall] Failed to patch html5-qrcode sourcemap comments:", err.message);
}

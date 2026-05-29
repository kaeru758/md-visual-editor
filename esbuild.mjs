import * as esbuild from 'esbuild';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

// ---------------------------------------------------------------------------
// Copy webview vendor assets (marked, mermaid) into media/vendor/ so they can
// be bundled into the .vsix without shipping the entire node_modules tree.
// ---------------------------------------------------------------------------
async function copyVendorAssets() {
  const req = createRequire(import.meta.url);
  const vendorDir = path.resolve('media', 'vendor');
  await fs.mkdir(vendorDir, { recursive: true });

  const targets = [
    {
      src: path.join(path.dirname(req.resolve('marked/package.json')), 'marked.min.js'),
      dest: path.join(vendorDir, 'marked.min.js'),
    },
    {
      src: path.join(path.dirname(req.resolve('mermaid/package.json')), 'dist', 'mermaid.min.js'),
      dest: path.join(vendorDir, 'mermaid.min.js'),
    },
    {
      src: path.join(path.dirname(req.resolve('katex/package.json')), 'dist', 'katex.min.js'),
      dest: path.join(vendorDir, 'katex.min.js'),
    },
    {
      src: path.join(path.dirname(req.resolve('katex/package.json')), 'dist', 'katex.min.css'),
      dest: path.join(vendorDir, 'katex.min.css'),
    },
  ];

  for (const { src, dest } of targets) {
    await fs.copyFile(src, dest);
    console.log(`[vendor] copied ${path.relative(process.cwd(), src)} -> ${path.relative(process.cwd(), dest)}`);
  }

  // Copy KaTeX fonts (needed by katex.min.css via relative ./fonts/ urls).
  const katexFontsSrc = path.join(path.dirname(req.resolve('katex/package.json')), 'dist', 'fonts');
  const katexFontsDest = path.join(vendorDir, 'fonts');
  await fs.mkdir(katexFontsDest, { recursive: true });
  const fontFiles = await fs.readdir(katexFontsSrc);
  for (const f of fontFiles) {
    // Skip .ttf to keep package size down — modern browsers (Electron) support woff/woff2.
    if (f.endsWith('.ttf')) continue;
    await fs.copyFile(path.join(katexFontsSrc, f), path.join(katexFontsDest, f));
  }
  console.log(`[vendor] copied ${fontFiles.filter(f => !f.endsWith('.ttf')).length} KaTeX font files -> ${path.relative(process.cwd(), katexFontsDest)}`);
}

await copyVendorAssets();

const ctx = await esbuild.context({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  format: 'cjs',
  minify: production,
  sourcemap: !production,
  sourcesContent: false,
  platform: 'node',
  outfile: 'dist/extension.js',
  external: ['vscode'],
  logLevel: 'info',
});

if (watch) {
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  await ctx.rebuild();
  await ctx.dispose();
}

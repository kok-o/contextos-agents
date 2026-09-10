const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const vendorDir = path.resolve('.agents/compiler/vendor');
fs.mkdirSync(vendorDir, { recursive: true });

esbuild.buildSync({
  entryPoints: [require.resolve('yaml')],
  bundle: true,
  outfile: path.join(vendorDir, 'yaml.js'),
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  minify: true,
});

const pkgPath = require.resolve('yaml/package.json');
const pkgDir = path.dirname(pkgPath);
const licensePath = path.join(pkgDir, 'LICENSE');
if (fs.existsSync(licensePath)) {
  fs.copyFileSync(licensePath, path.join(vendorDir, 'yaml.LICENSE.txt'));
}

const pkg = require(pkgPath);
const sbom = {
  name: pkg.name,
  version: pkg.version,
  license: pkg.license,
  repository: pkg.repository
};
fs.writeFileSync(path.join(vendorDir, 'yaml.SBOM.json'), JSON.stringify(sbom, null, 2));

console.log('YAML bundled successfully');

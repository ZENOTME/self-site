import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import subsetFont from 'subset-font';

const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'dist', 'fonts');
const monaspaceSourcePath = path.join(rootDir, 'assets', 'fonts', 'monaspace-neon.woff2');
const monaspaceFonts = [
	{ weight: 400, name: 'monaspace-neon-regular' },
	{ weight: 700, name: 'monaspace-neon-bold' },
];

function hash(buffer) {
	return createHash('sha256').update(buffer).digest('hex').slice(0, 12);
}

async function collectRenderedText() {
	const htmlFiles = [];
	const pending = [path.join(rootDir, 'dist')];
	while (pending.length > 0) {
		const directory = pending.pop();
		const entries = await readdir(directory, { withFileTypes: true });
		for (const entry of entries) {
			const entryPath = path.join(directory, entry.name);
			if (entry.isDirectory()) pending.push(entryPath);
			else if (entry.isFile() && entry.name.endsWith('.html')) htmlFiles.push(entryPath);
		}
	}

	const html = await Promise.all(htmlFiles.map((filePath) => readFile(filePath, 'utf8')));
	const characters = [...new Set(html.join(''))].join('');
	if (!characters) throw new Error('No rendered HTML was found for Noto Serif SC subsetting.');
	return { characters, pageCount: htmlFiles.length };
}

async function buildMonaspaceSubsets(characters) {
	const source = await readFile(monaspaceSourcePath);
	const urls = new Map();
	for (const font of monaspaceFonts) {
		const subset = await subsetFont(source, characters, {
			targetFormat: 'woff2',
			variationAxes: { wght: font.weight },
		});
		const fileName = `${font.name}.${hash(subset)}.woff2`;
		await writeFile(path.join(outputDir, fileName), subset);
		urls.set(`/fonts/${font.name}.woff2`, `/fonts/${fileName}`);
		console.log(`Generated ${fileName} (${Math.ceil(subset.length / 1024)} KB).`);
	}
	return urls;
}

async function replaceFontUrls(urls) {
	const pending = [path.join(rootDir, 'dist')];
	while (pending.length > 0) {
		const directory = pending.pop();
		const entries = await readdir(directory, { withFileTypes: true });
		for (const entry of entries) {
			const entryPath = path.join(directory, entry.name);
			if (entry.isDirectory()) {
				pending.push(entryPath);
				continue;
			}
			if (!entry.isFile() || (!entry.name.endsWith('.html') && !entry.name.endsWith('.css'))) continue;

			const original = await readFile(entryPath, 'utf8');
			let updated = original;
			for (const [from, to] of urls) updated = updated.replaceAll(from, to);
			if (updated !== original) await writeFile(entryPath, updated);
		}
	}
}

async function main() {
	await mkdir(outputDir, { recursive: true });
	const { characters, pageCount } = await collectRenderedText();
	const urls = await buildMonaspaceSubsets(characters);
	await replaceFontUrls(urls);
	console.log(`Subset Monaspace Neon for ${pageCount} pages and ${[...characters].length} characters.`);
}

await main();

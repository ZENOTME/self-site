import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import subsetFont from 'subset-font';

const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'dist', 'fonts');
const monaspaceSourcePath = path.join(rootDir, 'assets', 'fonts', 'monaspace-neon.woff2');
const monaspaceFonts = [
	{ weight: 400, output: 'monaspace-neon-regular.woff2' },
	{ weight: 700, output: 'monaspace-neon-bold.woff2' },
];

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
	for (const font of monaspaceFonts) {
		const subset = await subsetFont(source, characters, {
			targetFormat: 'woff2',
			variationAxes: { wght: font.weight },
		});
		await writeFile(path.join(outputDir, font.output), subset);
		console.log(`Generated ${font.output} (${Math.ceil(subset.length / 1024)} KB).`);
	}
}

async function main() {
	await mkdir(outputDir, { recursive: true });
	const { characters, pageCount } = await collectRenderedText();
	await buildMonaspaceSubsets(characters);
	console.log(`Subset Monaspace Neon for ${pageCount} pages and ${[...characters].length} characters.`);
}

await main();

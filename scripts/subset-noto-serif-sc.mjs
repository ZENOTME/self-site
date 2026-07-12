import { createHash } from 'node:crypto';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import subsetFont from 'subset-font';

const fonts = [
	{
		source: 'NotoSerifSC-Regular.ttf',
		url: 'https://fonts.gstatic.com/s/notoserifsc/v35/H4cyBXePl9DZ0Xe7gG9cyOj7uK2-n-D2rd4FY7SCqyWv.ttf',
		hash: '968be826d702638d29546002a5e24d8c55036ab441bbc09db9e22aee90d73606',
		output: 'noto-serif-sc-regular.woff2',
	},
	{
		source: 'NotoSerifSC-Bold.ttf',
		url: 'https://fonts.gstatic.com/s/notoserifsc/v35/H4cyBXePl9DZ0Xe7gG9cyOj7uK2-n-D2rd4FY7RlrCWv.ttf',
		hash: '9868e5845782ccce226e0941b7a5d1fea3b2520f7e59e6e62e89e02f132eb0ab',
		output: 'noto-serif-sc-bold.woff2',
	},
];
const licenseUrl = 'https://raw.githubusercontent.com/google/fonts/main/ofl/notoserifsc/OFL.txt';
const rootDir = process.cwd();
const cacheDir = path.join(rootDir, '.cache', 'noto-serif-sc', 'v35');
const outputDir = path.join(rootDir, 'dist', 'fonts');

function hash(buffer) {
	return createHash('sha256').update(buffer).digest('hex');
}

async function fileExists(filePath) {
	try {
		await access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function downloadSource(font) {
	const sourcePath = path.join(cacheDir, font.source);
	if (await fileExists(sourcePath)) {
		const source = await readFile(sourcePath);
		if (hash(source) === font.hash) return sourcePath;
	}

	console.log(`Downloading ${font.source}...`);
	const response = await fetch(font.url);
	if (!response.ok) {
		throw new Error(`Unable to download ${font.url}: ${response.status} ${response.statusText}`);
	}
	const source = Buffer.from(await response.arrayBuffer());
	if (hash(source) !== font.hash) {
		throw new Error(`Downloaded ${font.source} failed SHA-256 verification.`);
	}
	await writeFile(sourcePath, source);
	return sourcePath;
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

async function main() {
	await mkdir(cacheDir, { recursive: true });
	await mkdir(outputDir, { recursive: true });
	const { characters, pageCount } = await collectRenderedText();

	for (const font of fonts) {
		const sourcePath = await downloadSource(font);
		const subset = await subsetFont(await readFile(sourcePath), characters, { targetFormat: 'woff2' });
		await writeFile(path.join(outputDir, font.output), subset);
		console.log(`Generated ${font.output} (${Math.ceil(subset.length / 1024)} KB).`);
	}

	const license = await fetch(licenseUrl);
	if (!license.ok) throw new Error(`Unable to download Noto Serif SC license: ${license.status}.`);
	await writeFile(path.join(outputDir, 'OFL-Noto-Serif-SC.txt'), await license.text());
	console.log(`Subset Noto Serif SC for ${pageCount} pages and ${[...characters].length} characters.`);
}

await main();

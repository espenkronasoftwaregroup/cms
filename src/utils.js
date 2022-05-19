import fs from 'fs';
import path from 'path';
import esbuild from 'esbuild';
import crypto from 'crypto';
import sass from 'sass';

function readFile(filePath) {
	return new Promise((resolve, reject) => {
		fs.readFile(filePath, (err, data) => {
			if (err) reject(err);
			else resolve(data);
		});
	});
}

function readDir(dirPath) {
	return new Promise((resolve, reject) => {
		fs.readdir(dirPath, (err, data) => {
			if (err) reject(err);
			else resolve(data);
		})
	})
}

function lstat(fsPath) {
	return new Promise((resolve, reject) => {
		fs.lstat(fsPath, (err, data) => {
			if (err) reject(err);
			else resolve(data);
		})
	});
}

function stat(fsPath) {
	return new Promise((resolve, reject) => {
		fs.stat(fsPath, (err, data) => {
			if (err) reject(err);
			else resolve(data);
		})
	});
}

function canRead(fsPath) {
	return new Promise((resolve) => {
		fs.access(fsPath, fs.constants.R_OK, err => {
			if (err) resolve(false);
			else resolve(true);
		})
	});
}

// resolves paths for tree
async function buildFolderTree(dirPath, filter) {
	const result = {};
	const dirContents = await readDir(dirPath);

	for (const entry of dirContents) {
		if (filter) {
			if (filter(entry, dirPath)) continue;
		}

		const p = path.join(dirPath, entry);
		const s = await stat(p);

		result[entry] = {
			fullPath: p
		}

		if (s.isDirectory()) {
			result[entry].children = await buildFolderTree(p);
		}
	}

	return result;
}

// builds a tree object based on a file path
async function buildFileTree(rootPath, fileFilter) {
	let contents = (await readDir(rootPath)).filter(n => n !== '.' && n !== '..');
	let result = {};

	for (const item of contents) {
		if ((await stat(path.join(rootPath, item))).isDirectory()) {
			result[item] = await buildFileTree(path.join(rootPath, item), fileFilter);
		} else {
			if (fileFilter && !fileFilter(item)) continue;
			result[item] = true;
		}
	}

	return result;
}

function parseJwt (token) {
	if (!token) return null;

    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));

    return JSON.parse(jsonPayload);
};

function getUtcNow() {
	const date = new Date(); 
	const utcNow =  Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds());
	return utcNow;
}

async function getPaths(rootPath, prefix) {
	let dirs = await readDir(rootPath);
	dirs = dirs.filter(async n => n !== '.' && n !== '..' && await (lstat(path.join(rootPath, n)).isDirectory()));
	
	let result = {};

	for (const dir of dirs) {
		const key = prefix + '/' + dir;
		result[key] = path.join(rootPath, dir);
		result = {...result, ... await getPaths(path.join(rootPath, dir), key)};
	}

	return result;
}

function getPathsSync(rootPath, prefix) {
	let dirs = fs.readdirSync(rootPath).filter(n => n !== '.' && n !== '..' && fs.lstatSync(path.join(rootPath, n)).isDirectory());
	let result = {};

	for (const dir of dirs) {
		const key = prefix + '/' + dir;
		result[key] = path.join(rootPath, dir);
		result = {...result, ...getPathsSync(path.join(rootPath, dir), key)};
	}

	return result;
}

function getHash(buffer) {
	const hashSum = crypto.createHash('shake256', { outputLength: 10 });
	hashSum.update(buffer);
	return hashSum.digest('hex');
}

function getFileHash(filePath) {
	const buf = fs.readFileSync(filePath);
	return getHash(buf);
}

function bundleJavascripts(inputFilePaths, outputDir, sourcemap = true) {
	const files = [];

	for (const inputFilePath of inputFilePaths) {
		const hash = getFileHash(inputFilePath);
		const filename = path.basename(inputFilePath);
		const bundleName = `${filename.replace('.js', '')}.${hash}.js`;

		const result = esbuild.buildSync({
			entryPoints: [inputFilePath],
			bundle: false,
			treeShaking: false,
			minify: true,
			sourcemap,
			outfile: path.join(outputDir, bundleName),
			target: [
				'es2022'
			]
		});

		if (result.errors.length) console.error(result.errors);
		else files.push(bundleName);
	}

	return files;
}

function bundleSass(inputFilePaths, outputDir, sourceMap = true) {
	const files = [];

	for (const inputFilePath of inputFilePaths) {
		const result = sass.compile(inputFilePath, { style: 'compressed', sourceMap });
		const hash = getHash(Buffer.from(result.css, 'utf-8'));
		const filename = path.basename(inputFilePath);
		const newFileName = `${filename.replace(path.extname(filename), '')}.${hash}.css`;
		fs.writeFileSync(path.join(outputDir, newFileName), result.css);
		
		if (sourceMap) {
			fs.writeFileSync(path.join(outputDir, newFileName + '.map'), JSON.stringify(result.sourceMap));
		}

		files.push(newFileName);
	}

	return files;
}

export {
	bundleJavascripts,
	bundleSass,
	buildFolderTree,
	buildFileTree,
	readDir,
	lstat,
	stat,
	readFile,
	parseJwt,
	getUtcNow,
	getPaths,
	getPathsSync,
	getFileHash,
	canRead
};
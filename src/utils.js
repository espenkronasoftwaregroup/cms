import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

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

function getPathsSync(rootPath, prefix, excludedDirs) {
	let dirs = fs.readdirSync(rootPath).filter(n => n !== '.' && n !== '..' && fs.lstatSync(path.join(rootPath, n)).isDirectory());
	let result = {};

	for (const dir of dirs) {
		if (excludedDirs && excludedDirs.includes(dir)) continue;
		const key = prefix + '/' + dir;
		result[key] = path.join(rootPath, dir);
		result = {...result, ...getPathsSync(path.join(rootPath, dir), key)};
	}

	return result;
}

async function getTempFilePath() {
	const td  = os.tmpdir();
	let tmpFilePath;

	do {
		const value = crypto.getRandomValues(new Uint8Array(10));
		const fileName = value.map(m=>('0'+m.toString(16)).slice(-2)).join('') + '.mjs';
		tmpFilePath = path.join(td, fileName);
	} while(await canRead(tmpFilePath));

	return tmpFilePath;
}

export {
	getTempFilePath,
	readDir,
	lstat,
	stat,
	readFile,
	getPaths,
	getPathsSync,
	canRead
};
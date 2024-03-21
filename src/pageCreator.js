import { canRead, getPathsSync, getTempFilePath, readDir, readDirWithTypes, readFile } from "./utils.js";
import fs from 'fs';
import path from 'path';
import ejs from 'ejs';
import { pathToFileURL } from 'url';
import MarkdownIt from "markdown-it";

const diskCache = {pagePath: {}, sharedContent: {}};

async function getFolderContents(fsPath) {
	let contents;

	if (diskCache[fsPath]) {
		contents = diskCache[fsPath];
	} else {
		contents = await readDir(fsPath);
	}

	return contents;
}

async function getItemContents(contentPath) {
	const itemContents = await getFolderContents(contentPath);

	// md and json files must be read before template files as the templates might reference those.
	itemContents.sort((a, b) => {
		if (a.endsWith('.ejs') && !b.endsWith('.ejs')) {
			return 1;
		} else if (!a.endsWith('.ejs') && b.endsWith('.ejs')) {
			return -1;
		} else {
			return 0;
		}
	});

	return itemContents;
}

async function loadControllerModuleFromString(controllerString) {
	// because of reasons javascript is a lot easier to load from disk, so write that shit to file first.
	const tmpfile = await getTempFilePath();
	fs.writeFileSync(tmpfile, controllerString, 'utf-8');
	return await import(pathToFileURL(tmpfile));
}

async function getFileContents(filePath, itemContentFilesOverrides) {
	const fileName = path.basename(filePath);
	let fileContent;

	if (itemContentFilesOverrides?.[fileName]) {
		fileContent = itemContentFilesOverrides?.[fileName];
	} else if (diskCache[filePath]) {
		fileContent = diskCache[filePath];
	} else {
		if (await canRead(filePath)) {
			try {
				fileContent = (await readFile(filePath)).toString();
				diskCache[filePath] = fileContent;
			} catch (err) {
				throw new Error(`Failed to read file ${fileName}, : ${err.message}`);
			}
		}
	}

	return fileContent;
}

export class PageCreator {
	constructor(opts) {
		this.opts = opts;
		this.pages = getPathsSync(this.opts.pagesPath, '');
		this.items = getPathsSync(this.opts.itemsPath, '', ['items']);
		this.notFoundTemplate = fs.readFileSync(this.opts.notFoundTemplatePath).toString();
		this.md = new MarkdownIt();

		// här behöver man kanske lägga in fs.watch för att ladda om pages och items när filer förändras på disk... eller iaf när dom skapas/tas bort
	}

	/*
		Checks the items and pages trees to find the correct path based on url.
		For example, consider the path /products/car/yellow:

		The "products" part of the url is the item type.
		The "car" part of the url is the item name.
		The "yellow" part of the url is a virtual path which is handled by the products controller.

		That url will return  /products because the products item controller and template is
		what will be used to display the item.
	*/
	async getPagePath(urlPath) {

		if (diskCache.pagePath[urlPath]) return diskCache.pagePath[urlPath];

		let pagePath = urlPath;

		while (pagePath !== '') {
			if (this.pages[pagePath]) {
				break;
			}

			if ((pagePath.match(/\//g) || []).length > 1) {
				const p = pagePath.split('/').pop();
				pagePath = pagePath.substring(0, pagePath.length - p.length - 1);
			} else {
				break;
			}
		}

		if (pagePath == '/' && this.opts.rootPagePath) {
			if (await canRead(path.join(this.opts.pagesPath, this.opts.rootPagePath))) {
				pagePath = this.opts.rootPagePath;
			}
		}

		diskCache.pagePath[urlPath] = pagePath;

		return pagePath;
	}

	async buildSharedContentTree(fsPath) {
		const result = {};

		if (!fsPath) return result;

		const items = await readDirWithTypes(fsPath);

		for (const item of items) {
			if (item.isDirectory()) {
				result[item.name] = await this.buildSharedContentTree(path.join(fsPath, item.name));
			} else {
				if (item.name.endsWith('.md')) {
					const data = await readFile(path.join(fsPath, item.name));
					const html = this.md.render(data.toString());
					result[item.name.replace('.md', '')] = html;
				} else if (item.name.endsWith('.ejs')) {
					const data = await readFile(path.join(fsPath, item.name));
					result[item.name.replace('.ejs', '')] = ejs.render(data.toString(), {}, { views: [this.opts.partialsPath] });
				} else if (item.name.endsWith('.json')) {
					const data = await readFile(path.join(fsPath, item.name));
					result[item.name.replace('.json', '')] = JSON.parse(data);
				}
			}
		}

		return result;
	}

	async getSharedContent(sharedContentPath) {
		let sharedContent;

		if (diskCache.sharedContent[sharedContentPath]) {
			sharedContent = diskCache.sharedContent[this.opts.sharedContentPath];
		} else {
			sharedContent = await this.buildSharedContentTree(sharedContentPath);
			diskCache.sharedContent[sharedContentPath] = sharedContent;
		}

		return sharedContent;
	}

	/**
	 * Compile a content, content type and status code for a request
	 * @param {*} req the express request object
	 * @param {string} opts.customPath A custom path used for controller/template/content look up. If not supplied req.path will be used
	 * @returns {*} Response data
	 */
	async createPage(req, {customPath, itemContentFilesOverrides} = {}) {
		const result = {
			status: 200,
			contentType: 'text/html'
		}

		const sharedContent = await this.getSharedContent(this.opts.sharedContentPath);
		const requestedPath = customPath || req.path;

		const data = {
			viewData: {
				sharedContent,
				content: {},
				activePath: requestedPath,
				query: req.query,
				jsBundles: this.opts.jsBundles, // todo: these should not be here
				cssBundles: this.opts.cssBundles,
			}
		};

		let pagePath = await this.getPagePath(requestedPath);
		let fsRootPath = null;
		let isItem = false;
		let itemName;
		
		if (this.items[requestedPath] && !this.pages[requestedPath]){
			fsRootPath = this.items[pagePath];
			isItem = true;
			itemName = path.basename(requestedPath);
		} else if (pagePath && this.pages[pagePath]) {
			fsRootPath = this.pages[pagePath];
		}

		if (fsRootPath) {
			data.viewData.pageRootPath = fsRootPath;

			const contents = await getFolderContents(fsRootPath);

			if (contents.includes('controller.mjs')) {
				
				let module;
				const controllerPath = path.join(fsRootPath, 'controller.mjs');
				
				if (itemContentFilesOverrides?.['controller.mjs']) {
					try {
						module = await loadControllerModuleFromString(itemContentFilesOverrides['controller.mjs']);
					} catch (err) {
						return {
							status: 400,
							contentType: 'text/plain',
							content: `Injected controller code exploded!\n${err.stack}`
						}
					}

				} else {
					
					module = await import(pathToFileURL(controllerPath));
				}

				let controllerResult;

				// execute controller
				try {
					controllerResult = await module.controller({...req, path: requestedPath}, { ...this.opts, pageCreator: this, controllerPath: pagePath });
				} catch (err) {

					this.opts.logger?.error(`Controller at ${controllerPath} exploded`, { Error: err })

					return {
						status: 500,
						contentType: 'text/plain',
						content: `Controller at ${controllerPath} exploded\n${err.stack}`
					}
				}

				// handle controller results
				if (controllerResult.cookie) {
					result.cookie = controllerResult.cookie;
				}

				if (controllerResult.headers) {
					result.headers = controllerResult.headers;
				}

				if (controllerResult.redirect) { 
					result.redirect = controllerResult.redirect;
					return result;
				}

				if (controllerResult.redirectMoved) {
					result.redirectMoved = controllerResult.redirectMoved;
					return result;
				}

				// render the not found template without redirect
				if (controllerResult.softNotFound) {
					return {
						status: 404,
						contentType: 'text/html',
						content: ejs.render(this.notFoundTemplate, data, { views: [this.opts.partialsPath], context: req.globals || {} })
					}
				}

				if (controllerResult.raw) {
					result.status = controllerResult.raw.status || 200;
					result.contentType = controllerResult.raw.type || 'text/plain';
					result.content = controllerResult.raw.content;
					result.contentStream = controllerResult.raw.contentStream;
					return result;
				} else if (!contents.includes('template.ejs')) {

					this.opts.logger?.error(`Page path ${fsRootPath} does not have a template and controller did not return raw content`);

					// if there is no template the content type must be raw otherwise we dont know how to render
					return {
						status: 500,
						contentType: 'text/plain',
						content: `Page path ${fsRootPath} does not have a template and controller did not return raw content.`
					}
				}

				data.viewData = { ...data.viewData, ...controllerResult.viewData };
			}

			if (contents.includes('template.ejs')) {
				// If this is a request for an item, first check in the item dir for a content template
				// and use that if it exits. If that does not exist, check for a content markdown file
				// and render that as html instead.
				let contentPath = fsRootPath;

				if (isItem) {
					contentPath = path.join(fsRootPath, itemName);

					// if this cannot be read we might be at root level
					if (!await canRead(contentPath)) {
						contentPath = fsRootPath;
					}
				}

				const itemContents = await getItemContents(contentPath);

				for (const fileName of itemContents) {
					if (fileName === 'template.ejs') continue;
					if (!['.md', '.json', '.ejs'].includes(path.extname(fileName))) continue;

					const fileNameWithoutExt = fileName.replace(path.extname(fileName), '');

					const fp = path.join(contentPath, fileName);
					const fileContent = await getFileContents(fp, itemContentFilesOverrides);

					if (fileContent) {
						if (fileName.endsWith('.md')) {
							try {
								const html = this.md.render(fileContent);
								data.viewData.content[fileNameWithoutExt] = html;
							} catch (err) {
								return {
									status: 500,
									contentType: 'text/plain',
									content: `Failed to render markdown file ${fileName}, : ${err.message}\n${err.stack}`
								}
							}
						} else if (fileName.endsWith('.json')) {
							data.viewData.content[fileNameWithoutExt] = JSON.parse(fileContent.toString());
						} else if (fileName.endsWith('.ejs')) {
							try {
								data.viewData.content[fileNameWithoutExt] = ejs.render(fileContent.toString(), {...data}, { views: [this.opts.partialsPath], context: req.globals || {}});
							} catch (err) {

								this.opts.logger?.error(`EJS at ${fp} exploded`, { Stack: err.stack });

								return {
									status: 500,
									contentType: 'text/plain',
									content: `EJS at ${fp} exploded\n${err.stack}`
								}

							}
						}
					}
				}

				try {
					const views = [fsRootPath, this.opts.partialsPath];

					if (isItem) {
						views.push(path.join(fsRootPath, itemName));
					}

					const templatePath = path.join(fsRootPath,  'template.ejs');
					const templateString = await getFileContents(templatePath, itemContentFilesOverrides);
					const html = ejs.render(templateString, data, { views, context: req.globals || {} });
					result.content = html;
				} catch (err) {

					this.opts?.logger.error(`Template at ${fsRootPath}/template.ejs exploded`, { Stack: err.stack });

					return {
						status: 500,
						contentType: 'text/plain',
						content: `Template at ${fsRootPath}/template.ejs exploded\n${err.stack}`
					}
				}

				return result;
			}
		}

		return {
			status: 404,
			contentType: 'text/html',
			content: ejs.render(this.notFoundTemplate, data, { views: [this.opts.partialsPath], context: req.globals || {} })
		}
	}
}
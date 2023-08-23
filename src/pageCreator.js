import { canRead, getPathsSync, getTempFilePath, readDir, readDirWithTypes, readFile } from "./utils.js";
import fs from 'fs';
import path from 'path';
import ejs from 'ejs';
import { pathToFileURL } from 'url';
import MarkdownIt from "markdown-it";

const diskCache = {pagePath: {}, sharedContent: {}};

export class PageCreator {
	constructor(opts) {
		this.opts = opts;
		this.pages = getPathsSync(this.opts.pagesPath, '');
		this.items = getPathsSync(this.opts.itemsPath, '', ['items']);
		this.notFoundTemplate = fs.readFileSync(this.opts.notFoundTemplatePath).toString();
		this.md = new MarkdownIt();

		// här behöver man kanske lägga in fs.watch för att ladda om pages och items när filer förändras på disk... eller iaf när dom skapas/tas bort
	}

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

	/**
	 * Compile a content, content type and status code for a request
	 * @param {*} req the express request object
	 * @param {string} opts.customPath A custom path used for controller/template/content look up. If not supplied req.path will be used
	 * @returns {*} Response data
	 */
	async createPage(req, {customPath, itemContentTemplateStrings, itemContentHtmlStrings, itemControllerJsString} = {}) {
		const result = {
			status: 200,
			contentType: 'text/html'
		}

		let sharedContent;

		if (diskCache.sharedContent[this.opts.sharedContentPath]) {
			sharedContent = diskCache.sharedContent[this.opts.sharedContentPath];
		} else {
			sharedContent = await this.buildSharedContentTree(this.opts.sharedContentPath);
			diskCache.sharedContent[this.opts.sharedContentPath] = sharedContent;
		}

		let data = {
			viewData: {
				sharedContent,
				content: {},
				activePath: req.path,
				query: req.query,
				jsBundles: this.opts.jsBundles, // todo: these should not be here
				cssBundles: this.opts.cssBundles,
			}
		};

		let pagePath = await this.getPagePath(customPath || req.path);
		let pageRootPath = null;
		let isItem = false;
		let itemName;
		
		if ((this.items[req.path] && path.basename(req.path) !== pagePath.substr(1)) || (pagePath && this.items[pagePath] && (!this.pages[pagePath] ))) {
			pageRootPath = this.items[pagePath];
			isItem = true;
			itemName = path.basename(req.path);
		} else if (pagePath && this.pages[pagePath]) {
			pageRootPath = this.pages[pagePath];
		}

		if (pageRootPath) {
			data.viewData.pageRootPath = pageRootPath;
			let contents;

			if (diskCache[pageRootPath]) {
				contents = diskCache[pageRootPath];
			} else {
				contents = await readDir(pageRootPath);
			}

			if (contents.includes('controller.mjs')) {
				const controllerPath = path.join(pageRootPath, 'controller.mjs');
				let module;
				
				// load controller
				if (itemControllerJsString) {
					// because of reasons javascript is a lot easier to load from disk, so write that shit to file first.
					try {
						const tmpfile = await getTempFilePath();
						fs.writeFileSync(tmpfile, itemControllerJsString, 'utf-8');
						module = await import(pathToFileURL(tmpfile));
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
					controllerResult = await module.controller({...req, path: customPath || req.path}, { ...this.opts, pageCreator: this, controllerPath: pagePath });
				} catch (err) {
					return {
						status: 500,
						contentType: 'text/plain',
						content: `Controller at ${controllerPath} exploded\n${err.stack}`
					}
				}

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
					// if there is no template the content type must be raw otherwise we dont know how to render
					return {
						status: 500,
						contentType: 'text/plain',
						content: `Page path ${pageRootPath} does not have a template and controller did not return raw content.`
					}
				}

				data.viewData = { ...data.viewData, ...controllerResult.viewData };
			}

			if (contents.includes('template.ejs')) {
				// If this is a request for an item, first check in the item dir for a content template
				// and use that if it exits. If that does not exist, check for a content markdown file
				// and render that as html instead.
				let contentPath = pageRootPath;
				if (isItem) {
					contentPath = path.join(pageRootPath, itemName);

					// if this cannot be read we might be at root level
					if (!await canRead(contentPath)) {
						contentPath = pageRootPath;
					}
				}

				let itemContents;

				if (diskCache[contentPath]) {
					itemContents = diskCache[contentPath];
				} else {
					itemContents = await readDir(contentPath);
					diskCache[contentPath] = itemContents;
				}

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

				for (const fileName of itemContents) {
					if (fileName === 'template.ejs') continue;
					if (!['.md', '.json', '.ejs'].includes(path.extname(fileName))) continue;

					const fileNameWithoutExt = fileName.replace(path.extname(fileName), '');

					// injected template, use that instead of template on disk
					if (itemContentTemplateStrings?.[fileNameWithoutExt]) {
						try {
							data.viewData.content[fileNameWithoutExt] = ejs.render(itemContentTemplateStrings?.[fileNameWithoutExt], {...data}, { views: [this.opts.partialsPath], context: req.globals || {}});
							continue;
						} catch (err) {
							return {
								status: 500,
								contentType: 'text/plain',
								content: `Injected EJS ${fileNameWithoutExt} exploded\n${err.stack}`
							}
						}
					}

					if (itemContentHtmlStrings?.[fileNameWithoutExt]) {
						data.viewData.content[fileNameWithoutExt] = itemContentHtmlStrings[fileNameWithoutExt];
						continue;
					}

					const fp = path.join(contentPath, fileName);
					let fileContent;

					if (diskCache[fp]) {
						fileContent = diskCache[fp];
					} else {
						if (await canRead(fp)) {
							try {
								fileContent = await readFile(fp);
								diskCache[fp] = fileContent;
							} catch (err) {
								return {
									status: 500,
									contentType: 'text/plain',
									content: `Failed to read file ${fileName}, : ${err.message}\n${err.stack}`
								}
							}
						}
					}

					if (fileContent) {
						if (fileName.endsWith('.md')) {
							try {
								const html = this.md.render(fileContent.toString());
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
					const views = [pageRootPath, this.opts.partialsPath];

					if (isItem) {
						views.push(path.join(pageRootPath, itemName));
					}

					const templatePath = path.join(pageRootPath,  'template.ejs');
					let templateString;

					if (diskCache[templatePath]) {
						templateString = diskCache[templatePath];
					} else {
						templateString = (await readFile(path.join(pageRootPath,  'template.ejs'))).toString();
						diskCache[templatePath] = templateString;
					}

					const html = ejs.render(templateString, data, { views, context: req.globals || {} });
					result.content = html;
				} catch (err) {
					return {
						status: 500,
						contentType: 'text/plain',
						content: `Template at ${pageRootPath}/template.ejs exploded\n${err.stack}`
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
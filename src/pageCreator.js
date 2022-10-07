import { canRead, getPathsSync, readDir, readFile } from "./utils.js";
import fs from 'fs';
import path from 'path';
import ejs from 'ejs';
import { pathToFileURL } from 'url';
import MarkdownIt from "markdown-it";

export default class PageCreator {
	constructor(opts) {
		this.opts = opts;
		this.pages = getPathsSync(this.opts.pagesPath, '');
		this.items = getPathsSync(this.opts.itemsPath, '', ['items']);
		this.notFoundTemplate = fs.readFileSync(this.opts.notFoundTemplatePath).toString();
		this.md = new MarkdownIt();
	}

	async getPagePath(urlPath) {
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

		return pagePath;
	}

	// todo: cache this
	async getSharedContent() {
		const result = {};

		if (!this.opts?.sharedContentPath) return result;

		const files = await readDir(this.opts.sharedContentPath);
	
		for (const file of files) {
			if (!file.endsWith('.md')) continue;

			const data = await readFile(path.join(this.opts.sharedContentPath, file));
			const html = this.md.render(data.toString());
			result[file.replace('.md', '')] = html;
		}

		return result;
	}

	/**
	 * Compile a content, content type and status code for a request
	 * @param {*} req the express request object
	 * @param {string} opts.customPath A custom path used for controller/template/content look up. If not supplied req.path will be used
	 * @param {function(Object)} opts.beforeRenderCb Can be used to alter the data passed to the render function
	 * @returns {*} Response data
	 */
	async createPage(req, {customPath, beforeRenderCb} = {}) {
		const result = {
			status: 200,
			contentType: 'text/html'
		}

		let data = {
			viewData: {
				content: await this.getSharedContent(),
				activePath: req.path,
				query: req.query,
				jsBundles: this.opts.jsBundles, // todo: these should not be here
				cssBundles: this.opts.cssBundles,
			}
		};

		const pagePath = await this.getPagePath(customPath || req.path);
		let pageRootPath = null;
		let isItem = false;
		let itemName;

		if (pagePath && this.pages[pagePath]) {
			pageRootPath = this.pages[pagePath];
		} else if (pagePath && this.items[pagePath]) {
			pageRootPath = this.items[pagePath];
			isItem = true;
			itemName = path.basename(req.path);
		}

		if (pageRootPath) {
			req.pageRootPath = pageRootPath;
			const contents = await readDir(pageRootPath); // most of the disk reads from this point on could be cached

			if (contents.includes('controller.mjs')) {
				const controllerPath = path.join(pageRootPath, 'controller.mjs');
				const module = await import(pathToFileURL(controllerPath));
				let controllerResult;

				try {
					if (customPath) {
						controllerResult = await module.controller({...req, path: customPath }, { ...this.opts, pageCreator: this });
					} else {
						controllerResult = await module.controller(req, { ...this.opts, pageCreator: this });
					}
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

				if (controllerResult.redirect) { 
					result.redirect = controllerResult.redirect;
					return result;
				}

				if (controllerResult.headers) {
					result.headers = controllerResult.headers;
				}

				if (controllerResult.raw) {
					result.status = controllerResult.raw.status || 200;
					result.contentType = controllerResult.raw.type || 'text/plain';
					result.content = controllerResult.raw.content;
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
				const templateString = (await readFile(path.join(pageRootPath,  'template.ejs'))).toString();

				// If this is a request for an item, first check in the item dir for a content template
				// and use that if it exits. If that does not exist, check for a content markdown file
				// and render that as html instead.
				if (isItem) {
					const ejsPath = path.join(pageRootPath, itemName, 'content.ejs');
					const mdPath = path.join(pageRootPath, itemName, 'content.md');
					if (await canRead(ejsPath)) {
						try {
							const template = await readFile(ejsPath);
							const html = ejs.render(template.toString(), {...data}, { views: [this.opts.partialsPath]});
							data.viewData.itemContent = html;
						} catch (err) {
							return {
								status: 500,
								contentType: 'text/plain',
								content: `EJS at ${ejsPath} exploded\n${err.stack}`
							}
						}
					}
					 else if (await canRead(mdPath)) {
						try {
							const md = await readFile(mdPath);
							const html = this.md.render(md.toString());
							data.viewData.itemContent = html;
						} catch (err) {
							return {
								status: 500,
								contentType: 'text/plain',
								content: `Markdown at ${mdFilePath} exploded\n${err.stack}`
							}
						}
					}
				} else {
					for (const filename of contents.filter(n => n.endsWith('.md'))) {
						const mdFilePath = path.join(pageRootPath, filename);
						try {
							const md = await readFile(mdFilePath);
							const html = this.md.render(md.toString());
							
							if (!data.viewData.content) data.viewData.content = {};

							data.viewData.content[filename.replace('.md', '')] = html;
						} catch (err) {
							return {
								status: 500,
								contentType: 'text/plain',
								content: `Markdown at ${mdFilePath} exploded\n${err.stack}`
							}
						}
					}
				} 

				if (beforeRenderCb) {
					data = await beforeRenderCb(data);
				}

				try {
					const views = [pageRootPath, this.opts.partialsPath];

					if (isItem) {
						views.push(path.join(pageRootPath, itemName));
					}

					const html = ejs.render(templateString, data, { views });
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
			content: ejs.render(this.notFoundTemplate, data, { views: [this.opts.partialsPath] })
		}
	}
}
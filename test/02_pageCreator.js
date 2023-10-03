import test from 'node:test';
import assert from 'node:assert/strict';
import {PageCreator} from '../src/index.js';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const options = {
	pagesPath: path.join(__dirname, 'data/02/pages'),
	itemsPath: path.join(__dirname, 'data/02/items'),
	partialsPath: path.join(__dirname, 'data/02/partials'),
	rootPagePath: '/home',
	notFoundTemplatePath: path.join(__dirname, 'data/notFound.ejs')
};


test('Page creator, override item content', async t => {
	const pc = new PageCreator(options);
	const req = {
		path: '/stuff/item1'
	};
	const result = await pc.createPage(req, { itemContentFilesOverrides: { 'content.md': '## some shit' }});

	assert(result, 'Result should not be null or undefined');
	assert.strictEqual(result.status, 200, 'Status code should be 200');
	assert(result.contentType, 'Content type should be set');
	assert.strictEqual(result.contentType, 'text/html', 'Content type should be text/hml');
	assert(result.content, 'Content should be set');
	assert(result.content.includes('<h2>some shit</h2>'), 'Content should include the injected content string');
});


test('Page creator, override item template', async t => {
	const pc = new PageCreator(options);
	const req = {
		path: '/stuff/item2'
	};
	const newContent = '<p><%= viewData.title %></p>';
	const result = await pc.createPage(req, { itemContentFilesOverrides: { 'template.ejs': newContent }});

	assert(result, 'Result should not be null or undefined');
	assert.strictEqual(result.status, 200, 'Status code should be 200');
	assert(result.contentType, 'Content type should be set');
	assert.strictEqual(result.contentType, 'text/html', 'Content type should be text/hml');
	assert(result.content, 'Content should be set');
	assert(result.content.includes('<p>stuff item controller</p>'), 'Content should include the injected template string');
});


test('Page creator, override item controller', async t => {
	const pc = new PageCreator(options);
	const req = {
		path: '/bar/foo'
	};
	const newContent =  `
		async function controller (req) {
			return {
				viewData: {
					title: 'dynamic controller!',
				}
			};
		}
		
		export {controller}
	`;

	const result = await pc.createPage(req, { itemContentFilesOverrides: { 'controller.mjs': newContent }});

	assert(result, 'Result should not be null or undefined');
	assert.strictEqual(result.status, 200, 'Status code should be 200');
	assert(result.contentType, 'Content type should be set');
	assert.strictEqual(result.contentType, 'text/html', 'Content type should be text/html');
	assert(result.content, 'Content should be set');
	assert.strictEqual(result.content, '<h1>dynamic controller!</h1>', 'Controller dynamic content should be in the result');
});

test('Page create should pass the controller its own path', async t => {
	const pc = new PageCreator(options);
	const req = {
		path: '/bar/foo'
	};
	const newContent =  `
		async function controller (req, opts) {
			return {
				raw: {
					content: opts.controllerPath,
				}
			};
		}
		
		export {controller}
	`;

	const result = await pc.createPage(req, { itemContentFilesOverrides: {'controller.mjs': newContent }});

	assert(result, 'Result should not be null or undefined');
	assert.strictEqual(result.status, 200, 'Status code should be 200');
	assert(result.contentType, 'Content type should be set');
	assert.strictEqual(result.contentType, 'text/plain', 'Content type should be text/plain');
	assert(result.content, 'Content should be set');
	assert.strictEqual(result.content, '/bar', 'Controller dynamic content should be the controller path');
});
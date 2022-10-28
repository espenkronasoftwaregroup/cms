import test from 'tape';
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
	const newContent = '<h2>new shiny content</h2>';
	const result = await pc.createPage(req, { itemContentHtmlStrings: { content: newContent }});

	t.assert(result, 'Result should not be null or undefined');
	t.equal(result.status, 200, 'Status code should be 200');
	t.assert(result.contentType, 'Content type should be set');
	t.equal(result.contentType, 'text/html', 'Content type should be text/hml');
	t.assert(result.content, 'Content should be set');
	t.true(result.content.includes('<h2>new shiny content</h2>'), 'Content should include the injected content string');
});

test('Page creator, override item template', async t => {
	const pc = new PageCreator(options);
	const req = {
		path: '/stuff/item2'
	};
	const newContent = '<p><%= viewData.title %></p>';
	const result = await pc.createPage(req, { itemContentTemplateStrings: { content: newContent }});

	t.assert(result, 'Result should not be null or undefined');
	t.equal(result.status, 200, 'Status code should be 200');
	t.assert(result.contentType, 'Content type should be set');
	t.equal(result.contentType, 'text/html', 'Content type should be text/hml');
	t.assert(result.content, 'Content should be set');
	t.true(result.content.includes('<p>stuff item controller</p>'), 'Content should include the injected template string');
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

	const result = await pc.createPage(req, { itemControllerJsString: newContent });

	t.assert(result, 'Result should not be null or undefined');
	t.equal(result.status, 200, 'Status code should be 200');
	t.assert(result.contentType, 'Content type should be set');
	t.equal(result.contentType, 'text/html', 'Content type should be text/html');
	t.assert(result.content, 'Content should be set');
	t.equal(result.content, '<h1>dynamic controller!</h1>', 'Controller dynamic content should be in the result');
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

	const result = await pc.createPage(req, { itemControllerJsString: newContent });

	t.assert(result, 'Result should not be null or undefined');
	t.equal(result.status, 200, 'Status code should be 200');
	t.assert(result.contentType, 'Content type should be set');
	t.equal(result.contentType, 'text/plain', 'Content type should be text/plain');
	t.assert(result.content, 'Content should be set');
	t.equal(result.content, '/bar', 'Controller dynamic content should be the controller path');
});
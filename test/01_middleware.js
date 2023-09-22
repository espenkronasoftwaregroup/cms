import test from 'node:test';
import assert from "node:assert/strict";
import {cmsMiddlewareFactory} from '../src/index.js';
import express from 'express';
import path, {dirname} from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const options = {
	pagesPath: path.join(__dirname, 'data/01/pages'),
	itemsPath: path.join(__dirname, 'data/01/items'),
	partialsPath: path.join(__dirname, 'data/01/partials'),
	rootPagePath: '/home',
	notFoundTemplatePath: path.join(__dirname, 'data/notFound.ejs')
};

async function get(t, url, expectedStatusCode = 200, followRedirects = true) {

	let status;

	const response = await axios.get(url, {
		maxRedirects: followRedirects ? 5 : 0,
		validateStatus: (s) => {
			status = s;
			return true;
		},
		responseType: 'text', 
		transformResponse: x => x // axios can get fucked. If the response is text/plain it SHOULD NOT BE PARSED!
	});

	assert(status, expectedStatusCode, `Request to ${url} should return ${expectedStatusCode} status code`);
	const body = await response.data;
	assert.notEqual(body, null, 'Body should not be null');
	assert.notEqual(body, undefined, 'Body should not be undefined');
	assert.notEqual(body, '', 'Body should not be empty string');
	return body;
}

test('Pages', async t => {

	const app = express();
	app.all('*', cmsMiddlewareFactory(options));

	const server = app.listen();

	const body = await get(t, `http://localhost:${server.address().port}`);
	assert(body.includes('title: test'), 'Body should include text from both template and controller');
	assert(body.includes('h1: hello cms'), 'Body should include text from both template and controller');
	assert(body.includes('partial: partial'), 'Body should include text from partial template');

	const body2 = await get(t, `http://localhost:${server.address().port}/home`);
	assert(body2.includes('title: test'), 'Body should include text from both template and controller');
	assert(body2.includes('h1: hello cms'), 'Body should include text from both template and controller');
	assert(body2.includes('partial: partial'), 'Body should include text from partial template');

	const body3 = await get(t, `http://localhost:${server.address().port}/about`);
	assert(body3.includes('about stuff'), 'Body should include text from about template');

	const body4 = await get(t, `http://localhost:${server.address().port}/nonexisting`, 404);
	assert(body4.includes('not found'), 'Body should include text from notFound template');

	server.close();
});

test('Items', async t => {
	const app = express();
	app.all('*', cmsMiddlewareFactory(options));

	const server = app.listen();

	const body = await get(t, `http://localhost:${server.address().port}/stuff/item1`, 200);
	//assert(body.includes('stuff item'), 'Body should include text from item root template');
	assert(body.includes('<h2>item1</h2>'), 'Body should include markdown rendered to html');
	assert(body.includes('stuff item controller'), 'Item 1 body should include text from controller');

	const body2 = await get(t, `http://localhost:${server.address().port}/stuff/item2`, 200);
	assert(body2.includes('item 2'), 'Should include text from item2 template');
	assert(body2.includes('partial'), 'Should include text from partial template');
	assert(body2.includes('stuff item controller'), 'Item 2 body should include text from controller');

	const body3 = await get(t, `http://localhost:${server.address().port}/stuff/item3`, 200);
	assert(body3.includes('stuff item controller'), 'Body should include text from controller');
	assert(body3.includes('{"key":"gloroius data"}'), 'Item 3 body should contain data from data.json');

	server.close();
});


test('Item root content', async t => {
	const app = express();
	app.all('*', cmsMiddlewareFactory(options));

	const server = app.listen();

	const body = await get(t, `http://localhost:${server.address().port}/stuff`, 200);
	assert(body.includes('stuff item'), 'Body should include text from item root template');
	assert(body.includes('stuff item controller'), 'Body should include text from controller');
	assert(body.includes('root content'), 'Body should include content from root');

	server.close();
});

test('Page takes precedense over items at root level', async t => {
	const app = express();
	app.all('*', cmsMiddlewareFactory(options));

	const server = app.listen();

	const body = await get(t, `http://localhost:${server.address().port}/products/item1`, 200);
	assert.strictEqual('products\r\nproducts/item1', body);

	const body2 = await get(t, `http://localhost:${server.address().port}/products`, 200);
	assert.strictEqual(false, body2.includes('this should not be shown'));
	assert.strictEqual('products page', body2);

	server.close();
});

test('Shared content', async t => {
	const app = express();
	app.all('*', cmsMiddlewareFactory({
		...options,
		sharedContentPath: path.join(__dirname, 'data/01/sharedContent'),
	}));

	const server = app.listen();

	// page
	const body = await get(t, `http://localhost:${server.address().port}/things`, 200);
	assert(body.includes('<h2>some shared info</h2>'), 'Body should include markdown-to-html from sharedInfo.md');
	assert(body.includes('<p>Mf quote</p>'), 'Body should contain shared template content');
	assert(body.includes('{"data":"data is the best"}'), 'Body should include shared data content');

	// item
	const body2 = await get(t, `http://localhost:${server.address().port}/baz/boz`, 200);
	assert(body2.includes('<h2>some shared info</h2>'), 'Body2 should include markdown-to-html from sharedInfo.md');
	assert(body2.includes('<p>Mf quote</p>'), 'Body2 should contain shared template content');
	assert(body2.includes('{"data":"data is the best"}'), 'Body2 should include shared data content');

	server.close();
});

test('Controller redirct', async t => {
	const app = express();
	app.all('*', cmsMiddlewareFactory(options));

	const server = app.listen();

	const body = await get(t, `http://localhost:${server.address().port}/redirect`, 302, false);
	assert.strictEqual(body, 'Found. Redirecting to /home', 'Body should indicate where to redirect');

	// redirects to /home
	const body2 = await get(t, `http://localhost:${server.address().port}/redirect`);
	assert(body2.includes('title: test'), 'Body should include text from both template and controller');
	assert(body2.includes('h1: hello cms'), 'Body should include text from both template and controller');
	assert(body2.includes('partial: partial'), 'Body should include text from partial template');

	server.close();
});

test('Controller redirct moved', async t => {
	const app = express();
	app.all('*', cmsMiddlewareFactory(options));

	const server = app.listen();

	const body = await get(t, `http://localhost:${server.address().port}/redirectMoved`, 301, false);
	assert.strictEqual(body, 'Moved Permanently. Redirecting to /home', 'Body should indicate where to redirect');

	// redirects to /home
	const body2 = await get(t, `http://localhost:${server.address().port}/redirectMoved`);
	assert(body2.includes('title: test'), 'Body should include text from both template and controller');
	assert(body2.includes('h1: hello cms'), 'Body should include text from both template and controller');
	assert(body2.includes('partial: partial'), 'Body should include text from partial template');

	server.close();
});

test('Controller headers', async t => {
	const app = express();
	app.all('*', cmsMiddlewareFactory(options));

	const server = app.listen();

	const response = await axios.get(`http://localhost:${server.address().port}/headers`);
	assert.strictEqual(response.status, 200, 'Response status should be 200');
	const value = response.headers.get('X-Test');
	assert(value, 'Header value should not be null or undefined');
	assert.strictEqual(value, 'header value');

	server.close();
});

test('Controller, no template', async t => {
	const app = express();
	app.all('*', cmsMiddlewareFactory(options));

	const server = app.listen();

	const response = await axios.get(`http://localhost:${server.address().port}/raw`);
	assert.strictEqual(200, response.status, 'Response status should be 200');
	assert.strictEqual(response.headers.get('content-type'), 'text/plain', 'Content type should be text/plain');
	// Axios cannot accept that this should be treated as texassert. Fuck axios
	assert.strictEqual(JSON.stringify(response.data), '{"one":"yes","two":"no"}', 'Body should contain strigified json');

	server.close();
});

test('Controller, json', async t => {
	const app = express();
	app.all('*', cmsMiddlewareFactory(options));

	const server = app.listen();

	const response = await axios.get(`http://localhost:${server.address().port}/rawJson`);
	assert.strictEqual(200, response.status, 'Response status should be 200');
	assert.strictEqual(response.headers.get('content-type'), 'application/json', 'Content type should be application/json');
	assert(response.data, 'Body should not be null or undefined');
	assert.strictEqual(response.data.one, 'yes', 'Body.one should contain "yes"');
	assert.strictEqual(response.data.two, 'no', 'Body.two should contain "two"');

	server.close();
});

test('Controller, cookies', async t => {
	const app = express();
	app.all('*', cmsMiddlewareFactory(options));

	const server = app.listen();

	const response = await axios.get(`http://localhost:${server.address().port}/cookies`);
	assert.strictEqual(200, response.status, 'Response status should be 200');
	assert.strictEqual(response.headers.get('content-type'), 'text/plain', 'Content type should be text/plain');
	assert.strictEqual(response.data, 'cookie set', 'Body should be "cookie set"');
	assert.strictEqual(response.headers.get('set-cookie'), 'key=value; Path=/');
	
	server.close();
});

test('Global variables', async t => {
	const app = express();
	app.all('*', (req, res, next) => {
		req.globals = { glory: 'halleluljah '};
		next();
	}, cmsMiddlewareFactory({...options}));

	const server = app.listen();

	const response = await axios.get(`http://localhost:${server.address().port}/globals`);
	assert.strictEqual(200, response.status, 'Response status should be 200');
	assert.strictEqual('hej\r\nhalleluljah \r\npartial', response.data, 'Data should contain stuff from global variables');

	server.close();
});

test('Page with data content', async t => {
	const app = express();
	app.all('*', cmsMiddlewareFactory({...options}));

	const server = app.listen();

	const response = await axios.get(`http://localhost:${server.address().port}/datapage`);
	assert.strictEqual(200, response.status, 'Response status should be 200');
	assert.strictEqual('content', response.data, 'Template should print data from json file');

	server.close();
});

test('When controller sets the softNotFound the not found template should be rendered and returned', async t => {
	const app = express();
	app.all('*', cmsMiddlewareFactory({...options}));

	const server = app.listen();

	const response = await axios.get(`http://localhost:${server.address().port}/softNotFound`, { maxRedirects: 0, validateStatus: () => true });
	assert.strictEqual(404, response.status, 'Response status should be 404');
	assert.strictEqual('not found', response.data, 'Response should equal the contents of the not found template');

	server.close();
});

test('Returning a contentStream', async t => {
	const app = express();
	app.all('*', cmsMiddlewareFactory({...options}));

	const server = app.listen();

	const response = await axios.get(`http://localhost:${server.address().port}/contentStream`, { maxRedirects: 0, validateStatus: () => true });

	assert.strictEqual(response.status, 200, 'Response status should be 200');
	assert.strictEqual(response.headers['content-type'], 'text/javascript', 'Response type should be text/javascript');
	assert.strictEqual(response.data.length, 248, 'Response data length should be the same as test/data/01/pages/contentStream/controller.mjs file');

	server.close();
});
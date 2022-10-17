import test from 'tape';
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

	t.equal(status, expectedStatusCode, `Request to ${url} should return ${expectedStatusCode} status code`);
	const body = await response.data;
	t.assert(body, 'Body should not be null or undefined');
	t.notEqual(body, '', 'Body should not be an empty string');
	return body;
}

test('Pages', async t => {

	const app = express();
	app.all('*', cmsMiddlewareFactory(options));

	const server = app.listen();

	const body = await get(t, `http://localhost:${server.address().port}`);
	t.true(body.includes('title: test'), 'Body should include text from both template and controller');
	t.true(body.includes('h1: hello cms'), 'Body should include text from both template and controller');
	t.true(body.includes('partial: partial'), 'Body should include text from partial template');

	const body2 = await get(t, `http://localhost:${server.address().port}/home`);
	t.true(body2.includes('title: test'), 'Body should include text from both template and controller');
	t.true(body2.includes('h1: hello cms'), 'Body should include text from both template and controller');
	t.true(body2.includes('partial: partial'), 'Body should include text from partial template');

	const body3 = await get(t, `http://localhost:${server.address().port}/about`);
	t.true(body3.includes('about stuff'), 'Body should include text from about template');

	const body4 = await get(t, `http://localhost:${server.address().port}/nonexisting`, 404);
	t.true(body4.includes('not found'), 'Body should include text from notFound template');

	server.close();
	t.end();
});

test('Items', async t => {
	const app = express();
	app.all('*', cmsMiddlewareFactory(options));

	const server = app.listen();

	const body = await get(t, `http://localhost:${server.address().port}/stuff/item1`, 200);
	t.true(body.includes('stuff item'), 'Body should include text from item root template');
	t.true(body.includes('<h2>item1</h2>'), 'Body should include markdown rendered to html');
	t.true(body.includes('stuff item controller'), 'Body should include text from controller');

	const body2 = await get(t, `http://localhost:${server.address().port}/stuff/item2`, 200);
	t.true(body2.includes('item 2'), 'Should include text from item2 template');
	t.true(body2.includes('partial'), 'Should include text from partial template');
	t.true(body2.includes('stuff item controller'), 'Body should include text from controller');

	const body3 = await get(t, `http://localhost:${server.address().port}/stuff/item3`, 200);
	t.true(body3.includes('stuff item controller'), 'Body should include text from controller');
	t.true(body3.includes('{"data":"gloroius data"}'), 'Body should contain data from data.json');

	server.close();
	t.end();
});

test('Item root content', async t => {
	const app = express();
	app.all('*', cmsMiddlewareFactory(options));

	const server = app.listen();

	const body = await get(t, `http://localhost:${server.address().port}/stuff`, 200);
	t.true(body.includes('stuff item'), 'Body should include text from item root template');
	t.true(body.includes('stuff item controller'), 'Body should include text from controller');
	t.true(body.includes('root content'), 'Body should include content from root');

	server.close();
	t.end();
})

test('Shared content', async t => {
	const app = express();
	app.all('*', cmsMiddlewareFactory({
		...options,
		sharedContentPath: path.join(__dirname, 'data/01/sharedContent'),
	}));

	const server = app.listen();

	const body = await get(t, `http://localhost:${server.address().port}/things`, 200);
	t.true(body.includes('<h2>some shared info</h2>'), 'Body should include markdown-to-html from sharedInfo.md');

	server.close();
	t.end();
});

test('Controller redirct', async t => {
	const app = express();
	app.all('*', cmsMiddlewareFactory(options));

	const server = app.listen();

	const body = await get(t, `http://localhost:${server.address().port}/redirect`, 302, false);
	t.equal(body, 'Found. Redirecting to /home', 'Body should indicate where to redirect');

	// redirects to /home
	const body2 = await get(t, `http://localhost:${server.address().port}/redirect`);
	t.true(body2.includes('title: test'), 'Body should include text from both template and controller');
	t.true(body2.includes('h1: hello cms'), 'Body should include text from both template and controller');
	t.true(body2.includes('partial: partial'), 'Body should include text from partial template');

	server.close();
	t.end();
});

test('Controller headers', async t => {
	const app = express();
	app.all('*', cmsMiddlewareFactory(options));

	const server = app.listen();

	const response = await axios.get(`http://localhost:${server.address().port}/headers`);
	t.equal(response.status, 200, 'Response status should be 200');
	const value = response.headers.get('X-Test');
	t.assert(value, 'Header value should not be null or undefined');
	t.equal(value, 'header value');

	server.close();
	t.end();
});

test('Controller, no template', async t => {
	const app = express();
	app.all('*', cmsMiddlewareFactory(options));

	const server = app.listen();

	const response = await axios.get(`http://localhost:${server.address().port}/raw`);
	t.equal(200, response.status, 'Response status should be 200');
	t.equal(response.headers.get('content-type'), 'text/plain', 'Content type should be text/plain');
	// Axios cannot accept that this should be treated as text. Fuck axios
	t.equal(JSON.stringify(response.data), '{"one":"yes","two":"no"}', 'Body should contain strigified json');

	server.close();
	t.end();
});

test('Controller, json', async t => {
	const app = express();
	app.all('*', cmsMiddlewareFactory(options));

	const server = app.listen();

	const response = await axios.get(`http://localhost:${server.address().port}/rawJson`);
	t.equal(200, response.status, 'Response status should be 200');
	t.equal(response.headers.get('content-type'), 'application/json', 'Content type should be application/json');
	t.assert(response.data, 'Body should not be null or undefined');
	t.equal(response.data.one, 'yes', 'Body.one should contain "yes"');
	t.equal(response.data.two, 'no', 'Body.two should contain "two"');

	server.close();
	t.end();
});

test('Controller, cookies', async t => {
	const app = express();
	app.all('*', cmsMiddlewareFactory(options));

	const server = app.listen();

	const response = await axios.get(`http://localhost:${server.address().port}/cookies`);
	t.equal(200, response.status, 'Response status should be 200');
	t.equal(response.headers.get('content-type'), 'text/plain', 'Content type should be text/plain');
	t.equal(response.data, 'cookie set', 'Body should be "cookie set"');
	t.equal(response.headers.get('set-cookie'), 'key=value; Path=/');
	
	server.close();
	t.end();
});

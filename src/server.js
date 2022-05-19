import express from 'express';
import cookieParser from 'cookie-parser';
import bodyParser from 'body-parser';
import fileUpload from 'express-fileupload';
import PageCreator from './pageCreator.js';
import { bundleJavascripts, bundleSass } from './utils.js';


/*
const optsExample = {
	cookieSecret: 'secret',
	logger: console, // should use the same interface as console
	maxUploadSize: 50 * 1024 * 1024,
	middlewares: {
		// all http verbs
		all: {
			'/resources*': async (req, res, next) => { console.log('hello static resource'); next(); }
		}
	},
	paths: {
		notFoundTemplatePath: '', //path.join(__dirname, 'data', 'notfound.ejs'), // todo: paths to all error templates
		rootPagePath: '/home', // path to page will be used when requesting /
		pagesPath: path.join(__dirname, 'data', 'pages'),
		itemsPath: path.join(__dirname, 'data', 'items'),
		partialsPath: path.join(__dirname, 'data', 'partials'),
		sharedContentPath: path.join(__dirname, 'data', 'content'),
		jsPath: path.join(__dirname, 'data', 'javascript'),
		sassPath: path.join(__dirname, 'data', 'scss')
	},
	port: 3000,
} */

export default class Server {
	constructor(opts) {
		if (!opts) throw new Error('Some options are required');
		if (!opts.paths) throw new Error('Path options are required');

		this.opts = opts;

		if (!this.opts.logger) this.opts.logger = console;
		if (!this.opts.port) this.opts.port = 3000;
		if (!this.opts.maxUploadSize) this.opts.maxUploadSize = 50 * 1024 * 1024;
		if (!this.opts.cookieSecret) this.opts.cookieSecret = 'change this';

		this.opts = opts;

		this.app = express();

		this.pageCreator = new PageCreator({
			...this.opts.paths,
			jsBundles: this.opts.jsFiles ? bundleJavascripts(this.opts.jsFiles.input, this.opts.jsFiles.output) : [],
			cssBundles: this.opts.scssFiles ? bundleSass(this.opts.scssFiles.input, this.opts.scssFiles.output) : [],
		});

		this.app.use(bodyParser.json());
		this.app.use(bodyParser.urlencoded({ extended: true }));
		this.app.use(bodyParser.text());
		this.app.use(fileUpload({ limits: { fileSize: this.opts.maxUploadSize}}));
		this.app.use(cookieParser(this.opts.cookieSecret));
		this.app.use('/resources', express.static(this.opts.paths.publicPath, { maxAge: 3600000 }));

		if (this.opts.middlewares?.get) {
			for (const [key, value] of Object.entries(this.opts.middlewares.get)) {
				this.app.get(key, value);
			}
		}

		if (this.opts.middlewares?.post) {
			for (const [key, value] of Object.entries(this.opts.middlewares.post)) {
				this.app.post(key, value);
			}
		}

		if (this.opts.middlewares?.all) {
			for (const [key, value] of Object.entries(this.opts.middlewares.all)) {
				this.app.all(key, value);
			}
		}

		this.app.all('*', async (req, res, next) => {
			req.paths = this.opts.paths;
			req.pageCreator = this.pageCreator;

			// ignore anything regarding the static files and let express handle that
			if (req.path.startsWith('/resources')) {
				next();
				return;
			}

			const result = await this.pageCreator.createPage(req);

			if (!result) throw new Error('someone shit the bed!');

			if (result.cookie) {
				for (const key in result.cookie) {
					if (result.cookie[key] === false) {
						res.clearCookie(key);
					} else {
						res.cookie(key, String(result.cookie[key]), { signed: false }); // todo: you should be able to choose wether to sign or not
					}
				} 
			}

			if (result.redirect) {
				res.redirect(result.redirect);
				return;
			}

			if (result.headers) {
				for (const [key, value] of Object.entries(result.headers)) {
					res.setHeader(key, value);
				}
			}

			res.status(result.status);
			res.setHeader('Content-Type', result.contentType);
			res.end(result.content);
		});
	}

	start() {
		this.app.listen(this.opts.port, () => {
			this.opts.logger.info('Now listening on port ' + this.opts.port);
		});
	}
}

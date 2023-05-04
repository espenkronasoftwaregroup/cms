import express from 'express';
import cookieParser from 'cookie-parser';
import bodyParser from 'body-parser';
import {cmsMiddlewareFactory} from 'cms';

const app = express();

// apply some standard express middlewares
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.text());
app.use(cookieParser('your_secret_string'));
app.use('/resources', express.static('site/public', { maxAge: 3600000 }));

// apply other middlewares here as needed

// set global stuff that will be available in the render scope
app.all(/\/((?!resources).)*/, async (req, res, next) => {
	req.globals = {
		title: 'My cool title'
	}
});

// apply the cms middleware to all paths except the public
app.all(/\/((?!resources).)*/, async (req, res, next) => {
	const mv = cmsMiddlewareFactory({
		itemsPath: 'site/items',
		logger: console.log,
		notFoundTemplatePath: 'site/not_found.ejs',
		pagesPath: 'site/pages',
		partialsPath: 'site/partials',
		sharedContentPath: 'site/shared',
		rootPagePath: '/home',
		jsBundles: this.opts.jsFiles ? bundleJavascripts(this.opts.jsFiles.input, this.opts.jsFiles.output, this.isDevEnv(), !this.isDevEnv()) : [],
		cssBundles: this.opts.scssFiles ? bundleSass(this.opts.scssFiles.input, this.opts.scssFiles.output, this.isDevEnv(), !this.isDevEnv()) : [],
	});

	await mv(req, res, next);
});

app.listen(3000);


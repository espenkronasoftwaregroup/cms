import {PageCreator} from "./pageCreator.js"

function cmsMiddlewareFactory(opts) {
	const pageCreator = new PageCreator(opts);

	return async function cmsMiddleware(req, res, next) {
		const result = await pageCreator.createPage(req);

		if (!result) {
			next();
			return;
		}

		// use of cookies requires cookie-parser plugin
		if (result.cookie && res.clearCookie && res.cookie) {
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
	}
}

export {cmsMiddlewareFactory};
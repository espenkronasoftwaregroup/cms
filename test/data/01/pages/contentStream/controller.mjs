import fs from 'fs';

async function controller (req) {
	return {
		raw: {
            type: 'text/javascript',
			contentStream: fs.createReadStream(process.cwd() + '/test/data/01/pages/contentStream/controller.mjs')
		}
	};
}

export {controller}
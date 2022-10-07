async function controller (req) {
	return {
		viewData: {
			title: 'test',
			h1: 'hello cms'
		}
	};
}

export {controller}
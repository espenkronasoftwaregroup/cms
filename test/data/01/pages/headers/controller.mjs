async function controller (req) {
	return {
		viewData: { 
			title: 'headers set'
		},
		headers: {
			'X-Test': 'header value'
		}
	};
}

export {controller}
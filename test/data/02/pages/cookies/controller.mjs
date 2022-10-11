async function controller (req) {
	return {
		raw: { 
			content: 'cookie set'
		},
		cookie: {
			key: 'value'
		}
	};
}

export {controller}
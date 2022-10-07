async function controller (req) {
	return {
		raw: {
			content: JSON.stringify({
				one: 'yes',
				two: 'no'
			}),
			type: 'application/json'
		}
	};
}

export {controller}
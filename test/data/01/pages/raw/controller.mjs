async function controller (req) {
	return {
		raw: {
			content: JSON.stringify({
				one: 'yes',
				two: 'no'
			})
		}
	};
}

export {controller}
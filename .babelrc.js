module.exports = (api) => {
	api.cache.using(() => process.env.NODE_ENV); // This caches the Babel config
	const isTest = api.env('test');

	return {
		...(isTest && { targets: { node: 'current' } }),
		presets: [
			[
				'@babel/preset-env',
				{ bugfixes: true }, // TODO: Remove when Babel 8
			],
			'@babel/preset-typescript',
			'@babel/preset-react',
		],
	};
};

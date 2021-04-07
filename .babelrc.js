module.exports = (api) => {
	api.cache.using(() => process.env.NODE_ENV); // This caches the Babel config
	const isTest = api.env('test');

	return {
		plugins: [
			'@babel/plugin-proposal-class-properties',
		],
		presets: [
			[
				'@babel/preset-env',
				{
					bugfixes: true, // TODO: Remove when Babel 8
					targets: !isTest ? undefined : { node: 'current' },
				},
			],
			'@babel/preset-typescript',
			'@babel/preset-react',
		],
	};
};

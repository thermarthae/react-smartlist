module.exports = {
	plugins: [
		'@babel/plugin-proposal-class-properties',
	],
	presets: [
		[
			'@babel/preset-env',
			{
				bugfixes: true, // TODO: Remove when Babel 8
			},
		],
		'@babel/preset-typescript',
		'@babel/preset-react',
	],
};

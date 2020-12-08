module.exports = {
	extends: ['@thermarthae/eslint-config'],
	ignorePatterns: [
		'.yarn/*',
	],
	rules: {
		'linebreak-style': ['error', 'windows'],
	},
};

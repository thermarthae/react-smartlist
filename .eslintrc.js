module.exports = {
	extends: ['@thermarthae/eslint-config'],
	ignorePatterns: [
		'.yarn/*',
	],
	rules: {
		'linebreak-style': ['error', 'windows'],
		'react/react-in-jsx-scope': 0,
	},
};

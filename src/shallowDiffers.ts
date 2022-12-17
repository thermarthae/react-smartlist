function shallowDiffers<T extends object>(objA?: T, objB?: T) {
	if (objA === objB) return false;

	if (typeof objA !== typeof objB) return true;

	// TypeScript bug - neither `objA` nor `objB` can be undefined here
	for (const key in objA) { // eslint-disable-line no-restricted-syntax
		if (!(key in objB!)) return true;
	}
	for (const key in objB) { // eslint-disable-line no-restricted-syntax
		if (objA![key] !== objB[key]) return true;
	}

	return false;
}

export default shallowDiffers;

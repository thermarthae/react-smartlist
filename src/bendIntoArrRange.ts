function bendIntoArrRange(arr: readonly any[], value: number) {
	const min = Math.min(arr.length - 1, value);
	return (min > 0) ? min : 0;
}

export default bendIntoArrRange;

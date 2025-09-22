# @thermarthae/react-smartlist

[![Version Badge][npm-version-svg]][package-url]
[![GZipped size][npm-minzip-svg]][bundlephobia-url]
[![License][license-image]][license-url]
[![Downloads][downloads-image]][downloads-url]

A tiny React helper for large lists that renders only items currently visible in the viewport using window scrolling.

- Zero external layout libraries - straight ResizeObserver + measurement cache.
- Uses React's [scheduler][scheduler-url] to prioritize scroll-driven updates and avoid redundant rerenders.
- Optimized for minimal reflows and scroll jump prevention.

### Try it on StackBlitz:

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/edit/react-smartlist?file=src%2FApp.tsx)

## Installation

```sh
npm install @thermarthae/react-smartlist
```

## Quick usage

```tsx
import { memo } from 'react';
import VirtualList, { type TItemProps } from '@thermarthae/react-smartlist';

type TRowData = { id: number; text: string };

const dataArr: TRowData[] = Array.from({ length: 1000 }, (_, i) => ({ id: i, text: `Item ${i}` }));

const Row = memo(({ rootElProps, data }: TItemProps<TRowData>) => (
  <div {...rootElProps}>
    <span>{data.text}</span>
  </div>
));

export default function Example() {
  return (
    <VirtualList
      component={Row}
      items={dataArr}
      estimatedItemHeight={50}
      overscanPadding={100} // optional, defaults to 20
    />
  );
}
```

## Props

| Name                    | Description |
| ----------------------- | ----------- |
| **component**           | Component used to render each item. Receives TItemProps. |
| **items**               | Full dataset (all items). Each item must have unique `id`. |
| **estimatedItemHeight** | Estimated height used before measurement. Should approximate actual item height. |
| **overscanPadding?**    | Extra pixels above/below viewport to render (reduces flicker). |
| **className?**          | Root element className. |
| **sharedProps?**        | Props passed to every rendered item. |
| **initState?**          | Advanced: override initial internal state (use with caution). |
| **disableMeasurment?**  | When true, measurement is disabled and estimatedItemHeight is used for all items (useful for uniform-height lists). |
| **onScroll?**           | Optional hook called on scroll with window edges info. |
| **style?**              | Inline styles for root element. |

## License

This project is [MIT][license-url] licensed.

[package-url]: https://npmjs.org/package/@thermarthae/react-smartlist
[npm-version-svg]: https://img.shields.io/npm/v/@thermarthae/react-smartlist.svg
[npm-minzip-svg]:
  https://img.shields.io/bundlephobia/minzip/@thermarthae/react-smartlist.svg
[bundlephobia-url]:
  https://bundlephobia.com/result?p=@thermarthae/react-smartlist
[license-image]: https://img.shields.io/npm/l/@thermarthae/react-smartlist.svg
[license-url]: LICENSE.md
[downloads-image]: https://img.shields.io/npm/dm/@thermarthae/react-smartlist.svg
[downloads-url]:
  https://npm-stat.com/charts.html?package=@thermarthae/react-smartlist
[scheduler-url]:
  https://www.npmjs.com/package/scheduler

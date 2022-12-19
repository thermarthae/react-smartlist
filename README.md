# @thermarthae/react-smartlist

[![Version Badge][npm-version-svg]][package-url]
[![GZipped size][npm-minzip-svg]][bundlephobia-url]
[![License][license-image]][license-url]
[![Downloads][downloads-image]][downloads-url]

React helper component that uses window scrolling to render only currently visible list elements.

Uses React's internal [scheduler](https://www.npmjs.com/package/scheduler) to prevent redundant rerenders and prioritize most recent scroll events.

## Installation

Install using [Yarn](https://yarnpkg.com):

```sh
yarn add @thermarthae/react-smartlist
```

or NPM:

```sh
npm install @thermarthae/react-smartlist --save
```

## Example

### Interactive Typescript example:

[![Edit @thermarthae/react-smartlist example](https://codesandbox.io/static/img/play-codesandbox.svg)](https://codesandbox.io/s/thermarthae-react-smartlist-example-hf48l?fontsize=14&hidenavigation=1&theme=dark)


### Basic example:
```tsx
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import VirtualList from '@thermarthae/react-smartlist';

const ListItem = React.memo(({
  rootElProps,
  innerRef,
  data,
}) => (
  <div
    {...rootElProps}
    ref={innerRef}
    style={{
      ...rootElProps.style,
      height: data.height,
      backgroundColor: `hsl(${Math.round(Math.random() * 360)}deg 50% 50%)`
    }}
  >
    ListItem {data.id}
  </div>
));

const getItemKey = (item) => item.id;

const App = () => {
  const data = [...Array(1000)].map((_v, index) => ({
    id: index,
    height: (index % 10 === 0) ? 100 : 50,
  }))

  return (
    <div>
      {/* Place for header, title, whatever... */}
      <VirtualList
        items={data}
        itemKey={getItemKey}
        overscanPadding={100}
        estimatedItemHeight={50}
        component={ListItem}
      />
    </div>
  );
};

const rootElement = document.getElementById('root');
ReactDOM.render(<App />, rootElement);

```

## Props

| Name                    | Description |
| ----------------------- | ----------- |
| **component**           | Your component that is used to render a single list item. |
| **items**               | An array of actual data mapped to all children. |
| **estimatedItemHeight** | The estimated height of a single rendered item.<br /><br />In a best-case scenario, the same as actual item height.<br /><br />Every item has its dimensions that are being used to calculate the height of a whole list. Thanks to that, the browser can allocate necessary space and display the scrollbars. It creates an illusion that all elements are present and visible at the same time.<br /><br />But how can we know the dimensions of an actual item before the initial render? Well, we don't. That's where `estimatedItemHeight` kicks in. We use a placeholder to compute all necessary values, then when the actual items are rendered, we measure them and repeats all calculations. |
| **itemKey**             | A factory function that returns (extracts) an ID from the item.<br /><br />Every item in the list must be identified by its unique ID.<br /><br />Remember that this function will be called many times, so any fancy function may negatively affect your rendering performance. |
| **overscanPadding**     | This value increases the overall viewport area. Defines how many pixels *beyond the horizon* should be overscaned.<br /><br />In other words, this is a value that allows you to render more elements than can be actually seen on the screen. |
| **className**           | Custom CSS classname attached to a `VirtualList` root element. |
| **sharedProps**         | Props passed to every rendered item. |
| **initState**           | An advanced prop that can be used to overwrite the initial `VirtualList` state. Proceed with caution. |
| **disableMeasurment**   | Disables the item measurements and sets `estimatedItemHeight` as an actual element height.<br /><br />Useful when your list consists of items with equal heights. |

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

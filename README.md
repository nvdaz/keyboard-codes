# keyboardevent-codes

> exports a KeyCode type for use in web browsers based on [W3C standards][1]

## Example

```ts
import { KeyCode } from 'keyboardevent-codes';

window.addEventListener('keydown', (event: KeyboardEvent) => {
  const keyCode = <KeyCode>event.code;
});
```

[1]: https://www.w3.org/TR/uievents-code/

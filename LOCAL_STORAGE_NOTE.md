# Running standalone (outside the Claude artifact)

The source uses `window.storage` for persistence, which exists inside the Claude
artifact environment. To run it as a normal web app, replace the persistence
calls with `localStorage`:

```js
// Replace window.storage.list("home:")
const keys = Object.keys(localStorage).filter(k => k.startsWith("home:")).map(key => ({ key }));

// Replace window.storage.get(k)
const value = localStorage.getItem(k);   // returns the JSON string directly

// Replace window.storage.set(`home:${id}`, json)
localStorage.setItem(`home:${id}`, json);

// Replace window.storage.delete(`home:${id}`)
localStorage.removeItem(`home:${id}`);
```

All four call sites are in the `useEffect`, `saveHome`, and `removeHome`
functions near the top of the `App` component. The JSON export button works
unchanged — use it to commit individual listing records into the repo.

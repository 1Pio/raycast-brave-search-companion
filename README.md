# Brave Search Companion

A private, local-first Raycast companion for Brave Search with AI answers, completion suggestions, web results, and searchable history.

Not affiliated with Brave Software or Raycast.

## Commands

- **Search Brave**: live-search Brave with AI answers, completion suggestions, and top web results.
- **Search History**: search locally stored query, AI answer, suggestion, and result history.
- **Search Settings**: configure local history retention and completion suggestion visibility.

## Privacy

Search history is stored only in Raycast extension local storage. The extension has no accounts, sign-ins, paid API keys, analytics, telemetry, or external backend. It does not use the paid Brave Search API. Retention defaults to 24 hours and can be changed to never save, one week, one month, three months, one year, or forever.

## Network Behavior

The extension uses Brave's free public web search, suggestion, and AI answer surfaces. If Brave temporarily rate-limits automated AI answer streaming, the normal search results and suggestions still work, and the command can open the same query or AI conversation in Brave Search in the default browser.

## Development

```sh
npm install
npm test
npm run lint
npm run build
```

## License

MIT

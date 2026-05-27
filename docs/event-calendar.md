# Earnings And Event Calendar

Market Pulse includes a local-first Calendar screen for review windows that could affect owned or watchlist tickers.

## What It Supports

- Sample events for workflow testing.
- Imported CSV or JSON event files.
- Manual custom events saved in localStorage.
- Derived event rows from imported holdings or thesis records when a date is present.
- Future live provider events through the same `CalendarEvent` contract.

No live event provider is connected by default.

## Event Types

- `earnings`
- `ex-dividend`
- `investor-day`
- `product-event`
- `fed-macro`
- `custom`

Each event has `importance`: `low`, `medium`, or `high`.

## Source Labels

Every event must identify its source mode:

- `mock`: workflow example only.
- `imported`: user-provided CSV/JSON or imported holding field.
- `manual`: custom local note or thesis/watchlist record.
- `live`: future server-side provider row.
- `stale`: provider/imported row past its freshness window.
- `error`: failed provider/import row.

Sample event dates are not live earnings dates. They exist only so the Daily Brief, ticker pages, and Market Intelligence can show how the workflow behaves.

## Import Format

CSV columns can include:

- `ticker`
- `tickers`
- `event type`
- `date`
- `title`
- `summary`
- `importance`
- `source label`
- `source url`
- `notes`

JSON can be an array of event objects or an object with `events` / `calendarEvents`.

## Where Events Appear

- Daily Command Brief: upcoming high-importance or near-term events.
- Ticker pages: events tied to the selected ticker.
- Market Intelligence: event read-through cards with ticker chips.
- Calendar: full event list, filters, imports, and custom event entry.

## Limitations

- The current MVP does not fetch live earnings or dividend calendars.
- The app should not infer exact move direction from calendar dates alone.
- If a date is mock, imported, or manual, the UI must say so.
- Users should verify event timing against primary/company/provider calendars before relying on it.

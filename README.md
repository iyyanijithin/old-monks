# Old Monks Drinks Fund (React + Vite)

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
```

Data is saved in the browser's localStorage, so it is per device. To share one fund between
all Monks, replace `usePersisted` in `src/store.js` with calls to a backend API.

Rules built in: £30 contribution each, top-up banner when the balance is under £10,
accountant rotates by calendar month through the Monks in the order they were added,
accounts are settled per event.

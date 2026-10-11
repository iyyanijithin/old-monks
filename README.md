# Old Monks Drinks Fund (React + Vite)

[Open the Old Monks Drinks Fund](https://iyyanijithin.github.io/old-monks/)

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
```

## Shared data setup

The fund entries and users are stored in Firebase Cloud Firestore and synchronize
between browsers. User names live in the `users` collection.

1. Copy `.env.example` to `.env.local` and fill in the Firebase Web app config.
2. In Firebase Console, create a Cloud Firestore database.
3. In Firestore's **Rules** tab, publish the rules from `firestore.rules`.
4. Run `npm install` and `npm run dev`.
5. For GitHub Pages, add each `VITE_FIREBASE_*` value as a repository Actions secret
   with the matching name. The deploy workflow uses these values when building.

**Security warning:** The current rules intentionally allow anyone to read and change
the shared fund without signing in. Anyone who discovers the app or database can alter
or delete its data. Use this only if that is acceptable for your group; authentication
and restricted access should be added before storing sensitive or important records.
Keep a backup of the fund data.

On first connection, entries in this browser's localStorage are copied to Firestore
if the shared entries field does not already exist. The names Mahesh, Anish, Davis,
Dhinesh, Jomon, Sanal, Sooraj, Sulex, Vipin, Vishant, and Jithin are added to the
`users` collection if missing.
The selected user name and other personal browser state remain local to that browser.
The shared fund document also stores the current maintenance claim. One selected user
can claim it at a time and release it for another user.

Each peg is 30 ml. Bottle purchases default to 25 pegs per 750 ml bottle, with an
editable pegs-per-bottle value when recording a purchase.

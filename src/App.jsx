import { useEffect, useMemo, useRef, useState } from 'react'
import { usePersisted, useSharedMaintainer, useSharedState, useSharedUsers } from './store'
import rumBottle from './assets/rum_old16.jpg'

const gbp = (n) => '£' + (Math.round(n * 100) / 100).toFixed(2)
const sumBy = (list, pred) => list.filter(pred).reduce((a, e) => a + (+e.amount || 0), 0)

const describe = (e) =>
  ({
    contribution: `${e.who} paid ${gbp(e.amount)}`,
    topup: `${e.who} topped up ${gbp(e.amount)}`,
    purchase: `${e.who} bought ${e.qty}× ${e.drink} (${e.qty * (e.pegsPerBottle ?? 25)} pegs) for ${gbp(e.amount)}`,
    pour: `${e.who} poured 1 peg of ${e.drink}`,
    settle: `✔ Settled: ${e.note}`,
  })[e.type] ?? e.type

export default function App() {
  const { users: members, loading: membersLoading, error: membersError } = useSharedUsers()
  const [entries, setEntries, entriesLoading, entriesError] = useSharedState('monks.entries', [])
  const {
    maintainer,
    loading: maintainerLoading,
    busy: maintainerBusy,
    error: maintainerError,
    claim: claimMaintenance,
    release: releaseMaintenance,
  } = useSharedMaintainer()
  const [me, setMe] = usePersisted('monks.me', '')
  const [topUp, setTopUp] = useState(10)
  const dataLoading = membersLoading || entriesLoading || maintainerLoading
  const dataError = membersError || entriesError || maintainerError

  const add = (e) => {
    const entry = { id: crypto.randomUUID(), ts: Date.now(), ...e }
    setEntries((es) => [...es, entry])
  }
  const remove = (id) => confirm('Remove this entry?') && setEntries((es) => es.filter((e) => e.id !== id))
  const needMe = () => (me ? true : (alert('Pick your name at the top first'), false))

  const { bal, stock, pours, spent } = useMemo(() => {
    const bal =
      sumBy(entries, (e) => e.type === 'contribution' || e.type === 'topup') -
      sumBy(entries, (e) => e.type === 'purchase')
    const stock = {}
    entries.forEach((e) => {
      if (e.type === 'purchase') stock[e.drink] = (stock[e.drink] || 0) + +e.qty * (e.pegsPerBottle ?? 25)
      if (e.type === 'pour') stock[e.drink] = (stock[e.drink] || 0) - +e.qty
    })
    const sinceSettle = entries.slice(entries.map((e) => e.type).lastIndexOf('settle') + 1)
    const pours = {}
    sinceSettle.filter((e) => e.type === 'pour').forEach((e) => (pours[e.drink] = (pours[e.drink] || 0) + 1))
    return { bal, stock, pours, spent: sumBy(sinceSettle, (e) => e.type === 'purchase') }
  }, [entries])

  const low = bal < 10 && members.length > 0

  return (
    <main>
      <header className="hero">
        <div>
          <h1>Old Monks Drinks Fund</h1>
        </div>
        <img src={rumBottle} alt="Old Monk rum bottle" />
      </header>

      {dataLoading && <section className="card">Connecting to the shared fund…</section>}
      {dataError && <section className="card warn" role="alert">{dataError}</section>}

      <section className="card row">
        I am:
        <select value={members.some((member) => member.name === me) ? me : ''} onChange={(e) => setMe(e.target.value)}>
          <option value="">Pick name…</option>
          {members.map((m) => <option key={m.id}>{m.name}</option>)}
        </select>
      </section>

      <section className="card row">
        <div>
          <h2>Fund maintenance</h2>
          <div>
            {maintainerLoading
              ? 'Checking maintenance claim…'
              : maintainer
                ? `Maintained by ${maintainer}`
                : 'No one is currently maintaining the fund.'}
          </div>
        </div>
        {maintainer === me && me ? (
          <button disabled={maintainerBusy} onClick={() => releaseMaintenance(me)}>
            {maintainerBusy ? 'Releasing…' : 'Release maintenance'}
          </button>
        ) : (
          <button
            disabled={!me || maintainerBusy || maintainerLoading}
            onClick={() => {
              if (maintainer && !confirm(`Maintained by ${maintainer}. Do you want to take over maintenance?`)) return
              claimMaintenance(me)
            }}
          >
            {maintainerBusy ? 'Claiming…' : maintainer ? 'Take over maintenance' : 'Claim maintenance'}
          </button>
        )}
        {!me && <span className="mut">Pick your name above to claim.</span>}
      </section>

      <section className="card">
        <div className="mut">Fund balance</div>
        <div className={'big' + (bal < 10 ? ' warn-text' : '')}>{gbp(bal)}</div>
      </section>

      {low && (
        <section className="card warn">
          <h2>Fund below £10: top-up needed</h2>
          <div className="row">
            Ask each Monk for £
            <input type="number" min="1" value={topUp} onChange={(e) => setTopUp(e.target.value)} />
          </div>
          <textarea
            readOnly
            value={`Old Monks fund is down to ${gbp(bal)} (below £10). Please send £${+topUp || 10} each to ${maintainer || 'the fund maintainer'}, who is handling the accounts. Thanks!`}
          />
        </section>
      )}

      <Members
        members={members}
        payments={entries.filter((entry) => entry.type === 'contribution' || entry.type === 'topup')}
        onPay={(who, type, amount) => add({ type, who, amount })}
      />

      <section className="card">
        <h2>Stock</h2>
        <Purchase
          onBuy={(p) => {
            if (!needMe()) return false
            add({ type: 'purchase', who: me, ...p })
            return true
          }}
        />
        {Object.keys(stock).length ? (
          <table>
            <tbody>
              {Object.entries(stock).map(([drink, left]) => (
                <tr key={drink}>
                  <td>{drink}</td>
                  <td><b>{left}</b> pegs left</td>
                  <td>
                    <button
                      disabled={left <= 0}
                      title={left <= 0 ? 'No pegs left in stock' : `Pour one peg of ${drink}`}
                      onClick={() => needMe() && add({ type: 'pour', drink, qty: 1, who: me })}
                    >
                      Pour 1 peg
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mut">No stock yet. Add a purchase to get started.</p>
        )}
        <p className="mut">1 peg = 30 ml. Bottle purchases default to 25 pegs (750 ml); adjust the pegs per bottle when needed.</p>
      </section>

      <section className="card">
        <h2>Stock history</h2>
        {entries.some((entry) => entry.type === 'purchase') ? (
          <table>
            <thead><tr><th>Date</th><th>Drink</th><th>Bottles</th><th>Pegs added</th><th>Added by</th></tr></thead>
            <tbody>
              {[...entries].filter((entry) => entry.type === 'purchase').reverse().map((purchase) => (
                <tr key={purchase.id}>
                  <td>{new Date(purchase.ts).toLocaleDateString('en-GB')}</td>
                  <td>{purchase.drink}</td>
                  <td>{purchase.qty}</td>
                  <td>{purchase.qty * (purchase.pegsPerBottle ?? 25)}</td>
                  <td>{purchase.who}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mut">No bottles purchased yet.</p>
        )}
      </section>

      <section className="card">
        <h2>This event (since last settlement)</h2>
        <div>
          {Object.keys(pours).length
            ? Object.entries(pours).map(([d, n]) => `${n}× ${d}`).join(', ')
            : <span className="mut">No pours yet</span>}
        </div>
        <div className="mut">Spent on purchases: {gbp(spent)}. Fund now: {gbp(bal)}</div>
        <Settle onSettle={(note) => add({ type: 'settle', note, who: me })} />
      </section>

      <section className="card">
        <h2>Log</h2>
        {entries.length === 0 && <p className="mut">Nothing logged yet.</p>}
        {[...entries].reverse().slice(0, 40).map((e) => (
          <div className="row" key={e.id}>
            <span className="mut">{new Date(e.ts).toLocaleDateString('en-GB')}</span>
            <span>{describe(e)}</span>
            <button className="x" onClick={() => remove(e.id)}>✕</button>
          </div>
        ))}
      </section>
    </main>
  )
}

function Members({ members, payments, onPay }) {
  const [who, setWho] = useState('')
  const [type, setType] = useState('contribution')
  const [amount, setAmount] = useState(30)

  return (
    <section className="card">
      <h2>Contributions</h2>
      {payments.length ? (
        <table>
          <thead><tr><th>Name</th><th>Amount</th><th>Date</th></tr></thead>
          <tbody>
            {[...payments].reverse().map((payment) => (
              <tr key={payment.id}>
                <td>{payment.who}</td>
                <td>{gbp(payment.amount)}</td>
                <td>{new Date(payment.ts).toLocaleDateString('en-GB')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mut">No contributions recorded yet.</p>
      )}
      <div className="row">
        <select value={who || members[0]?.name || ''} onChange={(e) => setWho(e.target.value)}>
          {members.map((m) => <option key={m.id}>{m.name}</option>)}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="contribution">Contribution</option>
          <option value="topup">Top-up</option>
        </select>
        £<input type="number" min="0" step="0.5" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button
          onClick={() => {
            const w = who || members[0]?.name
            if (w && +amount > 0) onPay(w, type, +amount)
          }}
        >
          Record payment
        </button>
      </div>
    </section>
  )
}

function Purchase({ onBuy }) {
  const [open, setOpen] = useState(false)
  const [drink, setDrink] = useState('')
  const [qty, setQty] = useState(1)
  const [pegsPerBottle, setPegsPerBottle] = useState(25)
  const [cost, setCost] = useState('')
  const dialogRef = useRef(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <>
      <button className="add-stock-button" onClick={() => setOpen(true)}>Add to stock</button>
      <dialog
        ref={dialogRef}
        className="purchase-dialog"
        aria-labelledby="purchase-title"
        onClick={(event) => {
          if (event.target === dialogRef.current) setOpen(false)
        }}
        onClose={() => setOpen(false)}
      >
        <form
          className="purchase-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (!drink.trim() || !Number.isInteger(+qty) || +qty < 1 || !Number.isInteger(+pegsPerBottle) || +pegsPerBottle < 1) return
            if (!onBuy({ drink: drink.trim(), qty: +qty, pegsPerBottle: +pegsPerBottle, amount: +cost || 0 })) return
            setDrink('')
            setQty(1)
            setPegsPerBottle(25)
            setCost('')
            setOpen(false)
          }}
        >
          <h2 id="purchase-title">Add to stock</h2>
          <label>
            Drink
            <input autoFocus required value={drink} onChange={(event) => setDrink(event.target.value)} />
          </label>
          <label>
            Bottles
            <input aria-label="Number of bottles" type="number" min="1" step="1" required value={qty} onChange={(event) => setQty(event.target.value)} />
          </label>
          <label>
            Pegs per bottle
            <input aria-label="Pegs per bottle" type="number" min="1" step="1" required value={pegsPerBottle} onChange={(event) => setPegsPerBottle(event.target.value)} />
          </label>
          <label>
            Cost (£)
            <input type="number" min="0" step="0.5" value={cost} onChange={(event) => setCost(event.target.value)} />
          </label>
          <div className="dialog-actions">
            <button type="button" className="secondary-button" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit">Add to stock</button>
          </div>
        </form>
      </dialog>
    </>
  )
}

function Settle({ onSettle }) {
  const [note, setNote] = useState('')
  return (
    <div className="row">
      <input placeholder="Event name" value={note} onChange={(e) => setNote(e.target.value)} />
      <button onClick={() => (onSettle(note.trim() || 'Event'), setNote(''))}>Settle accounts</button>
    </div>
  )
}

import { useMemo, useState } from 'react'
import { usePersisted } from './store'
import rumBottle from './assets/rum_old16.jpg'

const gbp = (n) => '£' + (Math.round(n * 100) / 100).toFixed(2)
const sumBy = (list, pred) => list.filter(pred).reduce((a, e) => a + (+e.amount || 0), 0)

const describe = (e) =>
  ({
    contribution: `${e.who} paid ${gbp(e.amount)}`,
    topup: `${e.who} topped up ${gbp(e.amount)}`,
    purchase: `${e.who} bought ${e.qty}× ${e.drink} for ${gbp(e.amount)}`,
    pour: `${e.who} poured ${e.drink}`,
    settle: `✔ Settled: ${e.note}`,
  })[e.type] ?? e.type

export default function App() {
  const [members, setMembers] = usePersisted('monks.members', [])
  const [entries, setEntries] = usePersisted('monks.entries', [])
  const [me, setMe] = usePersisted('monks.me', '')
  const [topUp, setTopUp] = useState(10)

  const add = (e) => setEntries((es) => [...es, { id: crypto.randomUUID(), ts: Date.now(), ...e }])
  const remove = (id) => confirm('Remove this entry?') && setEntries((es) => es.filter((e) => e.id !== id))
  const needMe = () => (me ? true : (alert('Pick your name at the top first'), false))

  const { bal, stock, pours, spent } = useMemo(() => {
    const bal =
      sumBy(entries, (e) => e.type === 'contribution' || e.type === 'topup') -
      sumBy(entries, (e) => e.type === 'purchase')
    const stock = {}
    entries.forEach((e) => {
      if (e.type === 'purchase') stock[e.drink] = (stock[e.drink] || 0) + +e.qty
      if (e.type === 'pour') stock[e.drink] = (stock[e.drink] || 0) - +e.qty
    })
    const sinceSettle = entries.slice(entries.map((e) => e.type).lastIndexOf('settle') + 1)
    const pours = {}
    sinceSettle.filter((e) => e.type === 'pour').forEach((e) => (pours[e.drink] = (pours[e.drink] || 0) + 1))
    return { bal, stock, pours, spent: sumBy(sinceSettle, (e) => e.type === 'purchase') }
  }, [entries])

  const now = new Date()
  const accountant = members.length ? members[(now.getFullYear() * 12 + now.getMonth()) % members.length].name : null
  const low = bal < 10 && members.length > 0

  return (
    <main>
      <header className="hero">
        <div>
          <h1>🥃 Old Monks Drinks Fund</h1>
        </div>
        <img src={rumBottle} alt="Old Monk rum bottle" />
      </header>

      <section className="card row">
        I am:
        <select value={me} onChange={(e) => setMe(e.target.value)}>
          <option value="">Pick name…</option>
          {members.map((m) => <option key={m.id}>{m.name}</option>)}
        </select>
      </section>

      <section className="card">
        <div className="mut">Fund balance</div>
        <div className={'big' + (bal < 10 ? ' warn-text' : '')}>{gbp(bal)}</div>
        <div>
          Accounts this month ({now.toLocaleString('en-GB', { month: 'long' })}): <b>{accountant ?? '(add Monks first)'}</b>
        </div>
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
            value={`Old Monks fund is down to ${gbp(bal)} (below £10). Please send £${+topUp || 10} each to ${accountant}, who is handling the accounts this month. Thanks!`}
          />
        </section>
      )}

      <Members
        members={members}
        entries={entries}
        onAddMonk={(name) => setMembers((ms) => [...ms, { id: crypto.randomUUID(), name }])}
        onPay={(who, type, amount) => add({ type, who, amount })}
      />

      <section className="card">
        <h2>Stock</h2>
        {Object.keys(stock).length ? (
          <table>
            <tbody>
              {Object.entries(stock).map(([drink, left]) => (
                <tr key={drink}>
                  <td>{drink}</td>
                  <td><b>{left}</b> left</td>
                  <td><button onClick={() => needMe() && add({ type: 'pour', drink, qty: 1, who: me })}>Pour 1</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mut">No stock yet. Record a purchase below.</p>
        )}
        <Purchase onBuy={(p) => needMe() && add({ type: 'purchase', who: me, ...p })} />
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

function Members({ members, entries, onAddMonk, onPay }) {
  const [name, setName] = useState('')
  const [who, setWho] = useState('')
  const [type, setType] = useState('contribution')
  const [amount, setAmount] = useState(30)

  return (
    <section className="card">
      <h2>Monks and contributions</h2>
      {members.length ? (
        <table>
          <thead><tr><th>Monk</th><th>£30 paid</th><th>Top-ups</th></tr></thead>
          <tbody>
            {members.map((m) => {
              const paid = sumBy(entries, (e) => e.type === 'contribution' && e.who === m.name)
              const tops = sumBy(entries, (e) => e.type === 'topup' && e.who === m.name)
              return (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  <td>{paid >= 30 ? '✅ ' + gbp(paid) : 'owes ' + gbp(30 - paid)}</td>
                  <td>{gbp(tops)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      ) : (
        <p className="mut">No Monks yet.</p>
      )}
      <div className="row">
        <input placeholder="New Monk name" value={name} onChange={(e) => setName(e.target.value)} />
        <button onClick={() => name.trim() && (onAddMonk(name.trim()), setName(''))}>Add Monk</button>
      </div>
      <div className="row">
        <select value={who || members[0]?.name || ''} onChange={(e) => setWho(e.target.value)}>
          {members.map((m) => <option key={m.id}>{m.name}</option>)}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="contribution">£30 contribution</option>
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
  const [drink, setDrink] = useState('')
  const [qty, setQty] = useState(1)
  const [cost, setCost] = useState('')

  return (
    <div className="row">
      <input placeholder="Drink" value={drink} onChange={(e) => setDrink(e.target.value)} />
      Qty <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} />
      Cost £<input type="number" min="0" step="0.5" value={cost} onChange={(e) => setCost(e.target.value)} />
      <button
        onClick={() => {
          if (!drink.trim() || !(+qty > 0)) return
          onBuy({ drink: drink.trim(), qty: +qty, amount: +cost || 0 })
          setDrink('')
          setCost('')
        }}
      >
        Record purchase
      </button>
    </div>
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

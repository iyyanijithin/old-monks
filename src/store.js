import { useCallback, useEffect, useState } from 'react'
import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  runTransaction,
  writeBatch,
} from 'firebase/firestore'
import { db } from './firebase'

const defaultMembers = [
  'Mahesh',
  'Anish',
  'Davis',
  'Dhinesh',
  'Jomon',
  'Sanal',
  'Sooraj',
  'Sulex',
  'Vipin',
  'Vishant',
  'Jithin',
]

function userDocumentId(name) {
  return `name-${name.trim().normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

function readLocalValue(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function validateEntryStock(entries) {
  if (!entries.every((entry) => entry && typeof entry === 'object')) {
    throw new Error('Ledger entries must be valid objects.')
  }

  const stock = new Map()
  for (const entry of entries) {
    if (entry.type === 'purchase') {
      const pegs = Number(entry.qty) * Number(entry.pegsPerBottle ?? 25)
      stock.set(entry.drink, (stock.get(entry.drink) ?? 0) + pegs)
    } else if (entry.type === 'pour') {
      const remaining = (stock.get(entry.drink) ?? 0) - Number(entry.qty)
      if (remaining < 0) {
        throw new Error(`Cannot pour ${entry.drink}: there are not enough pegs in stock.`)
      }
      stock.set(entry.drink, remaining)
    }
  }
}

export function useSharedUsers() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const usersCollection = collection(db, 'users')
    const unsubscribe = onSnapshot(
      usersCollection,
      (snapshot) => {
        if (!active) return
        setUsers(snapshot.docs.map((userDoc) => ({ id: userDoc.id, ...userDoc.data() })))
        setLoading(false)
        setError('')
      },
      (cause) => {
        if (!active) return
        console.error('Unable to sync shared users:', cause)
        setError(`Unable to connect to the shared users: ${cause.message}`)
        setLoading(false)
      },
    )

    const migrateAndSeedUsers = async () => {
      try {
        const usersSnapshot = await getDocs(usersCollection)
        if (!active) return

        const knownNames = new Set(
          usersSnapshot.docs
            .map((userDoc) => userDoc.data().name?.trim().toLowerCase())
            .filter(Boolean),
        )
        const candidates = defaultMembers.map((name) => ({ name }))
        const batch = writeBatch(db)
        let hasWrites = false

        candidates.forEach((user) => {
          const name = user.name?.trim()
          if (!name || knownNames.has(name.toLowerCase())) return
          const userRef = doc(db, 'users', user.id || userDocumentId(name))
          batch.set(userRef, { name })
          knownNames.add(name.toLowerCase())
          hasWrites = true
        })

        if (hasWrites) await batch.commit()
      } catch (cause) {
        if (!active) return
        console.error('Unable to initialize shared users:', cause)
        setError(`Unable to initialize shared users: ${cause.message}`)
      }
    }

    migrateAndSeedUsers()
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const addUser = useCallback(async (name) => {
    const cleanName = name.trim()
    if (!cleanName) return
    try {
      await addDoc(collection(db, 'users'), { name: cleanName })
    } catch (cause) {
      console.error('Unable to add shared user:', cause)
      setError(`Unable to add user: ${cause.message}`)
    }
  }, [])

  return { users, addUser, loading, error }
}

export function useSharedState(key, initialValue) {
  const [initial] = useState(() => readLocalValue(key, initialValue))
  const [value, setValue] = useState(initial)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const field = key.split('.').at(-1)

  useEffect(() => {
    let active = true
    const fundRef = doc(db, 'funds', 'shared')

    const unsubscribeOnError = (cause) => {
      if (!active) return
      console.error(`Unable to sync shared ${field}:`, cause)
      setError(`Unable to connect to the shared fund: ${cause.message}`)
      setLoading(false)
    }

    const connect = async () => {
      try {
        await runTransaction(db, async (transaction) => {
          const snapshot = await transaction.get(fundRef)
          if (!snapshot.exists() || !(field in snapshot.data())) {
            transaction.set(fundRef, { [field]: initial }, { merge: true })
          }
        })

        if (!active) return
        const unsubscribe = onSnapshot(
          fundRef,
          (snapshot) => {
            if (!active) return
            const sharedValue = snapshot.data()?.[field]
            setValue(sharedValue ?? initial)
            setError('')
            setLoading(false)
          },
          unsubscribeOnError,
        )
        return unsubscribe
      } catch (cause) {
        unsubscribeOnError(cause)
      }
    }

    let stopListening
    connect().then((unsubscribe) => {
      stopListening = unsubscribe
      if (!active) stopListening?.()
    })
    return () => {
      active = false
      stopListening?.()
    }
  }, [field, initial, key])

  const update = useCallback((nextValue) => {
    setError('')
    let optimisticValue
    try {
      optimisticValue = typeof nextValue === 'function' ? nextValue(value) : nextValue
      if (!Array.isArray(optimisticValue)) throw new Error(`Shared ${field} must be a list.`)
      if (field === 'entries') validateEntryStock(optimisticValue)
    } catch (cause) {
      setError(cause.message)
      return
    }
    setValue(optimisticValue)

    const fundRef = doc(db, 'funds', 'shared')
    runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(fundRef)
      const current = snapshot.data()?.[field] ?? initial
      const next = typeof nextValue === 'function' ? nextValue(current) : nextValue
      if (!Array.isArray(next)) throw new Error(`Shared ${field} must be a list.`)
      if (field === 'entries') validateEntryStock(next)
      transaction.set(fundRef, { [field]: next }, { merge: true })
    }).catch((cause) => {
      console.error(`Unable to update shared ${field}:`, cause)
      getDoc(fundRef)
        .then((snapshot) => {
          const currentValue = snapshot.data()?.[field]
          if (Array.isArray(currentValue)) setValue(currentValue)
        })
        .catch((refreshCause) => {
          console.error(`Unable to reload shared ${field} after save failure:`, refreshCause)
        })
      setError(`Unable to save to the shared fund: ${cause.message}`)
    })
  }, [field, initial, value])

  return [value, update, loading, error]
}

export function useSharedMaintainer() {
  const [maintainer, setMaintainer] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const fundRef = doc(db, 'funds', 'shared')
    return onSnapshot(
      fundRef,
      (snapshot) => {
        setMaintainer(snapshot.data()?.maintainer ?? null)
        setLoading(false)
        setError('')
      },
      (cause) => {
        console.error('Unable to sync the fund maintainer:', cause)
        setError(`Unable to load the fund maintainer: ${cause.message}`)
        setLoading(false)
      },
    )
  }, [])

  const claim = useCallback(async (name) => {
    setBusy(true)
    setError('')
    try {
      const fundRef = doc(db, 'funds', 'shared')
      await runTransaction(db, async (transaction) => {
        await transaction.get(fundRef)
        transaction.set(fundRef, { maintainer: name }, { merge: true })
      })
    } catch (cause) {
      console.error('Unable to claim fund maintenance:', cause)
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }, [])

  const release = useCallback(async (name) => {
    setBusy(true)
    setError('')
    try {
      const fundRef = doc(db, 'funds', 'shared')
      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(fundRef)
        if (snapshot.data()?.maintainer !== name) {
          throw new Error('The maintenance claim is no longer assigned to you.')
        }
        transaction.set(fundRef, { maintainer: null }, { merge: true })
      })
    } catch (cause) {
      console.error('Unable to release fund maintenance:', cause)
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }, [])

  return { maintainer, loading, busy, error, claim, release }
}

export function usePersisted(key, initialValue) {
  const [value, setValue] = useState(() => readLocalValue(key, initialValue))
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value))
  }, [key, value])
  return [value, setValue]
}

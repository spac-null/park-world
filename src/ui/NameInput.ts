const KEY = 'park-world-name'
const MAX = 14

export function askName(): Promise<string> {
  return new Promise(resolve => {
    const stored = localStorage.getItem(KEY)
    if (stored) { resolve(stored); return }

    const overlay = document.getElementById('name-overlay')!
    const input   = document.getElementById('name-input') as HTMLInputElement
    overlay.style.display = 'flex'
    setTimeout(() => input.focus(), 50)

    const submit = () => {
      const name = input.value.trim().slice(0, MAX) || 'bird'
      localStorage.setItem(KEY, name)
      overlay.style.display = 'none'
      resolve(name)
    }

    input.addEventListener('keydown', e => { if (e.key === 'Enter') submit() })
    document.getElementById('name-submit')!.addEventListener('click', submit)
  })
}

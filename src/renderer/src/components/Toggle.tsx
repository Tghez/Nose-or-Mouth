interface ToggleProps {
  id?: string
  checked: boolean
  onChange: (checked: boolean) => void
  bw?: boolean
}

export function Toggle({ id, checked, onChange, bw }: ToggleProps) {
  return (
    <label className={`toggle${bw ? ' toggle-bw' : ''}`}>
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={e => onChange(e.target.checked)}
      />
      <div className="toggle-track"></div>
    </label>
  )
}

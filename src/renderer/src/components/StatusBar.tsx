import { useAppContext } from '../store/AppContext'

export function StatusBar() {
  const { state } = useAppContext()
  return <div id="status-bar">{state.statusText}</div>
}

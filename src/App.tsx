import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { ProfileProvider } from './state/profile'
import { ToastProvider } from './components/Toast'
import AppShell from './components/AppShell'
import Dashboard from './screens/Dashboard'
import Ledger from './screens/Ledger'
import Assets from './screens/Assets'
import Calendar from './screens/Calendar'
import Receivables from './screens/Receivables'
import Stats from './screens/Stats'
import Cards from './screens/Cards'
import Settings from './screens/Settings'
import Import from './screens/Import'
import Investment from './screens/Investment'

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'ledger', element: <Ledger /> },
      { path: 'import', element: <Import /> },
      { path: 'assets', element: <Assets /> },
      { path: 'calendar', element: <Calendar /> },
      { path: 'receivables', element: <Receivables /> },
      { path: 'stats', element: <Stats /> },
      { path: 'invest', element: <Investment /> },
      { path: 'cards', element: <Cards /> },
      { path: 'settings', element: <Settings /> },
    ],
  },
])

export default function App() {
  return (
    <ProfileProvider>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </ProfileProvider>
  )
}

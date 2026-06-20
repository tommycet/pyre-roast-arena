import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WalletProvider } from './lib/wallet'
import { AppShell } from './components/AppShell'
import { HomePage } from './pages/HomePage'
import { ArenaPage } from './pages/ArenaPage'
import { BattlePage } from './pages/BattlePage'
import { SubmitPage } from './pages/SubmitPage'
import { FlamePage } from './pages/FlamePage'
import { CombatantPage } from './pages/CombatantPage'
import { DisputePage } from './pages/DisputePage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WalletProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/arena" element={<ArenaPage />} />
              <Route path="/battle/:id" element={<BattlePage />} />
              <Route path="/submit/:id" element={<SubmitPage />} />
              <Route path="/flame" element={<FlamePage />} />
              <Route path="/combatant/:addr" element={<CombatantPage />} />
              <Route path="/dispute/:id" element={<DisputePage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </WalletProvider>
    </QueryClientProvider>
  )
}
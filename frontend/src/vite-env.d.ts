/// <reference types="vite/client" />

interface Window {
  ethereum?: {
    request: (args: { method: string; params?: any[] }) => Promise<any>
    on?: (event: string, handler: (...args: any[]) => void) => void
    removeListener?: (event: string, handler: (...args: any[]) => void) => void
  }
}

interface ImportMetaEnv {
  readonly VITE_NETWORK?: 'studionet' | 'bradbury'
  readonly VITE_CONTRACT_ADDRESS?: `0x${string}`
  readonly VITE_IS_DEPLOYED?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
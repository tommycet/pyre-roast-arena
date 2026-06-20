import { useEffect, useRef } from 'react'
import { ArenaScene, type ArenaState } from '../three/arena'

interface Arena3DProps {
  state: ArenaState
  height?: number
}

export function Arena3D({ state, height = 360 }: Arena3DProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<ArenaScene | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const scene = new ArenaScene(containerRef.current)
    sceneRef.current = scene
    scene.setState(state)
    return () => {
      scene.dispose()
      sceneRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    sceneRef.current?.setState(state)
  }, [state])

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height,
        background: 'var(--bg)',
        borderRadius: 'var(--r-md)',
        overflow: 'hidden',
        position: 'relative',
      }}
    />
  )
}
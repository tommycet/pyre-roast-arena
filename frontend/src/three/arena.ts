/**
 * Three.js arena scene — two faceless avatar cylinders facing off on a
 * circular platform, surrounded by ember particles. Performance is the
 * constraint: no post-processing, no bloom beyond emissive material, no
 * shadows beyond contact shadow. Honors prefers-reduced-motion.
 */
import * as THREE from 'three'

export interface ArenaState {
  phase: 'open' | 'judging' | 'resolved' | 'idle'
  /** Winner address — when phase is "resolved", this avatar rises. */
  winner?: string
  /** Combatant addresses for slotting (slot A vs slot B). */
  combatantA?: string
  combatantB?: string
}

export class ArenaScene {
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private container: HTMLElement
  private rafId: number | null = null
  private reducedMotion: boolean

  // Avatars
  private avatarA: THREE.Group
  private avatarB: THREE.Group

  // Embers
  private embers: THREE.Points
  private embersGeometry: THREE.BufferGeometry
  private emberMaterial: THREE.PointsMaterial

  // Animation
  private clock: THREE.Clock
  private phase: ArenaState['phase'] = 'idle'

  constructor(container: HTMLElement) {
    this.container = container
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const w = container.clientWidth
    const h = container.clientHeight

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    this.renderer.setSize(w, h)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setClearColor(0x000000, 0)
    container.appendChild(this.renderer.domElement)

    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.Fog(0x0a0a0b, 6, 14)

    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100)
    this.camera.position.set(0, 2, 6)
    this.camera.lookAt(0, 0.5, 0)

    // Ambient + key + ember point light from below
    this.scene.add(new THREE.AmbientLight(0x404040, 0.6))
    const key = new THREE.DirectionalLight(0xffffff, 0.4)
    key.position.set(2, 4, 3)
    this.scene.add(key)
    const emberLight = new THREE.PointLight(0xff4d1a, 1.4, 5, 2)
    emberLight.position.set(0, 0.1, 0)
    this.scene.add(emberLight)

    // Platform
    const platformGeom = new THREE.CylinderGeometry(2, 2.2, 0.1, 32)
    const platformMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1f,
      metalness: 0.4,
      roughness: 0.7,
    })
    const platform = new THREE.Mesh(platformGeom, platformMat)
    platform.position.y = -0.05
    this.scene.add(platform)

    // Inset ring on platform (decorative; subtle)
    const ringGeom = new THREE.RingGeometry(1.6, 1.7, 64)
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff4d1a,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
    })
    const ring = new THREE.Mesh(ringGeom, ringMat)
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.01
    this.scene.add(ring)

    // Avatar A (slot A on -X)
    this.avatarA = this.makeAvatar()
    this.avatarA.position.set(-0.9, 0.5, 0)
    this.avatarA.rotation.y = Math.PI / 6
    this.scene.add(this.avatarA)

    // Avatar B (slot B on +X)
    this.avatarB = this.makeAvatar()
    this.avatarB.position.set(0.9, 0.5, 0)
    this.avatarB.rotation.y = -Math.PI - Math.PI / 6
    this.scene.add(this.avatarB)

    // Embers
    const emberCount = 80
    this.embersGeometry = new THREE.BufferGeometry()
    const positions = new Float32Array(emberCount * 3)
    const velocities = new Float32Array(emberCount)
    for (let i = 0; i < emberCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 1.6
      positions[i * 3 + 1] = Math.random() * 2.5
      positions[i * 3 + 2] = (Math.random() - 0.5) * 1.6
      velocities[i] = 0.3 + Math.random() * 0.5
    }
    this.embersGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    ;(this.embersGeometry as any).userData.velocities = velocities
    this.emberMaterial = new THREE.PointsMaterial({
      color: 0xff6633,
      size: 0.06,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    this.embers = new THREE.Points(this.embersGeometry, this.emberMaterial)
    this.scene.add(this.embers)

    this.clock = new THREE.Clock()

    if (!this.reducedMotion) {
      this.start()
    } else {
      this.renderFrame() // static pose for reduced motion
    }

    // Handle resize
    const onResize = () => {
      const w = container.clientWidth
      const h = container.clientHeight
      this.renderer.setSize(w, h)
      this.camera.aspect = w / h
      this.camera.updateProjectionMatrix()
    }
    window.addEventListener('resize', onResize)
    ;(this as any)._onResize = onResize
  }

  private makeAvatar(): THREE.Group {
    const g = new THREE.Group()
    // Body
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.3, 1.0, 16),
      new THREE.MeshStandardMaterial({
        color: 0x2a2a30,
        metalness: 0.3,
        roughness: 0.6,
        emissive: 0xff4d1a,
        emissiveIntensity: 0.06,
      }),
    )
    body.position.y = 0
    g.add(body)
    // Head
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 16, 12),
      new THREE.MeshStandardMaterial({
        color: 0x2a2a30,
        metalness: 0.3,
        roughness: 0.6,
      }),
    )
    head.position.y = 0.7
    g.add(head)
    return g
  }

  setState(state: ArenaState) {
    this.phase = state.phase
    // Reset avatar positions
    this.avatarA.position.y = 0.5
    this.avatarB.position.y = 0.5

    // Show "open portal" hint when state is "open" — done via emissive flicker
    if (state.phase === 'open') {
      // Make opponent slot glow more — defensively handle both single-material
      // and array-material shapes (Three.js type is a union).
      const mat = (this.avatarB.children[0] as THREE.Mesh).material
      if (!Array.isArray(mat)) {
        const cloned = (mat as THREE.MeshStandardMaterial).clone()
        ;(this.avatarB.children[0] as THREE.Mesh).material = cloned
        cloned.emissiveIntensity = 0.4
      }
    } else {
      const mat = (this.avatarB.children[0] as THREE.Mesh).material
      if (!Array.isArray(mat)) {
        ;(mat as THREE.MeshStandardMaterial).emissiveIntensity = 0.06
      }
    }

    if (state.phase === 'resolved' && state.winner) {
      // We'll check this in animate() against the actual winner
    }
  }

  start() {
    if (this.rafId !== null) return
    this.clock.start()
    const tick = () => {
      this.renderFrame()
      this.rafId = requestAnimationFrame(tick)
    }
    this.rafId = requestAnimationFrame(tick)
  }

  stop() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  private renderFrame() {
    const dt = this.clock.getDelta()
    const t = this.clock.elapsedTime

    // Ember drift
    const positions = this.embersGeometry.attributes.position as THREE.BufferAttribute
    const velocities = (this.embersGeometry as any).userData.velocities as Float32Array
    const count = positions.count
    for (let i = 0; i < count; i++) {
      positions.array[i * 3 + 1] += velocities[i] * dt
      // Reset ember when it floats too high
      if (positions.array[i * 3 + 1] > 3) {
        positions.array[i * 3] = (Math.random() - 0.5) * 1.6
        positions.array[i * 3 + 1] = 0
        positions.array[i * 3 + 2] = (Math.random() - 0.5) * 1.6
      }
    }
    positions.needsUpdate = true

    // Pulse during judging
    if (this.phase === 'judging') {
      const pulse = 0.3 + 0.4 * Math.sin(t * 4)
      const matA = (this.avatarA.children[0] as THREE.Mesh).material
      const matB = (this.avatarB.children[0] as THREE.Mesh).material
      if (!Array.isArray(matA)) (matA as THREE.MeshStandardMaterial).emissiveIntensity = pulse
      if (!Array.isArray(matB)) (matB as THREE.MeshStandardMaterial).emissiveIntensity = pulse
    }

    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    this.stop()
    window.removeEventListener('resize', (this as any)._onResize)
    this.renderer.dispose()
    this.embersGeometry.dispose()
    this.emberMaterial.dispose()
    this.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose()
      const mat = (obj as THREE.Mesh).material
      if (mat) {
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
        else mat.dispose()
      }
    })
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement)
    }
  }
}
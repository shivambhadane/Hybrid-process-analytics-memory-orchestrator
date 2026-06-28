import { useState, useMemo, useEffect } from 'react'

interface Process {
  pid: number
  name: string
  classification: 'HOT' | 'WARM' | 'COLD'
  cpu: number
  memoryMB: number
  faults: number
  layer: 'L1_CACHE' | 'L2_RAM' | 'L3_DISK'
  state: 'RUNNING' | 'FROZEN'
  score: number
}

interface LogEntry {
  timestamp: number
  time: string
  pid: number
  name: string
  from: 'L1_CACHE' | 'L2_RAM' | 'L3_DISK'
  to: 'L1_CACHE' | 'L2_RAM' | 'L3_DISK'
  reason: string
}

interface Suggestion {
  pid: number
  name: string
  action: 'Promote' | 'Demote'
  target: 'L1_CACHE' | 'L2_RAM' | 'L3_DISK'
  reason: string
}

function App() {
  // Live simulation data
  const [processes, setProcesses] = useState<Process[]>([
    { pid: 1432, name: 'systemd', classification: 'WARM', cpu: 0.8, memoryMB: 18.2, faults: 240, layer: 'L2_RAM', state: 'RUNNING', score: 54.0 },
    { pid: 3051, name: 'chrome', classification: 'HOT', cpu: 12.4, memoryMB: 420.5, faults: 93240, layer: 'L1_CACHE', state: 'RUNNING', score: 81.5 },
    { pid: 7891, name: 'dockerd', classification: 'WARM', cpu: 3.2, memoryMB: 88.0, faults: 1803, layer: 'L2_RAM', state: 'RUNNING', score: 64.0 },
    { pid: 12435, name: 'python3', classification: 'COLD', cpu: 0.1, memoryMB: 142.1, faults: 402240, layer: 'L3_DISK', state: 'RUNNING', score: 41.5 },
    { pid: 21402, name: 'mysql', classification: 'HOT', cpu: 18.9, memoryMB: 812.3, faults: 24901, layer: 'L1_CACHE', state: 'RUNNING', score: 89.2 },
    { pid: 902, name: 'dbus-daemon', classification: 'COLD', cpu: 0.2, memoryMB: 8.4, faults: 124, layer: 'L3_DISK', state: 'RUNNING', score: 18.5 },
    { pid: 5410, name: 'gnome-shell', classification: 'WARM', cpu: 5.6, memoryMB: 156.4, faults: 20112, layer: 'L2_RAM', state: 'RUNNING', score: 58.0 },
    { pid: 8109, name: 'code', classification: 'WARM', cpu: 2.1, memoryMB: 312.0, faults: 15302, layer: 'L2_RAM', state: 'RUNNING', score: 48.0 },
    { pid: 15021, name: 'gcc', classification: 'COLD', cpu: 0.0, memoryMB: 45.2, faults: 902, layer: 'L3_DISK', state: 'FROZEN', score: 12.0 }
  ])

  const [selectedPid, setSelectedPid] = useState<number | null>(null)
  const [targetLayer, setTargetLayer] = useState<'L1_CACHE' | 'L2_RAM' | 'L3_DISK'>('L1_CACHE')
  const [previewMsg, setPreviewMsg] = useState<string>('Select a process to preview relocation.')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [filterClass, setFilterClass] = useState<string>('ALL')
  
  const [cacheHits, setCacheHits] = useState<number>(941)
  const [cacheMisses, setCacheMisses] = useState<number>(2)
  const [currentDsTab, setCurrentDsTab] = useState<string>('heap')

  // Relocation log history
  const [movementLog, setMovementLog] = useState<LogEntry[]>([
    { timestamp: 1, time: '15:10:02', pid: 15021, name: 'gcc', from: 'L2_RAM', to: 'L3_DISK', reason: 'Auto-demoted on inactivity' },
    { timestamp: 2, time: '15:12:45', pid: 21402, name: 'mysql', from: 'L2_RAM', to: 'L1_CACHE', reason: 'Auto-promoted on high query rate' }
  ])

  // Count items in each tier
  const l1Count = useMemo(() => processes.filter(p => p.layer === 'L1_CACHE').length, [processes])
  const l2Count = useMemo(() => processes.filter(p => p.layer === 'L2_RAM').length, [processes])
  const l3Count = useMemo(() => processes.filter(p => p.layer === 'L3_DISK').length, [processes])

  const totalAccesses = cacheHits + cacheMisses
  const hitRate = (cacheHits / (totalAccesses || 1)) * 100

  // Filtered process listing
  const filteredProcesses = useMemo(() => {
    return processes.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesClass = filterClass === 'ALL' || p.classification === filterClass
      return matchesSearch && matchesClass
    })
  }, [processes, searchQuery, filterClass])

  // Latency calculation: L1 Cache = 1ns, L2 RAM = 80ns, L3 Disk = 10ms (10,000,000ns)
  const averageLatency = useMemo(() => {
    const total = processes.length
    if (total === 0) return 0
    return ((l1Count * 1) + (l2Count * 80) + (l3Count * 10000000)) / total
  }, [l1Count, l2Count, l3Count, processes])

  // Pearson Correlation Coefficient calculation
  const pearsonR = useMemo(() => {
    if (processes.length < 2) return 0
    const n = processes.length
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0
    processes.forEach(p => {
      const x = p.faults
      const y = p.score
      sumX += x
      sumY += y
      sumXY += x * y
      sumX2 += x * x
      sumY2 += y * y
    })
    const num = (n * sumXY) - (sumX * sumY)
    const den = Math.sqrt(((n * sumX2) - (sumX * sumX)) * ((n * sumY2) - (sumY * sumY)))
    if (den === 0) return 0
    return num / den
  }, [processes])

  // Suggestions generation
  const suggestions = useMemo<Suggestion[]>(() => {
    const list: Suggestion[] = []
    processes.forEach(p => {
      if (p.layer !== 'L1_CACHE' && p.score > 75) {
        list.push({
          pid: p.pid,
          name: p.name,
          action: 'Promote',
          target: 'L1_CACHE',
          reason: `Hotness score (${p.score.toFixed(1)}) exceeds threshold. Move to L1 Cache.`
        })
      }
      if (p.layer !== 'L3_DISK' && p.score < 30) {
        list.push({
          pid: p.pid,
          name: p.name,
          action: 'Demote',
          target: 'L3_DISK',
          reason: `Workload idle (Score: ${p.score.toFixed(1)}). Demote to L3 Disk to free memory.`
        })
      }
    })
    return list
  }, [processes])

  // Select process handler
  const handleSelectProcess = (p: Process) => {
    setSelectedPid(p.pid)
    setPreviewMsg(`Process ${p.name} selected. Ready to preview relocation.`)
  }

  // Preview relocation impact
  const handlePreviewRelocation = () => {
    const p = processes.find(x => x.pid === selectedPid)
    if (!p) return

    const from = p.layer
    const to = targetLayer
    if (from === to) {
      setPreviewMsg(`Process ${p.name} is already in ${to}.\nNo changes will occur.`)
      return
    }

    const beforeLat = averageLatency
    let l1 = l1Count
    let l2 = l2Count
    let l3 = l3Count
    if (from === 'L1_CACHE') l1--
    else if (from === 'L2_RAM') l2--
    else l3--

    if (to === 'L1_CACHE') l1++
    else if (to === 'L2_RAM') l2++
    else l3++

    const afterLat = ((l1 * 1) + (l2 * 80) + (l3 * 10000000)) / processes.length
    
    let speedup = 0
    let verdict = 'Neutral'
    if (afterLat < beforeLat) {
      speedup = beforeLat / afterLat
      verdict = `Recommended (Speedup: ${speedup.toFixed(1)}x faster)`
    } else {
      speedup = afterLat / beforeLat;
      verdict = `Not Recommended (Slower: ${speedup.toFixed(1)}x latency increase)`
    }

    setPreviewMsg(`Relocate: ${from} → ${to}\nSystem Latency: ${beforeLat.toFixed(0)}ns → ${afterLat.toFixed(0)}ns\nVerdict: ${verdict}`)
  }

  // Execute relocation promotion/demotion
  const handleExecuteRelocation = () => {
    const p = processes.find(x => x.pid === selectedPid)
    if (!p) return

    const from = p.layer
    const to = targetLayer
    if (from === to) return

    setProcesses(prev => prev.map(x => {
      if (x.pid === p.pid) {
        let classification: 'HOT' | 'WARM' | 'COLD' = 'WARM'
        let state: 'RUNNING' | 'FROZEN' = 'RUNNING'
        if (to === 'L1_CACHE') {
          classification = 'HOT'
        } else if (to === 'L2_RAM') {
          classification = 'WARM'
        } else {
          classification = 'COLD'
          state = 'FROZEN'
        }
        return { ...x, layer: to, classification, state }
      }
      return x
    }))

    const now = new Date()
    const pad = (n: number) => n.toString().padStart(2, '0')
    const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`

    setMovementLog(prev => [
      ...prev,
      {
        timestamp: Date.now(),
        time: timeStr,
        pid: p.pid,
        name: p.name,
        from: from,
        to: to,
        reason: 'Manual user optimization'
      }
    ])

    if (to === 'L1_CACHE') {
      setCacheHits(h => h + 12)
    } else if (to === 'L2_RAM') {
      setCacheHits(h => h + 3)
    } else {
      setCacheMisses(m => m + 2)
    }

    setPreviewMsg(`Success: Relocated ${p.name} to ${to}.`)
  }

  const handleApplySuggestion = (s: Suggestion) => {
    setSelectedPid(s.pid)
    setTargetLayer(s.target)
    
    // Auto-preview logic
    const p = processes.find(x => x.pid === s.pid)
    if (!p) return

    const from = p.layer
    const to = s.target
    const beforeLat = averageLatency
    let l1 = l1Count
    let l2 = l2Count
    let l3 = l3Count
    if (from === 'L1_CACHE') l1--
    else if (from === 'L2_RAM') l2--
    else l3--

    if (to === 'L1_CACHE') l1++
    else if (to === 'L2_RAM') l2++
    else l3++

    const afterLat = ((l1 * 1) + (l2 * 80) + (l3 * 10000000)) / processes.length
    const speedup = beforeLat / afterLat
    setPreviewMsg(`Relocate: ${from} → ${to}\nSystem Latency: ${beforeLat.toFixed(0)}ns → ${afterLat.toFixed(0)}ns\nVerdict: Recommended (${speedup.toFixed(1)}x speedup)`)
  }

  const getLayerColor = (layer: string) => {
    if (layer === 'L1_CACHE') return 'var(--color-hot)'
    if (layer === 'L2_RAM') return 'var(--color-warm)'
    return 'var(--color-cold)'
  }

  // Periodic metrics simulation tick
  const simulateTick = () => {
    setProcesses(prev => prev.map(p => {
      if (p.state === 'RUNNING') {
        const cpuChange = (Math.random() - 0.5) * 4
        const newCpu = Math.max(0.1, p.cpu + cpuChange)
        const newFaults = p.faults + Math.floor(Math.random() * 25)
        const newScore = Math.min(100, Math.max(5, (newCpu * 3) + (p.memoryMB * 0.05) + (newFaults * 0.0002)))
        return { ...p, cpu: newCpu, faults: newFaults, score: newScore }
      }
      return p
    }))
    setCacheHits(h => h + Math.floor(Math.random() * 15) + 10)
    if (Math.random() > 0.9) {
      setCacheMisses(m => m + 1)
    }
  }

  useEffect(() => {
    const timer = setInterval(simulateTick, 4000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div>
      {/* Header */}
      <header>
        <div className="container header-container">
          <a href="#" className="logo-container">
            <div className="logo-dot"></div>
            <span className="logo-text">MemOrch</span>
          </a>
          <nav>
            <a href="#metrics">Benchmarks</a>
            <a href="#features">Architecture</a>
            <a href="#simulator">Interactive Sim</a>
            <a href="#structures">Data Structures</a>
          </nav>
          <a href="#simulator" className="cta-btn-sm">Run Simulator</a>
        </div>
      </header>

      {/* Hero Section */}
      <section className="hero-section">
        <div className="container">
          <a href="#simulator" className="hero-banner">
            <span>Web Simulation Engine Active</span>
            <span className="hero-banner-arrow">→</span>
          </a>
          <h1 className="hero-title">Intelligent Memory Control for Modern Linux Workloads</h1>
          <p className="hero-subtitle">A high-performance C++ analytics and 3-tier memory orchestrator. Dynamically evicts cold heaps, manages task priority, and visualizes complex telemetry structures.</p>
          <div className="hero-ctas">
            <a href="#simulator" className="btn-primary">Launch Web Simulator</a>
            <a href="#structures" className="btn-secondary">Explore Data Structures</a>
          </div>

          {/* Terminal Terminal Mockup */}
          <div className="terminal-container">
            <div className="terminal-header">
              <div className="terminal-dot red"></div>
              <div className="terminal-dot yellow"></div>
              <div className="terminal-dot green"></div>
              <div className="terminal-title">analyzer_cli --live-monitor</div>
            </div>
            <div className="terminal-content">
              <div className="terminal-line"><span className="terminal-prompt">shivam@linux:~$</span> <span className="terminal-output">./analyzer_cli</span></div>
              <div className="terminal-line" style={{ color: '#10b981' }}>[SUCCESS] Initialized Linux Process Collector: /proc virtual scanner parsed.</div>
              <div className="terminal-line" style={{ color: '#a78bfa' }}>[ORCHESTRATOR] 3-Tier Storage Engine initialized: L1 Map (HOT) | L2 Balanced Tree (WARM) | L3 Disk Vector (COLD)</div>
              <div className="terminal-line" style={{ color: '#f59e0b' }}>[DATA_STRUCTURES] MaxHeap, RBTree, SkipList, LRU, SegmentTree and FenwickTree linked to live telemetry indexes.</div>
              <div className="terminal-line" style={{ color: 'var(--text-primary)' }}>
{`--------------------------------------------------------------------------------------
 PID    | Process Name      | Classification | Memory (MB) | Page Faults | Niceness
--------------------------------------------------------------------------------------
 1432   | systemd           | WARM           | 18.2 MB     | 240         | 0
 3051   | chrome            | HOT            | 420.5 MB    | 93240       | -10
 7891   | dockerd           | WARM           | 88.0 MB     | 1803        | 0
 12435  | python3           | COLD           | 142.1 MB    | 402240      | 10
 21402  | mysql             | HOT            | 812.3 MB    | 24901       | -10
--------------------------------------------------------------------------------------
[TELEMETRY] Pearson correlation coefficient computed: -0.428 (COLD processes pageout correlated).
[OPTIMIZATION] Promotion recommended: chrome (PID 3051) -> Boost Niceness to -10.`}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Brand/Structure logo strip */}
      <div className="logo-strip">
        <div className="logo-strip-item">HASH_MAP_INDEX</div>
        <div className="logo-strip-item">PAIRING_HEAP</div>
        <div className="logo-strip-item">RED_BLACK_TREE</div>
        <div className="logo-strip-item">SKIP_LIST</div>
        <div className="logo-strip-item">LRU_RECENCY</div>
        <div className="logo-strip-item">SEGMENT_TREE</div>
        <div className="logo-strip-item">FENWICK_TREE</div>
      </div>

      {/* Benchmarks Stats Section */}
      <section id="metrics" className="stats-section">
        <div className="container">
          <div className="section-title-wrapper">
            <span className="section-tag">Benchmarks</span>
            <h2 className="section-title">Engine Performance Under Workload</h2>
            <p className="section-desc">Manual custom implementations of core memory trees and heaps allow operations with near-zero latency, avoiding overhead from standard library bloat.</p>
          </div>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">10,000x</div>
              <div className="stat-label">Latency Reduction</div>
              <div className="stat-desc">L1 Cache access speed (1ns) vs L3 Swap Disk (10ms) latency.</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">99.8%</div>
              <div className="stat-label">L1 Cache Hit Rate</div>
              <div className="stat-desc">Pairing heap sorting and LRU eviction keeping active processes in RAM.</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">O(1)</div>
              <div className="stat-label">Index Lookup Time</div>
              <div className="stat-desc">Dynamic ProcessHashMap links target PID updates in constant time.</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">-10</div>
              <div className="stat-label">Niceness Tuning</div>
              <div className="stat-desc">Native setpriority system scheduling levels dynamically configured.</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="features-section">
        <div className="container">
          <div className="section-title-wrapper">
            <span className="section-tag">Architecture</span>
            <h2 className="section-title">Core Systems Design</h2>
            <p className="section-desc">The orchestrator combines high-frequency Linux telemetry scans with kernel priority management, governed by 3 distinct storage engine tiers.</p>
          </div>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon-box">
                <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
              </div>
              <h3 className="feature-title">Telemetry Collection</h3>
              <p className="feature-desc">Platform-specific Linux parser queries `/proc/[pid]/stat` and `/proc/[pid]/status` directly to fetch real-time stats including Resident Set Size (RSS), peak memory, swap space usage, CPU percentages, and page faults.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon-box">
                <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect><line x1="9" x2="15" y1="9" y2="15"></line><line x1="15" x2="9" y1="9" y2="15"></line></svg>
              </div>
              <h3 className="feature-title">Dynamic Classification</h3>
              <p className="feature-desc">Compute process score variables (0-100) based on weighted parameters. Top 10% processes are routed to L1 (HOT), middle 40% to L2 (WARM), and the remaining 50% are relocated to L3 disk (COLD).</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon-box">
                <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" x2="12" y1="22.08" y2="12"></line></svg>
              </div>
              <h3 className="feature-title">Scheduler Controls</h3>
              <p className="feature-desc">Modifies the Linux scheduler behavior by invoking standard `setpriority()` system bindings to boost HOT processes (-10) and demote COLD background threads (10). Suspends and resumes workflows using `SIGSTOP` and `SIGCONT` signals.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon-box">
                <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 22V4c0-.5.2-1 .6-1.4C5 2.2 5.5 2 6 2h12c.5 0 1 .2 1.4.6.4.4.6.9.6 1.4v18l-7-4-7 4z"></path></svg>
              </div>
              <h3 className="feature-title">Data Routing Engine</h3>
              <p className="feature-desc">L1 uses an unordered map mapped to a custom Pairing Heap to enforce capacity restrictions, L2 relies on a red-black tree (sorted by score), and L3 stores cold indexes in sequential memory vectors.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Web Simulator Section */}
      <section id="simulator" className="simulator-section">
        <div className="container">
          <div className="section-title-wrapper">
            <span className="section-tag">Interactive Simulation</span>
            <h2 className="section-title">Web-Based Orchestrator Simulator</h2>
            <p className="section-desc">Experience the C++ orchestration engine in real-time. Select processes, preview relocations, execute promotions/demotions, and monitor cache updates.</p>
          </div>

          <div className="simulator-layout">
            {/* Left Controls and Suggestions */}
            <div className="sim-sidebar">
              
              {/* Relocate Panel */}
              <div className={`sim-panel-card ${selectedPid !== null ? 'glow-border-active' : ''}`}>
                <h3 className="sim-panel-title">Relocate Process</h3>
                
                <div className="sim-input-group">
                  <span className="sim-label">Target Process PID</span>
                  <input type="number" className="sim-number" value={selectedPid || ''} readOnly placeholder="Click a row in the table" />
                </div>

                <div className="sim-input-group">
                  <span className="sim-label">Move To Layer</span>
                  <select className="sim-select" value={targetLayer} onChange={(e) => setTargetLayer(e.target.value as any)}>
                    <option value="L1_CACHE">L1 Cache (HOT)</option>
                    <option value="L2_RAM">L2 RAM (WARM)</option>
                    <option value="L3_DISK">L3 Disk (COLD)</option>
                  </select>
                </div>

                <div className="sim-btn-row">
                  <button className="sim-btn preview" onClick={handlePreviewRelocation} disabled={selectedPid === null}>Preview</button>
                  <button className="sim-btn execute" onClick={handleExecuteRelocation} disabled={selectedPid === null}>Move</button>
                </div>

                {/* Preview Result Display */}
                <div className="sim-impact-label">{previewMsg}</div>
              </div>

              {/* Capacity Bars Card */}
              <div className="sim-panel-card">
                <h3 className="sim-panel-title">Storage Tier Capacities</h3>
                <div className="sim-capacity-bars">
                  {/* L1 Bar */}
                  <div className="sim-capacity-row">
                    <div className="sim-capacity-labels">
                      <span style={{ color: 'var(--color-hot)' }}>L1 Cache (HOT)</span>
                      <span>{l1Count} / {processes.length} ({Math.round(l1Count/processes.length * 100)}%)</span>
                    </div>
                    <div className="sim-capacity-bar-wrapper">
                      <div className="sim-capacity-bar-fill" style={{ width: `${(l1Count/processes.length * 100)}%`, backgroundColor: 'var(--color-hot)' }}></div>
                    </div>
                  </div>
                  {/* L2 Bar */}
                  <div className="sim-capacity-row">
                    <div className="sim-capacity-labels">
                      <span style={{ color: 'var(--color-warm)' }}>L2 RAM (WARM)</span>
                      <span>{l2Count} / {processes.length} ({Math.round(l2Count/processes.length * 100)}%)</span>
                    </div>
                    <div className="sim-capacity-bar-wrapper">
                      <div className="sim-capacity-bar-fill" style={{ width: `${(l2Count/processes.length * 100)}%`, backgroundColor: 'var(--color-warm)' }}></div>
                    </div>
                  </div>
                  {/* L3 Bar */}
                  <div className="sim-capacity-row">
                    <div className="sim-capacity-labels">
                      <span style={{ color: 'var(--color-cold)' }}>L3 Disk (COLD)</span>
                      <span>{l3Count} / {processes.length} ({Math.round(l3Count/processes.length * 100)}%)</span>
                    </div>
                    <div className="sim-capacity-bar-wrapper">
                      <div className="sim-capacity-bar-fill" style={{ width: `${(l3Count/processes.length * 100)}%`, backgroundColor: 'var(--color-cold)' }}></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Smart Suggestions Card */}
              <div className="sim-panel-card">
                <h3 className="sim-panel-title">Smart Suggestions</h3>
                <div className="sim-suggestions-list">
                  {suggestions.map(s => (
                    <div className="sim-suggestion-item" key={s.pid} onClick={() => handleApplySuggestion(s)}>
                      <div className="sim-suggestion-header">
                        <span className="sim-suggestion-title">{s.name} (PID {s.pid})</span>
                        <span className={`sim-suggestion-badge badge ${s.action === 'Promote' ? 'warm' : 'cold'}`}>{s.action}</span>
                      </div>
                      <div className="sim-suggestion-body">{s.reason}</div>
                    </div>
                  ))}
                  {suggestions.length === 0 && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center' }}>No optimizations needed at this moment.</div>
                  )}
                </div>
              </div>

            </div>

            {/* Right Dashboard View */}
            <div className="sim-main-panel">
              
              {/* Stats Row */}
              <div className="sim-metrics-strip">
                <div className="sim-metric-box">
                  <div className="sim-metric-val" style={{ color: 'var(--color-green)' }}>{hitRate.toFixed(1)}%</div>
                  <div className="sim-metric-lbl">Cache Hit Rate</div>
                </div>
                <div className="sim-metric-box">
                  <div className="sim-metric-val">{averageLatency.toFixed(0)} ns</div>
                  <div className="sim-metric-lbl">Avg Access Latency</div>
                </div>
                <div className="sim-metric-box">
                  <div className="sim-metric-val">{pearsonR.toFixed(3)}</div>
                  <div className="sim-metric-lbl">Fault Correlation (r)</div>
                </div>
                <div className="sim-metric-box">
                  <div className="sim-metric-val">{totalAccesses}</div>
                  <div className="sim-metric-lbl">Simulated Accesses</div>
                </div>
              </div>

              {/* Main Process Table */}
              <div className="sim-table-wrapper">
                <div className="sim-table-header">
                  <span className="sim-table-title">Live Process Telemetry</span>
                  <div className="sim-table-actions">
                    <input type="text" className="sim-search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Filter process name..." />
                    <select className="sim-search" value={filterClass} onChange={(e) => setFilterClass(e.target.value)}>
                      <option value="ALL">All Categories</option>
                      <option value="HOT">HOT Only</option>
                      <option value="WARM">WARM Only</option>
                      <option value="COLD">COLD Only</option>
                    </select>
                    <button className="cta-btn-sm" style={{ padding: '6px 12px' }} onClick={simulateTick}>Simulate Tick</button>
                  </div>
                </div>
                <div className="sim-table-scroll">
                  <table className="sim-table">
                    <thead>
                      <tr>
                        <th>PID</th>
                        <th>Process Name</th>
                        <th>Class</th>
                        <th>CPU %</th>
                        <th>Memory (MB)</th>
                        <th>Page Faults</th>
                        <th>Storage Tier</th>
                        <th>Scheduling State</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProcesses.map(p => (
                        <tr key={p.pid} className={selectedPid === p.pid ? 'selected' : ''} onClick={() => handleSelectProcess(p)}>
                          <td>{p.pid}</td>
                          <td style={{ fontWeight: 600 }}>{p.name}</td>
                          <td><span className={`badge ${p.classification.toLowerCase()}`}>{p.classification}</span></td>
                          <td>{p.cpu.toFixed(1)}%</td>
                          <td>{p.memoryMB.toFixed(0)} MB</td>
                          <td>{p.faults}</td>
                          <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px' }}>{p.layer}</td>
                          <td><span className={`badge ${p.state.toLowerCase()}`}>{p.state}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Movement Log */}
              <div className="sim-log-panel">
                <div className="sim-panel-title">Data Relocation & Eviction Log</div>
                <div className="sim-log-scroll">
                  {movementLog.slice().reverse().map(log => (
                    <div className="sim-log-line" key={log.timestamp}>
                      <span className="sim-log-time">[{log.time}]</span>
                      <span className="sim-log-msg">Process <b>{log.name}</b> (PID {log.pid}) relocated from <span style={{ color: getLayerColor(log.from) }}>{log.from}</span> to <span style={{ color: getLayerColor(log.to) }}>{log.to}</span></span>
                      <span className="sim-log-reason">Reason: {log.reason}</span>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>
      </section>

      {/* Data Structures Explorer Section */}
      <section id="structures" className="features-section">
        <div className="container">
          <div className="section-title-wrapper">
            <span className="section-tag">Structure Explorer</span>
            <h2 className="section-title">Manual Data Structures Architecture</h2>
            <p className="section-desc">Our C++ pipeline maps collected telemetry into 7 concurrent, manually implemented data structures to deliver low-latency analytics.</p>
          </div>

          <div className="ds-tabs">
            <button className={`ds-tab-btn ${currentDsTab === 'heap' ? 'active' : ''}`} onClick={() => setCurrentDsTab('heap')}>Max Heap (Priority)</button>
            <button className={`ds-tab-btn ${currentDsTab === 'rbtree' ? 'active' : ''}`} onClick={() => setCurrentDsTab('rbtree')}>Red-Black Tree</button>
            <button className={`ds-tab-btn ${currentDsTab === 'skiplist' ? 'active' : ''}`} onClick={() => setCurrentDsTab('skiplist')}>Skip List</button>
            <button className={`ds-tab-btn ${currentDsTab === 'lru' ? 'active' : ''}`} onClick={() => setCurrentDsTab('lru')}>LRU List</button>
            <button className={`ds-tab-btn ${currentDsTab === 'segtree' ? 'active' : ''}`} onClick={() => setCurrentDsTab('segtree')}>Segment Tree</button>
            <button className={`ds-tab-btn ${currentDsTab === 'fenwick' ? 'active' : ''}`} onClick={() => setCurrentDsTab('fenwick')}>Fenwick Tree</button>
          </div>

          {/* Render Content based on selection */}
          <div className="ds-visual-container">
            
            {currentDsTab === 'heap' && (
              <div className="ds-visual-content">
                <div className="ds-visual-info">
                  <h3 className="ds-visual-title">Max Binary Heap</h3>
                  <p className="ds-visual-desc">Maintains process priority rankings. Insertion and peak evictions take O(log N) time, ensuring the highest hotness scores are instantly accessible for promotion queries.</p>
                </div>
                <div className="ds-canvas">
                  <svg width="400" height="240">
                    <line x1="200" y1="40" x2="100" y2="100" className="svg-edge-active"></line>
                    <line x1="200" y1="40" x2="300" y2="100" className="svg-edge-active"></line>
                    <line x1="100" y1="100" x2="60" y2="180" className="svg-edge"></line>
                    <line x1="100" y1="100" x2="140" y2="180" className="svg-edge"></line>
                    <line x1="300" y1="100" x2="260" y2="180" className="svg-edge"></line>
                    <line x1="300" y1="100" x2="340" y2="180" className="svg-edge"></line>
                    
                    <circle cx="200" cy="40" r="22" fill="#7c3aed" stroke="rgba(255,255,255,0.15)" strokeWidth="2" className="svg-node"></circle>
                    <text x="200" y="40" className="svg-text">mysql (89.2)</text>

                    <circle cx="100" cy="100" r="20" fill="#7c3aed" stroke="rgba(255,255,255,0.15)" strokeWidth="2" className="svg-node"></circle>
                    <text x="100" y="100" className="svg-text">chrome (81.5)</text>

                    <circle cx="300" cy="100" r="20" fill="#4f46e5" stroke="rgba(255,255,255,0.15)" strokeWidth="2" className="svg-node"></circle>
                    <text x="300" y="100" className="svg-text">dockerd (64.0)</text>

                    <circle cx="60" cy="180" r="18" fill="#1e1b4b" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" className="svg-node"></circle>
                    <text x="60" y="180" className="svg-text" style={{ fontSize: '8px' }}>systemd (54)</text>

                    <circle cx="140" cy="180" r="18" fill="#1e1b4b" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" className="svg-node"></circle>
                    <text x="140" y="180" className="svg-text" style={{ fontSize: '8px' }}>code (48)</text>

                    <circle cx="260" cy="180" r="18" fill="#1e1b4b" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" className="svg-node"></circle>
                    <text x="260" y="180" className="svg-text" style={{ fontSize: '8px' }}>python (41)</text>

                    <circle cx="340" cy="180" r="18" fill="#09090b" stroke="var(--surface-border)" strokeWidth="1.5" className="svg-node"></circle>
                    <text x="340" y="180" className="svg-text" style={{ fontSize: '8px', fill: 'var(--text-muted)' }}>gcc (12)</text>
                  </svg>
                </div>
              </div>
            )}

            {currentDsTab === 'rbtree' && (
              <div className="ds-visual-content">
                <div className="ds-visual-info">
                  <h3 className="ds-visual-title">Red-Black Tree Index</h3>
                  <p className="ds-visual-desc">Self-balancing Red-Black binary search tree sorted by process hotness scores. Keeps elements balanced to guarantee strict O(log N) lookup, insertion, deletion, and range-based querying.</p>
                </div>
                <div className="ds-canvas">
                  <svg width="400" height="240">
                    <line x1="200" y1="40" x2="110" y2="100" className="svg-edge"></line>
                    <line x1="200" y1="40" x2="290" y2="100" className="svg-edge"></line>
                    <line x1="110" y1="100" x2="60" y2="180" className="svg-edge"></line>
                    <line x1="110" y1="100" x2="160" y2="180" className="svg-edge"></line>
                    
                    <circle cx="200" cy="40" r="22" fill="#09090b" stroke="#ef4444" strokeWidth="2" className="svg-node"></circle>
                    <text x="200" y="40" className="svg-text">code (48) [B]</text>

                    <circle cx="60" cy="180" r="18" fill="#09090b" stroke="#ef4444" strokeWidth="2" className="svg-node"></circle>
                    <text x="60" y="180" className="svg-text" style={{ fontSize: '8px' }}>systemd [B]</text>

                    <circle cx="110" cy="100" r="20" fill="#b91c1c" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" className="svg-node"></circle>
                    <text x="110" y="100" className="svg-text">python (41) [R]</text>

                    <circle cx="290" cy="100" r="20" fill="#b91c1c" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" className="svg-node"></circle>
                    <text x="290" y="100" className="svg-text">dockerd (64) [R]</text>

                    <circle cx="160" cy="180" r="18" fill="#09090b" stroke="#ef4444" strokeWidth="2" className="svg-node"></circle>
                    <text x="160" y="180" className="svg-text" style={{ fontSize: '8px' }}>bash (45) [B]</text>
                  </svg>
                </div>
              </div>
            )}

            {currentDsTab === 'skiplist' && (
              <div className="ds-visual-content">
                <div className="ds-visual-info">
                  <h3 className="ds-visual-title">Multi-Level Skip List</h3>
                  <p className="ds-visual-desc">A probabilistic balanced data structure built with multiple linked layers. Upper layers act as express lanes to search and sort nodes in O(log N) average time without tree rebalancing algorithms.</p>
                </div>
                <div className="ds-canvas" style={{ alignItems: 'center', justifyContent: 'flex-start', paddingLeft: '40px' }}>
                  <div className="skip-levels">
                    <div className="skip-level-row">
                      <div className="skip-level-lbl">L3</div>
                      <div className="skip-nodes">
                        <div className="skip-node" style={{ borderColor: 'var(--primary)' }}>mysql (89)</div>
                        <div className="lru-arrow">→</div>
                        <div className="skip-node" style={{ color: 'var(--text-muted)' }}>NIL</div>
                      </div>
                    </div>
                    <div className="skip-level-row">
                      <div className="skip-level-lbl">L2</div>
                      <div className="skip-nodes">
                        <div className="skip-node" style={{ borderColor: 'var(--primary)' }}>chrome (81)</div>
                        <div className="lru-arrow">→</div>
                        <div className="skip-node" style={{ borderColor: 'var(--primary)' }}>mysql (89)</div>
                        <div className="lru-arrow">→</div>
                        <div className="skip-node" style={{ color: 'var(--text-muted)' }}>NIL</div>
                      </div>
                    </div>
                    <div className="skip-level-row">
                      <div className="skip-level-lbl">L1</div>
                      <div className="skip-nodes">
                        <div className="skip-node">dockerd (64)</div>
                        <div className="lru-arrow">→</div>
                        <div className="skip-node" style={{ borderColor: 'var(--primary)' }}>chrome (81)</div>
                        <div className="lru-arrow">→</div>
                        <div className="skip-node" style={{ borderColor: 'var(--primary)' }}>mysql (89)</div>
                        <div className="lru-arrow">→</div>
                        <div className="skip-node" style={{ color: 'var(--text-muted)' }}>NIL</div>
                      </div>
                    </div>
                    <div className="skip-level-row">
                      <div className="skip-level-lbl">L0</div>
                      <div className="skip-nodes">
                        <div className="skip-node">systemd (54)</div>
                        <div className="lru-arrow">→</div>
                        <div className="skip-node">dockerd (64)</div>
                        <div className="lru-arrow">→</div>
                        <div className="skip-node" style={{ borderColor: 'var(--primary)' }}>chrome (81)</div>
                        <div className="lru-arrow">→</div>
                        <div className="skip-node" style={{ borderColor: 'var(--primary)' }}>mysql (89)</div>
                        <div className="lru-arrow">→</div>
                        <div className="skip-node" style={{ color: 'var(--text-muted)' }}>NIL</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {currentDsTab === 'lru' && (
              <div className="ds-visual-content">
                <div className="ds-visual-info">
                  <h3 className="ds-visual-title">Least Recently Used (LRU) List</h3>
                  <p className="ds-visual-desc">Doubly linked list paired with ProcessHashMap index. Relocates processes accessed via `simulateAccess()` to the HEAD of the list in O(1) time. Elements near the TAIL represent eviction candidates when the L1 Cache reaches capacity limits.</p>
                </div>
                <div className="ds-canvas">
                  <div className="lru-visual-box">
                    <span style={{ color: 'var(--color-green)', fontSize: '11px', fontWeight: 700 }}>HEAD</span>
                    <div className="lru-visual-node active-action">
                      <div style={{ fontWeight: 'bold', fontSize: '12px' }}>chrome</div>
                      <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>PID 3051</div>
                    </div>
                    <div className="lru-arrow">⇄</div>
                    <div className="lru-visual-node">
                      <div style={{ fontWeight: 'bold', fontSize: '12px' }}>mysql</div>
                      <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>PID 21402</div>
                    </div>
                    <div className="lru-arrow">⇄</div>
                    <div className="lru-visual-node">
                      <div style={{ fontWeight: 'bold', fontSize: '12px' }}>dockerd</div>
                      <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>PID 7891</div>
                    </div>
                    <div className="lru-arrow">⇄</div>
                    <div className="lru-visual-node">
                      <div style={{ fontWeight: 'bold', fontSize: '12px' }}>systemd</div>
                      <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>PID 1432</div>
                    </div>
                    <div className="lru-arrow">⇄</div>
                    <div className="lru-visual-node" style={{ borderColor: 'var(--color-hot)' }}>
                      <div style={{ fontWeight: 'bold', fontSize: '12px' }}>python3</div>
                      <div style={{ fontSize: '9px', color: 'var(--color-hot)' }}>PID 12435</div>
                    </div>
                    <span style={{ color: 'var(--color-hot)', fontSize: '11px', fontWeight: 700 }}>TAIL</span>
                  </div>
                </div>
              </div>
            )}

            {currentDsTab === 'segtree' && (
              <div className="ds-visual-content">
                <div className="ds-visual-info">
                  <h3 className="ds-visual-title">Segment Tree Range Sum</h3>
                  <p className="ds-visual-desc">Organizes process workload timelines. Divides active system duration slots into binary segment ranges, allowing interval summation and range statistics queries in logarithmic O(log N) time.</p>
                </div>
                <div className="ds-canvas">
                  <svg width="400" height="240">
                    <line x1="200" y1="40" x2="100" y2="110" className="svg-edge-active"></line>
                    <line x1="200" y1="40" x2="300" y2="110" className="svg-edge-active"></line>
                    <line x1="100" y1="110" x2="50" y2="180" className="svg-edge"></line>
                    <line x1="100" y1="110" x2="150" y2="180" className="svg-edge"></line>
                    <line x1="300" y1="110" x2="250" y2="180" className="svg-edge"></line>
                    <line x1="300" y1="110" x2="350" y2="180" className="svg-edge"></line>

                    <circle cx="200" cy="40" r="22" fill="#1e1b4b" stroke="var(--primary)" strokeWidth="2" className="svg-node"></circle>
                    <text x="200" y="40" className="svg-text">Sum: 312m [0-3]</text>

                    <circle cx="100" cy="110" r="20" fill="#1e1b4b" stroke="var(--primary)" strokeWidth="1.5" className="svg-node"></circle>
                    <text x="100" y="110" className="svg-text">Sum: 175m [0-1]</text>

                    <circle cx="300" cy="110" r="20" fill="#1e1b4b" stroke="var(--primary)" strokeWidth="1.5" className="svg-node"></circle>
                    <text x="300" y="110" className="svg-text">Sum: 137m [2-3]</text>

                    <circle cx="50" cy="180" r="18" fill="#4f46e5" stroke="rgba(255,255,255,0.15)" strokeWidth="1" className="svg-node"></circle>
                    <text x="50" y="180" className="svg-text" style={{ fontSize: '8px' }}>P0: 120m [0]</text>

                    <circle cx="150" cy="180" r="18" fill="#4f46e5" stroke="rgba(255,255,255,0.15)" strokeWidth="1" className="svg-node"></circle>
                    <text x="150" y="180" className="svg-text" style={{ fontSize: '8px' }}>P1: 55m [1]</text>

                    <circle cx="250" cy="180" r="18" fill="#4f46e5" stroke="rgba(255,255,255,0.15)" strokeWidth="1" className="svg-node"></circle>
                    <text x="250" y="180" className="svg-text" style={{ fontSize: '8px' }}>P2: 80m [2]</text>

                    <circle cx="350" cy="180" r="18" fill="#4f46e5" stroke="rgba(255,255,255,0.15)" strokeWidth="1" className="svg-node"></circle>
                    <text x="350" y="180" className="svg-text" style={{ fontSize: '8px' }}>P3: 57m [3]</text>
                  </svg>
                </div>
              </div>
            )}

            {currentDsTab === 'fenwick' && (
              <div className="ds-visual-content" style={{ width: '100%' }}>
                <div className="ds-visual-info">
                  <h3 className="ds-visual-title">Fenwick Tree (BIT) Focus Sums</h3>
                  <p className="ds-visual-desc">Binary Indexed Tree storing cumulative workloads. Provides efficient prefix sum updates in O(log N) time to track system utilization changes dynamically across process groups.</p>
                </div>
                <div className="ds-canvas">
                  <div className="fenwick-bars">
                    <div className="fenwick-bar-col">
                      <div className="fenwick-bar" style={{ height: '40%' }}>
                        <span className="fenwick-val">120</span>
                      </div>
                      <span className="fenwick-label">BIT[1]</span>
                    </div>
                    <div className="fenwick-bar-col">
                      <div className="fenwick-bar" style={{ height: '55%' }}>
                        <span className="fenwick-val">175</span>
                      </div>
                      <span className="fenwick-label">BIT[2]</span>
                    </div>
                    <div className="fenwick-bar-col">
                      <div className="fenwick-bar" style={{ height: '75%' }}>
                        <span className="fenwick-val">255</span>
                      </div>
                      <span className="fenwick-label">BIT[3]</span>
                    </div>
                    <div className="fenwick-bar-col">
                      <div className="fenwick-bar" style={{ height: '95%' }}>
                        <span className="fenwick-val">312</span>
                      </div>
                      <span className="fenwick-label">BIT[4]</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </section>

      {/* Pipeline Sequence */}
      <section className="features-section" style={{ borderTop: '1px solid var(--surface-border)' }}>
        <div className="container">
          <div className="section-title-wrapper">
            <span className="section-tag">Pipeline</span>
            <h2 className="section-title">System Execution Sequence</h2>
            <p className="section-desc">How telemetry flows from standard Linux kernel system files into the storage tiers and scheduling tables.</p>
          </div>

          <div className="arch-grid">
            <div className="arch-step-card">
              <div className="arch-step-num">1</div>
              <h4 className="feature-title" style={{ fontSize: '15px', marginBottom: '8px' }}>Linux /proc Scan</h4>
              <p className="feature-desc" style={{ fontSize: '12px' }}>The C++ LinuxProcessCollector scrapes virtual /proc filesystem metrics (stat and status) every 2 seconds to get RSS memory size, page fault counts, and active CPU usage times.</p>
            </div>
            <div className="arch-step-card">
              <div className="arch-step-num">2</div>
              <h4 className="feature-title" style={{ fontSize: '15px', marginBottom: '8px' }}>Score & Route</h4>
              <p className="feature-desc" style={{ fontSize: '12px' }}>The Analyzer computes hotness scores (0-100) using normalizations, inserting PIDs into the HashMap, MaxHeap, and RB-Tree indexes for priority sorting.</p>
            </div>
            <div className="arch-step-card">
              <div className="arch-step-num">3</div>
              <h4 className="feature-title" style={{ fontSize: '15px', marginBottom: '8px' }}>Storage Eviction</h4>
              <p className="feature-desc" style={{ fontSize: '12px' }}>If L1 Cache exceeds the 10% ceiling, the lowest scoring process is evicted from the Pairing Heap to L2 RAM. Cold items near the LRU TAIL are paged out to L3 Disk.</p>
            </div>
            <div className="arch-step-card">
              <div className="arch-step-num">4</div>
              <h4 className="feature-title" style={{ fontSize: '15px', marginBottom: '8px' }}>Scheduler Tuning</h4>
              <p className="feature-desc" style={{ fontSize: '12px' }}>The orchestrator issues standard `setpriority()` system bindings to boost HOT workloads (-10) and demote COLD background threads (10) to optimize CPU allocation.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer>
        <div className="container">
          <div className="footer-layout">
            <div>
              <a href="#" className="logo-container">
                <div className="logo-dot"></div>
                <span className="logo-text">MemOrch</span>
              </a>
              <p className="footer-desc">Custom C++ system library and diagnostic visualizer to automate Linux kernel process classification and tier allocations.</p>
            </div>
            <div className="footer-links-grid">
              <div className="footer-links-col">
                <span className="footer-col-title">Product</span>
                <a href="#metrics">Benchmarks</a>
                <a href="#features">Architecture</a>
                <a href="#simulator">Simulator</a>
                <a href="#structures">Data Structures</a>
              </div>
              <div className="footer-links-col">
                <span className="footer-col-title">Developer</span>
                <a href="https://github.com" target="_blank" rel="noreferrer">GitHub Source</a>
                <a href="#structures">Documentation</a>
                <a href="#">System Logs</a>
              </div>
            </div>
          </div>
          <div className="footer-bottom">
            <span>&copy; 2026 Hybrid Process Analytics Memory Orchestrator. All rights reserved.</span>
            <span>Linux Architecture Core Release v2.0</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App

# Adaptive OS Memory Engine (Version 2.0)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Platform: Linux](https://img.shields.io/badge/Platform-Linux-orange.svg)](https://www.linux.org/)
[![Platform: Windows](https://img.shields.io/badge/Platform-Windows-blue.svg)](https://www.microsoft.com/windows)

Advanced Multi-Layer Storage and Process Scoring Engine that transitions from a Windows-based simulation to a Native Linux System Utility. It performs real-time telemetry, hotness scoring, and kernel-level process priority management.

---

## Table of Contents
1. [Linux Core Architecture vs. Windows Simulation](#linux-core-architecture-vs-windows-simulation)
2. [Windows Version: Simulation-Based Architecture](#windows-version-simulation-based-architecture)
3. [Linux Version: Real System Control](#linux-version-real-system-control)
4. [Linux Kernel Integration and Telemetry](#linux-kernel-integration-and-telemetry)
5. [Permissions and Root Requirements](#permissions-and-root-requirements)
6. [Real Scheduler Control](#real-scheduler-control)
7. [Installation and Build Instructions](#installation-and-build-instructions)
8. [Usage Guide](#usage-guide)
9. [Final Comparison Table](#final-comparison-table)

---

## Linux Core Architecture vs. Windows Simulation

The Adaptive OS Memory Engine was originally conceived as a monitor for Windows 11. However, while Windows provided visibility, it lacked the deterministic control required for a Memory Engine to truly manage system resources. The migration to Linux transforms this project from an Intelligent Simulation into a Real System Control Engine.

### Windows Version: Simulation-Based Architecture
The Windows version focused on:
*   Observation: Collecting metrics using psapi.h and tlhelp32.h.
*   Automation: Recommending movements based on calculated Scores.
*   Limitations: The Windows scheduler (NT Kernel) maintains tight internal controls (Dynamic Priority Boosting, Efficiency Mode). Even when using SetPriorityClass(), the OS often overrides user-engine decisions to favor foreground apps or power saving.
*   Verdict: Functioned as an Analytics Engine.

### Linux Version: Real System Control
In Linux, the architecture fundamentally changed. By interacting directly with the /proc filesystem and the Linux Scheduler, the engine can:
*   Control CPU Scheduling: Using setpriority() with root authority.
*   Kernel Signals: Using SIGSTOP and SIGCONT for physical process suspension.
*   Swap Visibility: Reading VmSwap directly to see real-world memory pressure.
*   Verdict: Functions as a Real System Controller.

---

## Linux Kernel Integration and Telemetry

Linux exposes low-level process information through the /proc pseudo-filesystem.

### 1. Process Telemetry (/proc/[pid]/)
*   /proc/[pid]/stat: Used for CPU ticks, process runtime, and page fault behavior. This allows the engine to detect exactly how active a process is.
*   /proc/[pid]/status: Exposes RSS (Resident Set Size), VmPeak, and VmSwap. The engine uses VmSwap to detect when a process has been cold long enough for the kernel to move it to disk.

### 2. Permissions and Root Requirements
Linux follows the Least Privilege Principle. 
*   Normal User: Can monitor processes and demote them (increase niceness).
*   Root (sudo): Required for promoting processes (decreasing niceness below 0). 
    *   Requirement: To prevent CPU starvation where every application attempts to elevate its own priority.

---

## Real Scheduler Control

### Priority Control (Niceness)
The engine maps its Hotness Score to Linux Niceness values (-20 to +19):
*   HOT Processes: Receive a Niceness of roughly -5 to -10, giving them higher scheduling weight.
*   COLD Processes: Receive a Niceness of +10 to +15, drastically reducing their CPU slice.

### Execution Control
The engine can physically pause Frozen processes:
*   kill(pid, SIGSTOP): Immediately stops kernel scheduling for that process.
*   kill(pid, SIGCONT): Resumes execution.

---

## Installation and Build Instructions

### Prerequisites
*   Linux OS (Ubuntu/Debian recommended) or Windows (for simulation only).
*   GCC/G++ (C++17 support).
*   CMake (3.10+).
*   Qt5 (Widgets, Core, Gui) for the Visualizer dashboard.

### Build Steps (Linux)
```bash
# Clone the repository
git clone https://github.com/shivambhadane729/-Multi-Layer-Storage-Engine.git
cd -Multi-Layer-Storage-Engine

# Create build directory
mkdir build && cd build

# Configure and Compile
cmake ..
make
```

---

## Usage Guide

### Running the CLI Engine
The CLI provides a top-like interface for real-time monitoring:
```bash
sudo ./build/analyzer_cli
```

### Running the GUI Visualizer
To launch the full dashboard with Data Structure visualizations:
```bash
# Ensure you are in the project root
chmod +x scripts/run_gui.sh
sudo ./scripts/run_gui.sh
```

---

## Final Comparison Table

| Feature | Windows Version | Linux Version |
| :--- | :--- | :--- |
| Data Source | Windows APIs (psapi.h) | /proc Kernel Filesystem |
| CPU Priority | API Request (Soft) | Native Scheduler Control (Hard) |
| Process Suspension| Thread-based APIs | Kernel Signals (SIGSTOP) |
| Memory Visibility | Abstracted | Direct VmSwap access |
| Scheduler Access | Indirect | Native syscalls (setpriority) |
| Privilege Model | Admin | Root / CAP_SYS_NICE |
| Project Type | Simulation Engine | Real System Controller |

---

## Final Conclusion
The migration to Linux represents the evolution from an abstract model to a functional Adaptive Kernel-Aware Resource Management Engine. It doesn't just suggest how to optimize your system; it actively manages the Linux Kernel scheduler to ensure your most important tasks always have the priority they deserve.

#ifndef LINUX_PROCESS_COLLECTOR_H
#define LINUX_PROCESS_COLLECTOR_H

#include "i_process_collector.h"
#include <dirent.h>
#include <fstream>
#include <sstream>
#include <unistd.h>
#include <sys/resource.h>
#include <sys/sysinfo.h>
#include <sys/types.h>
#include <signal.h>
#include <cstring>
#include <iostream>
#include <algorithm>

class LinuxProcessCollector : public IProcessCollector {
public:
    std::vector<ProcessData> collectLiveProcesses(const std::unordered_map<int, ProcessData>* existingData = nullptr) override {
        std::vector<ProcessData> processes;
        DIR* dir = opendir("/proc");
        if (!dir) return processes;

        struct dirent* entry;
        long uptime = getUptime();
        long clk_tck = sysconf(_SC_CLK_TCK);

        while ((entry = readdir(dir)) != nullptr) {
            // Check if directory name is a number (PID)
            if (entry->d_type == DT_DIR && isNumber(entry->d_name)) {
                int pid = std::stoi(entry->d_name);
                if (pid <= 0) continue;

                ProcessData pd;
                if (parseProcessStat(pid, pd, uptime, clk_tck)) {
                    // Maintain history if exists
                    if (existingData && existingData->count(pid)) {
                        const ProcessData& old = existingData->at(pid);
                        pd.focusCount = old.focusCount;
                        pd.lastUsedTime = old.lastUsedTime;
                        
                        // If CPU is significant, consider it "used" or "focused"
                        if (pd.cpuPercent > 1.0) {
                            pd.lastUsedTime = time(nullptr);
                            // Optionally increment focusCount slowly
                            if (difftime(time(nullptr), old.lastUsedTime) > 10) {
                                pd.focusCount++;
                            }
                        }
                    } else {
                        // Brand new process
                        pd.focusCount = 1;
                        pd.lastUsedTime = time(nullptr);
                    }

                    processes.push_back(pd);
                }
            }
        }
        closedir(dir);
        return processes;
    }

    void applySystemPriority(int pid, const std::string& classification) override {
        int priority = 0;
        if (classification == "HOT") priority = -10;      // Higher priority (negative nice)
        else if (classification == "WARM") priority = 0; // Default
        else if (classification == "COLD") priority = 10; // Lower priority (positive nice)

        // Note: setting negative priority (boosting) usually requires root or CAP_SYS_NICE
        if (setpriority(PRIO_PROCESS, pid, priority) == -1) {
            // Silently fail if no permission, or log it
        }
    }

    bool freezeProcess(int pid) override {
        // SIGSTOP freezes a process so it consumes no CPU but stays in memory
        return kill(pid, SIGSTOP) == 0;
    }

    bool resumeProcess(int pid) override {
        // SIGCONT resumes a frozen process
        return kill(pid, SIGCONT) == 0;
    }

private:
    bool isNumber(const std::string& s) {
        return !s.empty() && std::all_of(s.begin(), s.end(), ::isdigit);
    }

    long getUptime() {
        struct sysinfo info;
        if (sysinfo(&info) == 0) return info.uptime;
        return 0;
    }

    bool parseProcessStat(int pid, ProcessData& pd, long uptime, long clk_tck) {
        std::string path = "/proc/" + std::to_string(pid) + "/stat";
        std::ifstream file(path);
        if (!file.is_open()) return false;

        std::string line;
        std::getline(file, line);
        
        // Find closing parenthesis of command name - it can contain spaces
        std::size_t closeParen = line.find_last_of(')');
        if (closeParen == std::string::npos) return false;
        std::size_t openParen = line.find('(');
        if (openParen == std::string::npos) return false;

        pd.pid = pid;
        pd.name = line.substr(openParen + 1, closeParen - openParen - 1);

        // Substring after ") " (the space after the name)
        std::string rest = line.substr(closeParen + 2);
        std::stringstream ss(rest);
        std::vector<std::string> tokens;
        std::string token;
        while (ss >> token) tokens.push_back(token);

        // Now tokens start from 'state' (index 0)
        if (tokens.size() < 22) return false; // up to rss

        // /proc/[pid]/stat fields after name:
        // 0: state
        // 1: ppid
        // ...
        // 7: flags
        // 8: minflt
        // 10: majflt
        // 12: utime
        // 13: stime
        // 21: starttime
        // 22: vsize
        // 23: rss
        
        pd.pageFaultCount = std::stoul(tokens[8]) + std::stoul(tokens[10]); 
        
        unsigned long long utime = std::stoull(tokens[12]);
        unsigned long long stime = std::stoull(tokens[13]);
        unsigned long long starttime = std::stoull(tokens[17]); // Starttime is actually token 17 in the "rest" part
        
        double total_time = (double)(utime + stime) / clk_tck;
        double seconds = uptime - (starttime / clk_tck);
        
        if (seconds > 0) {
            pd.cpuPercent = (total_time / seconds) * 100.0;
        } else {
            pd.cpuPercent = 0;
        }

        pd.activeTimeMin = seconds / 60.0;
        pd.startTime = time(nullptr) - (long)seconds;

        pd.memoryMB = 0;
        try {
            pd.memoryMB = (double)std::stoull(tokens[19]) * (4096.0 / (1024.0 * 1024.0)); // RSS is token 19
        } catch (...) {}
        
        pd.peakWorkingSetKB = 0;
        try {
            pd.peakWorkingSetKB = (double)std::stoull(tokens[18]) / 1024.0; // VSize is token 18
        } catch (...) {}

        return true;
    }
};

#endif // LINUX_PROCESS_COLLECTOR_H

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

        // Get total system stats for CPU calculation
        long total_idle, total_active;
        getSystemCpuLabel(total_idle, total_active);

        while ((entry = readdir(dir)) != nullptr) {
            if (entry->d_type == DT_DIR && isNumber(entry->d_name)) {
                int pid = std::stoi(entry->d_name);
                if (pid <= 0) continue;

                ProcessData pd;
                if (parseProcessStat(pid, pd, uptime, clk_tck)) {
                    if (existingData && existingData->count(pid)) {
                        const ProcessData& old = existingData->at(pid);
                        pd.focusCount = old.focusCount;
                        pd.lastUsedTime = old.lastUsedTime;
                        
                        // Increment focus if active
                        if (pd.cpuPercent > 0.5) {
                            pd.focusCount++;
                            pd.lastUsedTime = time(nullptr);
                        }
                    } else {
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
        if (classification == "HOT") priority = -10;
        else if (classification == "WARM") priority = 0;
        else if (classification == "COLD") priority = 10;
        setpriority(PRIO_PROCESS, pid, priority);
    }

    bool freezeProcess(int pid) override { return kill(pid, SIGSTOP) == 0; }
    bool resumeProcess(int pid) override { return kill(pid, SIGCONT) == 0; }

private:
    bool isNumber(const std::string& s) {
        return !s.empty() && std::all_of(s.begin(), s.end(), ::isdigit);
    }

    long getUptime() {
        struct sysinfo info;
        if (sysinfo(&info) == 0) return info.uptime;
        return 0;
    }

    void getSystemCpuLabel(long& idle, long& active) {
        std::ifstream file("/proc/stat");
        std::string label;
        long user, nice, system, idle_t, iowait, irq, softirq;
        file >> label >> user >> nice >> system >> idle_t >> iowait >> irq >> softirq;
        idle = idle_t + iowait;
        active = user + nice + system + irq + softirq;
    }

    bool parseProcessStat(int pid, ProcessData& pd, long uptime, long clk_tck) {
        std::string path = "/proc/" + std::to_string(pid) + "/stat";
        std::ifstream file(path);
        if (!file.is_open()) return false;

        std::string line;
        std::getline(file, line);
        
        size_t closeParen = line.find_last_of(')');
        if (closeParen == std::string::npos) return false;
        
        pd.pid = pid;
        pd.name = line.substr(line.find('(') + 1, closeParen - line.find('(') - 1);

        std::stringstream ss(line.substr(closeParen + 2));
        std::string token;
        std::vector<std::string> tokens;
        while (ss >> token) tokens.push_back(token);

        if (tokens.size() < 22) return false;

        // CPU Usage
        long utime = std::stol(tokens[11]);
        long stime = std::stol(tokens[12]);
        long starttime = std::stol(tokens[19]);
        
        double total_time = (double)(utime + stime) / clk_tck;
        double seconds = uptime - (starttime / clk_tck);
        pd.cpuPercent = (seconds > 0) ? (total_time / seconds) * 100.0 : 0.0;
        pd.activeTimeMin = seconds / 60.0;

        // Memory Usage from /proc/pid/status (more reliable for RSS)
        std::string statusPath = "/proc/" + std::to_string(pid) + "/status";
        std::ifstream statusFile(statusPath);
        std::string sline;
        pd.memoryMB = 0;
        while (std::getline(statusFile, sline)) {
            if (sline.substr(0, 6) == "VmRSS:") {
                std::stringstream sss(sline.substr(6));
                long rss_kb;
                sss >> rss_kb;
                pd.memoryMB = rss_kb / 1024.0;
                break;
            }
        }

        return true;
    }
};
#endif

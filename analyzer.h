#ifndef ANALYZER_H
#define ANALYZER_H

#include "data_structures.h"
#ifdef _WIN32
#include "windows_process_collector.h"
#else
#include "linux_process_collector.h"
#endif
#include "storage_engine.h"
#include "fault_monitor.h"
#include <cmath>
#include <numeric>
#include <memory>

using namespace std;

class Analyzer {
private:
    static constexpr double W_FREQUENCY  = 0.20;
    static constexpr double W_RECENCY    = 0.25;
    static constexpr double W_ACTIVE     = 0.20;
    static constexpr double W_MEMORY     = 0.15;
    static constexpr double W_CPU        = 0.20;

    static constexpr double HOT_THRESHOLD  = 65.0;
    static constexpr double WARM_THRESHOLD = 35.0;

    unique_ptr<IProcessCollector> collector;

public:
    ProcessHashMap hashMap;
    MaxHeap maxHeap;
    RBTreeRanking rbTree;
    SkipList skipList;
    LRUList lruList;
    SegmentTree segTree;
    FenwickTree fenwickTree;

    unordered_map<int, int> pidToIndex;
    vector<int> indexToPid;

    StorageEngine storageEngine;
    FaultMonitor faultMonitor;

    unordered_map<int, string> manualOverrides;
    int lastActionPid = -1;

    // GUI compatibility properties
    struct ImpactData {
        int pid;
        string processName;
        string action;
        string reason;
        double speedupFactor = 1.0;
        string verdict = "Neutral";
        double latencyBefore = 0.0;
        double latencyAfter = 0.0;
        double hitRateBefore = 0.0;
        double hitRateAfter = 0.0;
    } lastImpact;
    bool hasLastImpact = false;

    Analyzer() {
#ifdef _WIN32
        collector = make_unique<WindowsProcessCollector>();
#else
        collector = make_unique<LinuxProcessCollector>();
#endif
    }

    void collectAndStore() {
        // Save history from previous run
        unordered_map<int, ProcessData> historyMap = hashMap.getMap();

        hashMap.clear();
        maxHeap.clear();
        rbTree.clear();
        skipList.clear();
        lruList.clear();
        segTree.clear();
        fenwickTree.clear();
        pidToIndex.clear();
        indexToPid.clear();

        vector<ProcessData> processes = collector->collectLiveProcesses(&historyMap);

        if (processes.empty()) return;

        sort(processes.begin(), processes.end(), [](const ProcessData& a, const ProcessData& b) {
            return a.focusCount > b.focusCount;
        });

        int idx = 0;
        for (auto& p : processes) {
            pidToIndex[p.pid] = idx;
            indexToPid.push_back(p.pid);
            idx++;
        }

        fenwickTree.init((int)processes.size());
        vector<double> timeSlots(processes.size(), 0);
        for (int i = 0; i < (int)processes.size(); i++) timeSlots[i] = processes[i].activeTimeMin;
        segTree.build(timeSlots);

        for (auto& p : processes) {
            int fi = pidToIndex[p.pid] + 1;
            fenwickTree.update(fi, p.focusCount);
            calculateScore(p, processes);
            hashMap.insert(p.pid, p);
            collector->applySystemPriority(p.pid, p.classification);
            lruList.access(p);
        }

        vector<ProcessData> allProcs = hashMap.getAll();
        maxHeap.buildFromVector(allProcs);
        for (auto& p : allProcs) {
            rbTree.insert(p);
            skipList.insert(p);
        }

        storageEngine.classifyAndDistribute(allProcs);
        storageEngine.syncLayerToHashMap(hashMap.getMap());
        syncAllDataStructures();
    }

    // --- GUI Helper Methods ---
    bool hasData() { return !hashMap.empty(); }
    vector<ProcessData> getAllProcesses() { return hashMap.getAll(); }
    vector<ProcessData> getTopK(int k) { return maxHeap.getTopK(k); }
    vector<ProcessData> getSortedRBTree() { return rbTree.topK((int)rbTree.size()); }
    vector<ProcessData> getSortedSkipList() { return skipList.getSorted(); }
    vector<ProcessData> getRecencyOrder() { return lruList.getRecencyOrder(); }
    string findProcessLayer(int pid) { return storageEngine.findProcessLayer(pid); }
    int getCumulativeFrequency(int n) { return fenwickTree.query(n); }

    void getRecommendations(vector<ProcessData>& keepHigh, vector<ProcessData>& deprioritize) {
        keepHigh = getTopK(3);
        vector<ProcessData> all = hashMap.getAll();
        sort(all.begin(), all.end(), [](const ProcessData& a, const ProcessData& b) { return a.hotnessScore < b.hotnessScore; });
        for (int i = 0; i < min((int)all.size(), 3); i++) deprioritize.push_back(all[i]);
    }

    vector<ProcessData> getMemoryWaste() {
        vector<ProcessData> waste;
        for (auto& p : hashMap.getAll()) if (p.classification == "COLD" && p.memoryMB > 100) waste.push_back(p);
        sort(waste.begin(), waste.end(), [](const ProcessData& a, const ProcessData& b) { return a.memoryMB > b.memoryMB; });
        if (waste.size() > 5) waste.resize(5);
        return waste;
    }

    static string cleanName(const string& name) {
        string clean = name;
        size_t pos = clean.find_last_of("/\\");
        if (pos != string::npos) clean = clean.substr(pos + 1);
        pos = clean.find(".exe");
        if (pos != string::npos) clean = clean.substr(0, pos);
        return clean;
    }

    void calculateScore(ProcessData& p, const vector<ProcessData>& allProcs) {
        // Find max memory in this snapshot for normalization
        double maxMem = 1.0;
        for (auto& proc : allProcs) if (proc.memoryMB > maxMem) maxMem = proc.memoryMB;

        // 1. Frequency Score (based on focusCount history)
        double maxFocus = 1.0;
        for (auto& proc : allProcs) if (proc.focusCount > maxFocus) maxFocus = proc.focusCount;
        double freqScore = (p.focusCount / maxFocus) * 100.0;

        // 2. Recency Score (how recently it was active or used)
        time_t now = time(nullptr);
        double secSinceUsed = difftime(now, p.lastUsedTime);
        // This drops the score from 100 to 0 over 5 minutes (300 seconds)
        double recencyScore = max(0.0, 100.0 - (secSinceUsed / 3.0)); 

        // 3. Resource Scores
        double memScore = (p.memoryMB / maxMem) * 100.0;
        double cpuScore = min(p.cpuPercent * 10.0, 100.0); // 10% CPU = 100 points

        // Weighted Calculation (W_ACTIVE is used for the longevity bonus below)
        p.hotnessScore = (W_FREQUENCY * freqScore) + 
                         (W_RECENCY * recencyScore) + 
                         (W_MEMORY * memScore) + 
                         (W_CPU * cpuScore);
        
        // 4. Longevity Bonus (Slowly build up score for long-running reliable processes)
        if (p.activeTimeMin > 30.0) p.hotnessScore += (W_ACTIVE * 50.0); 

        // Classification based on updated thresholds
        if (p.hotnessScore >= HOT_THRESHOLD) p.classification = "HOT";
        else if (p.hotnessScore >= WARM_THRESHOLD) p.classification = "WARM";
        else p.classification = "COLD";
    }

    void syncAllDataStructures() {
        vector<ProcessData> all = hashMap.getAll();
        maxHeap.buildFromVector(all);
        rbTree.clear(); skipList.clear();
        for (auto& p : all) { rbTree.insert(p); skipList.insert(p); }
    }

    ProcessHashMap& getHashMap() { return hashMap; }
    MaxHeap& getMaxHeap() { return maxHeap; }
    RBTreeRanking& getRBTree() { return rbTree; }
    SkipList& getSkipList() { return skipList; }
    LRUList& getLRUList() { return lruList; }
    SegmentTree& getSegTree() { return segTree; }
    FenwickTree& getFenwickTree() { return fenwickTree; }

    bool freezeProcess(int pid) { return collector->freezeProcess(pid); }
    bool resumeProcess(int pid) { return collector->resumeProcess(pid); }
};

#endif

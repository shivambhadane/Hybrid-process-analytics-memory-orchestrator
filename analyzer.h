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
#include <algorithm>

using namespace std;

class Analyzer {
private:
    static constexpr double W_FREQUENCY  = 0.30;
    static constexpr double W_RECENCY    = 0.20;
    static constexpr double W_MEMORY     = 0.25;
    static constexpr double W_CPU        = 0.25;

    static constexpr double HOT_THRESHOLD  = 60.0;
    static constexpr double WARM_THRESHOLD = 30.0;

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

        // Calculate scores before sorting
        calculateAllScores(processes);

        sort(processes.begin(), processes.end(), [](const ProcessData& a, const ProcessData& b) {
            return a.hotnessScore > b.hotnessScore;
        });

        int idx = 0;
        for (auto& p : processes) {
            pidToIndex[p.pid] = idx;
            indexToPid.push_back(p.pid);
            
            hashMap.insert(p.pid, p);
            collector->applySystemPriority(p.pid, p.classification);
            lruList.access(p);
            rbTree.insert(p);
            skipList.insert(p);
            idx++;
        }

        fenwickTree.init((int)processes.size());
        vector<double> timeSlots(processes.size(), 0);
        for (int i = 0; i < (int)processes.size(); i++) timeSlots[i] = processes[i].activeTimeMin;
        segTree.build(timeSlots);

        maxHeap.buildFromVector(processes);
        storageEngine.classifyAndDistribute(processes);

        for (auto& pair : manualOverrides) {
            string error;
            storageEngine.moveProcess(pair.first, pair.second, error, &hashMap.getMap());
        }

        storageEngine.syncLayerToHashMap(hashMap.getMap());
    }

    void calculateAllScores(vector<ProcessData>& processes) {
        double maxMem = 1.0;
        double maxFocus = 1.0;
        for (const auto& p : processes) {
            if (p.memoryMB > maxMem) maxMem = p.memoryMB;
            if (p.focusCount > maxFocus) maxFocus = (double)p.focusCount;
        }

        time_t now = time(nullptr);
        for (auto& p : processes) {
            double freqScore = ((double)p.focusCount / maxFocus) * 100.0;
            double secSinceUsed = difftime(now, p.lastUsedTime);
            double recencyScore = max(0.0, 100.0 - (secSinceUsed / 6.0)); 
            double memScore = (p.memoryMB / maxMem) * 100.0;
            double cpuScore = min(p.cpuPercent * 5.0, 100.0);

            p.hotnessScore = (W_FREQUENCY * freqScore) + 
                             (W_RECENCY * recencyScore) + 
                             (W_MEMORY * memScore) + 
                             (W_CPU * cpuScore);

            if (p.hotnessScore >= HOT_THRESHOLD) p.classification = "HOT";
            else if (p.hotnessScore >= WARM_THRESHOLD) p.classification = "WARM";
            else p.classification = "COLD";
        }
    }

    static string cleanName(const string& name) {
        string clean = name;
        size_t pos = clean.find_last_of("/\\");
        if (pos != string::npos) clean = clean.substr(pos + 1);
        pos = clean.find(".exe");
        if (pos != string::npos) clean = clean.substr(0, pos);
        return clean;
    }

    bool manualRelocate(int pid, const string& targetLayer) {
        string error;
        bool ok = storageEngine.moveProcess(pid, targetLayer, error, &hashMap.getMap());
        if (ok) {
            manualOverrides[pid] = targetLayer;
            RelocationImpact impact = storageEngine.getRelocationImpact(pid, targetLayer);
            lastImpact.pid = pid;
            lastImpact.processName = cleanName(hashMap.getMap()[pid].name);
            lastImpact.action = "MOVE TO " + targetLayer;
            lastImpact.reason = "Manual override";
            lastImpact.speedupFactor = impact.speedupFactor;
            lastImpact.verdict = impact.verdict;
            lastImpact.latencyBefore = impact.latencyBefore;
            lastImpact.latencyAfter = impact.latencyAfter;
            lastImpact.hitRateBefore = impact.hitRateBefore;
            lastImpact.hitRateAfter = impact.hitRateAfter;
            hasLastImpact = true;
        }
        return ok;
    }

    bool hasData() { return !hashMap.empty(); }
    vector<ProcessData> getAllProcesses() { return hashMap.getAll(); }
    vector<ProcessData> getTopK(int k) { return maxHeap.getTopK(k); }
    vector<ProcessData> getSortedRBTree() { return rbTree.topK((int)rbTree.size()); }
    vector<ProcessData> getSortedSkipList() { return skipList.getSorted(); }
    vector<ProcessData> getRecencyOrder() { return lruList.getRecencyOrder(); }
    
    vector<ProcessData> getMemoryWaste() {
        vector<ProcessData> waste;
        for (auto& p : hashMap.getAll()) {
            if (p.classification == "COLD" && p.memoryMB > 50.0) waste.push_back(p);
        }
        sort(waste.begin(), waste.end(), [](const ProcessData& a, const ProcessData& b) { return a.memoryMB > b.memoryMB; });
        return waste;
    }

    vector<ProcessData> getByClassification(string cls) {
        vector<ProcessData> res;
        for (auto& p : hashMap.getAll()) if (p.classification == cls) res.push_back(p);
        return res;
    }

    ProcessHashMap& getHashMap() { return hashMap; }
    MaxHeap& getMaxHeap() { return maxHeap; }
    RBTreeRanking& getRBTree() { return rbTree; }
    SkipList& getSkipList() { return skipList; }
    LRUList& getLRUList() { return lruList; }
    
    bool freezeProcess(int pid) { return collector->freezeProcess(pid); }
    bool resumeProcess(int pid) { return collector->resumeProcess(pid); }
};
#endif

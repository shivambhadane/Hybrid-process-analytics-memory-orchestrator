#ifndef I_PROCESS_COLLECTOR_H
#define I_PROCESS_COLLECTOR_H

#include "data_structures.h"
#include <vector>
#include <string>
#include <unordered_map>

/**
 * @brief Abstract interface for platform-specific process collection.
 */
class IProcessCollector {
public:
    virtual ~IProcessCollector() = default;

    /**
     * @brief Collects live process data from the operating system.
     * @param existingData Optional map of already known processes to maintain history.
     * @return Vector of ProcessData objects.
     */
    virtual std::vector<ProcessData> collectLiveProcesses(const std::unordered_map<int, ProcessData>* existingData = nullptr) = 0;

    /**
     * @brief Applies OS-level priority adjustments based on classification.
     * @param pid Process ID
     * @param classification HOT, WARM, or COLD
     */
    virtual void applySystemPriority(int pid, const std::string& classification) = 0;

    /**
     * @brief Freezes (stops) a process using OS signals.
     */
    virtual bool freezeProcess(int pid) = 0;

    /**
     * @brief Resumes a frozen process.
     */
    virtual bool resumeProcess(int pid) = 0;
};

#endif // I_PROCESS_COLLECTOR_H

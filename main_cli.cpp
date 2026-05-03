#include <iostream>
#include <vector>
#include <string>
#include <chrono>
#include <thread>
#include <iomanip>
#include <algorithm>
#include <termios.h>
#include <unistd.h>
#include <fcntl.h>
#include "analyzer.h"

using namespace std;

// Terminal Colors
#define RESET   "\033[0m"
#define RED     "\033[31m"
#define GREEN   "\033[32m"
#define YELLOW  "\033[33m"
#define BLUE    "\033[34m"
#define CYAN    "\033[36m"
#define BOLD    "\033[1m"

int kbhit() {
    struct termios oldt, newt;
    int ch, oldf;
    tcgetattr(STDIN_FILENO, &oldt);
    newt = oldt;
    newt.c_lflag &= ~(ICANON | ECHO);
    tcsetattr(STDIN_FILENO, TCSANOW, &newt);
    oldf = fcntl(STDIN_FILENO, F_GETFL, 0);
    fcntl(STDIN_FILENO, F_SETFL, oldf | O_NONBLOCK);
    ch = getchar();
    tcsetattr(STDIN_FILENO, TCSANOW, &oldt);
    fcntl(STDIN_FILENO, F_SETFL, oldf);
    if(ch != EOF) { ungetc(ch, stdin); return 1; }
    return 0;
}

void clearScreen() { system("clear"); }

void printMenu(char currentMode) {
    cout << "\n" << BOLD << CYAN << "[M]AIN | [W]ASTE | [D]S ENGINE | [L]AYERS | [F]REEZE | [R]ESUME | [T]IER | [Q]UIT" << RESET << "\n";
    string modeName;
    switch(currentMode) {
        case 'm': modeName = "System Dashboard"; break;
        case 'w': modeName = "Waste Analysis"; break;
        case 'd': modeName = "Data Structures Engine"; break;
        case 'l': modeName = "Storage Layers"; break;
        case 'f': modeName = "Freeze Control"; break;
        case 'r': modeName = "Resume Control"; break;
        case 't': modeName = "Tier Relocation"; break;
        default: modeName = "Unknown";
    }
    cout << "Mode: " << YELLOW << modeName << RESET << " | Refreshing every 2s...\n";
}

int main() {
    Analyzer analyzer;
    char mode = 'm';

    while (mode != 'q') {
        analyzer.collectAndStore();
        auto allProcs = analyzer.getAllProcesses();
        clearScreen();

        if (mode == 'm') {
            cout << BOLD << ">>> SYSTEM REAL-TIME DASHBOARD <<<\n" << RESET;
            sort(allProcs.begin(), allProcs.end(), [](const ProcessData& a, const ProcessData& b) {
                return a.hotnessScore > b.hotnessScore;
            });
            cout << left << setw(8) << "PID" << setw(20) << "NAME" << setw(10) << "MEM(MB)" << setw(10) << "CPU%" << setw(12) << "SCORE" << "CLASS" << endl;
            cout << "----------------------------------------------------------------------\n";
            for (auto& p : allProcs) {
                string color = (p.classification == "HOT" ? RED : (p.classification == "WARM" ? YELLOW : GREEN));
                cout << left << setw(8) << p.pid 
                     << setw(20) << Analyzer::cleanName(p.name).substr(0,19) 
                     << setw(10) << fixed << setprecision(1) << p.memoryMB 
                     << setw(10) << p.cpuPercent 
                     << setw(12) << p.hotnessScore 
                     << color << p.classification << RESET << endl;
            }
        } 
        else if (mode == 'w') {
            cout << BOLD << RED << ">>> MEMORY WASTE ANALYSIS (COLD & >50MB) <<<\n" << RESET;
            auto waste = analyzer.getMemoryWaste();
            if (waste.empty()) cout << "No significant memory waste detected.\n";
            else {
                cout << left << setw(8) << "PID" << setw(25) << "NAME" << "WASTED MEMORY" << endl;
                for (auto& p : waste) {
                    cout << left << setw(8) << p.pid << setw(25) << Analyzer::cleanName(p.name) << YELLOW << p.memoryMB << " MB" << RESET << endl;
                }
            }
        }
        else if (mode == 'd') {
            cout << BOLD << BLUE << ">>> DATA STRUCTURES INTERNAL ENGINE <<<\n" << RESET;
            
            cout << BOLD << "\n1. MAX-HEAP (Processing Priority Queue)\n" << RESET;
            auto topK = analyzer.getTopK(3);
            for(size_t i=0; i<topK.size(); i++) 
                cout << "   [" << i+1 << "] PID " << topK[i].pid << " " << topK[i].name << " (Score: " << topK[i].hotnessScore << ")\n";

            cout << BOLD << "\n2. RED-BLACK TREE (Balanced Rank Index)\n" << RESET;
            auto rbTop = analyzer.getSortedRBTree();
            if(!rbTop.empty()) cout << "   Root-Balanced Top: " << rbTop[0].name << " | Total Nodes: " << rbTop.size() << endl;

            cout << BOLD << "\n3. SKIP-LIST (O(log N) Search Index)\n" << RESET;
            auto skSorted = analyzer.getSortedSkipList();
            cout << "   Search Levels Active | Count: " << skSorted.size() << " entries\n";

            cout << BOLD << "\n4. LRU LIST (Recency Tracking)\n" << RESET;
            auto lruOrder = analyzer.getRecencyOrder();
            if(!lruOrder.empty()) {
                cout << "   Most Recent: " << GREEN << lruOrder[0].name << RESET << "\n";
                cout << "   Least Recent: " << RED << lruOrder.back().name << RESET << " (Next for Disk Eviction)\n";
            }
        }
        else if (mode == 'l') {
            cout << BOLD << GREEN << ">>> 3-TIER STORAGE LAYERS <<<\n" << RESET;
            auto hot = analyzer.getByClassification("HOT");
            auto warm = analyzer.getByClassification("WARM");
            auto cold = analyzer.getByClassification("COLD");

            cout << RED << BOLD << "[L1 CACHE - HOT] (" << hot.size() << ")\n" << RESET;
            for(auto& p : hot) cout << " -> " << p.name << " (" << p.memoryMB << "MB)\n";

            cout << YELLOW << BOLD << "\n[L2 RAM - WARM] (" << warm.size() << ")\n" << RESET;
            for(auto& p : warm) cout << " -> " << p.name << " (" << p.memoryMB << "MB)\n";

            cout << CYAN << BOLD << "\n[L3 DISK - COLD] (" << cold.size() << ")\n" << RESET;
            for(auto& p : cold) cout << " -> " << p.name << " (" << p.memoryMB << "MB)\n";
        }
        else if (mode == 'f' || mode == 'r' || mode == 't') {
            cout << BOLD << YELLOW << ">>> PROCESS CONTROL CONSOLE <<<\n" << RESET;
            if (mode == 'f') cout << "Action: FREEZE (SIGSTOP)\n";
            else if (mode == 'r') cout << "Action: RESUME (SIGCONT)\n";
            else cout << "Action: TIER RELOCATION\n";
            
            cout << "Enter PID: ";
            int pid;
            if (cin >> pid) {
                if (mode == 't') {
                    cout << "Select Tier (1:HOT, 2:WARM, 3:COLD): ";
                    int t; cin >> t;
                    string layer = (t==1 ? "L1_CACHE" : (t==2 ? "L2_RAM" : "L3_DISK"));
                    analyzer.manualRelocate(pid, layer);
                } else {
                    bool ok = (mode == 'f' ? analyzer.freezeProcess(pid) : analyzer.resumeProcess(pid));
                    cout << (ok ? GREEN "[SUCCESS]" : RED "[FAILED]") << RESET << " SIGNAL SENT.\n";
                }
                this_thread::sleep_for(chrono::seconds(1));
            }
            mode = 'm'; cin.clear();
        }

        printMenu(mode);
        for(int i=0; i<20; i++) { 
            if (kbhit()) {
                char in = getchar();
                if (string("mwdlfrtq").find(in) != string::npos) mode = in;
                break;
            }
            usleep(100000); 
        }
    }
    return 0;
}

const perfTimers = new Map<string, number>();
const perfDurations = new Map<string, number>();

// Column widths for aligned output - adjust these as needed
const COLUMN_WIDTHS = {
    total: 12,           // "total=" (6) + max "999ms" (4) = 10, pad to 12
    containerSetup: 20,  // "containerSetup=" (15) + max "999ms" (4) = 19, pad to 20
    compile: 13,        // "compile=" (7) + max "999ms" (4) = 11, pad to 13
    execute: 13,         // "execute=" (7) + max "999ms" (4) = 11, pad to 13
    cleanup: 13,         // "cleanup=" (7) + max "999ms" (4) = 11, pad to 13
    totalCleanup: 20     // "total+cleanup=" (15) + max "999ms" (4) = 19, pad to 20
};

function formatTiming(label: string, value: number | undefined, width: number): string {
    if (value === undefined) return '';
    return `${label}=${value}ms`.padEnd(width);
}

export function perfStart(id: string): void {
    perfTimers.set(id, Date.now());
}

export function perfEnd(id: string): void {
    const start = perfTimers.get(id);
    if (start !== undefined) {
        perfDurations.set(id, Date.now() - start);
        perfTimers.delete(id);
    }
}

export function flushPerfLogs(jobID: string): string {
    const totalKey = `job-${jobID}-TOTAL`;
    const totalCleanupKey = `job-${jobID}-TOTAL-with-cleanup`;
    const containerSetupKey = `job-${jobID}-containerSetup`;
    const compileKey = `job-${jobID}-compile`;
    const executeKey = `job-${jobID}-execute`;
    const cleanupKey = `job-${jobID}-cleanup`;

    const total = perfDurations.get(totalKey);
    const totalWithCleanup = perfDurations.get(totalCleanupKey);
    const containerSetup = perfDurations.get(containerSetupKey);
    const compile = perfDurations.get(compileKey);
    const execute = perfDurations.get(executeKey);
    const cleanup = perfDurations.get(cleanupKey);

    const parts: string[] = [];
    
    if (total !== undefined) parts.push(formatTiming('total', total, COLUMN_WIDTHS.total));
    if (containerSetup !== undefined) parts.push(formatTiming('containerSetup', containerSetup, COLUMN_WIDTHS.containerSetup));
    if (compile !== undefined) parts.push(formatTiming('compile', compile, COLUMN_WIDTHS.compile));
    if (execute !== undefined) parts.push(formatTiming('execute', execute, COLUMN_WIDTHS.execute));
    if (cleanup !== undefined) parts.push(formatTiming('cleanup', cleanup, COLUMN_WIDTHS.cleanup));
    if (totalWithCleanup !== undefined) parts.push(formatTiming('total+cleanup', totalWithCleanup, COLUMN_WIDTHS.totalCleanup));

    clearPerfLogs(jobID);

    return `job-${jobID}: ${parts.join(' | ')}`;
}

export function clearPerfLogs(jobID?: string): void {
    if (jobID) {
        // Clear only the specific keys for this job
        const prefix = `job-${jobID}`;
        for (const key of perfTimers.keys()) {
            if (key.startsWith(prefix)) perfTimers.delete(key);
        }
        for (const key of perfDurations.keys()) {
            if (key.startsWith(prefix)) perfDurations.delete(key);
        }
    } else {
        perfTimers.clear();
        perfDurations.clear();
    }
}
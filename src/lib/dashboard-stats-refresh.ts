import type { StatsFilterInput } from "@/lib/validations/stats";

export function createAppliedStatsFilter(initialFilter: StatsFilterInput) {
  let appliedFilter = initialFilter;

  return {
    apply(filter: StatsFilterInput) {
      appliedFilter = filter;
    },
    get() {
      return appliedFilter;
    },
  };
}

export function notifyDashboardStatsRefresh<T extends { success: boolean }>(
  result: T,
  notify: () => void
) {
  if (result.success) notify();
}

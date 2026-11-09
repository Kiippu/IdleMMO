// Tiny cross-tab UI state: lets one screen deep-link into another tab's sub-tab.
export const ui = $state<{ crewSub: 'roster' | 'jobs' | 'contracts' | 'treasury' | null }>({ crewSub: null });

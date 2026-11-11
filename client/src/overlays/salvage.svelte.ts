export const salvageReq = $state<{ uids: string[] | null; label: string }>({ uids: null, label: '' });
export const openSalvage = (uids: string[], label = '') => { salvageReq.uids = uids; salvageReq.label = label; };
export const closeSalvage = () => { salvageReq.uids = null; };
